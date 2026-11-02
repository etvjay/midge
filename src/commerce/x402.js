import crypto from 'node:crypto';

/**
 * x402 Agent Micro-Commerce:
 * Implements HTTP 402 "Payment Required" flows allowing autonomous Flyers
 * to buy proprietary data, oracle feeds, or sub-reports from peer agents in real time.
 * Receipts are cryptographically signed with HMAC-SHA256 for non-forgeable verification.
 */
export class X402CommerceEngine {
  constructor({ secret = null } = {}) {
    this.invoices = new Map();
    this.settledReceipts = [];
    this.secret = secret || (process.env.FLY_COMMERCE_SECRET ? Buffer.from(process.env.FLY_COMMERCE_SECRET, 'hex') : crypto.randomBytes(32));
  }

  /**
   * Seller Agent generates an HTTP 402 payment challenge.
   */
  createPaymentChallenge({ sellerFlyerId, resourceId, priceUsdc, description }) {
    if (!sellerFlyerId || !resourceId || typeof priceUsdc !== 'number' || priceUsdc <= 0) {
      throw new Error('[x402] Invalid challenge parameters: sellerFlyerId, resourceId, and positive priceUsdc required.');
    }

    const invoiceId = `inv_${crypto.randomBytes(12).toString('hex')}`;
    const invoice = {
      statusCode: 402,
      invoiceId,
      sellerFlyerId,
      resourceId,
      priceUsdc,
      currency: 'USDC',
      description: description || 'Proprietary intelligence feed',
      expiresAt: Date.now() + 60000, // 60s validity
      status: 'PAYMENT_REQUIRED',
    };

    this.invoices.set(invoiceId, invoice);
    return invoice;
  }

  /**
   * Buyer Agent pays the 402 invoice using policy-bound micro-balance.
   */
  settleInvoice({ invoiceId, buyerFlyerId, maxAcceptablePrice }) {
    const inv = this.invoices.get(invoiceId);
    if (!inv || inv.status !== 'PAYMENT_REQUIRED') {
      throw new Error(`Invalid or already settled invoice: ${invoiceId}`);
    }

    if (Date.now() > inv.expiresAt) {
      inv.status = 'EXPIRED';
      throw new Error(`[x402 REJECT] Invoice ${invoiceId} has expired.`);
    }

    if (inv.priceUsdc > maxAcceptablePrice) {
      throw new Error(
        `[x402 REJECT] Price ${inv.priceUsdc} USDC exceeds buyer limit of ${maxAcceptablePrice} USDC`
      );
    }

    inv.status = 'PAID';
    const receiptId = `rcpt_${crypto.randomBytes(12).toString('hex')}`;
    const hmacSignature = crypto
      .createHmac('sha256', this.secret)
      .update(`${receiptId}:${inv.resourceId}:${inv.priceUsdc}`)
      .digest('hex');

    const receipt = {
      receiptId,
      invoiceId,
      buyerFlyerId,
      sellerFlyerId: inv.sellerFlyerId,
      resourceId: inv.resourceId,
      amountPaid: inv.priceUsdc,
      hmacSignature,
      proof: `${receiptId}.${hmacSignature}`,
      settledVia: 'PINGPAY_CONFIDENTIAL_MICROPAYMENT',
      timestamp: Date.now(),
      status: 'SETTLED',
    };

    this.settledReceipts.push(receipt);
    return receipt;
  }

  /**
   * Cryptographically verifies a submitted payment proof for a given resource.
   * Strictly requires a signed bearer proof in format: "<receiptId>.<hmacSignature>".
   * Unsigned receipts are rejected to prevent receipt-id spoofing.
   */
  verifyPaymentProof(proof, expectedResourceId) {
    if (!proof || typeof proof !== 'string' || !expectedResourceId) return null;

    // Strictly enforce "<receiptId>.<hmacSignature>" format
    const dotIdx = proof.indexOf('.');
    if (dotIdx === -1) {
      return null; // Reject unsigned receipt IDs
    }

    const receiptId = proof.slice(0, dotIdx);
    const providedSig = proof.slice(dotIdx + 1);

    if (!receiptId || !providedSig) return null;

    const receipt = this.settledReceipts.find((r) => r.receiptId === receiptId);
    if (!receipt) return null;
    if (receipt.resourceId !== expectedResourceId) return null;
    if (receipt.status !== 'SETTLED') return null;

    // Cryptographic authenticity check
    const expectedHmac = crypto
      .createHmac('sha256', this.secret)
      .update(`${receipt.receiptId}:${receipt.resourceId}:${receipt.amountPaid}`)
      .digest('hex');

    if (receipt.hmacSignature !== expectedHmac) return null;
    if (providedSig !== expectedHmac) return null;

    return receipt;
  }
}
