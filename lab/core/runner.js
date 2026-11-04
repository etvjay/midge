import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Recorder, canonical, sha256 } from './recorder.js';
import { loadKnownSecrets, makeRedactor } from './redact.js';
import { captureEnv, probeCapabilities } from './env.js';
import { buildReport } from './report.js';

/**
 * An experiment is a hypothesis with steps. A step records observations and assertions; its outcome is
 * derived from the assertions, never declared. Skips carry a reason. Failures and anomalies become
 * `problem` events that the report collects, so problems are found by the process, not noticed by luck.
 */

class AbortExperiment extends Error {}

function summarise(recorder, value, keep) {
  if (typeof value === 'string' && value.length > 300) return { ...recorder.blob(value, 'text'), preview: value.slice(0, 120) };
  if (value !== null && typeof value === 'object') {
    const text = canonical(value);
    if (text.length > 2000 || keep) return { ...recorder.blob(text, 'json'), preview: text.slice(0, 160) };
  }
  return value;
}

function makeStep(recorder, expId, name, attempt) {
  const state = { asserts: 0, failed: 0, skipped: null, problems: 0 };
  const base = { exp: expId, step: name, attempt };
  const s = {
    observe: (label, value, { keep = false } = {}) => recorder.event('observe', { ...base, label, value: summarise(recorder, value, keep) }),
    note: (text) => recorder.event('note', { ...base, text }),
    assert(claim, condition, { expected, actual, severity = 'major' } = {}) {
      state.asserts += 1;
      const ok = Boolean(condition);
      if (!ok) { state.failed += 1; }
      recorder.event('assert', { ...base, claim, ok, expected: expected === undefined ? undefined : summarise(recorder, expected), actual: actual === undefined ? undefined : summarise(recorder, actual), severity: ok ? undefined : severity });
      return ok;
    },
    evidence(kind, data) { recorder.event('evidence', { ...base, kind, ...data }); },
    problem(severity, message, data = {}) { state.problems += 1; recorder.event('problem', { ...base, severity, message, data }); },
    skip(reason) { state.skipped = reason; recorder.event('skip', { ...base, reason }); },
    blob: (value, label) => recorder.blob(value, label),
  };
  return { s, state };
}

export async function runExperiments({ experiments, rootDir, runsDir, repeat = 1, onProgress = () => {} }) {
  const startedAt = new Date();
  const runId = `${startedAt.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}-${crypto.randomBytes(2).toString('hex')}`;
  const dir = path.join(runsDir, runId);
  const secrets = loadKnownSecrets(rootDir);
  const { redact, count: secretCount } = makeRedactor(secrets);
  const recorder = new Recorder({ dir, redact });
  const caps = await probeCapabilities(rootDir);
  recorder.event('run.start', { runId, env: captureEnv(rootDir), capabilities: caps, redactionSecrets: secretCount, experiments: experiments.map((e) => e.id), repeat });

  const verdicts = {};
  for (const exp of experiments) {
    const results = [];
    for (let attempt = 1; attempt <= repeat; attempt += 1) {
      const missing = (exp.requires || []).filter((r) => !caps[r]);
      recorder.event('exp.start', { exp: exp.id, attempt, title: exp.title, tier: exp.tier, hypothesis: exp.hypothesis, limits: exp.limits || [], requires: exp.requires || [] });
      if (missing.length) {
        recorder.event('exp.end', { exp: exp.id, attempt, verdict: 'SKIP', reason: `missing capability: ${missing.join(', ')}`, steps: 0, assertions: 0, failedAssertions: 0 });
        results.push('SKIP'); onProgress({ exp: exp.id, verdict: 'SKIP', reason: missing.join(', ') }); continue;
      }
      const t0 = Date.now();
      let steps = 0; let assertions = 0; let failedAssertions = 0; let failedSteps = 0; let skippedSteps = 0; let aborted = false;
      const ctx = {
        id: exp.id, attempt, rootDir, caps, runDir: dir, recorder,
        async step(name, fn, { critical = false } = {}) {
          if (aborted) { recorder.event('step.start', { exp: exp.id, step: name, attempt }); recorder.event('skip', { exp: exp.id, step: name, attempt, reason: 'an earlier critical step failed' }); recorder.event('step.end', { exp: exp.id, step: name, attempt, outcome: 'skip', assertions: 0, failed: 0, durationMs: 0 }); skippedSteps += 1; steps += 1; return; }
          steps += 1;
          recorder.event('step.start', { exp: exp.id, step: name, attempt });
          const { s, state } = makeStep(recorder, exp.id, name, attempt);
          const st = Date.now();
          let threw = false;
          try { await fn(s); } catch (err) {
            threw = true;
            recorder.event('problem', { exp: exp.id, step: name, attempt, severity: 'critical', message: `step threw: ${err.message}`, data: { stack: String(err.stack || '').split('\n').slice(0, 5) } });
            state.problems += 1;
          }
          assertions += state.asserts; failedAssertions += state.failed;
          const outcome = state.skipped ? 'skip' : (threw || state.failed > 0 || state.asserts === 0 ? 'fail' : 'pass');
          if (state.asserts === 0 && !state.skipped && !threw) recorder.event('problem', { exp: exp.id, step: name, attempt, severity: 'minor', message: 'step made no assertions, so it proves nothing', data: {} });
          recorder.event('step.end', { exp: exp.id, step: name, attempt, outcome, assertions: state.asserts, failed: state.failed, durationMs: Date.now() - st });
          onProgress({ exp: exp.id, step: name, outcome, failed: state.failed, asserts: state.asserts });
          if (outcome === 'fail') failedSteps += 1;
          if (outcome === 'skip') skippedSteps += 1;
          if (critical && outcome === 'fail') { aborted = true; }
        },
      };
      try { await exp.run(ctx); } catch (err) {
        if (!(err instanceof AbortExperiment)) recorder.event('problem', { exp: exp.id, attempt, severity: 'critical', message: `experiment threw outside a step: ${err.message}`, data: { stack: String(err.stack || '').split('\n').slice(0, 5) } });
        failedSteps += 1;
      }
      const verdict = failedSteps > 0 ? 'FAIL' : (steps === 0 ? 'SKIP' : (skippedSteps > 0 ? 'PARTIAL' : 'PASS'));
      recorder.event('exp.end', { exp: exp.id, attempt, verdict, steps, failedSteps, skippedSteps, assertions, failedAssertions, durationMs: Date.now() - t0 });
      results.push(verdict); onProgress({ exp: exp.id, verdict });
    }
    verdicts[exp.id] = { attempts: results, verdict: results.every((r) => r === results[0]) ? results[0] : 'FLAKY' };
  }
  const prevHash = recorder.rootHash;
  const endHash = recorder.event('run.end', { runId, rootHashOfPrevious: prevHash, verdicts, eventCounts: recorder.counts, durationMs: Date.now() - startedAt.getTime() });
  const summary = { runId, startedAt: startedAt.toISOString(), rootHash: endHash, verdicts, events: recorder.seq, commit: captureEnv(rootDir).git.commit };
  fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'report.md'), buildReport(dir));
  fs.appendFileSync(path.join(runsDir, 'INDEX.jsonl'), JSON.stringify({ runId, commit: summary.commit, rootHash: endHash, verdicts: Object.fromEntries(Object.entries(verdicts).map(([k, v]) => [k, v.verdict])) }) + '\n');
  return { dir, runId, summary };
}
