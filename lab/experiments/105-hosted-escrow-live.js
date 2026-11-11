import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { connect, near, computePolicyHash } from '../lib/near.js';
import { createMembers, teardownMembers, accountExists } from '../lib/members.js';
import { deployRoost, listCvms, startVerifier, HOURLY_USD } from '../lib/phala.js';
import { HostedRoostClient } from '../../src/roost-service/client.js';
import { verifyHostedAttestation } from '../../src/roost-service/verify-hosted.js';
import { expectedComposeHashes } from '../../src/roost-service/compose-hash.js';
import { sealToModel } from '../../src/enclave/e2ee.js';
import { signInputWithNearKey, inputMessage } from '../../src/roost-service/signed-input.js';

const TIMER = 12; const BPS = 10000; const DEADLINE = 500000000;
const SETTINGS = ['ROOST_RPC_URLS=https://test.rpc.fastnear.com,https://near-testnet.drpc.org', 'ROOST_CONTRACT_ID=c.fly-1793636729.testnet'];

export default {
  id: 'E-HOSTED-ESCROW-LIVE-01',
  title: 'The hosted Roost with the escrow check ON, on a real Phala TDX VM: an unfunded member is left out inside the VM and the settlement lands on testnet',
  tier: 'hardware',
  requires: ['phala-key', 'near-key', 'network', 'docker'],
  hypothesis: 'Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. The compose file now carries the escrow settings, so the attestation measures them; inside the VM the Roost reads the contract\'s escrow from two providers, leaves the unfunded member out, signs, and the real contract accepts the settlement.',
  limits: [
    'One operator controls all members, the coordinator, the recipient and the VM account. This is the system working on real hardware, not independent parties.',
    'The attestation proves which image and compose the VM runs, including which providers it asks; it does not prove the providers are honest, and it does not audit the code inside the image.',
    'It does not show the VM failing closed when both providers are down, the exit race, or a two-room settlement.',
    'The VM exists for a few minutes; the coordinator key is generated for this session.',
    'Testnet only; the contract has not been audited by a third party.',
  ],
  async run(ctx) {
    const chain = await connect(ctx.rootDir);
    const coord = chain.sub('c');
    const expected = JSON.parse(fs.readFileSync(path.join(ctx.rootDir, 'roost.expected.json'), 'utf8'));
    const ourCompose = fs.readFileSync(path.join(ctx.rootDir, 'deploy/roost/docker-compose.yml'), 'utf8');
    let vm = null; let verifier = null; let verification = null; let attested = null;

    await ctx.step('preflight: the Phala account is empty, the pins are present, and the compose file carries the escrow settings', async (s) => {
      const existing = await listCvms(ctx.rootDir);
      s.assert('no CVM is already running on the account', existing.length === 0, { actual: existing.map((x) => x.cvmName) });
      s.assert('the compose file is pinned to a CI-built image digest', /ghcr\.io\/etvjay\/midge-roost@sha256:[0-9a-f]{64}/.test(ourCompose));
      for (const line of SETTINGS) s.assert(`the compose file contains ${line.split('=')[0]}`, ourCompose.includes(line), { expected: line });
      s.assert('a production OS image hash is pinned', (expected.osImageHashes || []).length > 0);
      s.observe('instance type and rate', { type: 'tdx.small', usdPerHour: HOURLY_USD });
    }, { critical: true });

    let members = null; let countBefore = null; const created = [];
    try {
      await ctx.step('deploy the Roost on a real TDX VM (capped by a dead-man\'s switch)', async (s) => {
        vm = await deployRoost({ rootDir: ctx.rootDir, hours: 1, log: (m) => s.note(m) });
        s.evidence('cvm', { id: vm.id, url: vm.url, deadmanHours: vm.deadmanHours });
        s.assert('the VM answered /healthz', true);
        s.assert('public logs are off', (vm.cvm.compose_file || {}).public_logs === false);
        s.assert('it runs a production (non-dev) OS image with the pinned hash', vm.cvm.os?.is_dev === false && (expected.osImageHashes || []).includes(vm.cvm.os?.os_image_hash), { actual: vm.cvm.os?.os_image_hash });
      }, { critical: true });

      await ctx.step('prediction 1 and 2: verify the attestation exactly as a member would, and see that it covers the escrow settings', async (s) => {
        verifier = await startVerifier();
        const derived = expectedComposeHashes({ cvmJson: vm.cvm, ourCompose });
        s.assert('Phala\'s app-compose contains our compose file byte for byte', derived.ok && derived.matchesOurCompose);
        for (const line of SETTINGS) s.assert(`the compose the VM runs (byte for byte our file) contains ${line.split('=')[0]}, so the compose hash the attestation measures covers it`, derived.matchesOurCompose && ourCompose.includes(line), { expected: line });
        const nonce = crypto.randomBytes(32).toString('hex');
        const bundle = await (await fetch(`${vm.url}/attestation?nonce=${nonce}`)).json();
        attested = bundle;
        verification = await verifyHostedAttestation(bundle, { nonce, verifierUrl: verifier.url, composeHash: derived.candidates, osImageHashes: expected.osImageHashes });
        for (const c of verification.checks) s.assert(c.name, c.ok, { actual: c.detail });
        s.assert('the VM does not claim to be a simulator', bundle.simulated === false);
        s.evidence('attestation', { composeHash: verification.details?.composeHash, osImageHash: verification.details?.osImageHash });
      }, { critical: true });

      const member = new HostedRoostClient({ baseUrl: vm.url });
      const coordinator = new HostedRoostClient({ baseUrl: vm.url, adminKey: vm.adminKey });
      const session = await member.getSession();
      const tag = Date.now().toString(36);
      const id = `he-${tag}`;
      const state = () => chain.view('get_syndicate', { syndicate_id: id });
      const escrow = async (who) => BigInt(await chain.view('get_escrow', { syndicate_id: id, account_id: who.id }));
      const policy = (r) => ({ allowed_recipients: [r.id], max_release_bps_per_epoch: BPS, settle_deadline_block: DEADLINE });

      await ctx.step('set up: three members and a recipient, and a group whose room key is the ATTESTED settlement key', async (s) => {
        s.assert('the settlement key the contract will trust equals the attested one', session.settlePublicKey === attested.settlePublicKey);
        countBefore = Number(await chain.view('get_syndicate_count', {}));
        const made = await createMembers(chain, { rootDir: ctx.rootDir, tag: `he${tag.slice(-5)}`, count: 4, fundNear: '0.15', names: ['a', 'b', 'c', 'r'] });
        members = { A: made[0], B: made[1], C: made[2], R: made[3], all: made };
        s.assert('four accounts exist and are funded', (await Promise.all(made.map((m) => accountExists(chain, m.id)))).every(Boolean));
        created.push(id);
        const hatch = await chain.send(coord.account, 'hatch', { syndicate_id: id, syndicate_type: 'FLASH', quorum_threshold: 1, max_spend_near: 1, enclave_public_key: session.settlePublicKey, expected_code_hash: crypto.randomBytes(32).toString('hex'), timeout_blocks: TIMER, payout_recipient: members.R.id, release_policy: policy(members.R) }, { deposit: near('0.01'), gas: 40000000000000n, label: `hatch ${id}` });
        s.assert('the group was hatched', hatch.ok, { actual: hatch.error });
        await chain.waitFor(() => state(), { what: 'group' });
        const ph = computePolicyHash(policy(members.R), TIMER);
        for (const who of [members.A, members.C]) {
          const d = await chain.send(who.account, 'deposit', { syndicate_id: id, policy_hash: ph }, { deposit: near('0.02'), gas: 30000000000000n, label: `deposit ${who.id}` });
          s.assert(`${who.id} deposited 0.02`, d.ok, { actual: d.error });
        }
        await chain.waitFor(async () => BigInt((await state()).total_escrow) === near('0.04'), { what: 'deposits' });
        s.assert('A and C hold 0.02 each; B holds nothing', (await escrow(members.A)) === near('0.02') && (await escrow(members.C)) === near('0.02') && (await escrow(members.B)) === 0n);
      }, { critical: true });

      await ctx.step('prediction 3 and 4: inside the VM the unfunded member is left out, the settlement lands, and the block read is reported', async (s) => {
        const st = await state();
        const round = { contractId: chain.coordinatorId, syndicateId: id, epoch: Number(st.epoch), roundNonce: st.round_nonce };
        const nonceBefore = st.round_nonce;
        await coordinator.openRound(round);
        // The pinned image requires signed inputs: each member seals the bid and signs it with their own account key for this round.
        for (const who of [members.A, members.B, members.C]) {
          const cipherTextHex = sealToModel(JSON.stringify({ amount: '0.01' }), session.intentPublicKey); const kp = who.key.keyPair;
          await member.submitSignedIntent({ flyerId: who.id, cipherTextHex, publicKey: kp.getPublicKey().toString(), signature: signInputWithNearKey(kp.toString(), inputMessage({ ...round, flyerId: who.id, seq: 1, cipherTextHex })), seq: 1 });
        }
        const recipientBefore = BigInt((await members.R.account.getBalance()).toString());
        const t0 = Date.now();
        const res = await coordinator.runPool({ recipient: members.R.id, min: '0' });
        s.observe('seconds the VM took to read the chain and run the pool', Math.round((Date.now() - t0) / 1000));
        s.assert('the VM left out B, and only B, by account', JSON.stringify(res.outcome.excludedForEscrow) === JSON.stringify([members.B.id]), { actual: res.outcome.excludedForEscrow });
        s.assert('the VM charged A and C 0.01 each', res.charges.length === 2 && res.charges.every((c) => BigInt(c.amount) === near('0.01') && [members.A.id, members.C.id].includes(c.member)), { actual: res.charges });
        s.observe('block the VM read', res.outcome.escrowBlock);
        s.assert('it read a real block', Number.isSafeInteger(res.outcome.escrowBlock?.height) && res.outcome.escrowBlock.height > 276000000 && typeof res.outcome.escrowBlock.hash === 'string');
        s.assert('raceFree is false (the exit timer ran out long ago)', res.outcome.escrowBlock.raceFree === false, { actual: res.outcome.escrowBlock });
        const signed = await coordinator.signSettlement({ ...round, allocations: res.allocations, orderHash: res.orderHash, charges: res.charges });
        const tx = await chain.send(coord.account, 'settle_batch_charged', { syndicate_id: id, attestation_nonce: round.roundNonce, aggregate_order_hash: res.orderHash, allocations: res.allocations, charges: res.charges, enclave_signature: signed.signature }, { gas: 150000000000000n, label: 'settle_batch_charged (signed inside the VM)' });
        s.evidence('settlement signed inside the VM', { ok: tx.ok, hash: tx.hash, error: tx.error, explorer: tx.explorer });
        s.assert('the contract accepted the settlement the VM signed', tx.ok, { actual: tx.error });
        await chain.waitFor(async () => { const x = await state(); return x.is_settling === false && x.round_nonce !== nonceBefore; }, { what: 'the payout follow-up', timeoutMs: 90000 });
        s.assert('A and C hold 0.01 each; B was never charged', (await escrow(members.A)) === near('0.01') && (await escrow(members.C)) === near('0.01') && (await escrow(members.B)) === 0n);
        const recipientAfter = BigInt((await members.R.account.getBalance()).toString());
        s.assert('the recipient received exactly 0.02', recipientAfter - recipientBefore === near('0.02'), { actual: String(recipientAfter - recipientBefore) });
      });
    } finally {
      await ctx.step('prediction 5: teardown of the chain side', async (st) => {
        if (!members) { st.assert('nothing to tear down', true); return; }
        const rep = await teardownMembers(chain, { rootDir: ctx.rootDir, members: members.all, pruneIds: created, exitWaitMs: 120000 });
        st.assert('the group was pruned and every account deleted', rep.notPruned.length === 0 && rep.failed.length === 0 && rep.deleted.length === 4, { actual: rep });
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
        if (result.estimatedUsd !== undefined) { s.observe('estimated cost (USD)', result.estimatedUsd); s.assert('the session cost under $0.05', result.estimatedUsd < 0.05, { actual: result.estimatedUsd }); }
      }, { always: true });
    }
  },
};
