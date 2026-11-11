import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRoostServer } from '../src/roost-service/server.js';
import { HostedRoost } from '../src/roost-service/hosted-roost.js';
import { HostedRoostClient } from '../src/roost-service/client.js';
import { generateClientKey, openFromModel, sealToModel } from '../src/enclave/e2ee.js';
import { signInputWithNearKey, inputMessage, nearKeyPair } from '../src/roost-service/signed-input.js';
import { signInvoice } from '../src/roost-service/invoice.js';
import { verifyAuditorPack, auditOpenMessage } from '../src/roost-service/auditor.js';

const provider = { simulated: true, attest: async () => Buffer.from('t'), info: async () => ({}) };
const KEY = 'k'.repeat(30);
const ROUND = { contractId: 'c.near', syndicateId: 'pay', epoch: 1, roundNonce: 'ab'.repeat(32) };
const employerKeys = nearKeyPair();
const SOL = '2J75L6udJ52N7YmrDPQLN7gzV6CqWny6CaWGccvohi4f';

async function serve() {
  const roost = new HostedRoost({ provider, requireSignedInputs: true, accountKeyCheck: async (id, pk) => id === 'er.near' && pk === employerKeys.publicKey });
  roost.openRound(ROUND);
  const server = createRoostServer({ roost, adminKey: KEY });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  return { roost, baseUrl, member: new HostedRoostClient({ baseUrl }), coord: new HostedRoostClient({ baseUrl, adminKey: KEY }), close: () => new Promise((r) => server.close(r)) };
}

test('over HTTP: a payee submits a sealed invoice, the coordinator runs the pay run with invoices required, and the employer opens a line for an auditor', async () => {
  const s = await serve();
  try {
    const payee = generateClientKey(); const sign = crypto.generateKeyPairSync('ed25519'); const auditor = generateClientKey(); const reader = generateClientKey();
    const line = { payee: 'a1.near', person: 'Alice', invoiceId: 'INV-1', period: '2026-11', gross: '0.05', tax: '0.005', benefits: '0.002', payeeKey: payee.publicKeyHex };
    const inv = signInvoice({ invoiceId: 'INV-1', period: '2026-11', chain: 'near', address: 'a1.near', asset: 'NEAR', amount: '0.05' }, sign.privateKey);
    const session = await s.member.getSession();
    const acc = await s.member.submitInvoice({ cipherTextHex: sealToModel(JSON.stringify(inv), session.intentPublicKey) });
    assert.equal(acc.accepted, true);
    const cipherTextHex = sealToModel(JSON.stringify({ lines: [line] }), session.intentPublicKey);
    await s.member.submitSignedIntent({ flyerId: 'er.near', cipherTextHex, publicKey: employerKeys.publicKey, signature: signInputWithNearKey(employerKeys.secretKey, inputMessage({ ...ROUND, flyerId: 'er.near', seq: 1, cipherTextHex })), seq: 1 });
    const out = await s.coord.runPayrun({ employer: 'er.near', taxAddress: 'tax.near', benefitsAddress: 'ben.near', employerKeyHex: reader.publicKeyHex, auditorKeyHex: auditor.publicKeyHex, runId: 'run-1', requireInvoices: true });
    assert.equal(out.outcome.invoicesMatched, 1);
    const indices = [0];
    const res = await s.member.openAuditLines({ runId: 'run-1', indices, auditorKeyHex: auditor.publicKeyHex, employer: 'er.near', publicKey: employerKeys.publicKey, signature: signInputWithNearKey(employerKeys.secretKey, auditOpenMessage({ runId: 'run-1', indices, auditorKeyHex: auditor.publicKeyHex })) });
    const pack = JSON.parse(openFromModel(res.packCipherHex, auditor.secretX25519));
    assert.equal(verifyAuditorPack(pack, out.orderHash).ok, true);
  } finally { await s.close(); }
});

test('over HTTP: opening audit lines needs no coordinator key but does need the employer\'s signature', async () => {
  const s = await serve();
  try {
    const r = await fetch(`${s.baseUrl}/audit/open`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ runId: 'x', indices: [0], auditorKeyHex: 'a'.repeat(64), employer: 'er.near', publicKey: employerKeys.publicKey, signature: '00'.repeat(64) }) });
    assert.notEqual(r.status, 401, 'not gated by the coordinator key'); assert.equal(r.status >= 400, true);
  } finally { await s.close(); }
});

test('over HTTP: the stateless checks answer without any key, so they can run on the hardware room', async () => {
  const s = await serve();
  try {
    const policy = { payees: [{ chain: 'solana-devnet', address: SOL, max_amount: '2000000', max_total: '5000000' }], max_fee_cost: '1' };
    const pf = await s.member.preflight({ payment: { obligationId: 'o1', chain: 'solana-devnet', payee: SOL, amount: '9000000' }, policy });
    assert.equal(pf.ok, false); assert.ok(pf.findings.some((f) => f.code === 'over-payment-cap'));
    const sign = crypto.generateKeyPairSync('ed25519');
    const body = { invoiceId: 'i', period: 'p', chain: 'solana-devnet', address: SOL, asset: 'SOL', amount: '1' };
    const inv = signInvoice(body, sign.privateKey);
    assert.equal((await s.member.checkInvoice(inv, body)).ok, true);
    assert.equal((await s.member.checkInvoice(inv, { ...body, amount: '2' })).ok, false);
  } finally { await s.close(); }
});
