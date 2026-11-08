// Keys are opt-in: running the master suite with a key in the environment must not read .env, send the key anywhere,
// call a paid endpoint, or rewrite the evidence file. The live check is a separate, explicit command.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const spy = path.join(root, 'tests/helpers/spy.mjs');
const evidence = path.join(root, 'docs/canonical/inference-evidence.json');
const sha = (p) => (fs.existsSync(p) ? crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex') : 'absent');

function run(args, env = {}) {
  const log = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'spy-')), 'log.json');
  const r = spawnSync(process.execPath, ['--import', spy, ...args], { cwd: root, encoding: 'utf8', timeout: 240000, env: { ...process.env, SPY_LOG: log, NEARAI_API_KEY: 'decoy-key-for-test', NEAR_AI_API_KEY: '', ...env } });
  return { ...r, log: fs.existsSync(log) ? JSON.parse(fs.readFileSync(log, 'utf8')) : null };
}

test('verify-all with a key in the environment reads no .env, sends no key, calls no paid endpoint and writes no evidence', () => {
  const before = sha(evidence);
  const t0 = Date.now();
  const r = run(['verify-all.js']);
  const took = Date.now() - t0;
  assert.ok(r.log, 'the spy ran');
  assert.deepEqual(r.log.envReads, [], '.env must not be read');
  const local = (q) => /^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(q.url);
  assert.deepEqual(r.log.requests.filter((q) => q.auth && !local(q)), [], 'no key may leave this machine (the suite\'s own localhost mocks may use a fake one)');
  assert.deepEqual(r.log.requests.filter((q) => !local(q) && /\/chat\/completions|\/signature\//.test(q.url)), [], 'no paid endpoint');
  assert.equal(sha(evidence), before, 'the evidence file must not be rewritten');
  assert.match(r.stdout, /npm run verify:inference/, 'the output tells the reader how to turn the live check on');
  assert.match(r.stdout, /NEARAI_API_KEY/);
  assert.equal(r.status, 0, r.stdout.slice(-600));
  assert.ok(took < 45000, `the process must exit when it is done, not wait for retry timers (took ${took} ms)`);
});

test('the live check without a key stops and says what to do', () => {
  const r = run(['scripts/verify-inference.js'], { NEARAI_API_KEY: '', NEAR_AI_API_KEY: '' });
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /cloud\.near\.ai/);
  assert.match(r.stdout + r.stderr, /export NEARAI_API_KEY/);
  assert.deepEqual(r.log.envReads, [], 'it must not go looking in .env');
});
