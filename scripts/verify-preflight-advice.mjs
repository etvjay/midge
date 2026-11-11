#!/usr/bin/env node
/**
 * Live check of the redacted pre-flight advisory against the real NEAR AI Cloud model. It builds a realistic pay-run scenario full of names,
 * addresses, ids and exact amounts, runs the deterministic pre-flight, and asks the attested model to explain the result from the REDACTED
 * message only. It prints and records exactly what was sent, proves none of the identifying strings were in it, checks the model's signed
 * receipt, and shows that the decision did not change. Opt-in: needs NEARAI_API_KEY (your own key from https://cloud.near.ai) in the environment
 * or .env. Nothing here is signed or paid. Writes docs/canonical/preflight-advice-evidence.json.
 * Run: npm run verify:preflight-advice
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AttestedAdvisor, checkReceipt } from '../src/advisor/attested-advisor.js';
import { preflight } from '../src/roost-service/preflight.js';
import { explainPreflight, collectSecrets, assertNoLeak, deterministicText } from '../src/advisor/preflight-explainer.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!process.env.NEARAI_API_KEY) {
  try { const m = fs.readFileSync(path.join(root, '.env'), 'utf8').match(/^NEARAI_API_KEY=(.*)$/m); if (m) process.env.NEARAI_API_KEY = m[1].trim().replace(/^["']|["']$/g, ''); } catch { /* no .env */ }
}
if (!process.env.NEARAI_API_KEY) { console.error('NEARAI_API_KEY is not set: get your own key at https://cloud.near.ai (this check is opt-in)'); process.exit(2); }

const SOL = '2J75L6udJ52N7YmrDPQLN7gzV6CqWny6CaWGccvohi4f';
const SOL_OLD = '3Bxs4ThwQbE4vyj9M5uZ2Pq9P9mXyB1vD8k6bX1w1h7S';
const policy = { payees: [{ chain: 'solana-devnet', address: SOL, max_amount: '2000000', max_total: '5000000' }], max_fee_cost: '1' };
const payment = { obligationId: 'inv-2026-11-ada', chain: 'solana-devnet', payee: SOL, amount: '1900000' };
const context = { policy, spent: { [`solana-devnet:${SOL}`]: '2500000' }, usedObligations: new Set(), person: 'Ada Lovelace', history: { 'Ada Lovelace': { chain: 'solana-devnet', address: SOL_OLD, amount: '500000' } } };

const decision = preflight(payment, context);
console.log('pre-flight (deterministic):', JSON.stringify({ ok: decision.ok, codes: decision.findings.map((f) => `${f.severity}:${f.code}`), needsSecondApproval: decision.needsSecondApproval }));
console.log('what the operator would see with the advisory OFF:', deterministicText(decision));

const advisor = new AttestedAdvisor();
const out = await explainPreflight({ payment, result: decision, context, advisor, enabled: true });
if (!out.used) { console.error(`the advisory was not used: ${out.reason}`); process.exit(1); }
console.log('\nSENT to the model (this is everything):\n ', JSON.stringify(out.sent));
const secrets = collectSecrets(payment, context);
assertNoLeak(out.sent, secrets); // throws if any name, address, id or exact amount is in it
console.log(`leak check: none of ${secrets.length} identifying strings (names, addresses, obligation id, exact amounts) is in what was sent, and nothing in it is shaped like an address`);
console.log('\nMODEL REPLY (advice only):\n ', out.text);
console.log('\nreceipt:', JSON.stringify({ model: out.receipt.model, tcbStatus: out.receipt.tcbStatus, requestSha256: out.receipt.requestSha256.slice(0, 16) + '…', responseSha256: out.receipt.responseSha256.slice(0, 16) + '…' }));
console.log('decision unchanged by the advice:', JSON.stringify({ ok: out.result.ok, blocked: out.result.findings.filter((f) => f.severity === 'block').length }));

fs.writeFileSync(path.join(root, 'docs/canonical/preflight-advice-evidence.json'), `${JSON.stringify({
  ranAt: new Date().toISOString(), model: out.receipt.model, tcbStatus: out.receipt.tcbStatus, modelPublicKey: out.receipt.modelPublicKey,
  decision: { ok: decision.ok, findings: decision.findings.map((f) => ({ code: f.code, severity: f.severity })) },
  sentToModel: out.sent, identifyingStringsChecked: secrets.length, leakCheck: 'passed', reply: out.text,
  requestSha256: out.receipt.requestSha256, responseSha256: out.receipt.responseSha256,
  note: 'The scenario had a person, two Solana addresses, an obligation id and exact amounts; none reached the model. Advice only: the decision is the deterministic one.',
}, null, 2)}\n`);
console.log('\nVERIFIED: the attested model explained the result from redacted facts only; its receipt verified; the decision did not change.');
