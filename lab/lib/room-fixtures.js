// Shared fixtures for the RoomService experiments: members with real ed25519 NEAR-style keys, a stubbed account-key check,
// hosts with a simulated attestation provider, and a helper that seals and signs an input the way a member's app would.
import { HostedRoost } from '../../src/roost-service/hosted-roost.js';
import { sealToModel } from '../../src/enclave/e2ee.js';
import { signInputWithNearKey, inputMessage, nearKeyPair } from '../../src/roost-service/signed-input.js';

export const provider = { simulated: true, attest: async () => Buffer.from('lab-local-no-hardware'), info: async () => ({}) };
export const ROUND = { contractId: 'c.near', syndicateId: 'vote', epoch: 1, roundNonce: 'ab'.repeat(32) };
export const ROLL = ['m1.near', 'm2.near', 'm3.near', 'm4.near', 'm5.near'];
export const OPTIONS = { A: 'ra.near', B: 'rb.near' };
export const VOTE_PARAMS = { options: OPTIONS, roll: ROLL, share: '0.01', quorumBps: 5000, rule: 'majority' };
export const ADMIN_KEY = 'coordinator-key-for-tests-0123456789';
const IDS = [...ROLL, 'outsider.near', 'taker.near', 'maker1.near', 'maker2.near'];
export const keys = Object.fromEntries(IDS.map((id) => [id, nearKeyPair()]));
export const keyCheck = async (id, pk) => keys[id]?.publicKey === pk;

export const mkHost = () => new HostedRoost({ provider, requireSignedInputs: true, accountKeyCheck: keyCheck, deterministicOrder: true });

/** A signed, sealed input as a member's app builds it. The service and the adapters never see a secret key. */
export function signedInput(host, id, body, { seq = 1, round = ROUND, tamper = false } = {}) {
  const cipherTextHex = sealToModel(JSON.stringify(body), host.intentPublicKey);
  const sig = signInputWithNearKey(keys[id].secretKey, inputMessage({ ...round, flyerId: id, seq, cipherTextHex }));
  return { flyerId: id, cipherTextHex, publicKey: keys[id].publicKey, signature: tamper ? sig.replace(/^../, (x) => (x === '00' ? '01' : '00')) : sig, seq };
}
export const VOTE_CHOICES = ['A', 'A', 'A', 'B', 'abstain'];
export const voteInputs = (host, choices = VOTE_CHOICES, opts = {}) => choices.map((c, i) => signedInput(host, ROLL[i], { choice: c }, opts));
