#!/usr/bin/env node
/**
 * The lab's environment tool: check what a machine can do, look at the testnet state, fund the master account, clean up.
 *
 *   node scripts/lab-env.mjs check [--tier offline|testnet|cloud|hardware]
 *   node scripts/lab-env.mjs status
 *   node scripts/lab-env.mjs fund [--min 2] [--force]       top up the master account from the testnet helper
 *   node scripts/lab-env.mjs prune [--dry-run] [--rescue]   remove finished syndicates (keeps the ones the evidence cites)
 *   node scripts/lab-env.mjs cleanup                         delete member accounts a crashed run left behind
 *   node scripts/lab-env.mjs bootstrap                       a new environment from nothing (see docs/LAB.md)
 *
 * Testnet only. Nothing here prints a key.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { actions } from 'near-api-js';
import { connect, fmt, near } from '../lab/lib/near.js';
import { fundFromHelper } from '../lab/lib/faucet.js';
import { leftovers, memberHandle, teardownMembers, accountExists } from '../lab/lib/members.js';
import { probeCapabilities } from '../lab/core/env.js';
import { bs58encode } from '../src/chain/client.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [cmd = 'help', ...rest] = process.argv.slice(2);
const flag = (n) => rest.includes(`--${n}`);
const opt = (n, d) => { const i = rest.indexOf(`--${n}`); return i > -1 ? rest[i + 1] : d; };
const say = (...a) => console.log(...a);

const TIERS = {
  offline: { needs: [], does: 'every deterministic check, no keys and no network' },
  testnet: { needs: ['near-key', 'network'], does: 'rounds and interfaces against the real contract' },
  cloud: { needs: ['nearai-key', 'network', 'dcap-qvl'], does: 'the model-sealed Roost against NEAR AI Cloud' },
  hardware: { needs: ['phala-key', 'near-key', 'network', 'docker', 'dcap-qvl'], does: 'the hosted Roost on a real TDX VM' },
};
const HOW = {
  'near-key': 'run `node scripts/setup-testnet-account.js` (creates a funded testnet account and writes .env), or put NEAR_ACCOUNT_ID and NEAR_PRIVATE_KEY in .env',
  network: 'the machine must reach https://test.rpc.fastnear.com and https://rpc.testnet.near.org',
  'nearai-key': 'put NEARAI_API_KEY (a NEAR AI Cloud key) in .env',
  'phala-key': 'put PHALA_CLOUD_API_KEY in .env (a hardware run costs about $0.002)',
  docker: 'install Docker (the dstack verifier runs in a container)',
  'dcap-qvl': 'cargo install dcap-qvl (verifies Intel TDX quotes)',
};

function expectedCodeHash() {
  if (process.env.LAB_EXPECTED_CODE_HASH) return { hash: process.env.LAB_EXPECTED_CODE_HASH, source: 'LAB_EXPECTED_CODE_HASH' };
  const wasm = path.join(rootDir, 'contracts/fly-coordinator/target/wasm32-unknown-unknown/release/fly_coordinator.wasm');
  if (fs.existsSync(wasm)) return { hash: bs58encode(crypto.createHash('sha256').update(fs.readFileSync(wasm)).digest()), source: 'the wasm built from this checkout' };
  const m = fs.readFileSync(path.join(rootDir, 'lab/flows/chain-round.js'), 'utf8').match(/EXPECTED_CODE_HASH = '([^']+)'/);
  return { hash: m?.[1], source: 'the hash pinned in lab/flows/chain-round.js' };
}

async function pages(chain, method, args = {}) {
  const out = [];
  for (let from = 0; ; from += 50) {
    const page = await chain.view(method, { ...args, from_index: from, limit: 50 });
    out.push(...page);
    if (page.length < 50) break;
  }
  return out;
}

async function contractAccount(chain) {
  const a = await chain.provider.query({ request_type: 'view_account', finality: 'final', account_id: chain.coordinatorId });
  return { amount: BigInt(a.amount), storage: BigInt(a.storage_usage), headroom: BigInt(a.amount) - BigInt(a.storage_usage) * 10n ** 19n };
}

/**
 * Syndicates the on-chain evidence points at must stay readable for anyone checking it: the ids it names, and every
 * syndicate its run created (the "attack rejected" transactions target syndicates it does not name), taken to be those
 * whose id carries a timestamp within 10 minutes of the evidence's own timestamp.
 */
const evidenceProtection = () => {
  const named = new Set(); let at = null;
  try {
    const text = fs.readFileSync(path.join(rootDir, 'docs/canonical/testnet-evidence.json'), 'utf8');
    for (const m of text.matchAll(/\bsyn-[a-z0-9-]+/g)) named.add(m[0]);
    at = Math.floor(Date.parse(JSON.parse(text).timestamp) / 1000);
  } catch { /* no evidence file */ }
  return (id) => named.has(id) || (Number.isFinite(at) && /^syn-[a-z-]+-(\d{10})$/.test(id) && Math.abs(Number(id.match(/(\d{10})$/)[1]) - at) <= 600);
};

async function main() {
  if (cmd === 'check') {
    const tier = opt('tier', 'testnet');
    if (!TIERS[tier]) { say(`unknown tier '${tier}'. Choose: ${Object.keys(TIERS).join(', ')}`); process.exit(2); }
    const caps = await probeCapabilities(rootDir);
    say(`tier ${tier}: ${TIERS[tier].does}\n`);
    let missing = 0;
    for (const [name, ok] of Object.entries(caps)) say(`  ${ok ? '✓' : '✗'} ${name}${!ok && TIERS[tier].needs.includes(name) ? `   <- needed. ${HOW[name] || ''}` : ''}`);
    for (const n of TIERS[tier].needs) if (!caps[n]) missing += 1;
    say(`  node ${process.version}${Number(process.versions.node.split('.')[0]) >= 18 ? '' : '  <- needs 18 or newer'}`);
    if (caps['near-key'] && caps.network && tier !== 'offline') {
      const chain = await connect(rootDir);
      const bal = await chain.balance(chain.master);
      const hash = await chain.codeHash().catch(() => null);
      const want = expectedCodeHash();
      say(`\n  master account ${chain.masterId}: ${fmt(bal)} NEAR${bal < near('0.5') ? '   <- low: node scripts/lab-env.mjs fund' : ''}`);
      say(`  contract ${chain.coordinatorId}: ${hash ? `code hash ${hash}` : 'NOT DEPLOYED (node scripts/lab-env.mjs bootstrap)'}`);
      if (hash && want.hash) say(`  ${hash === want.hash ? '✓' : '✗'} matches ${want.source}${hash === want.hash ? '' : ` (${want.hash})`}`);
      if (hash) { const c = await contractAccount(chain); say(`  contract storage headroom: ${fmt(c.headroom)} NEAR${c.headroom < near('0.15') ? '   <- low: node scripts/lab-env.mjs prune' : ''}`); }
    }
    say(missing ? `\n${missing} requirement(s) missing for this tier.` : '\nready.');
    process.exit(missing ? 1 : 0);
  }

  const chain = await connect(rootDir);

  if (cmd === 'status') {
    const bal = await chain.balance(chain.master);
    const all = await pages(chain, 'list_syndicates');
    const by = {}; for (const s of all) by[s.status] = (by[s.status] || 0) + 1;
    const c = await contractAccount(chain);
    say(`master ${chain.masterId}  ${fmt(bal)} NEAR`);
    say(`contract ${chain.coordinatorId}  ${await chain.codeHash()}`);
    say(`syndicates: ${all.length} ${JSON.stringify(by)}   (finished ones can be pruned)`);
    say(`contract balance ${fmt(c.amount)} NEAR, storage ${c.storage} bytes, headroom ${fmt(c.headroom)} NEAR`);
    say(`member accounts left behind by a crashed run: ${leftovers(rootDir).length}`);
    return;
  }

  if (cmd === 'fund') {
    const min = near(opt('min', '2'));
    const bal = await chain.balance(chain.master);
    if (bal >= min && !flag('force')) { say(`master has ${fmt(bal)} NEAR (at least ${fmt(min)}); nothing to do. --force to top up anyway.`); return; }
    const r = await fundFromHelper({ beneficiaryId: chain.masterId, log: (m) => say(' ', m) });
    if (!r.ok) { say(`could not fund: ${r.error}`); process.exit(1); }
    await new Promise((x) => setTimeout(x, 4000));
    say(`master now ${fmt(await chain.balance(chain.master))} NEAR (create tx ${r.createTx}, sweep tx ${r.sweepTx})`);
    return;
  }

  if (cmd === 'prune') {
    const dry = flag('dry-run'); const protectedId = evidenceProtection();
    const all = await pages(chain, 'list_syndicates');
    const finished = all.filter((s) => /^(Settled|AbortedRefunded)$/.test(String(s.status)) && BigInt(s.total_escrow) === 0n && !s.is_settling);
    const prunable = finished.filter((s) => !protectedId(s.id));
    say(`${all.length} syndicates; ${finished.length} finished; ${finished.length - prunable.length} kept because the on-chain evidence cites them; ${prunable.length} to prune`);
    if (flag('rescue')) {
      // Active syndicates whose depositors are accounts this lab derived can be exited with hatch_out, then pruned.
      const known = [chain.master, ...['f1', 'f2', 'f3', 'r1'].map((p) => chain.sub(p).account)];
      for (const s of all.filter((x) => x.status === 'Active' && BigInt(x.total_escrow) > 0n && !protectedId(x.id))) {
        const who = known.filter((a) => s.flyers.includes(a.accountId));
        say(`  ${dry ? 'would rescue' : 'rescuing'} ${s.id}: ${fmt(s.total_escrow)} NEAR held for ${s.flyers.join(', ')}${who.length === s.flyers.length ? '' : ' (not all depositors are known accounts)'}`);
        if (dry) continue;
        for (const a of who) await chain.send(a, 'hatch_out', { syndicate_id: s.id }, { gas: 60000000000000n, label: `rescue ${s.id}` });
      }
    }
    if (dry) { say('dry run: nothing sent'); return; }
    const before = await contractAccount(chain);
    let done = 0;
    for (let i = 0; i < prunable.length; i += 10) {
      const batch = prunable.slice(i, i + 10);
      const acts = batch.map((s) => actions.functionCall('prune_syndicate', { syndicate_id: s.id }, 25_000_000_000_000n, 0n));
      try { await chain.master.signAndSendTransaction({ receiverId: chain.coordinatorId, actions: acts, throwOnFailure: true }); done += batch.length; say(`  pruned ${done}/${prunable.length}`); }
      catch (e) { say(`  batch of ${batch.length} failed (${String(e.message).slice(0, 120)}); retrying one by one`); for (const s of batch) { const r = await chain.send(chain.master, 'prune_syndicate', { syndicate_id: s.id }, { gas: 30000000000000n }); if (r.ok) done += 1; else say(`    ${s.id}: ${r.error?.slice(0, 100)}`); } }
    }
    for (const acct of [chain.master, ...['f1', 'f2', 'f3', 'r1'].map((p) => chain.sub(p).account), { accountId: chain.coordinatorId }]) {
      const r = await chain.send(chain.master, 'compact_member_index', { account_id: acct.accountId }, { gas: 100000000000000n });
      say(`  compact ${acct.accountId}: ${r.ok ? 'ok' : r.error?.slice(0, 80)}`);
    }
    const after = await contractAccount(chain);
    say(`pruned ${done}; contract storage ${before.storage} -> ${after.storage} bytes, headroom ${fmt(before.headroom)} -> ${fmt(after.headroom)} NEAR`);
    return;
  }

  if (cmd === 'cleanup') {
    const left = leftovers(rootDir);
    if (!left.length) { say('no leftover member accounts.'); return; }
    const members = [];
    for (const a of left) if (await accountExists(chain, a.id)) members.push(memberHandle(chain, a.id));
    say(`${left.length} recorded, ${members.length} still exist`);
    const rep = await teardownMembers(chain, { rootDir, members, pruneIds: [] });
    say(`deleted ${rep.deleted.length}, failed ${rep.failed.length}`);
    // ids whose account is already gone are dropped from the ledger
    const gone = new Set(left.map((a) => a.id));
    for (const m of members) gone.delete(m.id);
    if (gone.size) { const p = path.join(rootDir, '.lab', 'members.json'); const led = JSON.parse(fs.readFileSync(p, 'utf8')); led.accounts = led.accounts.filter((x) => !gone.has(x.id)); fs.writeFileSync(p, JSON.stringify(led, null, 2)); }
    return;
  }

  say(`usage: node scripts/lab-env.mjs <check|status|fund|prune|cleanup|bootstrap> ...  (see the header of this file and docs/LAB.md)`);
}

if (cmd === 'bootstrap') {
  // A new environment from nothing. The pieces already exist as scripts; this runs them in order and stops at the first problem.
  const run = (file, args = []) => { say(`\n$ node ${file} ${args.join(' ')}`); execFileSync('node', [path.join(rootDir, file), ...args], { stdio: 'inherit', cwd: rootDir }); };
  const hasEnv = fs.existsSync(path.join(rootDir, '.env')) && /NEAR_PRIVATE_KEY=/.test(fs.readFileSync(path.join(rootDir, '.env'), 'utf8'));
  say(hasEnv ? '.env already has testnet credentials: keeping them.' : 'No credentials yet: creating a funded testnet account.');
  if (!hasEnv) run('scripts/setup-testnet-account.js');
  if (!fs.existsSync(path.join(rootDir, 'contracts/fly-coordinator/target/wasm32-unknown-unknown/release/fly_coordinator.wasm'))) say('\nThe contract is not built here. Run `npm run build:wasm` (needs Rust and the wasm32-unknown-unknown target), then run bootstrap again.');
  else { run('scripts/testnet-e2e.js'); say('\nDone. The contract is deployed to c.<your account> and exercised. Next: node scripts/lab-env.mjs check, then node lab/run.js --tier offline,testnet'); }
} else {
  main().catch((e) => { console.error(`lab-env: ${e.message}`); process.exit(1); });
}
