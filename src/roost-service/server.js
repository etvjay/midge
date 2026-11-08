import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { HostedRoost } from './hosted-roost.js';
import { DstackSocketProvider } from './provider.js';
import { RoostAggregationError } from '../enclave/errors.js';
import { createEscrowReader } from './escrow-reader.js';

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

export function createRoostServer({ roost, adminKey }) {
  // With an escrow reader the run needs a fresh read first; the payers named in the request are read too (a ballot's whole roll, a buyer).
  const bind = async (accounts = []) => { if (roost.escrowReader) await roost.bindEscrow({ accounts: accounts.filter((a) => typeof a === 'string') }); };
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
        await bind(); return send(res, 200, roost.runPool({ recipient: body.recipient, min: body.min, cap: body.cap, roundId: body.roundId }));
      }
      if (req.method === 'POST' && url.pathname === '/quote') {
        if (!isAdmin(req)) return send(res, 401, { error: 'coordinator key required' });
        const body = await readJson(req);
        await bind(body.shape === 'buy' ? [body.counterparty] : []); return send(res, 200, roost.runQuote({ shape: body.shape, pricing: body.pricing, counterparty: body.counterparty, amount: body.amount, units: body.units, limit: body.limit, roundId: body.roundId }));
      }
      if (req.method === 'POST' && url.pathname === '/ballot') {
        if (!isAdmin(req)) return send(res, 401, { error: 'coordinator key required' });
        const body = await readJson(req);
        await bind(Array.isArray(body.roll) ? body.roll : []); return send(res, 200, roost.runBallot({ options: body.options, roll: body.roll, share: body.share, quorumBps: body.quorumBps, rule: body.rule, roundId: body.roundId }));
      }
      if (req.method === 'POST' && url.pathname === '/rfq') {
        if (!isAdmin(req)) return send(res, 401, { error: 'coordinator key required' });
        const body = await readJson(req);
        await bind(); return send(res, 200, roost.runRfq({ taker: body.taker, makers: body.makers, pricing: body.pricing, roundId: body.roundId }));
      }
      if (req.method === 'POST' && url.pathname === '/payrun') {
        if (!isAdmin(req)) return send(res, 401, { error: 'coordinator key required' });
        const body = await readJson(req);
        await bind([body.employer]); return send(res, 200, roost.runPayrun({ employer: body.employer, taxAddress: body.taxAddress, benefitsAddress: body.benefitsAddress, employerKeyHex: body.employerKeyHex, auditorKeyHex: body.auditorKeyHex, runId: body.runId }));
      }
      if (req.method === 'POST' && url.pathname === '/cross') {
        if (!isAdmin(req)) return send(res, 401, { error: 'coordinator key required' });
        const body = await readJson(req);
        await bind(); return send(res, 200, roost.runCross({ referencePrice: body.referencePrice, maxUnits: body.maxUnits ?? null, roundId: body.roundId }));
      }
      if (req.method === 'POST' && url.pathname === '/auction') {
        if (!isAdmin(req)) return send(res, 401, { error: 'coordinator key required' });
        const body = await readJson(req);
        await bind(); return send(res, 200, roost.runAuction({ format: body.format, lotUnits: body.lotUnits, reserve: body.reserve, seller: body.seller, roundId: body.roundId }));
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
  const provider = new DstackSocketProvider();
  // Optional: leave out bidders who cannot cover their charge, using escrow read from the contract at one block by two or more providers.
  const rpcUrls = (process.env.ROOST_RPC_URLS || '').split(',').map((u) => u.trim()).filter(Boolean);
  const escrowReader = rpcUrls.length && process.env.ROOST_CONTRACT_ID ? createEscrowReader({ rpcUrls, contractId: process.env.ROOST_CONTRACT_ID }) : null;
  const roost = new HostedRoost({ provider, escrowReader });
  const port = Number(process.env.PORT || 8080);
  createRoostServer({ roost, adminKey }).listen(port, '0.0.0.0', () => {
    const d = roost.describe();
    console.log(`[roost] listening on ${port}; simulated=${d.simulated}; settle key ${roost.settlePublicKey.slice(0, 16)}...`);
  });
}
