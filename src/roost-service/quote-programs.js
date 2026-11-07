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
 * Cross at a reference price, pro-rata. Buyers with limit >= reference and sellers with limit <= reference take part: the
 * limit decides ONLY who qualifies, never who is filled first (a free extreme limit would otherwise jump the queue). Matched
 * units are min(total buy, total sell). The short side is filled in full; the long side is filled in proportion to order size
 * (largest remainder, ties to the fixed order), so no fill exceeds its order. `maxUnits`, if given, is a public cap on any one
 * order's size, which limits the over-ordering that pro-rata invites. Every fill is at the reference price.
 */
export function clearCross({ buys, sells, referenceMicro, maxUnits = null }) {
  const clamp = (u) => (maxUnits === null ? BigInt(u) : BigInt(Math.min(u, maxUnits)));
  const take = (list, ok) => list.filter((o) => o.units > 0 && ok(o)).map((o) => ({ ...o, ordered: clamp(o.units) })).sort((a, b) => a.order - b.order);
  const eb = take(buys, (b) => b.limitMicro >= referenceMicro);
  const es = take(sells, (s) => s.limitMicro <= referenceMicro);
  const sum = (l) => l.reduce((x, o) => x + o.ordered, 0n);
  const totalBuy = sum(eb); const totalSell = sum(es);
  const matched = totalBuy < totalSell ? totalBuy : totalSell;
  const fill = (list, total) => {
    let units;
    if (total === matched) units = list.map((o) => o.ordered);
    else {
      units = list.map((o) => (o.ordered * matched) / total);
      let rest = matched - units.reduce((x, u) => x + u, 0n);
      const byRemainder = list.map((o, i) => ({ i, r: (o.ordered * matched) % total })).sort((a, b) => (a.r !== b.r ? (a.r > b.r ? -1 : 1) : list[a.i].order - list[b.i].order));
      for (const { i } of byRemainder) { if (rest === 0n) break; units[i] += 1n; rest -= 1n; }
    }
    return list.map((o, i) => ({ flyerId: o.flyerId, units: units[i], cashMicro: units[i] * referenceMicro, limitMicro: o.limitMicro, ordered: o.ordered })).filter((f) => f.units > 0n);
  };
  return { matchedUnits: matched, referenceMicro, buyFills: matched === 0n ? [] : fill(eb, totalBuy), sellFills: matched === 0n ? [] : fill(es, totalSell), buysReceived: buys.length, sellsReceived: sells.length, buysEligible: eb.length, sellsEligible: es.length };
}
