import { loadEnvFile } from '../lib/near.js';
import { AttestedAdvisor } from '../../src/advisor/attested-advisor.js';
import { analyseRun, reviewPayrun, REVIEWER_BRIEF } from '../../src/advisor/payrun-analyst.js';

const mk = (n, person, gross, tax, benefits) => ({ person, payee: `rp${n}x7q.testnet`, invoiceId: `INV-RP-${n}`, period: '2026-11', gross, tax, benefits });
const people = (cyTax) => [mk(1, 'Alice Marrow', '0.05', '0.0075', '0.0025'), mk(2, 'Bo Venner', '0.04', '0.006', '0.002'), mk(3, 'Cy Dallimore', '0.03', cyTax, '0.0015'), mk(4, 'Dee Ashgrove', '0.06', '0.009', '0.003')];
const P = people('0'); const C = people('0.0045');
const STATED = { taxRatePct: 15, benefitsCapPct: 5 };
const RULES = 'Tax is a flat 15 percent of gross, withheld on every line. Employee benefits are capped at 5 percent of gross. All lines are for the November 2026 period. A line with no tax withheld needs a written exemption.';
const REQUIRED = ['zero-deduction', 'rate-below-schedule'];
const CHECKABLE = ['zero-deduction', 'rate-above-schedule', 'rate-below-schedule', 'benefits-above-cap', 'rate-outlier', 'unique-amount', 'address-reused', 'headcount-one'];
const FOUR = ['zero-deduction', 'rate-above-schedule', 'rate-below-schedule', 'benefits-above-cap'];
const N = 10;

export default {
  id: 'E-PAYRUN-ANALYST-REPRO-01',
  title: 'The engineered pay run reviewer, twenty times on the attested NEAR AI Cloud model: the planted mistake is caught every time, the corrected run is passed every time, and no claim is false',
  tier: 'live-external',
  requires: ['nearai-key', 'network', 'dcap-qvl'],
  hypothesis: 'Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. Ten reviews of a run with one planted mistake (a line with no tax withheld) each have a code-verified finding on that line with zero-deduction or rate-below-schedule; ten reviews of the corrected run have none of the four rule-break codes; none of the twenty has a false claim; all twenty parse on the first attempt; and the set of catches is identical across the ten.',
  limits: [
    'One model (Qwen/Qwen3.6-35B-A3B-FP8), temperature 0, two synthetic runs of four lines, run from this machine.',
    'It shows repeatability on this input, not general accuracy on payroll. The mistake is planted and is of a kind the brief names.',
    'The model has no authority on tax law and is told to reason only from the employer\'s rules.',
  ],
  async run(ctx) {
    const apiKey = loadEnvFile(ctx.rootDir).NEARAI_API_KEY || process.env.NEARAI_API_KEY;
    const real = new AttestedAdvisor({ apiKey });
    const cyLabel = analyseRun({ lines: P }).rows[2].label;
    const results = { P: [], C: [] };
    await ctx.step(`ask the attested model ${N} times on each run, with no retry`, async (s) => {
      s.observe('the brief (characters)', REVIEWER_BRIEF.length);
      for (const [name, lines] of [['P', P], ['C', C]]) {
        for (let i = 0; i < N; i += 1) {
          const out = await reviewPayrun({ lines, rulesText: RULES, stated: STATED, advisor: real, enabled: true });
          results[name].push(out);
          s.observe(`${name}${i + 1}`, out.used ? out.findings.map((f) => `${f.line}:${f.code}:${f.check}`).join(' ') || 'no findings' : `NOT USED: ${out.reason}`);
        }
      }
      s.assert(`all ${2 * N} replies were used on the first attempt`, [...results.P, ...results.C].every((r) => r.used), { actual: [...results.P, ...results.C].filter((r) => !r.used).map((r) => r.reason) });
    }, { critical: true });

    await ctx.step('prediction 1 to 5: caught every time, passed every time, no false claims, the same set', async (s) => {
      const caught = (r) => r.used && r.findings.some((f) => f.line === cyLabel && REQUIRED.includes(f.code) && f.check === 'verified');
      s.assert(`the planted mistake (line ${cyLabel}) is caught in ${N} of ${N} reviews`, results.P.filter(caught).length === N, { actual: results.P.filter(caught).length });
      const falseClaims = [...results.P, ...results.C].flatMap((r) => (r.used ? r.findings : [])).filter((f) => CHECKABLE.includes(f.code) && f.check !== 'verified');
      s.assert('no review contains a false claim (a checkable finding the code marks not verified)', falseClaims.length === 0, { actual: falseClaims });
      const cleanBreaks = results.C.filter((r) => r.used && r.findings.some((f) => FOUR.includes(f.code)));
      s.assert(`the corrected run is passed in ${N} of ${N} reviews (none of the four rule-break codes)`, cleanBreaks.length === 0, { actual: cleanBreaks.map((r) => r.findings) });
      const setOf = (r) => JSON.stringify([...new Set(r.findings.filter((f) => FOUR.includes(f.code) && f.check === 'verified').map((f) => `${f.line}:${f.code}`))].sort());
      const pSets = new Set(results.P.filter((r) => r.used).map(setOf)); const cSets = new Set(results.C.filter((r) => r.used).map(setOf));
      s.observe('distinct catch sets on P', [...pSets]); s.observe('distinct catch sets on C', [...cSets]);
      s.assert('the set of catches is identical across the ten reviews of the planted run', pSets.size === 1, { actual: [...pSets] });
      s.assert('and empty across the ten reviews of the corrected run', cSets.size === 1 && cSets.has('[]'), { actual: [...cSets] });
    });
  },
};
