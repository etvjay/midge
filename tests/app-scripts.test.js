// Each app has its own `npm run test:<app>` script. This fails when a test file imports an app's source (or reads its site folder) and is not in that script,
// so a new test cannot be left out of the per-app command.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const root = path.resolve(new URL('..', import.meta.url).pathname);

function listed(script) {
  const out = new Set();
  for (const token of script.split(/\s+/).filter((t) => t.endsWith('.test.js'))) for (const f of fs.globSync(token, { cwd: root })) out.add(f);
  return out;
}

function importsOf(file) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  const targets = [...text.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"](\.\.?\/[^'"]+)['"]/g)].map((m) => path.normalize(path.join(path.dirname(file), m[1])));
  const readsSite = /['"`]\.\.\/site\/|new URL\(['"`]\.\.\/site|path\.join\([^)]*['"]site['"]/.test(text);
  return { targets, readsSite };
}

const tests = fs.globSync('tests/*.test.js', { cwd: root });
const APPS = [
  { name: 'roost', script: 'test:roost', uses: (i) => i.targets.some((t) => t.startsWith('src/roost-service/')) },
  { name: 'playground', script: 'test:playground', uses: (i) => i.targets.some((t) => t.startsWith('src/playground/')) },
  { name: 'site', script: 'test:site', uses: (i) => i.readsSite || i.targets.some((t) => t.startsWith('site/')) },
];

for (const app of APPS) {
  test(`every test file that uses the ${app.name} is in npm run ${app.script}`, () => {
    assert.ok(pkg.scripts[app.script], `${app.script} exists`);
    const have = listed(pkg.scripts[app.script]);
    const missing = tests.filter((f) => app.uses(importsOf(f)) && !have.has(f));
    assert.deepEqual(missing, []);
  });
  test(`npm run ${app.script} lists only files that exist`, () => {
    for (const token of pkg.scripts[app.script].split(/\s+/).filter((t) => t.endsWith('.test.js'))) assert.ok(fs.globSync(token, { cwd: root }).length > 0, token);
  });
}

test('the Rust apps have a test script that changes into the crate', () => {
  for (const [script, dir] of [['test:caller', 'outlayer/caller'], ['test:room-signer', 'outlayer/room-signer'], ['test:fly-coordinator', 'contracts/fly-coordinator']]) {
    assert.match(pkg.scripts[script], new RegExp(`cd ${dir} && cargo test`));
    assert.ok(fs.existsSync(path.join(root, dir, 'Cargo.toml')));
  }
});
