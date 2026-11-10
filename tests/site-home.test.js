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
