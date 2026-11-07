/**
 * RoomService: one door in front of a hosted room.
 *
 * In plain words: a caller opens a round, members submit sealed inputs, and one call runs the room and hands back the finished
 * contract call. The caller never copies an order hash, an allocation or a charge, and never picks the contract method.
 *
 *   describe()                    what this room can do, and its public keys
 *   open(round)                   start a round; signed inputs are bound to it
 *   submit(input)                 one sealed input (signed, on a host that requires it)
 *   run({ program, params, round })  -> { outcome, orderHash, settlement | null }
 *
 * The host stays the only place a signature is made (signSettlement), and it still signs only what it computed. This module adds
 * no clearing logic: a room kind is a registry entry that points at the host's own program. See docs/RUNROOM_DESIGN.md.
 */
import crypto from 'node:crypto';
import { RoostAggregationError } from '../enclave/errors.js';

export class RoomError extends Error {
  /** @param {'INVALID_PARAMS'|'UNKNOWN_PROGRAM'|'ROUND_NOT_OPEN'|'NO_INPUTS'|'ALREADY_SIGNED'|'NOT_AUTHORISED'|'INTERNAL'} code */
  constructor(code, message) {
    super(message);
    this.name = 'RoomError';
    this.code = code;
  }
}

const ROUND_KEYS = ['contractId', 'syndicateId', 'epoch', 'roundNonce'];
const sameRound = (a, b) => Boolean(a) && Boolean(b) && ROUND_KEYS.every((k) => a[k] === b[k]);
const canonical = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));
const digest = (v) => crypto.createHash('sha256').update(canonical(v)).digest('hex');

/** The vote room: the host's own runBallot, with its parameters checked and defaulted here. */
const ballot = {
  id: 'ballot',
  needsSignedInputs: true,
  summary: 'A sealed vote among a named roll; the winning option\'s recipient is paid the pool, each voter is charged one share. Decides nothing on a tie or a missed quorum.',
  params: {
    options: { type: 'object', required: true, description: 'option id -> recipient account (2 to 8 options)' },
    roll: { type: 'array', required: true, description: 'the accounts allowed to vote (1 to 50)' },
    share: { type: 'string', required: true, description: 'what each voter puts in, in NEAR, up to 6 decimals' },
    quorumBps: { type: 'integer', required: false, default: 5000, description: 'turnout needed, in basis points of the roll' },
    rule: { type: 'string', required: false, default: 'majority', enum: ['majority', 'plurality'] },
  },
  normalise(p) {
    const q = { ...p };
    if (q.quorumBps === undefined) q.quorumBps = 5000;
    if (q.rule === undefined) q.rule = 'majority';
    return q;
  },
  // Only what the host does not check: its runBallot owns every other rule (shapes, option and roll counts, a positive share), so there is
  // one source of truth and a wrong shape comes back as INVALID_PARAMS from the host's own error.
  validate(p) {
    return Number.isInteger(p.quorumBps) && p.quorumBps >= 0 && p.quorumBps <= 10000 && ['majority', 'plurality'].includes(p.rule);
  },
  run: (host, p) => host.runBallot({ options: p.options, roll: p.roll, share: p.share, quorumBps: p.quorumBps, rule: p.rule }),
};

/** A plain pass-through entry: the host's own run method owns every value rule; the service adds only the contract call around it. */
const hostProgram = (id, summary, params, call, extra = {}) => ({
  id, summary, params, needsSignedInputs: false, normalise: (p) => ({ ...p }), validate: () => true, run: call, ...extra,
});

const pool = hostProgram('pool',
  'Members seal how much they put in; the room totals the sealed amounts and pays the total to one recipient, charging each member their own amount (up to an optional cap).',
  { recipient: { type: 'string', required: true, description: 'the account paid the total' }, min: { type: 'string', required: false, default: '0', description: 'the least total worth paying' }, cap: { type: 'string', required: false, default: null, description: 'the most the pool will take' } },
  (h, p) => h.runPool(p));

const auction = hostProgram('auction',
  'A sealed auction: first-price, second-price or uniform-price. The seller is paid; each winner is charged what the format says, never more than they bid.',
  { format: { type: 'string', required: true, enum: ['first-price', 'second-price', 'uniform'] }, seller: { type: 'string', required: true }, lotUnits: { type: 'integer', required: false, default: 1 }, reserve: { type: 'string', required: false, default: '0' } },
  (h, p) => h.runAuction(p));

const quote = hostProgram('quote',
  'Sealed best quote: the lowest rate (lending) or lowest price (buying) at or under the limit wins and is paid by the counterparty. Decides nothing if no quote is eligible.',
  { shape: { type: 'string', required: true, enum: ['lend', 'buy'] }, pricing: { type: 'string', required: false, default: 'first', enum: ['first', 'second'] }, counterparty: { type: 'string', required: true }, amount: { type: 'string', required: false, description: 'lend: the amount borrowed' }, units: { type: 'integer', required: false, description: 'buy: how many units' }, limit: { type: ['string', 'integer'], required: true, description: 'lend: the highest rate in basis points; buy: the highest price' } },
  (h, p) => h.runQuote(p));

const cross = hostProgram('cross',
  'A sealed block trade: buy and sell orders cross at a public reference price, matched pro rata on the long side. Only the cash leg settles.',
  { referencePrice: { type: 'string', required: true }, maxUnits: { type: 'integer', required: false, default: null } },
  (h, p) => h.runCross(p));

const rfq = hostProgram('rfq',
  'A two-sided request for quote: one taker seals a side, units and limit; each maker seals a bid and an ask. The best eligible quote wins. Only the cash leg settles.',
  { taker: { type: 'string', required: true }, makers: { type: 'array', required: true, description: '1 to 7 maker accounts' }, pricing: { type: 'string', required: false, default: 'first', enum: ['first', 'second'] } },
  (h, p) => h.runRfq(p),
  { needsSignedInputs: true, confidential: ['terms'] });

const payrun = hostProgram('payrun',
  'A sealed pay run: the employer seals the lines; the room pays each person their net, the tax and benefits addresses their totals, and returns signed receipts sealed to each payee, the employer and the auditor.',
  { employer: { type: 'string', required: true }, taxAddress: { type: 'string', required: true }, benefitsAddress: { type: 'string', required: true }, employerKeyHex: { type: 'string', required: true }, auditorKeyHex: { type: 'string', required: true }, runId: { type: 'string', required: false, default: 'run' } },
  (h, p) => h.runPayrun(p),
  { needsSignedInputs: true, sealed: ['statements'] });

export class RoomService {
  static defaultPrograms = Object.freeze([ballot, pool, auction, quote, cross, rfq, payrun]);

  #host;
  #programs;
  #last = null; // { key, result, signed } for the open round

  constructor({ host, programs = RoomService.defaultPrograms } = {}) {
    if (!host) throw new Error('RoomService needs a host');
    this.#host = host;
    this.#programs = new Map(programs.map((p) => [p.id, p]));
  }

  describe() {
    const h = this.#host;
    return {
      settlePublicKey: h.settlePublicKey,
      intentPublicKey: h.intentPublicKey,
      simulated: Boolean(h.provider?.simulated),
      requiresSignedInputs: Boolean(h.requireSignedInputs),
      programs: [...this.#programs.values()].map((p) => ({ id: p.id, summary: p.summary, needsSignedInputs: Boolean(p.needsSignedInputs), params: p.params })),
    };
  }

  open(round) {
    try {
      const opened = this.#host.openRound(round);
      this.#last = null;
      return opened;
    } catch (e) { throw this.#translate(e, 'INVALID_PARAMS'); }
  }

  async submit(input) {
    const h = this.#host;
    if (!h.round) throw new RoomError('ROUND_NOT_OPEN', 'no open round: call open first');
    if (this.#last?.signed) throw new RoomError('ALREADY_SIGNED', 'this round has already been settled; open a new round');
    if (h.requireSignedInputs && !(input && input.signature && input.publicKey)) throw new RoomError('NOT_AUTHORISED', 'this room only accepts signed inputs');
    try {
      const res = h.requireSignedInputs ? await h.submitSignedIntent(input) : h.submitSealedIntent(input);
      this.#last = null; // new input: an earlier undecided result no longer stands
      return { accepted: true, count: res.count, replaced: Boolean(res.replaced) };
    } catch (e) {
      if (e instanceof RoostAggregationError) {
        if (/signature|not a key|only accepts signed|could not check/.test(e.message)) throw new RoomError('NOT_AUTHORISED', e.message);
      }
      throw this.#translate(e, 'INVALID_PARAMS');
    }
  }

  async run({ program, params = {}, round, includeConfidential = false } = {}) {
    const h = this.#host;
    const prog = this.#programs.get(program);
    if (!prog) throw new RoomError('UNKNOWN_PROGRAM', `unknown program "${program}"; available: ${[...this.#programs.keys()].join(', ')}`);
    if (!h.round || !sameRound(h.round, round)) throw new RoomError('ROUND_NOT_OPEN', 'that round is not the open round');
    if (prog.needsSignedInputs && !h.requireSignedInputs) throw new RoomError('NOT_AUTHORISED', `"${program}" needs signed inputs and this room does not require them`);
    const normal = prog.normalise ? prog.normalise(params) : { ...params };
    const key = digest({ program, params: normal });
    if (this.#last && this.#last.key === key) return this.#shape(this.#last, includeConfidential); // an identical retry: same answer, no second signature
    if (this.#last?.signed) throw new RoomError('ALREADY_SIGNED', 'this round has already been settled; repeat the same call to read the result, or open a new round');
    if (!prog.validate(normal)) throw new RoomError('INVALID_PARAMS', `parameters for "${program}" are missing or out of range`);
    if (h.sealedIntents.length === 0) throw new RoomError('NO_INPUTS', 'no inputs have been submitted this round');
    let ran;
    try { ran = prog.run(h, normal); } catch (e) { throw this.#translate(e, 'INVALID_PARAMS'); }
    let settlement = null;
    if (ran.orderHash && ran.allocations?.length) {
      let signed;
      try { signed = h.signSettlement({ ...h.round, allocations: ran.allocations, orderHash: ran.orderHash, charges: ran.charges?.length ? ran.charges : undefined }); } catch (e) {
        if (e instanceof RoostAggregationError && /already been signed/.test(e.message)) throw new RoomError('ALREADY_SIGNED', e.message);
        throw this.#translate(e, 'INTERNAL');
      }
      const charged = Array.isArray(ran.charges) && ran.charges.length > 0;
      settlement = {
        method: charged ? 'settle_batch_charged' : 'settle_batch',
        args: {
          syndicate_id: h.round.syndicateId,
          attestation_nonce: h.round.roundNonce,
          aggregate_order_hash: ran.orderHash,
          allocations: ran.allocations,
          ...(charged ? { charges: ran.charges } : {}),
          enclave_signature: signed.signature,
        },
      };
    }
    const result = { outcome: ran.outcome, orderHash: ran.orderHash ?? null, settlement };
    for (const k of prog.sealed ?? []) if (ran[k] !== undefined) result[k] = ran[k]; // already encrypted to its readers, safe to return
    const confidential = Object.fromEntries((prog.confidential ?? []).filter((k) => ran[k] !== undefined && ran[k] !== null).map((k) => [k, ran[k]]));
    this.#last = { key, result, confidential, signed: settlement !== null };
    return this.#shape(this.#last, includeConfidential);
  }

  /** Plain detail only the caller who asks for it receives (an RFQ's units and price): left out of every default result. */
  #shape(last, include) {
    return include && Object.keys(last.confidential).length > 0 ? { ...last.result, confidential: last.confidential } : last.result;
  }

  #translate(e, fallback) {
    if (e instanceof RoomError) return e;
    if (e instanceof RoostAggregationError) return new RoomError(fallback, e.message);
    return new RoomError('INTERNAL', 'internal error'); // never echo an unexpected error's text
  }
}
