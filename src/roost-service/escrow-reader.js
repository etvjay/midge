/**
 * Escrow reader: asks several NEAR RPC providers how much each account holds in a group, all at the SAME final block, and fails
 * closed. A charged round uses it to leave out bidders who cannot cover their worst-case charge, so one bad bid cannot make
 * the contract reject a whole settlement.
 *
 *   const reader = createEscrowReader({ rpcUrls: ['https://a.rpc', 'https://b.rpc'], contractId: 'c.near' });
 *   const { blockHeight, blockHash, escrows } = await reader.read('my-group', ['a.near', 'b.near']);
 *
 * It also reads when members could first leave (`exitsOpenFromBlock`), so a caller can tell when no exit can slip in between this
 * read and the settlement. Plain words: a "provider" is a server that answers questions about the chain. If any provider fails, is slow, is behind, or
 * disagrees with another, the read throws and the round does not run. It cannot make a provider honest; two independent ones
 * that must agree, and a recorded block anyone can look up later, narrow the trust without removing it.
 */
import { RoostAggregationError } from '../enclave/errors.js';
import { isAccountId } from './signed-input.js';

const fail = (why) => new RoostAggregationError(`could not read escrow: ${why}`);

export function createEscrowReader({ rpcUrls, contractId, fetchImpl = globalThis.fetch, minAgree = null, timeoutMs = 8000, maxAgeMs = 60000, concurrency = 10, now = Date.now } = {}) {
  if (!Array.isArray(rpcUrls) || rpcUrls.length === 0 || !rpcUrls.every((u) => typeof u === 'string' && u.length > 0)) throw new Error('createEscrowReader needs rpcUrls: a non-empty list of URLs');
  if (typeof contractId !== 'string' || contractId.length === 0) throw new Error('createEscrowReader needs a contractId');
  const need = minAgree ?? rpcUrls.length;
  if (!Number.isInteger(need) || need < 1 || need > rpcUrls.length) throw new Error('minAgree must be between 1 and the number of rpcUrls');

  const withTimeout = (promise, what) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} timed out after ${timeoutMs} ms`)), timeoutMs);
    promise.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
  });

  async function rpc(url, method, params) {
    const res = await withTimeout(fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }), `${method} on ${url}`);
    if (!res.ok) throw new Error(`${url} answered ${res.status}`);
    const body = await withTimeout(res.json(), `${method} reply from ${url}`);
    if (body.error) throw new Error(`${url}: ${body.error.message || JSON.stringify(body.error)}`);
    return body.result;
  }

  /** Run `tasks` (functions returning promises) with at most `concurrency` in flight; results keep their order. */
  async function pool(tasks) {
    const out = new Array(tasks.length); let next = 0;
    const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
      while (next < tasks.length) { const i = next++; out[i] = await tasks[i](); }
    });
    await Promise.all(workers);
    return out;
  }

  async function read(syndicateId, accounts) {
    if (typeof syndicateId !== 'string' || syndicateId.length === 0) throw fail('a group id is needed');
    const valid = [...new Set((accounts || []).filter((a) => typeof a === 'string' && isAccountId(a)))];
    const escrows = {};
    for (const a of accounts || []) if (!valid.includes(a)) escrows[a] = '0'; // not an account: nothing it could hold

    let header;
    try { header = (await rpc(rpcUrls[0], 'block', { finality: 'final' })).header; } catch (e) { throw fail(e.message); }
    const blockMs = Number(BigInt(header.timestamp) / 1_000_000n);
    if (now() - blockMs > maxAgeMs) throw fail(`the latest final block is too old (${Math.round((now() - blockMs) / 1000)} s)`);

    const perUrl = await Promise.all(rpcUrls.map(async (url) => {
      try {
        const values = await pool(valid.map((account) => async () => {
          const args_base64 = Buffer.from(JSON.stringify({ syndicate_id: syndicateId, account_id: account })).toString('base64');
          const r = await rpc(url, 'query', { request_type: 'call_function', block_id: header.hash, account_id: contractId, method_name: 'get_escrow', args_base64 });
          const v = JSON.parse(Buffer.from(r.result).toString('utf8'));
          if (typeof v !== 'string' || !/^\d{1,40}$/.test(v)) throw new Error(`${url} returned a malformed balance for ${account}`);
          return [account, v];
        }));
        // When could any member leave? The exit timer runs from epoch_start_block for timeout_blocks, and the deadline opens it too.
        const g = await rpc(url, 'query', { request_type: 'call_function', block_id: header.hash, account_id: contractId, method_name: 'get_syndicate', args_base64: Buffer.from(JSON.stringify({ syndicate_id: syndicateId })).toString('base64') });
        const group = JSON.parse(Buffer.from(g.result).toString('utf8'));
        if (group === null) throw new Error(`${url}: the group does not exist`);
        const start = Number(group.epoch_start_block); const timer = Number(group.timeout_blocks); const deadline = Number(group.release_policy?.settle_deadline_block);
        if (![start, timer, deadline].every(Number.isSafeInteger)) throw new Error(`${url} returned malformed timing for the group`);
        return { url, map: Object.fromEntries(values), exits: Math.min(start + timer, deadline) };
      } catch (e) { return { url, error: e.message }; }
    }));

    const groups = new Map();
    for (const r of perUrl) if (!r.error) { const k = JSON.stringify([Object.entries(r.map).sort(), r.exits]); groups.set(k, [...(groups.get(k) || []), r]); }
    const best = [...groups.values()].sort((a, b) => b.length - a.length)[0];
    if (!best || best.length < need) {
      const errors = perUrl.filter((r) => r.error).map((r) => r.error);
      throw fail(errors.length ? `${perUrl.length - errors.length} of ${perUrl.length} providers answered, ${need} needed: ${errors.join('; ')}` : `the providers disagree (${groups.size} different answers, ${need} must agree)`);
    }
    return { blockHeight: Number(header.height), blockHash: header.hash, escrows: { ...escrows, ...best[0].map }, exitsOpenFromBlock: best[0].exits };
  }

  return { read };
}
