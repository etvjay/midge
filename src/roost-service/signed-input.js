import { sealToModel } from '../enclave/e2ee.js';
import crypto from 'node:crypto';

/**
 * Signed sealed inputs. A member signs (round context, their account, a sequence number, the sha256 of the ciphertext)
 * with a NEAR ed25519 key; the Roost checks the signature and that the key belongs to the account on chain.
 * The signature hides nothing extra and reveals nothing about the choice: it covers only the ciphertext.
 */
export const INPUT_DOMAIN = 'midge-input-v1';
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const SPKI_ED25519_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const ACCOUNT_RE = /^[a-z0-9][a-z0-9._-]{1,63}$/;

export function base58Decode(text) {
  let n = 0n;
  for (const ch of text) { const i = B58.indexOf(ch); if (i < 0) throw new Error('not base58'); n = n * 58n + BigInt(i); }
  let hex = n.toString(16); if (hex.length % 2) hex = `0${hex}`;
  const body = n === 0n ? Buffer.alloc(0) : Buffer.from(hex, 'hex');
  const zeros = text.length - text.replace(/^1+/, '').length;
  return Buffer.concat([Buffer.alloc(zeros), body]);
}
export function base58Encode(buf) {
  let n = BigInt(`0x${Buffer.from(buf).toString('hex') || '0'}`); let out = '';
  while (n > 0n) { out = B58[Number(n % 58n)] + out; n /= 58n; }
  for (const b of buf) { if (b === 0) out = `1${out}`; else break; }
  return out;
}

/** A fresh NEAR-format ed25519 key pair: "ed25519:<base58>" strings (the secret is seed||public, as NEAR stores it). */
export function nearKeyPair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const seed = privateKey.export({ format: 'der', type: 'pkcs8' }).subarray(PKCS8_ED25519_PREFIX.length);
  const pub = publicKey.export({ format: 'der', type: 'spki' }).subarray(SPKI_ED25519_PREFIX.length);
  return { publicKey: `ed25519:${base58Encode(pub)}`, secretKey: `ed25519:${base58Encode(Buffer.concat([seed, pub]))}` };
}

export function inputMessage({ contractId, syndicateId, epoch, roundNonce, flyerId, seq, cipherTextHex }) {
  for (const [k, v] of Object.entries({ contractId, syndicateId, roundNonce, flyerId })) if (typeof v !== 'string' || v.length === 0 || v.includes(':')) throw new Error(`${k} must be a non-empty string without ':'`);
  if (!Number.isSafeInteger(epoch) || epoch < 0) throw new Error('epoch must be a non-negative integer');
  if (!Number.isSafeInteger(seq) || seq < 1) throw new Error('seq must be a positive integer');
  const digest = crypto.createHash('sha256').update(Buffer.from(String(cipherTextHex).toLowerCase(), 'hex')).digest('hex');
  return `${INPUT_DOMAIN}:${contractId}:${syndicateId}:${epoch}:${roundNonce}:${flyerId}:${seq}:${digest}`;
}

const decodeKey = (key, prefix) => { if (typeof key !== 'string' || !key.startsWith('ed25519:')) throw new Error('key must be ed25519:<base58>'); return base58Decode(key.slice(8)); };

export function signInputWithNearKey(secretKey, message) {
  const raw = decodeKey(secretKey); if (raw.length !== 64) throw new Error('secret key must be 64 bytes');
  const key = crypto.createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, raw.subarray(0, 32)]), format: 'der', type: 'pkcs8' });
  return crypto.sign(null, Buffer.from(message, 'utf8'), key).toString('hex');
}

export function verifyNearSignature(publicKey, message, signatureHex) {
  try {
    const raw = decodeKey(publicKey); if (raw.length !== 32 || !/^[0-9a-f]{128}$/i.test(String(signatureHex))) return false;
    const key = crypto.createPublicKey({ key: Buffer.concat([SPKI_ED25519_PREFIX, raw]), format: 'der', type: 'spki' });
    return crypto.verify(null, Buffer.from(message, 'utf8'), key, Buffer.from(signatureHex, 'hex'));
  } catch { return false; }
}

export const isAccountId = (id) => typeof id === 'string' && ACCOUNT_RE.test(id);

/**
 * Ask the chain whether `publicKey` is an access key of `accountId`. A full-access key counts; a function-call key counts only
 * if it is limited to our contract. Any failure to get a clear answer counts as "no" (fail closed).
 */
export function makeAccountKeyCheck({ rpcUrl, contractId, fetchImpl = fetch }) {
  return async (accountId, publicKey) => {
    const res = await fetchImpl(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'query', params: { request_type: 'view_access_key', finality: 'final', account_id: accountId, public_key: publicKey } }) });
    const body = await res.json();
    if (body.error || !body.result || body.result.error) return false;
    const perm = body.result.permission;
    if (perm === 'FullAccess') return true;
    return Boolean(perm && perm.FunctionCall && perm.FunctionCall.receiver_id === contractId);
  };
}

/**
 * The same check against several independent RPC providers, which must ALL confirm the key. One provider that says no, or says something different, refuses
 * the key; one that cannot answer is an error and the key is not accepted. A single provider could otherwise vouch for a key that is not the account's
 * (GAP-050), so two or more different providers are required when the check is built, as for the escrow reader.
 */
export function makeAgreeingAccountKeyCheck({ rpcUrls, contractId, fetchImpl = fetch }) {
  const urls = [...new Set((rpcUrls || []).map((u) => String(u).trim().replace(/\/+$/, '')).filter(Boolean))];
  if (urls.length < 2) throw new Error('the account-key check needs two or more different RPC providers: they must agree, so one is not enough');
  const checks = urls.map((rpcUrl) => makeAccountKeyCheck({ rpcUrl, contractId, fetchImpl }));
  return async (accountId, publicKey) => {
    const answers = await Promise.all(checks.map((c) => c(accountId, publicKey)));
    return answers.every((a) => a === true);
  };
}

/**
 * Everything a member sends to a signed-only room, in one call: seal the body to the room's intent key, then sign the sealed bytes together with
 * the round (contract, group, epoch, nonce), the account and a sequence number. Returns the parameters for `submitSignedIntent`.
 * The hosted Roost requires signed inputs for every program (pool, quote, auction, ballot, RFQ, pay run), so this is how a member bids.
 */
export function signedBidParams({ round, flyerId, body, secretKey, publicKey, intentPublicKey, seq = 1 }) {
  const cipherTextHex = sealToModel(JSON.stringify(body), intentPublicKey);
  const signature = signInputWithNearKey(secretKey, inputMessage({ ...round, flyerId, seq, cipherTextHex }));
  return { flyerId, cipherTextHex, publicKey, signature, seq };
}
