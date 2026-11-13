import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { connect, near, computePolicyHash } from '../lib/near.js';
import { createMembers, teardownMembers } from '../lib/members.js';
import { deployRoost, listCvms, startVerifier, HOURLY_USD } from '../lib/phala.js';
import { HostedRoostClient } from '../../src/roost-service/client.js';
import { verifyHostedAttestation } from '../../src/roost-service/verify-hosted.js';
import { expectedComposeHashes } from '../../src/roost-service/compose-hash.js';
import { sealToModel } from '../../src/enclave/e2ee.js';
import { signInputWithNearKey, inputMessage } from '../../src/roost-service/signed-input.js';

const toN = (x) => near(String(x));

export default {
  id: 'E-HOSTED-CROSS-LIVE-02',
  title: 'A block trade with a minimum fill on the real hardware room: an order whose pro-rata fill would be under its minimum is cancelled, the cross is recomputed, and the production contract settles exactly',
  tier: 'hardware',
  requires: ['phala-key', 'near-key', 'network', 'docker'],
  hypothesis: 'Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. A buyer who set a minimum of 3 units and would have been filled 2 is cancelled; the cross is computed again without them, so the other buyer fills all 5 units; the published outcome says one order was cancelled and not whose; the contract charges and pays exactly.',
  limits: [
    'One operator controls every account and the VM.',
    'Only the middle of a block trade is modelled: no indications of interest or firm-up step, no minimum fill, no time priority, a supplied reference price, and only the cash leg settles.',
    'Charges and payouts are public on NEAR, so filled units can be worked out from the cash and the public reference price.',
  ],
  async run(ctx) {
    const chain = await connect(ctx.rootDir);
    const coord = chain.sub('c');
    const expected = JSON.parse(fs.readFileSync(path.join(ctx.rootDir, 'roost.expected.json'), 'utf8'));
    const ourCompose = fs.readFileSync(path.join(ctx.rootDir, 'deploy/roost/docker-compose.yml'), 'utf8');
    let vm = null; let verifier = null; let attested = null; let P = null; let countBefore = null;
    const created = [];
    const tag = Date.now().toString(36);
    const id = `hbm-${tag}`;
    const state = (x = id) => chain.view('get_syndicate', { syndicate_id: x });
    const escrowOf = async (who) => BigInt(await chain.view('get_escrow', { syndicate_id: id, account_id: P[who].id }));
    const waitSettled = (expectTotal) => chain.waitFor(async () => { const x = await state(); return !x.is_settling && BigInt(x.total_escrow) === expectTotal; }, { what: 'settlement resolved' });
    const roundOf = async () => { const st = await state(); return { contractId: chain.coordinatorId, syndicateId: id, epoch: Number(st.epoch), roundNonce: st.round_nonce }; };

    await ctx.step('preflight: the Phala account is empty and the compose file is pinned', async (s) => {
      const existing = await listCvms(ctx.rootDir);
      s.assert('no CVM is already running on the account', existing.length === 0, { actual: existing.map((x) => x.cvmName) });
      s.assert('the compose file is pinned to a CI-built image digest and requires signed inputs', /ghcr\.io\/etvjay\/midge-roost@sha256:[0-9a-f]{64}/.test(ourCompose) && ourCompose.includes('ROOST_REQUIRE_SIGNED_INPUTS=1') && ourCompose.includes('ROOST_CONTRACT_ID=c.fly-1793636729.testnet'));
      s.assert('the pinned digest is the one CI built from the merge that added maker-checker (98531165)', ourCompose.includes('sha256:985311650c46cb39fc785f75c874898fcd218e7da8909943ca510e4ae58cfa52'));
      s.assert('a production OS image hash is pinned', (expected.osImageHashes || []).length > 0);
      s.observe('instance type and rate', { type: 'tdx.small', usdPerHour: HOURLY_USD });
    }, { critical: true });

    try {
      await ctx.step('prediction 1: deploy on a real TDX VM and verify the attestation as a member would', async (s) => {
        vm = await deployRoost({ rootDir: ctx.rootDir, hours: 1, log: (m) => s.note(m) });
        s.evidence('cvm', { id: vm.id, url: vm.url, deadmanHours: vm.deadmanHours });
        s.assert('public logs are off', (vm.cvm.compose_file || {}).public_logs === false);
        s.assert('it runs a production (non-dev) OS image with the pinned hash', vm.cvm.os?.is_dev === false && (expected.osImageHashes || []).includes(vm.cvm.os?.os_image_hash), { actual: vm.cvm.os?.os_image_hash });
        verifier = await startVerifier();
        const derived = expectedComposeHashes({ cvmJson: vm.cvm, ourCompose });
        s.assert('Phala\'s app-compose contains our compose file byte for byte', derived.ok && derived.matchesOurCompose);
        const nonce = crypto.randomBytes(32).toString('hex');
        attested = await (await fetch(`${vm.url}/attestation?nonce=${nonce}`)).json();
        const verification = await verifyHostedAttestation(attested, { nonce, verifierUrl: verifier.url, composeHash: derived.candidates, osImageHashes: expected.osImageHashes });
        for (const c of verification.checks) s.assert(c.name, c.ok, { actual: c.detail });
        s.assert('the VM does not claim to be a simulator', attested.simulated === false);
        s.evidence('attestation', { composeHash: verification.details?.composeHash, osImageHash: verification.details?.osImageHash });
      }, { critical: true });

      const member = new HostedRoostClient({ baseUrl: vm.url });
      const coordinator = new HostedRoostClient({ baseUrl: vm.url, adminKey: vm.adminKey });
      const session = await member.getSession();
      const BUY = ['b1', 'b2', 'b3']; const SELL = ['s1', 's2'];
      const send = (who, round, body) => {
        const kp = P[who].key.keyPair;
        const cipherTextHex = sealToModel(JSON.stringify(body), session.intentPublicKey);
        return member.submitSignedIntent({ flyerId: P[who].id, cipherTextHex, publicKey: kp.getPublicKey().toString(), signature: signInputWithNearKey(kp.toString(), inputMessage({ ...round, flyerId: P[who].id, seq: 1, cipherTextHex })), seq: 1 });
      };

      await ctx.step('set up: three buyers and two sellers, a group whose room key is the ATTESTED settlement key, the buyers deposit', async (s) => {
        s.assert('the settlement key the contract will trust equals the attested one', session.settlePublicKey === attested.settlePublicKey);
        countBefore = Number(await chain.view('get_syndicate_count', {}));
        const names = [...BUY, ...SELL];
        const made = await createMembers(chain, { rootDir: ctx.rootDir, tag: `bm${tag.slice(-5)}`, count: names.length, fundNear: '0.15', names });
        P = Object.fromEntries(names.map((k, i) => [k, made[i]])); P.all = made;
        created.push(id);
        const pol = { allowed_recipients: SELL.map((k) => P[k].id), max_release_bps_per_epoch: 10000, settle_deadline_block: 500000000 };
        const h = await chain.send(coord.account, 'hatch', { syndicate_id: id, syndicate_type: 'FLASH', quorum_threshold: 1, max_spend_near: 1, enclave_public_key: session.settlePublicKey, expected_code_hash: crypto.randomBytes(32).toString('hex'), timeout_blocks: 12, payout_recipient: P.s1.id, release_policy: pol }, { deposit: near('0.01'), gas: 40000000000000n, label: `hatch ${id}` });
        s.assert('the group was hatched', h.ok, { actual: h.error });
        await chain.waitFor(() => state(), { what: 'group' });
        const ph = computePolicyHash(pol, 12);
        for (const k of BUY) { const d = await chain.send(P[k].account, 'deposit', { syndicate_id: id, policy_hash: ph }, { deposit: near('0.08'), gas: 30000000000000n, label: `deposit ${k}` }); s.assert(`${k} deposits 0.08`, d.ok, { actual: d.error }); }
        await chain.waitFor(async () => BigInt((await state()).total_escrow) === toN('0.24'), { what: 'deposits' });
      }, { critical: true });

      await ctx.step('prediction 1 to 3: firm orders are sealed and signed, a minimum fill cancels one order, and the cross is right', async (s) => {
        const round = await roundOf(); await coordinator.openRound(round);
        const orders = { b1: { side: 'buy', units: 6, limit: '0.012' }, b2: { side: 'buy', units: 4, limit: '0.011', minUnits: 3 }, b3: { side: 'buy', units: 5, limit: '0.009' }, s1: { side: 'sell', units: 3, limit: '0.009' }, s2: { side: 'sell', units: 2, limit: '0.01' } };
        for (const [k, o] of Object.entries(orders)) await send(k, round, o);
        const res = await coordinator.runCross({ referencePrice: '0.01', roundId: `${id}-r1` });
        s.evidence('outcome', res.outcome);
        s.assert('5 units matched for 0.05, one order was cancelled for being under its minimum, and one buyer and two sellers filled', res.outcome.matchedUnits === 5 && res.outcome.cash === '0.05' && res.outcome.cancelledBelowMinimum === 1 && res.outcome.buyers === 1 && res.outcome.sellers === 2, { actual: res.outcome });
        s.assert('the published outcome names no one and carries no limit price', !JSON.stringify(res.outcome).includes(P.b2.id) && !JSON.stringify(res.outcome).includes('0.012') && !JSON.stringify(res.outcome).includes('0.011'), { actual: res.outcome });
        s.assert('b1 is charged 0.05 for all 5 units and b2 is not charged', res.charges.length === 1 && res.charges[0].member === P.b1.id && BigInt(res.charges[0].amount) === toN('0.05'), { actual: res.charges });
        const signed = await coordinator.signSettlement({ ...round, allocations: res.allocations, orderHash: res.orderHash, charges: res.charges });
        const tx = await chain.send(coord.account, 'settle_batch_charged', { syndicate_id: id, attestation_nonce: round.roundNonce, aggregate_order_hash: res.orderHash, allocations: res.allocations, charges: res.charges, enclave_signature: signed.signature }, { gas: 150000000000000n, label: 'settle_batch_charged block trade' });
        s.evidence('tx', { label: tx.label, hash: tx.hash, ok: tx.ok, explorer: tx.explorer, error: tx.error });
        s.assert('the contract accepted the settlement the VM signed', tx.ok, { actual: tx.error });
        await waitSettled(toN('0.19'));
        const paid = (await chain.transfersOf(tx.hash, coord.id)).filter((m) => m.fromContract);
        const by = Object.fromEntries(paid.map((m) => [m.to, BigInt(m.amount)]));
        s.assert('prediction 3: s1 received exactly 0.03 and s2 exactly 0.02, and nothing else moved', by[P.s1.id] === toN('0.03') && by[P.s2.id] === toN('0.02') && paid.length === 2, { actual: paid });
        s.assert('b1 has 0.03 left, and b2 and b3 all of their 0.08', (await escrowOf('b1')) === toN('0.03') && (await escrowOf('b2')) === toN('0.08') && (await escrowOf('b3')) === toN('0.08'));
      });
    } finally {
      await ctx.step('prediction 4: teardown of the chain side (members exit with their remainders, group pruned, accounts deleted)', async (st) => {
        if (!P) { st.assert('nothing to tear down', true); return; }
        const rep = await teardownMembers(chain, { rootDir: ctx.rootDir, members: P.all, pruneIds: created, exitWaitMs: 180000 });
        st.observe('teardown', { pruned: rep.pruned.length, notPruned: rep.notPruned, deleted: rep.deleted.length, kept: rep.kept, failed: rep.failed });
        st.assert('the group was pruned and every account deleted', rep.notPruned.length === 0 && rep.failed.length === 0 && rep.deleted.length === 5, { actual: rep });
        st.assert('the contract holds the groups it started with', Number(await chain.view('get_syndicate_count', {})) === countBefore, { expected: countBefore });
      }, { always: true });
      await ctx.step('prediction 4: teardown: delete the VM and prove the account is empty', async (s) => {
        if (verifier) await verifier.stop();
        const result = vm ? await vm.teardown() : { deleted: true, note: 'no VM was created' };
        s.observe('teardown', result);
        s.assert('the VM was deleted', result.deleted === true, { actual: result });
        let left = [];
        for (let i = 0; i < 12; i += 1) { left = (await listCvms(ctx.rootDir)).filter((x) => !/delet/i.test(String(x.status))); if (!left.length) break; await new Promise((r) => setTimeout(r, 5000)); }
        s.assert('no CVM is left running on the account', left.length === 0, { actual: left.map((x) => `${x.cvmName}:${x.status}`) });
        if (result.estimatedUsd !== undefined) { s.observe('estimated cost (USD)', result.estimatedUsd); s.assert('the session cost under $0.15', result.estimatedUsd < 0.15, { actual: result.estimatedUsd }); }
      }, { always: true });
    }
  },
};
