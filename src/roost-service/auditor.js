import { leafHash, merkleRoot, merkleProof, verifyProof, payrunOrderHash } from './receipts.js';

/**
 * Selective disclosure for an auditor. The employer opens chosen lines of a pay run with a Merkle proof each; the auditor checks them against
 * the order hash recorded on chain, and sees nothing about the lines that stay closed. Totals can be shown without any person or address.
 */
/** What the employer signs to authorise opening lines of a pay run for an auditor. It names the run, the exact lines and the auditor's key, so none can be changed after signing. */
export const AUDIT_OPEN_DOMAIN = 'midge-audit-open-v1';
export const auditOpenMessage = ({ runId, indices, auditorKeyHex }) => `${AUDIT_OPEN_DOMAIN}:${runId}:${indices.join(',')}:${String(auditorKeyHex).toLowerCase()}`;

export function auditorPack({ runId, receipts, open }) {
  const leaves = receipts.map(leafHash);
  const root = merkleRoot(leaves);
  return { runId, root, lines: receipts.length, opened: open.map((i) => ({ index: i, leaf: receipts[i], proof: merkleProof(leaves, i) })) };
}

export function verifyAuditorPack(pack, onChainOrderHash) {
  if (payrunOrderHash(pack.runId, pack.root) !== onChainOrderHash) return { ok: false, reason: 'the root does not match the order hash on chain' };
  for (const o of pack.opened) if (!verifyProof(leafHash(o.leaf), o.proof, pack.root)) return { ok: false, reason: `opened line ${o.index} does not verify against the root` };
  return { ok: true };
}

const dec = (v) => { const [w, f = ''] = String(v).split('.'); return BigInt(w) * 10n ** 6n + BigInt(f.padEnd(6, '0').slice(0, 6)); };
const fmt = (m) => { const w = m / 1_000_000n; const f = (m % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, ''); return f ? `${w}.${f}` : `${w}`; };
export function totalsOnly(receipts) {
  const pays = receipts.filter((r) => r.kind === 'pay');
  const sum = (k) => fmt(pays.reduce((a, r) => a + dec(r[k]), 0n));
  return { lines: pays.length, gross: sum('gross'), tax: sum('tax'), benefits: sum('benefits'), net: sum('net') };
}
