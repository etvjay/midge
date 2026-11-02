/**
 * OutLayer Policy Guard: Enforces strict spending boundaries
 * and whitelisted receiver contract execution for autonomous Flyers.
 */
export class OutLayerPolicyGuard {
  constructor({ maxSpendPerFlyer = 100, whitelistedReceiver = 'fly-coordinator.testnet' } = {}) {
    this.maxSpendPerFlyer = maxSpendPerFlyer;
    this.whitelistedReceiver = whitelistedReceiver;
  }

  validateDeposit(flyerId, amount, targetContract) {
    if (targetContract !== this.whitelistedReceiver) {
      throw new Error(`[OutLayer REJECT] Unauthorized contract target: ${targetContract}. Whitelist only.`);
    }

    if (amount > this.maxSpendPerFlyer) {
      throw new Error(
        `[OutLayer REJECT] Flyer '${flyerId}' attempted to allocate ${amount} USDC, exceeding policy limit of ${this.maxSpendPerFlyer} USDC.`
      );
    }

    return true;
  }
}
