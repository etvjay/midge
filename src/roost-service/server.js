import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { HostedRoost } from './hosted-roost.js';
import { DstackSocketProvider } from './provider.js';
import { RoostAggregationError } from '../enclave/errors.js';

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
      if (req.method === 'POST' && url.pathname === '/intents') {
        const body = await readJson(req);
        return send(res, 200, roost.submitSealedIntent({ flyerId: body.flyerId, cipherTextHex: body.cipherTextHex }));
      }
      if (req.method === 'POST' && url.pathname === '/auction') {
        if (!isAdmin(req)) return send(res, 401, { error: 'coordinator key required' });
        const body = await readJson(req);
        return send(res, 200, roost.runAuction({ format: body.format, lotUnits: body.lotUnits, reserve: body.reserve, seller: body.seller, roundId: body.roundId }));
      }
      if (req.method === 'POST' && (url.pathname === '/aggregate' || url.pathname === '/settle')) {
        if (!isAdmin(req)) return send(res, 401, { error: 'coordinator key required' });
        const body = await readJson(req);
        return send(res, 200, url.pathname === '/aggregate' ? roost.aggregateAndClear({ roundId: body.roundId }) : roost.signSettlement(body));
      }
      return send(res, 404, { error: 'not found' });
    } catch (err) {
      const status = err.status || (err instanceof RoostAggregationError ? 400 : 500);
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
  const roost = new HostedRoost({ provider });
  const port = Number(process.env.PORT || 8080);
  createRoostServer({ roost, adminKey }).listen(port, '0.0.0.0', () => {
    const d = roost.describe();
    console.log(`[roost] listening on ${port}; simulated=${d.simulated}; settle key ${roost.settlePublicKey.slice(0, 16)}...`);
  });
}
