#!/usr/bin/env node
/** node lab/verify-run.js <run dir>: re-check a run's hash chain, sequence, closing commitment and blob references. */
import fs from 'node:fs';
import path from 'node:path';
import { verifyRunDir } from './core/recorder.js';
import { auditRun } from './core/audit.js';

const dir = process.argv[2];
if (!dir) { console.error('usage: verify-run.js <run dir>'); process.exit(2); }
const r = verifyRunDir(dir);
let summaryOk = true;
try {
  const s = JSON.parse(fs.readFileSync(path.join(dir, 'summary.json'), 'utf8'));
  if (s.rootHash !== r.rootHash) { summaryOk = false; r.problems.push('summary.json root hash does not match the log'); }
} catch { r.problems.push('summary.json is missing'); summaryOk = false; }
const audit = auditRun(dir);
for (const m of audit.mismatches) r.problems.push(`audit: ${m}`);
console.log(`${r.ok && summaryOk && !audit.mismatches.length ? '✓ INTACT' : '✗ TAMPERED, INCOMPLETE OR INCONSISTENT'}: ${r.events} events, root ${r.rootHash}`);
for (const p of r.problems) console.log(`  - ${p}`);
console.log('  verdicts re-derived from the raw events:', JSON.stringify(audit.verdicts));
process.exit(r.ok && summaryOk && !audit.mismatches.length ? 0 : 1);
