#!/usr/bin/env node
/**
 * Live NEAR Intents (1Click) dry quotes for the two payees the Midge contract pays on other chains: what 1 wNEAR would buy as SOL for the
 * Solana payee and as ETH for the Ethereum payee. A dry quote moves no funds and opens no swap. 1Click runs on mainnet only, so this reads
 * the mainnet route and prices; our payments themselves run on testnets. Writes docs/canonical/intents-quote-evidence.json.
 * Run: npm run verify:intents-quote. Needs the network; no keys.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OneClickIntentAdapter } from '../src/intents/oneclick.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const a = new OneClickIntentAdapter();
const tokens = await a.fetchSupportedTokens();
console.log(`1Click lists ${tokens.length} assets`);
const ethAsset = tokens.find((t) => t.symbol === 'ETH' && t.blockchain === 'eth')?.assetId;
if (!ethAsset) throw new Error('1Click does not list ETH on eth right now');
const jobs = [
  { label: 'wNEAR to SOL (Solana payee)', destinationAsset: 'nep141:sol.omft.near', recipient: 'KLsn8JawHSc2KMRFK9qrxifgBEm8WJ568LsvSKbaVPc' },
  { label: 'wNEAR to ETH (Ethereum payee)', destinationAsset: ethAsset, recipient: '0xB9A425FB45734FC29a9c941c2c05b34DE59FF7A4' },
];
const quotes = [];
for (const j of jobs) {
  const q = await a.getDryQuote({ originAsset: 'nep141:wrap.near', destinationAsset: j.destinationAsset, amount: '1000000000000000000000000', recipient: j.recipient, refundTo: 'near' });
  console.log(`${j.label}: 1 wNEAR -> ${q.amountOut} (min ${q.minAmountOut}), about ${q.timeEstimateSeconds}s, $${Number(q.usdIn).toFixed(2)} in, $${Number(q.usdOut).toFixed(2)} out`);
  quotes.push({ ...j, ...q });
}
let confidential = 'not refused';
try { a.createQuoteRequest({ originAsset: 'nep141:wrap.near', destinationAsset: 'nep141:sol.omft.near', amount: '1', recipient: 'x', refundTo: 'near', confidential: true }); } catch (e) { confidential = e.message; }
const evidence = {
  ranAt: new Date().toISOString(), baseUrl: a.baseUrl, assetsListed: tokens.length, quotes, confidentialMode: confidential,
  note: 'Dry quotes only: no deposit address, no swap. 1Click is mainnet only. Confidential quotes need an authenticated user (HTTP 401 without a token, 2026-11-11).',
};
fs.writeFileSync(path.join(root, 'docs/canonical/intents-quote-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
console.log('VERIFIED: 1Click answered dry quotes for both payees; nothing was swapped.');
