import { clearPool } from '../../src/roost-service/pool-program.js';
import { HostedRoost } from '../../src/roost-service/hosted-roost.js';
import { sealToModel } from '../../src/enclave/e2ee.js';

const provider = { simulated: true, attest: async () => Buffer.from('lab-local-no-hardware'), info: async () => ({}) };
const M = (x) => BigInt(Math.round(x * 1e6));
const rngOf = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
const byId = (r) => JSON.stringify(r.contributions.map((c) => [c.flyerId, String(c.amountMicro)]).sort());

export default {
  id: 'E-POOL-PRORATA-01',
  title: 'Pool room program: pro-rata scaling when oversubscribed, so arrival order stops deciding who is shut out',
  tier: 'offline',
  requires: [],
  hypothesis: 'In pro-rata mode a pool at or under its cap takes every bid in full; over the cap every bid is scaled by the same ratio (rounded down), the total never passes the cap and is within one micro-NEAR per member of it, no contribution exceeds its bid, the result does not depend on arrival order, and the host charges each member exactly their scaled amount. First-come mode is unchanged.',
  limits: ['Pure-function and signing tests on a local Roost with a simulated attestation provider. Bids are not authenticated to an account here (the unsigned host). Charges are public at settlement, so pro-rata hides nothing extra.'],
  async run(ctx) {
    await ctx.step('the rule: worked examples and 3,000 random rounds', async (s) => {
      const bids = [['a', 0.04], ['b', 0.04], ['c', 0.04]].map(([id, v], i) => ({ flyerId: id, amountMicro: M(v), order: i }));
      const first = clearPool({ bids, capMicro: M(0.09) });
      s.assert('first-come still leaves out the last to arrive (unchanged)', first.leftOut.join() === 'c' && first.totalMicro === M(0.08));
      const pr = clearPool({ bids, capMicro: M(0.09), mode: 'pro-rata' });
      s.assert('pro-rata scales all three to 0.03 each and takes the full cap', pr.totalMicro === M(0.09) && pr.contributions.every((c) => c.amountMicro === M(0.03)) && pr.leftOut.length === 0);
      s.assert('the same three bids with the order reversed give the same contributions in pro-rata mode', byId(clearPool({ bids: [...bids].reverse().map((b, i) => ({ ...b, order: i })), capMicro: M(0.09), mode: 'pro-rata' })) === byId(pr));
      s.assert('and a different result in first-come mode (the last to arrive changes)', clearPool({ bids: [...bids].reverse().map((b, i) => ({ ...b, order: i })), capMicro: M(0.09) }).leftOut.join() !== first.leftOut.join());
      const under = clearPool({ bids, capMicro: M(0.20), mode: 'pro-rata' });
      s.assert('under the cap every bid is taken in full', under.totalMicro === M(0.12) && under.contributions.every((c) => c.amountMicro === M(0.04)));
      const odd = clearPool({ bids: [{ flyerId: 'a', amountMicro: 10n, order: 0 }, { flyerId: 'b', amountMicro: 10n, order: 1 }, { flyerId: 'c', amountMicro: 10n, order: 2 }], capMicro: 10n, mode: 'pro-rata' });
      s.assert('rounding is down: three bids of 10 over a cap of 10 give 3, 3 and 3 (total 9, never 10 plus a bit)', odd.contributions.map((c) => c.amountMicro).join() === '3,3,3' && odd.totalMicro === 9n);
      const tiny = clearPool({ bids: [{ flyerId: 'big', amountMicro: 1_000_000n, order: 0 }, { flyerId: 'dust', amountMicro: 1n, order: 1 }], capMicro: 500_000n, mode: 'pro-rata' });
      s.assert('a bid that scales to zero is left out and reported', tiny.leftOut.join() === 'dust' && tiny.contributions.length === 1);
      const mn = clearPool({ bids: [{ flyerId: 'a', amountMicro: M(0.005), order: 0 }, { flyerId: 'b', amountMicro: M(0.04), order: 1 }, { flyerId: 'c', amountMicro: M(0.04), order: 2 }], minMicro: M(0.01), capMicro: M(0.04), mode: 'pro-rata' });
      s.assert('the minimum applies to the bid as sent, before scaling: a is out, b and c are scaled to 0.02', mn.leftOut.join() === 'a' && mn.contributions.every((c) => c.amountMicro === M(0.02)));
      let refusal = 'accepted'; try { clearPool({ bids, mode: 'pro-rata' }); } catch (e) { refusal = /cap/.test(e.message); }
      s.assert('pro-rata without a cap is refused', refusal === true, { actual: refusal });
      let unknown = 'accepted'; try { clearPool({ bids, capMicro: 1n, mode: 'proportional' }); } catch (e) { unknown = /mode/.test(e.message); }
      s.assert('an unknown mode is refused', unknown === true, { actual: unknown });
      const rnd = rngOf(31); const bad = [];
      for (let t = 0; t < 3000; t += 1) {
        const n = 1 + Math.floor(rnd() * 10); const bidsR = Array.from({ length: n }, (_, i) => ({ flyerId: `m${i}`, amountMicro: BigInt(Math.floor(rnd() * 90_000)), order: i }));
        const cap = BigInt(1 + Math.floor(rnd() * 400_000)); const min = BigInt(Math.floor(rnd() * 5_000));
        const a = clearPool({ bids: bidsR, minMicro: min, capMicro: cap, mode: 'pro-rata' });
        const shuffled = [...bidsR].sort(() => rnd() - 0.5).map((x, i) => ({ ...x, order: i }));
        const c = clearPool({ bids: shuffled, minMicro: min, capMicro: cap, mode: 'pro-rata' });
        const fail = (m) => bad.length < 4 && bad.push(m);
        const sum = a.contributions.reduce((x, k) => x + k.amountMicro, 0n);
        const eligible = bidsR.filter((x) => x.amountMicro > 0n && x.amountMicro >= min);
        const eligibleSum = eligible.reduce((x, k) => x + k.amountMicro, 0n);
        if (sum !== a.totalMicro) fail('contributions do not sum to the total');
        if (a.totalMicro > cap) fail('total above the cap');
        if (a.contributions.some((k) => k.amountMicro > bidsR.find((x) => x.flyerId === k.flyerId).amountMicro)) fail('a contribution exceeds its bid');
        if (eligibleSum <= cap && a.totalMicro !== eligibleSum) fail('under the cap but not every bid was taken in full');
        if (eligibleSum > cap && cap - a.totalMicro > BigInt(eligible.length)) fail('over the cap but the total is more than one micro per member short of it');
        if (byId(a) !== byId(c)) fail('the result depends on arrival order');
        if (a.contributions.length + a.leftOut.length !== n) fail('a member is neither taken nor left out');
      }
      s.assert('no invariant broke in 3,000 random rounds (cap, rounding down, order-independent, nothing exceeds its bid, full when under the cap)', bad.length === 0, { actual: bad });
    });

    await ctx.step('the host: each member is charged exactly their scaled amount, and the Roost signs only that', async (s) => {
      const fresh = (extra) => { const r = new HostedRoost({ provider }); for (const [id, a] of [['a.near', '0.04'], ['b.near', '0.04'], ['c.near', '0.04']]) r.submitSealedIntent({ flyerId: id, cipherTextHex: sealToModel(JSON.stringify({ amount: a }), r.intentPublicKey) }); return { r, out: r.runPool({ recipient: 'r.near', roundId: 'p', cap: '0.09', ...extra }) }; };
      const args = { contractId: 'c.near', syndicateId: 'syn', epoch: 1, roundNonce: 'ab'.repeat(32) };
      const refused = (fn, re) => { try { fn(); return 'signed'; } catch (e) { return re.test(e.message) ? true : e.message; } };
      const { r, out } = fresh({ mode: 'pro-rata' });
      const yocto = (c) => BigInt(c.amount) / 10n ** 18n;
      s.assert('each of the three is charged 0.03 and the recipient receives 0.09', out.charges.length === 3 && out.charges.every((c) => yocto(c) === 30000n) && BigInt(out.allocations[0].amount) / 10n ** 18n === 90000n, { actual: out.charges });
      s.assert('the outcome says pro-rata and reports nobody left out', out.outcome.mode === 'pro-rata' && out.outcome.leftOut.length === 0, { actual: out.outcome });
      const fc = fresh({});
      s.assert('first-come mode on the same bids still leaves the third out', fc.out.outcome.leftOut.join() === 'c.near' && fc.out.charges.length === 2);
      s.assert('the order hash differs between the two modes on the same bids', out.orderHash !== fc.out.orderHash);
      const alt = fresh({ mode: 'pro-rata' }); const raised = alt.out.charges.map((c, i) => (i === 0 ? { ...c, amount: String(BigInt(c.amount) + 1n) } : c));
      s.assert('a charge raised by one yocto is refused', refused(() => alt.r.signSettlement({ ...args, allocations: alt.out.allocations, orderHash: alt.out.orderHash, charges: raised }), /charges do not match/) === true);
      const full = fresh({ mode: 'pro-rata' }); const unscaled = full.out.charges.map((c) => ({ ...c, amount: String(40000n * 10n ** 18n) }));
      s.assert('charging the unscaled bids (0.04 each) is refused', refused(() => full.r.signSettlement({ ...args, allocations: full.out.allocations, orderHash: full.out.orderHash, charges: unscaled }), /charges do not match|allocations do not match/) === true);
      s.assert('the honest outcome signs', typeof r.signSettlement({ ...args, allocations: out.allocations, orderHash: out.orderHash, charges: out.charges }).signature === 'string');
      let noCap = 'accepted'; try { const x = new HostedRoost({ provider }); x.submitSealedIntent({ flyerId: 'a.near', cipherTextHex: sealToModel(JSON.stringify({ amount: '1' }), x.intentPublicKey) }); x.runPool({ recipient: 'r.near', mode: 'pro-rata' }); } catch (e) { noCap = /cap/.test(e.message); }
      s.assert('the host refuses pro-rata without a cap', noCap === true, { actual: noCap });
    });
  },
};
