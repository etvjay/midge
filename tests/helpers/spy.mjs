// Preload for tests: records every fetch (url, whether it carried an Authorization header) and every read of a file called .env.
// Requests to anything but this machine are answered with 503, so nothing leaves it. Writes the log to $SPY_LOG on exit.
import fs from 'node:fs';
const log = { requests: [], envReads: [] };
const real = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input?.url || input);
  const headers = new Headers(init?.headers || input?.headers || {});
  log.requests.push({ url, auth: headers.has('authorization'), method: (init?.method || input?.method || 'GET').toUpperCase() });
  if (/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) return real(input, init);
  return new Response('offline by test', { status: 503 });
};
const note = (p) => { if (typeof p === 'string' && /(^|[\\/])\.env$/.test(p)) log.envReads.push(p); };
for (const name of ['readFileSync', 'existsSync', 'statSync', 'openSync']) {
  const orig = fs[name]; fs[name] = function (p, ...rest) { note(p); return orig.call(this, p, ...rest); };
}
process.on('exit', () => { if (process.env.SPY_LOG) fs.writeFileSync(process.env.SPY_LOG, JSON.stringify(log)); });
