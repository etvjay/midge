import test from 'node:test';
import assert from 'node:assert/strict';
import { retryOnRateLimit } from '../lab/lib/retry.js';

const noSleep = async () => {};

test('a rate-limited call is retried until it answers', async () => {
  let n = 0;
  const out = await retryOnRateLimit(async () => { n += 1; if (n < 3) throw new Error('{"error":{"code":-429,"message":"Rate limits exceeded"}}'); return 'ok'; }, { sleep: noSleep });
  assert.equal(out, 'ok'); assert.equal(n, 3);
});

test('any other error is thrown at once, not retried', async () => {
  let n = 0;
  await assert.rejects(() => retryOnRateLimit(async () => { n += 1; throw new Error('Contract method is not found'); }, { sleep: noSleep }), /not found/);
  assert.equal(n, 1);
});

test('it gives up after the stated number of tries and throws the last rate-limit error', async () => {
  let n = 0;
  await assert.rejects(() => retryOnRateLimit(async () => { n += 1; throw new Error('429 Too Many Requests'); }, { tries: 4, sleep: noSleep }), /429/);
  assert.equal(n, 4);
});

test('the pause grows with each retry', async () => {
  const pauses = [];
  await assert.rejects(() => retryOnRateLimit(async () => { throw new Error('rate limit'); }, { tries: 4, sleep: async (ms) => { pauses.push(ms); } }));
  assert.deepEqual(pauses, [...pauses].sort((a, b) => a - b)); assert.equal(pauses.length, 3); assert.ok(pauses[2] > pauses[0]);
});
