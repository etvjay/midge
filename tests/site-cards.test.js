// The site's B cards are built into site/index.html from scripts/site-scenes/content.mjs and real figures. These tests read the
// built page: everything must be there without JavaScript, every figure must equal the data or a quoted recorded result, and the
// visible text must use plain words.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildCards } from '../scripts/build-site-cards.mjs';
import { figures } from '../scripts/site-scenes/figures.mjs';
import { SECTIONS } from '../scripts/site-scenes/content.mjs';
import { BANNED } from '../scripts/site-scenes/kit.mjs';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const html = read('site/index.html');
const proof = JSON.parse(read('site/data/proof.json'));
const F = figures(proof, root);
const sectionHtml = (id) => { const m = html.match(new RegExp(`<section[^>]*id="${id}"[\\s\\S]*?</section>`)); assert.ok(m, `section ${id} is in the page`); return m[0]; };

test('every section has a tablist, one tab per entry, a panel and a fine print per tab, none hidden in the static HTML', () => {
  for (const s of SECTIONS) {
    const h = sectionHtml(s.id);
    assert.match(h, /role="tablist"/, s.id);
    assert.equal((h.match(/role="tab"/g) || []).length, s.tabs.length, `${s.id} tabs`);
    assert.equal((h.match(/role="tabpanel"/g) || []).length, s.tabs.length, `${s.id} panels`);
    assert.equal((h.match(/<details class="b-fine"/g) || []).length, s.tabs.length, `${s.id} fine print`);
    assert.doesNotMatch(h, /\shidden[\s>=]/, `${s.id}: nothing hidden without JavaScript`);
    for (let i = 0; i < s.tabs.length; i++) assert.ok(h.includes(s.tabs[i].b), `${s.id} tab ${i} sentence`);
  }
});

test('tab ids and aria-controls pair up', () => {
  for (const s of SECTIONS) for (let i = 0; i < s.tabs.length; i++) {
    const h = sectionHtml(s.id);
    assert.match(h, new RegExp(`id="tab-${s.id}-${i}"[^>]*aria-controls="panel-${s.id}-${i}"`), `${s.id} ${i} tab`);
    assert.match(h, new RegExp(`id="panel-${s.id}-${i}"[^>]*aria-labelledby="tab-${s.id}-${i}"`), `${s.id} ${i} panel`);
  }
});

test('every strip figure equals the data, and every recorded figure is quoted from its source file', () => {
  for (const s of SECTIONS) {
    const h = sectionHtml(s.id);
    for (const key of s.strip) {
      assert.ok(F[key], `figure ${key} exists`);
      assert.ok(h.includes(`data-figure="${key}"`) && h.includes(`>${F[key].value}<`), `${s.id}: ${key} = ${F[key].value}`);
    }
  }
  for (const [key, f] of Object.entries(F)) if (f.quote) assert.ok(read(f.source).includes(f.quote), `${key}: "${f.quote}" in ${f.source}`);
  assert.equal(F.payouts.value, String(proof.counts.settled));
  assert.equal(F.attempts.value, String(proof.security.attempts.length));
});

test('the visible page text contains no banned word', () => {
  const visible = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ');
  for (const w of BANNED) assert.doesNotMatch(visible, new RegExp(`\\b${w}\\b`, 'i'), w);
});

test('building twice gives the same page', () => {
  assert.equal(buildCards(html, proof, root), html, 'run npm run build:site');
});

test('the nav links to the new section ids', () => {
  for (const id of SECTIONS.map((s) => s.id)) assert.match(html, new RegExp(`<nav[\\s\\S]*href="#${id}"[\\s\\S]*</nav>`), id);
});

test('every scene animation class has a reduced-motion end state in the stylesheet', async () => {
  const { ANIM_CLASSES } = await import('../scripts/site-scenes/kit.mjs');
  const css = read('site/styles.css');
  const reduced = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
  const block = reduced.slice(0, reduced.indexOf('\n}\n'));
  for (const c of ANIM_CLASSES) {
    assert.match(css, new RegExp(`\\.b-scene \\.${c} \\{[^}]*animation:`), `${c} animates`);
    assert.match(block, new RegExp(`\\.${c}\\b[^{]*\\{[^}]*animation: none`), `${c} has an end state`);
  }
});
