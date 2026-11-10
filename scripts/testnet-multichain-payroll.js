#!/usr/bin/env node
/**
 * Live multichain payroll: one pay run, signed for our own NEAR account (NOT by the Midge contract, so a group's rules do not limit it), paying one payee on Solana devnet and one on Ethereum
 * Sepolia. Each payment is a real transaction on its chain, signed by NEAR's MPC network (Chain Signatures: domain 1 Ed25519 for
 * Solana, domain 0 secp256k1 for Ethereum), verified locally, broadcast and confirmed. Writes a receipt file with the plan's hash.
 * Run: npm run verify:payroll. Needs .env (NEAR_ACCOUNT_ID, NEAR_PRIVATE_KEY) and the derived group addresses funded on the testnets
 * (the run says which). Spends testnet NEAR (2 yocto + gas), devnet SOL and Sepolia ETH only.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner } from 'near-api-js';
import { ethers } from 'ethers';
import { ed25519 } from '@noble/curves/ed25519.js';
import { b58decode, b58encode, nearKeyToSolanaAddress, buildTransferMessage, assembleTransaction, parseEddsaSignature } from '../src/multichain/solana-transfer.js';
import { signatureFromMpc } from '../src/multichain/evm-transfer.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIGNER = 'v1.signer-prod.testnet';
const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
const SOL_FROM = 'midge/solana/group-1'; const SOL_TO = 'midge/solana/recipient';
const EVM_FROM = 'fly/dark-vault/epoch-1'; const EVM_TO = 'midge/evm/payee-2';
const SOL_PAY = 1_000_000n; // 0.001 SOL
const ETH_PAY = ethers.parseEther('0.0005');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadEnv() {
  const env = {};
  for (const line of fs.readFileSync(path.join(root, '.env'), 'utf8').split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#') || !t.includes('=')) continue;
    env[t.slice(0, t.indexOf('=')).trim()] = t.slice(t.indexOf('=') + 1).trim();
  }
  return env;
}
const sol = async (method, params) => {
  const r = await fetch(SOLANA_RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const j = await r.json(); if (j.error) throw new Error(`${method}: ${j.error.message}`); return j.result;
};

async function main() {
  const env = loadEnv();
  if (!env.NEAR_ACCOUNT_ID || !env.NEAR_PRIVATE_KEY) throw new Error('Missing NEAR_ACCOUNT_ID or NEAR_PRIVATE_KEY in .env');
  const near = new JsonRpcProvider({ url: process.env.NEAR_RPC_URL || 'https://test.rpc.fastnear.com' });
  const account = new Account(env.NEAR_ACCOUNT_ID, near, new KeyPairSigner(KeyPair.fromString(env.NEAR_PRIVATE_KEY)));
  const eth = new ethers.JsonRpcProvider(SEPOLIA_RPC);
  const view = (domain, p) => near.callFunction({ contractId: SIGNER, method: 'derived_public_key', args: { path: p, predecessor: env.NEAR_ACCOUNT_ID, domain_id: domain } });
  const mpcSign = async (payload, p, domain) => {
    const tx = await account.callFunctionRaw({ contractId: SIGNER, methodName: 'sign', args: { request: { payload_v2: payload, path: p, domain_id: domain } }, deposit: 1n, gas: 250_000_000_000_000n });
    let raw = tx.status?.SuccessValue; for (const r of tx.receipts_outcome || []) raw = r.outcome?.status?.SuccessValue || raw;
    if (!raw) throw new Error('no signature in the signer contract reply');
    return { reply: JSON.parse(Buffer.from(raw, 'base64').toString('utf8')), nearTx: tx.transaction_outcome?.id || tx.transaction?.hash };
  };

  console.log('[1/4] The pay run: derived addresses (the group pays from these; the payees receive)');
  const solFrom = nearKeyToSolanaAddress(await view(1, SOL_FROM)); const solTo = nearKeyToSolanaAddress(await view(1, SOL_TO));
  const evmKey = async (p) => { const k = await view(0, p); const b = Buffer.from(b58decode(k.replace(/^secp256k1:/, ''))); return ethers.computeAddress('0x04' + b.toString('hex')); };
  const evmFrom = await evmKey(EVM_FROM); const evmTo = await evmKey(EVM_TO);
  const plan = [
    { payee: 'payee-solana', chain: 'solana-devnet', from: solFrom, to: solTo, amount: `${SOL_PAY} lamports` },
    { payee: 'payee-evm', chain: 'ethereum-sepolia', from: evmFrom, to: evmTo, amount: `${ETH_PAY} wei` },
  ];
  const planHash = crypto.createHash('sha256').update(JSON.stringify(plan)).digest('hex');
  console.table(plan); console.log(`      plan hash: ${planHash}`);
  const solBal = (await sol('getBalance', [solFrom, { commitment: 'confirmed' }])).value; const ethBal = await eth.getBalance(evmFrom);
  console.log(`      group balances: ${solBal} lamports on Solana devnet, ${ethers.formatEther(ethBal)} ETH on Sepolia`);
  if (solBal < 5_000_000) throw new Error(`fund ${solFrom} with devnet SOL first`);
  if (ethBal < ETH_PAY * 2n) throw new Error(`fund ${evmFrom} with Sepolia ETH first`);

  console.log('[2/4] Payee 1 on Solana devnet: sign (Ed25519), verify, broadcast');
  const { value: { blockhash } } = await sol('getLatestBlockhash', [{ commitment: 'finalized' }]);
  const message = buildTransferMessage({ from: b58decode(solFrom), to: b58decode(solTo), lamports: SOL_PAY, recentBlockhash: b58decode(blockhash) });
  const s1 = await mpcSign({ Eddsa: Buffer.from(message).toString('hex') }, SOL_FROM, 1);
  const solSig = parseEddsaSignature(s1.reply);
  if (!ed25519.verify(solSig, message, b58decode(solFrom))) throw new Error('the Solana signature does not verify');
  const solTxId = await sol('sendTransaction', [Buffer.from(assembleTransaction(message, solSig)).toString('base64'), { encoding: 'base64', preflightCommitment: 'confirmed' }]);
  let st = null; for (let i = 0; i < 30 && !st?.confirmationStatus; i++) { await sleep(1500); st = (await sol('getSignatureStatuses', [[solTxId], { searchTransactionHistory: true }])).value[0]; }
  if (st?.err) throw new Error(`Solana rejected it: ${JSON.stringify(st.err)}`);
  console.log(`      NEAR sign tx: https://testnet.nearblocks.io/txns/${s1.nearTx}\n      Solana: ${st?.confirmationStatus} https://explorer.solana.com/tx/${solTxId}?cluster=devnet`);

  console.log('[3/4] Payee 2 on Ethereum Sepolia: sign (secp256k1), verify, broadcast');
  const fee = await eth.getFeeData(); const nonce = await eth.getTransactionCount(evmFrom, 'pending');
  // A transfer to an existing account costs 21000 gas; the first value sent to a never-used address costs about 207000 on Sepolia (account creation was repriced),
  // so the limit comes from the node's estimate, with a cap that would catch a recipient that runs real code.
  const gas = await eth.estimateGas({ from: evmFrom, to: evmTo, value: ETH_PAY });
  if (gas > 500_000n) throw new Error(`a plain transfer to ${evmTo} needs ${gas} gas: it may run code, pick another payee address`);
  console.log(`      estimated gas: ${gas}`);
  const tx = ethers.Transaction.from({ type: 2, chainId: 11155111, nonce, to: evmTo, value: ETH_PAY, gasLimit: gas + gas / 5n, maxFeePerGas: (fee.maxFeePerGas ?? 2_000_000_000n) * 2n, maxPriorityFeePerGas: fee.maxPriorityFeePerGas ?? 1_000_000_000n });
  const digest = tx.unsignedHash;
  const s2 = await mpcSign({ Ecdsa: digest.slice(2) }, EVM_FROM, 0);
  tx.signature = signatureFromMpc(s2.reply, digest, evmFrom); // throws unless it recovers to the group's address
  const sent = await eth.broadcastTransaction(tx.serialized); const receipt = await sent.wait(1, 180_000);
  console.log(`      NEAR sign tx: https://testnet.nearblocks.io/txns/${s2.nearTx}\n      Sepolia: block ${receipt.blockNumber} https://sepolia.etherscan.io/tx/${sent.hash}`);

  console.log('[4/4] Receipt');
  const payeeBalances = { solanaLamports: (await sol('getBalance', [solTo, { commitment: 'confirmed' }])).value, sepoliaWei: (await eth.getBalance(evmTo)).toString() };
  const evidence = {
    ranAt: new Date().toISOString(), nearAccount: env.NEAR_ACCOUNT_ID, signerContract: SIGNER, planHash, plan,
    payments: [
      { payee: 'payee-solana', chain: 'solana-devnet', nearSignTx: s1.nearTx, nearSignTxUrl: `https://testnet.nearblocks.io/txns/${s1.nearTx}`, chainTx: solTxId, status: st?.confirmationStatus, url: `https://explorer.solana.com/tx/${solTxId}?cluster=devnet` },
      { payee: 'payee-evm', chain: 'ethereum-sepolia', nearSignTx: s2.nearTx, nearSignTxUrl: `https://testnet.nearblocks.io/txns/${s2.nearTx}`, chainTx: sent.hash, status: receipt.status === 1 ? 'confirmed' : 'failed', block: receipt.blockNumber, url: `https://sepolia.etherscan.io/tx/${sent.hash}` },
    ],
    payeeBalancesAfter: payeeBalances,
  };
  if (receipt.status !== 1) throw new Error('the Sepolia transaction failed');
  fs.writeFileSync(path.join(root, 'docs/canonical/multichain-payroll-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`      payee balances: ${payeeBalances.solanaLamports} lamports (Solana), ${payeeBalances.sepoliaWei} wei (Sepolia)`);
  console.log('\nVERIFIED: one NEAR-authorised pay run paid two payees on two other chains, each by an MPC-signed transaction that landed.');
}

main().catch((e) => { console.error(`\nFAILED: ${e.message}`); process.exit(1); });
