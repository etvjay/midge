import { EnclaveCrypto } from '../enclave/crypto.js';
import { sealBidForRoost } from '../enclave/member.js';

/**
 * Midge Developer SDK Client (@midge/sdk):
 * The unified client library for autonomous AI agents, algorithmic bots,
 * and institutional treasuries integrating with Midge on NEAR.
 */
export class FlyClient {
  constructor({ baseUrl = 'http://localhost:3000', apiKey = null, fetchFn = fetch } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey || null;
    this.fetch = fetchFn;
  }

  async _request(method, path, body = null, customHeaders = {}) {
    const url = `${this.baseUrl}${path}`;
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { 'X-Midge-Api-Key': this.apiKey } : {}),
        ...customHeaders,
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
  async hatchSyndicate({ id, syndicateId, type = 'FLASH', quorumThreshold = 3, maxSpendNear = 100, expectedCodeHash, timeoutBlocks = 50 }) {
    const sId = syndicateId || id;
    const res = await this._request('POST', '/v1/syndicates/hatch', {
      id: sId,
      syndicateId: sId,
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

  async listSyndicates({ fromIndex = 0, limit = 10 } = {}) {
    const res = await this._request('GET', `/v1/syndicates?fromIndex=${fromIndex}&limit=${limit}`);
    return res.data;
  }

  async getSyndicatesByMember(accountId, { fromIndex = 0, limit = 10 } = {}) {
    const res = await this._request('GET', `/v1/syndicates/member/${accountId}?fromIndex=${fromIndex}&limit=${limit}`);
    return res.data;
  }

  async deposit(syndicateId, flyerId, amountNear, policyHash = null) {
    const res = await this._request('POST', `/v1/syndicates/${syndicateId}/deposit`, {
      flyerId,
      amountNear,
      policyHash,
    });
    return res.data;
  }

  async settleBatch(syndicateId, { allocations = [], orderHash = null, epoch = null, nonce = null, enclaveSignature = null } = {}) {
    const res = await this._request('POST', `/v1/syndicates/${syndicateId}/settle`, {
      allocations,
      orderHash,
      epoch,
      nonce,
      enclaveSignature,
    });
    return res.data;
  }

  async hatchOut(syndicateId, flyerId = null) {
    const res = await this._request('POST', `/v1/syndicates/${syndicateId}/hatch-out`, {
      flyerId,
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

  /**
   * Seal a bid for a model-sealed Roost. Verifies the model attestation itself and refuses a key the
   * coordinator merely asserts. Pass the result's cipherTextHex to submitSealedIntent.
   */
  async sealBid({ intentPayload, session, ...verifyOptions }) {
    return sealBidForRoost({ session: session || (await this.getSessionKey()), payload: intentPayload, ...verifyOptions });
  }

  async submitSealedIntent({ syndicateId, flyerId, intentPayload, enclavePublicKeyPem, cipherTextHex }) {
    // model-sealed Roost: the caller already sealed the bid with sealBid(). Local simulation: RSA below.
    const body = cipherTextHex
      ? { syndicateId, flyerId, cipherTextHex }
      : { syndicateId, flyerId, cipherTextBase64: EnclaveCrypto.encryptIntent(intentPayload, enclavePublicKeyPem) };
    const res = await this._request('POST', '/v1/roost/intents/sealed', body);
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
  async emergencyHatchOut(syndicateId, flyerId, currentBlock = 2000) {
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
    const proofStr =
      typeof paymentProof === 'object' && paymentProof !== null
        ? (paymentProof.proof || `${paymentProof.receiptId}.${paymentProof.hmacSignature}`)
        : paymentProof;
    const headers = proofStr ? { Authorization: `X402-Proof ${proofStr}` } : {};
    return this._request('GET', `/v1/commerce/data/${resourceId}`, null, headers);
  }
}
