import crypto from 'node:crypto';

/**
 * FAR Private Shard & IMT Token Bridge:
 * Models the dedicated, permissioned NEAR private shard with PBFT consensus (~200ms finality),
 * zero public explorer exposure, and the IMT (Intent Minted Tokens) lifecycle.
 */
/** Amounts are finite positive numbers. A negative or non-numeric one would add tokens instead of removing them. */
function requireAmount(value, what) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error(`[FAR REJECT] ${what} must be a finite positive amount.`);
}

export class FarPrivateShardBridge {
  constructor() {
    this.publicTreasuryLocked = new Map(); // assetId -> amount
    this.privateImtBalances = new Map(); // account -> { assetId, amount }
    this.privateRelayTrades = [];
    this.issuedReceipts = new Map(); // receiptId -> { assetId, amount, minted }: only these can mint, once each
  }

  /**
   * Step 1: Lock public tokens in intents.near Treasury.
   */
  lockPublicTreasury({ depositor, assetId, amount }) {
    requireAmount(amount, 'the locked amount');
    const current = this.publicTreasuryLocked.get(assetId) || 0;
    this.publicTreasuryLocked.set(assetId, current + amount);

    // Generate deposit receipt
    const depositReceipt = {
      receiptId: `dep_${crypto.randomBytes(16).toString('hex')}`,
      depositor,
      assetId,
      amount,
      status: 'LOCKED_IN_PUBLIC_TREASURY',
      timestamp: Date.now(),
    };

    this.issuedReceipts.set(depositReceipt.receiptId, { assetId, amount, minted: false });
    return depositReceipt;
  }

  /**
   * Step 2: Private PoA Bridge mints IMT on FAR Private Shard.
   */
  mintImtOnFar({ depositReceipt, privateAccount }) {
    if (depositReceipt.status !== 'LOCKED_IN_PUBLIC_TREASURY') {
      throw new Error('Cannot mint IMT without verified public treasury lock.');
    }
    // Trust what this bridge recorded, not what the caller's object says: the receipt must be one we issued, unused,
    // and it mints the amount that was locked.
    const issued = this.issuedReceipts.get(depositReceipt.receiptId);
    if (!issued) throw new Error('Cannot mint IMT: this receipt was not issued by this bridge (unknown receipt).');
    if (issued.minted) throw new Error('Cannot mint IMT: this deposit receipt has already minted.');
    issued.minted = true;

    const imtAssetId = `imt:${issued.assetId}`;
    const current = this.privateImtBalances.get(privateAccount) || 0;
    this.privateImtBalances.set(privateAccount, current + issued.amount);

    return {
      imtAssetId,
      privateAccount,
      mintedAmount: issued.amount,
      shard: 'FAR_PRIVATE_SHARD_01',
      consensus: 'PBFT_200MS',
      status: 'MINTED_SHIELDED',
    };
  }

  /**
   * Step 3: Match & Settle inside the FAR Private Shard (No Public RPC).
   */
  executePrivateMatch({ orderId, inputAccount, inputAmount, outputAsset, outputAmount }) {
    requireAmount(inputAmount, 'the input amount');
    const balance = this.privateImtBalances.get(inputAccount) || 0;
    if (balance < inputAmount) {
      throw new Error(`Insufficient IMT balance on FAR shard: has ${balance}, needs ${inputAmount}`);
    }

    // Deduct input IMT
    this.privateImtBalances.set(inputAccount, balance - inputAmount);

    const privateTrade = {
      orderId,
      inputAccount,
      inputAmount,
      outputAsset,
      outputAmount,
      matchedAt: Date.now(),
      finality: '~200ms PBFT',
      explorerVisibility: 'HIDDEN',
    };

    this.privateRelayTrades.push(privateTrade);
    return privateTrade;
  }

  /**
   * Step 4: Burn IMT and withdraw to an unlinked destination wallet.
   */
  burnImtAndWithdraw({ privateAccount, imtAmount, publicDestinationWallet, destinationChain = 'near' }) {
    requireAmount(imtAmount, 'the burn amount');
    // Burn private-side tokens
    const balance = this.privateImtBalances.get(privateAccount) || 0;
    if (balance < imtAmount) {
      throw new Error('Insufficient IMT balance to burn');
    }
    this.privateImtBalances.set(privateAccount, balance - imtAmount);

    const withdrawalReceipt = {
      withdrawalId: `with_${crypto.randomBytes(16).toString('hex')}`,
      burnedImt: imtAmount,
      publicDestinationWallet,
      destinationChain,
      decoupledFrom: 'DEPOSITOR_GRAPH_BROKEN',
      timestamp: Date.now(),
      status: 'RELEASED_CLEAN',
    };

    return withdrawalReceipt;
  }
}
