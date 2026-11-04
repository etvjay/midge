import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { FlyApiDaemon } from '../../src/api/server.js';
import { FlyClient } from '../../src/sdk/client.js';
import { FlyMcpServer, FLY_MCP_TOOLS } from '../../src/mcp/server.js';
import { FlyNestContract } from '../../src/contracts/nest.js';
import { createRoost } from '../../src/enclave/factory.js';
import { EnclaveCrypto } from '../../src/enclave/crypto.js';
import { httpRoutes, matchRoute, sdkMethods } from '../lib/surface.js';

const PIN = { routes: 32, sdk: 26, mcp: 10 }; // a source change moves these and forces a human to look

/** Stand-in for the NEAR AI attestation endpoint the compute facility calls, so the offline tier stays offline. */
const ATTEST_FIXTURE = { gateway_attestation: { intel_quote: 'fixture-quote', signing_address: '0xfixture-gateway' }, model_attestations: [{ signing_address: '0xfixture-model', payload_matches_model: true }] };

export default {
  id: 'E-IFACE-MODEL',
  title: 'Every HTTP route, SSE stream, SDK method and MCP tool is exercised, and the interfaces tell the truth',
  tier: 'offline',
  requires: [],
  hypothesis: 'Every route the API declares, every method the SDK exposes and every MCP tool is exercised at least once against a local daemon in model mode, and none of them reports success for something it did not do. The failure that must NOT happen: a tool that answers "valid", "sealed" or "matched" without having verified, sealed or matched anything, or a single request that takes the server down.',
  limits: [
    'Model mode and a local Roost: this checks the interfaces\' behaviour and honesty, not the chain. The chain paths are E-IFACE-CHAIN.',
    'The compute facility\'s network call is replaced by a recorded fixture; the code path from the route to the facility is real, the attestation is not.',
    'Coverage means "called with at least one valid and one invalid input and the result asserted", not exhaustive input testing.',
    'Several API behaviours that are unsafe outside model mode are pinned here as KNOWN GAPs: the experiment asserts the current behaviour and records a problem, so fixing one turns this red and forces the gap to be closed in the ledger.',
  ],
  async run(ctx) {
    const root = ctx.rootDir;
    const routes = httpRoutes(root);
    const tag = Date.now().toString(36);
    const hits = { http: new Map(), sdk: new Set(), mcp: new Set(), sse: new Set() };
    let currentSdk = null;
    const sdkViaHttp = new Map(); // route key -> sdk method that reached it
    const seenFetch = async (url, opts = {}) => {
      const u = new URL(url);
      const r = matchRoute(routes, opts.method || 'GET', u.pathname);
      const key = r ? r.key : `UNMATCHED ${opts.method || 'GET'} ${u.pathname}`;
      hits.http.set(key, (hits.http.get(key) || 0) + 1);
      if (currentSdk && r) sdkViaHttp.set(r.key, currentSdk);
      return fetch(url, opts);
    };
    const origFetch = globalThis.fetch;
    let daemon; let base; let sdk;
    const raw = async (method, p, body, headers = {}) => {
      const res = await seenFetch(base + p, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
      const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
      return { status: res.status, headers: res.headers, json, text };
    };

    await ctx.step('derive the interface surface from source', async (s) => {
      const sdkNames = sdkMethods(root);
      s.observe('http routes', routes.map((r) => r.key));
      s.observe('sdk methods', sdkNames);
      s.observe('mcp tools', FLY_MCP_TOOLS.map((t) => t.name));
      s.assert(`the extractor finds ${PIN.routes} routes (a different number means the source changed: review the new routes)`, routes.length === PIN.routes, { expected: PIN.routes, actual: routes.length });
      s.assert(`the SDK exposes ${PIN.sdk} methods`, sdkNames.length === PIN.sdk, { expected: PIN.sdk, actual: sdkNames.length });
      s.assert(`the MCP server lists ${PIN.mcp} tools`, FLY_MCP_TOOLS.length === PIN.mcp, { expected: PIN.mcp, actual: FLY_MCP_TOOLS.length });
      s.assert('exactly two routes are SSE streams', routes.filter((r) => r.sse).length === 2, { actual: routes.filter((r) => r.sse).map((r) => r.key) });
      s.assert('the matcher attributes a member path to the member route, not the by-id route', matchRoute(routes, 'GET', '/v1/syndicates/member/a.near')?.key === 'GET /v1/syndicates/member/*');
    }, { critical: true });

    try {
      await ctx.step('start the API daemon in model mode with a local Roost', async (s) => {
        daemon = new FlyApiDaemon({ port: 0, mode: 'model', roostBackend: 'local' });
        const { port } = await daemon.start();
        base = `http://127.0.0.1:${port}`;
        const client = new FlyClient({ baseUrl: base, fetchFn: seenFetch });
        sdk = new Proxy(client, { get(t, p) { const v = t[p]; if (typeof v !== 'function' || String(p).startsWith('_') || p === 'constructor') return v; return async (...a) => { hits.sdk.add(String(p)); currentSdk = String(p); try { return await v.apply(t, a); } finally { currentSdk = null; } }; } });
        const h = await raw('GET', '/health');
        s.assert('the daemon answers /health', h.status === 200 && h.json?.status === 'OK', { actual: h.status });
        s.assert('responses say they are model mode, so nobody mistakes them for chain results', h.json?.mode === 'model' && /MODEL MODE/.test(h.json?.notice || ''), { actual: h.json });
      }, { critical: true });

      const synId = `iface-${tag}`;
      await ctx.step('SDK: syndicate lifecycle (hatch, get, list, by member, deposit, settle, hatch-out)', async (s) => {
        const hatched = await sdk.hatchSyndicate({ id: synId, quorumThreshold: 1, maxSpendNear: 100, timeoutBlocks: 50 });
        s.assert('hatchSyndicate returns the id, a sub-account and an active status', hatched.syndicateId === synId && /ACTIVE/i.test(hatched.status) && hatched.subAccount?.startsWith(synId), { actual: hatched });
        s.assert('a round nonce is issued', typeof hatched.roundNonce === 'string' && hatched.roundNonce.length >= 32);
        const dep = await sdk.deposit(synId, 'alice.near', 5);
        s.assert('deposit records the amount and the new escrow total', dep.amount === 5 && dep.totalEscrow === 5, { actual: dep });
        const got = await sdk.getSyndicate(synId);
        s.assert('getSyndicate shows the escrow and the depositor', got.totalEscrow === 5 && got.activeFlyers?.includes('alice.near'), { actual: got });
        const list = await sdk.listSyndicates({ limit: 5 });
        s.assert('listSyndicates includes the new syndicate', list.syndicates.some((x) => x.id === synId), { actual: list.total });
        const mine = await sdk.getSyndicatesByMember('alice.near');
        s.assert('getSyndicatesByMember finds it for the depositor and for nobody else', mine.syndicates.some((x) => x.id === synId) && !(await sdk.getSyndicatesByMember('stranger.near')).syndicates.some((x) => x.id === synId));
        const settled = await sdk.settleBatch(synId, { allocations: [{ recipient: 'bob.near', amount: 1 }] });
        s.assert('settleBatch in model mode answers SETTLED_MODEL for an existing syndicate and says so', settled.status === 'SETTLED_MODEL' && settled.mode === 'model', { actual: settled });
        s.assert('settleBatch for a syndicate that does not exist is refused', await sdk.settleBatch('never-hatched-syn', { allocations: [] }).then(() => false, () => true));
        const out = await sdk.hatchOut(synId, 'alice.near');
        s.assert('hatchOut refunds the depositor in full', out.refundedTo === 'alice.near' && out.amount === 5 && out.remainingEscrow === 0, { actual: out });
        s.assert('a second hatchOut finds nothing to refund', await sdk.hatchOut(synId, 'alice.near').then(() => false, () => true));
      });

      await ctx.step('API: input validation and error behaviour', async (s) => {
        const bad = await raw('POST', '/v1/syndicates/hatch', { id: 'A' });
        s.assert('an invalid syndicate id is a 400', bad.status === 400, { actual: bad.status });
        const badq = await raw('POST', '/v1/syndicates/hatch', { id: `q-${tag}`, quorumThreshold: 0 });
        s.assert('a zero quorum is a 400', badq.status === 400, { actual: badq.status });
        const json = await seenFetch(base + '/v1/syndicates/hatch', { method: 'POST', body: '{bad' });
        s.assert('malformed JSON is a 400', json.status === 400, { actual: json.status });
        const unknown = await raw('GET', '/v1/nope');
        s.assert('an unknown path is a 404', unknown.status === 404, { actual: unknown.status });
        const ghost = await raw('GET', '/v1/syndicates/ghost-syn');
        s.assert('an unknown syndicate is a 404', ghost.status === 404);
        const ghostDep = await raw('POST', '/v1/syndicates/ghost-syn/deposit', { flyerId: 'x', amountNear: 1 });
        s.assert('depositing into an unknown syndicate is refused', ghostDep.status >= 400, { actual: ghostDep.status });
        if (ghostDep.status >= 500) s.problem('minor', 'a client error (deposit into an unknown syndicate) is reported as HTTP 500 instead of 404/409, so a client cannot tell its mistake from a server fault');
        const big = await seenFetch(base + '/v1/syndicates/hatch', { method: 'POST', body: JSON.stringify({ id: 'x'.repeat(600 * 1024) }) }).then((r) => r.status, () => 'socket-reset');
        s.assert('a 600 KB body is refused (413 or a closed socket)', big === 413 || big === 'socket-reset', { actual: big });
        const timelock = await raw('GET', `/v1/emergency/timelock/ghost-syn`);
        s.assert('the timelock of an unknown syndicate is a 404', timelock.status === 404);
      });

      await ctx.step('SDK: Roost (session key, attestation, sealing, aggregation)', async (s) => {
        const session = await sdk.getSessionKey();
        s.assert('the session key says which backend it is and that inputs are NOT hidden from the operator', session.backend === 'local' && session.inputsHiddenFromOperator === false, { actual: { backend: session.backend, hidden: session.inputsHiddenFromOperator } });
        const quote = await sdk.getAttestationQuote('ab'.repeat(16));
        s.assert('getAttestationQuote returns a session nonce and the public key', typeof quote.sessionNonce === 'string' && /BEGIN PUBLIC KEY/.test(quote.publicKeyPem || ''), { actual: Object.keys(quote) });
        s.assert('sealBid refuses a local-simulation Roost (it only trusts an attested model key)', await sdk.sealBid({ intentPayload: { amount: 1 } }).then(() => false, (e) => /not in model-sealed mode|ROOST REJECT/.test(e.message)));
        const receipt = await sdk.submitSealedIntent({ syndicateId: synId, flyerId: 'alice.near', intentPayload: { amount: 7 }, enclavePublicKeyPem: session.publicKeyPem });
        s.assert('submitSealedIntent stores ciphertext and counts it', receipt.status === 'ENCRYPTED_IN_ENCLAVE_RAM' && receipt.count === 1 && receipt.bytes > 100, { actual: receipt });
        s.assert('the receipt does not contain the plaintext amount', !/"amount"\s*:\s*7\b/.test(JSON.stringify(receipt)));
        const agg = await sdk.triggerBatchAggregation(synId);
        s.assert('triggerBatchAggregation totals the bid exactly', agg.aggregateOrder?.totalInputAmount === 7 && agg.aggregateOrder?.flyerCount === 1, { actual: agg.aggregateOrder });
        const again = await sdk.triggerBatchAggregation(synId).then((r) => r, (e) => ({ error: e.message }));
        s.assert('aggregating an empty queue is refused or returns zero, never a stale total', Boolean(again.error) || again.aggregateOrder?.totalInputAmount === 0 || again.aggregateOrder?.flyerCount === 0, { actual: again.aggregateOrder || again.error });
      });

      await ctx.step('SDK: facilities (RFQ, OTC, compute) and commerce (x402)', async (s) => {
        const rfq = await sdk.createRfq({ borrowerId: 'treasury.near', requestedAmountUsdc: 1000000, collateralAsset: 'ETH', collateralAmount: 500, maxAprPercent: 5.5, durationDays: 30 });
        s.assert('createRfq returns an id and an OPEN status', /^rfq_/.test(rfq.rfqId) && /OPEN/.test(rfq.status), { actual: rfq });
        await sdk.submitRfqQuote(rfq.rfqId, { lenderId: 'lender.near', offeredAprPercent: 4.9, maxLtvPercent: 75, liquidationThresholdPercent: 85 });
        const loan = await sdk.matchRfqLoan(rfq.rfqId);
        s.assert('matchRfqLoan binds a loan at the quoted rate', loan.aprPercent === 4.9 && Boolean(loan.loanId), { actual: loan });
        const health = await sdk.checkLoanHealth(loan.loanId, 2800);
        s.assert('checkLoanHealth gives a verdict', typeof health.verdict === 'string', { actual: health });
        s.assert('matching an RFQ with no quotes is refused', await sdk.matchRfqLoan('rfq_nonexistent').then(() => false, () => true));
        const buy = await sdk.submitOtcOrder({ flyerId: 'b.near', side: 'BUY', assetIn: 'USDC', amountIn: 40000, assetOut: 'wNEAR', minOutputAmount: 9900 });
        const sell = await sdk.submitOtcOrder({ flyerId: 's.near', side: 'SELL', assetIn: 'wNEAR', amountIn: 10000, assetOut: 'USDC', minOutputAmount: 39500 });
        const cross = await sdk.crossOtcOrders(buy.orderId, sell.orderId, 4.0);
        s.assert('crossOtcOrders matches 10000 wNEAR for 40000 USDC at 4.0', cross.matchedVolumeOut === 10000 && cross.matchedVolumeIn === 40000, { actual: cross });
        s.assert('crossing two BUY orders is refused', await sdk.crossOtcOrders(buy.orderId, buy.orderId, 4.0).then(() => false, () => true));
        const c1 = await sdk.depositComputeCredits('c1.near', 5); await sdk.depositComputeCredits('c2.near', 5);
        s.assert('depositComputeCredits pools the credits', c1.totalSyndicateComputePool === 5, { actual: c1 });
        globalThis.fetch = async (url, o) => (String(url).includes('/attestation/report') ? new Response(JSON.stringify(ATTEST_FIXTURE), { status: 200 }) : origFetch(url, o));
        try {
          const inf = await sdk.executeComputeInference('what is 2+2', 2);
          s.assert('executeComputeInference with quorum returns a result bound to the prompt hash', /^[0-9a-f]{64}$/.test(inf.inferenceResultHash || ''), { actual: Object.keys(inf) });
          s.assert('inference below quorum is refused', await sdk.executeComputeInference('x', 5).then(() => false, () => true));
          s.assert('KNOWN GAP-017: the "inference result" is the SHA-256 of the prompt, not a model output (pinned)', inf.inferenceResultHash === (await import('node:crypto')).createHash('sha256').update('what is 2+2').digest('hex'));
          s.problem('minor', 'GAP-017: /v1/facilities/compute/infer returns sha256(prompt) as "inferenceResultHash" and hardwareVerified only checks that a quote is present; no inference runs and no quote is verified');
        } finally { globalThis.fetch = origFetch; }
        const challenge = await sdk.createX402Challenge({ sellerFlyerId: 'oracle.near', resourceId: 'alpha-feed', priceUsdc: 2.5, description: 'signal' });
        const unpaid = await sdk.fetchProtectedResource('alpha-feed');
        s.assert('a protected resource without payment is HTTP 402 with the payment headers', unpaid.status === 402 && unpaid.headers.get('x-402-payment-required') === 'true', { actual: unpaid.status });
        const settled = await sdk.settleX402Invoice({ invoiceId: challenge.invoiceId, buyerFlyerId: 'buyer.near', maxAcceptablePrice: 5.0 });
        const unsigned = await sdk.fetchProtectedResource('alpha-feed', settled.receiptId);
        s.assert('a bare receipt id is not accepted as proof of payment', unsigned.status === 402, { actual: unsigned.status });
        const paid = await sdk.fetchProtectedResource('alpha-feed', settled.proof);
        s.assert('the signed proof releases the data to the buyer', paid.status === 200 && paid.data.releasedTo === 'buyer.near', { actual: paid.status });
        s.assert('settling above the buyer\'s maximum price is refused', await (async () => { const c2 = await sdk.createX402Challenge({ sellerFlyerId: 'o.near', resourceId: 'pricey', priceUsdc: 9, description: 'x' }); return sdk.settleX402Invoice({ invoiceId: c2.invoiceId, buyerFlyerId: 'buyer.near', maxAcceptablePrice: 1 }).then(() => false, () => true); })());
      });

      await ctx.step('SDK: MPC, emergency hatch-out and the routes the SDK has no method for', async (s) => {
        const id = await sdk.getOmnichainIdentity(`${synId}.fly-coordinator.testnet`);
        s.assert('getOmnichainIdentity returns the MPC contract and a root key', id.mpcContract === 'v1.signer-prod.testnet' && /^secp256k1:/.test(id.rootPublicKey), { actual: Object.keys(id) });
        const sig = await sdk.requestMpcSignature({ syndicateSubAccount: `${synId}.fly-coordinator.testnet`, targetChain: 'ETH', payloadHash: 'ab'.repeat(32), haqVerified: true });
        s.assert('requestMpcSignature returns a signature body, not an empty object', Object.keys(sig).filter((k) => !['mode', 'notice'].includes(k)).length > 0, { actual: sig });
        const e2 = `em-${tag}`;
        await sdk.hatchSyndicate({ id: e2, quorumThreshold: 1, timeoutBlocks: 50 }); await sdk.deposit(e2, 'carol.near', 2);
        const early = await sdk.emergencyHatchOut(e2, 'carol.near', 1).then(() => 'refunded', () => 'locked');
        s.assert('an emergency hatch-out claiming an early block is locked', early === 'locked');
        const hs = await raw('GET', '/v1/health');
        s.assert('/v1/health is the same as /health', hs.status === 200 && hs.json?.status === 'OK');
        const tl = await raw('GET', `/v1/emergency/timelock/${e2}`);
        s.assert('the timelock view reports the creation block and timeout', tl.json?.timeoutBlocks === 50 && Number.isFinite(tl.json?.createdAtBlock), { actual: tl.json });
        const pod = await raw('POST', `/v1/syndicates/${e2}/pods`, { podId: 'pod-1', podType: 'SCOUT', maxCapitalAllocation: 10 });
        const pods = await raw('GET', `/v1/syndicates/${e2}/pods`);
        s.assert('a pod can be created and listed', pod.status === 201 && Array.isArray(pods.json) && pods.json.some((p) => p.podId === 'pod-1'), { actual: [pod.status, pods.json] });
        s.assert('the pods list is a bare array while every other response is an object with a mode field', Array.isArray(pods.json));
        s.problem('minor', 'GET /v1/syndicates/:id/pods returns a bare array without the "mode" field every other route includes, so a client cannot tell model data from chain data there');
        const unmapped = routes.filter((r) => !sdkViaHttp.has(r.key)).map((r) => r.key);
        s.observe('HTTP routes with no SDK method', unmapped);
        s.problem('minor', `the SDK has no method for ${unmapped.length} HTTP routes: ${unmapped.join('; ')}`);
      });

      await ctx.step('SSE: both streams deliver events as they happen', async (s) => {
        const events = (p) => new Promise((resolve, reject) => {
          const out = []; const req = http.get(base + p, (res) => { s.assert(`${p}: content type is text/event-stream`, /text\/event-stream/.test(res.headers['content-type'] || '')); res.setEncoding('utf8'); let buf = ''; res.on('data', (d) => { buf += d; for (const blk of buf.split('\n\n').slice(0, -1)) { const ev = blk.match(/event: (.+)/)?.[1]; if (ev) out.push(ev); } buf = buf.split('\n\n').pop(); }); resolve({ out, close: () => req.destroy() }); });
          req.on('error', reject);
        });
        const wait = async (arr, name) => { for (let i = 0; i < 40 && !arr.includes(name); i += 1) await new Promise((r) => setTimeout(r, 50)); return arr.includes(name); };
        const sid = `sse-${tag}`;
        await sdk.hatchSyndicate({ id: sid, quorumThreshold: 1 });
        const a = await events(`/v1/stream/syndicate/${sid}`); hits.http.set('GET /v1/stream/syndicate/*', (hits.http.get('GET /v1/stream/syndicate/*') || 0) + 1);
        s.assert('the syndicate stream sends "connected" first', await wait(a.out, 'connected'));
        await sdk.deposit(sid, 'dave.near', 3);
        s.assert('a deposit appears on the stream as deposit_received', await wait(a.out, 'deposit_received'), { actual: a.out });
        await sdk.deposit(`${sid}`, 'erin.near', 1);
        await sdk.submitSealedIntent({ syndicateId: sid, flyerId: 'dave.near', intentPayload: { amount: 1 }, enclavePublicKeyPem: (await sdk.getSessionKey()).publicKeyPem });
        s.assert('a sealed intent appears as sealed_intent_received with a count and no amount', await wait(a.out, 'sealed_intent_received'));
        const other = await events(`/v1/stream/syndicate/someone-else-${tag}`); await sdk.deposit(sid, 'frank.near', 1);
        await new Promise((r) => setTimeout(r, 200));
        s.assert('a stream for a different syndicate does not receive these events', !other.out.includes('deposit_received'), { actual: other.out });
        a.close(); other.close();
        const rfq = await sdk.createRfq({ borrowerId: 'x.near', requestedAmountUsdc: 1000, collateralAsset: 'ETH', collateralAmount: 1, maxAprPercent: 9, durationDays: 7 });
        await sdk.submitRfqQuote(rfq.rfqId, { lenderId: 'l.near', offeredAprPercent: 5, maxLtvPercent: 70, liquidationThresholdPercent: 85 });
        const loan = await sdk.matchRfqLoan(rfq.rfqId);
        const b = await events(`/v1/stream/facilities/rfq/${loan.loanId}`); hits.http.set('GET /v1/stream/facilities/rfq/*', (hits.http.get('GET /v1/stream/facilities/rfq/*') || 0) + 1);
        await wait(b.out, 'connected');
        await sdk.checkLoanHealth(loan.loanId, 2800);
        s.assert('a loan health check appears on the RFQ stream', await wait(b.out, 'healthy_tick') || b.out.some((e) => e !== 'connected'), { actual: b.out });
        b.close();
      });

      await ctx.step('security controls: API key, CORS, public health', async (s) => {
        const secure = new FlyApiDaemon({ port: 0, mode: 'model', roostBackend: 'local', apiKey: 'lab-test-key-not-a-secret-1234567890' });
        const { port } = await secure.start(); const sb = `http://127.0.0.1:${port}`;
        try {
          s.assert('/health is public', (await fetch(`${sb}/health`)).status === 200);
          s.assert('a protected route without a key is 401', (await fetch(`${sb}/v1/syndicates`)).status === 401);
          s.assert('a wrong key is 401', (await fetch(`${sb}/v1/syndicates`, { headers: { 'x-midge-api-key': 'wrong' } })).status === 401);
          s.assert('the right key in X-Midge-Api-Key is accepted', (await fetch(`${sb}/v1/syndicates`, { headers: { 'x-midge-api-key': 'lab-test-key-not-a-secret-1234567890' } })).status === 200);
          s.assert('the right key as a Bearer token is accepted', (await fetch(`${sb}/v1/syndicates`, { headers: { authorization: 'Bearer lab-test-key-not-a-secret-1234567890' } })).status === 200);
          const evil = await fetch(`${sb}/health`, { headers: { origin: 'https://evil.example' } });
          s.assert('a foreign origin gets no CORS allowance', !evil.headers.get('access-control-allow-origin'));
          const local = await fetch(`${sb}/health`, { headers: { origin: 'http://localhost:5173' } });
          s.assert('a localhost origin is allowed', local.headers.get('access-control-allow-origin') === 'http://localhost:5173');
          s.assert('an OPTIONS preflight is a 204', (await fetch(`${sb}/v1/syndicates`, { method: 'OPTIONS', headers: { origin: 'http://localhost:5173' } })).status === 204);
        } finally { await secure.stop(); }
      });

      await ctx.step('one request must not take the server down (found by this experiment)', async (s) => {
        const script = `import { FlyApiDaemon } from ${JSON.stringify(path.join(root, 'src/api/server.js'))};
          const d = new FlyApiDaemon({ port: 0, mode: 'model', roostBackend: 'local' }); const { port } = await d.start();
          const r = await fetch('http://127.0.0.1:' + port + '/v1/mpc/sign', { method: 'POST', body: JSON.stringify({ syndicateSubAccount: 'a.b', targetChain: 'ETH', payloadHash: 'ab', haqVerified: false }) }).then((x) => x.status, () => 'no-response');
          await new Promise((r2) => setTimeout(r2, 500));
          const alive = await fetch('http://127.0.0.1:' + port + '/health').then((x) => x.status, () => 'dead');
          console.log(JSON.stringify({ r, alive })); process.exit(0);`;
        const out = await new Promise((resolve) => { const c = spawn('node', ['--input-type=module', '-e', script], { stdio: ['ignore', 'pipe', 'pipe'] }); let o = ''; c.stdout.on('data', (d) => { o += d; }); c.on('close', (code) => resolve({ code, o })); setTimeout(() => c.kill('SIGKILL'), 20000); });
        let parsed = null; try { parsed = JSON.parse(out.o.trim().split('\n').pop()); } catch { /* crashed before printing */ }
        s.observe('child process', { exitCode: out.code, parsed });
        s.assert('a rejected MPC signing request is answered 403 and the server keeps serving', parsed && parsed.alive === 200 && parsed.r === 403, { actual: parsed || `process exited with code ${out.code} before answering` });
      });

      await ctx.step('KNOWN GAPs in the model-mode API (pinned: asserting today\'s behaviour so a fix turns this red)', async (s) => {
        const syn = `gap-${tag}`;
        await sdk.hatchSyndicate({ id: syn, quorumThreshold: 1, timeoutBlocks: 50 }); await sdk.deposit(syn, 'victim.near', 4);
        const forced = await raw('POST', '/v1/emergency/hatch-out', { syndicateId: syn, flyerId: 'victim.near', currentBlock: 999999 });
        s.assert('GAP-013 (pinned): any caller can force another member\'s exit by claiming a high block height', forced.status === 200 && forced.json?.refundedTo === 'victim.near', { actual: forced.status });
        s.problem('major', 'GAP-013: POST /v1/emergency/hatch-out takes currentBlock and flyerId from the request body, so any caller can open the timelock and force any member out of an active round (model mode only; the contract uses the real block height)');
        const sess = await sdk.getSessionKey();
        await raw('POST', '/v1/roost/aggregate', {}); // drain whatever earlier steps left in the shared queue
        await raw('POST', '/v1/roost/intents/sealed', { syndicateId: 'syn-A', flyerId: 'a', cipherTextBase64: EnclaveCrypto.encryptIntent({ amount: 11 }, sess.publicKeyPem) });
        const crossed = await raw('POST', '/v1/roost/aggregate', { syndicateId: 'syn-B' });
        s.assert('GAP-014 (pinned): a bid sealed under syndicate A is aggregated when syndicate B asks', crossed.json?.aggregateOrder?.totalInputAmount === 11, { actual: crossed.json?.aggregateOrder });
        s.problem('major', 'GAP-014: the Roost endpoints ignore syndicateId; one bid queue is shared by every syndicate, so aggregating for syndicate B returns and clears syndicate A\'s bids');
        const haq = await raw('POST', '/v1/mpc/sign', { syndicateSubAccount: 'a.b', targetChain: 'ETH', payloadHash: 'ab'.repeat(32), haqVerified: true });
        s.assert('GAP-015 (pinned): the caller says haqVerified:true and the MPC signing gate opens', haq.status === 200, { actual: haq.status });
        s.problem('major', 'GAP-015: POST /v1/mpc/sign trusts a haqVerified flag supplied in the request body, so the "no cross-chain signature without a valid attestation" gate is whatever the caller says it is (simulated signing only; no MPC network is called)');
        const syn2 = `gap2-${tag}`; await sdk.hatchSyndicate({ id: syn2, quorumThreshold: 1 }); await sdk.deposit(syn2, 'holder.near', 6);
        const ghost = await raw('POST', '/v1/syndicates/' + syn2 + '/settle', { allocations: [{ recipient: 'x.near', amount: 1 }] });
        s.assert('GAP-016 (pinned): model-mode settle of an existing syndicate answers SETTLED_MODEL with no signature and no state change', ghost.status === 200 && ghost.json?.status === 'SETTLED_MODEL' && (await raw('GET', '/v1/syndicates/' + syn2)).json?.totalEscrow === 6, { actual: ghost.json?.status });
        s.problem('minor', 'GAP-016: model-mode /settle acknowledges a request for an existing syndicate with SETTLED_MODEL without checking the allocations or a signature and without changing any state; in chain mode hatch, deposit and get-by-id still use the in-memory model, so one API session mixes chain and model state');
      });
    } finally {
      await ctx.step('stop the daemon', async (s) => { if (daemon) await daemon.stop(); globalThis.fetch = origFetch; s.assert('the daemon stopped', true); }, { always: true });
    }

    await ctx.step('MCP (in process): every tool, and the four that used to claim success without doing anything', async (s) => {
      const nest = new FlyNestContract();
      const roost = createRoost({ backend: 'local' });
      const mcp = new FlyMcpServer({ mode: 'model', nestContract: nest, roostEnclave: roost });
      const call = async (n, a) => { hits.mcp.add(n); return mcp.executeTool(n, a); };
      s.assert('tools/list returns the ten tools', mcp.listTools().tools.length === 10);
      const h = await call('midge_hatch_syndicate', { syndicateId: `mcp-${tag}`, expectedCodeHash: 'x', quorumThreshold: 1 });
      s.assert('hatch creates a real model-mode syndicate', h.id === `mcp-${tag}` && nest.syndicates.has(`mcp-${tag}`), { actual: h });
      const d = await call('midge_deposit', { syndicateId: `mcp-${tag}`, flyerId: 'agent.near', amountNear: 0.05 });
      s.assert('deposit lands in the model syndicate', d.amount === 0.05 && nest.syndicates.get(`mcp-${tag}`).totalEscrow === 0.05, { actual: d });
      s.assert('midge_deposit into an unknown syndicate is an error', await call('midge_deposit', { syndicateId: 'ghost', flyerId: 'a', amountNear: 1 }).then(() => false, () => true));
      const l = await call('midge_list_syndicates', { limit: 5 });
      s.assert('list includes it', l.syndicates?.some?.((x) => x.id === `mcp-${tag}`) || [...l].some?.((x) => x.id === `mcp-${tag}`), { actual: l });
      const mine = await call('midge_get_my_syndicates', { accountId: 'agent.near' });
      const mineList = mine.syndicates || [...mine];
      s.assert('get_my_syndicates returns the one the account is in', mineList.some((x) => x.id === `mcp-${tag}`), { actual: mineList });
      const nobody = await call('midge_get_my_syndicates', { accountId: 'nobody-at-all.near' });
      const nobodyList = nobody.syndicates || [...nobody];
      s.assert('get_my_syndicates invents nothing for an account in no syndicate', nobodyList.length === 0, { actual: nobodyList });
      const st = await call('midge_settle', { syndicateId: `mcp-${tag}`, allocations: [['recipient.near', '0.04']] });
      s.observe('midge_settle in model mode', st);
      const ho = await call('midge_hatch_out', { syndicateId: `mcp-${tag}`, flyerId: 'agent.near' }).then((r) => r, (e) => ({ error: e.message }));
      s.observe('midge_hatch_out in model mode', ho);

      const va = await call('midge_verify_haq_attestation', { nonce: 'this-is-not-a-real-nonce' });
      s.assert('verify_haq_attestation never says VALID for a nonce it did not verify against a quote', !/VALID/.test(va.status || '') || /NOT_VALID|INVALID/.test(va.status), { actual: va });
      s.assert('with a local simulation Roost it says NOT_VERIFIED and why', va.status === 'NOT_VERIFIED' && /simulation|no hardware|local/i.test(va.reason || ''), { actual: va });

      const sessionKey = roost.getSessionInfo().publicKeyPem;
      const noCipher = await call('midge_submit_sealed_intent', { syndicateId: 's', flyerId: 'f', amount: 12345 }).then((r) => ({ ok: true, r }), (e) => ({ ok: false, e: e.message }));
      s.assert('submit_sealed_intent refuses a plaintext amount', noCipher.ok === false, { actual: noCipher });
      const sealed = await call('midge_submit_sealed_intent', { syndicateId: 's', flyerId: 'f', cipherTextBase64: EnclaveCrypto.encryptIntent({ amount: 12345 }, sessionKey) });
      s.assert('submit_sealed_intent forwards ciphertext to the Roost and reports its count', sealed.count === 1 && sealed.bytes > 100, { actual: sealed });
      s.assert('and does not echo the amount', !JSON.stringify(sealed).includes('12345'));
      s.assert('the Roost really holds the bid', (await roost.aggregateAndClear()).aggregateOrder.totalInputAmount === 12345);

      const rfq = await call('midge_create_confidential_rfq', { borrowerId: 'b.near', requestedAmountUsdc: 1000, collateralAmount: 1, maxAprPercent: 8 });
      s.assert('create_confidential_rfq creates a real RFQ with an id', /^rfq_/.test(rfq.rfqId || '') && mcp.rfq?.rfqs?.has(rfq.rfqId), { actual: rfq });
      const otc = await call('midge_match_otc_block', { buyOrderId: 'otc_ghost1', sellOrderId: 'otc_ghost2', referencePrice: 4 }).then((r) => ({ ok: true, r }), (e) => ({ ok: false, e: e.message }));
      s.assert('match_otc_block refuses orders that do not exist', otc.ok === false, { actual: otc });
      // Chain mode with a read-only client (no write keys): a write must refuse, not fall back to the model while labelled "chain".
      const readOnly = { accountId: null, isConfiguredForWrites: () => false, listSyndicates: async () => [], listSyndicatesByMember: async () => [] };
      const chainNoKeys = new FlyMcpServer({ mode: 'chain', chainClient: readOnly, nestContract: new FlyNestContract() });
      for (const [tool, args] of [['midge_hatch_syndicate', { syndicateId: `nokeys-${tag}`, expectedCodeHash: 'x' }], ['midge_deposit', { syndicateId: 'x', flyerId: 'a', amountNear: 1 }], ['midge_settle', { syndicateId: 'x', allocations: [] }], ['midge_hatch_out', { syndicateId: 'x' }]]) {
        const r = await chainNoKeys.executeTool(tool, args).then((v) => ({ ok: true, v }), (e) => ({ ok: false, e: e.message }));
        s.assert(`chain mode without write keys: ${tool} is refused with an explanation, not answered from the model`, r.ok === false && /NEAR_ACCOUNT_ID/.test(r.e), { actual: r });
      }
      s.assert('chain mode without write keys can still read (list)', Array.isArray([...(await chainNoKeys.executeTool('midge_list_syndicates', {}))]));
      s.assert('an unknown tool is an error', await call('midge_nope', {}).then(() => false, (e) => /Unknown/.test(e.message)));
    });

    await ctx.step('MCP (stdio JSON-RPC): initialize, list, call, errors', async (s) => {
      const child = spawn('node', [path.join(root, 'bin/midge-mcp.js')], { env: { ...process.env, FLY_MODE: 'model', NEARAI_API_KEY: '' }, stdio: ['pipe', 'pipe', 'pipe'] });
      let buf = ''; const waiters = new Map();
      child.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); try { const m = JSON.parse(line); waiters.get(m.id)?.(m); } catch { /* not a message */ } } });
      const rpc = (id, method, params) => new Promise((resolve, reject) => { waiters.set(id, resolve); child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`); setTimeout(() => reject(new Error(`no answer to ${method}`)), 15000); });
      try {
        const init = await rpc(1, 'initialize', {});
        s.assert('initialize reports a protocol version and server name', Boolean(init.result?.protocolVersion) && Boolean(init.result?.serverInfo?.name), { actual: init.result });
        const list = await rpc(2, 'tools/list', {});
        s.assert('tools/list over stdio returns the ten tools', list.result?.tools?.length === 10, { actual: list.result?.tools?.length });
        const call = await rpc(3, 'tools/call', { name: 'midge_verify_haq_attestation', arguments: { nonce: 'not-a-real-nonce' } });
        hits.mcp.add('stdio:midge_verify_haq_attestation');
        const txt = call.result?.content?.[0]?.text || '';
        s.assert('a tool call over stdio returns text content that parses as JSON', (() => { try { JSON.parse(txt); return true; } catch { return false; } })());
        s.assert('over stdio, verify_haq_attestation does not say VALID for a bogus nonce either', !/HAQ_ATTESTATION_VALID/.test(txt), { actual: txt.slice(0, 160) });
        const unknown = await rpc(4, 'tools/call', { name: 'midge_nope', arguments: {} });
        s.assert('an unknown tool is a JSON-RPC error -32000', unknown.error?.code === -32000, { actual: unknown.error });
        const nomethod = await rpc(5, 'does/not/exist', {});
        s.assert('an unknown method is -32601', nomethod.error?.code === -32601, { actual: nomethod.error });
        const stdioHatch = await rpc(6, 'tools/call', { name: 'midge_hatch_syndicate', arguments: { syndicateId: `stdio-${tag}`, expectedCodeHash: 'x' } });
        const hatchText = stdioHatch.result?.content?.[0]?.text || '';
        s.assert('over stdio in model mode, a hatch is not an unlabelled mock ("HATCHED_MOCK")', !/HATCHED_MOCK/.test(hatchText), { actual: hatchText.slice(0, 200) });
      } finally { child.kill(); }
    });

    await ctx.step('coverage: what the declared surface offers versus what was exercised', async (s) => {
      const unhitRoutes = routes.filter((r) => !hits.http.has(r.key)).map((r) => r.key);
      const sdkAll = sdkMethods(root); const unhitSdk = sdkAll.filter((m) => !hits.sdk.has(m));
      const unhitMcp = FLY_MCP_TOOLS.map((t) => t.name).filter((n) => !hits.mcp.has(n));
      const unmatched = [...hits.http.keys()].filter((k) => k.startsWith('UNMATCHED'));
      s.observe('coverage', { routes: `${routes.length - unhitRoutes.length}/${routes.length}`, sdk: `${sdkAll.length - unhitSdk.length}/${sdkAll.length}`, mcp: `${FLY_MCP_TOOLS.length - unhitMcp.length}/${FLY_MCP_TOOLS.length}`, requestsToRoutes: [...hits.http.values()].reduce((a, b) => a + b, 0) });
      s.assert('every declared HTTP route was exercised', unhitRoutes.length === 0, { actual: unhitRoutes });
      s.assert('every SDK method was called', unhitSdk.length === 0, { actual: unhitSdk });
      s.assert('every MCP tool was called', unhitMcp.length === 0, { actual: unhitMcp });
      s.assert('every request the experiment sent was attributed to a declared route or the 404 probe', unmatched.every((k) => /\/v1\/nope/.test(k)), { actual: unmatched });
    });
  },
};
