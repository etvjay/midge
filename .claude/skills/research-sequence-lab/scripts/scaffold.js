#!/usr/bin/env node
/**
 * Scaffold the research-sequence lab into a project.
 *   node scaffold.js <project-root> [--force]
 * Copies the dependency-free engine to <project-root>/lab, adds an example experiment, ignores lab/runs in git,
 * and prints the package.json scripts to add. It never edits package.json or overwrites without --force.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.resolve(here, '..', 'assets');
const root = path.resolve(process.argv[2] || '.');
const force = process.argv.includes('--force');
const lab = path.join(root, 'lab');

if (!fs.existsSync(root)) { console.error(`no such directory: ${root}`); process.exit(2); }
if (fs.existsSync(path.join(lab, 'core')) && !force) { console.error(`${lab} already has an engine; pass --force to overwrite`); process.exit(1); }

const copyDir = (from, to) => {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name); const b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b); else fs.copyFileSync(a, b);
  }
};
copyDir(path.join(assets, 'engine'), lab);
fs.mkdirSync(path.join(lab, 'experiments'), { recursive: true });
const example = path.join(lab, 'experiments', '10-example.js');
if (!fs.existsSync(example)) fs.copyFileSync(path.join(assets, 'experiment.template.js'), example);

const gi = path.join(root, '.gitignore');
const have = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
const add = ['lab/runs/*', '!lab/runs/.gitkeep'].filter((l) => !have.split('\n').includes(l));
if (add.length) fs.appendFileSync(gi, `${have && !have.endsWith('\n') ? '\n' : ''}${add.join('\n')}\n`);
fs.mkdirSync(path.join(lab, 'runs'), { recursive: true });
fs.writeFileSync(path.join(lab, 'runs', '.gitkeep'), '');

console.log(`lab engine installed in ${lab}\n`);
console.log('Add to package.json "scripts":');
console.log('  "lab": "node lab/run.js",\n  "lab:list": "node lab/run.js --list",\n  "lab:verify": "node lab/verify-run.js"\n');
console.log('Then:\n  node lab/run.js --only E-LAB-01     # the engine tests itself first; do not trust results until this passes\n  node lab/run.js --list');
