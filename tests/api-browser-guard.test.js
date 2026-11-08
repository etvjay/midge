// Audit run-1, lead 7: with no API key set, a web page must not be able to make the daemon sign chain writes.
// A CORS-simple POST (text/plain) needs no preflight, so only an Origin/Host check stops it.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { FlyApiDaemon } from '../src/api/server.js';

delete process.env.FLY_API_KEY;

async function withDaemon(opts, fn) {
  const deposits = [];
  const chainClient = { isConfiguredForWrites: () => true, deposit: async (a) => { deposits.push(a); return { flyerId: 'srv.testnet', amountNear: a.amountNear, txHash: 'tx' }; } };
  const d = new FlyApiDaemon({ port: 0, mode: 'chain', chainClient, ...opts });
  const { port } = await d.start();
  // fetch() will not let us set Host, so use http.request
  const post = (headers) => new Promise((resolve, reject) => {
    const body = JSON.stringify({ amountNear: '5', policyHash: 'x' });
    const req = http.request({ host: '127.0.0.1', port, path: '/v1/syndicates/abc/deposit', method: 'POST', headers: { 'content-type': 'text/plain', 'content-length': Buffer.byteLength(body), ...headers } }, (res) => { let t = ''; res.on('data', (c) => (t += c)); res.on('end', () => resolve({ status: res.statusCode, text: t })); });
    req.on('error', reject); req.end(body);
  });
  try { await fn({ post, deposits }); } finally { await d.stop(); }
}

test('a cross-site page cannot make the daemon deposit', async () => {
  await withDaemon({}, async ({ post, deposits }) => {
    const r = await post({ origin: 'https://evil.example' });
    assert.equal(r.status, 403);
    assert.equal(deposits.length, 0);
  });
});

test('a rebound hostname cannot reach the daemon', async () => {
  await withDaemon({}, async ({ post, deposits }) => {
    const r = await post({ host: 'attacker.example' });
    assert.equal(r.status, 403);
    assert.equal(deposits.length, 0);
  });
});

test('a local call with no Origin still works', async () => {
  await withDaemon({}, async ({ post, deposits }) => {
    const r = await post({});
    assert.equal(r.status, 200);
    assert.equal(deposits.length, 1);
  });
});

test('a page on localhost, or on an origin the owner allowed, still works', async () => {
  await withDaemon({ allowedOrigins: ['https://app.example'] }, async ({ post, deposits }) => {
    assert.equal((await post({ origin: 'http://localhost:3000' })).status, 200);
    assert.equal((await post({ origin: 'https://app.example' })).status, 200);
    assert.equal(deposits.length, 2);
  });
});
