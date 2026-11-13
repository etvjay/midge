/**
 * The Midge client for a browser: everything a member needs to seal an input to the room and sign it, with no Node built-ins.
 *
 * It does exactly what the Node code does, byte for byte (tests/browser-client.test.js compares them): the same message to sign, the same NEAR key
 * format, the same Ed25519 signatures (Ed25519 is deterministic), the same invoice hash and the same sealed-box format as src/enclave/e2ee.js.
 * Random values come from the browser's secure generator through @noble/hashes. Nothing here talks to the network.
 */
import { ed25519, x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, randomBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';

const HEX64 = /^[0-9a-f]{64}$/i;
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const INFO = utf8ToBytes('ed25519_encryption');
const concat = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
const asBytes = (v) => (typeof v === 'string' ? hexToBytes(v) : Uint8Array.from(v));

// ---- base58 (NEAR key strings) ----
export function base58Encode(bytes) {
  let n = 0n; for (const b of bytes) n = n * 256n + BigInt(b);
  let out = ''; while (n > 0n) { out = B58[Number(n % 58n)] + out; n /= 58n; }
  for (const b of bytes) { if (b === 0) out = `1${out}`; else break; }
  return out;
}
export function base58Decode(text) {
  let n = 0n; for (const ch of text) { const i = B58.indexOf(ch); if (i < 0) throw new Error('not base58'); n = n * 58n + BigInt(i); }
  let hex = n.toString(16); if (hex.length % 2) hex = `0${hex}`;
  const body = n === 0n ? new Uint8Array(0) : hexToBytes(hex);
  const zeros = text.length - text.replace(/^1+/, '').length;
  return concat(new Uint8Array(zeros), body);
}

// ---- NEAR ed25519 keys: "ed25519:<base58>", the secret being seed || public ----
export function nearKeyPairFromSeed(seed) {
  const s = asBytes(seed); if (s.length !== 32) throw new Error('a seed is 32 bytes');
  const pub = ed25519.getPublicKey(s);
  return { publicKey: `ed25519:${base58Encode(pub)}`, secretKey: `ed25519:${base58Encode(concat(s, pub))}` };
}
export const nearKeyPair = () => nearKeyPairFromSeed(randomBytes(32));
const decodeKey = (key) => { if (typeof key !== 'string' || !key.startsWith('ed25519:')) throw new Error('key must be ed25519:<base58>'); return base58Decode(key.slice(8)); };

// ---- signed inputs ----
export const INPUT_DOMAIN = 'midge-input-v1';
export function inputMessage({ contractId, syndicateId, epoch, roundNonce, flyerId, seq, cipherTextHex }) {
  for (const [k, v] of Object.entries({ contractId, syndicateId, roundNonce, flyerId })) if (typeof v !== 'string' || v.length === 0 || v.includes(':')) throw new Error(`${k} must be a non-empty string without ':'`);
  if (!Number.isSafeInteger(epoch) || epoch < 0) throw new Error('epoch must be a non-negative integer');
  if (!Number.isSafeInteger(seq) || seq < 1) throw new Error('seq must be a positive integer');
  const digest = bytesToHex(sha256(hexToBytes(String(cipherTextHex).toLowerCase())));
  return `${INPUT_DOMAIN}:${contractId}:${syndicateId}:${epoch}:${roundNonce}:${flyerId}:${seq}:${digest}`;
}
export function signInputWithNearKey(secretKey, message) {
  const raw = decodeKey(secretKey); if (raw.length !== 64) throw new Error('secret key must be 64 bytes');
  return bytesToHex(ed25519.sign(utf8ToBytes(message), raw.subarray(0, 32)));
}
export function verifyNearSignature(publicKey, message, signatureHex) {
  try {
    const raw = decodeKey(publicKey); if (raw.length !== 32 || !/^[0-9a-f]{128}$/i.test(String(signatureHex))) return false;
    return ed25519.verify(hexToBytes(signatureHex), utf8ToBytes(message), raw);
  } catch { return false; }
}

// ---- sealed boxes (NEAR AI Cloud E2EE v2: X25519, HKDF-SHA256, XChaCha20-Poly1305) ----
const deriveKey = (shared) => hkdf(sha256, shared, undefined, INFO, 32);
export function generateClientKey() {
  const seed = randomBytes(32);
  return { publicKeyHex: bytesToHex(ed25519.getPublicKey(seed)), secretX25519: ed25519.utils.toMontgomerySecret(seed) };
}
export function sealToModel(text, modelPublicKeyHex) {
  if (!HEX64.test(modelPublicKeyHex)) throw new Error('Model public key must be 32 bytes of hex');
  const modelX25519 = ed25519.utils.toMontgomery(hexToBytes(modelPublicKeyHex));
  const ephemeral = randomBytes(32);
  const key = deriveKey(x25519.getSharedSecret(ephemeral, modelX25519));
  const nonce = randomBytes(24);
  const ciphertext = xchacha20poly1305(key, nonce).encrypt(utf8ToBytes(text));
  return bytesToHex(concat(x25519.getPublicKey(ephemeral), nonce, ciphertext));
}
export function openFromModel(blobHex, secretX25519) {
  const data = hexToBytes(blobHex);
  if (data.length < 32 + 24 + 16) throw new Error('Sealed blob is too short');
  const key = deriveKey(x25519.getSharedSecret(secretX25519, data.subarray(0, 32)));
  return new TextDecoder().decode(xchacha20poly1305(key, data.subarray(32, 56)).decrypt(data.subarray(56)));
}

/** One call: seal a body to the room's intent key and sign it, in the shape the room's /signed-intents route takes. */
export function buildSignedIntent({ round, flyerId, seq, body, intentPublicKey, secretKey }) {
  const cipherTextHex = sealToModel(JSON.stringify(body), intentPublicKey);
  const raw = decodeKey(secretKey);
  const publicKey = `ed25519:${base58Encode(raw.subarray(32))}`;
  const signature = signInputWithNearKey(secretKey, inputMessage({ ...round, flyerId, seq, cipherTextHex }));
  return { flyerId, cipherTextHex, publicKey, signature, seq };
}

// ---- invoices ----
export function canonicalJson(v) {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}
export const INVOICE_DOMAIN = 'midge-invoice-v1:';
export const invoiceHash = (body) => bytesToHex(sha256(utf8ToBytes(INVOICE_DOMAIN + canonicalJson(body))));
export function signInvoiceWithSeed(body, seed) {
  const s = asBytes(seed); if (s.length !== 32) throw new Error('a seed is 32 bytes');
  return { body, payeeKey: bytesToHex(ed25519.getPublicKey(s)), sig: bytesToHex(ed25519.sign(utf8ToBytes(INVOICE_DOMAIN + canonicalJson(body)), s)) };
}
export function verifyInvoice(inv) {
  try {
    if (!inv || !inv.body || !HEX64.test(inv.payeeKey) || !/^[0-9a-f]{128}$/i.test(inv.sig)) return { ok: false, reason: 'malformed invoice' };
    const ok = ed25519.verify(hexToBytes(inv.sig), utf8ToBytes(INVOICE_DOMAIN + canonicalJson(inv.body)), hexToBytes(inv.payeeKey));
    return ok ? { ok: true } : { ok: false, reason: 'signature does not verify' };
  } catch { return { ok: false, reason: 'signature does not verify' }; }
}
