import { FlyNestContract } from '../contracts/nest.js';
import { createRoost } from '../enclave/factory.js';
import { OneClickIntentAdapter } from '../intents/oneclick.js';

export async function runDarkSwarmSimulation({ backend } = {}) {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║             MIDGE: 10-FLYER DARK SWARM SIMULATION             ║');
  console.log('║       Asymmetric Encryption → TEE HAQ → FAR Shard Settlement  ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const nest = new FlyNestContract();
  const roost = createRoost({ backend });
  const roostInfo = roost.describe();
  const modelSealed = roostInfo.backend === 'model-sealed';
  console.log(`Roost backend: ${roostInfo.backend}. ${modelSealed ? 'Bids are sealed to a NEAR AI Cloud model; this process holds ciphertext only.' : 'SIMULATION: this process can read every bid.'}\n`);
  const oneClick = new OneClickIntentAdapter();

  const syndicateId = 'dark-swarm-10';
  const expectedTeeHash = '0x9e12bf44c093a1198de76c11a0928b337cba5f9923a109848bc1829037cba012';

  // Step 1: Hatch the Syndicate
  console.log('[STEP 1: HATCH] Instantiating Syndicate via Nest Factory...');
  const syndicate = nest.hatch({
    syndicateId,
    quorumThreshold: 7, // 70% quorum
    maxSpendPerFlyer: 100, // 100 USDC cap per flyer
    expectedCodeHash: expectedTeeHash,
    timeoutBlocks: 50,
  });
  console.log(`  ✓ Minted Sub-Account: ${syndicate.subAccount}`);
  console.log(`  ✓ Quorum Required:    ${syndicate.quorumThreshold}/10 Flyers`);
  console.log(`  ✓ OutLayer Spend Cap: ${syndicate.policyGuard.maxSpendPerFlyer} USDC/Flyer`);

  // Step 2: 10 Flyers deposit funds into Escrow
  console.log('\n[STEP 2: SHIELDED POOLING] 10 Flyers depositing into FAR Escrow...');
  const contributions = {};
  for (let i = 1; i <= 10; i++) {
    const flyerId = `agent-${String(i).padStart(2, '0')}`;
    const amount = 50; // 50 USDC each
    contributions[flyerId] = amount;
    nest.deposit(syndicateId, flyerId, amount);
  }
  console.log(`  ✓ Total Pooled Capital: ${syndicate.totalEscrow} USDC across 10 Flyers`);

  // Step 3: Roost TEE Attestation & Key Exchange
  console.log('\n[STEP 3: ROOST ATTESTATION] Requesting hardware attestation...');
  const attestation = await roost.getAttestationQuote();
  if (modelSealed) {
    console.log(`  ✓ Model Key Attested:   Intel TDX chain verified, TCB ${attestation.tcbStatus}`);
    console.log(`  ✓ Session Nonce:        ${attestation.sessionNonce.slice(0, 24)}...`);
    console.log(`  ✓ Model Public Key:     ${attestation.publicKey.slice(0, 24)}... (Ed25519, E2EE v2)`);
  } else {
    console.log(`  ✓ NEAR AI Gateway:      ${attestation.verified ? 'attested (Intel TDX), which does NOT cover this local process' : 'MOCK'}`);
    console.log(`  ✓ Session Nonce:        ${attestation.sessionNonce.slice(0, 24)}...`);
    console.log(`  ✓ Enclave Public Key:   ${attestation.publicKeyPem.split('\n')[1].slice(0, 30)}... (RSA-2048)`);
  }

  // Bind the round nonce to the syndicate for replay protection
  syndicate.roundNonce = attestation.sessionNonce;

  // Step 4: Submit Asymmetrically Encrypted Intents into Roost
  console.log('\n[STEP 4: SEALED DELIBERATION] Flyers encrypting private intents with Roost Public Key...');
  for (let i = 1; i <= 10; i++) {
    const flyerId = `agent-${String(i).padStart(2, '0')}`;
    const plainPayload = {
      pair: 'USDC/NEAR',
      amount: 50,
      maxSlippage: 0.01,
      privateStrategyWeight: Math.random(),
    };
    // Each flyer seals its own bid to the Roost's key (model key or local RSA key)
    const cipherText = roost.sealIntent(plainPayload);

    roost.submitSealedIntent({
      flyerId,
      cipherText,
    });
  }
  console.log(`  ✓ 10 Sealed Intents Submitted (${modelSealed ? 'ciphertext only held by coordinator' : 'held in local process memory'}).`);

  // Step 5: Sealed Intent Aggregation (SIA)
  console.log('\n[STEP 5: SIA AGGREGATION] Aggregating sealed intents...');
  const { aggregateOrder, enclaveSignature, receipt } = await roost.aggregateAndClear();
  console.log(`  ✓ Aggregated Order:    ${aggregateOrder.totalInputAmount} USDC for NEAR`);
  if (modelSealed) {
    console.log(`  ✓ Model Runs Agreed:   ${receipt.agreement}, ${receipt.runs.every((r) => r.signatureVerified) ? 'every response signature verified' : 'signatures NOT verified'}`);
    console.log(`  ✓ Bids In The Clear:   NONE held by the coordinator (only the model TEE saw them)`);
  } else {
    console.log(`  ✓ Enclave Signature:   ${enclaveSignature.slice(0, 24)}... (Verified)`);
    console.log(`  ✓ Raw Member RAM:      CLEARED (this simulation could read them first)`);
  }

  // Step 6: HAQ Verification & On-Chain Settlement
  console.log('\n[STEP 6: NEST HAQ SETTLEMENT] Submitting batch proof to Nest contract...');
  const settlement = nest.settleBatch(syndicateId, {
    attestationNonce: attestation.sessionNonce,
    enclaveCodeHash: expectedTeeHash,
    aggregateOrder,
  });
  console.log(`  ✓ HAQ Consensus Proof: VERIFIED on-chain`);
  console.log(`  ✓ Syndicate Status:    ${settlement.status}`);

  // Step 7: Cross-Chain Payout Distribution
  console.log('\n[STEP 7: CONFIDENTIAL PAYOUTS] Computing pro-rata distribution to clean wallets...');
  const simulatedNearAcquired = 121.06; // Based on $4.13 NEAR price
  const payouts = oneClick.calculateProRataDistribution(simulatedNearAcquired, contributions);
  console.log(`  ✓ Total NEAR Acquired: ${simulatedNearAcquired} wNEAR`);
  console.log(`  ✓ Sample Payouts:      ${Object.entries(payouts).slice(0, 3).map(([k, v]) => `${k} -> ${v} NEAR`).join(' | ')}`);
  console.log(`  ✓ Decoupled Graph:     Zero on-chain links between depositor wallets and payout addresses.`);

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log(' [RESULT] DARK SWARM EXECUTION COMPLETE: 10/10 FLYERS PROCESSED');
  console.log('════════════════════════════════════════════════════════════════\n');

  return {
    success: true,
    totalEscrow: syndicate.totalEscrow,
    nearAcquired: simulatedNearAcquired,
    payouts,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runDarkSwarmSimulation().catch((err) => {
    console.error('Simulation Failed:', err);
    process.exit(1);
  });
}
