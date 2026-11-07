import crypto from 'node:crypto';
import { HostedRoost } from '../../src/roost-service/hosted-roost.js';
import { sealToModel } from '../../src/enclave/e2ee.js';
import { signInputWithNearKey, inputMessage, nearKeyPair } from '../../src/roost-service/signed-input.js';

const provider = { simulated: true, attest: async () => Buffer.from('lab-local-no-hardware'), info: async () => ({}) };
const ROUND = { contractId: 'c.near', syndicateId: 'syn-2r', epoch: 1, roundNonce: 'ab'.repeat(32) };
const ids = ['a.near', 'b.near', 'c.near', 'd.near'];
const keys = Object.fromEntries(ids.map((id) => [id, nearKeyPair()]));
const keyCheck = async (id, pk) => keys[id]?.publicKey === pk;
const salt = () => crypto.randomBytes(16).toString('hex');
const mkRoom = () => { const r = new HostedRoost({ provider, requireSignedInputs: true, accountKeyCheck: keyCheck, deterministicOrder: true }); r.openRound(ROUND); return r; };
/** A member seals their body once per room (a different ciphertext for each) and signs each submission. */
async function submit(room, who, body, seq = 1) {
  const cipherTextHex = sealToModel(JSON.stringify(body), room.intentPublicKey);
  const sig = signInputWithNearKey(keys[who].secretKey, inputMessage({ ...ROUND, flyerId: who, seq, cipherTextHex }));
  return room.submitSignedIntent({ flyerId: who, cipherTextHex, publicKey: keys[who].publicKey, signature: sig, seq });
}
const both = async (A, B, who, body) => { await submit(A, who, body); await submit(B, who, body); };

export default {
  id: 'E-TWO-ROOM-01',
  title: 'Two Roosts, same inputs, same signed message: the Roost side of two-room agreement',
  tier: 'offline',
  requires: [],
  hypothesis: 'Two independent Roosts (own keys), given the same members\' inputs sealed separately to each, compute the same outcome and sign the byte-identical settlement message, for the plain total, a pool, and each auction format, whatever order the inputs arrived in. If the inputs differ the messages differ. A member who sends different bids to the two rooms is detectable by comparing salted per-member digests and can be excluded, after which the rooms agree. Fails if two honest rooms ever sign different messages, or two rooms with different inputs sign the same one.',
  limits: ['Both Roosts here are local and unsealed; this checks the agreement logic, not the hardware. Ties are broken by a hash of the account and the round nonce, so two-room mode has no time priority. A member could grind account names to bias a tie; not addressed.'],
  async run(ctx) {
    const sign = (room, out, extra = {}) => room.signSettlement({ ...ROUND, allocations: out.allocations, orderHash: out.orderHash, ...extra }).message;

    await ctx.step('the plain total: same inputs in any order give the same message', async (s) => {
      const A = mkRoom(); const B = mkRoom();
      for (const w of ['a.near', 'b.near', 'c.near']) await submit(A, w, { amount: '1.5', salt: salt() });
      for (const w of ['c.near', 'a.near', 'b.near']) await submit(B, w, { amount: '1.5', salt: salt() }); // other order, other salts
      const oa = A.aggregateAndClear({ roundId: 'r1' }); const ob = B.aggregateAndClear({ roundId: 'r1' });
      s.assert('both rooms report the same total', oa.aggregateOrder.totalInputAmount === ob.aggregateOrder.totalInputAmount && oa.aggregateOrder.totalInputAmount === '4.5');
      s.assert('both rooms derive the same order hash', oa.orderHash === ob.orderHash, { a: oa.orderHash, b: ob.orderHash });
      const allocations = [{ recipient: 'r.near', amount: String(4_500_000n * 10n ** 18n) }];
      const ma = A.signSettlement({ ...ROUND, allocations, orderHash: oa.orderHash }).message; const mb = B.signSettlement({ ...ROUND, allocations, orderHash: ob.orderHash }).message;
      s.assert('the two signed messages are byte-identical', ma === mb);
      s.assert('the rooms have different settlement keys (they really are two rooms)', A.settlePublicKey !== B.settlePublicKey);
    });

    await ctx.step('a pool and every auction format agree, including ties', async (s) => {
      for (const [name, run] of [
        ['pool', (r) => r.runPool({ recipient: 'r.near', roundId: 'p' })],
        ['first-price', (r) => r.runAuction({ format: 'first-price', lotUnits: 1, seller: 'r.near', roundId: 'a' })],
        ['second-price', (r) => r.runAuction({ format: 'second-price', lotUnits: 1, seller: 'r.near', roundId: 'a' })],
        ['uniform', (r) => r.runAuction({ format: 'uniform', lotUnits: 10, seller: 'r.near', roundId: 'a' })],
      ]) {
        const A = mkRoom(); const B = mkRoom();
        const body = (w) => (name === 'pool' ? { amount: '2', salt: salt() } : { price: '1', quantity: 5, salt: salt() }); // every member bids the SAME: all ties
        for (const w of ids) await submit(A, w, body(w));
        for (const w of [...ids].reverse()) await submit(B, w, body(w));
        const oa = run(A); const ob = run(B);
        s.assert(`${name}: with all-equal bids (every position a tie) both rooms pick the same winners and charges`, JSON.stringify(oa.charges) === JSON.stringify(ob.charges) && JSON.stringify(oa.allocations) === JSON.stringify(ob.allocations), { a: oa.charges, b: ob.charges });
        s.assert(`${name}: both rooms sign the identical message`, oa.orderHash === ob.orderHash && sign(A, oa, { charges: oa.charges }) === sign(B, ob, { charges: ob.charges }));
      }
    });

    await ctx.step('different inputs give different messages', async (s) => {
      const A = mkRoom(); const B = mkRoom();
      for (const w of ids) { await submit(A, w, { amount: '1', salt: salt() }); await submit(B, w, { amount: w === 'd.near' ? '9' : '1', salt: salt() }); }
      const oa = A.runPool({ recipient: 'r.near', roundId: 'x' }); const ob = B.runPool({ recipient: 'r.near', roundId: 'x' });
      s.assert('one member\'s different amount changes the order hash', oa.orderHash !== ob.orderHash);
      s.assert('so the signed messages differ and the contract would see no valid pair', sign(A, oa, { charges: oa.charges }) !== sign(B, ob, { charges: ob.charges }));
    });

    await ctx.step('a member who equivocates is found by salted digests and can be excluded', async (s) => {
      const A = mkRoom(); const B = mkRoom();
      for (const w of ['a.near', 'b.near', 'c.near']) await both(A, B, w, { amount: '1', salt: salt() });
      // d tells room A one thing and room B another. The salt is the same in both bodies, as an honest client would reuse it.
      const dSalt = salt(); await submit(A, 'd.near', { amount: '1', salt: dSalt }); await submit(B, 'd.near', { amount: '5', salt: dSalt });
      // an honest client reuses ONE salt per member and round, so the digests of equal bodies match
      const A1 = mkRoom(); const B1 = mkRoom(); const saltsFor = Object.fromEntries(ids.map((w) => [w, salt()]));
      for (const w of ids.slice(0, 3)) { await submit(A1, w, { amount: '1', salt: saltsFor[w] }); await submit(B1, w, { amount: '1', salt: saltsFor[w] }); }
      await submit(A1, 'd.near', { amount: '1', salt: saltsFor['d.near'] }); await submit(B1, 'd.near', { amount: '5', salt: saltsFor['d.near'] });
      const da = A1.inputDigests(); const db = B1.inputDigests();
      const differing = Object.keys(da).filter((k) => da[k] !== db[k]);
      s.assert('the digests differ for exactly the equivocating member', differing.join() === 'd.near', { actual: differing });
      s.assert('a digest does not reveal the amount (it includes the member\'s secret salt: 1 NEAR and 5 NEAR digests do not match a guessing table)', !Object.values(da).some((d) => ['1', '5'].some((amt) => crypto.createHash('sha256').update(amt).digest('hex') === d)));
      const outDisagree = [A1.runPool({ recipient: 'r.near', roundId: 'e' }), B1.runPool({ recipient: 'r.near', roundId: 'e' })];
      s.assert('left alone, the two rooms disagree (the equivocator can block settlement)', outDisagree[0].orderHash !== outDisagree[1].orderHash);
      const A2 = mkRoom(); const B2 = mkRoom();
      for (const w of ids) { await submit(A2, w, { amount: '1', salt: saltsFor[w] }); await submit(B2, w, { amount: w === 'd.near' ? '5' : '1', salt: saltsFor[w] }); }
      A2.excludeMembers(['d.near']); B2.excludeMembers(['d.near']);
      const oa = A2.runPool({ recipient: 'r.near', roundId: 'e' }); const ob = B2.runPool({ recipient: 'r.near', roundId: 'e' });
      s.assert('after both rooms exclude the equivocator they agree on the same message', oa.orderHash === ob.orderHash && sign(A2, oa, { charges: oa.charges }) === sign(B2, ob, { charges: ob.charges }));
      s.assert('and the equivocator is not charged', !oa.charges.some((c) => c.member === 'd.near'));
    });

    await ctx.step('digests are bound to the member and do not depend on how the body was written', async (s) => {
      const A = mkRoom(); const B = mkRoom(); const sh = salt();
      await submit(A, 'a.near', { amount: '1', salt: sh }); await submit(A, 'b.near', { amount: '1', salt: sh }); // identical body and salt, two members
      const d = A.inputDigests();
      s.assert('two members who sealed the identical body get different digests (a digest cannot be moved between members)', d['a.near'] !== d['b.near'] && d['a.near'] !== null);
      await submit(B, 'a.near', { salt: sh, amount: '1' }); // same content, keys written in the other order, sealed separately
      s.assert('the same body with its keys in another order gives the same digest in another room', B.inputDigests()['a.near'] === d['a.near']);
    });

    await ctx.step('an unsalted input has no usable digest', async (s) => {
      const A = mkRoom(); await submit(A, 'a.near', { amount: '1' });
      s.assert('the digest for a body with no salt is null, so the coordinator must exclude or ignore it', A.inputDigests()['a.near'] === null);
    });
  },
};
