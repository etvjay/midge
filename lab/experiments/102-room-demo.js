import http from 'node:http';
import crypto from 'node:crypto';
import { createDemoRoom, DEMO_CONTRACT } from '../../src/roost-service/demo-room.js';
import { computeAllocationsHash, computeChargesHash } from '../../src/roost-service/hosted-roost.js';
import { createRoomHandler } from '../../src/roost-service/room-http.js';
import { createRpc } from '../../src/mcp/rpc.js';
import { FlyMcpServer } from '../../src/mcp/server.js';
import { RoomsClient } from '../../src/sdk/rooms.js';
import { RoomError } from '../../src/roost-service/room-service.js';

const KEY = 'demo-coordinator-key-0123456789ab';
const KINDS = ['ballot', 'pool', 'auction', 'quote', 'cross', 'rfq', 'payrun'];
const verifies = (settlePublicKey, round, a) => {
  const message = `${round.contractId}:${a.syndicate_id}:${round.epoch}:${a.attestation_nonce}:${computeAllocationsHash(a.allocations)}:${computeChargesHash(a.charges)}:${a.aggregate_order_hash}`;
  const spki = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(settlePublicKey, 'hex')]);
  return crypto.verify(null, Buffer.from(message, 'utf8'), crypto.createPublicKey({ key: spki, format: 'der', type: 'spki' }), Buffer.from(a.enclave_signature, 'hex'));
};
const sum = (xs) => xs.reduce((a, x) => a + BigInt(x.amount), 0n);
const textOf = (r) => JSON.parse(r.result.content[0].text);

export default {
  id: 'E-ROOMSERVICE-06',
  title: 'runRoom slice 6: a practice room that runs all seven kinds end to end, is plainly a simulation, holds no real key, and gives the same settlement through every door',
  tier: 'offline',
  requires: [],
  hypothesis: 'Predictions are in docs/lab/PROGRAMME_PLAN.md, written before any code. createDemoRoom gives a labelled-simulation room with generated member keys; all seven kinds run through it, charges equal payouts, signatures verify; the same vote through the service, HTTP, the SDK and MCP gives the same settlement; it refuses a real contract; pay-run statements open only for their own reader. The failure that must not happen: a real or reusable key held by the demo, a demo round accepted for a real contract, or the demo claiming privacy it does not give.',
  limits: ['Offline. The room is a simulation: its host key is ephemeral and its settlements are valid for no contract. Nothing here touches a chain.', 'Not a browser bundle: it runs on Node. A browser build is a later step.', 'The "hides" and "reveals" texts are written by hand per scenario; only some are checked mechanically (listed in the steps).', 'One operator plays every member.'],
  async run(ctx) {
    await ctx.step('it says it is a simulation, and holds no secret anyone can read', async (s) => {
      const demo = createDemoRoom(); const d = demo.service.describe();
      s.assert('describe says simulated', d.simulated === true);
      s.assert('and carries a plain notice that it is a simulation valid for no contract', /SIMULATION/.test(d.notice) && /no contract|any contract|real/i.test(d.notice), { actual: d.notice });
      s.assert('seven programs', d.programs.length === 7);
      demo.signInput('m1.demo', { choice: 'A' });
      const text = JSON.stringify({ d, members: demo.members(), scenarios: Object.keys(demo.scenarios) });
      s.assert('nothing it exposes names or contains a secret key (a NEAR secret key is ed25519: plus about 88 characters; a public key is about 44)', !/secretKey|privateKey|secretX25519|ed25519:[A-Za-z0-9]{80,}/.test(text), { actual: text.slice(0, 200) });
      s.assert('a public key it does expose is the short form', demo.members().every((m) => /^ed25519:[1-9A-HJ-NP-Za-km-z]{40,50}$/.test(m.publicKey)), { actual: demo.members()[0]?.publicKey });
      s.assert('members are listed by public key only', demo.members().every((m) => m.id && m.publicKey && !('secretKey' in m)));
      s.assert('its contract is the fixed demo contract', demo.round().contractId === DEMO_CONTRACT && DEMO_CONTRACT.endsWith('.invalid'));
      const other = createDemoRoom();
      s.assert('two demo rooms have different host keys (nothing is reusable)', other.service.describe().settlePublicKey !== d.settlePublicKey);
    });

    await ctx.step('it refuses to be used for a real contract', async (s) => {
      const demo = createDemoRoom(); let err = null;
      try { demo.service.open({ contractId: 'c.fly-1793636729.testnet', syndicateId: 'x', epoch: 1, roundNonce: 'ab'.repeat(32) }); } catch (e) { err = e; }
      s.assert('opening a round for the real testnet contract is INVALID_PARAMS', err instanceof RoomError && err.code === 'INVALID_PARAMS', { actual: err?.message });
      s.assert('and the message says why', /demo/i.test(err?.message || ''));
      s.assert('the demo contract itself is accepted', demo.service.open(demo.round()).contractId === DEMO_CONTRACT);
      let err2 = null; try { demo.service.open({ ...demo.round(), contractId: `x${DEMO_CONTRACT}` }); } catch (e) { err2 = e; }
      s.assert('a contract that merely ends like the demo one is refused', err2?.code === 'INVALID_PARAMS');
    });

    for (const kind of KINDS) {
      await ctx.step(`${kind}: runs end to end; charges equal payouts; the signature verifies`, async (s) => {
        const demo = createDemoRoom(); const sc = demo.scenarios[kind];
        s.assert('the scenario has a title, a plain description, and what it hides and reveals', sc.title && sc.description.length > 30 && sc.hides.length > 10 && sc.reveals.length > 10, { actual: Object.keys(sc) });
        const run = await demo.runScenario(kind);
        s.assert('it decided and produced a contract call', run.result.settlement?.method === 'settle_batch_charged', { actual: run.result.outcome });
        const a = run.result.settlement.args;
        s.assert('the charges add up to exactly the payouts (the contract requires it)', sum(a.charges) === sum(a.allocations) && sum(a.allocations) > 0n, { actual: [String(sum(a.charges)), String(sum(a.allocations))] });
        s.assert('the signature verifies against the demo host\'s key', verifies(demo.service.describe().settlePublicKey, demo.round(), a));
        s.assert('it reports the sealed inputs it used (what the members typed)', run.sealed.length >= 1 && run.sealed.every((x) => x.member && x.body));
        s.assert('and the public events the round produced, in order', run.publicEvents[0].type === 'round_opened' && run.publicEvents.at(-1).type === 'round_run' && run.publicEvents.filter((e) => e.type === 'input_accepted').length === run.sealed.length, { actual: run.publicEvents.map((e) => e.type) });
      });
    }

    await ctx.step('what an observer sees: the vote hides who voted what; the pool honestly shows each amount', async (s) => {
      const demo = createDemoRoom();
      const vote = await demo.runScenario('ballot');
      const seen = JSON.stringify({ events: vote.publicEvents, outcome: vote.result.outcome, settlement: vote.result.settlement });
      const choices = vote.sealed.map((x) => x.body.choice);
      s.assert('for the vote, no voter\'s choice is attributable: nothing links a member to A, B or abstain', !vote.sealed.some((x) => new RegExp(`"${x.member}"[^}]{0,40}"(A|B|abstain)"`).test(seen)) && !/"choice"/.test(seen), { actual: seen.slice(0, 200) });
      s.assert('and no tally or count per option appears', !/tally|counts|turnout|votes/.test(seen));
      s.assert('the vote\'s reveals text admits the charges name every voter', /every voter|each voter|who took part/i.test(demo.scenarios.ballot.reveals), { actual: demo.scenarios.ballot.reveals });
      const pool = await demo.runScenario('pool');
      const amounts = pool.sealed.map((x) => x.body.amount); const charges = pool.result.settlement.args.charges;
      s.assert('for the pool, the per-member charges equal what each member sealed, so an observer learns every amount', charges.length === amounts.length && pool.sealed.every((x, i) => { const c = charges.find((y) => y.member === x.member); return c && BigInt(c.amount) === BigInt(Math.round(Number(x.body.amount) * 1e6)) * 10n ** 18n; }), { actual: charges });
      s.assert('and the pool\'s reveals text says so in plain words', /amount/i.test(demo.scenarios.pool.reveals) && /each|every|per.member/i.test(demo.scenarios.pool.reveals), { actual: demo.scenarios.pool.reveals });
    });

    await ctx.step('a pay run\'s statements open only for their own reader', async (s) => {
      const demo = createDemoRoom(); const run = await demo.runScenario('payrun'); const st = run.result.statements;
      const payees = Object.keys(st.payees);
      s.assert('there is one statement per payee, one for the employer, one for the auditor', payees.length === 4 && st.employer && st.auditor);
      const mine = demo.readStatement(payees[0], st.payees[payees[0]].cipherHex);
      s.assert('a payee opens their own statement and sees their own receipt', mine.receipt?.payee === payees[0] && mine.receipt.gross, { actual: Object.keys(mine) });
      s.assert('another payee\'s key cannot open it', demo.readStatement(payees[1], st.payees[payees[0]].cipherHex) === null);
      const er = demo.readStatement('employer', st.employer.cipherHex);
      s.assert('the employer opens theirs and sees every line: the four payments plus the tax and benefits receipts', er.lines.length >= 4 && er.lines.filter((l) => l.receipt.kind === 'pay').length === 4, { actual: er.lines.map((l) => l.receipt.kind) });
      s.assert('a payee cannot open the employer\'s', demo.readStatement(payees[0], st.employer.cipherHex) === null);
      const au = demo.readStatement('auditor', st.auditor.cipherHex);
      s.assert('the auditor sees totals and a headcount, and no names', au.headcount === 4 && !/Alice|Bo|Cy|Di|INV-/.test(JSON.stringify(au)), { actual: au });
      s.assert('an unknown reader gets nothing', demo.readStatement('stranger', st.employer.cipherHex) === null);
    });

    await ctx.step('the same vote through the service, HTTP, the SDK and MCP gives the same settlement', async (s) => {
      const pick = (r) => ({ orderHash: r.orderHash, allocations: r.settlement.args.allocations, charges: r.settlement.args.charges, method: r.settlement.method, nonce: r.settlement.args.attestation_nonce, outcome: r.outcome });
      // 1. the service directly
      const a = createDemoRoom(); const direct = pick((await a.runScenario('ballot', { round: a.round() })).result); // every surface uses the demo room's fixed first round, so the nonce can be compared too
      // 2. HTTP, driven by raw requests
      const b = createDemoRoom(); const h = createRoomHandler(b.service, { adminKey: KEY });
      const server = http.createServer(async (req, res) => { if (!(await h(req, res))) { res.writeHead(404); res.end(); } });
      await new Promise((r) => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
      try {
        const sc = b.scenarios.ballot; const round = b.round();
        const post = async (path, body, auth) => (await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(auth ? { 'x-roost-admin-key': KEY } : {}) }, body: JSON.stringify(body) })).json();
        await post('/v1/rooms/round', round, true);
        for (const x of sc.inputs) await post('/v1/rooms/inputs', b.signInput(x.member, x.body));
        const viaHttp = pick(await post('/v1/rooms/run', { program: 'ballot', params: sc.params, round }, true));
        // 3. the SDK, against a third demo room on the same kind of server
        const c = createDemoRoom(); const h2 = createRoomHandler(c.service, { adminKey: KEY });
        const server2 = http.createServer(async (req, res) => { if (!(await h2(req, res))) { res.writeHead(404); res.end(); } });
        await new Promise((r) => server2.listen(0, '127.0.0.1', r));
        try {
          const client = new RoomsClient({ baseUrl: `http://127.0.0.1:${server2.address().port}`, adminKey: KEY }); const sc2 = c.scenarios.ballot;
          await client.openRound(c.round()); for (const x of sc2.inputs) await client.submit(c.signInput(x.member, x.body));
          const viaSdk = pick(await client.run({ program: 'ballot', params: sc2.params, round: c.round() }));
          // 4. MCP
          const d = createDemoRoom(); const rpc = createRpc(new FlyMcpServer({ mode: 'model', rooms: d.service })); const sc3 = d.scenarios.ballot; const C = { coordinator: true };
          const call = (id, name, args) => rpc.handle({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }, C);
          await call(1, 'midge_open_room_round', { round: d.round() });
          for (const [i, x] of sc3.inputs.entries()) await call(2 + i, 'midge_submit_room_input', { input: d.signInput(x.member, x.body) });
          const viaMcp = pick(textOf(await call(20, 'midge_run_room', { program: 'ballot', params: sc3.params, round: d.round() })));
          const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
          s.assert('HTTP gives the service\'s order hash, payouts, charges, method, nonce and outcome', same(viaHttp, direct), { expected: direct, actual: viaHttp });
          s.assert('the SDK does too', same(viaSdk, direct));
          s.assert('and so does MCP', same(viaMcp, direct));
        } finally { server2.closeAllConnections?.(); await new Promise((r) => server2.close(r)); }
      } finally { server.closeAllConnections?.(); await new Promise((r) => server.close(r)); }
    });

    await ctx.step('a scenario can be replayed in a fresh round, and rooms do not share state', async (s) => {
      const demo = createDemoRoom(); const first = await demo.runScenario('pool'); const second = await demo.runScenario('pool');
      s.assert('running the same scenario twice works (each run opens its own round)', second.result.settlement !== null);
      s.assert('with a different round nonce each time', first.result.settlement.args.attestation_nonce !== second.result.settlement.args.attestation_nonce);
      s.assert('so the second signature is not a replay of the first', first.result.settlement.args.enclave_signature !== second.result.settlement.args.enclave_signature);
      s.assert('each run reports only its own events: round_opened, one per input, round_run', second.publicEvents.length === 2 + second.sealed.length && second.publicEvents[0].type === 'round_opened' && second.publicEvents[0].data.roundNonce === second.result.settlement.args.attestation_nonce, { actual: second.publicEvents.map((e) => e.type) });
      const a = createDemoRoom(); const b = createDemoRoom(); await a.runScenario('ballot');
      s.assert('another demo room is untouched by it', b.service.describe().settlePublicKey !== a.service.describe().settlePublicKey && (await b.runScenario('ballot')).result.settlement !== null);
      let unknown = null; try { await demo.runScenario('raffle'); } catch (e) { unknown = e; }
      s.assert('an unknown scenario is UNKNOWN_PROGRAM', unknown?.code === 'UNKNOWN_PROGRAM');
    });
  },
};
