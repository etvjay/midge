// Each Rust crate forbids unsafe code and warns on cognitive complexity, with the threshold written in its clippy.toml. Fails if one is dropped.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const crates = ['contracts/fly-coordinator', 'outlayer/caller', 'outlayer/room-signer'];
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

for (const c of crates) {
  test(`${c} forbids unsafe code and sets a cognitive complexity lint with a threshold`, () => {
    const toml = read(`${c}/Cargo.toml`);
    assert.match(toml, /\[lints\.rust\]\s*\nunsafe_code = "forbid"/);
    assert.match(toml, /\[lints\.clippy\]\s*\ncognitive_complexity = "warn"/);
    assert.match(read(`${c}/clippy.toml`), /^cognitive-complexity-threshold = \d+$/m);
  });
}
