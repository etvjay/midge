import test from 'node:test';
import assert from 'node:assert/strict';
import { selectToReap } from '../scripts/phala-reaper.mjs';
import { findViolations } from '../scripts/check-predictions-first.mjs';

const NOW = Date.parse('2026-11-11T12:00:00Z');
const cvm = (name, created, extra = {}) => ({ cvmName: name, id: `id-${name}`, created_at: created, status: 'running', ...extra });

test('reaper: a midge VM older than the limit is selected, a young one is not', () => {
  const r = selectToReap([cvm('midge-lab-1', '2026-11-11T08:00:00Z'), cvm('midge-lab-2', '2026-11-11T11:30:00Z')], { now: NOW, maxAgeHours: 2 });
  assert.deepEqual(r.reap.map((c) => c.cvmName), ['midge-lab-1']);
  assert.deepEqual(r.keep.map((c) => c.cvmName), ['midge-lab-2']);
});

test('reaper: a VM that is not ours is never selected, however old', () => {
  const r = selectToReap([cvm('someone-elses-app', '2026-01-01T00:00:00Z')], { now: NOW, maxAgeHours: 1 });
  assert.equal(r.reap.length, 0); assert.equal(r.foreign.length, 1);
});

test('reaper: a VM whose age cannot be read is reported and left alone', () => {
  const r = selectToReap([{ cvmName: 'midge-lab-3', id: 'x' }], { now: NOW, maxAgeHours: 1 });
  assert.equal(r.reap.length, 0); assert.equal(r.unknownAge.length, 1);
});

test('reaper: the age is found under any key that mentions created', () => {
  const r = selectToReap([{ cvmName: 'midge-roost-9', id: 'y', node: { createdAt: '2026-11-11T01:00:00Z' } }], { now: NOW, maxAgeHours: 2 });
  assert.equal(r.reap.length, 1);
});

const T = (n) => 1000 + n;
test('predictions: a new experiment whose id is in the plan in an EARLIER commit passes', () => {
  assert.deepEqual(findViolations([{ id: 'E-NEW-01', fileCommit: 'b', fileTime: T(2), planCommit: 'a', planTime: T(1) }], new Set()), []);
});
test('predictions: the same commit is a violation', () => {
  const v = findViolations([{ id: 'E-NEW-01', fileCommit: 'a', fileTime: T(1), planCommit: 'a', planTime: T(1) }], new Set());
  assert.equal(v.length, 1); assert.match(v[0].reason, /same commit/);
});
test('predictions: no mention in the plan at all is a violation', () => {
  const v = findViolations([{ id: 'E-NEW-01', fileCommit: 'a', fileTime: T(1), planCommit: null, planTime: null }], new Set());
  assert.equal(v.length, 1); assert.match(v[0].reason, /not in the plan/);
});
test('predictions: a plan commit after the file is a violation', () => {
  assert.equal(findViolations([{ id: 'E-NEW-01', fileCommit: 'a', fileTime: T(1), planCommit: 'b', planTime: T(5) }], new Set()).length, 1);
});
test('predictions: an experiment on the exempt list is skipped (those existed before the check)', () => {
  assert.deepEqual(findViolations([{ id: 'E-OLD-01', fileCommit: 'a', fileTime: T(1), planCommit: null, planTime: null }], new Set(['E-OLD-01'])), []);
});

test('reaper: with an exact name only that VM can ever be selected, however old the others are', () => {
  const list = [cvm('midge-lab-1', '2026-01-01T00:00:00Z'), cvm('midge-lab-2', '2026-01-01T00:00:00Z')];
  const r = selectToReap(list, { now: NOW, maxAgeHours: 0, onlyName: 'midge-lab-2' });
  assert.deepEqual(r.reap.map((c) => c.cvmName), ['midge-lab-2']);
  assert.equal(r.foreign.length, 1, 'the other midge VM is left alone');
});
test('reaper: an exact name that matches nothing selects nothing', () => {
  assert.equal(selectToReap([cvm('midge-lab-1', '2026-01-01T00:00:00Z')], { now: NOW, maxAgeHours: 0, onlyName: 'midge-lab-9' }).reap.length, 0);
});

// The real Phala list records carry { appId, cvmName, status, uptime: "47s" } and no creation time (checked on a live VM, 2026-11-11).
test('reaper: the age is read from the uptime string the real listing gives', () => {
  const vm = (name, uptime) => ({ appId: `app-${name}`, cvmName: name, status: 'running', uptime });
  const r = selectToReap([vm('midge-lab-a', '47s'), vm('midge-lab-b', '3h 5m'), vm('midge-lab-c', '2d'), vm('midge-lab-d', '125m'), vm('midge-lab-e', 'soon')], { now: NOW, maxAgeHours: 2 });
  assert.deepEqual(r.reap.map((c) => c.cvmName).sort(), ['midge-lab-b', 'midge-lab-c', 'midge-lab-d']);
  assert.deepEqual(r.keep.map((c) => c.cvmName), ['midge-lab-a']);
  assert.deepEqual(r.unknownAge.map((c) => c.cvmName), ['midge-lab-e'], 'an uptime it cannot read is reported and left alone');
});
