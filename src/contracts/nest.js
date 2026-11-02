import crypto from 'node:crypto';
import { OutLayerPolicyGuard } from '../policies/outlayer.js';

/**
 * The Nest: On-chain Coordinator Smart Contract
 * Deployed to NEAR Protocol (`fly-coordinator.testnet`)
 */
export class FlyNestContract {
  constructor() {
    this.syndicates = new Map();
  }

  /**
   * hatch(): The programmatic syndicate factory.
   */
  hatch({
    syndicateId,
    quorumThreshold = 3,
    maxSpendPerFlyer = 100,
    expectedCodeHash,
    timeoutBlocks = 50,
    currentBlock = 1000,
  }) {
    if (this.syndicates.has(syndicateId)) {
      throw new Error(`Syndicate '${syndicateId}' already hatched.`);
    }

    const syndicate = {
      id: syndicateId,
      subAccount: `${syndicateId}.fly.testnet`,
      quorumThreshold,
      policyGuard: new OutLayerPolicyGuard({ maxSpendPerFlyer }),
      expectedCodeHash,
      timeoutBlocks,
      createdAtBlock: currentBlock,
      status: 'ACTIVE',
      escrow: new Map(), // flyerId -> amount
      totalEscrow: 0,
      roundNonce: crypto.randomBytes(32).toString('hex'),
    };

    this.syndicates.set(syndicateId, syndicate);
    return syndicate;
  }

  /**
   * deposit(): Locks funds into the syndicate escrow subject to OutLayer policy.
   */
  deposit(syndicateId, flyerId, amount, targetContract = 'fly-coordinator.testnet') {
    const syn = this.syndicates.get(syndicateId);
    if (!syn || syn.status !== 'ACTIVE') {
      throw new Error(`Syndicate '${syndicateId}' is inactive or not found.`);
    }

    // Policy boundary check
    syn.policyGuard.validateDeposit(flyerId, amount, targetContract);

    syn.escrow.set(flyerId, (syn.escrow.get(flyerId) || 0) + amount);
    syn.totalEscrow += amount;

    return {
      flyerId,
      amount,
      totalEscrow: syn.totalEscrow,
      subAccount: syn.subAccount,
    };
  }

  /**
   * settleBatch(): Verifies HAQ Attestation and executes cross-chain clearing.
   */
  settleBatch(syndicateId, { attestationNonce, enclaveCodeHash, aggregateOrder }) {
    const syn = this.syndicates.get(syndicateId);
    if (!syn || syn.status !== 'ACTIVE') {
      throw new Error(`Syndicate '${syndicateId}' is inactive or not found.`);
    }

    // HAQ Verification Check 1: Code Hash
    if (enclaveCodeHash !== syn.expectedCodeHash) {
      throw new Error(`[HAQ REJECT] MRENCLAVE code measurement mismatch! Expected ${syn.expectedCodeHash}`);
    }

    // HAQ Verification Check 2: Fresh Session Nonce (Replay Protection)
    if (attestationNonce !== syn.roundNonce) {
      throw new Error(`[HAQ REJECT] Stale or invalid nonce. Replay attack blocked.`);
    }

    // HAQ Verification Check 3: Quorum Threshold
    const activeFlyers = Array.from(syn.escrow.keys()).filter((f) => syn.escrow.get(f) > 0);
    if (activeFlyers.length < syn.quorumThreshold) {
      throw new Error(`[QUORUM REJECT] Active flyers (${activeFlyers.length}) below threshold (${syn.quorumThreshold}).`);
    }

    syn.status = 'SETTLED';
    return {
      status: 'SETTLED',
      clearedAmount: syn.totalEscrow,
      aggregateOrder,
      verifiedEnclave: enclaveCodeHash,
    };
  }

  /**
   * hatch_out(): Sovereign non-custodial escape hatch.
   * Allows 100% refund if the Roost or round stalls past block timeout.
   */
  hatchOut(syndicateId, currentBlock, flyerId) {
    const syn = this.syndicates.get(syndicateId);
    if (!syn) {
      throw new Error(`Syndicate '${syndicateId}' not found.`);
    }

    const blocksPassed = currentBlock - syn.createdAtBlock;
    if (blocksPassed < syn.timeoutBlocks && syn.status === 'ACTIVE') {
      throw new Error(
        `[Hatch-Out LOCKED] Round still in active deliberation (${blocksPassed}/${syn.timeoutBlocks} blocks passed).`
      );
    }

    const flyerBalance = syn.escrow.get(flyerId) || 0;
    if (flyerBalance <= 0) {
      throw new Error(`No escrow balance found for Flyer '${flyerId}'.`);
    }

    // Atomically refund and update status
    syn.escrow.set(flyerId, 0);
    syn.totalEscrow -= flyerBalance;
    syn.status = 'ABORTED_REFUNDED';

    return {
      syndicateId,
      refundedTo: flyerId,
      amount: flyerBalance,
      status: 'REFUNDED_100_PERCENT',
      timestamp: Date.now(),
    };
  }
}
