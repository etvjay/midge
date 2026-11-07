/**
 * The web adapter for RoomService. It only translates: routes, the coordinator key, a rate limit, body limits and one error shape.
 * There is no room logic here. Mount it beside any other handler:
 *
 *   const handle = createRoomHandler(service, { adminKey });
 *   http.createServer(async (req, res) => { if (!(await handle(req, res))) { ...your other routes... } });
 *
 * It answers every request under /v1/rooms and returns false for anything else.
 */
import crypto from 'node:crypto';
import { RoomError } from './room-service.js';
import { buildOpenApi } from './room-openapi.js';
import { createRateLimiter } from './rate-limit.js';
import { createClientResolver } from './client-id.js';

/** The single table the router serves and the OpenAPI document describes. */
export const ROUTES = [
  { method: 'GET', path: '/v1/rooms', auth: 'none', op: 'describeRooms', summary: 'Describe the rooms available, their parameters and the room\'s public keys' },
  { method: 'GET', path: '/v1/rooms/openapi.json', auth: 'none', op: 'openapi', summary: 'This API\'s OpenAPI document' },
  { method: 'POST', path: '/v1/rooms/round', auth: 'coordinator', op: 'openRound', summary: 'Open a round (coordinator only); signed inputs are bound to it' },
  { method: 'POST', path: '/v1/rooms/inputs', auth: 'none', op: 'submitInput', summary: 'Submit one sealed, signed input to the open round' },
  { method: 'GET', path: '/v1/rooms/events', auth: 'none', op: 'events', summary: 'A live server-sent event stream of rounds opening, inputs arriving (a count) and rooms running' },
  { method: 'POST', path: '/v1/rooms/run', auth: 'coordinator', op: 'runRoom', summary: 'Run a room and receive the outcome and the finished contract call (coordinator only)' },
];

export const STATUS_OF = { INVALID_PARAMS: 400, NOT_AUTHORISED: 403, UNKNOWN_PROGRAM: 404, ROUND_NOT_OPEN: 409, NO_INPUTS: 409, ALREADY_SIGNED: 409, INTERNAL: 500, UNAVAILABLE: 503 };

const safeEqual = (a, b) => crypto.timingSafeEqual(crypto.createHash('sha256').update(String(a)).digest(), crypto.createHash('sha256').update(String(b)).digest());

const MAX_STREAM_BUFFER = 1024 * 1024; // a client that lets this much pile up unread is dropped

export function createRoomHandler(service, { adminKey, maxBody = 256 * 1024, rate = {}, events = null, maxStreams = 50, heartbeatMs = 15_000, trustedProxies = [], clientOf = createClientResolver({ trustedProxies }) } = {}) {
  if (!adminKey) throw new Error('createRoomHandler needs an adminKey to protect opening and running a round');
  const limiter = rate && typeof rate.take === 'function' ? rate : createRateLimiter(rate); // a limiter instance may be shared with other doors
  const limit = limiter.limit;
  let streams = 0;
  const isCoordinator = (req) => {
    const h = req.headers['x-roost-admin-key']; const a = req.headers.authorization;
    return (typeof h === 'string' && safeEqual(h, adminKey)) || (typeof a === 'string' && a.startsWith('Bearer ') && safeEqual(a.slice(7), adminKey));
  };
  const readBody = (req) => new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'] || 0);
    let size = 0; let tooBig = declared > maxBody; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > maxBody) tooBig = true; else if (!tooBig) chunks.push(c); });
    req.on('end', () => {
      if (tooBig) return reject(Object.assign(new RoomError('INVALID_PARAMS', 'request body too large'), { status: 413 }));
      if (size === 0) return resolve({});
      let v; try { v = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return reject(new RoomError('INVALID_PARAMS', 'request body is not valid JSON')); }
      if (!v || typeof v !== 'object' || Array.isArray(v)) return reject(new RoomError('INVALID_PARAMS', 'request body must be a JSON object'));
      resolve(v);
    });
    req.on('error', () => reject(new RoomError('INVALID_PARAMS', 'could not read the request body')));
  });

  return async function handle(req, res) {
    const path = new URL(req.url, 'http://rooms').pathname;
    if (path !== '/v1/rooms' && !path.startsWith('/v1/rooms/')) return false;
    const headers = { 'content-type': 'application/json', 'cache-control': 'no-store' };
    const bucket = limiter.take(clientOf(req));
    Object.assign(headers, { 'x-ratelimit-limit': String(limit), 'x-ratelimit-remaining': String(bucket.remaining), 'x-ratelimit-reset': String(Math.ceil(bucket.resetAt / 1000)) });
    const send = (status, obj, extra = {}) => { res.writeHead(status, { ...headers, ...extra }); res.end(JSON.stringify(obj)); return true; };
    const fail = (status, code, error, extra) => send(status, { error, code }, extra);
    try {
      if (!bucket.allowed) return fail(429, 'RATE_LIMITED', 'too many requests; slow down', { 'retry-after': String(bucket.retryAfter) });
      const matching = ROUTES.filter((r) => r.path === path);
      if (matching.length === 0) return fail(404, 'NOT_FOUND', 'no such route');
      const route = matching.find((r) => r.method === req.method);
      if (!route) return fail(405, 'METHOD_NOT_ALLOWED', `use ${matching.map((r) => r.method).join(', ')}`, { allow: matching.map((r) => r.method).join(', ') });
      if (route.auth === 'coordinator' && !isCoordinator(req)) return fail(401, 'NOT_AUTHORISED', 'the coordinator key is required');
      if (route.op === 'events') {
        const hub = events ?? service.events;
        if (!hub) return fail(503, 'UNAVAILABLE', 'the event stream is not available');
        if (streams >= maxStreams) return fail(503, 'UNAVAILABLE', 'too many open streams; try again shortly', { 'retry-after': '5' });
        streams += 1;
        res.writeHead(200, { ...headers, 'content-type': 'text/event-stream', connection: 'keep-alive', 'x-accel-buffering': 'no' });
        res.write('retry: 3000\n\n');
        let done = false; let off = () => {}; let timer = null;
        const cleanup = () => { if (done) return; done = true; off(); if (timer) clearInterval(timer); streams -= 1; };
        const write = (e) => {
          if (res.writableLength > MAX_STREAM_BUFFER) { cleanup(); res.end(); return; }
          res.write(`id: ${e.id}\nevent: ${e.type}\ndata: ${JSON.stringify(e.data)}\n\n`);
        };
        const raw = req.headers['last-event-id'] ?? new URL(req.url, 'http://rooms').searchParams.get('lastEventId');
        const last = raw !== undefined && raw !== null && raw !== '' && Number.isInteger(Number(raw)) ? Number(raw) : null;
        if (last !== null) for (const e of hub.since(last)) write(e); // replay and subscribe in one tick, so nothing is missed in between
        off = hub.subscribe(write);
        timer = setInterval(() => { if (!done) res.write(': keepalive\n\n'); }, heartbeatMs); timer.unref?.();
        req.on('close', cleanup); res.on('close', cleanup); res.on('error', cleanup);
        return true;
      }
      const body = route.method === 'POST' ? await readBody(req) : null;
      switch (route.op) {
        case 'describeRooms': return send(200, service.describe());
        case 'openapi': return send(200, buildOpenApi(service.describe(), ROUTES));
        case 'openRound': return send(200, service.open(body));
        case 'submitInput': return send(200, await service.submit(body));
        case 'runRoom': return send(200, await service.run({ program: body.program, params: body.params ?? {}, round: body.round, includeConfidential: body.includeConfidential === true }));
        default: return fail(500, 'INTERNAL', 'internal error');
      }
    } catch (e) {
      if (e instanceof RoomError) return fail(e.status ?? STATUS_OF[e.code] ?? 500, e.code, e.message);
      return fail(500, 'INTERNAL', 'internal error'); // never echo an unexpected error's text or stack
    }
  };
}
