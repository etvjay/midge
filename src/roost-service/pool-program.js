/**
 * The pooled room program: every member seals one amount; the Roost totals them and the total goes to one recipient;
 * each member is charged exactly their own amount. Pure: sealed amounts in, outcome out.
 *
 * A sealed amount is { flyerId, amountMicro, order } in micro-NEAR. Amounts below `minMicro` are left out (and reported);
 * if `capMicro` is set the total may not exceed it: later amounts (in arrival order) are left out once it would be.
 */
export function clearPool({ bids, minMicro = 0n, capMicro = null }) {
  const taken = []; const left = []; let total = 0n;
  for (const b of [...bids].sort((x, y) => x.order - y.order)) {
    if (b.amountMicro <= 0n || b.amountMicro < minMicro || (capMicro !== null && total + b.amountMicro > capMicro)) { left.push(b.flyerId); continue; }
    taken.push(b); total += b.amountMicro;
  }
  return { sold: taken.length > 0, totalMicro: total, contributions: taken.map((b) => ({ flyerId: b.flyerId, amountMicro: b.amountMicro })), leftOut: left };
}
