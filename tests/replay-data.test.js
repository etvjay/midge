// The replay page's data is a built copy. This fails if it drifts from the recorded runs or the recorded contract hash, or if the pay run's
// own evidence stops verifying, so the page cannot quietly show something the repository no longer says. Rebuild with: npm run build:replay
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { checkRun, verifyStatement, verifyAuditorPack, verifyDecision, verifyModelReceipt, payrunOrderHash } from '../src/browser/midge-verify.js';
import { openFromModel } from '../src/browser/midge-client.js';
import { hexToBytes } from '@noble/hashes/utils.js';

const ctx = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync('site/replay/replay.data.js', 'utf8'), ctx);
const D = ctx.window.REPLAY_DATA;
const deployments = JSON.parse(fs.readFileSync('docs/canonical/deployments.json', 'utf8'));

test('every run on the page is a promoted run, byte for byte, and checks out', () => {
  const ids = [...new Set([...D.useCases.flatMap((u) => [u.runId, ...(u.also || []).map((a) => a.id)]), ...D.other.map((o) => o.id)])];
  assert.ok(ids.length >= 10);
  assert.deepEqual(Object.keys(D.runs).sort(), [...ids].sort());
  for (const id of ids) {
    assert.equal(D.runs[id].eventsText, fs.readFileSync(`docs/lab-runs/${id}/events.jsonl`, 'utf8'), id);
    assert.equal(D.runs[id].summaryText, fs.readFileSync(`docs/lab-runs/${id}/summary.json`, 'utf8'), id);
    assert.equal(checkRun(D.runs[id].eventsText, D.runs[id].summaryText).ok, true, id);
  }
});

test('the contract hash on the page is the live one recorded in deployments.json', () => {
  assert.equal(D.contract.id, deployments.contract);
  assert.equal(D.contract.codeHash, deployments.deployments.at(-1).codeHash);
  assert.ok(D.contract.rpcUrls.length >= 2);
});

test('the pay run the page features is a passing hardware run whose own evidence verifies', () => {
  const evs = D.runs[D.payRunId].eventsText.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  assert.equal(evs.find((e) => e.type === 'exp.end').verdict, 'PASS');
  assert.equal(evs.find((e) => e.type === 'exp.start').tier, 'hardware');
  const T = evs.find((e) => e.kind === 'paper-trail'); const R = evs.find((e) => e.kind === 'review');
  for (const p of T.people) {
    const v = verifyStatement({ cipherHex: p.cipherHex, secretX25519: hexToBytes(p.secretHex), hostSettlePublicKey: T.settlePublicKey, onChainOrderHash: T.orderHash });
    assert.equal(v.ok, true, p.name);
  }
  const emp = JSON.parse(openFromModel(T.employer.cipherHex, hexToBytes(T.employer.secretHex)));
  assert.equal(payrunOrderHash(emp.runId, emp.receiptsRoot), T.orderHash);
  assert.equal(verifyAuditorPack(JSON.parse(openFromModel(T.auditor.packCipherHex, hexToBytes(T.auditor.secretHex))), T.orderHash).ok, true);
  assert.ok(R.findings.some((f) => f.line === R.cyLabel && f.code === 'zero-deduction'));
  const sum = JSON.parse(openFromModel(T.approval.summaryCipherHex, hexToBytes(T.approval.summarySecretHex)));
  assert.equal(sum.orderHash, T.orderHash, 'the approver signed off the run that settled');
  assert.ok(T.approval.message.endsWith(`:${T.runId}:${T.orderHash}`));
  assert.equal(verifyModelReceipt(R.receipt).ok, true, 'the saved AI receipt verifies on its own');
  assert.equal(verifyModelReceipt({ ...R.receipt, requestSha256: '00'.repeat(32) }).ok, false);
});

test('every use case replays a passing hardware run, and every stage it says is modelled shows something the run recorded', () => {
  for (const u of D.useCases) {
    const evs = D.runs[u.runId].eventsText.split('\n').filter(Boolean).map((l) => JSON.parse(l));
    assert.equal(evs.find((e) => e.type === 'exp.end').verdict, 'PASS', u.key);
    assert.equal(evs.find((e) => e.type === 'exp.start').tier, 'hardware', u.key);
    for (const s of u.stages || []) {
      if (!s.modelled) continue;
      const re = new RegExp(s.claims, 'i');
      const hits = evs.filter((e) => e.type === 'assert' && e.ok && s.steps.some((p) => (e.step || '').toLowerCase().includes(p.toLowerCase())) && re.test(e.claim));
      assert.ok(hits.length > 0, `${u.key}: ${s.title}`);
      if (s.tx) assert.ok(evs.some((e) => e.kind === 'tx' && e.ok && s.steps.some((p) => e.step.toLowerCase().includes(p.toLowerCase()))), `${u.key}: ${s.title} has a transaction`);
    }
  }
});

test('the vote with no payout records a decision the browser verifier accepts, and rejects when the winner is changed', () => {
  const u = D.useCases.find((x) => x.key === 'decision');
  const evs = D.runs[u.runId].eventsText.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const d = evs.find((e) => e.kind === 'decision');
  assert.equal(verifyDecision({ message: d.message, signatureHex: d.signature, settlePublicKeyHex: d.settlePublicKey }).ok, true);
  assert.equal(verifyDecision({ message: d.message.replace(':A:', ':B:'), signatureHex: d.signature, settlePublicKeyHex: d.settlePublicKey }).ok, false);
});

test('the built script has no Node built-ins', () => {
  const bundle = fs.readFileSync('site/replay/replay.bundle.js', 'utf8');
  assert.equal(/node:/.test(bundle), false);
  assert.ok(bundle.length > 20_000);
});
