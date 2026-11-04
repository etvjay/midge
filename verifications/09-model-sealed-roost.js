import http from 'node:http';
import crypto from 'node:crypto';
import { ed25519 } from '@noble/curves/ed25519.js';
import { ModelSealedRoost, RoostAggregationError } from '../src/enclave/model-sealed-roost.js';
import { sealToModel, openFromModel } from '../src/enclave/e2ee.js';
import { createRoost, resolveBackend } from '../src/enclave/factory.js';
import { sealBidForRoost } from '../src/enclave/member.js';

/**
 * Verification 09: the model-sealed Roost, against a local mock of the NEAR AI Cloud gateway.
 * The mock implements the real E2EE v2 protocol on the model side (it can decrypt only because it
 * holds the model secret) and signs receipts like the live endpoint. The point of this suite is the
 * Roost's behaviour: what it holds, and that it fails closed. Live behaviour is checked separately by
 * `npm run verify:roost-model`, which needs a NEAR AI Cloud API key.
 */

export const MODEL = 'Qwen/Qwen3.6-35B-A3B-FP8';
const MARKER = 'SEALED-BID-MARKER-5521';
const sha256Hex = (s) => crypto.createHash('sha256').update(s).digest('hex');
const hex = (u) => Buffer.from(u).toString('hex');

export function startMockGateway() {
  const state = { seed: crypto.randomBytes(32), mode: {}, wireBodies: [], receipts: new Map(), calls: 0 };
  const keys = () => ({
    pub: hex(ed25519.getPublicKey(state.seed)),
    secretX: ed25519.utils.toMontgomerySecret(state.seed),
  });

  const buildQuote = (pubHex, nonceHex) => {
    const q = Buffer.alloc(700);
    q.writeUInt16LE(state.mode.badQuoteVersion ? 3 : 4, 0);
    q.writeUInt16LE(2, 2);
    q.writeUInt32LE(0x81, 4);
    const rdKey = state.mode.keyNotInQuote ? hex(crypto.randomBytes(32)) : pubHex;
    const rdNonce = state.mode.nonceNotInQuote ? hex(crypto.randomBytes(32)) : nonceHex;
    Buffer.from(rdKey + rdNonce, 'hex').copy(q, 568);
    return q.toString('hex');
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const json = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };

    if (url.pathname === '/v1/attestation/report') {
      const nonce = url.searchParams.get('nonce');
      state.lastAttestationHadAuth = Boolean(req.headers.authorization);
      const { pub } = keys();
      if (state.mode.noCandidates) return json(200, { model_attestations: [] });
      return json(200, {
        model_attestations: [{
          model_name: state.mode.wrongModelName ? 'other/model' : url.searchParams.get('model'),
          signing_algo: 'ed25519', signing_public_key: pub, signing_address: pub,
          request_nonce: nonce, intel_quote: buildQuote(pub, nonce),
        }],
      });
    }

    if (url.pathname.startsWith('/v1/signature/')) {
      const id = decodeURIComponent(url.pathname.split('/').pop());
      const r = state.receipts.get(id);
      if (!r) return json(404, { error: 'unknown id' });
      const text = `${MODEL}:${r.reqHash}:${r.respHash}`;
      let signature = hex(ed25519.sign(Buffer.from(text), state.seed));
      if (state.mode.badSignature) signature = hex(crypto.randomBytes(64));
      const signer = state.mode.wrongSigner ? hex(crypto.randomBytes(32)) : keys().pub;
      return json(200, { text, signature, signing_address: signer, signing_algo: 'ed25519', signature_kind: 'provider_tee' });
    }

    if (url.pathname === '/v1/chat/completions' && req.method === 'POST') {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        state.wireBodies.push(body);
        const n = state.calls++;
        const clientPub = req.headers['x-client-pub-key'];
        let messages;
        try { messages = JSON.parse(body).messages; } catch { return json(400, { error: 'bad body' }); }
        const { secretX } = keys();
        let plain;
        try { plain = messages.map((m) => openFromModel(m.content, secretX)); } catch { return json(400, { error: 'cannot decrypt' }); }
        // The mock "model" sums the amount of every bid message (all but the last, the instruction).
        const bids = plain.slice(0, -1).map((t) => { try { return JSON.parse(t); } catch { return {}; } });
        let total = bids.reduce((a, b) => a + (typeof b.amount === 'number' ? b.amount : 0), 0);
        let count = bids.length;
        if (state.mode.jitter && n % 3 === 1) total += 1;
        if (state.mode.miscount) count -= 1;
        const reply = state.mode.scriptedReply ? state.mode.scriptedReply(plain) : state.mode.extraField ? JSON.stringify({ total, count, details: bids.map((b) => b.amount) })
          : state.mode.extraText ? `Sure. ${JSON.stringify({ total, count })} Also: ${bids.map((b) => b.amount).join(',')}`
          : JSON.stringify({ total, count });
        const content = state.mode.plaintextReply ? reply : sealToModel(reply, clientPub);
        let c = content;
        if (state.mode.tamperReply) c = c.slice(0, 120) + (c[120] === 'a' ? 'b' : 'a') + c.slice(121);
        const id = `mock-${crypto.randomBytes(8).toString('hex')}`;
        const respText = JSON.stringify({ id, choices: [{ message: { content: c } }] });
        state.receipts.set(id, { reqHash: sha256Hex(body), respHash: sha256Hex(respText) });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(respText);
      });
      return;
    }
    json(404, { error: 'not found' });
  });

  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ state, keys, server, url: `http://127.0.0.1:${server.address().port}` })));
}

export async function verifyModelSealedRoost() {
  console.log('\n======================================================');
  console.log(' [VERIFICATION 10] MODEL-SEALED ROOST (E2EE TO NEAR AI MODEL TEE)');
  console.log(' Target: bids sealed to an attested key, coordinator holds ciphertext only');
  console.log('======================================================');

  const gw = await startMockGateway();
  const results = [];
  const check = (name, ok, detail = '') => {
    results.push({ name, ok: Boolean(ok) });
    console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` (${detail})` : ''}`);
  };
  const newRoost = (opts = {}) => new ModelSealedRoost({ apiKey: 'test-key', baseUrl: gw.url, model: MODEL, chain: 'skip', ...opts });
  const rejects = async (fn, pattern) => {
    try { await fn(); return false; } catch (e) { return e instanceof RoostAggregationError && (!pattern || pattern.test(e.message)); }
  };
  const fill = (roost, amounts, extra = {}) => amounts.forEach((amount, i) => roost.submitSealedIntent({
    flyerId: `flyer-${i}`, cipherTextHex: roost.sealIntent({ amount, note: extra.note || MARKER, i }),
  }));

  try {
    console.log('\n[1/8] Attestation of the model key');
    gw.state.mode = {};
    let r = newRoost();
    const att = await r.attest();
    check('accepts a model attestation whose quote binds our nonce and the model key', att.checks.every((c) => c.ok), `${att.checks.length} checks`);
    check('keeps the attested model public key', r.modelPublicKey === gw.keys().pub);
    for (const [label, mode, pattern] of [
      ['nonce missing from the quote', { nonceNotInQuote: true }, /nonce is inside the quote/],
      ['model key missing from the quote', { keyNotInQuote: true }, /signing key is inside the quote/],
      ['quote with the wrong version', { badQuoteVersion: true }, /quote is Intel TDX v4/],
      ['attestation for a different model', { wrongModelName: true }, /requested model/],
      ['report with no candidates', { noCandidates: true }, /no model_attestations/],
    ]) {
      gw.state.mode = mode;
      check(`rejects: ${label}`, await rejects(() => newRoost().attest(), pattern));
    }
    gw.state.mode = {};

    console.log('\n[2/8] Sealing and aggregation');
    r = newRoost();
    await r.attest();
    fill(r, [1200, 850, 430]);
    gw.state.wireBodies = [];
    const out = await r.aggregateAndClear();
    check('three sealed bids aggregate to the exact total', out.aggregateOrder.totalInputAmount === 2480 && out.aggregateOrder.flyerCount === 3);
    check('every run agrees (3/3)', out.receipt.agreement === '3/3');
    check('every response signature verifies against the attested key', out.receipt.runs.every((x) => x.signatureVerified === true));
    check('queue is cleared after a successful round', r.sealedIntents.length === 0);
    check('the coordinator never held a bid in the clear', !JSON.stringify(r.sealedIntents).includes(MARKER)
      && gw.state.wireBodies.length === 3 && gw.state.wireBodies.every((b) => !b.includes(MARKER)), 'marker absent from state and from every request on the wire');
    check('model-sealed round reports its limits honestly', r.describe().inputsHiddenFromOperator === true && /language model/.test(r.describe().arithmetic));

    console.log('\n[3/8] Fail-closed behaviour');
    const failing = async (label, mode, pattern, opts) => {
      gw.state.mode = mode;
      const x = newRoost(opts);
      gw.state.mode = {};
      await x.attest();
      gw.state.mode = mode;
      fill(x, [100, 200, 300]);
      const ok = await rejects(() => x.aggregateAndClear(), pattern);
      check(`rejects: ${label}`, ok);
      check(`  ...and keeps the ciphertext for a retry (${label})`, x.sealedIntents.length === 3);
      gw.state.mode = {};
    };
    await failing('runs that disagree', { jitter: true }, /runs disagree/);
    await failing('a count that does not match the bids submitted', { miscount: true }, /counted 2 bids but 3/);
    await failing('a plaintext reply instead of an encrypted one', { plaintextReply: true }, /could not be decrypted/);
    await failing('a tampered encrypted reply', { tamperReply: true }, /could not be decrypted/);
    await failing('a reply with an extra field (a leaked bid)', { extraField: true }, /unexpected fields/);
    await failing('a reply with extra text around the JSON', { extraText: true }, /unexpected content/);
    await failing('a signature that does not verify', { badSignature: true }, /does not verify/);
    await failing('a signature from a key that is not the attested model key', { wrongSigner: true }, /not made by the attested model key/);

    console.log('\n[4/8] Key rotation');
    r = newRoost();
    await r.attest();
    fill(r, [10, 20]);
    gw.state.seed = crypto.randomBytes(32); // the model key rotates after members sealed
    check('rejects when the model key changed since bids were sealed', await rejects(() => r.aggregateAndClear(), /model key changed/));
    r.reset();
    check('reset() drops stale ciphertext', r.sealedIntents.length === 0);

    console.log('\n[5/8] Input validation');
    r = newRoost();
    await r.attest();
    const good = r.sealIntent({ amount: 1 });
    check('rejects non-hex ciphertext', await rejects(async () => r.submitSealedIntent({ flyerId: 'a', cipherTextHex: 'zz'.repeat(80) })));
    check('rejects ciphertext that is too short', await rejects(async () => r.submitSealedIntent({ flyerId: 'a', cipherTextHex: 'ab'.repeat(10) })));
    check('rejects ciphertext that is too long', await rejects(async () => r.submitSealedIntent({ flyerId: 'a', cipherTextHex: 'ab'.repeat(5000) })));
    r.submitSealedIntent({ flyerId: 'a', cipherTextHex: good });
    check('rejects a second bid from the same flyer', await rejects(async () => r.submitSealedIntent({ flyerId: 'a', cipherTextHex: good }), /already submitted/));
    check('rejects aggregating an empty round', await rejects(() => newRoost().aggregateAndClear(), /empty/));
    const tiny = newRoost({ maxIntents: 2 });
    await tiny.attest();
    fill(tiny, [1, 2]);
    check('rejects bids beyond the round capacity', await rejects(async () => tiny.submitSealedIntent({ flyerId: 'z', cipherTextHex: tiny.sealIntent({ amount: 3 }) }), /round is full/));
    let sealedToOther = false;
    try {
      const other = newRoost();
      await other.attest();
      other.sealedIntents.push({ flyerId: 'x', cipherTextHex: sealToModel('{"amount":5}', hex(ed25519.getPublicKey(crypto.randomBytes(32)))) });
      await other.aggregateAndClear();
    } catch { sealedToOther = true; }
    check('a bid sealed to a different key cannot be used (gateway cannot decrypt it)', sealedToOther);

    console.log('\n[6/8] Scale and backend selection');
    r = newRoost();
    await r.attest();
    const amounts = Array.from({ length: 50 }, (_, i) => 100 + ((i * 37) % 900));
    fill(r, amounts);
    const big = await r.aggregateAndClear();
    check('50 sealed bids aggregate to the exact total', big.aggregateOrder.totalInputAmount === amounts.reduce((a, b) => a + b, 0) && big.aggregateOrder.flyerCount === 50);
    check('factory builds the local simulation when asked for it by name', createRoost({ backend: 'local' }).describe().backend === 'local');
    check('factory builds the model-sealed backend', createRoost({ backend: 'model-sealed', apiKey: 'k' }).describe().backend === 'model-sealed');
    check('factory rejects an unknown backend', (() => { try { createRoost({ backend: 'x' }); return false; } catch { return true; } })());
    check('local backend states plainly that it hides nothing', createRoost({ backend: 'local' }).describe().inputsHiddenFromOperator === false);

    console.log('\n[7/8] Default backend and member-side key verification');
    const saved = { b: process.env.MIDGE_ROOST_BACKEND, k: process.env.NEARAI_API_KEY };
    delete process.env.MIDGE_ROOST_BACKEND; delete process.env.NEARAI_API_KEY;
    check('default is model-sealed when a NEAR AI key is configured', resolveBackend({ apiKey: 'k' }).backend === 'model-sealed');
    check('default falls back to the local simulation only without a key, and says it fell back', resolveBackend({}).backend === 'local' && resolveBackend({}).fellBack === true);
    check('asking for the local simulation by name is not a fallback', resolveBackend({ backend: 'local' }).fellBack === false);
    process.env.NEARAI_API_KEY = 'env-key';
    check('a key in the environment selects model-sealed', resolveBackend({}).backend === 'model-sealed');
    if (saved.b === undefined) delete process.env.MIDGE_ROOST_BACKEND; else process.env.MIDGE_ROOST_BACKEND = saved.b;
    if (saved.k === undefined) delete process.env.NEARAI_API_KEY; else process.env.NEARAI_API_KEY = saved.k;

    gw.state.mode = {};
    r = newRoost();
    await r.attest();
    const session = r.getSessionInfo();
    const memberOpts = { baseUrl: gw.url, chain: 'skip' };
    const m1 = await sealBidForRoost({ session, payload: { amount: 111, note: MARKER }, ...memberOpts });
    check('a member verifies the attestation without an API key', gw.state.lastAttestationHadAuth === false);
    const m2 = await sealBidForRoost({ session, payload: { amount: 222 }, ...memberOpts });
    r.submitSealedIntent({ flyerId: 'm1', cipherTextHex: m1.cipherTextHex });
    r.submitSealedIntent({ flyerId: 'm2', cipherText: m2.cipherTextHex });
    const viaMembers = await r.aggregateAndClear();
    check('bids sealed by members after their own verification aggregate correctly', viaMembers.aggregateOrder.totalInputAmount === 333);
    const evil = { ...session, modelPublicKey: hex(ed25519.getPublicKey(crypto.randomBytes(32))) };
    check('a member refuses a key the coordinator asserts but the attestation does not support',
      await rejects(() => sealBidForRoost({ session: evil, payload: { amount: 1 }, ...memberOpts }), /does not match the attested key/));
    gw.state.mode = { nonceNotInQuote: true };
    check('a member refuses when the attestation does not verify',
      await rejects(() => sealBidForRoost({ session, payload: { amount: 1 }, ...memberOpts }), /nonce is inside the quote/));
    gw.state.mode = {};
    check('a member refuses to treat a local-simulation session as sealed',
      await rejects(() => sealBidForRoost({ session: { backend: 'local' }, payload: { amount: 1 }, ...memberOpts }), /not in model-sealed mode/));

    console.log('\n[8/8] The API key stays out of serialised state');
    check('API key is not reachable through JSON', !JSON.stringify(newRoost()).includes('test-key'));
  } finally {
    gw.server.close();
  }

  const failed = results.filter((x) => !x.ok);
  if (failed.length) throw new Error(`[MODEL-SEALED ROOST] ${failed.length} check(s) failed: ${failed.map((f) => f.name).join('; ')}`);
  console.log(`\n>>> [PASS] MODEL-SEALED ROOST: ${results.length} checks passed against a mock gateway (live behaviour: npm run verify:roost-model).`);
  return { verified: true, checks: results.length, mock: true };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  verifyModelSealedRoost().catch((e) => { console.error(e.message); process.exit(1); });
}
