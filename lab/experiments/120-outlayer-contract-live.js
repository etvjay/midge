import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { connect, near, computePolicyHash } from '../lib/near.js';
import { createMembers, teardownMembers } from '../lib/members.js';
import { computeAllocationsHash } from '../../src/roost-service/hosted-roost.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto2 from 'node:crypto';
import { base58Encode } from '../../src/roost-service/signed-input.js';

const toN = (x) => near(String(x));

export default {
  id: 'E-OUTLAYER-CONTRACT-01',
  title: 'A NEAR contract triggers an OutLayer program and its callback receives the output; the signature it returns settles a Midge group on the production contract',
  tier: 'live-external',
  requires: ['near-key', 'network'],
  hypothesis: 'Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. A caller contract deployed on the throwaway account makes every OutLayer call; only its owner may; the callback stores the output; a signature obtained that way is accepted by the production contract and pays exactly.',
  limits: [
    'The caller is a small purpose-built contract; the Midge contract itself does not call OutLayer, so the signature is presented to Midge by an account.',
    'OutLayer\'s on-chain call path failed intermittently in the earlier experiment (cause unknown), so calls are retried up to three times and the attempt count is recorded.',
    'This run does not verify the worker\'s TDX quote. OutLayer is a third-party platform. Testnet only.',
  ],
  async run(ctx) {
    const chain = await connect(ctx.rootDir);
    const coord = chain.sub('c');
    const OL_ACCOUNT = `ol.${chain.masterId}`; const PROJECT = `${OL_ACCOUNT}/midge-room-signer`;
    const tag = Date.now().toString(36); const id = `oc-${tag}`;
    const state = () => chain.view('get_syndicate', { syndicate_id: id });
    const created = []; let P = null; let countBefore = null;

    // Every OutLayer call goes through the caller CONTRACT on the throwaway account: its owner-only `request` calls request_execution on outlayer.testnet and its
    // callback stores the output. A call is retried up to three times (OutLayer's testnet path failed intermittently in an earlier experiment); attempts are recorded.
    const olAccount = chain.sub('ol').account;
    const resultsCount = async () => Number(await chain.view('get_results', {}, OL_ACCOUNT));
    const runOnce = async (input) => {
      const before = await resultsCount();
      let tx = null; let err = null;
      try { tx = await olAccount.callFunctionRaw({ contractId: OL_ACCOUNT, methodName: 'request', args: { input_json: JSON.stringify(input) }, deposit: near('0.01'), gas: 300_000_000_000_000n }); } catch (e) { err = String(e.message ?? e).slice(0, 300); }
      const hash = tx?.transaction_outcome?.id || tx?.transaction?.hash || null;
      let json = null; let stderr = err || '';
      for (let i = 0; i < 60 && !json && !err; i += 1) {
        if ((await resultsCount()) > before) { try { json = JSON.parse(await chain.view('get_last', {}, OL_ACCOUNT)); } catch { stderr = 'the callback stored something that is not JSON'; } break; }
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (json && json.ok === false && json.error === 'the OutLayer call failed') { stderr = 'the callback recorded that the OutLayer call failed'; json = null; }
      return { status: 0, tx: hash, json, bytes: json ? JSON.stringify(json).length : 0, stderr };
    };
    const runOL = async (input) => {
      let last = null;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        last = await runOnce(input); last.attempts = attempt;
        if (last.json) return last;
        await new Promise((r) => setTimeout(r, 4000));
      }
      return last;
    };

    await ctx.step('prediction 1: the caller contract is deployed on the throwaway account, owner-only, and needs a deposit', async (s) => {
      const wasm = fs.readFileSync(path.join(ctx.rootDir, 'outlayer/caller/target/wasm32-unknown-unknown/release/midge_outlayer_caller.wasm'));
      const hash = base58Encode(crypto2.createHash('sha256').update(wasm).digest());
      let owner = null; try { owner = await chain.view('get_owner', {}, OL_ACCOUNT); } catch { /* not deployed yet */ }
      const current = (await chain.provider.query({ request_type: 'view_code', finality: 'final', account_id: OL_ACCOUNT }).catch(() => ({ hash: null }))).hash;
      if (current !== hash) {
        await olAccount.deployContract(wasm); // first deploy, or the build in this repository changed
        await chain.waitFor(async () => (await chain.provider.query({ request_type: 'view_code', finality: 'final', account_id: OL_ACCOUNT })).hash === hash, { what: 'the new code on chain', timeoutMs: 90000 });
      }
      if (owner === null) await olAccount.callFunction({ contractId: OL_ACCOUNT, methodName: 'new', args: { project_id: PROJECT, owner: OL_ACCOUNT }, gas: 30_000_000_000_000n });
      const onChain = (await chain.provider.query({ request_type: 'view_code', finality: 'final', account_id: OL_ACCOUNT })).hash;
      s.evidence('caller', { account: OL_ACCOUNT, codeHash: onChain, localBuild: hash, bytes: wasm.length });
      s.assert('the caller contract on the throwaway account is the build in this repository', onChain === hash, { actual: [onChain, hash] });
      s.assert('its owner is the throwaway account and it points at the midge-room-signer project', (await chain.view('get_owner', {}, OL_ACCOUNT)) === OL_ACCOUNT && (await chain.view('get_project', {}, OL_ACCOUNT)) === PROJECT);
      const stranger = await chain.send(chain.master, 'request', { input_json: '{"op":"pubkey"}' }, { contractId: OL_ACCOUNT, deposit: near('0.01'), gas: 100_000_000_000_000n, label: 'request from the main account' });
      s.evidence('tx', { label: stranger.label, hash: stranger.hash, ok: stranger.ok, error: stranger.error });
      s.assert('a request from an account that is not the owner is refused', !stranger.ok && /only the owner/.test(stranger.error || ''), { actual: stranger.error });
      const poor = await chain.send(olAccount, 'request', { input_json: '{"op":"pubkey"}' }, { contractId: OL_ACCOUNT, deposit: near('0.001'), gas: 100_000_000_000_000n, label: 'request with too little deposit' });
      s.assert('a request with less than 0.003 NEAR attached is refused', !poor.ok && /attach at least/.test(poor.error || ''), { actual: poor.error });
    }, { critical: true });

    let pubkey = null;
    await ctx.step('prediction 2: the contract calls OutLayer twice and its callback receives the same Ed25519 public key both times', async (s) => {
      const a = await runOL({ op: 'pubkey' }); const b = await runOL({ op: 'pubkey' });
      s.evidence('outlayer', { txA: a.tx, txB: b.tx, attemptsA: a.attempts, attemptsB: b.attempts });
      s.assert('both runs succeeded', a.json?.ok === true && b.json?.ok === true, { actual: [a.json, a.stderr] });
      s.assert('the key is 32 bytes of hex', /^[0-9a-f]{64}$/.test(a.json?.public_key || ''), { actual: a.json });
      s.assert('the two runs report the same key', a.json?.public_key === b.json?.public_key);
      s.assert('the results are under 900 bytes', a.bytes < 900 && b.bytes < 900, { actual: [a.bytes, b.bytes] });
      pubkey = a.json.public_key;
    }, { critical: true });

    try {
      await ctx.step('set up: a depositor, a recipient, and a group on the production contract whose room key is the OutLayer program\'s key', async (s) => {
        countBefore = Number(await chain.view('get_syndicate_count', {}));
        const made = await createMembers(chain, { rootDir: ctx.rootDir, tag: `ol${tag.slice(-5)}`, count: 2, fundNear: '0.2', names: ['dp', 'rc'] });
        P = { dp: made[0], rc: made[1], all: made };
        created.push(id);
        const pol = { allowed_recipients: [P.rc.id], max_release_bps_per_epoch: 10000, settle_deadline_block: 500000000 };
        const h = await chain.send(coord.account, 'hatch', { syndicate_id: id, syndicate_type: 'FLASH', quorum_threshold: 1, max_spend_near: 1, enclave_public_key: pubkey, expected_code_hash: crypto.randomBytes(32).toString('hex'), timeout_blocks: 12, payout_recipient: P.rc.id, release_policy: pol }, { deposit: near('0.01'), gas: 40000000000000n, label: `hatch ${id}` });
        s.assert('the group was hatched with the OutLayer key as its room key', h.ok, { actual: h.error });
        await chain.waitFor(() => state(), { what: 'group' });
        const d = await chain.send(P.dp.account, 'deposit', { syndicate_id: id, policy_hash: computePolicyHash(pol, 12) }, { deposit: near('0.05'), gas: 30000000000000n, label: 'deposit' });
        s.assert('the depositor deposited 0.05', d.ok, { actual: d.error });
        await chain.waitFor(async () => BigInt((await state()).total_escrow) === toN('0.05'), { what: 'deposit' });
      }, { critical: true });

      const alloc = (n) => [{ recipient: P.rc.id, amount: String(toN(n)) }];
      const orderHash = `ol-order-${tag}`;
      let sig = null; let round = null;
      await ctx.step('prediction 3 (bound): the program refuses allocations above the bound it was given', async (s) => {
        round = await state();
        const over = await runOL({ op: 'sign', contract: chain.coordinatorId, syndicate_id: id, epoch: Number(round.epoch), nonce: round.round_nonce, order_hash: orderHash, allocations: alloc('0.02'), max_total_yocto: String(toN('0.01')) });
        s.evidence('outlayer', { tx: over.tx });
        s.assert('it answered, and declined to sign', over.json?.ok === false && !over.json?.signature, { actual: over.json });
        s.assert('and said why: the bound', /bound/.test(over.json?.error || ''), { actual: over.json?.error });
      });

      await ctx.step('prediction 3: a contract-triggered signature is accepted by the contract and pays exactly', async (s) => {
        const r = await runOL({ op: 'sign', contract: chain.coordinatorId, syndicate_id: id, epoch: Number(round.epoch), nonce: round.round_nonce, order_hash: orderHash, allocations: alloc('0.02'), max_total_yocto: String(toN('0.05')) });
        s.evidence('outlayer', { tx: r.tx, attempts: r.attempts });
        s.assert('OutLayer returned a signature', r.json?.ok === true && /^[0-9a-f]{128}$/.test(r.json?.signature || ''), { actual: { json: r.json, attempts: r.attempts, status: r.status, stderr: r.stderr } });
        s.assert('it is the same key as before', r.json?.public_key === pubkey);
        s.assert('the allocations hash the program computed equals the repo\'s own function', r.json?.allocations_hash === computeAllocationsHash(alloc('0.02')), { actual: r.json?.allocations_hash });
        s.assert('the result is under 900 bytes', r.bytes < 900, { actual: r.bytes });
        sig = r.json.signature;
        // prediction 4a, before the real settlement: the signature does not cover different allocations
        const bad = await chain.send(coord.account, 'settle_batch', { syndicate_id: id, attestation_nonce: round.round_nonce, aggregate_order_hash: orderHash, allocations: alloc('0.03'), enclave_signature: sig }, { gas: 150000000000000n, label: 'settle with different allocations' });
        s.evidence('tx', { label: bad.label, hash: bad.hash, ok: bad.ok, error: bad.error });
        s.assert('prediction 4: the same signature with 0.03 instead of 0.02 is refused', !bad.ok && /Invalid enclave Ed25519 signature/.test(bad.error || ''), { actual: bad.error });
        const before = BigInt((await P.rc.account.getBalance()).toString());
        const tx = await chain.send(coord.account, 'settle_batch', { syndicate_id: id, attestation_nonce: round.round_nonce, aggregate_order_hash: orderHash, allocations: alloc('0.02'), enclave_signature: sig }, { gas: 150000000000000n, label: 'settle_batch signed by OutLayer' });
        s.evidence('tx', { label: tx.label, hash: tx.hash, ok: tx.ok, explorer: tx.explorer, error: tx.error });
        s.assert('the contract accepted the settlement the OutLayer program signed', tx.ok, { actual: tx.error });
        await chain.waitFor(async () => { const x = await state(); return !x.is_settling && BigInt(x.total_escrow) === toN('0.03'); }, { what: 'settlement', timeoutMs: 90000 });
        const paid = (await chain.transfersOf(tx.hash, coord.id)).filter((m) => m.fromContract);
        s.assert('the recipient received exactly 0.02 NEAR and nothing else moved', paid.length === 1 && paid[0].to === P.rc.id && BigInt(paid[0].amount) === toN('0.02'), { actual: paid });
        const after = BigInt((await P.rc.account.getBalance()).toString());
        s.assert('the recipient\'s balance rose by 0.02', after - before === toN('0.02'), { actual: String(after - before) });
      });

      await ctx.step('prediction 3 (replay): replaying the used signature after the settlement is refused', async (s) => {
        const replay = await chain.send(coord.account, 'settle_batch', { syndicate_id: id, attestation_nonce: round.round_nonce, aggregate_order_hash: orderHash, allocations: alloc('0.02'), enclave_signature: sig }, { gas: 150000000000000n, label: 'replay' });
        s.evidence('tx', { label: replay.label, hash: replay.hash, ok: replay.ok, error: replay.error });
        s.assert('the replay is refused', !replay.ok && /Nonce mismatch|Replay|not active/i.test(replay.error || ''), { actual: replay.error });
        s.assert('and the group still holds 0.03', BigInt((await state()).total_escrow) === toN('0.03'));
      });
    } finally {
      await ctx.step('teardown: the depositor leaves with the rest, the group is pruned, the accounts are deleted', async (st) => {
        if (!P) { st.assert('nothing to tear down', true); return; }
        const rep = await teardownMembers(chain, { rootDir: ctx.rootDir, members: P.all, pruneIds: created, exitWaitMs: 180000 });
        st.observe('teardown', { pruned: rep.pruned.length, notPruned: rep.notPruned, deleted: rep.deleted.length, kept: rep.kept, failed: rep.failed });
        st.assert('the group was pruned and both accounts deleted', rep.notPruned.length === 0 && rep.failed.length === 0 && rep.deleted.length === 2, { actual: rep });
        st.assert('the contract holds the groups it started with', Number(await chain.view('get_syndicate_count', {})) === countBefore, { expected: countBefore });
      }, { always: true });
    }
  },
};
