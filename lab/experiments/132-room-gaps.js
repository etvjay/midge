import crypto from 'node:crypto';
import { HostedRoost, decisionMessage } from '../../src/roost-service/hosted-roost.js';
import { clearCross } from '../../src/roost-service/quote-programs.js';
import { sealToModel } from '../../src/enclave/e2ee.js';
import { signInputWithNearKey, inputMessage, nearKeyPair } from '../../src/roost-service/signed-input.js';
import { verifyDecision, verifyModelReceipt } from '../../src/browser/midge-verify.js';

const provider = { simulated: true, attest: async () => Buffer.from('lab-local-no-hardware'), info: async () => ({}) };
const ROUND = { contractId: 'c.near', syndicateId: 'g', epoch: 3, roundNonce: 'ab'.repeat(32) };
const keys = {}; const key = (id) => (keys[id] ??= nearKeyPair());
const keyCheck = async (id, pk) => keys[id]?.publicKey === pk;
const T0 = 1_800_000_000_000;
const mk = (clock = () => T0) => { const r = new HostedRoost({ provider, requireSignedInputs: true, accountKeyCheck: keyCheck, clock }); r.openRound(ROUND); return r; };
const seqs = new Map();
const send = (r, id, body) => { const seq = (seqs.get(`${r.intentPublicKey}:${id}`) ?? 0) + 1; seqs.set(`${r.intentPublicKey}:${id}`, seq); const cipherTextHex = sealToModel(JSON.stringify(body), r.intentPublicKey); return r.submitSignedIntent({ flyerId: id, cipherTextHex, publicKey: key(id).publicKey, signature: signInputWithNearKey(key(id).secretKey, inputMessage({ ...ROUND, flyerId: id, seq, cipherTextHex })), seq }); };
const refused = async (fn, re) => { try { await fn(); return 'accepted'; } catch (e) { return re.test(e.message) ? true : e.message; } };
const MAKERS = ['m1.near', 'm2.near', 'm3.near'];

export default {
  id: 'E-ROOM-GAPS-01',
  title: 'Quote expiry, uninvited makers, a minimum fill, a decision-only vote and a browser-checkable AI receipt',
  tier: 'offline',
  requires: [],
  hypothesis: 'Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. An expired quote is left out and named; an uninvited maker is ignored; a cross order filled under its minimum is cancelled and the cross recomputed; a vote with no pool signs a decision that a browser verifies and that can never be settled; a saved model receipt verifies in the browser only when its signed text, signer and signature all hold.',
  limits: ['Offline, on a local room with a simulated attestation provider, a stubbed account-key check and a fixed clock. The model receipt is a locally signed stand-in with the same shape as a NEAR AI Cloud receipt.'],
  async run(ctx) {
    await ctx.step('prediction 1 and 2: an expired quote and an uninvited maker are both left out, and the best valid invited quote wins', async (s) => {
      let now = T0; const r = mk(() => now);
      await send(r, 'tk.near', { side: 'buy', units: 2, limit: '0.05', salt: 'a-secret-salt-of-sixteen' });
      await send(r, 'm1.near', { bid: '0.02', ask: '0.03', validUntil: T0 + 15_000 });
      await send(r, 'm2.near', { bid: '0.03', ask: '0.04', validUntil: T0 + 600_000 });
      await send(r, 'm3.near', { bid: '0.03', ask: '0.045' });
      await send(r, 'm4.near', { bid: '0.01', ask: '0.02', validUntil: T0 + 600_000 });
      now = T0 + 40_000;
      const out = r.runRfq({ taker: 'tk.near', makers: MAKERS, roundId: 'r1' });
      s.evidence('outcome', out.outcome);
      s.assert('m1, whose quote expired, is named as expired', JSON.stringify(out.outcome.expired) === JSON.stringify(['m1.near']), { actual: out.outcome.expired });
      s.assert('m4, who was not invited, is an outsider and does not win', JSON.stringify(out.outcome.outsiders) === JSON.stringify(['m4.near']), { actual: out.outcome.outsiders });
      s.assert('m2 wins at 0.04, and the taker is charged 0.08', out.outcome.winner === 'm2.near' && out.terms.price === '0.04' && out.charges[0].amount === String(80_000n * 10n ** 18n), { actual: { o: out.outcome, t: out.terms } });
      s.assert('m3, with no expiry, still counted as a valid quote', out.outcome.quotesReceived === 2 && out.outcome.quotesEligible === 2, { actual: out.outcome });
      const before = mk(() => T0);
      await send(before, 'tk.near', { side: 'buy', units: 2, limit: '0.05', salt: 'a-secret-salt-of-sixteen' });
      await send(before, 'm1.near', { bid: '0.02', ask: '0.03', validUntil: T0 + 15_000 });
      s.assert('the same quote cleared before its expiry wins', before.runRfq({ taker: 'tk.near', makers: MAKERS, roundId: 'r1' }).outcome.winner === 'm1.near');
      const bad = mk(() => T0);
      await send(bad, 'tk.near', { side: 'buy', units: 2, limit: '0.05', salt: 'a-secret-salt-of-sixteen' });
      await send(bad, 'm1.near', { bid: '0.02', ask: '0.03', validUntil: 'soon' });
      s.assert('a validUntil that is not a whole number makes the quote unreadable', JSON.stringify(bad.runRfq({ taker: 'tk.near', makers: MAKERS, roundId: 'r1' }).outcome.unreadable) === JSON.stringify(['m1.near']));
    });

    await ctx.step('prediction 3: an order filled under its minimum is cancelled, and the cross is computed again without it', async (s) => {
      const o = (flyerId, units, limit, order, minUnits) => ({ flyerId, units, limitMicro: BigInt(Math.round(limit * 1e6)), order, ...(minUnits ? { minUnits } : {}) });
      const out = clearCross({ buys: [o('b1', 6, 0.012, 0), o('b2', 4, 0.011, 1, 3)], sells: [o('s1', 3, 0.009, 2), o('s2', 2, 0.01, 3)], referenceMicro: 10_000n });
      s.assert('b2 is cancelled below its minimum', JSON.stringify(out.belowMinimum) === JSON.stringify(['b2']), { actual: out.belowMinimum });
      s.assert('b1 now fills all 5 units', out.buyFills.length === 1 && out.buyFills[0].flyerId === 'b1' && out.buyFills[0].units === 5n, { actual: out.buyFills });
      const chain = clearCross({ buys: [o('b1', 2, 0.02, 0, 2), o('b2', 2, 0.02, 1, 2), o('b3', 6, 0.02, 2)], sells: [o('s1', 2, 0.01, 3)], referenceMicro: 10_000n });
      s.assert('the loop runs until no fill is below its minimum (two passes here)', chain.matchedUnits === 2n && chain.buyFills.every((f) => f.flyerId === 'b3') && chain.belowMinimum.length === 2, { actual: chain });
      const r = mk();
      for (const [id, b] of [['b1.near', { side: 'buy', units: 6, limit: '0.012' }], ['b2.near', { side: 'buy', units: 4, limit: '0.011', minUnits: 3 }], ['s1.near', { side: 'sell', units: 3, limit: '0.009' }], ['s2.near', { side: 'sell', units: 2, limit: '0.01' }]]) await send(r, id, b);
      const res = r.runCross({ referencePrice: '0.01', roundId: 'x1' });
      s.assert('the room publishes one cancelled order and names no one', res.outcome.cancelledBelowMinimum === 1 && !JSON.stringify(res.outcome).includes('b2.near'), { actual: res.outcome });
      s.assert('b1 is charged 0.05 and b2 nothing', res.charges.length === 1 && res.charges[0].member === 'b1.near' && res.charges[0].amount === String(50_000n * 10n ** 18n), { actual: res.charges });
    });

    await ctx.step('prediction 4: a vote with no pool signs a decision a browser verifies, and can never be settled', async (s) => {
      const r = mk();
      for (const [id, c] of [['a.near', 'yes'], ['b.near', 'yes'], ['c.near', 'no']]) await send(r, id, { choice: c });
      const out = r.runBallot({ options: { yes: 'yes.near', no: 'no.near' }, roll: ['a.near', 'b.near', 'c.near'], share: null, roundId: 'v1' });
      s.evidence('decision', out.decision);
      s.assert('nothing to pay: no allocations, no charges, no order hash', out.allocations.length === 0 && out.charges.length === 0 && out.orderHash === null);
      const missing = mk(); await send(missing, 'a.near', { choice: 'yes' });
      s.assert('a missing share is still an error, so only an explicit null means no money moves', (await refused(async () => missing.runBallot({ options: { yes: 'yes.near', no: 'no.near' }, roll: ['a.near'], roundId: 'v0' }), /share must be/)) === true);
      s.assert('the decision names the winner and moves no money', out.outcome.decided === true && out.outcome.winner === 'yes' && out.outcome.recipient === null && out.outcome.payout === false, { actual: out.outcome });
      const v = verifyDecision({ message: out.decision.message, signatureHex: out.decision.signature, settlePublicKeyHex: r.settlePublicKey });
      s.assert('the browser verifies the signed decision and reads it back', v.ok && v.fields.winner === 'yes' && v.fields.roundNonce === ROUND.roundNonce && v.fields.contractId === 'c.near', { actual: v });
      s.assert('the message is the one decisionMessage builds', out.decision.message === decisionMessage({ ...ROUND, roundId: 'v1', rule: 'majority', winner: 'yes', reason: out.outcome.reason, paramsHash: v.fields.paramsHash }));
      s.assert('a changed winner fails the check', !verifyDecision({ message: out.decision.message.replace(':yes:', ':no:'), signatureHex: out.decision.signature, settlePublicKeyHex: r.settlePublicKey }).ok);
      s.assert('another key fails the check', !verifyDecision({ message: out.decision.message, signatureHex: out.decision.signature, settlePublicKeyHex: mk().settlePublicKey }).ok);
      s.assert('settling the round is refused', (await refused(async () => r.signSettlement({ ...ROUND, allocations: [{ recipient: 'yes.near', amount: '1' }], orderHash: 'ab'.repeat(32) }), /no aggregate/)) === true);
      s.assert('the round cannot be opened again to decide twice', (await refused(async () => r.openRound(ROUND), /already signed/)) === true);
      s.assert('the decision message does not start with a contract id, so it is never a settlement message', out.decision.message.startsWith('midge-decision-v1:'));
      const none = mk(); await send(none, 'a.near', { choice: 'yes' });
      const nd = none.runBallot({ options: { yes: 'yes.near', no: 'no.near' }, roll: ['a.near', 'b.near', 'c.near'], share: null, roundId: 'v2' });
      s.assert('a vote that misses quorum still signs a decision that says none, and why', nd.outcome.decided === false && verifyDecision({ message: nd.decision.message, signatureHex: nd.decision.signature, settlePublicKeyHex: none.settlePublicKey }).fields.winner === 'none', { actual: nd.outcome });
    });

    await ctx.step('prediction 5: a model receipt verifies in the browser only when its text, signer and signature all hold', async (s) => {
      const pair = crypto.generateKeyPairSync('ed25519');
      const pk = pair.publicKey.export({ format: 'der', type: 'spki' }).subarray(12).toString('hex');
      const rec = { model: 'Qwen/Qwen3.6-35B-A3B-FP8', requestSha256: 'aa'.repeat(32), responseSha256: 'bb'.repeat(32), modelPublicKey: pk };
      const text = `${rec.model}:${rec.requestSha256}:${rec.responseSha256}`;
      const good = { ...rec, signature: { text, signing_address: pk, kind: 'provider_tee', signature: crypto.sign(null, Buffer.from(text), pair.privateKey).toString('hex') } };
      s.assert('a true receipt verifies', verifyModelReceipt(good).ok, { actual: verifyModelReceipt(good) });
      s.assert('a changed response hash fails', !verifyModelReceipt({ ...good, responseSha256: 'cc'.repeat(32) }).ok);
      const other = crypto.generateKeyPairSync('ed25519').publicKey.export({ format: 'der', type: 'spki' }).subarray(12).toString('hex');
      s.assert('a signer that is not the model key fails', !verifyModelReceipt({ ...good, signature: { ...good.signature, signing_address: other } }).ok);
      const forger = crypto.generateKeyPairSync('ed25519'); const fpk = forger.publicKey.export({ format: 'der', type: 'spki' }).subarray(12).toString('hex');
      s.assert('a receipt signed by another key that names itself as signer fails, because the signer is not the model key', !verifyModelReceipt({ ...good, signature: { ...good.signature, signing_address: fpk, signature: crypto.sign(null, Buffer.from(text), forger.privateKey).toString('hex') } }).ok);
      s.assert('a receipt with no signature fails, and says so', !verifyModelReceipt(rec).ok && /signature/.test(JSON.stringify(verifyModelReceipt(rec).checks)));
    });
  },
};
