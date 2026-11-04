import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const sh = (cmd, args, cwd) => { try { return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 }).trim(); } catch { return null; } };

/** What a reader needs to reproduce or distrust a run: code version, toolchain, pinned artefacts, network. */
export function captureEnv(rootDir) {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const versionOf = (name) => { try { return JSON.parse(fs.readFileSync(path.join(rootDir, 'node_modules', name, 'package.json'), 'utf8')).version; } catch { return null; } };
  const expected = (() => { try { return JSON.parse(fs.readFileSync(path.join(rootDir, 'roost.expected.json'), 'utf8')); } catch { return {}; } })();
  const dirty = sh('git', ['status', '--porcelain'], rootDir);
  return {
    project: pkg.name, projectVersion: pkg.version,
    git: { commit: sh('git', ['rev-parse', 'HEAD'], rootDir), branch: sh('git', ['rev-parse', '--abbrev-ref', 'HEAD'], rootDir), dirtyFiles: dirty ? dirty.split('\n').length : 0, remote: sh('git', ['config', '--get', 'remote.origin.url'], rootDir) },
    runtime: { node: process.version, platform: `${os.platform()} ${os.release()}`, arch: os.arch(), cpus: os.cpus().length },
    tools: { docker: sh('docker', ['--version']), dcapQvl: sh('dcap-qvl', ['--version']) || (fs.existsSync(path.join(os.homedir(), '.cargo/bin/dcap-qvl')) ? 'installed' : null), cargo: sh('cargo', ['--version']) },
    dependencies: Object.fromEntries(['@noble/curves', '@noble/ciphers', '@noble/hashes', 'near-api-js', 'ethers'].map((n) => [n, versionOf(n)])),
    pins: { verifierImage: expected.verifierImage || null, composeHash: expected.composeHash || null, osImageHashes: expected.osImageHashes || null },
    network: { nearNetwork: process.env.NEAR_NETWORK || 'testnet' },
    note: 'No secret values are recorded here.',
  };
}

/** What this machine can do right now, so an experiment can be skipped for a stated reason, not silently. */
export async function probeCapabilities(rootDir) {
  const has = (name) => { try { return new RegExp(`^\\s*${name}\\s*=\\s*\\S`, 'm').test(fs.readFileSync(path.join(rootDir, '.env'), 'utf8')) || Boolean(process.env[name]); } catch { return Boolean(process.env[name]); } };
  const net = async () => { try { const r = await fetch('https://rpc.testnet.near.org/status', { signal: AbortSignal.timeout(8000) }); return r.ok; } catch { return false; } };
  return {
    network: await net(),
    docker: Boolean(sh('docker', ['info', '--format', '{{.ServerVersion}}'])),
    'near-key': has('NEAR_ACCOUNT_ID') && has('NEAR_PRIVATE_KEY'),
    'nearai-key': has('NEARAI_API_KEY'),
    'phala-key': has('PHALA_CLOUD_API_KEY'),
    'dcap-qvl': Boolean(sh('dcap-qvl', ['--help'])) || fs.existsSync(path.join(os.homedir(), '.cargo/bin/dcap-qvl')),
  };
}
