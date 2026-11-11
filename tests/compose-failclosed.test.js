// The fail-closed fixture must differ from the real compose file in the provider URLs only, or the experiment would test something else.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../deploy/roost/${p}`, import.meta.url), 'utf8');
const strip = (t) => t.split('\n').filter((l) => !l.startsWith('#') || l.includes('Compose file')).join('\n');

test('the fixture differs from the real compose file in the two provider URLs only', () => {
  const real = read('docker-compose.yml'); const fix = read('docker-compose.failclosed.yml');
  const body = fix.replace(/^# TEST FIXTURE[\s\S]*?\n# A test checks[^\n]*\n/, '');
  assert.notEqual(body, real);
  assert.equal(body.replace('https://provider-a.invalid,https://provider-b.invalid', 'https://test.rpc.fastnear.com,https://rpc.testnet.near.org'), real);
});
test('its providers are on the reserved .invalid domain, so they can never resolve', () => {
  const line = read('docker-compose.failclosed.yml').match(/ROOST_RPC_URLS=(.*)/)[1];
  for (const u of line.split(',')) assert.match(new URL(u).hostname, /\.invalid$/);
});
test('it pins the same image as the real compose file', () => {
  const img = (t) => t.match(/image: (\S+)/)[1];
  assert.equal(img(read('docker-compose.failclosed.yml')), img(read('docker-compose.yml')));
});

test('the fixture breaks only the escrow providers: its key-check providers are the real ones, so signed bids can still be accepted (GAP-050)', () => {
  const fix = read('docker-compose.failclosed.yml'); const real = read('docker-compose.yml');
  const kc = (t) => t.match(/ROOST_ACCOUNT_CHECK_RPC_URLS=(.*)/)[1];
  assert.equal(kc(fix), kc(real));
  for (const u of kc(real).split(',')) assert.doesNotMatch(new URL(u).hostname, /\.invalid$/);
  assert.equal(new Set(kc(real).split(',')).size, 2, 'two different key-check providers');
});
