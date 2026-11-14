import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlayground } from '../src/playground/app.js';

test('the playground builds from its environment, sweeps at start-up, and answers health', async () => {
  const swept = [];
  const app = buildPlayground({
    env: { PLAYGROUND_ORIGIN: 'https://midge.example', FUNDER_ID: 'play.t', FUNDER_KEY: 'ed25519:3D4YudUQRE39Lc4JHghuB5WM8kbgDDa2kvs57CyzZwnEjPUJ4kjQGLhYMVtEuCfFkCm9jHEdz6RobrW5pSF5PWBg', ROOM_URL: 'http://127.0.0.1:1', ROOM_ADMIN_KEY: 'k', NEARAI_API_KEY: 'x' },
    overrides: { advisor: { ask: async () => ({}) }, waker: null, keyCheck: async () => true },
  });
  app.ledger.add({ kind: 'account', id: 'left.play.t' });
  const orig = app.chain.deleteAccount; app.chain.deleteAccount = async (h) => { swept.push(h.id); return true; };
  const port = await app.start(0);
  try {
    assert.deepEqual(swept, ['left.play.t'], 'the start-up sweep deleted what the ledger listed');
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { headers: { origin: 'https://midge.example' } });
    assert.equal((await res.json()).ok, true); assert.equal(res.headers.get('access-control-allow-origin'), 'https://midge.example');
  } finally { app.chain.deleteAccount = orig; await app.stop(); }
});

test('a missing secret stops the service at start-up with its name', () => {
  assert.throws(() => buildPlayground({ env: { FUNDER_ID: 'play.t' } }), /FUNDER_KEY is required/);
});
