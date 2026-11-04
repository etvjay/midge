#!/usr/bin/env node
/**
 * node lab/promote.js <run dir> [label]
 * Copies a verified, redacted run into docs/lab-runs/<run id>/ so it can be committed as evidence.
 * Refuses a run whose log fails its own integrity check or whose audit disagrees with the runner.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyRunDir } from './core/recorder.js';
import { auditRun } from './core/audit.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = process.argv[2];
if (!dir) { console.error('usage: promote.js <run dir>'); process.exit(2); }
const v = verifyRunDir(dir); const a = auditRun(dir);
if (!v.ok || a.mismatches.length) { console.error('refusing to promote a run that is not intact and consistent', v.problems, a.mismatches); process.exit(1); }
const dest = path.join(here, '..', 'docs', 'lab-runs', path.basename(path.resolve(dir)));
fs.cpSync(dir, dest, { recursive: true });
console.log(`promoted to ${path.relative(process.cwd(), dest)} (root ${v.rootHash.slice(0, 16)}…, verdicts ${JSON.stringify(a.verdicts)})`);
