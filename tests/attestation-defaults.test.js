// Audit run-1, lead 10: a missing dcap-qvl must not turn the Intel certificate-chain check into a pass by default.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { checkModelCandidate } from '../src/enclave/attestation.js';

const key = 'ab'.repeat(32);
const nonce = 'cd'.repeat(32);
const quote = Buffer.alloc(700);
quote.writeUInt16LE(4, 0); quote.writeUInt16LE(2, 2); quote.writeUInt32LE(0x81, 4);
Buffer.from(key + nonce, 'hex').copy(quote, 568);
const candidate = { signing_algo: 'ed25519', model_name: 'm', request_nonce: nonce, signing_public_key: key, intel_quote: quote.toString('hex') };

function withoutDcap(fn) {
  const saved = { HOME: process.env.HOME, PATH: process.env.PATH, BIN: process.env.DCAP_QVL_BIN };
  const home = fs.mkdtempSync(os.tmpdir() + '/nodcap-');
  process.env.HOME = home; process.env.PATH = ''; delete process.env.DCAP_QVL_BIN;
  try { return fn(); } finally {
    process.env.HOME = saved.HOME; process.env.PATH = saved.PATH;
    if (saved.BIN !== undefined) process.env.DCAP_QVL_BIN = saved.BIN;
    fs.rmSync(home, { recursive: true, force: true });
  }
}

test('by default, a quote whose chain cannot be checked is rejected', () => {
  const r = withoutDcap(() => checkModelCandidate(candidate, { nonce, model: 'm' }));
  assert.equal(r.ok, false);
  assert.ok(r.checks.some((c) => c.name === 'Intel certificate chain verifies' && !c.ok));
});

test('the weaker modes are still there when someone asks for them', () => {
  assert.equal(withoutDcap(() => checkModelCandidate(candidate, { nonce, model: 'm', chain: 'if-available' })).ok, true);
  assert.equal(checkModelCandidate(candidate, { nonce, model: 'm', chain: 'skip' }).ok, true);
});
