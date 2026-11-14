import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { largeFiles } from '../scripts/check-large-files.mjs';

function repo(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'large-files-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  for (const [name, size] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), Buffer.alloc(size, 97));
  }
  execFileSync('git', ['add', '-A'], { cwd: dir });
  return dir;
}

test('a tracked file over the limit is reported, largest first, and small ones are not', () => {
  const dir = repo({ 'small.txt': 10, 'big/a.bin': 5000, 'big/b.bin': 9000 });
  assert.deepEqual(largeFiles({ root: dir, limit: 1000 }), [
    { file: 'big/b.bin', bytes: 9000 },
    { file: 'big/a.bin', bytes: 5000 },
  ]);
});

test('a file exactly at the limit passes', () => {
  assert.deepEqual(largeFiles({ root: repo({ 'edge.bin': 1000 }), limit: 1000 }), []);
});

test('a big file that is not tracked is ignored', () => {
  const dir = repo({ 'ok.txt': 1 });
  fs.writeFileSync(path.join(dir, 'untracked.bin'), Buffer.alloc(5000));
  assert.deepEqual(largeFiles({ root: dir, limit: 1000 }), []);
});

test('the command exits 1 and names the file when something is too large, and 0 when not', () => {
  const dir = repo({ 'huge.bin': 5000 });
  const run = (limit) => {
    try {
      execFileSync('node', ['scripts/check-large-files.mjs', '--root', dir, '--limit', String(limit)], { stdio: 'pipe' });
      return { code: 0 };
    } catch (e) {
      return { code: e.status, err: String(e.stderr) };
    }
  };
  const bad = run(1000);
  assert.equal(bad.code, 1);
  assert.match(bad.err, /huge\.bin/);
  assert.equal(run(10000).code, 0);
});

test('this repository has no tracked file over 1 MiB', () => {
  assert.deepEqual(largeFiles({ root: process.cwd() }), []);
});
