// Rust integration tests are named <topic>_tests.rs, so a test file is recognisable by its name in every crate. proptest finds its saved regressions by the
// source file's name, so a .proptest-regressions file must follow its test file.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const crates = ['contracts/fly-coordinator', 'outlayer/caller', 'outlayer/room-signer'];

test('every Rust integration test file is named <topic>_tests.rs', () => {
  const bad = [];
  for (const c of crates) {
    const dir = path.join(c, 'tests');
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) if (f.endsWith('.rs') && !/_tests\.rs$/.test(f)) bad.push(`${dir}/${f}`);
  }
  assert.deepEqual(bad, []);
});

test('every saved proptest regression file sits beside a test file of the same name', () => {
  const orphans = [];
  for (const c of crates) {
    const dir = path.join(c, 'tests');
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir))
      if (f.endsWith('.proptest-regressions') && !fs.existsSync(path.join(dir, f.replace('.proptest-regressions', '.rs')))) orphans.push(`${dir}/${f}`);
  }
  assert.deepEqual(orphans, []);
});
