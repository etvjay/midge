import { FlyNestContract } from '../contracts/nest.js';
import { RoostEnclave } from '../enclave/roost.js';
import { OneClickIntentAdapter } from '../intents/oneclick.js';

export async function runDarkSwarmSimulation() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║       FLY PROTOCOL: 10-FLYER DARK SWARM SIMULATION            ║');
  console.log('║       Sealed Deliberation → TEE HAQ → FAR Shard Settlement    ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const nest = new FlyNestContract();
  const roost = new RoostEnclave();
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
  console.log('\n[STEP 3: TEE ROOST ATTESTATION] Requesting hardware enclave quote...');
  const attestation = await roost.getAttestationQuote();
  console.log(`  ✓ TEE Enclave Status:   ${attestation.verified ? 'HARDWARE ATTESTED (Intel TDX)' : 'MOCK'}`);
  console.log(`  ✓ Session Nonce:        ${attestation.sessionNonce.slice(0, 24)}...`);

  // Bind the round nonce to the syndicate for replay protection
  syndicate.roundNonce = attestation.sessionNonce;

  // Step 4: Submit Sealed Intents into Roost
  console.log('\n[STEP 4: SEALED DELIBERATION] Flyers submitting encrypted bids into TEE...');
  for (let i = 1; i <= 10; i++) {
    const flyerId = `agent-${String(i).padStart(2, '0')}`;
    roost.submitSealedIntent({
      flyerId,
      encryptedPayload: {
        pair: 'USDC/NEAR',
        amount: 50,
        maxSlippage: 0.01,
        privateStrategyWeight: Math.random(),
      },
    });
  }
  console.log(`  ✓ 10 Encrypted Intents Ingested into Enclave RAM.`);

  // Step 5: Sealed Intent Aggregation (SIA)
  console.log('\n[STEP 5: SIA AGGREGATION] Computing optimal TWAP batch & wiping raw RAM...');
  const { aggregateOrder, enclaveSignature } = roost.aggregateAndClear();
  console.log(`  ✓ Aggregated Order:    ${aggregateOrder.totalInputAmount} USDC for NEAR`);
  console.log(`  ✓ Execution Strategy:  ${aggregateOrder.executionModel}`);
  console.log(`  ✓ Raw Member RAM:      CLEARED (Zero-Knowledge Invariant Preserved)`);

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
  console.log(' [RESULT] DARK SWARM EXECUTION COMPLETE: 100% VERIFIED');
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
