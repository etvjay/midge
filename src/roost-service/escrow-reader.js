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

export function createEscrowReader({ rpcUrls, contractId, fetchImpl = globalThis.fetch, minAgree = null, timeoutMs = 8000, totalTimeoutMs = 30000, maxAgeMs = 60000, concurrency = 10, now = Date.now } = {}) {
  if (!Array.isArray(rpcUrls) || rpcUrls.length === 0 || !rpcUrls.every((u) => typeof u === 'string' && u.length > 0)) throw new Error('createEscrowReader needs rpcUrls: a non-empty list of URLs');
  if (typeof contractId !== 'string' || contractId.length === 0) throw new Error('createEscrowReader needs a contractId');
  const need = minAgree ?? rpcUrls.length;
  if (!Number.isInteger(need) || need < 1 || need > rpcUrls.length) throw new Error('minAgree must be between 1 and the number of rpcUrls');

  // One request: aborted (not left running) when it takes longer than timeoutMs.
  async function rpc(url, method, params) {
    const ac = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => { ac.abort(); reject(new Error(`${method} on ${url} timed out after ${timeoutMs} ms`)); }, timeoutMs); });
    try {
      const res = await Promise.race([fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: ac.signal }), timeout]);
      if (!res.ok) throw new Error(`${url} answered ${res.status}`);
      const body = await Promise.race([res.json(), timeout]);
      if (body.error) throw new Error(`${url}: ${body.error.message || JSON.stringify(body.error)}`);
      return body.result;
    } finally { clearTimeout(timer); }
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

  /**
   * @param {string} syndicateId  the group
   * @param {string[]} accounts   accounts whose escrow is wanted
   * @param {{blockHash?: string}} [opts]  read at THIS block instead of the latest final one, so two rooms that must sign the same
   *   message (a two-room settlement) can be given one block
   */
  async function read(syndicateId, accounts, { blockHash = null } = {}) {
    if (typeof syndicateId !== 'string' || syndicateId.length === 0) throw fail('a group id is needed');
    const valid = [...new Set((accounts || []).filter((a) => typeof a === 'string' && isAccountId(a)))];
    const escrows = {};
    for (const a of accounts || []) if (!valid.includes(a)) escrows[a] = '0'; // not an account: nothing it could hold
    let expired = false;

    const work = async () => {
      let hash = blockHash;
      if (!hash) {
        try { hash = (await rpc(rpcUrls[0], 'block', { finality: 'final' })).header.hash; } catch (e) { throw fail(e.message); }
      }
      const perUrl = await Promise.all(rpcUrls.map(async (url) => {
        try {
          // Every provider vouches for the block by its hash: the same height and time, and every reply from that block.
          const h = (await rpc(url, 'block', { block_id: hash })).header;
          if (h.hash !== hash) throw new Error(`${url} answered for a different block`);
          const height = Number(h.height); const timeMs = Number(BigInt(h.timestamp) / 1_000_000n);
          if (!Number.isSafeInteger(height) || !Number.isSafeInteger(timeMs)) throw new Error(`${url} returned a malformed block`);
          const fromThisBlock = (r) => { if (r.block_hash !== hash || Number(r.block_height) !== height) throw new Error(`${url} answered from a different block than the one asked about`); return r; };
          const values = await pool(valid.map((account) => async () => {
            if (expired) throw new Error('the read passed its deadline');
            const args_base64 = Buffer.from(JSON.stringify({ syndicate_id: syndicateId, account_id: account })).toString('base64');
            const r = fromThisBlock(await rpc(url, 'query', { request_type: 'call_function', block_id: hash, account_id: contractId, method_name: 'get_escrow', args_base64 }));
            const v = JSON.parse(Buffer.from(r.result).toString('utf8'));
            if (typeof v !== 'string' || !/^\d{1,40}$/.test(v)) throw new Error(`${url} returned a malformed balance for ${account}`);
            return [account, v];
          }));
          // When could any member leave? The exit timer runs from epoch_start_block for timeout_blocks, and the deadline opens it too.
          const g = fromThisBlock(await rpc(url, 'query', { request_type: 'call_function', block_id: hash, account_id: contractId, method_name: 'get_syndicate', args_base64: Buffer.from(JSON.stringify({ syndicate_id: syndicateId })).toString('base64') }));
          const group = JSON.parse(Buffer.from(g.result).toString('utf8'));
          if (group === null) throw new Error(`${url}: the group does not exist`);
          const start = Number(group.epoch_start_block); const timer = Number(group.timeout_blocks); const deadline = Number(group.release_policy?.settle_deadline_block);
          if (![start, timer, deadline].every(Number.isSafeInteger)) throw new Error(`${url} returned malformed timing for the group`);
          return { url, map: Object.fromEntries(values), exits: Math.min(start + timer, deadline), height, timeMs };
        } catch (e) { return { url, error: e.message }; }
      }));

      const groups = new Map();
      for (const r of perUrl) if (!r.error) { const k = JSON.stringify([Object.entries(r.map).sort(), r.exits, r.height, r.timeMs]); groups.set(k, [...(groups.get(k) || []), r]); }
      const best = [...groups.values()].sort((a, b) => b.length - a.length)[0];
      if (!best || best.length < need) {
        const errors = perUrl.filter((r) => r.error).map((r) => r.error);
        throw fail(errors.length ? `${perUrl.length - errors.length} of ${perUrl.length} providers answered, ${need} needed: ${errors.join('; ')}` : `the providers disagree (${groups.size} different answers, ${need} must agree)`);
      }
      const agreed = best[0];
      if (now() - agreed.timeMs > maxAgeMs) throw fail(`the block is too old (${Math.round((now() - agreed.timeMs) / 1000)} s)`);
      return { blockHeight: agreed.height, blockHash: hash, blockTimeMs: agreed.timeMs, escrows: { ...escrows, ...agreed.map }, exitsOpenFromBlock: agreed.exits };
    };

    // The whole read has a deadline, however many accounts there are.
    let deadline;
    const tooLong = new Promise((_, reject) => { deadline = setTimeout(() => { expired = true; reject(fail(`the read took too long (deadline ${totalTimeoutMs} ms)`)); }, totalTimeoutMs); });
    try { return await Promise.race([work(), tooLong]); } finally { clearTimeout(deadline); }
  }

  return { read };
}
