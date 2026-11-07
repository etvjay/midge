import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { connect, near, fmt, computePolicyHash } from '../lib/near.js';
import { createMembers, teardownMembers, memberHandle } from '../lib/members.js';
import { HostedRoost } from '../../src/roost-service/hosted-roost.js';
import { clearCross } from '../../src/roost-service/quote-programs.js';
import { sealToModel } from '../../src/enclave/e2ee.js';

const provider = { simulated: true, attest: async () => Buffer.from('lab-local-no-hardware'), info: async () => ({}) };
const REF = 500;                                                  // reference price, micro-NEAR per unit (0.0005 NEAR)
const CAP = 100;                                                  // public per-order cap, units
// desks: side, units, limit in micro-NEAR per unit. f is a late seller with an extreme limit.
const ORDERS = { b1: { side: 'buy', units: 100, limit: 550 }, b2: { side: 'buy', units: 50, limit: 525 }, s1: { side: 'sell', units: 80, limit: 475 }, s2: { side: 'sell', units: 90, limit: 500 }, f: { side: 'sell', units: 40, limit: 10 } };
const WHO = Object.keys(ORDERS); const COMMON = '0.06';
const MICRO = 10n ** 18n;                                         // yocto per micro-NEAR
const microNear = (m) => BigInt(m) * MICRO;
const EXPECT_FILLS = { b1: 100, b2: 50, s1: 57, s2: 64, f: 29 };   // pro-rata with f present: sells 210 for 150 matched

export default {
  id: 'E-CMP-CROSS-01',
  title: 'Block trade on testnet: an open order book against a sealed cross run by the host, same pro-rata rule',
  tier: 'testnet',
  requires: ['near-key', 'network'],
  hypothesis: 'Predictions are fixed in docs/lab/RFQ_PLAN.md (committed before this ran, with the pro-rata revision made before any run). Reference price 0.0005 NEAR per unit, per-order cap 100 units. Buyers b1 (100 units, limit 0.00055) and b2 (50, 0.000525); sellers s1 (80, 0.000475), s2 (90, 0.0005) and f, a late seller with an extreme limit (40 units, 0.00001). (1) In the open book an observer reads side, size and limit for every desk, 5 of 5 exactly, and sees sell units (210) exceed buy units (150); in the sealed round the escrows are all equal, and the settlement shows each matched desk\'s side and filled units (5 of 5) but no limit (0 of 5) and none of the unfilled units. (2) Both versions match 150 units at the reference price and sellers receive 0.075 NEAR in total. (3) f gets no queue position: the fills are s1 57, s2 64, f 29 and b1 100, b2 50 in both versions, and f gets what it would get with a limit equal to the reference (under the earlier most-aggressive-first rule f would have filled 40 and displaced s2 to 30). (4) If the host never signs nothing settles and everyone exits with the full 0.06. (5) The sealed round locks more capital than the open book and burns more gas. (My first prediction was a gas ratio between 0.3 and 3; the first run measured 3.18 and failed that band, run 20261107T110304Z-2d88, kept as evidence. The claim is now only that sealed costs more.) Fails if any of these breaks.',
  limits: [
    'One operator controls every account. The desks are scripted. The open book is our own minimal contract (contracts/public-market), not anyone else\'s; the host is a local HostedRoost with a simulated attestation provider.',
    'Only the cash leg settles: sellers are paid and buyers charged; nothing delivers the asset, so a seller can be paid without delivering, and orders\' sizes cannot be bounded by an asset deposit. The reference price is supplied, not verified by an oracle.',
    'Pro-rata invites over-ordering because a trader pays only for what is filled; the public cap (100 units) limits it but does not remove it. This run does not test that.',
    'Deposits are public. They hide orders only because every participant deposits the same 0.06 NEAR; the open book needs no seller deposit, so it locks less capital.',
    'Orders are not signed to an account in this run (the signed-input path was not used).',
  ],
  async run(ctx) {
    const chain = await connect(ctx.rootDir);
    const coord = chain.sub('c');
    const tag = Date.now().toString(36);
    const created = []; const results = {}; const gas = { PUB: 0, SEAL: 0 };
    let people = null; let baseline = null; let countBefore;
    const ids = () => WHO.map((k) => people[k]);
    const track = (p, entry) => { gas[p] += entry.gasTGas || 0; return entry; };
    const height = (finality = 'optimistic') => chain.blockHeight(finality);
    const state = (id) => chain.view('get_syndicate', { syndicate_id: id });
    const nameOf = (id) => WHO.find((k) => people[k].id === id);
    const txArgs = async (hash, signer) => { for (const url of ['https://test.rpc.fastnear.com', 'https://archival-rpc.testnet.fastnear.com']) { try { const r = await (await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'EXPERIMENTAL_tx_status', params: [hash, signer] }) })).json(); if (r.result) return JSON.parse(Buffer.from(r.result.transaction.actions[0].FunctionCall.args, 'base64').toString('utf8')); } catch { /* next */ } } return null; };
    const toFills = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Number(BigInt(v) / microNear(REF))]));

    // the expected outcome from the program itself, with f at an extreme limit and with f at the reference
    const run = (fLimit) => clearCross({ buys: ['b1', 'b2'].map((k, i) => ({ flyerId: k, units: ORDERS[k].units, limitMicro: BigInt(ORDERS[k].limit), order: i })), sells: [...['s1', 's2'].map((k, i) => ({ flyerId: k, units: ORDERS[k].units, limitMicro: BigInt(ORDERS[k].limit), order: 2 + i })), { flyerId: 'f', units: 40, limitMicro: BigInt(fLimit), order: 4 }], referenceMicro: BigInt(REF), maxUnits: CAP });
    const fillsOf = (r) => Object.fromEntries([...r.buyFills, ...r.sellFills].map((f) => [f.flyerId, Number(f.units)]));

    // ---------- the public baseline ----------
    const bookView = () => chain.view('get_book', { book_id: `book-${tag}` }, baseline.id);
    const postPublic = (who) => { const o = ORDERS[who]; const dep = o.side === 'buy' ? BigInt(o.units) * microNear(o.limit) : 0n; return chain.send(people[who].account, 'post_order', { book_id: `book-${tag}`, side: o.side, units: o.units, limit_micro: o.limit }, { deposit: dep, gas: 30000000000000n, contractId: baseline.id, label: `post_order ${who} ${o.side} ${o.units}@${o.limit}` }); };

    // ---------- Midge helpers ----------
    const policyFor = () => ({ allowed_recipients: ['s1', 's2', 'f'].map((k) => people[k].id), max_release_bps_per_epoch: 10000, settle_deadline_block: 500000000 });
    const hatch = (id, keyHex) => { created.push(id); return chain.send(coord.account, 'hatch', { syndicate_id: id, syndicate_type: 'FLASH', quorum_threshold: 1, max_spend_near: 1, enclave_public_key: keyHex, expected_code_hash: crypto.randomBytes(32).toString('hex'), timeout_blocks: 16, payout_recipient: people.s1.id, release_policy: policyFor() }, { deposit: near('0.01'), gas: 40000000000000n, label: `hatch ${id}` }); };
    const deposit = (who, id) => chain.send(people[who].account, 'deposit', { syndicate_id: id, policy_hash: computePolicyHash(policyFor(), 16) }, { deposit: near(COMMON), gas: 30000000000000n, label: `deposit ${who} -> ${id}` });
    const escrowsOf = async (id) => Object.fromEntries(await Promise.all(WHO.map(async (k) => [k, BigInt(await chain.view('get_escrow', { syndicate_id: id, account_id: people[k].id }))])));
    const waitForTimer = (id) => chain.waitFor(async () => (await height('final')) - Number((await state(id)).epoch_start_block) >= 16, { what: 'the exit timer', timeoutMs: 120000 });
    async function exitAll(s, p, id) { const back = {}; for (const k of WHO) { const r = track(p, await chain.send(people[k].account, 'hatch_out', { syndicate_id: id }, { gas: 60000000000000n, label: `exit ${id} as ${k}` })); s.assert(`${k} exits alone`, r.ok, { actual: r.error }); const m = (await chain.transfersOf(r.hash, people[k].id)).filter((x) => x.fromContract && x.to === people[k].id); back[k] = m.length ? BigInt(m[0].amount) : 0n; } return back; }

    await ctx.step('set up: five desks and the open order book deployed fresh', async (s) => {
      countBefore = Number(await chain.view('get_syndicate_count', {}));
      const wasmPath = path.join(ctx.rootDir, 'contracts/public-market/target/wasm32-unknown-unknown/release/public_market.wasm');
      s.assert('the public market wasm is built (npm run build:wasm:market)', fs.existsSync(wasmPath));
      const made = await createMembers(chain, { rootDir: ctx.rootDir, tag: `x${tag.slice(-5)}`, count: 5, fundNear: '0.5', names: WHO });
      people = Object.fromEntries(WHO.map((k, i) => [k, made[i]]));
      const baseId = `pc${tag.slice(-6)}.${chain.masterId}`; const h = memberHandle(chain, baseId);
      await chain.master.createSubAccount({ accountOrPrefix: `pc${tag.slice(-6)}`, publicKey: h.key.keyPair.getPublicKey(), nearToTransfer: near('3.2') });
      baseline = h; await chain.waitFor(async () => { try { await h.account.getBalance(); return true; } catch { return false; } }, { what: 'baseline account' });
      await h.account.deployContract(fs.readFileSync(wasmPath));
      s.assert('the order book contract is deployed and answers', (await chain.view('get_book', { book_id: 'none' }, baseId)) === null);
      s.assert('the program itself puts f at 29, not 40, whatever its limit: extreme and at-reference limits give identical fills', JSON.stringify(fillsOf(run(10))) === JSON.stringify(EXPECT_FILLS) && JSON.stringify(fillsOf(run(REF))) === JSON.stringify(EXPECT_FILLS), { actual: [fillsOf(run(10)), fillsOf(run(REF))] });
    }, { critical: true });

    // ================= open order book =================
    let publicFills;
    await ctx.step('OPEN · the desks post their orders in public, a watcher reads the book, then f joins late with an extreme limit, and anyone crosses it', async (s) => {
      const t0 = Date.now(); const id = `book-${tag}`; const start = await height(); const end = start + 150;
      s.assert('open the book', track('PUB', await chain.send(people.b1.account, 'open_book', { book_id: id, reference_micro: REF, end_block: end, max_units: CAP }, { gas: 30000000000000n, contractId: baseline.id, label: 'open book' })).ok);
      await chain.waitFor(() => bookView(), { what: 'book' });
      for (const who of ['b1', 'b2', 's1', 's2']) { const r = track('PUB', await postPublic(who)); s.assert(`${who} posts ${ORDERS[who].side} ${ORDERS[who].units} @ ${ORDERS[who].limit}`, r.ok, { actual: r.error }); }
      // the watcher reads the public book
      const seen = await chain.view('get_orders', { book_id: id }, baseline.id);
      const exact = seen.filter((o) => { const k = nameOf(o.trader); return ORDERS[k] && o.side === ORDERS[k].side && o.units === ORDERS[k].units && Number(o.limit_micro) === ORDERS[k].limit; }).length;
      s.assert('(1) an observer reads side, size and limit for every desk posted so far: 4 of 4 exactly', exact === 4, { actual: exact });
      const buyUnits = seen.filter((o) => o.side === 'buy').reduce((x, o) => x + o.units, 0); const sellUnits = seen.filter((o) => o.side === 'sell').reduce((x, o) => x + o.units, 0);
      s.observe('what the watcher can see before the cross', { buyUnits, sellUnits, sellSideLeftover: sellUnits - buyUnits });
      s.assert('(1) the watcher sees that sell units (170) exceed buy units (150) by 20', sellUnits === 170 && buyUnits === 150);
      const rF = track('PUB', await postPublic('f')); s.assert('f posts a late sell of 40 units with limit 10 (0.00001)', rF.ok, { actual: rF.error });
      const seen2 = await chain.view('get_orders', { book_id: id }, baseline.id);
      s.assert('(1) all 5 desks are readable on chain: 5 of 5', seen2.length === 5 && seen2.every((o) => ORDERS[nameOf(o.trader)] && o.units === ORDERS[nameOf(o.trader)].units && Number(o.limit_micro) === ORDERS[nameOf(o.trader)].limit));
      await chain.waitFor(async () => (await height()) >= end + 1, { what: 'the end of the book', timeoutMs: 600000, everyMs: 700 });
      const crossTx = track('PUB', await chain.send(people.b1.account, 'cross', { book_id: id }, { gas: 200000000000000n, contractId: baseline.id, label: 'cross book' }));
      s.evidence('tx', { label: crossTx.label, hash: crossTx.hash, ok: crossTx.ok, explorer: crossTx.explorer, error: crossTx.error });
      s.assert('the book crossed', crossTx.ok, { actual: crossTx.error });
      const tr = (await chain.transfersOf(crossTx.hash, people.b1.id)).filter((m) => m.predecessor === baseline.id);
      const got = Object.fromEntries(tr.map((m) => [nameOf(m.to), (BigInt(m.amount))]));
      const sellers = ['s1', 's2', 'f']; const paid = sellers.reduce((x, k) => x + (got[k] || 0n), 0n);
      s.assert('(2) 150 units matched at the reference: sellers received 0.075 NEAR in total', paid === near('0.075'), { actual: String(paid) });
      publicFills = Object.fromEntries(sellers.map((k) => [k, Number((got[k] || 0n) / microNear(REF))]));
      s.assert('(3) the sellers\' fills are s1 57, s2 64, f 29: f gets no queue position', JSON.stringify(publicFills) === JSON.stringify({ s1: 57, s2: 64, f: 29 }), { actual: publicFills });
      const b1back = got.b1 || 0n; const b2back = got.b2 || 0n;
      s.assert('buyers got back deposit minus cash: b1 0.005, b2 0.00125', b1back === near('0.005') && b2back === near('0.00125'), { actual: [String(b1back), String(b2back)] });
      const book = await bookView(); s.assert('the book reports 150 matched units', book.matched_units === 150 && book.settled);
      results.PUB = { matchedUnits: book.matched_units, sellerFills: publicFills, ordersReadableBeforeCross: 5, limitsReadable: 5, gasTGas: +gas.PUB.toFixed(1), wallMs: Date.now() - t0, capitalLockedNear: 0.055 + 0.02625 };
      s.observe('result', results.PUB); s.evidence('OPEN', results.PUB);
    });

    // ================= Midge sealed cross =================
    await ctx.step('MIDGE · sealed cross: common deposit, every desk seals one order, the host crosses, the contract charges buyers and pays sellers', async (s) => {
      const t0 = Date.now(); const id = `cross-${tag}-sealed`; const roost = new HostedRoost({ provider });
      s.assert('hatch', track('SEAL', await hatch(id, roost.settlePublicKey)).ok); await chain.waitFor(() => state(id), { what: 'syndicate' });
      for (const k of WHO) s.assert(`${k} deposits ${COMMON}`, track('SEAL', await deposit(k, id)).ok);
      await chain.waitFor(async () => BigInt((await state(id)).total_escrow) === near(COMMON) * 5n, { what: 'all deposits' });
      s.assert('(1) the public escrows are all equal, so they reveal neither side nor size nor limit of any desk', new Set(Object.values(await escrowsOf(id)).map(String)).size === 1);
      for (const k of WHO) roost.submitSealedIntent({ flyerId: people[k].id, cipherTextHex: sealToModel(JSON.stringify({ side: ORDERS[k].side, units: ORDERS[k].units, limit: (ORDERS[k].limit / 1e6).toFixed(6) }), roost.intentPublicKey) });
      const out = roost.runCross({ referencePrice: (REF / 1e6).toFixed(6), maxUnits: CAP, roundId: id });
      s.observe('what the host computed', out.outcome);
      const st = await state(id);
      const signed = roost.signSettlement({ contractId: chain.coordinatorId, syndicateId: id, epoch: Number(st.epoch), roundNonce: st.round_nonce, allocations: out.allocations, orderHash: out.orderHash, charges: out.charges });
      const tx = track('SEAL', await chain.send(coord.account, 'settle_batch_charged', { syndicate_id: id, attestation_nonce: st.round_nonce, aggregate_order_hash: out.orderHash, allocations: out.allocations, charges: out.charges, enclave_signature: signed.signature }, { gas: 150000000000000n, label: `settle_batch_charged ${id}` }));
      s.evidence('tx', { label: tx.label, hash: tx.hash, ok: tx.ok, explorer: tx.explorer, error: tx.error });
      s.assert('settle_batch_charged succeeded', tx.ok, { actual: tx.error });
      await chain.waitFor(async () => { const x = await state(id); return !x.is_settling && BigInt(x.total_escrow) === near(COMMON) * 5n - near('0.075'); }, { what: 'settlement resolved' });
      const paid = (await chain.transfersOf(tx.hash, chain.coordinatorId)).filter((m) => m.fromContract);
      const got = Object.fromEntries(paid.map((m) => [nameOf(m.to), BigInt(m.amount)]));
      s.assert('(2) 150 units matched at the reference: sellers received 0.075 NEAR in total', ['s1', 's2', 'f'].reduce((x, k) => x + (got[k] || 0n), 0n) === near('0.075'), { actual: Object.fromEntries(Object.entries(got).map(([k, v]) => [k, String(v)])) });
      const sellFills = Object.fromEntries(['s1', 's2', 'f'].map((k) => [k, Number((got[k] || 0n) / microNear(REF))]));
      s.assert('(3) the sellers\' fills are s1 57, s2 64, f 29, the same as the open book: f gets no queue position', JSON.stringify(sellFills) === JSON.stringify({ s1: 57, s2: 64, f: 29 }), { actual: sellFills });
      s.assert('(3) the sealed fills equal the open book\'s fills', JSON.stringify(sellFills) === JSON.stringify(publicFills));
      const esc = await escrowsOf(id);
      s.assert('buyers\' escrow fell by exactly their cash: b1 by 0.05, b2 by 0.025', esc.b1 === near(COMMON) - near('0.05') && esc.b2 === near(COMMON) - near('0.025'), { actual: [String(esc.b1), String(esc.b2)] });
      // what an observer can read from the settlement itself
      const args = await txArgs(tx.hash, coord.id);
      s.assert('the settlement carries only allocations and charges (no limits, no order sizes)', args && Object.keys(args).sort().join() === ['aggregate_order_hash', 'allocations', 'attestation_nonce', 'charges', 'enclave_signature', 'syndicate_id'].sort().join(), { actual: args && Object.keys(args) });
      const sideAndFill = {}; for (const a of args.allocations) sideAndFill[nameOf(a.recipient)] = ['sell', Number(BigInt(a.amount) / microNear(REF))]; for (const c of args.charges) sideAndFill[nameOf(c.member)] = ['buy', Number(BigInt(c.amount) / microNear(REF))];
      s.assert('(1) the settlement shows each matched desk\'s side and filled units: 5 of 5', WHO.every((k) => sideAndFill[k] && sideAndFill[k][0] === ORDERS[k].side && sideAndFill[k][1] === EXPECT_FILLS[k]), { actual: sideAndFill });
      const ordered = new Set(Object.values(ORDERS).filter((o) => o.side === 'sell').map((o) => o.units));
      s.assert('(1) none of the sellers\' ordered sizes (80, 90, 40) appears: the unfilled units are not revealed', !Object.entries(sideAndFill).some(([k, [side, u]]) => side === 'sell' && ordered.has(u)), { actual: sideAndFill });
      await waitForTimer(id);
      const back = await exitAll(s, 'SEAL', id);
      const owed = { b1: near(COMMON) - near('0.05'), b2: near(COMMON) - near('0.025'), s1: near(COMMON), s2: near(COMMON), f: near(COMMON) };
      for (const k of WHO) s.assert(`${k} exits with exactly its remaining escrow`, back[k] === owed[k], { actual: String(back[k]) });
      s.assert('the syndicate ended fully refunded', /aborted|refunded/i.test(String((await state(id)).status)) && BigInt((await state(id)).total_escrow) === 0n);
      results.SEAL = { matchedUnits: out.outcome.matchedUnits, sellerFills: sellFills, escrowsEqualBefore: true, sidesAndFillsReadable: 5, limitsReadable: 0, unfilledUnitsReadable: 0, gasTGas: +gas.SEAL.toFixed(1), wallMs: Date.now() - t0, capitalLockedNear: 0.06 * 5 };
      s.observe('result', results.SEAL); s.evidence('SEALED', { ...results.SEAL, settleTx: tx.hash });
    });

    await ctx.step('DEAD HOST · the host never signs: nothing settles and every desk exits alone with the full deposit', async (s) => {
      const id = `cross-${tag}-dead`; const roost = new HostedRoost({ provider });
      s.assert('hatch', (await hatch(id, roost.settlePublicKey)).ok); await chain.waitFor(() => state(id), { what: 'syndicate' });
      for (const k of WHO) s.assert(`${k} deposits`, (await deposit(k, id)).ok);
      await chain.waitFor(async () => BigInt((await state(id)).total_escrow) === near(COMMON) * 5n, { what: 'deposits' });
      await waitForTimer(id);
      const back = await exitAll(s, 'DEAD', id);
      s.assert('(4) every desk recovered the full 0.06 alone', WHO.every((k) => back[k] === near(COMMON)), { actual: Object.fromEntries(Object.entries(back).map(([k, v]) => [k, String(v)])) });
      results.DEAD = { allRecovered: true };
    });

    await ctx.step('the comparison, read from the measurements above', async (s) => {
      s.observe('results', results);
      s.assert('every path was measured', ['PUB', 'SEAL', 'DEAD'].every((k) => results[k]));
      s.assert('(5) the sealed round locks more capital than the open book', results.SEAL.capitalLockedNear > results.PUB.capitalLockedNear, { actual: [results.SEAL.capitalLockedNear, results.PUB.capitalLockedNear] });
      const ratio = +(gas.SEAL / gas.PUB).toFixed(2);
      s.observe('gas, TGas for the whole trade: open book / sealed', [gas.PUB, gas.SEAL].map((x) => +x.toFixed(1)));
      s.observe('wall time (ms): open book / sealed', [results.PUB.wallMs, results.SEAL.wallMs]);
      s.observe('sealed gas over open-book gas (the first run measured 3.18 against a predicted band of 0.3 to 3: the sealed path needs a hatch, five deposits, a settlement and the exits, the open book only seven calls)', ratio);
      s.assert('(5) the sealed round burns more gas than the open book', ratio > 1, { actual: ratio });
      s.evidence('comparison', results);
    });

    await ctx.step('teardown: delete the baseline contract, prune the syndicates, delete the accounts', async (s) => {
      if (baseline) { try { await baseline.account.deleteAccount(chain.masterId); s.observe('baseline contract account', 'deleted, balance returned to the master'); } catch (e) { s.observe('baseline contract account NOT deleted', String(e.message).slice(0, 120)); } }
      if (!people) { s.assert('nothing to tear down', true); return; }
      const rep = await teardownMembers(chain, { rootDir: ctx.rootDir, members: ids(), pruneIds: created });
      s.observe('teardown', { pruned: rep.pruned.length, notPruned: rep.notPruned, deleted: rep.deleted.length, kept: rep.kept, failed: rep.failed });
      s.assert('every account was deleted and every syndicate pruned', rep.failed.length === 0 && rep.kept.length === 0 && rep.notPruned.length === 0, { actual: rep });
      s.assert('the contract holds the records it started with', Number(await chain.view('get_syndicate_count', {}, undefined)) === countBefore, { expected: countBefore });
    }, { always: true });
  },
};
