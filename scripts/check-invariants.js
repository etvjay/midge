#!/usr/bin/env node
// Plan 09-1: every invariant id that is cited is defined; every invariant that holds names tests that exist.
//   node scripts/check-invariants.js        exits 1 on any error. Bare phase ids (I-07) are warnings.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ID = /\b[CIR]-\d{2}(?:-[A-Z])?\b/g;

function walk(dir, accept, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'target' || e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, accept, out); else if (accept(p)) out.push(p);
  }
  return out;
}

export function checkInvariants({ root }) {
  const errors = []; const warnings = [];
  const rel = (p) => path.relative(root, p).split(path.sep).join('/');
  const read = (p) => fs.readFileSync(p, 'utf8');
  const file = path.join(root, 'foundry', 'invariants.json');
  if (!fs.existsSync(file)) return { errors: ['foundry/invariants.json is missing'], warnings };
  let data;
  try { data = JSON.parse(read(file)); } catch (e) { return { errors: [`foundry/invariants.json is not valid JSON: ${e.message}`], warnings }; }
  const list = data.invariants || []; const families = data.families || {};
  const byId = new Map(list.map((i) => [i.id, i]));

  // ids that phase documents define for themselves: a line like "- `I-01-A`: ..."
  const phaseDefined = new Set();
  for (const f of walk(path.join(root, 'foundry', 'phases'), (p) => p.endsWith('.md'))) for (const m of read(f).matchAll(/^[-*]\s*`([CIR]-\d{2}(?:-[A-Z])?)`/gm)) phaseDefined.add(m[1]);

  const testFnNames = new Set();
  for (const f of walk(path.join(root, 'contracts'), (p) => p.endsWith('.rs') && p.includes(`${path.sep}tests${path.sep}`))) for (const m of read(f).matchAll(/\bfn\s+([A-Za-z0-9_]+)/g)) testFnNames.add(m[1]);

  for (const inv of list) {
    if (inv.status === 'superseded') {
      if (!inv.supersededBy || !byId.has(inv.supersededBy)) errors.push(`${inv.id} is superseded by ${inv.supersededBy || '(nothing)'}, which is not defined`);
      continue;
    }
    if (!Array.isArray(inv.checks) || inv.checks.length === 0) { errors.push(`${inv.id} holds but names no check`); continue; }
    for (const c of inv.checks) {
      if (c.type === 'rust') { if (!testFnNames.has(c.ref)) errors.push(`${inv.id} cites Rust test ${c.ref}, which does not exist`); }
      else if (c.type === 'node') {
        const [p, name] = String(c.ref).split('::');
        const fp = path.join(root, p);
        if (!fs.existsSync(fp)) errors.push(`${inv.id} cites ${p}, which does not exist`);
        else if (name && !read(fp).includes(name)) errors.push(`${inv.id} cites test "${name}" in ${p}, which is not there`);
      } else errors.push(`${inv.id} has a check of unknown type ${c.type}`);
    }
  }

  const files = [
    ...walk(path.join(root, 'docs'), (p) => p.endsWith('.md')),
    ...walk(path.join(root, 'foundry'), (p) => /\.(md|json|jsonl)$/.test(p) && rel(p) !== 'foundry/invariants.json'),
    ...walk(path.join(root, 'tests'), (p) => p.endsWith('.js') && !/check-invariants.*\.test\.js$/.test(p)),
  ];
  const seenBare = new Set();
  for (const f of files) {
    const text = read(f);
    for (const m of new Set(text.match(ID) || [])) {
      const r = rel(f);
      if (byId.has(m)) {
        if (byId.get(m).status === 'superseded' && r === 'foundry/claims.jsonl') errors.push(`${r} cites ${m}, which is superseded by ${byId.get(m).supersededBy}`);
      } else if (phaseDefined.has(m)) { /* defined by its phase document */ }
      else if (families[m]) { const k = `${m}|${r}`; if (!seenBare.has(k)) { seenBare.add(k); warnings.push(`${r} cites ${m}, a whole phase family; use one of ${families[m].join(', ')}`); } }
      else errors.push(`${r} cites ${m}, which is not defined in foundry/invariants.json or a phase document`);
    }
  }
  return { errors, warnings };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { errors, warnings } = checkInvariants({ root });
  for (const w of warnings) console.warn(`  warning: ${w}`);
  for (const e of errors) console.error(`  ERROR: ${e}`);
  console.log(errors.length ? `${errors.length} invariant error(s)` : `invariants OK (${warnings.length} warning(s))`);
  process.exit(errors.length ? 1 : 0);
}
