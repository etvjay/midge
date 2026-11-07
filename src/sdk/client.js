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

  async health() {
    const res = await this._request('GET', '/v1/health');
    return res.data;
  }

  /**
   * Server-sent events as an async iterator of { event, data }. Break out of the loop (or pass an AbortSignal) to close
   * the connection. The first event is "connected".
   */
  async *_stream(path, { signal } = {}) {
    const controller = new AbortController();
    if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });
    const res = await this.fetch(`${this.baseUrl}${path}`, {
      headers: { Accept: 'text/event-stream', ...(this.apiKey ? { 'X-Midge-Api-Key': this.apiKey } : {}) },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}: ${res.statusText}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const event = block.match(/^event: (.*)$/m)?.[1];
          const raw = block.match(/^data: (.*)$/m)?.[1];
          if (!event) continue;
          let data = null;
          try { data = raw === undefined ? null : JSON.parse(raw); } catch { data = raw; }
          yield { event, data };
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') throw err;
    } finally {
      controller.abort();
    }
  }

  /** Events for one syndicate: hatched, deposit_received, sealed_intent_received, hatch_out_refund. */
  streamSyndicate(syndicateId, options) {
    return this._stream(`/v1/stream/syndicate/${encodeURIComponent(syndicateId)}`, options);
  }

  /** Health ticks and actions for one RFQ loan. */
  streamRfqLoan(loanId, options) {
    return this._stream(`/v1/stream/facilities/rfq/${encodeURIComponent(loanId)}`, options);
  }

  // --- 1. Syndicate Lifecycle ---
  async hatchSyndicate({ id, syndicateId, type = 'FLASH', quorumThreshold = 3, maxSpendNear = 100, expectedCodeHash, timeoutBlocks = 50, enclavePublicKey, allowedRecipients, maxReleaseBpsPerEpoch, settleDeadlineBlock }) {
    const sId = syndicateId || id;
    const res = await this._request('POST', '/v1/syndicates/hatch', {
      id: sId,
      syndicateId: sId,
      type,
      quorumThreshold,
      maxSpendNear,
      expectedCodeHash,
      timeoutBlocks,
      // chain mode only: the Roost's settlement key (required) and the release policy
      enclavePublicKey,
      allowedRecipients,
      maxReleaseBpsPerEpoch,
      settleDeadlineBlock,
    });
    return res.data;
  }

  async getSyndicate(id) {
    const res = await this._request('GET', `/v1/syndicates/${id}`);
    return res.data;
  }

  /** One page of syndicates. order is 'asc' (oldest first, the default) or 'desc' (newest first). The answer carries total and hasMore. */
  async listSyndicates({ fromIndex = 0, limit = 10, order = 'asc' } = {}) {
    const res = await this._request('GET', `/v1/syndicates?fromIndex=${fromIndex}&limit=${limit}&order=${order}`);
    return res.data;
  }

  async getSyndicatesByMember(accountId, { fromIndex = 0, limit = 10, order = 'asc' } = {}) {
    const res = await this._request('GET', `/v1/syndicates/member/${accountId}?fromIndex=${fromIndex}&limit=${limit}&order=${order}`);
    return res.data;
  }

  async deposit(syndicateId, flyerId, amountNear, policyHash = null, expect = null) {
    const res = await this._request('POST', `/v1/syndicates/${syndicateId}/deposit`, {
      flyerId,
      amountNear,
      policyHash,
      expect,
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

  /** Timelock state: creation block, timeout, the current block and the blocks remaining before hatch_out opens. */
  async getTimelock(syndicateId) {
    const res = await this._request('GET', `/v1/emergency/timelock/${encodeURIComponent(syndicateId)}`);
    return res.data;
  }

  /** Pods inside a syndicate (a model: nothing on chain enforces a pod's quota). */
  async listPods(syndicateId) {
    const res = await this._request('GET', `/v1/syndicates/${encodeURIComponent(syndicateId)}/pods`);
    return res.data;
  }

  async createPod(syndicateId, { podId, podType = 'EXECUTION', maxCapitalAllocation } = {}) {
    const res = await this._request('POST', `/v1/syndicates/${encodeURIComponent(syndicateId)}/pods`, { podId, podType, maxCapitalAllocation });
    return res.data;
  }

  // --- 2. Roost Enclave & Cryptography ---
  /** The session key of the Roost that serves this syndicate. Every syndicate has its own Roost and its own bids. */
  async getSessionKey(syndicateId) {
    const res = await this._request('GET', `/v1/roost/session-key?syndicateId=${encodeURIComponent(syndicateId ?? '')}`);
    return res.data;
  }

  async getAttestationQuote(syndicateId, nonce) {
    const res = await this._request('GET', `/v1/roost/attestation?syndicateId=${encodeURIComponent(syndicateId ?? '')}${nonce ? `&nonce=${nonce}` : ''}`);
    return res.data;
  }

  /**
   * Seal a bid for a model-sealed Roost. Verifies the model attestation itself and refuses a key the
   * coordinator merely asserts. Pass the result's cipherTextHex to submitSealedIntent.
   */
  async sealBid({ syndicateId, intentPayload, session, ...verifyOptions }) {
    return sealBidForRoost({ session: session || (await this.getSessionKey(syndicateId)), payload: intentPayload, ...verifyOptions });
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
  async emergencyHatchOut(syndicateId, flyerId) {
    // The server uses its own block height; a caller-supplied one would let anyone open the timelock early.
    const res = await this._request('POST', '/v1/emergency/hatch-out', { syndicateId, flyerId });
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
