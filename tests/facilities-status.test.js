// Plan 09-1, Task 8 (hole H2 and its siblings): a facility transition done twice is refused the second time.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ConfidentialRfqFacility } from '../src/facilities/rfq-adjudication.js';
import { OtcBlockTradeFacility } from '../src/facilities/otc-block-trade.js';
import { FarPrivateShardBridge } from '../src/settlement/far-shard.js';

test('RFQ: matching an RFQ that is already matched is refused and binds only one loan', () => {
  const f = new ConfidentialRfqFacility();
  const r = f.createRfq({ borrowerId: 'b.near', requestedAmountUsdc: 1000, collateralAsset: 'NEAR', collateralAmount: 500, maxAprPercent: 10, durationDays: 30 });
  f.submitQuote({ rfqId: r.rfqId, lenderId: 'l1.near', offeredAprPercent: 5, maxLtvPercent: 60, liquidationThresholdPercent: 80 });
  const first = f.matchAndBindLoan(r.rfqId);
  assert.ok(first.loanId);
  assert.throws(() => f.matchAndBindLoan(r.rfqId), /not open/);
  assert.equal(f.rfqs.get(r.rfqId).status, 'MATCHED_BOUND');
  assert.equal([...(f.loans?.values?.() ?? [])].length <= 1, true, 'at most one loan exists');
});

test('RFQ: a quote cannot be added to an RFQ that is already matched', () => {
  const f = new ConfidentialRfqFacility();
  const r = f.createRfq({ borrowerId: 'b.near', requestedAmountUsdc: 1000, collateralAsset: 'NEAR', collateralAmount: 500, maxAprPercent: 10, durationDays: 30 });
  f.submitQuote({ rfqId: r.rfqId, lenderId: 'l1.near', offeredAprPercent: 5, maxLtvPercent: 60, liquidationThresholdPercent: 80 });
  f.matchAndBindLoan(r.rfqId);
  assert.throws(() => f.submitQuote({ rfqId: r.rfqId, lenderId: 'l2.near', offeredAprPercent: 4, maxLtvPercent: 60, liquidationThresholdPercent: 80 }), /not found or closed/);
});

test('OTC: the same two orders cannot settle twice', () => {
  const f = new OtcBlockTradeFacility();
  const buy = f.submitSealedOrder({ flyerId: 'a.near', side: 'BUY', assetIn: 'USDC', amountIn: 1000, assetOut: 'NEAR', minOutputAmount: 100 });
  const sell = f.submitSealedOrder({ flyerId: 'b.near', side: 'SELL', assetIn: 'NEAR', amountIn: 200, assetOut: 'USDC', minOutputAmount: 900 });
  const t = f.matchCrossingOrders(buy.orderId, sell.orderId, 5);
  assert.ok(t.tradeId);
  assert.throws(() => f.matchCrossingOrders(buy.orderId, sell.orderId, 5), /already settled|not open/);
  assert.equal(f.settledTrades.length, 1);
});

test('FAR: one deposit receipt mints private tokens once', () => {
  const b = new FarPrivateShardBridge();
  const receipt = b.lockPublicTreasury({ depositor: 'a.near', assetId: 'usdc', amount: 100 });
  b.mintImtOnFar({ depositReceipt: receipt, privateAccount: 'priv1' });
  assert.throws(() => b.mintImtOnFar({ depositReceipt: receipt, privateAccount: 'priv1' }), /already minted|already used/);
  assert.equal(b.privateImtBalances.get('priv1'), 100, 'balance must not double');
});

test('FAR: a receipt the bridge never issued, or one with an inflated amount, mints nothing', () => {
  const b = new FarPrivateShardBridge();
  assert.throws(() => b.mintImtOnFar({ depositReceipt: { receiptId: 'dep_forged', assetId: 'usdc', amount: 1e9, status: 'LOCKED_IN_PUBLIC_TREASURY' }, privateAccount: 'priv1' }), /not issued|unknown receipt/);
  const real = b.lockPublicTreasury({ depositor: 'a.near', assetId: 'usdc', amount: 100 });
  const minted = b.mintImtOnFar({ depositReceipt: { ...real, amount: 1e9 }, privateAccount: 'priv2' });
  assert.equal(b.privateImtBalances.get('priv2'), 100, 'the issued amount is what mints, not the one the caller wrote');
  assert.ok(minted);
});

// ---- Review of plan 09-1, finding 4: no amount may be negative, zero or not a number ----
test('FAR: a negative, zero or non-numeric amount is refused everywhere and creates no tokens', () => {
  const b = new FarPrivateShardBridge();
  for (const bad of [-1e9, 0, NaN, Infinity, '5', null]) {
    assert.throws(() => b.lockPublicTreasury({ depositor: 'a.near', assetId: 'usdc', amount: bad }), /positive|amount/i, `lock ${String(bad)}`);
  }
  const r = b.lockPublicTreasury({ depositor: 'a.near', assetId: 'usdc', amount: 100 });
  b.mintImtOnFar({ depositReceipt: r, privateAccount: 'priv1' });
  for (const bad of [-5e8, 0, NaN, Infinity, '5', null]) {
    assert.throws(() => b.executePrivateMatch({ orderId: 'o1', inputAccount: 'priv1', inputAmount: bad, outputAsset: 'near', outputAmount: 1 }), /positive|amount/i, `match ${String(bad)}`);
    assert.throws(() => b.burnImtAndWithdraw({ privateAccount: 'priv1', imtAmount: bad, publicDestinationWallet: 'w.near' }), /positive|amount/i, `burn ${String(bad)}`);
  }
  assert.equal(b.privateImtBalances.get('priv1'), 100, 'no balance may change');
  assert.equal(b.publicTreasuryLocked.get('usdc'), 100, 'the treasury total may not move either');
});
