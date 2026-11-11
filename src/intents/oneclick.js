/**
 * 1Click Intent Adapter: Connects to NEAR Intents / FAR Private Shard
 */
export class OneClickIntentAdapter {
  constructor({ baseUrl = 'https://1click.chaindefuser.com/v0', authToken = null, fetchImpl = globalThis.fetch } = {}) {
    this.baseUrl = baseUrl;
    this.authToken = authToken;
    this.fetchImpl = fetchImpl;
  }

  async fetchSupportedTokens() {
    const res = await this.fetchImpl(`${this.baseUrl}/tokens`);
    if (!res.ok) {
      throw new Error(`Failed to fetch 1Click tokens: status ${res.status}`);
    }
    return res.json();
  }

  /**
   * A dry quote request: asks what a swap would return and moves nothing. `confidential: true` adds 1Click's confidentiality flag, which the
   * API only accepts for an authenticated user (checked live on 2026-11-11: HTTP 401 without a token), so it needs an auth token here.
   */
  createQuoteRequest({
    originAsset = 'nep141:wrap.near',
    destinationAsset = 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
    amount,
    recipient,
    refundTo,
    slippageTolerance = 100, // 1.0%
    deadlineMinutes = 10,
    confidential = false,
  }) {
    if (confidential && !this.authToken) throw new Error('confidential quotes need an auth token: 1Click requires an authenticated user for them');
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
      ...(confidential ? { confidentiality: 'basic' } : {}),
      deadline: new Date(Date.now() + deadlineMinutes * 60000).toISOString(),
    };
  }

  /** Kept for existing callers: the previous name, now with the same rules as createQuoteRequest. */
  createConfidentialIntentPayload(params) {
    return this.createQuoteRequest({ ...params, confidential: params.confidential ?? false });
  }

  /** Ask 1Click for a dry quote. Refuses anything that is not a dry quote, so this adapter cannot open a real swap. */
  async getDryQuote(params) {
    const headers = { 'content-type': 'application/json', ...(this.authToken ? { authorization: `Bearer ${this.authToken}` } : {}) };
    const res = await this.fetchImpl(`${this.baseUrl}/quote`, { method: 'POST', headers, body: JSON.stringify(this.createQuoteRequest(params)) });
    const json = await res.json();
    if (!res.ok) throw new Error(`1Click quote failed: ${res.status} ${json?.message ?? ''}`.trim());
    if (json?.quoteRequest?.dry !== true) throw new Error('1Click returned something that is not a dry quote');
    const q = json.quote ?? {};
    return { amountIn: q.amountInFormatted, amountOut: q.amountOutFormatted, usdIn: q.amountInUsd, usdOut: q.amountOutUsd, minAmountOut: q.minAmountOut, timeEstimateSeconds: q.timeEstimate, dry: true };
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
