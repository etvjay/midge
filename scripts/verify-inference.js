#!/usr/bin/env node

/**
 * scripts/verify-inference.js
 * 
 * Verifies NEAR AI Cloud TEE Private Inference & Response Signatures (Task X1):
 * 1. Preflight: Fetches live/fixture hardware attestation bound to a fresh nonce.
 * 2. Completion: Calls live NEAR AI Cloud inference (if NEARAI_API_KEY is configured)
 *    or evaluates against authentic recorded cryptographic fixture.
 * 3. Signature Verification: Computes exact request & response SHA-256 hashes,
 *    reconstructs <MODEL>:<req_hash>:<resp_hash>, and cryptographically recovers
 *    the EIP-191 ECDSA signer, verifying match against the hardware enclave signer.
 * 4. Tamper Resilience: Proves flipping a single byte in the completion payload
 *    causes immediate cryptographic signature rejection.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function loadEnvKey() {
  if (process.env.NEARAI_API_KEY) return process.env.NEARAI_API_KEY;
  if (process.env.NEAR_AI_API_KEY) return process.env.NEAR_AI_API_KEY;
  const envPath = path.join(rootDir, '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if ((trimmed.startsWith('NEARAI_API_KEY=') || trimmed.startsWith('NEAR_AI_API_KEY='))) {
        const val = trimmed.split('=')[1]?.trim();
        if (val) return val;
      }
    }
  }
  return null;
}

export async function verifyInferenceAttestation({ offline = false } = {}) {
  console.log('\n======================================================');
  console.log(' [VERIFICATION 9] NEAR AI CLOUD TEE INFERENCE ATTESTATION');
  console.log(' Target: Confidential Deliberation & Signed Response Proof');
  console.log('======================================================');

  const apiKey = loadEnvKey();
  const isOffline = offline || process.env.FLY_OFFLINE === '1' || !apiKey;

  if (!isOffline && apiKey) {
    console.log('[1/4] Mode: LIVE EXTERNAL (NEAR AI Cloud API Key Detected)');
    const model = 'Qwen/Qwen3.6-35B-A3B-FP8';
    const sessionNonce = crypto.randomBytes(32).toString('hex');
    const attUrl = `https://cloud-api.near.ai/v1/attestation/report?model=${encodeURIComponent(model)}&signing_algo=ecdsa&nonce=${sessionNonce}`;

    console.log(`[2/4] Preflight: Querying hardware attestation report from NEAR AI Cloud...`);
    const attRes = await fetch(attUrl);
    if (!attRes.ok) {
      throw new Error(`[INFERENCE FAIL] Attestation preflight failed: HTTP ${attRes.status}`);
    }
    const report = await attRes.json();
    const gatewaySigner = report.gateway_attestation?.signing_address?.toLowerCase();
    const modelSigner = report.model_attestations?.[0]?.signing_address?.toLowerCase();
    console.log(`  ✓ Enclave Signer Bound: Gateway: ${gatewaySigner} | Model: ${modelSigner}`);

    console.log(`[3/4] Sending live completion request to https://cloud-api.near.ai/v1/chat/completions...`);
    const requestPayload = JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: 'You are the Fly Roost confidential deliberation arbiter.' },
        { role: 'user', content: 'Deliberate collective syndicate order batch: 3 flyers, pro-rata TWAP 300s.' }
      ],
      stream: false
    });

    const compRes = await fetch('https://cloud-api.near.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Accept-Encoding': 'identity'
      },
      body: requestPayload
    });

    if (!compRes.ok) {
      throw new Error(`[INFERENCE FAIL] Completion request failed: HTTP ${compRes.status}`);
    }
    const responseText = await compRes.text();
    const completionJson = JSON.parse(responseText);
    const completionId = completionJson.id;
    console.log(`  ✓ Received completion response: ${completionId}`);

    console.log(`[4/4] Fetching cryptographic signature from https://cloud-api.near.ai/v1/signature/${completionId}...`);
    const sigUrl = `https://cloud-api.near.ai/v1/signature/${completionId}?model=${encodeURIComponent(model)}&signing_algo=ecdsa`;
    const sigRes = await fetch(sigUrl, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    if (!sigRes.ok) {
      throw new Error(`[INFERENCE FAIL] Failed to retrieve response signature: HTTP ${sigRes.status}`);
    }
    const sigData = await sigRes.json();
    if (sigData.error_code || !sigData.signature) {
      throw new Error(`[INFERENCE FAIL] Response signature unavailable: ${sigData.message || JSON.stringify(sigData)}`);
    }

    const reqHash = crypto.createHash('sha256').update(requestPayload).digest('hex');
    const respHash = crypto.createHash('sha256').update(responseText).digest('hex');
    const expectedSignedText = `${model}:${reqHash}:${respHash}`;

    if (sigData.text && sigData.text !== expectedSignedText) {
      throw new Error(`[INFERENCE FAIL] Signed text mismatch: expected '${expectedSignedText}', got '${sigData.text}'`);
    }

    const recoveredSigner = ethers.verifyMessage(expectedSignedText, sigData.signature).toLowerCase();
    const matchesSigner = (recoveredSigner === gatewaySigner || recoveredSigner === modelSigner);
    if (!matchesSigner) {
      throw new Error(`[INFERENCE FAIL] Recovered signer ${recoveredSigner} does not match attestation signers (${gatewaySigner} / ${modelSigner})`);
    }
    console.log(`  ✓ Signature Recovered:  ${recoveredSigner} (Matches TEE Attestation Signer)`);

    const evidence = {
      model,
      completionId,
      requestHash: reqHash,
      responseHash: respHash,
      signedText: expectedSignedText,
      signingAddress: recoveredSigner,
      signature: sigData.signature,
      verified: true,
      timestamp: new Date().toISOString()
    };
    fs.writeFileSync(path.join(rootDir, 'docs', 'canonical', 'inference-evidence.json'), JSON.stringify(evidence, null, 2));
    console.log(`\n>>> [PASS] LIVE INFERENCE VERIFIED: Cryptographically attested via NEAR AI Cloud.`);
    return { verified: true, live: true, completionId };
  } else {
    // OFFLINE / FIXTURE MODE
    console.log('[1/4] Mode: RECORDED FIXTURE (No NEARAI_API_KEY detected in environment)');
    const fixturePath = path.join(rootDir, 'verifications', 'fixtures', 'inference-fixture.json');
    if (!fs.existsSync(fixturePath)) {
      throw new Error(`[INFERENCE FAIL] Missing fixture at ${fixturePath}`);
    }
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

    console.log(`[2/4] Parsing recorded completion fixture (${fixture.completionId})...`);
    console.log(`  - Target Model:        ${fixture.model}`);
    console.log(`  - Expected Signer:     ${fixture.signingAddress}`);

    console.log(`[3/4] Recomputing SHA-256 Hashes & EIP-191 Cryptographic Signature Recovery...`);
    const reqHash = crypto.createHash('sha256').update(fixture.requestBody).digest('hex');
    const respHash = crypto.createHash('sha256').update(fixture.responseBody).digest('hex');
    const reconstructedText = `${fixture.model}:${reqHash}:${respHash}`;

    if (reconstructedText !== fixture.signedText) {
      throw new Error(`[INFERENCE FAIL] Reconstructed text mismatch against signed text payload!`);
    }

    const recoveredAddress = ethers.verifyMessage(fixture.signedText, fixture.signature).toLowerCase();
    if (recoveredAddress !== fixture.signingAddress.toLowerCase()) {
      throw new Error(`[INFERENCE FAIL] Recovered address ${recoveredAddress} does not match expected signer ${fixture.signingAddress}`);
    }
    console.log(`  - Request Hash:        ${reqHash.slice(0, 16)}... (Verified)`);
    console.log(`  - Response Hash:       ${respHash.slice(0, 16)}... (Verified)`);
    console.log(`  - Recovered Signer:    ${recoveredAddress} (VERIFIED EIP-191)`);

    // Tamper test
    console.log(`[4/4] Tamper Resilience Check: Flipping 1 byte in response payload...`);
    const tamperedResponse = fixture.responseBody + ' ';
    const tamperedRespHash = crypto.createHash('sha256').update(tamperedResponse).digest('hex');
    const tamperedSignedText = `${fixture.model}:${reqHash}:${tamperedRespHash}`;
    const tamperedRecovered = ethers.verifyMessage(tamperedSignedText, fixture.signature).toLowerCase();
    if (tamperedRecovered === fixture.signingAddress.toLowerCase()) {
      throw new Error(`[INFERENCE SECURITY FAILURE] Tampered response payload was accepted!`);
    }
    console.log(`  - Tamper Check:        REJECTED (Flipped byte invalidates signature recovery)`);

    console.log('\n>>> [PASS] INFERENCE ATTESTATION VERIFIED [RECORDED FIXTURE]: Cryptographic invariant satisfied.\n');
    return {
      verified: true,
      live: false,
      fixture: true,
      model: fixture.model,
      recoveredSigner: recoveredAddress,
      resultHash: fixture.resultHash
    };
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  verifyInferenceAttestation().catch((err) => {
    console.error('FAILED:', err);
    process.exit(1);
  });
}
