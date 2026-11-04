import fs from 'node:fs';
import path from 'node:path';

const trunc = (v, n = 160) => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s === undefined ? '' : (s.length > n ? s.slice(0, n) + '…' : s); };
const cell = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const icon = { pass: '✓', fail: '✗', skip: '–', PASS: 'PASS', FAIL: 'FAIL', SKIP: 'SKIP', PARTIAL: 'PARTIAL', FLAKY: 'FLAKY' };

export function readEvents(dir) {
  return fs.readFileSync(path.join(dir, 'events.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

export function collectProblems(events) {
  const out = [];
  for (const e of events) {
    if (e.type === 'problem') out.push({ severity: e.severity, exp: e.exp, step: e.step, message: e.message, data: e.data });
    if (e.type === 'assert' && !e.ok) out.push({ severity: e.severity || 'major', exp: e.exp, step: e.step, message: `assertion failed: ${e.claim}`, data: { expected: e.expected, actual: e.actual } });
  }
  return out;
}

export function buildReport(dir) {
  const events = readEvents(dir);
  const start = events.find((e) => e.type === 'run.start');
  const end = events.find((e) => e.type === 'run.end');
  const L = [];
  L.push(`# Lab run ${start.runId}`, '');
  const env = start.env;
  L.push(`- **Code:** \`${env.git.commit}\` on \`${env.git.branch}\`${env.git.dirtyFiles ? ` (**${env.git.dirtyFiles} uncommitted files**)` : ' (clean tree)'}`);
  L.push(`- **Runtime:** Node ${env.runtime.node}, ${env.runtime.platform}; docker: ${env.tools.docker || 'no'}; dcap-qvl: ${env.tools.dcapQvl || 'no'}`);
  L.push(`- **Pins:** verifier \`${env.pins.verifierImage || 'none'}\`; compose hash \`${(env.pins.composeHash && String(env.pins.composeHash).slice(0, 16)) || 'none'}…\``);
  L.push(`- **Capabilities at start:** ${Object.entries(start.capabilities).map(([k, v]) => `${k}=${v ? 'yes' : 'no'}`).join(', ')}`);
  L.push(`- **Integrity:** ${events.length} events, hash-chained; root \`${end ? end.hash : 'RUN NOT FINISHED'}\`. Verify with \`node lab/verify-run.js ${path.relative(process.cwd(), dir)}\``, '');

  L.push('## Verdicts', '', '| Experiment | Tier | Verdict | Steps | Assertions | Notes |', '|---|---|---|---|---|---|');
  const exps = [...new Map(events.filter((e) => e.type === 'exp.start').map((e) => [e.exp, e])).values()];
  for (const x of exps) {
    const ends = events.filter((e) => e.type === 'exp.end' && e.exp === x.exp);
    const v = end?.verdicts?.[x.exp]?.verdict || ends.at(-1)?.verdict;
    const last = ends.at(-1) || {};
    L.push(`| ${cell(x.exp)} ${cell(x.title)} | ${x.tier} | **${icon[v] || v}** | ${last.steps ?? ''} | ${last.assertions ?? ''}${last.failedAssertions ? ` (${last.failedAssertions} failed)` : ''} | ${cell(last.reason || (ends.length > 1 ? `${ends.length} attempts: ${ends.map((e) => e.verdict).join(', ')}` : ''))} |`);
  }
  L.push('');

  for (const x of exps) {
    L.push(`## ${x.exp}: ${x.title}`, '', `**Hypothesis.** ${x.hypothesis}`, '');
    if ((x.limits || []).length) { L.push('**What this does not prove**', ...x.limits.map((l) => `- ${l}`), ''); }
    const evs = events.filter((e) => e.exp === x.exp && (e.attempt || 1) === 1);
    const steps = [...new Set(evs.filter((e) => e.type === 'step.start').map((e) => e.step))];
    if (steps.length) {
      L.push('| Step | Result | Assertions | Time |', '|---|---|---|---|');
      for (const name of steps) {
        const e = evs.find((q) => q.type === 'step.end' && q.step === name);
        L.push(`| ${cell(name)} | ${icon[e?.outcome] || '?'} ${e?.outcome || ''} | ${e ? `${e.assertions - e.failed}/${e.assertions}` : ''} | ${e ? `${e.durationMs} ms` : ''} |`);
      }
      L.push('');
    }
    for (const name of steps) {
      const se = evs.filter((e) => e.step === name);
      const lines = [];
      for (const e of se) {
        if (e.type === 'assert') lines.push(`- ${e.ok ? '✓' : '✗'} ${e.claim}${!e.ok ? ` — expected ${trunc(e.expected)}, got ${trunc(e.actual)}` : ''}`);
        if (e.type === 'observe') lines.push(`- observed **${e.label}**: \`${trunc(e.value?.preview ?? e.value, 140)}\`${e.value?.blob ? ` (full: ${e.value.blob}, sha256 ${e.value.sha256.slice(0, 12)}…)` : ''}`);
        if (e.type === 'evidence') lines.push(`- evidence ${e.kind}: ${trunc(Object.fromEntries(Object.entries(e).filter(([k]) => !['seq', 'ts', 'type', 'exp', 'step', 'attempt', 'prev', 'hash', 'kind'].includes(k))), 220)}`);
        if (e.type === 'note') lines.push(`- note: ${e.text}`);
        if (e.type === 'skip') lines.push(`- skipped: ${e.reason}`);
      }
      if (lines.length) L.push(`### ${name}`, '', ...lines, '');
    }
  }

  const problems = collectProblems(events);
  L.push('## Problems found', '');
  if (!problems.length) L.push('None recorded. That means the checks passed, not that nothing is wrong: see each experiment\'s limits.', '');
  else {
    const order = { critical: 0, major: 1, minor: 2 };
    problems.sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3));
    L.push('| Severity | Where | Problem |', '|---|---|---|', ...problems.map((p) => `| ${p.severity} | ${cell(p.exp)} / ${cell(p.step || '')} | ${cell(p.message)}${p.data && Object.keys(p.data).length ? ` — ${cell(trunc(p.data, 200))}` : ''} |`), '');
  }
  return L.join('\n');
}
