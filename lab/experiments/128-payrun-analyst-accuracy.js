import { loadEnvFile } from '../lib/near.js';
import { AttestedAdvisor } from '../../src/advisor/attested-advisor.js';
import { reviewPayrun, REVIEWER_BRIEF } from '../../src/advisor/payrun-analyst.js';
import { devScenarios, heldOutScenarios, hardScenarios, score, aggregate } from '../lib/payrun-scenarios.js';
import crypto from 'node:crypto';

const SET = ['held', 'hard'].includes(process.env.MIDGE_ACCURACY_SET) ? process.env.MIDGE_ACCURACY_SET : 'dev';
const BAR = SET === 'hard' ? { recall: 0.9, precision: 0.9, falseClaims: 0.05, clean: 0.9, parse: 0.95 } : { recall: 0.95, precision: 0.95, falseClaims: 0.02, clean: 0.95, parse: 0.95 };
const pct = (x) => `${(x * 100).toFixed(1)}%`;

export default {
  id: 'E-PAYRUN-ANALYST-ACCURACY-01',
  title: `Does the pay run reviewer make mistakes that break accuracy? A scored test across many runs (${{ held: 'held-out set', hard: 'hard held-out set', dev: 'development set' }[SET]})`,
  tier: 'live-external',
  requires: ['nearai-key', 'network', 'dcap-qvl'],
  hypothesis: 'Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. Scored against right answers worked out by code from the numbers, the reviewer catches at least 95 percent of planted mistakes, at least 95 percent of its rule-break findings are about a line and a code the code agrees with, at most 2 percent of its checkable findings are marked not verified, at least 95 percent of clean runs have no rule-break finding, and at least 95 percent of replies parse on the first attempt.',
  limits: [
    'One model (Qwen/Qwen3.6-35B-A3B-FP8) at temperature 0, synthetic runs of 1 to 8 lines, one review per run, from this machine.',
    'The right answers come from code that reads the same rounded numbers the model is given, so the test measures rule application, not real payroll judgement.',
    'The development set may have been used to improve the brief; only the held-out numbers are an honest estimate, and they are not re-run.',
  ],
  async run(ctx) {
    const apiKey = loadEnvFile(ctx.rootDir).NEARAI_API_KEY || process.env.NEARAI_API_KEY;
    const inner = new AttestedAdvisor({ apiKey });
    let transportRetries = 0;
    // A dropped connection is retried (at most twice). A reply the model gives is never retried, however wrong.
    const real = { ask: async (x) => { for (let attempt = 1; ; attempt += 1) { try { return await inner.ask(x); } catch (e) { if (attempt < 3 && /fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|HTTP 5\d\d/.test(String(e?.message ?? e))) { transportRetries += 1; await new Promise((r) => setTimeout(r, 2000 * attempt)); continue; } throw e; } } } };
    const scenarios = SET === 'hard' ? hardScenarios() : SET === 'held' ? heldOutScenarios() : devScenarios();
    const scores = new Array(scenarios.length);
    await ctx.step(`review ${scenarios.length} ${SET} runs, one review each, no retry, and score each against the right answer`, async (s) => {
      s.observe('set', SET); s.observe('brief sha256', crypto.createHash('sha256').update(REVIEWER_BRIEF).digest('hex')); s.observe('brief characters', REVIEWER_BRIEF.length);
      let next = 0;
      const worker = async () => { while (next < scenarios.length) { const i = next; next += 1; const sc = scenarios[i]; const out = await reviewPayrun({ lines: sc.lines, rulesText: sc.rules, stated: sc.stated, earlierAddresses: sc.earlierAddresses, advisor: real, enabled: true }); scores[i] = { ...score(sc, out), reason: out.used ? undefined : out.reason }; } };
      await Promise.all([worker(), worker()]);
      for (const sc of scores) s.observe(sc.id, `${sc.kind} planted ${sc.planted} caught ${sc.caught} rule-findings ${sc.ruleFindings} matching ${sc.matching} false ${sc.falseClaims}${sc.used ? '' : ` NOT USED: ${sc.reason}`}${sc.missed?.length ? ` MISSED ${sc.missed.map((m) => `${m.line}:${m.anyOf[0]}`).join(',')}` : ''}${sc.spurious?.length ? ` SPURIOUS ${sc.spurious.join(',')}` : ''}`);
      s.observe('transport retries (network failures only)', transportRetries);
      s.assert(`all ${scenarios.length} scores were recorded`, scores.every(Boolean));
    }, { critical: true });
    await ctx.step('the bars set in the plan before the run', async (s) => {
      const a = aggregate(scores);
      s.observe('aggregate', a);
      s.observe('unclear-rule runs where the reviewer reported a rule break (no bar)', `${a.unclearOverreach} of ${a.unclearRuns}`);
      s.assert(`recall: at least ${BAR.recall * 100} percent of planted mistakes are caught (${a.caught} of ${a.planted}, ${pct(a.recall)})`, a.recall >= BAR.recall, { actual: a.recall });
      s.assert(`precision: at least ${BAR.precision * 100} percent of rule-break findings match the right answer (${a.matching} of ${a.ruleFindings}, ${pct(a.precision)})`, a.precision >= BAR.precision, { actual: a.precision });
      s.assert(`false claims: at most ${BAR.falseClaims * 100} percent of checkable findings are marked not verified (${a.falseClaims} of ${a.checkable}, ${pct(a.falseClaimRate)})`, a.falseClaimRate <= BAR.falseClaims, { actual: a.falseClaimRate });
      s.assert(`clean runs: at least ${BAR.clean * 100} percent have no rule-break finding (${a.cleanOK} of ${a.cleanRuns}, ${pct(a.cleanRate)})`, a.cleanRate >= BAR.clean, { actual: a.cleanRate });
      s.assert(`parsing: at least ${BAR.parse * 100} percent of replies parse on the first attempt (${a.parsed} of ${a.reviews}, ${pct(a.parseRate)})`, a.parseRate >= BAR.parse, { actual: a.parseRate });
    });
  },
};
