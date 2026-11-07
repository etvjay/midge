import crypto from 'node:crypto';
import { HostedRoost } from '../../src/roost-service/hosted-roost.js';
import { sealToModel } from '../../src/enclave/e2ee.js';
import { signInputWithNearKey, inputMessage, nearKeyPair } from '../../src/roost-service/signed-input.js';

const provider = { simulated: true, attest: async () => Buffer.from('lab-local-no-hardware'), info: async () => ({}) };
const ROUND = { contractId: 'c.near', syndicateId: 'syn-1', epoch: 3, roundNonce: 'ab'.repeat(32) };
const accounts = Object.fromEntries(['a.near', 'b.near', 'mallory.near'].map((id) => [id, nearKeyPair()]));
const onChain = { 'a.near': [accounts['a.near'].publicKey], 'b.near': [accounts['b.near'].publicKey] }; // mallory has no key on a.near's account
const keyCheck = async (id, pk) => (onChain[id] || []).includes(pk);

export default {
  id: 'E-SIGNED-INPUT-01',
  title: 'Signed sealed inputs: a ballot or bid must be signed by a key that belongs to the account it names, for this round, once',
  tier: 'offline',
  requires: [],
  hypothesis: 'A sealed input is accepted only if it carries a valid signature, by the NEAR key of the account it names (checked against the chain), over its ciphertext and this round\'s contract, syndicate, epoch and nonce. A forged, wrong-account, wrong-round, replayed or stale input is refused; a newer input from the same account replaces its older one (re-voting). Fails if any of these is accepted or any honest input refused.',
  limits: ['The account-key check is injected here as a stub that mirrors the chain\'s answer; the real RPC check is exercised on testnet separately. Inputs hide the choice, not who submitted (deposits are public anyway).'],
  async run(ctx) {
    const fresh = (opts = {}) => { const r = new HostedRoost({ provider, requireSignedInputs: true, accountKeyCheck: keyCheck, ...opts }); r.openRound(ROUND); return r; };
    const mk = (r, who, body, seq = 1, round = ROUND) => {
      const cipherTextHex = sealToModel(JSON.stringify(body), r.intentPublicKey);
      const msg = inputMessage({ ...round, flyerId: who, seq, cipherTextHex });
      const k = accounts[who];
      return { flyerId: who, cipherTextHex, seq, publicKey: k.publicKey, signature: signInputWithNearKey(k.secretKey, msg) };
    };
    const outcome = async (fn) => { try { await fn(); return 'accepted'; } catch (e) { return e.message; } };
    const refused = async (s, why, fn, re) => { const o = await outcome(fn); s.assert(why, re.test(o), { actual: o }); };

    await ctx.step('honest inputs are accepted, forged ones are not', async (s) => {
      const r = fresh();
      s.assert('an honest signed input is accepted', (await r.submitSignedIntent(mk(r, 'a.near', { amount: '1' }))).status === 'SEALED_TO_ROOST_KEY');
      await refused(s, 'an unsigned input is refused when signatures are required', async () => r.submitSealedIntent({ flyerId: 'b.near', cipherTextHex: sealToModel('{"amount":"1"}', r.intentPublicKey) }), /signed/);
      const bad = mk(r, 'b.near', { amount: '1' }); bad.signature = bad.signature.replace(/^../, bad.signature.startsWith('00') ? '11' : '00');
      await refused(s, 'a corrupted signature is refused', () => r.submitSignedIntent(bad), /signature/);
      const swapped = mk(r, 'b.near', { amount: '1' }); swapped.cipherTextHex = sealToModel('{"amount":"99"}', r.intentPublicKey);
      await refused(s, 'a valid signature over a different ciphertext is refused', () => r.submitSignedIntent(swapped), /signature/);
      const asA = (() => { const cipherTextHex = sealToModel('{"amount":"1"}', r.intentPublicKey); const m = accounts['mallory.near']; return { flyerId: 'a.near', cipherTextHex, seq: 1, publicKey: m.publicKey, signature: signInputWithNearKey(m.secretKey, inputMessage({ ...ROUND, flyerId: 'a.near', seq: 1, cipherTextHex })) }; })(); // a perfectly valid signature by mallory's key, over a message naming a.near
      await refused(s, 'signing with a key that is not on the named account is refused', () => r.submitSignedIntent(asA), /not a key of|not on/);
      await refused(s, 'a key that is valid for the signature but unknown to the account is refused (mallory names herself)', () => r.submitSignedIntent(mk(r, 'mallory.near', { amount: '1' })), /not a key of|not on/);
      const failing = fresh({ accountKeyCheck: async () => { throw new Error('rpc down'); } });
      await refused(s, 'if the chain cannot be reached the input is refused, not accepted (fail closed)', () => failing.submitSignedIntent(mk(failing, 'a.near', { amount: '1' })), /could not check|not a key of/);
      s.assert('only the one honest input is queued', r.sealedIntents.length === 1);
    });

    await ctx.step('the signature is bound to this round', async (s) => {
      const r = fresh();
      for (const [why, round] of [['another contract', { ...ROUND, contractId: 'evil.near' }], ['another syndicate', { ...ROUND, syndicateId: 'syn-2' }], ['another epoch', { ...ROUND, epoch: 4 }], ['another round nonce', { ...ROUND, roundNonce: 'cd'.repeat(32) }]]) {
        await refused(s, `an input signed for ${why} is refused`, () => r.submitSignedIntent(mk(r, 'a.near', { amount: '1' }, 1, round)), /signature/);
      }
      const other = fresh(); const p = mk(other, 'a.near', { amount: '1' });
      s.assert('an honest input is still accepted after the refusals', (await r.submitSignedIntent(mk(r, 'a.near', { amount: '1' }))).count === 1 && p.seq === 1);
    });

    await ctx.step('re-voting: the newest input replaces the older one; replays and stale inputs do not', async (s) => {
      const r = fresh();
      await r.submitSignedIntent(mk(r, 'a.near', { amount: '1' }, 1));
      await r.submitSignedIntent(mk(r, 'b.near', { amount: '5' }, 1));
      const again = mk(r, 'a.near', { amount: '1' }, 1);
      await refused(s, 'resubmitting the same sequence number is refused (replay)', () => r.submitSignedIntent(again), /sequence/);
      const second = mk(r, 'a.near', { amount: '7' }, 2);
      s.assert('a higher sequence number is accepted and does not add a second entry', (await r.submitSignedIntent(second)).count === 2);
      await refused(s, 'an older, validly signed input cannot overwrite the newer one (stale)', () => r.submitSignedIntent(mk(r, 'a.near', { amount: '1' }, 1)), /sequence/);
      const out = r.runPool({ recipient: 'r.near', roundId: 'x' });
      s.assert('the pool counts the newest input (7 + 5 = 12), not the first (1 + 5)', out.outcome.total === '12', { actual: out.outcome.total });
    });

    await ctx.step('settlement is refused for a different round than the one opened', async (s) => {
      const r = fresh(); await r.submitSignedIntent(mk(r, 'a.near', { amount: '2' })); const out = r.runPool({ recipient: 'r.near', roundId: 'y' });
      const args = (x) => ({ ...ROUND, ...x, allocations: out.allocations, orderHash: out.orderHash, charges: out.charges });
      await refused(s, 'signing for another nonce than the open round is refused', () => r.signSettlement(args({ roundNonce: 'cd'.repeat(32) })), /open round/);
      s.assert('signing for the open round works', r.signSettlement(args({})).message.startsWith('c.near:syn-1:3:'));
    });
  },
};
