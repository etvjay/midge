import { clearBestQuote, clearCross } from '../../src/roost-service/quote-programs.js';
import { HostedRoost } from '../../src/roost-service/hosted-roost.js';
import { sealToModel } from '../../src/enclave/e2ee.js';

const provider = { simulated: true, attest: async () => Buffer.from('lab-local-no-hardware'), info: async () => ({}) };
const M = (x) => BigInt(Math.round(x * 1e6));
const rngOf = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
const NEAR = 10n ** 24n; // yoctoNEAR per NEAR
const ROUND = { contractId: 'c.near', syndicateId: 'syn', epoch: 1, roundNonce: 'ab'.repeat(32) };

export default {
  id: 'E-QUOTE-PROGRAMS-01',
  title: 'Best-quote (lending, RFQ) and cross (block trade) room programs: right winners, conserved cash, signed only as computed',
  tier: 'offline',
  requires: [],
  hypothesis: 'The best-quote program picks the lowest eligible quote (ties to the fixed order) and prices it first- or second-price; an ineligible quote never wins. The cross program crosses eligible buyers and sellers at the reference price: matched units are the smaller side\'s total, no fill exceeds its order, the more aggressive limit fills first, and buyers\' cash equals sellers\' cash. The same inputs give the same outcome whatever the arrival order in two-host mode. The Roost signs only the outcome it computed, once, with its charges. Fails if any of these breaks.',
  limits: ['Offline, on local hosts with a simulated attestation provider. Only the cash leg is modelled: no repayment, collateral or asset delivery. The reference price is an input, not verified.'],
  async run(ctx) {
    await ctx.step('best quote: worked examples and 3,000 random rounds', async (s) => {
      const q = (id, v, order) => ({ flyerId: id, valueMicro: BigInt(v), order });
      let r = clearBestQuote({ direction: 'lowest', quotes: [q('a', 450, 0), q('b', 400, 1), q('c', 500, 2), q('d', 600, 3)], limitMicro: 700n });
      s.assert('lowest rate wins and is paid its own rate (first-price)', r.winner === 'b' && r.priceMicro === 400n && r.runnerUpMicro === 450n);
      r = clearBestQuote({ direction: 'lowest', quotes: [q('a', 450, 0), q('b', 400, 1)], limitMicro: 700n, pricing: 'second' });
      s.assert('second-price pays the runner-up\'s rate', r.winner === 'b' && r.priceMicro === 450n);
      s.assert('a lone eligible quote is paid its own under second-price', clearBestQuote({ direction: 'lowest', quotes: [q('a', 450, 0), q('b', 900, 1)], limitMicro: 700n, pricing: 'second' }).priceMicro === 450n);
      s.assert('a quote above the limit never wins', clearBestQuote({ direction: 'lowest', quotes: [q('a', 800, 0)], limitMicro: 700n }).won === false);
      s.assert('a tie goes to the earlier order', clearBestQuote({ direction: 'lowest', quotes: [q('late', 400, 5), q('early', 400, 2)], limitMicro: 700n }).winner === 'early');
      const rnd = rngOf(5); const bad = [];
      for (let t = 0; t < 3000; t += 1) {
        const n = 1 + Math.floor(rnd() * 8); const quotes = Array.from({ length: n }, (_, i) => q(`m${i}`, Math.floor(rnd() * 1000), i)); const limit = BigInt(Math.floor(rnd() * 1000));
        for (const pricing of ['first', 'second']) {
          const a = clearBestQuote({ direction: 'lowest', quotes, limitMicro: limit, pricing }); const b = clearBestQuote({ direction: 'lowest', quotes: [...quotes].reverse().map((x, i) => ({ ...x })), limitMicro: limit, pricing });
          const elig = quotes.filter((x) => x.valueMicro <= limit); const fail = (w) => bad.length < 4 && bad.push(w);
          if (a.quotesEligible !== elig.length) fail('eligible count');
          if (a.won && (a.winnerQuoteMicro > limit || elig.some((x) => x.valueMicro < a.winnerQuoteMicro))) fail('winner is not the lowest eligible');
          if (a.won && (a.priceMicro < a.winnerQuoteMicro || a.priceMicro > limit)) fail('price outside [winner quote, limit]');
          if (a.won && b.won && a.winnerQuoteMicro !== b.winnerQuoteMicro) fail('winning value depends on arrival order');
        }
      }
      s.assert('no invariant broke in 3,000 random rounds (winner is the lowest eligible, price within bounds, value independent of order)', bad.length === 0, { actual: bad });
    });

    await ctx.step('cross: worked example and 3,000 random rounds', async (s) => {
      const o = (id, units, limit, order) => ({ flyerId: id, units, limitMicro: M(limit), order });
      const r = clearCross({ buys: [o('b1', 100, 1.1, 0), o('b2', 50, 1.05, 1)], sells: [o('s1', 80, 0.95, 2), o('s2', 90, 1.0, 3)], referenceMicro: M(1.0) });
      s.assert('150 buy units meet 170 sell units: 150 match at the reference', r.matchedUnits === 150n);
      s.assert('buyers fill in full (100 and 50) and pay 1.0 each', r.buyFills.map((f) => `${f.flyerId}:${f.units}:${f.cashMicro}`).join() === `b1:100:${M(100)},b2:50:${M(50)}`);
      s.assert('the more aggressive seller (limit 0.95) fills first: 80, then 70 of the 90', r.sellFills.map((f) => `${f.flyerId}:${f.units}`).join() === 's1:80,s2:70');
      s.assert('a buyer below the reference does not take part', clearCross({ buys: [o('b', 10, 0.9, 0)], sells: [o('s', 10, 0.8, 1)], referenceMicro: M(1.0) }).matchedUnits === 0n);
      s.assert('a seller above the reference does not take part', clearCross({ buys: [o('b', 10, 1.2, 0)], sells: [o('s', 10, 1.1, 1)], referenceMicro: M(1.0) }).matchedUnits === 0n);
      const rnd = rngOf(9); const bad = [];
      for (let t = 0; t < 3000; t += 1) {
        const nb = Math.floor(rnd() * 6); const ns = Math.floor(rnd() * 6); const ref = M(0.5 + rnd());
        const buys = Array.from({ length: nb }, (_, i) => o(`b${i}`, 1 + Math.floor(rnd() * 200), 0.3 + rnd() * 1.5, i)); const sells = Array.from({ length: ns }, (_, i) => o(`s${i}`, 1 + Math.floor(rnd() * 200), 0.3 + rnd() * 1.5, 100 + i));
        const a = clearCross({ buys, sells, referenceMicro: ref }); const b = clearCross({ buys, sells, referenceMicro: ref });
        const fail = (w) => bad.length < 4 && bad.push(w);
        const sum = (l, k) => l.reduce((x, f) => x + f[k], 0n);
        if (sum(a.buyFills, 'units') !== a.matchedUnits || sum(a.sellFills, 'units') !== a.matchedUnits) fail('fills do not sum to matched units');
        if (sum(a.buyFills, 'cashMicro') !== sum(a.sellFills, 'cashMicro') || sum(a.buyFills, 'cashMicro') !== a.matchedUnits * ref) fail('cash is not conserved');
        for (const f of [...a.buyFills, ...a.sellFills]) if (f.units > f.ordered || f.units < 1n) fail('fill outside its order');
        for (const f of a.buyFills) if (f.limitMicro < ref) fail('a buyer below the reference was filled');
        for (const f of a.sellFills) if (f.limitMicro > ref) fail('a seller above the reference was filled');
        const eligB = buys.filter((x) => x.limitMicro >= ref).sort((x, y) => (x.limitMicro !== y.limitMicro ? (x.limitMicro > y.limitMicro ? -1 : 1) : x.order - y.order));
        let partial = false; for (const x of eligB) { const f = a.buyFills.find((y) => y.flyerId === x.flyerId); const got = f ? f.units : 0n; if (partial && got > 0n) fail('a less aggressive buyer filled after a partial fill'); if (got < BigInt(x.units)) partial = true; }
        const eligS = sells.filter((x) => x.limitMicro <= ref).sort((x, y) => (x.limitMicro !== y.limitMicro ? (x.limitMicro < y.limitMicro ? -1 : 1) : x.order - y.order));
        partial = false; for (const x of eligS) { const f = a.sellFills.find((y) => y.flyerId === x.flyerId); const got = f ? f.units : 0n; if (partial && got > 0n) fail('a less aggressive seller filled after a partial fill'); if (got < BigInt(x.units)) partial = true; }
        if (JSON.stringify(a, (k, v) => (typeof v === 'bigint' ? String(v) : v)) !== JSON.stringify(b, (k, v) => (typeof v === 'bigint' ? String(v) : v))) fail('not deterministic');
      }
      s.assert('no invariant broke in 3,000 random rounds (units and cash conserved, fills within orders, priority respected, deterministic)', bad.length === 0, { actual: bad });
    });

    await ctx.step('the Roost runs the programs and signs only what it computed', async (s) => {
      const seal = (r, id, body) => r.submitSealedIntent({ flyerId: id, cipherTextHex: sealToModel(JSON.stringify(body), r.intentPublicKey) });
      const refused = (fn, re) => { try { fn(); return 'signed'; } catch (e) { return re.test(e.message) ? true : e.message; } };
      const sign = (r, out) => r.signSettlement({ ...ROUND, allocations: out.allocations, orderHash: out.orderHash, charges: out.charges });
      // lending
      let r = new HostedRoost({ provider }); for (const [id, bps] of [['l1', 450], ['l2', 400], ['l3', 500], ['l4', 600]]) seal(r, id, { rateBps: bps });
      let out = r.runQuote({ shape: 'lend', counterparty: 'borrower', amount: '5', limit: 700, roundId: 'x' });
      s.assert('lend: lender l2 wins at 400 bps and funds 5 NEAR to the borrower', out.outcome.winner === 'l2' && out.outcome.rateBps === 400 && out.allocations[0].recipient === 'borrower' && BigInt(out.allocations[0].amount) === 5n * NEAR && out.charges[0].member === 'l2' && BigInt(out.charges[0].amount) === 5n * NEAR, { actual: out });
      s.assert('lend: the signed message has 7 fields', sign(r, out).message.split(':').length === 7);
      r = new HostedRoost({ provider }); for (const [id, bps] of [['l1', 450], ['l2', 400]]) seal(r, id, { rateBps: bps });
      out = r.runQuote({ shape: 'lend', pricing: 'second', counterparty: 'borrower', amount: '5', limit: 700, roundId: 'x' });
      s.assert('lend, second-price: the winner is quoted the runner-up\'s rate (450)', out.outcome.winner === 'l2' && out.outcome.rateBps === 450);
      r = new HostedRoost({ provider }); seal(r, 'l1', { rateBps: 900 });
      s.assert('lend: no eligible quote means no trade and nothing to sign', r.runQuote({ shape: 'lend', counterparty: 'borrower', amount: '5', limit: 700 }).outcome.won === false);
      r = new HostedRoost({ provider }); seal(r, 'borrower', { rateBps: 100 }); seal(r, 'l1', { rateBps: 500 });
      s.assert('lend: the borrower cannot win by quoting against themselves', r.runQuote({ shape: 'lend', counterparty: 'borrower', amount: '5', limit: 700 }).outcome.winner === 'l1');
      // RFQ buy
      r = new HostedRoost({ provider }); for (const [id, p] of [['d1', '1.30'], ['d2', '1.20'], ['d3', '1.25']]) seal(r, id, { price: p });
      out = r.runQuote({ shape: 'buy', counterparty: 'taker', units: 10, limit: '1.5', roundId: 'y' });
      s.assert('buy RFQ: dealer d2 wins at 1.20 and is paid 12 NEAR by the taker', out.outcome.winner === 'd2' && out.allocations[0].recipient === 'd2' && BigInt(out.allocations[0].amount) === 12n * NEAR && out.charges[0].member === 'taker' && BigInt(out.charges[0].amount) === 12n * NEAR, { actual: out });
      // cross
      r = new HostedRoost({ provider }); const orders = [['b1', 'buy', 100, '1.10'], ['b2', 'buy', 50, '1.05'], ['s1', 'sell', 80, '0.95'], ['s2', 'sell', 90, '1.00']]; for (const [id, side, units, limit] of orders) seal(r, id, { side, units, limit });
      out = r.runCross({ referencePrice: '1.00', roundId: 'z' });
      s.assert('cross: 150 units match; sellers s1 and s2 are paid 80 and 70; buyers b1 and b2 pay 100 and 50', out.outcome.matchedUnits === 150 && out.allocations.map((a) => `${a.recipient}:${BigInt(a.amount) / NEAR}`).join() === 's1:80,s2:70' && out.charges.map((c) => `${c.member}:${BigInt(c.amount) / NEAR}`).join() === 'b1:100,b2:50', { actual: out });
      const mk = () => { const q = new HostedRoost({ provider }); for (const [id, side, units, limit] of orders) seal(q, id, { side, units, limit }); return { q, o: q.runCross({ referencePrice: '1.00', roundId: 'z' }) }; };
      const t1 = mk(); const bumped = t1.o.charges.map((c) => ({ ...c })); bumped[0].amount = String(BigInt(bumped[0].amount) + 1n);
      s.assert('a charge raised by one yocto is refused', refused(() => t1.q.signSettlement({ ...ROUND, allocations: t1.o.allocations, orderHash: t1.o.orderHash, charges: bumped }), /charges do not match/) === true);
      const t2 = mk(); const moved = t2.o.allocations.map((a) => ({ ...a })); moved[0].recipient = 'thief';
      s.assert('an allocation moved to another recipient is refused', refused(() => t2.q.signSettlement({ ...ROUND, allocations: moved, orderHash: t2.o.orderHash, charges: t2.o.charges }), /allocations do not match/) === true);
      const t3 = mk(); s.assert('a cross outcome cannot be settled without its charges', refused(() => t3.q.signSettlement({ ...ROUND, allocations: t3.o.allocations, orderHash: t3.o.orderHash }), /only be settled with its charges/) === true);
      const t4 = mk(); sign(t4.q, t4.o); s.assert('a second signature is refused', refused(() => sign(t4.q, t4.o), /already been signed/) === true);
      // malformed input never blocks a round
      r = new HostedRoost({ provider }); seal(r, 'b1', { side: 'buy', units: 10, limit: '1.10' }); seal(r, 's1', { side: 'sell', units: 10, limit: '0.9' }); seal(r, 'junk', { side: 'hold', units: -3, limit: 'x' });
      out = r.runCross({ referencePrice: '1.00' });
      s.assert('cross: a malformed order is left out and reported, not fatal', out.outcome.matchedUnits === 10 && out.outcome.unreadable.join() === 'junk');
    });

    await ctx.step('two hosts: any arrival order gives the same signed message', async (s) => {
      const seal = (r, id, body) => r.submitSealedIntent({ flyerId: id, cipherTextHex: sealToModel(JSON.stringify(body), r.intentPublicKey) });
      const mkHost = () => new HostedRoost({ provider, deterministicOrder: true });
      const A = mkHost(); const B = mkHost();
      const sets = [['l1', { rateBps: 400 }], ['l2', { rateBps: 400 }], ['l3', { rateBps: 400 }]]; // all tie
      for (const [id, b] of sets) seal(A, id, b); for (const [id, b] of [...sets].reverse()) seal(B, id, b);
      const a = A.runQuote({ shape: 'lend', counterparty: 'bor', amount: '1', limit: 700, roundId: 'k' }); const b = B.runQuote({ shape: 'lend', counterparty: 'bor', amount: '1', limit: 700, roundId: 'k' });
      s.assert('lend with all quotes tied: both hosts pick the same winner and sign the same order hash', a.outcome.winner === b.outcome.winner && a.orderHash === b.orderHash && JSON.stringify(a.charges) === JSON.stringify(b.charges));
      const C = mkHost(); const D = mkHost(); const ords = [['b1', { side: 'buy', units: 10, limit: '1.0' }], ['b2', { side: 'buy', units: 10, limit: '1.0' }], ['s1', { side: 'sell', units: 15, limit: '1.0' }]];
      for (const [id, o] of ords) seal(C, id, o); for (const [id, o] of [...ords].reverse()) seal(D, id, o);
      const c = C.runCross({ referencePrice: '1.0', roundId: 'k' }); const d = D.runCross({ referencePrice: '1.0', roundId: 'k' });
      s.assert('cross with tied limits and a partial fill: both hosts split the same way and sign the same order hash', c.orderHash === d.orderHash && JSON.stringify(c.charges) === JSON.stringify(d.charges) && JSON.stringify(c.allocations) === JSON.stringify(d.allocations));
    });
  },
};
