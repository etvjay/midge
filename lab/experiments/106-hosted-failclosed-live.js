import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { connect } from '../lib/near.js';
import { createMembers, teardownMembers } from '../lib/members.js';
import { deployRoost, listCvms, startVerifier, HOURLY_USD } from '../lib/phala.js';
import { HostedRoostClient } from '../../src/roost-service/client.js';
import { verifyHostedAttestation } from '../../src/roost-service/verify-hosted.js';
import { expectedComposeHashes } from '../../src/roost-service/compose-hash.js';
import { sealToModel } from '../../src/enclave/e2ee.js';
import { signInputWithNearKey, inputMessage, nearKeyPair } from '../../src/roost-service/signed-input.js';

const VARIANT = 'deploy/roost/docker-compose.failclosed.yml';

export default {
  id: 'E-HOSTED-FAILCLOSED-LIVE-01',
  title: 'The hosted Roost fails closed on real TDX hardware: with both escrow providers unreachable it refuses a charged round (503), keeps the bid and signs nothing',
  tier: 'hardware',
  requires: ['phala-key', 'near-key', 'network', 'docker'],
  hypothesis: 'Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. Inside a real confidential VM whose two providers can never resolve, a charged round is refused with 503 in bounded time, the sealed bid is still there afterwards, nothing can be signed, and retrying gives the same answer.',
  limits: [
    'The first promoted run of this experiment (older build) sent an unsigned bid. On the signed-only compose that fails (run 20261111T094151Z-c01e, GAP-050); this version sends a signed bid from a throwaway account.',
    'The providers are on the reserved .invalid domain, so this shows a total outage, not a partial one (partial failure is covered offline).',
    'It does not show recovery: the providers are fixed in the VM\'s measured compose file, so recovery needs a second VM.',
    'The compose file is a test fixture that differs from the real one only in the two escrow provider URLs; it is attested here but is not a deployment members should trust.',
    'The account-check providers failing is covered by unit tests, not here. One operator controls the VM and the throwaway account (0.1 NEAR, deleted).',
  ],
  async run(ctx) {
    const variant = fs.readFileSync(path.join(ctx.rootDir, VARIANT), 'utf8');
    const expected = JSON.parse(fs.readFileSync(path.join(ctx.rootDir, 'roost.expected.json'), 'utf8'));
    const chain = await connect(ctx.rootDir);
    let vm = null; let verifier = null; let A = null;

    await ctx.step('preflight: the Phala account is empty and the fixture is the pinned image with unresolvable providers', async (s) => {
      const existing = await listCvms(ctx.rootDir);
      s.assert('no CVM is already running on the account', existing.length === 0, { actual: existing.map((x) => x.cvmName) });
      s.assert('the fixture pins a CI-built image digest', /ghcr\.io\/etvjay\/midge-roost@sha256:[0-9a-f]{64}/.test(variant));
      s.assert('its escrow providers are on the reserved .invalid domain', /ROOST_RPC_URLS=https:\/\/provider-a\.invalid,https:\/\/provider-b\.invalid/.test(variant));
      const kc = (variant.match(/ROOST_ACCOUNT_CHECK_RPC_URLS=(.*)/) || [])[1] || '';
      s.assert('prediction 8: its account-check providers are two different, reachable ones', kc.split(',').length === 2 && new Set(kc.split(',')).size === 2 && !/\.invalid/.test(kc), { actual: kc });
      s.observe('instance type and rate', { type: 'tdx.small', usdPerHour: HOURLY_USD });
    }, { critical: true });

    try {
      await ctx.step('deploy the fixture on a real TDX VM (capped by a dead-man\'s switch)', async (s) => {
        vm = await deployRoost({ rootDir: ctx.rootDir, hours: 1, composePath: VARIANT, log: (m) => s.note(m) });
        s.evidence('cvm', { id: vm.id, url: vm.url, deadmanHours: vm.deadmanHours });
        s.assert('the VM answered /healthz', true);
        s.assert('it runs a production (non-dev) OS image with the pinned hash', vm.cvm.os?.is_dev === false && (expected.osImageHashes || []).includes(vm.cvm.os?.os_image_hash), { actual: vm.cvm.os?.os_image_hash });
      }, { critical: true });

      let attested;
      await ctx.step('prediction 1: the VM attests, and the attestation covers the unreachable settings', async (s) => {
        verifier = await startVerifier();
        const derived = expectedComposeHashes({ cvmJson: vm.cvm, ourCompose: variant });
        s.assert('Phala\'s app-compose equals the fixture byte for byte', derived.ok && derived.matchesOurCompose);
        const nonce = crypto.randomBytes(32).toString('hex');
        attested = await (await fetch(`${vm.url}/attestation?nonce=${nonce}`)).json();
        const v = await verifyHostedAttestation(attested, { nonce, verifierUrl: verifier.url, composeHash: derived.candidates, osImageHashes: expected.osImageHashes });
        for (const c of v.checks) s.assert(c.name, c.ok, { actual: c.detail });
        s.assert('the VM does not claim to be a simulator', attested.simulated === false);
        s.evidence('attestation', { composeHash: v.details?.composeHash, osImageHash: v.details?.osImageHash });
      }, { critical: true });

      const member = new HostedRoostClient({ baseUrl: vm.url });
      const coordinator = new HostedRoostClient({ baseUrl: vm.url, adminKey: vm.adminKey });
      const session = await member.getSession();
      const round = { contractId: chain.coordinatorId, syndicateId: 'failclosed', epoch: 1, roundNonce: 'ab'.repeat(32) };
      A = (await createMembers(chain, { rootDir: ctx.rootDir, tag: `fc${Date.now().toString(36).slice(-5)}`, count: 1, fundNear: '0.1', names: ['a'] }))[0];
      const bid = (body, keys) => { const cipherTextHex = sealToModel(JSON.stringify(body), session.intentPublicKey); return member.submitSignedIntent({ flyerId: A.id, cipherTextHex, publicKey: keys.pub, signature: signInputWithNearKey(keys.secret, inputMessage({ ...round, flyerId: A.id, seq: 1, cipherTextHex })), seq: 1 }); };
      const callPool = async () => {
        const t0 = Date.now();
        const res = await fetch(`${vm.url}/pool`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-roost-admin-key': vm.adminKey }, body: JSON.stringify({ recipient: 'r.near', min: '0' }) });
        return { status: res.status, ms: Date.now() - t0, body: await res.json().catch(() => ({})) };
      };

      let before;
      await ctx.step('prediction 2 to 4: a charged round is refused with 503 in bounded time, the bid survives, nothing can be signed, and a retry gives the same answer', async (s) => {
        await coordinator.openRound(round);
        const stranger = nearKeyPair();
        const wrong = await bid({ amount: '0.01' }, { pub: stranger.publicKey, secret: stranger.secretKey }).then(() => 'accepted', (e) => e.message);
        s.assert('prediction 7: a bid signed with a key that is not the account\'s is refused by the key check', wrong !== 'accepted', { actual: wrong });
        const accepted = await bid({ amount: '0.01', salt: crypto.randomBytes(16).toString('hex') }, { pub: A.key.keyPair.getPublicKey().toString(), secret: A.key.keyPair.toString() }).then(() => 'accepted', (e) => e.message); // a salt makes the digest a real hash
        s.assert('prediction 6: the signed bid is accepted although both escrow providers are unreachable, because key checks use their own providers', accepted === 'accepted', { actual: accepted });
        before = JSON.stringify(await coordinator.inputDigests());
        s.assert('the digest of the bid is a real hash, so comparing it later means something', /^[0-9a-f]{64}$/.test(Object.values(JSON.parse(before))[0] ?? ''), { actual: before });
        const first = await callPool();
        s.observe('first refusal', { status: first.status, ms: first.ms, error: first.body.error });
        s.assert('the charged round is refused with 503', first.status === 503, { actual: first });
        s.assert('the reason is that escrow could not be read', /could not read escrow/.test(first.body.error || ''), { actual: first.body.error });
        s.assert('in bounded time (under 45 s)', first.ms < 45000, { actual: first.ms });
        const second = await callPool();
        s.assert('a retry gives the same answer', second.status === 503 && /could not read escrow/.test(second.body.error || ''), { actual: second });
        const after = JSON.stringify(await coordinator.inputDigests());
        s.assert('the sealed bid is still there, unchanged', after === before && Object.keys(JSON.parse(after)).length === 1, { before, after });
        let signError = null;
        try { await coordinator.signSettlement({ ...round, allocations: [{ recipient: 'r.near', amount: '1000' }], orderHash: 'f'.repeat(64) }); } catch (e) { signError = e.message; }
        s.assert('nothing can be signed, because no round was run', signError !== null && /answered 400/.test(signError), { actual: signError });
      });
    } finally {
      await ctx.step('teardown: delete the throwaway account', async (s) => {
        if (!A) { s.assert('nothing to tear down', true); return; }
        const rep = await teardownMembers(chain, { rootDir: ctx.rootDir, members: [A], pruneIds: [], exitWaitMs: 1000 });
        s.assert('the account was deleted', rep.failed.length === 0 && rep.deleted.length === 1, { actual: rep });
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
