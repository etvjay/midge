/**
 * What the playground's pay run starts as, and what a visitor may change it to. The employer's rules are the same text the reviewer was tested with
 * (src/advisor/payrun-analyst.js), because the review is only as good as the rules it is given.
 */
export const RULES = 'Tax is a flat 15 percent of gross, withheld on every line. Employee benefits are capped at 5 percent of gross. All lines are for the November 2026 period. A line with no tax withheld needs a written exemption.';
export const STATED = { taxRatePct: 15, benefitsCapPct: 5 };
export const PERIOD = '2026-11';

export function defaultLines() {
  return [
    { person: 'Alice', gross: '0.05', tax: '0.0075', benefits: '0.0025' },
    { person: 'Bo', gross: '0.04', tax: '0.006', benefits: '0.002' },
    { person: 'Cy', gross: '0.03', tax: '0.0045', benefits: '0.0015' },
    { person: 'Dee', gross: '0.06', tax: '0.009', benefits: '0.003' },
  ];
}

const AMOUNT = /^\d{1,2}(\.\d{1,6})?$/;
const NAME = /^[A-Za-z][A-Za-z '-]{0,23}$/;
const MIN_GROSS = 10_000n; const MAX_GROSS = 100_000n; // micro-NEAR: 0.01 to 0.10
const micro = (s) => { const [w, f = ''] = String(s).split('.'); return BigInt(w) * 1_000_000n + BigInt(f.padEnd(6, '0').slice(0, 6)); };

/** Four lines, each with a plain name and amounts the room and the contract will accept. Returns { ok, problem } with a sentence a visitor can read. */
export function validateLines(lines) {
  if (!Array.isArray(lines) || lines.length !== 4) return { ok: false, problem: 'A pay run here has exactly four lines.' };
  const seen = new Set();
  for (const [i, l] of lines.entries()) {
    const who = `Line ${i + 1}`;
    if (typeof l?.person !== 'string' || !NAME.test(l.person.trim())) return { ok: false, problem: `${who} needs a name of letters, up to 24 characters.` };
    if (seen.has(l.person.trim().toLowerCase())) return { ok: false, problem: `${who} repeats a name. Each person needs a different name.` };
    seen.add(l.person.trim().toLowerCase());
    for (const f of ['gross', 'tax', 'benefits']) if (typeof l[f] !== 'string' || !AMOUNT.test(l[f])) return { ok: false, problem: `${l.person}'s ${f} must be a decimal number with at most 6 places.` };
    const g = micro(l.gross);
    if (g < MIN_GROSS || g > MAX_GROSS) return { ok: false, problem: `${l.person}'s gross pay must be between 0.01 and 0.1 NEAR.` };
    if (micro(l.tax) > g || micro(l.benefits) > g) return { ok: false, problem: `${l.person}'s tax and benefits can't be more than the gross pay.` };
  }
  return { ok: true, problem: null };
}

export const grossTotalMicro = (lines) => lines.reduce((a, l) => a + micro(l.gross), 0n);
