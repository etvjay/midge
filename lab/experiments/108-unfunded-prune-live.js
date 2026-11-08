import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { connect, near, computePolicyHash } from '../lib/near.js';
import { createMembers, teardownMembers } from '../lib/members.js';

export default {
  id: 'E-UNFUNDED-PRUNE-LIVE-01',
  title: 'A never-funded group can be removed by its creator, not early by a stranger, and a funded group is never removed this way: on the real contract',
  tier: 'testnet',
  requires: ['near-key', 'network'],
  hypothesis: 'Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. After the redeploy the chain runs the recorded build; an unfunded group reads Unfunded; a stranger cannot remove it early; its creator can, at once; a funded group is refused even for its creator; nothing is left behind.',
  limits: [
    'The path after the waiting period (anyone may remove a never-funded group after about seven days) cannot be reached on a real chain in a test; it is shown by the unit tests only.',
    'One operator controls every account.',
  ],
  async run(ctx) {
    const chain = await connect(ctx.rootDir);
    const coord = chain.sub('c');
    const tag = Date.now().toString(36);
    const bare = `uf-${tag}`; const funded = `ufd-${tag}`;
    const deployments = JSON.parse(fs.readFileSync(path.join(ctx.rootDir, 'docs/canonical/deployments.json'), 'utf8')).deployments;
    const view = (id) => chain.view('get_syndicate', { syndicate_id: id });
    const phase = (id) => chain.view('get_group_phase', { syndicate_id: id });
    let people; let countBefore;
    const hatch = (id, recipient, policy) => chain.send(coord.account, 'hatch', { syndicate_id: id, syndicate_type: 'FLASH', quorum_threshold: 1, max_spend_near: 1, enclave_public_key: crypto.randomBytes(32).toString('hex'), expected_code_hash: crypto.randomBytes(32).toString('hex'), timeout_blocks: 16, payout_recipient: recipient.id, release_policy: policy }, { deposit: near('0.01'), gas: 40000000000000n, label: `hatch ${id}` });

    await ctx.step('prediction 1: the chain runs the recorded build and holds the same groups', async (s) => {
      const hash = (await chain.provider.query({ request_type: 'view_code', finality: 'final', account_id: chain.coordinatorId })).hash;
      s.assert('the on-chain code hash is the last recorded deployment', hash === deployments[deployments.length - 1].codeHash, { actual: hash, expected: deployments[deployments.length - 1].codeHash });
      countBefore = Number(await chain.view('get_syndicate_count', {}));
      s.observe('groups on the contract', countBefore);
    }, { critical: true });

    let recipient; let policy;
    await ctx.step('set up: a stranger, a depositor, a recipient, and one group nobody funds', async (s) => {
      people = await createMembers(chain, { rootDir: ctx.rootDir, tag: `u${tag.slice(-5)}`, count: 3, fundNear: '0.15' });
      recipient = people[2];
      policy = { allowed_recipients: [recipient.id], max_release_bps_per_epoch: 10000, settle_deadline_block: 500000000 };
      const h = await hatch(bare, recipient, policy);
      s.assert('the group was hatched', h.ok, { actual: h.error });
      await chain.waitFor(() => view(bare), { what: 'group' });
    }, { critical: true });

    await ctx.step('prediction 2: an unfunded group reads Unfunded', async (s) => {
      s.assert('the phase is Unfunded', (await phase(bare)) === 'Unfunded', { actual: await phase(bare) });
    });

    await ctx.step('prediction 3: a stranger cannot remove it early', async (s) => {
      const r = await chain.send(people[0].account, 'prune_syndicate', { syndicate_id: bare }, { gas: 30000000000000n, label: `stranger prunes ${bare}` });
      s.evidence('stranger', { ok: r.ok, error: r.error, hash: r.hash });
      s.assert('the call was refused', !r.ok, { actual: r.ok });
      s.assert('with the never-funded message', /never-funded/.test(r.error || ''), { actual: r.error });
      s.assert('and the group is still there', (await view(bare)) !== null);
    });

    await ctx.step('prediction 4: its creator can remove it at once', async (s) => {
      const r = await chain.send(coord.account, 'prune_syndicate', { syndicate_id: bare }, { gas: 30000000000000n, label: `creator prunes ${bare}` });
      s.evidence('creator', { ok: r.ok, error: r.error, hash: r.hash, explorer: r.explorer });
      s.assert('the call succeeded', r.ok, { actual: r.error });
      await chain.waitFor(async () => (await view(bare)) === null, { what: 'removal' });
      s.assert('the group is gone', (await view(bare)) === null);
      s.assert('and its phase is null', (await phase(bare)) === null);
      const mine = await chain.view('get_syndicates_by_member', { account_id: chain.coordinatorId, from_index: 0, limit: 50 });
      s.assert('the creator\'s index no longer lists it', !(mine || []).some((g) => g.id === bare));
    });

    await ctx.step('prediction 5: a funded group is not removed, even by its creator', async (s) => {
      const h = await hatch(funded, recipient, policy);
      s.assert('a second group was hatched', h.ok, { actual: h.error });
      await chain.waitFor(() => view(funded), { what: 'group' });
      const d = await chain.send(people[1].account, 'deposit', { syndicate_id: funded, policy_hash: computePolicyHash(policy, 16) }, { deposit: near('0.02'), gas: 30000000000000n, label: `deposit ${people[1].id}` });
      s.assert('a member deposited', d.ok, { actual: d.error });
      await chain.waitFor(async () => BigInt((await view(funded)).total_escrow) === near('0.02'), { what: 'deposit' });
      s.assert('it is Open', (await phase(funded)) === 'Open', { actual: await phase(funded) });
      const r = await chain.send(coord.account, 'prune_syndicate', { syndicate_id: funded }, { gas: 30000000000000n, label: `creator prunes funded ${funded}` });
      s.evidence('refused', { ok: r.ok, error: r.error, hash: r.hash });
      s.assert('the call was refused', !r.ok, { actual: r.ok });
      s.assert('and the funded group is untouched', (await view(funded)) !== null && BigInt((await view(funded)).total_escrow) === near('0.02'));
    });

    await ctx.step('prediction 6: teardown: exit, prune, delete the accounts', async (s) => {
      if (!people) { s.assert('nothing to tear down', true); return; }
      const rep = await teardownMembers(chain, { rootDir: ctx.rootDir, members: people, pruneIds: [funded], exitWaitMs: 120000 });
      s.observe('teardown', { pruned: rep.pruned.length, notPruned: rep.notPruned, deleted: rep.deleted.length, kept: rep.kept, failed: rep.failed });
      s.assert('every account was deleted and the funded group removed', rep.failed.length === 0 && rep.kept.length === 0 && rep.notPruned.length === 0, { actual: rep });
      s.assert('the contract holds the groups it started with', Number(await chain.view('get_syndicate_count', {})) === countBefore, { expected: countBefore });
    }, { always: true });
  },
};
