// The room's compose file is public and measured by the attestation. Its chain providers must be at least two and all must agree, and an endpoint that carries
// an API key must never be written into it. This guards both after the private endpoint was added.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { escrowReaderFromEnv } from '../src/roost-service/server.js';

const compose = fs.readFileSync('deploy/roost/docker-compose.yml', 'utf8');
const list = (name) => { const m = compose.match(new RegExp(`^\\s*- ${name}=(.+)$`, 'm')); assert.ok(m, `${name} is set in the compose file`); return m[1].trim().split(','); };

for (const name of ['ROOST_RPC_URLS', 'ROOST_ACCOUNT_CHECK_RPC_URLS']) {
  test(`${name} has two providers: one pinned in plain text with no key, and one that is an encrypted variable`, () => {
    const entries = list(name);
    assert.equal(entries.length, 2);
    const pinned = entries.filter((e) => /^https:\/\//.test(e));
    const refs = entries.filter((e) => /^\$\{[A-Z_]+\}$/.test(e));
    assert.equal(pinned.length + refs.length, 2, `every entry is a plain https address or a \${VARIABLE}: ${entries.join(' ')}`);
    assert.ok(pinned.length >= 1, 'at least one provider is pinned in the measured file, so the check cannot be pointed only at an operator\'s endpoint');
    for (const u of pinned) { const url = new URL(u); assert.ok(url.pathname === '/' || url.pathname === '', `${u} carries no key in its path`); assert.equal(url.search, ''); assert.equal(url.username, ''); }
    assert.deepEqual(refs, ['${ROOST_PRIVATE_RPC_URL}'], 'the private endpoint is referenced, not written');
  });
}

test('no address in the compose files carries a token or key', () => {
  for (const f of ['deploy/roost/docker-compose.yml', 'deploy/playground/docker-compose.yml']) {
    const text = fs.readFileSync(f, 'utf8');
    for (const m of text.matchAll(/https:\/\/[^\s,'"]+/g)) assert.ok(!/\/[0-9a-f]{20,}/i.test(m[0]), `${f}: ${m[0]}`);
  }
});

test('the room accepts the lists once the private endpoint is filled in, and refuses a list that has only one provider', () => {
  const fill = (s) => s.replace('${ROOST_PRIVATE_RPC_URL}', 'https://private.example/abc');
  const urls = fill(list('ROOST_RPC_URLS').join(','));
  assert.ok(escrowReaderFromEnv({ ROOST_RPC_URLS: urls, ROOST_CONTRACT_ID: 'c.fly-1.testnet' }));
  assert.throws(() => escrowReaderFromEnv({ ROOST_RPC_URLS: 'https://near-testnet.drpc.org', ROOST_CONTRACT_ID: 'c.fly-1.testnet' }), /two or more different providers/);
});
