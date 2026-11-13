import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoomWaker } from '../src/playground/room-waker.js';

function setup({ up = false, startOk = true, becomesUpAfter = 2, busy = false } = {}) {
  const c = { t: 1_800_000_000_000, calls: [], healthy: up, polls: 0, busy };
  const phalaFetch = async (path, { method = 'GET' } = {}) => {
    c.calls.push(`${method} ${path}`);
    if (path.endsWith('/start')) { if (!startOk) return { ok: false, status: 500, json: { detail: 'no capacity on this node' } }; c.healthy = 'soon'; return { ok: true, status: 200, json: {} }; }
    if (path.endsWith('/stop')) { c.healthy = false; return { ok: true, status: 200, json: {} }; }
    return { ok: true, status: 200, json: {} };
  };
  const healthFetch = async () => { if (c.healthy === 'soon') { c.polls += 1; if (c.polls >= becomesUpAfter) c.healthy = true; } return { ok: c.healthy === true }; };
  const waker = createRoomWaker({ phalaFetch, healthFetch, cvmId: 'cvm-1', roomUrl: 'https://room.example', now: () => c.t, idleMs: 10 * 60 * 1000, healthTimeoutMs: 60_000, pollMs: 1000, failureCooldownMs: 30_000, sleep: async () => { c.t += 1000; }, isBusy: () => c.busy });
  return { c, waker };
}

test('warm starts a stopped room once, even when several visitors ask at the same time', async () => {
  const { c, waker } = setup();
  await Promise.all([waker.warm(), waker.warm(), waker.warm()]);
  assert.equal(c.calls.filter((x) => x === 'POST /cvms/cvm-1/start').length, 1);
  assert.equal(waker.status().state, 'up');
});

test('warm does nothing when the room is already healthy', async () => {
  const { c, waker } = setup({ up: true });
  await waker.warm();
  assert.deepEqual(c.calls, []); assert.equal(waker.status().state, 'up');
});

test('a failed start is reported with its reason, and is not retried in a loop', async () => {
  const { c, waker } = setup({ startOk: false });
  await assert.rejects(waker.warm(), /no capacity/);
  await assert.rejects(waker.warm(), /no capacity/);
  assert.equal(c.calls.filter((x) => x.endsWith('/start')).length, 1, 'the second call inside the cooldown did not start it again');
  c.t += 31_000;
  await assert.rejects(waker.warm(), /no capacity/);
  assert.equal(c.calls.filter((x) => x.endsWith('/start')).length, 2, 'after the cooldown it tries once more');
});

test('a room that never becomes healthy fails with a plain message after the time limit', async () => {
  const { waker } = setup({ becomesUpAfter: 10_000 });
  await assert.rejects(waker.warm(), /did not become ready/);
});

test('tick stops the room only after the idle window, and a touch resets it', async () => {
  const { c, waker } = setup({ up: true });
  await waker.warm(); waker.touch();
  c.t += 9 * 60 * 1000; await waker.tick();
  assert.ok(!c.calls.some((x) => x.endsWith('/stop')));
  waker.touch(); c.t += 9 * 60 * 1000; await waker.tick();
  assert.ok(!c.calls.some((x) => x.endsWith('/stop')), 'the touch moved the window');
  c.t += 2 * 60 * 1000; await waker.tick();
  assert.equal(c.calls.filter((x) => x === 'POST /cvms/cvm-1/stop').length, 1);
  assert.equal(waker.status().state, 'stopped');
});

test('tick never stops the room while a round is active', async () => {
  const { c, waker } = setup({ up: true, busy: true });
  await waker.warm(); waker.touch(); c.t += 60 * 60 * 1000; await waker.tick();
  assert.ok(!c.calls.some((x) => x.endsWith('/stop')));
});
