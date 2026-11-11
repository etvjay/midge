#!/usr/bin/env node
/**
 * Delete forgotten Phala VMs. The dead-man's switch that every session arms is a detached local process: if this machine reboots, it dies and
 * the VM keeps billing. This is the second line: run it on a schedule (cron, every 30 minutes is enough) and it deletes any midge-* VM older
 * than the limit. Dry run by default; pass --yes to delete. It never touches a VM whose name does not start with "midge-", and it leaves alone
 * (and reports) any VM whose age it cannot read.
 *   node scripts/phala-reaper.mjs [--max-age-hours 2] [--prefix midge-] [--name <exact VM name>] [--yes]
 * --name limits the run to that one VM by its exact name, which makes a deletion test bounded.
 * Needs PHALA_CLOUD_API_KEY in .env or the environment. Never prints it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const findCreated = (o) => {
  if (!o || typeof o !== 'object') return null;
  for (const [k, v] of Object.entries(o)) {
    if (/created/i.test(k) && (typeof v === 'string' || typeof v === 'number')) { const t = Date.parse(v); if (Number.isFinite(t)) return t; }
    const inner = findCreated(v); if (inner) return inner;
  }
  return null;
};

/** Hours a VM has been up, from the `uptime` string the real listing gives ("47s", "95m", "3h 5m", "2d 1h"), or null if it cannot be read. */
export function uptimeHours(uptime) {
  if (typeof uptime !== 'string') return null;
  const parts = [...uptime.matchAll(/(\d+)\s*([dhms])/g)];
  if (parts.length === 0 || parts.map((m) => m[0]).join('').replace(/\s/g, '') !== uptime.replace(/\s/g, '')) return null;
  const secs = { d: 86400, h: 3600, m: 60, s: 1 };
  return parts.reduce((t, m) => t + Number(m[1]) * secs[m[2]], 0) / 3600;
}

/** Pure: split a CVM listing into those to delete, those to keep, those not ours and those whose age is unknown. */
export function selectToReap(cvms, { now = Date.now(), maxAgeHours = 2, prefix = 'midge-', onlyName = null } = {}) {
  const out = { reap: [], keep: [], foreign: [], unknownAge: [] };
  for (const c of cvms) {
    const name = String(c.cvmName ?? c.name ?? '');
    if (!name.startsWith(prefix) || (onlyName !== null && name !== onlyName)) { out.foreign.push(c); continue; }
    let hours = uptimeHours(c.uptime);
    if (hours === null) { const created = findCreated(c); if (created !== null) hours = (now - created) / 3600000; }
    if (hours === null) { out.unknownAge.push(c); continue; }
    (hours > maxAgeHours ? out.reap : out.keep).push(c);
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(process.argv[1]), '..');
  const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };
  const yes = process.argv.includes('--yes');
  const env = { ...process.env };
  if (!env.PHALA_CLOUD_API_KEY) { try { const m = fs.readFileSync(path.join(root, '.env'), 'utf8').match(/^PHALA_CLOUD_API_KEY=(.*)$/m); if (m) env.PHALA_CLOUD_API_KEY = m[1].trim().replace(/^["']|["']$/g, ''); } catch { /* no .env */ } }
  if (!env.PHALA_CLOUD_API_KEY) { console.error('PHALA_CLOUD_API_KEY is not set'); process.exit(2); }
  const phala = (args) => spawnSync('npx', ['--yes', 'phala@1.2.0', ...args], { env, encoding: 'utf8', timeout: 120000 });
  const listed = phala(['cvms', 'list', '-j']);
  const text = listed.stdout || '';
  const items = JSON.parse(text.slice(text.indexOf('{'))).items || [];
  // The list records do not carry the VM's age; the detail record does (created_at). Fetch it for any VM whose age the list does not give.
  for (const c of items) {
    if (findCreated(c) !== null) continue;
    if (uptimeHours(c.uptime) !== null) continue;
    const id = c.appId ?? c.app_id ?? c.id ?? c.cvmId;
    if (!id) continue;
    const d = phala(['cvms', 'get', String(id), '-j']);
    try { c.detail = JSON.parse((d.stdout || '').slice((d.stdout || '').indexOf('{'))); } catch { /* left with unknown age, and left alone */ }
  }
  const sel = selectToReap(items, { maxAgeHours: Number(arg('max-age-hours', 2)), prefix: arg('prefix', 'midge-'), onlyName: arg('name', null) });
  console.log(`${items.length} VM(s): ${sel.reap.length} to delete, ${sel.keep.length} young, ${sel.foreign.length} not ours, ${sel.unknownAge.length} of unknown age`);
  for (const c of sel.unknownAge) console.log(`  unknown age, left alone: ${c.cvmName ?? c.name}`);
  for (const c of sel.reap) {
    const id = c.appId ?? c.app_id ?? c.id ?? c.cvmId;
    if (!yes) { console.log(`  would delete ${c.cvmName ?? c.name} (${id}); pass --yes`); continue; }
    const r = phala(['cvms', 'delete', String(id), '--yes']);
    console.log(`  ${r.status === 0 ? 'deleted' : 'FAILED to delete'} ${c.cvmName ?? c.name} (${id})`);
  }
}
