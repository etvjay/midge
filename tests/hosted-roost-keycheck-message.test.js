import test from 'node:test';
import assert from 'node:assert/strict';
import { HostedRoost } from '../src/roost-service/hosted-roost.js';
import { sealToModel } from '../src/enclave/e2ee.js';
import { signInputWithNearKey, inputMessage, nearKeyPair } from '../src/roost-service/signed-input.js';

const provider = { simulated: true, attest: async () => Buffer.from('t'), info: async () => ({}) };
const ROUND = { contractId: 'c.near', syndicateId: 'g', epoch: 1, roundNonce: 'ab'.repeat(32) };
const keys = nearKeyPair();

const submit = (room) => {
  const cipherTextHex = sealToModel(JSON.stringify({ amount: '0.01' }), room.intentPublicKey);
  return room.submitSignedIntent({ flyerId: 'ada.near', cipherTextHex, publicKey: keys.publicKey, signature: signInputWithNearKey(keys.secretKey, inputMessage({ ...ROUND, flyerId: 'ada.near', seq: 1, cipherTextHex })), seq: 1 });
};

test('when a chain provider cannot answer, the refusal says which provider and why (so an operator can act), and still never accepts the input', async () => {
  const room = new HostedRoost({ provider, requireSignedInputs: true, accountKeyCheck: async () => { throw new Error('b.example could not answer (-429 Rate limits exceeded)'); } });
  room.openRound(ROUND);
  await assert.rejects(() => submit(room), (e) => /could not check that .* is a key of ada\.near/.test(e.message) && /b\.example could not answer \(-429 Rate limits exceeded\)/.test(e.message));
  assert.equal(room.sealedIntents.length, 0, 'nothing was queued');
});

test('a provider that clearly says the key is not the account\'s still gives the plain "not a key" refusal', async () => {
  const room = new HostedRoost({ provider, requireSignedInputs: true, accountKeyCheck: async () => false });
  room.openRound(ROUND);
  await assert.rejects(() => submit(room), /is not a key of ada\.near/);
});

test('the reason shown to the caller is cut to a short length and cannot carry a long payload', async () => {
  const room = new HostedRoost({ provider, requireSignedInputs: true, accountKeyCheck: async () => { throw new Error(`x.example could not answer (${'A'.repeat(5000)})`); } });
  room.openRound(ROUND);
  await assert.rejects(() => submit(room), (e) => e.message.length < 400);
});
