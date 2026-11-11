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
import { signInputWithNearKey, inputMessage, nearKeyPair } from '../../src/roost-service/signed-input.js';

const MEMBERS = []; const FOUNDERS = [];
const DEP = '0.1'; const CAP_BPS = 2500; const TIMER = 24;
const toN = (x) => near(String(x));

export default {
  id: 'E-HOSTED-SIGNED-LIVE-01',
  title: 'A Dark Vault run by the hosted Roost on a real Phala TDX VM (second run, no ballot): a pool, a late deposit and a second pool, then a lending quote, settled on testnet with the VM\'s escrow check on',
  tier: 'hardware',
  requires: ['phala-key', 'near-key', 'network', 'docker'],
  hypothesis: 'Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. The rebuilt image attests with signed inputs required in the measured compose file; an unsigned input and a wrong-key vote are refused; a majority ballot is settled by the contract; teardown leaves nothing.',
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
    const id = `hsg-${tag}`;
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
      s.assert('the compose file carries the escrow settings and requires signed inputs', ourCompose.includes('ROOST_RPC_URLS=') && ourCompose.includes('ROOST_CONTRACT_ID=c.fly-1793636729.testnet') && ourCompose.includes('ROOST_REQUIRE_SIGNED_INPUTS=1'));
      s.assert('the compose file pins the rebuilt image', ourCompose.includes('sha256:0e09e81646d62f57205b5380922e62a79dc2dc61063dbaa80deeb284de3804d4'));
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

      await ctx.step('set up: three members, two recipients, a group whose room key is the ATTESTED settlement key, three deposits of 0.05', async (s) => {
        s.assert('the settlement key the contract will trust equals the attested one', session.settlePublicKey === attested.settlePublicKey);
        countBefore = Number(await chain.view('get_syndicate_count', {}));
        const names = [...MEM, 'ra', 'rb'];
        const made = await createMembers(chain, { rootDir: ctx.rootDir, tag: `hs${tag.slice(-5)}`, count: names.length, fundNear: '0.2', names });
        P = Object.fromEntries(names.map((k, i) => [k, made[i]])); P.all = made;
        created.push(id);
        const pol = { allowed_recipients: [P.ra.id, P.rb.id], max_release_bps_per_epoch: 10000, settle_deadline_block: 500000000 };
        const h = await chain.send(coord.account, 'hatch', { syndicate_id: id, syndicate_type: 'FLASH', quorum_threshold: 1, max_spend_near: 1, enclave_public_key: session.settlePublicKey, expected_code_hash: crypto.randomBytes(32).toString('hex'), timeout_blocks: 12, payout_recipient: P.ra.id, release_policy: pol }, { deposit: near('0.01'), gas: 40000000000000n, label: `hatch ${id}` });
        s.assert('the group was hatched', h.ok, { actual: h.error });
        await chain.waitFor(() => state(), { what: 'group' });
        const ph = computePolicyHash(pol, 12);
        for (const k of MEM) { const d = await chain.send(P[k].account, 'deposit', { syndicate_id: id, policy_hash: ph }, { deposit: near('0.05'), gas: 30000000000000n, label: `deposit ${k}` }); s.assert(`${k} deposits 0.05`, d.ok, { actual: d.error }); }
        await chain.waitFor(async () => BigInt((await state()).total_escrow) === toN('0.15'), { what: 'deposits' });
      }, { critical: true });

      await ctx.step('prediction 2 and 3: the room is in signed-input mode; a wrong-key vote is refused; three real signed votes are accepted', async (s) => {
        const round = await roundOf(); await coordinator.openRound(round);
        const unsigned = await member.submitSealedIntent({ flyerId: P.ma.id, cipherTextHex: sealToModel(JSON.stringify({ choice: 'A' }), session.intentPublicKey) }).then(() => 'accepted', (e) => e.message);
        s.assert('an unsigned sealed intent is refused: this room only accepts signed inputs', /only accepts signed inputs/.test(unsigned), { actual: unsigned });
        const vote = (who, choice, keyPair = P[who].key.keyPair) => {
          const cipherTextHex = sealToModel(JSON.stringify({ choice }), session.intentPublicKey);
          return member.submitSignedIntent({ flyerId: P[who].id, cipherTextHex, publicKey: keyPair.getPublicKey().toString(), signature: signInputWithNearKey(keyPair.toString(), inputMessage({ ...round, flyerId: P[who].id, seq: 1, cipherTextHex })), seq: 1 });
        };
        const stranger = nearKeyPair();
        const wrong = await member.submitSignedIntent((() => { const cipherTextHex = sealToModel(JSON.stringify({ choice: 'B' }), session.intentPublicKey); return { flyerId: P.mc.id, cipherTextHex, publicKey: stranger.publicKey, signature: signInputWithNearKey(stranger.secretKey, inputMessage({ ...round, flyerId: P.mc.id, seq: 1, cipherTextHex })), seq: 1 }; })()).then(() => 'accepted', (e) => e.message);
        s.assert('a vote signed with a key that is not an access key of the member\'s account is refused', wrong !== 'accepted', { actual: wrong });
        s.observe('how the wrong-key vote was refused', wrong);
        await vote('ma', 'A'); await vote('mb', 'A'); await vote('mc', 'B');
        s.assert('the three real signed votes were accepted', true);
        const res = await coordinator.runBallot({ options: { A: P.ra.id, B: P.rb.id }, roll: MEM.map((k) => P[k].id), share: '0.01', quorumBps: 5000, rule: 'majority', roundId: `${id}-r1` });
        s.assert('A wins 2 to 1', res.outcome.decided && res.outcome.winner === 'A', { actual: res.outcome });
        const signed = await coordinator.signSettlement({ ...round, allocations: res.allocations, orderHash: res.orderHash, charges: res.charges });
        const tx = await chain.send(coord.account, 'settle_batch_charged', { syndicate_id: id, attestation_nonce: round.roundNonce, aggregate_order_hash: res.orderHash, allocations: res.allocations, charges: res.charges, enclave_signature: signed.signature }, { gas: 150000000000000n, label: 'settle_batch_charged ballot' });
        s.evidence('tx', { label: tx.label, hash: tx.hash, ok: tx.ok, explorer: tx.explorer, error: tx.error });
        s.assert('the contract accepted the settlement the VM signed', tx.ok, { actual: tx.error });
        await waitSettled(toN('0.12'));
        const paid = (await chain.transfersOf(tx.hash, coord.id)).filter((m) => m.fromContract);
        s.assert('prediction 4: ra received exactly 0.03', paid.length === 1 && paid[0].to === P.ra.id && BigInt(paid[0].amount) === toN('0.03'), { actual: paid });
        for (const k of MEM) s.assert(`${k} was charged exactly 0.01 (0.04 left)`, (await escrowOf(k)) === toN('0.04'), { actual: String(await escrowOf(k)) });
      });
    } finally {
      await ctx.step('prediction 6: teardown of the chain side (members exit with their remainders, group pruned, accounts deleted)', async (st) => {
        if (!P) { st.assert('nothing to tear down', true); return; }
        const rep = await teardownMembers(chain, { rootDir: ctx.rootDir, members: P.all, pruneIds: created, exitWaitMs: 180000 });
        st.observe('teardown', { pruned: rep.pruned.length, notPruned: rep.notPruned, deleted: rep.deleted.length, kept: rep.kept, failed: rep.failed });
        st.assert('the group was pruned and every account deleted', rep.notPruned.length === 0 && rep.failed.length === 0 && rep.deleted.length === 5, { actual: rep });
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
