import crypto from 'node:crypto';
import { connect, fmt, near } from '../lib/near.js';
import { createMembers, teardownMembers, accountExists } from '../lib/members.js';
import { chainRoundFlow } from '../flows/chain-round.js';
import { HostedRoost } from '../../src/roost-service/hosted-roost.js';
import { createRoostServer } from '../../src/roost-service/server.js';
import { HostedRoostClient } from '../../src/roost-service/client.js';

export default {
  id: 'E-CHAIN-ROUND-LOCAL',
  title: 'A full syndicate round on NEAR testnet against a local hosted Roost',
  tier: 'testnet',
  requires: ['near-key', 'network'],
  hypothesis: 'A syndicate hatched with a hosted Roost\'s settlement key can be funded, can aggregate sealed bids exactly, and is settled on chain only by that Roost for allocations its own aggregate supports. A replay, a payout outside the policy and a signature from another key are all rejected on chain without moving funds, and members can always take their own money back with hatch_out when the Roost stalls.',
  limits: [
    'The Roost runs on this machine with a simulated attestation provider, so this proves the CHAIN LOGIC and the Roost\'s signing rules. It proves nothing about hardware: see E-HOSTED-LIVE-01 for a real TDX VM.',
    'All members, the coordinator and the recipient are controlled by one operator with keys derived from one master key. It shows the contract\'s rules, not independent users acting independently.',
    'Testnet only, one run on one date. The contract has not been audited by a third party.',
    'Rejections are shown by on-chain state staying unchanged, not by matching the contract\'s error text.',
  ],
  async run(ctx) {
    const chain = await connect(ctx.rootDir);
    const provider = { simulated: true, attest: async () => Buffer.from('lab-local-no-hardware'), info: async () => ({}) };
    const hosted = new HostedRoost({ provider });
    const adminKey = crypto.randomBytes(24).toString('hex');
    const server = createRoostServer({ roost: hosted, adminKey });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      const member = new HostedRoostClient({ baseUrl: base });
      const coordinator = new HostedRoostClient({ baseUrl: base, adminKey });
      const session = await member.getSession();
      ctx.recorder.event('note', { exp: ctx.id, text: `local hosted Roost on ${base}; simulated=${session.simulated}; settle key ${session.settlePublicKey.slice(0, 16)}…` });
      const tag = Date.now().toString(36);
      let members = null; let flow = null; let countBefore = null; let masterBefore = null;
      try {
        await ctx.step('create fresh member accounts for this run (three flyers and a recipient)', async (s) => {
          countBefore = Number(await chain.view('get_syndicate_count', {}));
          masterBefore = await chain.balance(chain.master);
          const made = await createMembers(chain, { rootDir: ctx.rootDir, tag: `l${tag.slice(-5)}`, count: 4, fundNear: '0.15', names: ['a', 'b', 'c', 'r'] });
          members = { flyers: made.slice(0, 3), recipient: made[3] };
          s.assert('four accounts exist and are funded', (await Promise.all(made.map((m) => accountExists(chain, m.id)))).every(Boolean));
          s.observe('accounts', made.map((m) => m.id));
        }, { critical: true });
        flow = await chainRoundFlow(ctx, { chain, roost: { member, coordinator, session }, runTag: tag, members });
      } finally {
        await ctx.step('teardown: prune the finished syndicates, compact the indexes, delete the accounts back into the master', async (s) => {
          if (!members) { s.assert('nothing to tear down (no accounts were created)', true); return; }
          const rep = await teardownMembers(chain, { rootDir: ctx.rootDir, members: [...members.flyers, members.recipient], pruneIds: flow?.syndicates || [] });
          s.observe('teardown', { pruned: rep.pruned.length, notPruned: rep.notPruned, compacted: rep.compacted, deleted: rep.deleted.length, failed: rep.failed });
          s.assert('every syndicate the run created was pruned (all were Settled or AbortedRefunded)', rep.notPruned.length === 0 && rep.pruned.length === (flow?.syndicates || []).length, { actual: rep });
          s.assert('all four accounts were deleted', rep.deleted.length === 4 && rep.failed.length === 0, { actual: rep.failed });
          s.assert('none of them exists any more', (await Promise.all([...members.flyers, members.recipient].map((m) => accountExists(chain, m.id)))).every((x) => !x));
          const countAfter = Number(await chain.view('get_syndicate_count', {}));
          s.assert('the contract holds exactly as many syndicate records as before the run (the run left no state behind)', countAfter === countBefore, { expected: countBefore, actual: countAfter });
          const cost = masterBefore - (await chain.balance(chain.master));
          s.observe('net cost to the master account (NEAR)', fmt(cost, 5));
          s.assert('the whole run cost the master account less than 0.05 NEAR net', cost < near('0.05'), { actual: fmt(cost, 5) });
        }, { always: true });
      }
    } finally { server.close(); }
  },
};
