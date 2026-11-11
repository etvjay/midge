import fs from 'node:fs';
import path from 'node:path';
import { Account, KeyPairSigner } from 'near-api-js';
import { deriveSubKeyPair, near, fmt, sleep } from './near.js';

/**
 * Per-run member accounts. A long-lived shared account accumulates state (every syndicate it touched stays in its index),
 * which made a chain experiment flaky once the account was in more than a page of syndicates. A run now creates its own
 * accounts, uses them, and removes them: finished syndicates are pruned, each account's index is compacted, and the
 * account is deleted with the master as beneficiary so its balance comes back.
 *
 * Keys are derived from the master key and the account id, so nothing is stored but the ids, and a run that crashed
 * can still be cleaned up. The ids are recorded in .lab/members.json (gitignored) for that purpose.
 */
const LEDGER = (rootDir) => path.join(rootDir, '.lab', 'members.json');
const readLedger = (rootDir) => { try { return JSON.parse(fs.readFileSync(LEDGER(rootDir), 'utf8')); } catch { return { accounts: [] }; } };
const writeLedger = (rootDir, data) => { fs.mkdirSync(path.dirname(LEDGER(rootDir)), { recursive: true }); fs.writeFileSync(LEDGER(rootDir), JSON.stringify(data, null, 2)); };

export const memberHandle = (chain, id) => {
  const key = deriveSubKeyPair(chain.env.NEAR_PRIVATE_KEY, id);
  return { id, key, account: new Account(id, chain.provider, new KeyPairSigner(key.keyPair)) };
};

/** Create `count` accounts named <tag><n>.<master>, each funded with `fundNear`. Returns handles in order. */
export async function createMembers(chain, { rootDir, tag, count, fundNear = '0.15', names = null }) {
  // Check the main account can pay for all of them BEFORE creating any, so a short balance fails at once and leaves nothing behind.
  const need = near(fundNear) * BigInt(count) + near('0.3');
  const have = await chain.balance(chain.master);
  if (have < need) throw new Error(`not enough NEAR to create ${count} accounts of ${fundNear}: the run needs about ${fmt(need)} and the main account has ${fmt(have)}`);
  const out = []; const created = [];
  try {
    for (let i = 1; i <= count; i += 1) {
      const prefix = names ? `${tag}${names[i - 1]}` : `${tag}m${i}`;
      const id = `${prefix}.${chain.masterId}`;
      const h = memberHandle(chain, id);
      await chain.master.createSubAccount({ accountOrPrefix: prefix, publicKey: h.key.keyPair.getPublicKey(), nearToTransfer: near(fundNear) });
      created.push(h);
      const led = readLedger(rootDir); led.accounts.push({ id, createdAt: new Date().toISOString(), tag }); writeLedger(rootDir, led);
      // A new account is not visible to every RPC read for a block or two. Return only when it is, so callers can rely on it.
      let seen = false;
      for (let k = 0; k < 20 && !seen; k += 1) { seen = await accountExists(chain, id); if (!seen) await sleep(1500); }
      if (!seen) throw new Error(`account ${id} did not become visible within 30 s of creation`);
      out.push(h);
    }
  } catch (e) {
    // A failure part-way must not strand the accounts already funded: delete them, give the balance back to the main account, and forget them.
    for (const h of created) { try { await h.account.deleteAccount(chain.masterId); } catch { /* left in the ledger for lab-env cleanup */ } }
    const gone = new Set(created.map((h) => h.id)); const led = readLedger(rootDir);
    writeLedger(rootDir, { ...led, accounts: led.accounts.filter((a) => !gone.has(a.id)) });
    throw e;
  }
  return out;
}

/**
 * Remove accounts without stranding anything. First any member still holding escrow in an unfinished syndicate exits it
 * with hatch_out (retrying while the timelock runs out); then the finished syndicates are pruned; each account's index is
 * compacted; and an account is deleted only if no unfinished syndicate still lists it. One that cannot be cleared is KEPT
 * (and stays in the ledger for `lab-env cleanup`), because deleting its account would lock its escrow in the contract for
 * good. Returns what happened per account, never throws.
 */
export async function teardownMembers(chain, { rootDir, members, pruneIds = [], exitWaitMs = 60000 }) {
  const report = { exited: [], pruned: [], notPruned: [], compacted: 0, deleted: [], kept: [], failed: [], returned: 0n };
  const caller = chain.master;
  const finished = (rec) => !rec || /^(Settled|AbortedRefunded)$/.test(String(rec.status));
  const t0 = Date.now();
  for (const sid of pruneIds) {
    let rec = await chain.view('get_syndicate', { syndicate_id: sid }).catch(() => null);
    while (!finished(rec) && Date.now() - t0 < exitWaitMs) {
      for (const m of members.filter((x) => (rec.flyers || []).includes(x.id))) {
        const r = await chain.send(m.account, 'hatch_out', { syndicate_id: sid }, { gas: 60000000000000n, label: `exit ${sid} as ${m.id}` });
        if (r.ok) report.exited.push({ syndicate: sid, member: m.id });
      }
      await sleep(4000);
      rec = await chain.view('get_syndicate', { syndicate_id: sid }).catch(() => null);
    }
  }
  const stillOpen = new Set();
  for (const sid of pruneIds) {
    const rec = await chain.view('get_syndicate', { syndicate_id: sid }).catch(() => null);
    if (!rec) continue;
    if (!finished(rec)) { for (const f of rec.flyers || []) stillOpen.add(f); }
    const r = await chain.send(caller, 'prune_syndicate', { syndicate_id: sid }, { gas: 30000000000000n, label: `prune ${sid}` });
    (r.ok ? report.pruned : report.notPruned).push(r.ok ? sid : { id: sid, error: String(r.error).slice(0, 160) });
  }
  for (const m of members) {
    // Never delete an account that still has money in an unfinished syndicate, whatever the caller passed as pruneIds:
    // the contract is asked directly. (`lab-env cleanup` passes no pruneIds; it deleted such an account on 2026-11-05,
    // and the escrow had to be recovered by recreating the account from its derived key.) Try to exit first.
    let open = await openEscrows(chain, m.id);
    for (const o of open) {
      const r = await chain.send(m.account, 'hatch_out', { syndicate_id: o.id }, { gas: 60000000000000n, label: `exit ${o.id} as ${m.id}` });
      if (r.ok) report.exited.push({ syndicate: o.id, member: m.id });
    }
    if (open.length) { await sleep(4000); open = await openEscrows(chain, m.id); }
    if (open.length) { stillOpen.add(m.id); report.openEscrow = [...(report.openEscrow || []), ...open.map((o) => ({ member: m.id, syndicate: o.id, escrow: String(o.escrow) }))]; }
    const c = await chain.send(m.account, 'compact_member_index', { account_id: m.id }, { gas: 30000000000000n, label: `compact ${m.id}` });
    if (c.ok) report.compacted += 1;
    if (stillOpen.has(m.id)) { report.kept.push(m.id); continue; }
    try {
      const before = BigInt((await m.account.getBalance()).toString());
      await m.account.deleteAccount(chain.masterId);
      report.deleted.push(m.id); report.returned += before;
    } catch (e) { report.failed.push({ id: m.id, error: String(e.message).slice(0, 160) }); }
  }
  const led = readLedger(rootDir); const gone = new Set(report.deleted);
  led.accounts = led.accounts.filter((a) => !gone.has(a.id)); writeLedger(rootDir, led);
  report.returned = String(report.returned);
  return report;
}

/** Unfinished syndicates in which `id` still has escrow, read from the contract (not from what a caller remembers). */
export async function openEscrows(chain, id) {
  const out = [];
  for (let from = 0; ; from += 50) {
    const page = await chain.view('list_syndicates_by_member', { account_id: id, from_index: from, limit: 50 }).catch(() => []);
    for (const s of page) {
      if (/^(Settled|AbortedRefunded)$/.test(String(s.status))) continue;
      const e = BigInt(await chain.view('get_escrow', { syndicate_id: s.id, account_id: id }).catch(() => '0'));
      if (e > 0n) out.push({ id: s.id, escrow: e });
    }
    if (page.length < 50) break;
  }
  return out;
}

/** Everything the ledger still lists: accounts left behind by a crashed run. */
export const leftovers = (rootDir) => readLedger(rootDir).accounts;

export async function accountExists(chain, id) {
  try { await chain.provider.query({ request_type: 'view_account', finality: 'optimistic', account_id: id }); return true; } catch { return false; }
}

export { fmt, sleep };
