#!/usr/bin/env node
/**
 * Midge lab runner.
 *   node lab/run.js --list
 *   node lab/run.js [--only E-A,E-B] [--tier offline,sandbox,testnet,hardware] [--repeat N] [--dir <runs dir>] [--print-plan]
 *   With neither --only nor --tier only the offline tier runs. --print-plan lists what WOULD run and exits. Unknown options are an error.
 * Each run writes lab/runs/<id>/ (events.jsonl hash chain, summary.json, report.md, blobs/).
 * Exit code 1 if any experiment FAILS or is FLAKY. Skips are reported with a reason and do not fail a run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runExperiments } from './core/runner.js';
import { auditRun } from './core/audit.js';
import { verifyRunDir } from './core/recorder.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, '..');
const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };
const flag = (n) => process.argv.includes(`--${n}`);

// An unknown option must never silently turn into "run everything": a typo (or a flag from a newer version) stops here.
const KNOWN = new Set(['list', 'only', 'tier', 'repeat', 'dir', 'quiet', 'print-plan']);
const unknown = process.argv.slice(2).filter((a) => a.startsWith('--') && !KNOWN.has(a.slice(2)));
if (unknown.length) { console.error(`unknown option ${unknown.join(', ')}; known: ${[...KNOWN].map((k) => `--${k}`).join(' ')}`); process.exit(2); }

const files = fs.readdirSync(path.join(here, 'experiments')).filter((f) => f.endsWith('.js')).sort();
let experiments = [];
for (const f of files) {
  const mod = await import(pathToFileURL(path.join(here, 'experiments', f)).href);
  const d = mod.default;
  experiments.push(...(Array.isArray(d) ? d : [d]));
}
if (flag('list')) {
  for (const e of experiments) console.log(`${e.id.padEnd(26)} ${e.tier.padEnd(9)} ${e.title}${(e.requires || []).length ? `  [needs ${e.requires.join(', ')}]` : ''}`);
  process.exit(0);
}
const only = arg('only'); const tiers = arg('tier');
if (only) experiments = experiments.filter((e) => only.split(',').includes(e.id));
if (tiers) experiments = experiments.filter((e) => tiers.split(',').includes(e.tier));
// With neither flag, run the offline tier only. Going further (testnet spends testnet NEAR, cloud spends API credit, hardware rents a VM)
// has to be asked for by tier or by experiment id.
if (!only && !tiers) {
  experiments = experiments.filter((e) => e.tier === 'offline');
  console.log('No --tier or --only given: the offline tier only. Use --tier testnet (spends testnet NEAR), --tier cloud or hardware (spend credit), or --only <id>.');
}
if (!experiments.length) { console.error('no experiments selected'); process.exit(2); }
const costly = experiments.filter((e) => e.tier !== 'offline');
if (costly.length) console.log(`This selection will spend: ${costly.map((e) => `${e.id} (${e.tier})`).join(', ')}`);
if (flag('print-plan')) {
  for (const e of experiments) console.log(`plan ${e.id.padEnd(26)} ${e.tier}`);
  process.exit(0);
}

const runsDir = path.resolve(arg('dir', path.join(here, 'runs')));
fs.mkdirSync(runsDir, { recursive: true });
const sym = { pass: '✓', fail: '✗', skip: '–' };
const { dir, summary } = await runExperiments({
  experiments, rootDir, runsDir, repeat: Number(arg('repeat', 1)),
  onProgress: (p) => {
    if (flag('quiet')) return;
    if (p.step) console.log(`  ${sym[p.outcome] || '?'} ${p.exp} · ${p.step}${p.failed ? ` (${p.failed}/${p.asserts} assertions failed)` : ''}`);
    else console.log(`${p.verdict === 'PASS' ? '✅' : p.verdict === 'SKIP' ? '⏭ ' : '❌'} ${p.exp}: ${p.verdict}${p.reason ? ` (missing ${p.reason})` : ''}\n`);
  },
});
// The exit code follows the independent audit and the chain check, never the runner's own declaration.
const audit = auditRun(dir);
const chain = verifyRunDir(dir);
console.log(`run ${summary.runId}\n  report: ${path.relative(process.cwd(), path.join(dir, 'report.md'))}\n  root hash: ${summary.rootHash}\n  verify: node lab/verify-run.js ${path.relative(process.cwd(), dir)}`);
if (audit.mismatches.length) { console.log('  ✗ AUDIT MISMATCH (the runner declared something its own events contradict):'); audit.mismatches.forEach((m) => console.log(`    - ${m}`)); }
if (!chain.ok) { console.log('  ✗ the log failed its own integrity check:'); chain.problems.forEach((m) => console.log(`    - ${m}`)); }
const bad = Object.entries(audit.verdicts).filter(([, v]) => v === 'FAIL' || v === 'FLAKY');
process.exit(bad.length || audit.mismatches.length || !chain.ok ? 1 : 0);
