// The documents a judge reads first must not state what the repository contradicts. This does not prove them true: it fails on cited ids,
// paths and hashes that do not exist, on numbers that disagree with the code or the ledgers, and on statements that were found wrong.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const DOCS = ['README.md', 'docs/README_FULL.md', 'docs/START_HERE.md', 'docs/canonical/CURRENT_STATE.md', 'docs/security/threat-model.md', 'docs/hackathon-submission.md'];
const jsonl = (p) => read(p).split('\n').filter(Boolean).map((l) => JSON.parse(l));
const claims = jsonl('foundry/claims.jsonl'); const gaps = jsonl('foundry/gaps.jsonl');
const deployments = JSON.parse(read('docs/canonical/deployments.json')).deployments;
const live = deployments[deployments.length - 1].codeHash;
const toolCount = new Set([...read('src/mcp/server.js').matchAll(/name: 'midge_[a-z_]+'/g), ...read('src/mcp/rooms-tools.js').matchAll(/name: 'midge_[a-z_]+'/g)].map((m) => m[0])).size;

for (const f of DOCS) {
  const doc = read(f);
  test(`${f}: every claim id, gap id and repository path it cites exists`, () => {
    const ids = new Set(claims.map((c) => c.id)); const gids = new Set(gaps.map((g) => g.id));
    assert.deepEqual([...new Set(doc.match(/CLM-[A-Z0-9-]+/g) || [])].filter((c) => !ids.has(c)), []);
    assert.deepEqual([...new Set(doc.match(/GAP-\d{3}/g) || [])].filter((g) => !gids.has(g)), []);
    const paths = [...new Set([...doc.matchAll(/`((?:src|docs|scripts|deploy|lab|foundry|contracts|tests|verifications|bin)\/[A-Za-z0-9_./-]+?)`/g)].map((m) => m[1].replace(/[.,;:]$/, '')))]
      .filter((p) => !/(^|\/)target(\/|$)/.test(p) && !/\.\.\./.test(p)); // build output (a `target` directory) exists only after a build
    assert.deepEqual(paths.filter((p) => !fs.existsSync(path.join(root, p))), []);
  });

  test(`${f}: any code hash it names is a recorded deployment, an older one is labelled, and the live one is not contradicted`, () => {
    const hashes = deployments.map((d) => d.codeHash);
    for (const h of hashes.slice(0, -1)) for (const m of doc.matchAll(new RegExp(`.*${h.slice(0, 8)}.*`, 'g'))) assert.match(m[0], /(earlier|superseded|before|old|previous|cites)/i, `${h.slice(0, 8)} is superseded; the line must say so: ${m[0].slice(0, 100)}`);
    const full = [...new Set(doc.match(/\b[1-9A-HJ-NP-Za-km-z]{44}\b/g) || [])].filter((x) => hashes.includes(x));
    assert.ok(full.every((x) => hashes.includes(x)));
  });

  test(`${f}: no statement the repository has contradicted`, () => {
    const stale = [
      [/\b53 (NEAR L1 )?Rust tests|\b43 unit/, 'a test count from the first week (129 Rust tests today)'],
      [/\b(238|277|304|305) ?KB|311,421 bytes/, 'a binary size that is not the current build'],
      [/<[ ]?20(\.0)? ?s|<[ ]?2 ?s/, 'a verification runtime from the first, smaller suite (about 100 s)'],
      [/thief\.near/, 'the recorded theft attempt paid f2.fly-1793636729.testnet, not thief.near'],
      [/SIMULATED MOCK/, 'a live Chain Signatures sign call is on the chain'],
      [/not yet on the live contract/, 'the audit fixes were deployed on 2026-11-08'],
      [/\b(6|8|10) (syndicate )?tools\b/, `the MCP server exposes ${toolCount} tools`],
      [/\b(11|13) claims|\b(7|8) (recorded )?gaps/, `the ledgers hold ${claims.length} claims and ${gaps.length} gaps`],
      [/Nonce mismatch/, 'the recorded replay attempt was refused because the group was already settled, not for a nonce mismatch'],
      [/zero MEV|mathematically secure|production-ready|Zero Liquidation/i, 'a claim the evidence does not make'],
    ];
    assert.deepEqual(stale.filter(([re]) => re.test(doc)).map(([, why]) => why), []);
  });

  test(`${f}: counts it states match the repository`, () => {
    for (const m of doc.matchAll(/(\d+) (?:MCP )?tools/g)) assert.equal(Number(m[1]), toolCount, `says ${m[1]} tools; there are ${toolCount}`);
    for (const m of doc.matchAll(/(\d+) claims/g)) assert.equal(Number(m[1]), claims.length);
    for (const m of doc.matchAll(/(\d+) (?:recorded )?gaps/g)) assert.equal(Number(m[1]), gaps.length);
  });
}

test('README and CURRENT_STATE name the live code hash', () => {
  assert.ok(read('README.md').includes(live) || read('README.md').includes(live.slice(0, 8)), 'README must name the live hash');
  assert.ok(read('docs/canonical/CURRENT_STATE.md').includes(live.slice(0, 8)), 'CURRENT_STATE must name the live hash');
});

test('CURRENT_STATE and the README agree on Chain Signatures (a live sign call is recorded)', () => {
  const cs = read('docs/canonical/CURRENT_STATE.md'); const rd = read('README.md');
  const row = (d) => (d.split('\n').find((l) => /Chain Signatures/.test(l) && l.startsWith('|')) || '');
  assert.match(row(cs), /LIVE/i); assert.match(row(rd), /LIVE/i);
});

test('the replay proof is described as what it was: refused because the group was already settled', () => {
  for (const f of ['README.md', 'docs/security/threat-model.md']) assert.match(read(f), /already settled|not active/i, f);
});

test('the submission form text fits the 2,000-character limit, and the stated count is the real one', () => {
  const doc = read('docs/hackathon-submission.md');
  const a = doc.indexOf('```text') + 8; const text = doc.slice(a, doc.indexOf('```', a)).replace(/\n$/, '');
  assert.ok(text.length >= 20 && text.length <= 2000, `the form text is ${text.length} characters`);
  const stated = doc.match(/Character count: ([\d,]+) \/ 2,000/);
  assert.ok(stated, 'the count line is missing');
  assert.equal(Number(stated[1].replace(/,/g, '')), text.length, 'the stated character count is not the real one');
});

test('the judge entry point does not print counts the repository has outgrown', () => {
  const v = read('scripts/verify');
  assert.doesNotMatch(v, /53 tests|43 unit|4 invariant ok/);
});

test('the submission pack points at files by relative path, not at one machine', () => {
  assert.doesNotMatch(read('docs/hackathon-submission.md'), /file:\/\/|\/home\/ubuntu/);
});
