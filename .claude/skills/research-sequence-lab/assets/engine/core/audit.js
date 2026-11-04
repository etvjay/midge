import { readEvents } from './report.js';

/**
 * Independent re-derivation of every verdict from the raw events. This is deliberately a second,
 * separate implementation of the verdict rules in runner.js: a runner that mis-declares a result (by a bug
 * or by sabotage) is caught because the two implementations disagree. The auditor's verdict is the one the
 * CLI exits on.
 *
 * Rules (the same ones the runner documents):
 *   step    = skip if a skip was recorded in it; fail if any assertion failed, it threw, or it made no
 *             assertions; otherwise pass
 *   attempt = SKIP if it was skipped for a missing capability (recorded reason) or had no steps;
 *             FAIL if any step failed or the experiment threw outside a step; PARTIAL if any step was skipped;
 *             otherwise PASS
 *   across attempts: identical -> that verdict, different -> FLAKY
 */
export function deriveVerdicts(events) {
  const attempts = new Map(); // `${exp}#${attempt}` -> { steps: Map, outside: bool, capSkip: bool }
  const key = (e) => `${e.exp}#${e.attempt || 1}`;
  const get = (e) => { const k = key(e); if (!attempts.has(k)) attempts.set(k, { exp: e.exp, steps: new Map(), outside: false, capSkip: false, recordedVerdict: null }); return attempts.get(k); };
  for (const e of events) {
    if (!e.exp) continue;
    const a = get(e);
    if (e.type === 'exp.end') { a.recordedVerdict = e.verdict; if (/missing capability/.test(e.reason || '')) a.capSkip = true; continue; }
    if (!e.step) { if (e.type === 'problem' && e.severity === 'critical') a.outside = true; continue; }
    if (!a.steps.has(e.step)) a.steps.set(e.step, { asserts: 0, failed: 0, threw: false, skipped: false, recordedOutcome: null });
    const st = a.steps.get(e.step);
    if (e.type === 'assert') { st.asserts += 1; if (!e.ok) st.failed += 1; }
    if (e.type === 'problem' && /^step threw/.test(e.message || '')) st.threw = true;
    if (e.type === 'skip') st.skipped = true;
    if (e.type === 'step.end') st.recordedOutcome = e.outcome;
  }
  const mismatches = [];
  const perExp = new Map();
  for (const a of attempts.values()) {
    let failed = 0; let skipped = 0; const steps = [...a.steps.entries()];
    for (const [name, st] of steps) {
      const outcome = st.skipped ? 'skip' : ((st.threw || st.failed > 0 || st.asserts === 0) ? 'fail' : 'pass');
      st.derived = outcome;
      if (st.recordedOutcome && st.recordedOutcome !== outcome) mismatches.push(`${a.exp} step "${name}": runner recorded ${st.recordedOutcome}, audit derived ${outcome}`);
      if (outcome === 'fail') failed += 1;
      if (outcome === 'skip') skipped += 1;
    }
    const outsideFail = a.outside && !steps.some(([, s]) => s.threw);
    const verdict = a.capSkip ? 'SKIP' : (failed > 0 || outsideFail ? 'FAIL' : (steps.length === 0 ? 'SKIP' : (skipped > 0 ? 'PARTIAL' : 'PASS')));
    if (a.recordedVerdict && a.recordedVerdict !== verdict) mismatches.push(`${a.exp}: runner declared ${a.recordedVerdict}, audit derived ${verdict}`);
    if (!perExp.has(a.exp)) perExp.set(a.exp, []);
    perExp.get(a.exp).push(verdict);
  }
  const verdicts = {};
  for (const [exp, list] of perExp) verdicts[exp] = list.every((v) => v === list[0]) ? list[0] : 'FLAKY';
  return { verdicts, mismatches };
}

export function auditRun(dir) {
  const events = readEvents(dir);
  const end = events.find((e) => e.type === 'run.end');
  const { verdicts, mismatches } = deriveVerdicts(events);
  if (end) {
    for (const [exp, v] of Object.entries(end.verdicts || {})) if (verdicts[exp] && verdicts[exp] !== v.verdict) mismatches.push(`${exp}: run summary says ${v.verdict}, audit derived ${verdicts[exp]}`);
  }
  return { verdicts, mismatches };
}
