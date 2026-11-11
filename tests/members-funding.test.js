import test from 'node:test';
import assert from 'node:assert/strict';
import { fundingPlan } from '../lab/lib/members.js';

test('a single amount funds every member the same', () => {
  assert.deepEqual(fundingPlan({ count: 3, names: null, fundNear: '0.15' }), ['0.15', '0.15', '0.15']);
});

test('a map funds named members individually and the rest by default', () => {
  assert.deepEqual(fundingPlan({ count: 4, names: ['u1', 'rp', 'u2', 'ra'], fundNear: { default: '0.3', rp: '0.05', ra: '0.05' } }), ['0.3', '0.05', '0.3', '0.05']);
});

test('a map without a default, or naming nobody it can match, is refused rather than guessed', () => {
  assert.throws(() => fundingPlan({ count: 2, names: ['a', 'b'], fundNear: { a: '0.1' } }), /default/);
  assert.throws(() => fundingPlan({ count: 2, names: null, fundNear: { default: '0.1', a: '0.2' } }), /names/);
  assert.throws(() => fundingPlan({ count: 2, names: ['a', 'b'], fundNear: { default: '0.1', zzz: '0.2' } }), /zzz/);
});
