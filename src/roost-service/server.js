import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { HostedRoost } from './hosted-roost.js';
import { DstackSocketProvider } from './provider.js';
import { RoostAggregationError } from '../enclave/errors.js';
import { createEscrowReader } from './escrow-reader.js';
import { makeAgreeingAccountKeyCheck } from './signed-input.js';
import { preflight } from './preflight.js';
import { matchApproval, invoiceHash } from './invoice.js';
import { verifyAuditorPack } from './auditor.js';

/**
 * HTTP surface of the hosted Roost.
 *   GET  /healthz            liveness
 *   GET  /session            public keys and mode
 *   GET  /attestation?nonce  attestation bound to our keys and a caller nonce (32 bytes hex)
 *   POST /intents            members submit a sealed bid (open)
 *   POST /aggregate          coordinator only: decrypt, add up exactly, clear
 *   POST /settle             coordinator only: sign the Nest's settlement message
 * No request body is ever logged and there are no debug routes.
 */

const MAX_BODY = 64 * 1024;

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('body too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (size === 0) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(Object.assign(new Error('invalid JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

/**
 * Optional escrow reader from the environment (see deploy/roost/ESCROW-READER.md). Nothing set means no reader. Setting it
 * weakly is refused: the point is that independent providers must agree, so one provider (or the same one twice) is an error.
 */
export function escrowReaderFromEnv(env) {
  const urls = [...new Set((env.ROOST_RPC_URLS || '').split(',').map((u) => u.trim().replace(/\/+$/, '')).filter(Boolean))];
  if (urls.length === 0) return null;
  if (!env.ROOST_CONTRACT_ID) throw new Error('ROOST_RPC_URLS is set but ROOST_CONTRACT_ID is not');
  if (urls.length < 2) throw new Error('ROOST_RPC_URLS needs two or more different providers: they must agree, so one is not enough');
  return createEscrowReader({ rpcUrls: urls, contractId: env.ROOST_CONTRACT_ID });
}

/**
 * The Roost this process runs, from its environment. ROOST_REQUIRE_SIGNED_INPUTS=1 (exactly that value) makes the room accept only inputs signed
 * with a key the member's NEAR account really has, checked against the first provider and the contract; ballots, RFQs and pay runs need it.
 * It is read from the compose file, which the attestation measures, so a member who verifies the Roost also verifies this setting.
 */
export function roostFromEnv(env, provider = new DstackSocketProvider()) {
  const escrowReader = escrowReaderFromEnv(env);
  let accountKeyCheck = null;
  const requireSignedInputs = env.ROOST_REQUIRE_SIGNED_INPUTS === '1';
  if (requireSignedInputs) {
    // Account keys are checked against their own list of providers (ROOST_ACCOUNT_CHECK_RPC_URLS), by default the escrow providers, and ALL of them must confirm
    // the key. Keeping the lists separate lets a test make the escrow providers unreachable while key checks still work (GAP-050).
    const urls = (env.ROOST_ACCOUNT_CHECK_RPC_URLS || env.ROOST_RPC_URLS || '').split(',').map((u) => u.trim()).filter(Boolean);
    if (urls.length === 0) throw new Error('ROOST_REQUIRE_SIGNED_INPUTS needs ROOST_ACCOUNT_CHECK_RPC_URLS or ROOST_RPC_URLS to check account keys against');
    if (!env.ROOST_CONTRACT_ID) throw new Error('ROOST_REQUIRE_SIGNED_INPUTS needs ROOST_CONTRACT_ID');
    accountKeyCheck = makeAgreeingAccountKeyCheck({ rpcUrls: urls, contractId: env.ROOST_CONTRACT_ID });
  }
  return new HostedRoost({ provider, escrowReader, requireSignedInputs, accountKeyCheck });
}

export function createRoostServer({ roost, adminKey }) {
  // With an escrow reader the run needs a fresh read first; the payers named in the request are read too (a ballot's whole roll, a buyer).
  const bind = async (accounts = [], body = {}) => { if (roost.escrowReader) await roost.bindEscrow({ accounts: accounts.filter((a) => typeof a === 'string'), blockHash: typeof body.escrowBlockHash === 'string' ? body.escrowBlockHash : null }); };
  if (!adminKey) throw new Error('adminKey is required to protect /aggregate and /settle');
  const send = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); };
  const isAdmin = (req) => typeof req.headers['x-roost-admin-key'] === 'string' && safeEqual(req.headers['x-roost-admin-key'], adminKey);

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://roost');
      if (req.method === 'GET' && url.pathname === '/healthz') return send(res, 200, { ok: true });
      if (req.method === 'GET' && url.pathname === '/session') return send(res, 200, { ...roost.getSessionInfo(), ...roost.describe() });
      if (req.method === 'GET' && url.pathname === '/attestation') {
        const nonce = url.searchParams.get('nonce') || '';
        if (!/^[0-9a-f]{64}$/i.test(nonce)) return send(res, 400, { error: 'nonce must be 32 bytes of hex' });
        return send(res, 200, await roost.getAttestationBundle(nonce));
      }
      if (req.method === 'POST' && url.pathname === '/round') {
        if (!isAdmin(req)) return send(res, 401, { error: 'coordinator key required' });
        const body = await readJson(req);
        return send(res, 200, roost.openRound({ contractId: body.contractId, syndicateId: body.syndicateId, epoch: body.epoch, roundNonce: body.roundNonce }));
      }
      if (req.method === 'GET' && url.pathname === '/digests') {
        if (!isAdmin(req)) return send(res, 401, { error: 'coordinator key required' });
        return send(res, 200, roost.inputDigests());
      }
      if (req.method === 'POST' && url.pathname === '/exclude') {
        if (!isAdmin(req)) return send(res, 401, { error: 'coordinator key required' });
        const body = await readJson(req);
        return send(res, 200, roost.excludeMembers(Array.isArray(body.members) ? body.members : []));
      }
      if (req.method === 'POST' && url.pathname === '/signed-intents') {
        const body = await readJson(req);
        return send(res, 200, await roost.submitSignedIntent({ flyerId: body.flyerId, cipherTextHex: body.cipherTextHex, publicKey: body.publicKey, signature: body.signature, seq: body.seq }));
      }
      if (req.method === 'POST' && url.pathname === '/intents') {
        const body = await readJson(req);
        return send(res, 200, roost.submitSealedIntent({ flyerId: body.flyerId, cipherTextHex: body.cipherTextHex }));
      }
      if (req.method === 'POST' && url.pathname === '/pool') {
        if (!isAdmin(req)) return send(res, 401, { error: 'coordinator key required' });
        const body = await readJson(req);
        await bind([], body); return send(res, 200, roost.runPool({ recipient: body.recipient, min: body.min, cap: body.cap, mode: body.mode, roundId: body.roundId }));
      }
      if (req.method === 'POST' && url.pathname === '/quote') {
        if (!isAdmin(req)) return send(res, 401, { error: 'coordinator key required' });
        const body = await readJson(req);
        await bind(body.shape === 'buy' ? [body.counterparty] : [], body); return send(res, 200, roost.runQuote({ shape: body.shape, pricing: body.pricing, counterparty: body.counterparty, amount: body.amount, units: body.units, limit: body.limit, roundId: body.roundId }));
      }
      if (req.method === 'POST' && url.pathname === '/ballot') {
        if (!isAdmin(req)) return send(res, 401, { error: 'coordinator key required' });
        const body = await readJson(req);
        await bind(Array.isArray(body.roll) ? body.roll : [], body); return send(res, 200, roost.runBallot({ options: body.options, roll: body.roll, share: body.share, quorumBps: body.quorumBps, rule: body.rule, weights: body.weights, thresholdBps: body.thresholdBps, roundId: body.roundId }));
      }
      if (req.method === 'POST' && url.pathname === '/rfq') {
        if (!isAdmin(req)) return send(res, 401, { error: 'coordinator key required' });
        const body = await readJson(req);
        await bind([], body); return send(res, 200, roost.runRfq({ taker: body.taker, makers: body.makers, pricing: body.pricing, roundId: body.roundId }));
      }
      if (req.method === 'POST' && url.pathname === '/payrun') {
        if (!isAdmin(req)) return send(res, 401, { error: 'coordinator key required' });
        const body = await readJson(req);
        await bind([body.employer], body); return send(res, 200, roost.runPayrun({ employer: body.employer, taxAddress: body.taxAddress, benefitsAddress: body.benefitsAddress, employerKeyHex: body.employerKeyHex, auditorKeyHex: body.auditorKeyHex, approver: body.approver, approverKeyHex: body.approverKeyHex, runId: body.runId, requireInvoices: body.requireInvoices === true }));
      }
      // Payroll routes that need no coordinator key: a payee submits a sealed invoice; the employer opens lines for an auditor with a signed request;
      // and three pure checks that read only what they are given, move no money and sign nothing.
      if (req.method === 'POST' && url.pathname === '/payrun/approve') return send(res, 200, await roost.approvePayrun(await readJson(req)));
      if (req.method === 'POST' && url.pathname === '/invoices') return send(res, 200, roost.submitInvoice(await readJson(req)));
      if (req.method === 'POST' && url.pathname === '/audit/open') return send(res, 200, await roost.openAuditLines(await readJson(req)));
      if (req.method === 'POST' && url.pathname === '/preflight') {
        const b = await readJson(req);
        if (!b.payment || !b.policy) return send(res, 400, { error: 'payment and policy are required' });
        return send(res, 200, preflight(b.payment, { policy: b.policy, spent: b.spent || {}, usedObligations: new Set(b.usedObligations || []), history: b.history || {}, person: b.person || null }));
      }
      if (req.method === 'POST' && url.pathname === '/invoice-check') {
        const b = await readJson(req);
        if (!b.invoice || !b.approval) return send(res, 400, { error: 'invoice and approval are required' });
        return send(res, 200, { ...matchApproval(b.invoice, b.approval), invoiceHash: b.invoice.body ? invoiceHash(b.invoice.body) : null });
      }
      if (req.method === 'POST' && url.pathname === '/auditor-verify') {
        const b = await readJson(req);
        if (!b.pack || typeof b.onChainOrderHash !== 'string') return send(res, 400, { error: 'pack and onChainOrderHash are required' });
        return send(res, 200, verifyAuditorPack(b.pack, b.onChainOrderHash));
      }
      if (req.method === 'POST' && url.pathname === '/cross') {
        if (!isAdmin(req)) return send(res, 401, { error: 'coordinator key required' });
        const body = await readJson(req);
        await bind([], body); return send(res, 200, roost.runCross({ referencePrice: body.referencePrice, maxUnits: body.maxUnits ?? null, roundId: body.roundId }));
      }
      if (req.method === 'POST' && url.pathname === '/auction') {
        if (!isAdmin(req)) return send(res, 401, { error: 'coordinator key required' });
        const body = await readJson(req);
        await bind([], body); return send(res, 200, roost.runAuction({ format: body.format, lotUnits: body.lotUnits, reserve: body.reserve, seller: body.seller, roundId: body.roundId }));
      }
      if (req.method === 'POST' && (url.pathname === '/aggregate' || url.pathname === '/settle')) {
        if (!isAdmin(req)) return send(res, 401, { error: 'coordinator key required' });
        const body = await readJson(req);
        return send(res, 200, url.pathname === '/aggregate' ? roost.aggregateAndClear({ roundId: body.roundId }) : roost.signSettlement(body));
      }
      if (req.method === 'POST' && url.pathname === '/abandon') {
        if (!isAdmin(req)) return send(res, 401, { error: 'coordinator key required' });
        return send(res, 200, { abandoned: true, ...roost.abandonSignedRound() });
      }
      return send(res, 404, { error: 'not found' });
    } catch (err) {
      const status = err.status || (err instanceof RoostAggregationError ? (/could not read escrow|round changed while escrow/.test(err.message) ? 503 : 400) : 500);
      return send(res, status, { error: status === 500 ? 'internal error' : err.message });
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const adminKey = process.env.ROOST_ADMIN_KEY;
  if (!adminKey || adminKey.length < 24) {
    console.error('ROOST_ADMIN_KEY (at least 24 characters) is required');
    process.exit(1);
  }
  const roost = roostFromEnv(process.env);
  const port = Number(process.env.PORT || 8080);
  createRoostServer({ roost, adminKey }).listen(port, '0.0.0.0', () => {
    const d = roost.describe();
    console.log(`[roost] listening on ${port}; simulated=${d.simulated}; settle key ${roost.settlePublicKey.slice(0, 16)}...`);
  });
}
