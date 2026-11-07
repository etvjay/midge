import crypto from 'node:crypto';
import { connect } from '../lib/near.js';
import { HostedRoost } from '../../src/roost-service/hosted-roost.js';
import { sealToModel } from '../../src/enclave/e2ee.js';
import { signInputWithNearKey, inputMessage, makeAccountKeyCheck, nearKeyPair } from '../../src/roost-service/signed-input.js';

const provider = { simulated: true, attest: async () => Buffer.from('lab-local-no-hardware'), info: async () => ({}) };

export default {
  id: 'E-SIGNED-INPUT-CHAIN-01',
  title: 'Signed inputs against the real chain: an impersonator is refused, the account\'s own key is accepted (closes GAP-023)',
  tier: 'testnet',
  requires: ['near-key', 'network'],
  hypothesis: 'With the account-key check asking the real NEAR testnet, a sealed input signed by the account\'s own access key is accepted; the same input signed by a random key that names that account is refused; a real key of another account naming the first is refused; and an input naming an account that does not exist is refused. No funds are used. Fails if any impersonation is accepted or the account\'s own key is refused.',
  limits: ['Uses two real testnet accounts we control (the coordinator and the root account). It shows the check against the chain, not a round with deposits; the live two-room run (E-TWO-ROOM-LIVE-01) used signed inputs in four real rounds.'],
  async run(ctx) {
    const chain = await connect(ctx.rootDir);
    const own = chain.sub('c'); // the coordinator account, whose key we hold
    const round = { contractId: chain.coordinatorId, syndicateId: 'sig-chain', epoch: 1, roundNonce: 'ab'.repeat(32) };
    const check = makeAccountKeyCheck({ rpcUrl: 'https://test.rpc.fastnear.com', contractId: chain.coordinatorId });
    const room = () => { const r = new HostedRoost({ provider, requireSignedInputs: true, accountKeyCheck: check }); r.openRound(round); return r; };
    const mk = (r, naming, secretKey, publicKey) => { const cipherTextHex = sealToModel('{"amount":"1"}', r.intentPublicKey); return { flyerId: naming, cipherTextHex, seq: 1, publicKey, signature: signInputWithNearKey(secretKey, inputMessage({ ...round, flyerId: naming, seq: 1, cipherTextHex })) }; };
    const outcome = async (fn) => { try { await fn(); return 'accepted'; } catch (e) { return e.message; } };

    await ctx.step('the real chain decides who may bid in whose name', async (s) => {
      const r = room(); const ownSecret = own.key.keyPair.toString(); const ownPublic = own.key.keyPair.getPublicKey().toString();
      s.assert('the account\'s own key is accepted', (await outcome(() => r.submitSignedIntent(mk(r, own.id, ownSecret, ownPublic)))) === 'accepted');
      const rnd = nearKeyPair();
      const o1 = await outcome(() => room().submitSignedIntent(mk(room(), own.id, rnd.secretKey, rnd.publicKey)));
      s.assert('a random key naming that account is refused', /not a key of/.test(o1), { actual: o1 });
      const r2 = room(); const o2 = await outcome(() => r2.submitSignedIntent(mk(r2, chain.masterId, ownSecret, ownPublic)));
      s.assert('a real key of one account naming another account is refused', /not a key of/.test(o2), { actual: o2 });
      const r3 = room(); const o3 = await outcome(() => r3.submitSignedIntent(mk(r3, 'no-such-account-xyz123.testnet', rnd.secretKey, rnd.publicKey)));
      s.assert('an input naming an account that does not exist is refused', /not a key of/.test(o3), { actual: o3 });
      const downRoom = new HostedRoost({ provider, requireSignedInputs: true, accountKeyCheck: makeAccountKeyCheck({ rpcUrl: 'http://127.0.0.1:9', contractId: chain.coordinatorId }) }); downRoom.openRound(round);
      const o4 = await outcome(() => downRoom.submitSignedIntent(mk(downRoom, own.id, ownSecret, ownPublic)));
      s.assert('with the chain unreachable even the account\'s own key is refused (fail closed)', /could not check/.test(o4), { actual: o4 });
    });
  },
};
