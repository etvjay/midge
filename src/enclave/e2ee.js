import { randomBytes } from 'node:crypto';
import { ed25519, x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';

/**
 * NEAR AI Cloud E2EE v2 (Ed25519 keys):
 *   X25519 ECDH with an ephemeral key per message, HKDF-SHA256 (no salt, info "ed25519_encryption"),
 *   XChaCha20-Poly1305 with a 24-byte random nonce.
 *   Wire format (hex): [ephemeral X25519 public key, 32 B][nonce, 24 B][ciphertext + 16 B tag]
 *
 * Anyone can seal to the model's attested public key. The ciphertext carries no sender identity,
 * so many members can each seal their own message and a coordinator can relay them unread.
 */
const INFO = new TextEncoder().encode('ed25519_encryption');
const HEX64 = /^[0-9a-f]{64}$/i;

const toHex = (u8) => Buffer.from(u8).toString('hex');

function deriveKey(sharedSecret) {
  return hkdf(sha256, sharedSecret, undefined, INFO, 32);
}

/** A client key pair: the public key goes in X-Client-Pub-Key, the secret opens replies. */
export function generateClientKey() {
  const seed = randomBytes(32);
  return {
    publicKeyHex: toHex(ed25519.getPublicKey(seed)),
    secretX25519: ed25519.utils.toMontgomerySecret(seed),
  };
}

/** Encrypt text to the model's Ed25519 public key (64 hex chars). Returns hex. */
export function sealToModel(text, modelPublicKeyHex) {
  if (!HEX64.test(modelPublicKeyHex)) throw new Error('Model public key must be 32 bytes of hex');
  const modelX25519 = ed25519.utils.toMontgomery(Buffer.from(modelPublicKeyHex, 'hex'));
  const ephemeral = randomBytes(32);
  const key = deriveKey(x25519.getSharedSecret(ephemeral, modelX25519));
  const nonce = randomBytes(24);
  const ciphertext = xchacha20poly1305(key, nonce).encrypt(new TextEncoder().encode(text));
  return toHex(Buffer.concat([x25519.getPublicKey(ephemeral), nonce, ciphertext]));
}

/** Decrypt a hex blob that was sealed to our client key. */
export function openFromModel(blobHex, secretX25519) {
  const data = Buffer.from(blobHex, 'hex');
  if (data.length < 32 + 24 + 16) throw new Error('Sealed blob is too short');
  const key = deriveKey(x25519.getSharedSecret(secretX25519, data.subarray(0, 32)));
  return new TextDecoder().decode(xchacha20poly1305(key, data.subarray(32, 56)).decrypt(data.subarray(56)));
}
