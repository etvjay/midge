import crypto from 'node:crypto';
import { openFromModel } from '../enclave/e2ee.js';

/**
 * Receipts: a canonical form, a Merkle tree over receipt hashes, and the check a person runs on their own statement.
 * A receipt is hashed into a leaf; the host signs the leaf; the leaves form a tree whose root the settlement's order hash
 * commits to (payrunOrderHash), so a person can check their statement against what the chain recorded.
 */
const sha = (buf) => crypto.createHash('sha256').update(buf).digest();
const SPKI_ED25519_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const RECEIPT_DOMAIN = 'midge-receipt-v1:';

export function canonicalJson(v) {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}
export const leafHash = (obj) => sha(Buffer.concat([Buffer.from([0]), Buffer.from(canonicalJson(obj), 'utf8')])).toString('hex');
const nodeHash = (l, r) => sha(Buffer.concat([Buffer.from([1]), Buffer.from(l, 'hex'), Buffer.from(r, 'hex')])).toString('hex');
const splitAt = (n) => { let k = 1; while (k * 2 < n) k *= 2; return k; };

export function merkleRoot(leaves) {
  if (leaves.length === 0) throw new Error('a Merkle tree needs at least one leaf');
  if (leaves.length === 1) return leaves[0];
  const k = splitAt(leaves.length);
  return nodeHash(merkleRoot(leaves.slice(0, k)), merkleRoot(leaves.slice(k)));
}

/** The sibling hashes from the leaf up to the root, each with the side the sibling is on. */
export function merkleProof(leaves, index) {
  if (index < 0 || index >= leaves.length) throw new Error('index out of range');
  if (leaves.length === 1) return [];
  const k = splitAt(leaves.length);
  return index < k
    ? [...merkleProof(leaves.slice(0, k), index), { side: 'R', hash: merkleRoot(leaves.slice(k)) }]
    : [...merkleProof(leaves.slice(k), index - k), { side: 'L', hash: merkleRoot(leaves.slice(0, k)) }];
}

export function verifyProof(leaf, proof, root) {
  if (!Array.isArray(proof) || !/^[0-9a-f]{64}$/.test(String(root))) return false;
  let h = leaf;
  for (const step of proof) {
    if (!step || !/^[0-9a-f]{64}$/.test(String(step.hash)) || (step.side !== 'L' && step.side !== 'R')) return false;
    h = step.side === 'R' ? nodeHash(h, step.hash) : nodeHash(step.hash, h);
  }
  return h === root;
}

export const payrunOrderHash = (runId, receiptsRoot) => crypto.createHash('sha256').update(`midge-payrun-v1:${runId}:${receiptsRoot}`, 'utf8').digest('hex');

export function verifyReceiptSignature(hostPublicKeyHex, leaf, signatureHex) {
  try {
    if (!/^[0-9a-f]{64}$/i.test(String(hostPublicKeyHex)) || !/^[0-9a-f]{128}$/i.test(String(signatureHex))) return false;
    const key = crypto.createPublicKey({ key: Buffer.concat([SPKI_ED25519_PREFIX, Buffer.from(hostPublicKeyHex, 'hex')]), format: 'der', type: 'spki' });
    return crypto.verify(null, Buffer.from(RECEIPT_DOMAIN + leaf, 'utf8'), key, Buffer.from(signatureHex, 'hex'));
  } catch { return false; }
}
export const receiptSigningMessage = (leaf) => RECEIPT_DOMAIN + leaf;

/**
 * What a person runs on their own statement: it must decrypt with their key, carry the host's signature over their receipt,
 * a Merkle proof from that receipt to the root, and a root that reproduces the order hash the chain recorded.
 */
export function verifyStatement({ cipherHex, secretX25519, hostSettlePublicKey, onChainOrderHash }) {
  let doc;
  try { doc = JSON.parse(openFromModel(cipherHex, secretX25519)); } catch { return { ok: false, receipt: null, checks: { decrypts: false } }; }
  try {
    const leaf = leafHash(doc.receipt);
    const checks = {
      decrypts: true,
      runId: doc.receipt?.runId === doc.runId,
      signature: verifyReceiptSignature(hostSettlePublicKey, leaf, doc.signature),
      proof: verifyProof(leaf, doc.proof, doc.receiptsRoot),
      orderHash: payrunOrderHash(doc.runId, doc.receiptsRoot) === onChainOrderHash,
    };
    return { ok: Object.values(checks).every(Boolean), receipt: doc.receipt, checks };
  } catch { return { ok: false, receipt: null, checks: { decrypts: true, wellFormed: false } }; }
}
