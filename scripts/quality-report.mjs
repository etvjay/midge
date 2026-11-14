#!/usr/bin/env node
// Writes test-results/quality.json: one place that shows how the code measures today. Counts only: it does not fail on a number, the individual checks do.
// Biome diagnostics, strict type errors in the files that opt in, duplicated code, dead files and dependency findings, and clippy warnings per Rust crate
// when cargo is available. Run: node scripts/quality-report.mjs
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28, ...opts });
const json = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const report = { generatedAt: new Date().toISOString(), node: process.version };

const biome = json(run('npx', ['biome', 'lint', '--reporter=json']).stdout);
report.biome = biome ? { errors: biome.summary.errors, warnings: biome.summary.warnings, infos: biome.summary.infos } : null;

const tsc = run('npx', ['tsc', '-p', 'tsconfig.json']);
report.typeErrors = (tsc.stdout.match(/error TS\d+/g) || []).length;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jscpd-'));
run('npx', ['jscpd', '--config', '.jscpd.json', '--reporters', 'json', '--output', dir]);
const dup = json(fs.existsSync(path.join(dir, 'jscpd-report.json')) ? fs.readFileSync(path.join(dir, 'jscpd-report.json'), 'utf8') : '');
report.duplication = dup ? { percentage: Number(dup.statistics.total.percentage.toFixed(2)), clones: dup.statistics.total.clones } : null;

const knip = json(run('npx', ['knip', '--no-progress', '--include', 'files,dependencies,unlisted', '--reporter', 'json']).stdout);
report.knip = knip ? { issueFiles: (knip.issues || []).length } : null;

report.clippyWarnings = {};
if (run('cargo', ['--version']).status === 0) {
  for (const crate of ['contracts/fly-coordinator', 'outlayer/caller', 'outlayer/room-signer']) {
    const out = run('cargo', ['clippy', '--all-targets', '--message-format=short'], { cwd: path.join(root, crate) });
    report.clippyWarnings[crate] = (out.stderr.match(/: warning:/g) || []).length;
  }
}

fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
fs.writeFileSync(path.join(root, 'test-results/quality.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
