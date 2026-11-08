import test from 'node:test';
import assert from 'node:assert/strict';
import { HostedRoostClient } from '../src/roost-service/client.js';

test('HostedRoostClient.abandonRound posts to /abandon with the coordinator key', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, method: init.method, headers: init.headers }); return { ok: true, status: 200, json: async () => ({ abandoned: true }) }; };
  const c = new HostedRoostClient({ baseUrl: 'http://roost', adminKey: 'K'.repeat(30), fetchImpl });
  assert.deepEqual(await c.abandonRound(), { abandoned: true });
  assert.equal(calls[0].url, 'http://roost/abandon');
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].headers['x-roost-admin-key'], 'K'.repeat(30));
});
