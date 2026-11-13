import http from 'node:http';
import { createQueue, QueueRefusal } from '../../src/playground/queue.js';
import { createReviewGate } from '../../src/playground/review-gate.js';
import { createRound } from '../../src/playground/round.js';
import { createPlaygroundService } from '../../src/playground/service.js';
import { defaultLines } from '../../src/playground/defaults.js';
import { fakeChain, fakeRoom, FUNDER } from '../../src/playground/fakes.js';
import { generateClientKey } from '../../src/enclave/e2ee.js';
import { nearKeyPair, signInputWithNearKey } from '../../src/roost-service/signed-input.js';

const BAL = String(10n ** 25n);
const VKEY = 'ed25519:6E8bkzXvEhS1gYBdeA8tqXbcmW6a9xQe3d4TqVkVdMAv';
const ADMIN = 'ADMIN-KEY-THAT-MUST-NEVER-LEAK';
const refusal = (fn) => { try { fn(); return null; } catch (e) { return e instanceof QueueRefusal ? e.reason : `other: ${e.message}`; } };
const clock = () => { const c = { t: 1_800_000_000_000, now: () => c.t, advance: (ms) => { c.t += ms; } }; return c; };

export default {
  id: 'E-PLAYGROUND-SERVICE-01',
  title: 'The playground service with a fake chain and a fake room: the queue and its limits, the model gate, the round with its cleanup, and the HTTP rules',
  tier: 'offline',
  requires: [],
  hypothesis: 'Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. A second tab from one address gets the same ticket; the hourly, daily, line-length and funder limits refuse with their reasons; a round starts only for lines a model has just reviewed; the round settles with exact books and leaves only the visitor\'s account; an abandoned, failed or unsigned round gives the deposit back and cleans up; and the service sends cross-site headers only to the site\'s origin and never reveals the room\'s admin key.',
  limits: ['Offline: the chain and the room are stand-ins that copy the contract\'s hatch, deposit, settle, exit and prune rules and the room\'s refusal to sign before approval. Nothing here shows the real contract or a real room behaving that way; E-PLAYGROUND-LOCAL-01 and E-PLAYGROUND-LIVE-01 do.'],
  async run(ctx) {
    await ctx.step('prediction 1: the queue gives one turn to an address and refuses with a reason when a limit is reached', async (s) => {
      let c = clock(); let q = createQueue({ now: c.now });
      const a = q.join({ address: '1.1.1.1', funderBalanceYocto: BAL }); const again = q.join({ address: '1.1.1.1', funderBalanceYocto: BAL }); const other = q.join({ address: '2.2.2.2', funderBalanceYocto: BAL });
      s.assert('a second tab from one address gets the same ticket and no extra place in the line', again.ticket === a.ticket && other.position === 2, { actual: { a, again, other } });
      c = clock(); q = createQueue({ now: c.now });
      for (let i = 0; i < 3; i += 1) { const t = q.join({ address: '1.1.1.1', funderBalanceYocto: BAL }); q.next(); q.finish(t.ticket, { ok: true }); }
      s.assert('the fourth round from one address in an hour is refused as address-limit', refusal(() => q.join({ address: '1.1.1.1', funderBalanceYocto: BAL })) === 'address-limit');
      c.advance(61 * 60 * 1000);
      s.assert('and is allowed again after the hour', refusal(() => q.join({ address: '1.1.1.1', funderBalanceYocto: BAL })) === null);
      c = clock(); q = createQueue({ now: c.now, perAddressPerHour: 1000 });
      for (let i = 0; i < 60; i += 1) { const t = q.join({ address: `10.0.${i >> 8}.${i & 255}`, funderBalanceYocto: BAL }); q.next(); q.finish(t.ticket, { ok: true }); }
      s.assert('the 61st round of a day is refused as daily-cap', refusal(() => q.join({ address: '9.9.9.9', funderBalanceYocto: BAL })) === 'daily-cap');
      q = createQueue({ now: clock().now }); q.join({ address: '0.0.0.0', funderBalanceYocto: BAL }); q.next();
      for (let i = 1; i <= 8; i += 1) q.join({ address: `1.1.1.${i}`, funderBalanceYocto: BAL });
      s.assert('a ninth waiting ticket is refused as queue-full', refusal(() => q.join({ address: '1.1.1.9', funderBalanceYocto: BAL })) === 'queue-full');
      q = createQueue({ now: clock().now, funderFloor: String(2n * 10n ** 24n) });
      s.assert('a funder balance under the floor is refused as funder-low, and no ticket exists afterwards', refusal(() => q.join({ address: '1.1.1.1', funderBalanceYocto: String(10n ** 24n) })) === 'funder-low');
      c = clock(); q = createQueue({ now: c.now });
      const x = q.join({ address: '1.1.1.1', funderBalanceYocto: BAL }); const y = q.join({ address: '2.2.2.2', funderBalanceYocto: BAL }); q.next();
      c.advance(11 * 60 * 1000); q.touch(y.ticket);
      s.assert('an unsigned active ticket expires after ten minutes and the next ticket becomes active', JSON.stringify(q.sweep()) === JSON.stringify([x.ticket]) && q.next() === y.ticket);
    });

    await ctx.step('prediction 2: a round can start only for lines a model has just reviewed', async (s) => {
      const gate = createReviewGate();
      const good = { used: true, findings: [], receipt: {} };
      const lines = defaultLines();
      s.assert('the gate is closed before any review', gate.allow({ session: 'a', lines }).ok === false);
      gate.reserve({ session: 'a' }); gate.record({ session: 'a', lines, result: good });
      s.assert('it opens for the same lines', gate.allow({ session: 'a', lines }).ok === true);
      const edited = defaultLines(); edited[2].tax = '0';
      s.assert('one edited value closes it with a plain reason', gate.allow({ session: 'a', lines: edited }).ok === false && /changed after the last review/.test(gate.allow({ session: 'a', lines: edited }).reason));
      let threw = false; gate.reserve({ session: 'b' }); try { gate.record({ session: 'b', lines, result: { used: false, reason: 'the model did not answer' } }); } catch { threw = true; }
      s.assert('a review that was not used never opens the gate', threw && gate.allow({ session: 'b', lines }).ok === false);
      const g2 = createReviewGate(); let seventh = null;
      for (let i = 0; i < 6; i += 1) g2.reserve({ session: 'x' });
      try { g2.reserve({ session: 'x' }); } catch (e) { seventh = e.message; }
      s.assert('the seventh review in a session is refused', /6 reviews/.test(seventh || ''), { actual: seventh });
      const c = clock(); const g3 = createReviewGate({ now: c.now }); let late = null;
      for (let i = 0; i < 60; i += 1) g3.reserve({ session: `s${i}` });
      try { g3.reserve({ session: 'late' }); } catch (e) { late = e.message; }
      s.assert('the 61st review in an hour is refused', /hour/.test(late || ''), { actual: late });
    });

    await ctx.step('prediction 3: the round settles with exact books and leaves only the visitor\'s account; abandoned, failed and unsigned rounds clean up', async (s) => {
      const mk = (chain = fakeChain(), room = fakeRoom({ accountKeyCheck: async (id, pk) => chain.accounts.get(id)?.publicKey === pk }), approvalTimeoutMs = 5000) => {
        const ledger = { rows: new Map(), add(r) { this.rows.set(r.id, { ...r, at: r.at ?? new Date().toISOString() }); }, remove(id) { this.rows.delete(id); }, all() { return [...this.rows.values()]; } };
        const wrapped = { getSession: (...a) => room.getSession(...a), openRound: (...a) => room.openRound(...a), submitSignedIntent: (...a) => room.submitSignedIntent(...a), approvePayrun: (...a) => room.approvePayrun(...a), signSettlement: (...a) => room.signSettlement(...a), runPayrun: (p) => room.runPayrun({ ...p, __payees: [...chain.accounts.keys()].filter((k) => /a[123]\.|v\./.test(k)) }) };
        return { chain, room, ledger, round: createRound({ chain, room: wrapped, keyCheck: async () => true, ledger, approvalTimeoutMs, sleep: async () => {} }) };
      };
      const V = nearKeyPair(); const sign = (m) => signInputWithNearKey(V.secretKey, m);
      const params = { visitorPublicKey: V.publicKey, payeeKeyHex: generateClientKey().publicKeyHex, youIndex: 3, lines: defaultLines() };
      let { chain, round, ledger } = mk();
      let refusedEarly = null; try { await round.start({ ticket: 'f'.repeat(32), ...params }); } catch (e) { refusedEarly = e.message; }
      s.assert('a round cannot start before the start-up sweep has run', /start-up/.test(refusedEarly || ''), { actual: refusedEarly });
      await round.sweepStartup();
      const t1 = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6'; const done = round.start({ ticket: t1, ...params });
      const wait = await round.waitFor(t1, 'awaiting-approval');
      s.assert('the employer deposited exactly the gross total, 0.18 NEAR', chain.groups.get(wait.round.syndicateId).escrow === 18n * 10n ** 22n, { actual: String(chain.groups.get(wait.round.syndicateId)?.escrow) });
      await round.approve({ ticket: t1, publicKey: V.publicKey, signature: sign(wait.approvalMessage) });
      const result = await done; await round.idle();
      s.assert('the round returns the settlement, the order hash, the visitor\'s sealed payslip and the visitor\'s account', result.settleTx === 'H-settle' && result.orderHash === wait.orderHash && result.payslipCipherHex === `slip-${result.visitorAccount}`, { actual: Object.keys(result) });
      s.assert('only the visitor\'s account survives cleanup, the group is pruned and the ledger is empty', [...chain.accounts.keys()].join() === result.visitorAccount && chain.groups.size === 0 && ledger.all().length === 0, { actual: [...chain.accounts.keys()] });

      ({ chain, round } = mk()); await round.sweepStartup();
      const t2 = 'b'.repeat(32); const d2 = round.start({ ticket: t2, ...params });
      const wait2 = await round.waitFor(t2, 'awaiting-approval');
      const refuseWith = async (publicKey, signature) => { try { await round.approve({ ticket: t2, publicKey, signature }); return 'accepted'; } catch (e) { return e.message; } };
      const stranger = nearKeyPair();
      const r1 = await refuseWith(V.publicKey, sign(wait2.approvalMessage.replace(wait2.orderHash, 'cd'.repeat(32))));
      const r2 = await refuseWith(stranger.publicKey, signInputWithNearKey(stranger.secretKey, wait2.approvalMessage));
      s.assert('an approval signed for a different order hash is refused by the room', /does not verify/.test(r1), { actual: r1 });
      s.assert('an approval signed with a key that is not the approver\'s is refused by the room', /is not a key of/.test(r2), { actual: r2 });
      s.assert('after both refusals nothing was settled', !chain.sent.some((x) => x.method === 'settle_batch_charged') && round.status(t2).state === 'awaiting-approval');
      round.abandon(t2); await d2.catch(() => {}); await round.idle();
      s.assert('abandoning during approval takes the deposit back out, prunes the group and leaves only the visitor\'s account', chain.groups.size === 0 && chain.sent.some((x) => x.method === 'hatch_out') && chain.accounts.size === 1, { actual: { groups: chain.groups.size, accounts: chain.accounts.size } });

      ({ chain, round } = mk(fakeChain({ failOn: 'hatch' }))); await round.sweepStartup();
      let hatchErr = null; try { await round.start({ ticket: 'c'.repeat(32), ...params }); } catch (e) { hatchErr = e.message; }
      await round.idle();
      s.assert('a failure while hatching deletes every service-held account', /hatch failed/.test(hatchErr || '') && [...chain.accounts.values()].every((a) => a.publicKey === V.publicKey), { actual: hatchErr });

      ({ chain, round } = mk(fakeChain(), fakeRoom(), 30)); await round.sweepStartup();
      let late = null; try { await round.start({ ticket: 'e'.repeat(32), ...params }); } catch (e) { late = e.message; }
      await round.idle();
      s.assert('no approval within the time limit ends the round and gives the deposit back', /did not approve/.test(late || '') && chain.groups.size === 0, { actual: late });

      ({ chain, round, ledger } = mk());
      chain.accounts.set(`old1.${FUNDER}`, {}); chain.groups.set('pg-old', { epoch: 0, nonce: 'n', escrow: 5n, status: 'Active', employer: `old1.${FUNDER}` });
      ledger.add({ kind: 'account', id: `old1.${FUNDER}` }); ledger.add({ kind: 'group', id: 'pg-old', employer: `old1.${FUNDER}` });
      await round.sweepStartup();
      s.assert('the start-up sweep cleans up what a crashed process left in the ledger', chain.accounts.size === 0 && chain.groups.size === 0 && ledger.all().length === 0);
    });

    await ctx.step('prediction 4: the service sends cross-site headers only to the site\'s origin, caps bodies, and never reveals the room\'s admin key', async (s) => {
      const ORIGIN = 'https://midge.example';
      const state = new Map();
      const round = { start: async (p) => { state.set(p.ticket, { state: 'awaiting-approval', detail: { approvalMessage: 'midge-payrun-approval-v1:x' } }); return new Promise(() => {}); }, approve: async () => ({ approved: true }), abandon() {}, status: (t) => state.get(t) || null };
      const room = { getSession: async () => ({ intentPublicKey: 'ii'.repeat(32), settlePublicKey: 'ss'.repeat(32) }), getAttestationBundle: async (n) => ({ nonce: n }), adminKey: ADMIN };
      const handler = createPlaygroundService({ queue: createQueue(), gate: createReviewGate(), round, room, review: async (l) => ({ used: true, findings: [], receipt: {}, labels: l.map((_, i) => 'ABCD'[i]) }), chain: { balance: async () => 10n ** 25n, funderId: 'play.t' }, waker: null, config: { origins: [ORIGIN], trustProxy: false, maxBodyBytes: 16 * 1024 } });
      const server = http.createServer(handler); await new Promise((r) => server.listen(0, '127.0.0.1', r));
      const base = `http://127.0.0.1:${server.address().port}`;
      const get = async (p, headers = {}, method = 'GET', body) => { const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...headers }, body }); return { status: r.status, text: await r.text(), h: r.headers }; };
      try {
        s.assert('the site\'s own origin gets the cross-site header', (await get('/api/health', { origin: ORIGIN })).h.get('access-control-allow-origin') === ORIGIN);
        s.assert('a foreign origin gets none, on a request and on a preflight', (await get('/api/health', { origin: 'https://evil.example' })).h.get('access-control-allow-origin') === null && (await get('/api/rounds', { origin: 'https://evil.example' }, 'OPTIONS')).h.get('access-control-allow-origin') === null);
        s.assert('a body over 16 KiB gets 413', (await get('/api/review', {}, 'POST', JSON.stringify({ session: 'session-1', pad: 'x'.repeat(20000) }))).status === 413);
        const texts = [(await get('/api/health')).text, (await get('/api/room')).text, (await get('/api/warm')).text, (await get('/api/nothing')).text];
        const rev = await get('/api/review', {}, 'POST', JSON.stringify({ session: 'session-1', lines: defaultLines() })); texts.push(rev.text);
        const joined = await get('/api/rounds', {}, 'POST', JSON.stringify({ session: 'session-1', visitorPublicKey: VKEY, payeeKeyHex: 'ab'.repeat(32), lines: defaultLines(), youIndex: 3 })); texts.push(joined.text);
        texts.push((await get(`/api/rounds/${JSON.parse(joined.text).ticket}`)).text);
        s.assert('the room\'s admin key appears in no response', texts.every((t) => !t.includes(ADMIN)), { actual: texts.map((t) => t.slice(0, 60)) });
        s.assert('without a review of the same lines, a round is refused with 403', (await get('/api/rounds', {}, 'POST', JSON.stringify({ session: 'session-2', visitorPublicKey: VKEY, payeeKeyHex: 'ab'.repeat(32), lines: defaultLines(), youIndex: 3 }))).status === 403);
      } finally { server.close(); }
    });
  },
};
