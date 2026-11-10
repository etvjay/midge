#!/usr/bin/env node
// Browser checks for the public site: serves site/ locally and loads it in Chromium at 1440 and 390 px, with motion, with reduced
// motion, and with JavaScript off. Reports console errors, horizontal overflow, the smallest rendered scene text, text contrast
// below WCAG AA, interactive targets under 24 px, and first paint on a warm load; saves section screenshots. Exit code 1 if a budget fails.
//
//   node scripts/check-site.mjs            (ONLY=390:nojs,1440:motion limits the runs; CHROMIUM=/path/to/chrome and PLAYWRIGHT_CORE=/path/to/playwright-core override the defaults)
//
// Text over a canvas or an image is measured against the nearest solid background behind it; SVG scene text is measured against
// the opaque fill of the shape under it, or the stage colour when the shape is translucent. Inline links inside a sentence are
// exempt from the target size (WCAG 2.5.8 inline exception).
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(root, 'site');
const SHOTS = path.join(os.homedir(), 'shots-midge');
const require = createRequire(import.meta.url);
const pwPath = process.env.PLAYWRIGHT_CORE || (() => { try { return require.resolve('playwright-core'); } catch { return '/home/ubuntu/tools/shots/node_modules/playwright-core'; } })();
const { chromium } = require(pwPath);
const BUDGET = { minSceneText: 11, minTarget: 24, firstPaintMs: 1000, fieldDrawsPerSec: 75 };
const SWEEP = [601, 640, 700, 760, 900, 901, 960, 1024, 1100, 1180, 1280]; // widths between the two main ones, where the card layout changes

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = path.join(SITE, rel.endsWith('/') ? `${rel}index.html` : rel);
  if (!file.startsWith(SITE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((go) => server.listen(0, '127.0.0.1', go));
const URL0 = `http://127.0.0.1:${server.address().port}/`;
fs.mkdirSync(SHOTS, { recursive: true });

// Runs in the page: every measurement except errors, paint and screenshots.
function measure() {
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const over = (top, under) => { const a = top[3]; return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1); };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const bgOf = (el) => { // solid colour behind el: blend translucent layers up to the first opaque one
    const layers = []; for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; } }
    let base = [255, 255, 255, 1]; for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base); return base; };
  const visible = (el) => { const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) return false; return !el.closest('[hidden],[aria-hidden="true"]:not(svg)'); };
  const label = (el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''} "${(el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40)}"`;

  const contrast = [];
  for (const el of document.querySelectorAll('body *:not(script):not(style):not(svg *):not(svg)')) {
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim())) continue;
    if (!visible(el)) continue;
    const s = getComputedStyle(el); const fg = parse(s.color); if (!fg) continue;
    const bg = bgOf(el); const r = ratio(over(fg, bg), bg); const size = parseFloat(s.fontSize); const large = size >= 24 || (size >= 18.66 && +s.fontWeight >= 700);
    if (r < (large ? 3 : 4.5)) contrast.push(`${label(el)} ${r.toFixed(2)}:1 at ${size}px`);
  }
  let minScene = Infinity, minSceneAt = '';
  for (const t of document.querySelectorAll('.b-scene svg text, svg.dg text')) {
    const svg = t.ownerSVGElement; if (!visible(svg) || !t.getClientRects().length) continue;
    const scale = svg.getScreenCTM() ? svg.getScreenCTM().a : 1; const px = parseFloat(getComputedStyle(t).fontSize) * scale;
    if (px < minScene) { minScene = px; minSceneAt = label(t); }
    const fill = parse(getComputedStyle(t).fill); if (!fill) continue;
    const r0 = t.getBoundingClientRect(); const hits = document.elementsFromPoint(r0.x + r0.width / 2, r0.y + r0.height / 2);
    const shape = hits.find((h) => h !== t && h.ownerSVGElement === svg && /^(rect|path|circle)$/.test(h.tagName) && parse(getComputedStyle(h).fill)?.[3] >= 1);
    const bg = shape ? parse(getComputedStyle(shape).fill) : bgOf(svg.closest('.b-panel, .bc') || svg);
    const r = ratio(over([fill[0], fill[1], fill[2], fill[3] * (+getComputedStyle(t).fillOpacity || 1)], bg), bg);
    if (r < 4.5) contrast.push(`scene ${label(t)} ${r.toFixed(2)}:1`);
  }
  const small = [];
  for (const el of document.querySelectorAll('a[href], button, summary, [role="tab"], input, select, textarea')) {
    if (!visible(el)) continue; const s = getComputedStyle(el); if (s.position === 'absolute' && s.clip !== 'auto') continue;
    if (s.display === 'inline' && el.closest('p, li') && el.closest('p, li').textContent.trim().length > el.textContent.trim().length + 10) continue;
    const r = el.getBoundingClientRect(); if (r.width < 24 || r.height < 24) small.push(`${label(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  const clipped = [...document.querySelectorAll('.cmd code')].filter((c) => visible(c) && c.scrollWidth > c.clientWidth + 1).map((c) => `command cut off: ${label(c)}`);
  const chip = document.querySelector('.chain-chip.ok'); if (chip && visible(chip) && chip.getBoundingClientRect().height > 32) clipped.push(`live chip wraps (${Math.round(chip.getBoundingClientRect().height)}px tall)`);
  return { clipped, overflow: document.documentElement.scrollWidth - innerWidth, minScene: minScene === Infinity ? null : +minScene.toFixed(1), minSceneAt, contrast, small,
    sections: [...document.querySelectorAll('header.hero, .hero, main > section[id], body > section[id], footer[id]')].map((s) => s.id || 'hero').filter((v, i, a) => a.indexOf(v) === i) };
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/snap/bin/chromium', args: ['--no-sandbox'] });
const rows = []; let failed = false;
for (const width of [1440, 390]) {
  for (const mode of width === 390 ? ['motion', 'reduce', 'nojs', 'nomain'] : ['motion', 'reduce', 'nojs']) {
    if (process.env.ONLY && !process.env.ONLY.split(',').includes(`${width}:${mode}`)) continue; // e.g. ONLY=390:nojs
    const ctx = await browser.newContext({ viewport: { width, height: width > 600 ? 900 : 844 }, reducedMotion: mode === 'reduce' ? 'reduce' : 'no-preference', javaScriptEnabled: mode !== 'nojs' });
    const page = await ctx.newPage(); const errors = [];
    if (mode === 'nomain') await page.route('**/main.js', (r) => r.abort()); // main.js fails to load: the page must fall back to everything stacked
    await page.addInitScript(() => { // count footer-field draws (one clearRect per frame)
      window.__fieldDraws = 0; const clear = CanvasRenderingContext2D.prototype.clearRect;
      CanvasRenderingContext2D.prototype.clearRect = function (...a) { if (this.canvas.classList.contains('end-field')) window.__fieldDraws++; return clear.apply(this, a); };
    });
    page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(URL0, { waitUntil: 'networkidle' });
    await page.goto(URL0, { waitUntil: 'networkidle' }); // warm load: what a returning visitor and the budget measure
    const paint = await page.evaluate(() => { const p = performance.getEntriesByName('first-contentful-paint')[0] || performance.getEntriesByType('paint')[0]; return p ? Math.round(p.startTime) : null; });
    const { sections } = await page.evaluate(measure);
    for (const id of sections) { // walk down to each section so reveals and lazy work run, then shoot it
      const sel = id === 'hero' ? '.hero' : `#${id}`; const el = await page.$(sel); if (!el) continue;
      const end = await el.evaluate((e) => e.getBoundingClientRect().top + scrollY - 80);
      for (let y = await page.evaluate(() => scrollY); y < end; y += 300) { await page.evaluate((v) => scrollTo(0, v), y); await page.waitForTimeout(mode === 'motion' ? 50 : 10); }
      await page.evaluate((v) => scrollTo(0, v), Math.max(0, end)); await page.waitForTimeout(mode === 'motion' ? 1400 : 200);
      await el.screenshot({ path: path.join(SHOTS, `check-${width}-${mode}-${id}.png`) }).catch(() => {});
    }
    const m = await page.evaluate(measure);
    if (mode === 'nomain') errors.splice(0, errors.length, ...errors.filter((e) => !/main\.js|ERR_FAILED/.test(e))); // the blocked load itself is expected
    const extra = [...m.clipped];
    if (mode === 'nomain') {
      const hidden = await page.evaluate(() => [...document.querySelectorAll('.b-fine, .b-tab .b')].filter((e) => getComputedStyle(e).display === 'none').length);
      if (hidden) extra.push(`${hidden} fine prints or tab sentences hidden with main.js blocked`);
    }
    if (mode === 'motion' && width === 1440) {
      const rate = () => page.evaluate(() => new Promise((go) => { const a = window.__fieldDraws; setTimeout(() => go(window.__fieldDraws - a), 1000); }));
      const before = await rate();
      await page.evaluate(() => { for (let i = 0; i < 10; i++) dispatchEvent(new Event('resize')); });
      const after = await rate();
      if (after > BUDGET.fieldDrawsPerSec) extra.push(`footer field ${before} draws/s, ${after} after 10 resize events`);
      await page.evaluate(() => document.querySelectorAll('.faq-card details').forEach((d) => { d.open = true; }));
      await page.waitForTimeout(300);
      const fit = await page.evaluate(() => { const c = document.querySelector('.end-field'); return c ? Math.abs(c.height / Math.min(2, devicePixelRatio || 1) - c.clientHeight) : 0; });
      if (fit > 2) extra.push(`footer field bitmap is ${fit}px off its box after the FAQ opens`);
      const swept = [];
      for (const w of SWEEP) {
        await page.setViewportSize({ width: w, height: 900 }); await page.waitForTimeout(120);
        const s = await page.evaluate(measure); swept.push(`${w}:${s.minScene}`);
        if (s.minScene === null) extra.push(`no scene text measured at ${w}px wide`);
        if (s.minScene !== null && s.minScene < BUDGET.minSceneText) extra.push(`scene text ${s.minScene}px at ${w}px wide (${s.minSceneAt})`);
      }
      console.log(`  smallest scene text by width (px): ${swept.join('  ')}`);
    }
    for (const x of extra) console.log(`  ${width} ${mode} ${x}`);
    const row = { width, mode, errors: errors.length, overflow: m.overflow, minSceneText: m.minScene, contrastFails: m.contrast.length, smallTargets: m.small.length, firstPaintMs: paint };
    const bad = [errors.length && 'errors', m.overflow > 0 && 'overflow', m.minScene !== null && m.minScene < BUDGET.minSceneText && 'scene text', m.contrast.length && 'contrast', m.small.length && 'targets', (paint === null || paint > BUDGET.firstPaintMs) && 'first paint', extra.length && 'see notes'].filter(Boolean);
    rows.push({ ...row, ok: bad.length ? `NO (${bad.join(', ')})` : 'yes' }); if (bad.length) failed = true;
    for (const [k, list] of [['error', errors], ['contrast', m.contrast], ['target', m.small]]) for (const x of list.slice(0, 8)) console.log(`  ${width} ${mode} ${k}: ${x}`);
    if (m.minScene !== null && m.minScene < BUDGET.minSceneText) console.log(`  ${width} ${mode} smallest scene text ${m.minScene}px at ${m.minSceneAt}`);
    await ctx.close();
  }
}
await browser.close(); server.close();
console.table(rows);
console.log(`budgets: scene text >= ${BUDGET.minSceneText}px (also swept at ${SWEEP.join(', ')}), footer field <= ${BUDGET.fieldDrawsPerSec} draws/s after resizes, nothing hidden with main.js blocked, targets >= ${BUDGET.minTarget}px, contrast >= 4.5:1 (3:1 large), first paint <= ${BUDGET.firstPaintMs} ms, 0 errors, 0 overflow`);
console.log(`screenshots: ${SHOTS}/check-*.png`);
process.exit(failed ? 1 : 0);
