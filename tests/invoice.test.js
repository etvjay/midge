import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { signInvoice, verifyInvoice, invoiceHash, matchApproval, foreignReceipt } from '../src/roost-service/invoice.js';
import { auditorPack, verifyAuditorPack, totalsOnly } from '../src/roost-service/auditor.js';
import { payrunOrderHash, leafHash, merkleRoot } from '../src/roost-service/receipts.js';

const SOL = '2J75L6udJ52N7YmrDPQLN7gzV6CqWny6CaWGccvohi4f';
const EVM = '0xB9A425FB45734FC29a9c941c2c05b34DE59FF7A4';
const body = (o = {}) => ({ invoiceId: 'inv-2026-11-a', period: '2026-11', chain: 'solana-devnet', address: SOL, asset: 'SOL', amount: '1000000', memo: 'design work', ...o });
const key = () => crypto.generateKeyPairSync('ed25519');

test('a payee-signed invoice verifies, and any change to it breaks the signature', () => {
  const k = key(); const inv = signInvoice(body(), k.privateKey);
  assert.equal(verifyInvoice(inv).ok, true);
  assert.equal(verifyInvoice({ ...inv, body: body({ amount: '9000000' }) }).ok, false);
  assert.equal(verifyInvoice({ ...inv, body: body({ address: EVM, chain: 'ethereum-sepolia' }) }).ok, false);
});

test('the invoice hash is stable, ignores key order, and changes with every field', () => {
  const a = invoiceHash(body()); const b = invoiceHash(Object.fromEntries(Object.entries(body()).reverse()));
  assert.equal(a, b); assert.match(a, /^[0-9a-f]{64}$/);
  for (const f of [{ amount: '1' }, { address: EVM }, { chain: 'ethereum-sepolia' }, { period: '2026-12' }, { invoiceId: 'x' }, { asset: 'ETH' }]) assert.notEqual(invoiceHash(body(f)), a, JSON.stringify(f));
});

test('an invoice matches the employer approval only when payee, chain, asset, amount and period all agree', () => {
  const inv = signInvoice(body(), key().privateKey);
  assert.deepEqual(matchApproval(inv, { invoiceId: 'inv-2026-11-a', period: '2026-11', chain: 'solana-devnet', address: SOL, asset: 'SOL', amount: '1000000' }), { ok: true, reasons: [] });
  const bad = matchApproval(inv, { invoiceId: 'inv-2026-11-a', period: '2026-11', chain: 'solana-devnet', address: '3Bxs4ThwQbE4vyj9M5uZ2Pq9P9mXyB1vD8k6bX1w1h7S', asset: 'SOL', amount: '2000000' });
  assert.equal(bad.ok, false);
  assert.ok(bad.reasons.some((r) => /destination/.test(r)) && bad.reasons.some((r) => /amount/.test(r)));
});

test('an invoice with a bad signature never matches, even if the fields agree', () => {
  const inv = signInvoice(body(), key().privateKey); const forged = { ...inv, sig: '00'.repeat(64) };
  const r = matchApproval(forged, { invoiceId: 'inv-2026-11-a', period: '2026-11', chain: 'solana-devnet', address: SOL, asset: 'SOL', amount: '1000000' });
  assert.equal(r.ok, false); assert.ok(r.reasons.some((x) => /signature/.test(x)));
});

test('a foreign receipt names the chain and the transaction and carries the invoice hash', () => {
  const inv = signInvoice(body(), key().privateKey);
  const r = foreignReceipt({ runId: 'run-1', invoice: inv, nearTx: 'NEARTX', chainTx: 'SOLTX', obligationId: 'sol-1' });
  assert.equal(r.kind, 'foreign-pay'); assert.equal(r.chain, 'solana-devnet'); assert.equal(r.chainTx, 'SOLTX'); assert.equal(r.invoiceHash, invoiceHash(body()));
});

const receipts = () => [
  { v: 1, kind: 'pay', runId: 'r', invoiceId: 'a', payee: 'p1', person: 'Ada', gross: '10', tax: '1', benefits: '1', net: '8' },
  { v: 1, kind: 'pay', runId: 'r', invoiceId: 'b', payee: 'p2', person: 'Bo', gross: '20', tax: '2', benefits: '2', net: '16' },
  { v: 1, kind: 'pay', runId: 'r', invoiceId: 'c', payee: 'p3', person: 'Cy', gross: '30', tax: '3', benefits: '3', net: '24' },
];

test('an auditor pack opens only the chosen lines and each verifies against the on-chain order hash', () => {
  const rs = receipts(); const pack = auditorPack({ runId: 'r', receipts: rs, open: [1] });
  assert.equal(pack.opened.length, 1); assert.equal(pack.opened[0].leaf.person, 'Bo');
  assert.equal(JSON.stringify(pack).includes('Ada'), false); assert.equal(JSON.stringify(pack).includes('Cy'), false);
  const onChain = payrunOrderHash('r', pack.root);
  assert.equal(verifyAuditorPack(pack, onChain).ok, true);
});

test('a tampered opened line or a wrong order hash fails the auditor check', () => {
  const pack = auditorPack({ runId: 'r', receipts: receipts(), open: [0, 2] });
  const onChain = payrunOrderHash('r', pack.root);
  const tampered = JSON.parse(JSON.stringify(pack)); tampered.opened[0].leaf.net = '800';
  assert.equal(verifyAuditorPack(tampered, onChain).ok, false);
  assert.equal(verifyAuditorPack(pack, 'f'.repeat(64)).ok, false);
});

test('the totals-only view shows sums and counts but no person or payee', () => {
  const t = totalsOnly(receipts());
  assert.deepEqual({ lines: t.lines, gross: t.gross, tax: t.tax, benefits: t.benefits, net: t.net }, { lines: 3, gross: '60', tax: '6', benefits: '6', net: '48' });
  const text = JSON.stringify(t); for (const w of ['Ada', 'Bo', 'Cy', 'p1', 'p2']) assert.equal(text.includes(w), false);
});

test('the pack root equals the merkle root of the receipt leaves', () => {
  const rs = receipts(); assert.equal(auditorPack({ runId: 'r', receipts: rs, open: [] }).root, merkleRoot(rs.map(leafHash)));
});
