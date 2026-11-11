/**
 * A Solana SOL transfer built and assembled by hand, so a group's NEAR-derived Ed25519 key (NEAR Chain Signatures, signer domain 1)
 * can sign and send a real transaction on Solana. Legacy message format, one system-program transfer, one signature.
 */
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function b58encode(bytes) {
  let zeros = 0; while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  let n = 0n; for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = ''; while (n > 0n) { out = ALPHABET[Number(n % 58n)] + out; n /= 58n; }
  return '1'.repeat(zeros) + out;
}

export function b58decode(str) {
  let zeros = 0; while (zeros < str.length && str[zeros] === '1') zeros++;
  let n = 0n;
  for (const ch of str) { const i = ALPHABET.indexOf(ch); if (i < 0) throw new Error(`not base58: ${ch}`); n = n * 58n + BigInt(i); }
  const bytes = []; while (n > 0n) { bytes.unshift(Number(n & 0xffn)); n >>= 8n; }
  return Uint8Array.from([...new Array(zeros).fill(0), ...bytes]);
}

/** "ed25519:<base58>" as the signer contract returns it, to the Solana address (the same 32 bytes in base58). */
export function nearKeyToSolanaAddress(nearKey) {
  if (!String(nearKey).startsWith('ed25519:')) throw new Error('expected an ed25519 key');
  const bytes = b58decode(nearKey.slice('ed25519:'.length));
  if (bytes.length !== 32) throw new Error(`expected 32 bytes, got ${bytes.length}`);
  return b58encode(bytes);
}

const need32 = (b, what) => { if (!(b instanceof Uint8Array) || b.length !== 32) throw new Error(`${what} must be 32 bytes`); return b; };

/** The legacy message for one system-program transfer from `from` to `to`. */
export function buildTransferMessage({ from, to, lamports, recentBlockhash }) {
  need32(from, 'from'); need32(to, 'to'); need32(recentBlockhash, 'recentBlockhash');
  if (typeof lamports !== 'bigint' || lamports < 0n || lamports >= 2n ** 64n) throw new Error('lamports must be a bigint in 0 .. 2^64 - 1');
  const data = new Uint8Array(12); const dv = new DataView(data.buffer);
  dv.setUint32(0, 2, true); dv.setBigUint64(4, lamports, true); // SystemInstruction::Transfer = 2
  return Uint8Array.from([
    1, 0, 1, // one required signature, no read-only signers, one read-only unsigned account (the program)
    3, ...from, ...to, ...new Uint8Array(32), // accounts: payer, recipient, system program (all zeros)
    ...recentBlockhash,
    1, 2, 2, 0, 1, 12, ...data, // one instruction: program index 2, accounts [0, 1], 12 data bytes
  ]);
}

/** A wire transaction: one signature (compact-u16 length 1), the signature, then the message. */
export function assembleTransaction(message, signature) {
  if (!(signature instanceof Uint8Array) || signature.length !== 64) throw new Error('signature must be 64 bytes');
  return Uint8Array.from([1, ...signature, ...message]);
}

/** The signer contract's EdDSA reply: { scheme: 'Ed25519', signature: [64 numbers] }. */
export function parseEddsaSignature(reply) {
  if (reply?.scheme !== 'Ed25519') throw new Error(`expected an Ed25519 reply, got ${reply?.scheme}`);
  const sig = Uint8Array.from(reply.signature || []);
  if (sig.length !== 64) throw new Error(`signature must be 64 bytes, got ${sig.length}`);
  return sig;
}
