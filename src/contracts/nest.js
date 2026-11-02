import crypto from 'node:crypto';
import { OutLayerPolicyGuard } from '../policies/outlayer.js';

/**
 * The Nest: On-chain Coordinator Smart Contract
 * Deployed to NEAR Protocol (`fly-coordinator.testnet`)
 * Mirrors Rust contracts/fly-coordinator state machine and security invariants:
 * 1. Storage deposit and ID format validation
 * 2. LookupMap-style bounded escrow accounting (<50 flyers, >=0.01 NEAR minimum)
 * 3. Domain-separated Ed25519 enclave signature verification
 * 4. Payout execution on Flash settlement
 * 5. Per-user hatch_out refund with epoch-reset timelocks on DarkVault
 */
export class FlyNestContract {
  constructor({ contractId = 'fly-coordinator.testnet' } = {}) {
    this.contractId = contractId;
    this.syndicates = new Map();
  }

  /**
   * hatch(): The programmatic syndicate factory.
   * Supports both 'FLASH' (ephemeral single-round) and 'DARK_VAULT' (persistent multi-epoch).
   */
  hatch({
    syndicateId,
    syndicateType = 'FLASH',
    quorumThreshold = 3,
    maxSpendPerFlyer = 100,
    enclavePublicKey,
    expectedCodeHash,
    timeoutBlocks = 50,
    currentBlock = 1000,
    payoutRecipient,
  }) {
    if (this.syndicates.has(syndicateId)) {
      throw new Error(`Syndicate '${syndicateId}' already hatched.`);
    }

    if (!syndicateId || !/^[a-z0-9_-]{3,64}$/.test(syndicateId)) {
      throw new Error(`[Hatch REJECT] Invalid syndicate ID '${syndicateId}'. Must be 3-64 chars [a-z0-9_-].`);
    }

    if (quorumThreshold < 1) {
      throw new Error('[Hatch REJECT] quorum_threshold must be >= 1.');
    }
    if (timeoutBlocks < 1) {
      throw new Error('[Hatch REJECT] timeout_blocks must be >= 1.');
    }

    const syndicate = {
      id: syndicateId,
      contractId: this.contractId,
      type: syndicateType, // 'FLASH' or 'DARK_VAULT'
      subAccount: `${syndicateId}.${this.contractId}`,
      quorumThreshold,
      policyGuard: new OutLayerPolicyGuard({ maxSpendPerFlyer }),
      enclavePublicKey: enclavePublicKey || crypto.randomBytes(32).toString('hex'),
      expectedCodeHash,
      timeoutBlocks,
      createdAtBlock: currentBlock,
      epochStartBlock: currentBlock,
      status: 'ACTIVE',
      epoch: 1,
      escrow: new Map(), // flyerId -> amount
      totalEscrow: 0,
      flyerCount: 0,
      activeFlyerCount: 0,
      roundNonce: crypto.randomBytes(32).toString('hex'),
      settledBatches: [],
      totalSettledPayouts: 0,
      payoutRecipient: payoutRecipient || `${syndicateId}-treasury.near`,
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

    if (amount < 0.01) {
      throw new Error('[Deposit REJECT] Minimum deposit of 0.01 NEAR required.');
    }

    // Policy boundary check
    syn.policyGuard.validateDeposit(flyerId, amount, targetContract);

    const prevBalance = syn.escrow.get(flyerId) || 0;
    if (prevBalance === 0) {
      if (syn.flyerCount >= 50) {
        throw new Error('[Deposit REJECT] Maximum 50 flyers reached for this syndicate.');
      }
      syn.flyerCount += 1;
      syn.activeFlyerCount += 1;
    }

    syn.escrow.set(flyerId, prevBalance + amount);
    syn.totalEscrow += amount;

    return {
      flyerId,
      amount,
      totalEscrow: syn.totalEscrow,
      subAccount: syn.subAccount,
    };
  }

  /**
   * settleBatch(): Verifies HAQ Attestation and executes settlement payout.
   */
  settleBatch(
    syndicateId,
    { attestationNonce, enclaveCodeHash, aggregateOrder, enclaveSignature, payoutAccount, currentBlock = null }
  ) {
    const syn = this.syndicates.get(syndicateId);
    if (!syn || syn.status !== 'ACTIVE') {
      throw new Error(`Syndicate '${syndicateId}' is inactive or not found.`);
    }

    // HAQ Verification Check 1: Code Hash
    if (enclaveCodeHash && syn.expectedCodeHash && enclaveCodeHash !== syn.expectedCodeHash) {
      throw new Error(`[HAQ REJECT] MRENCLAVE code measurement mismatch! Expected ${syn.expectedCodeHash}`);
    }

    // HAQ Verification Check 2: Fresh Session Nonce (Replay Protection)
    if (attestationNonce !== syn.roundNonce) {
      throw new Error(`[HAQ REJECT] Stale or invalid nonce. Replay attack blocked.`);
    }

    // HAQ Verification Check 3: Quorum Threshold
    if (syn.activeFlyerCount < syn.quorumThreshold) {
      throw new Error(
        `[QUORUM REJECT] Active flyers (${syn.activeFlyerCount}) below threshold (${syn.quorumThreshold}).`
      );
    }

    // HAQ Verification Check 4: Ed25519 Enclave Signature with Domain Separation
    if (enclaveSignature) {
      try {
        const spkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');
        const rawPk = Buffer.from(syn.enclavePublicKey, 'hex');
        const keyObj = crypto.createPublicKey({
          key: Buffer.concat([spkiPrefix, rawPk]),
          format: 'der',
          type: 'spki',
        });
        const orderHash = typeof aggregateOrder === 'string' ? aggregateOrder : JSON.stringify(aggregateOrder);
        // Message includes (contractId, id, epoch, roundNonce, orderHash)
        const msg = Buffer.from(`${syn.contractId}:${syn.id}:${syn.epoch}:${syn.roundNonce}:${orderHash}`);
        const sig = Buffer.from(enclaveSignature, 'hex');
        const valid = crypto.verify(null, msg, keyObj, sig);
        if (!valid) {
          throw new Error('[HAQ REJECT] Invalid enclave Ed25519 signature over deliberation batch!');
        }
      } catch (err) {
        if (err.message.includes('[HAQ REJECT]')) throw err;
        throw new Error(`[HAQ REJECT] Enclave signature verification failed: ${err.message}`);
      }
    }

    const receipt = {
      clearedAmount: syn.totalEscrow,
      aggregateOrder,
      verifiedEnclave: enclaveCodeHash,
      settledAt: Date.now(),
    };

    if (syn.type === 'FLASH') {
      // Ephemeral Flash Syndicate dissolves after transferring pooled funds to settlement recipient
      const payoutTarget = payoutAccount || syn.payoutRecipient;
      receipt.payoutTarget = payoutTarget;
      receipt.payoutTransferred = syn.totalEscrow;
      syn.totalSettledPayouts += syn.totalEscrow;
      syn.totalEscrow = 0;
      syn.status = 'SETTLED';
      receipt.lifecycle = 'FLASH_DISSOLVED_AND_PAID';
    } else {
      // Persistent Dark Vault advances epoch and resets deliberation timer
      syn.settledBatches.push(receipt);
      syn.epoch += 1;
      syn.epochStartBlock = currentBlock || Date.now();
      syn.roundNonce = crypto.randomBytes(32).toString('hex'); // Fresh nonce for next epoch
      receipt.lifecycle = `DARK_VAULT_EPOCH_${syn.epoch}`;
      receipt.nextEpochNonce = syn.roundNonce;
    }

    return {
      status: syn.status,
      syndicateType: syn.type,
      ...receipt,
    };
  }

  /**
   * hatch_out(): Sovereign non-custodial escape hatch.
   * Allows 100% refund if the Roost or round stalls past block timeout.
   * In DarkVault, timeout is measured from current epoch start block.
   */
  hatchOut(syndicateId, currentBlock, flyerId) {
    const syn = this.syndicates.get(syndicateId);
    if (!syn) {
      throw new Error(`Syndicate '${syndicateId}' not found.`);
    }

    if (syn.status === 'SETTLED') {
      throw new Error('[Hatch-Out REJECT] Cannot hatch out of a settled syndicate.');
    }

    const blocksPassed = currentBlock - syn.epochStartBlock;
    if (blocksPassed < syn.timeoutBlocks && syn.status === 'ACTIVE') {
      throw new Error(
        `[Hatch-Out LOCKED] Round still in active deliberation (${blocksPassed}/${syn.timeoutBlocks} blocks passed).`
      );
    }

    const flyerBalance = syn.escrow.get(flyerId) || 0;
    if (flyerBalance <= 0) {
      throw new Error(`No escrow balance found for Flyer '${flyerId}'.`);
    }

    // Atomically refund caller
    syn.escrow.set(flyerId, 0);
    syn.totalEscrow -= flyerBalance;
    syn.activeFlyerCount = Math.max(0, syn.activeFlyerCount - 1);

    if (syn.totalEscrow <= 0) {
      syn.status = 'ABORTED_REFUNDED';
    }

    return {
      syndicateId,
      refundedTo: flyerId,
      amount: flyerBalance,
      status: 'REFUNDED_100_PERCENT',
      remainingEscrow: syn.totalEscrow,
      timestamp: Date.now(),
    };
  }
}
