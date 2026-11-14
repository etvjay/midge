// The room image installs its crypto packages from deploy/roost, the tests install them from the root. If the two resolve to different versions, the room runs
// code the tests never ran. This compares the versions the two lockfiles resolve, for every package both manifests name.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const json = (p) => JSON.parse(fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const rootPkg = json('package.json');
const roostPkg = json('deploy/roost/package.json');
const rootLock = json('package-lock.json').packages;
const roostLock = json('deploy/roost/package-lock.json').packages;
const names = (p) => Object.keys({ ...p.dependencies, ...p.devDependencies });
const shared = names(roostPkg).filter((n) => names(rootPkg).includes(n));

test('the room and the root share packages (so the check below is not empty)', () => {
  assert.ok(shared.length >= 3, shared.join(', '));
});

for (const name of shared) {
  test(`${name} resolves to the same version in the root and in deploy/roost`, () => {
    const a = rootLock[`node_modules/${name}`]?.version;
    const b = roostLock[`node_modules/${name}`]?.version;
    assert.ok(a && b, `both lockfiles resolve ${name}`);
    assert.equal(b, a);
  });
}

test('every dependency the room image installs is pinned to an exact version', () => {
  for (const [n, v] of Object.entries(roostPkg.dependencies || {})) assert.match(v, /^\d+\.\d+\.\d+$/, `${n}@${v}`);
});
