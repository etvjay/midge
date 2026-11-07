/**
 * A practice room: a RoomService over a simulated host, with generated member keys and ready-made scenarios for all seven kinds of
 * room. It is a SIMULATION. Its host key is ephemeral, its provider is simulated (no hardware, no attestation), and the contract it
 * names does not exist, so nothing it signs is valid for any real contract. It exists so a person or an agent can see a room work in
 * a minute: what members seal, what an observer sees, and what the finished contract call looks like.
 */
import crypto from 'node:crypto';
import { HostedRoost } from './hosted-roost.js';
import { RoomService, RoomError } from './room-service.js';
import { createEventHub } from './room-events.js';
import { sealToModel, generateClientKey, openFromModel } from '../enclave/e2ee.js';
import { signInputWithNearKey, inputMessage, nearKeyPair } from './signed-input.js';

export const DEMO_CONTRACT = 'demo.invalid';
const NOTICE = 'SIMULATION: this room runs on a simulated host with no hardware and no attestation. Its keys are generated in memory, the contract it names does not exist, and nothing it signs is valid for any real contract.';
const provider = { simulated: true, attest: async () => Buffer.from('demo-simulation-no-hardware'), info: async () => ({}) };
const initialNonce = crypto.createHash('sha256').update('midge-demo-round-0').digest('hex');

class DemoRoomService extends RoomService {
  describe() { return { ...super.describe(), notice: NOTICE }; }
  open(round) {
    if (!round || round.contractId !== DEMO_CONTRACT) throw new RoomError('INVALID_PARAMS', `a demo room only opens rounds for the demo contract (${DEMO_CONTRACT}), never a real one`);
    return super.open(round);
  }
}

const PAYEES = [['a1', 'Alice', '0.05'], ['a2', 'Bo', '0.04'], ['a3', 'Cy', '0.03'], ['a4', 'Di', '0.02']];

export function createDemoRoom() {
  const pairs = new Map(); // member id -> ed25519 NEAR-style key pair. Secrets never leave this closure.
  const keyOf = (id) => { if (!pairs.has(id)) pairs.set(id, nearKeyPair()); return pairs.get(id); };
  const accountKeyCheck = async (id, publicKey) => pairs.has(id) && pairs.get(id).publicKey === publicKey;
  const host = new HostedRoost({ provider, requireSignedInputs: true, accountKeyCheck, deterministicOrder: true });
  const events = createEventHub({ size: 100 });
  const service = new DemoRoomService({ host, events });
  let current = { contractId: DEMO_CONTRACT, syndicateId: 'demo', epoch: 1, roundNonce: initialNonce };

  const readers = { employer: generateClientKey(), auditor: generateClientKey(), ...Object.fromEntries(PAYEES.map(([k]) => [`${k}.demo`, generateClientKey()])) };
  const roll = ['m1.demo', 'm2.demo', 'm3.demo', 'm4.demo', 'm5.demo'];
  const rfqSalt = crypto.randomBytes(16).toString('hex');
  const lines = PAYEES.map(([k, person, gross]) => ({ payee: `${k}.demo`, person, invoiceId: `INV-${k}`, period: '2026-11', gross, tax: (Number(gross) * 0.15).toFixed(6), benefits: (Number(gross) * 0.05).toFixed(6), payeeKey: readers[`${k}.demo`].publicKeyHex }));

  const scenarios = {
    ballot: {
      program: 'ballot', title: 'A private vote',
      description: 'Five members vote between two options. The room counts the sealed ballots and, if one option wins with enough turnout, pays the pool to that option\'s recipient. A tie or a missed quorum pays nothing.',
      hides: 'Who voted for what, and how many votes each option got.',
      reveals: 'That a vote happened, who took part (every voter is charged one share), which option won and who was paid.',
      inputs: roll.map((m, i) => ({ member: m, body: { choice: ['A', 'A', 'A', 'B', 'abstain'][i] } })),
      params: { options: { A: 'ra.demo', B: 'rb.demo' }, roll, share: '0.01', quorumBps: 5000, rule: 'majority' },
    },
    pool: {
      program: 'pool', title: 'Investing together',
      description: 'Four members each seal how much they want to put in. The room adds the sealed amounts and pays the total to one recipient, charging each member their own amount.',
      hides: 'Every amount, while the round is open and from anyone outside the room.',
      reveals: 'Each member\'s amount after settlement: the contract call lists a charge per member, so an observer can read every amount.',
      inputs: [['a.demo', '0.01'], ['b.demo', '0.02'], ['c.demo', '0.03'], ['d.demo', '0.04']].map(([member, amount]) => ({ member, body: { amount } })),
      params: { recipient: 'fund.demo', min: '0' },
    },
    auction: {
      program: 'auction', title: 'A sealed auction',
      description: 'Four bidders seal a price for one lot. In a second-price auction the highest bidder wins but pays the second-highest price.',
      hides: 'The losing bids.',
      reveals: 'The winner, the price paid, and who paid what.',
      inputs: [['a.demo', '0.009'], ['b.demo', '0.007'], ['c.demo', '0.006'], ['d.demo', '0.004']].map(([member, price]) => ({ member, body: { price } })),
      params: { format: 'second-price', seller: 'seller.demo', lotUnits: 1, reserve: '0' },
    },
    quote: {
      program: 'quote', title: 'The best loan quote',
      description: 'Three lenders seal the interest rate they ask. The lowest rate at or under the borrower\'s limit wins.',
      hides: 'The losing rates.',
      reveals: 'The winning lender and the rate paid.',
      inputs: [['l1.demo', 450], ['l2.demo', 400], ['l3.demo', 500]].map(([member, rateBps]) => ({ member, body: { rateBps } })),
      params: { shape: 'lend', counterparty: 'borrower.demo', amount: '5', limit: 700 },
    },
    cross: {
      program: 'cross', title: 'A block trade',
      description: 'Buyers and sellers seal orders. The room crosses them at a public reference price and matches as much as it can, pro rata on the longer side. Only the cash leg settles.',
      hides: 'Each order\'s limit price and the unmatched remainder.',
      reveals: 'Who traded, how much cash moved and the reference price.',
      inputs: [['b1.demo', { side: 'buy', units: 10, limit: '1.10' }], ['b2.demo', { side: 'buy', units: 5, limit: '1.05' }], ['s1.demo', { side: 'sell', units: 8, limit: '0.95' }], ['s2.demo', { side: 'sell', units: 10, limit: '0.90' }]].map(([member, body]) => ({ member, body })),
      params: { referencePrice: '1.00' },
    },
    rfq: {
      program: 'rfq', title: 'Ask for a quote, both ways',
      description: 'One taker seals what they want to do (buy or sell, how many, at most what price). Each maker seals a bid and an ask without knowing which way the taker trades. The best eligible quote wins.',
      hides: 'Which way the taker trades, how many units, and the losing quotes.',
      reveals: 'Who paid whom and the total cash (the notional).',
      inputs: [{ member: 'taker.demo', body: { side: 'buy', units: 10, limit: '0.0022', salt: rfqSalt } },
        ...[['m1.demo', '0.00195', '0.00205'], ['m2.demo', '0.0019', '0.002'], ['m3.demo', '0.00197', '0.0021'], ['m4.demo', '0.00185', '0.00215']].map(([member, bid, ask]) => ({ member, body: { bid, ask } }))],
      params: { taker: 'taker.demo', makers: ['m1.demo', 'm2.demo', 'm3.demo', 'm4.demo'], pricing: 'first' },
    },
    payrun: {
      program: 'payrun', title: 'A private pay run',
      description: 'An employer seals a list of payments. The room pays each person their net, sends tax and benefits to their own addresses, and returns a signed receipt sealed to each person, one to the employer and a totals-only one to an auditor.',
      hides: 'Names, invoice numbers and the tax split, from everyone outside; each receipt opens only for its own reader.',
      reveals: 'Each payee\'s address and the amount they are paid, and the tax and benefits totals. Payroll here is a private who, with private receipts: the amounts themselves are public in the settlement.',
      inputs: [{ member: 'employer.demo', body: { lines } }],
      params: { employer: 'employer.demo', taxAddress: 'tax.demo', benefitsAddress: 'benefits.demo', employerKeyHex: readers.employer.publicKeyHex, auditorKeyHex: readers.auditor.publicKeyHex, runId: 'demo-run-1' },
    },
  };
  for (const sc of Object.values(scenarios)) for (const x of sc.inputs) keyOf(x.member);

  const demo = {
    service, scenarios,
    round: () => ({ ...current }),
    nextRound() { current = { contractId: DEMO_CONTRACT, syndicateId: 'demo', epoch: 1, roundNonce: crypto.randomBytes(32).toString('hex') }; return { ...current }; },
    members: () => [...pairs.entries()].map(([id, p]) => ({ id, publicKey: p.publicKey })),

    /** A member's app: seal the body to the room's key and sign it for the round. The secret key stays in here. */
    signInput(id, body, { seq = 1, round = current } = {}) {
      const kp = keyOf(id);
      const cipherTextHex = sealToModel(JSON.stringify(body), host.intentPublicKey);
      return { flyerId: id, cipherTextHex, publicKey: kp.publicKey, signature: signInputWithNearKey(kp.secretKey, inputMessage({ ...round, flyerId: id, seq, cipherTextHex })), seq };
    },

    /** Open a round, submit every sealed input of a scenario, run it, and report what the members sealed against what is public. */
    async runScenario(kind, { round } = {}) {
      const sc = scenarios[kind];
      if (!sc) throw new RoomError('UNKNOWN_PROGRAM', `unknown scenario "${kind}"; available: ${Object.keys(scenarios).join(', ')}`);
      const useRound = round ?? demo.nextRound();
      const startId = events.since(-1).at(-1)?.id ?? 0;
      service.open(useRound);
      for (const x of sc.inputs) await service.submit(demo.signInput(x.member, x.body, { round: useRound }));
      const result = await service.run({ program: sc.program, params: sc.params, round: useRound });
      return { scenario: kind, sealed: sc.inputs, result, publicEvents: events.since(startId).map((e) => ({ id: e.id, type: e.type, data: e.data })) };
    },

    /** Practice only: open a pay-run statement as one of the demo readers (a payee id, "employer" or "auditor"). Null if it is not theirs. */
    readStatement(reader, cipherHex) {
      const key = readers[reader];
      if (!key) return null;
      try { return JSON.parse(openFromModel(cipherHex, key.secretX25519)); } catch { return null; }
    },
  };
  return demo;
}
