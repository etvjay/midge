// AGENTS.md and CLAUDE.md tell an agent which commands to run and which files to read. This fails when one of them names something that does not exist,
// so the instructions cannot drift from the repository without a test noticing.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const makefile = fs.readFileSync(path.join(root, 'Makefile'), 'utf8');
const makeTargets = new Set([...makefile.matchAll(/^([A-Za-z0-9_.-]+):/gm)].map((m) => m[1]));
const docs = ['AGENTS.md', 'CLAUDE.md'].map((f) => ({ f, text: fs.readFileSync(path.join(root, f), 'utf8') }));

// Local-only folders the repository deliberately does not publish: AGENTS.md may name them, a fresh clone will not have them.
const LOCAL_ONLY = [
  /^docs\/superpowers\//,
  /^docs\/research\//,
  /^docs\/WRITING_RULES\.md$/,
  /^docs\/(srs|rtm|architecture|implementation-plan|use-cases|roost-tee-plan)\.md$/,
  /^HANDOFF/,
];

test('every `npm run <name>` in the agent files is a script in package.json', () => {
  const missing = [];
  for (const { f, text } of docs) for (const m of text.matchAll(/npm run ([A-Za-z0-9:_-]+)/g)) if (!pkg.scripts[m[1]]) missing.push(`${f}: npm run ${m[1]}`);
  assert.deepEqual(missing, []);
});

test('every `make <target>` in the agent files is a target in the Makefile', () => {
  const missing = [];
  for (const { f, text } of docs) for (const m of text.matchAll(/\bmake ([a-z][a-z0-9_-]*)/g)) if (!makeTargets.has(m[1])) missing.push(`${f}: make ${m[1]}`);
  assert.deepEqual(missing, []);
});

test('every backticked repository path in the agent files exists (local-only folders excepted)', () => {
  const missing = [];
  for (const { f, text } of docs) {
    for (const m of text.matchAll(/`([A-Za-z0-9_.@/-]+)`/g)) {
      const p = m[1].replace(/\/$/, '');
      if (!/\//.test(m[1]) && !/\.(md|js|mjs|json|jsonl|toml|yml|yaml)$/.test(p)) continue; // a bare word, not a path
      if (/^(https?:|@|\.\.?\/)/.test(p) || p.includes('*') || p.startsWith('node ')) continue;
      if (LOCAL_ONLY.some((re) => re.test(p))) continue;
      if (!fs.existsSync(path.join(root, p))) missing.push(`${f}: ${p}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('the agent files name the one command that verifies the repository, and it exists', () => {
  for (const { text } of docs) if (/\.\/scripts\/verify/.test(text)) assert.ok(fs.existsSync(path.join(root, 'scripts/verify')));
  assert.ok(docs[0].text.includes('./scripts/verify'));
});
