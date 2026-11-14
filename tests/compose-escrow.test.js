// The hosted Roost's compose file is measured by the attestation. Its escrow settings must parse, name two different providers and the
// project's contract, and must not carry anything secret.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { escrowReaderFromEnv } from '../src/roost-service/server.js';

const compose = fs.readFileSync(new URL('../deploy/roost/docker-compose.yml', import.meta.url), 'utf8');
const envLines = [...compose.matchAll(/^\s*-\s*([A-Z][A-Z0-9_]*)=(.*)$/gm)].map((m) => [m[1], m[2].trim()]);
const env = Object.fromEntries(envLines);
const deployments = JSON.parse(fs.readFileSync(new URL('../docs/canonical/deployments.json', import.meta.url), 'utf8'));

// The private endpoint carries an API key, so the compose file names it by an encrypted variable and not by an address. Where a test needs addresses, a stand-in is filled in.
const PRIVATE = 'https://private.example/stand-in';
const filled = (s) => s.replace('${ROOST_PRIVATE_RPC_URL}', PRIVATE);

test('the compose file turns the escrow check on, with two different providers: one pinned in plain text and one private', () => {
  assert.ok(env.ROOST_RPC_URLS, 'ROOST_RPC_URLS is set');
  const raw = env.ROOST_RPC_URLS.split(',').map((u) => u.trim());
  assert.equal(raw.length, 2); assert.ok(/^https:\/\//.test(raw[0]), 'the first provider is pinned in plain text'); assert.equal(raw[1], '${ROOST_PRIVATE_RPC_URL}');
  const urls = filled(env.ROOST_RPC_URLS).split(',').map((u) => u.trim());
  assert.ok(urls.length >= 2 && new Set(urls).size === urls.length, 'two or more different providers');
  assert.ok(urls.every((u) => /^https:\/\//.test(u)), 'every provider is https once the private one is filled in');
  assert.notEqual(new URL(urls[0]).hostname, new URL(urls[1]).hostname, 'different hosts, not one provider twice');
});

test('it names this project\'s contract', () => {
  assert.equal(env.ROOST_CONTRACT_ID, deployments.contract);
});

test('the settings are accepted by the same function the server uses at start-up', () => {
  const reader = escrowReaderFromEnv({ ROOST_RPC_URLS: filled(env.ROOST_RPC_URLS), ROOST_CONTRACT_ID: env.ROOST_CONTRACT_ID });
  assert.equal(typeof reader.read, 'function');
});

test('nothing secret is written into the measured compose file', () => {
  for (const [k, v] of envLines) {
    if (k === 'ROOST_ADMIN_KEY') assert.equal(v, '${ROOST_ADMIN_KEY}', 'the admin key comes from an encrypted variable, never a literal');
    else assert.doesNotMatch(`${k}=${v}`, /key|secret|token|password|mnemonic|seed/i, `${k} must not look like a secret`);
  }
});
