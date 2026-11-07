import { RoomError } from '../roost-service/room-service.js';

/**
 * A small client for the rooms web API. It returns the server's JSON and raises RoomError carrying the server's error code and
 * the HTTP status, so a caller handles one kind of failure whether the room is local or remote. The coordinator key is sent only
 * when one is given; a member's secret key never passes through here (inputs arrive already signed).
 */
export class RoomsClient {
  constructor({ baseUrl, adminKey = null, fetch: fetchImpl = globalThis.fetch, timeoutMs = 15_000 } = {}) {
    if (!baseUrl) throw new Error('RoomsClient needs a baseUrl');
    this.baseUrl = baseUrl.replace(/\/$/, ''); this.adminKey = adminKey; this.fetch = fetchImpl; this.timeoutMs = timeoutMs;
  }

  async #request(method, path, body) {
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), this.timeoutMs);
    let res;
    try {
      res = await this.fetch(this.baseUrl + path, {
        method, signal: ctl.signal,
        headers: { 'content-type': 'application/json', ...(this.adminKey ? { 'x-roost-admin-key': this.adminKey } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch { throw Object.assign(new RoomError('INTERNAL', 'could not reach the room service'), { status: 0 }); } finally { clearTimeout(timer); }
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const err = new RoomError(json?.code ?? 'INTERNAL', json?.error ?? `request failed with status ${res.status}`);
      err.status = res.status;
      const retry = Number(res.headers.get('retry-after')); if (retry) err.retryAfter = retry;
      throw err;
    }
    return json;
  }

  /**
   * Follow the live event stream. Calls onEvent({ id, event, data }) for each event until `signal` aborts or the stream ends, and
   * resolves then. It does not reconnect by itself: pass `lastEventId` to catch up from where you left off.
   */
  async subscribe(onEvent, { lastEventId, signal } = {}) {
    let res;
    try {
      res = await this.fetch(`${this.baseUrl}/v1/rooms/events`, { signal, headers: lastEventId !== undefined ? { 'last-event-id': String(lastEventId) } : {} });
    } catch (e) { if (signal?.aborted) return; throw Object.assign(new RoomError('INTERNAL', 'could not reach the room service'), { status: 0 }); }
    if (!res.ok) { const j = await res.json().catch(() => null); throw Object.assign(new RoomError(j?.code ?? 'INTERNAL', j?.error ?? `request failed with status ${res.status}`), { status: res.status }); }
    const dec = new TextDecoder(); let buf = '';
    try {
      for await (const chunk of res.body) {
        buf += dec.decode(chunk, { stream: true });
        let i; while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          if (block.startsWith(':') || block.startsWith('retry:')) continue;
          const f = {}; for (const line of block.split('\n')) { const m = /^(\w+): ?(.*)$/.exec(line); if (m) f[m[1]] = m[2]; }
          if (f.event) onEvent({ id: Number(f.id), event: f.event, data: JSON.parse(f.data) });
        }
      }
    } catch (e) { if (!signal?.aborted) throw e; }
  }

  describe() { return this.#request('GET', '/v1/rooms'); }
  openApi() { return this.#request('GET', '/v1/rooms/openapi.json'); }
  openRound(round) { return this.#request('POST', '/v1/rooms/round', round); }
  submit(input) { return this.#request('POST', '/v1/rooms/inputs', input); }
  run({ program, params = {}, round, includeConfidential = false }) { return this.#request('POST', '/v1/rooms/run', { program, params, round, includeConfidential }); }
}

/** Lets anything that expects a RoomService (the MCP server, for one) use a remote rooms API instead. */
export function remoteRooms(client) {
  return { describe: () => client.describe(), open: (round) => client.openRound(round), submit: (input) => client.submit(input), run: (req) => client.run(req) };
}
