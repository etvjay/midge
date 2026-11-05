/**
 * Auction rules a Roost can run on sealed bids. Pure functions: bids in, outcome out, no clock, no randomness, no I/O,
 * so the same sealed bids always give the same outcome and the outcome can be checked by anyone who learns the bids.
 *
 * A bid is { flyerId, priceMicro, quantity, order }: a price per unit in micro-NEAR (1e-6 NEAR), a quantity in whole
 * units, and the order the sealed bid arrived (the tie-break: earlier wins). Every amount below is BigInt micro-NEAR.
 *
 * Formats
 *   first-price   one lot (one winner takes all): the highest price wins and pays its own price.
 *   second-price  (Vickrey) one lot: the highest price wins and pays the second-highest price, or the reserve if there is
 *                 no second bid at or above it. Bidding your true value is a dominant strategy.
 *   uniform       lotUnits units: bids are filled from the highest price down until the units run out; EVERY filled bid pays
 *                 the same clearing price per unit. If demand at or above the reserve is not more than the supply, the
 *                 clearing price is the reserve; otherwise it is the price of the last (marginal) bid that is filled,
 *                 even partly (the "stop-out" price used for uniform-price Treasury auctions). The marginal bid takes what
 *                 is left, in arrival order among equal prices; there is no pro-rata split at the margin.
 *
 * Nothing here moves money. The outcome names who pays what (charges) and what the seller receives (proceeds); the
 * contract enforces that each member pays no more than they deposited and the seller is in the policy.
 */

export const FORMATS = ['first-price', 'second-price', 'uniform'];

/** Highest price first; equal prices: the bid that arrived first. */
const byPriority = (a, b) => (a.priceMicro > b.priceMicro ? -1 : a.priceMicro < b.priceMicro ? 1 : a.order - b.order);

export function clearAuction({ format, bids, lotUnits = 1, reserveMicro = 0n }) {
  if (!FORMATS.includes(format)) throw new Error(`unknown auction format ${format}`);
  if (!Number.isSafeInteger(lotUnits) || lotUnits < 1) throw new Error('lotUnits must be a positive integer');
  const eligible = bids.filter((b) => b.priceMicro >= reserveMicro && b.priceMicro > 0n && b.quantity >= 1).sort(byPriority);
  const base = { format, lotUnits, reserveMicro, bidsReceived: bids.length, bidsEligible: eligible.length };
  if (eligible.length === 0) return { ...base, sold: false, clearingPriceMicro: null, fills: [], proceedsMicro: 0n, charges: [] };

  let fills; let clearing;
  if (format === 'first-price' || format === 'second-price') {
    const winner = eligible[0];
    clearing = format === 'first-price' ? winner.priceMicro : (eligible[1] ? eligible[1].priceMicro : reserveMicro);
    // a lot is indivisible here: the winner takes all lotUnits at the clearing price per unit
    fills = [{ flyerId: winner.flyerId, units: lotUnits, priceMicro: clearing, payMicro: clearing * BigInt(lotUnits), bidMicro: winner.priceMicro * BigInt(lotUnits) }];
  } else {
    let left = lotUnits; const filled = [];
    for (const b of eligible) {
      if (left === 0) break;
      const units = Math.min(left, b.quantity);
      filled.push({ b, units }); left -= units;
    }
    const oversubscribed = eligible.reduce((a, b) => a + b.quantity, 0) > lotUnits;
    clearing = oversubscribed ? filled[filled.length - 1].b.priceMicro : reserveMicro;
    fills = filled.map(({ b, units }) => ({ flyerId: b.flyerId, units, priceMicro: clearing, payMicro: clearing * BigInt(units), bidMicro: b.priceMicro * BigInt(b.quantity) }));
  }
  const proceedsMicro = fills.reduce((a, f) => a + f.payMicro, 0n);
  const charges = fills.map((f) => ({ flyerId: f.flyerId, payMicro: f.payMicro }));
  return { ...base, sold: true, clearingPriceMicro: clearing, fills, proceedsMicro, charges, unitsSold: fills.reduce((a, f) => a + f.units, 0) };
}
