import { clearPool } from '../../src/roost-service/pool-program.js';
import { HostedRoost } from '../../src/roost-service/hosted-roost.js';
import { sealToModel } from '../../src/enclave/e2ee.js';

const provider = { simulated: true, attest: async () => Buffer.from('lab-local-no-hardware'), info: async () => ({}) };
const M = (x) => BigInt(Math.round(x * 1e6));
const rngOf = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };

export default {
  id: 'E-POOL-PROGRAM-01',
  title: 'The pooled room program: each member charged exactly their own sealed amount, and the Roost signs only that',
  tier: 'offline',
  requires: [],
  hypothesis: 'The pooled program totals the sealed amounts exactly and charges each member exactly their own amount: charges sum to the total, a minimum and a cap leave out the right amounts in arrival order, and the same amounts always give the same result. The Roost signs a pool outcome only with exactly its own charges and allocations, in the charged 7-field message, and never twice. Fails if any amount is mis-charged or the Roost signs anything else.',
  limits: ['Pure-function and signing tests on a local Roost with a simulated attestation provider. Bids are not authenticated to an account (GAP-023).'],
  async run(ctx) {
    await ctx.step('worked examples and 3,000 random rounds', async (s) => {
      const r = clearPool({ bids: [{ flyerId: 'a', amountMicro: M(0.01), order: 0 }, { flyerId: 'b', amountMicro: M(0.02), order: 1 }, { flyerId: 'c', amountMicro: M(0.03), order: 2 }, { flyerId: 'd', amountMicro: M(0.04), order: 3 }] });
      s.assert('0.01 + 0.02 + 0.03 + 0.04 = 0.10, each charged their own', r.totalMicro === M(0.10) && r.contributions.map((c) => `${c.flyerId}:${c.amountMicro}`).join() === 'a:10000,b:20000,c:30000,d:40000');
      const capped = clearPool({ bids: [{ flyerId: 'a', amountMicro: M(0.04), order: 0 }, { flyerId: 'b', amountMicro: M(0.04), order: 1 }, { flyerId: 'c', amountMicro: M(0.04), order: 2 }], capMicro: M(0.09) });
      s.assert('with a 0.09 cap, the third 0.04 (last to arrive) is left out and the total is 0.08', capped.totalMicro === M(0.08) && capped.leftOut.join() === 'c');
      const mn = clearPool({ bids: [{ flyerId: 'a', amountMicro: M(0.005), order: 0 }, { flyerId: 'b', amountMicro: M(0.02), order: 1 }], minMicro: M(0.01) });
      s.assert('an amount under the minimum is left out', mn.contributions.length === 1 && mn.leftOut.join() === 'a');
      s.assert('nothing at all is left to sell when every amount is out', clearPool({ bids: [{ flyerId: 'a', amountMicro: 0n, order: 0 }] }).sold === false);
      const rnd = rngOf(11); const bad = [];
      for (let t = 0; t < 3000; t += 1) {
        const n = 1 + Math.floor(rnd() * 10); const bids = Array.from({ length: n }, (_, i) => ({ flyerId: `m${i}`, amountMicro: BigInt(Math.floor(rnd() * 90_000)), order: i }));
        const cap = rnd() < 0.5 ? BigInt(Math.floor(rnd() * 400_000)) : null; const min = BigInt(Math.floor(rnd() * 5_000));
        const a = clearPool({ bids, minMicro: min, capMicro: cap }); const b = clearPool({ bids, minMicro: min, capMicro: cap });
        const sum = a.contributions.reduce((x, c) => x + c.amountMicro, 0n);
        const fail = (why) => bad.length < 4 && bad.push(why);
        if (sum !== a.totalMicro) fail('charges do not sum to the total');
        if (cap !== null && a.totalMicro > cap) fail('total above the cap');
        if (a.contributions.some((c) => c.amountMicro < min || c.amountMicro !== bids.find((x) => x.flyerId === c.flyerId).amountMicro)) fail('an amount was changed or below the minimum');
        if (JSON.stringify(a, (k, v) => (typeof v === 'bigint' ? String(v) : v)) !== JSON.stringify(b, (k, v) => (typeof v === 'bigint' ? String(v) : v))) fail('not deterministic');
        if (a.contributions.length + a.leftOut.length !== n) fail('a member is neither taken nor left out');
      }
      s.assert('no invariant broke in 3,000 random rounds', bad.length === 0, { actual: bad });
    });

    await ctx.step('the Roost signs only the pool outcome it computed', async (s) => {
      const fresh = () => { const r = new HostedRoost({ provider }); for (const [id, a] of [['a.near', '0.01'], ['b.near', '0.02'], ['c.near', '0.03'], ['d.near', '0.04']]) r.submitSealedIntent({ flyerId: id, cipherTextHex: sealToModel(JSON.stringify({ amount: a }), r.intentPublicKey) }); return { r, out: r.runPool({ recipient: 'r.near', roundId: 'p' }) }; };
      const args = { contractId: 'c.near', syndicateId: 'syn', epoch: 1, roundNonce: 'ab'.repeat(32) };
      const refused = (fn, re) => { try { fn(); return 'signed'; } catch (e) { return re.test(e.message) ? true : e.message; } };
      const { r, out } = fresh();
      s.assert('the Roost reports total 0.1 and charges a 0.01, b 0.02, c 0.03, d 0.04', out.outcome.total === '0.1' && out.charges.map((c) => `${c.member}:${BigInt(c.amount) / 10n ** 18n}`).join() === 'a.near:10000,b.near:20000,c.near:30000,d.near:40000', { actual: out });
      const alt = fresh(); const tampered = alt.out.charges.map((c) => ({ ...c })); tampered[0].amount = String(BigInt(tampered[0].amount) + 1n);
      s.assert('a charge raised by one yocto is refused', refused(() => alt.r.signSettlement({ ...args, allocations: alt.out.allocations, orderHash: alt.out.orderHash, charges: tampered }), /charges do not match/) === true);
      const swap = fresh(); const sw = swap.out.charges.map((c, i, a) => ({ member: c.member, amount: a[(i + 1) % a.length].amount }));
      s.assert('charges swapped between members are refused', refused(() => swap.r.signSettlement({ ...args, allocations: swap.out.allocations, orderHash: swap.out.orderHash, charges: sw }), /charges do not match/) === true);
      const nochg = fresh();
      s.assert('a pool outcome cannot be settled without its charges', refused(() => nochg.r.signSettlement({ ...args, allocations: nochg.out.allocations, orderHash: nochg.out.orderHash }), /only be settled with its charges/) === true);
      const signed = r.signSettlement({ ...args, allocations: out.allocations, orderHash: out.orderHash, charges: out.charges });
      s.assert('the signed message has 7 fields', signed.message.split(':').length === 7);
      s.assert('a second signature is refused', refused(() => r.signSettlement({ ...args, allocations: out.allocations, orderHash: out.orderHash, charges: out.charges }), /already been signed/) === true);
      const e = new HostedRoost({ provider });
      s.assert('an empty round is refused', refused(() => e.runPool({ recipient: 'r.near' }), /empty/) === true);
      const colon = new HostedRoost({ provider }); colon.submitSealedIntent({ flyerId: 'a.near', cipherTextHex: sealToModel(JSON.stringify({ amount: '1' }), colon.intentPublicKey) });
      s.assert('a recipient with a colon is refused', refused(() => colon.runPool({ recipient: 'a:b' }), /plain account id/) === true);
    });
  },
};
