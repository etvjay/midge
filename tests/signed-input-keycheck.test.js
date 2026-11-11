import test from 'node:test';
import assert from 'node:assert/strict';
import { makeAgreeingAccountKeyCheck } from '../src/roost-service/signed-input.js';
import { roostFromEnv } from '../src/roost-service/server.js';

const CONTRACT = 'c.test.testnet';
// A fake RPC per URL: each answers view_access_key from its own table.
const rpcs = (tables) => async (url) => ({ json: async () => (typeof tables[url] === 'function' ? tables[url]() : tables[url]) });
const full = { result: { permission: 'FullAccess' } };
const fn = (receiver) => ({ result: { permission: { FunctionCall: { receiver_id: receiver } } } });
const missing = { error: { name: 'UNKNOWN_ACCESS_KEY' } };
const URLS = ['https://a.example', 'https://b.example'];
const check = (tables) => makeAgreeingAccountKeyCheck({ rpcUrls: URLS, contractId: CONTRACT, fetchImpl: async (url) => (await rpcs(tables)(url)) });

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
