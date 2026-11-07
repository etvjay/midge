import crypto from 'node:crypto';
import { connect, near, fmt, computePolicyHash } from '../lib/near.js';
import { createMembers, teardownMembers } from '../lib/members.js';
import { HostedRoost } from '../../src/roost-service/hosted-roost.js';
import { sealToModel } from '../../src/enclave/e2ee.js';

const provider = { simulated: true, attest: async () => Buffer.from('lab-local-no-hardware'), info: async () => ({}) };
const BIDS = { a: '0.01', b: '0.02', c: '0.03', d: '0.04' };   // what each backer privately puts in
const DEPOSIT = '0.05';                                          // the same for everyone
const WHO = Object.keys(BIDS);

export default {
  id: 'E-CMP-INVEST-02',
  title: 'Investing together, each backer funding their own amount: per-member charges against equal shares, same backers, same run',
  tier: 'testnet',
  requires: ['near-key', 'network'],
  hypothesis: 'Predictions written first in docs/lab/USECASE_PLAN.md. Four backers put in 0.01, 0.02, 0.03 and 0.04 NEAR through the same room with a common 0.05 deposit. (1) With the pooled program and settle_batch_charged each backer\'s remainder at exit is exactly their deposit less their own amount (0.04, 0.03, 0.02, 0.01). (2) But the charges are arguments of the public settlement transaction, so an observer reading only that transaction recovers all four contributions. (3) With an ordinary equal-share settlement the same observer recovers none, and each backer bears 0.025 whatever they put in. (4) Before either round settles the escrows are all equal and say nothing. So for pooled investing, hiding the amounts and funding each backer fairly are not both available on this contract. Fails if the observer cannot recover the contributions from the charged settlement, if a remainder differs from deposit less contribution, or if the equal-share round leaks any amount.',
  limits: [
    'One operator controls every account; the room is a local HostedRoost with a simulated attestation provider.',
    'The observer reads the settlement transaction\'s public arguments through an archival RPC, which is what an explorer shows. It does not model an attacker who also sees the room.',
    'Hiding the charges (the room signing per-member receipts that members claim against, or zero-knowledge proofs) is not built and not tested; it is named in the plan as a design option.',
    'Amounts are tiny testnet NEAR. Bids are not authenticated to an account (GAP-023).',
  ],
  async run(ctx) {
    const chain = await connect(ctx.rootDir);
    const coord = chain.sub('c');
    const tag = Date.now().toString(36);
    const created = []; let people; let recipient; let countBefore;
    const state = (id) => chain.view('get_syndicate', { syndicate_id: id });
    const policy = () => ({ allowed_recipients: [recipient.id], max_release_bps_per_epoch: 10000, settle_deadline_block: 500000000 });
    const hatch = (id, roost) => { created.push(id); return chain.send(coord.account, 'hatch', { syndicate_id: id, syndicate_type: 'FLASH', quorum_threshold: 1, max_spend_near: 1, enclave_public_key: roost.settlePublicKey, expected_code_hash: crypto.randomBytes(32).toString('hex'), timeout_blocks: 16, payout_recipient: recipient.id, release_policy: policy() }, { deposit: near('0.01'), gas: 40000000000000n, label: `hatch ${id}` }); };
    const deposit = (k, id) => chain.send(people[k].account, 'deposit', { syndicate_id: id, policy_hash: computePolicyHash(policy()) }, { deposit: near(DEPOSIT), gas: 30000000000000n, label: `deposit ${k} -> ${id}` });
    const escrows = async (id) => Object.fromEntries(await Promise.all(WHO.map(async (k) => [k, BigInt(await chain.view('get_escrow', { syndicate_id: id, account_id: people[k].id }))])));
    const height = async () => Number((await chain.provider.viewBlock({ finality: 'final' })).header.height);
    /** What an observer reads from a settlement transaction: its public arguments, as an explorer shows them. */
    const publicArgs = async (hash, signer) => { const r = await (await fetch('https://archival-rpc.testnet.fastnear.com', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'EXPERIMENTAL_tx_status', params: [hash, signer] }) })).json(); return JSON.parse(Buffer.from(r.result.transaction.actions[0].FunctionCall.args, 'base64').toString('utf8')); };
    const seal = (roost, k, body) => roost.submitSealedIntent({ flyerId: people[k].id, cipherTextHex: sealToModel(JSON.stringify(body), roost.intentPublicKey) });
    const recoveredFrom = (args) => WHO.filter((k) => (args.charges || []).some((c) => c.member === people[k].id && BigInt(c.amount) === near(BIDS[k]))).length;

    async function round(s, { kind }) {
      const id = `inv2-${tag}-${kind}`; const roost = new HostedRoost({ provider });
      s.assert(`hatch ${id}`, (await hatch(id, roost)).ok); await chain.waitFor(() => state(id), { what: 'syndicate' });
      for (const k of WHO) s.assert(`${k} deposits ${DEPOSIT}`, (await deposit(k, id)).ok);
      await chain.waitFor(async () => BigInt((await state(id)).total_escrow) === near(DEPOSIT) * 4n, { what: 'all deposits' });
      const before = await escrows(id);
      s.assert('prediction 4: before settlement the escrows are all equal, so they say nothing about the amounts (0 of 4 recovered)', new Set(Object.values(before).map(String)).size === 1);
      let tx; let args;
      if (kind === 'charged') {
        for (const k of WHO) seal(roost, k, { amount: BIDS[k] });
        const out = roost.runPool({ recipient: recipient.id, roundId: id }); const st = await state(id);
        s.observe('what the Roost computed', out.outcome);
        const signed = roost.signSettlement({ contractId: chain.coordinatorId, syndicateId: id, epoch: Number(st.epoch), roundNonce: st.round_nonce, allocations: out.allocations, orderHash: out.orderHash, charges: out.charges });
        tx = await chain.send(coord.account, 'settle_batch_charged', { syndicate_id: id, attestation_nonce: st.round_nonce, aggregate_order_hash: out.orderHash, allocations: out.allocations, charges: out.charges, enclave_signature: signed.signature }, { gas: 150000000000000n, label: `settle_batch_charged ${id}` });
      } else {
        for (const k of WHO) seal(roost, k, { amount: BIDS[k] });
        const agg = roost.aggregateAndClear({ roundId: id }); const st = await state(id);
        const allocations = [{ recipient: recipient.id, amount: String(near('0.10')) }];
        const signed = roost.signSettlement({ contractId: chain.coordinatorId, syndicateId: id, epoch: Number(st.epoch), roundNonce: st.round_nonce, allocations, orderHash: agg.orderHash });
        tx = await chain.send(coord.account, 'settle_batch', { syndicate_id: id, attestation_nonce: st.round_nonce, aggregate_order_hash: agg.orderHash, allocations, enclave_signature: signed.signature }, { gas: 100000000000000n, label: `settle_batch ${id}` });
      }
      s.evidence('tx', { label: tx.label, hash: tx.hash, ok: tx.ok, explorer: tx.explorer, error: tx.error });
      s.assert('the settlement succeeded', tx.ok, { actual: tx.error });
      await chain.waitFor(async () => { const x = await state(id); return !x.is_settling && BigInt(x.total_escrow) === near(DEPOSIT) * 4n - near('0.10'); }, { what: 'settlement resolved' });
      const paid = (await chain.transfersOf(tx.hash, chain.coordinatorId)).filter((m) => m.fromContract && m.to === recipient.id);
      s.assert('the recipient received exactly 0.10', paid.length === 1 && BigInt(paid[0].amount) === near('0.10'), { actual: paid });
      args = await publicArgs(tx.hash, coord.id);
      const recovered = recoveredFrom(args);
      const after = await escrows(id);
      await chain.waitFor(async () => (await height()) - Number((await state(id)).epoch_start_block) >= 16, { what: 'the exit timer', timeoutMs: 120000 });
      const back = {};
      for (const k of WHO) { const r = await chain.send(people[k].account, 'hatch_out', { syndicate_id: id }, { gas: 60000000000000n, label: `exit ${id} as ${k}` }); s.assert(`${k} exits alone`, r.ok, { actual: r.error }); const m = (await chain.transfersOf(r.hash, people[k].id)).filter((x) => x.fromContract && x.to === people[k].id); back[k] = m.length ? BigInt(m[0].amount) : 0n; }
      s.assert('the syndicate ended fully refunded', /aborted|refunded/i.test(String((await state(id)).status)) && BigInt((await state(id)).total_escrow) === 0n);
      return { id, recovered, back, after, settleTx: tx.hash, args };
    }

    await ctx.step('set up: four backers and a recipient', async (s) => {
      countBefore = Number(await chain.view('get_syndicate_count', {}));
      const made = await createMembers(chain, { rootDir: ctx.rootDir, tag: `w${tag.slice(-5)}`, count: 5, fundNear: '0.35', names: ['a', 'b', 'c', 'd', 'r'] });
      people = { a: made[0], b: made[1], c: made[2], d: made[3] }; recipient = made[4];
      s.assert('five accounts exist', made.length === 5);
    }, { critical: true });

    let charged; let equal;
    await ctx.step('CHARGED · each backer funds their own amount (pooled program, settle_batch_charged)', async (s) => {
      charged = await round(s, { kind: 'charged' });
      s.observe('what the observer reads from the public settlement arguments', charged.args);
      s.assert('prediction 2: from the settlement transaction alone an observer recovers all four contributions (4 of 4)', charged.recovered === 4, { actual: charged.recovered });
      for (const k of WHO) s.assert(`prediction 1: ${k} got back exactly their deposit less their own ${BIDS[k]}`, charged.back[k] === near(DEPOSIT) - near(BIDS[k]), { actual: String(charged.back[k]) });
      s.evidence('CHARGED', { recovered: charged.recovered, of: 4, remainders: Object.fromEntries(WHO.map((k) => [k, fmt(charged.back[k], 6)])), settleTx: charged.settleTx });
    });

    await ctx.step('EQUAL SHARES · the same backers, an ordinary settlement', async (s) => {
      equal = await round(s, { kind: 'equal' });
      s.observe('what the observer reads from the public settlement arguments', equal.args);
      s.assert('prediction 3: from the settlement transaction alone an observer recovers none of the contributions (0 of 4)', equal.recovered === 0, { actual: equal.recovered });
      for (const k of WHO) s.assert(`prediction 3: ${k} bore exactly 0.025 whatever they put in (their own was ${BIDS[k]})`, near(DEPOSIT) - equal.back[k] === near('0.025'), { actual: String(near(DEPOSIT) - equal.back[k]) });
      s.evidence('EQUAL', { recovered: equal.recovered, of: 4, borne: Object.fromEntries(WHO.map((k) => [k, fmt(near(DEPOSIT) - equal.back[k], 6)])), settleTx: equal.settleTx });
    });

    await ctx.step('the trade-off, read from the two rounds above', async (s) => {
      const table = { charged: { contributionsRecoveredByAnObserver: charged.recovered, fundedByOwnAmount: WHO.every((k) => near(DEPOSIT) - charged.back[k] === near(BIDS[k])) }, equalShares: { contributionsRecoveredByAnObserver: equal.recovered, fundedByOwnAmount: WHO.every((k) => near(DEPOSIT) - equal.back[k] === near(BIDS[k])) } };
      s.observe('trade-off', table);
      s.assert('each style has exactly one of the two properties: per-member charges fund fairly and leak the amounts; equal shares hide the amounts and fund unfairly', table.charged.fundedByOwnAmount && table.charged.contributionsRecoveredByAnObserver === 4 && !table.equalShares.fundedByOwnAmount && table.equalShares.contributionsRecoveredByAnObserver === 0, { actual: table });
      s.evidence('comparison', table);
    });

    await ctx.step('teardown: prune the syndicates, compact, delete the accounts', async (s) => {
      if (!people) { s.assert('nothing to tear down', true); return; }
      const rep = await teardownMembers(chain, { rootDir: ctx.rootDir, members: [...WHO.map((k) => people[k]), recipient], pruneIds: created });
      s.observe('teardown', { pruned: rep.pruned.length, notPruned: rep.notPruned, deleted: rep.deleted.length, kept: rep.kept, failed: rep.failed });
      s.assert('every account was deleted and every syndicate pruned', rep.failed.length === 0 && rep.kept.length === 0 && rep.notPruned.length === 0, { actual: rep });
      s.assert('the contract holds the records it started with', Number(await chain.view('get_syndicate_count', {})) === countBefore, { expected: countBefore });
    }, { always: true });
  },
};
