import fs from 'node:fs';
import path from 'node:path';

/**
 * Secret redaction for run logs. Two layers:
 *  1. exact values: every secret we know about (.env values, state-dir keys) is replaced by [REDACTED:name]
 *  2. patterns: things that look like keys or tokens are replaced even if we did not know about them
 * Applied to every event before it is written and hashed, so a log can be published without review.
 */
const SECRET_ENV = /KEY|TOKEN|SECRET|PASSWORD|PRIVATE/i;
const PATTERNS = [
  [/ed25519:[1-9A-HJ-NP-Za-km-z]{80,}/g, 'ed25519-secret'],
  [/(github_pat_[A-Za-z0-9_]{20,}|gh[opsu]_[A-Za-z0-9]{30,})/g, 'github-token'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, 'pem-private-key'],
  [/\bsk-[A-Za-z0-9]{24,}\b/g, 'sk-key'],
  [/\bAKIA[0-9A-Z]{16}\b/g, 'aws-key-id'],
];

export function loadKnownSecrets(rootDir) {
  const found = new Map();
  const add = (name, value) => { if (value && value.length >= 12) found.set(value, name); };
  for (const file of [path.join(rootDir, '.env')]) {
    try {
      for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/);
        if (m && SECRET_ENV.test(m[1])) add(m[1], m[2].trim().replace(/^["']|["']$/g, ''));
      }
    } catch { /* no .env */ }
  }
  // Extra files that hold a secret value (one value per file), listed in lab/lab.config.json as "secretFiles": { "NAME": "/path" }.
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(rootDir, 'lab', 'lab.config.json'), 'utf8'));
    for (const [name, file] of Object.entries(cfg.secretFiles || {})) { try { add(name, fs.readFileSync(file.replace(/^~/, process.env.HOME || ''), 'utf8').trim()); } catch { /* absent */ } }
  } catch { /* no config */ }
  for (const [k, v] of Object.entries(process.env)) if (SECRET_ENV.test(k)) add(k, v);
  return found;
}

export function makeRedactor(secrets) {
  const entries = [...secrets.entries()].sort((a, b) => b[0].length - a[0].length);
  const redactString = (s) => {
    let out = s;
    for (const [value, name] of entries) if (out.includes(value)) out = out.split(value).join(`[REDACTED:${name}]`);
    for (const [re, name] of PATTERNS) out = out.replace(re, `[REDACTED:${name}]`);
    return out;
  };
  const walk = (v) => {
    if (typeof v === 'string') return redactString(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return { redact: walk, count: entries.length };
}
