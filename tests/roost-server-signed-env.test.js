import test from 'node:test';
import assert from 'node:assert/strict';
import { roostFromEnv } from '../src/roost-service/server.js';

const provider = { simulated: true, attest: async () => Buffer.from('t'), info: async () => ({}) };
const base = { ROOST_RPC_URLS: 'https://a.example,https://b.example', ROOST_CONTRACT_ID: 'c.example.testnet' };

test('by default the Roost does not require signed inputs (as shipped before)', () => {
  const r = roostFromEnv({ ...base }, provider);
  assert.equal(r.requireSignedInputs, false);
});

test('ROOST_REQUIRE_SIGNED_INPUTS=1 turns signed inputs on and wires an account key check', () => {
  const r = roostFromEnv({ ...base, ROOST_REQUIRE_SIGNED_INPUTS: '1' }, provider);
  assert.equal(r.requireSignedInputs, true);
  assert.equal(typeof r.accountKeyCheck, 'function');
});

test('signed inputs cannot be required without a contract and an RPC provider to check keys against', () => {
  assert.throws(() => roostFromEnv({ ROOST_REQUIRE_SIGNED_INPUTS: '1' }, provider), /ROOST_RPC_URLS/);
  assert.throws(() => roostFromEnv({ ROOST_REQUIRE_SIGNED_INPUTS: '1', ROOST_RPC_URLS: 'https://a.example,https://b.example' }, provider), /ROOST_CONTRACT_ID/);
});

test('any other value does not switch it on, so a typo cannot silently weaken or strengthen the room', () => {
  assert.equal(roostFromEnv({ ...base, ROOST_REQUIRE_SIGNED_INPUTS: 'yes' }, provider).requireSignedInputs, false);
});
