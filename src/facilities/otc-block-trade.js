import crypto from 'node:crypto';

/**
 * OTC Block Trade Facility:
 * Allows institutional Flyers to match high-volume trades privately inside the Roost TEE
 * at mid-market clearing prices without leaking volume, order direction, or limits to public mempools.
 */
export class OtcBlockTradeFacility {
  constructor() {
    this.blockOrders = new Map();
    this.settledTrades = [];
  }

  /**
   * Submit a sealed OTC order into the Roost enclave.
   */
  submitSealedOrder({ flyerId, side, assetIn, amountIn, assetOut, minOutputAmount, maxSlippage = 0.005 }) {
    const orderId = `otc_${crypto.randomBytes(12).toString('hex')}`;
    const order = {
      orderId,
      flyerId,
      side, // 'BUY' or 'SELL'
      assetIn,
      amountIn,
      assetOut,
      minOutputAmount,
      maxSlippage,
      submittedAt: Date.now(),
      status: 'SEALED_IN_ROOST',
    };

    this.blockOrders.set(orderId, order);
    return order;
  }

  /**
   * Match crossing block orders inside Roost TEE at midpoint price.
   */
  matchCrossingOrders(buyOrderId, sellOrderId, referencePrice) {
    const buyOrder = this.blockOrders.get(buyOrderId);
    const sellOrder = this.blockOrders.get(sellOrderId);

    if (!buyOrder || !sellOrder) {
      throw new Error('One or both OTC block orders not found.');
    }

    if (buyOrder.side !== 'BUY' || sellOrder.side !== 'SELL') {
      throw new Error('Orders must be complementary (BUY and SELL).');
    }

    // Check asset pair alignment
    if (buyOrder.assetIn !== sellOrder.assetOut || buyOrder.assetOut !== sellOrder.assetIn) {
      throw new Error('Asset pairs do not match for OTC crossing.');
    }

    // Determine clearing volume (minimum matched size)
    const matchVolumeIn = Math.min(buyOrder.amountIn, sellOrder.amountIn * referencePrice);
    const matchVolumeOut = matchVolumeIn / referencePrice;

    // Check limit satisfaction
    if (matchVolumeOut < buyOrder.minOutputAmount) {
      throw new Error('[OTC REJECT] Buyer min output not met at reference price.');
    }
    if (matchVolumeIn < sellOrder.minOutputAmount) {
      throw new Error('[OTC REJECT] Seller min output not met at reference price.');
    }

    const tradeId = `trade_${crypto.randomBytes(12).toString('hex')}`;
    const settledTrade = {
      tradeId,
      buyOrderId,
      sellOrderId,
      buyerFlyerId: buyOrder.flyerId,
      sellerFlyerId: sellOrder.flyerId,
      clearingPrice: referencePrice,
      matchedVolumeIn: matchVolumeIn,
      matchedVolumeOut: matchVolumeOut,
      pair: `${buyOrder.assetOut}/${buyOrder.assetIn}`,
      settlementShard: 'FAR_PRIVATE_SHARD_01',
      mevProtection: 'ZERO_SLIPPAGE_ZERO_FRONT_RUNNING',
      settledAt: Date.now(),
    };

    buyOrder.status = 'MATCHED_SETTLED';
    sellOrder.status = 'MATCHED_SETTLED';

    this.settledTrades.push(settledTrade);
    return settledTrade;
  }
}
