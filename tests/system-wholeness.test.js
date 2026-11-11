/**
 * System wholeness: checks that cut across the slices rather than inside one.
 *   1. Evidence: every promoted lab run is intact and re-derives its verdicts; every experiment has a passing promoted run (or is on a
 *      short, explained list); every claim names a real experiment, cites evidence that exists, and cites a promoted run that passed it.
 *   2. Surfaces: every capability exists on every surface it is meant to, and the ones that are room-only are listed with the reason.
 *   3. State: every key prefix the contract writes is described in the state documents.
 *   4. One payroll flow (invoice, pre-flight, pay run, statement, auditor pack) gives the same answers on the room over HTTP, the gateway
 *      SDK and the MCP tools, including for tampered inputs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { verifyRunDir } from '../lab/core/recorder.js';
import { auditRun } from '../lab/core/audit.js';
import { createRoostServer } from '../src/roost-service/server.js';
import { HostedRoost } from '../src/roost-service/hosted-roost.js';
import { HostedRoostClient } from '../src/roost-service/client.js';
import { FlyApiDaemon } from '../src/api/server.js';
import { FlyClient } from '../src/sdk/client.js';
import { FlyMcpServer, FLY_MCP_TOOLS } from '../src/mcp/server.js';
import { generateClientKey, openFromModel, sealToModel } from '../src/enclave/e2ee.js';
import { signInputWithNearKey, inputMessage, nearKeyPair } from '../src/roost-service/signed-input.js';
import { signInvoice, matchApproval } from '../src/roost-service/invoice.js';
import { verifyAuditorPack, auditOpenMessage } from '../src/roost-service/auditor.js';
import { verifyStatement } from '../src/roost-service/receipts.js';
import { preflight } from '../src/roost-service/preflight.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// Experiments that have no passing promoted run, and why. Anything else without one is a hole.
const NO_PASSING_RUN = {
  'E-HOSTED-DARKVAULT-LIVE-01': 'its one hardware run FAILED and is documented as such (GAP-046: the hosted entry point never required signed inputs); E-HOSTED-DARKVAULT-LIVE-02 is the run that passed',
};

async function loadExperiments() {
  const out = [];
  for (const f of fs.readdirSync(path.join(root, 'lab/experiments')).filter((x) => x.endsWith('.js'))) {
    const d = (await import(path.join(root, 'lab/experiments', f))).default;
    for (const e of Array.isArray(d) ? d : [d]) out.push({ id: e.id, tier: e.tier, file: f });
  }
  return out;
}
const promotedRuns = () => fs.readdirSync(path.join(root, 'docs/lab-runs')).filter((d) => /^\d{8}T/.test(d));
const verdictsOf = (run) => JSON.parse(read(`docs/lab-runs/${run}/summary.json`)).verdicts || {};

// ---------------------------------------------------------------------------------------------------- 1. evidence
test('every promoted lab run is intact: hash chain, summary root, and verdicts re-derived from the raw events', () => {
  const problems = [];
  for (const r of promotedRuns()) {
    const dir = path.join(root, 'docs/lab-runs', r);
    const v = verifyRunDir(dir); const a = auditRun(dir);
    let s = null; try { s = JSON.parse(read(`docs/lab-runs/${r}/summary.json`)); } catch { /* reported below */ }
    if (!v.ok) problems.push(`${r}: ${v.problems.join('; ')}`);
    if (!s || s.rootHash !== v.rootHash) problems.push(`${r}: summary root hash does not match the log`);
    if (a.mismatches.length) problems.push(`${r}: ${a.mismatches.join('; ')}`);
  }
  assert.deepEqual(problems, []);
});

test('every registered experiment has a passing promoted run, except the explained ones', async () => {
  const passed = new Set();
  for (const r of promotedRuns()) for (const [id, v] of Object.entries(verdictsOf(r))) if (v.verdict === 'PASS') passed.add(id);
  const exps = await loadExperiments();
  assert.ok(exps.length >= 50, `expected the full registry, found ${exps.length}`);
  const missing = exps.filter((e) => !passed.has(e.id) && !(e.id in NO_PASSING_RUN)).map((e) => `${e.id} [${e.tier}]`);
  assert.deepEqual(missing, [], 'run these, then promote them (node lab/run.js --only <id>; node lab/promote.js <dir>)');
  for (const id of Object.keys(NO_PASSING_RUN)) assert.ok(exps.some((e) => e.id === id), `${id} is on the explained list but is not a registered experiment`);
  for (const id of Object.keys(NO_PASSING_RUN)) assert.equal(passed.has(id), false, `${id} now has a passing run: remove it from the explained list`);
});

test('every claim names real experiments, cites evidence that exists, and cites a promoted run that passed what it names', async () => {
  const ids = new Set((await loadExperiments()).map((e) => e.id));
  const claims = read('foundry/claims.jsonl').trim().split('\n').map((l) => JSON.parse(l));
  const problems = [];
  for (const c of claims) {
    const named = (/--only (\S+)/.exec(c.command || '') || [])[1]?.split(',') || [];
    for (const id of named) if (!ids.has(id)) problems.push(`${c.id}: the command names ${id}, which is not a registered experiment`);
    const cited = [];
    for (const e of c.evidence || []) {
      if (e.includes('/target/')) continue; // a build product, checked by make check
      if (!fs.existsSync(path.join(root, e))) problems.push(`${c.id}: evidence ${e} does not exist`);
      if (e.startsWith('docs/lab-runs/')) cited.push(path.basename(e));
    }
    for (const run of cited) for (const [id, v] of Object.entries(fs.existsSync(path.join(root, 'docs/lab-runs', run)) ? verdictsOf(run) : {})) {
      if (named.includes(id) && v.verdict !== 'PASS') problems.push(`${c.id}: cites run ${run} in which ${id} is ${v.verdict}`);
    }
    for (const id of named) {
      if (id in NO_PASSING_RUN) { problems.push(`${c.id}: rests on ${id}, which has no passing run`); continue; }
      if (!cited.some((run) => fs.existsSync(path.join(root, 'docs/lab-runs', run)) && verdictsOf(run)[id]?.verdict === 'PASS')) problems.push(`${c.id}: no cited promoted run passed ${id}`);
    }
  }
  assert.deepEqual(problems, []);
});

// ---------------------------------------------------------------------------------------------------- 2. surfaces
// capability -> where it lives. A null means "deliberately not there", and the reason is in ROOM_ONLY.
const SURFACES = {
  preflight: { room: '/preflight', client: 'preflight', gateway: '/v1/payroll/preflight', sdk: 'payrollPreflight', mcp: 'midge_payroll_preflight' },
  invoiceCheck: { room: '/invoice-check', client: 'checkInvoice', gateway: '/v1/payroll/invoice/check', sdk: 'checkInvoice', mcp: 'midge_check_invoice' },
  auditorVerify: { room: '/auditor-verify', client: 'verifyAuditorPack', gateway: '/v1/payroll/auditor/verify', sdk: 'verifyAuditorPack', mcp: 'midge_verify_auditor_pack' },
  sealedIntent: { room: '/intents', client: 'submitSealedIntent', gateway: '/v1/roost/intents/sealed', sdk: 'submitSealedIntent', mcp: 'midge_submit_sealed_intent' },
  attestation: { room: '/attestation', client: 'getAttestationBundle', gateway: '/v1/roost/attestation', sdk: 'getAttestationQuote', mcp: 'midge_verify_haq_attestation' },
};
// Needs the coordinator key or the employer's signature on the room itself; a public gateway must not hold that key, so these are the room's own.
const ROOM_ONLY = {
  '/invoices': 'a payee seals their invoice straight to the room',
  '/signed-intents': 'a member seals and signs for their own account straight to the room',
  '/audit/open': 'authorised by the employer\'s signature checked against the chain, answered only by the room',
  '/payrun': 'coordinator key', '/rfq': 'coordinator key', '/quote': 'coordinator key', '/pool': 'coordinator key', '/ballot': 'coordinator key', '/auction': 'coordinator key',
  '/cross': 'coordinator key', '/settle': 'coordinator key', '/aggregate': 'coordinator key (the gateway has its own /v1/roost/aggregate)', '/round': 'coordinator key',
  '/abandon': 'coordinator key', '/digests': 'coordinator key', '/exclude': 'coordinator key',
  '/session': 'read by the client library directly', '/healthz': 'liveness only',
};

test('every capability exists on the room, its client, the gateway, the SDK and MCP, and each room-only route says why', () => {
  const server = read('src/roost-service/server.js'); const gw = read('src/api/server.js');
  const clientSrc = read('src/roost-service/client.js'); const sdkSrc = read('src/sdk/client.js');
  const mcpNames = FLY_MCP_TOOLS.map((t) => t.name);
  const problems = [];
  for (const [cap, s] of Object.entries(SURFACES)) {
    if (!server.includes(`'${s.room}'`)) problems.push(`${cap}: the room has no ${s.room}`);
    if (!new RegExp(`\\b${s.client}\\(`).test(clientSrc)) problems.push(`${cap}: HostedRoostClient has no ${s.client}`);
    if (!gw.includes(`'${s.gateway}'`)) problems.push(`${cap}: the gateway has no ${s.gateway}`);
    if (!new RegExp(`\\b${s.sdk}\\(`).test(sdkSrc)) problems.push(`${cap}: FlyClient has no ${s.sdk}`);
    if (!mcpNames.includes(s.mcp)) problems.push(`${cap}: MCP has no ${s.mcp}`);
  }
  assert.deepEqual(problems, []);
  // every route the room serves is either in a capability above or declared room-only with a reason: a new route cannot be added silently
  const served = new Set([...server.matchAll(/url\.pathname === '(\/[a-z0-9/_-]*)'/g)].map((m) => m[1]));
  const known = new Set([...Object.values(SURFACES).map((s) => s.room), ...Object.keys(ROOM_ONLY)]);
  assert.ok(served.size >= 20, `found only ${served.size} room routes: the pattern may have stopped matching`);
  assert.deepEqual([...served].filter((r) => !known.has(r)), [], 'a room route with no surface decision: add it to SURFACES or ROOM_ONLY with a reason');
  assert.deepEqual(Object.keys(ROOM_ONLY).filter((r) => !served.has(r)), [], 'a room-only route that the room no longer serves');
});

// ---------------------------------------------------------------------------------------------------- 3. state
test('every key prefix the contract writes is described in the state documents', () => {
  const src = read('contracts/fly-coordinator/src/lib.rs') + read('contracts/fly-coordinator/src/foreign.rs');
  const prefixes = new Set([...src.matchAll(/(?:b"|")([a-z]{1,6}):(?:\{\}|")/g)].map((m) => m[1] + ':'));
  assert.ok(prefixes.size >= 5, `found only ${prefixes.size} prefixes: ${[...prefixes]}`);
  const docs = read('docs/STATE_MACHINE.md') + read('docs/IMPLICIT_STATE_MACHINES.md');
  const undocumented = [...prefixes].filter((p) => !docs.includes(`\`${p}`));
  assert.deepEqual(undocumented, []);
});

// ---------------------------------------------------------------------------------------------------- 4. one flow, every surface
const provider = { simulated: true, attest: async () => Buffer.from('t'), info: async () => ({}) };
const ROUND = { contractId: 'c.near', syndicateId: 'pay', epoch: 1, roundNonce: 'ab'.repeat(32) };
const SOL = '2J75L6udJ52N7YmrDPQLN7gzV6CqWny6CaWGccvohi4f';
const ADMIN = 'k'.repeat(30);

test('payroll end to end: invoice, pre-flight, pay run, statement and auditor pack give the same answers on the room, the SDK and MCP', async () => {
  const employerKeys = nearKeyPair();
  const roost = new HostedRoost({ provider, requireSignedInputs: true, accountKeyCheck: async (id, pk) => id === 'er.near' && pk === employerKeys.publicKey });
  roost.openRound(ROUND);
  const server = createRoostServer({ roost, adminKey: ADMIN });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const member = new HostedRoostClient({ baseUrl: base }); const coord = new HostedRoostClient({ baseUrl: base, adminKey: ADMIN });
  const daemon = new FlyApiDaemon({ port: 0, mode: 'model', roostBackend: 'local', simulateHaq: true });
  const { port } = await daemon.start();
  const sdk = new FlyClient({ baseUrl: `http://127.0.0.1:${port}` });
  const mcp = new FlyMcpServer({ mode: 'model' });
  try {
    // --- the payee's invoice, checked four ways (the module, the room, the SDK, MCP)
    const sign = crypto.generateKeyPairSync('ed25519'); const payee = generateClientKey(); const auditor = generateClientKey(); const reader = generateClientKey();
    const body = { invoiceId: 'INV-1', period: '2026-11', chain: 'near', address: 'a1.near', asset: 'NEAR', amount: '0.05' };
    const inv = signInvoice(body, sign.privateKey);
    const tampered = { ...body, amount: '0.5' };
    const four = async (approval) => [matchApproval(inv, approval).ok, (await member.checkInvoice(inv, approval)).ok, (await sdk.checkInvoice(inv, approval)).ok, (await mcp.executeTool('midge_check_invoice', { invoice: inv, approval })).ok];
    assert.deepEqual(await four(body), [true, true, true, true], 'an invoice that matches is accepted on every surface');
    assert.deepEqual(await four(tampered), [false, false, false, false], 'an invoice whose amount was changed is refused on every surface');

    // --- the pre-flight, four ways, for an in-rules payment and for one over the cap
    const policy = { payees: [{ chain: 'solana-devnet', address: SOL, max_amount: '2000000', max_total: '5000000' }], max_fee_cost: '1' };
    for (const [label, amount, expectOk] of [['in rules', '1000000', true], ['over the per-payment cap', '9000000', false]]) {
      const payment = { obligationId: `o-${amount}`, chain: 'solana-devnet', payee: SOL, amount };
      const results = [preflight(payment, { policy }), await member.preflight({ payment, policy }), await sdk.payrollPreflight({ payment, policy }), await mcp.executeTool('midge_payroll_preflight', { payment, policy })];
      assert.deepEqual(results.map((r) => r.ok), Array(4).fill(expectOk), `${label}: every surface agrees on the decision`);
      const codes = results.map((r) => r.findings.map((f) => f.code).sort().join(','));
      assert.equal(new Set(codes).size, 1, `${label}: every surface reports the same findings (${codes.join(' | ')})`);
    }

    // --- the pay run over HTTP: the invoice is sealed to the room, the employer's run is signed, the coordinator runs it with invoices required
    const session = await member.getSession();
    assert.equal((await member.submitInvoice({ cipherTextHex: sealToModel(JSON.stringify(inv), session.intentPublicKey) })).accepted, true);
    const line = { payee: 'a1.near', person: 'Alice', invoiceId: 'INV-1', period: '2026-11', gross: '0.05', tax: '0.005', benefits: '0.002', payeeKey: payee.publicKeyHex };
    const sealRun = async (lines, seq) => {
      const cipherTextHex = sealToModel(JSON.stringify({ lines }), session.intentPublicKey);
      await member.submitSignedIntent({ flyerId: 'er.near', cipherTextHex, publicKey: employerKeys.publicKey, signature: signInputWithNearKey(employerKeys.secretKey, inputMessage({ ...ROUND, flyerId: 'er.near', seq, cipherTextHex })), seq });
    };
    const runParams = { employer: 'er.near', taxAddress: 'tax.near', benefitsAddress: 'ben.near', employerKeyHex: reader.publicKeyHex, auditorKeyHex: auditor.publicKeyHex, runId: 'run-1', requireInvoices: true };
    await sealRun([{ ...line, gross: '0.06' }], 1);
    await assert.rejects(() => coord.runPayrun(runParams), /does not match/, 'a line that differs from its invoice stops the run');
    assert.equal(roost.sealedIntents.length, 1, 'and the employer\'s queued run is kept');
    await sealRun([line], 2);
    const run = await coord.runPayrun(runParams);
    assert.equal(run.outcome.invoicesMatched, 1);
    assert.equal(verifyStatement({ cipherHex: run.statements.payees['a1.near'].cipherHex, secretX25519: payee.secretX25519, hostSettlePublicKey: run.settlePublicKey, onChainOrderHash: run.orderHash }).ok, true, 'the payee\'s statement is bound to the order hash');
    assert.equal(verifyStatement({ cipherHex: run.statements.payees['a1.near'].cipherHex, secretX25519: payee.secretX25519, hostSettlePublicKey: run.settlePublicKey, onChainOrderHash: 'f'.repeat(64) }).ok, false, 'and not to any other');

    // --- the auditor pack, opened only on the employer's signed request, verified four ways
    const indices = [0];
    const opened = await member.openAuditLines({ runId: 'run-1', indices, auditorKeyHex: auditor.publicKeyHex, employer: 'er.near', publicKey: employerKeys.publicKey, signature: signInputWithNearKey(employerKeys.secretKey, auditOpenMessage({ runId: 'run-1', indices, auditorKeyHex: auditor.publicKeyHex })) });
    const pack = JSON.parse(openFromModel(opened.packCipherHex, auditor.secretX25519));
    const verifyAll = async (p, hash) => [verifyAuditorPack(p, hash).ok, (await member.verifyAuditorPack(p, hash)).ok, (await sdk.verifyAuditorPack(p, hash)).ok, (await mcp.executeTool('midge_verify_auditor_pack', { pack: p, onChainOrderHash: hash })).ok];
    assert.deepEqual(await verifyAll(pack, run.orderHash), [true, true, true, true], 'the pack verifies against the on-chain order hash on every surface');
    assert.deepEqual(await verifyAll(pack, 'f'.repeat(64)), [false, false, false, false], 'and against no other hash');
    const forged = JSON.parse(JSON.stringify(pack)); forged.opened[0].leaf.net = '999';
    assert.deepEqual(await verifyAll(forged, run.orderHash), [false, false, false, false], 'a changed line is caught on every surface');
    await assert.rejects(() => member.openAuditLines({ runId: 'run-1', indices, auditorKeyHex: auditor.publicKeyHex, employer: 'er.near', publicKey: employerKeys.publicKey, signature: '00'.repeat(64) }), /signature/, 'nobody but the employer can open lines');
  } finally { await daemon.stop?.(); await new Promise((r) => server.close(r)); }
});
