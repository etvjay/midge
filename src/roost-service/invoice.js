import crypto from 'node:crypto';
import { canonicalJson } from './receipts.js';

/**
 * Payee-signed invoices. The payee signs the exact payment they ask for (chain, address, asset, amount, period); the room compares it with the
 * employer's approval field by field, so "the approved invoice differs from the executed transfer" is caught before anything is signed.
 * The invoice hash goes into the receipt, which ties the obligation to one payee, amount, asset and chain.
 */
export const INVOICE_DOMAIN = 'midge-invoice-v1:';
const FIELDS = ['invoiceId', 'period', 'chain', 'address', 'asset', 'amount'];

export const invoiceHash = (body) => crypto.createHash('sha256').update(INVOICE_DOMAIN + canonicalJson(body), 'utf8').digest('hex');

export function signInvoice(body, privateKey) {
  const publicKey = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
  const sig = crypto.sign(null, Buffer.from(INVOICE_DOMAIN + canonicalJson(body), 'utf8'), privateKey).toString('hex');
  return { body, payeeKey: publicKey, sig };
}

const SPKI = Buffer.from('302a300506032b6570032100', 'hex');
export function verifyInvoice(inv) {
  try {
    if (!inv || !inv.body || !/^[0-9a-f]{64}$/i.test(inv.payeeKey) || !/^[0-9a-f]{128}$/i.test(inv.sig)) return { ok: false, reason: 'malformed invoice' };
    const key = crypto.createPublicKey({ key: Buffer.concat([SPKI, Buffer.from(inv.payeeKey, 'hex')]), format: 'der', type: 'spki' });
    const ok = crypto.verify(null, Buffer.from(INVOICE_DOMAIN + canonicalJson(inv.body), 'utf8'), key, Buffer.from(inv.sig, 'hex'));
    return ok ? { ok: true } : { ok: false, reason: 'signature does not verify' };
  } catch { return { ok: false, reason: 'signature does not verify' }; }
}

const LABEL = { invoiceId: 'invoice id', period: 'period', chain: 'chain', address: 'destination address', asset: 'asset', amount: 'amount' };
export function matchApproval(inv, approval) {
  const reasons = [];
  if (!verifyInvoice(inv).ok) reasons.push('the invoice signature does not verify');
  for (const f of FIELDS) if (String(inv?.body?.[f]) !== String(approval?.[f])) reasons.push(`${LABEL[f]} differs: invoice ${inv?.body?.[f]}, approved ${approval?.[f]}`);
  return { ok: reasons.length === 0, reasons };
}

/** A receipt for a payment on another chain: names the chain and both transactions, and carries the invoice hash. */
export function foreignReceipt({ runId, invoice, nearTx, chainTx, obligationId }) {
  const b = invoice.body;
  return { v: 1, kind: 'foreign-pay', runId, invoiceId: b.invoiceId, period: b.period, chain: b.chain, payee: b.address, asset: b.asset, amount: b.amount, invoiceHash: invoiceHash(b), obligationId, nearTx, chainTx };
}
