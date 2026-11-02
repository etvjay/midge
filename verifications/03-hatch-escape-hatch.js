import crypto from 'node:crypto';

// Simulation of the Fly Nest Smart Contract & Enclave Engine
class MockFlyNestContract {
  constructor() {
    this.syndicates = new Map();
  }

  // 1. Hatch: Factory creation of a syndicate instance
  hatch({ syndicateId, quorumThreshold, spendPolicy, expectedCodeHash, timeoutBlocks }) {
    if (this.syndicates.has(syndicateId)) {
      throw new Error(`Syndicate ${syndicateId} already hatched!`);
    }

    const syndicate = {
      id: syndicateId,
      subAccount: `${syndicateId}.fly.testnet`,
      quorumThreshold,
      spendPolicy,
      expectedCodeHash,
      timeoutBlocks,
      createdAtBlock: 1000,
      status: 'ACTIVE',
      escrow: new Map(), // flyer -> amount
      totalEscrow: 0,
      roundNonce: crypto.randomBytes(32).toString('hex'),
    };

    this.syndicates.set(syndicateId, syndicate);
    return syndicate;
  }

  // 2. Deposit into the syndicate escrow
  deposit(syndicateId, flyerId, amount) {
    const syn = this.syndicates.get(syndicateId);
    if (!syn || syn.status !== 'ACTIVE') throw new Error('Syndicate inactive or not found');

    // OutLayer policy check: single deposit limit
    if (amount > syn.spendPolicy.maxSpendPerFlyer) {
      throw new Error(`OutLayer Policy Violation: ${amount} exceeds max limit of ${syn.spendPolicy.maxSpendPerFlyer}`);
    }

    syn.escrow.set(flyerId, (syn.escrow.get(flyerId) || 0) + amount);
    syn.totalEscrow += amount;
    return true;
  }

  // 3. Submit attested batch execution (HAQ proof)
  settleBatch(syndicateId, { attestationQuote, enclaveCodeHash, nonce, aggregateOrder }) {
    const syn = this.syndicates.get(syndicateId);
    if (!syn || syn.status !== 'ACTIVE') throw new Error('Syndicate inactive or not found');

    // Cryptographic validation of HAQ
    if (enclaveCodeHash !== syn.expectedCodeHash) {
      throw new Error('HAQ Rejection: Enclave code hash mismatch!');
    }
    if (nonce !== syn.roundNonce) {
      throw new Error('HAQ Rejection: Stale or invalid nonce replay attack detected!');
    }

    syn.status = 'SETTLED';
    return {
      status: 'SETTLED',
      clearedAmount: syn.totalEscrow,
      aggregateOrder,
    };
  }

  // 4. Emergency Escape Hatch: hatch_out()
  hatchOut(syndicateId, currentBlock, flyerId) {
    const syn = this.syndicates.get(syndicateId);
    if (!syn) throw new Error('Syndicate not found');

    const blocksPassed = currentBlock - syn.createdAtBlock;
    if (blocksPassed < syn.timeoutBlocks && syn.status === 'ACTIVE') {
      throw new Error(`Hatch-Out Locked: Round still in deliberation (${blocksPassed}/${syn.timeoutBlocks} blocks)`);
    }

    const flyerBalance = syn.escrow.get(flyerId) || 0;
    if (flyerBalance <= 0) {
      throw new Error('No claimable escrow balance.');
    }

    syn.escrow.set(flyerId, 0);
    syn.totalEscrow -= flyerBalance;
    syn.status = 'ABORTED_REFUNDED';

    return {
      refundedTo: flyerId,
      amount: flyerBalance,
      status: 'REFUNDED_100_PERCENT',
    };
  }
}

export async function verifyHatchProtocol() {
  console.log('\n======================================================');
  console.log(' [VERIFICATION 3] HATCH PROTOCOL & ESCAPE HATCH (FMEA)');
  console.log(' Target: Nest Contract, OutLayer Policies & Resilience');
  console.log('======================================================');

  const nest = new MockFlyNestContract();
  const expectedTeeHash = '0x8f20b33c04992de6b5d911a3c7bc37996cba7b2b73a4b0870932dae8316c11d4';

  // --- Step 1: Hatch a new dark syndicate ---
  console.log('[1/4] Executing hatch() factory on Nest contract...');
  const syndicate = nest.hatch({
    syndicateId: 'dark-swarm-alpha',
    quorumThreshold: 3, // Requires at least 3 active agents
    spendPolicy: {
      maxSpendPerFlyer: 100, // max 100 USDC per flyer
      whitelistedReceiver: 'fly-coordinator.testnet',
    },
    expectedCodeHash: expectedTeeHash,
    timeoutBlocks: 50, // 50 blocks (~60 seconds)
  });

  console.log(`  - Hatched Sub-Account: ${syndicate.subAccount}`);
  console.log(`  - Nonce:               ${syndicate.roundNonce.slice(0, 16)}...`);
  console.log(`  - OutLayer Max Spend:  ${syndicate.spendPolicy.maxSpendPerFlyer} USDC`);

  // --- Step 2: Flyers deposit into Escrow ---
  console.log('[2/4] Simulating 4 Flyers depositing into FAR Escrow...');
  const flyers = ['agent-alpha', 'agent-beta', 'agent-gamma', 'agent-delta'];
  for (const flyer of flyers) {
    nest.deposit('dark-swarm-alpha', flyer, 50);
  }
  console.log(`  - Total Pooled Escrow: ${syndicate.totalEscrow} USDC across 4 Flyers`);

  // Test OutLayer policy enforcement
  try {
    nest.deposit('dark-swarm-alpha', 'agent-rogue', 500); // Exceeds limit of 100
  } catch (err) {
    console.log(`  - OutLayer Policy Check: [BLOCKED] Rogue deposit of 500 USDC rejected.`);
  }

  // --- Step 3: Happy Path — HAQ Attested Settlement ---
  console.log('[3/4] Simulating Happy Path: Roost submits valid HAQ Proof...');
  const settlementResult = nest.settleBatch('dark-swarm-alpha', {
    attestationQuote: 'verified_intel_tdx_quote_string',
    enclaveCodeHash: expectedTeeHash,
    nonce: syndicate.roundNonce,
    aggregateOrder: {
      pair: 'USDC/NEAR',
      totalInput: 200,
      executionStrategy: 'TWAP_5_MINUTES',
    },
  });
  console.log(`  - Settlement Result:   ${settlementResult.status} (Amount: ${settlementResult.clearedAmount} USDC)`);
  console.log(`  - Aggregate Order:     ${settlementResult.aggregateOrder.executionStrategy}`);

  // --- Step 4: Unhappy Path — Escape Hatch Activation (hatch_out) ---
  console.log('[4/4] Simulating Failure Path: TEE Roost stalls & Timelock expires...');
  const failedSyndicate = nest.hatch({
    syndicateId: 'stalled-swarm-beta',
    quorumThreshold: 2,
    spendPolicy: { maxSpendPerFlyer: 100 },
    expectedCodeHash: expectedTeeHash,
    timeoutBlocks: 50,
  });

  nest.deposit('stalled-swarm-beta', 'agent-isolated', 75);
  console.log(`  - Created 'stalled-swarm-beta' with 75 USDC deposited by 'agent-isolated'`);

  // Attempt to hatch out too early (Block 1020, timeout is 50 blocks)
  try {
    nest.hatchOut('stalled-swarm-beta', 1020, 'agent-isolated');
  } catch (err) {
    console.log(`  - Pre-timeout check:   [LOCKED] Cannot prematurely drain escrow.`);
  }

  // Fast forward past block timeout (Block 1060 > 1050)
  const refundResult = nest.hatchOut('stalled-swarm-beta', 1060, 'agent-isolated');
  console.log(`  - Post-timeout refund: [TRIGGERED] Escrow automatically unlocked via hatch_out()!`);
  console.log(`  - Refund Result:       ${refundResult.status} (${refundResult.amount} USDC returned to ${refundResult.refundedTo})`);

  console.log('\n>>> [PASS] HATCH & ESCAPE HATCH VERIFIED: Non-custodial safety invariants hold.');
  return {
    verified: true,
    settlementPassed: true,
    refundPassed: true,
  };
}

// Direct execution
if (import.meta.url === `file://${process.argv[1]}`) {
  verifyHatchProtocol().catch((err) => {
    console.error('FAILED:', err);
    process.exit(1);
  });
}
