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
  id: 'E-HOSTED-PROGRAMS-LIVE-01',
  title: 'A weighted supermajority ballot that misses its bar and then meets it exactly, and a pro-rata pool, run by the hosted Roost on a real Phala TDX VM and settled on testnet',
  tier: 'hardware',
  requires: ['phala-key', 'near-key', 'network', 'docker'],
  hypothesis: 'Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. The VM attests the new pinned image; a weighted ballot at a 70% bar decides nothing and leaves the escrow untouched; the same signed votes at a 60% bar (exactly the winner\'s weighted share) decide, and the contract accepts the settlement with every voter charged one equal share; an oversubscribed pro-rata pool charges each member exactly the scaled amount and pays the recipient exactly the total; teardown leaves nothing.',
  limits: [
    'One operator controls every account and the VM. This is the system working on real hardware, not independent parties.',
    'The attestation proves which image and compose the VM runs; it does not audit the code inside the image.',
    'Two settled rounds and three members: not a long-lived or large group. Deposits and payouts are public on NEAR, so pro-rata and weights hide nothing extra.',
    'Weights are supplied by the coordinator and are public in the request. Testnet only.',
  ],
  async run(ctx) {
    const chain = await connect(ctx.rootDir);
    const coord = chain.sub('c');
    const expected = JSON.parse(fs.readFileSync(path.join(ctx.rootDir, 'roost.expected.json'), 'utf8'));
    const ourCompose = fs.readFileSync(path.join(ctx.rootDir, 'deploy/roost/docker-compose.yml'), 'utf8');
    let vm = null; let verifier = null; let attested = null; let P = null; let countBefore = null;
    const created = [];
    const tag = Date.now().toString(36);
    const id = `hpg-${tag}`;
    const state = (x = id) => chain.view('get_syndicate', { syndicate_id: x });
    const escrowOf = async (who) => BigInt(await chain.view('get_escrow', { syndicate_id: id, account_id: P[who].id }));
    const waitSettled = (expectTotal) => chain.waitFor(async () => { const x = await state(); return !x.is_settling && BigInt(x.total_escrow) === expectTotal; }, { what: 'settlement resolved' });
    const roundOf = async () => { const st = await state(); return { contractId: chain.coordinatorId, syndicateId: id, epoch: Number(st.epoch), roundNonce: st.round_nonce }; };

    await ctx.step('preflight: the Phala account is empty and the compose file is pinned', async (s) => {
      const existing = await listCvms(ctx.rootDir);
      s.assert('no CVM is already running on the account', existing.length === 0, { actual: existing.map((x) => x.cvmName) });
      s.assert('the compose file is pinned to a CI-built image digest and requires signed inputs', /ghcr\.io\/etvjay\/midge-roost@sha256:[0-9a-f]{64}/.test(ourCompose) && ourCompose.includes('ROOST_REQUIRE_SIGNED_INPUTS=1') && ourCompose.includes('ROOST_CONTRACT_ID=c.fly-1793636729.testnet'));
      s.assert('the pinned digest is the one CI built from the merge that added the programs (76dd150f)', ourCompose.includes('sha256:76dd150f0588d46ae2a93b42cb78ee467f8c9bd7d34af54a660e702f66034783'));
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
      const MEM = ['ma', 'mb', 'mc'];
      const send = (who, round, body, seq = 1) => {
        const kp = P[who].key.keyPair;
        const cipherTextHex = sealToModel(JSON.stringify(body), session.intentPublicKey);
        return member.submitSignedIntent({ flyerId: P[who].id, cipherTextHex, publicKey: kp.getPublicKey().toString(), signature: signInputWithNearKey(kp.toString(), inputMessage({ ...round, flyerId: P[who].id, seq, cipherTextHex })), seq });
      };
      const settle = async (s, round, res, label) => {
        const signed = await coordinator.signSettlement({ ...round, allocations: res.allocations, orderHash: res.orderHash, charges: res.charges });
        const tx = await chain.send(coord.account, 'settle_batch_charged', { syndicate_id: id, attestation_nonce: round.roundNonce, aggregate_order_hash: res.orderHash, allocations: res.allocations, charges: res.charges, enclave_signature: signed.signature }, { gas: 150000000000000n, label });
        s.evidence('tx', { label: tx.label, hash: tx.hash, ok: tx.ok, explorer: tx.explorer, error: tx.error });
        s.assert('the contract accepted the settlement the VM signed', tx.ok, { actual: tx.error });
        return tx;
      };

      await ctx.step('set up: three members, three recipients, a group whose room key is the ATTESTED settlement key, three deposits of 0.05', async (s) => {
        s.assert('the settlement key the contract will trust equals the attested one', session.settlePublicKey === attested.settlePublicKey);
        countBefore = Number(await chain.view('get_syndicate_count', {}));
        const names = [...MEM, 'ra', 'rb', 'rp'];
        const made = await createMembers(chain, { rootDir: ctx.rootDir, tag: `hp${tag.slice(-5)}`, count: names.length, fundNear: '0.2', names });
        P = Object.fromEntries(names.map((k, i) => [k, made[i]])); P.all = made;
        created.push(id);
        const pol = { allowed_recipients: [P.ra.id, P.rb.id, P.rp.id], max_release_bps_per_epoch: 10000, settle_deadline_block: 500000000 };
        const h = await chain.send(coord.account, 'hatch', { syndicate_id: id, syndicate_type: 'FLASH', quorum_threshold: 1, max_spend_near: 1, enclave_public_key: session.settlePublicKey, expected_code_hash: crypto.randomBytes(32).toString('hex'), timeout_blocks: 12, payout_recipient: P.ra.id, release_policy: pol }, { deposit: near('0.01'), gas: 40000000000000n, label: `hatch ${id}` });
        s.assert('the group was hatched', h.ok, { actual: h.error });
        await chain.waitFor(() => state(), { what: 'group' });
        const ph = computePolicyHash(pol, 12);
        for (const k of MEM) { const d = await chain.send(P[k].account, 'deposit', { syndicate_id: id, policy_hash: ph }, { deposit: near('0.05'), gas: 30000000000000n, label: `deposit ${k}` }); s.assert(`${k} deposits 0.05`, d.ok, { actual: d.error }); }
        await chain.waitFor(async () => BigInt((await state()).total_escrow) === toN('0.15'), { what: 'deposits' });
      }, { critical: true });

      let round = null;
      const ballot = (extra) => coordinator.runBallot({ options: { A: P.ra.id, B: P.rb.id }, roll: MEM.map((k) => P[k].id), share: '0.01', quorumBps: 5000, rule: 'supermajority', weights: { [P.ma.id]: 3 }, roundId: `${id}-r1`, ...extra });
      const castAll = async () => { await send('ma', round, { choice: 'A' }); await send('mb', round, { choice: 'B' }); await send('mc', round, { choice: 'B' }); };

      await ctx.step('prediction 2: a weighted supermajority ballot below its bar decides nothing and leaves the escrow untouched', async (s) => {
        round = await roundOf(); await coordinator.openRound(round);
        await castAll();
        const res = await ballot({ thresholdBps: 7000 });
        s.assert('A holds 3 of 5 weight (60%), under a 70% bar: undecided, no order hash, nothing to sign', res.outcome.decided === false && res.orderHash === null && res.allocations.length === 0, { actual: res.outcome });
        s.assert('the outcome carries no tally, turnout or weight', !['tally', 'counts', 'turnout', 'weights'].some((k) => k in res.outcome), { actual: Object.keys(res.outcome) });
        s.assert('the group\'s escrow is unchanged on chain (0.15)', BigInt((await state()).total_escrow) === toN('0.15'));
      });

      await ctx.step('prediction 3: the same signed votes at a 60% bar (exactly the weighted share) decide, and the contract accepts the settlement', async (s) => {
        await coordinator.openRound(round);
        await castAll();
        const res = await ballot({ thresholdBps: 6000 });
        s.assert('A wins on the bar exactly', res.outcome.decided && res.outcome.winner === 'A' && res.outcome.recipient === P.ra.id, { actual: res.outcome });
        s.assert('every voter is charged one equal share (weights change votes, not payments)', res.charges.length === 3 && res.charges.every((c) => BigInt(c.amount) === toN('0.01')), { actual: res.charges });
        const tx = await settle(s, round, res, 'settle_batch_charged weighted ballot');
        await waitSettled(toN('0.12'));
        const paid = (await chain.transfersOf(tx.hash, coord.id)).filter((m) => m.fromContract);
        s.assert('ra received exactly 0.03', paid.length === 1 && paid[0].to === P.ra.id && BigInt(paid[0].amount) === toN('0.03'), { actual: paid });
        for (const k of MEM) s.assert(`${k} was charged exactly 0.01 (0.04 left)`, (await escrowOf(k)) === toN('0.04'), { actual: String(await escrowOf(k)) });
      });

      await ctx.step('prediction 4: an oversubscribed pro-rata pool charges each member exactly the scaled amount and pays the recipient exactly the total', async (s) => {
        round = await roundOf(); await coordinator.openRound(round);
        for (const k of MEM) await send(k, round, { amount: '0.04' });
        const res = await coordinator.runPool({ recipient: P.rp.id, cap: '0.09', mode: 'pro-rata', roundId: `${id}-r2` });
        s.assert('the outcome says pro-rata, scaled, nobody left out', res.outcome.mode === 'pro-rata' && res.outcome.scaled === true && res.outcome.leftOut.length === 0, { actual: res.outcome });
        s.assert('each of the three is charged 0.03 and the recipient is allocated 0.09', res.charges.length === 3 && res.charges.every((c) => BigInt(c.amount) === toN('0.03')) && BigInt(res.allocations[0].amount) === toN('0.09'), { actual: res });
        const tx = await settle(s, round, res, 'settle_batch_charged pro-rata pool');
        await waitSettled(toN('0.03'));
        const paid = (await chain.transfersOf(tx.hash, coord.id)).filter((m) => m.fromContract);
        s.assert('rp received exactly 0.09', paid.length === 1 && paid[0].to === P.rp.id && BigInt(paid[0].amount) === toN('0.09'), { actual: paid });
        for (const k of MEM) s.assert(`${k} was charged exactly 0.03 (0.01 left)`, (await escrowOf(k)) === toN('0.01'), { actual: String(await escrowOf(k)) });
      });
    } finally {
      await ctx.step('prediction 5: teardown of the chain side (members exit with their remainders, group pruned, accounts deleted)', async (st) => {
        if (!P) { st.assert('nothing to tear down', true); return; }
        const rep = await teardownMembers(chain, { rootDir: ctx.rootDir, members: P.all, pruneIds: created, exitWaitMs: 180000 });
        st.observe('teardown', { pruned: rep.pruned.length, notPruned: rep.notPruned, deleted: rep.deleted.length, kept: rep.kept, failed: rep.failed });
        st.assert('the group was pruned and every account deleted', rep.notPruned.length === 0 && rep.failed.length === 0 && rep.deleted.length === 6, { actual: rep });
        st.assert('the contract holds the groups it started with', Number(await chain.view('get_syndicate_count', {})) === countBefore, { expected: countBefore });
      }, { always: true });
      await ctx.step('prediction 5: teardown: delete the VM and prove the account is empty', async (s) => {
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
