import test from 'node:test';
import assert from 'node:assert/strict';
import { OneClickIntentAdapter } from '../src/intents/oneclick.js';

const params = { originAsset: 'nep141:wrap.near', destinationAsset: 'nep141:sol.omft.near', amount: '1000000000000000000000000', recipient: 'KLsn8JawHSc2KMRFK9qrxifgBEm8WJ568LsvSKbaVPc', refundTo: 'near' };
const fakeFetch = (status, json, seen = []) => async (url, init) => { seen.push({ url, init }); return { ok: status < 300, status, json: async () => json, text: async () => JSON.stringify(json) }; };

test('the default payload is a plain dry quote with no confidentiality field', () => {
  const p = new OneClickIntentAdapter().createQuoteRequest(params);
  assert.equal(p.dry, true); assert.equal(p.swapType, 'EXACT_INPUT'); assert.equal('confidentiality' in p, false);
  assert.equal(p.recipientType, 'DESTINATION_CHAIN'); assert.ok(Date.parse(p.deadline) > Date.now());
});

test('confidential mode is refused without an auth token, because 1Click requires an authenticated user for it', () => {
  const a = new OneClickIntentAdapter();
  assert.throws(() => a.createQuoteRequest({ ...params, confidential: true }), /auth token/);
  const b = new OneClickIntentAdapter({ authToken: 't' });
  assert.equal(b.createQuoteRequest({ ...params, confidential: true }).confidentiality, 'basic');
});

test('getDryQuote posts the request and returns a summary with no deposit address', async () => {
  const seen = [];
  const a = new OneClickIntentAdapter({ fetchImpl: fakeFetch(201, { quote: { amountInFormatted: '1.0', amountOutFormatted: '0.044', amountInUsd: '3.69', amountOutUsd: '3.65', minAmountOut: '43595701', timeEstimate: 19 }, quoteRequest: { dry: true } }, seen) });
  const q = await a.getDryQuote(params);
  assert.equal(seen[0].url, 'https://1click.chaindefuser.com/v0/quote'); assert.equal(JSON.parse(seen[0].init.body).dry, true);
  assert.deepEqual(q, { amountIn: '1.0', amountOut: '0.044', usdIn: '3.69', usdOut: '3.65', minAmountOut: '43595701', timeEstimateSeconds: 19, dry: true });
});

test('an authenticated adapter sends the bearer token, an anonymous one does not', async () => {
  const seen = [];
  await new OneClickIntentAdapter({ authToken: 'abc', fetchImpl: fakeFetch(201, { quote: {}, quoteRequest: { dry: true } }, seen) }).getDryQuote(params);
  assert.equal(seen[0].init.headers.authorization, 'Bearer abc');
  const seen2 = [];
  await new OneClickIntentAdapter({ fetchImpl: fakeFetch(201, { quote: {}, quoteRequest: { dry: true } }, seen2) }).getDryQuote(params);
  assert.equal('authorization' in seen2[0].init.headers, false);
});

test('an API error is reported with its status and message, not swallowed', async () => {
  const a = new OneClickIntentAdapter({ fetchImpl: fakeFetch(401, { message: 'User authentication is required' }) });
  await assert.rejects(() => a.getDryQuote(params), /401.*authentication/);
});

test('a quote that is not a dry quote is refused, so this adapter can never be told to open a real swap', async () => {
  const a = new OneClickIntentAdapter({ fetchImpl: fakeFetch(201, { quote: { depositAddress: 'x' }, quoteRequest: { dry: false } }) });
  await assert.rejects(() => a.getDryQuote(params), /not a dry quote/);
});
