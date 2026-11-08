// With no --tier and no --only the lab runner must not run anything that spends testnet funds or a paid API.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;
const plan = (...args) => { const r = spawnSync(process.execPath, ['lab/run.js', '--print-plan', ...args], { cwd: root, encoding: 'utf8', timeout: 120000 }); return { status: r.status, out: r.stdout + r.stderr }; };

test('with no flags the plan is the offline tier only, and says so', () => {
  const r = plan();
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /E-ESCROWBOUND-01\b/);
  assert.doesNotMatch(r.out, /E-ESCROWBOUND-LIVE-01/);
  assert.match(r.out, /offline tier only/i);
  for (const line of r.out.split('\n').filter((l) => /^\s*(plan|run)\b/.test(l) || /^E-/.test(l.trim()))) assert.doesNotMatch(line, /\b(testnet|cloud|hardware)\b/);
});

test('--tier testnet plans the testnet experiments and warns that they spend testnet NEAR', () => {
  const r = plan('--tier', 'testnet');
  assert.match(r.out, /E-ESCROWBOUND-LIVE-01/);
  assert.match(r.out, /spend/i);
});

test('naming a testnet experiment with --only still plans it, with the same warning', () => {
  const r = plan('--only', 'E-ESCROWBOUND-LIVE-01');
  assert.match(r.out, /E-ESCROWBOUND-LIVE-01/);
  assert.match(r.out, /spend/i);
  assert.doesNotMatch(r.out, /E-ESCROWBOUND-01\b/);
});

test('--print-plan runs nothing and writes no run directory', () => {
  const before = spawnSync('ls', ['lab/runs'], { cwd: root, encoding: 'utf8' }).stdout;
  plan('--tier', 'testnet');
  assert.equal(spawnSync('ls', ['lab/runs'], { cwd: root, encoding: 'utf8' }).stdout, before);
});

test('an unknown option is an error, never "run everything" (paired with --print-plan so a regression can only print)', () => {
  const r = plan('--tier', 'offlin', '--bogus');
  assert.equal(r.status, 2, r.out);
  assert.match(r.out, /unknown option --bogus/);
  assert.doesNotMatch(r.out, /^plan /m, 'nothing was planned, let alone run');
});
