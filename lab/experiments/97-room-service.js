import crypto from 'node:crypto';
import { RoomService, RoomError } from '../../src/roost-service/room-service.js';
import { HostedRoost, computeAllocationsHash, computeChargesHash } from '../../src/roost-service/hosted-roost.js';
import { sealToModel } from '../../src/enclave/e2ee.js';
import { signInputWithNearKey, inputMessage, nearKeyPair } from '../../src/roost-service/signed-input.js';

const provider = { simulated: true, attest: async () => Buffer.from('lab-local-no-hardware'), info: async () => ({}) };
const ROUND = { contractId: 'c.near', syndicateId: 'vote', epoch: 1, roundNonce: 'ab'.repeat(32) };
const ROLL = ['m1.near', 'm2.near', 'm3.near', 'm4.near', 'm5.near'];
const keys = Object.fromEntries([...ROLL, 'outsider.near'].map((id) => [id, nearKeyPair()]));
const keyCheck = async (id, pk) => keys[id]?.publicKey === pk;
const OPTIONS = { A: 'ra.near', B: 'rb.near' };
const PARAMS = { options: OPTIONS, roll: ROLL, share: '0.01', quorumBps: 5000, rule: 'majority' };

const mkHost = () => new HostedRoost({ provider, requireSignedInputs: true, accountKeyCheck: keyCheck, deterministicOrder: true });
// A signed, sealed input as a member's app would build it: the service never sees a secret key.
const input = (host, id, body, { seq = 1, round = ROUND, tamper = false } = {}) => {
  const cipherTextHex = sealToModel(JSON.stringify(body), host.intentPublicKey);
  const sig = signInputWithNearKey(keys[id].secretKey, inputMessage({ ...round, flyerId: id, seq, cipherTextHex }));
  return { flyerId: id, cipherTextHex, publicKey: keys[id].publicKey, signature: tamper ? sig.replace(/^../, (x) => (x === '00' ? '01' : '00')) : sig, seq };
};
const codeOf = async (fn) => { try { await fn(); return null; } catch (e) { return e instanceof RoomError ? e.code : `NOT_A_ROOM_ERROR:${e?.message}`; } };
async function vote(svc, host, choices) {
  svc.open(ROUND);
  const sent = [];
  for (const [i, c] of choices.entries()) { const x = input(host, ROLL[i], { choice: c }); sent.push(x.cipherTextHex); await svc.submit(x); }
  return sent;
}

export default {
  id: 'E-ROOMSERVICE-01',
  title: 'runRoom slice 1: one door for the vote room: describe, open, submit, run; typed errors; retry-safe; same answers as the old path',
  tier: 'offline',
  requires: [],
  hypothesis: 'Predictions are in docs/lab/PROGRAMME_PLAN.md, written before any code. RoomService gives the same outcome, order hash, allocations and charges as the old runBallot + signSettlement path, returns the finished contract call, refuses bad calls with a typed code and leaves the queue unharmed, and is safe to retry. The failure that must not happen: a settlement signed for something the host did not compute, or a refused call that eats the round\'s inputs.',
  limits: ['Offline, on local hosts with a simulated attestation provider and a stubbed account-key check.', 'Only the vote room kind is registered; the other six programs and the four adapters (MCP, REST, SSE, SDK) are later slices.', 'One operator plays every member.'],
  async run(ctx) {
    await ctx.step('describe: one program, the host\'s keys', async (s) => {
      const host = mkHost(); const svc = new RoomService({ host }); const d = svc.describe();
      s.assert('exactly one program, ballot', d.programs.length === 1 && d.programs[0].id === 'ballot', { actual: d.programs.map((p) => p.id) });
      s.assert('it lists its parameters', ['options', 'roll', 'share', 'quorumBps', 'rule'].every((k) => k in d.programs[0].params), { actual: Object.keys(d.programs[0].params || {}) });
      s.assert('it reports the host\'s settlement and sealing keys', d.settlePublicKey === host.settlePublicKey && d.intentPublicKey === host.intentPublicKey);
    });

    await ctx.step('a five-member vote returns the finished contract call, and the signature verifies', async (s) => {
      const host = mkHost(); const svc = new RoomService({ host });
      const sent = await vote(svc, host, ['A', 'A', 'A', 'B', 'abstain']);
      const r = await svc.run({ program: 'ballot', params: PARAMS, round: ROUND });
      s.assert('A wins', r.outcome.decided === true && r.outcome.winner === 'A', { actual: r.outcome });
      s.assert('the call is settle_batch_charged', r.settlement?.method === 'settle_batch_charged', { actual: r.settlement?.method });
      const a = r.settlement.args;
      s.assert('with exactly the six arguments the contract takes', JSON.stringify(Object.keys(a).sort()) === JSON.stringify(['aggregate_order_hash', 'allocations', 'attestation_nonce', 'charges', 'enclave_signature', 'syndicate_id']), { actual: Object.keys(a).sort() });
      s.assert('the nonce and syndicate are the round\'s', a.attestation_nonce === ROUND.roundNonce && a.syndicate_id === ROUND.syndicateId);
      s.assert('the pool is paid to A\'s recipient: 5 shares of 0.01 NEAR', a.allocations.length === 1 && a.allocations[0].recipient === 'ra.near' && a.allocations[0].amount === '50000000000000000000000', { actual: a.allocations });
      s.assert('each of the five is charged one share', a.charges.length === 5 && a.charges.every((c) => c.amount === '10000000000000000000000'), { actual: a.charges });
      const message = `${ROUND.contractId}:${ROUND.syndicateId}:${ROUND.epoch}:${ROUND.roundNonce}:${computeAllocationsHash(a.allocations)}:${computeChargesHash(a.charges)}:${a.aggregate_order_hash}`;
      const spki = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(host.settlePublicKey, 'hex')]);
      const ok = crypto.verify(null, Buffer.from(message, 'utf8'), crypto.createPublicKey({ key: spki, format: 'der', type: 'spki' }), Buffer.from(a.enclave_signature, 'hex'));
      s.assert('the signature verifies against the host\'s key over the message rebuilt from the arguments', ok);
      const text = JSON.stringify(r);
      s.assert('the result contains none of the submitted ciphertexts', sent.every((c) => !text.includes(c)));
      s.assert('and its outcome has no tally, counts or turnout', !('tally' in r.outcome) && !('counts' in r.outcome) && !('turnout' in r.outcome));
    });

    await ctx.step('parity: the same answers as the old path on a twin host', async (s) => {
      const hostA = mkHost(); const svc = new RoomService({ host: hostA });
      await vote(svc, hostA, ['A', 'A', 'B', 'A', 'B']);
      const viaService = await svc.run({ program: 'ballot', params: PARAMS, round: ROUND });
      const hostB = mkHost(); hostB.openRound(ROUND);
      for (const [i, c] of ['A', 'A', 'B', 'A', 'B'].entries()) await hostB.submitSignedIntent(input(hostB, ROLL[i], { choice: c }));
      const old = hostB.runBallot(PARAMS);
      s.assert('same order hash', viaService.orderHash === old.orderHash && viaService.settlement.args.aggregate_order_hash === old.orderHash, { expected: old.orderHash, actual: viaService.orderHash });
      s.assert('same allocations and charges', JSON.stringify(viaService.settlement.args.allocations) === JSON.stringify(old.allocations) && JSON.stringify(viaService.settlement.args.charges) === JSON.stringify(old.charges));
      s.assert('same outcome', JSON.stringify(viaService.outcome) === JSON.stringify(old.outcome));
    });

    await ctx.step('a tie decides nothing: no settlement, nothing signed', async (s) => {
      const host = mkHost(); const svc = new RoomService({ host });
      await vote(svc, host, ['A', 'A', 'B', 'B', 'abstain']);
      const r = await svc.run({ program: 'ballot', params: PARAMS, round: ROUND });
      s.assert('undecided', r.outcome.decided === false);
      s.assert('the settlement is null and there is no order hash', r.settlement === null && r.orderHash === null, { actual: { settlement: r.settlement, orderHash: r.orderHash } });
      s.assert('the host signed nothing for this round', host.aggregate === null || host.aggregate.signed !== true);
    });

    await ctx.step('typed errors, and a refused call leaves the inputs alone', async (s) => {
      const host = mkHost(); const svc = new RoomService({ host });
      s.assert('run before a round is open is ROUND_NOT_OPEN', (await codeOf(() => svc.run({ program: 'ballot', params: PARAMS, round: ROUND }))) === 'ROUND_NOT_OPEN');
      s.assert('submit before a round is open is ROUND_NOT_OPEN', (await codeOf(() => svc.submit(input(host, 'm1.near', { choice: 'A' })))) === 'ROUND_NOT_OPEN');
      svc.open(ROUND);
      s.assert('run with no inputs is NO_INPUTS', (await codeOf(() => svc.run({ program: 'ballot', params: PARAMS, round: ROUND }))) === 'NO_INPUTS');
      s.assert('an unknown program is UNKNOWN_PROGRAM', (await codeOf(() => svc.run({ program: 'raffle', params: PARAMS, round: ROUND }))) === 'UNKNOWN_PROGRAM');
      s.assert('a forged signature is NOT_AUTHORISED', (await codeOf(() => svc.submit(input(host, 'm1.near', { choice: 'A' }, { tamper: true })))) === 'NOT_AUTHORISED');
      s.assert('an account\'s signature from another account\'s key is NOT_AUTHORISED', (await codeOf(() => svc.submit({ ...input(host, 'm1.near', { choice: 'A' }), flyerId: 'm2.near' }))) === 'NOT_AUTHORISED');
      s.assert('an input with no signature at all is NOT_AUTHORISED', (await codeOf(() => svc.submit({ flyerId: 'm1.near', cipherTextHex: sealToModel('{"choice":"A"}', host.intentPublicKey) }))) === 'NOT_AUTHORISED');
      s.assert('none of those reached the queue', host.sealedIntents.length === 0, { actual: host.sealedIntents.length });
      for (const [i, c] of ['A', 'A', 'A'].entries()) await svc.submit(input(host, ROLL[i], { choice: c }));
      s.assert('a one-option ballot is INVALID_PARAMS', (await codeOf(() => svc.run({ program: 'ballot', params: { ...PARAMS, options: { A: 'ra.near' } }, round: ROUND }))) === 'INVALID_PARAMS');
      s.assert('a missing parameter is INVALID_PARAMS', (await codeOf(() => svc.run({ program: 'ballot', params: { options: OPTIONS }, round: ROUND }))) === 'INVALID_PARAMS');
      s.assert('a rule that does not exist is INVALID_PARAMS', (await codeOf(() => svc.run({ program: 'ballot', params: { ...PARAMS, rule: 'dictator' }, round: ROUND }))) === 'INVALID_PARAMS');
      const bad = async (over) => codeOf(() => svc.run({ program: 'ballot', params: { ...PARAMS, ...over }, round: ROUND }));
      s.assert('a quorum above 10000 basis points is INVALID_PARAMS', (await bad({ quorumBps: 10001 })) === 'INVALID_PARAMS');
      s.assert('a negative quorum is INVALID_PARAMS', (await bad({ quorumBps: -1 })) === 'INVALID_PARAMS');
      s.assert('a fractional quorum is INVALID_PARAMS', (await bad({ quorumBps: 50.5 })) === 'INVALID_PARAMS');
      s.assert('nine options is INVALID_PARAMS', (await bad({ options: Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`o${i}`, `r${i}.near`])) })) === 'INVALID_PARAMS');
      s.assert('a roll of 51 is INVALID_PARAMS', (await bad({ roll: Array.from({ length: 51 }, (_, i) => `v${i}.near`) })) === 'INVALID_PARAMS');
      s.assert('an empty roll is INVALID_PARAMS', (await bad({ roll: [] })) === 'INVALID_PARAMS');
      s.assert('options given as a string is INVALID_PARAMS, not an internal error', (await bad({ options: 'A,B' })) === 'INVALID_PARAMS');
      s.assert('options given as null is INVALID_PARAMS', (await bad({ options: null })) === 'INVALID_PARAMS');
      s.assert('a roll given as a string is INVALID_PARAMS', (await bad({ roll: 'm1.near' })) === 'INVALID_PARAMS');
      s.assert('a share given as an object is INVALID_PARAMS', (await bad({ share: {} })) === 'INVALID_PARAMS');
      s.assert('an empty share is INVALID_PARAMS', (await bad({ share: '' })) === 'INVALID_PARAMS');
      s.assert('a run for another round is ROUND_NOT_OPEN', (await codeOf(() => svc.run({ program: 'ballot', params: PARAMS, round: { ...ROUND, epoch: 2 } }))) === 'ROUND_NOT_OPEN');
      s.assert('the three inputs are still queued after those refused runs', host.sealedIntents.length === 3, { actual: host.sealedIntents.length });
      const r = await svc.run({ program: 'ballot', params: PARAMS, round: ROUND });
      s.assert('and the same inputs then run correctly: 3 ballots of 5 meet the 50% quorum and A wins', r.outcome.decided === true && r.outcome.winner === 'A', { actual: r.outcome });
    });

    await ctx.step('retry-safe: an identical run returns the same result; a different one is refused', async (s) => {
      const host = mkHost(); const svc = new RoomService({ host });
      await vote(svc, host, ['A', 'A', 'A', 'B', 'abstain']);
      const first = await svc.run({ program: 'ballot', params: PARAMS, round: ROUND });
      const again = await svc.run({ program: 'ballot', params: PARAMS, round: ROUND });
      s.assert('the identical run returns the identical result, signature included (one signature was made)', JSON.stringify(first) === JSON.stringify(again));
      s.assert('a different run after a decided vote is ALREADY_SIGNED', (await codeOf(() => svc.run({ program: 'ballot', params: { ...PARAMS, share: '0.02' }, round: ROUND }))) === 'ALREADY_SIGNED');
      s.assert('so is a new input', (await codeOf(() => svc.submit(input(host, 'm1.near', { choice: 'B' }, { seq: 2 })))) === 'ALREADY_SIGNED');
      svc.open({ ...ROUND, roundNonce: 'cd'.repeat(32) });
      s.assert('opening a new round clears it: running the old round again is ROUND_NOT_OPEN', (await codeOf(() => svc.run({ program: 'ballot', params: PARAMS, round: ROUND }))) === 'ROUND_NOT_OPEN');
    });

    await ctx.step('defaults, unexpected errors, and a cached result never goes stale', async (s) => {
      let host = mkHost(); let svc = new RoomService({ host });
      await vote(svc, host, ['A', 'A', 'A', 'B', 'abstain']);
      const { quorumBps, rule, ...bare } = PARAMS;
      const withDefaults = await svc.run({ program: 'ballot', params: bare, round: ROUND });
      s.assert('quorumBps and rule default to 5000 and majority', withDefaults.outcome.decided === true && withDefaults.outcome.winner === 'A' && withDefaults.outcome.rule === 'majority', { actual: withDefaults.outcome });
      // an unexpected error must not echo its text (it could carry a secret)
      host = mkHost(); svc = new RoomService({ host, programs: [{ id: 'boom', summary: 'x', params: {}, validate: () => true, run: () => { throw new Error('secret-key-0xdeadbeef'); } }] });
      svc.open(ROUND); await svc.submit(input(host, 'm1.near', { choice: 'A' }));
      let err = null; try { await svc.run({ program: 'boom', params: {}, round: ROUND }); } catch (e) { err = e; }
      s.assert('an unexpected error becomes INTERNAL', err instanceof RoomError && err.code === 'INTERNAL', { actual: err?.code });
      s.assert('and its text is not echoed', err && !/secret|deadbeef/.test(err.message), { actual: err?.message });
      // after an undecided (tied) run, new inputs make the same call run fresh, not return the old tie
      host = mkHost(); svc = new RoomService({ host });
      await vote(svc, host, ['A', 'A', 'B', 'B', 'abstain']);
      const tie = await svc.run({ program: 'ballot', params: PARAMS, round: ROUND });
      s.assert('first, a tie', tie.outcome.decided === false);
      for (const [i, c] of ['A', 'A', 'A'].entries()) await svc.submit(input(host, ROLL[i], { choice: c }, { seq: 2 }));
      const fresh = await svc.run({ program: 'ballot', params: PARAMS, round: ROUND });
      s.assert('after three fresh ballots the identical call decides, it does not replay the tie', fresh.outcome.decided === true && fresh.outcome.winner === 'A', { actual: fresh.outcome });
      // a new round gets a fresh result, signed for its own nonce
      const r1 = fresh;
      const ROUND2 = { ...ROUND, roundNonce: 'ee'.repeat(32) };
      svc.open(ROUND2);
      for (const [i, c] of ['A', 'A', 'A', 'B', 'abstain'].entries()) await svc.submit(input(host, ROLL[i], { choice: c }, { round: ROUND2 }));
      const r2 = await svc.run({ program: 'ballot', params: PARAMS, round: ROUND2 });
      s.assert('the new round\'s settlement carries the new nonce, not the old result', r2.settlement.args.attestation_nonce === ROUND2.roundNonce && r2.settlement.args.attestation_nonce !== r1.settlement.args.attestation_nonce, { actual: r2.settlement?.args?.attestation_nonce });
    });

    await ctx.step('the registry is real: a second program runs through the same verbs', async (s) => {
      const host = mkHost();
      const echo = { id: 'echo', summary: 'test program', params: { word: { type: 'string', required: true } }, validate: (p) => typeof p.word === 'string', run: () => ({ outcome: { word: 'hi' }, orderHash: null, allocations: [], charges: [] }) };
      const svc = new RoomService({ host, programs: [...RoomService.defaultPrograms, echo] });
      s.assert('it is listed beside ballot', JSON.stringify(svc.describe().programs.map((p) => p.id)) === JSON.stringify(['ballot', 'echo']));
      svc.open(ROUND);
      await svc.submit(input(host, 'm1.near', { choice: 'A' }));
      const r = await svc.run({ program: 'echo', params: { word: 'x' }, round: ROUND });
      s.assert('it runs and, deciding nothing, returns a null settlement', r.outcome.word === 'hi' && r.settlement === null);
      s.assert('its bad parameters are INVALID_PARAMS', (await codeOf(() => svc.run({ program: 'echo', params: {}, round: ROUND }))) === 'INVALID_PARAMS');
    });
  },
};
