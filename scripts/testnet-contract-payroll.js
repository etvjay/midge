#!/usr/bin/env node
/**
 * Live multichain payroll THROUGH THE MIDGE CONTRACT (GAP-045). The contract m.<NEAR_ACCOUNT_ID> checks the room's signature and the group's
 * foreign-payment rules, builds the foreign transaction itself and asks the NEAR MPC signer to sign it (key derived from the contract and the
 * group id). This script then broadcasts the signature on Solana devnet and Ethereum Sepolia and records the refusals the contract gives to
 * out-of-rules requests. Run: npm run verify:contract-payroll. Needs .env, the contract deployed (node scripts/deploy-rules-contract.mjs).
 * Spends testnet NEAR, devnet SOL and Sepolia ETH only. First run also moves a little SOL and ETH from the old (account-derived) addresses
 * to the contract-derived ones, because the signer derives an address from whoever asks for the signature.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ethers } from 'ethers';
import { ed25519 } from '@noble/curves/ed25519.js';
import { connect } from '../lab/lib/near.js';
import { deriveSubKeyPair } from '../lab/lib/near.js';
import { b58decode, b58encode, nearKeyToSolanaAddress, buildTransferMessage, assembleTransaction, parseEddsaSignature } from '../src/multichain/solana-transfer.js';
import { signatureFromMpc } from '../src/multichain/evm-transfer.js';
import { computePolicyHash } from '../lab/lib/near.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIGNER = 'v1.signer-prod.testnet';
const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
// Defaults target the test contract m.<account>. For the production contract: MIDGE_RULES_PREFIX=c MIDGE_RULES_GROUP=<new id> MIDGE_RULES_TIMEOUT=40 MIDGE_RULES_EXIT=1.
const GROUP = process.env.MIDGE_RULES_GROUP || 'payroll-live-2';
const TIMER_BLOCKS = Number(process.env.MIDGE_RULES_TIMEOUT || 100000);
const TS = Date.now().toString(36);
const SOL_PAY = 1_000_000n; const ETH_PAY = ethers.parseEther('0.0005');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sol = async (method, params) => {
  const r = await fetch(SOLANA_RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const j = await r.json(); if (j.error) throw new Error(`${method}: ${j.error.message}`); return j.result;
};

async function main() {
  const chain = await connect(root);
  const master = chain.master; const M = chain.sub(process.env.MIDGE_RULES_PREFIX || 'm'); const CONTRACT = M.id;
  const eth = new ethers.JsonRpcProvider(SEPOLIA_RPC);
  const room = deriveSubKeyPair(chain.env.NEAR_PRIVATE_KEY, 'payroll-room');
  const roomPk = Buffer.from(room.rawPub).toString('hex');
  const derive = (domain, p, predecessor) => chain.provider.callFunction({ contractId: SIGNER, method: 'derived_public_key', args: { path: p, predecessor, domain_id: domain } });
  const evmAddr = async (p, pred) => { const k = await derive(0, p, pred); return ethers.computeAddress('0x04' + Buffer.from(b58decode(k.replace(/^secp256k1:/, ''))).toString('hex')); };
  const mpcAsMaster = async (payload, p, domain) => {
    const tx = await master.callFunctionRaw({ contractId: SIGNER, methodName: 'sign', args: { request: { payload_v2: payload, path: p, domain_id: domain } }, deposit: 1n, gas: 250_000_000_000_000n });
    let raw = tx.status?.SuccessValue; for (const r of tx.receipts_outcome || []) raw = r.outcome?.status?.SuccessValue || raw;
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  };

  console.log(`[1/7] Addresses. Contract ${CONTRACT}, group ${GROUP}; keys derive from the contract, not from our account`);
  const solGroup = nearKeyToSolanaAddress(await derive(1, GROUP, CONTRACT)); const evmGroup = await evmAddr(GROUP, CONTRACT);
  const solPayee = nearKeyToSolanaAddress(await derive(1, 'midge/solana/recipient', chain.masterId)); const evmPayee = await evmAddr('midge/evm/payee-2', chain.masterId);
  const solOld = nearKeyToSolanaAddress(await derive(1, 'midge/solana/group-1', chain.masterId)); const evmOld = await evmAddr('fly/dark-vault/epoch-1', chain.masterId);
  console.log(`      group Solana ${solGroup}\n      group Sepolia ${evmGroup}\n      payees: ${solPayee} / ${evmPayee}`);

  console.log('[2/7] Funding the contract-derived addresses from the old ones (signed as our account), if they are low');
  const solBal = async (a) => (await sol('getBalance', [a, { commitment: 'confirmed' }])).value;
  if ((await solBal(solGroup)) < 5_000_000) {
    const { value: { blockhash } } = await sol('getLatestBlockhash', [{ commitment: 'finalized' }]);
    const msg = buildTransferMessage({ from: b58decode(solOld), to: b58decode(solGroup), lamports: 20_000_000n, recentBlockhash: b58decode(blockhash) });
    const sig = parseEddsaSignature(await mpcAsMaster({ Eddsa: Buffer.from(msg).toString('hex') }, 'midge/solana/group-1', 1));
    const id = await sol('sendTransaction', [Buffer.from(assembleTransaction(msg, sig)).toString('base64'), { encoding: 'base64', preflightCommitment: 'confirmed' }]);
    for (let i = 0; i < 30 && (await solBal(solGroup)) < 5_000_000; i++) await sleep(2000);
    console.log(`      Solana funded: ${id}`);
  }
  if ((await eth.getBalance(evmGroup)) < ethers.parseEther('0.002')) {
    const fee = await eth.getFeeData(); const nonce = await eth.getTransactionCount(evmOld, 'pending');
    const gas = await eth.estimateGas({ from: evmOld, to: evmGroup, value: ethers.parseEther('0.004') });
    const tx = ethers.Transaction.from({ type: 2, chainId: 11155111, nonce, to: evmGroup, value: ethers.parseEther('0.004'), gasLimit: gas + gas / 5n, maxFeePerGas: (fee.maxFeePerGas ?? 2_000_000_000n) * 2n, maxPriorityFeePerGas: fee.maxPriorityFeePerGas ?? 1_000_000_000n });
    tx.signature = signatureFromMpc(await mpcAsMaster({ Ecdsa: tx.unsignedHash.slice(2) }, 'fly/dark-vault/epoch-1', 0), tx.unsignedHash, evmOld);
    const sent = await eth.broadcastTransaction(tx.serialized); await sent.wait(1, 180_000);
    console.log(`      Sepolia funded: ${sent.hash}`);
  }
  console.log(`      group balances: ${await solBal(solGroup)} lamports, ${ethers.formatEther(await eth.getBalance(evmGroup))} ETH`);

  console.log('[3/7] The group: hatch (room key), foreign policy, one deposit');
  let syn = await chain.view('get_syndicate', { syndicate_id: GROUP }, CONTRACT);
  const policy = { payees: [
    { chain: 'solana-devnet', address: solPayee, max_amount: '2000000', max_total: '6000000' },
    { chain: 'ethereum-sepolia', address: evmPayee, max_amount: '1000000000000000', max_total: '3000000000000000' }], max_fee_cost: '10000000000000000', window_blocks: 1000 };
  if (!syn) {
    await M.account.callFunction({ contractId: CONTRACT, methodName: 'hatch', args: { syndicate_id: GROUP, syndicate_type: 'FLASH', quorum_threshold: 1, max_spend_near: 1, enclave_public_key: roomPk, expected_code_hash: 'rules-contract-live', timeout_blocks: TIMER_BLOCKS, payout_recipient: chain.masterId, release_policy: null }, deposit: BigInt('5000000000000000000000') });
    await M.account.callFunction({ contractId: CONTRACT, methodName: 'set_foreign_policy', args: { syndicate_id: GROUP, policy }, gas: 100_000_000_000_000n });
    const h = await chain.view('get_policy_hash', { syndicate_id: GROUP }, CONTRACT);
    await master.callFunction({ contractId: CONTRACT, methodName: 'deposit', args: { syndicate_id: GROUP, policy_hash: h }, deposit: BigInt('100000000000000000000000'), gas: 100_000_000_000_000n });
    syn = await chain.view('get_syndicate', { syndicate_id: GROUP }, CONTRACT);
  }
  console.log(`      group ${syn.id}, status ${syn.status}, escrow ${syn.total_escrow}, round nonce ${syn.round_nonce}`);

  const roomSign = (req) => {
    const params = req.recent_blockhash ?? `${req.evm_nonce ?? 0}:${req.max_priority_fee ?? 0}:${req.max_fee ?? 0}:${req.gas_limit ?? 0}`;
    const m = `${CONTRACT}:${GROUP}:${syn.epoch}:${syn.round_nonce}:foreign:${req.obligation_id}:${req.chain}:${req.from}:${req.payee}:${req.amount}:${params}`;
    return Buffer.from(room.keyPair.sign(Buffer.from(m)).signature).toString('hex');
  };
  const ask = async (req) => {
    try {
      const tx = await master.callFunctionRaw({ contractId: CONTRACT, methodName: 'request_foreign_payment', args: { syndicate_id: GROUP, attestation_nonce: syn.round_nonce, request: req, enclave_signature: roomSign(req) }, gas: 300_000_000_000_000n });
      const nearTx = tx.transaction_outcome?.id || tx.transaction?.hash;
      let raw = tx.status?.SuccessValue; for (const r of tx.receipts_outcome || []) raw = r.outcome?.status?.SuccessValue || raw;
      const inner = raw ? JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) : null;
      if (!inner) { const fail = JSON.stringify(tx.status?.Failure || tx.receipts_outcome?.map((r) => r.outcome.status).filter((s) => s.Failure)); return { ok: false, nearTx, error: fail }; }
      return { ok: true, nearTx, reply: JSON.parse(inner) };
    } catch (e) { return { ok: false, error: String(e.message ?? e).slice(0, 400) }; }
  };

  console.log('[4/7] Payment 1, Solana devnet: the contract asks the signer');
  const { value: { blockhash } } = await sol('getLatestBlockhash', [{ commitment: 'finalized' }]);
  const reqSol = { obligation_id: `sol-${TS}`, chain: 'solana-devnet', from: solGroup, payee: solPayee, amount: String(SOL_PAY), recent_blockhash: blockhash, evm_nonce: null, max_priority_fee: null, max_fee: null, gas_limit: null };
  const a = await ask(reqSol); if (!a.ok) throw new Error(`the contract refused an in-rules Solana payment: ${a.error}`);
  const msg = buildTransferMessage({ from: b58decode(solGroup), to: b58decode(solPayee), lamports: SOL_PAY, recentBlockhash: b58decode(blockhash) });
  const sig = parseEddsaSignature(a.reply);
  if (!ed25519.verify(sig, msg, b58decode(solGroup))) throw new Error('the signature does not verify for the contract-derived Solana key');
  const solTx = await sol('sendTransaction', [Buffer.from(assembleTransaction(msg, sig)).toString('base64'), { encoding: 'base64', preflightCommitment: 'confirmed' }]);
  let st = null; for (let i = 0; i < 30 && !st?.confirmationStatus; i++) { await sleep(1500); st = (await sol('getSignatureStatuses', [[solTx], { searchTransactionHistory: true }])).value[0]; }
  if (st?.err) throw new Error(`Solana rejected it: ${JSON.stringify(st.err)}`);
  console.log(`      NEAR tx ${a.nearTx}\n      Solana ${st?.confirmationStatus} ${solTx}`);

  console.log('[5/7] Payment 2, Ethereum Sepolia: the contract asks the signer');
  const fee = await eth.getFeeData(); const nonce = await eth.getTransactionCount(evmGroup, 'pending');
  const gas = await eth.estimateGas({ from: evmGroup, to: evmPayee, value: ETH_PAY }); const gasLimit = gas + gas / 5n; const maxFee = (fee.maxFeePerGas ?? 2_000_000_000n) * 2n; const prio = fee.maxPriorityFeePerGas ?? 1_000_000_000n;
  const reqEvm = { obligation_id: `eth-${TS}`, chain: 'ethereum-sepolia', from: evmGroup, payee: evmPayee, amount: String(ETH_PAY), recent_blockhash: null, evm_nonce: nonce, max_priority_fee: String(prio), max_fee: String(maxFee), gas_limit: Number(gasLimit) };
  const b = await ask(reqEvm); if (!b.ok) throw new Error(`the contract refused an in-rules Ethereum payment: ${b.error}`);
  const etx = ethers.Transaction.from({ type: 2, chainId: 11155111, nonce, to: evmPayee, value: ETH_PAY, gasLimit, maxFeePerGas: maxFee, maxPriorityFeePerGas: prio });
  etx.signature = signatureFromMpc(b.reply, etx.unsignedHash, evmGroup); // throws unless the digest the contract built recovers to the contract-derived address
  const sent = await eth.broadcastTransaction(etx.serialized); const receipt = await sent.wait(1, 180_000);
  if (receipt.status !== 1) throw new Error('the Sepolia transaction failed');
  console.log(`      NEAR tx ${b.nearTx}\n      Sepolia block ${receipt.blockNumber} ${sent.hash}`);

  console.log('[6/7] Refusals: the contract must say no');
  const randomSol = b58encode(Buffer.alloc(32, 7));
  const refusals = [];
  for (const [label, req, expect] of [
    ['payee not in the foreign policy', { ...reqSol, obligation_id: `bad1-${TS}`, payee: randomSol }, /payee is not allowed/],
    ['amount over the per-payment cap', { ...reqSol, obligation_id: `bad2-${TS}`, amount: '2000001' }, /per-payment cap/],
    ['an obligation already requested', { ...reqSol, recent_blockhash: blockhash }, /already requested/],
  ]) {
    const r = await ask(req); const text = r.error || '';
    const refused = !r.ok && expect.test(text);
    refusals.push({ label, refused, nearTx: r.nearTx || null, error: text.slice(0, 200) });
    console.log(`      ${refused ? 'REFUSED' : 'NOT REFUSED AS EXPECTED'}: ${label}`);
  }
  if (refusals.some((x) => !x.refused)) throw new Error(`a refusal did not happen as expected: ${JSON.stringify(refusals)}`);

  console.log('[7/7] Receipt');
  const spent = { solana: await chain.view('get_foreign_spent', { syndicate_id: GROUP, chain: 'solana-devnet', payee: solPayee }, CONTRACT), sepolia: await chain.view('get_foreign_spent', { syndicate_id: GROUP, chain: 'ethereum-sepolia', payee: evmPayee }, CONTRACT) };
  const evidence = {
    ranAt: new Date().toISOString(), contract: CONTRACT, group: GROUP, signerContract: SIGNER, predecessor: CONTRACT,
    codeHash: (await chain.provider.query({ request_type: 'view_code', finality: 'final', account_id: CONTRACT })).hash,
    foreignPolicy: policy, addresses: { solanaGroup: solGroup, sepoliaGroup: evmGroup, solanaPayee: solPayee, sepoliaPayee: evmPayee },
    payments: [
      { chain: 'solana-devnet', obligation: reqSol.obligation_id, nearTx: a.nearTx, nearTxUrl: `https://testnet.nearblocks.io/txns/${a.nearTx}`, chainTx: solTx, status: st?.confirmationStatus, url: `https://explorer.solana.com/tx/${solTx}?cluster=devnet` },
      { chain: 'ethereum-sepolia', obligation: reqEvm.obligation_id, nearTx: b.nearTx, nearTxUrl: `https://testnet.nearblocks.io/txns/${b.nearTx}`, chainTx: sent.hash, status: 'confirmed', block: receipt.blockNumber, url: `https://sepolia.etherscan.io/tx/${sent.hash}` },
    ],
    refusals, reservedByContract: spent,
  };
  if (process.env.MIDGE_RULES_EXIT === '1') {
    const st = await chain.view('get_syndicate', { syndicate_id: GROUP }, CONTRACT); const start = Number(st.epoch_start_block);
    await chain.waitFor(async () => (await chain.blockHeight('final')) - start >= TIMER_BLOCKS + 2, { what: 'the exit timer', timeoutMs: 180000 });
    const ex = await chain.send(master, 'hatch_out', { syndicate_id: GROUP }, { gas: 60000000000000n, label: 'exit', contractId: CONTRACT });
    console.log(`      the deposit was taken back: exit ${ex.ok ? 'ok' : 'FAILED ' + ex.error}`);
  }
  fs.writeFileSync(path.join(root, process.env.MIDGE_RULES_EVIDENCE || 'docs/canonical/contract-payroll-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log('\nVERIFIED: the Midge contract checked the group\'s rules, asked the MPC signer for two foreign payments and refused three out-of-rules requests.');
}

main().catch((e) => { console.error(`\nFAILED: ${e.message}`); process.exit(1); });
