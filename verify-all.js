import { verifyHardwareAttestation } from './verifications/01-hardware-attestation.js';
import { verifyConfidentialIntents } from './verifications/02-confidential-intents.js';
import { verifyHatchProtocol } from './verifications/03-hatch-escape-hatch.js';

async function runAllVerifications() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║       FLY PROTOCOL: CORE VERIFICATION SUITE (PHASE 1)         ║');
  console.log('║       NEAR L1 Hackathon: Build Beyond Boundaries (Nov 2026)    ║');
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

  const duration = ((Date.now() - startTotal) / 1000).toFixed(2);
  const allPassed = results.tee.verified && results.intents.verified && results.hatch.verified;

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('                 FINAL VERIFICATION SUMMARY                     ');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(` 1. Live TEE Hardware Attestation (HAQ):     ${results.tee.verified ? '✅ PASS' : '❌ FAIL'}`);
  console.log(` 2. 1Click Confidential Intents Liquidity:   ${results.intents.verified ? '✅ PASS' : '❌ FAIL'}`);
  console.log(` 3. Hatch Factory & Non-Custodial Escape:    ${results.hatch.verified ? '✅ PASS' : '❌ FAIL'}`);
  console.log('────────────────────────────────────────────────────────────────');
  console.log(` Total Execution Time: ${duration}s`);
  console.log(` Verdict: ${allPassed ? 'ALL VERIFICATIONS PASSED (READY FOR PHASE 2)' : 'CHECKS FAILED'}`);
  console.log('════════════════════════════════════════════════════════════════\n');

  if (!allPassed) {
    process.exit(1);
  }
}

runAllVerifications();
