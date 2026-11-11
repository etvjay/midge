import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { connect, near, computePolicyHash } from '../lib/near.js';
import { createMembers, teardownMembers } from '../lib/members.js';
import { computeAllocationsHash } from '../../src/roost-service/hosted-roost.js';

const toN = (x) => near(String(x));

export default {
  id: 'E-OUTLAYER-SETTLE-01',
  title: 'An OutLayer program holding a protected Ed25519 seed signs a Midge settlement that the production contract accepts',
  tier: 'live-external',
  requires: ['near-key', 'network'],
  hypothesis: 'Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. The OutLayer program reports a stable key; a settlement it signs (after recomputing the allocations hash itself) is accepted by the contract and pays exactly; it refuses allocations outside its bound; its signature does not cover different allocations and cannot be replayed.',
  limits: [
    'This does not move the room to OutLayer: only the settlement-signing step runs there. Sealed inputs, aggregation and the escrow read stay where they are.',
    'The program trusts the caller for the bound and the order hash, so it is a signing step, not a room.',
    'OutLayer is a third-party platform; its workers are registered on chain once, and this run does not verify the worker\'s TDX quote.',
    'The run is triggered by an account through the outlayer CLI (a request_execution call), not by a NEAR contract.',
    'Testnet only.',
  ],
  async run(ctx) {
    const chain = await connect(ctx.rootDir);
    const coord = chain.sub('c');
    const OL_ACCOUNT = `ol.${chain.masterId}`; const PROJECT = `${OL_ACCOUNT}/midge-room-signer`;
    const tag = Date.now().toString(36); const id = `ol-${tag}`;
    const state = () => chain.view('get_syndicate', { syndicate_id: id });
    const created = []; let P = null; let countBefore = null;

    // A request to OutLayer is a transaction on testnet and can fail for reasons unrelated to the program (a stale nonce or a node that is behind). The
    // calls here have no side effect on our state, so a failed one is retried up to three times; the number of attempts is returned and recorded.
    const runOnce = (input) => {
      const r = spawnSync('outlayer', ['run', PROJECT, JSON.stringify(input), '--secrets-profile', 'default', '--secrets-account', OL_ACCOUNT], { encoding: 'utf8', timeout: 300000 });
      const out = String(r.stdout || '');
      const tx = ((out + '\n' + String(r.stderr || '')).match(/Tx: (\S+)/) || [])[1] || null; // the CLI prints the transaction hash on stderr
      let json = null; const i = out.indexOf('{'); try { json = JSON.parse(out.slice(i)); } catch { /* not JSON */ }
      return { status: r.status, tx, json, bytes: json ? JSON.stringify(json).length : 0, stderr: String(r.stderr || '').replace(/\s+/g, ' ').slice(0, 600) };
    };
    const runOL = (input) => {
      let last = null;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        last = runOnce(input); last.attempts = attempt;
        if (last.json) return last;
        spawnSync('sleep', ['4']);
      }
      return last;
    };

    await ctx.step('preflight: the CLI is logged in on testnet as the throwaway account', async (s) => {
      const w = spawnSync('outlayer', ['whoami'], { encoding: 'utf8' });
      s.assert('whoami names the throwaway account on testnet', /ol\.fly-/.test(w.stdout) && /testnet/.test(w.stdout), { actual: w.stdout.slice(0, 200) });
    }, { critical: true });

    let pubkey = null;
    await ctx.step('prediction 1: two separate OutLayer runs report the same Ed25519 public key', async (s) => {
      const a = runOL({ op: 'pubkey' }); const b = runOL({ op: 'pubkey' });
      s.evidence('outlayer', { txA: a.tx, txB: b.tx, attemptsA: a.attempts, attemptsB: b.attempts });
      s.assert('both runs succeeded', a.json?.ok === true && b.json?.ok === true, { actual: [a.json, a.stderr] });
      s.assert('the key is 32 bytes of hex', /^[0-9a-f]{64}$/.test(a.json?.public_key || ''), { actual: a.json });
      s.assert('the two runs report the same key', a.json?.public_key === b.json?.public_key);
      s.assert('the results are under 900 bytes', a.bytes < 900 && b.bytes < 900, { actual: [a.bytes, b.bytes] });
      pubkey = a.json.public_key;
    }, { critical: true });

    try {
      await ctx.step('set up: a depositor, a recipient, and a group on the production contract whose room key is the OutLayer program\'s key', async (s) => {
        countBefore = Number(await chain.view('get_syndicate_count', {}));
        const made = await createMembers(chain, { rootDir: ctx.rootDir, tag: `ol${tag.slice(-5)}`, count: 2, fundNear: '0.2', names: ['dp', 'rc'] });
        P = { dp: made[0], rc: made[1], all: made };
        created.push(id);
        const pol = { allowed_recipients: [P.rc.id], max_release_bps_per_epoch: 10000, settle_deadline_block: 500000000 };
        const h = await chain.send(coord.account, 'hatch', { syndicate_id: id, syndicate_type: 'FLASH', quorum_threshold: 1, max_spend_near: 1, enclave_public_key: pubkey, expected_code_hash: crypto.randomBytes(32).toString('hex'), timeout_blocks: 12, payout_recipient: P.rc.id, release_policy: pol }, { deposit: near('0.01'), gas: 40000000000000n, label: `hatch ${id}` });
        s.assert('the group was hatched with the OutLayer key as its room key', h.ok, { actual: h.error });
        await chain.waitFor(() => state(), { what: 'group' });
        const d = await chain.send(P.dp.account, 'deposit', { syndicate_id: id, policy_hash: computePolicyHash(pol, 12) }, { deposit: near('0.05'), gas: 30000000000000n, label: 'deposit' });
        s.assert('the depositor deposited 0.05', d.ok, { actual: d.error });
        await chain.waitFor(async () => BigInt((await state()).total_escrow) === toN('0.05'), { what: 'deposit' });
      }, { critical: true });

      const alloc = (n) => [{ recipient: P.rc.id, amount: String(toN(n)) }];
      const orderHash = `ol-order-${tag}`;
      let sig = null; let round = null;
      await ctx.step('prediction 3: the program refuses allocations above the bound it was given', async (s) => {
        round = await state();
        const over = runOL({ op: 'sign', contract: chain.coordinatorId, syndicate_id: id, epoch: Number(round.epoch), nonce: round.round_nonce, order_hash: orderHash, allocations: alloc('0.02'), max_total_yocto: String(toN('0.01')) });
        s.evidence('outlayer', { tx: over.tx });
        s.assert('it answered, and declined to sign', over.json?.ok === false && !over.json?.signature, { actual: over.json });
        s.assert('and said why: the bound', /bound/.test(over.json?.error || ''), { actual: over.json?.error });
      });

      await ctx.step('prediction 2: a settlement signed inside OutLayer is accepted by the contract and pays exactly', async (s) => {
        const r = runOL({ op: 'sign', contract: chain.coordinatorId, syndicate_id: id, epoch: Number(round.epoch), nonce: round.round_nonce, order_hash: orderHash, allocations: alloc('0.02'), max_total_yocto: String(toN('0.05')) });
        s.evidence('outlayer', { tx: r.tx, attempts: r.attempts });
        s.assert('OutLayer returned a signature', r.json?.ok === true && /^[0-9a-f]{128}$/.test(r.json?.signature || ''), { actual: { json: r.json, attempts: r.attempts, status: r.status, stderr: r.stderr } });
        s.assert('it is the same key as before', r.json?.public_key === pubkey);
        s.assert('the allocations hash the program computed equals the repo\'s own function', r.json?.allocations_hash === computeAllocationsHash(alloc('0.02')), { actual: r.json?.allocations_hash });
        s.assert('the result is under 900 bytes', r.bytes < 900, { actual: r.bytes });
        sig = r.json.signature;
        // prediction 4a, before the real settlement: the signature does not cover different allocations
        const bad = await chain.send(coord.account, 'settle_batch', { syndicate_id: id, attestation_nonce: round.round_nonce, aggregate_order_hash: orderHash, allocations: alloc('0.03'), enclave_signature: sig }, { gas: 150000000000000n, label: 'settle with different allocations' });
        s.evidence('tx', { label: bad.label, hash: bad.hash, ok: bad.ok, error: bad.error });
        s.assert('prediction 4: the same signature with 0.03 instead of 0.02 is refused', !bad.ok && /Invalid enclave Ed25519 signature/.test(bad.error || ''), { actual: bad.error });
        const before = BigInt((await P.rc.account.getBalance()).toString());
        const tx = await chain.send(coord.account, 'settle_batch', { syndicate_id: id, attestation_nonce: round.round_nonce, aggregate_order_hash: orderHash, allocations: alloc('0.02'), enclave_signature: sig }, { gas: 150000000000000n, label: 'settle_batch signed by OutLayer' });
        s.evidence('tx', { label: tx.label, hash: tx.hash, ok: tx.ok, explorer: tx.explorer, error: tx.error });
        s.assert('the contract accepted the settlement the OutLayer program signed', tx.ok, { actual: tx.error });
        await chain.waitFor(async () => { const x = await state(); return !x.is_settling && BigInt(x.total_escrow) === toN('0.03'); }, { what: 'settlement', timeoutMs: 90000 });
        const paid = (await chain.transfersOf(tx.hash, coord.id)).filter((m) => m.fromContract);
        s.assert('the recipient received exactly 0.02 NEAR and nothing else moved', paid.length === 1 && paid[0].to === P.rc.id && BigInt(paid[0].amount) === toN('0.02'), { actual: paid });
        const after = BigInt((await P.rc.account.getBalance()).toString());
        s.assert('the recipient\'s balance rose by 0.02', after - before === toN('0.02'), { actual: String(after - before) });
      });

      await ctx.step('prediction 4: replaying the used signature after the settlement is refused', async (s) => {
        const replay = await chain.send(coord.account, 'settle_batch', { syndicate_id: id, attestation_nonce: round.round_nonce, aggregate_order_hash: orderHash, allocations: alloc('0.02'), enclave_signature: sig }, { gas: 150000000000000n, label: 'replay' });
        s.evidence('tx', { label: replay.label, hash: replay.hash, ok: replay.ok, error: replay.error });
        s.assert('the replay is refused', !replay.ok && /Nonce mismatch|Replay|not active/i.test(replay.error || ''), { actual: replay.error });
        s.assert('and the group still holds 0.03', BigInt((await state()).total_escrow) === toN('0.03'));
      });
    } finally {
      await ctx.step('teardown: the depositor leaves with the rest, the group is pruned, the accounts are deleted', async (st) => {
        if (!P) { st.assert('nothing to tear down', true); return; }
        const rep = await teardownMembers(chain, { rootDir: ctx.rootDir, members: P.all, pruneIds: created, exitWaitMs: 180000 });
        st.observe('teardown', { pruned: rep.pruned.length, notPruned: rep.notPruned, deleted: rep.deleted.length, kept: rep.kept, failed: rep.failed });
        st.assert('the group was pruned and both accounts deleted', rep.notPruned.length === 0 && rep.failed.length === 0 && rep.deleted.length === 2, { actual: rep });
        st.assert('the contract holds the groups it started with', Number(await chain.view('get_syndicate_count', {})) === countBefore, { expected: countBefore });
      }, { always: true });
    }
  },
};
