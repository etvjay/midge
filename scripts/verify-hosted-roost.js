#!/usr/bin/env node

/**
 * scripts/verify-hosted-roost.js
 *
 * Verify a running hosted Roost the way a member should before sealing a bid.
 *
 *   node scripts/verify-hosted-roost.js --url https://<roost> --verifier http://127.0.0.1:18080
 *
 * Needs the official dstack-verifier running (a container; see docs/roost-tee-plan.md):
 *   docker run --rm -p 127.0.0.1:18080:8080 dstacktee/dstack-verifier@sha256:0ed61d60f6e0d44cf466e15dc6894f37152d8567cfa76bd8785a921b2d906c38
 *
 * Pinned expectations (compose hash of our build, production OS image hashes) live in
 * roost.expected.json. Exits 0 only if every check passes. Against the dstack simulator it must fail.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyHostedAttestation } from '../src/roost-service/verify-hosted.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback = null) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : fallback; };

const url = arg('url');
const verifierUrl = arg('verifier', 'http://127.0.0.1:18080');
const expectedPath = arg('expected', path.join(rootDir, 'roost.expected.json'));
const evidencePath = arg('evidence');
if (!url) {
  console.error('usage: verify-hosted-roost.js --url <roost base url> [--verifier <dstack-verifier url>] [--expected <file>] [--evidence <out.json>]');
  process.exit(2);
}

const expected = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));
if (!expected.composeHash || (Array.isArray(expected.composeHash) && expected.composeHash.length === 0)) {
  console.error(`[REJECT] ${path.basename(expectedPath)} has no pinned composeHash yet, so the code identity cannot be checked. Pin it after the first deploy.`);
  process.exit(1);
}

const nonce = crypto.randomBytes(32).toString('hex');
console.log(`[1/3] Asking ${url} for an attestation with a fresh nonce ${nonce.slice(0, 16)}…`);
const res = await fetch(`${url.replace(/\/$/, '')}/attestation?nonce=${nonce}`);
if (!res.ok) { console.error(`[REJECT] attestation request answered ${res.status}`); process.exit(1); }
const bundle = await res.json();
console.log(`      ${bundle.attestation.length / 2} bytes of attestation, simulated flag from the Roost: ${bundle.simulated}`);

console.log(`[2/3] Verifying through dstack-verifier at ${verifierUrl}…`);
const result = await verifyHostedAttestation(bundle, { nonce, verifierUrl, composeHash: expected.composeHash, osImageHashes: expected.osImageHashes });
for (const c of result.checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? ` (${c.detail})` : ''}`);

if (evidencePath) {
  fs.writeFileSync(evidencePath, JSON.stringify({
    checkedAt: new Date().toISOString(), url, nonce, ok: result.ok, checks: result.checks, details: result.details,
    settlePublicKey: bundle.settlePublicKey, intentPublicKey: bundle.intentPublicKey,
    verifierImage: expected.verifierImage, note: 'Attestation bytes are not included; re-run this script to verify live.',
  }, null, 2));
  console.log(`[3/3] Evidence written to ${evidencePath}`);
}

if (!result.ok) {
  console.log('\n>>> [REJECT] This Roost did NOT pass verification. Do not seal a bid to it.\n');
  process.exit(1);
}
console.log('\n>>> [PASS] This Roost runs the pinned build inside a verified dstack TDX VM, and its keys are bound to this quote.\n');
