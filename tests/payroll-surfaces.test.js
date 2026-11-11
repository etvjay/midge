import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { FlyApiDaemon } from '../src/api/server.js';
import { FlyClient } from '../src/sdk/client.js';
import { FlyMcpServer, FLY_MCP_TOOLS } from '../src/mcp/server.js';
import { signInvoice } from '../src/roost-service/invoice.js';
import { auditorPack } from '../src/roost-service/auditor.js';
import { payrunOrderHash } from '../src/roost-service/receipts.js';

const SOL = '2J75L6udJ52N7YmrDPQLN7gzV6CqWny6CaWGccvohi4f';
const policy = { payees: [{ chain: 'solana-devnet', address: SOL, max_amount: '2000000', max_total: '5000000' }], max_fee_cost: '1' };
const payment = { obligationId: 'o-1', chain: 'solana-devnet', payee: SOL, amount: '1000000' };
const body = { invoiceId: 'inv-1', period: '2026-11', chain: 'solana-devnet', address: SOL, asset: 'SOL', amount: '1000000' };
const receipts = [{ v: 1, kind: 'pay', runId: 'r', invoiceId: 'a', payee: 'p1', person: 'Ada', gross: '10', tax: '1', benefits: '1', net: '8' }, { v: 1, kind: 'pay', runId: 'r', invoiceId: 'b', payee: 'p2', person: 'Bo', gross: '20', tax: '2', benefits: '2', net: '16' }];

async function withDaemon(fn) {
  const daemon = new FlyApiDaemon({ port: 0, mode: 'model', roostBackend: 'local', simulateHaq: true });
  const { port } = await daemon.start();
  try { await fn(`http://127.0.0.1:${port}`); } finally { await daemon.stop?.(); }
}

test('HTTP: pre-flight blocks an out-of-rules payment and passes an in-rules one', async () => {
  await withDaemon(async (base) => {
    const post = async (p, b) => { const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, json: await r.json() }; };
    const ok = await post('/v1/payroll/preflight', { payment, policy });
    assert.equal(ok.status, 200); assert.equal(ok.json.ok, true);
    const bad = await post('/v1/payroll/preflight', { payment: { ...payment, amount: '9000000' }, policy });
    assert.equal(bad.json.ok, false); assert.ok(bad.json.findings.some((f) => f.code === 'over-payment-cap'));
    const none = await post('/v1/payroll/preflight', { payment });
    assert.equal(none.status, 400);
  });
});

test('SDK: checkInvoice and verifyAuditorPack agree with the modules', async () => {
  await withDaemon(async (base) => {
    const sdk = new FlyClient({ baseUrl: base });
    const inv = signInvoice(body, crypto.generateKeyPairSync('ed25519').privateKey);
    assert.equal((await sdk.checkInvoice(inv, body)).ok, true);
    assert.equal((await sdk.checkInvoice(inv, { ...body, address: '3Bxs4ThwQbE4vyj9M5uZ2Pq9P9mXyB1vD8k6bX1w1h7S' })).ok, false);
    const pack = auditorPack({ runId: 'r', receipts, open: [1] });
    assert.equal((await sdk.verifyAuditorPack(pack, payrunOrderHash('r', pack.root))).ok, true);
    assert.equal((await sdk.verifyAuditorPack(pack, 'f'.repeat(64))).ok, false);
    assert.equal((await sdk.payrollPreflight({ payment, policy })).ok, true);
  });
});

test('MCP: the three payroll tools are listed and give the same answers', async () => {
  const names = FLY_MCP_TOOLS.map((t) => t.name);
  for (const n of ['midge_payroll_preflight', 'midge_check_invoice', 'midge_verify_auditor_pack']) assert.ok(names.includes(n), n);
  const mcp = new FlyMcpServer({ mode: 'model' });
  const pre = await mcp.executeTool('midge_payroll_preflight', { payment, policy });
  assert.equal(pre.ok, true);
  const inv = signInvoice(body, crypto.generateKeyPairSync('ed25519').privateKey);
  assert.equal((await mcp.executeTool('midge_check_invoice', { invoice: inv, approval: body })).ok, true);
  const pack = auditorPack({ runId: 'r', receipts, open: [0] });
  assert.equal((await mcp.executeTool('midge_verify_auditor_pack', { pack, onChainOrderHash: payrunOrderHash('r', pack.root) })).ok, true);
});

test('nothing in these tools can move money or sign: they are pure checks', async () => {
  const text = [...['midge_payroll_preflight', 'midge_check_invoice', 'midge_verify_auditor_pack']].map((n) => FLY_MCP_TOOLS.find((t) => t.name === n)?.description || '').join(' ');
  assert.match(text, /does not move money|never moves money|moves no money/i);
});
