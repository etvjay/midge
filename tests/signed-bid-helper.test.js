import test from 'node:test';
import assert from 'node:assert/strict';
import { HostedRoost } from '../src/roost-service/hosted-roost.js';
import { nearKeyPair, signedBidParams } from '../src/roost-service/signed-input.js';

const provider = { simulated: true, attest: async () => Buffer.from('t'), info: async () => ({}) };
const round = { contractId: 'c.test.testnet', syndicateId: 'grp-1', epoch: 1, roundNonce: 'ab'.repeat(32) };

test('one call seals and signs a bid, and a signed-only room accepts it for a pool', async () => {
  const k = nearKeyPair();
  const host = new HostedRoost({ provider, requireSignedInputs: true, accountKeyCheck: async (acct, pub) => acct === 'ada.testnet' && pub === k.publicKey });
  host.openRound(round);
  const params = signedBidParams({ round, flyerId: 'ada.testnet', body: { amount: '0.01' }, secretKey: k.secretKey, publicKey: k.publicKey, intentPublicKey: host.intentPublicKey });
  assert.deepEqual(Object.keys(params).sort(), ['cipherTextHex', 'flyerId', 'publicKey', 'seq', 'signature']);
  await host.submitSignedIntent(params);
  const out = host.runPool({ recipient: 'rp.testnet', roundId: 'r1' });
  assert.equal(out.allocations.length, 1);
  assert.equal(out.allocations[0].recipient, 'rp.testnet', 'the pool pays the named recipient');
  assert.equal(BigInt(out.allocations[0].amount), 10n ** 22n, 'exactly the 0.01 NEAR that was bid');
});

test('the same room refuses an unsigned bid, which is the policy: signed-only for every program', async () => {
  const host = new HostedRoost({ provider, requireSignedInputs: true, accountKeyCheck: async () => true });
  host.openRound(round);
  assert.throws(() => host.submitSealedIntent({ flyerId: 'ada.testnet', cipherTextHex: 'aa'.repeat(40) }), /only accepts signed inputs/);
});

test('a bid signed with a key that is not the account\'s is refused by the key check', async () => {
  const real = nearKeyPair(); const stranger = nearKeyPair();
  const host = new HostedRoost({ provider, requireSignedInputs: true, accountKeyCheck: async (_a, pub) => pub === real.publicKey });
  host.openRound(round);
  const params = signedBidParams({ round, flyerId: 'ada.testnet', body: { amount: '1' }, secretKey: stranger.secretKey, publicKey: stranger.publicKey, intentPublicKey: host.intentPublicKey });
  await assert.rejects(() => host.submitSignedIntent(params));
});
