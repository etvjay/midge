#!/usr/bin/env node
/**
 * The lab method says predictions are committed BEFORE the experiment exists. Nothing enforced that. This does, going forward: every
 * experiment that is not on lab/predictions-exempt.json (the ones that existed when this check was written, 2026-11-11) must have its id
 * in docs/lab/PROGRAMME_PLAN.md in a commit strictly earlier than the commit that added the experiment file. Run by `make check`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Pure: experiments is a list of { id, fileCommit, fileTime, planCommit, planTime }; returns the violations. */
export function findViolations(experiments, exempt) {
  const bad = [];
  for (const e of experiments) {
    if (exempt.has(e.id)) continue;
    if (!e.planCommit) bad.push({ id: e.id, reason: 'its id is not in the plan (docs/lab/PROGRAMME_PLAN.md): write the predictions first' });
    else if (e.planCommit === e.fileCommit) bad.push({ id: e.id, reason: 'its predictions and its file are in the same commit: commit the predictions first' });
    else if (e.planTime > e.fileTime) bad.push({ id: e.id, reason: 'its predictions were committed after the experiment file' });
  }
  return bad;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(process.argv[1]), '..');
  const git = (...a) => spawnSync('git', ['-C', root, ...a], { encoding: 'utf8' }).stdout.trim();
  const exempt = new Set(JSON.parse(fs.readFileSync(path.join(root, 'lab/predictions-exempt.json'), 'utf8')).ids);
  const dir = path.join(root, 'lab/experiments');
  const exps = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    const m = fs.readFileSync(path.join(dir, f), 'utf8').match(/^\s*id: '(E-[A-Z0-9-]+)'/m);
    if (!m) continue;
    const added = git('log', '--diff-filter=A', '--format=%H %ct', '--', `lab/experiments/${f}`).split('\n').filter(Boolean).pop();
    const mention = git('log', '--format=%H %ct', `-S${m[1]}`, '--', 'docs/lab/PROGRAMME_PLAN.md').split('\n').filter(Boolean).pop();
    const [fileCommit, fileTime] = added ? added.split(' ') : [null, 0];
    const [planCommit, planTime] = mention ? mention.split(' ') : [null, 0];
    if (!fileCommit) continue; // not committed yet: nothing to compare
    exps.push({ id: m[1], fileCommit, fileTime: Number(fileTime), planCommit, planTime: Number(planTime) });
  }
  const bad = findViolations(exps, exempt);
  if (bad.length) { console.error('PREDICTIONS-FIRST VIOLATIONS:'); for (const b of bad) console.error(`  ${b.id}: ${b.reason}`); process.exit(1); }
  console.log(`predictions-first: ${exps.length} experiments checked, ${exempt.size} exempt (existed before the rule), no violations`);
}
