import test from 'node:test';
import assert from 'node:assert/strict';
import { makeAgreeingAccountKeyCheck } from '../src/roost-service/signed-input.js';
import { roostFromEnv } from '../src/roost-service/server.js';

const CONTRACT = 'c.test.testnet';
// A fake RPC per URL: each answers view_access_key from its own table.
const rpcs = (tables) => async (url) => ({ json: async () => (typeof tables[url] === 'function' ? tables[url]() : tables[url]) });
const full = { result: { permission: 'FullAccess' } };
const fn = (receiver) => ({ result: { permission: { FunctionCall: { receiver_id: receiver } } } });
const missing = { result: { error: 'access key ed25519:K does not exist while viewing', logs: [] } }; // the shape both real providers return (HTTP 200)
const rateLimited = { jsonrpc: '2.0', error: { code: -429, message: 'Rate limits exceeded' } };
const noSleep = async () => {};
const URLS = ['https://a.example', 'https://b.example'];
const check = (tables) => makeAgreeingAccountKeyCheck({ rpcUrls: URLS, contractId: CONTRACT, sleep: noSleep, fetchImpl: async (url) => (await rpcs(tables)(url)) });

test('every provider confirms the key: accepted', async () => {
  assert.equal(await check({ [URLS[0]]: full, [URLS[1]]: full })('ada.testnet', 'ed25519:K'), true);
  assert.equal(await check({ [URLS[0]]: fn(CONTRACT), [URLS[1]]: full })('ada.testnet', 'ed25519:K'), true);
});

test('one provider says the key is not the account\'s: refused (fail closed)', async () => {
  assert.equal(await check({ [URLS[0]]: full, [URLS[1]]: missing })('ada.testnet', 'ed25519:K'), false);
  assert.equal(await check({ [URLS[0]]: missing, [URLS[1]]: full })('ada.testnet', 'ed25519:K'), false);
});

test('providers that disagree about the permission: refused', async () => {
  assert.equal(await check({ [URLS[0]]: full, [URLS[1]]: fn('someone-else.testnet') })('ada.testnet', 'ed25519:K'), false);
});

test('one provider failing to answer is an error, not an acceptance', async () => {
  const c = check({ [URLS[0]]: full, [URLS[1]]: () => { throw new Error('connection refused'); } });
  await assert.rejects(() => c('ada.testnet', 'ed25519:K'), /connection refused/);
});

test('a single provider, or the same one twice, is refused when the check is built', () => {
  assert.throws(() => makeAgreeingAccountKeyCheck({ rpcUrls: [URLS[0]], contractId: CONTRACT }), /two or more different/);
  assert.throws(() => makeAgreeingAccountKeyCheck({ rpcUrls: [URLS[0], URLS[0] + '/'], contractId: CONTRACT }), /two or more different/);
});

const provider = { simulated: true, attest: async () => Buffer.from('t'), info: async () => ({}) };
test('roostFromEnv: the key check uses ROOST_ACCOUNT_CHECK_RPC_URLS when set, otherwise the escrow providers', () => {
  const base = { ROOST_CONTRACT_ID: CONTRACT, ROOST_REQUIRE_SIGNED_INPUTS: '1' };
  assert.equal(typeof roostFromEnv({ ...base, ROOST_RPC_URLS: 'https://a.example,https://b.example' }, provider).accountKeyCheck, 'function');
  assert.equal(typeof roostFromEnv({ ...base, ROOST_RPC_URLS: 'https://dead-a.invalid,https://dead-b.invalid', ROOST_ACCOUNT_CHECK_RPC_URLS: 'https://a.example,https://b.example' }, provider).accountKeyCheck, 'function');
});

test('roostFromEnv: signed inputs with only one key-check provider are refused', () => {
  assert.throws(() => roostFromEnv({ ROOST_CONTRACT_ID: CONTRACT, ROOST_REQUIRE_SIGNED_INPUTS: '1', ROOST_RPC_URLS: 'https://a.example,https://b.example', ROOST_ACCOUNT_CHECK_RPC_URLS: 'https://a.example' }, provider), /two or more different/);
});

// ---- a provider that cannot answer is not the same as "not a key" (found 2026-11-11: a rate-limited provider made the room refuse every member's key as "not a key")
test('a rate-limited provider is retried, and a later good answer is used', async () => {
  let n = 0;
  const c = check({ [URLS[0]]: full, [URLS[1]]: () => { n += 1; return n < 3 ? rateLimited : full; } });
  assert.equal(await c('ada.testnet', 'ed25519:K'), true);
  assert.equal(n, 3);
});

test('a provider that keeps rate-limiting is an ERROR naming the provider, not "not a key"', async () => {
  const c = check({ [URLS[0]]: full, [URLS[1]]: rateLimited });
  await assert.rejects(() => c('ada.testnet', 'ed25519:K'), /b\.example could not answer.*429|b\.example could not answer/);
});

test('an HTTP error from a provider is also an error, not "not a key"', async () => {
  const c = makeAgreeingAccountKeyCheck({ rpcUrls: URLS, contractId: CONTRACT, sleep: noSleep, fetchImpl: async (url) => (url === URLS[1] ? { ok: false, status: 503, json: async () => ({}) } : { json: async () => full }) });
  await assert.rejects(() => c('ada.testnet', 'ed25519:K'), /could not answer.*503/);
});

test('only a provider that says the key does not exist makes it "not a key"', async () => {
  assert.equal(await check({ [URLS[0]]: missing, [URLS[1]]: missing })('ada.testnet', 'ed25519:K'), false);
  // the older JSON-RPC error shape for the same thing
  const oldShape = { error: { name: 'HANDLER_ERROR', cause: { name: 'UNKNOWN_ACCESS_KEY' } } };
  assert.equal(await check({ [URLS[0]]: full, [URLS[1]]: oldShape })('ada.testnet', 'ed25519:K'), false);
});

test('a reply with neither a result nor a known error is an error', async () => {
  await assert.rejects(() => check({ [URLS[0]]: full, [URLS[1]]: {} })('ada.testnet', 'ed25519:K'), /could not answer/);
});
