/**
 * Quote and cross programs. Pure functions over BigInt/integer inputs: sealed inputs in, outcome out.
 * A quote is { flyerId, valueMicro, order }. An order is { flyerId, units, limitMicro, order }.
 */

/**
 * Best quote. direction 'lowest' picks the smallest value at or under `limitMicro` (a lending rate, or a price the taker
 * will pay at most); 'highest' picks the largest value at or over it. Ties go to the earlier `order`.
 * pricing 'first' returns the winner's own quote; 'second' returns the runner-up's (or the winner's if alone).
 */
export function clearBestQuote({ direction, quotes, limitMicro, pricing = 'first' }) {
  if (direction !== 'lowest' && direction !== 'highest') throw new Error("direction must be 'lowest' or 'highest'");
  if (pricing !== 'first' && pricing !== 'second') throw new Error("pricing must be 'first' or 'second'");
  const ok = (q) => (direction === 'lowest' ? q.valueMicro <= limitMicro : q.valueMicro >= limitMicro);
  const eligible = quotes.filter(ok).sort((a, b) => {
    if (a.valueMicro !== b.valueMicro) return direction === 'lowest' ? (a.valueMicro < b.valueMicro ? -1 : 1) : (a.valueMicro > b.valueMicro ? -1 : 1);
    return a.order - b.order;
  });
  const base = { quotesReceived: quotes.length, quotesEligible: eligible.length };
  if (eligible.length === 0) return { ...base, won: false, winner: null, winnerQuoteMicro: null, priceMicro: null, runnerUpMicro: null };
  const [w, r] = eligible;
  return { ...base, won: true, winner: w.flyerId, winnerQuoteMicro: w.valueMicro, runnerUpMicro: r ? r.valueMicro : null, priceMicro: pricing === 'second' && r ? r.valueMicro : w.valueMicro };
}

/**
 * Cross at a reference price. Buyers with limit >= reference and sellers with limit <= reference take part. Matched units
 * are min(total buy, total sell). The more aggressive limit fills first (higher for buyers, lower for sellers), then the
 * earlier `order`. Every fill is at the reference price.
 */
export function clearCross({ buys, sells, referenceMicro }) {
  const eb = buys.filter((b) => b.units > 0 && b.limitMicro >= referenceMicro).sort((a, b) => (a.limitMicro !== b.limitMicro ? (a.limitMicro > b.limitMicro ? -1 : 1) : a.order - b.order));
  const es = sells.filter((s) => s.units > 0 && s.limitMicro <= referenceMicro).sort((a, b) => (a.limitMicro !== b.limitMicro ? (a.limitMicro < b.limitMicro ? -1 : 1) : a.order - b.order));
  const totalBuy = eb.reduce((x, b) => x + BigInt(b.units), 0n); const totalSell = es.reduce((x, s) => x + BigInt(s.units), 0n);
  const matched = totalBuy < totalSell ? totalBuy : totalSell;
  const fill = (list) => { let rest = matched; const out = []; for (const o of list) { if (rest === 0n) break; const u = BigInt(o.units) < rest ? BigInt(o.units) : rest; out.push({ flyerId: o.flyerId, units: u, cashMicro: u * referenceMicro, limitMicro: o.limitMicro, ordered: BigInt(o.units) }); rest -= u; } return out; };
  return { matchedUnits: matched, referenceMicro, buyFills: fill(eb), sellFills: fill(es), buysReceived: buys.length, sellsReceived: sells.length, buysEligible: eb.length, sellsEligible: es.length };
}
