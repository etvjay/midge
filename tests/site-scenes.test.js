// The site's card scenes: pure functions that return SVG. They must be accessible, show their end state under reduced motion,
// keep every chip's text inside its box and every box inside the drawing, and use plain words.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENES } from '../scripts/site-scenes/scenes.mjs';
import { ANIM_CLASSES, BANNED } from '../scripts/site-scenes/kit.mjs';

const ARGS = { agent: [0, 1, 2, 3, 4], layers: [0, 1, 2] }; // the agent card renders attempts 0, 1, 2 and 4
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

test('every amount in a scene is either recorded (found in its source) or labelled "Example amounts"', async () => {
  const fs = await import('node:fs');
  const src = { lab: fs.readFileSync(new URL('../docs/lab/COMPARISON_RESULTS.md', import.meta.url), 'utf8'), proof: fs.readFileSync(new URL('../site/data/proof.json', import.meta.url), 'utf8') };
  const RECORDED = { organizer: 'lab', blackbox: 'lab', invest: 'lab', agent: 'proof' };
  for (const [name, s] of all()) for (const view of ['wide', 'narrow']) {
    const text = s[view].replace(/<[^>]+>/g, ' ');
    const amounts = text.match(/\b\d+\.\d+\b|\b\d{1,3}(?:,\d{3})+\b/g) || [];
    if (!amounts.length) continue;
    const from = RECORDED[name.replace(/\(.*/, '')];
    if (from) for (const a of amounts) assert.ok(src[from].includes(a), `${name} ${view}: ${a} is not in its source`);
    else assert.match(text, /Example amounts/, `${name} ${view} shows ${amounts.join(', ')} without "Example amounts"`);
  }
});

test('under reduced motion, nothing that carries text ends invisible or too faint to read', async () => {
  const fs = await import('node:fs');
  const css = fs.readFileSync(new URL('../site/styles.css', import.meta.url), 'utf8');
  const block = css.slice(css.indexOf('.b-scene .a-tr, .b-scene .a-tr2 { animation: none'), css.indexOf('}\n}', css.indexOf('.b-scene .a-tr, .b-scene .a-tr2 { animation: none')));
  const textClasses = new Set();
  for (const [, s] of all()) for (const view of ['wide', 'narrow']) {
    for (const m of s[view].matchAll(/<g [^>]*class="(a-[a-z0-9]+)"[^>]*>([\s\S]*?)<\/g>/g)) if (/<text/.test(m[2])) textClasses.add(m[1]);
    for (const m of s[view].matchAll(/<text[^>]*class="[^"]*\b(a-[a-z0-9]+)/g)) textClasses.add(m[1]);
  }
  assert.ok(textClasses.has('a-leave') && textClasses.has('a-dim'), `found ${[...textClasses]}`);
  for (const c of textClasses) {
    const rule = block.match(new RegExp(`\\.${c}\\b[^{]*\\{([^}]*)\\}`)); assert.ok(rule, `${c} has a reduced-motion rule`);
    const op = rule[1].match(/opacity:\s*([\d.]+)/); if (op) assert.ok(+op[1] >= 0.55, `${c} ends at opacity ${op[1]} (text needs 0.55 or more to stay readable)`);
  }
});
