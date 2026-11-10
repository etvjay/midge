// The landing page's bento sections (plan 2026-11-10-site-bento-direction): content, honest figures and statuses.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOME } from '../scripts/site-sections/content.mjs';
import { figures } from '../scripts/site-scenes/figures.mjs';
import { BANNED } from '../scripts/site-scenes/kit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const proof = JSON.parse(read('site/data/proof.json'));
const F = figures(proof, root);

// every string in HOME, with the path it sits at
function* strings(v, at = 'HOME') {
  if (typeof v === 'string') yield [at, v];
  else if (Array.isArray(v)) for (let i = 0; i < v.length; i++) yield* strings(v[i], `${at}[${i}]`);
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) yield* strings(x, `${at}.${k}`);
}

test('every recorded figure quotes its source, and the quote is really there', () => {
  for (const [k, f] of Object.entries(F)) {
    if (!f.quote) continue;
    assert.ok(read(f.source).includes(f.quote), `${k}: "${f.quote}" not found in ${f.source}`);
  }
});

test('every {figure} token in the content names a figure that exists', () => {
  for (const [at, s] of strings(HOME)) for (const m of s.matchAll(/\{([a-zA-Z]+)\}/g)) assert.ok(F[m[1]], `${at}: unknown figure {${m[1]}}`);
});

test('recorded numbers enter the content only as {figure} tokens, never typed in', () => {
  const values = ['324', '83', '36', '25', '210', '3 of 5', '0 of 5', '4 of 4', '12 of 12'];
  for (const [at, s] of strings(HOME)) {
    if (/\.example|\.book\b|\.book\[/.test(at)) continue; // illustrative components are labelled "example amounts"
    for (const v of values) assert.ok(!new RegExp(`(^|[^\\d.,])${v.replace(/ /g, ' ')}($|[^\\d.,])`).test(s), `${at} types the figure ${v}: "${s}"`);
  }
});

test('every partner status and every "in Midge today" cell rests on a quoted figure', () => {
  for (const p of HOME.proof.partners) assert.ok(F[p.fig]?.quote, `${p.name} status "${p.status}" has no quoted figure`);
  const today = HOME.parts.hosts.rows.find((r) => r.k === 'In Midge today');
  assert.ok(today, 'the host table ends with "In Midge today"');
  for (const c of today.cells) assert.ok(F[c.fig]?.quote, `"${c.t}" has no quoted figure`);
});

test('the honesty fixes hold: Phala not running, OutLayer not used, nothing sent on other chains, 1Click read-only', () => {
  const all = [...strings(HOME)].map(([, s]) => s).join('\n');
  assert.match(all, /not running now/);
  assert.match(all, /OutLayer[\s\S]{0,200}not used yet|Not used yet/);
  assert.match(all, /nothing sent/i);
  assert.match(all, /read-only/i);
  assert.doesNotMatch(all, /running on testnet[^.\n]{0,40}Phala|Phala[^.\n]{0,40}running on testnet/i);
});

test('the FAQ has four topics and eighteen questions, and keeps the five original answers word for word', () => {
  assert.deepEqual(HOME.faq.map((g) => g.name), ['About Midge', 'Money and safety', 'Integrations', 'Partners and tech']);
  assert.equal(HOME.faq.reduce((n, g) => n + g.items.length, 0), 18);
  const qa = new Map(HOME.faq.flatMap((g) => g.items));
  const ORIGINAL = {
    'Can the room run off with the money?': 'No. The room holds no key to the money. It can only propose a payout, and the contract on NEAR pays it only if it follows the rules every member agreed to: who can be paid, how much per window, and until when.',
    'What if the room stops or disappears?': "Each member takes back what is left of their own money, with no one's permission, once the group's exit timer has run. Nobody else's share is touched.",
    'What stays private, and what is public?': "Private: what each member bids, votes or decides, and for payroll who owns each one-time address. Public: who deposited, how much, the rules, and every payout's amount and recipient.",
    'Is this live? Can I lose real money?': 'It is a working prototype on NEAR testnet, where coins have no value. There is no token, and no audit yet.',
    'Can I check any of this myself?': 'Yes. Read the contract and its rules straight from NEAR, open any dot in the proof section on the public explorer, or run every test offline with one command.',
  };
  for (const [q, a] of Object.entries(ORIGINAL)) assert.equal(qa.get(q), a, q);
});

test('no banned word in any content string', () => {
  for (const [at, s] of strings(HOME)) for (const w of BANNED) assert.doesNotMatch(s, new RegExp(`\\b${w}\\b`, 'i'), `${at}: ${w}`);
});

test('code names appear only in the parts section', () => {
  const CODE = /\b(Roost|Nest|flyers?|hatch|settle_batch)\b/;
  for (const [at, s] of strings(HOME)) if (!at.startsWith('HOME.parts')) assert.doesNotMatch(s, CODE, `${at}: "${s}"`);
});

// ---- the built page (Task 2)
const html = read('site/index.html');
const sectionOf = (id) => { const m = html.match(new RegExp(`<section[^>]*id="${id}"[\\s\\S]*?\\n</section>`)); assert.ok(m, `section ${id}`); return m[0]; };

test('sections 01 to 10 are built in order after the hero, each named by its heading', () => {
  const ids = ['problem', 'how', 'who', 'rules', 'uses', 'agents', 'parts', 'proof', 'limits', 'try'];
  let at = html.indexOf('id="hero"');
  for (const id of ids) {
    const i = html.indexOf(`<section class="section bs`, at); assert.ok(i > at, `${id} after the one before`);
    assert.match(html.slice(i, i + 200), new RegExp(`id="${id}" aria-labelledby="${id}-title"`), `${id} in order`);
    assert.match(html, new RegExp(`id="${id}-title"`), `${id} has its heading`);
    at = i + 1;
  }
});

test('nothing is hidden and no {figure} token is left unfilled', () => {
  const region = html.slice(html.indexOf('<!-- cards:begin -->'), html.indexOf('<!-- footer:end -->'));
  assert.doesNotMatch(region, /\shidden[\s>=]/);
  assert.doesNotMatch(region.replace(/<style[\s\S]*?<\/style>|style="[^"]*"/g, ''), /\{[a-zA-Z]+\}/);
});

test('every element main.js looks up exists in the built page', () => {
  for (const id of ['chip', 'chip-text', 'lp-run', 'lp-replay', 'lp-list', 'lp-note', 'chain-list', 'chain-note', 'lens-pub', 'lens-priv', 'proof-grid', 'recent', 'net-count', 'live', 'foot-live', 'rules-json', 'rules-reads-text']) assert.match(html, new RegExp(`id="${id}"`), id);
});

test('code names are visible only inside Under the hood', () => {
  const visible = (h) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ');
  const outside = visible(html.replace(sectionOf('parts'), ''));
  assert.doesNotMatch(outside, /\b(Roost|Nest|flyers?|hatch|settle_batch)\b/);
  assert.match(visible(sectionOf('parts')), /code: Roost/);
});

test('illustrative amounts are labelled, and the recorded refusal links its transaction', () => {
  assert.match(sectionOf('problem'), /example amounts/);
  assert.match(sectionOf('proof'), /href="https:\/\/testnet\.nearblocks\.io\/txns\/3gW41Caz1wK4cCDFpixTJ3KweM6qpF7ZGxm6ARB1CmPk"/);
});

test('the FAQ is four headed groups of native details, eighteen in all, the first open', () => {
  const groups = [...html.matchAll(/<section class="faq-group" id="faq-g(\d)"[\s\S]*?<\/section>/g)];
  assert.equal(groups.length, 4);
  assert.equal(groups.reduce((n, g) => n + (g[0].match(/<details/g) || []).length, 0), 18);
  assert.match(groups[0][0], /<details open>/);
});

// ---- motion (Task 4): reveal with scroll, loops only on screen, final frames under reduced motion
const css = read('site/styles.css');
const usedMo = [...new Set([...html.matchAll(/class="[^"]*\b(mo-[a-zA-Z]+)/g)].map((m) => m[1]))];

test('every motion class used in the page is defined, and only moves transform, opacity, strokes, paths, clips or the flash', () => {
  assert.ok(usedMo.length >= 15, `found ${usedMo.length} motion classes`);
  for (const c of usedMo.filter((x) => x !== 'mo-count')) assert.match(css, new RegExp(`\\.${c}\\b[^{]*\\{[^}]*animation`), `${c} animates`);
  const ALLOWED = /^(opacity|transform|stroke-dashoffset|offset-distance|clip-path|background-color|--n)$/;
  for (const m of css.matchAll(/@keyframes (mo-[a-zA-Z0-9]+) \{([\s\S]*?)\}\s*\}/g)) {
    for (const p of m[2].matchAll(/([a-z-]+)\s*:/g)) assert.match(p[1], ALLOWED, `${m[1]} animates ${p[1]}`);
  }
  assert.doesNotMatch(css, /transition:\s*all/);
});

test('entrances reveal with scroll where the browser can, and play on entry elsewhere', () => {
  const sd = css.slice(css.indexOf('@supports (animation-timeline: view())'));
  assert.match(sd, /animation-timeline:\s*view\(\)/);
  assert.match(css, /@supports not \(animation-timeline: view\(\)\)/);
  const js = read('site/main.js');
  assert.match(js, /CSS\.supports\('animation-timeline: view\(\)'\)/, 'main.js only plays entrances itself where scroll-driven animation is missing');
  assert.match(js, /classList\.toggle\('paused'/, 'loops pause off screen');
});

test('under reduced motion every animation stops at its final frame and travelling dots are hidden', () => {
  const block = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(block, /\.bs \*[^{]*\{[^}]*animation:\s*none !important/);
  assert.match(block, /\.mo-tr, \.mo-tr2 \{[^}]*display:\s*none/);
});
