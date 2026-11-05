import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { connect, near, computePolicyHash, loadEnvFile } from '../lib/near.js';
import { createMembers, teardownMembers } from '../lib/members.js';
import { deployRoost, listCvms, startVerifier, HOURLY_USD } from '../lib/phala.js';
import { HostedRoostClient } from '../../src/roost-service/client.js';
import { verifyHostedAttestation } from '../../src/roost-service/verify-hosted.js';
import { expectedComposeHashes } from '../../src/roost-service/compose-hash.js';
import { sealToModel } from '../../src/enclave/e2ee.js';
import { fetchVerifiedModelKey } from '../../src/enclave/attestation.js';
import { AttestedAdvisor, chooseAllocations, verifyAdviceRecord, proportionalSplit, parseMicro, microToYocto } from '../../src/advisor/attested-advisor.js';

/**
 * The architecture in one run: our Roost on a real Phala TDX VM holds the keys and does the exact arithmetic,
 * the attested NEAR AI model proposes the split, and the NEAR contract settles and enforces the policy.
 * E-HOSTED-LIVE-01 proved the VM alone; E-ADVISOR-LIVE-01 proved the advisor against a local Roost.
 */
export default {
  id: 'E-COMBINED-LIVE-01',
  title: 'NEAR AI proposes, our Roost on a real Phala TDX VM bounds and signs, the NEAR contract settles: one round',
  tier: 'hardware',
  requires: ['phala-key', 'nearai-key', 'near-key', 'network', 'docker', 'dcap-qvl'],
  hypothesis: 'Members verify the Roost\'s attestation on a real Intel TDX VM and seal their bids to it. The VM totals them exactly. Only that total goes to the attested NEAR AI model (certificate chain verified, end-to-end encrypted, signed receipt), which proposes how to split it among the policy\'s recipients. The VM signs a settlement only within the total, and the contract pays only the policy\'s recipients. The advice record verifies independently against the allocations hash the contract logged. On the same VM and contract: a proposal above the total is refused by the VM, and a signed payout to someone outside the policy is refused by the contract.',
  limits: [
    'One operator controls every account, the coordinator and the VM account. This shows the parts working together on real hardware, not independent parties.',
    'The total (not any individual bid) is revealed to NEAR AI Cloud\'s attested model. If even the total must stay private, do not use an advisor.',
    'The VM attestation proves the VM runs the pinned compose and image; it does not audit the code inside the image, and it is only as strong as Intel TDX and Phala\'s platform. The model attestation is only as strong as NEAR AI Cloud\'s TEE stack.',
    'The split task has an exact answer (3:2:1 of 0.06), so the model can be checked. Whether the model answers correctly is an observation; what is settled is asserted either way.',
    'The VM exists for a few minutes. Testnet only; the contract has not been audited by a third party.',
  ],
  async run(ctx) {
    const apiKey = loadEnvFile(ctx.rootDir).NEARAI_API_KEY || process.env.NEARAI_API_KEY;
    const chain = await connect(ctx.rootDir);
    const coord = chain.sub('c');
    const expected = JSON.parse(fs.readFileSync(path.join(ctx.rootDir, 'roost.expected.json'), 'utf8'));
    const ourCompose = fs.readFileSync(path.join(ctx.rootDir, 'deploy/roost/docker-compose.yml'), 'utf8');
    let vm = null; let verifier = null; let verification = null; let attested = null;

    await ctx.step('preflight: no VM is running, the pins are present, the contract is the expected build', async (s) => {
      const existing = await listCvms(ctx.rootDir);
      s.assert('no CVM is already running on the Phala account', existing.length === 0, { actual: existing.map((x) => x.name) });
      s.assert('the compose file is pinned to a CI-built image digest', /ghcr\.io\/etvjay\/midge-roost@sha256:[0-9a-f]{64}/.test(ourCompose));
      s.assert('a production OS image hash is pinned', (expected.osImageHashes || []).length > 0);
      s.assert('a NEAR AI key is configured', Boolean(apiKey));
      s.observe('instance type and rate', { type: 'tdx.small', usdPerHour: HOURLY_USD });
    }, { critical: true });

    try {
      await ctx.step('deploy the Roost on a real TDX VM (capped by a dead-man\'s switch)', async (s) => {
        vm = await deployRoost({ rootDir: ctx.rootDir, hours: 1, log: (m) => s.note(m) });
        s.evidence('cvm', { id: vm.id, url: vm.url, deadmanHours: vm.deadmanHours });
        const ac = vm.cvm.compose_file || {};
        s.assert('the VM was created with public logs off', ac.public_logs === false, { actual: ac.public_logs });
        s.assert('it runs a production (non-dev) OS image', vm.cvm.os?.is_dev === false, { actual: vm.cvm.os?.is_dev });
        s.assert('it runs the pinned production OS image hash', (expected.osImageHashes || []).includes(vm.cvm.os?.os_image_hash), { actual: vm.cvm.os?.os_image_hash });
      }, { critical: true });

      await ctx.step('verify the VM\'s attestation exactly as a member would', async (s) => {
        verifier = await startVerifier();
        const derived = expectedComposeHashes({ cvmJson: vm.cvm, ourCompose });
        s.assert('Phala\'s app-compose contains our compose file byte for byte', derived.ok && derived.matchesOurCompose);
        const nonce = crypto.randomBytes(32).toString('hex');
        attested = await (await fetch(`${vm.url}/attestation?nonce=${nonce}`)).json();
        verification = await verifyHostedAttestation(attested, { nonce, verifierUrl: verifier.url, composeHash: derived.candidates, osImageHashes: expected.osImageHashes });
        for (const c of verification.checks) s.assert(c.name, c.ok, { actual: c.detail });
        s.assert('the VM does not claim to be a simulator', attested.simulated === false);
        ctx.recorder.event('evidence', { exp: ctx.id, step: 'verify the VM\'s attestation exactly as a member would', kind: 'attestation', composeHash: verification.details?.composeHash, osImageHash: verification.details?.osImageHash, nonce, bundle: ctx.recorder.blob(attested, 'attestation bundle') });
      }, { critical: true });

      const member = new HostedRoostClient({ baseUrl: vm.url });
      const coordinator = new HostedRoostClient({ baseUrl: vm.url, adminKey: vm.adminKey });
      const session = await member.getSession();
      await ctx.step('the VM\'s access control holds, and its keys are the attested keys', async (s) => {
        const post = async (p) => (await fetch(`${vm.url}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status;
        s.assert('/aggregate without the coordinator key is refused (401)', (await post('/aggregate')) === 401);
        s.assert('/settle without the coordinator key is refused (401)', (await post('/settle')) === 401);
        s.assert('the intent key members seal to equals the attested intent key', session.intentPublicKey === attested.intentPublicKey);
        s.assert('the settlement key the contract will trust equals the attested settlement key', session.settlePublicKey === attested.settlePublicKey);
        s.assert('the session says it is not simulated', session.simulated === false);
      }, { critical: true });

      const tag = Date.now().toString(36);
      const created = [];
      let flyers = null; let rcpts = null; let countBefore = null;
      const policy = () => ({ allowed_recipients: rcpts.map((r) => r.id), max_release_bps_per_epoch: 10000, settle_deadline_block: 500000000 });
      const state = (id) => chain.view('get_syndicate', { syndicate_id: id });
      const hatch = (id) => { created.push(id); return chain.send(coord.account, 'hatch', { syndicate_id: id, syndicate_type: 'FLASH', quorum_threshold: 1, max_spend_near: 1, enclave_public_key: session.settlePublicKey, expected_code_hash: verification.details?.composeHash || crypto.randomBytes(32).toString('hex'), timeout_blocks: 50, payout_recipient: rcpts[0].id, release_policy: policy() }, { deposit: near('0.01'), gas: 40000000000000n, label: `hatch ${id}` }); };
      const deposit = (f, id, amt) => chain.send(f.account, 'deposit', { syndicate_id: id, policy_hash: computePolicyHash(policy()) }, { deposit: near(amt), gas: 30000000000000n, label: `deposit ${f.id} -> ${id}` });
      const sealedRound = async (members, amount, roundId) => { for (const m of members) await member.submitSealedIntent({ flyerId: m.id, cipherTextHex: sealToModel(JSON.stringify({ amount }), session.intentPublicKey) }); return coordinator.aggregate({ roundId }); };
      const signOnVm = async (id, allocations, agg) => { const st = await state(id); try { return { st, signed: await coordinator.signSettlement({ contractId: chain.coordinatorId, syndicateId: id, epoch: Number(st.epoch), roundNonce: st.round_nonce, allocations, orderHash: agg.orderHash }) }; } catch (e) { return { st, error: e.message }; } };
      const loggedAllocationsHash = async (hash) => {
        const r = await (await fetch('https://archival-rpc.testnet.fastnear.com', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'EXPERIMENTAL_tx_status', params: [hash, chain.coordinatorId] }) })).json();
        for (const o of r.result?.receipts_outcome || []) for (const l of o.outcome?.logs || []) { const m = l.match(/"event":"syndicate_settled".*?"allocations_hash":"([0-9a-f]{64})"/); if (m) return m[1]; }
        return null;
      };

      try {
        await ctx.step('set up: two flyers, three recipients, and a syndicate bound to the VM\'s attested key and compose hash', async (s) => {
          countBefore = Number(await chain.view('get_syndicate_count', {}));
          const made = await createMembers(chain, { rootDir: ctx.rootDir, tag: `k${tag.slice(-5)}`, count: 5, fundNear: '0.12', names: ['a', 'b', 'r', 's', 't'] });
          flyers = made.slice(0, 2); rcpts = made.slice(2);
          s.assert('hatch syndicate #1', (await hatch(`cmb-${tag}-1`)).ok);
          const st = await chain.waitFor(() => state(`cmb-${tag}-1`), { what: 'syndicate 1' });
          s.assert('its settlement key is the VM\'s attested key', st.enclave_public_key === session.settlePublicKey, { actual: st.enclave_public_key });
          s.assert('its expected code hash is the VM\'s attested compose hash', st.expected_code_hash === verification.details?.composeHash, { actual: st.expected_code_hash });
          for (const f of flyers) s.assert(`${f.id} deposits 0.03`, (await deposit(f, `cmb-${tag}-1`, '0.03')).ok);
          await chain.waitFor(async () => BigInt((await state(`cmb-${tag}-1`)).total_escrow) === near('0.06'), { what: 'escrow 0.06' });
        }, { critical: true });

        let agg1;
        await ctx.step('members seal bids to the VM; the VM totals them exactly, and that total is all the model is told', async (s) => {
          agg1 = await sealedRound(flyers, '0.03', `${tag}-one`);
          s.observe('aggregate from the VM', agg1.aggregateOrder);
          s.assert('the VM\'s total is exactly 0.06 from 2 bids', agg1.aggregateOrder.totalInputAmount === '0.06' && agg1.aggregateOrder.flyerCount === 2, { actual: agg1.aggregateOrder });
        }, { critical: true });

        let proposal = null; let chosen = null; const recipients = () => [{ id: rcpts[0].id, weight: 3 }, { id: rcpts[1].id, weight: 2 }, { id: rcpts[2].id, weight: 1 }];
        await ctx.step('the attested NEAR AI model proposes a 3:2:1 split of the VM\'s total (live, certificate chain required)', async (s) => {
          const advisor = new AttestedAdvisor({ apiKey, chain: 'required' });
          proposal = await advisor.proposeAllocation({ totalNear: agg1.aggregateOrder.totalInputAmount, recipients: recipients(), onError: 'fallback' });
          if (!proposal.record) { s.observe('the model could not be used', proposal.error); chosen = chooseAllocations(proposal, { requireRule: true }); s.assert('the round continues on the exact rule', chosen.source === 'fallback'); return; }
          const r = proposal.record;
          s.observe('model', { model: r.model, tcbStatus: r.tcbStatus, signer: r.signature.signing_address.slice(0, 16) });
          s.observe('what the model answered', r.plaintext.slice(0, 400));
          s.assert('the model\'s attestation checks all passed', r.attestationChecks.length > 0 && r.attestationChecks.every((c) => c.ok), { actual: r.attestationChecks });
          s.observe('the proposal is valid', proposal.validation.ok ? 'yes' : `no: ${proposal.validation.problems.join('; ')}`);
          s.observe('the proposal equals the rule 3:2:1', proposal.sameAsRule ? 'yes' : 'no');
          chosen = chooseAllocations(proposal, { requireRule: true });
          s.observe('what will be settled', { source: chosen.source, reason: chosen.reason });
          s.assert('what is settled is a valid split of exactly the rule', chosen.allocations.length === 3 && chosen.allocations.map((a) => a.amount).join() === proportionalSplit(parseMicro('0.06'), recipients()).map((x) => microToYocto(x.micro)).join(), { actual: chosen });
        }, { critical: true });

        await ctx.step('the VM signs within the total and the contract pays the recipients exactly', async (s) => {
          const { st, signed, error } = await signOnVm(`cmb-${tag}-1`, chosen.allocations, agg1);
          s.assert('the VM signed the settlement', Boolean(signed?.signature), { actual: error });
          const tx = await chain.send(coord.account, 'settle_batch', { syndicate_id: `cmb-${tag}-1`, attestation_nonce: st.round_nonce, aggregate_order_hash: agg1.orderHash, allocations: chosen.allocations, enclave_signature: signed.signature }, { gas: 100000000000000n, label: `settle_batch cmb-${tag}-1` });
          s.evidence('tx', { label: tx.label, hash: tx.hash, ok: tx.ok, explorer: tx.explorer, error: tx.error });
          s.assert('settle_batch succeeded', tx.ok, { actual: tx.error });
          await chain.waitFor(async () => /settled/i.test(String((await state(`cmb-${tag}-1`)).status)), { what: 'Settled' });
          const moves = await chain.waitFor(async () => { const t = await chain.transfersOf(tx.hash, chain.coordinatorId); return t.filter((x) => x.fromContract).length >= 3 ? t : null; }, { what: 'receipts', timeoutMs: 60000 });
          const byTo = Object.fromEntries(moves.filter((m) => m.fromContract).map((m) => [m.to, m.amount]));
          s.assert('the contract paid exactly 0.03, 0.02 and 0.01 NEAR to the three recipients and nobody else', Object.keys(byTo).length === 3 && rcpts.every((r, i) => byTo[r.id] === ['30000000000000000000000', '20000000000000000000000', '10000000000000000000000'][i]), { actual: byTo });
          const logged = await loggedAllocationsHash(tx.hash);
          s.assert('the contract logged the allocations hash the VM signed', Boolean(logged) && logged === signed.allocationsHash, { expected: signed.allocationsHash, actual: logged });
          if (chosen.source === 'model') {
            const rep = await verifyAdviceRecord(proposal.record, { onChainAllocationsHash: logged, freshAttestation: () => fetchVerifiedModelKey({ model: proposal.record.model, apiKey, chain: 'required' }) });
            for (const c of rep.checks) s.assert(`advice record: ${c.name}`, c.ok, { actual: c.detail });
            s.evidence('advice-record', { record: proposal.record, onChainAllocationsHash: logged, settleTx: tx.hash, explorer: tx.explorer, contract: chain.coordinatorId, roost: { cvm: vm.id, composeHash: verification.details?.composeHash, settlePublicKey: session.settlePublicKey } });
          } else s.note(`the model's answer was not used (${chosen.reason}); the exact rule was settled`);
        }, { critical: true });

        await ctx.step('a bad answer is stopped at each layer: the VM will not sign above the total, the contract will not pay outside the policy', async (s) => {
          const id = `cmb-${tag}-2`;
          s.assert('hatch syndicate #2', (await hatch(id)).ok);
          await chain.waitFor(() => state(id), { what: 'syndicate 2' });
          s.assert('flyer a deposits 0.04', (await deposit(flyers[0], id, '0.04')).ok);
          await chain.waitFor(async () => BigInt((await state(id)).total_escrow) === near('0.04'), { what: 'escrow 0.04' });
          const agg2 = await sealedRound([flyers[0]], '0.04', `${tag}-two`);
          const over = await signOnVm(id, [{ recipient: rcpts[0].id, amount: String(near('0.03')) }, { recipient: rcpts[1].id, amount: String(near('0.03')) }], agg2);
          s.assert('a proposal of 0.06 against a 0.04 total: the VM refuses to sign', !over.signed && /exceed/i.test(over.error || ''), { actual: over.error || 'signed' });
          const thief = chain.sub(`thief${tag.slice(-4)}`).id;
          const stolen = await signOnVm(id, [{ recipient: thief, amount: String(near('0.04')) }], agg2);
          s.assert('a payout to an account outside the policy: the VM does not know the policy and signs', Boolean(stolen.signed?.signature), { actual: stolen.error });
          const tx = await chain.send(coord.account, 'settle_batch', { syndicate_id: id, attestation_nonce: stolen.st.round_nonce, aggregate_order_hash: agg2.orderHash, allocations: [{ recipient: thief, amount: String(near('0.04')) }], enclave_signature: stolen.signed.signature }, { gas: 100000000000000n, label: `OUTSIDE-POLICY settle_batch ${id}` });
          s.evidence('tx', { label: tx.label, hash: tx.hash, ok: tx.ok, explorer: tx.explorer, error: tx.error });
          s.assert('the contract rejects it: the recipient is not in the release policy', !tx.ok && /whitelist/i.test(tx.error || ''), { actual: tx.error });
          const after = await state(id);
          s.assert('the syndicate is still active with its 0.04 intact', /active/i.test(String(after.status)) && BigInt(after.total_escrow) === near('0.04'), { actual: after.status });
          const rule = [{ recipient: rcpts[0].id, amount: String(near('0.02')) }, { recipient: rcpts[1].id, amount: String(near('0.02')) }];
          const again = await signOnVm(id, rule, agg2);
          s.assert('the VM will not sign a second settlement for the same sealed round', !again.signed && /already been signed/i.test(again.error || ''), { actual: again.error || 'signed' });
          const agg3 = await sealedRound([flyers[0]], '0.04', `${tag}-three`);
          const fair = await signOnVm(id, rule, agg3);
          s.assert('a fresh sealed round is signed within its total', Boolean(fair.signed?.signature), { actual: fair.error });
          const tx2 = await chain.send(coord.account, 'settle_batch', { syndicate_id: id, attestation_nonce: fair.st.round_nonce, aggregate_order_hash: agg3.orderHash, allocations: rule, enclave_signature: fair.signed.signature }, { gas: 100000000000000n, label: `settle_batch ${id}` });
          s.evidence('tx', { label: tx2.label, hash: tx2.hash, ok: tx2.ok, explorer: tx2.explorer, error: tx2.error });
          s.assert('the same syndicate then settles within its policy', tx2.ok, { actual: tx2.error });
          await chain.waitFor(async () => /settled/i.test(String((await state(id)).status)), { what: 'Settled #2' });
        });
      } finally {
        await ctx.step('teardown of the chain side: prune the syndicates, compact the indexes, delete the accounts', async (s) => {
          if (!flyers) { s.assert('nothing to tear down', true); return; }
          const rep = await teardownMembers(chain, { rootDir: ctx.rootDir, members: [...flyers, ...rcpts], pruneIds: created });
          s.observe('teardown', { pruned: rep.pruned.length, notPruned: rep.notPruned, deleted: rep.deleted.length, kept: rep.kept, failed: rep.failed });
          s.assert('every syndicate was pruned and every account deleted', rep.notPruned.length === 0 && rep.failed.length === 0 && rep.kept.length === 0, { actual: rep });
          s.assert('the contract holds exactly as many records as before the run', Number(await chain.view('get_syndicate_count', {})) === countBefore, { expected: countBefore });
        }, { always: true });
      }
    } finally {
      await ctx.step('teardown: delete the VM and prove the Phala account is empty', async (s) => {
        if (verifier) await verifier.stop();
        const result = vm ? await vm.teardown() : { deleted: true, note: 'no VM was created' };
        s.observe('teardown', result);
        s.assert('the VM was deleted', result.deleted === true, { actual: result });
        let left = [];
        for (let i = 0; i < 12; i += 1) { left = (await listCvms(ctx.rootDir)).filter((x) => !/delet/i.test(String(x.status))); if (!left.length) break; await new Promise((r) => setTimeout(r, 5000)); }
        s.assert('no CVM is left running on the account', left.length === 0, { actual: left.map((x) => `${x.name}:${x.status}`) });
        if (result.estimatedUsd !== undefined) { s.observe('estimated cost (USD)', result.estimatedUsd); s.assert('the VM cost under $0.05', result.estimatedUsd < 0.05, { actual: result.estimatedUsd }); }
      }, { always: true });
    }
  },
};
