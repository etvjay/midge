import crypto from 'node:crypto';
import { fetchVerifiedModelKey } from '../enclave/attestation.js';
import { generateClientKey, sealToModel, openFromModel } from '../enclave/e2ee.js';
import { verifyEd25519 } from '../enclave/model-sealed-roost.js';
import { computeAllocationsHash } from '../roost-service/hosted-roost.js';

/**
 * An advisor that asks an attested NEAR AI Cloud model for a decision and keeps a record anyone can check.
 *
 * Where it sits. The Roost keeps the keys and enforces the bounds: it signs an allocation only if it fits the sealed bids it
 * aggregated, and the contract pays only recipients in the release policy. The advisor adds a decision-maker on top: it proposes
 * how to split a total among recipients. Its output is advice. It is validated here, bounded again by the Roost, and bounded
 * a third time by the contract, so a wrong or manipulated model can make a bad split but not a larger payout or a payout to
 * someone outside the policy.
 *
 * What the model sees. Only what the caller puts in the prompt: a total, recipient ids and weights. Never the sealed bids.
 *
 * The record. Everything needed to check the answer afterwards without trusting the operator: the exact request and response
 * the gateway saw (hashes and the response body), the model's own signature over them, the key it signed with and the
 * attestation that key came from, and the single-use client key that decrypts the response. verifyAdviceRecord() redoes the
 * checks and compares the decrypted allocations with an on-chain allocations hash.
 */
export class AdvisorError extends Error {}

const sha256Hex = (s) => crypto.createHash('sha256').update(s).digest('hex');
const hex = (u) => Buffer.from(u).toString('hex');
const MICRO = 1_000_000n; // exact decimal arithmetic in millionths of a NEAR; amounts on chain are yocto = micro * 1e18
const YOCTO_PER_MICRO = 10n ** 18n;

export function parseMicro(s) {
  if (typeof s !== 'string' || !/^\d+(\.\d{1,6})?$/.test(s)) throw new AdvisorError(`'${s}' is not a decimal NEAR amount with at most 6 decimals`);
  const [w, f = ''] = s.split('.');
  return BigInt(w) * MICRO + BigInt(f.padEnd(6, '0'));
}
export const formatMicro = (m) => `${m / MICRO}.${String(m % MICRO).padStart(6, '0')}`;
export const microToYocto = (m) => String(m * YOCTO_PER_MICRO);

/** The split the rule asks for, computed exactly: each share floored to a millionth. The model's answer is checked against it. */
export function proportionalSplit(totalMicro, recipients) {
  const sumW = recipients.reduce((a, r) => a + BigInt(r.weight), 0n);
  return recipients.map((r) => ({ recipient: r.id, micro: (totalMicro * BigInt(r.weight)) / sumW }));
}

/** Strict check of a proposal. Returns { ok, problems, allocations } where allocations are in the contract's shape (yocto strings). */
export function validateProposal(parsed, { totalMicro, recipients }) {
  const problems = [];
  const allowed = new Set(recipients.map((r) => r.id));
  const rows = parsed && Array.isArray(parsed.allocations) ? parsed.allocations : null;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) problems.push('the reply is not a JSON object');
  else if (!rows) problems.push('the reply has no allocations array');
  else if (Object.keys(parsed).some((k) => k !== 'allocations')) problems.push(`the reply has fields other than allocations: ${Object.keys(parsed).filter((k) => k !== 'allocations').join(', ')}`);
  const out = []; const seen = new Set(); let sum = 0n;
  for (const row of rows || []) {
    if (!row || typeof row !== 'object' || Object.keys(row).some((k) => !['recipient', 'amount'].includes(k))) { problems.push('an allocation has fields other than recipient and amount'); continue; }
    if (!allowed.has(row.recipient)) { problems.push(`recipient '${row.recipient}' is not one of the listed recipients`); continue; }
    if (seen.has(row.recipient)) { problems.push(`recipient '${row.recipient}' appears twice`); continue; }
    seen.add(row.recipient);
    let m; try { m = parseMicro(row.amount); } catch (e) { problems.push(e.message); continue; }
    if (m <= 0n) { problems.push(`amount for '${row.recipient}' is not positive`); continue; }
    sum += m; out.push({ recipient: row.recipient, amount: microToYocto(m) });
  }
  if (sum > totalMicro) problems.push(`the amounts sum to ${formatMicro(sum)}, more than the total ${formatMicro(totalMicro)}`);
  if (rows && rows.length === 0) problems.push('the allocations array is empty');
  return { ok: problems.length === 0, problems, allocations: problems.length === 0 ? out : [], sumMicro: sum };
}

export class AttestedAdvisor {
  #apiKey; #fetch;
  constructor({ apiKey = process.env.NEARAI_API_KEY, model = 'Qwen/Qwen3.6-35B-A3B-FP8', baseUrl = 'https://cloud-api.near.ai', chain = 'required', acceptedTcb = ['UpToDate'], maxTokens = 1500, fetchImpl = globalThis.fetch } = {}) {
    if (!apiKey) throw new AdvisorError('AttestedAdvisor needs a NEAR AI Cloud API key (NEARAI_API_KEY)');
    this.#apiKey = apiKey; this.#fetch = fetchImpl;
    Object.assign(this, { model, baseUrl: baseUrl.replace(/\/$/, ''), chain, acceptedTcb, maxTokens });
  }

  /** One sealed question, one sealed answer, one signed receipt. Fails closed on anything unexpected. */
  async ask({ system, user }) {
    const att = await fetchVerifiedModelKey({ baseUrl: this.baseUrl, model: this.model, apiKey: this.#apiKey, chain: this.chain, acceptedTcb: this.acceptedTcb, fetchImpl: this.#fetch });
    const client = generateClientKey();
    const body = JSON.stringify({ model: this.model, stream: false, temperature: 0, max_tokens: this.maxTokens, messages: [{ role: 'system', content: sealToModel(system, att.publicKey) }, { role: 'user', content: sealToModel(user, att.publicKey) }] });
    const res = await this.#fetch(`${this.baseUrl}/v1/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${this.#apiKey}`, 'Content-Type': 'application/json', 'Accept-Encoding': 'identity', 'X-Signing-Algo': 'ed25519', 'X-Client-Pub-Key': client.publicKeyHex, 'X-Model-Pub-Key': att.publicKey, 'X-Encryption-Version': '2', 'x-no-aliasing': 'true' }, body });
    const responseText = await res.text();
    if (!res.ok) throw new AdvisorError(`gateway answered ${res.status}`);
    const json = JSON.parse(responseText); const choice = json.choices && json.choices[0];
    if (choice && choice.finish_reason === 'length') throw new AdvisorError('the model reply was cut off by the token budget');
    if (!choice || !choice.message || !choice.message.content) throw new AdvisorError('the model reply had no content');
    let plaintext;
    try { plaintext = openFromModel(choice.message.content, client.secretX25519); } catch { throw new AdvisorError('the model reply could not be decrypted with our client key (plaintext or tampered)'); }
    const requestSha256 = sha256Hex(body); const responseSha256 = sha256Hex(responseText);
    const sigRes = await this.#fetch(`${this.baseUrl}/v1/signature/${encodeURIComponent(json.id)}?model=${encodeURIComponent(this.model)}&signing_algo=ed25519`, { headers: { Authorization: `Bearer ${this.#apiKey}` } });
    if (!sigRes.ok) throw new AdvisorError(`signature endpoint answered ${sigRes.status}`);
    const signature = await sigRes.json();
    const record = {
      version: 1, model: this.model, modelPublicKey: att.publicKey, tcbStatus: att.tcbStatus, attestationNonce: att.nonce,
      attestationChecks: att.checks.map((c) => ({ name: c.name, ok: c.ok })),
      requestSha256, responseSha256, responseId: json.id, responseText, clientSecretHex: hex(client.secretX25519),
      signature: { text: signature.text, signature: signature.signature, signing_address: signature.signing_address, kind: signature.signature_kind },
      plaintext,
    };
    const checks = checkReceipt(record);
    if (!checks.ok) throw new AdvisorError(`the model's receipt did not verify: ${checks.checks.filter((c) => !c.ok).map((c) => c.name).join('; ')}`);
    return { plaintext, record };
  }

  /** Ask for a split of `totalNear` among recipients by weight. The caller decides what to do with an invalid or off-rule answer. */
  async proposeAllocation({ totalNear, recipients }) {
    const totalMicro = parseMicro(totalNear);
    const system = 'You split an amount of NEAR among recipients in proportion to integer weights. Reply with a JSON object and nothing else: {"allocations":[{"recipient":"<id exactly as listed>","amount":"<decimal NEAR, at most 6 decimals>"}]}. Floor each share down to 6 decimals. Include every listed recipient once. Never include a recipient that is not listed. The amounts must add up to no more than the total.';
    const user = `Total: ${formatMicro(totalMicro)} NEAR\nRecipients (id, weight):\n${recipients.map((r) => `${r.id}, ${r.weight}`).join('\n')}`;
    const { plaintext, record } = await this.ask({ system, user });
    let parsed = null; try { parsed = JSON.parse(plaintext.trim()); } catch { /* validateProposal reports it */ }
    const validation = validateProposal(parsed, { totalMicro, recipients });
    const rule = proportionalSplit(totalMicro, recipients);
    const sameAsRule = validation.ok && rule.every((r) => validation.allocations.find((a) => a.recipient === r.recipient)?.amount === microToYocto(r.micro)) && validation.allocations.length === rule.length;
    return { validation, sameAsRule, rule, record, total: { micro: String(totalMicro) }, recipients };
  }
}

/** The receipt checks that need no network: hashes, the model's signature over them, and the signer being the attested key. */
export function checkReceipt(record) {
  const checks = [];
  const add = (name, ok) => checks.push({ name, ok: Boolean(ok) });
  add('the stored response body hashes to the recorded response hash', sha256Hex(record.responseText) === record.responseSha256);
  const expected = `${record.model}:${record.requestSha256}:${record.responseSha256}`;
  add('the signed text binds this model, this request hash and this response hash', record.signature?.text === expected);
  add('the signature is a provider_tee signature', record.signature?.kind === 'provider_tee');
  const signer = String(record.signature?.signing_address || '').replace(/^0x/i, '').toLowerCase();
  add('the signer is the attested model key', signer === record.modelPublicKey);
  let verifies = false; try { verifies = verifyEd25519(expected, record.signature.signature, record.modelPublicKey); } catch { verifies = false; }
  add('the model\'s signature verifies', verifies);
  return { ok: checks.every((c) => c.ok), checks };
}

/**
 * Verify a stored advice record on its own, then against the chain. Network is used only if `freshAttestation` is given.
 *  - receipt checks (above)
 *  - decrypting the stored response with the recorded single-use key gives the recorded plaintext
 *  - the allocations in that plaintext hash to the on-chain allocations hash
 *  - optionally: a fresh attestation yields the same model key
 */
export async function verifyAdviceRecord(record, { onChainAllocationsHash, freshAttestation = null }) {
  const out = checkReceipt(record); const add = (name, ok, detail) => out.checks.push({ name, ok: Boolean(ok), ...(detail ? { detail } : {}) });
  let plain = null;
  try { plain = openFromModel(JSON.parse(record.responseText).choices[0].message.content, Uint8Array.from(Buffer.from(record.clientSecretHex, 'hex'))); } catch { /* reported below */ }
  add('decrypting the stored response with the recorded key gives the recorded plaintext', plain !== null && plain === record.plaintext);
  let hash = null;
  try { const rows = JSON.parse(plain).allocations.map((a) => ({ recipient: a.recipient, amount: microToYocto(parseMicro(a.amount)) })); hash = computeAllocationsHash(rows); } catch { /* reported below */ }
  add('the allocations in the attested response hash to the allocations hash on chain', hash !== null && hash === onChainAllocationsHash, hash ? { fromResponse: hash, onChain: onChainAllocationsHash } : undefined);
  if (freshAttestation) {
    let key = null; try { key = (await freshAttestation()).publicKey; } catch { /* reported below */ }
    add('a fresh attestation of the model returns the same key', key === record.modelPublicKey);
  }
  out.ok = out.checks.every((c) => c.ok);
  return out;
}

/**
 * Decide what to settle. A valid proposal that also matches the stated rule is used as the model's. Anything else (invalid,
 * or valid but off the rule when requireRule is set) falls back to the exact rule, and says why. The fallback is computed
 * here, not by the model, so an unreachable or misbehaving model delays nothing and costs nothing.
 */
export function chooseAllocations(proposal, { requireRule = true } = {}) {
  if (proposal && proposal.validation.ok && (!requireRule || proposal.sameAsRule)) return { source: 'model', allocations: proposal.validation.allocations, reason: null };
  const why = !proposal ? 'no proposal' : !proposal.validation.ok ? `invalid proposal: ${proposal.validation.problems.join('; ')}` : 'the proposal is valid but not the split the rule gives';
  const total = proposal ? BigInt(proposal.total.micro) : 0n;
  const rule = proposal ? proposal.rule : [];
  return { source: 'fallback', allocations: rule.filter((r) => r.micro > 0n).map((r) => ({ recipient: r.recipient, amount: microToYocto(r.micro) })), reason: why, totalMicro: String(total) };
}
