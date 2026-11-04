import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Recorder, verifyRunDir, canonical } from '../core/recorder.js';
import { makeRedactor } from '../core/redact.js';
import { runExperiments } from '../core/runner.js';
import { collectProblems, readEvents } from '../core/report.js';
import { auditRun } from '../core/audit.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'lab-selftest-'));

function miniRun(redact = (x) => x) {
  const dir = tmp();
  const r = new Recorder({ dir, redact });
  r.event('run.start', { runId: 'x' });
  r.event('exp.start', { exp: 'e' });
  r.event('observe', { exp: 'e', label: 'a', value: 1 });
  r.event('observe', { exp: 'e', label: 'b', value: 2 });
  const prev = r.rootHash;
  r.event('run.end', { rootHashOfPrevious: prev });
  fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify({ rootHash: r.rootHash }));
  return dir;
}
const lines = (dir) => fs.readFileSync(path.join(dir, 'events.jsonl'), 'utf8').split('\n').filter(Boolean);
const write = (dir, ls) => fs.writeFileSync(path.join(dir, 'events.jsonl'), ls.join('\n') + '\n');

export default {
  id: 'E-LAB-01',
  title: 'The lab records honestly and detects tampering',
  tier: 'offline',
  hypothesis: 'A run log cannot be edited, trimmed or reordered without detection, secrets never reach the log, and an experiment\'s verdict is derived from its recorded assertions and cannot be declared.',
  limits: [
    'The hash chain proves the log is unchanged since it was written. It does not prove the events were produced honestly, which is why experiments attach checkable evidence (transaction hashes, attestation digests, file digests).',
    'An attacker who rewrites the whole log and its summary consistently would pass the chain check; anchoring the root hash somewhere public (a testnet transaction) closes that gap and is a separate step.',
  ],
  async run(ctx) {
    await ctx.step('secrets are redacted before they are written or hashed', async (s) => {
      const secret = 'sekrit-value-0123456789abcdef';
      const { redact } = makeRedactor(new Map([[secret, 'TEST_KEY']]));
      const dir = tmp();
      const r = new Recorder({ dir, redact });
      r.event('observe', { label: 'k', value: `token ${secret} used`, nested: { list: [secret, 'ed25519:' + '2'.repeat(88), 'ghp_' + 'a'.repeat(36)] } });
      const raw = fs.readFileSync(path.join(dir, 'events.jsonl'), 'utf8');
      s.assert('the exact secret value is absent from the file', !raw.includes(secret));
      s.assert('a NEAR-style secret key pattern is absent', !raw.includes('2'.repeat(60)));
      s.assert('a GitHub token pattern is absent', !raw.includes('ghp_aaaa'));
      s.assert('the redaction marker names which secret it was', raw.includes('[REDACTED:TEST_KEY]'));
      s.assert('a blob holding a secret is redacted too', !fs.readFileSync(path.join(dir, 'blobs', r.blob(`x ${secret} y`).sha256), 'utf8').includes(secret));
    });

    await ctx.step('events whose data has a field named hash (a transaction hash) still verify', async (s) => {
      // Regression: a real run broke its own chain because evidence events carried a `hash` field.
      const dir = tmp();
      const r = new Recorder({ dir });
      r.event('run.start', {});
      r.event('evidence', { kind: 'tx', hash: 'a'.repeat(64), explorer: 'https://example/tx', ok: true });
      const prev = r.rootHash;
      r.event('run.end', { rootHashOfPrevious: prev });
      fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify({ rootHash: r.rootHash }));
      const v = verifyRunDir(dir);
      s.assert('the chain verifies with a data field called hash', v.ok, { actual: v.problems });
      s.assert('the data field survived unchanged', JSON.parse(lines(dir)[1]).hash === 'a'.repeat(64));
      let rejected = false;
      try { r.event('x', { chain_hash: 'oops' }); } catch { rejected = true; }
      s.assert('a field that would collide with the envelope is rejected loudly', rejected);
      let rejectedType = false;
      try { r.event('x', { type: 'oops' }); } catch { rejectedType = true; }
      s.assert('so is a field called type', rejectedType);
    });

    await ctx.step('evidence containing a BigInt is recorded and verifies (it used to crash the run)', async (s) => {
      // Regression: a teardown report with a BigInt amount made JSON.stringify throw while writing the event, so the
      // step failed on the harness instead of on the system under test.
      const dir = tmp();
      const r = new Recorder({ dir });
      r.event('run.start', {});
      let threw = null;
      try { r.event('evidence', { kind: 'balance', yocto: 10n ** 24n }); } catch (e) { threw = e.message; }
      s.assert('writing an event with a BigInt does not throw', threw === null, { actual: threw });
      const prev = r.rootHash;
      r.event('run.end', { rootHashOfPrevious: prev });
      fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify({ rootHash: r.rootHash }));
      s.assert('the log still verifies', verifyRunDir(dir).ok, { actual: verifyRunDir(dir).problems });
      s.assert('the BigInt is stored as a string with an n suffix', JSON.parse(lines(dir)[1]).yocto === '1000000000000000000000000n', { actual: JSON.parse(lines(dir)[1]).yocto });
    });

    await ctx.step('an untouched log verifies as intact', async (s) => {
      const dir = miniRun();
      const v = verifyRunDir(dir);
      s.assert('the chain, sequence and closing commitment verify', v.ok, { actual: v.problems });
      s.assert('every event is counted', v.events === 5, { expected: 5, actual: v.events });
    });

    await ctx.step('editing, deleting, reordering or truncating a log is detected', async (s) => {
      let dir = miniRun(); let ls = lines(dir);
      const e = JSON.parse(ls[2]); e.value = 999; ls[2] = JSON.stringify(e); write(dir, ls);
      s.assert('changing one field of one event is detected', !verifyRunDir(dir).ok);

      dir = miniRun(); ls = lines(dir); ls.splice(2, 1); write(dir, ls);
      s.assert('deleting an event is detected', !verifyRunDir(dir).ok);

      dir = miniRun(); ls = lines(dir); [ls[2], ls[3]] = [ls[3], ls[2]]; write(dir, ls);
      s.assert('reordering two events is detected', !verifyRunDir(dir).ok);

      dir = miniRun(); ls = lines(dir); ls.pop(); write(dir, ls);
      s.assert('truncating the closing event is detected', !verifyRunDir(dir).ok);

      dir = miniRun(); ls = lines(dir);
      const forged = JSON.parse(ls[2]); forged.value = 999; forged.chain_hash = 'f'.repeat(64); ls[2] = JSON.stringify(forged); write(dir, ls);
      s.assert('a forged hash that does not match the content is detected', !verifyRunDir(dir).ok);
    });

    await ctx.step('verdicts are derived from assertions, not declared', async (s) => {
      const runsDir = tmp();
      const make = (id, run, extra = {}) => ({ id, title: id, tier: 'offline', hypothesis: 'h', limits: ['l'], run, ...extra });
      let flip = 0;
      const exps = [
        make('T-PASS', async (c) => { await c.step('a', (x) => x.assert('true is true', true)); }),
        make('T-FAIL-ASSERT', async (c) => { await c.step('a', (x) => x.assert('a false claim', false, { expected: 1, actual: 2 })); }),
        make('T-THROW', async (c) => { await c.step('a', () => { throw new Error('boom'); }); }),
        make('T-NO-ASSERT', async (c) => { await c.step('a', (x) => x.observe('only looking', 1)); }),
        make('T-SKIP-STEP', async (c) => { await c.step('a', (x) => x.assert('ok', true)); await c.step('b', (x) => x.skip('not available here')); }),
        make('T-MISSING-CAP', async (c) => { await c.step('a', (x) => x.assert('never runs', true)); }, { requires: ['phala-key-that-does-not-exist'] }),
        make('T-CRITICAL', async (c) => { await c.step('setup', (x) => x.assert('setup fails', false), { critical: true }); await c.step('later', (x) => x.assert('would pass', true)); }),
        make('T-OUTSIDE', async () => { throw new Error('thrown before any step'); }),
        make('T-ALWAYS', async (c) => { await c.step('setup', (x) => x.assert('setup fails', false), { critical: true }); await c.step('skipped normally', (x) => x.assert('x', true)); await c.step('teardown still runs', (x) => x.assert('cleaned up', true), { always: true }); }),
        make('T-FLAKY', async (c) => { flip += 1; await c.step('a', (x) => x.assert('passes only every other time', flip % 2 === 1)); }),
      ];
      const { dir, summary } = await runExperiments({ experiments: exps, rootDir: ctx.rootDir, runsDir, repeat: 2 });
      const v = (id) => summary.verdicts[id].verdict;
      s.assert('a passing experiment passes', v('T-PASS') === 'PASS', { actual: v('T-PASS') });
      s.assert('a false assertion fails the experiment', v('T-FAIL-ASSERT') === 'FAIL', { actual: v('T-FAIL-ASSERT') });
      s.assert('a thrown error fails the experiment and is recorded as a critical problem', v('T-THROW') === 'FAIL' && collectProblems(readEvents(dir)).some((p) => p.exp === 'T-THROW' && p.severity === 'critical'));
      s.assert('a step with no assertions fails and is flagged as proving nothing', v('T-NO-ASSERT') === 'FAIL' && collectProblems(readEvents(dir)).some((p) => /proves nothing/.test(p.message)));
      s.assert('an explicit skip yields PARTIAL, not PASS', v('T-SKIP-STEP') === 'PARTIAL', { actual: v('T-SKIP-STEP') });
      s.assert('a missing capability yields SKIP with the reason recorded', v('T-MISSING-CAP') === 'SKIP' && readEvents(dir).some((e) => e.type === 'exp.end' && e.exp === 'T-MISSING-CAP' && /missing capability/.test(e.reason || '')));
      s.assert('a failed critical step skips the later steps', v('T-CRITICAL') === 'FAIL' && readEvents(dir).some((e) => e.type === 'skip' && e.step === 'later' && /critical/.test(e.reason)));
      s.assert('a step marked always runs even after a critical failure (teardown must not be skipped)', readEvents(dir).some((e) => e.type === 'assert' && e.exp === 'T-ALWAYS' && e.claim === 'cleaned up') && readEvents(dir).some((e) => e.type === 'skip' && e.exp === 'T-ALWAYS' && e.step === 'skipped normally'));
      s.assert('a result that changes between attempts is reported as FLAKY', v('T-FLAKY') === 'FLAKY', { actual: summary.verdicts['T-FLAKY'] });
      s.assert('an experiment that throws outside any step fails and is recorded as critical', v('T-OUTSIDE') === 'FAIL' && collectProblems(readEvents(dir)).some((p) => p.exp === 'T-OUTSIDE' && p.severity === 'critical'), { actual: v('T-OUTSIDE') });
      const audited = auditRun(dir);
      s.assert('the independent audit agrees with every verdict the runner declared', audited.mismatches.length === 0, { actual: audited.mismatches });
      s.assert('the audit re-derives the same verdict for every experiment', Object.entries(summary.verdicts).every(([id, x]) => audited.verdicts[id] === x.verdict), { actual: audited.verdicts });
      s.assert('the nested run itself verifies as intact', verifyRunDir(dir).ok);
      s.assert('the nested run wrote a report and an index entry', fs.existsSync(path.join(dir, 'report.md')) && fs.existsSync(path.join(runsDir, 'INDEX.jsonl')));
    });

    await ctx.step('canonical encoding is order independent', async (s) => {
      s.assert('key order does not change the encoding', canonical({ b: 1, a: { d: 1, c: 2 } }) === canonical({ a: { c: 2, d: 1 }, b: 1 }));
      s.assert('array order does', canonical({ a: [1, 2] }) !== canonical({ a: [2, 1] }));
      s.assert('bigint values are encoded without throwing', canonical({ a: 10n ** 24n }).includes('"1000000000000000000000000n"'));
    });
  },
};
