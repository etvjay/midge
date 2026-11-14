// deploy/playground/build.sh stages a hand-listed set of directories. Every file the service entrypoint imports, directly or through other files, must be in
// the staged set, or the image builds and then fails at start. This is the same check the room image has (tests/roost-image-stage.test.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const IMPORT = /(?:import|export)\s[^'"`]*?from\s*['"](\.{1,2}\/[^'"]+)['"]|import\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)|import\s*['"](\.{1,2}\/[^'"]+)['"]/g;

test('every relative import reachable from the playground entrypoint is staged for the image', () => {
  const ctx = fs.mkdtempSync(path.join(os.tmpdir(), 'playground-stage-'));
  try {
    execFileSync('bash', ['deploy/playground/build.sh', '--stage', ctx], { stdio: 'pipe' });
    const missing = []; const seen = new Set();
    const walk = (rel) => {
      if (seen.has(rel)) return; seen.add(rel);
      const staged = path.join(ctx, rel);
      if (!fs.existsSync(staged)) { missing.push(rel); return; }
      for (const m of fs.readFileSync(staged, 'utf8').matchAll(IMPORT)) walk(path.normalize(path.join(path.dirname(rel), m[1] || m[2] || m[3])));
    };
    walk('src/playground/main.js');
    assert.deepEqual(missing, [], `staged context is missing: ${missing.join(', ')}`);
    assert.ok(seen.size > 15, 'the walk reached the service\'s modules');
    assert.ok(fs.existsSync(path.join(ctx, 'package-lock.json')) && fs.existsSync(path.join(ctx, 'Dockerfile')));
    for (const secret of ['.env', '.lab', 'docs/lab-runs']) assert.ok(!fs.existsSync(path.join(ctx, secret)), `${secret} must never be staged`);
  } finally { fs.rmSync(ctx, { recursive: true, force: true }); }
});

test('the compose file names no secret value and pins the image by digest syntax', () => {
  const c = fs.readFileSync('deploy/playground/docker-compose.yml', 'utf8');
  for (const k of ['FUNDER_KEY', 'ROOM_ADMIN_KEY', 'NEARAI_API_KEY', 'PHALA_CLOUD_API_KEY']) assert.match(c, new RegExp(`${k}=\\$\\{${k}\\}`), `${k} comes from an encrypted environment variable`);
  assert.match(c, /image: ghcr\.io\/etvjay\/midge-playground@sha256:/);
  assert.ok(!/ed25519:[1-9A-HJ-NP-Za-km-z]{40,}/.test(c), 'no key is written into the file');
  assert.match(c, /FUNDER_ID=play\.fly-/, 'the funder is the dedicated account, not the deployer');
});

test('the image can verify the model\'s hardware attestation: dcap-qvl pinned by checksum, and a CA store for it to reach Intel\'s collateral', () => {
  // The first deployment refused every review with "no model attestation candidate passed" because the image had neither. A local run hides this,
  // because the developer's machine has both.
  const d = fs.readFileSync('deploy/playground/Dockerfile', 'utf8');
  assert.match(d, /dcap-qvl-linux-x86_64-musl/, 'the static build: the glibc build needs a newer libc than the base image');
  assert.match(d, /[0-9a-f]{64}/, 'its sha256 is pinned');
  assert.match(d, /createHash\('sha256'\)/); assert.match(d, /checksum mismatch/);
  assert.match(d, /COPY --from=dcap \/dcap-qvl \/usr\/local\/bin\/dcap-qvl/);
  assert.match(d, /apt-get install -y --no-install-recommends ca-certificates/);
});

test('the compose file does not publish host port 8090, which Phala reserves', () => {
  const c = fs.readFileSync('deploy/playground/docker-compose.yml', 'utf8');
  assert.ok(!/8090/.test(c), 'Phala answers "Host port 8090 is reserved for internal use and cannot be published"');
  assert.match(c, /- PORT=8080/); assert.match(c, /"8080:8080"/);
});
