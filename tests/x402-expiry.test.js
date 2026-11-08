// Plan 09-1, Task 9 (hole H3): an expired invoice reads as expired without anyone having to try to pay it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { X402CommerceEngine } from '../src/commerce/x402.js';

const T0 = 1_800_000_000_000;
function engine(t) {
  t.mock.method(Date, 'now', () => T0);
  const e = new X402CommerceEngine({ secret: Buffer.alloc(32, 1) });
  const inv = e.createPaymentChallenge({ sellerFlyerId: 's.near', resourceId: 'feed', priceUsdc: 5 });
  return { e, inv };
}

test('a new invoice reads PAYMENT_REQUIRED', (t) => {
  const { e, inv } = engine(t);
  assert.equal(e.invoiceStatus(inv.invoiceId), 'PAYMENT_REQUIRED');
});

test('after its time it reads EXPIRED without anyone having tried to pay it', (t) => {
  const { e, inv } = engine(t);
  t.mock.method(Date, 'now', () => T0 + 61_000);
  assert.equal(e.invoiceStatus(inv.invoiceId), 'EXPIRED');
});

test('paying after expiry is refused', (t) => {
  const { e, inv } = engine(t);
  t.mock.method(Date, 'now', () => T0 + 61_000);
  assert.throws(() => e.settleInvoice({ invoiceId: inv.invoiceId, buyerFlyerId: 'b.near', maxAcceptablePrice: 10 }), /expired/);
});

test('a paid invoice stays PAID after its expiry time', (t) => {
  const { e, inv } = engine(t);
  e.settleInvoice({ invoiceId: inv.invoiceId, buyerFlyerId: 'b.near', maxAcceptablePrice: 10 });
  t.mock.method(Date, 'now', () => T0 + 120_000);
  assert.equal(e.invoiceStatus(inv.invoiceId), 'PAID');
});

test('an unknown invoice reads UNKNOWN', (t) => {
  const { e } = engine(t);
  assert.equal(e.invoiceStatus('inv_nope'), 'UNKNOWN');
});
