import test from 'node:test';
import assert from 'node:assert/strict';
import { createRound } from '../src/playground/round.js';
import { defaultLines } from '../src/playground/defaults.js';
import { generateClientKey } from '../src/enclave/e2ee.js';

import { fakeChain, fakeRoom, FUNDER, NEAR } from '../src/playground/fakes.js';
import { nearKeyPair, signInputWithNearKey } from '../src/roost-service/signed-input.js';

const V = nearKeyPair(); const VISITOR_KEY = V.publicKey;
const sign = (message) => signInputWithNearKey(V.secretKey, message);
const visitor = { visitorPublicKey: VISITOR_KEY, payeeKeyHex: generateClientKey().publicKeyHex, youIndex: 3 };
const mkRound = (over = {}) => {
  const chain = over.chain || fakeChain(); const room = over.room || fakeRoom({ accountKeyCheck: async (id, pk) => chain.accounts.get(id)?.publicKey === pk });
  const states = []; const ledger = { rows: new Map(), add(r) { this.rows.set(r.id, { ...r, at: r.at ?? new Date().toISOString() }); }, remove(id) { this.rows.delete(id); }, all() { return [...this.rows.values()]; } };
  // Delegates on every call, so a test can replace a method on `room` after the round exists. The fake needs the payee addresses to key the payslips.
  const wrapped = { getSession: (...a) => room.getSession(...a), openRound: (...a) => room.openRound(...a), submitSignedIntent: (...a) => room.submitSignedIntent(...a), approvePayrun: (...a) => room.approvePayrun(...a), signSettlement: (...a) => room.signSettlement(...a),
    runPayrun: (p) => room.runPayrun({ ...p, __payees: [...chain.accounts.keys()].filter((k) => /a[123]\.|v\./.test(k)) }) };
  const round = createRound({ chain, room: wrapped, keyCheck: async () => true, ledger, onState: (t, s, d) => states.push([s, d]), approvalTimeoutMs: over.approvalTimeoutMs ?? 5000, sleep: async () => {} });
  return { chain, room, round, states, ledger };
};
const names = (states) => states.map(([s]) => s);

test('a whole round: accounts, group, deposit, sealed run, approval by the visitor, settlement, and cleanup that leaves only the visitor\'s account', async () => {
  const { chain, room, round, states, ledger } = mkRound();
  await round.sweepStartup();
  const ticket = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
  const done = round.start({ ticket, ...visitor, lines: defaultLines() });
  await round.waitFor(ticket, 'awaiting-approval');
  const wait = states.find(([s]) => s === 'awaiting-approval')[1];
  assert.match(wait.approvalMessage, /^midge-payrun-approval-v1:c\.f\.testnet:pg-/);
  assert.equal(wait.summaryCipherHex, 'summary-cipher');
  assert.ok(wait.orderHash);
  assert.equal(chain.groups.get(wait.round.syndicateId).escrow, 18n * NEAR / 100n, 'the employer deposited exactly the gross total');
  assert.ok(chain.finalReads > 0, 'the deposit was confirmed at final finality before the room was asked to run, because the room reads escrow at a finalised block');
  const employerFunding = chain.funding.find((f) => /er\./.test(f.id)); assert.ok(employerFunding.fundNear >= 0.18 + 0.15, 'the employer is funded with the deposit plus enough for the exit call, which reserves 0.06 NEAR of gas');
  await round.approve({ ticket, publicKey: VISITOR_KEY, signature: sign(wait.approvalMessage) });
  const result = await done;
  assert.equal(result.settleTx, 'H-settle'); assert.equal(result.orderHash, wait.orderHash);
  assert.match(result.visitorAccount, new RegExp(`\\.${FUNDER.replace(/\./g, '\\.')}$`));
  assert.equal(result.payslipCipherHex, `slip-${result.visitorAccount}`);
  assert.ok(result.cast.some((c) => c.role === 'er') && result.cast.some((c) => c.role === 'you' && c.id === result.visitorAccount));
  await round.idle();
  assert.deepEqual([...chain.accounts.keys()], [result.visitorAccount], 'only the visitor\'s account survives');
  assert.equal(chain.groups.size, 0, 'the group was pruned');
  assert.equal(ledger.all().length, 0, 'nothing is left in the ledger');
  assert.deepEqual(names(states).slice(0, 4), ['creating-accounts', 'hatching', 'depositing', 'sealing']);
  assert.ok(names(states).includes('settling') && names(states).at(-1) === 'done');
  assert.equal(room.calls.filter((c) => c[0] === 'runPayrun')[0][1].approver, result.visitorAccount);
});

test('an approval signed for a different run is refused by the room, nothing settles, and the visitor can sign the right one', async () => {
  const { chain, round } = mkRound();
  await round.sweepStartup();
  const ticket = 'b'.repeat(32);
  const done = round.start({ ticket, ...visitor, lines: defaultLines() });
  const wait = await round.waitFor(ticket, 'awaiting-approval');
  const wrongRun = wait.approvalMessage.replace(wait.orderHash, 'cd'.repeat(32));
  await assert.rejects(round.approve({ ticket, publicKey: VISITOR_KEY, signature: sign(wrongRun) }), /does not verify/);
  assert.ok(!chain.sent.some((s) => s.method === 'settle_batch_charged'), 'nothing was settled');
  const stranger = nearKeyPair();
  await assert.rejects(round.approve({ ticket, publicKey: stranger.publicKey, signature: signInputWithNearKey(stranger.secretKey, wait.approvalMessage) }), /is not a key of/);
  await round.approve({ ticket, publicKey: VISITOR_KEY, signature: sign(wait.approvalMessage) });
  assert.equal((await done).settleTx, 'H-settle');
});

test('a failure while hatching deletes the accounts already created and keeps the visitor\'s, which only the visitor can delete', async () => {
  const chain = fakeChain({ failOn: 'hatch' });
  const { round, ledger } = mkRound({ chain });
  await round.sweepStartup();
  await assert.rejects(round.start({ ticket: 'c'.repeat(32), ...visitor, lines: defaultLines() }), /hatch failed/);
  await round.idle();
  assert.deepEqual([...chain.accounts.values()].filter((a) => !a.publicKey), [], 'every service-held account is gone');
  assert.equal([...chain.accounts.values()].filter((a) => a.publicKey === VISITOR_KEY).length, 1, 'the visitor\'s account stays');
  assert.equal(ledger.all().length, 0);
});

test('abandoning during approval takes the deposit back out, prunes the group and deletes the accounts', async () => {
  const { chain, round } = mkRound();
  await round.sweepStartup();
  const ticket = 'd'.repeat(32);
  const done = round.start({ ticket, ...visitor, lines: defaultLines() });
  await round.waitFor(ticket, 'awaiting-approval');
  assert.ok([...chain.groups.values()][0].escrow > 0n);
  round.abandon(ticket);
  await assert.rejects(done, /abandoned|did not approve/i);
  await round.idle();
  assert.equal(chain.groups.size, 0);
  assert.ok(chain.sent.some((s) => s.method === 'hatch_out'), 'the employer exited the group');
  assert.equal([...chain.accounts.keys()].length, 1, 'only the visitor\'s account remains');
});

test('no approval within the time limit ends the round the same way', async () => {
  const { chain, round } = mkRound({ approvalTimeoutMs: 30 });
  await round.sweepStartup();
  const done = round.start({ ticket: 'e'.repeat(32), ...visitor, lines: defaultLines() });
  await assert.rejects(done, /did not approve/i);
  await round.idle();
  assert.equal(chain.groups.size, 0);
});

test('a round cannot start before the start-up sweep has run', async () => {
  const { round } = mkRound();
  await assert.rejects(round.start({ ticket: 'f'.repeat(32), ...visitor, lines: defaultLines() }), /start-up/i);
});

test('the start-up sweep cleans up what a crashed process left in the ledger', async () => {
  const chain = fakeChain();
  const { round, ledger } = mkRound({ chain });
  chain.accounts.set(`old1.${FUNDER}`, {}); chain.accounts.set(`old2.${FUNDER}`, {});
  chain.groups.set('pg-old', { epoch: 0, nonce: 'n', escrow: 5n, status: 'Active', employer: `old1.${FUNDER}` });
  ledger.add({ kind: 'account', id: `old1.${FUNDER}` }); ledger.add({ kind: 'account', id: `old2.${FUNDER}` }); ledger.add({ kind: 'group', id: 'pg-old', employer: `old1.${FUNDER}` });
  await round.sweepStartup();
  assert.equal(chain.accounts.size, 0); assert.equal(chain.groups.size, 0); assert.equal(ledger.all().length, 0);
});

test('lines that the visitor edited into something unusable are refused before any account exists', async () => {
  const { chain, round } = mkRound();
  await round.sweepStartup();
  const lines = defaultLines(); lines[0].gross = '5';
  await assert.rejects(round.start({ ticket: '1'.repeat(32), ...visitor, lines }), /gross/i);
  assert.equal(chain.accounts.size, 0);
});

test('a cleanup that did not finish is retried later, and a round that is still running is left alone', async () => {
  const chain = fakeChain();
  const { round, ledger } = mkRound({ chain });
  await round.sweepStartup();
  const old = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  chain.accounts.set(`stale.${FUNDER}`, {}); ledger.add({ kind: 'account', id: `stale.${FUNDER}`, at: old });
  chain.accounts.set(`fresh.${FUNDER}`, {}); ledger.add({ kind: 'account', id: `fresh.${FUNDER}` });
  const ticket = '9'.repeat(32);
  const done = round.start({ ticket, ...visitor, lines: defaultLines() });
  await round.waitFor(ticket, 'awaiting-approval');
  await round.sweepStale({ olderThanMs: 10 * 60 * 1000 });
  assert.ok(!chain.accounts.has(`stale.${FUNDER}`), 'the old row was cleaned up');
  assert.ok(chain.accounts.has(`fresh.${FUNDER}`), 'a recent row was left alone');
  assert.ok([...chain.groups.keys()].length === 1, 'the running round\'s group was not touched');
  round.abandon(ticket); await done.catch(() => {}); await round.idle();
});

test('a temporary refusal from the room (a rate-limited chain read, a 503) is retried, and the visitor\'s round goes on', async () => {
  const { chain, room, round } = mkRound();
  await round.sweepStartup();
  const real = room.runPayrun.bind(room); let tries = 0;
  room.runPayrun = async (p) => { tries += 1; if (tries <= 2) throw new Error('roost /payrun answered 503: [ROOST REJECT] could not read escrow: https://test.rpc.fastnear.com answered 429'); return real(p); };
  const ticket = '8'.repeat(32);
  const done = round.start({ ticket, ...visitor, lines: defaultLines() });
  const wait = await round.waitFor(ticket, 'awaiting-approval');
  assert.equal(tries, 3, 'the room was asked three times: two refusals, then the run');
  await round.approve({ ticket, publicKey: VISITOR_KEY, signature: sign(wait.approvalMessage) });
  assert.equal((await done).settleTx, 'H-settle');
  await round.idle(); assert.equal(chain.groups.size, 0);
});

test('a refusal that is not temporary is not retried', async () => {
  const { room, round } = mkRound();
  await round.sweepStartup();
  let tries = 0;
  room.runPayrun = async () => { tries += 1; throw new Error('roost /payrun answered 400: [ROOST REJECT] pf.er cannot cover the gross pay of this run; the queue is kept'); };
  await assert.rejects(round.start({ ticket: '7'.repeat(32), ...visitor, lines: defaultLines() }), /cannot cover/);
  assert.equal(tries, 1);
  await round.idle();
});

test('a temporary refusal that never clears fails the round with the room\'s reason after a bounded number of tries, and cleans up', async () => {
  const { chain, room, round } = mkRound();
  await round.sweepStartup();
  let tries = 0;
  room.runPayrun = async () => { tries += 1; throw new Error('roost /payrun answered 503: [ROOST REJECT] could not read escrow: https://x answered 429'); };
  await assert.rejects(round.start({ ticket: '6'.repeat(32), ...visitor, lines: defaultLines() }), /could not read escrow/);
  assert.equal(tries, 6, 'six tries and no more');
  await round.idle(); assert.equal(chain.groups.size, 0, 'the deposit was taken back and the group pruned');
});
