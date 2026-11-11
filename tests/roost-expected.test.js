// roost.expected.json pins the compose hashes a member should accept. The newest must be one a real VM attested in a promoted run.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('..', import.meta.url);
const expected = JSON.parse(fs.readFileSync(new URL('roost.expected.json', root), 'utf8'));
const RUN = '20261111T102349Z-a216';
const attestedHash = () => {
  for (const l of fs.readFileSync(new URL(`docs/lab-runs/${RUN}/events.jsonl`, root), 'utf8').split('\n').filter(Boolean)) {
    const e = JSON.parse(l); if (e.type === 'evidence' && e.kind === 'attestation' && e.composeHash) return e.composeHash;
  }
  return null;
};

test('the pinned compose hashes are a list of 64-hex values, newest first', () => {
  assert.ok(Array.isArray(expected.composeHash) && expected.composeHash.length >= 2);
  for (const h of expected.composeHash) assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(new Set(expected.composeHash).size, expected.composeHash.length);
});

test('the newest pin is the compose hash a real TDX VM attested in the promoted run', () => {
  assert.equal(expected.composeHash[0], attestedHash());
});

test('the November 4 build stays pinned, so the saved bundle from then still verifies', () => {
  assert.ok(expected.composeHash.includes('8a0180ff698c44b5e743acca369fbfe9f309fbf084cf87415f6962fb8e1be6c8'));
});

test('each pin says which evidence it comes from', () => {
  assert.match(expected.composeHashSource, new RegExp(RUN));
  assert.match(expected.composeHashSource, /2026-11-04/);
});
