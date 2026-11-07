import crypto from 'node:crypto';
import { clearBallot } from '../../src/roost-service/ballot-program.js';
import { HostedRoost } from '../../src/roost-service/hosted-roost.js';
import { sealToModel } from '../../src/enclave/e2ee.js';
import { signInputWithNearKey, inputMessage, nearKeyPair } from '../../src/roost-service/signed-input.js';

const provider = { simulated: true, attest: async () => Buffer.from('lab-local-no-hardware'), info: async () => ({}) };
const NEAR = 10n ** 24n;
const rngOf = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
const ROUND = { contractId: 'c.near', syndicateId: 'vote', epoch: 1, roundNonce: 'ab'.repeat(32) };
const ROLL = ['m1.near', 'm2.near', 'm3.near', 'm4.near', 'm5.near'];
const keys = Object.fromEntries([...ROLL, 'outsider.near'].map((id) => [id, nearKeyPair()]));
const keyCheck = async (id, pk) => keys[id]?.publicKey === pk;
const OPTIONS = { A: 'ra.near', B: 'rb.near', C: 'rc.near' };

export default {
  id: 'E-BALLOT-PROGRAM-01',
  title: 'Ballot room program: right winner, no tally in the outcome, outsiders and unsigned ballots refused, re-voting, order-independent',
  tier: 'offline',
  requires: [],
  hypothesis: 'The ballot program counts one signed ballot per roll member (the latest wins), applies a quorum and a majority or plurality rule, and decides only with a strict winner; a tie, a missed quorum or a missed majority decides nothing. The result does not depend on the order ballots arrive. The published outcome carries the winner and whether it was decided, never a tally or a turnout count. The host refuses to run a ballot unless inputs are signed, ignores ballots from outside the roll, spoils ballots for unknown options, and signs only a payment to the winning option\'s recipient with equal charges on the roll. Fails if any of these breaks.',
  limits: ['Offline, on local hosts with a simulated attestation provider and a stubbed account-key check. The weight of a vote is a deposit-funded share, not a person: the contract cannot tell one person from many accounts. Re-voting reduces but does not remove vote-buying. The roll is supplied by the coordinator; the contract only caps charges to real depositors.'],
  async run(ctx) {
    await ctx.step('the counting rule: worked examples and 3,000 random rounds', async (s) => {
      const b = (id, choice, order = 0) => ({ flyerId: id, choice, order });
      const run = (choices, o = {}) => clearBallot({ options: Object.keys(OPTIONS), roll: ROLL, ballots: choices.map((c, i) => b(ROLL[i], c, i)), quorumBps: 5000, rule: 'majority', ...o });
      let r = run(['A', 'A', 'A', 'B', 'abstain']);
      s.assert('A wins 3 of 4 non-abstaining ballots with full turnout', r.decided && r.winner === 'A' && r.quorumMet);
      s.assert('a tie decides nothing', run(['A', 'A', 'B', 'B', 'abstain']).decided === false && run(['A', 'A', 'B', 'B', 'abstain']).reason === 'tie');
      r = run(['A', 'A', 'B', 'C', 'C'], { rule: 'plurality' }); s.assert('under plurality a three-way split with two tied leaders is a tie', !r.decided && r.reason === 'tie');
      r = run(['A', 'A', 'B', 'C', 'abstain'], { rule: 'plurality' }); s.assert('under plurality A wins with 2 of 4', r.decided && r.winner === 'A');
      r = run(['A', 'A', 'B', 'C', 'abstain'], { rule: 'majority' }); s.assert('the same ballots under majority decide nothing: 2 of 4 is not more than half', !r.decided && r.reason === 'no-majority');
      r = clearBallot({ options: Object.keys(OPTIONS), roll: ROLL, ballots: [b('m1.near', 'A'), b('m2.near', 'A')], quorumBps: 6000, rule: 'majority' }); s.assert('2 of 5 ballots miss a 60% quorum', !r.decided && r.reason === 'no-quorum' && !r.quorumMet);
      r = clearBallot({ options: Object.keys(OPTIONS), roll: ROLL, ballots: [b('m1.near', 'A'), b('m2.near', 'A'), b('m3.near', 'Z')], quorumBps: 5000, rule: 'majority' }); s.assert('a ballot for an unknown option is spoiled and does not count toward quorum', r.spoiled === 1 && !r.decided && r.reason === 'no-quorum');
      r = clearBallot({ options: Object.keys(OPTIONS), roll: ROLL, ballots: [b('outsider.near', 'A'), b('m1.near', 'B'), b('m2.near', 'B'), b('m3.near', 'B')], quorumBps: 5000, rule: 'majority' }); s.assert('an outsider\'s ballot is ignored and reported, not counted', r.outsiders.join() === 'outsider.near' && r.winner === 'B');
      r = clearBallot({ options: Object.keys(OPTIONS), roll: ROLL, ballots: [b('m1.near', 'A'), b('m1.near', 'B'), b('m2.near', 'B'), b('m3.near', 'B')], quorumBps: 5000, rule: 'majority' }); s.assert('two ballots from one roll member count once (the host gives it one; the program also refuses a second)', r.duplicates === 1);
      const exact = (n) => clearBallot({ options: Object.keys(OPTIONS), roll: ROLL, ballots: ROLL.slice(0, n).map((id, i) => b(id, 'A', i)), quorumBps: 6000, rule: 'majority' });
      s.assert('a quorum exactly on the boundary is met (3 of 5 at 60%) and one fewer is not', exact(3).quorumMet === true && exact(2).quorumMet === false);
      r = clearBallot({ options: Object.keys(OPTIONS), roll: ROLL, ballots: [b('m1.near', 'A', 0), b('m1.near', 'B', 1), b('m2.near', 'B', 2)], quorumBps: 0, rule: 'majority' }); s.assert('a later ballot from the same member replaces the earlier one: m1\'s A then B gives B 2 to 0', r.decided && r.winner === 'B' && r.duplicates === 1);
      r = clearBallot({ options: Object.keys(OPTIONS), roll: ROLL, ballots: [b('m1.near', 'A', 5), b('m1.near', 'B', 1), b('m2.near', 'B', 2)], quorumBps: 0, rule: 'majority' }); s.assert('"later" means a higher order, not the later position in the list', r.decided === false && r.reason === 'tie');
      r = clearBallot({ options: Object.keys(OPTIONS), roll: ROLL, ballots: [b('m1.near', 'A', 0), ...['m2.near', 'm3.near', 'm4.near', 'm5.near'].map((id, i) => b(id, 'abstain', i + 1))], quorumBps: 5000, rule: 'majority' }); s.assert('when abstentions outnumber the votes the single vote still decides by the stated rule (majority of non-abstaining ballots)', r.decided && r.winner === 'A');
      const rnd = rngOf(3); const bad = [];
      for (let t = 0; t < 3000; t += 1) {
        const n = 1 + Math.floor(rnd() * 9); const roll = Array.from({ length: n }, (_, i) => `r${i}`); const opts = ['A', 'B', 'C'];
        const ballots = roll.filter(() => rnd() < 0.8).map((id, i) => ({ flyerId: id, choice: rnd() < 0.15 ? 'abstain' : opts[Math.floor(rnd() * 3)], order: i }));
        for (const rule of ['majority', 'plurality']) for (const quorumBps of [0, 5000, 10000]) {
          const a = clearBallot({ options: opts, roll, ballots, quorumBps, rule }); const shuffled = [...ballots].sort(() => rnd() - 0.5).map((x, i) => ({ ...x, order: i }));
          const c = clearBallot({ options: opts, roll, ballots: shuffled, quorumBps, rule });
          const fail = (w) => bad.length < 4 && bad.push(w);
          if (JSON.stringify(a) !== JSON.stringify(c)) fail('the result depends on ballot order');
          const counts = Object.fromEntries(opts.map((o) => [o, ballots.filter((x) => x.choice === o).length])); const top = Math.max(...Object.values(counts)); const leaders = opts.filter((o) => counts[o] === top);
          const nonAbstain = ballots.filter((x) => x.choice !== 'abstain').length;
          if (a.decided && (leaders.length !== 1 || a.winner !== leaders[0])) fail('decided without a unique strict leader');
          if (a.decided && rule === 'majority' && !(top * 2 > nonAbstain)) fail('majority decided without more than half');
          if (a.decided && ballots.length * 10000 < quorumBps * n) fail('decided below quorum');
          if (!a.decided && a.winner !== null) fail('a winner reported for an undecided ballot');
          if ('tally' in a || 'counts' in a || 'turnout' in a) fail('the outcome carries a tally or turnout');
        }
      }
      s.assert('no invariant broke in 3,000 random rounds (order-independent, strict leader, majority and quorum respected, no tally in the outcome)', bad.length === 0, { actual: bad });
    });

    await ctx.step('the host: signed ballots only, outsiders ignored, re-voting, payment to the winner, nothing else signed', async (s) => {
      const mkHost = (opts = {}) => { const r = new HostedRoost({ provider, requireSignedInputs: true, accountKeyCheck: keyCheck, ...opts }); r.openRound(ROUND); return r; };
      const cast = async (r, id, body, seq = 1) => { const cipherTextHex = sealToModel(JSON.stringify(body), r.intentPublicKey); return r.submitSignedIntent({ flyerId: id, cipherTextHex, publicKey: keys[id].publicKey, signature: signInputWithNearKey(keys[id].secretKey, inputMessage({ ...ROUND, flyerId: id, seq, cipherTextHex })), seq }); };
      const params = { options: OPTIONS, roll: ROLL, share: '0.02', quorumBps: 5000, rule: 'majority', roundId: 'v1' };
      const refused = (fn, re) => { try { fn(); return 'signed'; } catch (e) { return re.test(e.message) ? true : e.message; } };
      const unsigned = new HostedRoost({ provider });
      s.assert('a host that does not require signed inputs refuses to count a ballot', refused(() => unsigned.runBallot(params), /signed/) === true);
      let r = mkHost(); for (const [id, c] of [['m1.near', 'A'], ['m2.near', 'A'], ['m3.near', 'A'], ['m4.near', 'B'], ['m5.near', 'abstain']]) await cast(r, id, { choice: c });
      let out = r.runBallot(params);
      s.assert('A wins: the outcome names A and its recipient', out.outcome.decided && out.outcome.winner === 'A' && out.outcome.recipient === 'ra.near');
      s.assert('the published outcome carries no tally, no turnout and no ballot', !['tally', 'counts', 'turnout', 'cast', 'ballots'].some((k) => k in out.outcome), { actual: Object.keys(out.outcome) });
      s.assert('the payment is the pool (5 x 0.02 = 0.1 NEAR) to ra.near, charged 0.02 to every roll member, voters or not', out.allocations.length === 1 && out.allocations[0].recipient === 'ra.near' && BigInt(out.allocations[0].amount) === 10n ** 23n && out.charges.length === 5 && out.charges.every((c) => BigInt(c.amount) === 20000000000000000000000n), { actual: out.allocations });
      s.assert('the signed message has 7 fields', r.signSettlement({ ...ROUND, allocations: out.allocations, orderHash: out.orderHash, charges: out.charges }).message.split(':').length === 7);
      // re-voting
      r = mkHost(); for (const [id, c] of [['m1.near', 'A'], ['m2.near', 'A'], ['m3.near', 'B'], ['m4.near', 'B'], ['m5.near', 'B']]) await cast(r, id, { choice: c });
      await cast(r, 'm3.near', { choice: 'A' }, 2); await cast(r, 'm4.near', { choice: 'A' }, 2);
      out = r.runBallot(params); s.assert('re-voting: m3 and m4 change their ballots to A and A wins 4 to 1', out.outcome.decided && out.outcome.winner === 'A');
      // outsider
      r = mkHost(); for (const id of ['m1.near', 'm2.near']) await cast(r, id, { choice: 'B' }); await cast(r, 'outsider.near', { choice: 'A' }); await cast(r, 'm3.near', { choice: 'B' });
      out = r.runBallot(params); s.assert('an outsider\'s signed ballot is ignored and reported by account only', out.outcome.decided && out.outcome.winner === 'B' && out.outcome.outsiders.join() === 'outsider.near');
      s.assert('and the pool goes to the winning option\'s recipient, rb.near, not the first option\'s', out.allocations[0].recipient === 'rb.near' && out.outcome.recipient === 'rb.near');
      // undecided
      r = mkHost(); for (const [id, c] of [['m1.near', 'A'], ['m2.near', 'B'], ['m3.near', 'abstain']]) await cast(r, id, { choice: c });
      out = r.runBallot({ ...params, quorumBps: 5000 }); s.assert('an undecided ballot (tie) pays nothing and leaves nothing to sign', out.outcome.decided === false && out.orderHash === null && out.allocations.length === 0);
      // tamper
      const t = (async () => { const q = mkHost(); for (const [id, c] of [['m1.near', 'A'], ['m2.near', 'A'], ['m3.near', 'A']]) await cast(q, id, { choice: c }); return { q, o: q.runBallot(params) }; });
      let x = await t(); const moved = x.o.allocations.map((a) => ({ ...a, recipient: 'rb.near' }));
      s.assert('paying the pool to the losing option is refused', refused(() => x.q.signSettlement({ ...ROUND, allocations: moved, orderHash: x.o.orderHash, charges: x.o.charges }), /allocations do not match/) === true);
      x = await t(); const heavy = x.o.charges.map((c, i) => (i === 0 ? { ...c, amount: String(BigInt(c.amount) * 5n) } : c));
      s.assert('charging one voter the whole pool is refused', refused(() => x.q.signSettlement({ ...ROUND, allocations: x.o.allocations, orderHash: x.o.orderHash, charges: heavy }), /charges do not match/) === true);
      x = await t(); s.assert('a ballot outcome cannot be settled without its charges', refused(() => x.q.signSettlement({ ...ROUND, allocations: x.o.allocations, orderHash: x.o.orderHash }), /only be settled with its charges/) === true);
      // two hosts
      const A = mkHost({ deterministicOrder: true }); const B = mkHost({ deterministicOrder: true });
      for (const [id, c] of [['m1.near', 'A'], ['m2.near', 'B'], ['m3.near', 'A'], ['m4.near', 'B'], ['m5.near', 'A']]) { await cast(A, id, { choice: c }); }
      for (const [id, c] of [['m5.near', 'A'], ['m4.near', 'B'], ['m3.near', 'A'], ['m2.near', 'B'], ['m1.near', 'A']]) { await cast(B, id, { choice: c }); }
      const oa = A.runBallot(params); const ob = B.runBallot(params);
      s.assert('two hosts that received the same ballots in opposite orders sign the same message', oa.orderHash === ob.orderHash && JSON.stringify(oa.charges) === JSON.stringify(ob.charges));
    });
  },
};
