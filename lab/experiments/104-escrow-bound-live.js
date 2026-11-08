import crypto from 'node:crypto';
import { connect, near, computePolicyHash } from '../lib/near.js';
import { createMembers, teardownMembers } from '../lib/members.js';
import { HostedRoost } from '../../src/roost-service/hosted-roost.js';
import { RoomService } from '../../src/roost-service/room-service.js';
import { createEscrowReader } from '../../src/roost-service/escrow-reader.js';
import { sealToModel } from '../../src/enclave/e2ee.js';

const provider = { simulated: true, attest: async () => Buffer.from('lab-local-no-hardware'), info: async () => ({}) };
const PROVIDERS = ['https://test.rpc.fastnear.com', 'https://rpc.testnet.near.org'];
const TIMER = 12; const BPS = 10000; const DEADLINE = 500000000;
const codeOf = async (fn) => { try { await fn(); return null; } catch (e) { return e?.code ?? `ERR:${e?.message}`; } };

export default {
  id: 'E-ESCROWBOUND-LIVE-01',
  title: 'Escrow-bound charged rounds on testnet: a settlement with an unfunded member is rejected; abandon, then the reader leaves them out and it lands',
  tier: 'testnet',
  requires: ['near-key', 'network'],
  hypothesis: 'Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. On the real contract, a pooled round with one unfunded member is rejected; after the coordinator abandons the signed round, the room reads the escrow from two real providers at one block, leaves the unfunded member out, and the settlement lands.',
  limits: ['One operator controls every account in the run, and the room is a local host, not a TEE.', 'It does not show the race itself: a member leaving between the read and the payout. The room reports raceFree false here, and says so.', 'Two providers agreeing on one block is not proof they are honest or independent.', 'The unfunded member is simply an account that never deposited; other ways to be unable to pay (a partial balance) are covered offline.', 'If createMembers fails part-way the accounts it made are only in the lab ledger (run node scripts/lab-env.mjs cleanup), and a group that was hatched but never deposited into stays Active and cannot be pruned (audit lead 5).', 'raceFree here is the reader\'s estimate, not a guarantee.'],
  async run(ctx) {
    const chain = await connect(ctx.rootDir);
    const coord = chain.sub('c');
    const tag = Date.now().toString(36);
    const id = `eb-${tag}`;
    const state = () => chain.view('get_syndicate', { syndicate_id: id });
    const escrow = async (who) => BigInt(await chain.view('get_escrow', { syndicate_id: id, account_id: who.id }));
    const policy = (r) => ({ allowed_recipients: [r.id], max_release_bps_per_epoch: BPS, settle_deadline_block: DEADLINE });
    let people; let countBefore; let host; let svc; let round; let A; let B; let C; let R;
    const bid = (who, amount = '0.01') => svc.submit({ flyerId: who.id, cipherTextHex: sealToModel(JSON.stringify({ amount }), host.intentPublicKey) });
    const settle = (settlement, label) => chain.send(coord.account, settlement.method, settlement.args, { gas: 150000000000000n, label });
    const created = [];

    await ctx.step('set up: three members and a recipient, a local room, and a group on the contract', async (s) => {
      countBefore = Number(await chain.view('get_syndicate_count', {}));
      people = await createMembers(chain, { rootDir: ctx.rootDir, tag: `e${tag.slice(-5)}`, count: 4, fundNear: '0.15' });
      [A, B, C, R] = people;
      host = new HostedRoost({ provider });
      svc = new RoomService({ host });
      created.push(id);
      const hatch = await chain.send(coord.account, 'hatch', { syndicate_id: id, syndicate_type: 'FLASH', quorum_threshold: 1, max_spend_near: 1, enclave_public_key: host.settlePublicKey, expected_code_hash: crypto.randomBytes(32).toString('hex'), timeout_blocks: TIMER, payout_recipient: R.id, release_policy: policy(R) }, { deposit: near('0.01'), gas: 40000000000000n, label: `hatch ${id}` });
      s.assert('the group was hatched with the local room as its room key', hatch.ok, { actual: hatch.error });
      await chain.waitFor(() => state(), { what: 'group' });
      const ph = computePolicyHash(policy(R), TIMER);
      for (const who of [A, C]) {
        const d = await chain.send(who.account, 'deposit', { syndicate_id: id, policy_hash: ph }, { deposit: near('0.02'), gas: 30000000000000n, label: `deposit ${who.id}` });
        s.assert(`${who.id} deposited 0.02`, d.ok, { actual: d.error });
      }
      await chain.waitFor(async () => BigInt((await state()).total_escrow) === near('0.04'), { what: 'deposits' });
      s.assert('the group holds 0.04; A and C hold 0.02 each; B holds nothing', (await escrow(A)) === near('0.02') && (await escrow(C)) === near('0.02') && (await escrow(B)) === 0n);
      const st = await state();
      round = { contractId: chain.coordinatorId, syndicateId: id, epoch: Number(st.epoch), roundNonce: st.round_nonce };
      s.observe('the round nonce on chain', round.roundNonce.slice(0, 16) + '…');
    }, { critical: true });

    let baselineHash; let nonceBefore;
    await ctx.step('prediction 1: with no reader, a settlement that charges the unfunded member is rejected by the contract and changes nothing', async (s) => {
      nonceBefore = (await state()).round_nonce;
      svc.open(round);
      for (const who of [A, B, C]) await bid(who);
      const res = await svc.run({ program: 'pool', params: { recipient: R.id, min: '0' }, round });
      baselineHash = res.orderHash;
      s.assert('the room charged all three, as it had no way to know', res.settlement.args.charges.length === 3, { actual: res.settlement.args.charges.length });
      const tx = await settle(res.settlement, 'settle_batch_charged (baseline, includes the unfunded member)');
      s.evidence('baseline settlement', { ok: tx.ok, hash: tx.hash, error: tx.error, explorer: tx.explorer });
      s.assert('the contract rejected it', !tx.ok, { actual: tx.error });
      s.assert('naming the charge', /Charge for/.test(tx.error || ''), { actual: tx.error });
      const st = await state();
      s.assert('the group is unchanged: 0.04, same nonce, nothing in flight', BigInt(st.total_escrow) === near('0.04') && st.round_nonce === nonceBefore && st.is_settling === false, { actual: { escrow: st.total_escrow, nonce: st.round_nonce, settling: st.is_settling } });
    });

    await ctx.step('prediction 2: the room refuses to re-open that round; abandon makes it possible and is on record', async (s) => {
      s.assert('re-opening the same round is refused', (await codeOf(() => svc.open(round))) !== null);
      const a = svc.abandon(round);
      s.assert('abandon names the order hash it gave up', a.abandoned === true && a.orderHash === baselineHash, { actual: a });
      s.assert('the host keeps a record', host.abandoned.length === 1);
    });

    await ctx.step('prediction 3: with the reader, the unfunded member is left out and the settlement lands', async (s) => {
      host.escrowReader = createEscrowReader({ rpcUrls: PROVIDERS, contractId: chain.coordinatorId, timeoutMs: 20000, maxAgeMs: 120000 });
      for (const who of [A, B, C]) await bid(who);
      const recipientBefore = BigInt((await R.account.getBalance()).toString());
      const res = await svc.run({ program: 'pool', params: { recipient: R.id, min: '0' }, round });
      s.assert('B is left out and named', JSON.stringify(res.outcome.excludedForEscrow) === JSON.stringify([B.id]), { actual: res.outcome.excludedForEscrow });
      s.assert('A and C are charged 0.01 each', res.settlement.args.charges.length === 2 && res.settlement.args.charges.every((c) => BigInt(c.amount) === near('0.01') && [A.id, C.id].includes(c.member)), { actual: res.settlement.args.charges });
      s.observe('block read', res.outcome.escrowBlock);
      s.assert('a real block was read', Number.isSafeInteger(res.outcome.escrowBlock?.height) && res.outcome.escrowBlock.height > 276000000 && typeof res.outcome.escrowBlock.hash === 'string');
      s.assert('prediction 4: raceFree is false, because the exit timer ran out long ago', res.outcome.escrowBlock.raceFree === false, { actual: res.outcome.escrowBlock });
      const tx = await settle(res.settlement, 'settle_batch_charged (with the reader)');
      s.evidence('settlement with the reader', { ok: tx.ok, hash: tx.hash, error: tx.error, explorer: tx.explorer });
      s.assert('the contract accepted it', tx.ok, { actual: tx.error });
      await chain.waitFor(async () => { const st = await state(); return st.is_settling === false && st.round_nonce !== nonceBefore; }, { what: 'the payout follow-up', timeoutMs: 90000 });
      s.assert('A and C hold 0.01 each', (await escrow(A)) === near('0.01') && (await escrow(C)) === near('0.01'));
      s.assert('B was never charged and holds nothing', (await escrow(B)) === 0n);
      s.assert('the group holds 0.02 and the nonce has changed', BigInt((await state()).total_escrow) === near('0.02'));
      const recipientAfter = BigInt((await R.account.getBalance()).toString());
      s.assert('the recipient received exactly 0.02', recipientAfter - recipientBefore === near('0.02'), { actual: String(recipientAfter - recipientBefore) });
    });

    await ctx.step('prediction 5: with one provider unreachable the read fails closed and the queue is kept', async (s) => {
      const host2 = new HostedRoost({ provider, escrowReader: createEscrowReader({ rpcUrls: [PROVIDERS[0], 'http://127.0.0.1:9'], contractId: chain.coordinatorId, timeoutMs: 5000 }) });
      const svc2 = new RoomService({ host: host2 });
      svc2.open({ ...round, roundNonce: 'ee'.repeat(32) });
      await svc2.submit({ flyerId: A.id, cipherTextHex: sealToModel(JSON.stringify({ amount: '0.01' }), host2.intentPublicKey) });
      const code = await codeOf(() => svc2.run({ program: 'pool', params: { recipient: R.id, min: '0' }, round: { ...round, roundNonce: 'ee'.repeat(32) } }));
      s.assert('the run answers UNAVAILABLE', code === 'UNAVAILABLE', { actual: code });
      s.assert('the bid is still queued and nothing was signed', host2.sealedIntents.length === 1 && host2.aggregate === null);
    });

    await ctx.step('prediction 6: teardown: exit, prune, delete the accounts', async (s) => {
      if (!people) { s.assert('nothing to tear down', true); return; }
      const rep = await teardownMembers(chain, { rootDir: ctx.rootDir, members: people, pruneIds: created, exitWaitMs: 120000 });
      s.observe('teardown', { pruned: rep.pruned.length, notPruned: rep.notPruned, deleted: rep.deleted.length, kept: rep.kept, failed: rep.failed });
      s.assert('every account was deleted and the group pruned', rep.failed.length === 0 && rep.kept.length === 0 && rep.notPruned.length === 0, { actual: rep });
      s.assert('the contract holds the groups it started with', Number(await chain.view('get_syndicate_count', {})) === countBefore, { expected: countBefore });
    }, { always: true });
  },
};
