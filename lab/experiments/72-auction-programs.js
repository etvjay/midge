import crypto from 'node:crypto';
import { clearAuction } from '../../src/roost-service/auction-programs.js';
import { HostedRoost, computeAllocationsHash, computeChargesHash, toMicro } from '../../src/roost-service/hosted-roost.js';
import { sealToModel } from '../../src/enclave/e2ee.js';

const provider = { simulated: true, attest: async () => Buffer.from('lab-local-no-hardware'), info: async () => ({}) };
const M = (x) => BigInt(Math.round(x * 1e6));            // NEAR to micro-NEAR for readable test numbers
const bid = (flyerId, price, quantity = 1, order = 0) => ({ flyerId, priceMicro: M(price), quantity, order });
const rngOf = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };

export default {
  id: 'E-AUCTION-PROGRAMS-01',
  title: 'Sealed-bid auction rules the Roost can run: first-price, second-price (Vickrey) and uniform-price, and what the Roost will sign for them',
  tier: 'offline',
  requires: [],
  hypothesis: 'Each format gives the textbook outcome on worked examples and keeps its invariants over thousands of random bid sets: charges sum exactly to the seller\'s proceeds, no member pays more than they bid, the highest bid wins, a uniform auction fills from the top and charges everyone the same price, and the same bids always give the same outcome. Under second-price, bidding your true value is never worse than any other bid (tested against rivals drawn at random); under first-price it is not (a case where shading a bid wins more is found). The Roost signs only the outcome it computed: altered charges, altered allocations, charges on an ordinary aggregate, and a second signature are all refused, and the signed message has the 7-field charged format. Fails if any invariant breaks, if truthful bidding is ever beaten under second-price, or if the Roost signs anything other than its own outcome.',
  limits: [
    'The rules are the standard textbook ones; this tests that the code implements them and that the Roost cannot be made to sign anything else. It does not test that these are the right rules for any real sale.',
    'Bids are not authenticated to a NEAR account: whoever submits a sealed bid names the flyerId. An impersonator could grief another member (GAP-023). The contract still caps any charge at that member\'s deposit and the Roost caps it at the bid.',
    'The strategy tests use random rivals and a grid of alternative bids; they support the theory, they are not a proof.',
    'The Roost is a local HostedRoost with a simulated attestation provider.',
  ],
  async run(ctx) {
    await ctx.step('worked examples, checked by hand', async (s) => {
      const bids = [bid('a', 5, 1, 0), bid('b', 8, 1, 1), bid('c', 6, 1, 2)];
      const fp = clearAuction({ format: 'first-price', bids });
      s.assert('first-price: b (8) wins and pays 8', fp.fills.length === 1 && fp.fills[0].flyerId === 'b' && fp.clearingPriceMicro === M(8) && fp.proceedsMicro === M(8), { actual: fp });
      const sp = clearAuction({ format: 'second-price', bids });
      s.assert('second-price: b (8) wins and pays the second-highest bid, 6', sp.fills[0].flyerId === 'b' && sp.clearingPriceMicro === M(6) && sp.proceedsMicro === M(6), { actual: sp });
      s.assert('second-price with one bid pays the reserve (2), not its own bid', (() => { const r = clearAuction({ format: 'second-price', bids: [bid('a', 9)], reserveMicro: M(2) }); return r.clearingPriceMicro === M(2) && r.proceedsMicro === M(2); })());
      s.assert('a tie goes to the bid that arrived first', clearAuction({ format: 'first-price', bids: [bid('late', 7, 1, 1), bid('early', 7, 1, 0)] }).fills[0].flyerId === 'early');
      s.assert('bids under the reserve are ignored, and with none above it nothing is sold', (() => { const r = clearAuction({ format: 'first-price', bids: [bid('a', 1), bid('b', 2)], reserveMicro: M(3) }); return r.sold === false && r.proceedsMicro === 0n && r.charges.length === 0; })());
      // uniform: 10 units. a: 4 @ 9, b: 5 @ 7, c: 3 @ 6, d: 2 @ 4
      const ub = [bid('a', 9, 4, 0), bid('b', 7, 5, 1), bid('c', 6, 3, 2), bid('d', 4, 2, 3)];
      const u = clearAuction({ format: 'uniform', bids: ub, lotUnits: 10 });
      s.assert('uniform: a gets 4, b gets 5, c gets the last 1 unit; d gets nothing', JSON.stringify(u.fills.map((f) => [f.flyerId, f.units])) === JSON.stringify([['a', 4], ['b', 5], ['c', 1]]), { actual: u.fills });
      s.assert('uniform: oversubscribed, so everyone pays the marginal bid, c\'s 6 per unit; proceeds 10 x 6', u.clearingPriceMicro === M(6) && u.proceedsMicro === M(60) && u.fills.every((f) => f.priceMicro === M(6)), { actual: u });
      const under = clearAuction({ format: 'uniform', bids: [bid('a', 9, 4), bid('b', 7, 3)], lotUnits: 10, reserveMicro: M(2) });
      s.assert('uniform: undersubscribed (7 of 10 units wanted), the clearing price is the reserve, 2', under.clearingPriceMicro === M(2) && under.unitsSold === 7 && under.proceedsMicro === M(14), { actual: under });
    });

    await ctx.step('invariants over 4,000 random bid sets', async (s) => {
      const rnd = rngOf(20261105); let broken = []; let trials = 0;
      for (let t = 0; t < 4000; t += 1) {
        const n = 1 + Math.floor(rnd() * 9); const lot = 1 + Math.floor(rnd() * 12); const reserve = Math.floor(rnd() * 3);
        const bids = Array.from({ length: n }, (_, i) => bid(`m${i}`, 1 + Math.floor(rnd() * 20) / 2, 1 + Math.floor(rnd() * 6), i));
        for (const format of ['first-price', 'second-price', 'uniform']) {
          trials += 1;
          const r = clearAuction({ format, bids, lotUnits: lot, reserveMicro: M(reserve) });
          const again = clearAuction({ format, bids, lotUnits: lot, reserveMicro: M(reserve) });
          const fail = (why) => broken.length < 5 && broken.push({ format, why, bids: bids.map((b) => [b.flyerId, Number(b.priceMicro) / 1e6, b.quantity]), lot, reserve });
          if (JSON.stringify(r, (k, v) => (typeof v === 'bigint' ? String(v) : v)) !== JSON.stringify(again, (k, v) => (typeof v === 'bigint' ? String(v) : v))) fail('not deterministic');
          if (!r.sold) { if (bids.some((b) => b.priceMicro >= M(reserve) && b.priceMicro > 0n)) fail('nothing sold although a bid met the reserve'); continue; }
          if (r.charges.reduce((a, c) => a + c.payMicro, 0n) !== r.proceedsMicro) fail('charges do not sum to proceeds');
          for (const f of r.fills) { const b = bids.find((x) => x.flyerId === f.flyerId); if (f.payMicro > b.priceMicro * BigInt(f.units)) fail(`${f.flyerId} pays more than they bid`); if (f.units > b.quantity && format === 'uniform') fail('filled above the quantity asked'); }
          if (r.clearingPriceMicro < M(reserve)) fail('clearing price below the reserve');
          if (r.fills.some((f) => f.priceMicro !== r.clearingPriceMicro)) fail('not everyone pays one price');
          const top = [...bids].filter((b) => b.priceMicro >= M(reserve)).sort((a, b) => (a.priceMicro > b.priceMicro ? -1 : a.priceMicro < b.priceMicro ? 1 : a.order - b.order))[0];
          if (format !== 'uniform' && r.fills[0].flyerId !== top.flyerId) fail('the highest bid did not win');
          if (format === 'second-price') { const rest = [...bids].filter((b) => b.flyerId !== top.flyerId && b.priceMicro >= M(reserve)).sort((a, b) => (a.priceMicro > b.priceMicro ? -1 : 1))[0]; const want = rest ? rest.priceMicro : M(reserve); if (r.clearingPriceMicro !== want) fail('did not pay the second price'); }
          if (format === 'uniform') {
            if (r.unitsSold > lot) fail('sold more units than the lot');
            const filledIds = new Set(r.fills.map((f) => f.flyerId));
            const lowestFilled = Math.min(...r.fills.map((f) => Number(bids.find((b) => b.flyerId === f.flyerId).priceMicro)));
            if (bids.some((b) => !filledIds.has(b.flyerId) && Number(b.priceMicro) > lowestFilled && b.priceMicro >= M(reserve))) fail('a higher bid was left unfilled while a lower one was filled');
            if (r.clearingPriceMicro > BigInt(lowestFilled)) fail('clearing price above a filled bid');
          }
        }
      }
      s.observe('bid sets x formats checked', trials);
      s.assert('no invariant broke in any trial', broken.length === 0, { actual: broken });
    });

    await ctx.step('second-price: telling the truth is never beaten; first-price: it is', async (s) => {
      const rnd = rngOf(77); let beaten = 0; let tested = 0; let worstGain = 0n;
      for (let t = 0; t < 2000; t += 1) {
        const value = 1 + Math.floor(rnd() * 20); const rivals = Array.from({ length: 1 + Math.floor(rnd() * 5) }, (_, i) => bid(`r${i}`, 0.5 + Math.floor(rnd() * 40) / 2, 1, i + 1));
        const truthful = clearAuction({ format: 'second-price', bids: [bid('me', value, 1, 0), ...rivals] }).fills.find((x) => x.flyerId === 'me');
        const uTruth = truthful ? M(value) - truthful.payMicro : 0n;
        for (let dev = 0; dev <= 24; dev += 1) {
          const b = dev * 1; tested += 1;
          const r = clearAuction({ format: 'second-price', bids: [bid('me', b || 0.5, 1, 0), ...rivals] }).fills.find((x) => x.flyerId === 'me');
          const u = r ? M(value) - r.payMicro : 0n;
          if (u > uTruth) { beaten += 1; if (u - uTruth > worstGain) worstGain = u - uTruth; }
        }
      }
      s.observe('second-price deviations tested', tested);
      s.assert('under second-price no deviation from the true value ever did better', beaten === 0, { actual: { beaten, worstGain: String(worstGain) } });
      // first-price: you value it at 10, a rival bids 6; bidding 10 earns 0, bidding 6.5 earns 3.5
      const fpTruth = clearAuction({ format: 'first-price', bids: [bid('me', 10, 1, 0), bid('r', 6, 1, 1)] }).fills[0];
      const fpShade = clearAuction({ format: 'first-price', bids: [bid('me', 6.5, 1, 0), bid('r', 6, 1, 1)] }).fills[0];
      s.assert('under first-price, bidding the true value (10) against a rival at 6 earns 0, while shading to 6.5 wins the same lot and earns 3.5', fpTruth.flyerId === 'me' && M(10) - fpTruth.payMicro === 0n && fpShade.flyerId === 'me' && M(10) - fpShade.payMicro === M(3.5));
    });

    await ctx.step('the Roost signs only the outcome it computed', async (s) => {
      const seal = (roost, flyerId, price, quantity) => roost.submitSealedIntent({ flyerId, cipherTextHex: sealToModel(JSON.stringify({ price, quantity }), roost.intentPublicKey) });
      const fresh = (format, lot = 10) => { const r = new HostedRoost({ provider }); for (const [id, p, q] of [['a.near', '9', 4], ['b.near', '7', 5], ['c.near', '6', 3], ['d.near', '4', 2]]) seal(r, id, p, q); return { r, out: r.runAuction({ format, lotUnits: lot, reserve: '0', seller: 'seller.near', roundId: 'x' }) }; };
      const ctxArgs = { contractId: 'c.near', syndicateId: 'syn', epoch: 1, roundNonce: 'ab'.repeat(32) };
      const sign = (r, out, o = {}) => r.signSettlement({ ...ctxArgs, allocations: out.allocations, orderHash: out.orderHash, charges: out.charges, ...o });
      const refused = (fn, re) => { try { fn(); return 'signed'; } catch (e) { return re.test(e.message) ? true : e.message; } };

      const { r, out } = fresh('uniform');
      s.observe('the published outcome', out.outcome);
      s.assert('the Roost reports clearing price 6 and proceeds 60, and charges a 24, b 30, c 6 NEAR', out.outcome.clearingPrice === '6' && out.outcome.proceeds === '60' && out.charges.map((c) => `${c.member}:${BigInt(c.amount) / 10n ** 18n / 10n ** 6n}`).join() === 'a.near:24,b.near:30,c.near:6', { actual: out });
      s.assert('the published outcome never contains the losing bid d, or any bid above what the winners pay', !JSON.stringify(out.outcome).includes('d.near'));
      const bad1 = fresh('uniform'); const alt = bad1.out.charges.map((c) => ({ ...c })); alt[0].amount = String(BigInt(alt[0].amount) + 1n);
      s.assert('altered charges (one yocto more on a) are refused', refused(() => sign(bad1.r, bad1.out, { charges: alt }), /charges do not match/) === true);
      const bad2 = fresh('uniform'); const swapped = bad2.out.charges.map((c, i, a) => ({ member: c.member, amount: a[(i + 1) % a.length].amount }));
      s.assert('charges swapped between members are refused', refused(() => sign(bad2.r, bad2.out, { charges: swapped }), /charges do not match/) === true);
      const bad3 = fresh('uniform');
      s.assert('altered allocations (the seller paid one yocto more) are refused', refused(() => sign(bad3.r, bad3.out, { allocations: [{ recipient: 'seller.near', amount: String(BigInt(bad3.out.allocations[0].amount) + 1n) }] }), /allocations do not match/) === true);
      const bad4 = fresh('uniform');
      s.assert('an auction outcome cannot be settled without its charges', refused(() => bad4.r.signSettlement({ ...ctxArgs, allocations: bad4.out.allocations, orderHash: bad4.out.orderHash }), /only be settled with its charges/) === true);
      const plain = new HostedRoost({ provider }); plain.submitSealedIntent({ flyerId: 'a.near', cipherTextHex: sealToModel(JSON.stringify({ amount: '1' }), plain.intentPublicKey) }); const agg = plain.aggregateAndClear({ roundId: 'p' });
      s.assert('charges cannot be signed for an ordinary aggregate', refused(() => plain.signSettlement({ ...ctxArgs, allocations: [{ recipient: 'x.near', amount: '1' }], orderHash: agg.orderHash, charges: [{ member: 'a.near', amount: '1' }] }), /only be signed for an auction outcome/) === true);
      const signed = sign(r, out);
      const parts = signed.message.split(':');
      s.assert('the signed message has the 7-field charged format ending in the order hash', parts.length === 7 && parts[5] === computeChargesHash(out.charges) && parts[6] === out.orderHash && parts[4] === computeAllocationsHash(out.allocations), { actual: signed.message });
      const pub = crypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(r.settlePublicKey, 'hex')]), format: 'der', type: 'spki' });
      s.assert('the signature verifies under the Roost\'s attested settlement key', crypto.verify(null, Buffer.from(signed.message), pub, Buffer.from(signed.signature, 'hex')));
      s.assert('a second signature for the same outcome is refused', refused(() => sign(r, out), /already been signed/) === true);
      // cross-language vector: the same charges must hash to the same value in the contract (asserted in unit_tests.rs)
      const vec = computeChargesHash([{ member: 'b.near', amount: '4000000000000000000000000' }, { member: 'a.near', amount: '2000000000000000000000000' }]);
      s.observe('charges hash vector (also asserted in the contract tests)', vec);
      s.assert('the charges hash equals the value the contract\'s own compute_charges_hash gives for the same charges (asserted in contracts/fly-coordinator/tests/unit_tests.rs)', vec === '277962d41d643c5f0b7aaf5616124070cdb5f906d57e7a5ab0f6906f9c7e8be9', { actual: vec });
      const first = fresh('first-price', 1); s.assert('a first-price outcome is a single winner and one charge equal to the proceeds', first.out.outcome.fills.length === 1 && first.out.charges.length === 1 && first.out.charges[0].amount === first.out.allocations[0].amount);
    });
  },
};
