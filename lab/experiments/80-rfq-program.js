import crypto from 'node:crypto';
import { clearBestQuote } from '../../src/roost-service/quote-programs.js';
import { HostedRoost } from '../../src/roost-service/hosted-roost.js';
import { sealToModel } from '../../src/enclave/e2ee.js';
import { signInputWithNearKey, inputMessage, nearKeyPair } from '../../src/roost-service/signed-input.js';

const provider = { simulated: true, attest: async () => Buffer.from('lab-local-no-hardware'), info: async () => ({}) };
const NEAR = 10n ** 24n;
const rngOf = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
const ROUND = { contractId: 'c.near', syndicateId: 'rfq', epoch: 1, roundNonce: 'ab'.repeat(32) };
const IDS = ['taker.near', 'm1.near', 'm2.near', 'm3.near', 'm4.near', 'outsider.near'];
const keys = Object.fromEntries(IDS.map((id) => [id, nearKeyPair()]));
const keyCheck = async (id, pk) => keys[id]?.publicKey === pk;
const MAKERS = ['m1.near', 'm2.near', 'm3.near', 'm4.near'];
const QUOTES = { 'm1.near': { bid: '0.00195', ask: '0.00205' }, 'm2.near': { bid: '0.0019', ask: '0.002' }, 'm3.near': { bid: '0.00197', ask: '0.0021' }, 'm4.near': { bid: '0.00185', ask: '0.00215' } };
const salt = () => crypto.randomBytes(16).toString('hex');

export default {
  id: 'E-RFQ-PROGRAM-01',
  title: 'Two-sided RFQ room program: makers quote both ways, the taker\'s side stays sealed, the right maker wins in both directions',
  tier: 'offline',
  requires: [],
  hypothesis: 'The best-quote program picks the highest eligible quote in the highest direction as correctly as the lowest in the lowest. The RFQ host takes one sealed request from the taker (side, units, limit, a secret salt) and a sealed two-way quote (bid and ask) from each maker. A buy goes to the lowest ask at or under the limit, a sell to the highest bid at or over it; first-price or second-price. The payer is the taker on a buy and the winning maker on a sell; the payee is the other; the charge is bounded by what the payer committed. A crossed quote, a quote from outside the maker list or from the taker is not counted. The order hash does not let an observer recover units or price (it carries the taker\'s secret salt). Two hosts agree. The host signs only what it computed. Fails if any of these breaks.',
  limits: ['Offline, on local hosts with a simulated attestation provider and a stubbed account-key check. Only the cash leg settles: nothing delivers the asset. Settlement reveals the side (who pays whom) and the notional; it does not reveal units or the price per unit. The maker list is supplied by the coordinator and must match the contract\'s allowed recipients.'],
  async run(ctx) {
    await ctx.step('the highest direction, which the sell side depends on: worked examples and 3,000 random rounds', async (s) => {
      const q = (id, v, order) => ({ flyerId: id, valueMicro: BigInt(v), order });
      let r = clearBestQuote({ direction: 'highest', quotes: [q('a', 1950, 0), q('b', 1900, 1), q('c', 1970, 2), q('d', 1850, 3)], limitMicro: 1800n });
      s.assert('the highest bid at or over the limit wins and is paid its own bid (first-price)', r.winner === 'c' && r.priceMicro === 1970n && r.runnerUpMicro === 1950n);
      r = clearBestQuote({ direction: 'highest', quotes: [q('a', 1950, 0), q('c', 1970, 2)], limitMicro: 1800n, pricing: 'second' });
      s.assert('second-price pays the runner-up\'s bid', r.winner === 'c' && r.priceMicro === 1950n);
      s.assert('a bid under the limit never wins', clearBestQuote({ direction: 'highest', quotes: [q('a', 1700, 0)], limitMicro: 1800n }).won === false);
      s.assert('a bid exactly at the limit is eligible', clearBestQuote({ direction: 'highest', quotes: [q('a', 1800, 0)], limitMicro: 1800n }).winner === 'a');
      s.assert('a tie goes to the earlier order', clearBestQuote({ direction: 'highest', quotes: [q('late', 1900, 5), q('early', 1900, 2)], limitMicro: 1800n }).winner === 'early');
      const rnd = rngOf(17); const bad = [];
      for (let t = 0; t < 3000; t += 1) {
        const n = 1 + Math.floor(rnd() * 8); const quotes = Array.from({ length: n }, (_, i) => q(`m${i}`, Math.floor(rnd() * 1000), i)); const limit = BigInt(Math.floor(rnd() * 1000));
        for (const pricing of ['first', 'second']) {
          const a = clearBestQuote({ direction: 'highest', quotes, limitMicro: limit, pricing }); const b = clearBestQuote({ direction: 'highest', quotes: [...quotes].reverse().map((x) => ({ ...x })), limitMicro: limit, pricing });
          const elig = quotes.filter((x) => x.valueMicro >= limit); const fail = (w) => bad.length < 4 && bad.push(w);
          if (a.quotesEligible !== elig.length) fail('eligible count');
          if (a.won && (a.winnerQuoteMicro < limit || elig.some((x) => x.valueMicro > a.winnerQuoteMicro))) fail('winner is not the highest eligible');
          if (a.won && (a.priceMicro > a.winnerQuoteMicro || a.priceMicro < limit)) fail('price outside [limit, winner quote]');
          if (a.won !== (elig.length > 0)) fail('won flag wrong');
          if (a.won && b.won && a.winnerQuoteMicro !== b.winnerQuoteMicro) fail('winning value depends on arrival order');
        }
      }
      s.assert('no invariant broke in 3,000 random rounds (winner is the highest eligible, price within [limit, winner quote], value independent of order)', bad.length === 0, { actual: bad });
    });

    await ctx.step('the host: both sides, both pricings, who pays whom, and what is refused', async (s) => {
      const mk = (opts = {}) => { const r = new HostedRoost({ provider, requireSignedInputs: true, accountKeyCheck: keyCheck, ...opts }); r.openRound(ROUND); return r; };
      const submit = async (r, who, body, seq = 1) => { const cipherTextHex = sealToModel(JSON.stringify(body), r.intentPublicKey); return r.submitSignedIntent({ flyerId: who, cipherTextHex, publicKey: keys[who].publicKey, signature: signInputWithNearKey(keys[who].secretKey, inputMessage({ ...ROUND, flyerId: who, seq, cipherTextHex })), seq }); };
      const request = (side, limit, extra = {}) => ({ side, units: 10, limit, salt: salt(), ...extra });
      const fill = async (r, side, limit, makers = MAKERS) => { await submit(r, 'taker.near', request(side, limit)); for (const m of makers) await submit(r, m, QUOTES[m]); };
      const params = { taker: 'taker.near', makers: MAKERS, roundId: 'q1' };
      const refused = (fn, re) => { try { fn(); return 'ran'; } catch (e) { return re.test(e.message) ? true : e.message; } };
      s.assert('a host that does not require signed inputs refuses to run an RFQ', refused(() => new HostedRoost({ provider }).runRfq(params), /signed/) === true);
      // buy
      let r = mk(); await fill(r, 'buy', '0.0022'); let out = r.runRfq(params);
      s.assert('buy: m2 wins at its ask of 0.002; the taker pays m2 10 x 0.002 = 0.02 NEAR', out.outcome.won && out.outcome.winner === 'm2.near' && out.allocations.length === 1 && out.allocations[0].recipient === 'm2.near' && BigInt(out.allocations[0].amount) === NEAR / 50n && out.charges[0].member === 'taker.near' && BigInt(out.charges[0].amount) === NEAR / 50n, { actual: out });
      s.assert('the terms (side, units, price) are in the host\'s private reply, not in the public outcome', out.terms.side === 'buy' && out.terms.units === 10 && out.terms.price === '0.002' && !['side', 'units', 'price', 'terms'].some((k) => k in out.outcome));
      s.assert('the signed message has 7 fields', r.signSettlement({ ...ROUND, allocations: out.allocations, orderHash: out.orderHash, charges: out.charges }).message.split(':').length === 7);
      // sell
      r = mk(); await fill(r, 'sell', '0.0018'); out = r.runRfq(params);
      s.assert('sell: m3 wins at its bid of 0.00197; m3 pays the taker 10 x 0.00197 = 0.0197 NEAR', out.outcome.winner === 'm3.near' && out.allocations[0].recipient === 'taker.near' && BigInt(out.allocations[0].amount) === 197n * NEAR / 10000n && out.charges[0].member === 'm3.near' && BigInt(out.charges[0].amount) === 197n * NEAR / 10000n, { actual: out });
      // second price
      r = mk(); await fill(r, 'buy', '0.0022'); out = r.runRfq({ ...params, pricing: 'second' });
      s.assert('buy, second-price: m2 wins and pays the runner-up\'s ask, 0.00205 (m1), so 0.0205 NEAR', out.outcome.winner === 'm2.near' && BigInt(out.allocations[0].amount) === 205n * NEAR / 10000n);
      r = mk(); await fill(r, 'sell', '0.0018'); out = r.runRfq({ ...params, pricing: 'second' });
      s.assert('sell, second-price: m3 wins and is charged the runner-up\'s bid, 0.00195 (m1), so 0.0195 NEAR', out.outcome.winner === 'm3.near' && BigInt(out.allocations[0].amount) === 195n * NEAR / 10000n);
      // limits
      r = mk(); await fill(r, 'buy', '0.0019'); out = r.runRfq(params); s.assert('buy with a limit under every ask: no trade and nothing to sign', out.outcome.won === false && out.orderHash === null && out.allocations.length === 0);
      r = mk(); await fill(r, 'sell', '0.002'); out = r.runRfq(params); s.assert('sell with a limit over every bid: no trade', out.outcome.won === false);
      r = mk(); await fill(r, 'buy', '0.002'); out = r.runRfq(params); s.assert('a buy limit exactly at the best ask still trades', out.outcome.winner === 'm2.near');
      // not counted
      r = mk(); await submit(r, 'taker.near', request('buy', '0.0022')); await submit(r, 'm1.near', QUOTES['m1.near']); await submit(r, 'outsider.near', { bid: '0.00001', ask: '0.0001' });
      out = r.runRfq(params); s.assert('a quote from outside the maker list is ignored and reported by account, even if it would win', out.outcome.winner === 'm1.near' && out.outcome.outsiders.join() === 'outsider.near');
      r = mk(); await submit(r, 'taker.near', { ...request('buy', '0.0022'), bid: '0.0001', ask: '0.0001' }); await submit(r, 'm1.near', QUOTES['m1.near']);
      out = r.runRfq(params); s.assert('the taker\'s own request is never counted as a quote', out.outcome.winner === 'm1.near');
      r = mk(); await submit(r, 'taker.near', request('buy', '0.0022')); await submit(r, 'm1.near', { bid: '0.0021', ask: '0.002' }); await submit(r, 'm2.near', QUOTES['m2.near']);
      out = r.runRfq(params); s.assert('a crossed quote (bid above ask) is not counted, even though its ask would win', out.outcome.winner === 'm2.near' && out.outcome.unreadable.includes('m1.near'));
      r = mk(); await submit(r, 'm1.near', QUOTES['m1.near']);
      s.assert('without the taker\'s request there is nothing to run', refused(() => r.runRfq(params), /taker/) === true);
      r = mk(); await submit(r, 'taker.near', { side: 'buy', units: 10, limit: '0.0022' }); await submit(r, 'm1.near', QUOTES['m1.near']);
      s.assert('a request without a secret salt is refused (the order hash would be guessable)', refused(() => r.runRfq(params), /salt/) === true);
      // the order hash must not let an observer recover units or price
      r = mk(); await fill(r, 'buy', '0.0022'); out = r.runRfq(params);
      let recovered = false; for (let u = 1; u <= 100 && !recovered; u += 1) for (let p = 1900; p <= 2300 && !recovered; p += 1) { const guess = crypto.createHash('sha256').update(`midge-rfq-v1:q1:buy:taker.near:m2.near:${p}:${u}:`).digest('hex'); if (guess === out.orderHash) recovered = true; }
      s.assert('an observer who tries every (units, price) pair cannot reproduce the on-chain order hash: it carries the taker\'s secret salt', recovered === false);
      // tamper
      const t = async () => { const q = mk(); await fill(q, 'buy', '0.0022'); return { q, o: q.runRfq(params) }; };
      let x = await t(); const moved = x.o.allocations.map((a) => ({ ...a, recipient: 'm4.near' }));
      s.assert('paying the winner\'s money to another maker is refused', refused(() => x.q.signSettlement({ ...ROUND, allocations: moved, orderHash: x.o.orderHash, charges: x.o.charges }), /allocations do not match/) === true);
      x = await t(); const heavy = [{ ...x.o.charges[0], amount: String(BigInt(x.o.charges[0].amount) * 2n) }];
      s.assert('charging the taker double is refused', refused(() => x.q.signSettlement({ ...ROUND, allocations: x.o.allocations, orderHash: x.o.orderHash, charges: heavy }), /charges do not match/) === true);
      x = await t(); s.assert('an RFQ outcome cannot be settled without its charges', refused(() => x.q.signSettlement({ ...ROUND, allocations: x.o.allocations, orderHash: x.o.orderHash }), /only be settled with its charges/) === true);
      // two hosts: the same signed inputs, opposite arrival, same message
      const sealedFor = (side) => ({ taker: request(side, side === 'buy' ? '0.0022' : '0.0018') }); // one request per side, reused so both hosts see the same salt
      for (const side of ['buy', 'sell']) {
        const A = mk({ deterministicOrder: true }); const B = mk({ deterministicOrder: true }); const req = sealedFor(side).taker;
        await submit(A, 'taker.near', req); for (const m of MAKERS) await submit(A, m, QUOTES[m]);
        for (const m of [...MAKERS].reverse()) await submit(B, m, QUOTES[m]); await submit(B, 'taker.near', req);
        const oa = A.runRfq(params); const ob = B.runRfq(params);
        s.assert(`two hosts that received the ${side} RFQ in opposite orders sign the same order hash, allocations and charges`, oa.orderHash === ob.orderHash && JSON.stringify(oa.allocations) === JSON.stringify(ob.allocations) && JSON.stringify(oa.charges) === JSON.stringify(ob.charges));
      }
    });
  },
};
