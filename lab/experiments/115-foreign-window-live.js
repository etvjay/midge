import { ed25519 } from '@noble/curves/ed25519.js';
import { connect, deriveSubKeyPair } from '../lib/near.js';
import { b58decode, nearKeyToSolanaAddress, buildTransferMessage, assembleTransaction, parseEddsaSignature } from '../../src/multichain/solana-transfer.js';

const SIGNER = 'v1.signer-prod.testnet';
const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sol = async (method, params) => {
  const r = await fetch(SOLANA_RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const j = await r.json(); if (j.error) throw new Error(`${method}: ${j.error.message}`); return j.result;
};

export default {
  id: 'E-FOREIGN-WINDOW-LIVE-01',
  title: 'The per-window foreign running total, live: inside the window the cap holds, after the window the allowance is back, and an obligation id stays burned',
  tier: 'testnet',
  requires: ['near-key', 'network'],
  hypothesis: 'Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. A 100-block window: 1,500,000 lamports pass, a further 1,000,000 is refused, after the window the same request passes and lands, and the first obligation id is still refused.',
  limits: [
    'Runs on the test copy of the contract (same code as production, a separate account), with the shortest window the contract allows.',
    'A signer call failing mid-request is not forced here; it is covered by unit tests only.',
    'Solana devnet only; one operator controls the room key, the contract and the payee.',
  ],
  async run(ctx) {
    const chain = await connect(ctx.rootDir);
    const M = chain.sub(process.env.MIDGE_RULES_PREFIX || 'm'); const CONTRACT = M.id; const master = chain.master;
    const room = deriveSubKeyPair(chain.env.NEAR_PRIVATE_KEY, 'payroll-room');
    const roomPk = Buffer.from(room.rawPub).toString('hex');
    const tag = Date.now().toString(36); const GROUP = `win-${tag}`;
    const view = (method, args) => chain.view(method, args, CONTRACT);
    const derive = (domain, p, predecessor) => chain.provider.callFunction({ contractId: SIGNER, method: 'derived_public_key', args: { path: p, predecessor, domain_id: domain } });
    const solBal = async (a) => (await sol('getBalance', [a, { commitment: 'confirmed' }])).value;
    const spent = async (payee) => BigInt(await view('get_foreign_spent', { syndicate_id: GROUP, chain: 'solana-devnet', payee }));
    let A = {}; let syn = null;

    const roomSign = (r) => {
      const m = `${CONTRACT}:${GROUP}:${syn.epoch}:${syn.round_nonce}:foreign:${r.obligation_id}:${r.chain}:${r.from}:${r.payee}:${r.amount}:${r.recent_blockhash}`;
      return Buffer.from(room.keyPair.sign(Buffer.from(m)).signature).toString('hex');
    };
    const ask = async (obligation, amount) => {
      const { value: { blockhash } } = await sol('getLatestBlockhash', [{ commitment: 'finalized' }]);
      const req = { obligation_id: obligation, chain: 'solana-devnet', from: A.group, payee: A.payee, amount: String(amount), recent_blockhash: blockhash, evm_nonce: null, max_priority_fee: null, max_fee: null, gas_limit: null };
      try {
        const tx = await master.callFunctionRaw({ contractId: CONTRACT, methodName: 'request_foreign_payment', args: { syndicate_id: GROUP, attestation_nonce: syn.round_nonce, request: req, enclave_signature: roomSign(req) }, gas: 300_000_000_000_000n });
        const nearTx = tx.transaction_outcome?.id || tx.transaction?.hash;
        let raw = tx.status?.SuccessValue; for (const r of tx.receipts_outcome || []) raw = r.outcome?.status?.SuccessValue || raw;
        const inner = raw ? JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) : null;
        if (!inner) return { ok: false, nearTx, error: JSON.stringify(tx.status?.Failure || tx.receipts_outcome?.map((r) => r.outcome.status).filter((s) => s.Failure)) };
        return { ok: true, nearTx, reply: JSON.parse(inner), blockhash };
      } catch (e) { return { ok: false, error: String(e.message ?? e).slice(0, 500) }; }
    };
    const land = async (s, label, r, amount) => {
      const msg = buildTransferMessage({ from: b58decode(A.group), to: b58decode(A.payee), lamports: BigInt(amount), recentBlockhash: b58decode(r.blockhash) });
      const sig = parseEddsaSignature(r.reply);
      s.assert(`${label}: the signature verifies against the address derived from the group's signer path`, ed25519.verify(sig, msg, b58decode(A.group)));
      const before = await solBal(A.payee);
      const id = await sol('sendTransaction', [Buffer.from(assembleTransaction(msg, sig)).toString('base64'), { encoding: 'base64', preflightCommitment: 'confirmed' }]);
      let st = null; for (let i = 0; i < 60 && !['confirmed', 'finalized'].includes(st?.confirmationStatus); i++) { await sleep(1500); st = (await sol('getSignatureStatuses', [[id], { searchTransactionHistory: true }])).value[0]; } // wait for confirmed: a balance read at that level lags 'processed'
      s.evidence('solana', { label, signature: id, status: st?.confirmationStatus, err: st?.err ?? null, nearTx: r.nearTx });
      s.assert(`${label}: the transaction landed on Solana devnet`, !!st?.confirmationStatus && !st?.err, { actual: st });
      s.assert(`${label}: the payee gained exactly the amount`, (await solBal(A.payee)) - before === amount, { actual: (await solBal(A.payee)) - before });
    };

    await ctx.step('set up: a group with a foreign policy (one Solana payee, 2,000,000 per payment and in total, window 100 blocks), its address funded', async (s) => {
      const payee = nearKeyToSolanaAddress(await derive(1, 'midge/solana/recipient', chain.masterId));
      const policy = { payees: [{ chain: 'solana-devnet', address: payee, max_amount: '2000000', max_total: '2000000' }], max_fee_cost: '1', window_blocks: 100 };
      await M.account.callFunction({ contractId: CONTRACT, methodName: 'hatch', args: { syndicate_id: GROUP, syndicate_type: 'FLASH', quorum_threshold: 1, max_spend_near: 1, enclave_public_key: roomPk, expected_code_hash: 'window-live', timeout_blocks: 100000, payout_recipient: chain.masterId, release_policy: null }, deposit: BigInt('5000000000000000000000') });
      await M.account.callFunction({ contractId: CONTRACT, methodName: 'set_foreign_policy', args: { syndicate_id: GROUP, policy }, gas: 100_000_000_000_000n });
      syn = await view('get_syndicate', { syndicate_id: GROUP });
      const path = await view('get_foreign_path', { syndicate_id: GROUP });
      A = { payee, group: nearKeyToSolanaAddress(await derive(1, path, CONTRACT)) };
      s.assert('the group exists with its foreign policy', (await view('get_foreign_policy', { syndicate_id: GROUP }))?.window_blocks === 100);
      if ((await solBal(A.group)) < 5_000_000) {
        const old = nearKeyToSolanaAddress(await derive(1, 'midge/solana/group-1', chain.masterId));
        const { value: { blockhash } } = await sol('getLatestBlockhash', [{ commitment: 'finalized' }]);
        const msg = buildTransferMessage({ from: b58decode(old), to: b58decode(A.group), lamports: 6_000_000n, recentBlockhash: b58decode(blockhash) });
        const tx = await master.callFunctionRaw({ contractId: SIGNER, methodName: 'sign', args: { request: { payload_v2: { Eddsa: Buffer.from(msg).toString('hex') }, path: 'midge/solana/group-1', domain_id: 1 } }, deposit: 1n, gas: 250_000_000_000_000n });
        let raw = tx.status?.SuccessValue; for (const r of tx.receipts_outcome || []) raw = r.outcome?.status?.SuccessValue || raw;
        const sig = parseEddsaSignature(JSON.parse(Buffer.from(raw, 'base64').toString('utf8')));
        await sol('sendTransaction', [Buffer.from(assembleTransaction(msg, sig)).toString('base64'), { encoding: 'base64', preflightCommitment: 'confirmed' }]);
        for (let i = 0; i < 30 && (await solBal(A.group)) < 5_000_000; i++) await sleep(2000);
      }
      s.assert('the group\'s Solana address holds enough', (await solBal(A.group)) >= 5_000_000, { actual: await solBal(A.group) });
    }, { critical: true });

    let first = null;
    await ctx.step('prediction 1: inside the window 1,500,000 passes and lands, and a further 1,000,000 is refused for passing the running cap', async (s) => {
      first = await ask(`win-a-${tag}`, 1_500_000);
      s.assert('the first payment was accepted by the contract', first.ok, { actual: first.error });
      await land(s, 'first payment', first, 1_500_000);
      const refused = await ask(`win-b1-${tag}`, 1_000_000);
      s.assert('the further 1,000,000 was refused for passing the running cap in this window', !refused.ok && /running cap/.test(refused.error || ''), { actual: refused.error });
      s.assert('get_foreign_spent still reads 1,500,000', (await spent(A.payee)) === 1_500_000n, { actual: String(await spent(A.payee)) });
    }, { critical: true });

    await ctx.step('prediction 2: after 100 blocks from the first reservation the allowance is back', async (s) => {
      const ob = await view('get_foreign_obligation', { syndicate_id: GROUP, obligation_id: `win-a-${tag}` });
      const start = Number(ob.since_block);
      await chain.waitFor(async () => (await chain.blockHeight('final')) > start + 100, { what: 'the window to end', timeoutMs: 400000, everyMs: 2000 });
      s.assert('get_foreign_spent reads 0 once the window has ended', (await spent(A.payee)) === 0n, { actual: String(await spent(A.payee)) });
    });

    await ctx.step('prediction 3 and 4: the same request now passes and lands; the first obligation id is still burned', async (s) => {
      const again = await ask(`win-b2-${tag}`, 1_000_000);
      s.assert('the 1,000,000 request that was refused is accepted now', again.ok, { actual: again.error });
      await land(s, 'second payment', again, 1_000_000);
      s.assert('get_foreign_spent reads 1,000,000, not 2,500,000: the new window holds only the new reservation', (await spent(A.payee)) === 1_000_000n, { actual: String(await spent(A.payee)) });
      const reused = await ask(`win-a-${tag}`, 100_000);
      s.assert('re-sending the first obligation id is still refused', !reused.ok && /already requested/.test(reused.error || ''), { actual: reused.error });
    });

    await ctx.step('teardown: the owner removes the unfunded group', async (s) => {
      const r = await chain.send(M.account, 'prune_syndicate', { syndicate_id: GROUP }, { gas: 60000000000000n, contractId: CONTRACT, label: 'prune the test group' });
      s.assert('the group was pruned', r.ok, { actual: r.error });
    }, { always: true });
  },
};
