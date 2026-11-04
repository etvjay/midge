import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadEnvFile } from './near.js';

const run = promisify(execFile);
const PHALA = ['--yes', 'phala@1.2.0'];
export const HOURLY_USD = 0.058; // tdx.small, from `phala instance-types` on 2026-11-04

/**
 * A Phala CVM session for an experiment: deploy the hosted Roost, wait for it, hand back what a verifier needs,
 * and delete it. Money safety is built in: a detached dead-man's switch deletes the VM at the deadline even if
 * this process dies; the API key reaches children through the environment, never a command line.
 */
export async function deployRoost({ rootDir, hours = 1, composePath = 'deploy/roost/docker-compose.yml', log = () => {} }) {
  const env = { ...process.env, PHALA_CLOUD_API_KEY: loadEnvFile(rootDir).PHALA_CLOUD_API_KEY || process.env.PHALA_CLOUD_API_KEY };
  if (!env.PHALA_CLOUD_API_KEY) throw new Error('PHALA_CLOUD_API_KEY is not set');
  const phala = (args, opts = {}) => run('npx', [...PHALA, ...args], { cwd: rootDir, env, timeout: 300000, maxBuffer: 20 * 1024 * 1024, ...opts });
  const parse = (t) => JSON.parse(t.slice(t.indexOf('{')));

  const stateDir = path.join(os.homedir(), '.midge-phala');
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const adminKey = crypto.randomBytes(24).toString('hex'); // fresh per session, never written to the repo
  const envFile = path.join(stateDir, `lab-env.${crypto.randomBytes(4).toString('hex')}`);
  fs.writeFileSync(envFile, `ROOST_ADMIN_KEY=${adminKey}\n`, { mode: 0o600 });

  const startedAt = Date.now();
  let id = null; let deadman = null; let deleted = false;
  const teardown = async () => {
    if (deadman) { try { process.kill(-deadman.pid); } catch { /* gone */ } deadman = null; }
    try { fs.unlinkSync(envFile); } catch { /* gone */ }
    if (id && !deleted) {
      try { await phala(['cvms', 'delete', id, '--yes']); deleted = true; } catch (e) { return { deleted: false, error: String(e.message).slice(0, 300), id }; }
    }
    return { deleted: true, id, seconds: Math.round((Date.now() - startedAt) / 1000), estimatedUsd: Number(((Date.now() - startedAt) / 3600000 * HOURLY_USD).toFixed(4)) };
  };

  try {
    const name = `midge-lab-${new Date().toISOString().slice(5, 16).replace(/[-:T]/g, '')}`;
    log(`deploying ${name}`);
    const out = await phala(['deploy', '-n', name, '-c', composePath, '-t', 'tdx.small', '--image', 'dstack-0.6.1', '--disk-size', '20G', '--no-dev-os', '--no-public-logs', '--wait', '-j', '-e', envFile]);
    const deployed = parse(out.stdout);
    id = deployed.app_id || deployed.id;
    if (!id) throw new Error('deploy output had no app_id');
    deadman = spawn('bash', ['-c', `sleep ${Math.round(hours * 3600)}; npx --yes phala@1.2.0 cvms delete '${id}' --yes`], { detached: true, stdio: 'ignore', env });
    deadman.unref();
    const cvm = parse((await phala(['cvms', 'get', id, '-j'])).stdout);
    const url = (JSON.stringify(cvm).match(/https:\/\/[A-Za-z0-9.-]+-8080[A-Za-z0-9.-]*/) || [])[0];
    if (!url) throw new Error('could not find the Roost URL in the CVM description');
    let healthy = false;
    for (let i = 0; i < 60 && !healthy; i += 1) { try { healthy = (await fetch(`${url}/healthz`, { signal: AbortSignal.timeout(5000) })).ok; } catch { /* starting */ } if (!healthy) await new Promise((r) => setTimeout(r, 5000)); }
    if (!healthy) throw new Error('the Roost did not become healthy');
    return { id, url, adminKey, cvm, deployed, deadmanHours: hours, startedAt, teardown };
  } catch (err) {
    err.teardown = await teardown();
    throw err;
  }
}

export async function listCvms(rootDir) {
  const env = { ...process.env, PHALA_CLOUD_API_KEY: loadEnvFile(rootDir).PHALA_CLOUD_API_KEY || process.env.PHALA_CLOUD_API_KEY };
  const out = await run('npx', [...PHALA, 'cvms', 'list', '-j'], { cwd: rootDir, env, timeout: 90000 });
  const d = JSON.parse(out.stdout.slice(out.stdout.indexOf('{')));
  return d.items || [];
}

const VERIFIER = 'ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41';
export async function startVerifier(port = 18080) {
  await run('docker', ['rm', '-f', 'midge-lab-verifier']).catch(() => {});
  await run('docker', ['run', '-d', '--name', 'midge-lab-verifier', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--pids-limit', '256', '--memory', '1g', '--tmpfs', '/tmp:size=600m', '-p', `127.0.0.1:${port}:8080`, VERIFIER]);
  for (let i = 0; i < 30; i += 1) { try { if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return { url: `http://127.0.0.1:${port}`, image: VERIFIER, stop: () => run('docker', ['rm', '-f', 'midge-lab-verifier']).catch(() => {}) }; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 1000)); }
  throw new Error('the dstack-verifier container did not start');
}
