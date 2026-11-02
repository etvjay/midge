import { EnclaveCrypto } from '../enclave/crypto.js';

/**
 * Fly Developer SDK Client (@fly-network/sdk):
 * The unified client library for autonomous AI agents, algorithmic bots,
 * and institutional treasuries integrating with Fly on NEAR.
 */
export class FlyClient {
  constructor({ baseUrl = 'http://localhost:3000', fetchFn = fetch } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.fetch = fetchFn;
  }

  async _request(method, path, body = null, headers = {}) {
    const url = `${this.baseUrl}${path}`;
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await this.fetch(url, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok && res.status !== 402) {
      throw new Error(data.error || `HTTP ${res.status}: ${res.statusText}`);
    }
    return { status: res.status, headers: res.headers, data };
  }

  // --- 1. Syndicate Lifecycle ---
  async hatchSyndicate({ id, type = 'FLASH', quorumThreshold = 3, maxSpendNear = 100, expectedCodeHash, timeoutBlocks = 50 }) {
    const res = await this._request('POST', '/v1/syndicates/hatch', {
      id,
      type,
      quorumThreshold,
      maxSpendNear,
      expectedCodeHash,
      timeoutBlocks,
    });
    return res.data;
  }

  async getSyndicate(id) {
    const res = await this._request('GET', `/v1/syndicates/${id}`);
    return res.data;
  }

  async deposit(syndicateId, flyerId, amountNear) {
    const res = await this._request('POST', `/v1/syndicates/${syndicateId}/deposit`, {
      flyerId,
      amountNear,
    });
    return res.data;
  }

  // --- 2. Roost Enclave & Cryptography ---
  async getSessionKey() {
    const res = await this._request('GET', '/v1/roost/session-key');
    return res.data;
  }

  async getAttestationQuote(nonce) {
    const res = await this._request('GET', `/v1/roost/attestation${nonce ? `?nonce=${nonce}` : ''}`);
    return res.data;
  }

  async submitSealedIntent({ syndicateId, flyerId, intentPayload, enclavePublicKeyPem }) {
    // Encrypt client-side using enclave RSA public key
    const cipherTextBase64 = EnclaveCrypto.encryptIntent(intentPayload, enclavePublicKeyPem);
    const res = await this._request('POST', '/v1/roost/intents/sealed', {
      syndicateId,
      flyerId,
      cipherTextBase64,
    });
    return res.data;
  }

  async triggerBatchAggregation(syndicateId) {
    const res = await this._request('POST', '/v1/roost/aggregate', { syndicateId });
    return res.data;
  }

  // --- 3. Dark Facilities: RFQ & Private Credit ---
  async createRfq(rfqParams) {
    const res = await this._request('POST', '/v1/facilities/rfq', rfqParams);
    return res.data;
  }

  async submitRfqQuote(rfqId, quoteParams) {
    const res = await this._request('POST', `/v1/facilities/rfq/${rfqId}/quote`, quoteParams);
    return res.data;
  }

  async matchRfqLoan(rfqId) {
    const res = await this._request('POST', `/v1/facilities/rfq/${rfqId}/match`);
    return res.data;
  }

  async checkLoanHealth(loanId, collateralPriceUsd) {
    const res = await this._request('GET', `/v1/facilities/rfq/loans/${loanId}/health?collateralPrice=${collateralPriceUsd}`);
    return res.data;
  }

  // --- 4. Dark Facilities: OTC Block Trades ---
  async submitOtcOrder(orderParams) {
    const res = await this._request('POST', '/v1/facilities/otc/orders', orderParams);
    return res.data;
  }

  async crossOtcOrders(buyOrderId, sellOrderId, referencePrice) {
    const res = await this._request('POST', '/v1/facilities/otc/cross', {
      buyOrderId,
      sellOrderId,
      referencePrice,
    });
    return res.data;
  }

  // --- 5. Dark Facilities: AI Compute Syndicate ---
  async depositComputeCredits(flyerId, amountNear) {
    const res = await this._request('POST', '/v1/facilities/compute/credits', { flyerId, amountNear });
    return res.data;
  }

  async executeComputeInference(prompt, requiredQuorum = 2) {
    const res = await this._request('POST', '/v1/facilities/compute/infer', { prompt, requiredQuorum });
    return res.data;
  }

  // --- 6. Omnichain MPC ---
  async getOmnichainIdentity(subAccount, derivationPath = 'syndicate-treasury') {
    const res = await this._request('GET', `/v1/mpc/identities/${subAccount}?derivationPath=${derivationPath}`);
    return res.data;
  }

  async requestMpcSignature(params) {
    const res = await this._request('POST', '/v1/mpc/sign', params);
    return res.data;
  }

  // --- 7. Emergency Escape Hatch ---
  async hatchOut(syndicateId, flyerId, currentBlock = 2000) {
    const res = await this._request('POST', '/v1/emergency/hatch-out', {
      syndicateId,
      flyerId,
      currentBlock,
    });
    return res.data;
  }

  // --- 8. x402 Agent Micro-Commerce ---
  async createX402Challenge(params) {
    const res = await this._request('POST', '/v1/commerce/challenge', params);
    return res.data;
  }

  async settleX402Invoice(params) {
    const res = await this._request('POST', '/v1/commerce/settle', params);
    return res.data;
  }

  async fetchProtectedResource(resourceId, paymentProof = null) {
    const headers = paymentProof ? { Authorization: `X402-Proof ${paymentProof}` } : {};
    return this._request('GET', `/v1/commerce/data/${resourceId}`, null, headers);
  }
}
