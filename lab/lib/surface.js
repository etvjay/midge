import fs from 'node:fs';
import path from 'node:path';

/**
 * The interface surface, derived from source so a coverage claim cannot drift from the code:
 *  - HTTP routes: parsed from the dispatch conditions in src/api/server.js, in server order (first match wins)
 *  - SSE: the routes whose handler writes text/event-stream
 *  - MCP tools: FLY_MCP_TOOLS, imported
 *  - SDK methods: the public async methods of FlyClient
 * `matchRoute` replays the server's own matching so a request can be attributed to the route that served it.
 */
export function httpRoutes(rootDir) {
  const lines = fs.readFileSync(path.join(rootDir, 'src/api/server.js'), 'utf8').split('\n');
  const start = lines.findIndex((l) => l.includes("const pathname = url.pathname"));
  const end = lines.findIndex((l, i) => i > start && l.includes('// 404 Not Found'));
  const routes = [];
  for (let i = start; i < end; i += 1) {
    const m = lines[i].match(/^ {4}if \((.*)\) \{$/);
    if (!m) continue;
    const cond = m[1];
    if (/pathname !== /.test(cond) || /method === 'OPTIONS'/.test(cond)) continue; // auth and CORS preflight, not routes
    const paths = [];
    for (const x of cond.matchAll(/pathname === '([^']+)'/g)) paths.push({ kind: 'exact', value: x[1] });
    for (const x of cond.matchAll(/pathname\.startsWith\('([^']+)'\)/g)) paths.push({ kind: 'prefix', value: x[1] });
    for (const x of cond.matchAll(/pathname\.match\(\/(.+?)\/\)/g)) paths.push({ kind: 'regex', value: x[1] });
    if (!paths.length) continue;
    const excludes = [...cond.matchAll(/!pathname\.includes\('([^']+)'\)/g)].map((x) => x[1]);
    let methods = [...cond.matchAll(/method === '(GET|POST)'/g)].map((x) => x[1]);
    if (!methods.length) methods = [...lines.slice(i + 1, i + 14).join('\n').matchAll(/if \(method === '(GET|POST)'\)/g)].map((x) => x[1]); // e.g. pods
    const seen = new Set();
    for (const p of paths) {
      if (p.kind === 'exact' && p.value.length > 1 && p.value.endsWith('/') && paths.some((q) => q.kind === 'exact' && q.value === p.value.slice(0, -1))) continue; // trailing-slash alias
      for (const method of methods) {
        const key = `${method} ${label(p)}`;
        if (seen.has(key)) continue; seen.add(key);
        routes.push({ method, ...p, excludes, key, line: i + 1, sse: lines.slice(i, i + 6).join('\n').includes('text/event-stream') });
      }
    }
  }
  return routes;
}

function label(p) {
  if (p.kind === 'exact') return p.value;
  if (p.kind === 'prefix') return `${p.value}*`;
  return p.value.replace(/^\^/, '').replace(/\$$/, '').replace(/\\\//g, '/').replace(/\[\^\/\]\+/g, ':p').replace(/\[\^\\\/\]\+/g, ':p');
}

/** Which declared route serves this request? Mirrors the server: declaration order, first match wins. */
export function matchRoute(routes, method, pathname) {
  for (const r of routes) {
    if (r.method !== method) continue;
    if (r.excludes.some((x) => pathname.includes(x))) continue;
    const ok = r.kind === 'exact' ? pathname === r.value : r.kind === 'prefix' ? pathname.startsWith(r.value) : new RegExp(r.value).test(pathname);
    if (ok) return r;
  }
  return null;
}

export function sdkMethods(rootDir) {
  const src = fs.readFileSync(path.join(rootDir, 'src/sdk/client.js'), 'utf8');
  return [...src.matchAll(/^ {2}(?:async \*?|\*)?([a-zA-Z_]\w*)\(/gm)].map((m) => m[1]).filter((n) => !n.startsWith('_') && !['constructor', 'if', 'for', 'while', 'switch', 'catch'].includes(n));
}
