import crypto from 'node:crypto';
import { generateClientKey, openFromModel } from '../enclave/e2ee.js';
import { RoostAggregationError } from '../enclave/errors.js';
import { clearAuction, FORMATS } from './auction-programs.js';
import { clearPool } from './pool-program.js';
import { clearBestQuote, clearCross } from './quote-programs.js';
import { inputMessage, verifyNearSignature, isAccountId } from './signed-input.js';

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

/** Contract-compatible charges hash: members sorted byte-wise, "member:amount" joined by commas (see compute_charges_hash). */
export function computeChargesHash(charges) {
  const sorted = [...charges].sort((a, b) => (a.member < b.member ? -1 : a.member > b.member ? 1 : 0));
  return sha256Hex(sorted.map((c) => `${c.member}:${c.amount}`).join(','));
}

const YOCTO_PER_MICRO = 10n ** 18n;
const sameAllocations = (a, b) => a.length === b.length && [...a].sort((x, y) => (x.recipient < y.recipient ? -1 : 1)).every((x, i) => { const y = [...b].sort((p, q) => (p.recipient < q.recipient ? -1 : 1))[i]; return x.recipient === y.recipient && String(x.amount) === String(y.amount); });
const sameCharges = (a, b) => a.length === b.length && [...a].sort((x, y) => (x.member < y.member ? -1 : 1)).every((x, i) => { const y = [...b].sort((p, q) => (p.member < q.member ? -1 : 1))[i]; return x.member === y.member && String(x.amount) === String(y.amount); });

export class HostedRoost {
  #intentSecret;
  #settleKey;

  constructor({ provider, maxIntents = 50, requireSignedInputs = false, accountKeyCheck = null, deterministicOrder = false } = {}) {
    if (!provider) throw new Error('HostedRoost needs an attestation provider');
    if (requireSignedInputs && typeof accountKeyCheck !== 'function') throw new Error('requireSignedInputs needs an accountKeyCheck(accountId, publicKey) that asks the chain');
    this.provider = provider;
    this.requireSignedInputs = Boolean(requireSignedInputs);
    // Two-room mode: the order hash and tie-breaking depend only on the round and the inputs, never on a random number or
    // arrival order, so two independent Roosts that see the same inputs sign byte-identical messages.
    this.deterministicOrder = Boolean(deterministicOrder);
    this.accountKeyCheck = accountKeyCheck;
    this.round = null; // { contractId, syndicateId, epoch, roundNonce }: what inputs must be signed for
    this.lastSeq = new Map(); // account -> highest accepted sequence number this round
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

  /** Random in single-room mode (each aggregate is unique); empty in two-room mode (the outcome alone decides the hash). */
  #orderSalt() { return this.deterministicOrder ? '' : crypto.randomBytes(16).toString('hex'); }

  /** Arrival order in single-room mode; in two-room mode a fixed order derived from the round nonce, which ties break by. */
  #inRoundOrder() {
    if (!this.deterministicOrder) return this.sealedIntents;
    const rank = (i) => sha256Hex(`${this.round?.roundNonce ?? ''}:${i.flyerId}`);
    return [...this.sealedIntents].sort((x, y) => (rank(x) < rank(y) ? -1 : rank(x) > rank(y) ? 1 : 0));
  }

  /**
   * Per-member digests of what each member sealed to THIS room, for comparing two rooms without revealing amounts.
   * The body must carry a secret random `salt` (16+ chars): without it a digest of a small-domain amount could be guessed,
   * so an unsalted body gets null. Two rooms holding the same body for a member return the same digest.
   */
  inputDigests() {
    const canon = (v) => (Array.isArray(v) ? `[${v.map(canon).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}` : JSON.stringify(v));
    const out = {};
    for (const intent of this.sealedIntents) {
      try {
        const body = JSON.parse(openFromModel(intent.cipherTextHex, this.#intentSecret));
        out[intent.flyerId] = body && typeof body.salt === 'string' && body.salt.length >= 16 ? sha256Hex(`midge-digest-v1:${this.round?.roundNonce ?? ''}:${intent.flyerId}:${canon(body)}`) : null;
      } catch { out[intent.flyerId] = null; }
    }
    return out;
  }

  /** Drop members from the queue (for example those whose digests differ between the two rooms). */
  excludeMembers(ids) {
    const drop = new Set(ids);
    this.sealedIntents = this.sealedIntents.filter((i) => !drop.has(i.flyerId));
    return { excluded: [...drop], remaining: this.sealedIntents.length };
  }

  /** Fix the round that inputs must be signed for, and clear everything from any earlier round. */
  openRound({ contractId, syndicateId, epoch, roundNonce }) {
    for (const [k, v] of Object.entries({ contractId, syndicateId, roundNonce })) if (typeof v !== 'string' || v.length === 0 || v.includes(':')) throw new RoostAggregationError(`${k} must be a non-empty string without ':'`);
    if (!Number.isSafeInteger(epoch) || epoch < 0) throw new RoostAggregationError('epoch must be a non-negative integer');
    this.round = { contractId, syndicateId, epoch, roundNonce };
    this.sealedIntents = []; this.lastSeq = new Map(); this.aggregate = null;
    return { ...this.round };
  }

  /**
   * A sealed input signed by the NEAR key of the account it names, for the open round. A newer sequence number from the same
   * account replaces its older input (and goes to the back of the line); an equal or lower one is refused.
   */
  async submitSignedIntent({ flyerId, cipherTextHex, publicKey, signature, seq }) {
    if (!this.round) throw new RoostAggregationError('no open round: call openRound first');
    if (!isAccountId(flyerId)) throw new RoostAggregationError('flyerId must be a NEAR account id');
    if (!Number.isSafeInteger(seq) || seq < 1) throw new RoostAggregationError('seq must be a positive integer');
    if (typeof cipherTextHex !== 'string' || !/^[0-9a-f]+$/i.test(cipherTextHex) || cipherTextHex.length % 2 !== 0) throw new RoostAggregationError('cipherTextHex must be an even-length hex string');
    const bytes = cipherTextHex.length / 2;
    if (bytes < MIN_CIPHERTEXT_BYTES || bytes > MAX_CIPHERTEXT_BYTES) throw new RoostAggregationError(`sealed bid must be ${MIN_CIPHERTEXT_BYTES} to ${MAX_CIPHERTEXT_BYTES} bytes`);
    if (!verifyNearSignature(publicKey, inputMessage({ ...this.round, flyerId, seq, cipherTextHex }), signature)) throw new RoostAggregationError('bad signature for this input and this round');
    let belongs = false;
    try { belongs = await this.accountKeyCheck(flyerId, publicKey); } catch { throw new RoostAggregationError(`could not check that ${publicKey} is a key of ${flyerId}`); }
    if (!belongs) throw new RoostAggregationError(`${publicKey} is not a key of ${flyerId}`);
    if (seq <= (this.lastSeq.get(flyerId) ?? 0)) throw new RoostAggregationError(`sequence ${seq} is not newer than the one already accepted for ${flyerId}`);
    const replacing = this.sealedIntents.some((i) => i.flyerId === flyerId);
    if (!replacing && this.sealedIntents.length >= this.maxIntents) throw new RoostAggregationError(`round is full (${this.maxIntents} bids)`);
    this.sealedIntents = this.sealedIntents.filter((i) => i.flyerId !== flyerId);
    this.sealedIntents.push({ flyerId, cipherTextHex });
    this.lastSeq.set(flyerId, seq);
    return { status: 'SEALED_TO_ROOST_KEY', count: this.sealedIntents.length, bytes, replaced: replacing };
  }

  submitSealedIntent({ flyerId, cipherTextHex, cipherText }) {
    if (this.requireSignedInputs) throw new RoostAggregationError('this Roost only accepts signed inputs: use submitSignedIntent');
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

    const aggregateNonce = this.#orderSalt();
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
   * Run an auction on the sealed bids. Each bid decrypts to { price, quantity }: price per unit in NEAR (up to 6 places) and
   * whole units (default 1). The outcome (who wins, at what price, who pays what) is computed here by the rules in
   * auction-programs.js; what the Roost will later sign is exactly that outcome and nothing else.
   * A bid that cannot be decrypted or is malformed is excluded and its flyerId reported, never its content.
   * `flyerId` must be the NEAR account that deposited: bids are not yet authenticated to the account (see GAP-023).
   */
  runAuction({ format, lotUnits = 1, reserve = '0', seller, roundId = '' } = {}) {
    if (!FORMATS.includes(format)) throw new RoostAggregationError(`format must be one of ${FORMATS.join(', ')}`);
    if (typeof seller !== 'string' || seller.length === 0 || seller.includes(':') || seller.includes(',')) throw new RoostAggregationError('seller must be a plain account id');
    const reserveMicro = toMicro(reserve);
    if (reserveMicro === null) throw new RoostAggregationError('reserve must be a decimal with at most 6 places');
    if (!Number.isSafeInteger(lotUnits) || lotUnits < 1 || lotUnits > 1_000_000) throw new RoostAggregationError('lotUnits must be an integer from 1 to 1,000,000');
    if (this.sealedIntents.length === 0) throw new RoostAggregationError('cannot run an auction on an empty sealed bid queue');
    const bids = []; const excluded = [];
    this.#inRoundOrder().forEach((intent, order) => {
      try {
        const payload = JSON.parse(openFromModel(intent.cipherTextHex, this.#intentSecret));
        const priceMicro = toMicro(payload?.price);
        const quantity = payload?.quantity === undefined ? 1 : Number(payload.quantity);
        if (priceMicro === null || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1_000_000) throw new Error('malformed');
        bids.push({ flyerId: intent.flyerId, priceMicro, quantity, order });
      } catch { excluded.push(intent.flyerId); }
    });
    if (bids.length === 0) throw new RoostAggregationError('no valid bids in this round');
    const outcome = clearAuction({ format, bids, lotUnits, reserveMicro });
    this.sealedIntents = []; // plaintext never outlives this call
    const pub = {
      format, lotUnits, reserve: formatMicro(reserveMicro), sold: outcome.sold, bidsReceived: outcome.bidsReceived, bidsEligible: outcome.bidsEligible, excludedFlyers: excluded,
      clearingPrice: outcome.sold ? formatMicro(outcome.clearingPriceMicro) : null,
      fills: outcome.fills.map((f) => ({ member: f.flyerId, units: f.units, pays: formatMicro(f.payMicro) })),
      proceeds: formatMicro(outcome.proceedsMicro),
      executionModel: 'HOSTED_SEALED_AUCTION', confidentiality: this.provider.simulated ? 'simulated' : 'tee-hosted',
    };
    if (!outcome.sold) { this.aggregate = null; return { outcome: pub, orderHash: null, allocations: [], charges: [], settlePublicKey: this.settlePublicKey }; }
    const allocations = [{ recipient: seller, amount: String(outcome.proceedsMicro * YOCTO_PER_MICRO) }];
    const charges = outcome.fills.map((f) => ({ member: f.flyerId, amount: String(f.payMicro * YOCTO_PER_MICRO) }));
    const bound = Object.fromEntries(outcome.fills.map((f) => [f.flyerId, f.bidMicro * YOCTO_PER_MICRO]));
    const orderHash = sha256Hex(`midge-auction-v1:${roundId}:${format}:${lotUnits}:${formatMicro(reserveMicro)}:${seller}:${JSON.stringify(pub.fills)}:${pub.clearingPrice}:${excluded.length}:${this.#orderSalt()}`);
    this.aggregate = { orderHash, totalMicro: outcome.proceedsMicro, signed: false, program: { allocations, charges, bound } };
    return { outcome: pub, orderHash, allocations, charges, settlePublicKey: this.settlePublicKey };
  }

  /**
   * Run a pooled round: each sealed bid decrypts to { amount } (NEAR, up to 6 places); the total goes to `recipient` and each
   * member is charged exactly their own amount. Settled with settle_batch_charged. A bid that cannot be read, or is under
   * `min` or over the `cap`, is left out and its flyerId reported, never its content.
   */
  runPool({ recipient, min = '0', cap = null, roundId = '' } = {}) {
    if (typeof recipient !== 'string' || recipient.length === 0 || recipient.includes(':') || recipient.includes(',')) throw new RoostAggregationError('recipient must be a plain account id');
    const minMicro = toMicro(min); const capMicro = cap === null ? null : toMicro(cap);
    if (minMicro === null || (cap !== null && capMicro === null)) throw new RoostAggregationError('min and cap must be decimals with at most 6 places');
    if (this.sealedIntents.length === 0) throw new RoostAggregationError('cannot run a pool on an empty sealed bid queue');
    const bids = []; const unreadable = [];
    this.#inRoundOrder().forEach((intent, order) => {
      try { const payload = JSON.parse(openFromModel(intent.cipherTextHex, this.#intentSecret)); const amountMicro = toMicro(payload?.amount); if (amountMicro === null) throw new Error('malformed'); bids.push({ flyerId: intent.flyerId, amountMicro, order }); } catch { unreadable.push(intent.flyerId); }
    });
    const out = clearPool({ bids, minMicro, capMicro });
    this.sealedIntents = [];
    const pub = { format: 'pool', recipient, sold: out.sold, members: out.contributions.length, total: formatMicro(out.totalMicro), leftOut: [...unreadable, ...out.leftOut], executionModel: 'HOSTED_SEALED_POOL', confidentiality: this.provider.simulated ? 'simulated' : 'tee-hosted' };
    if (!out.sold) { this.aggregate = null; return { outcome: pub, orderHash: null, allocations: [], charges: [], settlePublicKey: this.settlePublicKey }; }
    const allocations = [{ recipient, amount: String(out.totalMicro * YOCTO_PER_MICRO) }];
    const charges = out.contributions.map((c) => ({ member: c.flyerId, amount: String(c.amountMicro * YOCTO_PER_MICRO) }));
    const bound = Object.fromEntries(out.contributions.map((c) => [c.flyerId, c.amountMicro * YOCTO_PER_MICRO]));
    const orderHash = sha256Hex(`midge-pool-v1:${roundId}:${recipient}:${pub.total}:${out.contributions.length}:${pub.leftOut.length}:${this.#orderSalt()}`);
    this.aggregate = { orderHash, totalMicro: out.totalMicro, signed: false, program: { allocations, charges, bound } };
    return { outcome: pub, orderHash, allocations, charges, settlePublicKey: this.settlePublicKey };
  }

  /**
   * Best quote. shape 'lend': each sealed input is { rateBps } (0 to 10000); the lowest rate at or under `limit` (basis
   * points) wins and that lender funds `amount` NEAR to `counterparty` (the borrower). shape 'buy': each input is
   * { price } (NEAR per unit); the lowest price at or under `limit` wins and `counterparty` (the taker) pays units x price
   * to the winning dealer. pricing 'first' charges the winner's own quote, 'second' the runner-up's. Settled with
   * settle_batch_charged; only the cash leg moves (no repayment, collateral or asset delivery is enforced).
   */
  runQuote({ shape, pricing = 'first', counterparty, amount = null, units = null, limit, roundId = '' } = {}) {
    if (shape !== 'lend' && shape !== 'buy') throw new RoostAggregationError("shape must be 'lend' or 'buy'");
    if (typeof counterparty !== 'string' || counterparty.length === 0 || counterparty.includes(':') || counterparty.includes(',')) throw new RoostAggregationError('counterparty must be a plain account id');
    if (this.sealedIntents.length === 0) throw new RoostAggregationError('cannot run a quote round on an empty sealed queue');
    let limitMicro; let fixedMicro;
    if (shape === 'lend') {
      limitMicro = Number.isSafeInteger(Number(limit)) && Number(limit) >= 0 && Number(limit) <= 10000 ? BigInt(Number(limit)) : null;
      fixedMicro = toMicro(amount);
      if (limitMicro === null) throw new RoostAggregationError('limit must be a maximum rate in basis points, 0 to 10000');
      if (fixedMicro === null || fixedMicro === 0n) throw new RoostAggregationError('amount must be a positive decimal with at most 6 places');
    } else {
      limitMicro = toMicro(limit);
      if (limitMicro === null) throw new RoostAggregationError('limit must be a maximum price, a decimal with at most 6 places');
      if (!Number.isSafeInteger(units) || units < 1 || units > 1_000_000) throw new RoostAggregationError('units must be an integer from 1 to 1,000,000');
    }
    const quotes = []; const unreadable = [];
    this.#inRoundOrder().forEach((intent, order) => {
      try {
        const body = JSON.parse(openFromModel(intent.cipherTextHex, this.#intentSecret));
        let valueMicro;
        if (shape === 'lend') { const r = body?.rateBps; if (!Number.isSafeInteger(r) || r < 0 || r > 10000) throw new Error('malformed'); valueMicro = BigInt(r); } else { valueMicro = toMicro(body?.price); if (valueMicro === null) throw new Error('malformed'); }
        if (intent.flyerId === counterparty) throw new Error('the counterparty cannot quote');
        quotes.push({ flyerId: intent.flyerId, valueMicro, order });
      } catch { unreadable.push(intent.flyerId); }
    });
    const out = clearBestQuote({ direction: 'lowest', quotes, limitMicro, pricing });
    this.sealedIntents = [];
    const pub = { shape, pricing, counterparty, won: out.won, winner: out.winner, quotesReceived: out.quotesReceived, quotesEligible: out.quotesEligible, unreadable, executionModel: 'HOSTED_SEALED_QUOTE', confidentiality: this.provider.simulated ? 'simulated' : 'tee-hosted' };
    if (!out.won) { this.aggregate = null; return { outcome: pub, orderHash: null, allocations: [], charges: [], settlePublicKey: this.settlePublicKey }; }
    let payMicro; let allocations; let charges; let bound;
    if (shape === 'lend') {
      pub.rateBps = Number(out.priceMicro); pub.loan = formatMicro(fixedMicro); payMicro = fixedMicro;
      allocations = [{ recipient: counterparty, amount: String(payMicro * YOCTO_PER_MICRO) }];
      charges = [{ member: out.winner, amount: String(payMicro * YOCTO_PER_MICRO) }];
      bound = { [out.winner]: payMicro * YOCTO_PER_MICRO };
    } else {
      payMicro = BigInt(units) * out.priceMicro; pub.price = formatMicro(out.priceMicro); pub.units = units; pub.cost = formatMicro(payMicro);
      allocations = [{ recipient: out.winner, amount: String(payMicro * YOCTO_PER_MICRO) }];
      charges = [{ member: counterparty, amount: String(payMicro * YOCTO_PER_MICRO) }];
      bound = { [counterparty]: BigInt(units) * limitMicro * YOCTO_PER_MICRO };
    }
    const orderHash = sha256Hex(`midge-quote-v1:${roundId}:${shape}:${pricing}:${counterparty}:${out.winner}:${out.priceMicro}:${payMicro}:${this.#orderSalt()}`);
    this.aggregate = { orderHash, totalMicro: payMicro, signed: false, program: { allocations, charges, bound } };
    return { outcome: pub, orderHash, allocations, charges, settlePublicKey: this.settlePublicKey };
  }

  /**
   * Block-trade cross. Each sealed input is { side: 'buy'|'sell', units, limit }. Buyers whose limit is at or above the
   * public `referencePrice` and sellers whose limit is at or below it are crossed at that price; matched units are the
   * smaller side's total. Sellers are paid, buyers are charged, equal sums. Settled with settle_batch_charged. Only the
   * cash leg moves; the asset is not delivered. The reference price is supplied, not verified.
   */
  runCross({ referencePrice, roundId = '' } = {}) {
    const referenceMicro = toMicro(referencePrice);
    if (referenceMicro === null || referenceMicro === 0n) throw new RoostAggregationError('referencePrice must be a positive decimal with at most 6 places');
    if (this.sealedIntents.length === 0) throw new RoostAggregationError('cannot run a cross on an empty sealed queue');
    const buys = []; const sells = []; const unreadable = [];
    this.#inRoundOrder().forEach((intent, order) => {
      try {
        const b = JSON.parse(openFromModel(intent.cipherTextHex, this.#intentSecret)); const limitMicro = toMicro(b?.limit);
        if ((b?.side !== 'buy' && b?.side !== 'sell') || !Number.isSafeInteger(b?.units) || b.units < 1 || b.units > 1_000_000 || limitMicro === null) throw new Error('malformed');
        (b.side === 'buy' ? buys : sells).push({ flyerId: intent.flyerId, units: b.units, limitMicro, order });
      } catch { unreadable.push(intent.flyerId); }
    });
    const out = clearCross({ buys, sells, referenceMicro });
    this.sealedIntents = [];
    const cashTotal = out.matchedUnits * referenceMicro;
    const pub = { shape: 'cross', referencePrice: formatMicro(referenceMicro), matchedUnits: Number(out.matchedUnits), cash: formatMicro(cashTotal), buyers: out.buyFills.length, sellers: out.sellFills.length, ordersReceived: out.buysReceived + out.sellsReceived, unreadable, executionModel: 'HOSTED_SEALED_CROSS', confidentiality: this.provider.simulated ? 'simulated' : 'tee-hosted' };
    if (out.matchedUnits === 0n) { this.aggregate = null; return { outcome: pub, orderHash: null, allocations: [], charges: [], settlePublicKey: this.settlePublicKey }; }
    if (out.sellFills.length > 8) throw new RoostAggregationError('a settlement can pay at most 8 sellers');
    const allocations = out.sellFills.map((f) => ({ recipient: f.flyerId, amount: String(f.cashMicro * YOCTO_PER_MICRO) }));
    const charges = out.buyFills.map((f) => ({ member: f.flyerId, amount: String(f.cashMicro * YOCTO_PER_MICRO) }));
    const bound = Object.fromEntries(out.buyFills.map((f) => [f.flyerId, f.ordered * f.limitMicro * YOCTO_PER_MICRO]));
    const orderHash = sha256Hex(`midge-cross-v1:${roundId}:${referenceMicro}:${out.matchedUnits}:${out.buyFills.map((f) => `${f.flyerId}=${f.units}`).sort().join(',')}:${out.sellFills.map((f) => `${f.flyerId}=${f.units}`).sort().join(',')}:${this.#orderSalt()}`);
    this.aggregate = { orderHash, totalMicro: cashTotal, signed: false, program: { allocations, charges, bound } };
    return { outcome: pub, orderHash, allocations, charges, settlePublicKey: this.settlePublicKey };
  }

  /**
   * Sign the Nest's settlement message, but only for allocations supported by our own aggregate, and once.
   * Amounts are yoctoNEAR strings; a bid unit is one NEAR, so the aggregate bounds the payout.
   */
  signSettlement({ contractId, syndicateId, epoch, roundNonce, allocations, orderHash, charges }) {
    const agg = this.aggregate;
    if (!agg) throw new RoostAggregationError('no aggregate to settle; run a round first');
    if (this.round && (contractId !== this.round.contractId || syndicateId !== this.round.syndicateId || epoch !== this.round.epoch || roundNonce !== this.round.roundNonce)) throw new RoostAggregationError('this is not the open round: contract, syndicate, epoch and nonce must match the round the inputs were signed for');
    if (orderHash !== agg.orderHash) throw new RoostAggregationError('orderHash does not match the current aggregate');
    if (agg.signed) throw new RoostAggregationError('this aggregate has already been signed once');
    if (agg.program && charges === undefined) throw new RoostAggregationError('this aggregate is an auction outcome; it can only be settled with its charges');
    if (charges !== undefined) {
      if (!agg.program) throw new RoostAggregationError('charges can only be signed for an auction outcome this Roost computed');
      if (!Array.isArray(charges) || !sameCharges(charges, agg.program.charges)) throw new RoostAggregationError('charges do not match the auction outcome');
      if (!Array.isArray(allocations) || !sameAllocations(allocations, agg.program.allocations)) throw new RoostAggregationError('allocations do not match the auction outcome');
      for (const c of charges) if (BigInt(c.amount) > agg.program.bound[c.member]) throw new RoostAggregationError(`charge for ${c.member} exceeds what that member bid`);
    }
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
    const message = charges === undefined
      ? `${contractId}:${syndicateId}:${epoch}:${roundNonce}:${allocationsHash}:${agg.orderHash}`
      : `${contractId}:${syndicateId}:${epoch}:${roundNonce}:${allocationsHash}:${computeChargesHash(charges)}:${agg.orderHash}`;
    const signature = crypto.sign(null, Buffer.from(message, 'utf8'), this.#settleKey).toString('hex');
    agg.signed = true;
    return { message, signature, allocationsHash, orderHash: agg.orderHash, settlePublicKey: this.settlePublicKey };
  }
}
