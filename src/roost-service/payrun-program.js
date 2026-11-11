import { isAccountId } from './signed-input.js';

/**
 * Pay-run arithmetic. Pure. Each line is a person's one-time payout address, a private label, an invoice id, a period, and
 * gross, tax withheld and benefits (NEAR decimals, at most 6 places). The person is paid net = gross - tax - benefits; the tax
 * authority and the benefits provider are paid their totals as one transfer each; the employer is charged the gross total.
 * Every amount of every payment is public on NEAR once settled: this hides who is paid, not how much.
 */
const AMOUNT_RE = /^\d{1,12}(\.\d{1,6})?$/;
const ID_RE = /^[A-Za-z0-9._-]{1,64}$/;
const YOCTO_PER_MICRO = 10n ** 18n;
const MAX_RECIPIENTS = 8;
const toMicro = (v) => { if (typeof v !== 'string' && typeof v !== 'number') return null; const t = String(v); if (!AMOUNT_RE.test(t)) return null; const [w, f = ''] = t.split('.'); return BigInt(w) * 1_000_000n + BigInt(f.padEnd(6, '0')); };
export const fmtMicro = (m) => { const whole = m / 1_000_000n; const frac = (m % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, ''); return frac ? `${whole}.${frac}` : `${whole}`; };

export function buildPayrun({ lines, taxAddress, benefitsAddress, runId = 'run', invoiceHashes = null }) {
  if (!Array.isArray(lines) || lines.length === 0) throw new Error('a pay run needs at least one line');
  if (!isAccountId(taxAddress) || !isAccountId(benefitsAddress) || taxAddress === benefitsAddress) throw new Error('tax and benefits need two distinct plain account ids');
  const seen = new Set([taxAddress, benefitsAddress]);
  const rows = [];
  // Canonical order: the root and the order hash must not depend on how the employer happened to list the lines.
  lines = [...lines].sort((x, y) => (String(x?.payee) < String(y?.payee) ? -1 : String(x?.payee) > String(y?.payee) ? 1 : 0));
  let taxTotal = 0n; let benTotal = 0n; let netTotal = 0n; let grossTotal = 0n;
  for (const l of lines) {
    if (!isAccountId(l?.payee)) throw new Error('each line needs a plain payee account id');
    if (seen.has(l.payee)) throw new Error('payee addresses must be distinct from each other and from the tax and benefits addresses');
    seen.add(l.payee);
    if (typeof l.person !== 'string' || l.person.length < 1 || l.person.length > 64) throw new Error('each line needs a person label of 1 to 64 characters');
    if (!ID_RE.test(String(l.invoiceId)) || !ID_RE.test(String(l.period))) throw new Error('invoiceId and period must be 1 to 64 plain characters');
    if (!/^[0-9a-f]{64}$/i.test(String(l.payeeKey))) throw new Error('each line needs the payee\'s 32-byte hex public key');
    const gross = toMicro(l.gross); const tax = toMicro(l.tax ?? '0'); const ben = toMicro(l.benefits ?? '0');
    if (gross === null || gross === 0n) throw new Error('gross must be a positive decimal with at most 6 places');
    if (tax === null || ben === null) throw new Error('tax and benefits must be decimals with at most 6 places');
    if (tax + ben > gross) throw new Error('tax plus benefits exceed the gross');
    const net = gross - tax - ben;
    if (net === 0n) throw new Error('net must be positive');
    rows.push({ l, gross, tax, ben, net });
    taxTotal += tax; benTotal += ben; netTotal += net; grossTotal += gross;
  }
  const recipients = rows.length + (taxTotal > 0n ? 1 : 0) + (benTotal > 0n ? 1 : 0);
  if (recipients > MAX_RECIPIENTS) throw new Error(`a settlement can pay at most ${MAX_RECIPIENTS} recipients; this pay run needs ${recipients}`);
  const allocations = rows.map((r) => ({ recipient: r.l.payee, amount: String(r.net * YOCTO_PER_MICRO) }));
  const receipts = rows.map((r) => ({ v: 1, kind: 'pay', runId, invoiceId: r.l.invoiceId, period: r.l.period, payee: r.l.payee, person: r.l.person, gross: fmtMicro(r.gross), tax: fmtMicro(r.tax), benefits: fmtMicro(r.ben), net: fmtMicro(r.net), ...(invoiceHashes?.[r.l.invoiceId] ? { invoiceHash: invoiceHashes[r.l.invoiceId] } : {}) }));
  const keys = rows.map((r) => r.l.payeeKey);
  if (taxTotal > 0n) { allocations.push({ recipient: taxAddress, amount: String(taxTotal * YOCTO_PER_MICRO) }); receipts.push({ v: 1, kind: 'tax', runId, payee: taxAddress, total: fmtMicro(taxTotal) }); }
  if (benTotal > 0n) { allocations.push({ recipient: benefitsAddress, amount: String(benTotal * YOCTO_PER_MICRO) }); receipts.push({ v: 1, kind: 'benefits', runId, payee: benefitsAddress, total: fmtMicro(benTotal) }); }
  return { allocations, grossMicro: grossTotal, receipts, payeeKeys: keys, totals: { gross: fmtMicro(grossTotal), tax: fmtMicro(taxTotal), benefits: fmtMicro(benTotal), net: fmtMicro(netTotal), headcount: rows.length } };
}
