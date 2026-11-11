import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { connect, near, computePolicyHash } from '../lib/near.js';
import { createMembers, teardownMembers } from '../lib/members.js';
import { deployRoost, listCvms, startVerifier, HOURLY_USD } from '../lib/phala.js';
import { HostedRoostClient } from '../../src/roost-service/client.js';
import { verifyHostedAttestation } from '../../src/roost-service/verify-hosted.js';
import { expectedComposeHashes } from '../../src/roost-service/compose-hash.js';
import { sealToModel, generateClientKey } from '../../src/enclave/e2ee.js';
import { signInputWithNearKey, inputMessage, nearKeyPair } from '../../src/roost-service/signed-input.js';

const MEMBERS = []; const FOUNDERS = [];
const DEP = '0.1'; const CAP_BPS = 2500; const TIMER = 24;
const toN = (x) => near(String(x));

export default {
  id: 'E-HOSTED-RFQ-LIVE-01',
  title: 'A sealed-quote RFQ on the real hardware room, settled on the production contract: the best eligible quote wins, the books are exact, the losing quotes stay sealed',
  tier: 'hardware',
  requires: ['phala-key', 'near-key', 'network', 'docker'],
  hypothesis: 'Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. A request that could cost more than the taker has is refused and kept; the lowest eligible ask wins; the books are exact; the losing quotes appear nowhere in what the room returns; the order hash on chain is the VM\'s.',
  limits: [
    'One operator controls every account and the VM. This is the system working on real hardware, not independent parties.',
    'The room sees every quote: this hides quotes from the other makers and the public, not from the room. The amount paid is public once settled.',
    'A buy-side, first-price RFQ with one winner; sell-side, second-price and ties are not run here.',
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
    const id = `hrq-${tag}`;
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
      s.assert('the compose file is pinned to an image digest', /midge-roost@sha256:[0-9a-f]{64}/.test(ourCompose));
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
      const MAKERS = ['m1', 'm2', 'm3'];
      const QUOTES = { m1: { bid: '0.011', ask: '0.041' }, m2: { bid: '0.011', ask: '0.032' }, m3: { bid: '0.011', ask: '0.067' } };
      let round = null;
      const send = (k, body) => {
        const cipherTextHex = sealToModel(JSON.stringify(body), session.intentPublicKey); const kp = P[k].key.keyPair;
        return member.submitSignedIntent({ flyerId: P[k].id, cipherTextHex, publicKey: kp.getPublicKey().toString(), signature: signInputWithNearKey(kp.toString(), inputMessage({ ...round, flyerId: P[k].id, seq: 1, cipherTextHex })), seq: 1 });
      };
      const submitAll = async (units) => { await send('tk', { side: 'buy', units, limit: '0.05', salt: crypto.randomBytes(16).toString('hex') }); for (const k of MAKERS) await send(k, QUOTES[k]); };
      const rfqParams = () => ({ taker: P.tk.id, makers: MAKERS.map((k) => P[k].id), pricing: 'first', roundId: `rfq-${tag}` });
      const onChainOrderHash = async (hash) => {
        const r = await (await fetch('https://test.rpc.fastnear.com', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tx', params: { tx_hash: hash, sender_account_id: coord.id, wait_until: 'FINAL' } }) })).json();
        const a = r.result.transaction.actions.find((x) => x.FunctionCall)?.FunctionCall;
        return JSON.parse(Buffer.from(a.args, 'base64').toString('utf8')).aggregate_order_hash;
      };

      await ctx.step('set up: a taker, three makers, and a group whose room key is the ATTESTED settlement key; the taker deposits 0.2', async (s) => {
        s.assert('the settlement key the contract will trust equals the attested one', session.settlePublicKey === attested.settlePublicKey);
        countBefore = Number(await chain.view('get_syndicate_count', {}));
        const names = ['tk', ...MAKERS];
        const made = await createMembers(chain, { rootDir: ctx.rootDir, tag: `rq${tag.slice(-5)}`, count: names.length, fundNear: '0.3', names });
        P = Object.fromEntries(names.map((k, i) => [k, made[i]])); P.all = made;
        created.push(id);
        const pol = { allowed_recipients: MAKERS.map((k) => P[k].id), max_release_bps_per_epoch: 10000, settle_deadline_block: 500000000 };
        const h = await chain.send(coord.account, 'hatch', { syndicate_id: id, syndicate_type: 'FLASH', quorum_threshold: 1, max_spend_near: 1, enclave_public_key: session.settlePublicKey, expected_code_hash: crypto.randomBytes(32).toString('hex'), timeout_blocks: 12, payout_recipient: P.m1.id, release_policy: pol }, { deposit: near('0.01'), gas: 40000000000000n, label: `hatch ${id}` });
        s.assert('the group was hatched', h.ok, { actual: h.error });
        await chain.waitFor(() => state(), { what: 'group' });
        const d = await chain.send(P.tk.account, 'deposit', { syndicate_id: id, policy_hash: computePolicyHash(pol, 12) }, { deposit: near('0.2'), gas: 30000000000000n, label: 'deposit taker' });
        s.assert('the taker deposited 0.2', d.ok, { actual: d.error });
        await chain.waitFor(async () => BigInt((await state()).total_escrow) === toN('0.2'), { what: 'deposit' });
      }, { critical: true });

      await ctx.step('prediction 2: a request that could cost more than the taker has is refused, and the queue is kept', async (s) => {
        round = await roundOf(); await coordinator.openRound(round);
        await submitAll(10);
        const first = await coordinator.runRfq(rfqParams()).then(() => 'ran', (e) => e.message);
        s.observe('how it was refused', first);
        s.assert('the VM refused it as more than the taker can cover', /cannot cover/.test(first), { actual: first });
        const again = await coordinator.runRfq(rfqParams()).then(() => 'ran', (e) => e.message);
        s.assert('the queue was kept: asking again gives the same refusal, not "no request was sealed"', /cannot cover/.test(again), { actual: again });
      });

      let out = null;
      await ctx.step('prediction 3, 4 and 5: the best eligible quote wins, the books are exact, the losers stay sealed, the order hash is bound', async (s) => {
        await coordinator.openRound(round); await submitAll(2);
        out = await coordinator.runRfq(rfqParams());
        s.assert('three quotes were received and two were eligible (m3\'s ask is over the limit)', out.outcome.quotesReceived === 3 && out.outcome.quotesEligible === 2, { actual: out.outcome });
        s.assert('m2 won', out.outcome.winner === P.m2.id, { actual: out.outcome.winner });
        const wire = JSON.stringify(out);
        s.assert('prediction 4: nothing the room returned contains m1\'s ask, m3\'s ask or any bid', !wire.includes('0.041') && !wire.includes('0.067') && !wire.includes('0.011'), { actual: wire.slice(0, 400) });
        s.assert('the terms are 2 units at 0.032', out.terms.units === 2 && out.terms.price === '0.032', { actual: out.terms });
        const signed = await coordinator.signSettlement({ ...round, allocations: out.allocations, orderHash: out.orderHash, charges: out.charges });
        const tx = await chain.send(coord.account, 'settle_batch_charged', { syndicate_id: id, attestation_nonce: round.roundNonce, aggregate_order_hash: out.orderHash, allocations: out.allocations, charges: out.charges, enclave_signature: signed.signature }, { gas: 150000000000000n, label: 'settle_batch_charged RFQ' });
        s.evidence('tx', { label: tx.label, hash: tx.hash, ok: tx.ok, explorer: tx.explorer, error: tx.error });
        s.assert('the contract accepted the settlement the VM signed', tx.ok, { actual: tx.error });
        await waitSettled(toN('0.136'));
        const paid = (await chain.transfersOf(tx.hash, coord.id)).filter((m) => m.fromContract);
        s.assert('m2 received exactly 0.064 NEAR and nothing else moved', paid.length === 1 && paid[0].to === P.m2.id && BigInt(paid[0].amount) === toN('0.064'), { actual: paid });
        s.assert('the taker was charged exactly 0.064: 0.136 left', (await escrowOf('tk')) === toN('0.136'), { actual: String(await escrowOf('tk')) });
        s.assert('prediction 5: the order hash in the settlement transaction on chain is the one the VM computed', (await onChainOrderHash(tx.hash)) === out.orderHash);
      });
    } finally {
      await ctx.step('prediction 6: teardown of the chain side (members exit with their remainders, group pruned, accounts deleted)', async (st) => {
        if (!P) { st.assert('nothing to tear down', true); return; }
        const rep = await teardownMembers(chain, { rootDir: ctx.rootDir, members: P.all, pruneIds: created, exitWaitMs: 180000 });
        st.observe('teardown', { pruned: rep.pruned.length, notPruned: rep.notPruned, deleted: rep.deleted.length, kept: rep.kept, failed: rep.failed });
        st.assert('the group was pruned and every account deleted', rep.notPruned.length === 0 && rep.failed.length === 0 && rep.deleted.length === 4, { actual: rep });
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
