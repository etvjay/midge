import crypto from 'node:crypto';
import { connect } from '../lib/near.js';
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
      await chainRoundFlow(ctx, { chain, roost: { member, coordinator, session }, runTag: Date.now().toString(36) });
    } finally { server.close(); }
  },
};
