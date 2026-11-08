import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { connect, near, computePolicyHash } from '../lib/near.js';
import { createMembers, teardownMembers } from '../lib/members.js';
import { HostedRoost } from '../../src/roost-service/hosted-roost.js';
import { sealToModel } from '../../src/enclave/e2ee.js';

const provider = { simulated: true, attest: async () => Buffer.from('lab-local-no-hardware'), info: async () => ({}) };
const RPCS = ['https://archival-rpc.testnet.near.org', 'https://archival-rpc.testnet.fastnear.com'];
const phaseFor = (g) => (g === null ? null : g.is_settling ? 'PayoutInFlight' : g.status === 'Settled' ? 'Settled' : g.status === 'AbortedRefunded' ? 'Refunded' : (g.flyers || []).length === 0 ? 'Unfunded' : 'Open');

export default {
  id: 'E-NONCE-CALLBACK-LIVE-01',
  title: 'The nonce-checked follow-up and the phase view on the real contract after the redeploy',
  tier: 'testnet',
  requires: ['near-key', 'network'],
  hypothesis: 'Predictions are in docs/lab/PROGRAMME_PLAN.md (with a disclosed amendment to prediction 4), committed before this file existed. After the redeploy the chain runs the recorded build, the phase view agrees with every group on the contract, a real settlement is followed by on_settlement_payout_for_round carrying the signed round nonce, and two consecutive settlements both complete.',
  limits: [
    'A late follow-up of an earlier settlement cannot be produced on a real chain on demand, and this host cannot create two byte-identical settlements (its order hash includes the round), so GAP-028 itself is shown by the unit tests only.',
    'A settlement that was in flight at the moment of the upgrade (the legacy path) is also unit-tested only.',
    'One operator controls every account; the room is a local host, not a TEE.',
  ],
  async run(ctx) {
    const chain = await connect(ctx.rootDir);
    const coord = chain.sub('c');
    const tag = Date.now().toString(36);
    const id = `nc-${tag}`;
    const deployments = JSON.parse(fs.readFileSync(path.join(ctx.rootDir, 'docs/canonical/deployments.json'), 'utf8')).deployments;
    const state = () => chain.view('get_syndicate', { syndicate_id: id });
    const phase = () => chain.view('get_group_phase', { syndicate_id: id });
    const txStatus = async (hash) => { for (const url of RPCS) { try { const r = await (await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'EXPERIMENTAL_tx_status', params: { tx_hash: hash, sender_account_id: chain.coordinatorId, wait_until: 'FINAL' } }) })).json(); if (r.result) return r.result; } catch { /* next provider */ } } return null; };
    let people; let recipient; let countBefore; const roost = new HostedRoost({ provider });

    await ctx.step('prediction 1: the chain runs the recorded build and still holds the same groups', async (s) => {
      const hash = (await chain.provider.query({ request_type: 'view_code', finality: 'final', account_id: chain.coordinatorId })).hash;
      s.assert('the on-chain code hash is the last recorded deployment', hash === deployments[deployments.length - 1].codeHash, { actual: hash, expected: deployments[deployments.length - 1].codeHash });
      countBefore = Number(await chain.view('get_syndicate_count', {}));
      s.observe('groups on the contract', countBefore);
    }, { critical: true });

    await ctx.step('prediction 2: the phase view agrees with every group, and is null for an unknown id', async (s) => {
      s.assert('an id that does not exist gives null', (await chain.view('get_group_phase', { syndicate_id: 'does-not-exist-xyz' })) === null);
      const page = await chain.view('list_syndicates', { from_index: 0, limit: 50 });
      const groups = Array.isArray(page) ? page : (page.syndicates || []);
      s.assert('the list was readable and non-empty', groups.length > 0, { actual: groups.length });
      const wrong = [];
      for (const g of groups) { const got = await chain.view('get_group_phase', { syndicate_id: g.id }); const want = phaseFor(await chain.view('get_syndicate', { syndicate_id: g.id })); if (got !== want) wrong.push({ id: g.id, got, want }); }
      s.assert('every group\'s phase matches its status, members and settling flag', wrong.length === 0, { actual: wrong });
      s.observe('phases', groups.length);
    });

    await ctx.step('set up: three members, a recipient, a group on the contract', async (s) => {
      const made = await createMembers(chain, { rootDir: ctx.rootDir, tag: `n${tag.slice(-5)}`, count: 4, fundNear: '0.15' });
      recipient = made[3]; people = made.slice(0, 3);
      const policy = { allowed_recipients: [recipient.id], max_release_bps_per_epoch: 10000, settle_deadline_block: 500000000 };
      const h = await chain.send(coord.account, 'hatch', { syndicate_id: id, syndicate_type: 'FLASH', quorum_threshold: 1, max_spend_near: 1, enclave_public_key: roost.settlePublicKey, expected_code_hash: crypto.randomBytes(32).toString('hex'), timeout_blocks: 16, payout_recipient: recipient.id, release_policy: policy }, { deposit: near('0.01'), gas: 40000000000000n, label: `hatch ${id}` });
      s.assert('the group was hatched', h.ok, { actual: h.error });
      await chain.waitFor(() => state(), { what: 'group' });
      s.assert('before any deposit the phase is Unfunded', (await phase()) === 'Unfunded', { actual: await phase() });
      for (const m of people) { const r = await chain.send(m.account, 'deposit', { syndicate_id: id, policy_hash: computePolicyHash(policy, 16) }, { deposit: near('0.02'), gas: 30000000000000n, label: `deposit ${m.id}` }); s.assert(`${m.id} deposited`, r.ok, { actual: r.error }); }
      await chain.waitFor(async () => BigInt((await state()).total_escrow) === near('0.06'), { what: 'deposits' });
      s.assert('after deposits the phase is Open', (await phase()) === 'Open', { actual: await phase() });
    }, { critical: true });

    const seenNonces = [];
    for (const n of [1, 2]) {
      await ctx.step(`prediction ${n === 1 ? '3' : '4 (amended)'}: settlement ${n} is followed by the follow-up that names its own round`, async (s) => {
        const st = await state(); const nonce = st.round_nonce;
        roost.openRound({ contractId: chain.coordinatorId, syndicateId: id, epoch: Number(st.epoch), roundNonce: nonce });
        for (const m of people) roost.submitSealedIntent({ flyerId: m.id, cipherTextHex: sealToModel(JSON.stringify({ amount: '0.01' }), roost.intentPublicKey) });
        const agg = roost.aggregateAndClear({ roundId: id });
        const allocations = [{ recipient: recipient.id, amount: String(near('0.01') * 3n) }];
        const signed = roost.signSettlement({ contractId: chain.coordinatorId, syndicateId: id, epoch: Number(st.epoch), roundNonce: nonce, allocations, orderHash: agg.orderHash });
        const tx = await chain.send(coord.account, 'settle_batch', { syndicate_id: id, attestation_nonce: nonce, aggregate_order_hash: agg.orderHash, allocations, enclave_signature: signed.signature }, { gas: 250000000000000n, label: `settle_batch ${n} ${id}` });
        s.evidence('tx', { label: tx.label, hash: tx.hash, ok: tx.ok, explorer: tx.explorer, error: tx.error });
        s.assert(`settlement ${n} was accepted`, tx.ok, { actual: tx.error });
        await chain.waitFor(async () => !(await state()).is_settling, { what: 'follow-up step', timeoutMs: 90000 });
        const status = await txStatus(tx.hash);
        s.assert('the transaction with its receipts was readable', Boolean(status));
        let follow = null;
        for (const r of status?.receipts || []) for (const act of r.receipt?.Action?.actions || []) if (act.FunctionCall && /^on_settlement_payout/.test(act.FunctionCall.method_name)) follow = { method: act.FunctionCall.method_name, args: JSON.parse(Buffer.from(act.FunctionCall.args, 'base64').toString()) };
        s.assert('the follow-up was scheduled as on_settlement_payout_for_round', follow?.method === 'on_settlement_payout_for_round', { actual: follow?.method });
        s.assert('it carries the round nonce that was signed', follow?.args?.round_nonce === nonce, { expected: nonce, actual: follow?.args?.round_nonce });
        seenNonces.push(nonce);
        s.assert('the pending record is gone after the follow-up', (await chain.view('get_pending_settlement', { syndicate_id: id })) === null);
        s.assert('the phase is Open again', (await phase()) === 'Open', { actual: await phase() });
        s.assert('the round nonce changed', (await state()).round_nonce !== nonce);
      });
    }
    await ctx.step('the two settlements named different rounds', async (s) => { s.assert('two different nonces', seenNonces.length === 2 && seenNonces[0] !== seenNonces[1], { actual: seenNonces }); });

    await ctx.step('prediction 5: teardown: exit, prune, delete the accounts', async (s) => {
      if (!people) { s.assert('nothing to tear down', true); return; }
      const rep = await teardownMembers(chain, { rootDir: ctx.rootDir, members: [...people, recipient], pruneIds: [id], exitWaitMs: 120000 });
      s.observe('teardown', { pruned: rep.pruned.length, notPruned: rep.notPruned, deleted: rep.deleted.length, kept: rep.kept, failed: rep.failed });
      s.assert('every account was deleted and the group pruned', rep.failed.length === 0 && rep.kept.length === 0 && rep.notPruned.length === 0, { actual: rep });
      s.assert('the contract holds the groups it started with', Number(await chain.view('get_syndicate_count', {})) === countBefore, { expected: countBefore });
    }, { always: true });
  },
};
