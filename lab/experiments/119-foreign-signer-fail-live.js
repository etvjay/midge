import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ed25519 } from '@noble/curves/ed25519.js';
import { base58Encode } from '../../src/roost-service/signed-input.js';
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
  id: 'E-FOREIGN-SIGNER-FAIL-LIVE-01',
  title: 'A signer call that fails mid-request, live: the reservation and the obligation are released, the same obligation id works again with the real signer',
  tier: 'testnet',
  requires: ['near-key', 'network'],
  hypothesis: 'Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. Runs on the TEST copy of the contract deployed with the test-signer-override feature build. Pointing the signer at an account that does not exist makes the cross-contract call fail; the callback releases the reservation; the same obligation id is accepted again with the real signer and its signature verifies.',
  limits: [
    'Runs on the TEST copy of the contract deployed with a feature build (test-signer-override) that production does not contain; it shows the contract\'s behaviour when a cross-contract call fails, not the real MPC network failing.',
    'The Solana path only; the Ethereum path shares the same callback. A failure arriving after the window has rolled is covered by unit tests.',
    'One operator controls the room key, the contract and the payee.',
  ],
  async run(ctx) {
    const chain = await connect(ctx.rootDir);
    const M = chain.sub(process.env.MIDGE_RULES_PREFIX || 'm'); const CONTRACT = M.id; const master = chain.master;
    const room = deriveSubKeyPair(chain.env.NEAR_PRIVATE_KEY, 'payroll-room');
    const roomPk = Buffer.from(room.rawPub).toString('hex');
    const tag = Date.now().toString(36); const GROUP = `sf-${tag}`;
    const view = (method, args) => chain.view(method, args, CONTRACT);
    const derive = (domain, p, predecessor) => chain.provider.callFunction({ contractId: SIGNER, method: 'derived_public_key', args: { path: p, predecessor, domain_id: domain } });
    const solBal = async (a) => (await sol('getBalance', [a, { commitment: 'confirmed' }])).value;
    const spent = async (payee) => BigInt(await view('get_foreign_spent', { syndicate_id: GROUP, chain: 'solana-devnet', payee }));
    let A = {}; let syn = null;

    // The experiment brings its own contract build and puts the default one back: the test copy is only ever on the feature build while this runs.
    const FEATURE_WASM = process.env.MIDGE_SIGNER_WASM || path.join(ctx.rootDir, 'contracts/fly-coordinator/target-testsigner/wasm32-unknown-unknown/release/fly_coordinator.wasm');
    const DEFAULT_WASM = path.join(ctx.rootDir, 'contracts/fly-coordinator/target/wasm32-unknown-unknown/release/fly_coordinator.wasm');
    const codeHashOf = async () => (await chain.provider.query({ request_type: 'view_code', finality: 'final', account_id: CONTRACT })).hash;
    const hashFile = (f) => base58Encode(crypto.createHash('sha256').update(fs.readFileSync(f)).digest());
    const deploy = async (file) => {
      const h = hashFile(file);
      if ((await codeHashOf()) !== h) { await M.account.deployContract(fs.readFileSync(file)); await chain.waitFor(async () => (await codeHashOf()) === h, { what: 'the new code on chain', timeoutMs: 90000 }); }
      return h;
    };
    await ctx.step('set up: the test copy runs the test-signer-override build (the default build is put back at the end)', async (s) => {
      s.assert('the feature build exists (build it with: npm run build:wasm:testsigner)', fs.existsSync(FEATURE_WASM) && fs.existsSync(DEFAULT_WASM), { actual: [FEATURE_WASM, DEFAULT_WASM].map((f) => fs.existsSync(f)) });
      s.assert('the feature build is not the production build', hashFile(FEATURE_WASM) !== hashFile(DEFAULT_WASM));
      const h = await deploy(FEATURE_WASM);
      s.evidence('deploy', { account: CONTRACT, featureBuild: h, defaultBuild: hashFile(DEFAULT_WASM) });
      s.assert('the test copy has get_test_signer and no override is set', (await view('get_test_signer', {})) === null);
    }, { critical: true });

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
    }, { critical: true });

    const OBL = `sf-a-${tag}`;
    const startState = async () => ({ ob: await view('get_foreign_obligation', { syndicate_id: GROUP, obligation_id: OBL }), spent: await spent(A.payee) });
    await ctx.step('prediction 1: only the contract\'s own account may point the signer elsewhere', async (s) => {
      const bad = await chain.send(master, 'set_test_signer', { account: `nosigner-${tag}.${chain.masterId}` }, { contractId: CONTRACT, gas: 30000000000000n, label: 'set_test_signer from the main account' });
      s.evidence('tx', { label: bad.label, hash: bad.hash, ok: bad.ok, error: bad.error });
      s.assert('a call from our main account is refused', !bad.ok && /only the contract's own account/.test(bad.error || ''), { actual: bad.error });
      s.assert('nothing was set', (await view('get_test_signer', {})) === null);
      const good = await chain.send(M.account, 'set_test_signer', { account: `nosigner-${tag}.${chain.masterId}` }, { contractId: CONTRACT, gas: 30000000000000n, label: 'set_test_signer from the contract itself' });
      s.assert('a call from the contract\'s own account is accepted', good.ok, { actual: good.error });
      s.assert('the signer now points at an account that does not exist', (await view('get_test_signer', {})) === `nosigner-${tag}.${chain.masterId}`);
    }, { critical: true });

    await ctx.step('prediction 2: a failing signer releases the reservation and the obligation', async (s) => {
      const before = await startState();
      s.assert('before: nothing is reserved and the obligation does not exist', before.ob === null && before.spent === 0n);
      const r = await ask(OBL, 2_000_000);
      s.evidence('near', { nearTx: r.nearTx, ok: r.ok, error: r.error });
      s.assert('the request\'s final result carries no signature (the signer call failed)', r.ok === false && !r.reply, { actual: r.error });
      await chain.waitFor(async () => (await view('get_foreign_obligation', { syndicate_id: GROUP, obligation_id: OBL })) === null, { what: 'the callback to release the obligation', timeoutMs: 60000 });
      const after = await startState();
      s.assert('after the callback: the obligation is gone', after.ob === null);
      s.assert('after the callback: the reserved total is back to 0', after.spent === 0n, { actual: String(after.spent) });
    }, { critical: true });

    await ctx.step('prediction 3: with the real signer the same obligation id is accepted again, and its signature verifies', async (s) => {
      const back = await chain.send(M.account, 'set_test_signer', { account: SIGNER }, { contractId: CONTRACT, gas: 30000000000000n, label: 'set_test_signer back to the real signer' });
      s.assert('the signer was pointed back at the real one', back.ok, { actual: back.error });
      const again = await ask(OBL, 2_000_000);
      s.evidence('near', { nearTx: again.nearTx, ok: again.ok, error: again.error });
      s.assert('the same obligation id for the same 2,000,000 was accepted (it would be refused if the failed reservation had leaked or the id had been burned)', again.ok, { actual: again.error });
      const msg = buildTransferMessage({ from: b58decode(A.group), to: b58decode(A.payee), lamports: 2_000_000n, recentBlockhash: b58decode(again.blockhash) });
      s.assert('its signature verifies against the address derived from the group\'s signer path', ed25519.verify(parseEddsaSignature(again.reply), msg, b58decode(A.group)));
      const st = await startState();
      s.assert('the obligation is recorded and signed, and 2,000,000 is reserved', st.ob?.signed === true && st.spent === 2_000_000n, { actual: [st.ob, String(st.spent)] });
    });

    await ctx.step('teardown: the default build is put back on the test copy', async (s) => {
      const h = await deploy(DEFAULT_WASM);
      s.assert('the test copy runs the default build again', (await codeHashOf()) === h && h === hashFile(DEFAULT_WASM));
      let gone = false; try { await view('get_test_signer', {}); } catch { gone = true; }
      s.assert('and the test method is gone', gone);
    }, { always: true });

    await ctx.step('teardown: the owner removes the unfunded group', async (s) => {
      const r = await chain.send(M.account, 'prune_syndicate', { syndicate_id: GROUP }, { gas: 60000000000000n, contractId: CONTRACT, label: 'prune the test group' });
      s.assert('the group was pruned', r.ok, { actual: r.error });
    }, { always: true });
  },
};
