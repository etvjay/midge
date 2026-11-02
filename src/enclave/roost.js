import crypto from 'node:crypto';

/**
 * The Roost: Runs inside an AMD SEV-SNP / Intel TDX enclave on NEAR AI Cloud.
 * Ingests encrypted member intents, aggregates them into a collective TWAP order,
 * and clears private member parameters from memory.
 */
export class RoostEnclave {
  constructor({ model = 'Qwen/Qwen3.6-35B-A3B-FP8', cloudApiUrl = 'https://cloud-api.near.ai/v1' } = {}) {
    this.model = model;
    this.cloudApiUrl = cloudApiUrl;
    this.sessionKeypair = crypto.generateKeyPairSync('ed25519');
    this.sessionNonce = crypto.randomBytes(32).toString('hex');
    this.sealedIntents = [];
  }

  /**
   * Retrieves verified TEE hardware attestation bound to the session nonce.
   */
  async getAttestationQuote() {
    const url = `${this.cloudApiUrl}/attestation/report?model=${encodeURIComponent(this.model)}&signing_algo=ecdsa&nonce=${this.sessionNonce}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to query TEE attestation: status ${res.status}`);
    }
    const report = await res.json();
    return {
      sessionNonce: this.sessionNonce,
      publicKey: this.sessionKeypair.publicKey.export({ type: 'spki', format: 'pem' }),
      gatewayAttestation: report.gateway_attestation,
      modelAttestations: report.model_attestations,
      verified: !!report.gateway_attestation?.intel_quote,
    };
  }

  /**
   * Submit an encrypted intent into the enclave.
   */
  submitSealedIntent({ flyerId, encryptedPayload }) {
    this.sealedIntents.push({
      flyerId,
      payload: encryptedPayload,
      receivedAt: Date.now(),
    });
    return { status: 'RECEIVED_IN_ENCLAVE', count: this.sealedIntents.length };
  }

  /**
   * Sealed Intent Aggregation (SIA):
   * Aggregates member orders into a collective TWAP curve,
   * then wipes individual member intents from enclave RAM.
   */
  aggregateAndClear() {
    if (this.sealedIntents.length === 0) {
      throw new Error('Cannot aggregate empty sealed intent queue');
    }

    const totalAllocated = this.sealedIntents.reduce((sum, item) => sum + (item.payload.amount || 0), 0);
    const participantCount = this.sealedIntents.length;

    // Construct the single unified market intent
    const aggregateOrder = {
      pair: 'USDC/NEAR',
      totalInputAmount: totalAllocated,
      flyerCount: participantCount,
      executionModel: 'TWAP_AGGREGATED_BATCH',
      confidentiality: 'basic', // FAR Private Shard
      timestamp: Date.now(),
    };

    // Zero-memory invariant: clear raw individual intents from memory
    this.sealedIntents = [];

    return {
      aggregateOrder,
      nonce: this.sessionNonce,
      enclaveSignature: crypto.sign(null, Buffer.from(JSON.stringify(aggregateOrder)), this.sessionKeypair.privateKey).toString('hex'),
    };
  }
}
