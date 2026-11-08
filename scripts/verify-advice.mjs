#!/usr/bin/env node
/**
 * Verify an attested-advisor record without trusting whoever produced it.
 *
 *   node scripts/verify-advice.mjs <lab run directory | record.json> [--fresh]
 *
 * For each stored advice record it checks: the response body matches its recorded hash; the model's own signature binds
 * that exact request and response to the model's key; the signer is the key the attestation reported; decrypting the stored
 * response with the recorded single-use client key gives the recorded answer; and the allocations in that answer hash to the
 * allocations hash the CONTRACT logged for the settlement (see the explorer link in the record). With --fresh it also asks
 * the model for a new attestation and checks the key is the same (needs network and NEARAI_API_KEY).
 * Exit code 0 only if every check of every record passes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { verifyAdviceRecord } from '../src/advisor/attested-advisor.js';
import { fetchVerifiedModelKey } from '../src/enclave/attestation.js';

const [target, ...rest] = process.argv.slice(2);
if (!target) { console.error('usage: node scripts/verify-advice.mjs <run directory | record.json> [--fresh]'); process.exit(2); }
const fresh = rest.includes('--fresh');

function loadRecords(p) {
  const st = fs.statSync(p);
  if (st.isDirectory()) {
    const lines = fs.readFileSync(path.join(p, 'events.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    return lines.filter((e) => e.type === 'evidence' && e.kind === 'advice-record').map((e) => ({ record: e.record, onChainAllocationsHash: e.onChainAllocationsHash, explorer: e.explorer, contract: e.contract }));
  }
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  return Array.isArray(j) ? j : [j];
}

const records = loadRecords(target);
if (!records.length) { console.error('no advice records found'); process.exit(1); }
let bad = 0;
for (const [i, r] of records.entries()) {
  console.log(`\nadvice record ${i + 1}: model ${r.record.model}, signer ${r.record.signature.signing_address.slice(0, 16)}…`);
  if (r.explorer) console.log(`  settlement: ${r.explorer} on ${r.contract}`);
  const rep = await verifyAdviceRecord(r.record, {
    onChainAllocationsHash: r.onChainAllocationsHash,
    freshAttestation: fresh ? () => fetchVerifiedModelKey({ model: r.record.model, apiKey: process.env.NEARAI_API_KEY, chain: 'required' }) : null,
  });
  for (const c of rep.checks) { console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}`); if (!c.ok) bad += 1; }
}
console.log(bad ? `\n${bad} check(s) FAILED: do not trust this record.`
  : fresh ? `\nALL CHECKS PASSED for ${records.length} record(s). The allocations paid on chain are the answer of the model key a fresh attestation just vouched for.`
  : `\nThe record is internally consistent (${records.length} record(s)), but WITHOUT --fresh nothing ties its model key to a real attestation: a producer could have signed it with a key of their own. Run again with --fresh to check the key.`);
process.exit(bad ? 1 : 0);
