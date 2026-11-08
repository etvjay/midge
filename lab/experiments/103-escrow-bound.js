import { RoomService, RoomError } from '../../src/roost-service/room-service.js';
import { HostedRoost } from '../../src/roost-service/hosted-roost.js';
import { createEscrowReader } from '../../src/roost-service/escrow-reader.js';
import { sealToModel } from '../../src/enclave/e2ee.js';

const provider = { simulated: true, attest: async () => Buffer.from('lab-local-no-hardware'), info: async () => ({}) };
const ROUND = { contractId: 'c.near', syndicateId: 'pool', epoch: 1, roundNonce: 'ab'.repeat(32) };
const YOCTO = (n) => `${n}000000000000000000000000`; // n NEAR in yoctoNEAR
const NOW = 1_800_000_000_000;

/** A JSON-RPC provider: the chain at `height`, balances per account, the group's exit timing, and ways to misbehave. */
function provider_(url, { balances, height = 4000, exits = { epoch_start_block: 100, timeout_blocks: 10 }, fail = false, hang = false, behindMs = 0, tell = null } = {}) {
  return async (reqUrl, init) => {
    if (reqUrl !== url) return null;
    if (fail) throw new Error('provider down');
    if (hang) return new Promise(() => {});
    const body = JSON.parse(init.body);
    const j = (o) => ({ ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, ...o }) });
    if (body.method === 'block') return j({ result: { header: { height, hash: `HASH${height}`, timestamp: String((NOW - behindMs) * 1_000_000) } } });
    const m = body.params.method_name;
    if (m === 'get_syndicate') return j({ result: { result: [...Buffer.from(JSON.stringify({ ...exits, release_policy: { settle_deadline_block: 9_000_000 } }))] } });
    const who = JSON.parse(Buffer.from(body.params.args_base64, 'base64').toString()).account_id;
    const v = tell ? tell(who) : (balances[who] ?? '0');
    return j({ result: { result: [...Buffer.from(JSON.stringify(v))] } });
  };
}
const net = (...ps) => async (url, init) => { for (const p of ps) { const r = await p(url, init); if (r) return r; } throw new Error(`no provider at ${url}`); };
const reader = (fetchImpl, extra = {}) => createEscrowReader({ rpcUrls: ['https://a.rpc', 'https://b.rpc'], contractId: 'c.near', fetchImpl, now: () => NOW, timeoutMs: 80, ...extra });
const BAL = { 'a.near': YOCTO(1), 'b.near': '0', 'c.near': YOCTO(1) };

const sealed = (host, id, body) => host.submitSealedIntent({ flyerId: id, cipherTextHex: sealToModel(JSON.stringify(body), host.intentPublicKey) });
async function poolRoom(escrowReader, bidders = ['a.near', 'b.near', 'c.near']) {
  const host = new HostedRoost({ provider, deterministicOrder: true, escrowReader });
  const svc = new RoomService({ host }); svc.open(ROUND);
  for (const id of bidders) sealed(host, id, { amount: '0.01' });
  return { host, svc };
}
const runPool = (svc) => svc.run({ program: 'pool', params: { recipient: 'r.near', min: '0' }, round: ROUND });
const codeOf = async (fn) => { try { await fn(); return null; } catch (e) { return e instanceof RoomError ? e.code : `NOT_A_ROOM_ERROR:${e?.message}`; } };

export default {
  id: 'E-ESCROWBOUND-01',
  title: 'Escrow-bound charged rounds: the real reader against stub providers, the real host and service',
  tier: 'offline',
  requires: [],
  hypothesis: 'Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. The room reads, from several providers at one block, what each bidder holds, leaves out anyone who cannot cover their worst case, fails closed when the chain cannot be read, says when no member could leave before the payout lands, and lets the coordinator give up a signed round. This narrows rejections; it does not make them impossible.',
  limits: ['The providers are stubs, so this shows what the room does with their answers, not that real providers answer this way (E-ESCROWBOUND-LIVE-01 does that on testnet).', 'It cannot show the race itself: a member leaving between the read and the payout needs the real contract.', 'The service and host are real; the contract is not in this experiment.'],
  async run(ctx) {
    await ctx.step('prediction 1: a bidder with no escrow is left out and named; the others settle; the block is in the signed order hash', async (s) => {
      const { svc } = await poolRoom(reader(net(provider_('https://a.rpc', { balances: BAL }), provider_('https://b.rpc', { balances: BAL }))));
      const res = await runPool(svc);
      s.assert('only the unfunded bidder is left out, by account', JSON.stringify(res.outcome.excludedForEscrow) === JSON.stringify(['b.near']), { actual: res.outcome.excludedForEscrow });
      s.assert('the charges are the other two', JSON.stringify(res.settlement.args.charges.map((c) => c.member).sort()) === JSON.stringify(['a.near', 'c.near']), { actual: res.settlement.args.charges });
      s.assert('the payout is exactly the sum of those charges', BigInt(res.settlement.args.allocations[0].amount) === res.settlement.args.charges.reduce((a, c) => a + BigInt(c.amount), 0n));
      s.assert('the outcome carries the block that was read', res.outcome.escrowBlock?.height === 4000 && res.outcome.escrowBlock?.hash === 'HASH4000', { actual: res.outcome.escrowBlock });
      s.assert('the left-out list is account ids and nothing else', res.outcome.excludedForEscrow.every((x) => typeof x === 'string' && /\.near$/.test(x)));
      const other = await poolRoom(reader(net(provider_('https://a.rpc', { balances: BAL, height: 4001 }), provider_('https://b.rpc', { balances: BAL, height: 4001 }))));
      const res2 = await runPool(other.svc);
      s.assert('another block gives another signed order hash', res2.orderHash !== res.orderHash, { a: res.orderHash, b: res2.orderHash });
    });

    await ctx.step('prediction 2: a provider that is down, slow, behind or disagrees makes the run UNAVAILABLE and keeps the queue', async (s) => {
      const cases = {
        'down': [provider_('https://a.rpc', { balances: BAL }), provider_('https://b.rpc', { balances: BAL, fail: true })],
        'never answers': [provider_('https://a.rpc', { balances: BAL }), provider_('https://b.rpc', { balances: BAL, hang: true })],
        'a minute behind': [provider_('https://a.rpc', { balances: BAL, behindMs: 61_000 }), provider_('https://b.rpc', { balances: BAL })],
        'disagrees about a balance': [provider_('https://a.rpc', { balances: BAL }), provider_('https://b.rpc', { balances: { ...BAL, 'a.near': YOCTO(2) } })],
        'disagrees about the exit timing': [provider_('https://a.rpc', { balances: BAL }), provider_('https://b.rpc', { balances: BAL, exits: { epoch_start_block: 100, timeout_blocks: 99 } })],
      };
      for (const [name, nodes] of Object.entries(cases)) {
        const { host, svc } = await poolRoom(reader(net(...nodes)));
        const code = await codeOf(() => runPool(svc));
        s.assert(`${name}: UNAVAILABLE`, code === 'UNAVAILABLE', { actual: code });
        s.assert(`${name}: the three bids are still queued and nothing was signed`, host.sealedIntents.length === 3 && host.aggregate === null);
      }
    });

    await ctx.step('prediction 3: raceFree only when no member could leave before the payout lands', async (s) => {
      const free = async (exits) => { const { host } = await poolRoom(reader(net(provider_('https://a.rpc', { balances: BAL, exits }), provider_('https://b.rpc', { balances: BAL, exits })))); return (await host.bindEscrow()).raceFree; };
      s.assert('exit opens at block 4100 (the timer ends 100 blocks on): race-free', (await free({ epoch_start_block: 4090, timeout_blocks: 10 + 90 })) === true);
      s.assert('exit opened long ago (block 110): not race-free', (await free({ epoch_start_block: 100, timeout_blocks: 10 })) === false);
      s.assert('exit opens at 4030, exactly height + 30: not race-free (the margin is strict)', (await free({ epoch_start_block: 4020, timeout_blocks: 10 })) === false);
      s.assert('exit opens at 4031: race-free', (await free({ epoch_start_block: 4021, timeout_blocks: 10 })) === true);
    });

    await ctx.step('prediction 4: a signed round cannot be re-opened; abandon makes it possible and leaves a record', async (s) => {
      const { host, svc } = await poolRoom(reader(net(provider_('https://a.rpc', { balances: BAL }), provider_('https://b.rpc', { balances: BAL }))));
      const first = await runPool(svc);
      s.assert('the room signed a settlement', Boolean(first.settlement));
      s.assert('a different run in the same round is refused (ALREADY_SIGNED)', (await codeOf(() => svc.run({ program: 'pool', params: { recipient: 'r.near', min: '0.5' }, round: ROUND }))) === 'ALREADY_SIGNED');
      s.assert('re-opening the same round is refused', (await codeOf(() => svc.open(ROUND))) !== null);
      const a = svc.abandon(ROUND);
      s.assert('abandon succeeds and names what was given up', a.abandoned === true && a.orderHash === first.orderHash, { actual: a });
      s.assert('and it is on record in the host', host.abandoned.length === 1 && host.abandoned[0].orderHash === first.orderHash);
      s.assert('abandoning again has nothing to abandon', (await codeOf(() => svc.abandon(ROUND))) === 'INVALID_PARAMS');
      sealed(host, 'a.near', { amount: '0.02' }); sealed(host, 'c.near', { amount: '0.01' }); // members re-submit, here with a changed bid
      const second = await runPool(svc);
      s.assert('the round can sign a new settlement, and with the changed bid it is a different one', Boolean(second.settlement) && second.orderHash !== first.orderHash);
    });

    await ctx.step('prediction 5: a roll member who never voted and cannot pay is left out of a ballot', async (s) => {
      const { keyCheck, ROLL, VOTE_PARAMS, ROUND: R2, voteInputs } = await import('../lib/room-fixtures.js');
      const bal = Object.fromEntries(ROLL.map((m) => [m, YOCTO(1)])); bal['m5.near'] = '0';
      const host = new HostedRoost({ provider, requireSignedInputs: true, accountKeyCheck: keyCheck, deterministicOrder: true, escrowReader: reader(net(provider_('https://a.rpc', { balances: bal }), provider_('https://b.rpc', { balances: bal }))) });
      const svc = new RoomService({ host }); svc.open(R2);
      for (const i of voteInputs(host).slice(0, 4)) await svc.submit(i);
      const res = await svc.run({ program: 'ballot', params: VOTE_PARAMS, round: R2 });
      s.assert('m5 is left out although they never voted', JSON.stringify(res.outcome.excludedForEscrow) === JSON.stringify(['m5.near']), { actual: res.outcome.excludedForEscrow });
      s.assert('four members are charged a share each', res.settlement.args.charges.length === 4);
    });
  },
};
