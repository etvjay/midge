import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { connect, near } from '../lib/near.js';
import { createMembers, teardownMembers } from '../lib/members.js';
import { HostedRoost } from '../../src/roost-service/hosted-roost.js';

const provider = { simulated: true, attest: async () => Buffer.from('lab-local-no-hardware'), info: async () => ({}) };
const v2 = (recipients, bps, deadline, timer) => crypto.createHash('sha256').update(`release_policy:v2:${[...new Set(recipients)].sort().join(',')}:${bps}:${deadline}:${timer}`, 'utf8').digest('hex'); // spelled out here, not taken from the code under test
const v1 = (recipients, bps, deadline) => crypto.createHash('sha256').update(`release_policy:v1:${[...new Set(recipients)].sort().join(',')}:${bps}:${deadline}`, 'utf8').digest('hex');

export default {
  id: 'E-TIMER-CONSENT-01',
  title: 'GAP-025 on testnet: the exit timer is in the hash depositors consent to; a 9-block timer is refused; older groups are intact',
  tier: 'testnet',
  requires: ['near-key', 'network'],
  hypothesis: 'Predictions are in docs/lab/PROGRAMME_PLAN.md, written before the redeploy. A hatch below 10 blocks is refused, a new group is stored with the version-2 hash, a deposit that leaves out or misstates the timer is refused, one that names it is accepted, and groups opened before the change are intact and marked as not covering their timer. The failure that must not happen: a deposit accepted with a hash that omits the timer, or an older group changed by the deploy.',
  limits: ['One operator controls every account; the host is local and not in the test (no round is settled here).', 'It shows the contract and the checks, not that a person reads the terms.', 'The older groups checked are the ones still on the contract on the day of the run (they are not mine to create again).'],
  async run(ctx) {
    const chain = await connect(ctx.rootDir);
    const coord = chain.sub('c');
    const tag = Date.now().toString(36);
    const created = []; let people; let recipient; let countBefore; let roost;
    const state = (id) => chain.view('get_syndicate', { syndicate_id: id });
    const terms = (id) => chain.view('get_policy_terms', { syndicate_id: id });
    const BPS = 2500; const DEADLINE = 500000000;
    const hatch = (id, timer) => chain.send(coord.account, 'hatch', { syndicate_id: id, syndicate_type: 'FLASH', quorum_threshold: 1, max_spend_near: 1, enclave_public_key: roost.settlePublicKey, expected_code_hash: crypto.randomBytes(32).toString('hex'), timeout_blocks: timer, payout_recipient: recipient.id, release_policy: { allowed_recipients: [recipient.id], max_release_bps_per_epoch: BPS, settle_deadline_block: DEADLINE } }, { deposit: near('0.01'), gas: 40000000000000n, label: `hatch ${id} timer ${timer}` });
    const deposit = (who, id, hash) => chain.send(who.account, 'deposit', { syndicate_id: id, policy_hash: hash }, { deposit: near('0.02'), gas: 30000000000000n, label: `deposit ${who.id} -> ${id}` });

    await ctx.step('set up: two members, a recipient, a local host key', async (s) => {
      countBefore = Number(await chain.view('get_syndicate_count', {}));
      const made = await createMembers(chain, { rootDir: ctx.rootDir, tag: `t${tag.slice(-5)}`, count: 3, fundNear: '0.1' });
      people = made.slice(0, 2); recipient = made[2]; roost = new HostedRoost({ provider });
      s.assert('three accounts exist', made.length === 3);
      s.observe('syndicates on the contract before this run', countBefore);
    }, { critical: true });

    await ctx.step('prediction 1: a 9-block timer is refused at hatch', async (s) => {
      const id = `t9-${tag}`;
      const r = await hatch(id, 9);
      s.evidence('hatch 9', { ok: r.ok, hash: r.hash, error: r.error, explorer: r.explorer });
      s.assert('the hatch was refused', !r.ok, { actual: r.error });
      s.assert('for the floor, naming it', /at least 10/.test(r.error || ''), { actual: r.error });
      s.assert('no such group exists', (await state(id).catch(() => null)) === null);
      s.assert('the group count is unchanged', Number(await chain.view('get_syndicate_count', {})) === countBefore);
    });

    const id = `t12-${tag}`;
    await ctx.step('prediction 2: a 12-block timer is accepted and stored with the version-2 hash', async (s) => {
      created.push(id);
      const r = await hatch(id, 12);
      s.assert('the hatch succeeded', r.ok, { actual: r.error });
      await chain.waitFor(() => state(id), { what: 'syndicate' });
      const st = await state(id); const t = await terms(id);
      const expected = v2([recipient.id], BPS, DEADLINE, 12);
      s.assert('the stored hash equals the version-2 hash computed independently here', st.policy_hash === expected, { expected, actual: st.policy_hash });
      s.assert('it is not the old formula', st.policy_hash !== v1([recipient.id], BPS, DEADLINE));
      s.assert('the terms view reports 12 blocks and a 24-block window', Number(t.timeout_blocks) === 12 && Number(t.release_window_blocks) === 24, { actual: t });
      s.assert('and that the timer is covered by the hash', t.timer_in_consent_hash === true, { actual: t });
    });

    await ctx.step('prediction 3: a deposit that leaves out or misstates the timer is refused; one that names it is accepted', async (s) => {
      const old = await deposit(people[0], id, v1([recipient.id], BPS, DEADLINE));
      s.assert('a deposit with the old formula (no timer) is refused', !old.ok && /Policy hash mismatch/.test(old.error || ''), { actual: old.error });
      const wrong = await deposit(people[0], id, v2([recipient.id], BPS, DEADLINE, 300));
      s.assert('a deposit that assumed a 300-block timer is refused', !wrong.ok && /Policy hash mismatch/.test(wrong.error || ''), { actual: wrong.error });
      s.assert('neither changed the escrow', BigInt((await state(id)).total_escrow) === 0n, { actual: (await state(id)).total_escrow });
      const good = await deposit(people[0], id, v2([recipient.id], BPS, DEADLINE, 12));
      s.assert('a deposit naming the real 12-block timer is accepted', good.ok, { actual: good.error });
      await chain.waitFor(async () => BigInt((await state(id)).total_escrow) === near('0.02'), { what: 'deposit' });
      s.assert('and the escrow is 0.02', BigInt((await state(id)).total_escrow) === near('0.02'));
    });

    await ctx.step('prediction 4: the groups opened before the change are intact and marked', async (s) => {
      // The snapshot was read from the chain before the redeploy and committed with the predictions.
      const snap = JSON.parse(fs.readFileSync(path.join(ctx.rootDir, 'docs/lab/gap025-pre-deploy-snapshot.json'), 'utf8'));
      s.observe('groups in the pre-deploy snapshot', snap.groups.length);
      s.assert('the snapshot has the 15 groups the contract held', snap.groups.length === 15 && snap.count === 15, { actual: snap.count });
      for (const g of snap.groups) {
        const now = await chain.view('get_syndicate', { syndicate_id: g.id }); const t = await terms(g.id);
        s.assert(`older group ${g.id}: hash, timer, status and escrow unchanged by the deploy`, now && now.policy_hash === g.policy_hash && Number(now.timeout_blocks) === g.timeout_blocks && String(now.status) === String(g.status) && now.total_escrow === g.total_escrow, { expected: g, actual: now && { policy_hash: now.policy_hash, timeout_blocks: now.timeout_blocks, status: now.status, total_escrow: now.total_escrow } });
        s.assert(`older group ${g.id} reads back as not covering its timer`, t && t.timer_in_consent_hash === false, { actual: t });
      }
      s.assert('the contract holds those 15 plus this run\'s one group', Number(await chain.view('get_syndicate_count', {})) === countBefore + 1, { expected: countBefore + 1 });
    });

    await ctx.step('teardown: exit, prune, delete the accounts', async (s) => {
      if (!people) { s.assert('nothing to tear down', true); return; }
      const rep = await teardownMembers(chain, { rootDir: ctx.rootDir, members: [...people, recipient], pruneIds: created, exitWaitMs: 120000 });
      s.observe('teardown', { pruned: rep.pruned.length, notPruned: rep.notPruned, deleted: rep.deleted.length, kept: rep.kept, failed: rep.failed });
      s.assert('every account was deleted and every syndicate pruned', rep.failed.length === 0 && rep.kept.length === 0 && rep.notPruned.length === 0, { actual: rep });
      s.assert('the contract holds the records it started with', Number(await chain.view('get_syndicate_count', {})) === countBefore, { expected: countBefore });
    }, { always: true });
  },
};
