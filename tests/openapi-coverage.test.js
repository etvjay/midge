// The room service and the playground service each have an OpenAPI file in docs/openapi. This reads the routes out of the source and fails when one is
// missing from its file, or when a file lists a route the source no longer has. The route lists are descriptions, not full schemas.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const spec = (p) => JSON.parse(read(p));
const unique = (a) => [...new Set(a)].sort();

const roostSource = unique([...read('src/roost-service/server.js').matchAll(/url\.pathname === '([^']+)'/g)].map((m) => m[1]));
const playgroundSource = unique([
  ...[...read('src/playground/service.js').matchAll(/path === '(\/api\/[^']+)'/g)].map((m) => m[1]),
  '/api/rounds/{ticket}',
  '/api/rounds/{ticket}/approve',
  '/api/rounds/{ticket}/abandon', // matched by one regular expression in the source
]);

test('the source has the routes this test expects (so the check below is not empty)', () => {
  assert.ok(roostSource.length >= 20, roostSource.join(' '));
  assert.ok(playgroundSource.includes('/api/review') && playgroundSource.includes('/api/rooms') === false);
  assert.match(read('src/playground/service.js'), /\\\/api\\\/rounds\\\/\(\[0-9a-f\]\{32\}\)\(\?:\\\/\(approve\|abandon\)\)\?\$/);
});

test('every route in the room service is in docs/openapi/roost.json, and nothing else is', () => {
  assert.deepEqual(unique(Object.keys(spec('docs/openapi/roost.json').paths)), roostSource);
});

test('every route in the playground service is in docs/openapi/playground.json, and nothing else is', () => {
  assert.deepEqual(unique(Object.keys(spec('docs/openapi/playground.json').paths)), playgroundSource);
});

test('a route that needs the admin key says so in the room spec', () => {
  const src = read('src/roost-service/server.js');
  const s = spec('docs/openapi/roost.json').paths;
  for (const r of ['/round', '/settle', '/abandon', '/payrun']) {
    assert.ok(src.includes(`url.pathname === '${r}'`));
    const op = Object.values(s[r])[0];
    assert.ok(
      op.parameters?.some((p) => p.name === 'x-roost-admin-key'),
      r,
    );
  }
});
