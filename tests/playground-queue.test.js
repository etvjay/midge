import test from 'node:test';
import assert from 'node:assert/strict';
import { createQueue, QueueRefusal } from '../src/playground/queue.js';

const clockAt = (t0 = 1_800_000_000_000) => { const c = { t: t0, now: () => c.t, advance: (ms) => { c.t += ms; } }; return c; };
const mk = (over = {}) => { const c = clockAt(); return { c, q: createQueue({ now: c.now, ...over }) }; };
const BAL = String(10n ** 25n); // 10 NEAR
const refusal = (fn) => { try { fn(); return null; } catch (e) { return e instanceof QueueRefusal ? e.reason : `other: ${e.message}`; } };

test('tickets are served in order, one at a time', () => {
  const { q } = mk();
  const a = q.join({ address: '1.1.1.1', funderBalanceYocto: BAL }); const b = q.join({ address: '2.2.2.2', funderBalanceYocto: BAL });
  assert.equal(a.position, 1); assert.equal(b.position, 2);
  assert.equal(q.next(), a.ticket);
  assert.equal(q.next(), null, 'nothing else starts while one is active');
  q.finish(a.ticket, { ok: true });
  assert.equal(q.next(), b.ticket);
});

test('a second tab from the same address gets the same ticket, not its own turn', () => {
  const { q } = mk();
  const a = q.join({ address: '1.1.1.1', funderBalanceYocto: BAL });
  const again = q.join({ address: '1.1.1.1', funderBalanceYocto: BAL });
  assert.equal(again.ticket, a.ticket);
  const other = q.join({ address: '2.2.2.2', funderBalanceYocto: BAL });
  assert.equal(other.position, 2, 'the second tab did not take a place in the line');
});

test('the fourth round from one address in an hour is refused, and it is allowed again an hour later', () => {
  const { q, c } = mk();
  for (let i = 0; i < 3; i += 1) { const t = q.join({ address: '1.1.1.1', funderBalanceYocto: BAL }); q.next(); q.finish(t.ticket, { ok: true }); }
  assert.equal(refusal(() => q.join({ address: '1.1.1.1', funderBalanceYocto: BAL })), 'address-limit');
  c.advance(61 * 60 * 1000);
  assert.equal(refusal(() => q.join({ address: '1.1.1.1', funderBalanceYocto: BAL })), null);
});

test('the 61st round of a day is refused as daily-cap', () => {
  const { q, c } = mk({ perAddressPerHour: 1000 });
  for (let i = 0; i < 60; i += 1) { const t = q.join({ address: `10.0.${i >> 8}.${i & 255}`, funderBalanceYocto: BAL }); q.next(); q.finish(t.ticket, { ok: true }); }
  assert.equal(refusal(() => q.join({ address: '9.9.9.9', funderBalanceYocto: BAL })), 'daily-cap');
  c.advance(25 * 3600 * 1000);
  assert.equal(refusal(() => q.join({ address: '9.9.9.9', funderBalanceYocto: BAL })), null);
});

test('a ninth waiting ticket is refused as queue-full', () => {
  const { q } = mk();
  q.join({ address: '0.0.0.0', funderBalanceYocto: BAL }); q.next();
  for (let i = 1; i <= 8; i += 1) q.join({ address: `1.1.1.${i}`, funderBalanceYocto: BAL });
  assert.equal(refusal(() => q.join({ address: '1.1.1.9', funderBalanceYocto: BAL })), 'queue-full');
});

test('a funder balance under the floor is refused before any ticket exists', () => {
  const { q } = mk({ funderFloor: String(2n * 10n ** 24n) });
  assert.equal(refusal(() => q.join({ address: '1.1.1.1', funderBalanceYocto: String(10n ** 24n) })), 'funder-low');
  assert.equal(q.state('nothing'), null);
  assert.equal(refusal(() => q.join({ address: '1.1.1.1', funderBalanceYocto: BAL })), null, 'the refusal used up none of the address allowance');
});

test('an unsigned active ticket expires after ten minutes and the next one starts; a signed one does not', () => {
  const { q, c } = mk();
  const a = q.join({ address: '1.1.1.1', funderBalanceYocto: BAL }); const b = q.join({ address: '2.2.2.2', funderBalanceYocto: BAL });
  q.next(); c.advance(9 * 60 * 1000); q.touch(b.ticket);
  assert.deepEqual(q.sweep(), []);
  c.advance(2 * 60 * 1000); q.touch(b.ticket);
  assert.deepEqual(q.sweep(), [a.ticket]);
  assert.equal(q.state(a.ticket).status, 'expired');
  assert.equal(q.next(), b.ticket);
  q.markSigned(b.ticket); c.advance(30 * 60 * 1000);
  assert.deepEqual(q.sweep(), [], 'a signed round is never expired by the queue');
});

test('a waiting ticket that is not polled for ten minutes expires, and polling keeps it', () => {
  const { q, c } = mk();
  q.join({ address: '1.1.1.1', funderBalanceYocto: BAL }); q.next();
  const w = q.join({ address: '2.2.2.2', funderBalanceYocto: BAL }); const w2 = q.join({ address: '3.3.3.3', funderBalanceYocto: BAL });
  c.advance(11 * 60 * 1000); q.touch(w2.ticket);
  const gone = q.sweep();
  assert.ok(gone.includes(w.ticket) && !gone.includes(w2.ticket));
});

test('the estimated wait is 90 seconds for each ticket ahead', () => {
  const { q } = mk();
  q.join({ address: '1.1.1.1', funderBalanceYocto: BAL }); q.next();
  const b = q.join({ address: '2.2.2.2', funderBalanceYocto: BAL }); const c3 = q.join({ address: '3.3.3.3', funderBalanceYocto: BAL });
  assert.deepEqual(q.state(b.ticket), { status: 'waiting', position: 1, etaSeconds: 90 });
  assert.deepEqual(q.state(c3.ticket), { status: 'waiting', position: 2, etaSeconds: 180 });
});
