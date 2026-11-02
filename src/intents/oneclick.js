/**
 * 1Click Intent Adapter: Connects to NEAR Intents / FAR Private Shard
 */
export class OneClickIntentAdapter {
  constructor({ baseUrl = 'https://1click.chaindefuser.com/v0' } = {}) {
    this.baseUrl = baseUrl;
  }

  async fetchSupportedTokens() {
    const res = await fetch(`${this.baseUrl}/tokens`);
    if (!res.ok) {
      throw new Error(`Failed to fetch 1Click tokens: status ${res.status}`);
    }
    return res.json();
  }

  createConfidentialIntentPayload({
    originAsset = 'nep141:wrap.near',
    destinationAsset = 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
    amount,
    recipient,
    refundTo,
    slippageTolerance = 100, // 1.0%
    deadlineMinutes = 10,
  }) {
    return {
      dry: true,
      swapType: 'EXACT_INPUT',
      originAsset,
      depositType: 'ORIGIN_CHAIN',
      destinationAsset,
      amount: amount.toString(),
      recipient,
      recipientType: 'DESTINATION_CHAIN',
      refundTo,
      refundType: 'ORIGIN_CHAIN',
      slippageTolerance,
      confidentiality: 'basic', // Instructs 1Click to route via FAR Private Shard
      deadline: new Date(Date.now() + deadlineMinutes * 60000).toISOString(),
    };
  }

  calculateProRataDistribution(totalAcquired, memberContributions) {
    const totalPooled = Object.values(memberContributions).reduce((sum, v) => sum + v, 0);
    const payouts = {};

    for (const [member, contribution] of Object.entries(memberContributions)) {
      const share = contribution / totalPooled;
      payouts[member] = Math.floor(totalAcquired * share * 100) / 100;
    }

    return payouts;
  }
}
