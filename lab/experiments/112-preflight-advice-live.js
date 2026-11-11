import { loadEnvFile } from '../lib/near.js';
import { AttestedAdvisor, checkReceipt } from '../../src/advisor/attested-advisor.js';
import { preflight } from '../../src/roost-service/preflight.js';
import { explainPreflight, redactForAdvisor, collectSecrets, assertNoLeak } from '../../src/advisor/preflight-explainer.js';

const SOL = '2J75L6udJ52N7YmrDPQLN7gzV6CqWny6CaWGccvohi4f';
const SOL_OLD = '3Bxs4ThwQbE4vyj9M5uZ2Pq9P9mXyB1vD8k6bX1w1h7S';
const policy = { payees: [{ chain: 'solana-devnet', address: SOL, max_amount: '2000000', max_total: '5000000' }], max_fee_cost: '1' };
const scenario = (amount = '1900000') => {
  const payment = { obligationId: 'inv-2026-11-ada', chain: 'solana-devnet', payee: SOL, amount };
  const context = { policy, spent: { [`solana-devnet:${SOL}`]: '2500000' }, usedObligations: new Set(), person: 'Ada Lovelace', history: { 'Ada Lovelace': { chain: 'solana-devnet', address: SOL_OLD, amount: '500000' } } };
  return { payment, context, result: preflight(payment, context) };
};

export default {
  id: 'E-PREFLIGHT-ADVICE-LIVE-01',
  title: 'The redacted pre-flight advisory against the real attested NEAR AI Cloud model: only codes and rounded ratios are sent, the receipt verifies, the decision does not change',
  tier: 'live-external',
  requires: ['nearai-key', 'network', 'dcap-qvl'],
  hypothesis: 'Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. The model receives none of a scenario\'s identifying strings; two payments in the same bucket are indistinguishable; the attestation and the signed receipt verify; the decision is unchanged; with the advisory off the model is not called.',
  limits: [
    'One model (Qwen/Qwen3.6-35B-A3B-FP8) and one scenario. Whether the explanation is useful to an operator is not measured; it is expected to mostly restate the codes.',
    'The model still learns the finding codes, the chain family, rounded ratios and that a payment is being checked.',
    'Runs from this machine, not inside the hosted Roost VM.',
  ],
  async run(ctx) {
    const apiKey = loadEnvFile(ctx.rootDir).NEARAI_API_KEY || process.env.NEARAI_API_KEY;
    const { payment, context, result } = scenario();
    const secrets = collectSecrets(payment, context);

    await ctx.step('prediction 2 and 5: the message is coarse by design, and with the advisory off the model is not called', async (s) => {
      const a = scenario('1790000'); const b = scenario('1810000');
      s.assert('two payments in the same ten-percent bucket give an identical message', JSON.stringify(redactForAdvisor(a)) === JSON.stringify(redactForAdvisor(b)));
      let calls = 0; const counting = { ask: async () => { calls += 1; return { plaintext: 'x', record: {} }; } };
      const off = await explainPreflight({ payment, result, context, advisor: counting });
      s.assert('with the advisory not enabled no request is made', calls === 0 && off.used === false);
      const onNoAdvisor = await explainPreflight({ payment, result, context, advisor: null, enabled: true });
      s.assert('enabled with no advisor configured makes no request either', onNoAdvisor.used === false);
    });

    let record = null; let out = null;
    await ctx.step('prediction 1, 3 and 4: ask the real attested model from the redacted message', async (s) => {
      const real = new AttestedAdvisor({ apiKey });
      const capturing = { ask: async (a) => { const r = await real.ask(a); record = r.record; return r; } };
      out = await explainPreflight({ payment, result, context, advisor: capturing, enabled: true });
      s.assert('the advisory was used', out.used === true, { actual: out.reason });
      s.evidence('sent', out.sent);
      const wire = JSON.stringify(out.sent);
      for (const sec of secrets) if (!(/^\d+$/.test(sec) && sec.length < 6)) s.assert(`the message does not contain "${sec.length > 12 ? sec.slice(0, 6) + '…' : sec}"`, !wire.toLowerCase().includes(sec.toLowerCase()));
      s.assert('nothing in the message is shaped like an address or account id', (() => { try { assertNoLeak(out.sent, []); return true; } catch { return false; } })());
      s.assert('the message is under 600 characters', wire.length < 600, { actual: wire.length });
      s.assert('the attestation chain verified with TCB UpToDate', record.tcbStatus === 'UpToDate' && record.attestationChecks.every((c) => c.ok), { actual: record.attestationChecks.filter((c) => !c.ok) });
      const receipt = checkReceipt(record);
      s.assert('the model\'s signed receipt verifies (hashes, signature, signer equals the attested key)', receipt.ok, { actual: receipt.checks.filter((c) => !c.ok) });
      s.assert('the reply is plain text of reasonable length', typeof out.text === 'string' && out.text.length > 10 && out.text.length <= 600, { actual: out.text?.length });
      s.observe('the model\'s reply', out.text);
      s.assert('the decision beside the advice is the deterministic one, unchanged', JSON.stringify(out.result) === JSON.stringify(preflight(payment, context)));
    }, { critical: true });
  },
};
