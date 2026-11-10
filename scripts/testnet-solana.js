#!/usr/bin/env node
/**
 * Live NEAR Chain Signatures -> Solana devnet: derive a Solana address from our NEAR account (Ed25519, signer domain 1), fund it
 * from the devnet airdrop, have the signer contract's MPC network sign a SOL transfer, verify the signature locally, broadcast it
 * and confirm it on Solana. Run: npm run verify:solana. Writes docs/canonical/chain-signatures-solana-evidence.json.
 * Needs NEAR_ACCOUNT_ID and NEAR_PRIVATE_KEY in .env (testnet). Spends testnet NEAR (1 yocto + gas) and devnet SOL only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner } from 'near-api-js';
import { ed25519 } from '@noble/curves/ed25519.js';
import { b58decode, b58encode, nearKeyToSolanaAddress, buildTransferMessage, assembleTransaction, parseEddsaSignature } from '../src/multichain/solana-transfer.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOLANA = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const SIGNER = 'v1.signer-prod.testnet';
const FROM_PATH = 'midge/solana/group-1';
const TO_PATH = 'midge/solana/recipient';
const LAMPORTS = 1_000_000n; // 0.001 SOL

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.join(root, '.env'), 'utf8').split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#') || !t.includes('=')) continue;
    env[t.slice(0, t.indexOf('=')).trim()] = t.slice(t.indexOf('=') + 1).trim();
  }
  return env;
}

const sol = async (method, params) => {
  const r = await fetch(SOLANA, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const j = await r.json(); if (j.error) throw new Error(`${method}: ${j.error.message}`); return j.result;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const env = loadEnv();
  if (!env.NEAR_ACCOUNT_ID || !env.NEAR_PRIVATE_KEY) throw new Error('Missing NEAR_ACCOUNT_ID or NEAR_PRIVATE_KEY in .env');
  const provider = new JsonRpcProvider({ url: process.env.NEAR_RPC_URL || 'https://test.rpc.fastnear.com' });
  const account = new Account(env.NEAR_ACCOUNT_ID, provider, new KeyPairSigner(KeyPair.fromString(env.NEAR_PRIVATE_KEY)));

  console.log('[1/6] Deriving Solana addresses from the NEAR account (Ed25519, signer domain 1)');
  const derive = async (p) => nearKeyToSolanaAddress(await provider.callFunction({ contractId: SIGNER, method: 'derived_public_key', args: { path: p, predecessor: env.NEAR_ACCOUNT_ID, domain_id: 1 } }));
  const fromAddr = await derive(FROM_PATH); const toAddr = await derive(TO_PATH);
  console.log(`      group address:     ${fromAddr}\n      recipient address: ${toAddr}`);

  console.log('[2/6] Funding the group address from the devnet airdrop (if needed)');
  let balance = (await sol('getBalance', [fromAddr, { commitment: 'confirmed' }])).value;
  if (balance < 5_000_000) {
    const airdrop = await sol('requestAirdrop', [fromAddr, 1_000_000_000]);
    console.log(`      airdrop requested: ${airdrop}`);
    for (let i = 0; i < 30 && balance < 5_000_000; i++) { await sleep(2000); balance = (await sol('getBalance', [fromAddr, { commitment: 'confirmed' }])).value; }
  }
  console.log(`      balance: ${balance} lamports`);
  if (balance < 5_000_000) throw new Error('the airdrop did not arrive (devnet faucets are rate limited): try again later');

  console.log('[3/6] Building the transfer');
  const { value: { blockhash } } = await sol('getLatestBlockhash', [{ commitment: 'finalized' }]);
  const message = buildTransferMessage({ from: b58decode(fromAddr), to: b58decode(toAddr), lamports: LAMPORTS, recentBlockhash: b58decode(blockhash) });
  console.log(`      ${LAMPORTS} lamports (0.001 SOL), message ${message.length} bytes, blockhash ${blockhash}`);

  console.log('[4/6] Asking the MPC network to sign it (Ed25519, domain 1)');
  const signTx = await account.callFunctionRaw({
    contractId: SIGNER, methodName: 'sign',
    args: { request: { payload_v2: { Eddsa: Buffer.from(message).toString('hex') }, path: FROM_PATH, domain_id: 1 } },
    deposit: 1n, gas: 250_000_000_000_000n,
  });
  const nearTx = signTx.transaction_outcome?.id || signTx.transaction?.hash;
  console.log(`      NEAR tx: https://testnet.nearblocks.io/txns/${nearTx}`);
  let raw = signTx.status?.SuccessValue; for (const r of signTx.receipts_outcome || []) raw = r.outcome?.status?.SuccessValue || raw;
  if (!raw) throw new Error('no signature in the signer contract reply');
  const signature = parseEddsaSignature(JSON.parse(Buffer.from(raw, 'base64').toString('utf8')));

  console.log('[5/6] Verifying the signature against the derived key');
  const okLocal = ed25519.verify(signature, message, b58decode(fromAddr));
  console.log(`      verifies: ${okLocal}`);
  if (!okLocal) throw new Error('the MPC signature does not verify against the derived key');

  console.log('[6/6] Broadcasting to Solana devnet');
  const wire = assembleTransaction(message, signature);
  const solSig = await sol('sendTransaction', [Buffer.from(wire).toString('base64'), { encoding: 'base64', preflightCommitment: 'confirmed' }]);
  let status = null;
  for (let i = 0; i < 30 && !status?.confirmationStatus; i++) { await sleep(1500); status = (await sol('getSignatureStatuses', [[solSig], { searchTransactionHistory: true }])).value[0]; }
  if (status?.err) throw new Error(`Solana rejected it: ${JSON.stringify(status.err)}`);
  const after = (await sol('getBalance', [toAddr, { commitment: 'confirmed' }])).value;
  const explorer = `https://explorer.solana.com/tx/${solSig}?cluster=devnet`;
  console.log(`      Solana signature: ${solSig}\n      status: ${status?.confirmationStatus}\n      recipient balance: ${after} lamports\n      ${explorer}`);

  const evidence = {
    ranAt: new Date().toISOString(), network: 'solana-devnet', signerContract: SIGNER, domainId: 1, scheme: 'Ed25519',
    nearAccount: env.NEAR_ACCOUNT_ID, derivationPaths: { group: FROM_PATH, recipient: TO_PATH },
    groupAddress: fromAddr, recipientAddress: toAddr, lamports: String(LAMPORTS), recentBlockhash: blockhash,
    nearSignTx: nearTx, nearSignTxUrl: `https://testnet.nearblocks.io/txns/${nearTx}`,
    signatureBase58: b58encode(signature), signatureVerifiedLocally: okLocal,
    solanaSignature: solSig, solanaStatus: status?.confirmationStatus, recipientBalanceAfter: after, explorer,
  };
  fs.writeFileSync(path.join(root, 'docs/canonical/chain-signatures-solana-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log('\nVERIFIED: a NEAR account signed a Solana transaction through the MPC network and it landed on Solana devnet.');
}

main().catch((e) => { console.error(`\nFAILED: ${e.message}`); process.exit(1); });
