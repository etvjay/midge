import crypto from 'node:crypto';
import { connect, near, computePolicyHash } from '../lib/near.js';
import { createMembers, teardownMembers } from '../lib/members.js';
import { HostedRoost } from '../../src/roost-service/hosted-roost.js';
import { sealToModel } from '../../src/enclave/e2ee.js';

const provider = { simulated: true, attest: async () => Buffer.from('lab-local-no-hardware'), info: async () => ({}) };
const RPCS = ['https://test.rpc.fastnear.com', 'https://archival-rpc.testnet.fastnear.com'];
const N_SMALL = 4; const N_BIG = Number(process.env.LAB_GAS_N || 20);

export default {
  id: 'E-CALLBACK-GAS-01',
  title: 'GAP-008: how much gas does the follow-up step of a payout really burn, per member?',
  tier: 'testnet',
  requires: ['near-key', 'network'],
  hypothesis: 'Written before the run. The follow-up step (on_settlement_payout) applies each member\'s deduction and clears the settling mark. Its cost is a base plus a per-member part. Prediction: the base is under 10 TGas and the per-member part is under 1 TGas, so the sizing 25 TGas + 1 TGas per member (capped at 100) is enough for the 50-member maximum (about 75 TGas). The contract deployed at the time of the run may give it a flat 25 TGas; if the measured cost extrapolated to 50 members exceeds the allotment in force, that is the GAP-008 risk, shown. Fails if the follow-up step fails to run or settle, or if the measured per-member cost is 1 TGas or more (the sizing would then be too small).',
  limits: [
    'Measures gas from the settlement\'s own receipts on testnet for 4 and N members and extrapolates linearly to 50; it does not run 50 members.',
    'It cannot make a real callback run out of gas, so the recovery path itself is shown by unit tests, not live.',
    'One operator controls every account and the host is local.',
  ],
  async run(ctx) {
    const chain = await connect(ctx.rootDir);
    const coord = chain.sub('c');
    const tag = Date.now().toString(36);
    const created = []; let people; let recipient; let countBefore;
    const state = (id) => chain.view('get_syndicate', { syndicate_id: id });
    const policy = () => ({ allowed_recipients: [recipient.id], max_release_bps_per_epoch: 10000, settle_deadline_block: 500000000 });
    const txStatus = async (hash) => { for (const url of RPCS) { try { const r = await (await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'EXPERIMENTAL_tx_status', params: [hash, coord.id] }) })).json(); if (r.result) return r.result; } catch { /* next */ } } return null; };

    async function round(s, count) {
      const id = `gas${count}-${tag}`; created.push(id); const roost = new HostedRoost({ provider });
      const members = people.slice(0, count);
      const h = await chain.send(coord.account, 'hatch', { syndicate_id: id, syndicate_type: 'FLASH', quorum_threshold: 1, max_spend_near: 1, enclave_public_key: roost.settlePublicKey, expected_code_hash: crypto.randomBytes(32).toString('hex'), timeout_blocks: 16, payout_recipient: recipient.id, release_policy: policy() }, { deposit: near('0.01'), gas: 40000000000000n, label: `hatch ${id}` });
      s.assert(`hatch ${id}`, h.ok); await chain.waitFor(() => state(id), { what: 'syndicate' });
      for (const m of members) { const r = await chain.send(m.account, 'deposit', { syndicate_id: id, policy_hash: computePolicyHash(policy()) }, { deposit: near('0.02'), gas: 30000000000000n, label: `deposit ${m.id} -> ${id}` }); if (!r.ok) throw new Error(`deposit failed: ${r.error}`); }
      await chain.waitFor(async () => BigInt((await state(id)).total_escrow) === near('0.02') * BigInt(count), { what: 'deposits' });
      for (const m of members) roost.submitSealedIntent({ flyerId: m.id, cipherTextHex: sealToModel(JSON.stringify({ amount: '0.01' }), roost.intentPublicKey) });
      const agg = roost.aggregateAndClear({ roundId: id }); const st = await state(id);
      const allocations = [{ recipient: recipient.id, amount: String(near('0.01') * BigInt(count)) }]; // pays half of what is deposited
      const signed = roost.signSettlement({ contractId: chain.coordinatorId, syndicateId: id, epoch: Number(st.epoch), roundNonce: st.round_nonce, allocations, orderHash: agg.orderHash });
      const tx = await chain.send(coord.account, 'settle_batch', { syndicate_id: id, attestation_nonce: st.round_nonce, aggregate_order_hash: agg.orderHash, allocations, enclave_signature: signed.signature }, { gas: 250000000000000n, label: `settle_batch ${id} (${count} members)` });
      s.evidence('tx', { label: tx.label, hash: tx.hash, ok: tx.ok, explorer: tx.explorer, error: tx.error });
      s.assert(`the ${count}-member settlement succeeded`, tx.ok, { actual: tx.error });
      await chain.waitFor(async () => !(await state(id)).is_settling, { what: 'follow-up step', timeoutMs: 90000 });
      const status = await txStatus(tx.hash);
      s.assert('the transaction status with receipts was readable', Boolean(status), {});
      const cb = (status?.receipts_outcome || []).find((r) => (r.outcome.logs || []).some((l) => /syndicate_settled|syndicate_settlement_failed/.test(l)));
      s.assert('the follow-up step ran and logged the settlement', Boolean(cb), {});
      s.assert('it reported success (not a failed payout)', Boolean(cb) && cb.outcome.logs.some((l) => /syndicate_settled/.test(l)));
      const burnt = Number(BigInt(cb.outcome.gas_burnt)) / 1e12;
      const afterPending = await chain.view('get_pending_settlement', { syndicate_id: id }).catch(() => 'n/a');
      s.evidence('callback', { members: count, callbackBurntTGas: burnt, pendingAfter: afterPending });
      return { id, members, burnt };
    }

    await ctx.step(`set up: ${N_BIG} members and a recipient`, async (s) => {
      countBefore = Number(await chain.view('get_syndicate_count', {}));
      const made = await createMembers(chain, { rootDir: ctx.rootDir, tag: `g${tag.slice(-5)}`, count: N_BIG + 1, fundNear: '0.2' });
      recipient = made[N_BIG]; people = made.slice(0, N_BIG);
      s.assert(`${N_BIG + 1} accounts exist`, made.length === N_BIG + 1);
    }, { critical: true });

    let small; let big;
    await ctx.step(`${N_SMALL} members`, async (s) => { small = await round(s, N_SMALL); });
    await ctx.step(`${N_BIG} members`, async (s) => { big = await round(s, N_BIG); });

    await ctx.step('the per-member cost, extrapolated to the 50-member maximum', async (s) => {
      const perMember = (big.burnt - small.burnt) / (N_BIG - N_SMALL); const base = small.burnt - perMember * N_SMALL;
      const at50 = base + perMember * 50;
      s.observe('fit', { baseTGas: +base.toFixed(2), perMemberTGas: +perMember.toFixed(3), at50TGas: +at50.toFixed(1), flatAllotmentTGas: 25, sizedAllotmentAt50TGas: 75 });
      s.evidence('fit', { baseTGas: +base.toFixed(2), perMemberTGas: +perMember.toFixed(3), at50TGas: +at50.toFixed(1) });
      s.assert('the base cost is under 10 TGas', base < 10, { actual: base });
      s.assert('the per-member cost is under 1 TGas (the sizing constant)', perMember < 1, { actual: perMember });
      s.assert('so the sized allotment at 50 members (75 TGas) covers the extrapolated cost with room to spare', at50 < 75 * 0.6, { actual: at50 });
      // whether a flat 25 TGas would have been enough is an observation, not a pass condition
      s.observe('a flat 25 TGas would be enough at 50 members', at50 < 25);
    });

    await ctx.step('teardown: exit, prune, compact, delete the accounts', async (s) => {
      if (!people) { s.assert('nothing to tear down', true); return; }
      const rep = await teardownMembers(chain, { rootDir: ctx.rootDir, members: [...people, recipient], pruneIds: created, exitWaitMs: 120000 });
      s.observe('teardown', { pruned: rep.pruned.length, notPruned: rep.notPruned, deleted: rep.deleted.length, kept: rep.kept, failed: rep.failed });
      s.assert('every account was deleted and every syndicate pruned', rep.failed.length === 0 && rep.kept.length === 0 && rep.notPruned.length === 0, { actual: rep });
      s.assert('the contract holds the records it started with', Number(await chain.view('get_syndicate_count', {})) === countBefore, { expected: countBefore });
    }, { always: true });
  },
};
