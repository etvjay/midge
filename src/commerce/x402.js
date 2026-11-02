import crypto from 'node:crypto';

/**
 * x402 Agent Micro-Commerce:
 * Implements HTTP 402 "Payment Required" flows allowing autonomous Flyers
 * to buy proprietary data, oracle feeds, or sub-reports from peer agents in real time.
 */
export class X402CommerceEngine {
  constructor() {
    this.invoices = new Map();
    this.settledReceipts = [];
  }

  /**
   * Seller Agent generates an HTTP 402 payment challenge.
   */
  createPaymentChallenge({ sellerFlyerId, resourceId, priceUsdc, description }) {
    const invoiceId = `inv_${crypto.randomBytes(12).toString('hex')}`;
    const invoice = {
      statusCode: 402,
      invoiceId,
      sellerFlyerId,
      resourceId,
      priceUsdc,
      currency: 'USDC',
      description,
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

    if (inv.priceUsdc > maxAcceptablePrice) {
      throw new Error(
        `[x402 REJECT] Price ${inv.priceUsdc} USDC exceeds buyer limit of ${maxAcceptablePrice} USDC`
      );
    }

    inv.status = 'PAID';
    const receipt = {
      receiptId: `rcpt_${crypto.randomBytes(12).toString('hex')}`,
      invoiceId,
      buyerFlyerId,
      sellerFlyerId: inv.sellerFlyerId,
      resourceId: inv.resourceId,
      amountPaid: inv.priceUsdc,
      settledVia: 'PINGPAY_CONFIDENTIAL_MICROPAYMENT',
      timestamp: Date.now(),
    };

    this.settledReceipts.push(receipt);
    return receipt;
  }
}
