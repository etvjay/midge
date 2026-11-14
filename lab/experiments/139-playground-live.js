import fs from 'node:fs';
import path from 'node:path';
import { Account, KeyPair, KeyPairSigner } from 'near-api-js';
import { connect, near, fmt, loadEnvFile } from '../lib/near.js';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { startVerifier } from '../lib/phala.js';
import { npxEnv } from '../lib/npx-env.js';
import { verifyHostedAttestation } from '../../src/roost-service/verify-hosted.js';
import { expectedComposeHashes } from '../../src/roost-service/compose-hash.js';
import { defaultLines } from '../../src/playground/defaults.js';
import { nearKeyPair, signInputWithNearKey, generateClientKey, openFromModel, sealToModel } from '../../src/browser/midge-client.js';
import { verifyStatement, verifyModelReceipt, checkSettlementOrderHash } from '../../src/browser/midge-verify.js';

const run = promisify(execFile);
const envFile = () => { try { return Object.fromEntries(fs.readFileSync(`${process.env.HOME}/.midge-phala/playground.env`, 'utf8').split('\n').filter(Boolean).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])); } catch { return {}; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const toN = (x) => near(String(x));

export default {
  id: 'E-PLAYGROUND-LIVE-01',
  title: 'The deployed playground end to end: the service wakes the stopped hardware room, the room\'s attestation verifies, and a scripted visitor using the browser code reviews, approves, is paid on testnet and checks the payslip',
  tier: 'hardware',
  requires: ['phala-key', 'near-key', 'network', 'docker', 'nearai-key', 'dcap-qvl'],
  hypothesis: 'Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. The same flow as E-PLAYGROUND-LOCAL-01 holds against the deployed service and the real attested room, after the room has been stopped and woken by the service, with the room\'s attestation verifying as in the other hardware runs.',
  limits: [
    'One operator runs the service, the room and every account. This is the system working on real hardware, not independent parties.',
    'The scripted visitor uses the page\'s modules but is not a browser. The page is checked separately, by scripts/playground-smoke.mjs and by hand against the deployed site.',
    'The funder-low refusal is covered offline (E-PLAYGROUND-SERVICE-01) and was not forced here, because that would mean spending the funder down on purpose.',
    'The planted mistake is planted: it shows the reviewer catching a kind of mistake its instructions name, not every real one.',
  ],
  async run(ctx) {
    const chain = await connect(ctx.rootDir);
    const cfg = { ...envFile(), ...(process.env.PLAYGROUND_URL ? { PLAYGROUND_URL: process.env.PLAYGROUND_URL } : {}), ...(process.env.ROOM_CVM_ID ? { ROOM_CVM_ID: process.env.ROOM_CVM_ID } : {}), ...(process.env.ROOM_URL ? { ROOM_URL: process.env.ROOM_URL } : {}) };
    const base = String(cfg.PLAYGROUND_URL || '').replace(/\/$/, '');
    const phalaEnv = npxEnv({ ...process.env, PHALA_CLOUD_API_KEY: loadEnvFile(ctx.rootDir).PHALA_CLOUD_API_KEY || process.env.PHALA_CLOUD_API_KEY });
    const phala = (args) => run('npx', ['--yes', 'phala@1.2.0', ...args], { cwd: ctx.rootDir, env: phalaEnv, timeout: 300000, maxBuffer: 20 * 1024 * 1024 });
    let verifier = null; let countBefore = null;
    const V = nearKeyPair(); const payee = generateClientKey(); const stranger = nearKeyPair();
    let visitorAccount = null;
    const api = async (method, p, body) => { const r = await fetch(`${base}${p}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
    const until = async (fn, { timeoutMs = 360000, everyMs = 2000, what = 'condition' } = {}) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > timeoutMs) throw new Error(`timed out waiting for ${what}`); await sleep(everyMs); } };
    const session = `live-${Date.now().toString(36)}`;
    const lines = defaultLines(); lines[2].tax = '0'; // Cy: no tax withheld
    const onChainOrderHash = async (hash, sender) => {
      const r = await (await fetch('https://test.rpc.fastnear.com', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tx', params: { tx_hash: hash, sender_account_id: sender, wait_until: 'FINAL' } }) })).json();
      const a = r.result.transaction.actions.find((x) => x.FunctionCall)?.FunctionCall;
      return JSON.parse(Buffer.from(a.args, 'base64').toString('utf8')).aggregate_order_hash;
    };

    try {
      await ctx.step('preflight: the deployed service is named and answers, and the room it wakes is a machine we can stop and start', async (s) => {
        s.assert('the service address (PLAYGROUND_URL) and the room\'s machine id (ROOM_CVM_ID) and address (ROOM_URL) are set', /^https:\/\//.test(base) && Boolean(cfg.ROOM_CVM_ID) && /^https:\/\//.test(String(cfg.ROOM_URL || '')), { actual: { base, cvm: cfg.ROOM_CVM_ID, room: cfg.ROOM_URL } });
        const h = await fetch(`${base}/api/health`).then((r) => r.json(), () => null);
        s.assert('the service answers its health check', h?.ok === true, { actual: h });
        const have = await chain.balance(chain.master);
        s.assert('the main account holds at least 0.5 NEAR, which this experiment needs to delete the visitor\'s account', have >= toN(0.5), { actual: fmt(have, 3) });
      }, { critical: true });

      await ctx.step('prediction 1: with the room stopped, opening the page wakes it and it becomes healthy within about 150 seconds', async (s) => {
        countBefore = Number(await chain.view('get_syndicate_count', {}));
        const stopped = await phala(['cvms', 'stop', '--cvm-id', cfg.ROOM_CVM_ID, '--json']).then(() => true, (e) => String(e.message).slice(0, 200));
        s.assert('the room machine was stopped', stopped === true, { actual: stopped });
        await until(async () => !(await fetch(`${cfg.ROOM_URL}/healthz`, { signal: AbortSignal.timeout(5000) }).then((r) => r.ok, () => false)), { timeoutMs: 90000, what: 'the room to go offline' });
        const t0 = Date.now();
        const warm = await api('GET', '/api/warm');
        s.assert('the warm call answers at once, without waiting for the room', warm.status === 200 && Date.now() - t0 < 5000, { actual: { status: warm.status, ms: Date.now() - t0 } });
        await until(async () => (await api('GET', '/api/health')).json?.room?.state === 'up' && await fetch(`${cfg.ROOM_URL}/healthz`, { signal: AbortSignal.timeout(5000) }).then((r) => r.ok, () => false), { timeoutMs: 180000, everyMs: 3000, what: 'the room to wake up' });
        const secs = Math.round((Date.now() - t0) / 1000);
        s.observe('seconds from the warm call to a healthy room', secs);
        s.assert('the room is healthy again within 150 seconds of being asked', secs <= 150, { actual: secs });
      }, { critical: true });

      await ctx.step('prediction 2: the woken room\'s attestation verifies as in the other hardware runs, and its settlement key is the one the service hands out', async (s) => {
        const expected = JSON.parse(fs.readFileSync(path.join(ctx.rootDir, 'roost.expected.json'), 'utf8'));
        const ourCompose = fs.readFileSync(path.join(ctx.rootDir, 'deploy/roost/docker-compose.yml'), 'utf8');
        const cvm = JSON.parse((await phala(['cvms', 'get', '--cvm-id', cfg.ROOM_CVM_ID, '--json'])).stdout.replace(/^[^{]*/, ''));
        const derived = expectedComposeHashes({ cvmJson: cvm, ourCompose });
        s.assert('Phala\'s app-compose contains our room compose file byte for byte', derived.ok && derived.matchesOurCompose, { actual: derived });
        verifier = await startVerifier();
        const nonce = crypto.randomBytes(32).toString('hex');
        const r = await api('GET', `/api/room?nonce=${nonce}`);
        const attested = r.json.attestation;
        const verification = await verifyHostedAttestation(attested, { nonce, verifierUrl: verifier.url, composeHash: derived.candidates, osImageHashes: expected.osImageHashes });
        for (const c of verification.checks) s.assert(c.name, c.ok, { actual: c.detail });
        s.assert('the room does not claim to be a simulator', attested.simulated === false);
        s.assert('the settlement key the service hands out is the attested one', r.json.session.settlePublicKey === attested.settlePublicKey);
        s.evidence('attestation', { composeHash: verification.details?.composeHash, osImageHash: verification.details?.osImageHash });
      }, { critical: true });

      let review = null;
      await ctx.step('prediction 1: the live model catches the planted line, and its signed receipt verifies with the browser code', async (s) => {
        const r = await api('POST', '/api/review', { session, lines });
        review = r.json; s.evidence('review', { used: review.used, findings: review.findings, labels: review.labels, receipt: review.receipt, summary: review.summary });
        s.assert('the review ran', r.status === 200 && review.used === true, { actual: review.reason || review });
        const cyLabel = review.labels?.[2];
        s.assert('it found a verified finding on Cy\'s line (no tax withheld)', review.findings.some((f) => f.line === cyLabel && ['zero-deduction', 'rate-below-schedule'].includes(f.code) && f.check === 'verified'), { actual: review.findings });
        const wire = JSON.stringify(review.sent || {});
        s.assert('what was sent to the model holds no name, no exact amount', !['Alice', 'Bo', 'Cy', 'Dee', '0.0075', '0.0045', '0.009'].some((x) => wire.includes(x)), { actual: wire.slice(0, 200) });
        const rc = verifyModelReceipt(review.receipt);
        s.assert('the model\'s signed receipt verifies with the browser code', rc.ok === true, { actual: rc });
      });

      let ticket = null; let corrected = null;
      await ctx.step('prediction 2: one edit closes the gate, a new review of the corrected lines opens it', async (s) => {
        const edited = lines.map((l) => ({ ...l })); edited[0].gross = '0.051';
        const refused = await api('POST', '/api/rounds', { session, visitorPublicKey: V.publicKey, payeeKeyHex: payee.publicKeyHex, lines: edited, youIndex: 3 });
        s.assert('a round for lines that were edited after the review is refused with 403', refused.status === 403 && /changed after the last review/.test(refused.json.error), { actual: refused });
        corrected = defaultLines();
        const r2 = await api('POST', '/api/review', { session, lines: corrected });
        s.assert('the corrected lines are reviewed', r2.json.used === true, { actual: r2.json.reason });
        const joined = await api('POST', '/api/rounds', { session, visitorPublicKey: V.publicKey, payeeKeyHex: payee.publicKeyHex, lines: corrected, youIndex: 3 });
        s.assert('and then a round is accepted', joined.status === 200 && /^[0-9a-f]{32}$/.test(joined.json.ticket), { actual: joined });
        ticket = joined.json.ticket;
      });

      let wait = null;
      await ctx.step('prediction 3: the round reaches the approval step, the room refuses a stranger\'s approval and accepts the visitor\'s own', async (s) => {
        wait = await until(async () => { const r = await api('GET', `/api/rounds/${ticket}`); if (r.json.step === 'failed') throw new Error(`the round failed: ${r.json.detail?.reason}`); return r.json.step === 'awaiting-approval' ? r.json.detail : null; }, { what: 'the approval step' });
        s.evidence('approval', { approver: wait.approver, orderHash: wait.orderHash, cast: wait.cast });
        s.assert('the approval message names the contract, the group and the order hash', wait.approvalMessage.startsWith(`midge-payrun-approval-v1:${chain.coordinatorId}:`) && wait.approvalMessage.endsWith(`:${wait.orderHash}`), { actual: wait.approvalMessage });
        const summary = JSON.parse(openFromModel(wait.summaryCipherHex, payee.secretX25519));
        s.assert('the summary sealed to the visitor opens with the visitor\'s payslip key and matches the order hash', summary.orderHash === wait.orderHash && summary.totals.headcount === 4 && summary.totals.gross === '0.18', { actual: summary.totals });
        const bad = await api('POST', `/api/rounds/${ticket}/approve`, { publicKey: stranger.publicKey, signature: signInputWithNearKey(stranger.secretKey, wait.approvalMessage) });
        s.assert('an approval signed with a key that is not the approver\'s is refused by the room', bad.status === 400 && /not a key of/.test(bad.json.error), { actual: bad });
        const ok = await api('POST', `/api/rounds/${ticket}/approve`, { publicKey: V.publicKey, signature: signInputWithNearKey(V.secretKey, wait.approvalMessage) });
        s.assert('the visitor\'s own approval is accepted', ok.status === 200 && ok.json.approved === true, { actual: ok });
      });

      let done = null;
      await ctx.step('prediction 4: the contract settles with exact amounts and the visitor\'s own account holds its net pay', async (s) => {
        done = await until(async () => { const r = await api('GET', `/api/rounds/${ticket}`); if (r.json.step === 'failed') throw new Error(`the round failed: ${r.json.detail?.reason}`); return r.json.step === 'done' ? r.json.detail : null; }, { what: 'the settlement' });
        visitorAccount = done.visitorAccount;
        s.evidence('tx', { label: 'playground settlement', hash: done.settleTx, ok: true, explorer: `https://testnet.nearblocks.io/txns/${done.settleTx}` });
        s.evidence('result', { visitorAccount, orderHash: done.orderHash, cast: done.cast });
        const paid = (await chain.transfersOf(done.settleTx, done.settlerId)).filter((m) => m.fromContract);
        const by = Object.fromEntries(paid.map((m) => [m.to, BigInt(m.amount)]));
        s.assert('the visitor received exactly Dee\'s net, 0.048 NEAR', by[visitorAccount] === toN('0.048'), { actual: String(by[visitorAccount]) });
        const tax = done.cast.find((c) => c.role === 'tx').id; const ben = done.cast.find((c) => c.role === 'bf').id;
        s.assert('the tax account received 0.0270 and the benefits account 0.0090 in one transfer each', by[tax] === toN('0.027') && by[ben] === toN('0.009'), { actual: { tax: String(by[tax]), ben: String(by[ben]) } });
        s.assert('there are six transfers in all: the tax, the benefits and four employees', paid.length === 6, { actual: paid.length });
        const bal = BigInt((await chain.provider.query({ request_type: 'view_account', finality: 'final', account_id: visitorAccount })).amount);
        s.assert('the visitor\'s own account holds its 0.01 starting balance plus 0.048', bal === toN('0.058'), { actual: fmt(bal, 6) });
      });

      await ctx.step('prediction 5: the payslip verifies against the order hash read from the chain, and fails when the net is raised or opened with the wrong key', async (s) => {
        const hash = await onChainOrderHash(done.settleTx, done.settlerId);
        s.assert('the order hash read from the settlement transaction is the one the room returned', hash === done.orderHash, { actual: hash });
        const live = await checkSettlementOrderHash({ rpcUrls: ['https://test.rpc.fastnear.com', 'https://near-testnet.drpc.org'], txHash: done.settleTx, senderId: done.settlerId, expectedOrderHash: done.orderHash });
        s.assert('the browser\'s live check of the settlement agrees across two providers', live.verdict === 'recomputed', { actual: live });
        const host = (await api('GET', '/api/room')).json.session.settlePublicKey;
        const good = verifyStatement({ cipherHex: done.payslipCipherHex, secretX25519: payee.secretX25519, hostSettlePublicKey: host, onChainOrderHash: hash });
        s.assert('the visitor\'s payslip verifies and carries net 0.048', good.ok === true && good.receipt.net === '0.048', { actual: good.receipt });
        const doc = JSON.parse(openFromModel(done.payslipCipherHex, payee.secretX25519)); doc.receipt.net = '0.058';
        s.assert('a payslip with the net raised to 0.058 fails', verifyStatement({ cipherHex: sealToModel(JSON.stringify(doc), payee.publicKeyHex), secretX25519: payee.secretX25519, hostSettlePublicKey: host, onChainOrderHash: hash }).ok === false);
        s.assert('a payslip opened with another key fails', verifyStatement({ cipherHex: done.payslipCipherHex, secretX25519: generateClientKey().secretX25519, hostSettlePublicKey: host, onChainOrderHash: hash }).ok === false);
      });

      await ctx.step('prediction 6: every service-held account and the group are gone, the ledger is empty, and the contract holds the groups it started with', async (s) => {
        // A deletion is sent before it is final, so poll for up to 60 seconds instead of reading once.
        const stillThere = async () => (await Promise.all(done.cast.filter((c) => c.role !== 'you').map(async (c) => ({ id: c.id, there: await chain.provider.query({ request_type: 'view_account', finality: 'final', account_id: c.id }).then(() => true, () => false) })))).filter((g) => g.there);
        let gone = await stillThere();
        for (let i = 0; i < 75 && gone.length; i += 1) { await sleep(2000); gone = await stillThere(); }
        s.assert('the employer, the three other employees, the tax and the benefits accounts are deleted', gone.length === 0, { actual: gone });
        s.assert('the visitor\'s account is still there', await chain.provider.query({ request_type: 'view_account', finality: 'final', account_id: visitorAccount }).then(() => true, () => false));
        await until(async () => Number(await chain.view('get_syndicate_count', {})) === countBefore, { timeoutMs: 120000, what: 'the group to be pruned' }).catch(() => {});
        s.assert('the contract holds the groups it started with', Number(await chain.view('get_syndicate_count', {})) === countBefore, { expected: countBefore });
      });
    } finally {
      await ctx.step('teardown: the verifier stops, and the visitor deletes their own account', async (s) => {
        if (verifier) await verifier.stop().catch(() => {});
        if (visitorAccount) {
          const acct = new Account(visitorAccount, chain.provider, new KeyPairSigner(KeyPair.fromString(V.secretKey)));
          const deleted = await acct.deleteAccount(chain.masterId).then(() => true, (e) => String(e.message).slice(0, 120));
          s.assert('the visitor\'s account was deleted with its key, returning the balance to the main account', deleted === true, { actual: deleted });
        } else s.assert('no visitor account was created', true);
      }, { always: true });
    }
  },
};
