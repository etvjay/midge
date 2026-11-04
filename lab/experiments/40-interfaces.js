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
import { startMockGateway, MODEL as MOCK_MODEL } from '../../verifications/09-model-sealed-roost.js';
import crypto from 'node:crypto';
import { FlyChainClient, deriveSubKeyPair } from '../../src/chain/client.js';
import { computeAllocationsHash as roostAllocationsHash } from '../../src/roost-service/hosted-roost.js';

const PIN = { routes: 32, sdk: 32, mcp: 10 }; // a source change moves these and forces a human to look

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
    'Model mode and the stub-client checks cannot prove the chain paths; E-IFACE-CHAIN does. Anything still open is recorded as a problem in the report.',
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
        daemon = new FlyApiDaemon({ port: 0, mode: 'model', roostBackend: 'local', simulateHaq: true });
        const { port } = await daemon.start();
        base = `http://127.0.0.1:${port}`;
        const client = new FlyClient({ baseUrl: base, fetchFn: seenFetch });
        const attribute = (name, fn) => { const prev = currentSdk; currentSdk = name; try { return fn(); } finally { currentSdk = prev; } };
        sdk = new Proxy(client, { get(t, p) {
          const v = t[p]; if (typeof v !== 'function' || String(p).startsWith('_') || p === 'constructor') return v;
          return (...a) => {
            hits.sdk.add(String(p));
            const r = attribute(String(p), () => v.apply(t, a));
            // A stream is an async iterator: its request goes out on the first next(), after this call has returned.
            if (r && typeof r[Symbol.asyncIterator] === 'function') { const it = r[Symbol.asyncIterator](); return { [Symbol.asyncIterator]() { return this; }, next: (...n) => attribute(String(p), () => it.next(...n)), return: (...n) => it.return(...n) }; }
            return r.then ? attribute(String(p), () => r) : r;
          };
        } });
        const h = await raw('GET', '/health');
        s.assert('the daemon answers /health', h.status === 200 && h.json?.status === 'OK', { actual: h.status });
        s.assert('responses say they are model mode, so nobody mistakes them for chain results', h.json?.mode === 'model' && /MODEL MODE/.test(h.json?.notice || ''), { actual: h.json });
      }, { critical: true });

      const synId = `iface-${tag}`;
      await ctx.step('SDK: syndicate lifecycle (hatch, get, list, by member, deposit, settle, hatch-out)', async (s) => {
        const hatched = await sdk.hatchSyndicate({ id: synId, quorumThreshold: 1, maxSpendNear: 100, timeoutBlocks: 2 });
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
        s.assert('hatchOut before the timelock expires is locked (HTTP 423), not refunded', await sdk.hatchOut(synId, 'alice.near').then(() => false, (e) => /LOCKED/.test(e.message)));
        await new Promise((r) => setTimeout(r, 3200)); // 2 blocks of 1.2 s on the model's own clock
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
        s.assert('depositing into an unknown syndicate is a 404 (it used to be a 500, which a client reads as a server fault)', ghostDep.status === 404, { actual: ghostDep.status });
        const big = await seenFetch(base + '/v1/syndicates/hatch', { method: 'POST', body: JSON.stringify({ id: 'x'.repeat(600 * 1024) }) }).then((r) => r.status, () => 'socket-reset');
        s.assert('a 600 KB body is refused (413 or a closed socket)', big === 413 || big === 'socket-reset', { actual: big });
        const timelock = await raw('GET', `/v1/emergency/timelock/ghost-syn`);
        s.assert('the timelock of an unknown syndicate is a 404', timelock.status === 404);
      });

      await ctx.step('SDK: Roost (session key, attestation, sealing, aggregation)', async (s) => {
        const session = await sdk.getSessionKey(synId);
        s.assert('the session key says which backend it is and that inputs are NOT hidden from the operator', session.backend === 'local' && session.inputsHiddenFromOperator === false, { actual: { backend: session.backend, hidden: session.inputsHiddenFromOperator } });
        const quote = await sdk.getAttestationQuote(synId, 'ab'.repeat(16));
        s.assert('getAttestationQuote returns a session nonce and the public key', typeof quote.sessionNonce === 'string' && /BEGIN PUBLIC KEY/.test(quote.publicKeyPem || ''), { actual: Object.keys(quote) });
        s.assert('sealBid refuses a local-simulation Roost (it only trusts an attested model key)', await sdk.sealBid({ syndicateId: synId, intentPayload: { amount: 1 } }).then(() => false, (e) => /not in model-sealed mode|ROOST REJECT/.test(e.message)));
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
          s.assert('GAP-017 (fixed): the response says it is a simulation, that no inference ran, and that the quote was not verified', inf.simulation === true && /no inference ran/.test(inf.note || '') && inf.hardwareVerified === false && inf.quotePresent === true, { actual: { simulation: inf.simulation, hardwareVerified: inf.hardwareVerified, quotePresent: inf.quotePresent } });
          s.assert('and the digest is still exactly the SHA-256 of the prompt, which the note says', inf.inferenceResultHash === (await import('node:crypto')).createHash('sha256').update('what is 2+2').digest('hex'));
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
        const early = await sdk.emergencyHatchOut(e2, 'carol.near').then(() => 'refunded', () => 'locked');
        s.assert('an emergency hatch-out claiming an early block is locked', early === 'locked');
        const hs = await sdk.health();
        s.assert('sdk.health() reports OK and the coordinator contract', hs.status === 'OK' && /^c\./.test(hs.coordinatorContract || ''), { actual: hs });
        s.assert('/health is the same as /v1/health', (await raw('GET', '/health')).json?.status === 'OK');
        const tl = await sdk.getTimelock(e2);
        s.assert('sdk.getTimelock reports the creation block, the timeout, the model\'s current block and the blocks remaining', tl.timeoutBlocks === 50 && Number.isFinite(tl.createdAtBlock) && tl.currentBlock >= tl.createdAtBlock && tl.blocksRemaining > 0, { actual: tl });
        const pod = await sdk.createPod(e2, { podId: 'pod-1', podType: 'SCOUT', maxCapitalAllocation: 10 });
        const pods = await sdk.listPods(e2);
        s.assert('sdk.createPod and sdk.listPods: a pod can be created and listed', pod.podId === 'pod-1' && Array.isArray(pods.pods) && pods.pods.some((p) => p.podId === 'pod-1'), { actual: [pod, pods] });
        s.assert('the pods response is an object that says it is the model (it used to be a bare array with no label)', pods.mode === 'model' && /MODEL MODE/.test(pods.notice || ''), { actual: pods });
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
        await sdk.submitSealedIntent({ syndicateId: sid, flyerId: 'dave.near', intentPayload: { amount: 1 }, enclavePublicKeyPem: (await sdk.getSessionKey(sid)).publicKeyPem });
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

      await ctx.step('SDK: both SSE streams as async iterators', async (s) => {
        const sid = `sdkse-${tag}`;
        await sdk.hatchSyndicate({ id: sid, quorumThreshold: 1 });
        const seen = [];
        const stream = sdk.streamSyndicate(sid);
        const reader = (async () => { for await (const ev of stream) { seen.push(ev); if (seen.length >= 3) break; } })();
        const waitFor = async (pred) => { for (let i = 0; i < 60 && !seen.some(pred); i += 1) await new Promise((r) => setTimeout(r, 50)); return seen.some(pred); };
        s.assert('the first event is "connected" and names the syndicate', await waitFor((x) => x.event === 'connected' && x.data?.syndicateId === sid), { actual: seen });
        await sdk.deposit(sid, 'gina.near', 2);
        s.assert('a deposit arrives as { event: "deposit_received", data } with the amount', await waitFor((x) => x.event === 'deposit_received' && x.data?.amount === 2), { actual: seen });
        await sdk.deposit(sid, 'hal.near', 1);
        await reader;
        s.assert('breaking out of the loop ends the stream (three events were read, then it stopped)', seen.length === 3, { actual: seen.map((x) => x.event) });
        const rfq = await sdk.createRfq({ borrowerId: 'z.near', requestedAmountUsdc: 1000, collateralAsset: 'ETH', collateralAmount: 1, maxAprPercent: 9, durationDays: 7 });
        await sdk.submitRfqQuote(rfq.rfqId, { lenderId: 'l.near', offeredAprPercent: 5, maxLtvPercent: 70, liquidationThresholdPercent: 85 });
        const loan = await sdk.matchRfqLoan(rfq.rfqId);
        const loanEvents = []; const ac = new AbortController();
        const loanReader = (async () => { for await (const ev of sdk.streamRfqLoan(loan.loanId, { signal: ac.signal })) loanEvents.push(ev.event); })();
        for (let i = 0; i < 60 && !loanEvents.includes('connected'); i += 1) await new Promise((r) => setTimeout(r, 50));
        await sdk.checkLoanHealth(loan.loanId, 2800);
        for (let i = 0; i < 60 && loanEvents.length < 2; i += 1) await new Promise((r) => setTimeout(r, 50));
        ac.abort(); await loanReader;
        s.assert('streamRfqLoan delivers "connected" then the health tick, and an AbortSignal ends it', loanEvents[0] === 'connected' && loanEvents.length >= 2, { actual: loanEvents });
        s.assert('streaming an unknown path raises an error rather than hanging', await (async () => { const g = new FlyClient({ baseUrl: base, fetchFn: seenFetch })._stream('/v1/nope'); return g.next().then(() => false, () => true); })());
      });

      await ctx.step('SDK sealBid and the Roost API with a model-sealed Roost (mock NEAR AI gateway, no key needed)', async (s) => {
        const gw = await startMockGateway();
        const sealedApi = new FlyApiDaemon({ port: 0, mode: 'model', roostBackend: 'model-sealed', roostOptions: { apiKey: 'test-key', baseUrl: gw.url, model: MOCK_MODEL, chain: 'skip' } });
        const { port } = await sealedApi.start();
        const c = new FlyClient({ baseUrl: `http://127.0.0.1:${port}` });
        const sid = `seal-${tag}`;
        try {
          const session = await c.getSessionKey(sid);
          s.assert('the session says model-sealed, attested, and hidden from the operator', session.backend === 'model-sealed' && session.attested === true && session.inputsHiddenFromOperator === true, { actual: { backend: session.backend, attested: session.attested } });
          const sealed = await c.sealBid({ syndicateId: sid, intentPayload: { amount: 42 }, baseUrl: gw.url, chain: 'skip' });
          s.assert('sealBid verifies the model\'s attestation itself and returns ciphertext sealed to the attested key', /^[0-9a-f]+$/.test(sealed.cipherTextHex) && sealed.modelPublicKey === session.modelPublicKey, { actual: Object.keys(sealed) });
          s.assert('the ciphertext does not contain the amount', !Buffer.from(sealed.cipherTextHex, 'hex').toString('latin1').includes('42'));
          const r1 = await c.submitSealedIntent({ syndicateId: sid, flyerId: 'f1', cipherTextHex: sealed.cipherTextHex });
          const r2 = await c.submitSealedIntent({ syndicateId: sid, flyerId: 'f2', cipherTextHex: (await c.sealBid({ syndicateId: sid, intentPayload: { amount: 8 }, baseUrl: gw.url, chain: 'skip' })).cipherTextHex });
          s.assert('submitSealedIntent stores the ciphertext (the API never sees a plaintext amount)', r1.count === 1 && r2.count === 2, { actual: [r1, r2] });
          const agg = await c.triggerBatchAggregation(sid);
          s.assert('triggerBatchAggregation: the attested model totals 42 + 8 = 50 across agreeing runs', agg.aggregateOrder?.totalInputAmount === 50 && agg.aggregateOrder?.flyerCount === 2, { actual: agg.aggregateOrder });
          s.assert('a key the coordinator advertises but the attestation does not support is refused by the member', await c.sealBid({ syndicateId: sid, session: { ...session, modelPublicKey: 'ab'.repeat(32) }, intentPayload: { amount: 1 }, baseUrl: gw.url, chain: 'skip' }).then(() => false, (e) => /does not match the attested key/.test(e.message)));
        } finally { await sealedApi.stop(); await new Promise((r) => gw.server.close(r)); }
      });

      await ctx.step('pagination: total is the record count, order asc/desc, hasMore, and bad input is a 400', async (s) => {
        const pd = new FlyApiDaemon({ port: 0, mode: 'model', roostBackend: 'local' });
        const { port } = await pd.start(); const pb = `http://127.0.0.1:${port}`;
        const pc = new FlyClient({ baseUrl: pb });
        try {
          for (let i = 1; i <= 7; i += 1) { await pc.hatchSyndicate({ id: `page-${tag}-${i}`, quorumThreshold: 1 }); await pc.deposit(`page-${tag}-${i}`, 'pager.near', 1); }
          const idx = (r) => r.syndicates.map((x) => Number(x.id.split('-').pop()));
          const asc = await pc.listSyndicates({ limit: 3 });
          s.assert('the first page ascending is 1,2,3 with total 7 (the record count, not the page length) and hasMore', JSON.stringify(idx(asc)) === '[1,2,3]' && asc.total === 7 && asc.hasMore === true && asc.order === 'asc', { actual: [idx(asc), asc.total, asc.hasMore] });
          const desc = await pc.listSyndicates({ limit: 3, order: 'desc' });
          s.assert('the first page descending is the newest first: 7,6,5', JSON.stringify(idx(desc)) === '[7,6,5]' && desc.total === 7 && desc.hasMore === true, { actual: idx(desc) });
          const desc3 = await pc.listSyndicates({ fromIndex: 6, limit: 3, order: 'desc' });
          s.assert('the last descending page is just the oldest one and hasMore is false', JSON.stringify(idx(desc3)) === '[1]' && desc3.hasMore === false, { actual: [idx(desc3), desc3.hasMore] });
          const all = []; for (let from = 0; ; from += 3) { const pg = await pc.listSyndicates({ fromIndex: from, limit: 3, order: 'desc' }); all.push(...idx(pg)); if (!pg.hasMore) break; }
          s.assert('walking descending pages until hasMore is false returns every record exactly once', JSON.stringify(all) === '[7,6,5,4,3,2,1]', { actual: all });
          s.assert('a page past the end is empty, not an error', (await pc.listSyndicates({ fromIndex: 50 })).syndicates.length === 0);
          const mine = await pc.getSyndicatesByMember('pager.near', { limit: 2, order: 'desc' });
          s.assert('by-member descending: newest first, with the account\'s total', JSON.stringify(idx(mine)) === '[7,6]' && mine.total === 7 && mine.hasMore === true, { actual: [idx(mine), mine.total] });
          s.assert('a limit above 50 is clamped to 50', (await pc.listSyndicates({ limit: 500 })).limit === 50);
          const bad = async (q) => (await fetch(`${pb}/v1/syndicates?${q}`)).status;
          s.assert('a bad order, a negative fromIndex and a zero limit are each a 400', (await Promise.all([bad('order=sideways'), bad('fromIndex=-1'), bad('limit=0')])).every((c) => c === 400));
        } finally { await pd.stop(); }
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

      await ctx.step('chain mode (stub client, no network): each response says what served it, and a write without keys is refused', async (s) => {
        const rec = { id: 'known-syn', syndicate_type: 'Flash', sub_account: 'known-syn.c.test', status: 'Active', epoch: 1, total_escrow: '20000000000000000000000', quorum_threshold: 1, flyers: ['a.testnet'], round_nonce: 'ab'.repeat(32), enclave_public_key: 'cd'.repeat(32), timeout_blocks: 50, created_at_block: 100, epoch_start_block: 100 };
        const stub = { accountId: null, isConfiguredForWrites: () => false, getSyndicateCount: async () => 1, getMemberSyndicateCount: async () => 1, listSyndicates: async ({ fromIndex, limit }) => [rec].slice(fromIndex, fromIndex + limit), listSyndicatesByMember: async (_a, { fromIndex, limit }) => [rec].slice(fromIndex, fromIndex + limit), getSyndicate: async (id) => (id === 'known-syn' ? rec : null), getBlockHeight: async () => 130 };
        const d = new FlyApiDaemon({ port: 0, mode: 'chain', roostBackend: 'local', chainClient: stub });
        const { port } = await d.start(); const cb = `http://127.0.0.1:${port}`;
        const get = async (p, init) => { const r = await fetch(cb + p, init); return { status: r.status, json: await r.json().catch(() => null) }; };
        try {
          const list = await get('/v1/syndicates');
          s.assert('list is served by the chain, in the API shape, with the record count as total', list.json?.mode === 'chain' && list.json?.total === 1 && list.json?.syndicates?.[0]?.id === 'known-syn' && list.json?.syndicates?.[0]?.roundNonce === rec.round_nonce, { actual: list.json });
          const one = await get('/v1/syndicates/known-syn');
          s.assert('get-by-id is served by the chain, in the API shape, with the exact escrow in yocto', one.json?.mode === 'chain' && one.json?.id === 'known-syn' && one.json?.totalEscrow === 0.02 && one.json?.totalEscrowYocto === '20000000000000000000000' && one.json?.roundNonce === rec.round_nonce, { actual: one.json });
          s.assert('an unknown id is a 404, not an answer from the model', (await get('/v1/syndicates/nope-syn')).status === 404);
          const tl = await get('/v1/emergency/timelock/known-syn');
          s.assert('the timelock is read from the chain: 50 blocks from 100, now 130, so 20 remain', tl.json?.mode === 'chain' && tl.json?.blocksRemaining === 20 && tl.json?.currentBlock === 130, { actual: tl.json });
          const post = (p, body) => get(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
          const h = await post('/v1/syndicates/hatch', { id: 'new-syn-1', quorumThreshold: 1 });
          s.assert('hatch without write access is refused with HTTP 409 and instructions (it used to be answered from the model)', h.status === 409 && /NEAR_ACCOUNT_ID/.test(h.json?.error || ''), { actual: [h.status, h.json?.error] });
          s.assert('so are deposit, settle, hatch-out and the emergency exit', (await Promise.all([post('/v1/syndicates/known-syn/deposit', { amountNear: 1 }), post('/v1/syndicates/known-syn/settle', {}), post('/v1/syndicates/known-syn/hatch-out', {}), post('/v1/emergency/hatch-out', { syndicateId: 'known-syn' })])).every((r) => r.status === 409));
          const rfq = await post('/v1/facilities/rfq', { borrowerId: 'x.near', requestedAmountUsdc: 1, collateralAsset: 'ETH', collateralAmount: 1, maxAprPercent: 1, durationDays: 1 });
          s.assert('facilities are labelled model even in chain mode (they never touch the chain)', rfq.json?.mode === 'model' && /MODEL MODE/.test(rfq.json?.notice || ''), { actual: rfq.json?.mode });
          const sk = await get('/v1/roost/session-key?syndicateId=known-syn');
          s.assert('the Roost is labelled off-chain, not chain and not model', sk.json?.mode === 'off-chain' && !sk.json?.notice, { actual: sk.json?.mode });
          const broken = new FlyApiDaemon({ port: 0, mode: 'chain', roostBackend: 'local', chainClient: { ...stub, getSyndicateCount: async () => { throw new Error('rpc down'); } } });
          const { port: bp } = await broken.start();
          try {
            const r = await fetch(`http://127.0.0.1:${bp}/v1/syndicates`); const j = await r.json();
            s.assert('when the chain cannot be read, the list is a 502 with the reason, not an answer from the model labelled chain (it used to fall back silently)', r.status === 502 && /rpc down/.test(j.error || '') && !j.syndicates, { actual: [r.status, j] });
          } finally { await broken.stop(); }
        } finally { await d.stop(); }
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
        s.assert('GAP-013 (fixed): claiming a high block height does not open the timelock (HTTP 423)', forced.status === 423 && /LOCKED/.test(forced.json?.error || ''), { actual: [forced.status, forced.json?.error] });
        s.assert('the victim\'s escrow is untouched by the attempt', (await raw('GET', '/v1/syndicates/' + syn)).json?.totalEscrow === 4);
        const sessA = await sdk.getSessionKey('syn-aaa'); const sessB = await sdk.getSessionKey('syn-bbb');
        s.assert('GAP-014 (fixed): two syndicates get two different Roosts with different keys', sessA.publicKeyPem !== sessB.publicKeyPem && sessA.sessionNonce !== sessB.sessionNonce);
        await raw('POST', '/v1/roost/intents/sealed', { syndicateId: 'syn-aaa', flyerId: 'a', cipherTextBase64: EnclaveCrypto.encryptIntent({ amount: 11 }, sessA.publicKeyPem) });
        await raw('POST', '/v1/roost/intents/sealed', { syndicateId: 'syn-bbb', flyerId: 'b', cipherTextBase64: EnclaveCrypto.encryptIntent({ amount: 5 }, sessB.publicKeyPem) });
        const aggB = await raw('POST', '/v1/roost/aggregate', { syndicateId: 'syn-bbb' });
        s.assert('aggregating for syndicate B totals only B\'s bid (5), not A\'s (11)', aggB.json?.aggregateOrder?.totalInputAmount === 5 && aggB.json?.aggregateOrder?.flyerCount === 1, { actual: aggB.json?.aggregateOrder });
        const aggA = await raw('POST', '/v1/roost/aggregate', { syndicateId: 'syn-aaa' });
        s.assert('syndicate A\'s bid is still there afterwards and totals 11', aggA.json?.aggregateOrder?.totalInputAmount === 11, { actual: aggA.json?.aggregateOrder });
        const wrongKey = await raw('POST', '/v1/roost/intents/sealed', { syndicateId: 'syn-bbb', flyerId: 'x', cipherTextBase64: EnclaveCrypto.encryptIntent({ amount: 99 }, sessA.publicKeyPem) });
        const afterWrong = await raw('POST', '/v1/roost/aggregate', { syndicateId: 'syn-bbb' }).then((r) => r, () => ({ status: 0 }));
        s.assert('a bid sealed to syndicate A\'s key cannot be read by syndicate B\'s Roost (the sealing keys are per syndicate)', wrongKey.status >= 400 || afterWrong.json?.aggregateOrder?.totalInputAmount !== 99, { actual: [wrongKey.status, afterWrong.json?.aggregateOrder] });
        s.assert('the Roost routes require a syndicateId (HTTP 400)', (await raw('GET', '/v1/roost/session-key')).status === 400 && (await raw('POST', '/v1/roost/aggregate', {})).status === 400);
        s.assert('aggregating for a syndicate nothing was sealed for is a 404', (await raw('POST', '/v1/roost/aggregate', { syndicateId: 'never-sealed' })).status === 404);
        // GAP-015 (fixed): the server decides the attestation gate. A plain daemon (no simulateHaq) must refuse whatever the body says.
        const plain = new FlyApiDaemon({ port: 0, mode: 'model', roostBackend: 'local' });
        const { port: pp } = await plain.start(); const pb = `http://127.0.0.1:${pp}`;
        const sign = (body) => fetch(pb + '/v1/mpc/sign', { method: 'POST', body: JSON.stringify({ syndicateSubAccount: 'gap-sign.c.test', targetChain: 'ETH', payloadHash: 'ab'.repeat(32), ...body }) }).then(async (r) => ({ status: r.status, json: await r.json() }));
        try {
          const claimed = await sign({ haqVerified: true });
          s.assert('GAP-015 (fixed): a caller saying haqVerified:true no longer opens the MPC gate (HTTP 403)', claimed.status === 403, { actual: [claimed.status, claimed.json] });
          s.assert('and the refusal says why (no Roost, nothing to verify)', /nothing to verify|no Roost/i.test(claimed.json?.haqBasis || ''), { actual: claimed.json?.haqBasis });
          const live = await sign({ haqVerified: true, simulate: false });
          s.assert('a caller asking for simulate:false is not forwarded either (still 403, never a live signature attempt)', live.status === 403);
          plain.roosts.set('gap-sign', { describe: () => ({ backend: 'local' }) });
          s.assert('a local Roost has no hardware attestation, so the gate stays shut', (await sign({ haqVerified: true })).json?.haqBasis?.includes('local Roost') === true);
          plain.roosts.set('gap-sign', { describe: () => ({ backend: 'model-sealed' }), chain: 'if-available', ensureAttested: async () => ({ checks: [{ name: 'quote', ok: true }], tcbStatus: 'UpToDate' }) });
          s.assert('a model-sealed Roost that does not require the Intel certificate chain does not open it', (await sign({})).status === 403);
          plain.roosts.set('gap-sign', { describe: () => ({ backend: 'model-sealed' }), chain: 'required', ensureAttested: async () => ({ checks: [{ name: 'quote', ok: true }, { name: 'chain', ok: false }], tcbStatus: 'UpToDate' }) });
          s.assert('a model-sealed Roost with a failing check does not open it', (await sign({})).status === 403);
          plain.roosts.set('gap-sign', { describe: () => ({ backend: 'model-sealed' }), chain: 'required', ensureAttested: async () => ({ checks: [{ name: 'quote', ok: true }, { name: 'chain', ok: true }], tcbStatus: 'UpToDate' }) });
          const open = await sign({});
          s.assert('only a model-sealed Roost attested with the certificate chain opens it, and the response gives the basis', open.status === 200 && /attested with the certificate chain/.test(open.json?.haqBasis || ''), { actual: open });
        } finally { await plain.stop(); }
        const simulated = await raw('POST', '/v1/mpc/sign', { syndicateSubAccount: 'a.b', targetChain: 'ETH', payloadHash: 'ab'.repeat(32) });
        s.assert('an operator who starts the server with simulateHaq gets a signature, and the response says it was simulated', simulated.status === 200 && /SIMULATED/.test(simulated.json?.haqBasis || ''), { actual: simulated.status });
        const syn2 = `gap2-${tag}`; await sdk.hatchSyndicate({ id: syn2, quorumThreshold: 1 }); await sdk.deposit(syn2, 'holder.near', 6);
        const ghost = await raw('POST', '/v1/syndicates/' + syn2 + '/settle', { allocations: [{ recipient: 'x.near', amount: 1 }] });
        s.assert('GAP-016 (fixed): model-mode settle says it is not binding: no signature or allocation was checked and no state changed', ghost.status === 200 && ghost.json?.status === 'SETTLED_MODEL' && ghost.json?.binding === false && /no state changed/.test(ghost.json?.note || '') && (await raw('GET', '/v1/syndicates/' + syn2)).json?.totalEscrow === 6, { actual: ghost.json?.status });
      });
    } finally {
      await ctx.step('stop the daemon', async (s) => { if (daemon) await daemon.stop(); globalThis.fetch = origFetch; s.assert('the daemon stopped', true); }, { always: true });
    }

    await ctx.step('chain client: argument shapes and signing parity with the contract (no network)', async (s) => {
      // The chain client sent order_hash/epoch/nonce (the contract wants attestation_nonce and aggregate_order_hash),
      // sent allocations as pairs (the contract wants { recipient, amount }), and hashed them differently from the
      // contract. All three made a chain-mode settlement impossible; none was visible without driving it.
      const key = deriveSubKeyPair('lab-seed', 'client-shape');
      const c = new FlyChainClient({ accountId: 'lab.testnet', privateKey: key.keyPair.toString() });
      const pairs = [['zed.testnet', '0.5'], ['abe.testnet', 2n * 10n ** 24n]];
      const norm = c.normalizeAllocations(pairs);
      s.assert('pairs are normalised to { recipient, amount } objects with yocto strings', norm[0].recipient === 'zed.testnet' && norm[0].amount === '500000000000000000000000' && norm[1].amount === '2000000000000000000000000', { actual: norm });
      s.assert('objects are accepted too and come out the same', JSON.stringify(c.normalizeAllocations(norm)) === JSON.stringify(norm));
      const h = c.computeAllocationsHash(pairs);
      s.assert('the client\'s allocations hash equals the Roost\'s, which the contract accepts on testnet', h === roostAllocationsHash(norm), { expected: roostAllocationsHash(norm), actual: h });
      s.assert('the hash does not depend on the order of the allocations', h === c.computeAllocationsHash([...pairs].reverse()));
      const seed = key.rawPriv; const pub = crypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), key.rawPub]), format: 'der', type: 'spki' });
      const signed = c.signSettlement({ syndicateId: 'syn-x', epoch: 1, nonce: 'abcdef0123456789', allocations: pairs, orderHash: 'ff'.repeat(32), enclavePrivateKey: seed });
      s.assert('signSettlement signs the contract\'s message: contract:syndicate:epoch:nonce:allocationsHash:orderHash', signed.message === `${c.contractId}:syn-x:1:abcdef0123456789:${h}:${'ff'.repeat(32)}`, { actual: signed.message });
      s.assert('and the signature verifies under the matching public key', crypto.verify(null, Buffer.from(signed.message), pub, Buffer.from(signed.signatureHex, 'hex')));
      const saved = { a: process.env.NEAR_ACCOUNT_ID, k: process.env.NEAR_PRIVATE_KEY, f: process.env.MIDGE_ENV_FILE };
      delete process.env.NEAR_ACCOUNT_ID; delete process.env.NEAR_PRIVATE_KEY; delete process.env.MIDGE_ENV_FILE;
      try {
        const implicit = new FlyChainClient();
        s.assert('GAP-018 (fixed): a client built with no arguments and no environment has no write access, even though the repository has a .env', implicit.isConfiguredForWrites() === false, { actual: implicit.accountId });
      } finally { for (const [k, v] of [['NEAR_ACCOUNT_ID', saved.a], ['NEAR_PRIVATE_KEY', saved.k], ['MIDGE_ENV_FILE', saved.f]]) if (v === undefined) delete process.env[k]; else process.env[k] = v; }
      const refuses = async (fn) => fn().then(() => false, (e) => e.message);
      s.assert('hatch without an enclave key is refused before anything is sent', /enclavePublicKey/.test(await refuses(() => c.hatch({ syndicateId: 'abc' })) || ''));
      s.assert('hatch with an all-zero enclave key is refused (nobody could ever settle it)', /not all zeros/.test(await refuses(() => c.hatch({ syndicateId: 'abc', enclavePublicKey: '0'.repeat(64) })) || ''));
      s.assert('settleBatch without a string nonce is refused (the old numeric default 1 could never match)', /round_nonce/.test(await refuses(() => c.settleBatch({ syndicateId: 'a', allocations: pairs, orderHash: 'x', nonce: 1, enclaveSignature: 'ab'.repeat(64) })) || ''));
      s.assert('settleBatch without a 64-byte signature is refused', /128 hex/.test(await refuses(() => c.settleBatch({ syndicateId: 'a', allocations: pairs, orderHash: 'x', nonce: 'abcdef0123', enclaveSignature: 'ab' })) || ''));
    });

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
      const ho = await call('midge_hatch_out', { syndicateId: `mcp-${tag}`, flyerId: 'agent.near' }).then((r) => ({ ok: true, r }), (e) => ({ ok: false, e: e.message }));
      s.assert('midge_hatch_out before the timelock is locked, not refunded (it used to pass block 999999)', ho.ok === false && /LOCKED/.test(ho.e), { actual: ho });
      await call('midge_hatch_syndicate', { syndicateId: `mcp-fast-${tag}`, expectedCodeHash: 'x', quorumThreshold: 1, timeoutBlocks: 2 });
      await call('midge_deposit', { syndicateId: `mcp-fast-${tag}`, flyerId: 'agent.near', amountNear: 0.05 });
      await new Promise((r) => setTimeout(r, 3200));
      const fast = await call('midge_hatch_out', { syndicateId: `mcp-fast-${tag}`, flyerId: 'agent.near' });
      s.assert('and succeeds once the model\'s own clock has passed the timeout', fast.status === 'REFUNDED_100_PERCENT' && fast.amount === 0.05, { actual: fast });

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
      // /health is an alias of /v1/health, so one method covers both URLs.
      const unmapped = routes.filter((r) => r.key !== 'GET /health' && !sdkViaHttp.has(r.key)).map((r) => r.key);
      s.observe('HTTP routes with no SDK method', unmapped);
      s.assert('every HTTP route is reachable from an SDK method (health, both SSE streams, pods and the timelock had none)', unmapped.length === 0, { actual: unmapped });
      s.assert('every request the experiment sent was attributed to a declared route or the 404 probe', unmatched.every((k) => /\/v1\/nope/.test(k)), { actual: unmatched });
    });
  },
};
