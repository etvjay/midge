import { b58decode } from '../multichain/solana-transfer.js';

/**
 * An optional, advice-only explainer for the pre-flight check, built so that using it does not weaken the room's confidentiality.
 *
 * What the model is told: finding CODES, a chain family, and ratios rounded to the nearest ten percent ("about 90% of the per-payment cap").
 * What it is never told: a name, an account, an address, an obligation id, a group id, an exact amount, or any other exact number. Two different
 * amounts in the same ten-percent bucket produce the same message, so the amount cannot be worked back out.
 *
 * Three guards, none of which depends on the others:
 *   1. redactForAdvisor builds the message from a fixed set of fields, so there is nowhere for an identity to come from.
 *   2. assertNoLeak checks the finished message against every identifying string in the request AND against anything shaped like an address,
 *      and the model is not called if it finds one (fail closed).
 *   3. The reply is checked the same way and refused if it contains such a string.
 * The advice cannot change a decision: the pre-flight result is returned untouched beside the text, and nothing here signs or approves.
 * Off by default: nothing is sent unless the caller passes enabled: true.
 */

const KNOWN_CODES = new Set(['bad-address', 'duplicate-obligation', 'payee-not-allowed', 'over-payment-cap', 'over-running-total', 'fee-over-cap', 'destination-changed', 'amount-unusual']);

const SENTENCE = {
  'bad-address': 'The destination is not a valid address for that chain.',
  'duplicate-obligation': 'This obligation was already requested, so paying it again would be a duplicate.',
  'payee-not-allowed': 'The destination is not one of the payees the group allows on that chain.',
  'over-payment-cap': 'The amount is over the most the group allows for one payment.',
  'over-running-total': 'Paying this would take the payee past the group’s total for the current window.',
  'fee-over-cap': 'The network fee on this payment is over the group’s fee cap.',
  'destination-changed': 'The destination is different from the last pay run, so a second person should confirm it.',
  'amount-unusual': 'The amount is far from the last payment to this person.',
  other: 'A check raised a finding.',
};

/** Plain words for a pre-flight result, from codes alone: no model, nothing sent anywhere, no identifying detail. */
export function deterministicText(result) {
  if (!result || !Array.isArray(result.findings) || result.findings.length === 0) return 'All checks passed.';
  const lines = result.findings.map((f) => `${f.severity === 'block' ? 'Blocked' : 'Look at'}: ${SENTENCE[KNOWN_CODES.has(f.code) ? f.code : 'other']}`);
  return lines.join(' ');
}

const bucket = (num, den) => {
  if (den <= 0n) return null;
  const pct = Number((100n * num) / den);
  return Math.min(1000, Math.round(pct / 10) * 10);
};
const norm = (chain, a) => (chain.startsWith('solana') ? a : String(a).toLowerCase());

/** The only thing the model is sent. Built from a fixed set of fields. */
export function redactForAdvisor({ payment, result, context = {} }) {
  const findings = (result?.findings || []).map((f) => ({ code: KNOWN_CODES.has(f.code) ? f.code : 'other', severity: f.severity === 'block' ? 'block' : 'warn' }));
  const ratiosPct = {};
  try {
    const amount = BigInt(payment.amount);
    const rule = (context.policy?.payees || []).find((x) => x.chain === payment.chain && norm(x.chain, x.address) === norm(payment.chain, payment.payee));
    if (rule) {
      const cap = bucket(amount, BigInt(rule.max_amount)); if (cap !== null) ratiosPct.amountOfPaymentCap = cap;
      const spent = BigInt(context.spent?.[`${payment.chain}:${payment.payee}`] ?? context.spent?.[`${payment.chain}:${norm(payment.chain, payment.payee)}`] ?? 0);
      const win = bucket(spent + amount, BigInt(rule.max_total)); if (win !== null) ratiosPct.windowUseAfterPayment = win;
    }
    const last = context.person ? context.history?.[context.person] : null;
    if (last) { const v = bucket(amount, BigInt(last.amount)); if (v !== null) ratiosPct.amountVersusLastPayment = v; }
  } catch { /* a malformed amount produces no ratios; the findings still go */ }
  return { task: 'explain-preflight', chainKind: String(payment.chain).startsWith('solana') ? 'solana' : 'ethereum', findings, ratiosPct };
}

const SHAPES = [
  [/0x[0-9a-fA-F]{40}/, 'an Ethereum address'],
  [/[1-9A-HJ-NP-Za-km-z]{32,44}/, 'a Solana address'],
  [/\b[a-z0-9_-]{2,}\.(near|testnet)\b/i, 'a NEAR account id'],
  [/[0-9a-fA-F]{64}/, 'a 64-character hex value'],
];

/** Throws if the payload contains any listed secret (case-insensitive) or anything shaped like an address or account id. */
export function assertNoLeak(payload, secrets = []) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const lower = text.toLowerCase();
  for (const s of secrets) {
    const t = String(s);
    if (t.length < 3 || (/^\d+$/.test(t) && t.length < 6)) continue;
    if (lower.includes(t.toLowerCase())) throw new Error(`the message contains "${t}"`);
  }
  for (const [re, name] of SHAPES) if (re.test(text)) throw new Error(`the message contains something shaped like ${name}`);
  return true;
}

/** Every identifying string in a request: what the guard must make sure never reaches the model. */
export function collectSecrets(payment, context = {}) {
  const out = new Set();
  const add = (v) => { if (typeof v === 'string' && v) out.add(v); else if (typeof v === 'number') out.add(String(v)); };
  add(payment.obligationId); add(payment.payee); add(payment.amount);
  if (context.person) { add(context.person); for (const w of String(context.person).split(/\s+/)) if (w.length >= 3) add(w); }
  for (const [name, h] of Object.entries(context.history || {})) { add(name); add(h?.address); add(h?.amount); for (const w of name.split(/\s+/)) if (w.length >= 3) add(w); }
  for (const p of context.policy?.payees || []) { add(p.address); add(p.max_amount); add(p.max_total); }
  for (const [k, v] of Object.entries(context.spent || {})) { add(k.split(':').slice(1).join(':')); add(v); }
  for (const o of context.usedObligations || []) add(o);
  return [...out];
}

const SYSTEM = 'You explain the result of a payment pre-flight check to a payroll operator in plain words. You are given check codes and rounded ratios only. Reply with at most three short sentences. You cannot approve, block, or change anything, and you must not guess names or addresses.';

/**
 * Explain a pre-flight result. Returns { used, advisoryOnly: true, text, result, ... }. `result` is the pre-flight result, untouched.
 * When the advisory is off, redaction is refused, or the advisor fails, `used` is false and `text` is the deterministic wording.
 */
export async function explainPreflight({ payment, result, context = {}, advisor = null, enabled = false, redact = redactForAdvisor }) {
  const fallback = (reason) => ({ used: false, advisoryOnly: true, reason, text: deterministicText(result), result });
  if (!enabled || !advisor) return fallback('advisory is off');
  let sent;
  try {
    sent = redact({ payment, result, context });
    assertNoLeak(sent, collectSecrets(payment, context));
  } catch (e) { return fallback(`redaction guard refused: ${e.message}`); }
  let asked;
  try { asked = await advisor.ask({ system: SYSTEM, user: JSON.stringify(sent) }); } catch (e) { return fallback(`the advisor could not be used: ${e.message}`); }
  const text = String(asked?.plaintext ?? '').trim().slice(0, 600);
  if (!text) return fallback('the reply was empty');
  try { assertNoLeak(text, collectSecrets(payment, context)); } catch (e) { return fallback(`reply refused: ${e.message}`); }
  const rec = asked.record || {};
  return { used: true, advisoryOnly: true, text, sent, receipt: { model: rec.model, requestSha256: rec.requestSha256, responseSha256: rec.responseSha256, tcbStatus: rec.tcbStatus, modelPublicKey: rec.modelPublicKey }, result };
}
