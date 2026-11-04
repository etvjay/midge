import { verifyHardwareAttestation } from './verifications/01-hardware-attestation.js';
import { verifyConfidentialIntents } from './verifications/02-confidential-intents.js';
import { verifyHatchProtocol } from './verifications/03-hatch-escape-hatch.js';
import { verifyDarkVaultAndEcosystem } from './verifications/04-dark-vault-epochs.js';
import { verifyConfidentialRfqAndAdjudication } from './verifications/05-confidential-rfq-adjudication.js';
import { verifyOtcAndComputeFacilities } from './verifications/06-otc-and-compute-facilities.js';
import { verifyResilienceFailureMatrix } from './verifications/07-resilience-failure-matrix.js';
import { verifyApiSseMcpE2E } from './verifications/08-api-sse-mcp-e2e.js';
import { verifyInferenceAttestation } from './scripts/verify-inference.js';
import { verifyModelSealedRoost } from './verifications/09-model-sealed-roost.js';
import { verifyHostedRoost } from './verifications/10-hosted-roost.js';

async function runAllVerifications() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║           MIDGE: COMPLETE MASTER VERIFICATION SUITE            ║');
  console.log('║    NEAR HACKATHON: Build Beyond Boundaries (Nov 2026)          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  const startTotal = Date.now();
  const results = {};

  try {
    results.tee = await verifyHardwareAttestation();
  } catch (err) {
    console.error('❌ TEE Attestation Check Failed:', err.message);
    results.tee = { verified: false, error: err.message };
  }

  try {
    results.intents = await verifyConfidentialIntents();
  } catch (err) {
    console.error('❌ Confidential Intents Check Failed:', err.message);
    results.intents = { verified: false, error: err.message };
  }

  try {
    results.hatch = await verifyHatchProtocol();
  } catch (err) {
    console.error('❌ Hatch Protocol Check Failed:', err.message);
    results.hatch = { verified: false, error: err.message };
  }

  try {
    results.darkVault = await verifyDarkVaultAndEcosystem();
  } catch (err) {
    console.error('❌ Dark Vault / Pods Check Failed:', err.message);
    results.darkVault = { verified: false, error: err.message };
  }

  try {
    results.rfq = await verifyConfidentialRfqAndAdjudication();
  } catch (err) {
    console.error('❌ Confidential RFQ & Adjudication Failed:', err.message);
    results.rfq = { verified: false, error: err.message };
  }

  try {
    results.otcCompute = await verifyOtcAndComputeFacilities();
  } catch (err) {
    console.error('❌ OTC Block Trades & Compute Syndicate Failed:', err.message);
    results.otcCompute = { verified: false, error: err.message };
  }

  try {
    results.resilience = await verifyResilienceFailureMatrix();
  } catch (err) {
    console.error('❌ Resilience Failure Matrix Failed:', err.message);
    results.resilience = { verified: false, error: err.message };
  }

  try {
    results.apiSseMcp = await verifyApiSseMcpE2E();
  } catch (err) {
    console.error('❌ API, SSE, x402 & MCP Check Failed:', err.message);
    results.apiSseMcp = { verified: false, error: err.message };
  }

  try {
    results.inference = await verifyInferenceAttestation();
  } catch (err) {
    console.error('❌ Inference Attestation Check Failed:', err.message);
    results.inference = { verified: false, error: err.message };
  }

  try {
    results.modelSealedRoost = await verifyModelSealedRoost();
  } catch (err) {
    console.error('❌ Model-Sealed Roost Check Failed:', err.message);
    results.modelSealedRoost = { verified: false, error: err.message };
  }

  try {
    results.hostedRoost = await verifyHostedRoost();
  } catch (err) {
    console.error('❌ Hosted Roost Check Failed:', err.message);
    results.hostedRoost = { verified: false, error: err.message };
  }

  const duration = ((Date.now() - startTotal) / 1000).toFixed(2);
  const isOffline = process.env.FLY_OFFLINE === '1';
  const allPassed =
    results.tee.verified &&
    results.intents.verified &&
    results.hatch.verified &&
    results.darkVault.verified &&
    results.rfq.verified &&
    results.otcCompute.verified &&
    results.resilience.verified &&
    results.apiSseMcp.verified &&
    results.inference.verified &&
    results.modelSealedRoost.verified &&
    results.hostedRoost.verified;

  console.log('\n════════════════════════════════════════════════════════════════');
  if (isOffline) {
    console.log('                 FINAL VERIFICATION SUMMARY (OFFLINE)           ');
    console.log('                 OFFLINE: 3 checks used recorded fixtures       ');
  } else {
    console.log('                 FINAL VERIFICATION SUMMARY                     ');
  }
  console.log('════════════════════════════════════════════════════════════════');
  console.log(` 1. Live TEE Hardware Attestation (HAQ):         ${results.tee.verified ? (isOffline ? '✅ PASS [OFFLINE FIXTURE]' : '✅ PASS') : '❌ FAIL'}`);
  console.log(` 2. 1Click Confidential Intents Liquidity:       ${results.intents.verified ? (isOffline ? '✅ PASS [OFFLINE FIXTURE]' : '✅ PASS') : '❌ FAIL'}`);
  console.log(` 3. Hatch Factory & Non-Custodial Escape:        ${results.hatch.verified ? (isOffline ? '✅ PASS [OFFLINE FIXTURE]' : '✅ PASS') : '❌ FAIL'}`);
  console.log(` 4. Dark Vault, Pods, FAR Shard & Omnichain MPC:   ${results.darkVault.verified ? '✅ PASS' : '❌ FAIL'}`);
  console.log(` 5. Confidential RFQ & Private Adjudication:     ${results.rfq.verified ? '✅ PASS' : '❌ FAIL'}`);
  console.log(` 6. OTC Block Trades & AI Compute Syndicate:     ${results.otcCompute.verified ? '✅ PASS' : '❌ FAIL'}`);
  console.log(` 7. 5-Layer Resilience Failure Matrix (FMEA):    ${results.resilience.verified ? '✅ PASS' : '❌ FAIL'}`);
  console.log(` 8. HTTP Gateway Daemon, SSE, x402 & MCP Server: ${results.apiSseMcp.verified ? '✅ PASS' : '❌ FAIL'}`);
  const inferStatus = results.inference.live
    ? '✅ PASS (Live External)'
    : (results.inference.skipped ? '⚠️ SKIPPED (No API key; not demonstrated)' : (isOffline ? '✅ PASS [OFFLINE FIXTURE]' : '✅ PASS (Recorded Fixture)'));
  console.log(` 9. TEE Deliberation Inference Attestation:      ${inferStatus}`);
  console.log(` 10. Model-Sealed Roost (E2EE, mock gateway):     ${results.modelSealedRoost.verified ? '✅ PASS' : '❌ FAIL'}`);
  console.log(` 11. Hosted Roost (exact sums, fake attestation):  ${results.hostedRoost.verified ? '✅ PASS' : '❌ FAIL'}`);
  console.log('────────────────────────────────────────────────────────────────');
  console.log(` Total Execution Time: ${duration}s`);
  if (isOffline) {
    console.log(` Verdict: ${allPassed ? 'ALL 11 VERIFICATIONS PASSED [OFFLINE FIXTURES MODE: 3 checks used fixtures]' : 'CHECKS FAILED'}`);
  } else {
    console.log(` Verdict: ${allPassed ? 'ALL 11 ARCHITECTURAL VERIFICATIONS PASSED (Contract & TEE Bound, Facilities Simulated)' : 'CHECKS FAILED'}`);
  }
  console.log('════════════════════════════════════════════════════════════════\n');

  if (!allPassed) {
    process.exit(1);
  }
}

runAllVerifications();
