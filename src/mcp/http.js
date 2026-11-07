/**
 * Streamable-HTTP endpoint for the MCP server: POST /mcp with a JSON-RPC message (or a batch), answered as JSON. Notifications get
 * 202. It uses the same dispatcher as the stdio binary. The coordinator key (X-Roost-Admin-Key, or a Bearer token) marks the caller
 * as the coordinator; without it, tools that open or run a round are refused with HTTP 401. A browser request whose Origin is not
 * on the allow-list is refused (DNS-rebinding guard); requests with no Origin (agents, servers) are fine.
 */
import crypto from 'node:crypto';
import { createRateLimiter } from '../roost-service/rate-limit.js';
import { COORDINATOR_ONLY } from './rooms-tools.js';

const safeEqual = (a, b) => crypto.timingSafeEqual(crypto.createHash('sha256').update(String(a)).digest(), crypto.createHash('sha256').update(String(b)).digest());

export function createMcpHttpHandler(rpc, { adminKey, path = '/mcp', maxBody = 256 * 1024, rate = {}, allowedOrigins = [], clientOf = (req) => req.socket.remoteAddress || 'unknown' } = {}) {
  if (!adminKey) throw new Error('createMcpHttpHandler needs an adminKey to mark the coordinator');
  const limiter = rate && typeof rate.take === 'function' ? rate : createRateLimiter(rate);
  const isCoordinator = (req) => {
    const h = req.headers['x-roost-admin-key']; const a = req.headers.authorization;
    return (typeof h === 'string' && safeEqual(h, adminKey)) || (typeof a === 'string' && a.startsWith('Bearer ') && safeEqual(a.slice(7), adminKey));
  };
  const readBody = (req) => new Promise((resolve, reject) => {
    let size = 0; let tooBig = Number(req.headers['content-length'] || 0) > maxBody; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > maxBody) tooBig = true; else if (!tooBig) chunks.push(c); });
    req.on('end', () => (tooBig ? reject(Object.assign(new Error('too large'), { status: 413 })) : resolve(Buffer.concat(chunks).toString('utf8'))));
    req.on('error', () => reject(Object.assign(new Error('unreadable'), { status: 400 })));
  });

  return async function handle(req, res) {
    if (new URL(req.url, 'http://mcp').pathname !== path) return false;
    const headers = { 'content-type': 'application/json', 'cache-control': 'no-store' };
    const send = (status, obj, extra = {}) => { res.writeHead(status, { ...headers, ...extra }); res.end(obj === null ? '' : JSON.stringify(obj)); return true; };
    const rpcError = (status, code, message, dataCode, extra) => send(status, { jsonrpc: '2.0', id: null, error: { code, message, ...(dataCode ? { data: { code: dataCode } } : {}) } }, extra);
    const origin = req.headers.origin;
    if (origin !== undefined && !allowedOrigins.includes(origin)) return rpcError(403, -32600, 'origin not allowed', 'NOT_AUTHORISED');
    const bucket = limiter.take(clientOf(req));
    Object.assign(headers, { 'x-ratelimit-limit': String(limiter.limit), 'x-ratelimit-remaining': String(bucket.remaining), 'x-ratelimit-reset': String(Math.ceil(bucket.resetAt / 1000)) });
    if (!bucket.allowed) return rpcError(429, -32002, 'too many requests; slow down', 'RATE_LIMITED', { 'retry-after': String(bucket.retryAfter) });
    if (req.method !== 'POST') return rpcError(405, -32600, 'use POST', 'METHOD_NOT_ALLOWED', { allow: 'POST' });
    let text;
    try { text = await readBody(req); } catch (e) { return rpcError(e.status ?? 400, -32600, e.status === 413 ? 'request body too large' : 'could not read the request body', 'INVALID_PARAMS'); }
    let payload;
    try { payload = JSON.parse(text); } catch { return rpcError(400, -32700, 'Parse error', 'INVALID_PARAMS'); }
    const coordinator = isCoordinator(req);
    const messages = Array.isArray(payload) ? payload : [payload];
    const needsKey = messages.find((m) => m && m.method === 'tools/call' && COORDINATOR_ONLY.has(m.params?.name));
    if (needsKey && !coordinator) return send(401, { jsonrpc: '2.0', id: needsKey.id ?? null, error: { code: -32001, message: `[${needsKey.params.name}] this tool needs the coordinator key`, data: { code: 'NOT_AUTHORISED' } } });
    const out = await rpc.handleAny(payload, { coordinator });
    return out === null ? send(202, null) : send(200, out);
  };
}
