// A `font` shorthand resets every font-* longhand, including font-variant-numeric, so a longhand written before it in the same rule is silently thrown away.
// This fails when a rule in the site's hand-written stylesheets does that.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const files = ['site/styles.css', 'site/playground/playground.css', 'site/replay/replay.css'];
const RESET_BY_FONT = /^(font-(variant[\w-]*|feature-settings|kerning|stretch|style|weight|size|family|size-adjust|optical-sizing)|line-height)$/;

function rules(css) {
  return [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), declarations: m[2].split(';').map((d) => d.trim()).filter(Boolean).map((d) => [d.slice(0, d.indexOf(':')).trim(), d.slice(d.indexOf(':') + 1).trim()]) }));
}

export function shorthandOverrides(css) {
  const found = [];
  for (const { selector, declarations } of rules(css)) {
    const at = declarations.findIndex(([name]) => name === 'font');
    if (at < 0) continue;
    for (const [name] of declarations.slice(0, at)) if (RESET_BY_FONT.test(name) && name !== 'font') found.push(`${selector}: ${name} is reset by the font shorthand written after it`);
  }
  return found;
}

for (const f of files) {
  test(`${f} has no longhand that a later font shorthand in the same rule resets`, () => {
    assert.deepEqual(shorthandOverrides(fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')), []);
  });
}

test('the check finds the problem it is for, and leaves the right order alone', () => {
  assert.equal(shorthandOverrides('.a { font-variant-numeric: tabular-nums; font: 400 12px mono; }').length, 1);
  assert.deepEqual(shorthandOverrides('.a { font: 400 12px mono; font-variant-numeric: tabular-nums; }'), []);
  assert.deepEqual(shorthandOverrides('.a { color: red; } .b { font-variant-numeric: tabular-nums; }'), []);
});
