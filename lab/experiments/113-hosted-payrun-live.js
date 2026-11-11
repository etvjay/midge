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
import { signInvoice, invoiceHash } from '../../src/roost-service/invoice.js';
import { verifyAuditorPack, auditOpenMessage } from '../../src/roost-service/auditor.js';
import { verifyStatement } from '../../src/roost-service/receipts.js';
import { openFromModel } from '../../src/enclave/e2ee.js';

const MEMBERS = []; const FOUNDERS = [];
const DEP = '0.1'; const CAP_BPS = 2500; const TIMER = 24;
const toN = (x) => near(String(x));

export default {
  id: 'E-HOSTED-PAYRUN-LIVE-01',
  title: 'A pay run with payee-signed invoices and an employer-authorised auditor pack on the real hardware room, settled on the production contract',
  tier: 'hardware',
  requires: ['phala-key', 'near-key', 'network', 'docker'],
  hypothesis: 'Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. A mismatched invoice stops the run; a corrected run settles with exact amounts; receipts carry their invoice hash and verify against the on-chain order hash; the auditor sees only the line the employer opens; the stateless checks answer on the VM.',
  limits: [
    'One operator controls every account and the VM. This is the system working on real hardware, not independent parties.',
    'Every payment\'s address and amount is public on NEAR once settled: this hides who a payee is, not how much.',
    'The coordinator holds the key that triggers a run. Only NEAR payments are made from the hardware room here; foreign-chain payments go through the contract and have their own experiment.',
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
    const id = `hpr-${tag}`;
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
      const PAYEES = ['p1', 'p2', 'p3'];
      const PEOPLE = { p1: 'Alice', p2: 'Bo', p3: 'Cy' };
      const GROSS = { p1: '0.05', p2: '0.04', p3: '0.03' }; const TAX = { p1: '0.005', p2: '0.004', p3: '0.003' }; const BEN = '0.002';
      const NET = { p1: '0.043', p2: '0.034', p3: '0.025' };
      const readKeys = Object.fromEntries(PAYEES.map((k) => [k, generateClientKey()]));
      const signKeys = Object.fromEntries(PAYEES.map((k) => [k, crypto.generateKeyPairSync('ed25519')]));
      const auditor = generateClientKey(); const employerRead = generateClientKey();
      const lines = (over = {}) => PAYEES.map((k) => ({ payee: P[k].id, person: PEOPLE[k], invoiceId: `INV-${k}`, period: '2026-11', gross: over[k] ?? GROSS[k], tax: TAX[k], benefits: BEN, payeeKey: readKeys[k].publicKeyHex }));
      const invoiceBody = (k) => ({ invoiceId: `INV-${k}`, period: '2026-11', chain: 'near', address: P[k].id, asset: 'NEAR', amount: GROSS[k] });
      let round = null;
      const sendInvoices = async () => { for (const k of PAYEES) await member.submitInvoice({ cipherTextHex: sealToModel(JSON.stringify(signInvoice(invoiceBody(k), signKeys[k].privateKey)), session.intentPublicKey) }); };
      const employerKeys = () => P.er.key.keyPair;
      const sendRun = async (ls) => {
        const cipherTextHex = sealToModel(JSON.stringify({ lines: ls }), session.intentPublicKey); const kp = employerKeys();
        return member.submitSignedIntent({ flyerId: P.er.id, cipherTextHex, publicKey: kp.getPublicKey().toString(), signature: signInputWithNearKey(kp.toString(), inputMessage({ ...round, flyerId: P.er.id, seq: 1, cipherTextHex })), seq: 1 });
      };
      const runParams = { employer: undefined, taxAddress: undefined, benefitsAddress: undefined, employerKeyHex: employerRead.publicKeyHex, auditorKeyHex: auditor.publicKeyHex, runId: `run-${tag}`, requireInvoices: true };
      const onChainOrderHash = async (hash) => {
        const r = await (await fetch('https://test.rpc.fastnear.com', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tx', params: { tx_hash: hash, sender_account_id: coord.id, wait_until: 'FINAL' } }) })).json();
        const a = r.result.transaction.actions.find((x) => x.FunctionCall)?.FunctionCall;
        return JSON.parse(Buffer.from(a.args, 'base64').toString('utf8')).aggregate_order_hash;
      };

      await ctx.step('set up: an employer, three payees, tax and benefits accounts, and a group whose room key is the ATTESTED settlement key; the employer deposits 0.2', async (s) => {
        s.assert('the settlement key the contract will trust equals the attested one', session.settlePublicKey === attested.settlePublicKey);
        countBefore = Number(await chain.view('get_syndicate_count', {}));
        const names = ['er', ...PAYEES, 'tx', 'bf'];
        // Only the employer sends transactions after setup (a deposit, then a hatch_out that needs about 0.06 NEAR available), so it is funded 0.4 and the others 0.1.
        const first = await createMembers(chain, { rootDir: ctx.rootDir, tag: `pr${tag.slice(-5)}`, count: 1, fundNear: '0.4', names: ['er'] });
        let rest;
        try { rest = await createMembers(chain, { rootDir: ctx.rootDir, tag: `pr${tag.slice(-5)}`, count: names.length - 1, fundNear: '0.1', names: names.slice(1) }); } catch (e) { await teardownMembers(chain, { rootDir: ctx.rootDir, members: first, pruneIds: [], exitWaitMs: 1000 }); throw e; }
        const made = [...first, ...rest];
        P = Object.fromEntries(names.map((k, i) => [k, made[i]])); P.all = made;
        runParams.employer = P.er.id; runParams.taxAddress = P.tx.id; runParams.benefitsAddress = P.bf.id;
        created.push(id);
        const pol = { allowed_recipients: [...PAYEES.map((k) => P[k].id), P.tx.id, P.bf.id], max_release_bps_per_epoch: 10000, settle_deadline_block: 500000000 };
        const h = await chain.send(coord.account, 'hatch', { syndicate_id: id, syndicate_type: 'FLASH', quorum_threshold: 1, max_spend_near: 1, enclave_public_key: session.settlePublicKey, expected_code_hash: crypto.randomBytes(32).toString('hex'), timeout_blocks: 12, payout_recipient: P.p1.id, release_policy: pol }, { deposit: near('0.01'), gas: 40000000000000n, label: `hatch ${id}` });
        s.assert('the group was hatched', h.ok, { actual: h.error });
        await chain.waitFor(() => state(), { what: 'group' });
        const d = await chain.send(P.er.account, 'deposit', { syndicate_id: id, policy_hash: computePolicyHash(pol, 12) }, { deposit: near('0.2'), gas: 30000000000000n, label: 'deposit employer' });
        s.assert('the employer deposited 0.2', d.ok, { actual: d.error });
        await chain.waitFor(async () => BigInt((await state()).total_escrow) === toN('0.2'), { what: 'deposit' });
      }, { critical: true });

      await ctx.step('prediction 2: a line that differs from its invoice stops the run, names the mismatch, and the queue is kept', async (s) => {
        round = await roundOf(); await coordinator.openRound(round);
        await sendInvoices(); await sendRun(lines({ p3: '0.035' }));
        const first = await coordinator.runPayrun(runParams).then(() => 'ran', (e) => e.message);
        s.observe('how the mismatch was refused', first);
        s.assert('the VM refused the run and named the invoice and the difference', /INV-p3/.test(first) && /amount differs/.test(first), { actual: first });
        const again = await coordinator.runPayrun(runParams).then(() => 'ran', (e) => e.message);
        s.assert('the employer\'s queued run was kept: asking again gives the same refusal, not "no pay run"', /INV-p3/.test(again), { actual: again });
      });

      let out = null; let settleHash = null; let chainHash = null;
      await ctx.step('prediction 3: after reopening the round, the corrected run settles with exact amounts on the production contract', async (s) => {
        await coordinator.openRound(round); await sendInvoices(); await sendRun(lines());
        out = await coordinator.runPayrun(runParams);
        s.assert('all three lines matched their invoices', out.outcome.invoicesMatched === 3, { actual: out.outcome });
        const signed = await coordinator.signSettlement({ ...round, allocations: out.allocations, orderHash: out.orderHash, charges: out.charges });
        const tx = await chain.send(coord.account, 'settle_batch_charged', { syndicate_id: id, attestation_nonce: round.roundNonce, aggregate_order_hash: out.orderHash, allocations: out.allocations, charges: out.charges, enclave_signature: signed.signature }, { gas: 150000000000000n, label: 'settle_batch_charged pay run' });
        s.evidence('tx', { label: tx.label, hash: tx.hash, ok: tx.ok, explorer: tx.explorer, error: tx.error });
        s.assert('the contract accepted the settlement the VM signed', tx.ok, { actual: tx.error });
        settleHash = tx.hash;
        await waitSettled(toN('0.08'));
        const paid = (await chain.transfersOf(tx.hash, coord.id)).filter((m) => m.fromContract);
        const by = Object.fromEntries(paid.map((m) => [m.to, BigInt(m.amount)]));
        for (const k of PAYEES) s.assert(`${PEOPLE[k]}'s account received exactly ${NET[k]}`, by[P[k].id] === toN(NET[k]), { actual: String(by[P[k].id]) });
        s.assert('the tax account received exactly 0.012', by[P.tx.id] === toN('0.012'), { actual: String(by[P.tx.id]) });
        s.assert('the benefits account received exactly 0.006', by[P.bf.id] === toN('0.006'), { actual: String(by[P.bf.id]) });
        s.assert('five transfers moved and nothing else', paid.length === 5, { actual: paid.length });
        s.assert('the employer was charged exactly the gross total: 0.08 of 0.2 left', (await escrowOf('er')) === toN('0.08'), { actual: String(await escrowOf('er')) });
        chainHash = await onChainOrderHash(tx.hash);
        s.assert('the order hash in the settlement transaction on chain is the one the VM computed', chainHash === out.orderHash, { actual: chainHash });
      });

      await ctx.step('prediction 4: each payee opens their own statement; it carries their invoice hash and verifies against the on-chain order hash; another payee\'s key cannot open it', async (s) => {
        for (const k of PAYEES) {
          const cipherHex = out.statements.payees[P[k].id].cipherHex;
          const v = verifyStatement({ cipherHex, secretX25519: readKeys[k].secretX25519, hostSettlePublicKey: out.settlePublicKey, onChainOrderHash: chainHash });
          s.assert(`${PEOPLE[k]}'s statement verifies against the order hash found on chain`, v.ok === true, { actual: v });
          s.assert(`${PEOPLE[k]}'s receipt carries the hash of ${PEOPLE[k]}'s invoice`, v.receipt?.invoiceHash === invoiceHash(invoiceBody(k)), { actual: v.receipt?.invoiceHash });
        }
        const cross = verifyStatement({ cipherHex: out.statements.payees[P.p2.id].cipherHex, secretX25519: readKeys.p1.secretX25519, hostSettlePublicKey: out.settlePublicKey, onChainOrderHash: chainHash });
        s.assert('one payee cannot open another\'s statement', cross.ok === false);
      });

      await ctx.step('prediction 5: the employer opens one line for the auditor; the auditor verifies it; nobody else can ask', async (s) => {
        const kp = employerKeys(); const indices = [1];
        const ask = (key, pub) => member.openAuditLines({ runId: runParams.runId, indices, auditorKeyHex: auditor.publicKeyHex, employer: P.er.id, publicKey: pub, signature: signInputWithNearKey(key, auditOpenMessage({ runId: runParams.runId, indices, auditorKeyHex: auditor.publicKeyHex })) });
        const res = await ask(kp.toString(), kp.getPublicKey().toString());
        const pack = JSON.parse(openFromModel(res.packCipherHex, auditor.secretX25519));
        s.assert('the auditor verifies the pack against the order hash found on chain', verifyAuditorPack(pack, chainHash).ok === true);
        s.assert('it holds exactly one line, Bo\'s', pack.opened.length === 1 && pack.opened[0].leaf.person === 'Bo', { actual: pack.opened.map((o) => o.leaf.person) });
        const text = JSON.stringify(pack); s.assert('it names no other person', !text.includes('Alice') && !text.includes('Cy'));
        const stranger = nearKeyPair();
        const refused = await ask(stranger.secretKey, stranger.publicKey).then(() => 'accepted', (e) => e.message);
        s.assert('a request signed by anyone else is refused', refused !== 'accepted', { actual: refused });
        s.observe('how it was refused', refused);
      });

      await ctx.step('prediction 6: the stateless checks answer on the VM', async (s) => {
        const SOLP = '2J75L6udJ52N7YmrDPQLN7gzV6CqWny6CaWGccvohi4f';
        const policy = { payees: [{ chain: 'solana-devnet', address: SOLP, max_amount: '2000000', max_total: '5000000' }], max_fee_cost: '1' };
        const pf = await member.preflight({ payment: { obligationId: 'o1', chain: 'solana-devnet', payee: SOLP, amount: '9000000' }, policy });
        s.assert('pre-flight blocks a payment over the per-payment cap', pf.ok === false && pf.findings.some((f) => f.code === 'over-payment-cap'), { actual: pf });
        const body = invoiceBody('p1'); const inv = signInvoice(body, signKeys.p1.privateKey);
        s.assert('the invoice check passes for a matching approval', (await member.checkInvoice(inv, body)).ok === true);
        s.assert('and fails for a changed destination', (await member.checkInvoice(inv, { ...body, address: 'someone-else.near' })).ok === false);
      });
    } finally {
      await ctx.step('prediction 6: teardown of the chain side (members exit with their remainders, group pruned, accounts deleted)', async (st) => {
        if (!P) { st.assert('nothing to tear down', true); return; }
        const rep = await teardownMembers(chain, { rootDir: ctx.rootDir, members: P.all, pruneIds: created, exitWaitMs: 180000 });
        st.observe('teardown', { pruned: rep.pruned.length, notPruned: rep.notPruned, deleted: rep.deleted.length, kept: rep.kept, failed: rep.failed });
        st.assert('the group was pruned and every account deleted', rep.notPruned.length === 0 && rep.failed.length === 0 && rep.deleted.length === 6, { actual: rep });
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
