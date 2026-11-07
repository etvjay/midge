import crypto from 'node:crypto';
import { connect, fmt, near, sleep, loadEnvFile } from '../lib/near.js';
import { FlyChainClient } from '../../src/chain/client.js';
import { createMembers, teardownMembers, accountExists } from '../lib/members.js';
import { expectedCodeHash } from '../lib/contract.js';
import { FlyMcpServer } from '../../src/mcp/server.js';
import { FlyApiDaemon } from '../../src/api/server.js';
import { FlyClient } from '../../src/sdk/client.js';
import { HostedRoost } from '../../src/roost-service/hosted-roost.js';
import { sealToModel } from '../../src/enclave/e2ee.js';

const provider = { simulated: true, attest: async () => Buffer.from('lab-local-no-hardware'), info: async () => ({}) };

export default {
  id: 'E-IFACE-CHAIN',
  title: 'The MCP server, the SDK and the API drive the real contract on NEAR testnet, end to end',
  tier: 'testnet',
  requires: ['near-key', 'network'],
  hypothesis: 'An agent using only the MCP tools (or the SDK through the API) can hatch a syndicate with a real Roost key, deposit, settle with the Roost\'s signature, and exit with hatch_out, and the chain shows exactly what the interface reported. Replaying a partial settlement through the interface is rejected. The failure that must NOT happen: an interface that reports a transaction it did not make, or cannot make the transaction its own documentation describes.',
  limits: [
    'The Roost is a local HostedRoost with a simulated attestation provider: this tests the interfaces and the chain, not hardware.',
    'The interface account is the repository\'s master testnet account; one operator is every party. Recipients and the depositor are accounts the operator controls.',
    'Hatch, deposit and settle go through the chain client; the API\'s hatch and deposit routes still use the in-memory model (GAP-016) and are not driven here. Only the API\'s chain-backed routes are.',
    'Testnet only, one date. The contract has not been audited by a third party.',
  ],
  async run(ctx) {
    const chain = await connect(ctx.rootDir);
    const tag = Date.now().toString(36);
    let rcpt = null; // a fresh recipient account, created in the preflight and deleted at the end
    let countBefore = null;
    const roost = new HostedRoost({ provider });
    const id = (n) => `ifc-${tag}-${n}`;
    const state = (sid) => chain.view('get_syndicate', { syndicate_id: sid });
    const yocto = (n) => String(near(n));
    let mcp; let daemon; let sdk; let chainClient;

    const call = async (s, tool, args) => {
      try {
        const r = await mcp.executeTool(tool, args);
        s.evidence('mcp', { tool, ok: true, status: r.status, txHash: r.txHash, explorer: r.explorerUrl });
        return { ok: true, r };
      } catch (e) {
        s.evidence('mcp', { tool, ok: false, error: e.message.slice(0, 400) });
        return { ok: false, e: e.message };
      }
    };
    const bidAndSign = async ({ syndicateId, bid, allocations }) => {
      roost.submitSealedIntent({ flyerId: chain.masterId, cipherTextHex: sealToModel(JSON.stringify({ amount: bid }), roost.intentPublicKey) });
      const agg = roost.aggregateAndClear({ roundId: `${tag}-${syndicateId}-${Date.now()}` });
      const st = await state(syndicateId);
      const signed = roost.signSettlement({ contractId: chain.coordinatorId, syndicateId, epoch: Number(st.epoch), roundNonce: st.round_nonce, allocations, orderHash: agg.orderHash });
      return { agg, st, signed };
    };
    const want = expectedCodeHash(ctx.rootDir);
    const hatchArgs = (sid, extra = {}) => ({ syndicateId: sid, expectedCodeHash: want.hash, quorumThreshold: 1, enclavePublicKey: roost.settlePublicKey, allowedRecipients: [rcpt.id], timeoutBlocks: 50, ...extra });
    // A deposit consents to the group's terms (GAP-025), so each deposit states them: the cap and deadline are the tool's defaults, the timer is what we hatched with.
    const expectFor = (timer) => ({ allowedRecipients: [rcpt.id], maxReleaseBps: 10000, settleDeadlineBlock: 999999999, timeoutBlocks: timer });

    await ctx.step('preflight: write access, deployed contract, balances, storage headroom', async (s) => {
      // Write access is passed in explicitly: the chain client no longer reads the repository's .env on its own (GAP-018).
      const env = loadEnvFile(ctx.rootDir);
      chainClient = new FlyChainClient({ accountId: env.NEAR_ACCOUNT_ID, privateKey: env.NEAR_PRIVATE_KEY, contractId: chain.coordinatorId });
      mcp = new FlyMcpServer({ mode: 'chain', chainClient });
      s.assert('the MCP server is in chain mode and can write', mcp.mode === 'chain' && mcp.chainClient?.isConfiguredForWrites(), { actual: mcp.mode });
      s.assert('the interface account is the lab\'s master account', mcp.chainClient?.accountId === chain.masterId, { actual: mcp.chainClient?.accountId });
      const hash = await chain.codeHash();
      s.assert(`the deployed contract is the build expected from ${want.source}`, hash === want.hash, { expected: want.hash, actual: hash });
      const bal = await chain.balance(chain.master);
      s.observe('interface account balance (NEAR)', fmt(bal));
      s.assert('the interface account has at least 0.25 NEAR (an attempt costs about 0.07)', bal > near('0.25'), { actual: fmt(bal) });
      const acct = await chain.provider.query({ request_type: 'view_account', finality: 'final', account_id: chain.coordinatorId });
      const headroom = BigInt(acct.amount) - BigInt(acct.storage_usage) * 10n ** 19n;
      s.assert('the contract account has at least 0.15 NEAR of storage headroom', headroom > near('0.15'), { actual: fmt(headroom) });
      countBefore = Number(await chain.view('get_syndicate_count', {}));
      [rcpt] = await createMembers(chain, { rootDir: ctx.rootDir, tag: `i${tag.slice(-5)}`, count: 1, fundNear: '0.05', names: ['r'] });
      s.assert('a fresh recipient account exists', await accountExists(chain, rcpt.id), { actual: rcpt.id });
      ctx.__start = { master: bal };
    }, { critical: true });

    const s1 = id(1);
    await ctx.step('MCP: hatch with the Roost\'s key, deposit, settle with its signature', async (s) => {
      const noKey = await call(s, 'midge_hatch_syndicate', { syndicateId: id('nokey'), expectedCodeHash: want.hash });
      s.assert('hatching without an enclave key is refused before any transaction (a keyless syndicate could never settle)', !noKey.ok && /enclavePublicKey/.test(noKey.e), { actual: noKey });
      const h = await call(s, 'midge_hatch_syndicate', hatchArgs(s1));
      s.assert('midge_hatch_syndicate reports HATCHED_ON_CHAIN with a transaction hash', h.ok && h.r.status === 'HATCHED_ON_CHAIN' && Boolean(h.r.txHash), { actual: h });
      const st = await chain.waitFor(() => state(s1), { what: 'syndicate to appear' });
      s.assert('the chain shows the Roost\'s settlement key', st.enclave_public_key === roost.settlePublicKey, { expected: roost.settlePublicKey, actual: st.enclave_public_key });
      s.assert('the chain shows the allowed recipient the agent asked for', JSON.stringify(st.release_policy.allowed_recipients) === JSON.stringify([rcpt.id]), { actual: st.release_policy });
      const before = await state(s1);
      const noTerms = await call(s, 'midge_deposit', { syndicateId: s1, amountNear: '0.02' });
      s.assert('a deposit that states no terms is refused, and the tool does not copy the hash from the contract', !noTerms.ok && /state them|will not copy/.test(JSON.stringify(noTerms)), { actual: noTerms });
      const wrongTimer = await call(s, 'midge_deposit', { syndicateId: s1, amountNear: '0.02', expect: expectFor(300) });
      s.assert('a deposit that expected a 300-block timer into a 50-block group is refused', !wrongTimer.ok && /exit timer/.test(JSON.stringify(wrongTimer)), { actual: wrongTimer });
      s.assert('neither refused deposit changed the escrow', (await state(s1)).total_escrow === before.total_escrow, { expected: before.total_escrow, actual: (await state(s1)).total_escrow });
      const d = await call(s, 'midge_deposit', { syndicateId: s1, amountNear: '0.02', expect: expectFor(50) });
      s.assert('midge_deposit reports DEPOSITED_ON_CHAIN', d.ok && d.r.status === 'DEPOSITED_ON_CHAIN', { actual: d });
      const funded = await chain.waitFor(async () => { const x = await state(s1); return BigInt(x.total_escrow) === near('0.02') ? x : null; }, { what: 'escrow 0.02' });
      s.assert('the escrow is exactly 0.02 NEAR', BigInt(funded.total_escrow) === near('0.02'));
      const allocations = [{ recipient: rcpt.id, amount: yocto('0.02') }];
      const { agg, st: pre, signed } = await bidAndSign({ syndicateId: s1, bid: '0.02', allocations });
      const settle = await call(s, 'midge_settle', { syndicateId: s1, allocations: [[rcpt.id, '0.02']], orderHash: agg.orderHash, nonce: pre.round_nonce, enclaveSignature: signed.signature });
      s.assert('midge_settle reports SETTLED_ON_CHAIN (it could not before: wrong argument names, wrong allocation shape, wrong hash)', settle.ok && settle.r.status === 'SETTLED_ON_CHAIN', { actual: settle });
      const fin = await chain.waitFor(async () => { const x = await state(s1); return /settled/i.test(String(x.status)) ? x : null; }, { what: 'Settled' });
      s.assert('the chain shows the syndicate Settled with no escrow', BigInt(fin.total_escrow) === 0n);
      const moves = await chain.waitFor(async () => { const t = await chain.transfersOf(settle.r.txHash, chain.masterId); return t.some((x) => x.fromContract) ? t : null; }, { what: 'receipts', timeoutMs: 60000 });
      const paid = moves.filter((m) => m.fromContract);
      s.assert('the contract made exactly one transfer, to the recipient, for exactly 0.02 NEAR', paid.length === 1 && paid[0].to === rcpt.id && paid[0].amount === yocto('0.02'), { actual: paid });
      const replay = await call(s, 'midge_settle', { syndicateId: s1, allocations: [[rcpt.id, '0.02']], orderHash: agg.orderHash, nonce: pre.round_nonce, enclaveSignature: signed.signature });
      s.assert('replaying the settlement through the MCP is rejected', !replay.ok, { actual: replay });
    }, { critical: true });

    const s2 = id(2);
    await ctx.step('MCP: a partial settlement cannot be replayed, the next needs a fresh signature', async (s) => {
      s.assert('hatch #2', (await call(s, 'midge_hatch_syndicate', hatchArgs(s2))).ok);
      await chain.waitFor(() => state(s2), { what: 'syndicate 2' });
      s.assert('deposit 0.03', (await call(s, 'midge_deposit', { syndicateId: s2, amountNear: '0.03', expect: expectFor(50) })).ok);
      await chain.waitFor(async () => BigInt((await state(s2)).total_escrow) === near('0.03'), { what: 'escrow 0.03' });
      const part = [{ recipient: rcpt.id, amount: yocto('0.01') }];
      const { agg, st: pre, signed } = await bidAndSign({ syndicateId: s2, bid: '0.03', allocations: part });
      const args = { syndicateId: s2, allocations: [[rcpt.id, '0.01']], orderHash: agg.orderHash, nonce: pre.round_nonce, enclaveSignature: signed.signature };
      s.assert('the partial settlement (0.01 of 0.03) succeeds', (await call(s, 'midge_settle', args)).ok);
      const after = await chain.waitFor(async () => { const x = await state(s2); return BigInt(x.total_escrow) === near('0.02') ? x : null; }, { what: 'escrow 0.02' });
      s.assert('the round nonce rotated', after.round_nonce !== pre.round_nonce);
      const replay = await call(s, 'midge_settle', args);
      s.assert('replaying the same partial settlement is rejected with a nonce error', !replay.ok && /Nonce mismatch/.test(replay.e), { actual: replay.e });
      s.assert('the escrow is unchanged by the replay', (await state(s2)).total_escrow === after.total_escrow);
      const rest = [{ recipient: rcpt.id, amount: after.total_escrow }];
      const next = await bidAndSign({ syndicateId: s2, bid: '0.02', allocations: rest });
      const second = await call(s, 'midge_settle', { syndicateId: s2, allocations: [[rcpt.id, '0.02']], orderHash: next.agg.orderHash, nonce: next.st.round_nonce, enclaveSignature: next.signed.signature });
      s.assert('a fresh signature on the new nonce settles the rest', second.ok, { actual: second });
    });

    const s3 = id(3);
    await ctx.step('MCP: the non-custodial exit (hatch_out) refunds exactly the deposit', async (s) => {
      s.assert('hatch #3 with a 10-block timeout (the contract floor)', (await call(s, 'midge_hatch_syndicate', hatchArgs(s3, { timeoutBlocks: 10 }))).ok);
      await chain.waitFor(() => state(s3), { what: 'syndicate 3' });
      s.assert('deposit 0.02', (await call(s, 'midge_deposit', { syndicateId: s3, amountNear: '0.02', expect: expectFor(10) })).ok);
      await chain.waitFor(async () => BigInt((await state(s3)).total_escrow) === near('0.02'), { what: 'escrow' });
      await sleep(12000); // the 10-block timer is about 6 s; wait past it
      const out = await call(s, 'midge_hatch_out', { syndicateId: s3 });
      s.assert('midge_hatch_out reports HATCHED_OUT_ON_CHAIN', out.ok && out.r.status === 'HATCHED_OUT_ON_CHAIN', { actual: out });
      const fin = await chain.waitFor(async () => { const x = await state(s3); return BigInt(x.total_escrow) === 0n ? x : null; }, { what: 'refund' });
      s.assert('the syndicate is AbortedRefunded', /aborted/i.test(String(fin.status)), { actual: fin.status });
      const moves = await chain.waitFor(async () => { const t = await chain.transfersOf(out.r.txHash, chain.masterId); return t.some((x) => x.fromContract) ? t : null; }, { what: 'receipts', timeoutMs: 60000 });
      const paid = moves.filter((m) => m.fromContract);
      s.assert('the contract refunded exactly 0.02 NEAR to the depositor, once', paid.length === 1 && paid[0].to === chain.masterId && paid[0].amount === yocto('0.02'), { actual: paid });
    });

    try {
      await ctx.step('SDK through the API in chain mode: reads, settle and hatch-out reach the chain', async (s) => {
        daemon = new FlyApiDaemon({ port: 0, mode: 'chain', roostBackend: 'local', chainClient });
        const { port } = await daemon.start();
        sdk = new FlyClient({ baseUrl: `http://127.0.0.1:${port}` });
        s.assert('the daemon is in chain mode with write access', daemon.mode === 'chain' && daemon.chainClient?.isConfiguredForWrites());
        const count = Number(await chain.view('get_syndicate_count', {}));
        const list = await sdk.listSyndicates({ limit: 10, order: 'desc' });
        s.assert('listSyndicates over the API returns the chain\'s record count as total and the newest first', list.mode === 'chain' && list.total === count && list.syndicates.some((x) => x.id === s3), { actual: [list.total, count, list.syndicates?.map((x) => x.id)] });
        s.assert('the first newest-first page includes this run\'s syndicates without walking every page (it did not, ascending, once the chain held more than a page)', [s1, s2, s3].every((x) => list.syndicates.some((y) => y.id === x)));
        const mine = await sdk.getSyndicatesByMember(chain.masterId, { limit: 20, order: 'desc' });
        s.observe('syndicates in the interface account\'s index (total)', mine.total);
        s.assert('getSyndicatesByMember reads the chain, newest first, with the index size as total, and includes the syndicates this run created', mine.mode === 'chain' && mine.total >= 3 && [s1, s2, s3].every((x) => mine.syndicates.some((y) => y.id === x)), { actual: [mine.total, mine.syndicates?.length] });
        const s4 = id(4);
        const hatched = await sdk.hatchSyndicate({ id: s4, quorumThreshold: 1, timeoutBlocks: 50, expectedCodeHash: want.hash, enclavePublicKey: roost.settlePublicKey, allowedRecipients: [rcpt.id] });
        s.assert('sdk.hatchSyndicate -> API -> chain hatches on chain, with a transaction hash and the round nonce (GAP-016: it used to create an in-memory model syndicate)', hatched.mode === 'chain' && Boolean(hatched.txHash) && typeof hatched.roundNonce === 'string', { actual: hatched });
        const onChain = await chain.waitFor(() => state(s4), { what: 'syndicate 4 on chain' });
        s.assert('the chain really has it, with the Roost\'s key', onChain.enclave_public_key === roost.settlePublicKey);
        const dep = await sdk.deposit(s4, chain.masterId, '0.02', null, expectFor(50));
        s.assert('sdk.deposit -> API -> chain deposits on chain', dep.status === 'DEPOSITED_ON_CHAIN' && Boolean(dep.txHash), { actual: dep });
        await chain.waitFor(async () => BigInt((await state(s4)).total_escrow) === near('0.02'), { what: 'escrow' });
        const got = await sdk.getSyndicate(s4);
        s.assert('sdk.getSyndicate reads the chain: the id, the exact escrow, the nonce and the flyer (it used to 404 for anything on chain)', got.mode === 'chain' && got.id === s4 && got.totalEscrowYocto === yocto('0.02') && got.roundNonce === onChain.round_nonce && got.activeFlyers.includes(chain.masterId), { actual: got });
        const missing = await fetch(`http://127.0.0.1:${port}/v1/syndicates/${id('nope')}`);
        s.assert('an id that is not on chain is a 404', missing.status === 404);
        const tl = await (await fetch(`http://127.0.0.1:${port}/v1/emergency/timelock/${s4}`)).json();
        s.assert('the timelock view reads the chain: 50 blocks, some elapsed, a real current block', tl.mode === 'chain' && tl.timeoutBlocks === 50 && tl.currentBlock > tl.createdAtBlock && tl.blocksRemaining <= 50, { actual: tl });
        const { agg, st: pre, signed } = await bidAndSign({ syndicateId: s4, bid: '0.02', allocations: [{ recipient: rcpt.id, amount: yocto('0.02') }] });
        const settled = await sdk.settleBatch(s4, { allocations: [[rcpt.id, '0.02']], orderHash: agg.orderHash, nonce: pre.round_nonce, enclaveSignature: signed.signature });
        s.assert('sdk.settleBatch -> API -> chain returns SETTLED_ON_CHAIN', settled.status === 'SETTLED_ON_CHAIN' && Boolean(settled.txHash), { actual: settled });
        const fin = await chain.waitFor(async () => { const x = await state(s4); return /settled/i.test(String(x.status)) ? x : null; }, { what: 'Settled #4' });
        s.assert('the chain shows it Settled', Boolean(fin));
        const bad = await sdk.settleBatch(s4, { allocations: [[rcpt.id, '0.02']] }).then(() => 'accepted', (e) => e.message);
        s.assert('a settle without nonce, hash or signature is refused with an explanation, and sends nothing', /round_nonce/.test(bad), { actual: bad });

        const s5 = id(5);
        s.assert('hatch #5 with a 10-block timeout (the contract floor)', (await call(s, 'midge_hatch_syndicate', hatchArgs(s5, { timeoutBlocks: 10 }))).ok);
        await chain.waitFor(() => state(s5), { what: 'syndicate 5' });
        s.assert('deposit 0.02', (await call(s, 'midge_deposit', { syndicateId: s5, amountNear: '0.02', expect: expectFor(10) })).ok);
        await chain.waitFor(async () => BigInt((await state(s5)).total_escrow) === near('0.02'), { what: 'escrow' });
        await sleep(12000); // the 10-block timer is about 6 s; wait past it
        const out = await sdk.hatchOut(s5);
        s.assert('sdk.hatchOut -> API -> chain returns HATCHED_OUT_ON_CHAIN', out.status === 'HATCHED_OUT_ON_CHAIN' && Boolean(out.txHash), { actual: out });
        const refunded = await chain.waitFor(async () => { const x = await state(s5); return BigInt(x.total_escrow) === 0n ? x : null; }, { what: 'refund #5' });
        s.assert('the chain shows the escrow refunded', Boolean(refunded));
      });
    } finally {
      await ctx.step('teardown: stop the daemon, prune the run\'s syndicates, compact the master\'s index, delete the recipient', async (s) => {
        if (daemon) await daemon.stop();
        const ids = [1, 2, 3, 4, 5].map((n) => id(n));
        const rep = await teardownMembers(chain, { rootDir: ctx.rootDir, members: rcpt ? [rcpt] : [], pruneIds: ids });
        const compact = await chain.send(chain.master, 'compact_member_index', { account_id: chain.masterId }, { gas: 30000000000000n, label: 'compact master index' });
        s.observe('teardown', { pruned: rep.pruned.length, notPruned: rep.notPruned.map((x) => x.id), deleted: rep.deleted, masterIndexCompacted: compact.ok });
        s.assert('every syndicate the run created was pruned', rep.notPruned.length === 0 && rep.pruned.length === ids.length, { actual: rep.notPruned });
        s.assert('the recipient account was deleted and no longer exists', rep.failed.length === 0 && rcpt && !(await accountExists(chain, rcpt.id)), { actual: rep.failed });
        s.assert('the contract holds exactly as many records as before the run', Number(await chain.view('get_syndicate_count', {})) === countBefore, { expected: countBefore });
        const end = await chain.balance(chain.master);
        s.observe('interface account net change (NEAR)', fmt(end - ctx.__start.master, 5));
        s.assert('an attempt cost the interface account less than 0.12 NEAR', ctx.__start.master - end < near('0.12'), { actual: fmt(ctx.__start.master - end, 5) });
      }, { always: true });
    }
  },
};
