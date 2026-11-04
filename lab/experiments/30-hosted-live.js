import fs from 'node:fs';
import path from 'node:path';
import { connect, fmt, near } from '../lib/near.js';
import { createMembers, teardownMembers, accountExists } from '../lib/members.js';
import { deployRoost, listCvms, startVerifier, HOURLY_USD } from '../lib/phala.js';
import { chainRoundFlow } from '../flows/chain-round.js';
import { HostedRoostClient } from '../../src/roost-service/client.js';
import { verifyHostedAttestation } from '../../src/roost-service/verify-hosted.js';
import { expectedComposeHashes } from '../../src/roost-service/compose-hash.js';
import crypto from 'node:crypto';

export default {
  id: 'E-HOSTED-LIVE-01',
  title: 'The hosted Roost on a real Phala TDX VM runs a full syndicate round on NEAR testnet',
  tier: 'hardware',
  requires: ['phala-key', 'near-key', 'network', 'docker'],
  hypothesis: 'A member who verifies the Roost\'s attestation on a real Intel TDX VM (official verifier, keys bound to a fresh nonce, compose hash derived from our own file) can seal bids to it; the VM aggregates them exactly and signs a settlement that the NEAR contract accepts only for what the sealed bids support. The VM\'s attested compose hash becomes the syndicate\'s on-chain expected code hash. Every attack that failed against a local Roost fails the same way, and the VM is deleted at the end.',
  limits: [
    'One operator controls all members, the coordinator, the recipient and the VM account. This shows the system working end to end on real hardware, not independent parties.',
    'The attestation proves the VM runs the pinned compose and image; it does not audit the code inside the image, and it is only as strong as Intel TDX and Phala\'s platform.',
    'The VM exists for a few minutes. Nothing here shows a VM kept up for days or a failure of the VM mid-round.',
    'The coordinator key is generated for this session and held by this process; the model is a coordinator with a key, not a decentralised one.',
    'Testnet only; the contract has not been audited by a third party.',
  ],
  async run(ctx) {
    const chain = await connect(ctx.rootDir);
    const expected = JSON.parse(fs.readFileSync(path.join(ctx.rootDir, 'roost.expected.json'), 'utf8'));
    let vm = null; let verifier = null; let verification = null; let attested = null;
    const ourCompose = fs.readFileSync(path.join(ctx.rootDir, 'deploy/roost/docker-compose.yml'), 'utf8');

    await ctx.step('preflight: the Phala account is empty and the pins are present', async (s) => {
      const existing = await listCvms(ctx.rootDir);
      s.assert('no CVM is already running on the account (so nothing is billing unseen)', existing.length === 0, { actual: existing.map((x) => x.name) });
      s.assert('the compose file is pinned to a CI-built image digest', /ghcr\.io\/etvjay\/midge-roost@sha256:[0-9a-f]{64}/.test(ourCompose));
      s.assert('a production OS image hash is pinned', (expected.osImageHashes || []).length > 0);
      s.observe('instance type and rate', { type: 'tdx.small', usdPerHour: HOURLY_USD });
    }, { critical: true });

    try {
      await ctx.step('deploy the Roost on a real TDX VM (capped by a dead-man\'s switch)', async (s) => {
        vm = await deployRoost({ rootDir: ctx.rootDir, hours: 1, log: (m) => s.note(m) });
        s.evidence('cvm', { id: vm.id, url: vm.url, deadmanHours: vm.deadmanHours });
        s.assert('the VM answered /healthz', true);
        const ac = vm.cvm.compose_file || {};
        s.assert('the VM was created with public logs off', ac.public_logs === false, { actual: ac.public_logs });
        s.assert('it runs a production (non-dev) OS image', vm.cvm.os?.is_dev === false, { actual: vm.cvm.os?.is_dev });
        s.assert('it runs the pinned production OS image hash', (expected.osImageHashes || []).includes(vm.cvm.os?.os_image_hash), { actual: vm.cvm.os?.os_image_hash });
      }, { critical: true });

      await ctx.step('verify the attestation exactly as a member would', async (s) => {
        verifier = await startVerifier();
        s.observe('verifier image', verifier.image);
        const derived = expectedComposeHashes({ cvmJson: vm.cvm, ourCompose });
        s.assert('Phala\'s app-compose contains our compose file byte for byte', derived.ok && derived.matchesOurCompose);
        const nonce = crypto.randomBytes(32).toString('hex');
        const bundle = await (await fetch(`${vm.url}/attestation?nonce=${nonce}`)).json();
        s.observe('attestation', { bytes: bundle.attestation.length / 2, simulated: bundle.simulated });
        attested = bundle;
        verification = await verifyHostedAttestation(bundle, { nonce, verifierUrl: verifier.url, composeHash: derived.candidates, osImageHashes: expected.osImageHashes });
        for (const c of verification.checks) s.assert(c.name, c.ok, { actual: c.detail });
        s.assert('the VM does not claim to be a simulator', bundle.simulated === false);
        ctx.recorder.event('evidence', { exp: ctx.id, step: 'verify the attestation exactly as a member would', kind: 'attestation', composeHash: verification.details?.composeHash, osImageHash: verification.details?.osImageHash, nonce, bundle: ctx.recorder.blob(bundle, 'attestation bundle') });
      }, { critical: true });

      await ctx.step('the Roost\'s access control holds on the public internet', async (s) => {
        const post = async (p) => (await fetch(`${vm.url}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status;
        s.assert('/aggregate without the coordinator key is refused (401)', (await post('/aggregate')) === 401);
        s.assert('/settle without the coordinator key is refused (401)', (await post('/settle')) === 401);
        for (const p of ['/debug', '/env', '/state', '/logs']) s.assert(`${p} does not exist`, (await fetch(`${vm.url}${p}`)).status === 404);
      });

      const member = new HostedRoostClient({ baseUrl: vm.url });
      const coordinator = new HostedRoostClient({ baseUrl: vm.url, adminKey: vm.adminKey });
      const session = await member.getSession();
      await ctx.step('the keys a member would seal to are the attested keys', async (s) => {
        s.assert('the intent key a member would seal to equals the attested intent key', session.intentPublicKey === attested.intentPublicKey, { expected: attested.intentPublicKey, actual: session.intentPublicKey });
        s.assert('the settlement key the contract will trust equals the attested settlement key', session.settlePublicKey === attested.settlePublicKey, { expected: attested.settlePublicKey, actual: session.settlePublicKey });
        s.assert('the session says it is not simulated', session.simulated === false);
      });
      const tag = Date.now().toString(36);
      let members = null; let flow = null; let countBefore = null;
      try {
        await ctx.step('create fresh member accounts for this run (three flyers and a recipient)', async (st) => {
          countBefore = Number(await chain.view('get_syndicate_count', {}));
          const made = await createMembers(chain, { rootDir: ctx.rootDir, tag: `h${tag.slice(-5)}`, count: 4, fundNear: '0.15', names: ['a', 'b', 'c', 'r'] });
          members = { flyers: made.slice(0, 3), recipient: made[3] };
          st.assert('four accounts exist and are funded', (await Promise.all(made.map((m) => accountExists(chain, m.id)))).every(Boolean));
        }, { critical: true });
        flow = await chainRoundFlow(ctx, { chain, roost: { member, coordinator, session }, expectedCodeHash: derivedHash(verification), runTag: `hw${tag}`, members });
      } finally {
        await ctx.step('teardown of the chain side: prune the syndicates, compact the indexes, delete the accounts', async (st) => {
          if (!members) { st.assert('nothing to tear down', true); return; }
          const rep = await teardownMembers(chain, { rootDir: ctx.rootDir, members: [...members.flyers, members.recipient], pruneIds: flow?.syndicates || [] });
          st.assert('every syndicate was pruned and every account deleted', rep.notPruned.length === 0 && rep.failed.length === 0 && rep.deleted.length === 4, { actual: rep });
          st.assert('the contract holds exactly as many records as before the run', Number(await chain.view('get_syndicate_count', {})) === countBefore, { expected: countBefore });
        }, { always: true });
      }
    } finally {
      await ctx.step('teardown: delete the VM and prove the account is empty', async (s) => {
        if (verifier) await verifier.stop();
        const result = vm ? await vm.teardown() : { deleted: true, note: 'no VM was created' };
        s.observe('teardown', result);
        s.assert('the VM was deleted', result.deleted === true, { actual: result });
        let left = [];
        for (let i = 0; i < 12; i += 1) { left = (await listCvms(ctx.rootDir)).filter((x) => !/delet/i.test(String(x.status))); if (!left.length) break; await new Promise((r) => setTimeout(r, 5000)); }
        s.assert('no CVM is left running on the account', left.length === 0, { actual: left.map((x) => `${x.name}:${x.status}`) });
        if (result.estimatedUsd !== undefined) { s.observe('estimated cost (USD)', result.estimatedUsd); s.assert('the session cost under $0.05', result.estimatedUsd < 0.05, { actual: result.estimatedUsd }); }
      }, { always: true });
    }
  },
};

function derivedHash(v) { return v?.details?.composeHash || null; }
