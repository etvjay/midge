// The site's card scenes: pure functions that return SVG. They must be accessible, show their end state under reduced motion,
// keep every chip's text inside its box and every box inside the drawing, and use plain words.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENES } from '../scripts/site-scenes/scenes.mjs';
import { ANIM_CLASSES, BANNED } from '../scripts/site-scenes/kit.mjs';

const ARGS = { agent: [0, 1, 2, 3], layers: [0, 1, 2] };
const KEYS = ['public', 'organizer', 'blackbox', 'room', 'rules', 'exit', 'auction', 'vote', 'payroll', 'invest', 'agent', 'layers'];
function* all() { for (const k of KEYS) for (const a of ARGS[k] || [undefined]) { const s = SCENES[k](a); yield [`${k}${a === undefined ? '' : `(${a})`}`, s]; } }
const viewOf = (svg) => svg.match(/viewBox="0 0 (\d+) (\d+)"/).slice(1).map(Number);

test('there is a scene for every key the cards use', () => {
  for (const k of KEYS) assert.equal(typeof SCENES[k], 'function', k);
});

test('every scene renders a wide and a narrow SVG with role img and an aria-label', () => {
  for (const [name, s] of all()) for (const view of ['wide', 'narrow']) {
    assert.match(s[view], /^<svg [^>]*viewBox="0 0 \d+ \d+"[^>]*role="img"[^>]*aria-label="[^"]{10,}"/, `${name} ${view}`);
    assert.equal(viewOf(s[view])[0], view === 'wide' ? 600 : 360, `${name} ${view} width`);
  }
});

test('scenes use only animation classes that have a reduced-motion end state', () => {
  const allowed = new Set([...ANIM_CLASSES, 'm', 's', 'scene-wide', 'scene-narrow']);
  for (const [name, s] of all()) for (const view of ['wide', 'narrow']) {
    const used = [...s[view].matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/));
    assert.deepEqual(used.filter((c) => !allowed.has(c)), [], `${name} ${view}`);
  }
});

test("no chip's text runs past its box, and no box runs past the drawing", () => {
  for (const [name, s] of all()) for (const view of ['wide', 'narrow']) {
    const [vw, vh] = viewOf(s[view]);
    for (const m of s[view].matchAll(/data-chip="([\d.]+),([\d.]+),([\d.]+),([\d.]+),([\d.]+)"/g)) {
      const [x, y, w, h, need] = m.slice(1).map(Number);
      assert.ok(w >= need, `${name} ${view}: chip ${w} wide needs ${need}`);
      assert.ok(x >= 0 && y >= 0 && x + w <= vw && y + h <= vh, `${name} ${view}: chip at ${x},${y} ${w}x${h} outside ${vw}x${vh}`);
    }
  }
});

test('phone drawings never use type smaller than 12 units', () => {
  for (const [name, s] of all()) {
    const sizes = [...s.narrow.matchAll(/font-size="([\d.]+)"/g)].map((m) => Number(m[1]));
    assert.ok(sizes.length > 0 && Math.min(...sizes) >= 12, `${name}: smallest ${Math.min(...sizes)}`);
  }
});

test('no banned word appears in any scene', () => {
  for (const [name, s] of all()) for (const view of ['wide', 'narrow']) {
    const text = s[view].replace(/<[^>]+>/g, ' ') + ' ' + (s[view].match(/aria-label="([^"]*)"/) || [, ''])[1];
    for (const w of BANNED) assert.doesNotMatch(text, new RegExp(`\\b${w}\\b`, 'i'), `${name} ${view}: ${w}`);
  }
});

test('example amounts are labelled', () => {
  assert.match(SCENES.room().wide, /Example amounts/);
  assert.match(SCENES.room().narrow, /Example amounts/);
});
