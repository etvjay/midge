// Audit run-1, lead 14: one undecryptable sealed intent must not block the local Roost's aggregation for ever.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RoostEnclave } from '../src/enclave/roost.js';

test('a garbage bid is dropped and the readable ones still aggregate', () => {
  const roost = new RoostEnclave();
  roost.submitSealedIntent({ flyerId: 'a.near', cipherText: roost.sealIntent({ amount: 3, pair: 'USDC/NEAR' }) });
  roost.submitSealedIntent({ flyerId: 'poison.near', cipherText: Buffer.from('not a real ciphertext').toString('base64') });
  roost.submitSealedIntent({ flyerId: 'b.near', cipherText: roost.sealIntent({ amount: 4, pair: 'USDC/NEAR' }) });
  const out = roost.aggregateAndClear();
  assert.equal(out.aggregateOrder.flyerCount, 2);
  assert.equal(out.aggregateOrder.totalInputAmount, 7);
  assert.equal(roost.sealedEncryptedIntents.length, 0);
});

test('a queue with nothing readable fails clearly and is cleared, not stuck', () => {
  const roost = new RoostEnclave();
  roost.submitSealedIntent({ flyerId: 'poison.near', cipherText: Buffer.from('nope').toString('base64') });
  assert.throws(() => roost.aggregateAndClear(), /no readable/i);
  assert.equal(roost.sealedEncryptedIntents.length, 0);
});
