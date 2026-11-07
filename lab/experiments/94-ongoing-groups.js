import crypto from 'node:crypto';
import { connect, near, computePolicyHash } from '../lib/near.js';
import { createMembers, teardownMembers } from '../lib/members.js';
import { HostedRoost, computeAllocationsHash, computeChargesHash } from '../../src/roost-service/hosted-roost.js';
import { sealToModel } from '../../src/enclave/e2ee.js';
import { signInputWithNearKey, inputMessage, makeAccountKeyCheck } from '../../src/roost-service/signed-input.js';

const provider = { simulated: true, attest: async () => Buffer.from('lab-local-no-hardware'), info: async () => ({}) };
const MEMBERS = ['u1', 'u2', 'u3', 'u4', 'u5']; const FOUNDERS = ['u1', 'u2', 'u3', 'u4'];
const DEP = '0.1'; const CAP_BPS = 2500;
const toN = (x) => near(String(x));

export default {
  id: 'E-ONGOING-01',
  title: 'Ongoing groups on testnet: a Dark Vault that lives across three rounds with three programs, takes a late deposit, and what its release cap really bounds',
  tier: 'testnet',
  requires: ['near-key', 'network'],
  hypothesis: 'Predictions are fixed in docs/lab/PROGRAMME_PLAN.md (committed before this ran). A. Four members deposit 0.1 each into a Dark Vault (25% cap, 16-block exit timer); round 1 an investing pool (0.05 to rp); a fifth member deposits 0.1; round 2 a ballot among all five (0.05 to ra); round 3 a lending quote (0.04 to rl, won by u3 at 400 bps). (1) The epoch rises by exactly 1 per settlement and the round nonce changes each time. (2) The late member joins between rounds and is counted and charged correctly; escrows sum to the group total after every round. (3) Replaying round 1\'s signed settlement after round 2 is refused and changes nothing. (4) The exit timer restarts each epoch: an exit right after round 3 is refused; 16 blocks after the last settlement every member exits alone with exactly deposit minus charges (u1 0.08, u2 0.08, u3 0.035, u4 0.075, u5 0.09). B. With a key we hold standing in for a compromised host, a payout above 25% of the current escrow is refused, but payouts of exactly 25% of the current escrow succeed back to back (0.1, 0.075, 0.05625), releasing 0.23125 of 0.4, which is 57.8% against a stated 25% per epoch: expected to be a design weakness. Fails if A breaks; B is recorded as a finding if it holds.',
  limits: [
    'One operator controls every account and the host; the members are scripted. The host is a local HostedRoost with a simulated attestation provider; signed inputs use real NEAR keys and the real account-key lookup.',
    'Three rounds and five members: not a long-lived or large group. There is no baseline; this tests the contract\'s lifecycle claims against what it says.',
    'Part B uses a key we hold to stand in for a compromised host, because a real host refuses to sign more than it computed.',
    'Only the cash leg settles. Deposits are public.',
  ],
  async run(ctx) {
    const chain = await connect(ctx.rootDir);
    const coord = chain.sub('c');
    const tag = Date.now().toString(36);
    const created = []; const found = {};
    let P = null; let countBefore;
    const ids = () => Object.values(P);
    const height = (f = 'optimistic') => chain.blockHeight(f);
    const state = (id) => chain.view('get_syndicate', { syndicate_id: id });
    const keyCheck = makeAccountKeyCheck({ rpcUrl: 'https://test.rpc.fastnear.com', contractId: chain.coordinatorId });
    const escrowOf = async (id, who) => BigInt(await chain.view('get_escrow', { syndicate_id: id, account_id: P[who].id }));
    const policyFor = () => ({ allowed_recipients: [P.rp.id, P.ra.id, P.rb.id, P.rl.id], max_release_bps_per_epoch: CAP_BPS, settle_deadline_block: 500000000 });
    const hatch = (id, keyHex) => { created.push(id); return chain.send(coord.account, 'hatch', { syndicate_id: id, syndicate_type: 'DARK_VAULT', quorum_threshold: 1, max_spend_near: 1, enclave_public_key: keyHex, expected_code_hash: crypto.randomBytes(32).toString('hex'), timeout_blocks: 16, payout_recipient: P.rp.id, release_policy: policyFor() }, { deposit: near('0.01'), gas: 40000000000000n, label: `hatch ${id}` }); };
    const deposit = (who, id) => chain.send(P[who].account, 'deposit', { syndicate_id: id, policy_hash: computePolicyHash(policyFor()) }, { deposit: near(DEP), gas: 30000000000000n, label: `deposit ${who} -> ${id}` });
    const cast = (host, round, who, body) => { const cipherTextHex = sealToModel(JSON.stringify(body), host.intentPublicKey); return host.submitSignedIntent({ flyerId: P[who].id, cipherTextHex, publicKey: P[who].key.keyPair.getPublicKey().toString(), signature: signInputWithNearKey(P[who].key.keyPair.toString(), inputMessage({ ...round, flyerId: P[who].id, seq: 1, cipherTextHex })), seq: 1 }); };
    const roundOf = async (id) => { const st = await state(id); return { contractId: chain.coordinatorId, syndicateId: id, epoch: Number(st.epoch), roundNonce: st.round_nonce }; };
    const waitSettled = (id, expectTotal) => chain.waitFor(async () => { const x = await state(id); return !x.is_settling && BigInt(x.total_escrow) === expectTotal; }, { what: 'settlement resolved' });
    const sumEscrows = async (id, who) => { let t = 0n; for (const k of who) t += await escrowOf(id, k); return t; };
    const waitForTimer = (id) => chain.waitFor(async () => (await height('final')) - Number((await state(id)).epoch_start_block) >= 16, { what: 'the exit timer', timeoutMs: 120000 });

    await ctx.step('set up: five members and four recipients', async (s) => {
      countBefore = Number(await chain.view('get_syndicate_count', {}));
      const names = [...MEMBERS, 'rp', 'ra', 'rb', 'rl'];
      const made = await createMembers(chain, { rootDir: ctx.rootDir, tag: `g${tag.slice(-5)}`, count: names.length, fundNear: '0.4', names });
      P = Object.fromEntries(names.map((k, i) => [k, made[i]]));
      s.assert('nine accounts exist', made.length === 9);
    }, { critical: true });

    // ================= A. a real life =================
    let replay = null; let openedAt = 0; const epochs = []; const nonces = [];
    const id = `dv-${tag}`; const host = new HostedRoost({ provider, requireSignedInputs: true, accountKeyCheck: keyCheck });
    await ctx.step('A · open the Dark Vault; four founders deposit 0.1 each', async (s) => {
      s.assert('hatch a DARK_VAULT syndicate', (await hatch(id, host.settlePublicKey)).ok); await chain.waitFor(() => state(id), { what: 'syndicate' });
      for (const k of FOUNDERS) s.assert(`${k} deposits ${DEP}`, (await deposit(k, id)).ok);
      await chain.waitFor(async () => BigInt((await state(id)).total_escrow) === toN('0.4'), { what: 'deposits' });
      const st = await state(id); epochs.push(Number(st.epoch)); nonces.push(st.round_nonce); openedAt = Number(st.epoch_start_block);
      s.observe('the group at the start', { type: st.syndicate_type, epoch: st.epoch, nonce: st.round_nonce.slice(0, 12) });
    });

    const settle = async (s, label, out, round, expectTotal) => {
      const signed = host.signSettlement({ ...round, allocations: out.allocations, orderHash: out.orderHash, charges: out.charges });
      const args = { syndicate_id: id, attestation_nonce: round.roundNonce, aggregate_order_hash: out.orderHash, allocations: out.allocations, charges: out.charges, enclave_signature: signed.signature };
      const tx = await chain.send(coord.account, 'settle_batch_charged', args, { gas: 150000000000000n, label: `settle_batch_charged ${label}` });
      s.evidence('tx', { label: tx.label, hash: tx.hash, ok: tx.ok, explorer: tx.explorer, error: tx.error }); s.assert(`${label}: the settlement succeeded`, tx.ok, { actual: tx.error });
      await waitSettled(id, expectTotal);
      const st = await state(id); epochs.push(Number(st.epoch)); nonces.push(st.round_nonce);
      s.assert(`${label}: the epoch rose by exactly 1 (${epochs.at(-2)} to ${epochs.at(-1)}) and the round nonce changed`, epochs.at(-1) === epochs.at(-2) + 1 && nonces.at(-1) !== nonces.at(-2), { actual: { epochs, same: nonces.at(-1) === nonces.at(-2) } });
      return { tx, args };
    };
    const conserved = async (s, label, who) => { const st = await state(id); s.assert(`${label}: the members' escrows sum to the group total`, (await sumEscrows(id, who)) === BigInt(st.total_escrow), { actual: [String(await sumEscrows(id, who)), st.total_escrow] }); };

    await ctx.step('A · round 1: an investing pool, 0.05 NEAR to rp', async (s) => {
      const round = await roundOf(id); host.openRound(round);
      for (const [k, a] of [['u1', '0.01'], ['u2', '0.01'], ['u3', '0.015'], ['u4', '0.015']]) await cast(host, round, k, { amount: a });
      const out = host.runPool({ recipient: P.rp.id, roundId: `${id}-r1` });
      const r = await settle(s, 'round 1', out, round, toN('0.35')); replay = r.args;
      const paid = (await chain.transfersOf(r.tx.hash, coord.id)).filter((m) => m.fromContract);
      s.assert('round 1: rp received exactly 0.05 and nothing else moved', paid.length === 1 && paid[0].to === P.rp.id && BigInt(paid[0].amount) === toN('0.05'), { actual: paid });
      await conserved(s, 'round 1', FOUNDERS);
    });

    await ctx.step('A · a fifth member deposits between rounds', async (s) => {
      s.assert('u5 deposits 0.1 into the running group', (await deposit('u5', id)).ok);
      await chain.waitFor(async () => BigInt((await state(id)).total_escrow) === toN('0.45'), { what: 'late deposit' });
      s.assert('(2) the group now holds 0.45 and u5 has 0.1', (await escrowOf(id, 'u5')) === toN('0.1'));
      await conserved(s, 'after the late deposit', MEMBERS);
    });

    await ctx.step('A · round 2: a ballot among all five, the pool of 0.05 to the winner', async (s) => {
      const round = await roundOf(id); host.openRound(round);
      for (const [k, c] of [['u1', 'A'], ['u2', 'A'], ['u3', 'B'], ['u4', 'A'], ['u5', 'B']]) await cast(host, round, k, { choice: c });
      const out = host.runBallot({ options: { A: P.ra.id, B: P.rb.id }, roll: MEMBERS.map((k) => P[k].id), share: '0.01', quorumBps: 5000, rule: 'majority', roundId: `${id}-r2` });
      s.assert('(2) the late member counts: A wins 3 to 2 and the pool goes to ra', out.outcome.decided && out.outcome.winner === 'A', { actual: out.outcome });
      const r = await settle(s, 'round 2', out, round, toN('0.40'));
      const paid = (await chain.transfersOf(r.tx.hash, coord.id)).filter((m) => m.fromContract);
      s.assert('round 2: ra received exactly 0.05', paid.length === 1 && paid[0].to === P.ra.id && BigInt(paid[0].amount) === toN('0.05'), { actual: paid });
      s.assert('(2) the late member was charged 0.01 like everyone else: u5 now has 0.09', (await escrowOf(id, 'u5')) === toN('0.09'));
      await conserved(s, 'round 2', MEMBERS);
    });

    await ctx.step('A · round 1\'s signed settlement replayed after round 2 is refused and changes nothing', async (s) => {
      const before = await state(id); const e0 = await Promise.all(MEMBERS.map((k) => escrowOf(id, k)));
      const tx = await chain.send(coord.account, 'settle_batch_charged', replay, { gas: 150000000000000n, label: 'replay of round 1' });
      s.evidence('tx', { label: tx.label, hash: tx.hash, ok: tx.ok, explorer: tx.explorer, error: tx.error });
      s.assert('(3) the replay is refused (nonce mismatch)', !tx.ok && /Nonce mismatch|Replay/.test(tx.error || ''), { actual: tx.error });
      const after = await state(id); const e1 = await Promise.all(MEMBERS.map((k) => escrowOf(id, k)));
      s.assert('(3) nothing changed: same total, same epoch, same escrows, nothing in flight', after.total_escrow === before.total_escrow && after.epoch === before.epoch && !after.is_settling && e0.every((v, i) => v === e1[i]));
    });

    await ctx.step('A · round 3: a lending quote, 0.04 NEAR loan to rl won by u3 at 400 bps', async (s) => {
      const round = await roundOf(id); host.openRound(round);
      for (const [k, bps] of [['u2', 450], ['u3', 400], ['u4', 500], ['u5', 600]]) await cast(host, round, k, { rateBps: bps });
      const out = host.runQuote({ shape: 'lend', counterparty: P.rl.id, amount: '0.04', limit: 700, roundId: `${id}-r3` });
      s.assert('u3 wins at 400 bps', out.outcome.won && out.outcome.winner === P.u3.id && out.outcome.rateBps === 400, { actual: out.outcome });
      const r = await settle(s, 'round 3', out, round, toN('0.36'));
      const paid = (await chain.transfersOf(r.tx.hash, coord.id)).filter((m) => m.fromContract);
      s.assert('round 3: rl received exactly 0.04', paid.length === 1 && paid[0].to === P.rl.id && BigInt(paid[0].amount) === toN('0.04'), { actual: paid });
      await conserved(s, 'round 3', MEMBERS);
      const expected = { u1: '0.08', u2: '0.08', u3: '0.035', u4: '0.075', u5: '0.09' };
      for (const k of MEMBERS) s.assert(`${k} has exactly ${expected[k]} left`, (await escrowOf(id, k)) === toN(expected[k]), { actual: String(await escrowOf(id, k)) });
      s.assert('(1) three settlements, three epochs: the epoch went up by exactly 3 and every nonce was different', epochs.at(-1) === epochs[0] + 3 && new Set(nonces).size === nonces.length, { actual: { epochs, distinctNonces: new Set(nonces).size } });
      found.epochs = epochs;
    });

    await ctx.step('A · the exit timer restarted with the last epoch: an immediate exit is refused, and 16 blocks later everyone leaves with exactly their remainder', async (s) => {
      const sinceHatch = (await height()) - openedAt;
      const early = await chain.send(P.u1.account, 'hatch_out', { syndicate_id: id }, { gas: 60000000000000n, label: 'early exit as u1' });
      s.evidence('tx', { label: early.label, hash: early.hash, ok: early.ok, explorer: early.explorer, error: early.error });
      s.assert('(4) an exit right after round 3 is refused: the deliberation window restarted', !early.ok && /LOCKED|Deliberation window/.test(early.error || ''), { actual: early.error });
      s.observe('blocks since the group was opened, far more than the 16-block timer', sinceHatch);
      await waitForTimer(id);
      const expected = { u1: '0.08', u2: '0.08', u3: '0.035', u4: '0.075', u5: '0.09' };
      for (const k of MEMBERS) { const r = await chain.send(P[k].account, 'hatch_out', { syndicate_id: id }, { gas: 60000000000000n, label: `exit as ${k}` }); s.assert(`(4) ${k} exits alone`, r.ok, { actual: r.error }); const m = (await chain.transfersOf(r.hash, P[k].id)).filter((x) => x.fromContract && x.to === P[k].id); s.assert(`(4) ${k} got back exactly ${expected[k]}`, m.length === 1 && BigInt(m[0].amount) === toN(expected[k]), { actual: m.map((x) => String(x.amount)) }); }
      const fin = await state(id); s.assert('the group ended fully refunded', /aborted|refunded/i.test(String(fin.status)) && BigInt(fin.total_escrow) === 0n, { actual: fin.status });
    });

    // ================= B. what the cap bounds =================
    await ctx.step('B · the cap: a payout above 25% of the current escrow is refused, yet payouts at exactly 25% succeed back to back', async (s) => {
      const cid = `dv-${tag}-cap`; const kp = crypto.generateKeyPairSync('ed25519'); const pk = kp.publicKey.export({ format: 'der', type: 'spki' }).subarray(12).toString('hex');
      s.assert('hatch with a key we hold, standing in for a compromised host', (await hatch(cid, pk)).ok); await chain.waitFor(() => state(cid), { what: 'syndicate' });
      for (const k of FOUNDERS) s.assert(`${k} deposits ${DEP}`, (await deposit(k, cid)).ok);
      await chain.waitFor(async () => BigInt((await state(cid)).total_escrow) === toN('0.4'), { what: 'deposits' });
      const attempt = async (label, charged, amount) => {
        const st = await state(cid); const allocations = [{ recipient: P.rp.id, amount: String(toN(amount)) }]; const charges = charged.map(([who, amt]) => ({ member: P[who].id, amount: String(toN(amt)) })); const order = crypto.randomBytes(16).toString('hex');
        const msg = `${chain.coordinatorId}:${cid}:${st.epoch}:${st.round_nonce}:${computeAllocationsHash(allocations)}:${computeChargesHash(charges)}:${order}`;
        const tx = await chain.send(coord.account, 'settle_batch_charged', { syndicate_id: cid, attestation_nonce: st.round_nonce, aggregate_order_hash: order, allocations, charges, enclave_signature: crypto.sign(null, Buffer.from(msg, 'utf8'), kp.privateKey).toString('hex') }, { gas: 150000000000000n, label });
        s.evidence('tx', { label: tx.label, hash: tx.hash, ok: tx.ok, explorer: tx.explorer, error: tx.error }); return tx;
      };
      const over = await attempt('payout above the cap: 0.11 of 0.4, charged 0.055 to each of two members so only the cap can refuse it', [['u1', '0.055'], ['u2', '0.055']], '0.11');
      s.assert('(B) a payout of 0.11 against a 25% cap of 0.1 is refused even with a valid signature', !over.ok && /exceeds max_release_bps_per_epoch cap/.test(over.error || ''), { actual: over.error });
      s.assert('(B) nothing moved', BigInt((await state(cid)).total_escrow) === toN('0.4'));
      let total = toN('0.4'); let released = 0n;
      for (const [who, amt] of [['u1', '0.1'], ['u2', '0.075'], ['u3', '0.05625']]) {
        const tx = await attempt(`payout at exactly 25% of the current escrow: ${amt}`, [[who, amt]], amt);
        s.assert(`(B) a payout of ${amt}, exactly 25% of the current escrow, succeeds`, tx.ok, { actual: tx.error });
        released += toN(amt); total -= toN(amt); await waitSettled(cid, total);
      }
      const pct = Number(released * 10000n / toN('0.4')) / 100;
      s.observe('released within a few minutes, as a share of the original 0.4 NEAR, against a stated 25% per epoch', `${pct}%`);
      s.assert('(B) FINDING: three back-to-back settlements released 0.23125 of 0.4, which is 57.8% of the group, 2.3 times the stated 25% per epoch: the cap bounds each settlement, not the pace of release', released === toN('0.23125') && pct > 57 && pct < 58, { actual: pct });
      found.cap = { stated: '25% per epoch', releasedPct: pct, settlements: 3 };
      await waitForTimer(cid);
      const left = { u2: '0.025', u3: '0.04375', u4: '0.1' };
      for (const [k, v] of Object.entries(left)) { const r = await chain.send(P[k].account, 'hatch_out', { syndicate_id: cid }, { gas: 60000000000000n, label: `exit as ${k}` }); const m = (await chain.transfersOf(r.hash, P[k].id)).filter((x) => x.fromContract && x.to === P[k].id); s.assert(`${k} exits alone with exactly ${v}`, r.ok && m.length === 1 && BigInt(m[0].amount) === toN(v), { actual: m.map((x) => String(x.amount)) }); }
    });

    await ctx.step('teardown: prune the syndicates, delete the accounts', async (s) => {
      if (!P) { s.assert('nothing to tear down', true); return; }
      s.evidence('findings', found);
      const rep = await teardownMembers(chain, { rootDir: ctx.rootDir, members: ids(), pruneIds: created });
      s.observe('teardown', { pruned: rep.pruned.length, notPruned: rep.notPruned, deleted: rep.deleted.length, kept: rep.kept, failed: rep.failed });
      s.assert('every account was deleted and every syndicate pruned', rep.failed.length === 0 && rep.kept.length === 0 && rep.notPruned.length === 0, { actual: rep });
      s.assert('the contract holds the records it started with', Number(await chain.view('get_syndicate_count', {})) === countBefore, { expected: countBefore });
    }, { always: true });
  },
};
