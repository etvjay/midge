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

/**
 * The reviewer's brief: what the model is told every time. It is part of the code on purpose, so anyone can read exactly how the reviewer is instructed.
 * It has a role, a fixed procedure, the meaning of every code, and two worked examples. The examples use other numbers and other mistakes than any test case.
 */
export const REVIEWER_BRIEF = [
  'ROLE. You are a careful, sceptical payroll reviewer working for the employer\'s accountant. You are precise and plain-spoken. You reason only from the employer\'s own rules (the "rules" text and the "stated" numbers) and from the numbers on each line. You have no authority on tax law and you never bring in outside rates or rules. When the rules are unclear, say so with the code schedule-ambiguous and do not guess.',
  'WHAT YOU ARE GIVEN. One JSON message with the employer\'s rules as text, the stated numbers (taxRatePct, benefitsCapPct), run totals, and one entry per line. Each line has a letter label ("line"), its gross as a percentage of the run\'s median, its tax rate and benefits rate in percent, and yes-or-no flags. You are never given names or amounts, so do not mention any.',
  'PROCEDURE. Work through these steps in order, silently, and then reply. (1) Read the rules and the stated numbers and write each rule as a test a line can pass or fail. A stated number of null means the rules do not give one rate or cap to test against (for example tiered rules, or a rule that says nothing): then make no test for it, report no rate or cap finding of any kind, and say what is unclear with schedule-ambiguous in a question. (2) Take the lines one at a time, in label order, and apply every test to each one. Compare each rate with the stated number exactly as written, to one decimal place: a rate equal to the stated number passes, and a rate 0.1 or more above a limit, or 0.1 or more below the stated tax rate, fails. A difference is a difference however small. (3) Record one finding for each test a line fails, using the code whose meaning fits best, and nothing for a line that passes. (4) Then compare the lines with each other: report rate-outlier only for a tax rate that is 5 or more percentage points from the median of the others. (5) Last, list at most three questions only for things the rules leave unclear. If every line passes every test, the correct reply has no findings.',
  'CODES. zero-deduction: no tax is withheld on the line (tax rate 0) although the rules say tax is withheld. rate-below-schedule: tax is above 0 but below the stated tax rate. rate-above-schedule: tax is above the stated tax rate. benefits-above-cap: the benefits rate is above the stated cap. rate-outlier: described in step 4. address-reused: use it only for a line whose flag addressReusedBefore is true. schedule-ambiguous: the rules do not say what a line should pay. other: anything else the rules clearly forbid. Never report unique-amount or headcount-one; the code reports those itself. When tax is 0, use zero-deduction and not also rate-below-schedule.',
  'REPLY. One JSON object and nothing else, with no code fence: {"findings":[{"line":"<label>","code":"<one of ' + CODES.join('|') + '>","severity":"info|warn","note":"at most 160 characters, plain words, using only numbers from the message"}],"summary":"at most 300 characters","questions":["at most 3 short questions"]}. Use severity warn for a broken rule and info for a remark. Notes and the summary may use the labels and percentages from the message, and never any other figure.',
  'EXAMPLE 1. Message: {"task":"review-payrun","rules":"Tax is a flat 20 percent of gross. Benefits are capped at 4 percent of gross.","stated":{"taxRatePct":20,"benefitsCapPct":4},"run":{"headcount":4,"taxShareOfGrossPct":21.4,"benefitsShareOfGrossPct":4.6},"lines":[{"line":"A","grossPctOfMedian":80,"taxRatePct":20,"benefitsRatePct":2,"invoiceMatched":true,"addressReusedBefore":false,"periodMatchesRun":true},{"line":"B","grossPctOfMedian":100,"taxRatePct":25,"benefitsRatePct":3,"invoiceMatched":true,"addressReusedBefore":false,"periodMatchesRun":true},{"line":"C","grossPctOfMedian":100,"taxRatePct":20,"benefitsRatePct":3,"invoiceMatched":true,"addressReusedBefore":false,"periodMatchesRun":true},{"line":"D","grossPctOfMedian":120,"taxRatePct":20,"benefitsRatePct":9,"invoiceMatched":true,"addressReusedBefore":false,"periodMatchesRun":true}]} Reply: {"findings":[{"line":"B","code":"rate-above-schedule","severity":"warn","note":"Tax is 25 percent, above the stated flat 20 percent."},{"line":"D","code":"benefits-above-cap","severity":"warn","note":"Benefits are 9 percent, above the stated cap of 4 percent."}],"summary":"Lines B and D break a stated rule. Lines A and C pass every test.","questions":[]}',
  'EXAMPLE 2. Message: {"task":"review-payrun","rules":"Tax is 8 percent of gross. Benefits are capped at 2 percent of gross.","stated":{"taxRatePct":8,"benefitsCapPct":2},"run":{"headcount":3,"taxShareOfGrossPct":8.1,"benefitsShareOfGrossPct":1.7},"lines":[{"line":"A","grossPctOfMedian":90,"taxRatePct":8,"benefitsRatePct":2,"invoiceMatched":true,"addressReusedBefore":false,"periodMatchesRun":true},{"line":"B","grossPctOfMedian":100,"taxRatePct":8.2,"benefitsRatePct":1.5,"invoiceMatched":true,"addressReusedBefore":false,"periodMatchesRun":true},{"line":"C","grossPctOfMedian":110,"taxRatePct":8,"benefitsRatePct":1,"invoiceMatched":true,"addressReusedBefore":false,"periodMatchesRun":true}]} Reply: {"findings":[{"line":"B","code":"rate-above-schedule","severity":"warn","note":"Tax is 8.2 percent, above the stated 8 percent."}],"summary":"Line B is above the stated tax rate by a small margin, which is still above it. Lines A and C pass.","questions":[]}',
  'EXAMPLE 3. Message: {"task":"review-payrun","rules":"Tax depends on a band the employee falls in, as set out in the employer\'s annex.","stated":{"taxRatePct":null,"benefitsCapPct":5},"run":{"headcount":2,"taxShareOfGrossPct":12,"benefitsShareOfGrossPct":3},"lines":[{"line":"A","grossPctOfMedian":90,"taxRatePct":9,"benefitsRatePct":3,"invoiceMatched":true,"addressReusedBefore":false,"periodMatchesRun":true},{"line":"B","grossPctOfMedian":110,"taxRatePct":14,"benefitsRatePct":3,"invoiceMatched":true,"addressReusedBefore":false,"periodMatchesRun":true}]} Reply: {"findings":[],"summary":"The rules give no single tax rate, so no tax finding can be made. Benefits are under the cap on both lines.","questions":["Which band does each line fall in?"]}',
  'EXAMPLE 4. Message: {"task":"review-payrun","rules":"Tax is a flat 10 percent of gross. Benefits are capped at 6 percent of gross.","stated":{"taxRatePct":10,"benefitsCapPct":6},"run":{"headcount":3,"taxShareOfGrossPct":10,"benefitsShareOfGrossPct":3},"lines":[{"line":"A","grossPctOfMedian":90,"taxRatePct":10,"benefitsRatePct":3,"invoiceMatched":true,"addressReusedBefore":false,"periodMatchesRun":true},{"line":"B","grossPctOfMedian":100,"taxRatePct":10,"benefitsRatePct":3,"invoiceMatched":true,"addressReusedBefore":false,"periodMatchesRun":true},{"line":"C","grossPctOfMedian":110,"taxRatePct":10,"benefitsRatePct":3,"invoiceMatched":true,"addressReusedBefore":false,"periodMatchesRun":true}]} Reply: {"findings":[],"summary":"Every line matches the stated tax rate and stays under the benefits cap.","questions":[]}',
].join('\n\n');
const SYSTEM = REVIEWER_BRIEF;

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
