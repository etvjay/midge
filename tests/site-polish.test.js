// The unslop polish pass (2026-11-10): what the audit found on the landing page, pinned so it stays fixed.
// Audit and direction: polish mode, the palette, type, layout, visuals and motion kept; only the listed signs fixed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const html = read('site/index.html');
const css = read('site/styles.css');
const js = read('site/main.js');
const hero = html.match(/<section class="hero"[\s\S]*?<\/section>/)[0];
const rule = (sel) => { const m = css.match(new RegExp(`(^|\\n|\\}\\s*)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`)); return m ? m[2] : ''; };

test('the hero has one subhead that names who it is for, no scroll cue, and a caption without periods', () => {
  assert.equal((hero.match(/class="lede"/g) || []).length, 1);
  assert.doesNotMatch(hero, /class="tagline"/, 'the audience line is folded into the lede');
  assert.match(hero.match(/<p class="lede">([^<]*)<\/p>/)[1], /^Funds, DAOs, teams and AI agents decide together in private\./);
  assert.doesNotMatch(html, /scroll-cue/, 'no "Scroll" cue');
  assert.match(hero, /<p class="fine-dark">A working prototype on NEAR testnet · no token <span class="chain-chip"/);
});

test('the live chip stays on one line when NEAR answers', () => {
  assert.match(js, /chipText\.textContent = `Live · \$\{count\} groups · block /);
  assert.match(rule('.chain-chip.ok'), /white-space:\s*nowrap/);
});

test('figures use tabular digits', () => {
  for (const sel of ['.fig', '.chain-chip', '.recent', '.proof-legend', '.foot-live', '.lens p']) {
    assert.match(css, new RegExp(`${sel.replace(/\./g, '\\.')}[^{]*\\{[^}]*font-variant-numeric:\\s*tabular-nums`), sel);
  }
});

test('the live list: one amount format, amounts never wrap, long names end in an ellipsis with the full name kept', () => {
  assert.match(js, /const near = \(yocto\) => \{[^}]*minimumFractionDigits: 2, maximumFractionDigits: 4/);
  assert.match(rule('.recent li span'), /white-space:\s*nowrap/);
  assert.match(rule('.recent li a'), /text-overflow:\s*ellipsis/);
  assert.match(js, /a\.title = x\.id/);
});

test('commands wrap instead of running under the Copy button', () => {
  assert.match(rule('.cmd code'), /white-space:\s*pre-wrap/);
  assert.match(rule('.cmd code'), /overflow-wrap:\s*anywhere/);
});

test('section titles balance their lines (no single word left on the last line)', () => {
  assert.match(rule('.title'), /text-wrap:\s*balance/);
});

test('padding, margin and gap sit on the 4 px grid (1 to 3 px nudges and hairlines aside)', () => {
  const off = [];
  for (const m of css.matchAll(/(?:^|[;{\s])((?:padding|margin|gap|row-gap|column-gap)(?:-[a-z]+)*):\s*([^;}]+)/g)) {
    for (const v of m[2].matchAll(/(-?\d+(?:\.\d+)?)px/g)) { const n = Math.abs(+v[1]); if (n > 3 && n % 4) off.push(`${m[1]}: ${m[2].trim()}`); }
  }
  assert.deepEqual(off, []);
});
