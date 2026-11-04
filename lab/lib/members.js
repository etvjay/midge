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
  const out = [];
  for (let i = 1; i <= count; i += 1) {
    const prefix = names ? `${tag}${names[i - 1]}` : `${tag}m${i}`;
    const id = `${prefix}.${chain.masterId}`;
    const h = memberHandle(chain, id);
    await chain.master.createSubAccount({ accountOrPrefix: prefix, publicKey: h.key.keyPair.getPublicKey(), nearToTransfer: near(fundNear) });
    const led = readLedger(rootDir); led.accounts.push({ id, createdAt: new Date().toISOString(), tag }); writeLedger(rootDir, led);
    out.push(h);
  }
  return out;
}

/**
 * Remove accounts: compact each one's index, then delete it into the master. Prune the given syndicates first (they must
 * be finished) so the index entries can go. Returns what happened per account, never throws.
 */
export async function teardownMembers(chain, { rootDir, members, pruneIds = [] }) {
  const report = { pruned: [], notPruned: [], compacted: 0, deleted: [], failed: [], returned: 0n };
  const caller = chain.master;
  for (const sid of pruneIds) {
    const r = await chain.send(caller, 'prune_syndicate', { syndicate_id: sid }, { gas: 30000000000000n, label: `prune ${sid}` });
    (r.ok ? report.pruned : report.notPruned).push(r.ok ? sid : { id: sid, error: r.error });
  }
  for (const m of members) {
    const c = await chain.send(m.account, 'compact_member_index', { account_id: m.id }, { gas: 30000000000000n, label: `compact ${m.id}` });
    if (c.ok) report.compacted += 1;
    try {
      const before = BigInt((await m.account.getBalance()).toString());
      await m.account.deleteAccount(chain.masterId);
      report.deleted.push(m.id); report.returned += before;
    } catch (e) { report.failed.push({ id: m.id, error: String(e.message).slice(0, 160) }); }
  }
  const led = readLedger(rootDir); const gone = new Set(report.deleted);
  led.accounts = led.accounts.filter((a) => !gone.has(a.id)); writeLedger(rootDir, led);
  return report;
}

/** Everything the ledger still lists: accounts left behind by a crashed run. */
export const leftovers = (rootDir) => readLedger(rootDir).accounts;

export async function accountExists(chain, id) {
  try { await chain.provider.query({ request_type: 'view_account', finality: 'optimistic', account_id: id }); return true; } catch { return false; }
}

export { fmt, sleep };
