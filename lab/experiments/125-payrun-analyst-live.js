import { loadEnvFile } from '../lib/near.js';
import { AttestedAdvisor, checkReceipt } from '../../src/advisor/attested-advisor.js';
import { assertNoLeak } from '../../src/advisor/preflight-explainer.js';
import { analyseRun, reviewPayrun, secretsOf } from '../../src/advisor/payrun-analyst.js';

const mk = (n, person, gross, tax, benefits) => ({ person, payee: `pr${n}x9k.testnet`, invoiceId: `INV-2026-11-${n}`, period: '2026-11', gross, tax, benefits });
const LINES = [
  mk(1, 'Wilhelmina Aldridge', '100', '20', '3'),
  mk(2, 'Tiberius Okafor', '100', '20', '3'),
  mk(3, 'Seraphina Lindqvist', '100', '20', '3'),
  mk(4, 'Casimir Brightwater', '100', '0', '3'),
  mk(5, 'Ottoline Vandermeer', '100', '20', '9'),
  mk(6, 'Barnaby Castellanos', '260', '52', '6'),
];
const STATED = { taxRatePct: 20, benefitsCapPct: 5 };
const RULES = 'Tax is a flat 20 percent of gross, withheld on every line. Employee benefits are capped at 5 percent of gross. All lines are for the November 2026 period. A line with no tax withheld needs a written exemption.';

export default {
  id: 'E-PAYRUN-ANALYST-LIVE-01',
  title: 'The pay run review against the real attested NEAR AI Cloud model: planted problems are found and cross-checked, nothing identifying is sent',
  tier: 'live-external',
  requires: ['nearai-key', 'network', 'dcap-qvl'],
  hypothesis: 'Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. The attested gateway answers and its record verifies; the reply parses in the fixed shape on the first try or after one retry; the missing deduction and the benefits cap are reported on the right lines and verify; every verified finding is true; nothing identifying is in the request.',
  limits: [
    'One model (Qwen/Qwen3.6-35B-A3B-FP8), one synthetic run of six lines, run from this machine and not inside the hosted Roost VM.',
    'The model has no authority on tax law and is asked to reason from the employer\'s text only. Whether its notes are useful to an accountant is not measured.',
    'The model still learns bands, rates, the employer\'s rule text and that a pay run is being reviewed.',
  ],
  async run(ctx) {
    const apiKey = loadEnvFile(ctx.rootDir).NEARAI_API_KEY || process.env.NEARAI_API_KEY;
    const a = analyseRun({ lines: LINES });
    const labelOf = (i) => a.rows[i].label;
    const secrets = secretsOf({ lines: LINES });
    let record = null; let out = null; let attempts = 0;

    await ctx.step('prediction 1, 2 and 5: ask the attested model, with at most one retry, from the redacted message', async (s) => {
      const real = new AttestedAdvisor({ apiKey });
      const capturing = { ask: async (x) => { const r = await real.ask(x); record = r.record; return r; } };
      for (attempts = 1; attempts <= 2; attempts += 1) {
        out = await reviewPayrun({ lines: LINES, rulesText: RULES, stated: STATED, advisor: capturing, enabled: true });
        if (out.used) break;
        s.observe(`attempt ${attempts} was not used`, out.reason);
      }
      attempts = Math.min(attempts, 2);
      s.assert('the review was used (the reply parsed in the fixed shape)', out.used === true, { actual: out.reason });
      s.observe('attempts', attempts);
      const wire = JSON.stringify(out.sent || {});
      s.evidence('sent', out.sent);
      for (const sec of secrets) if (!(/^\d+$/.test(sec) && sec.length < 6)) s.assert(`the request does not contain "${sec.length > 12 ? sec.slice(0, 6) + '…' : sec}"`, !wire.toLowerCase().includes(sec.toLowerCase()));
      s.assert('nothing in the request is shaped like an address or account id', (() => { try { assertNoLeak(out.sent, []); return true; } catch { return false; } })());
      const rec = checkReceipt(record);
      s.assert('the receipt verifies (model signature, key, attestation, request and response hashes)', rec.ok === true, { actual: rec });
      s.observe('receipt', out.receipt);
    }, { critical: true });

    await ctx.step('prediction 3 and 4: planted problems are found on the right lines, and every verified finding is true', async (s) => {
      const L4 = labelOf(3); const L5 = labelOf(4); const L6 = labelOf(5);
      s.evidence('findings', out.findings);
      const on = (line, codes) => out.findings.find((f) => f.line === line && codes.includes(f.code));
      const f4 = on(L4, ['zero-deduction', 'rate-below-schedule']);
      s.assert('the missing tax deduction is reported on its own line and verifies', !!f4 && f4.check === 'verified', { actual: out.findings.filter((f) => f.line === L4) });
      const f5 = on(L5, ['benefits-above-cap']);
      s.assert('the benefits over the cap are reported on their own line and verify', !!f5 && f5.check === 'verified', { actual: out.findings.filter((f) => f.line === L5) });
      s.assert('the code flags the unique amount without the model', out.codeFlags.some((f) => f.line === L6 && f.code === 'unique-amount'), { actual: out.codeFlags });
      s.observe('the model also mentioned the unique amount', out.findings.some((f) => f.line === L6 && f.code === 'unique-amount'));
      const wrongLine = out.findings.filter((f) => ['rate-above-schedule', 'benefits-above-cap', 'zero-deduction', 'rate-below-schedule'].includes(f.code) && f.check === 'verified').every((f) => {
        const r = a.rows.find((x) => x.label === f.line);
        return f.code === 'benefits-above-cap' ? r.benefitsRatePct > 5.05 : f.code === 'zero-deduction' ? r.taxRatePct === 0 : f.code === 'rate-below-schedule' ? r.taxRatePct < 19.95 : r.taxRatePct > 20.05;
      });
      s.assert('every finding marked verified is true when recomputed here from the numbers', wrongLine);
      s.observe('findings the code could not verify', out.findings.filter((f) => f.check !== 'verified').map((f) => `${f.line}:${f.code}`));
      s.assert('the summary and questions are present and short', typeof out.summary === 'string' && out.summary.length > 0 && out.questions.length <= 3);
    });
  },
};
