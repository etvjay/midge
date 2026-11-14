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

test('every partner status rests on a quoted figure', () => {
  for (const p of HOME.proof.partners) assert.ok(F[p.fig]?.quote, `${p.name} status "${p.status}" has no quoted figure`);
});

test('the honesty fixes hold: Phala sleeps when idle, OutLayer only for the signing step, Chain Signatures on two testnets and nothing on Bitcoin, 1Click read-only', () => {
  const all = [...strings(HOME)].map(([, s]) => s).join('\n');
  assert.match(all, /sleeps when idle/, 'the Phala room is deployed for the playground and sleeps when idle');
  assert.doesNotMatch(all, /not running now/, 'the old Phala status is gone everywhere');
  assert.match(all, /[Oo]nly the signing step: a settlement signed inside OutLayer/, 'the comparison says what OutLayer is used for');
  assert.match(all, /Does Midge use OutLayer\?[\s\S]{0,40}Only for one step/, 'the FAQ says it is one step');
  assert.match(all, /does not run there/, 'and says the room does not run on OutLayer');
  assert.doesNotMatch(all, /Not used yet: only a model of its spending limits/);
  assert.match(all, /Solana devnet.{0,30}Ethereum Sepolia/);
  assert.match(all, /Nothing sent on Bitcoin|nothing has been sent on Bitcoin/i);
  assert.match(all, /outside the member exit/, 'foreign funds are outside the exit, and the page says so');
  assert.match(all, /read-only/i);
  assert.doesNotMatch(all, /running on testnet[^.\n]{0,40}Phala|Phala[^.\n]{0,40}running on testnet/i);
});

test('the FAQ has four topics and twenty-one questions, and keeps the five original answers word for word', () => {
  assert.deepEqual(HOME.faq.map((g) => g.name), ['About Midge', 'Money and safety', 'Integrations', 'Partners and tech']);
  assert.equal(HOME.faq.reduce((n, g) => n + g.items.length, 0), 21);
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
  for (const [at, s] of strings(HOME)) if (!/\.src\./.test(at)) for (const w of BANNED) assert.doesNotMatch(s, new RegExp(`\\b${w}\\b`, 'i'), `${at}: ${w}`); // .src fields are citations, never shown
});

const CODE_MAP = 'The code keeps older names';
test('code names appear only in the one FAQ answer that maps them', () => {
  const CODE = /\b(Roost|Nest|flyers?|hatch|settle_batch)\b/;
  let mapped = 0;
  for (const [at, s] of strings(HOME)) {
    if (/\.src\./.test(at)) continue;
    if (s.startsWith(CODE_MAP)) { mapped += 1; continue; }
    assert.doesNotMatch(s, CODE, `${at}: "${s}"`);
  }
  assert.equal(mapped, 1, 'one FAQ answer maps the code names');
});

// ---- the built page (Task 2)
const html = read('site/index.html');
const visibleText = (h) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ');
const sectionOf = (id) => { const m = html.match(new RegExp(`<section[^>]*id="${id}"[\\s\\S]*?\\n</section>`)); assert.ok(m, `section ${id}`); return m[0]; };

test('the eight sections are built in order after the hero, each named by its heading', () => {
  const ids = ['problem', 'how', 'who', 'rules', 'agents', 'proof', 'limits', 'try'];
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

test('code names are visible only inside the FAQ answer that maps them, and the removed sections are gone', () => {
  const visible = (h) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ');
  const map = html.match(/<details><summary>What are the parts called in the code\?<\/summary>[\s\S]*?<\/details>/);
  assert.ok(map, 'the FAQ has the code-name answer');
  assert.doesNotMatch(visible(html.replace(map[0], '')), /\b(Roost|Nest|flyers?|hatch|settle_batch)\b/);
  assert.match(visible(map[0]), /Roost is the room/);
  assert.doesNotMatch(html, /id="parts"|id="uses"/, 'Under the hood and Uses are removed');
});

test('illustrative amounts are labelled, and the recorded refusal links its transaction', () => {
  assert.match(sectionOf('problem'), /example amounts/);
  assert.match(sectionOf('proof'), /href="https:\/\/testnet\.nearblocks\.io\/txns\/3gW41Caz1wK4cCDFpixTJ3KweM6qpF7ZGxm6ARB1CmPk"/);
});

test('the FAQ is four headed groups of native details, twenty-one in all, the first open', () => {
  const groups = [...html.matchAll(/<section class="faq-group" id="faq-g(\d)"[\s\S]*?<\/section>/g)];
  assert.equal(groups.length, 4);
  assert.equal(groups.reduce((n, g) => n + (g[0].match(/<details/g) || []).length, 0), 21);
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

test('entrances play once when they come into view, in every browser, never tied to scroll position', () => {
  assert.doesNotMatch(css, /animation-timeline|view-timeline/, 'no scroll-driven animation');
  for (const c of ['mo-rise', 'mo-row', 'mo-draw', 'mo-pop', 'mo-line', 'mo-bullet', 'mo-type', 'mo-slide', 'mo-spin']) assert.match(css, new RegExp(`\\.${c}\\.in \\{[^}]*animation:`), `${c} plays on .in`);
  const js = read('site/main.js');
  assert.doesNotMatch(js, /CSS\.supports\('animation-timeline/, 'main.js observes every entrance, whatever the browser');
  assert.match(js, /classList\.add\('in'\); io\.unobserve/, 'each entrance plays once');
  assert.match(js, /classList\.toggle\('paused'/, 'loops pause off screen');
});

test('under reduced motion every animation stops at its final frame and travelling dots are hidden', () => {
  const block = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(block, /\.bs \*[^{]*\{[^}]*animation:\s*none !important/);
  assert.match(block, /\.mo-tr, \.mo-tr2 \{[^}]*display:\s*none/);
});

// ---- behaviour (Task 5)
const js = read('site/main.js');

test('the FAQ topics become a tablist in main.js (and only there): roles, selection, keys', () => {
  assert.doesNotMatch(html, /role="tablist"/, 'no tablist in the static HTML: without JavaScript all four groups show');
  assert.match(js, /setAttribute\('role', 'tablist'\)/);
  assert.match(js, /aria-selected/);
  for (const k of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) assert.match(js, new RegExp(k));
  assert.doesNotMatch(js, /\$\$\('\.b-tabs'\)/, 'the old tab-card controller is gone');
  assert.match(js, /document\.documentElement\.dataset\.tabs = 'on'/, 'the started marker the head fallback waits for');
});

test('the rules panel is filled from the live read, and says so plainly when NEAR does not answer', () => {
  assert.match(js, /\$\('#rules-json'\)/);
  assert.match(js, /release_policy/);
  assert.match(js, /\$\('#rules-reads-text'\)/);
  assert.match(js, /Could not read the rules from this browser/);
});

// ---- final review fix pass
test('entrances are hidden before they play only when motion is allowed (reduced motion and no JavaScript show them)', () => {
  const hide = css.indexOf('.js .mo-rise:not(.in)');
  assert.ok(hide > 0, 'the hide rule exists');
  const before = css.slice(0, hide);
  assert.ok(before.lastIndexOf('@media (prefers-reduced-motion: no-preference)') > before.lastIndexOf('\n}\n'), 'the hide rules sit inside @media (prefers-reduced-motion: no-preference)');
});

test('no visitor text claims that no one, us included, can take the money or change the rules; the upgrade key is stated', () => {
  const visible = (h) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ');
  const page = visible(html) + ' ' + (html.match(/<meta name="description" content="([^"]*)"/) || [, ''])[1];
  const OVERCLAIM = /us included|no one can change|nobody can change|no one, us|rules no one can change/i;
  assert.doesNotMatch(page, OVERCLAIM);
  for (const [at, s] of strings(HOME)) assert.doesNotMatch(s, OVERCLAIM, at);
  assert.match(page, /deploy key can still upgrade the contract/);
});

test('entrances are never tied to an inner scroll container', () => {
  for (const m of html.matchAll(/<div class="tbl-wrap[^"]*">([\s\S]*?)<\/div><\/div>/g)) assert.doesNotMatch(m[1], /class="[^"]*\bmo-(rise|row|flash|slide|type|strike)\b/, 'no entrance inside a table scroller');
  for (const sel of ['.bc.flush', '.panel-ink', '.band-panel']) {
    const rule = css.match(new RegExp(`\\n${sel.replace(/\./g, '\\.')} \\{([^}]*)\\}`));
    assert.ok(rule, `${sel} rule`); assert.doesNotMatch(rule[1], /overflow:\s*hidden/, `${sel} clips without becoming a scroll container`);
  }
});

test('nothing static claims to be live: labels start neutral and main.js switches them only after a read', () => {
  const region = html.slice(html.indexOf('<!-- cards:begin -->'), html.indexOf('<!-- cards:end -->'));
  assert.doesNotMatch(region, />read just now<|read live from NEAR|Reading…|Reading the newest/, 'no live wording in the built HTML');
  assert.match(region, /<b id="net-count">\d+<\/b> groups <span id="net-count-note">\(recorded\)<\/span>/);
  assert.match(js, /net-count-note/);
  assert.match(js, /Could not read the rules from this browser[\s\S]{0,300}nearblocks/i, 'the rules failure links NearBlocks');
  assert.match(js, /did not answer from this browser[\s\S]{0,300}nearblocks/i, 'the chain failure links NearBlocks');
});

test('every cell of the comparison table rests on a quoted source', () => {
  for (const row of HOME.problem.compare.rows) for (const c of row.cells) {
    if (/^\{[a-zA-Z]+\}$/.test(c.t)) continue;
    assert.ok(c.src && read(c.src.file).includes(c.src.quote), `comparison cell "${c.t}" quotes its source`);
  }
});

test('wording that overstated is gone', () => {
  const all = [...strings(HOME)].map(([, s]) => s).join('\n') + visibleText(html);
  assert.doesNotMatch(all, /payouts refused/, 'refusals include early exits: say refused by the rules');
  assert.doesNotMatch(all, /allowed_recipients/, 'plain words, not the field name');
  assert.doesNotMatch(all, /with NVIDIA GPU evidence/, 'the GPU evidence is carried, not checked');
  assert.doesNotMatch(all, /reads the 1Click Swap API's asset registry live/, '210 is a recorded audit');
  const agents = HOME.proof.partners.find((p) => p.name === 'For agents');
  assert.notEqual(agents.status, 'Live', 'the API and MCP server run locally');
});
