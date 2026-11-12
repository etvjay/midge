import { assertNoLeak } from './preflight-explainer.js';

/**
 * An optional review of a pay run by a model, with the code checking the model.
 *
 * What the model is sent: for each line a letter label, the gross as a band relative to the run's median (to the nearest 10%), the tax
 * rate and the benefits rate to a tenth of a percent, and three yes-or-no flags the code computed. It is also sent the employer's rules as
 * plain text. It is never sent a name, an account, an address, an invoice id or an exact amount, and the employer's text is refused if it
 * contains one.
 *
 * What comes back is held to a fixed shape. Every finding the code can check from the numbers is marked verified or not-verified; the rest
 * are marked not-verified. The review is advice only: it returns beside the pay run and changes nothing.
 */

export const CODES = ['rate-above-schedule', 'rate-below-schedule', 'benefits-above-cap', 'zero-deduction', 'rate-outlier', 'unique-amount', 'address-reused', 'headcount-one', 'schedule-ambiguous', 'other'];
const MICRO = 1_000_000n;
const AMOUNT_RE = /^\d{1,12}(\.\d{1,6})?$/;
const toMicro = (v) => { const t = String(v ?? ''); if (!AMOUNT_RE.test(t)) throw new Error(`'${t}' is not a decimal amount with at most 6 places`); const [w, f = ''] = t.split('.'); return BigInt(w) * MICRO + BigInt(f.padEnd(6, '0')); };
/** x / y as a percentage rounded to `step` percent (step 10 gives bands; step 0.1 gives a tenth of a percent), done in integers. */
const pct = (x, y, stepTenths) => { if (y === 0n) return 0; const tenths = (x * 1000n * 2n + y) / (2n * y); return Number(((tenths + BigInt(stepTenths) / 2n) / BigInt(stepTenths)) * BigInt(stepTenths)) / 10; };

const SYSTEM = 'You review a payroll run for an accountant. You are given the employer\'s own rules as text and, per line, a letter label, the gross as a percentage of the run\'s median, the tax rate and benefits rate in percent, and yes-or-no flags. Code meanings: zero-deduction means no tax is withheld on the line; rate-above-schedule and rate-below-schedule compare the tax rate with the stated tax rate; benefits-above-cap compares the benefits rate with the stated cap; rate-outlier means the tax rate is far from the other lines; unique-amount, address-reused and headcount-one are about whether an outsider could tell who was paid. Reason only from the employer\'s text and the numbers; you have no authority on tax law and must say when the text is unclear. Reply with one JSON object only: {"findings":[{"line":"A","code":"<one of ' + CODES.join('|') + '>","severity":"info|warn","note":"at most 160 characters"}],"summary":"at most 300 characters","questions":["at most 3 short questions for the accountant"]}. Never invent names or numbers.';

function lineNumbers(line) {
  const gross = toMicro(line.gross); const tax = toMicro(line.tax ?? '0'); const ben = toMicro(line.benefits ?? '0');
  if (gross === 0n) throw new Error('a line needs a positive gross');
  return { gross, tax, ben, net: gross - tax - ben };
}

/** Everything the code works out itself, with no model. Pure. */
export function analyseRun({ lines, earlierAddresses = [] }) {
  if (!Array.isArray(lines) || lines.length === 0) throw new Error('a pay run needs at least one line');
  const nums = lines.map(lineNumbers);
  const sortedGross = nums.map((n) => n.gross).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const mid = sortedGross.length % 2 ? sortedGross[(sortedGross.length - 1) / 2] : (sortedGross[sortedGross.length / 2 - 1] + sortedGross[sortedGross.length / 2]) / 2n;
  const earlier = new Set(earlierAddresses);
  const rows = lines.map((l, i) => {
    const n = nums[i];
    return { i, grossBandPct: pct(n.gross, mid, 100), taxRatePct: pct(n.tax, n.gross, 1), benefitsRatePct: pct(n.ben, n.gross, 1), netBandPct: pct(n.net, mid, 100), addressReused: earlier.has(l.payee), invoiceMatched: l.invoiceMatched !== false, periodMatches: l.periodMatches !== false };
  });
  // Labels depend on the numbers sent, never on the order the employer listed the lines.
  const order = [...rows].sort((a, b) => a.grossBandPct - b.grossBandPct || a.taxRatePct - b.taxRatePct || a.benefitsRatePct - b.benefitsRatePct || a.i - b.i);
  order.forEach((r, k) => { r.label = String.fromCharCode(65 + k); });
  const bandCount = new Map(); for (const r of rows) bandCount.set(r.netBandPct, (bandCount.get(r.netBandPct) || 0) + 1);
  const flags = [];
  for (const r of rows) {
    if (bandCount.get(r.netBandPct) === 1 && rows.length > 1) flags.push({ line: r.label, code: 'unique-amount' });
    if (r.addressReused) flags.push({ line: r.label, code: 'address-reused' });
  }
  if (rows.length === 1) flags.push({ line: rows[0].label, code: 'headcount-one' });
  const totalGross = nums.reduce((a, n) => a + n.gross, 0n);
  return { rows, flags, headcount: rows.length, taxShareOfGrossPct: pct(nums.reduce((a, n) => a + n.tax, 0n), totalGross, 1), benefitsShareOfGrossPct: pct(nums.reduce((a, n) => a + n.ben, 0n), totalGross, 1), rates: order.map((r) => r.taxRatePct), nums };
}

/** The identifying strings in a request: what must never reach the model. */
export function secretsOf({ lines }) {
  const out = new Set();
  for (const l of lines) {
    for (const v of [l.person, l.payee, l.invoiceId, l.gross, l.tax, l.benefits, l.period]) if (typeof v === 'string' && v) out.add(v);
    for (const w of String(l.person || '').split(/\s+/)) if (w.length >= 3) out.add(w);
  }
  return [...out];
}

/** The only thing the model is sent. */
export function buildReviewMessage({ lines, rulesText = '', stated = {}, earlierAddresses = [] }) {
  const a = analyseRun({ lines, earlierAddresses });
  const message = {
    task: 'review-payrun',
    rules: String(rulesText).slice(0, 1500),
    stated: { taxRatePct: stated.taxRatePct ?? null, benefitsCapPct: stated.benefitsCapPct ?? null },
    run: { headcount: a.headcount, taxShareOfGrossPct: a.taxShareOfGrossPct, benefitsShareOfGrossPct: a.benefitsShareOfGrossPct },
    lines: [...a.rows].sort((x, y) => (x.label < y.label ? -1 : 1)).map((r) => ({ line: r.label, grossPctOfMedian: r.grossBandPct, taxRatePct: r.taxRatePct, benefitsRatePct: r.benefitsRatePct, invoiceMatched: r.invoiceMatched, addressReusedBefore: r.addressReused, periodMatchesRun: r.periodMatches })),
  };
  assertNoLeak(message, secretsOf({ lines }));
  return { message, analysis: a };
}

/** Strict reading of a reply. Returns { ok, problems, findings, summary, questions }. */
export function parseReply(text, labels) {
  const problems = [];
  let obj = null;
  try { const t = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''); obj = JSON.parse(t); } catch { problems.push('the reply is not JSON'); }
  if (obj && (typeof obj !== 'object' || Array.isArray(obj))) { problems.push('the reply is not an object'); obj = null; }
  if (obj) {
    const extra = Object.keys(obj).filter((k) => !['findings', 'summary', 'questions'].includes(k));
    if (extra.length) problems.push(`the reply has extra fields: ${extra.join(', ')}`);
    if (!Array.isArray(obj.findings)) problems.push('findings must be an array');
    if (typeof obj.summary !== 'string' || obj.summary.length > 300) problems.push('summary must be text of at most 300 characters');
    if (!Array.isArray(obj.questions) || obj.questions.length > 3 || obj.questions.some((q) => typeof q !== 'string' || q.length > 160)) problems.push('questions must be at most 3 short texts');
    for (const f of Array.isArray(obj.findings) ? obj.findings : []) {
      if (!f || typeof f !== 'object' || Object.keys(f).some((k) => !['line', 'code', 'severity', 'note'].includes(k))) { problems.push('a finding has fields other than line, code, severity and note'); continue; }
      if (!CODES.includes(f.code)) problems.push(`unknown code '${f.code}'`);
      if (!labels.includes(f.line)) problems.push(`unknown line '${f.line}'`);
      if (f.severity !== 'info' && f.severity !== 'warn') problems.push('severity must be info or warn');
      if (typeof f.note !== 'string' || f.note.length > 160) problems.push('a note is missing or over 160 characters');
    }
  }
  if (!problems.length) { try { assertNoLeak(JSON.stringify(obj)); } catch (e) { problems.push(`reply refused: ${e.message}`); } }
  return problems.length ? { ok: false, problems } : { ok: true, problems: [], findings: obj.findings, summary: obj.summary, questions: obj.questions };
}

/** Check one finding against the numbers. Returns 'verified' or 'not-verified'; only codes the numbers can settle are ever verified. */
export function crossCheck(finding, analysis, stated = {}) {
  const r = analysis.rows.find((x) => x.label === finding.line);
  if (!r) return 'not-verified';
  const tol = 0.05;
  switch (finding.code) {
    case 'rate-above-schedule': return stated.taxRatePct != null && r.taxRatePct > stated.taxRatePct + tol ? 'verified' : 'not-verified';
    case 'rate-below-schedule': return stated.taxRatePct != null && r.taxRatePct < stated.taxRatePct - tol ? 'verified' : 'not-verified';
    case 'benefits-above-cap': return stated.benefitsCapPct != null && r.benefitsRatePct > stated.benefitsCapPct + tol ? 'verified' : 'not-verified';
    case 'zero-deduction': return r.taxRatePct === 0 ? 'verified' : 'not-verified'; // no tax withheld on the line, whatever the benefits
    case 'rate-outlier': { const others = analysis.rows.filter((x) => x.label !== r.label).map((x) => x.taxRatePct).sort((a, b) => a - b); if (!others.length) return 'not-verified'; const med = others[Math.floor(others.length / 2)]; return Math.abs(r.taxRatePct - med) >= 5 ? 'verified' : 'not-verified'; }
    case 'unique-amount': case 'address-reused': case 'headcount-one': return analysis.flags.some((f) => f.line === r.label && f.code === finding.code) ? 'verified' : 'not-verified';
    default: return 'not-verified';
  }
}

/**
 * Review a pay run. Returns { used, advisoryOnly: true, codeFlags, findings, summary, questions, receipt?, reason? }. It never throws on a model
 * failure and never touches the run: when the review is off, refused, failed or malformed, `used` is false and the code's own flags stand.
 */
export async function reviewPayrun({ lines, rulesText = '', stated = {}, earlierAddresses = [], advisor = null, enabled = false }) {
  let built;
  try { built = buildReviewMessage({ lines, rulesText, stated, earlierAddresses }); } catch (e) { return { used: false, advisoryOnly: true, reason: `refused before sending: ${e.message}`, codeFlags: [], findings: [], summary: '', questions: [] }; }
  const { message, analysis } = built;
  const base = { advisoryOnly: true, codeFlags: analysis.flags, findings: [], summary: '', questions: [] };
  if (!enabled || !advisor) return { ...base, used: false, reason: 'the review is off' };
  const labels = analysis.rows.map((r) => r.label);
  let asked;
  try { asked = await advisor.ask({ system: SYSTEM, user: JSON.stringify(message) }); } catch (e) { return { ...base, used: false, reason: `the model could not be used: ${e.message}` }; }
  const parsed = parseReply(asked?.plaintext ?? '', labels);
  if (!parsed.ok) return { ...base, used: false, reason: `the reply was rejected: ${parsed.problems.join('; ')}` };
  const findings = parsed.findings.map((f) => ({ ...f, check: crossCheck(f, analysis, stated) }));
  const rec = asked.record || {};
  return { ...base, used: true, findings, summary: parsed.summary, questions: parsed.questions, sent: message, receipt: { model: rec.model, requestSha256: rec.requestSha256, responseSha256: rec.responseSha256, tcbStatus: rec.tcbStatus, modelPublicKey: rec.modelPublicKey } };
}
