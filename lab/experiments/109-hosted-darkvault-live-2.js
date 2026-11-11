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

const MEMBERS = ['u1', 'u2', 'u3', 'u4', 'u5']; const FOUNDERS = ['u1', 'u2', 'u3', 'u4'];
const DEP = '0.1'; const CAP_BPS = 2500; const TIMER = 24;
const toN = (x) => near(String(x));

export default {
  id: 'E-HOSTED-DARKVAULT-LIVE-02',
  title: 'A Dark Vault run by the hosted Roost on a real Phala TDX VM (second run, no ballot): a pool, a late deposit and a second pool, then a lending quote, settled on testnet with the VM\'s escrow check on',
  tier: 'hardware',
  requires: ['phala-key', 'near-key', 'network', 'docker'],
  hypothesis: 'Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. The pinned hosted image attests; the VM runs a pool, a ballot (counting a late depositor) and a lending quote for one Dark Vault group, and the contract settles each; the books close exactly; teardown leaves nothing.',
  limits: [
    'One operator controls every account and the VM. This is the system working on real hardware, not independent parties.',
    'The attestation proves which image and compose the VM runs; it does not prove the escrow providers are honest or audit the code inside the image.',
    'Three rounds and five members: not a long-lived or large group. The VM exists for the length of the session and the coordinator key is generated for it.',
    'Only the cash leg settles. Deposits and payouts are public on NEAR.',
    'Testnet only; the contract has not been audited by a third party.',
  ],
  async run(ctx) {
    const chain = await connect(ctx.rootDir);
    const coord = chain.sub('c');
    const expected = JSON.parse(fs.readFileSync(path.join(ctx.rootDir, 'roost.expected.json'), 'utf8'));
    const ourCompose = fs.readFileSync(path.join(ctx.rootDir, 'deploy/roost/docker-compose.yml'), 'utf8');
    let vm = null; let verifier = null; let attested = null; let P = null; let countBefore = null;
    const created = [];
    const tag = Date.now().toString(36);
    const id = `hdw-${tag}`;
    const state = (x = id) => chain.view('get_syndicate', { syndicate_id: x });
    const escrowOf = async (who) => BigInt(await chain.view('get_escrow', { syndicate_id: id, account_id: P[who].id }));
    const height = (f = 'optimistic') => chain.blockHeight(f);
    const policyFor = () => ({ allowed_recipients: [P.rp.id, P.ra.id, P.rb.id, P.rl.id], max_release_bps_per_epoch: CAP_BPS, settle_deadline_block: 500000000 });
    const waitSettled = (expectTotal) => chain.waitFor(async () => { const x = await state(); return !x.is_settling && BigInt(x.total_escrow) === expectTotal; }, { what: 'settlement resolved' });
    const windowOf = () => chain.view('get_release_window', { syndicate_id: id });
    const waitWindowEnd = async () => { const w = await windowOf(); if (w) await chain.waitFor(async () => (await height('final')) > Number(w.ends_at_block), { what: 'the release window to end', timeoutMs: 120000, everyMs: 1000 }); };
    const roundOf = async () => { const st = await state(); return { contractId: chain.coordinatorId, syndicateId: id, epoch: Number(st.epoch), roundNonce: st.round_nonce }; };
    const conserved = async (s, label, who) => { const st = await state(); let t = 0n; for (const k of who) t += await escrowOf(k); s.assert(`${label}: the members' escrows sum to the group total`, t === BigInt(st.total_escrow), { actual: [String(t), st.total_escrow] }); };

    await ctx.step('preflight: the Phala account is empty and the compose file is pinned with the escrow settings', async (s) => {
      const existing = await listCvms(ctx.rootDir);
      s.assert('no CVM is already running on the account', existing.length === 0, { actual: existing.map((x) => x.cvmName) });
      s.assert('the compose file is pinned to a CI-built image digest', /ghcr\.io\/etvjay\/midge-roost@sha256:[0-9a-f]{64}/.test(ourCompose));
      s.assert('the compose file carries the escrow settings', ourCompose.includes('ROOST_RPC_URLS=') && ourCompose.includes('ROOST_CONTRACT_ID=c.fly-1793636729.testnet'));
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
      const epochs = []; const nonces = [];

      // The pinned image requires signed inputs (GAP-046): every input is sealed to the room and signed with the member's own account key for the current round.
      let curRound = null;
      const cast = (who, body) => {
        const cipherTextHex = sealToModel(JSON.stringify(body), session.intentPublicKey); const kp = P[who].key.keyPair;
        return member.submitSignedIntent({ flyerId: P[who].id, cipherTextHex, publicKey: kp.getPublicKey().toString(), signature: signInputWithNearKey(kp.toString(), inputMessage({ ...curRound, flyerId: P[who].id, seq: 1, cipherTextHex })), seq: 1 });
      };
      const settle = async (s, label, res, round, expectTotal) => {
        const signed = await coordinator.signSettlement({ ...round, allocations: res.allocations, orderHash: res.orderHash, charges: res.charges });
        const tx = await chain.send(coord.account, 'settle_batch_charged', { syndicate_id: id, attestation_nonce: round.roundNonce, aggregate_order_hash: res.orderHash, allocations: res.allocations, charges: res.charges, enclave_signature: signed.signature }, { gas: 150000000000000n, label: `settle_batch_charged ${label}` });
        s.evidence('tx', { label: tx.label, hash: tx.hash, ok: tx.ok, explorer: tx.explorer, error: tx.error });
        s.assert(`${label}: the contract accepted the settlement the VM signed`, tx.ok, { actual: tx.error });
        await waitSettled(expectTotal);
        const st = await state(); epochs.push(Number(st.epoch)); nonces.push(st.round_nonce);
        s.assert(`${label}: the epoch rose by exactly 1 and the round nonce changed`, epochs.at(-1) === epochs.at(-2) + 1 && nonces.at(-1) !== nonces.at(-2), { actual: { epochs } });
        return tx;
      };

      await ctx.step('set up: five members, four recipients, and a Dark Vault whose room key is the ATTESTED settlement key; four founders deposit', async (s) => {
        s.assert('the settlement key the contract will trust equals the attested one', session.settlePublicKey === attested.settlePublicKey);
        countBefore = Number(await chain.view('get_syndicate_count', {}));
        const names = [...MEMBERS, 'rp', 'ra', 'rb', 'rl'];
        const made = await createMembers(chain, { rootDir: ctx.rootDir, tag: `hv${tag.slice(-5)}`, count: names.length, fundNear: '0.4', names });
        P = Object.fromEntries(names.map((k, i) => [k, made[i]])); P.all = made;
        s.assert('nine accounts exist', made.length === 9);
        created.push(id);
        const h = await chain.send(coord.account, 'hatch', { syndicate_id: id, syndicate_type: 'DARK_VAULT', quorum_threshold: 1, max_spend_near: 1, enclave_public_key: session.settlePublicKey, expected_code_hash: crypto.randomBytes(32).toString('hex'), timeout_blocks: TIMER, payout_recipient: P.rp.id, release_policy: policyFor() }, { deposit: near('0.01'), gas: 40000000000000n, label: `hatch ${id}` });
        s.assert('the group was hatched', h.ok, { actual: h.error });
        await chain.waitFor(() => state(), { what: 'group' });
        const ph = computePolicyHash(policyFor(), TIMER);
        for (const k of FOUNDERS) { const d = await chain.send(P[k].account, 'deposit', { syndicate_id: id, policy_hash: ph }, { deposit: near(DEP), gas: 30000000000000n, label: `deposit ${k}` }); s.assert(`${k} deposits ${DEP}`, d.ok, { actual: d.error }); }
        await chain.waitFor(async () => BigInt((await state()).total_escrow) === toN('0.4'), { what: 'deposits' });
        const st = await state(); epochs.push(Number(st.epoch)); nonces.push(st.round_nonce);
      }, { critical: true });

      await ctx.step('prediction 2: round 1, a pool run by the VM, 0.05 to rp', async (s) => {
        const round = await roundOf(); await coordinator.openRound(round); curRound = round;
        for (const [k, a] of [['u1', '0.01'], ['u2', '0.01'], ['u3', '0.015'], ['u4', '0.015']]) await cast(k, { amount: a });
        const res = await coordinator.runPool({ recipient: P.rp.id, roundId: `${id}-r1` });
        s.observe('block the VM read', res.outcome.escrowBlock);
        const tx = await settle(s, 'round 1', res, round, toN('0.35'));
        const paid = (await chain.transfersOf(tx.hash, coord.id)).filter((m) => m.fromContract);
        s.assert('round 1: rp received exactly 0.05 and nothing else moved', paid.length === 1 && paid[0].to === P.rp.id && BigInt(paid[0].amount) === toN('0.05'), { actual: paid });
        await conserved(s, 'round 1', FOUNDERS);
      });

      await ctx.step('prediction 3: a fifth member deposits, then round 2, a second pool, counts them', async (s) => {
        const ph = computePolicyHash(policyFor(), TIMER);
        const d = await chain.send(P.u5.account, 'deposit', { syndicate_id: id, policy_hash: ph }, { deposit: near(DEP), gas: 30000000000000n, label: 'deposit u5' });
        s.assert('u5 deposits 0.1 into the running group', d.ok, { actual: d.error });
        await chain.waitFor(async () => BigInt((await state()).total_escrow) === toN('0.45'), { what: 'late deposit' });
        await waitWindowEnd();
        const round = await roundOf(); await coordinator.openRound(round); curRound = round;
        for (const k of MEMBERS) await cast(k, { amount: '0.01' });
        const res = await coordinator.runPool({ recipient: P.ra.id, roundId: `${id}-r2` });
        s.assert('the late member is charged: five charges of 0.01', res.charges.length === 5 && res.charges.every((c) => BigInt(c.amount) === toN('0.01')) && res.charges.some((c) => c.member === P.u5.id), { actual: res.charges });
        const tx = await settle(s, 'round 2', res, round, toN('0.40'));
        const paid = (await chain.transfersOf(tx.hash, coord.id)).filter((m) => m.fromContract);
        s.assert('round 2: ra received exactly 0.05', paid.length === 1 && paid[0].to === P.ra.id && BigInt(paid[0].amount) === toN('0.05'), { actual: paid });
        s.assert('the late member was charged 0.01 like everyone else: u5 has 0.09', (await escrowOf('u5')) === toN('0.09'));
        await conserved(s, 'round 2', MEMBERS);
      });

      await ctx.step('prediction 4 and 5: round 3, a lending quote, then the books close', async (s) => {
        await waitWindowEnd();
        const round = await roundOf(); await coordinator.openRound(round); curRound = round;
        for (const [k, bps] of [['u2', 450], ['u3', 400], ['u4', 500], ['u5', 600]]) await cast(k, { rateBps: bps });
        const res = await coordinator.runQuote({ shape: 'lend', counterparty: P.rl.id, amount: '0.04', limit: 700, roundId: `${id}-r3` });
        s.assert('u3 wins at 400 bps', res.outcome.won && res.outcome.winner === P.u3.id && res.outcome.rateBps === 400, { actual: res.outcome });
        const tx = await settle(s, 'round 3', res, round, toN('0.36'));
        const paid = (await chain.transfersOf(tx.hash, coord.id)).filter((m) => m.fromContract);
        s.assert('round 3: rl received exactly 0.04', paid.length === 1 && paid[0].to === P.rl.id && BigInt(paid[0].amount) === toN('0.04'), { actual: paid });
        await conserved(s, 'round 3', MEMBERS);
        const left = { u1: '0.08', u2: '0.08', u3: '0.035', u4: '0.075', u5: '0.09' };
        for (const k of MEMBERS) s.assert(`${k} has exactly ${left[k]} left`, (await escrowOf(k)) === toN(left[k]), { actual: String(await escrowOf(k)) });
        s.assert('three settlements, three epochs: the epoch rose by exactly 3 and every nonce was different', epochs.at(-1) === epochs[0] + 3 && new Set(nonces).size === nonces.length, { actual: { epochs } });
      });
    } finally {
      await ctx.step('prediction 6: teardown of the chain side (members exit with their remainders, group pruned, accounts deleted)', async (st) => {
        if (!P) { st.assert('nothing to tear down', true); return; }
        const rep = await teardownMembers(chain, { rootDir: ctx.rootDir, members: P.all, pruneIds: created, exitWaitMs: 180000 });
        st.observe('teardown', { pruned: rep.pruned.length, notPruned: rep.notPruned, deleted: rep.deleted.length, kept: rep.kept, failed: rep.failed });
        st.assert('the group was pruned and every account deleted', rep.notPruned.length === 0 && rep.failed.length === 0 && rep.deleted.length === 9, { actual: rep });
        st.assert('the contract holds the groups it started with', Number(await chain.view('get_syndicate_count', {})) === countBefore, { expected: countBefore });
      }, { always: true });
      await ctx.step('prediction 6: teardown: delete the VM and prove the account is empty', async (s) => {
        if (verifier) await verifier.stop();
        const result = vm ? await vm.teardown() : { deleted: true, note: 'no VM was created' };
        s.observe('teardown', result);
        s.assert('the VM was deleted', result.deleted === true, { actual: result });
        let left = [];
        for (let i = 0; i < 12; i += 1) { left = (await listCvms(ctx.rootDir)).filter((x) => !/delet/i.test(String(x.status))); if (!left.length) break; await new Promise((r) => setTimeout(r, 5000)); }
        s.assert('no CVM is left running on the account', left.length === 0, { actual: left.map((x) => `${x.cvmName}:${x.status}`) });
        if (result.estimatedUsd !== undefined) { s.observe('estimated cost (USD)', result.estimatedUsd); s.assert('the session cost under $0.10', result.estimatedUsd < 0.10, { actual: result.estimatedUsd }); }
      }, { always: true });
    }
  },
};
