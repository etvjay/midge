import { clearBallot } from '../../src/roost-service/ballot-program.js';
import { HostedRoost } from '../../src/roost-service/hosted-roost.js';
import { sealToModel } from '../../src/enclave/e2ee.js';
import { signInputWithNearKey, inputMessage, nearKeyPair } from '../../src/roost-service/signed-input.js';

const provider = { simulated: true, attest: async () => Buffer.from('lab-local-no-hardware'), info: async () => ({}) };
const rngOf = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
const ROUND = { contractId: 'c.near', syndicateId: 'vote', epoch: 1, roundNonce: 'ab'.repeat(32) };
const ROLL = ['m1.near', 'm2.near', 'm3.near', 'm4.near', 'm5.near'];
const keys = Object.fromEntries(ROLL.map((id) => [id, nearKeyPair()]));
const keyCheck = async (id, pk) => keys[id]?.publicKey === pk;
const OPTIONS = { A: 'ra.near', B: 'rb.near', C: 'rc.near' };

/** A frozen copy of the counting rule as it was before weights existed (2026-11-12), so "no weights, no change" is checked against the old code and not against itself. */
function legacyClearBallot({ options, roll, ballots, quorumBps, rule = 'majority' }) {
  const rollSet = new Set(roll); const valid = new Set([...options, 'abstain']);
  const outsiders = []; let duplicates = 0; let spoiled = 0; const latest = new Map();
  ballots.forEach((b, i) => {
    if (!rollSet.has(b.flyerId)) { if (!outsiders.includes(b.flyerId)) outsiders.push(b.flyerId); return; }
    const prev = latest.get(b.flyerId);
    if (prev) { duplicates += 1; if (b.order < prev.order) return; }
    latest.set(b.flyerId, { ...b, index: i });
  });
  const counted = [];
  for (const b of latest.values()) { if (valid.has(b.choice)) counted.push(b); else spoiled += 1; }
  const base = { spoiled, outsiders, duplicates };
  const quorumMet = counted.length * 10000 >= quorumBps * roll.length;
  if (!quorumMet) return { ...base, decided: false, winner: null, reason: 'no-quorum', quorumMet };
  const counts = Object.fromEntries(options.map((o) => [o, 0]));
  for (const b of counted) if (b.choice !== 'abstain') counts[b.choice] += 1;
  const nonAbstain = counted.filter((b) => b.choice !== 'abstain').length;
  const top = Math.max(0, ...Object.values(counts)); const leaders = options.filter((o) => counts[o] === top);
  if (nonAbstain === 0) return { ...base, decided: false, winner: null, reason: 'no-majority', quorumMet };
  if (leaders.length !== 1) return { ...base, decided: false, winner: null, reason: 'tie', quorumMet };
  if (rule === 'majority' && !(top * 2 > nonAbstain)) return { ...base, decided: false, winner: null, reason: 'no-majority', quorumMet };
  return { ...base, decided: true, winner: leaders[0], reason: null, quorumMet };
}

export default {
  id: 'E-BALLOT-WEIGHTED-01',
  title: 'Ballot room program: weighted votes and a supermajority rule, with no change when neither is used',
  tier: 'offline',
  requires: [],
  hypothesis: 'With no weights the ballot program returns exactly what it returned before; with weights, quorum and the winning share are measured in weight; a supermajority needs its bar (on the bar passes); order does not matter; the outcome still carries no tally; bad weights and thresholds are refused; and the host charges every roll member the same share whatever their weight.',
  limits: ['Offline, on local hosts with a simulated attestation provider and a stubbed account-key check. A weight is supplied by the caller and is public in the request; the contract cannot tell one person from many accounts, so a weight is a share and not a person.'],
  async run(ctx) {
    await ctx.step('the counting rule: unchanged without weights, weighted with them', async (s) => {
      const b = (id, choice, order = 0) => ({ flyerId: id, choice, order });
      const opts = Object.keys(OPTIONS);
      const rnd = rngOf(21); let diffs = 0;
      for (let t = 0; t < 3000; t += 1) {
        const n = 1 + Math.floor(rnd() * 9); const roll = Array.from({ length: n }, (_, i) => `r${i}`);
        const ballots = roll.filter(() => rnd() < 0.8).map((id, i) => ({ flyerId: id, choice: rnd() < 0.15 ? 'abstain' : opts[Math.floor(rnd() * 3)], order: i }));
        for (const rule of ['majority', 'plurality']) for (const quorumBps of [0, 5000, 10000]) {
          if (JSON.stringify(clearBallot({ options: opts, roll, ballots, quorumBps, rule })) !== JSON.stringify(legacyClearBallot({ options: opts, roll, ballots, quorumBps, rule }))) diffs += 1;
        }
      }
      s.assert('without weights the result equals the old code over 3,000 random rounds, both rules, three quorums', diffs === 0, { actual: diffs });
      const W = { 'm1.near': 3 };
      let r = clearBallot({ options: opts, roll: ROLL.slice(0, 3), ballots: [b('m1.near', 'A', 0), b('m2.near', 'B', 1), b('m3.near', 'B', 2)], quorumBps: 0, rule: 'majority', weights: W });
      s.assert('a weight of 3 beats two weights of 1 under majority (3 of 5 is more than half)', r.decided && r.winner === 'A');
      r = clearBallot({ options: opts, roll: ROLL.slice(0, 3), ballots: [b('m2.near', 'B', 0), b('m3.near', 'B', 1)], quorumBps: 5000, rule: 'majority', weights: W });
      s.assert('quorum is measured in weight: two heads of three is only 2 of 5 weight and misses a 50% quorum', !r.decided && r.reason === 'no-quorum');
      r = clearBallot({ options: opts, roll: ROLL.slice(0, 3), ballots: [b('m1.near', 'A', 0)], quorumBps: 5000, rule: 'majority', weights: W });
      s.assert('one head of three with weight 3 of 5 meets a 50% quorum and decides', r.decided && r.winner === 'A' && r.quorumMet);
      const sup = (choices, thresholdBps, weights) => clearBallot({ options: opts, roll: ROLL, ballots: choices.map((c, i) => b(ROLL[i], c, i)), quorumBps: 0, rule: 'supermajority', thresholdBps, weights });
      const w = { 'm1.near': 10, 'm2.near': 10, 'm3.near': 10, 'm4.near': 10, 'm5.near': 10 };
      s.assert('4 of 5 equal weights (80%) passes a two-thirds bar', sup(['A', 'A', 'A', 'A', 'B'], 6667, w).winner === 'A');
      s.assert('3 of 5 (60%) fails a two-thirds bar and says so', (() => { const x = sup(['A', 'A', 'A', 'B', 'B'], 6667, w); return !x.decided && x.reason === 'no-majority'; })());
      s.assert('exactly on the bar passes: 2 of 3 non-abstaining weight at 6,667 bps is 66.67% and passes at 6,666 bps', sup(['A', 'A', 'B', 'abstain', 'abstain'], 6666, w).winner === 'A');
      s.assert('one point under the bar fails: 2 of 3 at 6,667 bps is 66.666...% and fails', sup(['A', 'A', 'B', 'abstain', 'abstain'], 6667, w).decided === false);
      s.assert('a supermajority of 10,000 bps needs every non-abstaining weight', sup(['A', 'A', 'A', 'abstain', 'abstain'], 10000, w).winner === 'A' && sup(['A', 'A', 'B', 'abstain', 'abstain'], 10000, w).decided === false);
      const throws = (fn, re) => { try { fn(); return 'accepted'; } catch (e) { return re.test(e.message) ? true : e.message; } };
      const base = { options: opts, roll: ROLL, ballots: [b('m1.near', 'A')], quorumBps: 0, rule: 'majority' };
      s.assert('a weight of 0 is refused', throws(() => clearBallot({ ...base, weights: { 'm1.near': 0 } }), /weight/) === true);
      s.assert('a negative weight is refused', throws(() => clearBallot({ ...base, weights: { 'm1.near': -2 } }), /weight/) === true);
      s.assert('a fractional weight is refused', throws(() => clearBallot({ ...base, weights: { 'm1.near': 1.5 } }), /weight/) === true);
      s.assert('a weight for someone outside the roll is refused', throws(() => clearBallot({ ...base, weights: { 'outsider.near': 2 } }), /roll/) === true);
      s.assert('a threshold of 5,000 is refused (that is a majority)', throws(() => clearBallot({ ...base, rule: 'supermajority', thresholdBps: 5000 }), /threshold/) === true);
      s.assert('a threshold over 10,000 is refused', throws(() => clearBallot({ ...base, rule: 'supermajority', thresholdBps: 10001 }), /threshold/) === true);
      s.assert('supermajority without a threshold is refused', throws(() => clearBallot({ ...base, rule: 'supermajority' }), /threshold/) === true);
      const bad = []; const rnd2 = rngOf(5);
      for (let t = 0; t < 3000; t += 1) {
        const n = 2 + Math.floor(rnd2() * 8); const roll = Array.from({ length: n }, (_, i) => `r${i}`);
        const weights = Object.fromEntries(roll.map((id) => [id, 1 + Math.floor(rnd2() * 20)]));
        const ballots = roll.filter(() => rnd2() < 0.85).map((id, i) => ({ flyerId: id, choice: rnd2() < 0.15 ? 'abstain' : opts[Math.floor(rnd2() * 3)], order: i }));
        for (const [rule, thresholdBps] of [['majority'], ['plurality'], ['supermajority', 6667], ['supermajority', 9000]]) {
          const q = { options: opts, roll, quorumBps: 5000, rule, thresholdBps, weights };
          const a = clearBallot({ ...q, ballots }); const shuffled = [...ballots].sort(() => rnd2() - 0.5).map((x, i) => ({ ...x, order: i }));
          const c = clearBallot({ ...q, ballots: shuffled });
          const fail = (m) => bad.length < 4 && bad.push(m);
          if (JSON.stringify(a) !== JSON.stringify(c)) fail('depends on ballot order');
          const sums = Object.fromEntries(opts.map((o) => [o, ballots.filter((x) => x.choice === o).reduce((acc, x) => acc + weights[x.flyerId], 0)]));
          const nonAbstain = ballots.filter((x) => x.choice !== 'abstain').reduce((acc, x) => acc + weights[x.flyerId], 0);
          const top = Math.max(...Object.values(sums)); const leaders = opts.filter((o) => sums[o] === top);
          const castWeight = ballots.reduce((acc, x) => acc + weights[x.flyerId], 0); const total = roll.reduce((acc, id) => acc + weights[id], 0);
          if (a.decided && castWeight * 10000 < 5000 * total) fail('decided below the weighted quorum');
          if (a.decided && (leaders.length !== 1 || a.winner !== leaders[0])) fail('decided without a unique weighted leader');
          if (a.decided && rule === 'majority' && !(top * 2 > nonAbstain)) fail('majority decided without more than half the weight');
          if (a.decided && rule === 'supermajority' && top * 10000 < thresholdBps * nonAbstain) fail('supermajority decided under its bar');
          if (['tally', 'counts', 'turnout', 'weights', 'weight'].some((k) => k in a)) fail('the outcome carries a tally, turnout or weight');
        }
      }
      s.assert('no invariant broke in 3,000 random weighted rounds (order-independent, weighted quorum, unique weighted leader, majority and supermajority bars, no tally)', bad.length === 0, { actual: bad });
    });

    await ctx.step('the host: weights and a threshold change the votes, not the charges, and the order hash', async (s) => {
      const mkHost = () => { const r = new HostedRoost({ provider, requireSignedInputs: true, accountKeyCheck: keyCheck }); r.openRound(ROUND); return r; };
      const cast = async (r, id, body, seq = 1) => { const cipherTextHex = sealToModel(JSON.stringify(body), r.intentPublicKey); return r.submitSignedIntent({ flyerId: id, cipherTextHex, publicKey: keys[id].publicKey, signature: signInputWithNearKey(keys[id].secretKey, inputMessage({ ...ROUND, flyerId: id, seq, cipherTextHex })), seq }); };
      const votes = [['m1.near', 'A'], ['m2.near', 'B'], ['m3.near', 'B'], ['m4.near', 'B'], ['m5.near', 'abstain']];
      const run = async (extra) => { const r = mkHost(); for (const [id, c] of votes) await cast(r, id, { choice: c }); return r.runBallot({ options: OPTIONS, roll: ROLL, share: '0.02', quorumBps: 5000, roundId: 'w1', ...extra }); };
      const plain = await run({ rule: 'majority' });
      s.assert('unweighted, B wins 3 of 4 non-abstaining heads', plain.outcome.winner === 'B');
      const weighted = await run({ rule: 'majority', weights: { 'm1.near': 5 } });
      s.assert('with m1 weighted 5, A (5) beats B (3) and wins', weighted.outcome.winner === 'A' && weighted.outcome.recipient === 'ra.near');
      s.assert('the weighted run charges every roll member the same 0.02, voters or not', weighted.charges.length === 5 && weighted.charges.every((c) => BigInt(c.amount) === 20000n * 10n ** 18n));
      const sameWinner = await run({ rule: 'majority', weights: { 'm2.near': 2 } });
      s.assert('weights that leave the winner unchanged still change the order hash (B wins either way)', sameWinner.outcome.winner === 'B' && plain.outcome.winner === 'B' && sameWinner.orderHash !== plain.orderHash);
      s.assert('the published outcome has no weights, tally or turnout', !['tally', 'counts', 'turnout', 'weights'].some((k) => k in weighted.outcome), { actual: Object.keys(weighted.outcome) });
      const bar = await run({ rule: 'supermajority', thresholdBps: 8000 });
      s.assert('B has 3 of 4 (75%) and fails an 80% bar: nothing is decided and nothing is paid', bar.outcome.decided === false && bar.orderHash === null && bar.allocations.length === 0);
      const pass = await run({ rule: 'supermajority', thresholdBps: 7500 });
      s.assert('the same ballots pass a 75% bar exactly and pay the pool to rb.near', pass.outcome.winner === 'B' && pass.allocations[0].recipient === 'rb.near');
      const refused = async (extra, re) => { try { await run(extra); return 'accepted'; } catch (e) { return re.test(e.message) ? true : e.message; } };
      s.assert('the host refuses a weight for an account that is not on the roll', (await refused({ rule: 'majority', weights: { 'x.near': 2 } }, /roll/)) === true);
      s.assert('the host refuses supermajority without a threshold', (await refused({ rule: 'supermajority' }, /threshold/)) === true);
    });
  },
};
