// The signer contract returns a secp256k1 signature as (R, s); an Ethereum transaction needs (r, s, v) that recovers to the group's address.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import { signatureFromMpc } from '../src/multichain/evm-transfer.js';

const key = new ethers.SigningKey('0x' + '11'.repeat(32));
const address = ethers.computeAddress(key.publicKey);
const digest = ethers.keccak256(ethers.toUtf8Bytes('payroll run 1'));
const N = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');
const reply = (sig, { highS = false } = {}) => {
  const s = highS ? N - BigInt(sig.s) : BigInt(sig.s);
  return { scheme: 'Secp256k1', big_r: { affine_point: '02' + sig.r.slice(2), }, s: { scalar: s.toString(16).padStart(64, '0') }, recovery_id: 0 };
};

test("an MPC (R, s) reply becomes an Ethereum signature that recovers to the group's address", () => {
  const s = key.sign(digest);
  const out = signatureFromMpc(reply(s), digest, address);
  assert.equal(ethers.recoverAddress(digest, out), address);
});

test('a high-s reply is normalised, because Ethereum clients refuse non-canonical signatures', () => {
  const s = key.sign(digest);
  const out = signatureFromMpc(reply(s, { highS: true }), digest, address);
  assert.equal(ethers.recoverAddress(digest, out), address);
  assert.ok(BigInt(out.s) <= N / 2n);
});

test('a signature that does not recover to the expected address is refused, and so is a malformed reply', () => {
  const s = key.sign(digest);
  assert.throws(() => signatureFromMpc(reply(s), digest, ethers.computeAddress(new ethers.SigningKey('0x' + '22'.repeat(32)).publicKey)), /does not recover/);
  assert.throws(() => signatureFromMpc({ scheme: 'Ed25519', signature: [] }, digest, address), /Secp256k1/);
  assert.throws(() => signatureFromMpc({ scheme: 'Secp256k1', big_r: {}, s: {} }, digest, address), /incomplete/);
});
