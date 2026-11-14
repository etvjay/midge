#!/usr/bin/env node
/**
 * Drives the real playground page in headless Chromium against the DEPLOYED service and room, on real testnet, with the real model: one whole round, as a visitor
 * would do it. It serves site/ from this machine and points the page at the service named in site/playground/config.js.
 *
 *   node scripts/playground-live-check.mjs
 *
 * The browser runs with web security off, because the service allows cross-site calls only from the site's own origin and this page is served from
 * http://127.0.0.1. That means this checks the page and the service together, and NOT the cross-site rules: those are checked with a preflight request from the
 * site's origin (curl). A round costs about 0.07 NEAR of the funding account and one model call, and leaves the visitor's own account behind, as a visitor would.
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const results = []; let failed = false;
const ok = (name, pass, detail = '') => { results.push(pass); if (!pass) failed = true; console.log(`${pass ? '✓' : '✗'} ${name}${pass || !detail ? '' : `  (${String(detail).slice(0, 220)})`}`); };

const site = http.createServer((req, res) => {
  let p = new URL(req.url, 'http://x').pathname; if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, 'site', p);
  if (!f.startsWith(path.join(root, 'site') + path.sep) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
await new Promise((r) => site.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${site.address().port}`;

const userData = fs.mkdtempSync(path.join(os.homedir(), 'pglive-')); const debugPort = 9400 + Math.floor(Math.random() * 400);
const proc = spawn(process.env.CHROMIUM || 'chromium', ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-web-security', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${userData}`, 'about:blank'], { stdio: 'ignore' });
let target = null;
for (let i = 0; i < 40 && !target; i += 1) { try { target = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* not up yet */ } if (!target) await sleep(500); }
if (!target) { console.error('could not start Chromium'); process.exit(2); }
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map(); const consoleErrors = [];
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } else if (d.method === 'Runtime.exceptionThrown') consoleErrors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text); else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') consoleErrors.push(d.params.args.map((a) => a.value ?? a.description).join(' ')); });
const send = (method, params = {}) => new Promise((resolve) => { const i = ++id; pending.set(i, resolve); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
const waitFor = async (expression, what, timeoutMs = 120000) => { const t0 = Date.now(); for (;;) { if (await ev(expression)) return true; if (Date.now() - t0 > timeoutMs) { ok(`waited for ${what}`, false, 'timed out'); return false; } await sleep(500); } };
const clickText = (text) => ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes(${JSON.stringify(text)}) && !x.disabled); if (!b) return false; b.click(); return true; })()`);
const text = () => ev('document.body.innerText');
const shot = async (name) => { if (!process.env.SHOTS) return; fs.mkdirSync(process.env.SHOTS, { recursive: true }); await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }); const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); fs.writeFileSync(path.join(process.env.SHOTS, `${name}.png`), Buffer.from(r.result.data, 'base64')); };

try {
  await send('Runtime.enable'); await send('Page.enable');
  const t0 = Date.now();
  await send('Page.navigate', { url: `${origin}/playground/` });
  await waitFor(`document.body.innerText.includes('Service: ready')`, 'the page to see the service', 30000);
  ok('the page reaches the deployed service', (await text()).includes('Service: ready'));
  await clickText('Withhold no tax from Cy');
  await clickText('Ask the model to review this run');
  await waitFor(`document.body.innerText.includes('What the model saw')`, 'the live model review', 90000);
  const rv = await text();
  ok('the live model flags the planted line, and the browser recomputed it', rv.includes('zero-deduction') && await ev(`[...document.querySelectorAll('#s-3 .chip')].some((c) => c.textContent === 'recomputed')`));
  ok('the model\'s receipt verified in the browser', rv.includes('signature on its reply verifies here') && !(await ev(`[...document.querySelectorAll('#s-3 .chip')].some((c) => c.textContent === 'failed')`)));
  await shot('live-1-review');
  await clickText('Use a correct run'); await clickText('Ask the model to review this run');
  await waitFor(`document.body.innerText.includes('What the model saw') && !document.body.innerText.includes('zero-deduction')`, 'the second review', 90000);
  const secondsSincePageOpened = Math.round((Date.now() - t0) / 1000);
  console.log(`  (the visitor presses Start ${secondsSincePageOpened} seconds after opening the page)`);
  await clickText('Start the round');
  const gotApproval = await waitFor(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Approve with my key')) || document.body.innerText.includes('The round could not') || document.querySelector('#s-4 .banner.bad')`, 'the approval step or an error', 300000);
  const t1 = await text();
  const reachedApproval = await ev(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Approve with my key'))`);
  ok('the round reaches the approval step', reachedApproval, (await ev(`document.querySelector('#s-4 .banner.bad')?.innerText || ''`)) || t1.slice(t1.indexOf('You approve it'), t1.indexOf('You approve it') + 300));
  if (reachedApproval) {
    await shot('live-2-approval');
    ok('the approval step shows who is in the run, with real account ids', t1.includes('Who is in this run') && /\.play\.fly-1793636729\.testnet/.test(t1));
    ok('the message to sign was built in the browser and matches the service\'s', await ev(`[...document.querySelectorAll('.checks .check')].some((c) => c.textContent.toLowerCase().includes('the message you sign is built here') && c.querySelector('.chip').textContent === 'recomputed')`));
    await clickText('Try to approve with a different key');
    await waitFor(`document.body.innerText.includes('The room refused it')`, 'the refusal', 60000);
    ok('the room refused an approval from a different key', (await text()).includes('is not a key of'));
    await clickText('Approve with my key');
    await waitFor(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Open my payslip'))`, 'the settlement', 240000);
    const t2 = await text();
    await shot('live-3-settlement');
    ok('the settlement lists the payments and your own account', t2.includes('(your account)'));
    ok('the browser read the settlement from two providers and agreed', await ev(`[...document.querySelectorAll('#settle-checks .chip')].some((c) => c.textContent === 'recomputed')`));
    ok('your account holds your pay, read from the chain', /now holds 0\.058 NEAR/.test(t2), (t2.match(/now holds [0-9.]+ NEAR/) || [''])[0]);
    await clickText('Open my payslip');
    await waitFor(`document.body.innerText.includes('VERIFIED')`, 'the payslip', 60000);
    ok('your payslip verifies', (await text()).includes('VERIFIED') && !(await text()).includes('DOES NOT VERIFY'));
    await shot('live-4-payslip');
    await clickText('Raise my net pay');
    ok('a payslip with the net raised does not verify', (await text()).includes('DOES NOT VERIFY'));
  }
  ok('the console had no errors', consoleErrors.length === 0, consoleErrors.join(' | '));
} catch (e) { ok('the check ran to the end', false, e.stack || e.message); }
finally { try { ws.close(); } catch { /* closing */ } proc.kill('SIGKILL'); site.close(); fs.rmSync(userData, { recursive: true, force: true }); }
console.log(`\n${results.filter(Boolean).length} of ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
