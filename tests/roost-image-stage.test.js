// Audit run-1: deploy/roost/build.sh stages a hand-listed set of files. Every file the Roost entrypoint imports, directly or
// through other files, must be in that staged set, or the image builds and then fails at start.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const IMPORT = /(?:import|export)\s[^'"`]*?from\s*['"](\.{1,2}\/[^'"]+)['"]|import\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)|import\s*['"](\.{1,2}\/[^'"]+)['"]/g;

test('every relative import reachable from the Roost entrypoint is staged for the image', () => {
  const ctx = fs.mkdtempSync(path.join(os.tmpdir(), 'roost-stage-'));
  try {
    execFileSync('bash', ['deploy/roost/build.sh', '--stage', ctx], { stdio: 'pipe' });
    const missing = [];
    const seen = new Set();
    const walk = (rel) => {
      if (seen.has(rel)) return; seen.add(rel);
      const staged = path.join(ctx, rel);
      if (!fs.existsSync(staged)) { missing.push(rel); return; }
      const text = fs.readFileSync(staged, 'utf8');
      for (const m of text.matchAll(IMPORT)) {
        const spec = m[1] || m[2] || m[3];
        walk(path.normalize(path.join(path.dirname(rel), spec)));
      }
    };
    walk('src/roost-service/server.js');
    assert.deepEqual(missing, [], `staged context is missing: ${missing.join(', ')}`);
  } finally { fs.rmSync(ctx, { recursive: true, force: true }); }
});
