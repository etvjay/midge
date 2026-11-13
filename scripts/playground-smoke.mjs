#!/usr/bin/env node
/**
 * Drives the real playground page in headless Chromium, with clicks, against a local stack: the real service, a real room (the HostedRoost class with a
 * simulated attestation provider) in this process, a stand-in chain that follows the contract's rules, a stand-in model that signs its receipt with a real
 * key, and a mock NEAR RPC that answers about the stand-in chain's settlement. It checks that the page works from the first screen to a verified payslip,
 * that the cheat buttons fail, and that the console has no errors.   npm run smoke:playground
 * It needs Chromium (set CHROMIUM=/path if it is not `chromium`). It is not part of `npm run verify`, which has no browser.
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { HostedRoost } from '../src/roost-service/hosted-roost.js';
import { createRoostServer } from '../src/roost-service/server.js';
import { HostedRoostClient } from '../src/roost-service/client.js';
import { buildPlayground } from '../src/playground/app.js';
import { fakeChain, fakeAdvisor } from '../src/playground/fakes.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = []; let failed = false;
const ok = (name, pass, detail = '') => { results.push({ name, pass }); if (!pass) failed = true; console.log(`${pass ? '✓' : '✗'} ${name}${pass || !detail ? '' : `  (${String(detail).slice(0, 200)})`}`); };

// ---- the stack ----
const chain = fakeChain();
chain.accountKeyCheck = async (id, pk) => { const a = chain.accounts.get(id); return Boolean(a) && (a.publicKey ? a.publicKey === pk : chain.derive(id).publicKey === pk); };
const provider = { simulated: true, attest: async () => Buffer.from('smoke-no-hardware'), info: async () => ({}) };
const roost = new HostedRoost({ provider, requireSignedInputs: true, accountKeyCheck: chain.accountKeyCheck });
const roomServer = createRoostServer({ roost, adminKey: 'smoke-admin' }); const roomPort = await listen(roomServer);
const rpc = http.createServer((req, res) => {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST, OPTIONS' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => {
    const q = JSON.parse(b || '{}'); const settle = chain.sent.filter((s) => s.method === 'settle_batch_charged').at(-1);
    const result = q.method === 'tx' ? { transaction: { actions: [{ FunctionCall: { args: Buffer.from(JSON.stringify(settle?.args || {})).toString('base64') } }] }, status: { SuccessValue: '' } } : { amount: '58000000000000000000000' };
    res.writeHead(200, { 'content-type': 'application/json', ...cors }); res.end(JSON.stringify({ jsonrpc: '2.0', id: q.id, result }));
  });
});
const rpcPort = await listen(rpc);
let siteOrigin = null;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
let svcPort = null;
const site = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x'); let p = url.pathname; if (p.endsWith('/')) p += 'index.html';
  if (p === '/playground/config.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(`window.PLAYGROUND_CONFIG = { apiBase: 'http://127.0.0.1:${svcPort}', rpcUrls: ['http://127.0.0.1:${rpcPort}/a', 'http://127.0.0.1:${rpcPort}/b'] };`); }
  const f = path.join(root, 'site', p);
  if (!f.startsWith(path.join(root, 'site')) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
const sitePort = await listen(site); siteOrigin = `http://127.0.0.1:${sitePort}`;
const svcApp = buildPlayground({ env: { PLAYGROUND_ORIGIN: siteOrigin, PLAYGROUND_PER_ADDRESS: '50' }, overrides: { chain, room: new HostedRoostClient({ baseUrl: `http://127.0.0.1:${roomPort}`, adminKey: 'smoke-admin' }), advisor: fakeAdvisor(), keyCheck: chain.accountKeyCheck, waker: null } });
svcPort = await svcApp.start(0);

// ---- the browser ----
const chromium = process.env.CHROMIUM || 'chromium';
const userData = fs.mkdtempSync(path.join(os.homedir(), 'pgsmoke-')); const debugPort = 9400 + Math.floor(Math.random() * 400);
const proc = spawn(chromium, ['--headless=new', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${userData}`, 'about:blank'], { stdio: 'ignore' });
let target = null;
for (let i = 0; i < 40 && !target; i += 1) { try { const list = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json(); target = list.find((t) => t.type === 'page'); } catch { /* not up yet */ } if (!target) await sleep(500); }
if (!target) { console.error('could not start Chromium'); process.exit(2); }
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map(); const consoleErrors = [];
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } else if (d.method === 'Runtime.exceptionThrown') consoleErrors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text); else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') consoleErrors.push(d.params.args.map((a) => a.value ?? a.description).join(' ')); });
const send = (method, params = {}) => new Promise((resolve) => { const i = ++id; pending.set(i, resolve); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); return r.result?.result?.value; };
const waitFor = async (expression, what, timeoutMs = 60000) => { const t0 = Date.now(); for (;;) { if (await ev(expression)) return true; if (Date.now() - t0 > timeoutMs) { ok(`waited for ${what}`, false, 'timed out'); return false; } await sleep(300); } };
const clickText = (text) => ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes(${JSON.stringify(text)}) && !x.disabled); if (!b) return false; b.click(); return true; })()`);
const textOf = () => ev('document.body.innerText');
const shot = async (name, width = 1280) => { if (!process.env.SHOTS) return; fs.mkdirSync(process.env.SHOTS, { recursive: true }); await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 }); const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); fs.writeFileSync(path.join(process.env.SHOTS, `${name}.png`), Buffer.from(r.result.data, 'base64')); };

try {
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: `${siteOrigin}/playground/` });
  await waitFor(`document.body.innerText.includes('Service: ready')`, 'the status strip to say the service is ready', 15000);
  ok('the page shows the service as ready', (await textOf()).includes('Service: ready'));
  ok('the first screen has the six steps', (await ev(`document.querySelectorAll('#steps section.step').length`)) === 6);
  await shot('1-first-screen');
  ok('your own keys are shown, as a NEAR key and a payslip key', (await textOf()).includes('NEAR public key') && (await textOf()).includes('Payslip public key'));
  ok('the start button is disabled before any review', await ev(`(() => { const b = document.getElementById('start-btn'); return Boolean(b) && b.disabled; })()`));

  await clickText('Withhold no tax from Cy');
  ok('the planted preset sets Cy\'s tax to 0', (await ev(`document.querySelectorAll('#row-2 input')[2].value`)) === '0');
  await clickText('Ask the model to review this run');
  await waitFor(`document.body.innerText.includes('What the model saw')`, 'the review');
  const t1 = await textOf();
  await shot('2-review');
  ok('the review flags the planted line and says the browser recomputed it', t1.includes('zero-deduction') && (await ev(`[...document.querySelectorAll('#s-3 .chip')].some((c) => c.textContent === 'recomputed')`)));
  ok('the model\'s receipt check ran in the browser and passed', t1.includes('signature on its reply verifies here') && !(await ev(`[...document.querySelectorAll('#s-3 .chip')].some((c) => c.textContent === 'failed')`)));
  ok('the start button opens for exactly the lines that were reviewed', await ev(`!document.getElementById('start-btn').disabled`));

  // an edit closes it again
  await ev(`(() => { const i = document.querySelectorAll('#row-0 input')[1]; i.value = '0.051'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  ok('one edit removes the review and disables the start button again', (await ev(`document.getElementById('start-btn').disabled`)) && !(await textOf()).includes('What the model saw'));
  await clickText('Use a correct run');
  await clickText('Ask the model to review this run');
  await waitFor(`document.body.innerText.includes('What the model saw')`, 'the second review');
  ok('the correct run is reviewed with nothing to flag', (await textOf()).includes('found nothing to flag') || (await textOf()).includes('No problems found'));
  await clickText('Start the round');
  await waitFor(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Approve with my key'))`, 'the approval step', 90000);
  const t2 = await textOf();
  await shot('3-approval');
  ok('the approval step names who is in the run, with account ids', t2.includes('Who is in this run') && /\.play\.f\.testnet/.test(t2));
  ok('the summary sealed to you opens in the browser and matches the order hash', await ev(`[...document.querySelectorAll('.checks .check')].some((c) => c.textContent.includes('same order hash') && c.querySelector('.chip').textContent === 'recomputed')`));
  await clickText('Try to approve with a different key');
  await waitFor(`document.body.innerText.includes('The room refused it')`, 'the refusal of a different key');
  ok('an approval with a different key is refused by the room', (await textOf()).includes('is not a key of'));
  await clickText('Approve with my key');
  await waitFor(`[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Open my payslip'))`, 'the settlement', 90000);
  const t3 = await textOf();
  await shot('4-settlement');
  ok('the settlement step lists the payments and your account', t3.includes('(your account)') && t3.includes('Transaction'));
  ok('the browser read the settlement from two providers and agreed', await ev(`[...document.querySelectorAll('#settle-checks .chip')].some((c) => c.textContent === 'recomputed')`));
  await clickText('Open my payslip');
  await waitFor(`document.body.innerText.includes('VERIFIED')`, 'the payslip', 30000);
  await shot('5-payslip');
  ok('your payslip verifies', (await textOf()).includes('VERIFIED') && !(await textOf()).includes('DOES NOT VERIFY'));
  await clickText('Raise my net pay');
  await shot('6-cheat');
  ok('a payslip with the net raised does not verify', (await textOf()).includes('DOES NOT VERIFY'));
  await clickText('Open it with a different key');
  ok('a payslip opened with a different key does not open', (await textOf()).includes('does not open with a different key') || (await textOf()).includes('DOES NOT VERIFY'));
  await clickText('Check my payslip');
  ok('checking it again, it verifies', (await textOf()).includes('VERIFIED'));
  await shot('7-mobile', 390);
  await svcApp.round.idle();
  ok('afterwards only your account remains on the stand-in chain', chain.accounts.size === 1 && chain.groups.size === 0, JSON.stringify([...chain.accounts.keys()]));
  ok('the console had no errors', consoleErrors.length === 0, consoleErrors.join(' | '));
} catch (e) { ok('the smoke test ran to the end', false, e.stack || e.message); }
finally {
  try { ws.close(); } catch { /* closing */ } proc.kill('SIGKILL');
  await svcApp.stop().catch(() => {}); for (const s of [roomServer, rpc, site]) s.close();
  fs.rmSync(userData, { recursive: true, force: true });
}
console.log(`\n${results.filter((r) => r.pass).length} of ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
