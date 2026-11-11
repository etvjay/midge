import { b58decode } from '../multichain/solana-transfer.js';

/**
 * Checks run BEFORE anyone asks the contract for a signature. Blocking findings mirror the contract's own rules (so a payment that would be
 * refused on chain is caught early and cheaply); warnings are about things a person should look at: a destination that changed since the last
 * pay run, or an amount far from the last one. It never moves money; the contract still decides.
 */
const isSol = (c) => c.startsWith('solana');
const validAddress = (chain, a) => {
  if (typeof a !== 'string') return false;
  if (isSol(chain)) { try { return b58decode(a).length === 32; } catch { return false; } }
  return /^0x[0-9a-fA-F]{40}$/.test(a);
};
const norm = (chain, a) => (isSol(chain) ? a : a.toLowerCase());

export function preflight(p, { policy, spent = {}, usedObligations = new Set(), history = {}, person = null } = {}) {
  const findings = [];
  const add = (code, severity, message) => findings.push({ code, severity, message });
  if (!validAddress(p.chain, p.payee)) { add('bad-address', 'block', `${p.payee} is not a valid address on ${p.chain}`); return { ok: false, needsSecondApproval: false, findings }; }
  if (usedObligations.has(p.obligationId)) add('duplicate-obligation', 'block', `obligation ${p.obligationId} was already requested`);
  const rule = (policy?.payees || []).find((x) => x.chain === p.chain && norm(x.chain, x.address) === norm(p.chain, p.payee));
  if (!rule) add('payee-not-allowed', 'block', `${p.payee} is not an allowed payee on ${p.chain}`);
  else {
    const amount = BigInt(p.amount);
    if (amount <= 0n || amount > BigInt(rule.max_amount)) add('over-payment-cap', 'block', `${p.amount} is over the per-payment cap ${rule.max_amount}`);
    const already = BigInt(spent[`${p.chain}:${p.payee}`] ?? spent[`${p.chain}:${norm(p.chain, p.payee)}`] ?? 0);
    if (already + amount > BigInt(rule.max_total)) add('over-running-total', 'block', `would bring this payee to ${already + amount}, over the running cap ${rule.max_total}`);
  }
  if (!isSol(p.chain) && p.gasLimit !== undefined && p.maxFee !== undefined && BigInt(p.gasLimit) * BigInt(p.maxFee) > BigInt(policy?.max_fee_cost ?? 0)) add('fee-over-cap', 'block', 'gas limit x max fee is over the fee cap');
  const last = person ? history[person] : null;
  if (last) {
    if (last.chain !== p.chain || norm(last.chain, last.address) !== norm(p.chain, p.payee)) add('destination-changed', 'warn', `${person}'s destination differs from the last pay run; a second person should confirm it`);
    const prev = BigInt(last.amount); const now = BigInt(p.amount);
    if (prev > 0n && (now > prev * 2n || now * 2n < prev)) add('amount-unusual', 'warn', `amount ${p.amount} is more than double or less than half of the last payment ${last.amount}`);
  }
  return { ok: !findings.some((f) => f.severity === 'block'), needsSecondApproval: findings.some((f) => f.code === 'destination-changed'), findings };
}
