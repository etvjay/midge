import crypto from 'node:crypto';
import { connect, near, fmt, computePolicyHash } from '../lib/near.js';
import { createMembers, teardownMembers } from '../lib/members.js';
import { HostedRoost } from '../../src/roost-service/hosted-roost.js';
import { sealToModel } from '../../src/enclave/e2ee.js';
import { signInputWithNearKey, inputMessage, makeAccountKeyCheck } from '../../src/roost-service/signed-input.js';

const RPC = 'https://test.rpc.fastnear.com';
const provider = { simulated: true, attest: async () => Buffer.from('lab-local-no-hardware'), info: async () => ({}) };
const DEPOSIT = '0.05';
const AMT = { a: '0.01', b: '0.02', c: '0.03', d: '0.04' };

export default {
  id: 'E-TWO-ROOM-LIVE-01',
  title: 'Two-room agreement on testnet: two Roosts must both sign; a lying room, one room twice, or one signature alone move no money',
  tier: 'testnet',
  requires: ['near-key', 'network'],
  hypothesis: 'Written before the run (docs/lab/TWO_ROOM_SPEC.md). On a two-room syndicate: (1) a settlement signed by room A alone is refused; (2) room A honest and room B signing a different charge set (B greedy) is refused; (3) one room\'s signature supplied twice is refused; (4) after those three refusals the escrow is unchanged and the honest settlement from both rooms still succeeds; (5) two real Roosts fed the same signed inputs sign the identical message and the contract pays exactly the total with each member charged only their own amount; (6) a member who sends different bids to the two rooms makes them disagree and the contract refuses, and after the coordinator finds that member by salted digests and both rooms exclude them, the same two rooms settle and that member is not charged; (7) if room B never signs, nothing settles, and every member exits alone and recovers the full deposit. Fails if any refused call succeeds, if money moves on a refusal, or if an honest two-room settlement is refused.',
  limits: [
    'One operator controls every account, both Roosts and the coordinator. Both Roosts are local with a simulated attestation provider: this tests the contract and the agreement logic, not independence or hardware.',
    'In (1) to (4) room B is a plain signing key we hold, standing in for a compromised or greedy room, because a real Roost refuses to sign anything it did not compute.',
    'The rooms exchange nothing but salted digests; the digests reveal no amount, and the coordinator sees them.',
    'The Roost\'s two-room mode removes time priority; ties break by a hash. Testnet only; third-party audit: none.',
  ],
  async run(ctx) {
    const chain = await connect(ctx.rootDir);
    const coord = chain.sub('c');
    const tag = Date.now().toString(36);
    const created = []; let P; let recipient; let countBefore;
    const WHO = ['a', 'b', 'c'];
    const state = (id) => chain.view('get_syndicate', { syndicate_id: id });
    const policy = () => ({ allowed_recipients: [recipient.id], max_release_bps_per_epoch: 10000, settle_deadline_block: 500000000 });
    const keyCheck = makeAccountKeyCheck({ rpcUrl: RPC, contractId: chain.coordinatorId });
    const mkRoost = () => new HostedRoost({ provider, requireSignedInputs: true, accountKeyCheck: keyCheck, deterministicOrder: true });
    const height = async () => Number((await chain.provider.viewBlock({ finality: 'final' })).header.height);
    const escrows = async (id, who) => Object.fromEntries(await Promise.all(who.map(async (k) => [k, BigInt(await chain.view('get_escrow', { syndicate_id: id, account_id: P[k].id }))])));
    const rogue = () => { const kp = crypto.generateKeyPairSync('ed25519'); return { hex: kp.publicKey.export({ format: 'der', type: 'spki' }).subarray(12).toString('hex'), sign: (m) => crypto.sign(null, Buffer.from(m, 'utf8'), kp.privateKey).toString('hex') }; };

    async function hatch(id, keyA, keyB) {
      created.push(id);
      return chain.send(coord.account, 'hatch_two_room', { syndicate_id: id, syndicate_type: 'FLASH', quorum_threshold: 1, max_spend_near: 1, enclave_public_key: keyA, second_enclave_public_key: keyB, expected_code_hash: crypto.randomBytes(32).toString('hex'), timeout_blocks: 16, payout_recipient: recipient.id, release_policy: policy() }, { deposit: near('0.01'), gas: 40000000000000n, label: `hatch_two_room ${id}` });
    }
    async function fund(id, who) {
      for (const k of who) { const r = await chain.send(P[k].account, 'deposit', { syndicate_id: id, policy_hash: computePolicyHash(policy(), 16) }, { deposit: near(DEPOSIT), gas: 30000000000000n, label: `deposit ${k} -> ${id}` }); if (!r.ok) throw new Error(`deposit failed: ${r.error}`); }
      await chain.waitFor(async () => BigInt((await state(id)).total_escrow) === near(DEPOSIT) * BigInt(who.length), { what: 'deposits' });
    }
    /** A member seals once per room (a different ciphertext for each) and signs each submission with their real NEAR key. */
    async function submit(room, ctxRound, who, body, seq = 1) {
      const cipherTextHex = sealToModel(JSON.stringify(body), room.intentPublicKey);
      const sig = signInputWithNearKey(P[who].key.keyPair.toString(), inputMessage({ ...ctxRound, flyerId: P[who].id, seq, cipherTextHex }));
      return room.submitSignedIntent({ flyerId: P[who].id, cipherTextHex, publicKey: P[who].key.keyPair.getPublicKey().toString(), signature: sig, seq });
    }
    const roundOf = async (id) => { const st = await state(id); return { contractId: chain.coordinatorId, syndicateId: id, epoch: Number(st.epoch), roundNonce: st.round_nonce }; };
    const refused = (s, why, tx, re) => { s.evidence('tx', { label: tx.label, hash: tx.hash, ok: tx.ok, explorer: tx.explorer, error: tx.error }); s.assert(why, !tx.ok && re.test(tx.error || ''), { actual: tx.error }); };
    const settleArgs = (id, round, out, a, b) => ({ syndicate_id: id, attestation_nonce: round.roundNonce, aggregate_order_hash: out.orderHash, allocations: out.allocations, charges: out.charges, enclave_signature: a, second_enclave_signature: b });
    const exitAll = async (s, id, who) => {
      await chain.waitFor(async () => (await height()) - Number((await state(id)).epoch_start_block) >= 16, { what: 'the exit timer', timeoutMs: 120000 });
      const back = {};
      for (const k of who) { const r = await chain.send(P[k].account, 'hatch_out', { syndicate_id: id }, { gas: 60000000000000n, label: `exit ${id} as ${k}` }); s.assert(`${k} exits alone`, r.ok, { actual: r.error }); const m = (await chain.transfersOf(r.hash, P[k].id)).filter((x) => x.fromContract && x.to === P[k].id); back[k] = m.length ? BigInt(m[0].amount) : 0n; }
      return back;
    };

    await ctx.step('set up: four members, a recipient, and the first two-room checks on a fresh deployment', async (s) => {
      countBefore = Number(await chain.view('get_syndicate_count', {}));
      const made = await createMembers(chain, { rootDir: ctx.rootDir, tag: `t${tag.slice(-5)}`, count: 5, fundNear: '0.45', names: ['a', 'b', 'c', 'd', 'r'] });
      P = { a: made[0], b: made[1], c: made[2], d: made[3] }; recipient = made[4];
      s.assert('five accounts exist', made.length === 5);
      s.assert('the deployed contract has the two-room entry points (get_second_enclave_key answers)', (await chain.view('get_second_enclave_key', { syndicate_id: 'none' })) === null);
    }, { critical: true });

    // ---------- attacks (room B is a plain key we hold) ----------
    let S1; let honestA; let rogueB;
    await ctx.step('ATTACKS · a single signature, a greedy second room, one room twice: each refused, the escrow untouched, then the honest pair settles', async (s) => {
      S1 = `tr1-${tag}`; honestA = mkRoost(); rogueB = rogue();
      s.assert('hatch_two_room succeeds', (await hatch(S1, honestA.settlePublicKey, rogueB.hex)).ok);
      await chain.waitFor(() => state(S1), { what: 'syndicate' });
      s.assert('the second key is registered on chain', (await chain.view('get_second_enclave_key', { syndicate_id: S1 })) === rogueB.hex);
      await fund(S1, WHO);
      const round = await roundOf(S1); honestA.openRound(round);
      for (const k of WHO) await submit(honestA, round, k, { amount: AMT[k], salt: crypto.randomBytes(16).toString('hex') });
      const out = honestA.runPool({ recipient: recipient.id, roundId: S1 });
      const sigA = honestA.signSettlement({ ...round, allocations: out.allocations, orderHash: out.orderHash, charges: out.charges });
      const honestMsg = sigA.message;
      const before = await escrows(S1, WHO); const stBefore = await state(S1);

      // (1) room A alone, through the ordinary entry point
      refused(s, '(1) a settlement signed by room A alone is refused', await chain.send(coord.account, 'settle_batch_charged', { syndicate_id: S1, attestation_nonce: round.roundNonce, aggregate_order_hash: out.orderHash, allocations: out.allocations, charges: out.charges, enclave_signature: sigA.signature }, { gas: 150000000000000n, label: 'room A alone' }), /two-room/);
      // (2) room B greedy: signs charges that put everything on member a
      const greedy = [{ member: P.a.id, amount: String(near('0.06')) }];
      const greedyMsg = (() => { const h = (x) => crypto.createHash('sha256').update(x).digest('hex'); return `${chain.coordinatorId}:${S1}:${round.epoch}:${round.roundNonce}:${sigA.allocationsHash}:${h(greedy.map((c) => `${c.member}:${c.amount}`).join(','))}:${out.orderHash}`; })();
      refused(s, '(2) room A honest, room B signing a different charge set (greedy) is refused', await chain.send(coord.account, 'settle_batch_charged_two_room', settleArgs(S1, round, out, sigA.signature, rogueB.sign(greedyMsg)), { gas: 150000000000000n, label: 'room B greedy' }), /second room/);
      // (3) one room twice
      refused(s, '(3) one room\'s signature supplied twice is refused', await chain.send(coord.account, 'settle_batch_charged_two_room', settleArgs(S1, round, out, sigA.signature, sigA.signature), { gas: 150000000000000n, label: 'room A twice' }), /second room/);
      // (4) nothing moved
      const mid = await escrows(S1, WHO); const stMid = await state(S1);
      s.assert('(4) after three refusals every escrow is unchanged and no settlement is in flight', WHO.every((k) => mid[k] === before[k]) && !stMid.is_settling && stMid.total_escrow === stBefore.total_escrow, { actual: { mid: Object.fromEntries(WHO.map((k) => [k, String(mid[k])])), settling: stMid.is_settling } });
      const ok = await chain.send(coord.account, 'settle_batch_charged_two_room', settleArgs(S1, round, out, sigA.signature, rogueB.sign(honestMsg)), { gas: 150000000000000n, label: 'honest pair (room B key we hold)' });
      s.evidence('tx', { label: ok.label, hash: ok.hash, ok: ok.ok, explorer: ok.explorer, error: ok.error });
      s.assert('(4) the honest pair then settles: the refusals did not break the round', ok.ok, { actual: ok.error });
      await chain.waitFor(async () => { const x = await state(S1); return !x.is_settling && BigInt(x.total_escrow) === near(DEPOSIT) * 3n - near('0.06'); }, { what: 'settlement resolved' });
      const paid = (await chain.transfersOf(ok.hash, chain.coordinatorId)).filter((m) => m.fromContract && m.to === recipient.id);
      s.assert('the recipient received exactly 0.06', paid.length === 1 && BigInt(paid[0].amount) === near('0.06'), { actual: paid });
      s.evidence('gas', { twoRoomSettleTGas: ok.gasTGas });
    });

    // ---------- two real Roosts ----------
    await ctx.step('HONEST · two real Roosts, same signed inputs, one identical message', async (s) => {
      const id = `tr2-${tag}`; const A = mkRoost(); const B = mkRoost();
      s.assert('the rooms have different settlement keys', A.settlePublicKey !== B.settlePublicKey);
      s.assert('hatch_two_room succeeds', (await hatch(id, A.settlePublicKey, B.settlePublicKey)).ok);
      await chain.waitFor(() => state(id), { what: 'syndicate' }); await fund(id, WHO);
      const round = await roundOf(id); A.openRound(round); B.openRound(round);
      for (const k of WHO) { const salt = crypto.randomBytes(16).toString('hex'); await submit(A, round, k, { amount: AMT[k], salt }); await submit(B, round, k, { amount: AMT[k], salt }); }
      s.assert('salted digests of each member\'s input match between the rooms', JSON.stringify(A.inputDigests()) === JSON.stringify(B.inputDigests()));
      const oa = A.runPool({ recipient: recipient.id, roundId: id }); const ob = B.runPool({ recipient: recipient.id, roundId: id });
      const sa = A.signSettlement({ ...round, allocations: oa.allocations, orderHash: oa.orderHash, charges: oa.charges }); const sb = B.signSettlement({ ...round, allocations: ob.allocations, orderHash: ob.orderHash, charges: ob.charges });
      s.assert('(5) the two rooms signed the byte-identical message', sa.message === sb.message);
      const tx = await chain.send(coord.account, 'settle_batch_charged_two_room', settleArgs(id, round, oa, sa.signature, sb.signature), { gas: 150000000000000n, label: 'two real Roosts' });
      s.evidence('tx', { label: tx.label, hash: tx.hash, ok: tx.ok, explorer: tx.explorer, error: tx.error }); s.evidence('gas', { twoRoomSettleTGas: tx.gasTGas });
      s.assert('(5) the settlement succeeded', tx.ok, { actual: tx.error });
      await chain.waitFor(async () => { const x = await state(id); return !x.is_settling && BigInt(x.total_escrow) === near(DEPOSIT) * 3n - near('0.06'); }, { what: 'settlement resolved' });
      const paid = (await chain.transfersOf(tx.hash, chain.coordinatorId)).filter((m) => m.fromContract && m.to === recipient.id);
      s.assert('(5) the recipient received exactly 0.06', paid.length === 1 && BigInt(paid[0].amount) === near('0.06'));
      const back = await exitAll(s, id, WHO);
      for (const k of WHO) s.assert(`(5) ${k} got back exactly their deposit less their own ${AMT[k]}`, back[k] === near(DEPOSIT) - near(AMT[k]), { actual: String(back[k]) });
    });

    // ---------- equivocation ----------
    await ctx.step('EQUIVOCATION · d tells the rooms different bids: refused, then found by digests, excluded, and the rooms settle', async (s) => {
      const id = `tr3-${tag}`; const A = mkRoost(); const B = mkRoost(); const W4 = ['a', 'b', 'c', 'd'];
      s.assert('hatch_two_room succeeds', (await hatch(id, A.settlePublicKey, B.settlePublicKey)).ok);
      await chain.waitFor(() => state(id), { what: 'syndicate' }); await fund(id, W4);
      const salts = Object.fromEntries(W4.map((k) => [k, crypto.randomBytes(16).toString('hex')]));
      const feed = async (round) => { A.openRound(round); B.openRound(round); for (const k of W4) { await submit(A, round, k, { amount: AMT[k], salt: salts[k] }); await submit(B, round, k, { amount: k === 'd' ? '0.09' : AMT[k], salt: salts[k] }); } };
      let round = await roundOf(id); await feed(round);
      const da = A.inputDigests(); const db = B.inputDigests(); const differing = W4.filter((k) => da[P[k].id] !== db[P[k].id]);
      s.assert('(6) the salted digests differ for exactly d', differing.join() === 'd', { actual: differing });
      let oa = A.runPool({ recipient: recipient.id, roundId: id }); let ob = B.runPool({ recipient: recipient.id, roundId: id });
      let sa = A.signSettlement({ ...round, allocations: oa.allocations, orderHash: oa.orderHash, charges: oa.charges }); let sb = B.signSettlement({ ...round, allocations: ob.allocations, orderHash: ob.orderHash, charges: ob.charges });
      s.assert('(6) with d in, the rooms signed different messages', sa.message !== sb.message);
      refused(s, '(6) the contract refuses the disagreeing pair', await chain.send(coord.account, 'settle_batch_charged_two_room', settleArgs(id, round, oa, sa.signature, sb.signature), { gas: 150000000000000n, label: 'rooms disagree' }), /second room/);
      s.assert('(6) nothing moved', BigInt((await state(id)).total_escrow) === near(DEPOSIT) * 4n && !(await state(id)).is_settling);
      round = await roundOf(id); await feed(round);
      A.excludeMembers([P.d.id]); B.excludeMembers([P.d.id]);
      oa = A.runPool({ recipient: recipient.id, roundId: id }); ob = B.runPool({ recipient: recipient.id, roundId: id });
      sa = A.signSettlement({ ...round, allocations: oa.allocations, orderHash: oa.orderHash, charges: oa.charges }); sb = B.signSettlement({ ...round, allocations: ob.allocations, orderHash: ob.orderHash, charges: ob.charges });
      s.assert('(6) with d excluded the rooms sign the identical message', sa.message === sb.message);
      const tx = await chain.send(coord.account, 'settle_batch_charged_two_room', settleArgs(id, round, oa, sa.signature, sb.signature), { gas: 150000000000000n, label: 'rooms agree after excluding d' });
      s.evidence('tx', { label: tx.label, hash: tx.hash, ok: tx.ok, explorer: tx.explorer, error: tx.error });
      s.assert('(6) the settlement succeeds', tx.ok, { actual: tx.error });
      await chain.waitFor(async () => { const x = await state(id); return !x.is_settling && BigInt(x.total_escrow) === near(DEPOSIT) * 4n - near('0.06'); }, { what: 'settlement resolved' });
      const back = await exitAll(s, id, W4);
      s.assert('(6) d was not charged: d got back the full deposit', back.d === near(DEPOSIT), { actual: String(back.d) });
      for (const k of WHO) s.assert(`(6) ${k} was charged only their own ${AMT[k]}`, back[k] === near(DEPOSIT) - near(AMT[k]), { actual: String(back[k]) });
    });

    // ---------- room B never signs ----------
    await ctx.step('ROOM GONE · room B never signs: nothing settles and every member exits alone with the full deposit', async (s) => {
      const id = `tr4-${tag}`; const A = mkRoost();
      s.assert('hatch_two_room succeeds', (await hatch(id, A.settlePublicKey, rogue().hex)).ok);
      await chain.waitFor(() => state(id), { what: 'syndicate' }); await fund(id, WHO);
      const round = await roundOf(id); A.openRound(round);
      for (const k of WHO) await submit(A, round, k, { amount: AMT[k], salt: crypto.randomBytes(16).toString('hex') });
      const out = A.runPool({ recipient: recipient.id, roundId: id }); const sa = A.signSettlement({ ...round, allocations: out.allocations, orderHash: out.orderHash, charges: out.charges });
      refused(s, '(7) room A cannot settle without room B', await chain.send(coord.account, 'settle_batch_charged', { syndicate_id: id, attestation_nonce: round.roundNonce, aggregate_order_hash: out.orderHash, allocations: out.allocations, charges: out.charges, enclave_signature: sa.signature }, { gas: 150000000000000n, label: 'A alone, B gone' }), /two-room/);
      const back = await exitAll(s, id, WHO);
      for (const k of WHO) s.assert(`(7) ${k} recovered the full deposit alone`, back[k] === near(DEPOSIT), { actual: String(back[k]) });
    });

    await ctx.step('teardown: prune the syndicates, compact, delete the accounts', async (s) => {
      if (!P) { s.assert('nothing to tear down', true); return; }
      const rep = await teardownMembers(chain, { rootDir: ctx.rootDir, members: [P.a, P.b, P.c, P.d, recipient], pruneIds: created });
      s.observe('teardown', { pruned: rep.pruned.length, notPruned: rep.notPruned, deleted: rep.deleted.length, kept: rep.kept, failed: rep.failed });
      s.assert('every account was deleted and every syndicate pruned', rep.failed.length === 0 && rep.kept.length === 0 && rep.notPruned.length === 0, { actual: rep });
      s.assert('the contract holds the records it started with', Number(await chain.view('get_syndicate_count', {})) === countBefore, { expected: countBefore });
      s.assert('no second-room key is left behind for a pruned syndicate', (await Promise.all(created.map((i) => chain.view('get_second_enclave_key', { syndicate_id: i })))).every((v) => v === null));
    }, { always: true });
  },
};
