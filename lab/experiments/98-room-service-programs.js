import crypto from 'node:crypto';
import { RoomService, RoomError } from '../../src/roost-service/room-service.js';
import { HostedRoost, computeAllocationsHash, computeChargesHash } from '../../src/roost-service/hosted-roost.js';
import { generateClientKey, sealToModel } from '../../src/enclave/e2ee.js';
import { signInputWithNearKey, inputMessage, nearKeyPair } from '../../src/roost-service/signed-input.js';

const provider = { simulated: true, attest: async () => Buffer.from('lab-local-no-hardware'), info: async () => ({}) };
const ROUND = { contractId: 'c.near', syndicateId: 'room', epoch: 1, roundNonce: 'ab'.repeat(32) };
const IDS = ['a.near', 'b.near', 'c.near', 'd.near', 'taker.near', 'm1.near', 'm2.near', 'm3.near', 'm4.near', 'er.near', 'l1', 'l2', 'l3', 'b1', 'b2', 's1', 's2'];
const keys = Object.fromEntries(IDS.map((id) => [id, nearKeyPair()]));
const keyCheck = async (id, pk) => keys[id]?.publicKey === pk;
const SALT = 'f'.repeat(32);
const payeeKeys = Object.fromEntries(['a1', 'a2', 'a3', 'a4'].map((k) => [k, generateClientKey()]));
const employerRead = generateClientKey(); const auditor = generateClientKey();
const LINES = [['a1', 'Alice', '0.05'], ['a2', 'Bo', '0.04'], ['a3', 'Cy', '0.03'], ['a4', 'Di', '0.02']].map(([k, person, gross]) => ({ payee: `${k}.near`, person, invoiceId: `INV-${k}`, period: '2026-11', gross, tax: (Number(gross) * 0.15).toFixed(6), benefits: (Number(gross) * 0.05).toFixed(6), payeeKey: payeeKeys[k].publicKeyHex }));
const QUOTES = { 'm1.near': { bid: '0.00195', ask: '0.00205' }, 'm2.near': { bid: '0.0019', ask: '0.002' }, 'm3.near': { bid: '0.00197', ask: '0.0021' }, 'm4.near': { bid: '0.00185', ask: '0.00215' } };

// One spec per room kind: the inputs members seal, the parameters, a variant that decides nothing, and wrong parameters.
const SPECS = {
  pool: { signed: false, inputs: [['a.near', { amount: '0.01' }], ['b.near', { amount: '0.02' }], ['c.near', { amount: '0.03' }], ['d.near', { amount: '0.04' }]],
    params: { recipient: 'r.near', min: '0' }, nothing: { recipient: 'r.near', min: '9' }, call: (h, p) => h.runPool(p),
    bad: [{}, { recipient: 5 }, { recipient: 'a:b' }, { recipient: 'r.near', min: 'x' }, { recipient: 'r.near', cap: {} }, { recipient: 'r.near', min: null }] },
  auction: { signed: false, inputs: [['a.near', { price: '0.009' }], ['b.near', { price: '0.007' }], ['c.near', { price: '0.006' }], ['d.near', { price: '0.004' }]],
    params: { format: 'second-price', seller: 's.near', lotUnits: 1, reserve: '0' }, nothing: { format: 'second-price', seller: 's.near', lotUnits: 1, reserve: '5' }, call: (h, p) => h.runAuction(p),
    bad: [{}, { format: 'dutch', seller: 's.near' }, { format: 'first-price', seller: 7 }, { format: 'first-price', seller: 's.near', lotUnits: 0 }, { format: 'first-price', seller: 's.near', lotUnits: '3' }, { format: 'first-price', seller: 's.near', reserve: 'abc' }] },
  quote: { signed: false, inputs: [['l1', { rateBps: 450 }], ['l2', { rateBps: 400 }], ['l3', { rateBps: 500 }]],
    params: { shape: 'lend', counterparty: 'borrower', amount: '5', limit: 700 }, nothing: { shape: 'lend', counterparty: 'borrower', amount: '5', limit: 100 }, call: (h, p) => h.runQuote(p),
    bad: [{}, { shape: 'swap', counterparty: 'b' }, { shape: 'lend' }, { shape: 'lend', counterparty: 'b', amount: '5', limit: 'x' }, { shape: 'buy', counterparty: 'b', units: 0, limit: '1' }, { shape: 'lend', counterparty: 'b', amount: '0', limit: 700 }, { shape: 'lend', counterparty: 'b', amount: '5', limit: 700, pricing: 'third' }] },
  cross: { signed: false, inputs: [['b1', { side: 'buy', units: 10, limit: '1.10' }], ['b2', { side: 'buy', units: 5, limit: '1.05' }], ['s1', { side: 'sell', units: 8, limit: '0.95' }], ['s2', { side: 'sell', units: 10, limit: '0.90' }]],
    params: { referencePrice: '1.00' }, nothing: { referencePrice: '5.00' }, call: (h, p) => h.runCross(p),
    bad: [{}, { referencePrice: '0' }, { referencePrice: 'abc' }, { referencePrice: '1', maxUnits: 0 }, { referencePrice: '1', maxUnits: '5' }] },
  rfq: { signed: true, inputs: [['taker.near', { side: 'buy', units: 10, limit: '0.0022', salt: SALT }], ...Object.entries(QUOTES)],
    params: { taker: 'taker.near', makers: ['m1.near', 'm2.near', 'm3.near', 'm4.near'], pricing: 'first' }, nothing: null, call: (h, p) => h.runRfq(p),
    nothingInputs: [['taker.near', { side: 'buy', units: 10, limit: '0.0001', salt: SALT }], ...Object.entries(QUOTES)],
    bad: [{}, { taker: 5 }, { taker: 'taker.near', makers: 'm1.near' }, { taker: 'taker.near', makers: [] }, { taker: 'taker.near', makers: ['taker.near'] }, { taker: 'taker.near', makers: ['m1.near'], pricing: 'third' }] },
  payrun: { signed: true, inputs: [['er.near', { lines: LINES }]],
    params: { employer: 'er.near', taxAddress: 'tax.near', benefitsAddress: 'ben.near', employerKeyHex: employerRead.publicKeyHex, auditorKeyHex: auditor.publicKeyHex, runId: 'run-2026-11' }, nothing: null, call: (h, p) => h.runPayrun(p),
    bad: [{}, { employer: 5 }, { employer: 'er.near', employerKeyHex: 'zz', auditorKeyHex: 'zz' }, { employer: 'er.near', taxAddress: 'tax.near', benefitsAddress: 'ben.near', employerKeyHex: employerRead.publicKeyHex, auditorKeyHex: auditor.publicKeyHex, runId: 'a b' }, { employer: 'er.near', taxAddress: 7, benefitsAddress: 'ben.near', employerKeyHex: employerRead.publicKeyHex, auditorKeyHex: auditor.publicKeyHex, runId: 'r1' }] },
};
const PARITY = { pool: ['pool'], auction: ['auction'], quote: ['quote'], cross: ['cross'], rfq: ['rfq'], payrun: ['payrun'] };

const mkHost = (signed) => new HostedRoost(signed ? { provider, requireSignedInputs: true, accountKeyCheck: keyCheck, deterministicOrder: true } : { provider, deterministicOrder: true });
const build = (host, signed, id, body, seq = 1) => {
  const cipherTextHex = sealToModel(JSON.stringify(body), host.intentPublicKey);
  if (!signed) return { flyerId: id, cipherTextHex };
  return { flyerId: id, cipherTextHex, publicKey: keys[id].publicKey, signature: signInputWithNearKey(keys[id].secretKey, inputMessage({ ...ROUND, flyerId: id, seq, cipherTextHex })), seq };
};
const codeOf = async (fn) => { try { await fn(); return null; } catch (e) { return e instanceof RoomError ? e.code : `NOT_A_ROOM_ERROR:${e?.message}`; } };
async function viaService(name, params, inputs = SPECS[name].inputs) {
  const sp = SPECS[name]; const host = mkHost(sp.signed); const svc = new RoomService({ host }); svc.open(ROUND);
  for (const [id, body] of inputs) await svc.submit(build(host, sp.signed, id, body));
  return { host, svc, result: await svc.run({ program: name, params, round: ROUND }) };
}
async function viaOldPath(name, params, inputs = SPECS[name].inputs) {
  const sp = SPECS[name]; const host = mkHost(sp.signed); host.openRound(ROUND);
  for (const [id, body] of inputs) { const x = build(host, sp.signed, id, body); if (sp.signed) await host.submitSignedIntent(x); else host.submitSealedIntent(x); }
  const out = sp.call(host, params);
  return { host, out };
}
const verifies = (host, a) => {
  const message = `${ROUND.contractId}:${a.syndicate_id}:${ROUND.epoch}:${a.attestation_nonce}:${computeAllocationsHash(a.allocations)}:${computeChargesHash(a.charges)}:${a.aggregate_order_hash}`;
  const spki = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(host.settlePublicKey, 'hex')]);
  return crypto.verify(null, Buffer.from(message, 'utf8'), crypto.createPublicKey({ key: spki, format: 'der', type: 'spki' }), Buffer.from(a.enclave_signature, 'hex'));
};

export default {
  id: 'E-ROOMSERVICE-02',
  title: 'runRoom slice 2: all seven room kinds behind the same four verbs; same answers as the old path; wrong parameters never become internal errors',
  tier: 'offline',
  requires: [],
  hypothesis: 'Predictions are in docs/lab/PROGRAMME_PLAN.md, written before any code. Each of pool, auction, quote, cross, RFQ and pay run, run through RoomService, gives the same outcome, order hash, allocations and charges as the old path and a contract call whose signature verifies; deciding nothing signs nothing; wrong parameters are INVALID_PARAMS and leave the queue alone; a pay run\'s receipts leave only as sealed statements and an RFQ\'s plain terms only on request. The failure that must not happen: a settlement signed for something the host did not compute, a wrong-parameter call that becomes an internal error or eats the inputs, or private detail in a default result.',
  limits: ['Offline, on local hosts with a simulated attestation provider and a stubbed account-key check.', 'The adapters (MCP, REST, SSE, SDK), a hardware host and a testnet settlement through RoomService are later slices or other experiments.', 'The existing host route for an RFQ already returns plain terms to its caller; this slice does not change that route.', 'One operator plays every member.'],
  async run(ctx) {
    await ctx.step('describe lists seven programs', async (s) => {
      const svc = new RoomService({ host: mkHost(false) }); const d = svc.describe();
      s.assert('ballot, pool, auction, quote, cross, rfq, payrun, in that order', JSON.stringify(d.programs.map((p) => p.id)) === JSON.stringify(['ballot', 'pool', 'auction', 'quote', 'cross', 'rfq', 'payrun']), { actual: d.programs.map((p) => p.id) });
      s.assert('each lists its parameters and whether it needs signed inputs', d.programs.every((p) => p.params && Object.keys(p.params).length > 0 && typeof p.needsSignedInputs === 'boolean'));
      s.assert('RFQ, pay run and vote need signed inputs; pool, auction, quote and cross do not', d.programs.filter((p) => p.needsSignedInputs).map((p) => p.id).sort().join() === 'ballot,payrun,rfq');
    });

    for (const name of Object.keys(SPECS)) {
      await ctx.step(`${name}: parity with the old path, and a contract call whose signature verifies`, async (s) => {
        const sp = SPECS[name];
        const { host, result } = await viaService(name, sp.params);
        const { out } = await viaOldPath(name, sp.params);
        s.assert('it decided and returned a settlement', result.settlement !== null, { actual: result.outcome });
        s.assert('same order hash', result.orderHash === out.orderHash && result.settlement.args.aggregate_order_hash === out.orderHash, { expected: out.orderHash, actual: result.orderHash });
        s.assert('same allocations', JSON.stringify(result.settlement.args.allocations) === JSON.stringify(out.allocations));
        s.assert('same charges', JSON.stringify(result.settlement.args.charges) === JSON.stringify(out.charges));
        s.assert('same public outcome', JSON.stringify(result.outcome) === JSON.stringify(out.outcome));
        s.assert('the method is settle_batch_charged', result.settlement.method === 'settle_batch_charged', { actual: result.settlement.method });
        s.assert('the signature verifies against the host\'s key over the message rebuilt from the arguments', verifies(host, result.settlement.args));
        s.assert('the nonce and syndicate are the round\'s', result.settlement.args.attestation_nonce === ROUND.roundNonce && result.settlement.args.syndicate_id === ROUND.syndicateId);
      });
      if (SPECS[name].nothing || SPECS[name].nothingInputs) {
        await ctx.step(`${name}: deciding nothing signs nothing`, async (s) => {
          const sp = SPECS[name];
          const { host, result } = await viaService(name, sp.nothing || sp.params, sp.nothingInputs || sp.inputs);
          s.assert('no settlement and no order hash', result.settlement === null && result.orderHash === null, { actual: { settlement: result.settlement, orderHash: result.orderHash, outcome: result.outcome } });
          s.assert('the host signed nothing', host.aggregate === null || host.aggregate.signed !== true);
        });
      }
      await ctx.step(`${name}: wrong parameters are INVALID_PARAMS, never an internal error, and the inputs stay`, async (s) => {
        const sp = SPECS[name]; const host = mkHost(sp.signed); const svc = new RoomService({ host }); svc.open(ROUND);
        for (const [id, body] of sp.inputs) await svc.submit(build(host, sp.signed, id, body));
        const queued = host.sealedIntents.length;
        for (const bad of sp.bad) {
          const code = await codeOf(() => svc.run({ program: name, params: bad, round: ROUND }));
          s.assert(`${JSON.stringify(bad).slice(0, 90)} -> INVALID_PARAMS`, code === 'INVALID_PARAMS', { actual: code });
        }
        s.assert('every input is still queued after those refusals', host.sealedIntents.length === queued, { expected: queued, actual: host.sealedIntents.length });
        const ok = await svc.run({ program: name, params: sp.params, round: ROUND });
        s.assert('and the right parameters then run', ok.settlement !== null);
      });
    }

    await ctx.step('a pay run\'s receipts leave only as sealed statements', async (s) => {
      const { result } = await viaService('payrun', SPECS.payrun.params);
      const text = JSON.stringify({ outcome: result.outcome, settlement: result.settlement });
      s.assert('the outcome and settlement name no person, invoice or tax amount', !/Alice|Bo\b|Cy\b|Di\b|INV-|0\.0075|7500000000000000000000/.test(text.replace(/"recipient":"[^"]*"/g, '')), { actual: text.slice(0, 300) });
      s.assert('statements are returned: one per payee, one employer, one auditor', result.statements && Object.keys(result.statements.payees).length === 4 && Boolean(result.statements.employer?.cipherHex) && Boolean(result.statements.auditor?.cipherHex), { actual: result.statements && Object.keys(result.statements) });
      s.assert('each statement is ciphertext, with no name in it', JSON.stringify(result.statements).match(/Alice|INV-/) === null);
    });

    await ctx.step('an RFQ\'s plain terms are left out unless asked for, and the retry is stable', async (s) => {
      const sp = SPECS.rfq; const host = mkHost(true); const svc = new RoomService({ host }); svc.open(ROUND);
      for (const [id, body] of sp.inputs) await svc.submit(build(host, true, id, body));
      const plain = await svc.run({ program: 'rfq', params: sp.params, round: ROUND });
      s.assert('by default there is no confidential section and no units or price anywhere', !('confidential' in plain) && !/"units"|"price"|"notional"/.test(JSON.stringify(plain)), { actual: Object.keys(plain) });
      const asked = await svc.run({ program: 'rfq', params: sp.params, round: ROUND, includeConfidential: true });
      s.assert('asked for, the same call returns the terms: a buy of 10 units', asked.confidential?.terms?.side === 'buy' && asked.confidential.terms.units === 10, { actual: asked.confidential });
      s.assert('with the identical settlement (one signature)', JSON.stringify(asked.settlement) === JSON.stringify(plain.settlement));
      const again = await svc.run({ program: 'rfq', params: sp.params, round: ROUND });
      s.assert('and without the flag the terms are gone again', !('confidential' in again));
    });

    await ctx.step('programs that need signed inputs refuse an unsigned host', async (s) => {
      for (const name of ['rfq', 'payrun']) {
        const host = mkHost(false); const svc = new RoomService({ host }); svc.open(ROUND);
        s.assert(`${name}: a submit without a signature is NOT_AUTHORISED`, (await codeOf(() => svc.submit(build(host, false, 'taker.near', { x: 1 })).then(() => svc.run({ program: name, params: SPECS[name].params, round: ROUND })))) === 'NOT_AUTHORISED');
      }
    });
  },
};
