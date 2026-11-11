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

const VARIANT = 'deploy/roost/docker-compose.acctfail.yml';

export default {
  id: 'E-HOSTED-ACCTCHECK-FAIL-LIVE-01',
  title: 'One account-check provider down on the real hardware room: every signed bid is refused as unverifiable, nothing is queued, the room stays up',
  tier: 'hardware',
  requires: ['phala-key', 'near-key', 'network', 'docker'],
  hypothesis: 'Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. With one of two account-check providers unresolvable, a correctly signed bid is refused as not checkable, retries give the same answer, the room stays up, and nothing is queued so no round can be run.',
  limits: [
    'The failing provider is on the reserved .invalid domain, so this shows one provider that cannot be reached; one that answers "no" while the other answers "yes" is covered by unit tests only.',
    'It does not show recovery when the provider returns: the providers are fixed in the VM\'s measured compose file, so recovery needs a second VM.',
    'The compose file is a test fixture that differs from the real one in one line; it is attested here but is not a deployment members should trust.',
    'One operator controls the VM and the throwaway account (0.1 NEAR, deleted).',
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
      const kc = (variant.match(/ROOST_ACCOUNT_CHECK_RPC_URLS=(.*)/) || [])[1] || '';
      const parts = kc.split(',');
      s.assert('its account-check providers are two different ones, exactly one of which is on the reserved .invalid domain', parts.length === 2 && new Set(parts).size === 2 && parts.filter((u) => /\.invalid/.test(u)).length === 1, { actual: kc });
      s.assert('its escrow providers are the real ones', !/ROOST_RPC_URLS=[^\n]*\.invalid/.test(variant));
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

      await ctx.step('prediction 2 to 4: a correctly signed bid is refused as not checkable, retries agree, the room stays up and nothing is queued', async (s) => {
        await coordinator.openRound(round);
        const attempt = () => bid({ amount: '0.01', salt: crypto.randomBytes(16).toString('hex') }, { pub: A.key.keyPair.getPublicKey().toString(), secret: A.key.keyPair.toString() }).then(() => 'accepted', (e) => e.message);
        const first = await attempt();
        s.observe('how the signed bid was refused', first);
        s.assert('prediction 2: the correctly signed bid was refused, not accepted', first !== 'accepted', { actual: first });
        s.assert('and the refusal says the key could not be checked', /could not check/i.test(first), { actual: first });
        const second = await attempt(); const third = await attempt();
        s.assert('prediction 3: retries give the same answer', second !== 'accepted' && third !== 'accepted' && /could not check/i.test(second) && /could not check/i.test(third), { actual: [second, third] });
        const health = await fetch(`${vm.url}/healthz`).then((r) => r.status, () => 0);
        const sess = await fetch(`${vm.url}/session`).then((r) => r.status, () => 0);
        s.assert('the room is still up: /healthz and /session answer 200', health === 200 && sess === 200, { actual: [health, sess] });
        const digests = await coordinator.inputDigests();
        s.assert('prediction 4: nothing was queued', Object.keys(digests).length === 0, { actual: digests });
        const res = await fetch(`${vm.url}/pool`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-roost-admin-key': vm.adminKey }, body: JSON.stringify({ recipient: 'r.near', min: '0' }) });
        const body = await res.json().catch(() => ({}));
        s.assert('so a charged round is refused and not run (the reason given is the escrow read: this test group does not exist on chain, and that read comes before the empty-queue check)', res.status >= 400 && !body.allocations, { actual: [res.status, body.error] });
        let signError = null; try { await coordinator.signSettlement({ ...round, allocations: [{ recipient: 'r.near', amount: '1000' }], orderHash: 'f'.repeat(64) }); } catch (e) { signError = e.message; }
        s.assert('and nothing can be signed, because no round was run', signError !== null && /answered 400/.test(signError), { actual: signError });
        s.observe('the pool call', { status: res.status, error: body.error });
      });
    } finally {
      await ctx.step('teardown: delete the throwaway account', async (s) => {
        if (!A) { s.assert('nothing to tear down', true); return; }
        const rep = await teardownMembers(chain, { rootDir: ctx.rootDir, members: [A], pruneIds: [], exitWaitMs: 1000 });
        s.assert('the account was deleted', rep.failed.length === 0 && rep.deleted.length === 1, { actual: rep });
      }, { always: true });
      await ctx.step('prediction 6: teardown: delete the VM and prove the account is empty', async (s) => {
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
