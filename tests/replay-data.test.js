// The replay page's data is a built copy. This fails if it has drifted from the recorded runs or the recorded contract hash,
// so the page cannot quietly show something the repository no longer says. Rebuild with: npm run build:replay
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { checkRun, verifyStatement, verifyAuditorPack } from '../src/browser/midge-verify.js';
import { openFromModel } from '../src/browser/midge-client.js';
import { hexToBytes } from '@noble/hashes/utils.js';

const ctx = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync('site/replay/replay.data.js', 'utf8'), ctx);
const DATA = ctx.window.REPLAY_DATA;
const deployments = JSON.parse(fs.readFileSync('docs/canonical/deployments.json', 'utf8'));

test('every run on the page is a promoted run, byte for byte', () => {
  assert.ok(DATA.runs.length >= 6);
  for (const r of DATA.runs) {
    assert.equal(r.eventsText, fs.readFileSync(`docs/lab-runs/${r.id}/events.jsonl`, 'utf8'), r.id);
    assert.equal(r.summaryText, fs.readFileSync(`docs/lab-runs/${r.id}/summary.json`, 'utf8'), r.id);
    assert.equal(checkRun(r.eventsText, r.summaryText).ok, true, r.id);
  }
});

test('the contract hash on the page is the live one recorded in deployments.json', () => {
  assert.equal(DATA.contract.id, deployments.contract);
  assert.equal(DATA.contract.codeHash, deployments.deployments.at(-1).codeHash);
  assert.ok(DATA.contract.rpcUrls.length >= 2);
});

test('the paper trail on the page verifies, and is labelled as made by a local room', () => {
  const T = DATA.paperTrail;
  assert.match(T.note, /simulated attestation/);
  for (const p of T.people) assert.equal(verifyStatement({ cipherHex: p.cipherHex, secretX25519: hexToBytes(p.secretHex), hostSettlePublicKey: T.settlePublicKey, onChainOrderHash: T.orderHash }).ok, true, p.name);
  const pack = JSON.parse(openFromModel(T.auditor.packCipherHex, hexToBytes(T.auditor.secretHex)));
  assert.equal(verifyAuditorPack(pack, T.orderHash).ok, true);
  assert.match(T.refusal, /does not match/);
});

test('the built script is the one in the repository (no Node built-ins, built from the current source)', () => {
  const bundle = fs.readFileSync('site/replay/replay.bundle.js', 'utf8');
  assert.equal(/node:/.test(bundle), false);
  assert.ok(bundle.length > 20_000);
});
