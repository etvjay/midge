// The whitepaper is kept true by this test: what it cites must exist, and what it states about the live contract must match the record.
// It cannot prove a sentence is correct; it fails when the document cites something that is not there, names a superseded
// contract hash, or repeats a number the repository has since contradicted.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const doc = read('docs/WHITEPAPER.md');
const jsonl = (p) => read(p).split('\n').filter(Boolean).map((l) => JSON.parse(l));
const claims = new Set(jsonl('foundry/claims.jsonl').map((c) => c.id));
const gaps = new Set(jsonl('foundry/gaps.jsonl').map((g) => g.id));
const deployments = JSON.parse(read('docs/canonical/deployments.json')).deployments;
const hashes = deployments.map((d) => d.codeHash);

const experimentIds = new Set(fs.readdirSync(path.join(root, 'lab/experiments')).flatMap((f) => [...read(`lab/experiments/${f}`).matchAll(/id: '(E-[A-Z0-9-]+)'/g)].map((m) => m[1])));
const runIds = new Set(fs.readdirSync(path.join(root, 'docs/lab-runs')));

test('it says when it was written and that it is checked by this test', () => {
  assert.match(doc, /Written 2026-11-\d\d/);
  assert.match(doc, /tests\/whitepaper-true\.test\.js/);
});

test('every claim id it cites exists in foundry/claims.jsonl', () => {
  const cited = [...new Set(doc.match(/CLM-[A-Z0-9-]+/g) || [])];
  assert.ok(cited.length >= 8, `cites ${cited.length} claims; a whitepaper that ties nothing to evidence is not one`);
  assert.deepEqual(cited.filter((c) => !claims.has(c)), []);
});

test('every gap id it cites exists in foundry/gaps.jsonl', () => {
  const cited = [...new Set(doc.match(/GAP-\d{3}/g) || [])];
  assert.ok(cited.length >= 5);
  assert.deepEqual(cited.filter((g) => !gaps.has(g)), []);
});

test('every experiment id and promoted run it cites exists', () => {
  const exp = [...new Set(doc.match(/E-[A-Z0-9]+(?:-[A-Z0-9]+)+/g) || [])];
  assert.deepEqual(exp.filter((e) => !experimentIds.has(e)), []);
  const runs = [...new Set(doc.match(/\b2026\d{4}T\d{6}Z-[0-9a-f]{4}\b/g) || [])];
  assert.ok(runs.length >= 2);
  assert.deepEqual(runs.filter((r) => !runIds.has(r)), []);
});

test('every repository path it names exists', () => {
  const paths = [...new Set([...doc.matchAll(/`((?:src|docs|scripts|deploy|lab|foundry|contracts|tests|verifications)\/[A-Za-z0-9_./-]+?)`/g)].map((m) => m[1].replace(/[.,;:]$/, '')))];
  assert.deepEqual(paths.filter((p) => !fs.existsSync(path.join(root, p))), []);
});

test('the contract hash it names is a recorded deployment, and the live one is named', () => {
  const named = [...new Set(doc.match(/\b[1-9A-HJ-NP-Za-km-z]{43,44}\b/g) || [])].filter((h) => !/^[0-9a-f]+$/i.test(h) && (hashes.includes(h) || /^[1-9A-HJ-NP-Za-km-z]{44}$/.test(h)));
  assert.ok(named.length >= 1);
  assert.deepEqual(named.filter((h) => !hashes.includes(h)), [], 'a hash that is not in docs/canonical/deployments.json');
  assert.ok(doc.includes(hashes[hashes.length - 1]), 'the whitepaper must name the code hash that is live now');
  const older = hashes.slice(0, -1).filter((h) => doc.includes(h));
  for (const h of older) assert.match(doc, new RegExp(`${h}[^\\n]{0,160}(earlier|superseded|before)`, 'i'), `${h} is superseded and must be labelled so`);
});

test('the simulation numbers it quotes are the ones in the saved baseline (to two decimals)', () => {
  const rounded = new Set();
  (function walk(v) { if (typeof v === 'number') rounded.add(v.toFixed(2)); else if (v && typeof v === 'object') Object.values(v).forEach(walk); })(JSON.parse(read('docs/canonical/baseline-simulation.json')));
  for (const n of ['16.67', '15.60', '519.44', '481.09']) { assert.ok(rounded.has(n), `${n} is not in baseline-simulation.json`); assert.ok(doc.includes(n), `${n} is not quoted`); }
});

test('it no longer repeats statements the repository has contradicted', () => {
  const stale = [
    [/4Zzj8DuTxwJnLv1c3jXfKRvQrxAYUFFfeMnAgSHJjevx(?![^\n]{0,160}(earlier|superseded))/, 'an old code hash presented as current'],
    [/304 KB/, 'a binary size that was never re-measured'],
    [/\b53 NEAR L1/, 'a test count from the first week'],
    [/<20\.0s/, 'a runtime from the first, much smaller suite'],
    [/RSA-2048/, 'the bids to a hosted or model-sealed Roost are not RSA (X25519 + XChaCha20-Poly1305)'],
    [/NVIDIA CVM/, 'not part of any run in this repository'],
    [/zero_memory_invariant|zero-wiped|zero-wipe/i, 'JavaScript gives no guarantee of overwriting memory'],
    [/\$60 million|6\.9 million sandwich|\$300 billion/, 'third-party figures this repository never checked'],
    [/mathematically secure/i, 'a claim the evidence does not make'],
    [/within a single epoch/, 'the cap was per settlement before GAP-024'],
  ];
  const hits = stale.filter(([re]) => re.test(doc)).map(([, why]) => why);
  assert.deepEqual(hits, []);
});

test('it separates what ran from what is simulated, and says what it does not claim', () => {
  assert.match(doc, /## .*What is real/i);
  assert.match(doc, /## .*What this does not claim/i);
  assert.match(doc, /much rarer, not impossible/);
});
