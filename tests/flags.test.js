// The registry in src/config/flags.js lists every MIDGE_, FLY_ and LAB_ switch the code reads. Secrets are excluded by name and never listed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { FLAGS, readFlag } from '../src/config/flags.js';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const SECRET = /KEY|SECRET|TOKEN|PASSWORD|MNEMONIC|PRIVATE/;
const sourceFiles = ['src', 'scripts', 'lab', 'bin', 'verifications']
  .flatMap((d) => fs.globSync(`${d}/**/*.{js,mjs}`, { cwd: root }))
  .filter((f) => !f.startsWith('lab/runs/') && f !== 'src/config/flags.js');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const used = new Map();
for (const f of sourceFiles) for (const m of read(f).matchAll(/process\.env\.((?:MIDGE|FLY|LAB)_[A-Z0-9_]+)/g)) used.set(m[1], [...(used.get(m[1]) || []), f]);

test('every MIDGE_, FLY_ or LAB_ switch that the code reads is in the registry (secrets excepted)', () => {
  const listed = new Set(FLAGS.map((f) => f.env));
  assert.deepEqual([...used.keys()].filter((e) => !SECRET.test(e) && !listed.has(e)).sort(), []);
});

test('every flag in the registry is read somewhere outside the registry', () => {
  assert.deepEqual(FLAGS.filter((f) => !used.has(f.env)).map((f) => f.env), []);
});

test('every flag has an owner, a purpose, a default, and a review date in the future in YYYY-MM-DD form', () => {
  const today = new Date().toISOString().slice(0, 10);
  for (const f of FLAGS) {
    assert.ok(f.owner && f.purpose && f.default, f.env);
    assert.match(f.removeBy, /^\d{4}-\d{2}-\d{2}$/, f.env);
    assert.ok(f.removeBy > today, `${f.env} is past its review date ${f.removeBy}`);
  }
});

test('names and environment variables are unique, and no secret is listed', () => {
  assert.equal(new Set(FLAGS.map((f) => f.name)).size, FLAGS.length);
  assert.equal(new Set(FLAGS.map((f) => f.env)).size, FLAGS.length);
  assert.deepEqual(FLAGS.filter((f) => SECRET.test(f.env)), []);
});

test('readFlag returns the environment value, falls back to the default, and refuses an unknown name', () => {
  assert.equal(readFlag('labGasN', {}), '20');
  assert.equal(readFlag('labGasN', { LAB_GAS_N: '5' }), '5');
  assert.throws(() => readFlag('nope'), /unknown flag/);
});
