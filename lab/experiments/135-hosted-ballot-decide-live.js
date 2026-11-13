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
import { verifyDecision } from '../../src/browser/midge-verify.js';

const toN = (x) => near(String(x));

export default {
  id: 'E-HOSTED-BALLOT-DECIDE-LIVE-01',
  title: 'A decision-only vote on the real hardware room: three members vote with no money in play, a wrong-key vote is refused, the room signs the decision, a browser check verifies it against the attested key, and the round can never be settled',
  tier: 'hardware',
  requires: ['phala-key', 'near-key', 'network', 'docker'],
  hypothesis: 'Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. A vote with an explicit null share moves no money; the room signs a decision that the browser verifier accepts against the settlement key the hardware attested; asking the room to settle that round is refused; and nothing moves on chain.',
  limits: [
    'One operator controls every account and the VM. This is the system working on real hardware, not independent parties.',
    'The decision is signed by the room and is not recorded on chain: the contract cannot record a result with no payment. Anyone can check the signature against the room\'s attested key, but the chain does not show the decision.',
    'The room sees every vote; this hides votes from the other members and the public, not from the room.',
    'The VM exists for the length of the session and is deleted; no hosted room is running.',
  ],
  async run(ctx) {
    const chain = await connect(ctx.rootDir);
    const coord = chain.sub('c');
    const expected = JSON.parse(fs.readFileSync(path.join(ctx.rootDir, 'roost.expected.json'), 'utf8'));
    const ourCompose = fs.readFileSync(path.join(ctx.rootDir, 'deploy/roost/docker-compose.yml'), 'utf8');
    let vm = null; let verifier = null; let attested = null; let P = null; let countBefore = null;
    const created = [];
    const tag = Date.now().toString(36);
    const id = `hbd-${tag}`;
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
      const VOTERS = ['ma', 'mb', 'mc'];
      const send = (who, round, body) => {
        const kp = P[who].key.keyPair;
        const cipherTextHex = sealToModel(JSON.stringify(body), session.intentPublicKey);
        return member.submitSignedIntent({ flyerId: P[who].id, cipherTextHex, publicKey: kp.getPublicKey().toString(), signature: signInputWithNearKey(kp.toString(), inputMessage({ ...round, flyerId: P[who].id, seq: 1, cipherTextHex })), seq: 1 });
      };

      await ctx.step('set up: three members and a group whose room key is the ATTESTED settlement key; nobody deposits', async (s) => {
        s.assert('the settlement key the contract will trust equals the attested one', session.settlePublicKey === attested.settlePublicKey);
        countBefore = Number(await chain.view('get_syndicate_count', {}));
        const made = await createMembers(chain, { rootDir: ctx.rootDir, tag: `bd${tag.slice(-5)}`, count: VOTERS.length, fundNear: '0.1', names: VOTERS });
        P = Object.fromEntries(VOTERS.map((k, i) => [k, made[i]])); P.all = made;
        created.push(id);
        const pol = { allowed_recipients: [P.ma.id], max_release_bps_per_epoch: 10000, settle_deadline_block: 500000000 };
        const h = await chain.send(coord.account, 'hatch', { syndicate_id: id, syndicate_type: 'FLASH', quorum_threshold: 1, max_spend_near: 1, enclave_public_key: session.settlePublicKey, expected_code_hash: crypto.randomBytes(32).toString('hex'), timeout_blocks: 12, payout_recipient: P.ma.id, release_policy: pol }, { deposit: near('0.01'), gas: 40000000000000n, label: `hatch ${id}` });
        s.assert('the group was hatched', h.ok, { actual: h.error });
        await chain.waitFor(() => state(), { what: 'group' });
      }, { critical: true });

      await ctx.step('prediction 1 to 4: votes are signed, a wrong-key vote is refused, the room signs a decision, the browser verifies it, and the round cannot be settled', async (s) => {
        const round = await roundOf(); await coordinator.openRound(round);
        const before = await state();
        const stranger = nearKeyPair();
        const cipher = sealToModel(JSON.stringify({ choice: 'A' }), session.intentPublicKey);
        const bad = await member.submitSignedIntent({ flyerId: P.ma.id, cipherTextHex: cipher, publicKey: stranger.publicKey, signature: signInputWithNearKey(stranger.secretKey, inputMessage({ ...round, flyerId: P.ma.id, seq: 1, cipherTextHex: cipher })), seq: 1 }).then(() => 'accepted', (e) => e.message);
        s.assert('a vote signed with a key that is not the member\'s is refused', bad !== 'accepted', { actual: bad });
        for (const [k, c] of [['ma', 'A'], ['mb', 'A'], ['mc', 'B']]) await send(k, round, { choice: c });
        const res = await coordinator.runBallot({ options: { A: 'optiona.testnet', B: 'optionb.testnet' }, roll: VOTERS.map((k) => P[k].id), share: null, roundId: `bd-${tag}` });
        s.evidence('outcome', res.outcome); s.evidence('decision', res.decision);
        s.assert('the room reports a decision for A and no payout: no allocations, charges or order hash', res.outcome.decided === true && res.outcome.winner === 'A' && res.outcome.payout === false && res.allocations.length === 0 && res.charges.length === 0 && res.orderHash === null, { actual: res.outcome });
        const v = verifyDecision({ message: res.decision.message, signatureHex: res.decision.signature, settlePublicKeyHex: attested.settlePublicKey });
        s.assert('the browser verifier accepts the decision against the settlement key the hardware attested, and reads back the winner, group and round', v.ok && v.fields.winner === 'A' && v.fields.syndicateId === id && v.fields.roundNonce === round.roundNonce, { actual: v });
        s.assert('a changed winner does not verify', !verifyDecision({ message: res.decision.message.replace(':A:', ':B:'), signatureHex: res.decision.signature, settlePublicKeyHex: attested.settlePublicKey }).ok);
        const refused = await coordinator.signSettlement({ ...round, allocations: [{ recipient: 'optiona.testnet', amount: '1' }], orderHash: 'ab'.repeat(32) }).then(() => 'signed', (e) => e.message);
        s.assert('asking the room to settle that round is refused', /no aggregate/.test(refused), { actual: refused });
        const reopen = await coordinator.openRound(round).then(() => 'opened', (e) => e.message);
        s.assert('the round cannot be opened again to decide twice', /already signed/.test(reopen), { actual: reopen });
        const after = await state();
        s.assert('nothing moved on chain: the group\'s escrow is 0, and its epoch and round nonce are unchanged', BigInt(after.total_escrow) === 0n && after.epoch === before.epoch && after.round_nonce === before.round_nonce, { actual: { before, after } });
      });
    } finally {
      await ctx.step('prediction 5: teardown of the chain side (members exit with their remainders, group pruned, accounts deleted)', async (st) => {
        if (!P) { st.assert('nothing to tear down', true); return; }
        const rep = await teardownMembers(chain, { rootDir: ctx.rootDir, members: P.all, pruneIds: created, exitWaitMs: 180000 });
        st.observe('teardown', { pruned: rep.pruned.length, notPruned: rep.notPruned, deleted: rep.deleted.length, kept: rep.kept, failed: rep.failed });
        st.assert('the group was pruned and every account deleted', rep.notPruned.length === 0 && rep.failed.length === 0 && rep.deleted.length === 3, { actual: rep });
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
