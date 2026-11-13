import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Account, KeyPair, KeyPairSigner } from 'near-api-js';
import { connect, near, fmt, loadEnvFile } from '../lib/near.js';
import { roostFromEnv, createRoostServer } from '../../src/roost-service/server.js';
import { buildPlayground } from '../../src/playground/app.js';
import { defaultLines } from '../../src/playground/defaults.js';
import { nearKeyPair, signInputWithNearKey, generateClientKey, openFromModel, sealToModel } from '../../src/browser/midge-client.js';
import { verifyStatement, verifyModelReceipt, checkSettlementOrderHash } from '../../src/browser/midge-verify.js';

const ADMIN = 'local-admin-key-for-this-experiment-only';
const RPCS = 'https://test.rpc.fastnear.com,https://near-testnet.drpc.org';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const toN = (x) => near(String(x));

export default {
  id: 'E-PLAYGROUND-LOCAL-01',
  title: 'The playground end to end on real testnet with the real NEAR AI Cloud model, a scripted visitor using the browser code, and a room run in this process with a simulated attestation',
  tier: 'testnet',
  requires: ['near-key', 'network', 'nearai-key'],
  hypothesis: 'Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. The live model catches a planted line with no tax withheld and its signed receipt verifies in the browser code; the gate refuses a round after one edit and allows it after a new review; the room accepts the approval signed by the visitor\'s own key and refuses a stranger\'s; the contract settles with exact amounts and the visitor\'s own account holds its net pay; the payslip verifies against the order hash read from the chain and fails when the net is raised; and every service-held account and the group are gone afterwards.',
  limits: [
    'The room runs in this process with a simulated attestation provider, so this is not a hardware claim. E-PLAYGROUND-LIVE-01 runs the same flow against the deployed service and the real attested room.',
    'The main account of the lab funds the run, as in every lab experiment. In production a dedicated funder account does.',
    'The scripted visitor uses the same browser modules as the page, but it is not a browser. The page is checked separately.',
    'The planted mistake is planted: it shows the reviewer catching a kind of mistake its instructions name, not every real one.',
  ],
  async run(ctx) {
    const chain = await connect(ctx.rootDir);
    const env = loadEnvFile(ctx.rootDir);
    const apiKey = env.NEARAI_API_KEY || process.env.NEARAI_API_KEY;
    let roomServer = null; let app = null; let base = null; let countBefore = null;
    const V = nearKeyPair(); const payee = generateClientKey(); const stranger = nearKeyPair();
    let visitorAccount = null;
    const api = async (method, p, body) => { const r = await fetch(`${base}${p}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
    const until = async (fn, { timeoutMs = 360000, everyMs = 2000, what = 'condition' } = {}) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > timeoutMs) throw new Error(`timed out waiting for ${what}`); await sleep(everyMs); } };
    const session = `local-${Date.now().toString(36)}`;
    const lines = defaultLines(); lines[2].tax = '0'; // Cy: no tax withheld
    const onChainOrderHash = async (hash, sender) => {
      const r = await (await fetch('https://test.rpc.fastnear.com', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tx', params: { tx_hash: hash, sender_account_id: sender, wait_until: 'FINAL' } }) })).json();
      const a = r.result.transaction.actions.find((x) => x.FunctionCall)?.FunctionCall;
      return JSON.parse(Buffer.from(a.args, 'base64').toString('utf8')).aggregate_order_hash;
    };

    try {
      await ctx.step('preflight: the NEAR AI key is present and the main account can pay for a round', async (s) => {
        s.assert('a NEAR AI Cloud key is present', typeof apiKey === 'string' && apiKey.length > 10);
        const have = await chain.balance(chain.master);
        s.observe('main account balance (NEAR)', fmt(have, 3));
        s.assert('the main account holds at least 3 NEAR', have >= toN(3), { actual: fmt(have, 3) });
      }, { critical: true });

      await ctx.step('set up: a room in this process, and the playground service pointed at it', async (s) => {
        countBefore = Number(await chain.view('get_syndicate_count', {}));
        const provider = { simulated: true, attest: async () => Buffer.from('local-playground-no-hardware'), info: async () => ({}) };
        const roost = roostFromEnv({ ROOST_RPC_URLS: RPCS, ROOST_CONTRACT_ID: chain.coordinatorId, ROOST_REQUIRE_SIGNED_INPUTS: '1', ROOST_ACCOUNT_CHECK_RPC_URLS: RPCS }, provider);
        roomServer = createRoostServer({ roost, adminKey: ADMIN });
        await new Promise((r) => roomServer.listen(0, '127.0.0.1', r));
        app = buildPlayground({ env: { FUNDER_ID: chain.masterId, FUNDER_KEY: chain.env.NEAR_PRIVATE_KEY, ROOM_URL: `http://127.0.0.1:${roomServer.address().port}`, ROOM_ADMIN_KEY: ADMIN, NEARAI_API_KEY: apiKey, NEAR_CONTRACT_ID: chain.coordinatorId, PLAYGROUND_ORIGIN: 'http://localhost', PLAYGROUND_PER_ADDRESS: '20', PLAYGROUND_FUNDER_FLOOR_NEAR: '1', PLAYGROUND_LEDGER: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'playground-ledger-')), 'ledger.json') }, overrides: { waker: null } });
        const port = await app.start(0); base = `http://127.0.0.1:${port}`;
        const room = await api('GET', '/api/room');
        s.assert('the service proxies the room\'s public keys', /^[0-9a-f]{64}$/.test(room.json.session?.intentPublicKey) && /^[0-9a-f]{64}$/.test(room.json.session?.settlePublicKey), { actual: room.json });
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
        const paid = (await app.chain.transfersOf(done.settleTx, done.settlerId)).filter((m) => m.fromContract);
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
        await app.round.idle();
        // A deletion is sent before it is final, so poll for up to 60 seconds instead of reading once.
        const stillThere = async () => (await Promise.all(done.cast.filter((c) => c.role !== 'you').map(async (c) => ({ id: c.id, there: await chain.provider.query({ request_type: 'view_account', finality: 'final', account_id: c.id }).then(() => true, () => false) })))).filter((g) => g.there);
        let gone = await stillThere();
        for (let i = 0; i < 30 && gone.length; i += 1) { await sleep(2000); gone = await stillThere(); }
        s.assert('the employer, the three other employees, the tax and the benefits accounts are deleted', gone.length === 0, { actual: gone });
        s.assert('the visitor\'s account is still there', await chain.provider.query({ request_type: 'view_account', finality: 'final', account_id: visitorAccount }).then(() => true, () => false));
        s.assert('the ledger is empty', app.ledger.all().length === 0, { actual: app.ledger.all() });
        s.assert('the contract holds the groups it started with', Number(await chain.view('get_syndicate_count', {})) === countBefore, { expected: countBefore });
      });
    } finally {
      await ctx.step('teardown: stop the service and the room, and the visitor deletes their own account', async (s) => {
        if (app) {
          await app.stop().catch(() => {});
          // Whatever a failed round could not clean up is still in the ledger. Clean it up here, so a failed experiment does not leave accounts or a group behind.
          await app.round.sweepStartup().catch(() => {});
          s.assert('nothing is left in the ledger after the final sweep', app.ledger.all().length === 0, { actual: app.ledger.all() });
          s.assert('the contract holds the groups it started with', Number(await chain.view('get_syndicate_count', {})) === countBefore, { expected: countBefore });
        }
        if (roomServer) await new Promise((r) => roomServer.close(r));
        if (visitorAccount) {
          const acct = new Account(visitorAccount, chain.provider, new KeyPairSigner(KeyPair.fromString(V.secretKey)));
          const deleted = await acct.deleteAccount(chain.masterId).then(() => true, (e) => String(e.message).slice(0, 120));
          s.assert('the visitor\'s account was deleted with its key, returning the balance to the main account', deleted === true, { actual: deleted });
        } else s.assert('no visitor account was created', true);
      }, { always: true });
    }
  },
};
