// Audit run-1, leads 13 and 15.
import test from 'node:test';
import assert from 'node:assert/strict';
import { HostedRoost } from '../src/roost-service/hosted-roost.js';
import { sealToModel } from '../src/enclave/e2ee.js';
import { signInputWithNearKey, inputMessage, nearKeyPair } from '../src/roost-service/signed-input.js';

const provider = { simulated: true, attest: async () => Buffer.from('test-no-hardware'), info: async () => ({}) };
const ROUND_A = { contractId: 'c.near', syndicateId: 'vote', epoch: 1, roundNonce: 'ab'.repeat(32) };
const ROUND_B = { ...ROUND_A, roundNonce: 'cd'.repeat(32) };

test('lead 13: a cross that cannot be settled does not throw away the sealed orders', async () => {
  const host = new HostedRoost({ provider, deterministicOrder: true });
  const seal = (flyerId, order) => host.submitSealedIntent({ flyerId, cipherTextHex: sealToModel(JSON.stringify(order), host.intentPublicKey) });
  for (let i = 1; i <= 9; i += 1) seal(`seller${i}.near`, { side: 'sell', units: 1, limit: '1' });
  seal('buyer.near', { side: 'buy', units: 100, limit: '2' });
  assert.equal(host.sealedIntents.length, 10);
  await assert.rejects(async () => host.runCross({ referencePrice: '1' }), /at most 8 sellers/);
  assert.equal(host.sealedIntents.length, 10, 'the honest orders must still be queued');
});

test('lead 15: an input signed for the old round is not queued into the new one', async () => {
  const kp = nearKeyPair();
  let release;
  const gate = new Promise((r) => { release = r; });
  const host = new HostedRoost({ provider, requireSignedInputs: true, accountKeyCheck: async () => { await gate; return true; }, deterministicOrder: true });
  host.openRound(ROUND_A);
  const cipherTextHex = sealToModel(JSON.stringify({ choice: 'A' }), host.intentPublicKey);
  const signature = signInputWithNearKey(kp.secretKey, inputMessage({ ...ROUND_A, flyerId: 'm1.near', seq: 1, cipherTextHex }));
  const pending = host.submitSignedIntent({ flyerId: 'm1.near', cipherTextHex, publicKey: kp.publicKey, signature, seq: 1 });
  host.openRound(ROUND_B); // the coordinator opens the next round while the key check is still out
  release();
  await assert.rejects(pending, /round changed/);
  assert.equal(host.sealedIntents.length, 0);
  assert.equal(host.lastSeq.size, 0);
});
