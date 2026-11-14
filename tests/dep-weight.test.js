import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compare, measure } from '../scripts/dep-weight.mjs';

const base = { total: 300, packages: { a: 100, b: 200 } };

test('no growth, and shrinking, are fine', () => {
  assert.deepEqual(compare(base, base), []);
  assert.deepEqual(compare({ total: 250, packages: { a: 100, b: 150 } }, base), []);
});

test('a package that grew, a new production package, and a larger total are each reported', () => {
  assert.deepEqual(compare({ total: 301, packages: { a: 101, b: 200 } }, base), ['total grew from 300 to 301 bytes', 'a grew from 100 to 101 bytes']);
  assert.match(compare({ total: 300, packages: { a: 100, b: 150, c: 50 } }, base).join(), /new production package c/);
});

test('the repository is within its recorded baseline (needs npm ci)', () => {
  const baseline = JSON.parse(fs.readFileSync(new URL('../scripts/dep-weight.baseline.json', import.meta.url), 'utf8'));
  assert.deepEqual(compare(measure(), baseline), []);
});

test('the baseline counts production packages only', () => {
  const baseline = JSON.parse(fs.readFileSync(new URL('../scripts/dep-weight.baseline.json', import.meta.url), 'utf8'));
  for (const dev of ['@biomejs/biome', 'typescript', 'knip', 'jscpd', 'dependency-cruiser', 'playwright-core', 'esbuild']) assert.equal(baseline.packages[dev], undefined, dev);
  assert.ok(baseline.packages.ethers && baseline.packages['near-api-js']);
});
