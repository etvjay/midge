import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { connect, near, fmt, computePolicyHash } from '../lib/near.js';
import { createMembers, teardownMembers, memberHandle } from '../lib/members.js';
import { HostedRoost } from '../../src/roost-service/hosted-roost.js';
import { sealToModel } from '../../src/enclave/e2ee.js';

const provider = { simulated: true, attest: async () => Buffer.from('lab-local-no-hardware'), info: async () => ({}) };
const COST = { a: 450, b: 400, c: 500, d: 600, s: 420 };   // each lender's private cost of funds, in basis points a year (s is the sniper)
const WHO = Object.keys(COST); const HONEST = ['d', 'c', 'a', 'b'];
const LOAN = '0.05'; const MAX = 700; const DEPOSIT = '0.05'; const STEP = 25;

export default {
  id: 'E-CMP-QUOTE-01',
  title: 'Lending quotes on testnet: an open reverse-quote round against sealed first-price and second-price rounds run by the host',
  tier: 'testnet',
  requires: ['near-key', 'network'],
  hypothesis: 'Predictions are fixed in docs/lab/RFQ_PLAN.md (committed before this ran). Five lenders with private costs 450, 400, 500, 600 and 420 bps (the last is a sniper that can watch the chain) compete to fund a 0.05 NEAR loan, maximum 700 bps. (1) In the open round every honest lender\'s quote is public and an observer attributes a cost within 10% to at least 3 of the 4 honest lenders from their lowest quote; in the sealed rounds none, and the agreed rate is not on chain at all. (2) The honest open round leaves b leading at 450; the sniper quotes 449 at the end: either it lands and wins at 449, or it is refused as late and b wins at 450 (recorded, not predicted). (3) Sealed first-price (quotes cost + 50): b wins at 450; sealed second-price (quotes cost): b wins at 420. (4) In each sealed round the borrower receives exactly 0.05, only the winner is charged exactly 0.05, and every other lender exits with the full deposit. (5) If the host never signs, nothing settles and all five exit with the full 0.05. (6) Gas of the first-price round over the open round is between 0.5 and 1.5. Fails if any of these breaks.',
  limits: [
    'One operator controls every account. The lenders are scripted: honest lenders open at the maximum and undercut by 25 bps down to their cost (open round), or quote cost + 50 (first-price) or cost (second-price); only the sniper adapts.',
    'The open baseline is our own minimal reverse-quote contract (contracts/public-market), not anyone else\'s. The host is a local HostedRoost with a simulated attestation provider.',
    'Only the cash leg settles: the loan is funded, but the rate, repayment and default are not on this chain or enforced by it. Under Midge the agreed rate is known only to the parties who hold the host\'s outcome.',
    'Deposits are public. They hide quotes only because everyone deposits the same 0.05 NEAR, which is the loan size; losers recover their deposit only after the exit timer.',
    'Quotes are not signed to an account in this run (the signed-input path was not used). The sniper\'s success depends on timing against ~1 s blocks and is recorded, not guaranteed.',
  ],
  async run(ctx) {
    const chain = await connect(ctx.rootDir);
    const coord = chain.sub('c');
    const tag = Date.now().toString(36);
    const created = []; const results = {}; const gas = { PUB: 0, FP: 0, SP: 0 };
    let people = null; let borrower; let baseline = null; let countBefore;
    const ids = () => WHO.map((k) => people[k]);
    const track = (p, entry) => { gas[p] += entry.gasTGas || 0; return entry; };
    const height = (finality = 'optimistic') => chain.blockHeight(finality);
    const state = (id) => chain.view('get_syndicate', { syndicate_id: id });
    const nameOf = (id) => WHO.find((k) => people[k].id === id);
    const txArgs = async (hash, signer) => { for (const url of ['https://test.rpc.fastnear.com', 'https://archival-rpc.testnet.fastnear.com']) { try { const r = await (await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'EXPERIMENTAL_tx_status', params: [hash, signer] }) })).json(); if (r.result) return JSON.parse(Buffer.from(r.result.transaction.actions[0].FunctionCall.args, 'base64').toString('utf8')); } catch { /* next */ } } return null; };

    // ---------- the public baseline ----------
    const reqView = (id) => chain.view('get_request', { request_id: id }, baseline.id);
    const quoteMs = [];
    const quotePublic = async (who, rate, id) => { const t = Date.now(); const r = await chain.send(people[who].account, 'quote', { request_id: id, rate_bps: rate }, { deposit: near(LOAN), gas: 30000000000000n, contractId: baseline.id, label: `quote ${who} ${rate}bps` }); quoteMs.push(Date.now() - t); return r; };

    // ---------- Midge helpers ----------
    const policyFor = () => ({ allowed_recipients: [borrower.id], max_release_bps_per_epoch: 10000, settle_deadline_block: 500000000 });
    const timers = {}; // exit timer per group: it is part of what depositors consent to (GAP-025)
    const hatch = (id, keyHex, timeout) => { timers[id] = timeout; created.push(id); return chain.send(coord.account, 'hatch', { syndicate_id: id, syndicate_type: 'FLASH', quorum_threshold: 1, max_spend_near: 1, enclave_public_key: keyHex, expected_code_hash: crypto.randomBytes(32).toString('hex'), timeout_blocks: timeout, payout_recipient: borrower.id, release_policy: policyFor() }, { deposit: near('0.01'), gas: 40000000000000n, label: `hatch ${id}` }); };
    const deposit = (who, id) => chain.send(people[who].account, 'deposit', { syndicate_id: id, policy_hash: computePolicyHash(policyFor(), timers[id]) }, { deposit: near(DEPOSIT), gas: 30000000000000n, label: `deposit ${who} -> ${id}` });
    const escrowsOf = async (id) => Object.fromEntries(await Promise.all(WHO.map(async (k) => [k, BigInt(await chain.view('get_escrow', { syndicate_id: id, account_id: people[k].id }))])));
    const waitForTimer = (id, blocks) => chain.waitFor(async () => (await height('final')) - Number((await state(id)).epoch_start_block) >= blocks, { what: 'the exit timer', timeoutMs: 120000 });
    async function exitAll(s, p, id, skip = []) { const back = {}; for (const k of WHO) { if (skip.includes(k)) { back[k] = 0n; continue; } const r = track(p, await chain.send(people[k].account, 'hatch_out', { syndicate_id: id }, { gas: 60000000000000n, label: `exit ${id} as ${k}` })); s.assert(`${k} exits alone`, r.ok, { actual: r.error }); const m = (await chain.transfersOf(r.hash, people[k].id)).filter((x) => x.fromContract && x.to === people[k].id); back[k] = m.length ? BigInt(m[0].amount) : 0n; } return back; }

    async function midgeQuote(s, { path: p, pricing, rates, label }) {
      const id = `qt-${tag}-${p.toLowerCase()}`; const roost = new HostedRoost({ provider }); const t0 = Date.now();
      s.assert(`hatch ${id}`, track(p, await hatch(id, roost.settlePublicKey, 16)).ok); await chain.waitFor(() => state(id), { what: 'syndicate' });
      for (const k of WHO) s.assert(`${k} deposits ${DEPOSIT}`, track(p, await deposit(k, id)).ok);
      await chain.waitFor(async () => BigInt((await state(id)).total_escrow) === near(DEPOSIT) * 5n, { what: 'all deposits' });
      s.assert('the public escrows are all equal, so they attribute no cost to any named lender', new Set(Object.values(await escrowsOf(id)).map(String)).size === 1);
      for (const k of WHO) roost.submitSealedIntent({ flyerId: people[k].id, cipherTextHex: sealToModel(JSON.stringify({ rateBps: rates[k] }), roost.intentPublicKey) });
      const out = roost.runQuote({ shape: 'lend', pricing, counterparty: borrower.id, amount: LOAN, limit: MAX, roundId: id });
      s.observe(`${label}: what the host computed`, out.outcome);
      const st = await state(id);
      const signed = roost.signSettlement({ contractId: chain.coordinatorId, syndicateId: id, epoch: Number(st.epoch), roundNonce: st.round_nonce, allocations: out.allocations, orderHash: out.orderHash, charges: out.charges });
      const tx = track(p, await chain.send(coord.account, 'settle_batch_charged', { syndicate_id: id, attestation_nonce: st.round_nonce, aggregate_order_hash: out.orderHash, allocations: out.allocations, charges: out.charges, enclave_signature: signed.signature }, { gas: 150000000000000n, label: `settle_batch_charged ${id}` }));
      s.evidence('tx', { label: tx.label, hash: tx.hash, ok: tx.ok, explorer: tx.explorer, error: tx.error });
      s.assert('settle_batch_charged succeeded', tx.ok, { actual: tx.error });
      await chain.waitFor(async () => { const x = await state(id); return !x.is_settling && BigInt(x.total_escrow) === near(DEPOSIT) * 5n - near(LOAN); }, { what: 'settlement resolved' });
      const paid = (await chain.transfersOf(tx.hash, chain.coordinatorId)).filter((m) => m.fromContract && m.to === borrower.id);
      s.assert('(4) the borrower received exactly 0.05', paid.length === 1 && BigInt(paid[0].amount) === near(LOAN), { actual: paid });
      const winner = nameOf(out.outcome.winner); const esc = await escrowsOf(id);
      for (const k of WHO) s.assert(`(4) ${k}'s escrow is ${k === winner ? 'now 0 (charged the loan)' : 'untouched at 0.05'}`, esc[k] === (k === winner ? 0n : near(DEPOSIT)), { actual: String(esc[k]) });
      const args = await txArgs(tx.hash, coord.id);
      s.assert('the settlement carries no rate: its arguments are only the syndicate, nonce, order hash, allocations, charges and signature', args && Object.keys(args).sort().join() === ['aggregate_order_hash', 'allocations', 'attestation_nonce', 'charges', 'enclave_signature', 'syndicate_id'].sort().join(), { actual: args && Object.keys(args) });
      await waitForTimer(id, 16);
      const back = await exitAll(s, p, id, [winner]);
      const winnerExit = await chain.send(people[winner].account, 'hatch_out', { syndicate_id: id }, { gas: 60000000000000n, label: `exit ${id} as ${winner} (nothing left)` });
      s.assert('(4) the winner was charged its whole deposit, so it has nothing to exit with and the contract says so', !winnerExit.ok && /No escrow balance/.test(winnerExit.error || ''), { actual: winnerExit.error });
      for (const k of WHO) s.assert(`(4) ${k} exits with ${k === winner ? '0' : 'the full 0.05'}`, back[k] === (k === winner ? 0n : near(DEPOSIT)), { actual: String(back[k]) });
      s.assert('the syndicate ended fully refunded', /aborted|refunded/i.test(String((await state(id)).status)) && BigInt((await state(id)).total_escrow) === 0n);
      return { out, winner, rate: out.outcome.rateBps, wallMs: Date.now() - t0, settleTx: tx.hash };
    }

    await ctx.step('set up: five lenders, a borrower, and the open quote contract deployed fresh', async (s) => {
      countBefore = Number(await chain.view('get_syndicate_count', {}));
      const wasmPath = path.join(ctx.rootDir, 'contracts/public-market/target/wasm32-unknown-unknown/release/public_market.wasm');
      s.assert('the public market wasm is built (npm run build:wasm:market)', fs.existsSync(wasmPath));
      const made = await createMembers(chain, { rootDir: ctx.rootDir, tag: `q${tag.slice(-5)}`, count: 6, fundNear: '0.6', names: ['a', 'b', 'c', 'd', 's', 'r'] });
      people = { a: made[0], b: made[1], c: made[2], d: made[3], s: made[4] }; borrower = made[5];
      const baseId = `pm${tag.slice(-6)}.${chain.masterId}`; const h = memberHandle(chain, baseId);
      await chain.master.createSubAccount({ accountOrPrefix: `pm${tag.slice(-6)}`, publicKey: h.key.keyPair.getPublicKey(), nearToTransfer: near('3.2') });
      baseline = h; await chain.waitFor(async () => { try { await h.account.getBalance(); return true; } catch { return false; } }, { what: 'baseline account' });
      await h.account.deployContract(fs.readFileSync(wasmPath));
      s.assert('the open quote contract is deployed and answers', (await chain.view('get_request', { request_id: 'none' }, baseId)) === null);
    }, { critical: true });

    // ================= open reverse quotes =================
    await ctx.step('OPEN · honest lenders open at the maximum and undercut by 25 bps down to their cost, then the sniper watches the chain and undercuts by 1 bp at the end', async (s) => {
      const id = `pubq-${tag}`; const t0 = Date.now(); const start = await height(); const startMs = Date.now(); const end = start + 450;
      s.assert('open the request', track('PUB', await chain.send(people.a.account, 'open_request', { request_id: id, borrower: borrower.id, loan: String(near(LOAN)), max_rate_bps: MAX, end_block: end }, { gas: 30000000000000n, contractId: baseline.id, label: 'open request' })).ok);
      await chain.waitFor(() => reqView(id), { what: 'request' });
      for (let pass = 0; pass < 10; pass += 1) {
        let moved = false;
        for (const who of HONEST) {
          const r = await reqView(id); const best = r.best_quoter ? r.best_rate_bps : null;
          if (r.best_quoter === people[who].id) continue;
          const target = Math.max(COST[who], best === null ? MAX : best - STEP);
          if ((best !== null && target >= best) || target > MAX) continue;
          const q = track('PUB', await quotePublic(who, target, id));
          s.assert(`${who} quotes ${target} bps`, q.ok, { actual: q.error });
          if (q.ok) { moved = true; await chain.waitFor(async () => (await reqView(id)).best_rate_bps === target, { what: 'the quote to be visible', timeoutMs: 30000, everyMs: 700 }); }
        }
        if (!moved) break;
      }
      const honest = await reqView(id); const honestLog = await chain.view('get_quote_log', { request_id: id }, baseline.id);
      s.observe('quotes before the sniper', honestLog.map((q) => `${nameOf(q.quoter)} ${q.rate_bps}`));
      s.assert('the honest round leaves b leading at 450 bps (prediction 2)', honest.best_quoter === people.b.id && honest.best_rate_bps === 450, { actual: { leader: nameOf(honest.best_quoter), rate: honest.best_rate_bps } });
      const preHeight = await height(); s.assert('the honest quoting finished with time to spare before the end', end - preHeight > 12, { actual: end - preHeight });
      const nowH = await height(); const blockMs = (Date.now() - startMs) / Math.max(1, nowH - start);
      const latencyBlocks = Math.ceil((quoteMs.reduce((x, y) => x + y, 0) / quoteMs.length) / blockMs); const lead = latencyBlocks + 3;
      s.observe('measured: block time (ms), mean quote latency (blocks), the sniper sends this many blocks before the end', { blockMs: Math.round(blockMs), latencyBlocks, lead });
      await chain.waitFor(async () => (await height()) >= end - lead, { what: 'the last blocks', timeoutMs: 900000, everyMs: 900 });
      const now = await reqView(id); const sniperRate = now.best_rate_bps - 1;
      let sniped = null;
      if (sniperRate >= COST.s) sniped = track('PUB', await quotePublic('s', sniperRate, id));
      const sniperBlock = await height();
      await chain.waitFor(async () => (await height()) >= end + 1, { what: 'the end', timeoutMs: 300000, everyMs: 700 });
      const final = await reqView(id);
      const closeTx = track('PUB', await chain.send(people.a.account, 'close_request', { request_id: id }, { gas: 30000000000000n, contractId: baseline.id, label: 'close request' }));
      s.assert('the request closed', closeTx.ok, { actual: closeTx.error });
      const paid = (await chain.transfersOf(closeTx.hash, people.a.id)).filter((m) => m.predecessor === baseline.id && m.to === borrower.id);
      s.assert('the borrower received exactly the 0.05 loan', paid.length === 1 && BigInt(paid[0].amount) === near(LOAN), { actual: paid });
      const log = await chain.view('get_quote_log', { request_id: id }, baseline.id);
      const lowest = Object.fromEntries(HONEST.map((k) => [k, Math.min(...log.filter((q) => q.quoter === people[k].id).map((q) => q.rate_bps))]));
      const attributed = HONEST.filter((k) => Math.abs(lowest[k] - COST[k]) <= 0.10 * COST[k]).length;
      const winner = nameOf(final.best_quoter);
      results.PUB = { winner, rate: final.best_rate_bps, lowestCostLender: 'b', attributedWithin10pct: attributed, of: 4, quotesOnChain: final.quotes, honestLendersVisible: HONEST.filter((k) => log.some((q) => q.quoter === people[k].id)).length, gasTGas: +gas.PUB.toFixed(1), wallMs: Date.now() - t0, sniped: Boolean(sniped?.ok), blocksBeforeEnd: end - sniperBlock };
      s.observe('result', results.PUB);
      s.assert('(1) every honest lender\'s quotes are public: 4 of 4', results.PUB.honestLendersVisible === 4);
      s.assert('(1) an observer attributes a cost within 10% to at least 3 of the 4 honest lenders from their lowest quote', attributed >= 3, { actual: { lowest, attributed } });
      s.observe('the sniper\'s quote', sniped?.ok ? 'landed before the end' : `did not land: ${String(sniped?.error || 'not sent').split('\n').pop().slice(0, 80)}`);
      s.assert('(2) either the sniper\'s 449 landed in time and won, or it was refused as late and b kept the lead at 450', (sniped?.ok === true && winner === 's' && final.best_rate_bps === 449) || (sniped?.ok === false && /request has ended/.test(sniped.error || '') && winner === 'b' && final.best_rate_bps === 450) || (sniped === null && winner === 'b'), { actual: { sniped: sniped?.ok, error: sniped?.error?.slice(-120), winner, rate: final.best_rate_bps } });
      s.evidence('OPEN', { ...results.PUB, quoteTxs: undefined });
    });

    // ================= Midge sealed first-price and second-price =================
    for (const [p, pricing, label, rates, expectRate] of [
      ['FP', 'first', 'sealed first-price (lenders quote cost + 50)', Object.fromEntries(WHO.map((k) => [k, COST[k] + 50])), 450],
      ['SP', 'second', 'sealed second-price (lenders quote their true cost)', COST, 420],
    ]) {
      await ctx.step(`MIDGE · ${label}: common deposit, the host picks the winner, the contract charges only the winner`, async (s) => {
        const r = await midgeQuote(s, { path: p, pricing, rates, label });
        results[p] = { winner: r.winner, rate: r.rate, attributedWithin10pct: 0, of: 5, rateOnChain: false, gasTGas: +gas[p].toFixed(1), wallMs: r.wallMs };
        s.observe('result', results[p]);
        s.assert('(3) the lowest-cost lender, b, won with the sniper present', r.winner === 'b', { actual: results[p] });
        s.assert(`(3) the agreed rate is ${expectRate} bps`, r.rate === expectRate, { actual: r.rate });
        // (1) for the sealed rounds is carried by two assertions inside midgeQuote: the public escrows are all equal, and the settlement's arguments carry no rate.
        s.evidence(p, { ...results[p], settleTx: r.settleTx });
      });
    }

    // ================= the host never signs =================
    await ctx.step('DEAD HOST · the host never signs: nothing settles and every lender exits alone with the full deposit', async (s) => {
      const id = `qt-${tag}-dead`; const roost = new HostedRoost({ provider });
      s.assert('hatch', (await hatch(id, roost.settlePublicKey, 16)).ok); await chain.waitFor(() => state(id), { what: 'syndicate' });
      for (const k of WHO) s.assert(`${k} deposits`, (await deposit(k, id)).ok);
      await chain.waitFor(async () => BigInt((await state(id)).total_escrow) === near(DEPOSIT) * 5n, { what: 'deposits' });
      await waitForTimer(id, 16);
      const back = await exitAll(s, 'DEAD', id).catch(() => null);
      s.assert('(5) every lender recovered the full 0.05 alone', back && WHO.every((k) => back[k] === near(DEPOSIT)), { actual: back && Object.fromEntries(Object.entries(back).map(([k, v]) => [k, String(v)])) });
      results.DEAD = { allRecovered: true };
    });

    await ctx.step('the comparison, read from the measurements above', async (s) => {
      s.observe('results', results);
      s.assert('every path was measured', ['PUB', 'FP', 'SP', 'DEAD'].every((k) => results[k]));
      const ratio = +(gas.FP / gas.PUB).toFixed(2);
      s.observe('gas, TGas for the whole round: open / first-price / second-price', [gas.PUB, gas.FP, gas.SP].map((x) => +x.toFixed(1)));
      s.observe('wall time (ms): open / first-price / second-price', [results.PUB.wallMs, results.FP.wallMs, results.SP.wallMs]);
      s.assert('(6) gas of the first-price round over the open round is between 0.5 and 1.5', ratio >= 0.5 && ratio <= 1.5, { actual: ratio });
      s.observe('borrower\'s rate: open / first-price / second-price (bps)', [results.PUB.rate, results.FP.rate, results.SP.rate]);
      s.evidence('comparison', results);
    });

    await ctx.step('teardown: delete the baseline contract, prune the syndicates, delete the accounts', async (s) => {
      if (baseline) { try { await baseline.account.deleteAccount(chain.masterId); s.observe('baseline contract account', 'deleted, balance returned to the master'); } catch (e) { s.observe('baseline contract account NOT deleted', String(e.message).slice(0, 120)); } }
      if (!people) { s.assert('nothing to tear down', true); return; }
      const rep = await teardownMembers(chain, { rootDir: ctx.rootDir, members: [...ids(), borrower], pruneIds: created });
      s.observe('teardown', { pruned: rep.pruned.length, notPruned: rep.notPruned, deleted: rep.deleted.length, kept: rep.kept, failed: rep.failed });
      s.assert('every account was deleted and every syndicate pruned', rep.failed.length === 0 && rep.kept.length === 0 && rep.notPruned.length === 0, { actual: rep });
      s.assert('the contract holds the records it started with', Number(await chain.view('get_syndicate_count', {})) === countBefore, { expected: countBefore });
    }, { always: true });
  },
};
