import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { connect, near, computePolicyHash, loadEnvFile } from '../lib/near.js';
import { createMembers, teardownMembers } from '../lib/members.js';
import { deployRoost, listCvms, startVerifier, HOURLY_USD } from '../lib/phala.js';
import { HostedRoostClient } from '../../src/roost-service/client.js';
import { verifyHostedAttestation } from '../../src/roost-service/verify-hosted.js';
import { expectedComposeHashes } from '../../src/roost-service/compose-hash.js';
import { sealToModel, generateClientKey, openFromModel } from '../../src/enclave/e2ee.js';
import { signInputWithNearKey, inputMessage, nearKeyPair } from '../../src/roost-service/signed-input.js';
import { verifyAuditorPack, auditOpenMessage } from '../../src/roost-service/auditor.js';
import { verifyStatement } from '../../src/roost-service/receipts.js';
import { verifyModelReceipt } from '../../src/browser/midge-verify.js';
import { payrunApprovalMessage } from '../../src/roost-service/hosted-roost.js';
import { AttestedAdvisor, checkReceipt } from '../../src/advisor/attested-advisor.js';
import { analyseRun, reviewPayrun, secretsOf, REVIEWER_BRIEF } from '../../src/advisor/payrun-analyst.js';

const toN = (x) => near(String(x));
const hex = (u8) => Buffer.from(u8).toString('hex');
const STATED = { taxRatePct: 15, benefitsCapPct: 5 };
const RULES = 'Tax is a flat 15 percent of gross, withheld on every line. Employee benefits are capped at 5 percent of gross. All lines are for the November 2026 period. A line with no tax withheld needs a written exemption.';

export default {
  id: 'E-HOSTED-PAYRUN-LIVE-04',
  title: 'An employee pay run with maker-checker and an AI review on the real hardware room: no invoices, a planted mistake caught, a separate approver, exact transfers, payslips, an auditor pack, all saved as evidence',
  tier: 'hardware',
  requires: ['phala-key', 'near-key', 'network', 'docker', 'nearai-key', 'dcap-qvl'],
  hypothesis: 'Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. The attested reviewer catches a planted line with no tax withheld; the corrected run waits for a separate approver, refuses a stranger\'s approval, and then settles with exact amounts on the production contract; the private lines add up to the public transfers; receipts and an auditor pack verify against the order hash read from the chain; and everything a page needs to show this is saved as evidence.',
  limits: [
    'One operator controls every account and the VM. This is the system working on real hardware, not independent parties.',
    'Every payment\'s address and amount is public on NEAR once settled: this hides who a payee is, not how much.',
    'The planted mistake is planted: it shows the reviewer catching a kind of mistake its brief names, not that it would catch every real one.',
    'The throwaway keys that open the receipts were made for this run and are saved as evidence on purpose; they hold nothing and exist only on testnet.',
  ],
  async run(ctx) {
    const chain = await connect(ctx.rootDir);
    const coord = chain.sub('c');
    const expected = JSON.parse(fs.readFileSync(path.join(ctx.rootDir, 'roost.expected.json'), 'utf8'));
    const ourCompose = fs.readFileSync(path.join(ctx.rootDir, 'deploy/roost/docker-compose.yml'), 'utf8');
    const apiKey = loadEnvFile(ctx.rootDir).NEARAI_API_KEY || process.env.NEARAI_API_KEY;
    let vm = null; let verifier = null; let attested = null; let P = null; let countBefore = null;
    const created = [];
    const tag = Date.now().toString(36);
    const id = `hp4-${tag}`;
    const state = (x = id) => chain.view('get_syndicate', { syndicate_id: x });
    const escrowOf = async (who) => BigInt(await chain.view('get_escrow', { syndicate_id: id, account_id: P[who].id }));
    const waitSettled = (expectTotal) => chain.waitFor(async () => { const x = await state(); return !x.is_settling && BigInt(x.total_escrow) === expectTotal; }, { what: 'settlement resolved' });
    const roundOf = async () => { const st = await state(); return { contractId: chain.coordinatorId, syndicateId: id, epoch: Number(st.epoch), roundNonce: st.round_nonce }; };

    await ctx.step('preflight: the Phala account is empty, the compose file is pinned, and the NEAR AI key is present', async (s) => {
      const existing = await listCvms(ctx.rootDir);
      s.assert('no CVM is already running on the account', existing.length === 0, { actual: existing.map((x) => x.cvmName) });
      s.assert('the compose file is pinned to a CI-built image digest and requires signed inputs', /ghcr\.io\/etvjay\/midge-roost@sha256:[0-9a-f]{64}/.test(ourCompose) && ourCompose.includes('ROOST_REQUIRE_SIGNED_INPUTS=1') && ourCompose.includes('ROOST_CONTRACT_ID=c.fly-1793636729.testnet'));
      s.assert('the pinned digest is the one CI built from the merge that added the room gaps (0e1fbad0)', ourCompose.includes('sha256:0e1fbad07e8c688097404ea9b5229432b4e92525f49768b85d97934e8ee9d267'));
      s.assert('a production OS image hash is pinned', (expected.osImageHashes || []).length > 0);
      s.assert('a NEAR AI Cloud key is present', typeof apiKey === 'string' && apiKey.length > 10);
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
      const PAYEES = ['p1', 'p2', 'p3', 'p4'];
      const PEOPLE = { p1: 'Alice', p2: 'Bo', p3: 'Cy', p4: 'Dee' };
      const GROSS = { p1: '0.05', p2: '0.04', p3: '0.03', p4: '0.06' };
      const TAX = { p1: '0.0075', p2: '0.006', p3: '0.0045', p4: '0.009' };
      const BEN = { p1: '0.0025', p2: '0.002', p3: '0.0015', p4: '0.003' };
      const NET = { p1: '0.04', p2: '0.032', p3: '0.024', p4: '0.048' };
      const readKeys = Object.fromEntries(PAYEES.map((k) => [k, generateClientKey()]));
            const auditor = generateClientKey(); const employerRead = generateClientKey(); const approverRead = generateClientKey();
      const lines = (over = {}, tax = {}) => PAYEES.map((k) => ({ payee: P[k].id, person: PEOPLE[k], invoiceId: `PAY-${k}`, period: '2026-11', gross: over[k] ?? GROSS[k], tax: tax[k] ?? TAX[k], benefits: BEN[k], payeeKey: readKeys[k].publicKeyHex }));
      let round = null;
      const employerKeys = () => P.er.key.keyPair;
      const sendRun = async (ls) => {
        const cipherTextHex = sealToModel(JSON.stringify({ lines: ls }), session.intentPublicKey); const kp = employerKeys();
        return member.submitSignedIntent({ flyerId: P.er.id, cipherTextHex, publicKey: kp.getPublicKey().toString(), signature: signInputWithNearKey(kp.toString(), inputMessage({ ...round, flyerId: P.er.id, seq: 1, cipherTextHex })), seq: 1 });
      };
      const runParams = { employer: undefined, taxAddress: undefined, benefitsAddress: undefined, employerKeyHex: employerRead.publicKeyHex, auditorKeyHex: auditor.publicKeyHex, runId: `run-${tag}`, requireInvoices: false, approver: undefined, approverKeyHex: approverRead.publicKeyHex };
      const onChainOrderHash = async (hash) => {
        const r = await (await fetch('https://test.rpc.fastnear.com', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tx', params: { tx_hash: hash, sender_account_id: coord.id, wait_until: 'FINAL' } }) })).json();
        const a = r.result.transaction.actions.find((x) => x.FunctionCall)?.FunctionCall;
        return JSON.parse(Buffer.from(a.args, 'base64').toString('utf8')).aggregate_order_hash;
      };

      await ctx.step('set up: an employer, a separate approver, four employees, tax and benefits accounts, and a group whose room key is the ATTESTED settlement key; the employer deposits 0.25', async (s) => {
        s.assert('the settlement key the contract will trust equals the attested one', session.settlePublicKey === attested.settlePublicKey);
        countBefore = Number(await chain.view('get_syndicate_count', {}));
        const names = ['er', 'ap', ...PAYEES, 'tx', 'bf'];
        const first = await createMembers(chain, { rootDir: ctx.rootDir, tag: `p4${tag.slice(-5)}`, count: 1, fundNear: '0.5', names: ['er'] });
        let rest;
        try { rest = await createMembers(chain, { rootDir: ctx.rootDir, tag: `p4${tag.slice(-5)}`, count: names.length - 1, fundNear: '0.1', names: names.slice(1) }); } catch (e) { await teardownMembers(chain, { rootDir: ctx.rootDir, members: first, pruneIds: [], exitWaitMs: 1000 }); throw e; }
        const made = [...first, ...rest];
        P = Object.fromEntries(names.map((k, i) => [k, made[i]])); P.all = made;
        runParams.employer = P.er.id; runParams.taxAddress = P.tx.id; runParams.benefitsAddress = P.bf.id; runParams.approver = P.ap.id;
        created.push(id);
        const pol = { allowed_recipients: [...PAYEES.map((k) => P[k].id), P.tx.id, P.bf.id], max_release_bps_per_epoch: 10000, settle_deadline_block: 500000000 };
        const h = await chain.send(coord.account, 'hatch', { syndicate_id: id, syndicate_type: 'FLASH', quorum_threshold: 1, max_spend_near: 1, enclave_public_key: session.settlePublicKey, expected_code_hash: crypto.randomBytes(32).toString('hex'), timeout_blocks: 12, payout_recipient: P.p1.id, release_policy: pol }, { deposit: near('0.01'), gas: 40000000000000n, label: `hatch ${id}` });
        s.assert('the group was hatched', h.ok, { actual: h.error });
        await chain.waitFor(() => state(), { what: 'group' });
        const d = await chain.send(P.er.account, 'deposit', { syndicate_id: id, policy_hash: computePolicyHash(pol, 12) }, { deposit: near('0.25'), gas: 30000000000000n, label: 'deposit employer' });
        s.assert('the employer deposited 0.25', d.ok, { actual: d.error });
        await chain.waitFor(async () => BigInt((await state()).total_escrow) === toN('0.25'), { what: 'deposit' });
      }, { critical: true });

      round = null;
      let review = null;
      await ctx.step('prediction 2: before approval, the attested reviewer catches the planted mistake, from a request with nothing identifying in it', async (s) => {
        round = await roundOf(); await coordinator.openRound(round);
        const planted = lines({}, { p3: '0' });
        const real = new AttestedAdvisor({ apiKey });
        const cyLabel = analyseRun({ lines: planted }).rows[2].label;
        const secrets = secretsOf({ lines: planted });
        let record = null; const capturing = { ask: async (x) => { const r = await real.ask(x); record = r.record; return r; } };
        let attempts = 0; let out = null;
        const caught = (o) => o.used && o.findings.some((f) => f.line === cyLabel && ['zero-deduction', 'rate-below-schedule'].includes(f.code) && f.check === 'verified');
        for (attempts = 1; attempts <= 2; attempts += 1) { out = await reviewPayrun({ lines: planted, rulesText: RULES, stated: STATED, advisor: capturing, enabled: true }); if (caught(out)) break; s.observe(`attempt ${attempts} did not catch it`, out.used ? out.findings : out.reason); }
        attempts = Math.min(attempts, 2);
        s.observe('attempts', attempts);
        s.assert('the reviewer\'s reply parsed in the fixed shape', out.used === true, { actual: out.reason });
        s.assert(`the planted mistake (line ${cyLabel}, no tax withheld) is caught, with a finding the code verifies`, caught(out), { actual: out.findings });
        const wire = JSON.stringify(out.sent || {});
        s.assert('the request contains none of the names, one-time addresses, invoice ids or exact amounts', secrets.every((x) => (/^\d+$/.test(x) && x.length < 6) || !wire.toLowerCase().includes(x.toLowerCase())));
        const rc = checkReceipt(record);
        s.assert('the model\'s receipt verifies (signature, key, attestation, hashes)', rc.ok === true, { actual: rc });
        const br = verifyModelReceipt(out.receipt);
        s.assert('the receipt as saved in the run carries the model\'s signature, and the browser verifier accepts it on its own', br.ok === true, { actual: br });
        s.assert('changing the response hash in the saved receipt makes the browser check fail', verifyModelReceipt({ ...out.receipt, responseSha256: '00'.repeat(32) }).ok === false);
        review = { attempts, cyLabel, labels: Object.fromEntries(analyseRun({ lines: planted }).rows.map((r) => [planted[r.i].person, r.label])), rules: RULES, stated: STATED, sent: out.sent, findings: out.findings, summary: out.summary, questions: out.questions, codeFlags: out.codeFlags, receipt: out.receipt, secrets, briefChars: REVIEWER_BRIEF.length, briefSha256: crypto.createHash('sha256').update(REVIEWER_BRIEF).digest('hex') };
        s.evidence('review', review);
      });

      let out = null; let settleHash = null; let chainHash = null;
      let approval = null;
      await ctx.step('prediction 3: the corrected run waits for its approver; a stranger cannot approve it; the approver checks the summary and approves', async (s) => {
        await sendRun(lines());
        out = await coordinator.runPayrun(runParams);
        s.assert('the run says it needs the approver\'s sign-off', out.outcome.approval?.required === true && out.outcome.approval?.approver === P.ap.id, { actual: out.outcome.approval });
        const early = await coordinator.signSettlement({ ...round, allocations: out.allocations, orderHash: out.orderHash, charges: out.charges }).then(() => 'signed', (e) => e.message);
        s.assert('the room refuses to sign before the approval', /approver/.test(early), { actual: early });
        const msg = payrunApprovalMessage({ ...round, runId: runParams.runId, orderHash: out.orderHash });
        const stranger = nearKeyPair();
        const bad = await member.approvePayrun({ runId: runParams.runId, orderHash: out.orderHash, approver: P.ap.id, publicKey: stranger.publicKey, signature: signInputWithNearKey(stranger.secretKey, msg) }).then(() => 'accepted', (e) => e.message);
        s.assert('an approval signed with a key that is not the approver\'s is refused', bad !== 'accepted', { actual: bad });
        const summary = JSON.parse(openFromModel(out.statements.approver.cipherHex, approverRead.secretX25519));
        s.assert('the approver\'s sealed summary matches the run (order hash, four people, gross 0.18, the transfers)', summary.orderHash === out.orderHash && summary.totals.headcount === 4 && summary.totals.gross === '0.18' && JSON.stringify(summary.allocations) === JSON.stringify(out.allocations), { actual: summary.totals });
        const kp = P.ap.key.keyPair;
        const ok = await member.approvePayrun({ runId: runParams.runId, orderHash: out.orderHash, approver: P.ap.id, publicKey: kp.getPublicKey().toString(), signature: signInputWithNearKey(kp.toString(), msg) });
        s.assert('the approver\'s own approval is accepted', ok.approved === true, { actual: ok });
        approval = { approver: P.ap.id, publicKey: kp.getPublicKey().toString(), message: msg, summaryCipherHex: out.statements.approver.cipherHex, summarySecretHex: hex(approverRead.secretX25519), strangerRefused: bad };
      });

      await ctx.step('prediction 4: the approved run settles with exact amounts on the production contract', async (s) => {
        const signed = await coordinator.signSettlement({ ...round, allocations: out.allocations, orderHash: out.orderHash, charges: out.charges });
        const tx = await chain.send(coord.account, 'settle_batch_charged', { syndicate_id: id, attestation_nonce: round.roundNonce, aggregate_order_hash: out.orderHash, allocations: out.allocations, charges: out.charges, enclave_signature: signed.signature }, { gas: 150000000000000n, label: 'settle_batch_charged pay run' });
        s.evidence('tx', { label: tx.label, hash: tx.hash, ok: tx.ok, explorer: tx.explorer, error: tx.error });
        s.assert('the contract accepted the settlement the VM signed', tx.ok, { actual: tx.error });
        settleHash = tx.hash;
        await waitSettled(toN('0.07'));
        const paid = (await chain.transfersOf(tx.hash, coord.id)).filter((m) => m.fromContract);
        const by = Object.fromEntries(paid.map((m) => [m.to, BigInt(m.amount)]));
        for (const k of PAYEES) s.assert(`${PEOPLE[k]}'s account received exactly ${NET[k]}`, by[P[k].id] === toN(NET[k]), { actual: String(by[P[k].id]) });
        s.assert('the tax account received exactly 0.027', by[P.tx.id] === toN('0.027'), { actual: String(by[P.tx.id]) });
        s.assert('the benefits account received exactly 0.009', by[P.bf.id] === toN('0.009'), { actual: String(by[P.bf.id]) });
        s.assert('six transfers moved and nothing else', paid.length === 6, { actual: paid.length });
        s.assert('the employer was charged exactly the gross total: 0.07 of 0.25 left', (await escrowOf('er')) === toN('0.07'), { actual: String(await escrowOf('er')) });
        chainHash = await onChainOrderHash(tx.hash);
        s.assert('the order hash in the settlement transaction on chain is the one the VM computed', chainHash === out.orderHash, { actual: chainHash });
      });

      await ctx.step('prediction 5: the private lines in the employer\'s statement add up to the public transfers on chain', async (s) => {
        const emp = JSON.parse(openFromModel(out.statements.employer.cipherHex, employerRead.secretX25519));
        const micro = (v) => { const [w, f = ''] = String(v).split('.'); return BigInt(w) * 1_000_000n + BigInt(f.padEnd(6, '0').slice(0, 6)); };
        const pay = emp.lines.filter((l) => l.receipt.kind === 'pay');
        const sum = (f) => pay.reduce((x, l) => x + micro(l.receipt[f]), 0n) * 10n ** 18n;
        const paid = (await chain.transfersOf(settleHash, coord.id)).filter((m) => m.fromContract); const by = Object.fromEntries(paid.map((m) => [m.to, BigInt(m.amount)]));
        s.assert('the four tax lines add up to the one tax transfer on chain', sum('tax') === by[P.tx.id], { actual: String(sum('tax')) });
        s.assert('the four benefits lines add up to the one benefits transfer on chain', sum('benefits') === by[P.bf.id], { actual: String(sum('benefits')) });
        s.assert('each person\'s net equals the transfer to their one-time address', pay.every((l) => micro(l.receipt.net) * 10n ** 18n === by[l.receipt.payee]));
        s.assert('the gross lines add up to what the employer was charged (0.18)', sum('gross') === toN('0.18'), { actual: String(sum('gross')) });
      });

      await ctx.step('prediction 6: each employee\'s payslip verifies against the order hash read from the chain; a changed or foreign one fails', async (s) => {
        for (const k of PAYEES) {
          const cipherHex = out.statements.payees[P[k].id].cipherHex;
          const v = verifyStatement({ cipherHex, secretX25519: readKeys[k].secretX25519, hostSettlePublicKey: out.settlePublicKey, onChainOrderHash: chainHash });
          s.assert(`${PEOPLE[k]}'s statement verifies against the order hash found on chain`, v.ok === true, { actual: v });
        }
        const doc = JSON.parse(openFromModel(out.statements.payees[P.p1.id].cipherHex, readKeys.p1.secretX25519)); doc.receipt.net = '0.05';
        const forged = verifyStatement({ cipherHex: sealToModel(JSON.stringify(doc), readKeys.p1.publicKeyHex), secretX25519: readKeys.p1.secretX25519, hostSettlePublicKey: out.settlePublicKey, onChainOrderHash: chainHash });
        s.assert('a receipt with the net raised to 0.05 fails verification', forged.ok === false);
        const cross = verifyStatement({ cipherHex: out.statements.payees[P.p2.id].cipherHex, secretX25519: readKeys.p1.secretX25519, hostSettlePublicKey: out.settlePublicKey, onChainOrderHash: chainHash });
        s.assert('one payee cannot open another\'s statement', cross.ok === false);
      });

      let packEvidence = null;
      await ctx.step('prediction 7: the employer opens one line for the auditor; the auditor verifies it; nobody else can ask', async (s) => {
        const kp = employerKeys();
        const emp = JSON.parse(openFromModel(out.statements.employer.cipherHex, employerRead.secretX25519));
        const boIdx = emp.lines.findIndex((l) => l.receipt.person === 'Bo'); const indices = [boIdx];
        const ask = (key, pub) => member.openAuditLines({ runId: runParams.runId, indices, auditorKeyHex: auditor.publicKeyHex, employer: P.er.id, publicKey: pub, signature: signInputWithNearKey(key, auditOpenMessage({ runId: runParams.runId, indices, auditorKeyHex: auditor.publicKeyHex })) });
        const res = await ask(kp.toString(), kp.getPublicKey().toString());
        const pack = JSON.parse(openFromModel(res.packCipherHex, auditor.secretX25519));
        s.assert('the auditor verifies the pack against the order hash found on chain', verifyAuditorPack(pack, chainHash).ok === true);
        s.assert('it holds exactly one line, Bo\'s', pack.opened.length === 1 && pack.opened[0].leaf.person === 'Bo', { actual: pack.opened.map((o) => o.leaf.person) });
        const text = JSON.stringify(pack); s.assert('it names no other person', !text.includes('Alice') && !text.includes('Cy') && !text.includes('Dee'));
        const stranger = nearKeyPair();
        const refused = await ask(stranger.secretKey, stranger.publicKey).then(() => 'accepted', (e) => e.message);
        s.assert('a request signed by anyone else is refused', refused !== 'accepted', { actual: refused });
        s.observe('how it was refused', refused);
        packEvidence = { packCipherHex: res.packCipherHex, lines: res.lines, refused };
      });

      await ctx.step('prediction 8: everything a page needs to show this run is saved as evidence', async (s) => {
        const evidence = {
          runId: runParams.runId, orderHash: chainHash, settleTx: settleHash, settlePublicKey: out.settlePublicKey,
          taxAddress: P.tx.id, benefitsAddress: P.bf.id, employerAddress: P.er.id, allocations: out.allocations, charged: out.charges[0].amount,
          approval,
          people: PAYEES.map((k) => ({ name: PEOPLE[k], payee: P[k].id, cipherHex: out.statements.payees[P[k].id].cipherHex, publicKeyHex: readKeys[k].publicKeyHex, secretHex: hex(readKeys[k].secretX25519), })),
          employer: { cipherHex: out.statements.employer.cipherHex, secretHex: hex(employerRead.secretX25519) },
          auditor: { packCipherHex: packEvidence.packCipherHex, totalsCipherHex: out.statements.auditor.cipherHex, secretHex: hex(auditor.secretX25519), openedName: 'Bo', lines: packEvidence.lines, refused: packEvidence.refused },
          note: 'The throwaway keys here were made for this run, hold nothing, and exist only on testnet. They are saved so that a page can open and check the receipts without trusting the machine that made them.',
        };
        s.evidence('paper-trail', evidence);
        s.assert('the evidence holds four receipts, the employer statement, the pack and the totals view', evidence.people.length === 4 && !!evidence.employer.cipherHex && !!evidence.auditor.packCipherHex && !!evidence.auditor.totalsCipherHex);
        s.assert('the review evidence was recorded', review && review.findings.length > 0);
      });
    } finally {
      await ctx.step('prediction 9: teardown of the chain side (members exit with their remainders, group pruned, accounts deleted)', async (st) => {
        if (!P) { st.assert('nothing to tear down', true); return; }
        const rep = await teardownMembers(chain, { rootDir: ctx.rootDir, members: P.all, pruneIds: created, exitWaitMs: 180000 });
        st.observe('teardown', { pruned: rep.pruned.length, notPruned: rep.notPruned, deleted: rep.deleted.length, kept: rep.kept, failed: rep.failed });
        st.assert('the group was pruned and every account deleted', rep.notPruned.length === 0 && rep.failed.length === 0 && rep.deleted.length === 8, { actual: rep });
        st.assert('the contract holds the groups it started with', Number(await chain.view('get_syndicate_count', {})) === countBefore, { expected: countBefore });
      }, { always: true });
      await ctx.step('prediction 9: teardown: delete the VM and prove the account is empty', async (s) => {
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
