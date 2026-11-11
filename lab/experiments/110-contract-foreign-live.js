import { ethers } from 'ethers';
import { ed25519 } from '@noble/curves/ed25519.js';
import { connect, deriveSubKeyPair } from '../lib/near.js';
import { b58decode, b58encode, nearKeyToSolanaAddress, buildTransferMessage, parseEddsaSignature, assembleTransaction } from '../../src/multichain/solana-transfer.js';
import { signatureFromMpc } from '../../src/multichain/evm-transfer.js';

const SIGNER = 'v1.signer-prod.testnet';
const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
// Targets the test contract m.<account> and group payroll-live-2 by default; MIDGE_RULES_PREFIX=c MIDGE_RULES_GROUP=<id> runs it against production.
const GROUP = process.env.MIDGE_RULES_GROUP || 'payroll-live-2';
const SOL_PAY = 1_000_000n; const ETH_PAY = ethers.parseEther('0.0005');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sol = async (method, params) => {
  const r = await fetch(SOLANA_RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const j = await r.json(); if (j.error) throw new Error(`${method}: ${j.error.message}`); return j.result;
};

export default {
  id: 'E-CONTRACT-FOREIGN-LIVE-01',
  title: 'The Midge contract, not a script, asks the NEAR MPC signer for foreign payments after checking the group\'s rules: Solana devnet and Ethereum Sepolia payments land, out-of-rules requests are refused',
  tier: 'testnet',
  requires: ['near-key', 'network'],
  hypothesis: 'Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. Needs the test contract m.<account> deployed (node scripts/deploy-rules-contract.mjs) and the group payroll-live-1 created and funded once (npm run verify:contract-payroll).',
  limits: [
    'One operator controls the room key (a test key, not a hosted Roost), the contract and the payees.',
    'The contract is a test deployment (m.<account>); production c.<account> is not upgraded.',
    'Money at the group\'s foreign addresses is outside the NEAR escrow, so a member\'s exit does not reach it.',
    'Solana devnet and Ethereum Sepolia only; nothing is sent on Bitcoin. The signer failing mid-request is covered by a unit test, not here.',
  ],
  async run(ctx) {
    const chain = await connect(ctx.rootDir);
    const M = chain.sub(process.env.MIDGE_RULES_PREFIX || 'm'); const CONTRACT = M.id; const master = chain.master;
    const eth = new ethers.JsonRpcProvider(SEPOLIA_RPC);
    const room = deriveSubKeyPair(chain.env.NEAR_PRIVATE_KEY, 'payroll-room');
    const TS = Date.now().toString(36);
    const derive = (domain, p, predecessor) => chain.provider.callFunction({ contractId: SIGNER, method: 'derived_public_key', args: { path: p, predecessor, domain_id: domain } });
    const evmAddr = async (p, pred) => ethers.computeAddress('0x04' + Buffer.from(b58decode((await derive(0, p, pred)).replace(/^secp256k1:/, ''))).toString('hex'));
    const view = (method, args) => chain.view(method, args, CONTRACT);
    let syn; let A = {}; let policy;

    const roomSign = (req, override = null) => {
      const r = override || req;
      const params = r.recent_blockhash ?? `${r.evm_nonce ?? 0}:${r.max_priority_fee ?? 0}:${r.max_fee ?? 0}:${r.gas_limit ?? 0}`;
      const m = `${CONTRACT}:${GROUP}:${syn.epoch}:${syn.round_nonce}:foreign:${r.obligation_id}:${r.chain}:${r.from}:${r.payee}:${r.amount}:${params}`;
      return Buffer.from(room.keyPair.sign(Buffer.from(m)).signature).toString('hex');
    };
    const ask = async (req, signedFor = null) => {
      try {
        const tx = await master.callFunctionRaw({ contractId: CONTRACT, methodName: 'request_foreign_payment', args: { syndicate_id: GROUP, attestation_nonce: syn.round_nonce, request: req, enclave_signature: roomSign(req, signedFor) }, gas: 300_000_000_000_000n });
        const nearTx = tx.transaction_outcome?.id || tx.transaction?.hash;
        let raw = tx.status?.SuccessValue; for (const r of tx.receipts_outcome || []) raw = r.outcome?.status?.SuccessValue || raw;
        const inner = raw ? JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) : null;
        if (!inner) return { ok: false, nearTx, error: JSON.stringify(tx.status?.Failure || tx.receipts_outcome?.map((r) => r.outcome.status).filter((s) => s.Failure)) };
        return { ok: true, nearTx, reply: JSON.parse(inner) };
      } catch (e) { return { ok: false, error: String(e.message ?? e).slice(0, 500) }; }
    };
    const solBal = async (a) => (await sol('getBalance', [a, { commitment: 'confirmed' }])).value;
    const spent = (c, p) => chain.view('get_foreign_spent', { syndicate_id: GROUP, chain: c, payee: p }, CONTRACT).then((x) => BigInt(x));

    await ctx.step('prediction 1: the keys are the contract\'s, and the group is funded', async (s) => {
      syn = await view('get_syndicate', { syndicate_id: GROUP });
      s.assert('the group exists on the test contract (run npm run verify:contract-payroll once if not)', !!syn, { actual: syn });
      policy = await view('get_foreign_policy', { syndicate_id: GROUP });
      s.assert('the contract holds the group\'s foreign policy', policy?.payees?.length === 2);
      const solGroup = nearKeyToSolanaAddress(await derive(1, GROUP, CONTRACT)); const solOurs = nearKeyToSolanaAddress(await derive(1, GROUP, chain.masterId));
      const evmGroup = await evmAddr(GROUP, CONTRACT); const evmOurs = await evmAddr(GROUP, chain.masterId);
      s.assert('the Solana address derived for the contract differs from the one for our own account with the same path', solGroup !== solOurs);
      s.assert('the Ethereum address derived for the contract differs from the one for our own account with the same path', evmGroup !== evmOurs);
      A = { solGroup, evmGroup, solPayee: policy.payees.find((p) => p.chain === 'solana-devnet').address, evmPayee: policy.payees.find((p) => p.chain === 'ethereum-sepolia').address };
      s.assert('the Solana group address holds enough for a payment', (await solBal(solGroup)) >= 3_000_000, { actual: await solBal(solGroup) });
      s.assert('the Ethereum group address holds enough for a payment', (await eth.getBalance(evmGroup)) >= ethers.parseEther('0.002'));
    }, { critical: true });

    let before; let solObl; let ethObl;
    await ctx.step('prediction 2: an in-rules Solana payment is requested by the contract, signed, lands, and the payee gains exactly the amount', async (s) => {
      before = { sol: await solBal(A.solPayee), spentSol: await spent('solana-devnet', A.solPayee) };
      const { value: { blockhash } } = await sol('getLatestBlockhash', [{ commitment: 'finalized' }]);
      solObl = `exp-sol-${TS}`;
      const req = { obligation_id: solObl, chain: 'solana-devnet', from: A.solGroup, payee: A.solPayee, amount: String(SOL_PAY), recent_blockhash: blockhash, evm_nonce: null, max_priority_fee: null, max_fee: null, gas_limit: null };
      const a = await ask(req);
      s.evidence('near', { nearTx: a.nearTx, ok: a.ok, error: a.error });
      s.assert('the contract accepted the room-signed request and returned a signature', a.ok, { actual: a.error });
      const msg = buildTransferMessage({ from: b58decode(A.solGroup), to: b58decode(A.solPayee), lamports: SOL_PAY, recentBlockhash: b58decode(blockhash) });
      const sig = parseEddsaSignature(a.reply);
      s.assert('the signature verifies against the contract-derived Solana key over the message rebuilt here independently', ed25519.verify(sig, msg, b58decode(A.solGroup)));
      const id = await sol('sendTransaction', [Buffer.from(assembleTransaction(msg, sig)).toString('base64'), { encoding: 'base64', preflightCommitment: 'confirmed' }]);
      let st = null; for (let i = 0; i < 40 && !st?.confirmationStatus; i++) { await sleep(1500); st = (await sol('getSignatureStatuses', [[id], { searchTransactionHistory: true }])).value[0]; }
      s.evidence('solana', { signature: id, status: st?.confirmationStatus, err: st?.err ?? null });
      s.assert('the transaction landed on Solana devnet without error', !!st?.confirmationStatus && !st?.err, { actual: st });
      s.assert('the payee gained exactly the amount', (await solBal(A.solPayee)) - before.sol === Number(SOL_PAY), { actual: (await solBal(A.solPayee)) - before.sol });
    });

    await ctx.step('prediction 3: an in-rules Ethereum payment is requested by the contract, recovers to the contract-derived address, lands', async (s) => {
      const payeeBefore = await eth.getBalance(A.evmPayee); before.spentEth = await spent('ethereum-sepolia', A.evmPayee);
      const fee = await eth.getFeeData(); const nonce = await eth.getTransactionCount(A.evmGroup, 'pending');
      const gas = await eth.estimateGas({ from: A.evmGroup, to: A.evmPayee, value: ETH_PAY }); const gasLimit = gas + gas / 5n;
      const maxFee = (fee.maxFeePerGas ?? 2_000_000_000n) * 2n; const prio = fee.maxPriorityFeePerGas ?? 1_000_000_000n;
      ethObl = `exp-eth-${TS}`;
      const req = { obligation_id: ethObl, chain: 'ethereum-sepolia', from: A.evmGroup, payee: A.evmPayee, amount: String(ETH_PAY), recent_blockhash: null, evm_nonce: nonce, max_priority_fee: String(prio), max_fee: String(maxFee), gas_limit: Number(gasLimit) };
      const b = await ask(req);
      s.evidence('near', { nearTx: b.nearTx, ok: b.ok, error: b.error });
      s.assert('the contract accepted the room-signed request and returned a signature', b.ok, { actual: b.error });
      const tx = ethers.Transaction.from({ type: 2, chainId: 11155111, nonce, to: A.evmPayee, value: ETH_PAY, gasLimit, maxFeePerGas: maxFee, maxPriorityFeePerGas: prio });
      let recovered = true; try { tx.signature = signatureFromMpc(b.reply, tx.unsignedHash, A.evmGroup); } catch { recovered = false; }
      s.assert('the signature recovers to the contract-derived Ethereum address over the digest ethers computes independently', recovered);
      const sent = await eth.broadcastTransaction(tx.serialized); const receipt = await sent.wait(1, 180_000);
      s.evidence('sepolia', { hash: sent.hash, block: receipt.blockNumber, status: receipt.status });
      s.assert('the transaction landed on Sepolia with status 1', receipt.status === 1);
      s.assert('the payee gained exactly the amount', (await eth.getBalance(A.evmPayee)) - payeeBefore === ETH_PAY);
    });

    await ctx.step('prediction 4: the contract\'s books moved by exactly what was paid, and both obligations are marked signed', async (s) => {
      s.assert('the Solana payee\'s running total rose by exactly the amount', (await spent('solana-devnet', A.solPayee)) - before.spentSol === SOL_PAY);
      s.assert('the Ethereum payee\'s running total rose by exactly the amount', (await spent('ethereum-sepolia', A.evmPayee)) - before.spentEth === ETH_PAY);
      for (const id of [solObl, ethObl]) s.assert(`obligation ${id} is recorded as signed`, (await view('get_foreign_obligation', { syndicate_id: GROUP, obligation_id: id }))?.signed === true);
    });

    await ctx.step('prediction 5: four out-of-rules requests are each refused with their own reason, and the totals do not move', async (s) => {
      const totalsBefore = [await spent('solana-devnet', A.solPayee), await spent('ethereum-sepolia', A.evmPayee)];
      const { value: { blockhash } } = await sol('getLatestBlockhash', [{ commitment: 'finalized' }]);
      const base = { obligation_id: `exp-bad-${TS}`, chain: 'solana-devnet', from: A.solGroup, payee: A.solPayee, amount: String(SOL_PAY), recent_blockhash: blockhash, evm_nonce: null, max_priority_fee: null, max_fee: null, gas_limit: null };
      const cases = [
        ['an unlisted payee', { ...base, obligation_id: `${base.obligation_id}-1`, payee: b58encode(Buffer.alloc(32, 7)) }, null, /payee is not allowed/],
        ['an amount over the per-payment cap', { ...base, obligation_id: `${base.obligation_id}-2`, amount: '2000001' }, null, /per-payment cap/],
        ['a reused obligation id', { ...base, obligation_id: solObl }, null, /already requested/],
        ['a request the room did not sign (amount changed after signing)', { ...base, obligation_id: `${base.obligation_id}-4`, amount: '1000002' }, { ...base, obligation_id: `${base.obligation_id}-4`, amount: '1000001' }, /Invalid enclave Ed25519 signature/],
      ];
      for (const [label, req, signedFor, re] of cases) {
        const r = await ask(req, signedFor);
        s.evidence('refusal', { label, nearTx: r.nearTx || null, error: (r.error || '').slice(0, 200) });
        s.assert(`refused: ${label}`, !r.ok && re.test(r.error || ''), { actual: r.error });
      }
      s.assert('the recorded totals did not move', (await spent('solana-devnet', A.solPayee)) === totalsBefore[0] && (await spent('ethereum-sepolia', A.evmPayee)) === totalsBefore[1]);
    });
  },
};
