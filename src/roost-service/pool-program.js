/**
 * The pooled room program: every member seals one amount; the Roost totals them and the total goes to one recipient;
 * each member is charged exactly their own amount. Pure: sealed amounts in, outcome out.
 *
 * A sealed amount is { flyerId, amountMicro, order } in micro-NEAR. Amounts below `minMicro` are left out (and reported);
 * if `capMicro` is set the total may not exceed it: later amounts (in arrival order) are left out once it would be.
 * With mode 'pro-rata' (cap required) nobody is left out for arriving late: when the eligible total passes the cap every amount is scaled by
 * the same ratio, rounded down. The default mode, 'first-come', is unchanged.
 */
export function clearPool({ bids, minMicro = 0n, capMicro = null, mode = 'first-come' }) {
  if (mode !== 'first-come' && mode !== 'pro-rata') throw new Error("mode must be 'first-come' or 'pro-rata'");
  const sorted = [...bids].sort((x, y) => x.order - y.order);
  if (mode === 'pro-rata') {
    if (capMicro === null) throw new Error('pro-rata needs a cap');
    // Every bid at or over the minimum is eligible. Over the cap each is scaled by cap / eligible total, rounded down, so the total
    // never passes the cap and arrival order decides nothing. A bid that scales to zero is left out.
    const eligible = []; const left = [];
    for (const b of sorted) { if (b.amountMicro <= 0n || b.amountMicro < minMicro) left.push(b.flyerId); else eligible.push(b); }
    const eligibleTotal = eligible.reduce((a, b) => a + b.amountMicro, 0n);
    const over = eligibleTotal > capMicro;
    const taken = [];
    for (const b of eligible) {
      const amountMicro = over ? (b.amountMicro * capMicro) / eligibleTotal : b.amountMicro;
      if (amountMicro === 0n) left.push(b.flyerId); else taken.push({ flyerId: b.flyerId, amountMicro });
    }
    const total = taken.reduce((a, b) => a + b.amountMicro, 0n);
    return { sold: taken.length > 0, totalMicro: total, contributions: taken, leftOut: left, mode, scaled: over };
  }
  const taken = []; const left = []; let total = 0n;
  for (const b of sorted) {
    if (b.amountMicro <= 0n || b.amountMicro < minMicro || (capMicro !== null && total + b.amountMicro > capMicro)) { left.push(b.flyerId); continue; }
    taken.push(b); total += b.amountMicro;
  }
  return { sold: taken.length > 0, totalMicro: total, contributions: taken.map((b) => ({ flyerId: b.flyerId, amountMicro: b.amountMicro })), leftOut: left };
}
