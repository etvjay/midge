// The site's sections are built into site/index.html from scripts/site-sections/ and real figures. These tests read the
// built page: everything must be there without JavaScript, every figure must equal the data or a quoted recorded result, and the
// visible text must use plain words.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildCards } from '../scripts/build-site-cards.mjs';
import { figures } from '../scripts/site-scenes/figures.mjs';
import { BANNED } from '../scripts/site-scenes/kit.mjs';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const html = read('site/index.html');
const proof = JSON.parse(read('site/data/proof.json'));
const F = figures(proof, root);
const sectionHtml = (id) => { const m = html.match(new RegExp(`<section[^>]*id="${id}"[\\s\\S]*?</section>`)); assert.ok(m, `section ${id} is in the page`); return m[0]; };

test('the visible page text contains no banned word', () => {
  const visible = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ');
  for (const w of BANNED) assert.doesNotMatch(visible, new RegExp(`\\b${w}\\b`, 'i'), w);
});

test('building twice gives the same page', () => {
  assert.equal(buildCards(html, proof, root), html, 'run npm run build:site');
});

test('the nav links to the section ids', () => {
  for (const id of ['problem', 'how', 'who', 'agents', 'parts', 'proof', 'try']) assert.match(html, new RegExp(`<nav[\\s\\S]*href="#${id}"[\\s\\S]*</nav>`), id);
});

test('no canvas scene or retired card markup is left, and the js class is set before first paint', () => {
  const js = read('site/main.js');
  assert.doesNotMatch(html, /data-scene=|class="b-tabs"|class="b-panel"/, 'no canvas scene or tab card left in the page');
  assert.doesNotMatch(js, /class Stage\b|data-scene|__stage/, 'main.js does not reach for removed canvases');
  assert.doesNotMatch(js, /kind-switch|\.drawing\b|steps-rail/, 'the room switch, drawings and steps rail are removed');
  assert.match(html, /<head>[\s\S]*classList\.add\('js'\)[\s\S]*<\/head>/, 'the js class is set before first paint');
});

test('the proof dots are in the static HTML, one per transaction, each linking to NearBlocks, with the lens and honest labels', () => {
  const h = html.match(/<section[^>]*id="proof"[\s\S]*?<\/section>/)[0];
  const dots = [...h.matchAll(/<span role="listitem"><a href="https:\/\/testnet\.nearblocks\.io\/txns\/([1-9A-HJ-NP-Za-km-z]{43,44})"/g)].map((m) => m[1]);
  assert.doesNotMatch(h, /<a [^>]*role=/, 'a dot keeps the link role (a role on the <a> would replace it)');
  assert.equal(dots.length, proof.transactions.length, 'one dot per recorded transaction');
  assert.deepEqual(dots, proof.transactions.map((t) => t.hash), 'in the order of the data');
  assert.match(h, /id="lens-pub"/); assert.match(h, /id="lens-priv"/);
  assert.match(h, new RegExp(`Refused by the rules · ${proof.counts.rejected}`), 'the legend says what the refusals have in common');
  assert.doesNotMatch(h + read('site/main.js'), /Attack refused/, 'no failed transaction is called an attack');
});

test('no banned word reaches a visitor: page text, labels, lens data, or the live checks in main.js', () => {
  const attrs = [...html.matchAll(/(?:aria-label|data-tx|title|alt)="([^"]*)"/g)].map((m) => m[1]).join(' ');
  const jsStrings = [...read('site/main.js').matchAll(/(['`])((?:(?!\1)[^\\\n]|\\.)*)\1/g)].map((m) => m[2].replace(/\$\{[^}]*\}/g, ' ')).filter((s) => / /.test(s) && !/^\s*https?:/.test(s)).join(' ');
  for (const w of BANNED) {
    assert.doesNotMatch(attrs, new RegExp(`\\b${w}\\b`, 'i'), `attribute text: ${w}`);
    assert.doesNotMatch(jsStrings, new RegExp(`\\b${w}\\b`, 'i'), `main.js visitor text: ${w}`);
  }
});

const footerHtml = () => { const m = html.match(/<footer class="site-footer[^"]*"[\s\S]*?<\/footer>/); assert.ok(m, 'the footer keeps the class site-footer'); return m[0]; };

test('the footer has the FAQ, and every link points to a repository file that exists or to the explorer', () => {
  const f = footerHtml();
  assert.equal((f.match(/<details/g) || []).length, 18, 'eighteen questions');
  assert.equal((f.match(/class="faq-group"/g) || []).length, 4, 'four topics');
  const links = [...f.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(links.length >= 10, `${links.length} links`);
  for (const l of links) {
    if (l.startsWith('#')) { assert.match(html, new RegExp(`id="${l.slice(1)}"`), `${l} exists on the page`); continue; }
    if (/^(playground|replay)\/$/.test(l)) { assert.ok(fs.existsSync(path.join(root, 'site', l, 'index.html')), `${l} is a page of this site`); continue; }
    const repo = l.match(/^https:\/\/github\.com\/etvjay\/midge\/blob\/master\/(.+)$/);
    if (repo) { assert.ok(fs.existsSync(path.join(root, repo[1])), `${repo[1]} exists`); continue; }
    assert.match(l, /^https:\/\/(github\.com\/etvjay\/midge|testnet\.nearblocks\.io\/address\/c\.fly-1793636729\.testnet)$/, `${l} is the repo or the explorer`);
  }
});

test("the footer's recorded fingerprint is the last recorded deployment", () => {
  const deployments = JSON.parse(read('docs/canonical/deployments.json')).deployments;
  const live = deployments[deployments.length - 1].codeHash;
  assert.match(footerHtml(), new RegExp(`id="foot-live"[\\s\\S]*${live.slice(0, 8)}…[\\s\\S]*recorded`), 'the build-time line names the last deployment and says it is recorded');
});

test('if main.js fails to load or never starts the tabs, the page falls back to everything stacked (fine print included)', () => {
  assert.match(html, /<script src="main\.js" type="module" onerror="document\.documentElement\.classList\.remove\('js'\)"><\/script>/, 'a failed load removes the js class at once');
  const head = html.match(/<script>(document\.documentElement\.classList\.add\('js'\)[^<]*)<\/script>/);
  assert.ok(head, 'the head script sets the js class');
  assert.match(head[1], /setTimeout\(function \(\) \{ if \(!document\.documentElement\.hasAttribute\('data-tabs'\)\) document\.documentElement\.classList\.remove\('js'\); \}, 4000\)/, 'a timer removes it if the tabs never start');
  const js = read('site/main.js');
  assert.match(js, /document\.documentElement\.classList\.add\('js'\); document\.documentElement\.dataset\.tabs = 'on';/, 'main.js marks the tabs as started (and restores the class if the timer fired first)');
});
