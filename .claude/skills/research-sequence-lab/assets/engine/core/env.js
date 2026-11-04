import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const sh = (cmd, args, cwd) => { try { return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 }).trim(); } catch { return null; } };
const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };

/** Optional static settings: lab/lab.config.json (see lab.config.example.json). Missing file means defaults. */
export function loadConfig(rootDir) {
  return readJson(path.join(rootDir, 'lab', 'lab.config.json')) || {};
}

/** What a reader needs to reproduce or distrust a run: code version, toolchain, pinned artefacts. */
export function captureEnv(rootDir) {
  const cfg = loadConfig(rootDir);
  const pkg = readJson(path.join(rootDir, 'package.json')) || {};
  const versionOf = (name) => readJson(path.join(rootDir, 'node_modules', name, 'package.json'))?.version ?? null;
  const dirty = sh('git', ['status', '--porcelain'], rootDir);
  return {
    project: pkg.name || path.basename(rootDir), projectVersion: pkg.version || null,
    git: { commit: sh('git', ['rev-parse', 'HEAD'], rootDir), branch: sh('git', ['rev-parse', '--abbrev-ref', 'HEAD'], rootDir), dirtyFiles: dirty ? dirty.split('\n').length : 0, remote: sh('git', ['config', '--get', 'remote.origin.url'], rootDir) },
    runtime: { node: process.version, platform: `${os.platform()} ${os.release()}`, arch: os.arch(), cpus: os.cpus().length },
    tools: Object.fromEntries((cfg.tools || []).map((t) => [t.name, sh(t.cmd, t.args || ['--version'])])),
    dependencies: Object.fromEntries((cfg.trackDependencies || []).map((n) => [n, versionOf(n)])),
    // Pinned artefacts (image digests, expected hashes) that a run depends on, copied from the files named in config.
    pins: Object.fromEntries((cfg.pinFiles || []).map((f) => [f, readJson(path.join(rootDir, f))])),
    note: 'No secret values are recorded here.',
  };
}

/**
 * What this machine can do right now, so an experiment can be skipped for a stated reason, not silently.
 * Define your own in lab/capabilities.js: export default async (rootDir) => ({ 'api-key': true, network: false }).
 * An experiment's `requires: ['api-key']` is checked against this map.
 */
export async function probeCapabilities(rootDir) {
  const caps = { 'git': Boolean(sh('git', ['--version'])) };
  try {
    const mod = await import(pathToFileURL(path.join(rootDir, 'lab', 'capabilities.js')).href);
    Object.assign(caps, await mod.default(rootDir));
  } catch (err) { if (err.code !== 'ERR_MODULE_NOT_FOUND') caps['capabilities.js failed'] = false; }
  return caps;
}
