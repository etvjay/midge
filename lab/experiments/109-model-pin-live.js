import path from 'node:path';
import { fetchVerifiedModelKey, readModelMeasurements, loadMeasurementBaseline } from '../../src/enclave/attestation.js';

const FIELDS = ['mrtd', 'rtmr0', 'rtmr1', 'rtmr2', 'rtmr3'];

export default {
  id: 'E-MODEL-PIN-LIVE-01',
  title: 'The measurement pin against the real NEAR AI host: the baseline is accepted, a wrong value is refused, a list works',
  tier: 'cloud',
  requires: ['network'],
  hypothesis: 'Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. The real host reports the same measurements on every read; the recorded baseline equals them; a fetch pinned to the baseline is accepted with the Intel chain and TCB checked; one wrong field is refused by name; a list holding the wrong and the right value is accepted. Read-only; no API key; spends nothing.',
  limits: [
    'The baseline is what was observed on one day. This does not show it is the build NEAR AI publishes, that the values stay the same for days, or what happens when NEAR AI ships a new build.',
    'The Intel certificate chain check needs dcap-qvl on the machine.',
  ],
  async run(ctx) {
    const baseline = loadMeasurementBaseline(path.join(ctx.rootDir, 'docs/canonical/model-measurements.json'));
    const model = baseline.model;
    let seen;

    await ctx.step('prediction 1: the real host\'s measurements hold still across three reads, each with a fresh nonce', async (s) => {
      seen = await readModelMeasurements({ model, runs: 3, chain: 'required' });
      s.observe('model', model); s.observe('TCB status', seen.tcbStatus);
      s.assert('all six registers are identical across the reads', seen.stable, { actual: seen.differing });
      s.assert('the Intel certificate chain was verified and the TCB is acceptable', seen.tcbStatus === 'UpToDate', { actual: seen.tcbStatus });
    }, { critical: true });

    await ctx.step('prediction 2: the recorded baseline matches what the host reports now', async (s) => {
      for (const f of FIELDS) s.assert(`${f} is in the baseline`, baseline.pin[f].includes(seen.measurements[f]), { actual: seen.measurements[f].slice(0, 16) });
    });

    await ctx.step('prediction 3: a fetch pinned to the baseline is accepted, chain verified, and says it was pinned', async (s) => {
      const r = await fetchVerifiedModelKey({ model, chain: 'required', expectedMeasurements: baseline.pin });
      s.assert('accepted', Boolean(r.publicKey));
      s.assert('reported as pinned', r.measurementsPinned === true);
      s.assert('the certificate chain check ran and passed', r.checks.some((c) => /certificate chain/i.test(c.name) && c.ok));
      s.assert('the TCB status is acceptable', r.tcbStatus === 'UpToDate', { actual: r.tcbStatus });
    });

    await ctx.step('prediction 4: one wrong field is refused, naming that field, for each of the five', async (s) => {
      for (const f of FIELDS) {
        let msg = null;
        try { await fetchVerifiedModelKey({ model, chain: 'skip', expectedMeasurements: { ...baseline.pin, [f]: ['00'.repeat(48)] } }); } catch (e) { msg = e.message; }
        s.assert(`a wrong ${f} is refused`, msg !== null, { actual: 'accepted' });
        s.assert(`and the refusal names ${f}`, msg !== null && msg.includes(`measurement ${f}`), { actual: msg });
      }
    });

    await ctx.step('prediction 5: a list holding a wrong value and the right one is accepted', async (s) => {
      const list = Object.fromEntries(FIELDS.map((f) => [f, ['11'.repeat(48), ...baseline.pin[f]]]));
      const r = await fetchVerifiedModelKey({ model, chain: 'skip', expectedMeasurements: list });
      s.assert('accepted, as a rotation would be', r.measurementsPinned === true && Boolean(r.publicKey));
    });
  },
};
