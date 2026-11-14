// Serves site/ the way a static host does and checks that the three pages load and that every local script, stylesheet and link they name resolves.
// No browser: the browser checks are scripts/check-site.mjs and scripts/playground-smoke.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const root = path.resolve(new URL('../site', import.meta.url).pathname);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(root, p);
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(fs.readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const localRefs = (html, base) => [...html.matchAll(/(?:src|href)="([^"#?]+)(?:[?#][^"]*)?"/g)].map((m) => m[1]).filter((u) => !/^(https?:|mailto:|data:|\/\/)/.test(u)).map((u) => new URL(u, base).pathname);

for (const page of ['/', '/playground/', '/replay/']) {
  test(`${page} answers 200 with HTML, and every local script, stylesheet and link in it resolves`, async (t) => {
    const server = await serve(); t.after(() => server.close());
    const base = `http://127.0.0.1:${server.address().port}${page}`;
    const res = await fetch(base);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    const html = await res.text();
    assert.match(html, /<title>[^<]+<\/title>/);
    const refs = localRefs(html, base);
    assert.ok(refs.length > 0, 'the page names at least one local file');
    const broken = [];
    for (const r of refs) { const got = await fetch(`http://127.0.0.1:${server.address().port}${r}`); if (got.status !== 200) broken.push(`${r} -> ${got.status}`); }
    assert.deepEqual(broken, []);
  });
}

test('a path that does not exist is a 404, so the check above can fail', async (t) => {
  const server = await serve(); t.after(() => server.close());
  assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/no-such-file.js`)).status, 404);
});
