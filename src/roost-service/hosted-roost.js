import crypto from 'node:crypto';
import { generateClientKey, openFromModel } from '../enclave/e2ee.js';
import { RoostAggregationError } from '../enclave/errors.js';

/**
 * HostedRoost: the Roost as ordinary deterministic code, meant to run inside a dstack confidential VM.
 *
 * Keys are born in this process and never leave it:
 *   - an intent key: members seal bids to it (same E2EE v2 scheme as the model-sealed Roost)
 *   - a settlement key: signs what the Nest verifies
 * Both public keys are bound, with a caller-chosen nonce, into the TDX report data, so a verifier can
 * check the quote, the code measurement (compose hash) and the keys in one step (see verify-hosted.js).
 *
 * The Roost signs a settlement only if it is supported by an aggregate it computed itself, and only once.
 */

export const REPORT_DATA_DOMAIN = 'midge-roost-v1';
const MIN_CIPHERTEXT_BYTES = 32 + 24 + 16;
const MAX_CIPHERTEXT_BYTES = 4096;
const AMOUNT_RE = /^\d{1,12}(\.\d{1,6})?$/;
const SPKI_ED25519_PREFIX_LEN = 12;
const HEX64 = /^[0-9a-f]{64}$/i;
const sha256Hex = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

/** sha512(domain || settlePub || intentPub || nonce): 64 bytes, the TDX report data. */
export function roostReportData({ settlePublicKey, intentPublicKey, nonce }) {
  for (const [name, v] of Object.entries({ settlePublicKey, intentPublicKey, nonce })) {
    if (!HEX64.test(String(v))) throw new RoostAggregationError(`${name} must be 32 bytes of hex`);
  }
  return crypto.createHash('sha512')
    .update(Buffer.concat([Buffer.from(REPORT_DATA_DOMAIN, 'utf8'), Buffer.from(settlePublicKey, 'hex'), Buffer.from(intentPublicKey, 'hex'), Buffer.from(nonce, 'hex')]))
    .digest();
}

/** Exact decimal to micro-units. Accepts non-negative decimals with at most 6 places, as number or string. */
export function toMicro(value) {
  const text = typeof value === 'number' ? (Number.isFinite(value) ? String(value) : '') : typeof value === 'string' ? value : '';
  if (!AMOUNT_RE.test(text)) return null;
  const [whole, frac = ''] = text.split('.');
  return BigInt(whole) * 1_000_000n + BigInt(frac.padEnd(6, '0'));
}

export function formatMicro(micro) {
  const whole = micro / 1_000_000n;
  const frac = (micro % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/** Contract-compatible allocations hash: recipients sorted byte-wise, "recipient:amount" joined by commas. */
export function computeAllocationsHash(allocations) {
  const sorted = [...allocations].sort((a, b) => (a.recipient < b.recipient ? -1 : a.recipient > b.recipient ? 1 : 0));
  return sha256Hex(sorted.map((a) => `${a.recipient}:${a.amount}`).join(','));
}

export class HostedRoost {
  #intentSecret;
  #settleKey;

  constructor({ provider, maxIntents = 50 } = {}) {
    if (!provider) throw new Error('HostedRoost needs an attestation provider');
    this.provider = provider;
    this.maxIntents = maxIntents;
    const intent = generateClientKey();
    this.intentPublicKey = intent.publicKeyHex;
    this.#intentSecret = intent.secretX25519;
    const pair = crypto.generateKeyPairSync('ed25519');
    this.#settleKey = pair.privateKey;
    this.settlePublicKey = pair.publicKey.export({ format: 'der', type: 'spki' }).subarray(SPKI_ED25519_PREFIX_LEN).toString('hex');
    this.sealedIntents = [];
    this.aggregate = null; // last aggregate, awaiting at most one settlement signature
  }

  /** Serialising a Roost must never expose state: only the public keys. */
  toJSON() {
    return { backend: 'hosted', settlePublicKey: this.settlePublicKey, intentPublicKey: this.intentPublicKey };
  }

  describe() {
    const simulated = Boolean(this.provider.simulated);
    return {
      backend: 'hosted',
      inputsHiddenFromOperator: !simulated,
      hiddenBy: simulated
        ? 'nothing: running against the dstack simulator, whose quotes are mock'
        : 'a dstack confidential VM, but only if its attestation verifies; verify before sealing a bid',
      arithmetic: 'exact',
      needsHosting: true,
      simulated,
    };
  }

  getSessionInfo() {
    return {
      backend: 'hosted',
      intentPublicKey: this.intentPublicKey,
      settlePublicKey: this.settlePublicKey,
      sealing: 'ed25519-v2: X25519 + HKDF-SHA256 + XChaCha20-Poly1305, hex',
      maxIntents: this.maxIntents,
      simulated: Boolean(this.provider.simulated),
    };
  }

  /** Attestation bound to our keys and the caller's nonce. */
  async getAttestationBundle(nonce) {
    const reportData = roostReportData({ settlePublicKey: this.settlePublicKey, intentPublicKey: this.intentPublicKey, nonce });
    const [attestation, info] = await Promise.all([this.provider.attest(reportData), this.provider.info()]);
    return {
      format: 'midge-roost-attestation-v1',
      domain: REPORT_DATA_DOMAIN,
      nonce: nonce.toLowerCase(),
      settlePublicKey: this.settlePublicKey,
      intentPublicKey: this.intentPublicKey,
      reportData: reportData.toString('hex'),
      attestation,
      info,
      simulated: Boolean(this.provider.simulated),
    };
  }

  submitSealedIntent({ flyerId, cipherTextHex, cipherText }) {
    cipherTextHex = cipherTextHex ?? cipherText;
    if (typeof flyerId !== 'string' || flyerId.length === 0 || flyerId.length > 128) throw new RoostAggregationError('flyerId is required');
    if (typeof cipherTextHex !== 'string' || !/^[0-9a-f]+$/i.test(cipherTextHex) || cipherTextHex.length % 2 !== 0) {
      throw new RoostAggregationError('cipherTextHex must be an even-length hex string');
    }
    const bytes = cipherTextHex.length / 2;
    if (bytes < MIN_CIPHERTEXT_BYTES || bytes > MAX_CIPHERTEXT_BYTES) throw new RoostAggregationError(`sealed bid must be ${MIN_CIPHERTEXT_BYTES} to ${MAX_CIPHERTEXT_BYTES} bytes`);
    if (this.sealedIntents.length >= this.maxIntents) throw new RoostAggregationError(`round is full (${this.maxIntents} bids)`);
    if (this.sealedIntents.some((i) => i.flyerId === flyerId)) throw new RoostAggregationError(`flyer ${flyerId} already submitted a bid this round`);
    this.sealedIntents.push({ flyerId, cipherTextHex });
    return { status: 'SEALED_TO_ROOST_KEY', count: this.sealedIntents.length, bytes };
  }

  /**
   * Decrypt, validate and add up every bid exactly. A bid that cannot be decrypted or is malformed is
   * excluded and its flyerId reported (never its content), so one bad bid cannot block the round.
   */
  aggregateAndClear({ roundId = '' } = {}) {
    if (this.sealedIntents.length === 0) throw new RoostAggregationError('cannot aggregate an empty sealed intent queue');
    let totalMicro = 0n;
    let valid = 0;
    const excluded = [];
    for (const intent of this.sealedIntents) {
      let micro = null;
      try {
        const payload = JSON.parse(openFromModel(intent.cipherTextHex, this.#intentSecret));
        micro = payload && typeof payload === 'object' ? toMicro(payload.amount) : null;
      } catch { micro = null; }
      if (micro === null) { excluded.push(intent.flyerId); continue; }
      totalMicro += micro;
      valid += 1;
    }
    if (valid === 0) throw new RoostAggregationError('no valid bids in this round');

    const aggregateNonce = crypto.randomBytes(16).toString('hex');
    const orderHash = sha256Hex(`midge-order-v1:${roundId}:${totalMicro}:${valid}:${excluded.length}:${aggregateNonce}`);
    this.sealedIntents = []; // plaintext never outlives this call; ciphertext is dropped too
    this.aggregate = { orderHash, totalMicro, signed: false };
    return {
      aggregateOrder: {
        totalInputAmount: formatMicro(totalMicro),
        flyerCount: valid,
        excludedFlyers: excluded,
        executionModel: 'HOSTED_EXACT_BATCH',
        confidentiality: this.provider.simulated ? 'simulated' : 'tee-hosted',
        timestamp: Date.now(),
      },
      orderHash,
      settlePublicKey: this.settlePublicKey,
    };
  }

  /**
   * Sign the Nest's settlement message, but only for allocations supported by our own aggregate, and once.
   * Amounts are yoctoNEAR strings; a bid unit is one NEAR, so the aggregate bounds the payout.
   */
  signSettlement({ contractId, syndicateId, epoch, roundNonce, allocations, orderHash }) {
    const agg = this.aggregate;
    if (!agg) throw new RoostAggregationError('no aggregate to settle; run a round first');
    if (orderHash !== agg.orderHash) throw new RoostAggregationError('orderHash does not match the current aggregate');
    if (agg.signed) throw new RoostAggregationError('this aggregate has already been signed once');
    for (const [name, v] of Object.entries({ contractId, syndicateId, roundNonce })) {
      if (typeof v !== 'string' || v.length === 0 || v.includes(':')) throw new RoostAggregationError(`${name} must be a non-empty string without ':'`);
    }
    if (!Number.isSafeInteger(epoch) || epoch < 0) throw new RoostAggregationError('epoch must be a non-negative integer');
    if (!Array.isArray(allocations) || allocations.length === 0 || allocations.length > 8) throw new RoostAggregationError('allocations must list 1 to 8 recipients');
    const seen = new Set();
    let sum = 0n;
    for (const a of allocations) {
      if (!a || typeof a.recipient !== 'string' || a.recipient.length === 0 || a.recipient.includes(':') || a.recipient.includes(',')) throw new RoostAggregationError('each allocation needs a plain recipient id');
      if (seen.has(a.recipient)) throw new RoostAggregationError(`duplicate recipient ${a.recipient}`);
      seen.add(a.recipient);
      if (typeof a.amount !== 'string' || !/^\d{1,40}$/.test(a.amount) || (a.amount.length > 1 && a.amount[0] === '0')) throw new RoostAggregationError('each amount must be a yoctoNEAR integer string');
      sum += BigInt(a.amount);
    }
    const maxPayout = agg.totalMicro * 10n ** 18n; // micro-NEAR to yoctoNEAR
    if (sum > maxPayout) throw new RoostAggregationError('allocations exceed what the sealed bids support');
    const allocationsHash = computeAllocationsHash(allocations);
    const message = `${contractId}:${syndicateId}:${epoch}:${roundNonce}:${allocationsHash}:${agg.orderHash}`;
    const signature = crypto.sign(null, Buffer.from(message, 'utf8'), this.#settleKey).toString('hex');
    agg.signed = true;
    return { message, signature, allocationsHash, orderHash: agg.orderHash, settlePublicKey: this.settlePublicKey };
  }
}
