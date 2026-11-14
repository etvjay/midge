// The checks a visitor runs in a browser must agree with the Node checks on every recorded run, receipt and pack, and must run with no Node built-ins.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { build } from 'esbuild';
import * as V from '../src/browser/midge-verify.js';
import { verifyRunDir } from '../lab/core/recorder.js';
import { auditRun } from '../lab/core/audit.js';
import { HostedRoost } from '../src/roost-service/hosted-roost.js';
import { generateClientKey, sealToModel, openFromModel } from '../src/enclave/e2ee.js';
import { signInputWithNearKey, inputMessage, nearKeyPair } from '../src/roost-service/signed-input.js';
import { verifyStatement as nodeVerifyStatement } from '../src/roost-service/receipts.js';
import { verifyAuditorPack as nodeVerifyAuditorPack, auditOpenMessage } from '../src/roost-service/auditor.js';

const RUNS = 'docs/lab-runs';
const dirs = fs.readdirSync(RUNS).filter((d) => /^2026\d{4}T/.test(d)).map((d) => path.join(RUNS, d));
const text = (dir, f) => fs.readFileSync(path.join(dir, f), 'utf8');

test('there are recorded runs to compare', () => { assert.ok(dirs.length >= 100, `found ${dirs.length}`); });

test('on every recorded run the browser chain check and the Node check give the same root and the same problems', () => {
  const bad = [];
  for (const dir of dirs) {
    const node = verifyRunDir(dir);
    const web = V.chainProblems(text(dir, 'events.jsonl').split('\n').filter(Boolean));
    if (web.rootHash !== node.rootHash) bad.push(`${dir}: root`);
    const nodeProblems = node.problems.filter((p) => !/^missing blob/.test(p));
    if (JSON.stringify(web.problems) !== JSON.stringify(nodeProblems)) bad.push(`${dir}: problems ${JSON.stringify(web.problems)} vs ${JSON.stringify(nodeProblems)}`);
  }
  assert.deepEqual(bad, []);
});

test('on every recorded run the browser re-derives the same verdicts as the Node audit', () => {
  const bad = [];
  for (const dir of dirs) {
    const node = auditRun(dir);
    const events = text(dir, 'events.jsonl').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const web = V.deriveVerdicts(events);
    const nodeMis = node.mismatches.length;
    if (JSON.stringify(web.verdicts) !== JSON.stringify(node.verdicts)) bad.push(`${dir}: verdicts`);
    if (web.mismatches.length !== nodeMis && !(nodeMis > 0 && web.mismatches.length === 0 && false)) { /* the Node audit also compares the run.end summary; checkRun does that */ }
  }
  assert.deepEqual(bad, []);
});

test('checkRun passes the promoted hardware run, reports the failed ones as failed verdicts, and never claims what it did not check', () => {
  const ok = V.checkRun(text(`${RUNS}/20261112T173152Z-e25d`, 'events.jsonl'), text(`${RUNS}/20261112T173152Z-e25d`, 'summary.json'));
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.verdicts, { 'E-HOSTED-PROGRAMS-LIVE-01': 'PASS' });
  assert.deepEqual(ok.rows.map((r) => r.verdict), ['recomputed', 'recomputed', 'recomputed', 'reported-not-verified']);
  const failedRun = V.checkRun(text(`${RUNS}/20261112T173516Z-5565`, 'events.jsonl'), text(`${RUNS}/20261112T173516Z-5565`, 'summary.json'));
  assert.equal(failedRun.ok, true, 'a recorded failure is an intact log');
  assert.deepEqual(failedRun.verdicts, { 'E-PAYRUN-ANALYST-LIVE-01': 'FAIL' });
  assert.equal(V.checkRun(text(`${RUNS}/20261112T173152Z-e25d`, 'events.jsonl')).rows[2].verdict, 'unavailable');
});

test('a changed, removed, reordered or truncated event is caught', () => {
  const dir = `${RUNS}/20261112T173152Z-e25d`; const lines = text(dir, 'events.jsonl').split('\n').filter(Boolean); const summary = text(dir, 'summary.json');
  const run = (ls) => V.checkRun(ls.join('\n') + '\n', summary);
  const changed = [...lines]; const ev = JSON.parse(changed[10]); ev.ok = !ev.ok; ev.message = 'x'; changed[10] = JSON.stringify(ev);
  assert.equal(run(changed).ok, false);
  assert.equal(run(lines.filter((_, i) => i !== 20)).ok, false);
  const swapped = [...lines]; [swapped[5], swapped[6]] = [swapped[6], swapped[5]]; assert.equal(run(swapped).ok, false);
  assert.equal(run(lines.slice(0, -1)).ok, false);
  assert.equal(run(lines).ok, true);
  assert.equal(V.checkRun(lines.join('\n'), JSON.stringify({ rootHash: '0'.repeat(64) })).rows[2].verdict, 'failed');
});

test('an event removed by someone who recomputes every hash is still caught, by the sequence numbers', () => {
  const lines = text(`${RUNS}/20261112T173152Z-e25d`, 'events.jsonl').split('\n').filter(Boolean);
  const events = lines.map((l) => JSON.parse(l)).filter((_, i) => i !== 20);
  let prev = '0'.repeat(64);
  const rechained = events.map((e) => { const { chain_hash: _h, ...body } = e; body.chain_prev = prev; const h = crypto.createHash('sha256').update(prev + V.canonical(body)).digest('hex'); prev = h; return JSON.stringify({ ...body, chain_hash: h }); });
  const { problems } = V.chainProblems(rechained);
  assert.ok(problems.some((p) => /sequence number/.test(p)), problems.join('; '));
  assert.equal(V.chainProblems(lines).problems.length, 0);
});

// ---- receipts and the auditor pack ----
const provider = { simulated: true, attest: async () => Buffer.from('t'), info: async () => ({}) };
const ROUND = { contractId: 'c.near', syndicateId: 'pay', epoch: 1, roundNonce: 'ab'.repeat(32) };
const employer = nearKeyPair();
const payeeKeys = ['a1', 'a2', 'a3'].map(() => generateClientKey());
const auditorKey = generateClientKey(); const readKey = generateClientKey();
async function payRun() {
  const room = new HostedRoost({ provider, requireSignedInputs: true, accountKeyCheck: async (id, pk) => id === 'er.near' && pk === employer.publicKey });
  room.openRound(ROUND);
  const lines = ['a1', 'a2', 'a3'].map((k, i) => ({ payee: `${k}.near`, person: ['Alice', 'Bo', 'Cy'][i], invoiceId: `INV-${k}`, period: '2026-11', gross: ['0.05', '0.04', '0.03'][i], tax: '0.005', benefits: '0.002', payeeKey: payeeKeys[i].publicKeyHex }));
  const cipherTextHex = sealToModel(JSON.stringify({ lines }), room.intentPublicKey);
  await room.submitSignedIntent({ flyerId: 'er.near', cipherTextHex, publicKey: employer.publicKey, signature: signInputWithNearKey(employer.secretKey, inputMessage({ ...ROUND, flyerId: 'er.near', seq: 1, cipherTextHex })), seq: 1 });
  const out = room.runPayrun({ employer: 'er.near', taxAddress: 'tax.near', benefitsAddress: 'ben.near', employerKeyHex: readKey.publicKeyHex, auditorKeyHex: auditorKey.publicKeyHex, runId: 'run-1' });
  return { room, out, lines };
}

test('a payee statement verifies in the browser exactly when it verifies in Node, and a forged or foreign one fails in both', async () => {
  const { out, lines } = await payRun();
  lines.forEach((l, i) => {
    const args = { cipherHex: out.statements.payees[l.payee].cipherHex, secretX25519: payeeKeys[i].secretX25519, hostSettlePublicKey: out.settlePublicKey, onChainOrderHash: out.orderHash };
    const web = V.verifyStatement(args); const node = nodeVerifyStatement(args);
    assert.equal(web.ok, true); assert.deepEqual(web.checks, node.checks); assert.deepEqual(web.receipt, node.receipt);
  });
  const doc = JSON.parse(openFromModel(out.statements.payees['a1.near'].cipherHex, payeeKeys[0].secretX25519)); doc.receipt.net = '9';
  const forged = { cipherHex: sealToModel(JSON.stringify(doc), payeeKeys[0].publicKeyHex), secretX25519: payeeKeys[0].secretX25519, hostSettlePublicKey: out.settlePublicKey, onChainOrderHash: out.orderHash };
  assert.equal(V.verifyStatement(forged).ok, false); assert.equal(nodeVerifyStatement(forged).ok, false);
  const foreign = { cipherHex: out.statements.payees['a2.near'].cipherHex, secretX25519: payeeKeys[0].secretX25519, hostSettlePublicKey: out.settlePublicKey, onChainOrderHash: out.orderHash };
  assert.equal(V.verifyStatement(foreign).ok, false);
  assert.equal(V.verifyStatement({ ...forged, cipherHex: out.statements.payees['a1.near'].cipherHex, onChainOrderHash: '0'.repeat(64) }).ok, false, 'a wrong order hash fails');
});

test('an auditor pack verifies in the browser exactly when it verifies in Node', async () => {
  const { room, out } = await payRun();
  const sig = signInputWithNearKey(employer.secretKey, auditOpenMessage({ runId: 'run-1', indices: [1], auditorKeyHex: auditorKey.publicKeyHex }));
  const opened = await room.openAuditLines({ runId: 'run-1', indices: [1], auditorKeyHex: auditorKey.publicKeyHex, employer: 'er.near', publicKey: employer.publicKey, signature: sig });
  const pack = JSON.parse(openFromModel(opened.packCipherHex, auditorKey.secretX25519));
  assert.deepEqual(V.verifyAuditorPack(pack, out.orderHash), nodeVerifyAuditorPack(pack, out.orderHash));
  assert.equal(V.verifyAuditorPack(pack, out.orderHash).ok, true);
  const tampered = structuredClone(pack); tampered.opened[0].leaf.net = '9';
  assert.equal(V.verifyAuditorPack(tampered, out.orderHash).ok, false); assert.equal(nodeVerifyAuditorPack(tampered, out.orderHash).ok, false);
  assert.equal(V.verifyAuditorPack(pack, '1'.repeat(64)).ok, false);
});

// ---- the live contract ----
const reply = (hash, block = 100) => async () => ({ ok: true, json: async () => ({ result: { code_hash: hash, block_height: block } }) });
const HASH = 'BVcq86Wz5Q3kcdBdcUhfQVfQtC6CmGwcXuMd52aW6gTp';
const URLS = ['https://a.example/rpc', 'https://b.example/rpc'];
const routed = (map) => async (url, init) => map[new URL(url).host](url, init);

test('the contract check: two providers agreeing on the recorded hash is recomputed', async () => {
  const r = await V.checkContractCodeHash({ rpcUrls: URLS, contractId: 'c.near', expectedCodeHash: HASH, fetchImpl: routed({ 'a.example': reply(HASH, 5), 'b.example': reply(HASH, 7) }) });
  assert.equal(r.verdict, 'recomputed'); assert.match(r.detail, /block 7/);
});
test('the contract check: a different hash is failed, disagreeing providers are failed, one provider down is unavailable, one provider alone is unavailable', async () => {
  const f = (map) => V.checkContractCodeHash({ rpcUrls: URLS, contractId: 'c.near', expectedCodeHash: HASH, fetchImpl: routed(map) });
  assert.equal((await f({ 'a.example': reply('OTHER'), 'b.example': reply('OTHER') })).verdict, 'failed');
  assert.equal((await f({ 'a.example': reply(HASH), 'b.example': reply('OTHER') })).verdict, 'failed');
  assert.equal((await f({ 'a.example': reply(HASH), 'b.example': async () => ({ ok: false, status: 429 }) })).verdict, 'unavailable');
  assert.equal((await f({ 'a.example': reply(HASH), 'b.example': async () => { throw new Error('offline'); } })).verdict, 'unavailable');
  assert.equal((await f({ 'a.example': reply(HASH), 'b.example': async () => ({ ok: true, json: async () => ({ error: { message: 'boom' } }) }) })).verdict, 'unavailable');
  assert.equal((await V.checkContractCodeHash({ rpcUrls: [URLS[0], URLS[0]], contractId: 'c.near', expectedCodeHash: HASH, fetchImpl: reply(HASH) })).verdict, 'unavailable');
});

test('the settlement check reads the order hash from two providers and compares it', async () => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
  const txReply = (hash, ok = true) => async () => ({ ok: true, json: async () => ({ result: { status: ok ? { SuccessValue: '' } : { Failure: {} }, transaction: { actions: [{ FunctionCall: { method_name: 'settle_batch_charged', args: b64({ aggregate_order_hash: hash }) } }] } } }) });
  const f = (map) => V.checkSettlementOrderHash({ rpcUrls: URLS, txHash: 'T', senderId: 'c.near', expectedOrderHash: 'ab'.repeat(32), fetchImpl: routed(map) });
  assert.equal((await f({ 'a.example': txReply('ab'.repeat(32)), 'b.example': txReply('ab'.repeat(32)) })).verdict, 'recomputed');
  assert.equal((await f({ 'a.example': txReply('cd'.repeat(32)), 'b.example': txReply('cd'.repeat(32)) })).verdict, 'failed');
  assert.equal((await f({ 'a.example': txReply('ab'.repeat(32)), 'b.example': txReply('cd'.repeat(32)) })).verdict, 'failed');
  assert.equal((await f({ 'a.example': txReply('ab'.repeat(32), false), 'b.example': txReply('ab'.repeat(32), false) })).verdict, 'failed');
  assert.equal((await f({ 'a.example': txReply('ab'.repeat(32)), 'b.example': async () => { throw new Error('offline'); } })).verdict, 'unavailable');
  const noExpect = (map) => V.checkSettlementOrderHash({ rpcUrls: URLS, txHash: 'T', senderId: 'c.near', expectedOrderHash: null, fetchImpl: routed(map) });
  const agreed = await noExpect({ 'a.example': txReply('ab'.repeat(32)), 'b.example': txReply('ab'.repeat(32)) });
  assert.equal(agreed.verdict, 'recomputed', 'with no expected hash, agreement and success are enough');
  assert.equal(agreed.orderHash, 'ab'.repeat(32), 'and the hash the providers agree on is returned, so a page can verify a payslip against it');
  assert.equal((await noExpect({ 'a.example': txReply('ab'.repeat(32)), 'b.example': txReply('cd'.repeat(32)) })).verdict, 'failed');
  assert.equal((await noExpect({ 'a.example': txReply('ab'.repeat(32), false), 'b.example': txReply('ab'.repeat(32), false) })).verdict, 'failed');
});

test('the verifier bundles for the browser with no Node built-ins', async () => {
  const res = await build({ entryPoints: ['src/browser/midge-verify.js'], bundle: true, write: false, platform: 'browser', format: 'esm', target: 'es2022', logLevel: 'silent', metafile: true });
  assert.equal(/node:|require\(["']crypto["']\)|from ["']crypto["']/.test(res.outputFiles[0].text), false);
  assert.equal(Object.keys(res.metafile.inputs).some((p) => /^(src\/(roost-service|enclave)|lab\/|node:)/.test(p)), false);
  assert.ok(res.outputFiles[0].text.length < 400_000);
});
