#!/usr/bin/env node
/**
 * Collect every recorded NEAR testnet transaction from the verified lab runs (docs/lab-runs) and the end-to-end evidence
 * (docs/canonical/testnet-evidence.json) into site/data/proof.json, for the site's proof grid. Every entry is a real
 * transaction hash that NearBlocks will show. Re-run after promoting new runs:  node scripts/build-site-data.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyRunDir } from '../lab/core/recorder.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const kindOf = (label = '', ok) => {
  const l = label.toLowerCase();
  if (!ok) return 'rejected';
  if (/hatch_out|exit|rescue/.test(l)) return 'exit';
  if (/settle/.test(l)) return 'settled';
  if (/deposit/.test(l)) return 'deposit';
  if (/hatch/.test(l)) return 'hatch';
  return 'other';
};
const out = new Map();
const runsDir = path.join(root, 'docs/lab-runs');
for (const run of fs.readdirSync(runsDir).sort()) {
  const dir = path.join(runsDir, run);
  if (!verifyRunDir(dir).ok) { console.warn(`skipping ${run}: log does not verify`); continue; }
  for (const line of fs.readFileSync(path.join(dir, 'events.jsonl'), 'utf8').split('\n').filter(Boolean)) {
    const e = JSON.parse(line);
    if (e.type !== 'evidence' || !e.hash || !/^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(e.hash)) continue;
    if (e.kind !== 'tx' && e.kind !== 'exit') continue;
    const ok = e.ok !== false;
    out.set(e.hash, { hash: e.hash, label: e.label || e.kind, ok, kind: kindOf(e.label, ok), exp: e.exp, run, error: ok ? null : String(e.error || '').replace(/\s+/g, ' ').slice(0, 140) });
  }
}
try {
  const ev = JSON.parse(fs.readFileSync(path.join(root, 'docs/canonical/testnet-evidence.json'), 'utf8'));
  for (const t of ev.transactions || []) {
    if (!t.txHash) continue;
    const attack = String(t.action).startsWith('attack_rejected');
    out.set(t.txHash, { hash: t.txHash, label: t.action, ok: !attack, kind: attack ? 'rejected' : kindOf(t.action, true), exp: 'testnet-e2e', run: ev.timestamp, error: attack ? 'rejected by the contract' : null });
  }
} catch { /* no e2e evidence */ }
const list = [...out.values()];
// The Security demo: the attempts an injected agent made with its function-call key, from the newest verified run.
let security = null;
for (const run of fs.readdirSync(runsDir).sort().reverse()) {
  const dir = path.join(runsDir, run);
  const events = fs.readFileSync(path.join(dir, 'events.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const attempts = events.filter((e) => e.type === 'evidence' && e.exp === 'E-SECURITY-FCKEY-01' && e.kind === 'attack');
  if (!attempts.length || !verifyRunDir(dir).ok) continue;
  const exit = events.find((e) => e.type === 'evidence' && e.exp === 'E-SECURITY-FCKEY-01' && e.kind === 'exit' && e.ok);
  security = { run, attempts: attempts.slice(0, 9).map((e) => ({ label: e.label, refusedBy: /panicked/.test(e.error || '') ? 'contract' : 'key', error: String(e.error || '').split(':').pop().trim().replace(/\s+/g, ' ').slice(0, 80) })), exit: exit ? { hash: exit.hash || null } : null };
  break;
}
const counts = list.reduce((a, t) => { a[t.kind] = (a[t.kind] || 0) + 1; return a; }, {});
fs.writeFileSync(path.join(root, 'site/data/proof.json'), JSON.stringify({ generatedAt: new Date().toISOString(), contract: 'c.fly-1793636729.testnet', counts, security, transactions: list }, null, 1));
console.log(`site/data/proof.json: ${list.length} transactions`, counts);
