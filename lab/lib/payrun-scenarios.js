/**
 * Scenarios for scoring the pay run reviewer, with the right answer worked out by code from the numbers the model is given.
 *
 *   devScenarios()       hand-designed cases plus runs from seed 1: may be used to improve the reviewer's brief
 *   heldOutScenarios()   runs from seed 2: never used while improving; run once, after the brief is final
 *   score(scenario, outcome)   how one review did against the right answer
 *
 * The oracle reads the same rounded numbers the model is given (rates to a tenth of a percent). A tax of 0 is a zero-deduction; a rate more than 0.05
 * points under the stated rate is rate-below-schedule; more than 0.05 over is rate-above-schedule; a benefits rate more than 0.05 over the stated cap is
 * benefits-above-cap. A number exactly at the limit passes. Stated numbers of null mean the rules cannot be applied and nothing is required.
 */
import { analyseRun } from '../../src/advisor/payrun-analyst.js';

export const FOUR = ['zero-deduction', 'rate-above-schedule', 'rate-below-schedule', 'benefits-above-cap'];
export const CHECKABLE = [...FOUR, 'rate-outlier', 'unique-amount', 'address-reused', 'headcount-one'];
const TOL = 0.05;

const rngOf = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
const f6 = (n) => n.toFixed(6).replace(/0+$/, '').replace(/\.$/, '') || '0';

const T = [
  (t, c) => `Tax is a flat ${t} percent of gross, withheld on every line.${c === null ? '' : ` Employee benefits are capped at ${c} percent of gross.`} All lines are for the November 2026 period. A line with no tax withheld needs a written exemption.`,
  (t, c) => `Withhold ${t}% income tax from each payee's gross pay.${c === null ? '' : ` Benefits contributions may not exceed ${c}% of gross.`}`,
  (t, c) => `Policy: every payee is taxed at a single rate of ${t} percent.${c === null ? '' : ` Employer-matched benefits are limited to ${c} percent of each payee's gross.`}`,
];

/** A line from a gross, a tax rate and a benefits rate in percent. */
const line = (i, gross, taxPct, benPct, extra = {}) => ({ person: `Person${i}`, payee: `ln${i}x${Math.round(gross * 1000)}.testnet`, invoiceId: `INV-S-${i}`, period: '2026-11', gross: f6(gross), tax: f6(gross * taxPct / 100), benefits: f6(gross * benPct / 100), ...extra });

const normal = (i, gross, t, c) => line(i, gross, t, c === null ? 3 : Math.max(0, c - 1));
const mutate = (i, gross, t, c, kind) => {
  if (kind === 'zero') return line(i, gross, 0, c === null ? 3 : Math.max(0, c - 1));
  if (kind === 'above') return line(i, gross, t + 3, c === null ? 3 : Math.max(0, c - 1));
  if (kind === 'below') return line(i, gross, Math.max(1, t - 4), c === null ? 3 : Math.max(0, c - 1));
  return line(i, gross, t, (c ?? 5) + 3);
};

export function oracle({ lines, stated, earlierAddresses = [] }) {
  const a = analyseRun({ lines, earlierAddresses });
  const required = []; // each: { line, anyOf: [codes] }
  a.rows.forEach((r) => {
    if (stated.taxRatePct !== null && stated.taxRatePct !== undefined) {
      if (r.taxRatePct === 0 && stated.taxRatePct > 0) required.push({ line: r.label, anyOf: ['zero-deduction', 'rate-below-schedule'] });
      else if (r.taxRatePct < stated.taxRatePct - TOL) required.push({ line: r.label, anyOf: ['rate-below-schedule'] });
      else if (r.taxRatePct > stated.taxRatePct + TOL) required.push({ line: r.label, anyOf: ['rate-above-schedule'] });
    }
    if (stated.benefitsCapPct !== null && stated.benefitsCapPct !== undefined && r.benefitsRatePct > stated.benefitsCapPct + TOL) required.push({ line: r.label, anyOf: ['benefits-above-cap'] });
  });
  return { labels: a.rows.map((r) => r.label), required, analysis: a };
}

const mkScenario = (id, kind, lines, { rules, stated, earlierAddresses = [] }) => ({ id, kind, lines, rules, stated, earlierAddresses });

export function devScenarios() {
  const S = []; const T15 = { taxRatePct: 15, benefitsCapPct: 5 };
  const r15 = T[0](15, 5);
  const base = (n, t = 15, c = 5) => Array.from({ length: n }, (_, i) => normal(i + 1, 0.05 + 0.01 * i, t, c));
  const withAt = (ls, idx, mk) => ls.map((l, i) => (i === idx ? mk : l));
  S.push(mkScenario('hand-tax-above', 'mistake', withAt(base(4), 1, mutate(2, 0.06, 15, 5, 'above')), { rules: r15, stated: T15 }));
  S.push(mkScenario('hand-tax-below', 'mistake', withAt(base(4), 2, mutate(3, 0.07, 15, 5, 'below')), { rules: r15, stated: T15 }));
  S.push(mkScenario('hand-tax-zero', 'mistake', withAt(base(4), 0, mutate(1, 0.05, 15, 5, 'zero')), { rules: r15, stated: T15 }));
  S.push(mkScenario('hand-benefits-above', 'mistake', withAt(base(4), 3, mutate(4, 0.08, 15, 5, 'benefits')), { rules: r15, stated: T15 }));
  S.push(mkScenario('hand-two-mistakes', 'mistake', withAt(withAt(base(5), 0, mutate(1, 0.05, 15, 5, 'zero')), 3, mutate(4, 0.08, 15, 5, 'benefits')), { rules: r15, stated: T15 }));
  S.push(mkScenario('hand-three-mistakes', 'mistake', withAt(withAt(withAt(base(6), 0, mutate(1, 0.05, 15, 5, 'above')), 2, mutate(3, 0.07, 15, 5, 'below')), 5, mutate(6, 0.1, 15, 5, 'benefits')), { rules: r15, stated: T15 }));
  S.push(mkScenario('hand-all-broken', 'mistake', [mutate(1, 0.05, 15, 5, 'zero'), mutate(2, 0.06, 15, 5, 'above'), mutate(3, 0.07, 15, 5, 'below'), mutate(4, 0.08, 15, 5, 'benefits')], { rules: r15, stated: T15 }));
  S.push(mkScenario('hand-one-line-clean', 'clean', [normal(1, 0.05, 15, 5)], { rules: r15, stated: T15 }));
  S.push(mkScenario('hand-one-line-zero', 'mistake', [mutate(1, 0.05, 15, 5, 'zero')], { rules: r15, stated: T15 }));
  S.push(mkScenario('hand-eight-clean', 'clean', base(8), { rules: r15, stated: T15 }));
  S.push(mkScenario('hand-eight-three-mistakes', 'mistake', withAt(withAt(withAt(base(8), 1, mutate(2, 0.06, 15, 5, 'zero')), 4, mutate(5, 0.09, 15, 5, 'above')), 7, mutate(8, 0.12, 15, 5, 'benefits')), { rules: r15, stated: T15 }));
  S.push(mkScenario('hand-boundary-exact-pass', 'clean', [line(1, 0.05, 15, 5), line(2, 0.06, 15, 5), line(3, 0.07, 15, 4.9), line(4, 0.08, 15, 5)], { rules: r15, stated: T15 }));
  S.push(mkScenario('hand-tax-point-one-over', 'mistake', [line(1, 0.05, 15, 3), line(2, 0.06, 15.1, 3), line(3, 0.07, 15, 3)], { rules: r15, stated: T15 }));
  S.push(mkScenario('hand-benefits-point-one-over', 'mistake', [line(1, 0.05, 15, 3), line(2, 0.06, 15, 5.1), line(3, 0.07, 15, 3)], { rules: r15, stated: T15 }));
  S.push(mkScenario('hand-two-codes-one-line', 'mistake', [line(1, 0.05, 15, 3), line(2, 0.06, 10, 9), line(3, 0.07, 15, 3)], { rules: r15, stated: T15 }));
  S.push(mkScenario('hand-no-cap-rules', 'clean', [line(1, 0.05, 15, 3), line(2, 0.06, 15, 12), line(3, 0.07, 15, 7)], { rules: T[0](15, null), stated: { taxRatePct: 15, benefitsCapPct: null } }));
  S.push(mkScenario('hand-phrasing-2', 'mistake', withAt(base(4, 20, 6), 2, mutate(3, 0.07, 20, 6, 'above')), { rules: T[1](20, 6), stated: { taxRatePct: 20, benefitsCapPct: 6 } }));
  S.push(mkScenario('hand-phrasing-3', 'mistake', withAt(base(4, 12, 4), 1, mutate(2, 0.06, 12, 4, 'zero')), { rules: T[2](12, 4), stated: { taxRatePct: 12, benefitsCapPct: 4 } }));
  S.push(mkScenario('hand-address-reused', 'clean', base(4), { rules: r15, stated: T15, earlierAddresses: [base(4)[1].payee] }));
  S.push(mkScenario('hand-invoice-period-flags', 'clean', base(3).map((l, i) => (i === 1 ? { ...l, invoiceMatched: false } : i === 2 ? { ...l, periodMatches: false } : l)), { rules: r15, stated: T15 }));
  S.push(mkScenario('hand-tiered-rules-unclear', 'unclear', [line(1, 0.05, 10, 3), line(2, 0.12, 14, 3), line(3, 0.2, 18, 3)], { rules: 'Tax is 10 percent of the first 0.04 of gross and 20 percent of anything above that. Employee benefits are capped at 5 percent of gross.', stated: { taxRatePct: null, benefitsCapPct: 5 } }));
  S.push(mkScenario('hand-silent-tax-rule', 'unclear', [line(1, 0.05, 15, 3), line(2, 0.06, 0, 3), line(3, 0.07, 20, 3)], { rules: 'Pay each person their gross less their benefits contribution.', stated: { taxRatePct: null, benefitsCapPct: null } }));
  return [...S, ...generated(1, 20, 'dev')];
}

export function heldOutScenarios() { return generated(2, 30, 'held'); }

/** Sixteen hand-designed hard cases, never seen while the brief was improved. The last four cannot be scored (the rules cannot be applied or disagree with themselves). */
export function hardScenarios() {
  const S = []; const mk = (id, kind, lines, rules, stated, extra = {}) => S.push(mkScenario(id, kind, lines, { rules, stated, ...extra }));
  mk('hard-tax-point-one-under', 'mistake', [line(1, 0.04, 18, 4), line(2, 0.05, 17.9, 4), line(3, 0.06, 18, 4), line(4, 0.07, 18, 4)], T[1](18, 4), { taxRatePct: 18, benefitsCapPct: 4 });
  mk('hard-benefits-point-one-over', 'mistake', [line(1, 0.04, 20, 3), line(2, 0.05, 20, 6.1), line(3, 0.06, 20, 5.9)], T[2](20, 6), { taxRatePct: 20, benefitsCapPct: 6 });
  mk('hard-benefits-exactly-at-cap', 'clean', [line(1, 0.04, 12, 4), line(2, 0.05, 12, 4), line(3, 0.06, 12, 3.9), line(4, 0.07, 12, 4)], T[0](12, 4), { taxRatePct: 12, benefitsCapPct: 4 });
  mk('hard-two-lines-no-tax', 'mistake', [line(1, 0.04, 0, 2), line(2, 0.05, 10, 2), line(3, 0.06, 0, 2), line(4, 0.07, 10, 2)], T[0](10, 5), { taxRatePct: 10, benefitsCapPct: 5 });
  mk('hard-extreme-tax-rate', 'mistake', [line(1, 0.04, 15, 3), line(2, 0.05, 60, 3), line(3, 0.06, 15, 3)], T[1](15, 5), { taxRatePct: 15, benefitsCapPct: 5 });
  mk('hard-no-benefits-at-all', 'clean', [line(1, 0.04, 15, 0), line(2, 0.05, 15, 0), line(3, 0.06, 15, 0)], T[0](15, 5), { taxRatePct: 15, benefitsCapPct: 5 });
  mk('hard-stated-tax-zero', 'mistake', [line(1, 0.04, 0, 3), line(2, 0.05, 0, 3), line(3, 0.06, 2, 3)], 'No income tax is withheld in this jurisdiction. Benefits are capped at 5 percent of gross.', { taxRatePct: 0, benefitsCapPct: 5 });
  mk('hard-cap-zero', 'mistake', [line(1, 0.04, 15, 0), line(2, 0.05, 15, 0.5), line(3, 0.06, 15, 0)], 'Tax is a flat 15 percent of gross. No benefits may be paid through this run.', { taxRatePct: 15, benefitsCapPct: 0 });
  mk('hard-fractional-rate', 'mistake', [line(1, 0.04, 12.5, 3), line(2, 0.05, 12.6, 3), line(3, 0.06, 12.5, 3)], 'Tax is a flat 12.5 percent of gross. Benefits are capped at 4 percent of gross.', { taxRatePct: 12.5, benefitsCapPct: 4 });
  mk('hard-identical-lines', 'clean', [line(1, 0.05, 15, 3), line(2, 0.05, 15, 3), line(3, 0.05, 15, 3), line(4, 0.05, 15, 3)], T[0](15, 5), { taxRatePct: 15, benefitsCapPct: 5 });
  mk('hard-very-different-gross', 'clean', [line(1, 0.002, 15, 3), line(2, 0.05, 15, 3), line(3, 0.5, 15, 3)], T[1](15, 5), { taxRatePct: 15, benefitsCapPct: 5 });
  mk('hard-larger-mixed-run', 'mistake', [line(1, 0.03, 25, 7), line(2, 0.04, 0, 7), line(3, 0.05, 25, 8), line(4, 0.06, 31, 7), line(5, 0.07, 25, 12), line(6, 0.08, 25, 7), line(7, 0.09, 20, 8), line(8, 0.1, 25, 7)], T[0](25, 8), { taxRatePct: 25, benefitsCapPct: 8 });
  mk('hard-unclear-contractors', 'unclear', [line(1, 0.04, 15, 3), line(2, 0.05, 15, 3), line(3, 0.06, 0, 3), line(4, 0.07, 15, 3)], 'Tax is 15 percent of gross for employees and 0 percent for contractors.', { taxRatePct: null, benefitsCapPct: null });
  mk('hard-unclear-approximately', 'unclear', [line(1, 0.04, 14.9, 3), line(2, 0.05, 15.2, 3), line(3, 0.06, 15, 3)], 'Tax is approximately 15 percent of gross. Benefits are capped at 5 percent of gross.', { taxRatePct: 15, benefitsCapPct: 5 });
  mk('hard-unclear-rules-disagree', 'unclear', [line(1, 0.04, 15, 3), line(2, 0.05, 15, 3), line(3, 0.06, 15, 3)], 'Tax is a flat 20 percent of gross. Benefits are capped at 5 percent of gross.', { taxRatePct: 15, benefitsCapPct: 5 });
  mk('hard-unclear-exemption', 'unclear', [line(1, 0.04, 15, 3), line(2, 0.05, 0, 3), line(3, 0.06, 15, 3)], 'Tax is 15 percent of gross, except for people the employer has exempted in writing. Benefits are capped at 5 percent of gross.', { taxRatePct: 15, benefitsCapPct: 5 });
  return S;
}

function generated(seed, n, tag) {
  const rnd = rngOf(seed * 7919); const out = [];
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  for (let k = 0; k < n; k += 1) {
    const taxPct = pick([10, 12, 15, 18, 20, 25]); const capPct = rnd() < 0.12 ? null : pick([3, 4, 5, 6, 8]);
    const count = 2 + Math.floor(rnd() * 7);
    const lines = []; const kinds = ['zero', 'above', 'below', 'benefits'];
    const mistakeRate = rnd() < 0.3 ? 0 : 0.35;
    for (let i = 0; i < count; i += 1) {
      const gross = 0.02 + 0.005 * Math.floor(rnd() * 36);
      const roll = rnd();
      if (roll < mistakeRate) { const kind = pick(capPct === null ? kinds.filter((x) => x !== 'benefits') : kinds); lines.push(mutate(i + 1, gross, taxPct, capPct, kind)); }
      else if (roll < mistakeRate + 0.12 && capPct !== null) lines.push(line(i + 1, gross, taxPct, capPct)); // exactly at the cap: passes
      else lines.push(normal(i + 1, gross, taxPct, capPct));
    }
    const sc = mkScenario(`${tag}-gen-${k + 1}`, 'generated', lines, { rules: pick(T)(taxPct, capPct), stated: { taxRatePct: taxPct, benefitsCapPct: capPct } });
    sc.kind = oracle(sc).required.length === 0 ? 'clean' : 'mistake';
    out.push(sc);
  }
  return out;
}

/** How one review did. `outcome` is what reviewPayrun returned. */
export function score(scenario, outcome) {
  const o = oracle(scenario);
  const base = { id: scenario.id, kind: scenario.kind, planted: o.required.length, caught: 0, ruleFindings: 0, matching: 0, checkable: 0, falseClaims: 0, extraVerified: 0, used: !!outcome.used };
  if (!outcome.used) return { ...base, cleanOK: null };
  const fs = outcome.findings;
  for (const r of o.required) if (fs.some((f) => f.line === r.line && r.anyOf.includes(f.code) && f.check === 'verified')) base.caught += 1;
  for (const f of fs) {
    if (FOUR.includes(f.code)) { base.ruleFindings += 1; if (o.required.some((r) => r.line === f.line && r.anyOf.includes(f.code))) base.matching += 1; }
    if (CHECKABLE.includes(f.code)) { base.checkable += 1; if (f.check !== 'verified') base.falseClaims += 1; }
  }
  const cleanOK = o.required.length === 0 ? base.ruleFindings === 0 : null;
  return { ...base, cleanOK, missed: o.required.filter((r) => !fs.some((f) => f.line === r.line && r.anyOf.includes(f.code) && f.check === 'verified')), spurious: fs.filter((f) => FOUR.includes(f.code) && !o.required.some((r) => r.line === f.line && r.anyOf.includes(f.code))).map((f) => `${f.line}:${f.code}:${f.check}`) };
}

export function aggregate(scores) {
  const sum = (k) => scores.reduce((a, s) => a + (s[k] || 0), 0);
  const used = scores.filter((s) => s.used);
  const clean = scores.filter((s) => s.used && s.cleanOK !== null && s.kind !== 'unclear');
  const unclear = scores.filter((s) => s.kind === 'unclear' && s.used);
  const mainScores = scores.filter((s) => s.kind !== 'unclear');
  const planted = mainScores.reduce((a, s) => a + s.planted, 0); const caught = mainScores.reduce((a, s) => a + s.caught, 0);
  const rule = mainScores.reduce((a, s) => a + s.ruleFindings, 0); const match = mainScores.reduce((a, s) => a + s.matching, 0);
  const checkable = sum('checkable'); const falseClaims = sum('falseClaims');
  return {
    reviews: scores.length, parsed: used.length, parseRate: scores.length ? used.length / scores.length : 1,
    planted, caught, recall: planted ? caught / planted : 1,
    ruleFindings: rule, matching: match, precision: rule ? match / rule : 1,
    checkable, falseClaims, falseClaimRate: checkable ? falseClaims / checkable : 0,
    cleanRuns: clean.length, cleanOK: clean.filter((s) => s.cleanOK).length, cleanRate: clean.length ? clean.filter((s) => s.cleanOK).length / clean.length : 1,
    unclearRuns: unclear.length, unclearOverreach: unclear.filter((s) => s.ruleFindings > 0).length,
  };
}
