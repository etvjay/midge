// Guards the CI layout that branch protection and the secrets rely on. It reads the workflow files as text (no YAML library is installed).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve(new URL('../.github/workflows', import.meta.url).pathname);
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.yml'));
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');

test('the required check keeps its name, "Complete Canonical Verification Suite", and runs the full suite', () => {
  const ci = read('ci.yml');
  assert.match(ci, /^ {2}verify:\n {4}name: Complete Canonical Verification Suite$/m);
  assert.match(ci, /run: \.\/scripts\/verify/);
});

test('only the full-suite job is given NEARAI_API_KEY', () => {
  for (const f of files) {
    const text = read(f);
    const uses = [...text.matchAll(/secrets\.NEARAI_API_KEY/g)].length;
    if (f === 'ci.yml') {
      assert.equal(uses, 1, 'ci.yml passes the key once');
      const verify = text.slice(text.indexOf('  verify:'), text.indexOf('  quality:'));
      assert.match(verify, /secrets\.NEARAI_API_KEY/, 'and that is in the verify job');
    } else assert.equal(uses, 0, `${f} must not use the key`);
  }
});

// The two image workflows were written with tag-pinned docker actions. Pinning them changes the workflows that publish the room and playground images, so it is
// left for a change that is allowed to touch them. They are listed here exactly, so any other unpinned action, and any new one in these files, still fails.
const KNOWN_TAG_PINNED = new Set([
  'playground-image.yml: docker/build-push-action@v6',
  'playground-image.yml: docker/login-action@v3',
  'playground-image.yml: docker/setup-buildx-action@v3',
  'roost-image.yml: docker/build-push-action@v6',
  'roost-image.yml: docker/login-action@v3',
  'roost-image.yml: docker/setup-buildx-action@v3',
]);

function unpinned() {
  const loose = [];
  for (const f of files)
    for (const m of read(f).matchAll(/^\s*(?:- )?uses: ([^\s#]+)/gm)) {
      const [action, ref] = m[1].split('@');
      if (/^(actions\/|dtolnay\/rust-toolchain$|Swatinem\/rust-cache$)/.test(action) && action !== 'actions/upload-artifact') continue;
      if (!/^[0-9a-f]{40}$/.test(ref || '')) loose.push(`${f}: ${m[1]}`);
    }
  return loose;
}

test('every action outside actions/*, dtolnay/rust-toolchain and Swatinem/rust-cache is pinned to a full commit SHA, except the known image-workflow ones', () => {
  assert.deepEqual(unpinned().filter((x) => !KNOWN_TAG_PINNED.has(x)), []);
});

test('the known tag-pinned list has no stale entries', () => {
  const now = new Set(unpinned());
  assert.deepEqual([...KNOWN_TAG_PINNED].filter((x) => !now.has(x)), []);
});

test('workflows that write get only the permission they need, and the default is read-only', () => {
  for (const f of files) assert.match(read(f), /^permissions:/m, `${f} declares permissions`);
  assert.match(read('release.yml'), /contents: write/);
  assert.match(read('codeql.yml'), /security-events: write/);
  assert.doesNotMatch(read('ci.yml'), /: write/);
});

test('CI reads the Node version from .nvmrc, and .nvmrc says 24', () => {
  assert.equal(fs.readFileSync(new URL('../.nvmrc', import.meta.url), 'utf8').trim(), '24');
  assert.doesNotMatch(read('ci.yml'), /node-version: \d/);
});
