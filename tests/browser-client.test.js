// The browser client must produce byte-for-byte what the Node code produces, and must run with no Node built-ins.
// Signing is deterministic, so signatures are compared directly. Sealing is random, so it is checked by opening in both directions.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { build } from 'esbuild';
import * as B from '../src/browser/midge-client.js';
import { nearKeyPair, base58Decode, inputMessage, signInputWithNearKey, verifyNearSignature } from '../src/roost-service/signed-input.js';
import { signInvoice, verifyInvoice, invoiceHash } from '../src/roost-service/invoice.js';
import { generateClientKey, sealToModel, openFromModel } from '../src/enclave/e2ee.js';
import { HostedRoost } from '../src/roost-service/hosted-roost.js';

const seedOf = (secretKey) => Buffer.from(base58Decode(secretKey.slice(8)).subarray(0, 32));
const ROUND = { contractId: 'c.near', syndicateId: 'grp', epoch: 3, roundNonce: 'ab'.repeat(32) };

test('a key made from a seed has the same NEAR-format strings as the Node key', () => {
  for (let i = 0; i < 20; i += 1) {
    const node = nearKeyPair();
    const web = B.nearKeyPairFromSeed(seedOf(node.secretKey));
    assert.equal(web.publicKey, node.publicKey);
    assert.equal(web.secretKey, node.secretKey);
  }
});

test('the signed message is identical, including for upper-case hex', () => {
  for (const cipherTextHex of ['00', 'ab'.repeat(40), 'AB'.repeat(40), crypto.randomBytes(100).toString('hex')]) {
    const args = { ...ROUND, flyerId: 'm1.near', seq: 2, cipherTextHex };
    assert.equal(B.inputMessage(args), inputMessage(args));
  }
  assert.throws(() => B.inputMessage({ ...ROUND, flyerId: 'a:b', seq: 1, cipherTextHex: 'aa' }), /flyerId/);
  assert.throws(() => B.inputMessage({ ...ROUND, flyerId: 'a.near', seq: 0, cipherTextHex: 'aa' }), /seq/);
  assert.throws(() => B.inputMessage({ ...ROUND, epoch: -1, flyerId: 'a.near', seq: 1, cipherTextHex: 'aa' }), /epoch/);
});

test('signatures are byte-identical, and each side verifies the other', () => {
  const node = nearKeyPair();
  const msg = B.inputMessage({ ...ROUND, flyerId: 'm1.near', seq: 1, cipherTextHex: crypto.randomBytes(64).toString('hex') });
  const a = signInputWithNearKey(node.secretKey, msg); const b = B.signInputWithNearKey(node.secretKey, msg);
  assert.equal(b, a);
  assert.equal(B.verifyNearSignature(node.publicKey, msg, a), true);
  assert.equal(verifyNearSignature(node.publicKey, msg, b), true);
  assert.equal(B.verifyNearSignature(node.publicKey, `${msg}x`, a), false);
  assert.equal(B.verifyNearSignature(nearKeyPair().publicKey, msg, a), false);
});

test('a fresh browser key signs what the Node verifier accepts', () => {
  const web = B.nearKeyPair();
  const msg = B.inputMessage({ ...ROUND, flyerId: 'm1.near', seq: 1, cipherTextHex: 'aabb' });
  assert.equal(verifyNearSignature(web.publicKey, msg, B.signInputWithNearKey(web.secretKey, msg)), true);
});

test('invoices: the hash, the key and the signature match Node, and each side verifies the other', () => {
  const nodeKey = crypto.generateKeyPairSync('ed25519');
  const seed = nodeKey.privateKey.export({ format: 'der', type: 'pkcs8' }).subarray(-32);
  const body = { invoiceId: 'INV-1', period: '2026-11', chain: 'near', address: 'p1.testnet', asset: 'NEAR', amount: '0.05' };
  const a = signInvoice(body, nodeKey.privateKey); const b = B.signInvoiceWithSeed(body, seed);
  assert.deepEqual(b, a);
  assert.equal(B.invoiceHash(body), invoiceHash(body));
  assert.equal(verifyInvoice(b).ok, true);
  assert.equal(B.verifyInvoice(a).ok, true);
  assert.equal(B.verifyInvoice({ ...a, body: { ...body, amount: '0.06' } }).ok, false);
});

test('sealing opens in both directions', () => {
  const room = generateClientKey(); // stands in for the room's intent key
  const sealedByWeb = B.sealToModel('hello from the browser', room.publicKeyHex);
  assert.equal(openFromModel(sealedByWeb, room.secretX25519), 'hello from the browser');
  const webRecipient = B.generateClientKey();
  const sealedByNode = sealToModel('hello from node', webRecipient.publicKeyHex);
  assert.equal(B.openFromModel(sealedByNode, webRecipient.secretX25519), 'hello from node');
  assert.notEqual(B.sealToModel('same', room.publicKeyHex), B.sealToModel('same', room.publicKeyHex));
  assert.throws(() => B.openFromModel(sealedByNode, B.generateClientKey().secretX25519));
});

test('an intent built in the browser is accepted by the real room', async () => {
  const member = B.nearKeyPair();
  const provider = { simulated: true, attest: async () => Buffer.from('t'), info: async () => ({}) };
  const room = new HostedRoost({ provider, requireSignedInputs: true, accountKeyCheck: async (id, pk) => id === 'm1.near' && pk === member.publicKey });
  room.openRound(ROUND);
  const intent = B.buildSignedIntent({ round: ROUND, flyerId: 'm1.near', seq: 1, body: { amount: '0.04' }, intentPublicKey: room.intentPublicKey, secretKey: member.secretKey });
  assert.deepEqual(Object.keys(intent).sort(), ['cipherTextHex', 'flyerId', 'publicKey', 'seq', 'signature']);
  const out = await room.submitSignedIntent(intent);
  assert.ok(out);
  const forged = { ...intent, flyerId: 'm2.near' };
  await assert.rejects(() => room.submitSignedIntent(forged));
});

test('the client bundles for the browser with no Node built-ins', async () => {
  const res = await build({ entryPoints: ['src/browser/midge-client.js'], bundle: true, write: false, platform: 'browser', format: 'esm', target: 'es2022', logLevel: 'silent', metafile: true });
  const text = res.outputFiles[0].text;
  assert.equal(/node:|require\(["']crypto["']\)|from ["']crypto["']/.test(text), false);
  assert.equal(Object.keys(res.metafile.inputs).some((p) => /^(src\/(roost-service|enclave)|node:)/.test(p)), false, 'it must not import the Node modules');
  assert.ok(text.length < 400_000, `bundle is ${text.length} bytes`);
});
