#!/usr/bin/env node
// Fails if any tracked file is larger than a limit (1 MiB by default), so a stray build output, video or dump cannot slip into the repository.
// Usage: node scripts/check-large-files.mjs [--limit <bytes>] [--root <dir>]. It reads the file list from `git ls-files`.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export function largeFiles({ root = process.cwd(), limit = 1024 * 1024 } = {}) {
  const listed = execFileSync('git', ['ls-files', '-z'], { cwd: root, maxBuffer: 1 << 28 }).toString('utf8').split('\0').filter(Boolean);
  const over = [];
  for (const rel of listed) {
    let st;
    try { st = fs.statSync(path.join(root, rel)); } catch { continue; } // deleted in the working tree
    if (st.isFile() && st.size > limit) over.push({ file: rel, bytes: st.size });
  }
  return over.sort((a, b) => b.bytes - a.bytes);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
  const limit = Number(arg('--limit', 1024 * 1024));
  const root = arg('--root', process.cwd());
  const over = largeFiles({ root, limit });
  if (over.length) {
    console.error(`Tracked files over ${limit} bytes:`);
    for (const o of over) console.error(`  ${o.bytes}  ${o.file}`);
    process.exit(1);
  }
  console.log(`No tracked file is over ${limit} bytes.`);
}
