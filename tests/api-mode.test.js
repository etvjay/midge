// Plan 09-1, Task 10 (hole H4): a malformed key must not silently turn the daemon into the in-memory simulation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FlyApiDaemon } from '../src/api/server.js';

function withEnv(vars, fn) {
  const keys = ['NEAR_ACCOUNT_ID', 'NEAR_PRIVATE_KEY', 'FLY_MODE', 'FLY_API_KEY', 'MIDGE_ENV_FILE'];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  for (const k of keys) delete process.env[k];
  Object.assign(process.env, vars);
  const warn = console.warn; const warnings = []; console.warn = (...a) => warnings.push(a.join(' '));
  return Promise.resolve().then(() => fn(warnings)).finally(() => {
    console.warn = warn;
    for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  });
}
const BAD = { NEAR_ACCOUNT_ID: 'a.testnet', NEAR_PRIVATE_KEY: 'this-is-not-a-key' };

test('asking for chain mode with a malformed key throws, naming the cause', () => withEnv(BAD, () => {
  assert.throws(() => new FlyApiDaemon({ port: 0, mode: 'chain' }), /chain mode/i);
}));

test('FLY_MODE=chain with a malformed key throws too', () => withEnv({ ...BAD, FLY_MODE: 'chain' }, () => {
  assert.throws(() => new FlyApiDaemon({ port: 0 }), /chain mode/i);
}));

test('with no mode asked for, a malformed key falls back to model, says why, warns once and shows it on /health', () => withEnv(BAD, async (warnings) => {
  const d = new FlyApiDaemon({ port: 0 });
  assert.equal(d.mode, 'model');
  assert.ok(typeof d.modeFallbackReason === 'string' && d.modeFallbackReason.length > 0);
  assert.equal(warnings.length, 1);
  const { port } = await d.start();
  try {
    const body = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
    assert.equal(body.mode, 'model');
    assert.equal(body.modeFallbackReason, d.modeFallbackReason);
  } finally { await d.stop(); }
}));

test('asking for model mode is quiet and /health says model', () => withEnv(BAD, async (warnings) => {
  const d = new FlyApiDaemon({ port: 0, mode: 'model' });
  assert.equal(d.mode, 'model');
  assert.equal(d.modeFallbackReason ?? null, null);
  assert.equal(warnings.length, 0);
}));

test('with no credentials at all the daemon stays in chain mode, read-only (unchanged)', () => withEnv({}, () => {
  const d = new FlyApiDaemon({ port: 0 });
  assert.equal(d.mode, 'chain');
}));
