// A Solana SOL transfer built and assembled by hand, so a group's NEAR-derived Ed25519 key (Chain Signatures, domain 1) can sign and send a real transaction.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ed25519 } from '@noble/curves/ed25519.js';
import { b58encode, b58decode, nearKeyToSolanaAddress, buildTransferMessage, assembleTransaction, parseEddsaSignature } from '../src/multichain/solana-transfer.js';

const seed = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const pub = ed25519.getPublicKey(seed);
const to = Uint8Array.from({ length: 32 }, (_, i) => 200 - i);
const blockhash = Uint8Array.from({ length: 32 }, (_, i) => (i * 7) % 256);

test('base58 round-trips and keeps leading zero bytes', () => {
  for (const bytes of [pub, to, Uint8Array.from([0, 0, 1, 2, 3]), new Uint8Array(32)]) assert.deepEqual(b58decode(b58encode(bytes)), bytes);
  assert.equal(b58encode(new Uint8Array(32)), '11111111111111111111111111111111');
});

test('a NEAR ed25519 key string becomes the Solana address of the same 32 bytes', () => {
  const near = `ed25519:${b58encode(pub)}`;
  assert.equal(nearKeyToSolanaAddress(near), b58encode(pub));
  assert.throws(() => nearKeyToSolanaAddress(`secp256k1:${b58encode(pub)}`), /ed25519/);
  assert.throws(() => nearKeyToSolanaAddress(`ed25519:${b58encode(pub.slice(1))}`), /32 bytes/);
});

test('the transfer message has the exact legacy layout: header, three accounts, blockhash, one system-transfer instruction', () => {
  const m = buildTransferMessage({ from: pub, to, lamports: 1_000_000n, recentBlockhash: blockhash });
  assert.equal(m.length, 150); // 3 header + 1 account count + 96 keys + 32 blockhash + 1 instruction count + 1 program index + 1 index count + 2 indexes + 1 data length + 12 data
  assert.deepEqual([...m.slice(0, 3)], [1, 0, 1]); // 1 signer, 0 read-only signers, 1 read-only unsigned (the system program)
  assert.equal(m[3], 3);
  assert.deepEqual(m.slice(4, 36), pub); assert.deepEqual(m.slice(36, 68), to); assert.deepEqual(m.slice(68, 100), new Uint8Array(32)); // the system program is the all-zero key
  assert.deepEqual(m.slice(100, 132), blockhash);
  assert.deepEqual([...m.slice(132, 139)], [1, 2, 2, 0, 1, 12, 2]); // 1 instruction; program index 2; 2 accounts (0 then 1); data length 12; transfer = instruction 2
  const lamports = new DataView(m.buffer, m.byteOffset + 142, 8).getBigUint64(0, true);
  assert.equal(lamports, 1_000_000n);
});

test('a signature over the message by the key, assembled into a transaction, verifies and has the wire layout', () => {
  const m = buildTransferMessage({ from: pub, to, lamports: 5n, recentBlockhash: blockhash });
  const sig = ed25519.sign(m, seed);
  assert.ok(ed25519.verify(sig, m, pub));
  const tx = assembleTransaction(m, sig);
  assert.equal(tx[0], 1); // one signature (compact-u16)
  assert.deepEqual(tx.slice(1, 65), sig); assert.deepEqual(tx.slice(65), m);
  assert.throws(() => assembleTransaction(m, sig.slice(1)), /64 bytes/);
});

test('amounts and keys are checked before anything is built', () => {
  assert.throws(() => buildTransferMessage({ from: pub.slice(1), to, lamports: 1n, recentBlockhash: blockhash }), /32 bytes/);
  assert.throws(() => buildTransferMessage({ from: pub, to, lamports: -1n, recentBlockhash: blockhash }), /lamports/);
  assert.throws(() => buildTransferMessage({ from: pub, to, lamports: 2n ** 64n, recentBlockhash: blockhash }), /lamports/);
  assert.throws(() => buildTransferMessage({ from: pub, to, lamports: 1n, recentBlockhash: blockhash.slice(1) }), /32 bytes/);
});

test("the signer contract's EdDSA reply is parsed into the 64-byte signature, and malformed replies are refused", () => {
  const sig = ed25519.sign(new Uint8Array([1, 2, 3]), seed);
  assert.deepEqual(parseEddsaSignature({ scheme: 'Ed25519', signature: [...sig] }), sig);
  assert.throws(() => parseEddsaSignature({ scheme: 'Secp256k1', big_r: {} }), /Ed25519/);
  assert.throws(() => parseEddsaSignature({ scheme: 'Ed25519', signature: [1, 2, 3] }), /64 bytes/);
});
