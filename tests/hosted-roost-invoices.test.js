import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { HostedRoost } from '../src/roost-service/hosted-roost.js';
import { generateClientKey, openFromModel, sealToModel } from '../src/enclave/e2ee.js';
import { signInputWithNearKey, inputMessage, nearKeyPair } from '../src/roost-service/signed-input.js';
import { signInvoice, invoiceHash } from '../src/roost-service/invoice.js';
import { verifyAuditorPack, auditOpenMessage } from '../src/roost-service/auditor.js';
import { verifyStatement } from '../src/roost-service/receipts.js';

const provider = { simulated: true, attest: async () => Buffer.from('t'), info: async () => ({}) };
const ROUND = { contractId: 'c.near', syndicateId: 'pay', epoch: 1, roundNonce: 'ab'.repeat(32) };
const employerKeys = nearKeyPair(); const strangerKeys = nearKeyPair();
const keyCheck = async (id, pk) => (id === 'er.near' && pk === employerKeys.publicKey) || (id === 'x.near' && pk === strangerKeys.publicKey);
const payeeKeys = Object.fromEntries(['a1', 'a2', 'a3'].map((k) => [k, generateClientKey()]));
const signing = Object.fromEntries(['a1', 'a2', 'a3'].map((k) => [k, crypto.generateKeyPairSync('ed25519')]));
const auditorKey = generateClientKey(); const employerReadKey = generateClientKey();
const LINES = [['a1', 'Alice', '0.05'], ['a2', 'Bo', '0.04'], ['a3', 'Cy', '0.03']].map(([k, person, gross]) => ({ payee: `${k}.near`, person, invoiceId: `INV-${k}`, period: '2026-11', gross, tax: '0.005', benefits: '0.002', payeeKey: payeeKeys[k].publicKeyHex }));
const bodyFor = (l, over = {}) => ({ invoiceId: l.invoiceId, period: l.period, chain: 'near', address: l.payee, asset: 'NEAR', amount: l.gross, ...over });
const params = { employer: 'er.near', taxAddress: 'tax.near', benefitsAddress: 'ben.near', employerKeyHex: employerReadKey.publicKeyHex, auditorKeyHex: auditorKey.publicKeyHex, runId: 'run-1', requireInvoices: true };

const mk = () => { const r = new HostedRoost({ provider, requireSignedInputs: true, accountKeyCheck: keyCheck }); r.openRound(ROUND); return r; };
const submitRun = async (r, lines = LINES) => { const cipherTextHex = sealToModel(JSON.stringify({ lines }), r.intentPublicKey); return r.submitSignedIntent({ flyerId: 'er.near', cipherTextHex, publicKey: employerKeys.publicKey, signature: signInputWithNearKey(employerKeys.secretKey, inputMessage({ ...ROUND, flyerId: 'er.near', seq: 1, cipherTextHex })), seq: 1 }); };
const sendInvoice = (r, inv) => r.submitInvoice({ cipherTextHex: sealToModel(JSON.stringify(inv), r.intentPublicKey) });
const invoicesFor = (r, over = {}) => LINES.map((l) => sendInvoice(r, signInvoice(bodyFor(l, over[l.invoiceId]), signing[l.invoiceId.slice(-2)].privateKey)));

test('a sealed, payee-signed invoice is accepted and its hash returned', () => {
  const r = mk(); const l = LINES[0]; const inv = signInvoice(bodyFor(l), signing.a1.privateKey);
  const out = sendInvoice(r, inv);
  assert.equal(out.accepted, true); assert.equal(out.invoiceHash, invoiceHash(inv.body));
});

test('an invoice with a bad signature, or garbage, or a second invoice for the same id, is refused', () => {
  const r = mk(); const l = LINES[0]; const inv = signInvoice(bodyFor(l), signing.a1.privateKey);
  assert.throws(() => sendInvoice(r, { ...inv, sig: '00'.repeat(64) }), /signature/);
  assert.throws(() => r.submitInvoice({ cipherTextHex: 'aa'.repeat(60) }), /could not be read|invoice/i);
  sendInvoice(r, inv);
  assert.throws(() => sendInvoice(r, signInvoice(bodyFor(l, { amount: '9' }), signing.a1.privateKey)), /already/);
});

test('a pay run whose lines all match their invoices runs, and every pay receipt carries its invoice hash under the order hash', async () => {
  const r = mk(); invoicesFor(r); await submitRun(r);
  const out = r.runPayrun(params);
  assert.equal(out.outcome.invoicesMatched, 3);
  const doc = JSON.parse(openFromModel(out.statements.payees['a1.near'].cipherHex, payeeKeys.a1.secretX25519));
  assert.equal(doc.receipt.invoiceHash, invoiceHash(bodyFor(LINES[0])));
  assert.equal(verifyStatement({ cipherHex: out.statements.payees['a1.near'].cipherHex, secretX25519: payeeKeys.a1.secretX25519, hostSettlePublicKey: out.settlePublicKey, onChainOrderHash: out.orderHash }).ok, true);
});

test('a line whose amount or destination differs from its invoice stops the whole run, and the queue is kept', async () => {
  for (const [label, over] of [['amount', { 'INV-a2': { amount: '0.99' } }], ['destination', { 'INV-a3': { address: 'evil.near' } }]]) {
    const r = mk(); invoicesFor(r, over); await submitRun(r);
    assert.throws(() => r.runPayrun(params), /invoice/i, label);
    assert.ok(r.sealedIntents.length >= 1, `${label}: the employer's queued run is kept`);
  }
});

test('a line with no invoice at all stops the run', async () => {
  const r = mk(); sendInvoice(r, signInvoice(bodyFor(LINES[0]), signing.a1.privateKey)); await submitRun(r);
  assert.throws(() => r.runPayrun(params), /no invoice/i);
});

test('without requireInvoices the run works as before and receipts carry no invoice hash', async () => {
  const r = mk(); await submitRun(r);
  const out = r.runPayrun({ ...params, requireInvoices: false });
  const doc = JSON.parse(openFromModel(out.statements.payees['a1.near'].cipherHex, payeeKeys.a1.secretX25519));
  assert.equal('invoiceHash' in doc.receipt, false);
});

// ---- the auditor pack: opened only on the employer's signed request ----
const runOnce = async () => { const r = mk(); invoicesFor(r); await submitRun(r); const out = r.runPayrun(params); return { r, out }; };
const openRequest = (indices, keys = employerKeys, employer = 'er.near', auditor = auditorKey.publicKeyHex, runId = 'run-1') => ({ runId, indices, auditorKeyHex: auditor, employer, publicKey: keys.publicKey, signature: signInputWithNearKey(keys.secretKey, auditOpenMessage({ runId, indices, auditorKeyHex: auditor })) });

test('the employer\'s signed request opens chosen lines for the auditor, who verifies them against the order hash', async () => {
  const { r, out } = await runOnce();
  const res = await r.openAuditLines(openRequest([1]));
  const pack = JSON.parse(openFromModel(res.packCipherHex, auditorKey.secretX25519));
  assert.equal(pack.opened.length, 1); assert.equal(pack.opened[0].leaf.person, 'Bo');
  assert.equal(verifyAuditorPack(pack, out.orderHash).ok, true);
  const text = JSON.stringify(pack); assert.equal(text.includes('Alice'), false); assert.equal(text.includes('Cy'), false);
});

test('a request not signed by the employer\'s account key is refused', async () => {
  const { r } = await runOnce();
  await assert.rejects(() => r.openAuditLines(openRequest([0], strangerKeys)), /not a key of|employer/i);
  const forged = openRequest([0]); forged.signature = openRequest([1]).signature;
  await assert.rejects(() => r.openAuditLines(forged), /signature/i);
});

test('the signature covers the lines and the auditor: changing either after signing is refused', async () => {
  const { r } = await runOnce();
  const req = openRequest([0]);
  await assert.rejects(() => r.openAuditLines({ ...req, indices: [0, 1] }), /signature/i);
  await assert.rejects(() => r.openAuditLines({ ...req, auditorKeyHex: generateClientKey().publicKeyHex }), /signature/i);
});

test('out-of-range, repeated or too many lines, and an unknown run, are refused', async () => {
  const { r } = await runOnce();
  await assert.rejects(() => r.openAuditLines(openRequest([99])), /range|index/i);
  await assert.rejects(() => r.openAuditLines(openRequest([0, 0])), /distinct|repeat/i);
  await assert.rejects(() => r.openAuditLines(openRequest([0], employerKeys, 'er.near', auditorKey.publicKeyHex, 'other-run')), /run/i);
});
