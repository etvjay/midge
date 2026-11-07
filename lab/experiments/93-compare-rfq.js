import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { connect, near, computePolicyHash } from '../lib/near.js';
import { createMembers, teardownMembers, memberHandle } from '../lib/members.js';
import { HostedRoost } from '../../src/roost-service/hosted-roost.js';
import { sealToModel } from '../../src/enclave/e2ee.js';
import { signInputWithNearKey, inputMessage, makeAccountKeyCheck } from '../../src/roost-service/signed-input.js';

const provider = { simulated: true, attest: async () => Buffer.from('lab-local-no-hardware'), info: async () => ({}) };
const MAKERS = ['m1', 'm2', 'm3', 'm4']; const WHO = ['t', ...MAKERS];
const QUOTE = { m1: { bid: 1950, ask: 2050 }, m2: { bid: 1900, ask: 2000 }, m3: { bid: 1970, ask: 2100 }, m4: { bid: 1850, ask: 2150 } };   // micro-NEAR per unit
const UNITS = 10; const BUY_LIMIT = 2200; const SELL_LIMIT = 1800; const COMMON = '0.03';
const dec = (micro) => (micro / 1e6).toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
const MICRO = 10n ** 18n;

export default {
  id: 'E-CMP-RFQ-01',
  title: 'Two-sided RFQ on testnet: an open RFQ where the taker\'s side is public against a sealed RFQ where makers quote both ways and never see it',
  tier: 'testnet',
  requires: ['near-key', 'network'],
  hypothesis: 'Predictions are fixed in docs/lab/PROGRAMME_PLAN.md (committed before this ran). One taker and four makers with two-way quotes, 10 units, buy limit 0.0022, sell limit 0.0018, a buy and a sell RFQ on each path. (1) Open: an observer reads the taker\'s side, size and limit (3 of 3) and every maker\'s one-sided quote (4 of 4) in both RFQs, and every maker sees the side before quoting. Sealed: 0 of 3 and 0 of 4 before settlement; the settlement shows who paid whom and the notional but not units or price per unit, and the notional does not identify them. (2) Buy goes to m2 at 0.002 and sell to m3 at 0.00197 in both paths. (3) Buy: m2 receives exactly 0.02 and the taker is charged exactly 0.02; sell: the taker receives exactly 0.0197 and m3 is charged exactly 0.0197; nothing else moves; the sealed room\'s second round runs on the rotated nonce after the first settles part of the escrow. (4) If the host never signs, nothing settles and all five exit with the full 0.03. (5) Gas of the sealed path over the open path is between 0.5 and 4 and the sealed RFQs finish faster. Fails if any breaks.',
  limits: [
    'One operator controls every account and the host; the makers are scripted and quote their true two-way prices; in the open path they post in improving order. Neither path models makers skewing their quotes once they learn the taker\'s side: that is the reason sealing the side matters, and this run shows only that the side is public in one path and not in the other.',
    'The open baseline is our own minimal RFQ contract (contracts/public-market), not anyone else\'s. The host is a local HostedRoost with a simulated attestation provider; signed inputs use real NEAR keys and the real account-key lookup.',
    'Only the cash leg settles: nothing delivers the asset. The settlement reveals who pays whom (the side) and the notional. Deposits are public and hide roles only because everyone deposits the same 0.03.',
    'Second-price pricing is tested offline, not live. A late sniper was shown for lending quotes, not repeated here.',
  ],
  async run(ctx) {
    const chain = await connect(ctx.rootDir);
    const coord = chain.sub('c');
    const tag = Date.now().toString(36);
    const created = []; const results = { PUB: {}, SEAL: {} }; const gas = { PUB: 0, SEAL: 0 };
    let P = null; let market = null; let countBefore;
    const ids = () => Object.values(P);
    const track = (p, e) => { gas[p] += e.gasTGas || 0; return e; };
    const height = (f = 'optimistic') => chain.blockHeight(f);
    const state = (id) => chain.view('get_syndicate', { syndicate_id: id });
    const keyCheck = makeAccountKeyCheck({ rpcUrl: 'https://test.rpc.fastnear.com', contractId: chain.coordinatorId });
    const nameOf = (a) => WHO.find((k) => P[k].id === a);
    const policyFor = () => ({ allowed_recipients: WHO.map((k) => P[k].id), max_release_bps_per_epoch: 10000, settle_deadline_block: 500000000 });
    const txArgs = async (hash, signer) => { for (const url of ['https://test.rpc.fastnear.com', 'https://archival-rpc.testnet.fastnear.com']) { try { const r = await (await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'EXPERIMENTAL_tx_status', params: [hash, signer] }) })).json(); if (r.result) return JSON.parse(Buffer.from(r.result.transaction.actions[0].FunctionCall.args, 'base64').toString('utf8')); } catch { /* next */ } } return null; };
    const escrowsOf = async (id) => Object.fromEntries(await Promise.all(WHO.map(async (k) => [k, BigInt(await chain.view('get_escrow', { syndicate_id: id, account_id: P[k].id }))])));
    const waitForTimer = (id) => chain.waitFor(async () => (await height('final')) - Number((await state(id)).epoch_start_block) >= 16, { what: 'the exit timer', timeoutMs: 120000 });
    const rfqView = (id) => chain.view('get_rfq', { rfq_id: id }, market.id);
    const hatch = (id, keyHex) => { created.push(id); return chain.send(coord.account, 'hatch', { syndicate_id: id, syndicate_type: 'FLASH', quorum_threshold: 1, max_spend_near: 1, enclave_public_key: keyHex, expected_code_hash: crypto.randomBytes(32).toString('hex'), timeout_blocks: 16, payout_recipient: P.t.id, release_policy: policyFor() }, { deposit: near('0.01'), gas: 40000000000000n, label: `hatch ${id}` }); };
    const deposit = (who, id) => chain.send(P[who].account, 'deposit', { syndicate_id: id, policy_hash: computePolicyHash(policyFor(), 16) }, { deposit: near(COMMON), gas: 30000000000000n, label: `deposit ${who} -> ${id}` });
    const cast = (host, round, who, body) => { const cipherTextHex = sealToModel(JSON.stringify(body), host.intentPublicKey); return host.submitSignedIntent({ flyerId: P[who].id, cipherTextHex, publicKey: P[who].key.keyPair.getPublicKey().toString(), signature: signInputWithNearKey(P[who].key.keyPair.toString(), inputMessage({ ...round, flyerId: P[who].id, seq: 1, cipherTextHex })), seq: 1 }); };

    await ctx.step('set up: a taker, four makers, and the open RFQ contract deployed fresh', async (s) => {
      countBefore = Number(await chain.view('get_syndicate_count', {}));
      const wasm = path.join(ctx.rootDir, 'contracts/public-market/target/wasm32-unknown-unknown/release/public_market.wasm');
      s.assert('the public market wasm is built (npm run build:wasm:market)', fs.existsSync(wasm));
      const made = await createMembers(chain, { rootDir: ctx.rootDir, tag: `r${tag.slice(-5)}`, count: 5, fundNear: '0.4', names: WHO });
      P = Object.fromEntries(WHO.map((k, i) => [k, made[i]]));
      const baseId = `pr${tag.slice(-6)}.${chain.masterId}`; const h = memberHandle(chain, baseId);
      await chain.master.createSubAccount({ accountOrPrefix: `pr${tag.slice(-6)}`, publicKey: h.key.keyPair.getPublicKey(), nearToTransfer: near('4.0') });
      market = h; await chain.waitFor(async () => { try { await h.account.getBalance(); return true; } catch { return false; } }, { what: 'baseline account' });
      await h.account.deployContract(fs.readFileSync(wasm));
      s.assert('the open RFQ contract answers', (await chain.view('get_rfq', { rfq_id: 'none' }, baseId)) === null);
    }, { critical: true });

    // ================= open RFQ =================
    for (const side of ['buy', 'sell']) {
      await ctx.step(`OPEN · a ${side} RFQ: the taker states side, size and limit on chain; makers see them and quote one way, improving`, async (s) => {
        const t0 = Date.now(); const id = `rfq-${tag}-${side}`; const start = await height(); const end = start + 150; const limit = side === 'buy' ? BUY_LIMIT : SELL_LIMIT;
        const dep = side === 'buy' ? BigInt(UNITS) * BigInt(limit) * MICRO : 0n;
        s.assert('the taker opens the RFQ', track('PUB', await chain.send(P.t.account, 'open_rfq', { rfq_id: id, side, units: UNITS, limit_micro: limit, end_block: end }, { deposit: dep, gas: 30000000000000n, contractId: market.id, label: `open ${side} rfq` })).ok);
        await chain.waitFor(() => rfqView(id), { what: 'rfq' });
        const seen = await rfqView(id);
        s.assert('(1) before any maker quotes, an observer reads the taker\'s side, size and limit: 3 of 3', seen.side === side && seen.units === UNITS && Number(seen.limit_micro) === limit && seen.taker === P.t.id);
        // makers read the request, then quote the side's price in improving order
        const order = side === 'buy' ? [...MAKERS].sort((a, b) => QUOTE[b].ask - QUOTE[a].ask) : [...MAKERS].sort((a, b) => QUOTE[a].bid - QUOTE[b].bid);
        for (const m of order) {
          const price = side === 'buy' ? QUOTE[m].ask : QUOTE[m].bid; const esc = side === 'sell' ? BigInt(UNITS) * BigInt(price) * MICRO : 0n;
          const q = track('PUB', await chain.send(P[m].account, 'rfq_quote', { rfq_id: id, price_micro: price }, { deposit: esc, gas: 30000000000000n, contractId: market.id, label: `${m} quotes ${price}` }));
          s.assert(`${m} quotes ${dec(price)} per unit after reading the public ${side} request`, q.ok, { actual: q.error });
          await chain.waitFor(async () => { const v = await rfqView(id); return Number(v.best_price_micro) === price && v.best_maker === P[m].id; }, { what: 'quote visible', timeoutMs: 30000, everyMs: 800 });
        }
        const log = await chain.view('get_rfq_quotes', { rfq_id: id }, market.id);
        s.assert('(1) every maker\'s quote is public: 4 of 4', log.length === 4 && new Set(log.map((x) => x.maker)).size === 4);
        await chain.waitFor(async () => (await height()) >= end + 1, { what: 'the end of the RFQ', timeoutMs: 400000, everyMs: 900 });
        const closeTx = track('PUB', await chain.send(P.t.account, 'close_rfq', { rfq_id: id }, { gas: 100000000000000n, contractId: market.id, label: `close ${side} rfq` }));
        s.evidence('tx', { label: closeTx.label, hash: closeTx.hash, ok: closeTx.ok, explorer: closeTx.explorer, error: closeTx.error });
        s.assert('the RFQ closed', closeTx.ok, { actual: closeTx.error });
        const fin = await rfqView(id); const winner = nameOf(fin.best_maker);
        const moved = (await chain.transfersOf(closeTx.hash, P.t.id)).filter((m) => m.predecessor === market.id);
        if (side === 'buy') {
          s.assert('(2) m2 won the buy at 0.002', winner === 'm2' && Number(fin.best_price_micro) === 2000, { actual: { winner, price: fin.best_price_micro } });
          const toM2 = moved.find((m) => m.to === P.m2.id); const back = moved.find((m) => m.to === P.t.id);
          s.assert('(3) m2 received exactly 0.02 and the taker was refunded the 0.002 difference', toM2 && BigInt(toM2.amount) === 20000n * MICRO && back && BigInt(back.amount) === 2000n * MICRO, { actual: moved.map((m) => [nameOf(m.to), String(m.amount)]) });
        } else {
          s.assert('(2) m3 won the sell at 0.00197', winner === 'm3' && Number(fin.best_price_micro) === 1970, { actual: { winner, price: fin.best_price_micro } });
          const toT = moved.find((m) => m.to === P.t.id);
          s.assert('(3) the taker received exactly 0.0197 from m3\'s escrow', toT && BigInt(toT.amount) === 19700n * MICRO && moved.length === 1, { actual: moved.map((m) => [nameOf(m.to), String(m.amount)]) });
        }
        results.PUB[side] = { winner, price: Number(fin.best_price_micro), takerSideReadable: true, sizeReadable: true, limitReadable: true, quotesReadable: 4, wallMs: Date.now() - t0 };
        s.observe('result', results.PUB[side]); s.evidence(`OPEN-${side}`, results.PUB[side]);
      });
    }

    // ================= sealed RFQ =================
    const sid = () => `rfq-${tag}-sealed`;
    let host; let syn;
    await ctx.step('MIDGE · set up one room: every participant deposits the same 0.03, so deposits reveal nobody\'s role', async (s) => {
      host = new HostedRoost({ provider, requireSignedInputs: true, accountKeyCheck: keyCheck }); syn = sid();
      s.assert('hatch', track('SEAL', await hatch(syn, host.settlePublicKey)).ok); await chain.waitFor(() => state(syn), { what: 'syndicate' });
      for (const k of WHO) s.assert(`${k} deposits ${COMMON}`, track('SEAL', await deposit(k, syn)).ok);
      await chain.waitFor(async () => BigInt((await state(syn)).total_escrow) === near(COMMON) * 5n, { what: 'deposits' });
      s.assert('(1) the public escrows are all equal, so they reveal neither who is the taker nor any size', new Set(Object.values(await escrowsOf(syn)).map(String)).size === 1);
    });
    let sealedEsc = Object.fromEntries(WHO.map((k) => [k, near(COMMON)]));
    for (const side of ['buy', 'sell']) {
      await ctx.step(`MIDGE · a sealed ${side} RFQ: the taker's request and the makers' two-way quotes are sealed; only the winner is charged and paid`, async (s) => {
        const t0 = Date.now(); const st = await state(syn); const round = { contractId: chain.coordinatorId, syndicateId: syn, epoch: Number(st.epoch), roundNonce: st.round_nonce }; host.openRound(round);
        const limit = side === 'buy' ? BUY_LIMIT : SELL_LIMIT;
        await cast(host, round, 't', { side, units: UNITS, limit: dec(limit), salt: crypto.randomBytes(16).toString('hex') });
        for (const m of MAKERS) await cast(host, round, m, { bid: dec(QUOTE[m].bid), ask: dec(QUOTE[m].ask) });
        const out = host.runRfq({ taker: P.t.id, makers: MAKERS.map((m) => P[m].id), roundId: `${syn}-${side}` });
        const winner = nameOf(out.outcome.winner);
        const signed = host.signSettlement({ ...round, allocations: out.allocations, orderHash: out.orderHash, charges: out.charges });
        const tx = track('SEAL', await chain.send(coord.account, 'settle_batch_charged', { syndicate_id: syn, attestation_nonce: round.roundNonce, aggregate_order_hash: out.orderHash, allocations: out.allocations, charges: out.charges, enclave_signature: signed.signature }, { gas: 150000000000000n, label: `settle_batch_charged ${syn} ${side}` }));
        s.evidence('tx', { label: tx.label, hash: tx.hash, ok: tx.ok, explorer: tx.explorer, error: tx.error }); s.assert('the settlement succeeded', tx.ok, { actual: tx.error });
        const cost = BigInt(UNITS) * BigInt(side === 'buy' ? 2000 : 1970) * MICRO;
        await chain.waitFor(async () => { const x = await state(syn); return !x.is_settling && BigInt(x.total_escrow) === Object.values(sealedEsc).reduce((a, b) => a + b, 0n) - cost; }, { what: 'settlement resolved' });
        const moved = (await chain.transfersOf(tx.hash, coord.id)).filter((m) => m.fromContract);
        if (side === 'buy') {
          s.assert('(2) m2 won the buy at 0.002', winner === 'm2' && out.terms.price === '0.002', { actual: out.terms });
          s.assert('(3) m2 received exactly 0.02 and nothing else moved', moved.length === 1 && moved[0].to === P.m2.id && BigInt(moved[0].amount) === 20000n * MICRO, { actual: moved.map((m) => [nameOf(m.to), String(m.amount)]) });
          sealedEsc.t -= cost;
        } else {
          s.assert('(2) m3 won the sell at 0.00197', winner === 'm3' && out.terms.price === '0.00197', { actual: out.terms });
          s.assert('(3) the taker received exactly 0.0197 and nothing else moved', moved.length === 1 && moved[0].to === P.t.id && BigInt(moved[0].amount) === 19700n * MICRO, { actual: moved.map((m) => [nameOf(m.to), String(m.amount)]) });
          sealedEsc.m3 -= cost;
        }
        const esc = await escrowsOf(syn);
        s.assert('(3) only the payer\'s escrow fell, by exactly the cost', WHO.every((k) => esc[k] === sealedEsc[k]), { actual: Object.fromEntries(Object.entries(esc).map(([k, v]) => [k, String(v)])) });
        const args = await txArgs(tx.hash, coord.id);
        s.assert('(1) the settlement carries only who pays whom and the amount: no side, units, limit or price per unit field', args && Object.keys(args).sort().join() === ['aggregate_order_hash', 'allocations', 'attestation_nonce', 'charges', 'enclave_signature', 'syndicate_id'].sort().join() && args.allocations.length === 1 && args.charges.length === 1);
        const notional = BigInt(args.allocations[0].amount) / MICRO; let consistent = 0;
        for (let u = 1; u <= 100; u += 1) { if (notional % BigInt(u) === 0n) consistent += 1; }
        s.assert('(1) the notional does not identify the units: many whole-unit sizes up to 100 give the same notional', consistent > 5, { actual: consistent });
        s.observe('how many unit counts from 1 to 100 divide the notional evenly', consistent);
        results.SEAL[side] = { winner, price: out.terms.price, takerSideReadable: false, sizeReadable: false, limitReadable: false, quotesReadable: 0, wallMs: Date.now() - t0 };
        s.observe('result', results.SEAL[side]); s.evidence(`SEALED-${side}`, { ...results.SEAL[side], settleTx: tx.hash });
      });
    }
    await ctx.step('MIDGE · everyone exits alone with exactly the remaining escrow', async (s) => {
      await waitForTimer(syn);
      for (const k of WHO) { if (sealedEsc[k] === 0n) continue; const r = await chain.send(P[k].account, 'hatch_out', { syndicate_id: syn }, { gas: 60000000000000n, label: `exit ${syn} as ${k}` }); s.assert(`${k} exits alone`, r.ok, { actual: r.error }); const m = (await chain.transfersOf(r.hash, P[k].id)).filter((x) => x.fromContract && x.to === P[k].id); s.assert(`${k} got back exactly ${String(sealedEsc[k])}`, m.length === 1 && BigInt(m[0].amount) === sealedEsc[k], { actual: m }); }
      s.assert('the room ended fully refunded', /aborted|refunded/i.test(String((await state(syn)).status)) && BigInt((await state(syn)).total_escrow) === 0n);
    });

    await ctx.step('DEAD HOST · the host never signs: nothing settles and every participant exits alone with the full deposit', async (s) => {
      const id = `rfq-${tag}-dead`; const dead = new HostedRoost({ provider });
      s.assert('hatch', (await hatch(id, dead.settlePublicKey)).ok); await chain.waitFor(() => state(id), { what: 'syndicate' });
      for (const k of WHO) s.assert(`${k} deposits`, (await deposit(k, id)).ok);
      await chain.waitFor(async () => BigInt((await state(id)).total_escrow) === near(COMMON) * 5n, { what: 'deposits' });
      await waitForTimer(id);
      for (const k of WHO) { const r = await chain.send(P[k].account, 'hatch_out', { syndicate_id: id }, { gas: 60000000000000n, label: `exit ${id} as ${k}` }); s.assert(`(4) ${k} exits alone`, r.ok); const m = (await chain.transfersOf(r.hash, P[k].id)).filter((x) => x.fromContract && x.to === P[k].id); s.assert(`(4) ${k} recovered the full 0.03`, m.length === 1 && BigInt(m[0].amount) === near(COMMON), { actual: m }); }
      results.DEAD = { allRecovered: true };
    });

    await ctx.step('the comparison, read from the measurements above', async (s) => {
      s.observe('results', results);
      s.assert('every path was measured', results.PUB.buy && results.PUB.sell && results.SEAL.buy && results.SEAL.sell && results.DEAD);
      const ratio = +(gas.SEAL / gas.PUB).toFixed(2);
      s.observe('gas, TGas for both RFQs: open / sealed (hatch, deposits and settlements; no exits)', [gas.PUB, gas.SEAL].map((x) => +x.toFixed(1)));
      s.observe('wall time (ms): open buy / open sell / sealed buy / sealed sell', [results.PUB.buy.wallMs, results.PUB.sell.wallMs, results.SEAL.buy.wallMs, results.SEAL.sell.wallMs]);
      s.assert('(5) gas of the sealed path over the open path (hatch, deposits and settlements; no exits) is between 0.5 and 4', ratio >= 0.5 && ratio <= 4, { actual: ratio });
      s.assert('(5) each sealed RFQ finished faster than its open counterpart', results.SEAL.buy.wallMs < results.PUB.buy.wallMs && results.SEAL.sell.wallMs < results.PUB.sell.wallMs);
      s.evidence('comparison', results);
    });

    await ctx.step('teardown: delete the baseline contract, prune the syndicates, delete the accounts', async (s) => {
      if (market) { try { await market.account.deleteAccount(chain.masterId); s.observe('baseline contract account', 'deleted, balance returned to the master'); } catch (e) { s.observe('baseline contract account NOT deleted', String(e.message).slice(0, 120)); } }
      if (!P) { s.assert('nothing to tear down', true); return; }
      const rep = await teardownMembers(chain, { rootDir: ctx.rootDir, members: ids(), pruneIds: created });
      s.observe('teardown', { pruned: rep.pruned.length, notPruned: rep.notPruned, deleted: rep.deleted.length, kept: rep.kept, failed: rep.failed });
      s.assert('every account was deleted and every syndicate pruned', rep.failed.length === 0 && rep.kept.length === 0 && rep.notPruned.length === 0, { actual: rep });
      s.assert('the contract holds the records it started with', Number(await chain.view('get_syndicate_count', {})) === countBefore, { expected: countBefore });
    }, { always: true });
  },
};
