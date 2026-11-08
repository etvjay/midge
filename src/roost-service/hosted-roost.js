import crypto from 'node:crypto';
import { generateClientKey, openFromModel, sealToModel } from '../enclave/e2ee.js';
import { RoostAggregationError } from '../enclave/errors.js';
import { clearAuction, FORMATS } from './auction-programs.js';
import { clearPool } from './pool-program.js';
import { clearBestQuote, clearCross } from './quote-programs.js';
import { clearBallot } from './ballot-program.js';
import { buildPayrun, fmtMicro } from './payrun-program.js';
import { leafHash, merkleRoot, merkleProof, payrunOrderHash, receiptSigningMessage } from './receipts.js';
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

  constructor({ provider, maxIntents = 50, requireSignedInputs = false, accountKeyCheck = null, deterministicOrder = false, escrowReader = null } = {}) {
    if (!provider) throw new Error('HostedRoost needs an attestation provider');
    if (requireSignedInputs && typeof accountKeyCheck !== 'function') throw new Error('requireSignedInputs needs an accountKeyCheck(accountId, publicKey) that asks the chain');
    this.provider = provider;
    this.requireSignedInputs = Boolean(requireSignedInputs);
    // Two-room mode: the order hash and tie-breaking depend only on the round and the inputs, never on a random number or
    // arrival order, so two independent Roosts that see the same inputs sign byte-identical messages.
    this.deterministicOrder = Boolean(deterministicOrder);
    this.accountKeyCheck = accountKeyCheck;
    this.escrowReader = escrowReader; // optional: see bindEscrow(). Without one, charged programs behave exactly as before.
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

  #escrow = null; // { key, blockHeight, blockHash, escrows, covered }: one read of the chain, used by at most one run
  #lastEscrowHeight = new Map(); // round key -> newest block read, so a later read cannot go backwards
  #roundKey() { const r = this.round; return r ? `${r.contractId}:${r.syndicateId}:${r.epoch}:${r.roundNonce}` : ''; }

  /**
   * Read, from the contract, what each queued bidder (and any extra paying account) holds in this group, at one final block.
   * Call it after the last input of the round and before a charged `run*`. It fails closed: if the providers cannot be read, are
   * behind, or disagree, it throws and the round does not run (the queue is kept). Without an escrowReader it throws too.
   * @param {{accounts?: string[]}} [opts] accounts that will be charged but may have no queued input (a ballot's roll)
   * @returns {Promise<{blockHeight:number, blockHash:string, bidders:number}>}
   */
  async bindEscrow({ accounts = [] } = {}) {
    if (!this.escrowReader) throw new RoostAggregationError('this host has no escrow reader');
    if (!this.round) throw new RoostAggregationError('no open round: call openRound first');
    const key = this.#roundKey();
    const ids = [...new Set([...this.sealedIntents.map((i) => i.flyerId), ...accounts])];
    const out = await this.escrowReader.read(this.round.syndicateId, ids);
    if (key !== this.#roundKey()) throw new RoostAggregationError('the round changed while escrow was being read: bind again');
    const last = this.#lastEscrowHeight.get(key) ?? 0;
    if (out.blockHeight < last) throw new RoostAggregationError(`could not read escrow: this read is from block ${out.blockHeight}, older than the earlier one (${last})`);
    this.#lastEscrowHeight.set(key, out.blockHeight);
    this.#escrow = { key, blockHeight: out.blockHeight, blockHash: out.blockHash, escrows: out.escrows, covered: new Set(ids) };
    return { blockHeight: out.blockHeight, blockHash: out.blockHash, bidders: ids.length };
  }

  /**
   * Keep only the items whose worst-case charge their escrow covers. With no reader it keeps everything. With one it needs a
   * snapshot from bindEscrow() that covers every queued bidder and every `extraIds`; otherwise it throws. The snapshot is used up.
   * @returns {{kept:any[], excluded:string[], tag:string}} tag goes into the signed order hash so the block is on record
   */
  #affordable(items, idOf, maxChargeYocto, extraIds = []) {
    if (!this.escrowReader) return { kept: items, excluded: [], tag: '', block: null };
    const snap = this.#escrow;
    if (!snap || snap.key !== this.#roundKey()) throw new RoostAggregationError('escrow not bound: call bindEscrow() after the last input of the round, then run');
    for (const id of [...this.sealedIntents.map((i) => i.flyerId), ...extraIds]) if (!snap.covered.has(id)) throw new RoostAggregationError(`escrow is out of date (${id} was not read): a new input or account arrived after bindEscrow(); bind again`);
    this.#escrow = null;
    const kept = []; const excluded = [];
    for (const it of items) {
      const held = BigInt(snap.escrows[idOf(it)] ?? '0');
      if (held >= BigInt(maxChargeYocto(it))) kept.push(it); else excluded.push(idOf(it));
    }
    return { kept, excluded, tag: `:escrow:${snap.blockHeight}:${snap.blockHash}`, block: { height: snap.blockHeight, hash: snap.blockHash } };
  }

  #signedRounds = new Set(); // rounds this host has signed (newest 1000); a signed round cannot be re-opened with the same nonce

  /** Signing is once per round, not once per aggregate: after a signature, more inputs must not yield a second signed settlement for the same epoch and nonce. */
  #assertNoSignedAggregate() {
    if (this.aggregate?.signed) throw new RoostAggregationError('this round already has a signed settlement; open a new round');
  }

  /** Fix the round that inputs must be signed for, and clear everything from any earlier round. */
  openRound({ contractId, syndicateId, epoch, roundNonce }) {
    for (const [k, v] of Object.entries({ contractId, syndicateId, roundNonce })) if (typeof v !== 'string' || v.length === 0 || v.includes(':')) throw new RoostAggregationError(`${k} must be a non-empty string without ':'`);
    if (!Number.isSafeInteger(epoch) || epoch < 0) throw new RoostAggregationError('epoch must be a non-negative integer');
    if (this.#signedRounds.has(`${contractId}:${syndicateId}:${epoch}:${roundNonce}`)) throw new RoostAggregationError('this round was already signed; open a new round with a new nonce');
    this.round = { contractId, syndicateId, epoch, roundNonce };
    this.sealedIntents = []; this.lastSeq = new Map(); this.aggregate = null; this.#escrow = null;
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
    const round = this.round; // the signature below is for this round only
    if (!verifyNearSignature(publicKey, inputMessage({ ...round, flyerId, seq, cipherTextHex }), signature)) throw new RoostAggregationError('bad signature for this input and this round');
    let belongs = false;
    try { belongs = await this.accountKeyCheck(flyerId, publicKey); } catch { throw new RoostAggregationError(`could not check that ${publicKey} is a key of ${flyerId}`); }
    if (this.round !== round) throw new RoostAggregationError('the round changed while this input was being checked: sign it again for the new round');
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
    this.#assertNoSignedAggregate();
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
    this.#assertNoSignedAggregate();
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
    const aff = this.#affordable(bids, (b) => b.flyerId, (b) => b.priceMicro * BigInt(Math.min(b.quantity, lotUnits)) * YOCTO_PER_MICRO);
    const outcome = clearAuction({ format, bids: aff.kept, lotUnits, reserveMicro });
    this.sealedIntents = []; // plaintext never outlives this call
    const pub = {
      ...(this.escrowReader ? { excludedForEscrow: aff.excluded, escrowBlock: aff.block } : {}), format, lotUnits, reserve: formatMicro(reserveMicro), sold: outcome.sold, bidsReceived: outcome.bidsReceived, bidsEligible: outcome.bidsEligible, excludedFlyers: excluded,
      clearingPrice: outcome.sold ? formatMicro(outcome.clearingPriceMicro) : null,
      fills: outcome.fills.map((f) => ({ member: f.flyerId, units: f.units, pays: formatMicro(f.payMicro) })),
      proceeds: formatMicro(outcome.proceedsMicro),
      executionModel: 'HOSTED_SEALED_AUCTION', confidentiality: this.provider.simulated ? 'simulated' : 'tee-hosted',
    };
    if (!outcome.sold) { this.aggregate = null; return { outcome: pub, orderHash: null, allocations: [], charges: [], settlePublicKey: this.settlePublicKey }; }
    const allocations = [{ recipient: seller, amount: String(outcome.proceedsMicro * YOCTO_PER_MICRO) }];
    const charges = outcome.fills.map((f) => ({ member: f.flyerId, amount: String(f.payMicro * YOCTO_PER_MICRO) }));
    const bound = Object.fromEntries(outcome.fills.map((f) => [f.flyerId, f.bidMicro * YOCTO_PER_MICRO]));
    const orderHash = sha256Hex(`midge-auction-v1:${roundId}:${format}:${lotUnits}:${formatMicro(reserveMicro)}:${seller}:${JSON.stringify(pub.fills)}:${pub.clearingPrice}:${excluded.length}:${this.#orderSalt()}${aff.tag}`);
    this.aggregate = { orderHash, totalMicro: outcome.proceedsMicro, signed: false, program: { allocations, charges, bound } };
    return { outcome: pub, orderHash, allocations, charges, settlePublicKey: this.settlePublicKey };
  }

  /**
   * Run a pooled round: each sealed bid decrypts to { amount } (NEAR, up to 6 places); the total goes to `recipient` and each
   * member is charged exactly their own amount. Settled with settle_batch_charged. A bid that cannot be read, or is under
   * `min` or over the `cap`, is left out and its flyerId reported, never its content.
   */
  runPool({ recipient, min = '0', cap = null, roundId = '' } = {}) {
    this.#assertNoSignedAggregate();
    if (typeof recipient !== 'string' || recipient.length === 0 || recipient.includes(':') || recipient.includes(',')) throw new RoostAggregationError('recipient must be a plain account id');
    const minMicro = toMicro(min); const capMicro = cap === null ? null : toMicro(cap);
    if (minMicro === null || (cap !== null && capMicro === null)) throw new RoostAggregationError('min and cap must be decimals with at most 6 places');
    if (this.sealedIntents.length === 0) throw new RoostAggregationError('cannot run a pool on an empty sealed bid queue');
    const bids = []; const unreadable = [];
    this.#inRoundOrder().forEach((intent, order) => {
      try { const payload = JSON.parse(openFromModel(intent.cipherTextHex, this.#intentSecret)); const amountMicro = toMicro(payload?.amount); if (amountMicro === null) throw new Error('malformed'); bids.push({ flyerId: intent.flyerId, amountMicro, order }); } catch { unreadable.push(intent.flyerId); }
    });
    const aff = this.#affordable(bids, (b) => b.flyerId, (b) => b.amountMicro * YOCTO_PER_MICRO);
    const out = clearPool({ bids: aff.kept, minMicro, capMicro });
    this.sealedIntents = [];
    const pub = { ...(this.escrowReader ? { excludedForEscrow: aff.excluded, escrowBlock: aff.block } : {}), format: 'pool', recipient, sold: out.sold, members: out.contributions.length, total: formatMicro(out.totalMicro), leftOut: [...unreadable, ...out.leftOut], executionModel: 'HOSTED_SEALED_POOL', confidentiality: this.provider.simulated ? 'simulated' : 'tee-hosted' };
    if (!out.sold) { this.aggregate = null; return { outcome: pub, orderHash: null, allocations: [], charges: [], settlePublicKey: this.settlePublicKey }; }
    const allocations = [{ recipient, amount: String(out.totalMicro * YOCTO_PER_MICRO) }];
    const charges = out.contributions.map((c) => ({ member: c.flyerId, amount: String(c.amountMicro * YOCTO_PER_MICRO) }));
    const bound = Object.fromEntries(out.contributions.map((c) => [c.flyerId, c.amountMicro * YOCTO_PER_MICRO]));
    const orderHash = sha256Hex(`midge-pool-v1:${roundId}:${recipient}:${pub.total}:${out.contributions.length}:${pub.leftOut.length}:${this.#orderSalt()}${aff.tag}`);
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
    this.#assertNoSignedAggregate();
    if (shape !== 'lend' && shape !== 'buy') throw new RoostAggregationError("shape must be 'lend' or 'buy'");
    if (pricing !== 'first' && pricing !== 'second') throw new RoostAggregationError("pricing must be 'first' or 'second'");
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
    let aff;
    if (shape === 'lend') aff = this.#affordable(quotes, (q) => q.flyerId, () => fixedMicro * YOCTO_PER_MICRO);
    else {
      aff = this.#affordable([counterparty], (c) => c, () => BigInt(units) * limitMicro * YOCTO_PER_MICRO, [counterparty]);
      if (aff.excluded.length) throw new RoostAggregationError(`${counterparty} cannot cover the most this round could charge (units x limit); the queue is kept`);
    }
    const out = clearBestQuote({ direction: 'lowest', quotes: shape === 'lend' ? aff.kept : quotes, limitMicro, pricing });
    this.sealedIntents = [];
    const pub = { ...(this.escrowReader ? { excludedForEscrow: shape === 'lend' ? aff.excluded : [], escrowBlock: aff.block } : {}), shape, pricing, counterparty, won: out.won, winner: out.winner, quotesReceived: out.quotesReceived, quotesEligible: out.quotesEligible, unreadable, executionModel: 'HOSTED_SEALED_QUOTE', confidentiality: this.provider.simulated ? 'simulated' : 'tee-hosted' };
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
    const orderHash = sha256Hex(`midge-quote-v1:${roundId}:${shape}:${pricing}:${counterparty}:${out.winner}:${out.priceMicro}:${payMicro}:${this.#orderSalt()}${aff.tag}`);
    this.aggregate = { orderHash, totalMicro: payMicro, signed: false, program: { allocations, charges, bound } };
    return { outcome: pub, orderHash, allocations, charges, settlePublicKey: this.settlePublicKey };
  }

  /**
   * Count sealed ballots. Each input is { choice } (an option id or 'abstain'), signed by a roll member; a later signed ballot
   * replaces an earlier one. `options` maps option ids to the recipients the rules allow; `roll` lists the members; `share` is
   * what each member contributes to the pool. If a strict winner emerges under the quorum and the rule, the whole pool
   * (share x roll size) is paid to that option's recipient, charged equally to the whole roll. The published outcome names the
   * winner or the reason nothing was decided, never a tally or a turnout. Refuses to run on a host that accepts unsigned inputs.
   */
  runBallot({ options, roll, share, quorumBps = 5000, rule = 'majority', roundId = '' } = {}) {
    this.#assertNoSignedAggregate();
    if (!this.requireSignedInputs) throw new RoostAggregationError('a ballot is only counted on a host that requires signed inputs');
    if (!options || typeof options !== 'object') throw new RoostAggregationError('options must map option ids to recipients');
    const ids = Object.keys(options);
    if (ids.length < 2 || ids.length > 8) throw new RoostAggregationError('a ballot needs 2 to 8 options');
    for (const [k, v] of Object.entries(options)) if (!/^[A-Za-z0-9_-]{1,32}$/.test(k) || k === 'abstain' || !isAccountId(v)) throw new RoostAggregationError('each option needs a plain id (not abstain) and a recipient account');
    if (!Array.isArray(roll) || roll.length < 1 || roll.length > 50 || new Set(roll).size !== roll.length || !roll.every(isAccountId)) throw new RoostAggregationError('roll must list 1 to 50 distinct accounts');
    const shareMicro = toMicro(share);
    if (shareMicro === null || shareMicro === 0n) throw new RoostAggregationError('share must be a positive decimal with at most 6 places');
    if (this.sealedIntents.length === 0) throw new RoostAggregationError('cannot count an empty ballot box');
    const ballots = []; const unreadable = [];
    this.#inRoundOrder().forEach((intent, order) => {
      try { const b = JSON.parse(openFromModel(intent.cipherTextHex, this.#intentSecret)); if (typeof b?.choice !== 'string') throw new Error('malformed'); ballots.push({ flyerId: intent.flyerId, choice: b.choice, order }); } catch { unreadable.push(intent.flyerId); }
    });
    // Every roll member is charged a share whether or not they voted, so the roll is what must be able to pay.
    const aff = this.#affordable(roll, (m) => m, () => shareMicro * YOCTO_PER_MICRO, roll);
    const payingRoll = aff.kept;
    if (payingRoll.length === 0) {
      this.sealedIntents = []; this.aggregate = null;
      const pubNone = { shape: 'ballot', rule, decided: false, winner: null, recipient: null, reason: 'no-eligible-members', quorumMet: false, outsiders: [], unreadable, excludedForEscrow: aff.excluded, executionModel: 'HOSTED_SEALED_BALLOT', confidentiality: this.provider.simulated ? 'simulated' : 'tee-hosted' };
      return { outcome: pubNone, orderHash: null, allocations: [], charges: [], settlePublicKey: this.settlePublicKey };
    }
    const out = clearBallot({ options: ids, roll: payingRoll, ballots, quorumBps, rule });
    this.sealedIntents = [];
    const recipient = out.decided ? options[out.winner] : null;
    const pub = { shape: 'ballot', rule, decided: out.decided, winner: out.winner, recipient, reason: out.reason, quorumMet: out.quorumMet, outsiders: out.outsiders, unreadable, ...(this.escrowReader ? { excludedForEscrow: aff.excluded } : {}), executionModel: 'HOSTED_SEALED_BALLOT', confidentiality: this.provider.simulated ? 'simulated' : 'tee-hosted' };
    if (!out.decided) { this.aggregate = null; return { outcome: pub, orderHash: null, allocations: [], charges: [], settlePublicKey: this.settlePublicKey }; }
    const poolMicro = shareMicro * BigInt(payingRoll.length);
    const allocations = [{ recipient, amount: String(poolMicro * YOCTO_PER_MICRO) }];
    const charges = payingRoll.map((m) => ({ member: m, amount: String(shareMicro * YOCTO_PER_MICRO) }));
    const bound = Object.fromEntries(payingRoll.map((m) => [m, shareMicro * YOCTO_PER_MICRO]));
    const orderHash = sha256Hex(`midge-ballot-v1:${roundId}:${rule}:${out.winner}:${recipient}:${poolMicro}:${[...payingRoll].sort().join(',')}:${this.#orderSalt()}${aff.tag}`);
    this.aggregate = { orderHash, totalMicro: poolMicro, signed: false, program: { allocations, charges, bound } };
    return { outcome: pub, orderHash, allocations, charges, settlePublicKey: this.settlePublicKey };
  }

  /**
   * Two-sided request for quote. The taker seals one signed request { side: 'buy'|'sell', units, limit, salt }; each maker in
   * `makers` seals a signed two-way quote { bid, ask }, so a maker never learns which way the taker trades or how much. A buy goes
   * to the lowest ask at or under the limit, a sell to the highest bid at or over it ('first' pays the winner's own quote, 'second'
   * the runner-up's). On a buy the taker is charged and the winning maker paid; on a sell the winning maker is charged and the
   * taker paid. The settlement reveals who pays whom and the notional, not the units or the price per unit: the order hash carries
   * the taker's secret salt so an observer cannot recover them by trying every pair. Only the cash leg moves.
   */
  runRfq({ taker, makers, pricing = 'first', roundId = '' } = {}) {
    this.#assertNoSignedAggregate();
    if (!this.requireSignedInputs) throw new RoostAggregationError('an RFQ is only run on a host that requires signed inputs');
    if (!isAccountId(taker)) throw new RoostAggregationError('taker must be a plain account id');
    if (pricing !== 'first' && pricing !== 'second') throw new RoostAggregationError("pricing must be 'first' or 'second'");
    if (!Array.isArray(makers) || makers.length < 1 || makers.length > 7 || new Set(makers).size !== makers.length || !makers.every(isAccountId) || makers.includes(taker)) throw new RoostAggregationError('makers must list 1 to 7 distinct plain account ids, not including the taker');
    const mine = this.sealedIntents.find((i) => i.flyerId === taker);
    if (!mine) throw new RoostAggregationError('no request was sealed by the taker');
    let req;
    try { req = JSON.parse(openFromModel(mine.cipherTextHex, this.#intentSecret)); } catch { throw new RoostAggregationError('the taker\'s request could not be read'); }
    if (req?.side !== 'buy' && req?.side !== 'sell') throw new RoostAggregationError("the request's side must be 'buy' or 'sell'");
    if (!Number.isSafeInteger(req.units) || req.units < 1 || req.units > 1_000_000) throw new RoostAggregationError('units must be an integer from 1 to 1,000,000');
    const limitMicro = toMicro(req.limit);
    if (limitMicro === null || limitMicro === 0n) throw new RoostAggregationError('limit must be a positive decimal with at most 6 places');
    if (typeof req.salt !== 'string' || req.salt.length < 16) throw new RoostAggregationError('the request needs a secret salt of 16 or more characters (the order hash would otherwise be guessable)');
    const makerSet = new Set(makers); const quotes = []; const unreadable = []; const outsiders = [];
    this.#inRoundOrder().forEach((intent, order) => {
      if (intent.flyerId === taker) return;
      if (!makerSet.has(intent.flyerId)) { outsiders.push(intent.flyerId); return; }
      try {
        const b = JSON.parse(openFromModel(intent.cipherTextHex, this.#intentSecret)); const bid = toMicro(b?.bid); const ask = toMicro(b?.ask);
        if (bid === null || ask === null || bid === 0n || ask === 0n || bid > ask) throw new Error('malformed or crossed');
        quotes.push({ flyerId: intent.flyerId, valueMicro: req.side === 'buy' ? ask : bid, order });
      } catch { unreadable.push(intent.flyerId); }
    });
    let aff;
    if (req.side === 'buy') {
      aff = this.#affordable([taker], (t) => t, () => BigInt(req.units) * limitMicro * YOCTO_PER_MICRO, [taker]);
      if (aff.excluded.length) throw new RoostAggregationError(`${taker} cannot cover the most this request could charge (units x limit); the queue is kept`);
    } else aff = this.#affordable(quotes, (q) => q.flyerId, (q) => BigInt(req.units) * q.valueMicro * YOCTO_PER_MICRO);
    const out = clearBestQuote({ direction: req.side === 'buy' ? 'lowest' : 'highest', quotes: req.side === 'buy' ? quotes : aff.kept, limitMicro, pricing });
    this.sealedIntents = [];
    const pub = { ...(this.escrowReader ? { excludedForEscrow: req.side === 'buy' ? [] : aff.excluded, escrowBlock: aff.block } : {}), shape: 'rfq', pricing, taker, won: out.won, winner: out.winner, quotesReceived: out.quotesReceived, quotesEligible: out.quotesEligible, outsiders, unreadable, executionModel: 'HOSTED_SEALED_RFQ', confidentiality: this.provider.simulated ? 'simulated' : 'tee-hosted' };
    if (!out.won) { this.aggregate = null; return { outcome: pub, terms: null, orderHash: null, allocations: [], charges: [], settlePublicKey: this.settlePublicKey }; }
    const costMicro = BigInt(req.units) * out.priceMicro; const amount = String(costMicro * YOCTO_PER_MICRO);
    let allocations; let charges; let bound;
    if (req.side === 'buy') { allocations = [{ recipient: out.winner, amount }]; charges = [{ member: taker, amount }]; bound = { [taker]: BigInt(req.units) * limitMicro * YOCTO_PER_MICRO }; }
    else { allocations = [{ recipient: taker, amount }]; charges = [{ member: out.winner, amount }]; bound = { [out.winner]: BigInt(req.units) * out.winnerQuoteMicro * YOCTO_PER_MICRO }; }
    const orderHash = sha256Hex(`midge-rfq-v1:${roundId}:${req.side}:${taker}:${out.winner}:${out.priceMicro}:${req.units}:${req.salt}${aff.tag}`);
    this.aggregate = { orderHash, totalMicro: costMicro, signed: false, program: { allocations, charges, bound } };
    const terms = { side: req.side, units: req.units, price: formatMicro(out.priceMicro), notional: formatMicro(costMicro) };
    return { outcome: pub, terms, orderHash, allocations, charges, settlePublicKey: this.settlePublicKey };
  }

  /**
   * Run a pay run. The employer seals one signed input { lines: [{ payee, person, invoiceId, period, gross, tax, benefits,
   * payeeKey }] }; any other sealed input is ignored. Each person is paid their net, the tax and benefits providers their totals,
   * and the employer is charged the gross total. The host signs a receipt per line, puts the receipt hashes under a Merkle
   * root that the order hash commits to, and encrypts each statement to its owner's key: a person gets their own receipt and
   * proof, the employer every line, the auditor totals only. Every payment's address and amount is public once settled; this
   * hides who a payee is (a one-time address only the room can map to a person), and adds a private paper trail.
   */
  runPayrun({ employer, taxAddress, benefitsAddress, employerKeyHex, auditorKeyHex, runId = 'run' } = {}) {
    this.#assertNoSignedAggregate();
    if (!this.requireSignedInputs) throw new RoostAggregationError('a pay run is only run on a host that requires signed inputs');
    if (!isAccountId(employer)) throw new RoostAggregationError('employer must be a plain account id');
    for (const [k, v] of Object.entries({ employerKeyHex, auditorKeyHex })) if (!/^[0-9a-f]{64}$/i.test(String(v))) throw new RoostAggregationError(`${k} must be a 32-byte hex public key`);
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(String(runId))) throw new RoostAggregationError('runId must be 1 to 64 plain characters');
    const mine = this.sealedIntents.find((i) => i.flyerId === employer);
    if (!mine) throw new RoostAggregationError('no pay run was sealed by the employer');
    const ignored = this.sealedIntents.filter((i) => i.flyerId !== employer).map((i) => i.flyerId);
    let body;
    try { body = JSON.parse(openFromModel(mine.cipherTextHex, this.#intentSecret)); } catch { throw new RoostAggregationError('the employer\'s pay run could not be read'); }
    let built;
    try { built = buildPayrun({ lines: body?.lines, taxAddress, benefitsAddress, runId }); } catch (e) { throw new RoostAggregationError(e.message); }
    // One payer: the employer. There is nobody to leave out, so a payer who cannot cover the gross pay stops the run (queue kept).
    const aff = this.#affordable([employer], (e) => e, () => built.grossMicro * YOCTO_PER_MICRO, [employer]);
    if (aff.excluded.length) throw new RoostAggregationError(`${employer} cannot cover the gross pay of this run; the queue is kept`);
    const leaves = built.receipts.map((r) => leafHash(r));
    const root = merkleRoot(leaves);
    const sign = (leaf) => crypto.sign(null, Buffer.from(receiptSigningMessage(leaf), 'utf8'), this.#settleKey).toString('hex');
    const withProof = (i) => ({ receipt: built.receipts[i], signature: sign(leaves[i]), proof: merkleProof(leaves, i), receiptsRoot: root, runId, hostSettlePublicKey: this.settlePublicKey });
    const statements = { payees: {}, employer: null, auditor: null };
    built.receipts.forEach((r, i) => { if (r.kind === 'pay') statements.payees[r.payee] = { cipherHex: sealToModel(JSON.stringify(withProof(i)), built.payeeKeys[i]) }; });
    statements.employer = { cipherHex: sealToModel(JSON.stringify({ runId, receiptsRoot: root, lines: built.receipts.map((_, i) => withProof(i)) }), employerKeyHex) };
    statements.auditor = { cipherHex: sealToModel(JSON.stringify({ runId, receiptsRoot: root, ...built.totals }), auditorKeyHex) };
    this.sealedIntents = [];
    const orderHash = payrunOrderHash(runId, root);
    const charges = [{ member: employer, amount: String(built.grossMicro * YOCTO_PER_MICRO) }];
    const bound = { [employer]: built.grossMicro * YOCTO_PER_MICRO };
    this.aggregate = { orderHash, totalMicro: built.grossMicro, signed: false, program: { allocations: built.allocations, charges, bound } };
    const outcome = { ...(this.escrowReader ? { escrowBlock: aff.block } : {}), shape: 'payrun', runId, receiptsRoot: root, lines: built.totals.headcount, recipients: built.allocations.length, gross: fmtMicro(built.grossMicro), ignored, executionModel: 'HOSTED_SEALED_PAYRUN', confidentiality: this.provider.simulated ? 'simulated' : 'tee-hosted' };
    return { outcome, orderHash, allocations: built.allocations, charges, statements, receiptsRoot: root, settlePublicKey: this.settlePublicKey };
  }

  /**
   * Block-trade cross, pro-rata. Each sealed input is { side: 'buy'|'sell', units, limit }. Buyers whose limit is at or above
   * the public `referencePrice` and sellers whose limit is at or below it qualify (the limit decides nothing else); matched units are
   * the smaller side's total, the short side fills in full and the long side in proportion to size. `maxUnits` is a public cap on any one order. Sellers are paid, buyers are charged, equal sums. Settled with settle_batch_charged. Only the
   * cash leg moves; the asset is not delivered. The reference price is supplied, not verified.
   */
  runCross({ referencePrice, maxUnits = null, roundId = '' } = {}) {
    this.#assertNoSignedAggregate();
    const referenceMicro = toMicro(referencePrice);
    if (referenceMicro === null || referenceMicro === 0n) throw new RoostAggregationError('referencePrice must be a positive decimal with at most 6 places');
    if (this.sealedIntents.length === 0) throw new RoostAggregationError('cannot run a cross on an empty sealed queue');
    if (maxUnits !== null && (!Number.isSafeInteger(maxUnits) || maxUnits < 1 || maxUnits > 1_000_000)) throw new RoostAggregationError('maxUnits must be an integer from 1 to 1,000,000, or null');
    const buys = []; const sells = []; const unreadable = [];
    this.#inRoundOrder().forEach((intent, order) => {
      try {
        const b = JSON.parse(openFromModel(intent.cipherTextHex, this.#intentSecret)); const limitMicro = toMicro(b?.limit);
        if ((b?.side !== 'buy' && b?.side !== 'sell') || !Number.isSafeInteger(b?.units) || b.units < 1 || b.units > 1_000_000 || limitMicro === null) throw new Error('malformed');
        (b.side === 'buy' ? buys : sells).push({ flyerId: intent.flyerId, units: b.units, limitMicro, order });
      } catch { unreadable.push(intent.flyerId); }
    });
    const aff = this.#affordable(buys, (b) => b.flyerId, (b) => BigInt(b.units) * b.limitMicro * YOCTO_PER_MICRO);
    const out = clearCross({ buys: aff.kept, sells, referenceMicro, maxUnits });
    const queued = this.sealedIntents; // kept so a cross that cannot be settled does not cost every member their order
    this.sealedIntents = [];
    const cashTotal = out.matchedUnits * referenceMicro;
    const pub = { ...(this.escrowReader ? { excludedForEscrow: aff.excluded, escrowBlock: aff.block } : {}), shape: 'cross', referencePrice: formatMicro(referenceMicro), maxUnits, matchedUnits: Number(out.matchedUnits), cash: formatMicro(cashTotal), buyers: out.buyFills.length, sellers: out.sellFills.length, ordersReceived: out.buysReceived + out.sellsReceived, unreadable, executionModel: 'HOSTED_SEALED_CROSS', confidentiality: this.provider.simulated ? 'simulated' : 'tee-hosted' };
    if (out.matchedUnits === 0n) { this.aggregate = null; return { outcome: pub, orderHash: null, allocations: [], charges: [], settlePublicKey: this.settlePublicKey }; }
    if (out.sellFills.length > 8) { this.sealedIntents = queued; throw new RoostAggregationError('a settlement can pay at most 8 sellers'); }
    const allocations = out.sellFills.map((f) => ({ recipient: f.flyerId, amount: String(f.cashMicro * YOCTO_PER_MICRO) }));
    const charges = out.buyFills.map((f) => ({ member: f.flyerId, amount: String(f.cashMicro * YOCTO_PER_MICRO) }));
    const bound = Object.fromEntries(out.buyFills.map((f) => [f.flyerId, f.ordered * f.limitMicro * YOCTO_PER_MICRO]));
    const orderHash = sha256Hex(`midge-cross-v1:${roundId}:${referenceMicro}:${out.matchedUnits}:${out.buyFills.map((f) => `${f.flyerId}=${f.units}`).sort().join(',')}:${out.sellFills.map((f) => `${f.flyerId}=${f.units}`).sort().join(',')}:${this.#orderSalt()}${aff.tag}`);
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
    this.#signedRounds.add(`${contractId}:${syndicateId}:${epoch}:${roundNonce}`);
    if (this.#signedRounds.size > 1000) this.#signedRounds.delete(this.#signedRounds.values().next().value);
    return { message, signature, allocationsHash, orderHash: agg.orderHash, settlePublicKey: this.settlePublicKey };
  }
}
