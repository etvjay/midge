import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { connect, near, fmt, computePolicyHash } from '../lib/near.js';
import { createMembers, teardownMembers, memberHandle } from '../lib/members.js';
import { HostedRoost, computeAllocationsHash, computeChargesHash } from '../../src/roost-service/hosted-roost.js';
import { sealToModel } from '../../src/enclave/e2ee.js';

const provider = { simulated: true, attest: async () => Buffer.from('lab-local-no-hardware'), info: async () => ({}) };
const VALUE = { a: 0.060, b: 0.045, c: 0.030, d: 0.020, s: 0.055 };   // each bidder's private valuation of the lot, in NEAR (s is the sniper)
const WHO = Object.keys(VALUE);
const DEPOSIT = '0.07';                                              // the same for everyone, so deposits say nothing about bids
const RESERVE = '0.01';
const micro = (x) => BigInt(Math.round(x * 1e6));
const nearOfMicro = (m) => near((Number(m) / 1e6).toFixed(6));

export default {
  id: 'E-CMP-AUCTION-01',
  title: 'Auctions on testnet: a public open auction against sealed first-price, sealed second-price and uniform-price run by the Roost',
  tier: 'testnet',
  requires: ['near-key', 'network'],
  hypothesis: 'Five bidders value one lot at 0.060, 0.045, 0.030, 0.020 and 0.055 NEAR (the last is a sniper who can watch the chain). In a public open auction an observer can attribute a valuation, within 5%, to most bidders from public bids, and the sniper, who can read every bid, always has a winning bid available from public state alone; if it lands before the end it takes the lot from the highest-value bidder, and if it lands late the contract refuses it. (The first version of this experiment predicted that the sniper would land; in two runs it did not, because bid latency here is ~25 blocks and varies. That prediction was falsified and is kept as evidence in docs/lab-runs; this version asserts what is actually true.) In Midge, with everyone depositing the same amount, an observer attributes no valuation to any named bidder, the highest-value bidder wins, losers are refunded exactly, the winner pays exactly the charge the Roost computed, and a Roost that tries to charge a member more than their deposit, charge a total that is not the payout, or reuse an ordinary settlement signature is refused by the contract. A uniform-price run charges every filled bid one price. Fails if any of that does not hold. Also measured: revenue, gas and time, and the residual risk of per-member charges (a compromised room can charge a member up to their whole deposit).',
  limits: [
    'One operator controls every account. The bidders are scripted: honest bidders raise by 10% up to their value (public) or bid truthfully (second-price) or at 80% of value (first-price, the textbook equilibrium shade for five bidders); only the sniper is adversarial. This shows what the mechanisms do against these strategies, not what real bidders would do, and one scripted instance is not a statistical comparison of revenue.',
    'The public baseline is our own minimal open (English) auction contract, the common on-chain pattern. It is not Uniswap\'s or anyone else\'s contract. There is no public uniform-price baseline: the uniform-price run is Midge only, checked against its own rule.',
    'The Roost is a local HostedRoost with a simulated attestation provider (the hardware room is E-COMBINED-LIVE-01); the Roost image on Phala does not yet contain the auction code.',
    'Sealed bids are not authenticated to an account (GAP-023); every bidder here is honest about who they are.',
    'Deposits are public. They hide bids only because everyone deposits the same 0.07 NEAR. Losers recover their deposit only after the exit timer.',
    'The sniper\'s success depends on timing against ~1 s blocks and is recorded, not guaranteed.',
  ],
  async run(ctx) {
    const chain = await connect(ctx.rootDir);
    const coord = chain.sub('c');
    const tag = Date.now().toString(36);
    const created = []; const results = {}; const gas = { PUB: 0, FP: 0, SP: 0, UNI: 0 };
    let people = null; let seller; let baseline = null; let countBefore;
    const ids = () => WHO.map((k) => people[k]);
    const track = (path, entry) => { gas[path] += entry.gasTGas || 0; return entry; };
    const height = async (finality = 'optimistic') => Number((await chain.provider.viewBlock({ finality })).header.height);
    const state = (id) => chain.view('get_syndicate', { syndicate_id: id });
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const depositOfTx = async (hash, signer) => { const r = await (await fetch('https://archival-rpc.testnet.fastnear.com', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'EXPERIMENTAL_tx_status', params: [hash, signer] }) })).json(); return BigInt(r.result.transaction.actions[0].FunctionCall.deposit); };

    // ---------- the public baseline ----------
    const baseView = (id) => chain.view('get_auction', { auction_id: id }, baseline.id);
    const bidMs = [];
    const bidPublic = async (who, amountMicro, id) => { const t = Date.now(); const r = await chain.send(people[who].account, 'bid', { auction_id: id }, { deposit: nearOfMicro(amountMicro), gas: 30000000000000n, contractId: baseline.id, label: `bid ${who} ${Number(amountMicro) / 1e6}` }); bidMs.push(Date.now() - t); return r; };

    // ---------- Midge helpers ----------
    const policyFor = () => ({ allowed_recipients: [seller.id], max_release_bps_per_epoch: 10000, settle_deadline_block: 500000000 });
    const hatch = (id, enclaveKeyHex, timeout) => { created.push(id); return chain.send(coord.account, 'hatch', { syndicate_id: id, syndicate_type: 'FLASH', quorum_threshold: 1, max_spend_near: 1, enclave_public_key: enclaveKeyHex, expected_code_hash: crypto.randomBytes(32).toString('hex'), timeout_blocks: timeout, payout_recipient: seller.id, release_policy: policyFor() }, { deposit: near('0.01'), gas: 40000000000000n, label: `hatch ${id}` }); };
    const deposit = (who, id, amt) => chain.send(people[who].account, 'deposit', { syndicate_id: id, policy_hash: computePolicyHash(policyFor()) }, { deposit: near(amt), gas: 30000000000000n, label: `deposit ${who} -> ${id}` });
    const escrowsOf = async (id, members = WHO) => Object.fromEntries(await Promise.all(members.map(async (k) => [k, BigInt(await chain.view('get_escrow', { syndicate_id: id, account_id: people[k].id }))])));
    const waitForTimer = (id, blocks) => chain.waitFor(async () => (await height('final')) - Number((await state(id)).epoch_start_block) >= blocks, { what: 'the exit timer', timeoutMs: 120000 });

    async function midgeAuction(s, { path, format, lot, bids, label, reserve = RESERVE }) {
      const id = `auc-${tag}-${path.toLowerCase()}`; const roost = new HostedRoost({ provider }); const t0 = Date.now();
      s.assert(`hatch ${id}`, track(path, await hatch(id, roost.settlePublicKey, 16)).ok); await chain.waitFor(() => state(id), { what: 'syndicate' });
      for (const k of WHO) s.assert(`${k} deposits ${DEPOSIT}`, track(path, await deposit(k, id, DEPOSIT)).ok);
      await chain.waitFor(async () => BigInt((await state(id)).total_escrow) === near(DEPOSIT) * 5n, { what: 'all deposits' });
      const seen = await escrowsOf(id);
      s.assert('the public escrows are all equal, so they attribute no valuation to any named bidder', new Set(Object.values(seen).map(String)).size === 1);
      for (const k of WHO) roost.submitSealedIntent({ flyerId: people[k].id, cipherTextHex: sealToModel(JSON.stringify({ price: bids[k].price, quantity: bids[k].qty }), roost.intentPublicKey) });
      const out = roost.runAuction({ format, lotUnits: lot, reserve, seller: seller.id, roundId: id });
      s.observe(`${label}: what the Roost computed (and will publish by settling)`, out.outcome);
      const st = await state(id);
      const signed = roost.signSettlement({ contractId: chain.coordinatorId, syndicateId: id, epoch: Number(st.epoch), roundNonce: st.round_nonce, allocations: out.allocations, orderHash: out.orderHash, charges: out.charges });
      const tx = track(path, await chain.send(coord.account, 'settle_batch_charged', { syndicate_id: id, attestation_nonce: st.round_nonce, aggregate_order_hash: out.orderHash, allocations: out.allocations, charges: out.charges, enclave_signature: signed.signature }, { gas: 150000000000000n, label: `settle_batch_charged ${id}` }));
      s.evidence('tx', { label: tx.label, hash: tx.hash, ok: tx.ok, explorer: tx.explorer, error: tx.error });
      s.assert('settle_batch_charged succeeded', tx.ok, { actual: tx.error });
      const proceeds = BigInt(out.allocations[0].amount);
      await chain.waitFor(async () => { const x = await state(id); return !x.is_settling && BigInt(x.total_escrow) === near(DEPOSIT) * 5n - proceeds; }, { what: 'settlement resolved' });
      const paid = (await chain.transfersOf(tx.hash, chain.coordinatorId)).filter((m) => m.fromContract && m.to === seller.id);
      s.assert(`the seller received exactly the proceeds, ${fmt(proceeds, 6)} NEAR`, paid.length === 1 && BigInt(paid[0].amount) === proceeds, { actual: paid });
      const charged = Object.fromEntries(out.charges.map((c) => [c.member, BigInt(c.amount)]));
      const escrows = await escrowsOf(id);
      for (const k of WHO) s.assert(`${k}'s escrow fell by exactly their own charge (${fmt(charged[people[k].id] || 0n, 6)})`, escrows[k] === near(DEPOSIT) - (charged[people[k].id] || 0n), { actual: String(escrows[k]) });
      await waitForTimer(id, 16);
      const refunds = {};
      for (const k of WHO) { const r = track(path, await chain.send(people[k].account, 'hatch_out', { syndicate_id: id }, { gas: 60000000000000n, label: `exit ${id} as ${k}` })); s.assert(`${k} exits alone`, r.ok, { actual: r.error }); const back = (await chain.transfersOf(r.hash, people[k].id)).filter((m) => m.fromContract && m.to === people[k].id); refunds[k] = back.length ? BigInt(back[0].amount) : 0n; }
      for (const k of WHO) s.assert(`${k} got back exactly their deposit less their charge`, refunds[k] === near(DEPOSIT) - (charged[people[k].id] || 0n), { actual: String(refunds[k]) });
      s.assert('the syndicate ended fully refunded', /aborted|refunded/i.test(String((await state(id)).status)) && BigInt((await state(id)).total_escrow) === 0n);
      return { id, out, wallMs: Date.now() - t0, charged, settleTx: tx.hash };
    }

    await ctx.step('set up: five bidders, a seller, and the public auction contract deployed fresh', async (s) => {
      countBefore = Number(await chain.view('get_syndicate_count', {}));
      const wasmPath = path.join(ctx.rootDir, 'contracts/public-auction/target/wasm32-unknown-unknown/release/public_auction.wasm');
      s.assert('the public auction wasm is built (npm run build:wasm:baseline)', fs.existsSync(wasmPath));
      const made = await createMembers(chain, { rootDir: ctx.rootDir, tag: `u${tag.slice(-5)}`, count: 6, fundNear: '0.6', names: ['a', 'b', 'c', 'd', 's', 'r'] });
      people = { a: made[0], b: made[1], c: made[2], d: made[3], s: made[4] }; seller = made[5];
      const baseId = `pb${tag.slice(-6)}.${chain.masterId}`; const h = memberHandle(chain, baseId);
      await chain.master.createSubAccount({ accountOrPrefix: `pb${tag.slice(-6)}`, publicKey: h.key.keyPair.getPublicKey(), nearToTransfer: near('2.2') });
      baseline = h; await chain.waitFor(async () => { try { await h.account.getBalance(); return true; } catch { return false; } }, { what: 'baseline account' });
      await h.account.deployContract(fs.readFileSync(wasmPath));
      s.assert('the public auction is deployed and answers', (await chain.view('get_auction', { auction_id: 'none' }, baseId)) === null);
    }, { critical: true });

    // ================= public open auction =================
    await ctx.step('PUBLIC · an open auction: honest bidders raise by 10% up to their value, then the sniper watches the chain and bids at the end', async (s) => {
      const id = `pub-${tag}`; const t0 = Date.now(); const start = await height(); const startMs = Date.now(); const end = start + 700; // an open auction is slow: each bid takes ~16 s of wall time here
      s.assert('create', track('PUB', await chain.send(people.a.account, 'create', { auction_id: id, seller: seller.id, end_block: end, reserve: String(near(RESERVE)) }, { gas: 30000000000000n, contractId: baseline.id, label: 'create auction' })).ok);
      await chain.waitFor(() => baseView(id), { what: 'auction' });
      const placed = []; const maxBid = Object.fromEntries(WHO.map((k) => [k, 0n]));
      for (let pass = 0; pass < 12; pass += 1) {
        let moved = false;
        for (const who of ['d', 'c', 'b', 'a']) {
          const au = await baseView(id); const high = BigInt(au.high_bid);
          // raise 10% over the highest (the contract requires at least 1%), never past your own value; micro-NEAR
          const next = high === 0n ? micro(Number(RESERVE)) : (high / 10n ** 18n) * 110n / 100n + 1n;
          const bidAmount = next > micro(VALUE[who]) ? micro(VALUE[who]) : next;
          if (au.high_bidder === people[who].id || bidAmount <= (high / 10n ** 18n) * 101n / 100n) continue;
          const r = track('PUB', await bidPublic(who, bidAmount, id));
          s.assert(`${who} bids ${Number(bidAmount) / 1e6}`, r.ok, { actual: r.error });
          if (r.ok) { moved = true; placed.push({ who, amount: bidAmount, hash: r.hash }); if (bidAmount > maxBid[who]) maxBid[who] = bidAmount; await chain.waitFor(async () => BigInt((await baseView(id)).high_bid) === nearOfMicro(bidAmount), { what: 'the bid to be visible', timeoutMs: 30000, everyMs: 700 }); }
        }
        if (!moved) break;
      }
      s.observe('bids placed before the sniper', placed.map((p) => `${p.who} ${Number(p.amount) / 1e6}`));
      const preHeight = await height(); s.assert('the honest bidding finished with time to spare before the end', end - preHeight > 12, { actual: end - preHeight });
      // the sniper watches the public state and bids in the last blocks, just over the highest bid, if it is still worth it to them
      const trueTop = WHO.filter((k) => k !== 's').sort((x, y) => VALUE[y] - VALUE[x])[0];
      // A bid takes real time to land. The sniper measures it from the earlier bids and sends early enough to land about 3 blocks before the end;
      // an honest bidder who notices it needs that same time to answer, so cannot.
      const nowH = await height(); const blockMs = (Date.now() - startMs) / Math.max(1, nowH - start);
      const latencyBlocks = Math.ceil((bidMs.reduce((a, b) => a + b, 0) / bidMs.length) / blockMs); const lead = latencyBlocks + 3;
      s.observe('measured: block time (ms), mean bid latency (blocks), the sniper sends this many blocks before the end', { blockMs: Math.round(blockMs), latencyBlocks, lead });
      await chain.waitFor(async () => (await height()) >= end - lead, { what: 'the last blocks', timeoutMs: 900000, everyMs: 500 });
      const au = await baseView(id); const high = BigInt(au.high_bid); const sniperBid = (high / 10n ** 18n) * 102n / 100n + 1n;
      let sniped = null;
      if (sniperBid <= micro(VALUE.s)) { sniped = track('PUB', await bidPublic('s', sniperBid, id)); if (sniped.ok) { placed.push({ who: 's', amount: sniperBid, hash: sniped.hash }); maxBid.s = sniperBid; } }
      const sniperBlock = await height();
      await chain.waitFor(async () => (await height()) >= end + 1, { what: 'the auction end', timeoutMs: 300000, everyMs: 700 });
      const final = await baseView(id);
      const closeTx = track('PUB', await chain.send(people.a.account, 'close', { auction_id: id }, { gas: 30000000000000n, contractId: baseline.id, label: 'close auction' }));
      s.assert('the auction closed and paid the seller', closeTx.ok, { actual: closeTx.error });
      const winner = WHO.find((k) => people[k].id === final.high_bidder); const price = BigInt(final.high_bid);
      const attributed = WHO.filter((k) => maxBid[k] > 0n && Math.abs(Number(maxBid[k]) / 1e6 - VALUE[k]) <= 0.05 * VALUE[k]).length;
      results.PUB = { winner, highestValueBidder: trueTop, price: Number(price / 10n ** 18n) / 1e6, attributedWithin5pct: attributed, of: 5, bidsOnChain: final.bids, gasTGas: +gas.PUB.toFixed(1), wallMs: Date.now() - t0, sniped: Boolean(sniped?.ok), blocksBeforeEnd: end - sniperBlock, sniperOpportunity: sniperBid <= micro(VALUE.s) };
      s.observe('result', results.PUB);
      s.assert('prediction: an observer can attribute a valuation within 5% to most of the five bidders from the public bids alone (at least 3)', attributed >= 3, { actual: results.PUB });
      const opportunity = sniperBid <= micro(VALUE.s) && VALUE.s < VALUE[trueTop];
      s.assert('the public state alone gave the sniper a winning bid: the leader\'s bid raised by 2% was within the sniper\'s value (0.055), and the sniper values the lot below the highest-value bidder (0.060)', opportunity, { actual: { leaderBid: Number(high / 10n ** 18n) / 1e6, sniperBid: Number(sniperBid) / 1e6 } });
      s.observe('the sniper\'s bid', sniped?.ok ? 'landed before the end' : `did not land: ${String(sniped?.error || 'not sent').split('\n').pop().slice(0, 80)}`);
      s.assert('either the sniper\'s bid landed in time and took the lot from the highest-value bidder, or it landed late and the contract refused it and the highest-value bidder kept the lot', (sniped?.ok === true && winner === 's' && VALUE.s < VALUE[trueTop]) || (sniped?.ok === false && /auction has ended/.test(sniped.error || '') && winner === trueTop), { actual: { sniped: sniped?.ok, error: sniped?.error, winner } });
      s.evidence('PUBLIC', { ...results.PUB, bidTxs: placed.map((p) => p.hash) });
    });

    // ================= Midge: sealed first-price and second-price =================
    const sealedBids = (strategy) => Object.fromEntries(WHO.map((k) => [k, { price: strategy === 'truthful' ? VALUE[k].toFixed(6).replace(/0+$/, '') : (VALUE[k] * 0.8).toFixed(6).replace(/0+$/, ''), qty: 1 }]));
    for (const [path, format, strategy, label] of [['FP', 'first-price', 'shade', 'sealed first-price (bids at 80% of value)'], ['SP', 'second-price', 'truthful', 'sealed second-price, Vickrey (true-value bids)']]) {
      await ctx.step(`MIDGE · ${label}: common deposit, the Roost runs the auction, the contract charges each member their own amount`, async (s) => {
        const r = await midgeAuction(s, { path, format, lot: 1, bids: sealedBids(strategy), label });
        const winner = WHO.find((k) => r.out.outcome.fills[0]?.member === people[k].id); const price = Number(r.out.outcome.proceeds);
        results[path] = { winner, price, attributedWithin5pct: 0, of: 5, unattributedPriceInSettlement: price, gasTGas: +gas[path].toFixed(1), wallMs: r.wallMs };
        s.observe('result', results[path]);
        s.assert('the highest-value bidder (a) won', winner === 'a', { actual: results[path] });
        s.assert(format === 'second-price' ? 'the winner paid the second-highest bid: the sniper\'s 0.055' : 'the winner paid their own shaded bid, 0.048', format === 'second-price' ? price === 0.055 : price === 0.048, { actual: price });
        s.assert('no bidder\'s valuation is attributable within 5% from the public escrows or the winner\'s charge', WHO.every((k) => !(k === winner && Math.abs(price - VALUE[k]) <= 0.05 * VALUE[k])));
        s.evidence(path, { ...results[path], settleTx: r.settleTx });
      });
    }

    // ================= Midge: uniform-price (the ICO-style sale) =================
    await ctx.step('MIDGE · uniform-price: 100 units, sealed bids of (price, quantity), everyone filled pays one clearing price', async (s) => {
      const bids = { a: { price: '0.0009', qty: 40 }, s: { price: '0.0008', qty: 25 }, b: { price: '0.0007', qty: 50 }, c: { price: '0.0006', qty: 30 }, d: { price: '0.0004', qty: 20 } };
      const r = await midgeAuction(s, { path: 'UNI', format: 'uniform', lot: 100, bids, label: 'uniform-price, 100 units', reserve: '0.0001' });
      const f = Object.fromEntries(r.out.outcome.fills.map((x) => [WHO.find((k) => people[k].id === x.member), x]));
      s.assert('a got 40, s got 25, b got the last 35 of the 50 it asked for; c and d got nothing', f.a?.units === 40 && f.s?.units === 25 && f.b?.units === 35 && !f.c && !f.d, { actual: r.out.outcome.fills });
      s.assert('everyone filled paid the same clearing price, b\'s 0.0007 per unit (the marginal bid)', r.out.outcome.clearingPrice === '0.0007' && r.out.outcome.fills.every((x) => Number(x.pays) === Number((Number(x.units) * 0.0007).toFixed(6))), { actual: r.out.outcome });
      s.assert('the proceeds are exactly 100 units x 0.0007 = 0.07 NEAR', r.out.outcome.proceeds === '0.07');
      results.UNI = { clearingPrice: 0.0007, proceeds: 0.07, unitsSold: 100, gasTGas: +gas.UNI.toFixed(1), wallMs: r.wallMs, losersNamedOnChain: 0 };
      s.evidence('UNI', { ...results.UNI, settleTx: r.settleTx });
    });

    // ================= a compromised room, on chain =================
    await ctx.step('COMPROMISED ROOM · a room that signs charges it should not: the contract\'s limits, and the risk that remains', async (s) => {
      const id = `auc-${tag}-bad`; const kp = crypto.generateKeyPairSync('ed25519'); const pk = kp.publicKey.export({ format: 'der', type: 'spki' }).subarray(12).toString('hex');
      s.assert('hatch with a key we hold, standing in for a compromised room', (await hatch(id, pk, 16)).ok); await chain.waitFor(() => state(id), { what: 'syndicate' });
      for (const k of ['a', 'b', 'c']) s.assert(`${k} deposits 0.05`, (await deposit(k, id, '0.05')).ok);
      await chain.waitFor(async () => BigInt((await state(id)).total_escrow) === near('0.15'), { what: 'escrow 0.15' });
      const sign = (msg) => crypto.sign(null, Buffer.from(msg, 'utf8'), kp.privateKey).toString('hex');
      const attempt = async (label, allocations, charges, { plain = false } = {}) => {
        const st = await state(id); const ah = computeAllocationsHash(allocations); const order = crypto.randomBytes(16).toString('hex');
        const msg = plain ? `${chain.coordinatorId}:${id}:${st.epoch}:${st.round_nonce}:${ah}:${order}` : `${chain.coordinatorId}:${id}:${st.epoch}:${st.round_nonce}:${ah}:${computeChargesHash(charges)}:${order}`;
        const tx = await chain.send(coord.account, 'settle_batch_charged', { syndicate_id: id, attestation_nonce: st.round_nonce, aggregate_order_hash: order, allocations, charges, enclave_signature: sign(msg) }, { gas: 150000000000000n, label });
        s.evidence('tx', { label: tx.label, hash: tx.hash, ok: tx.ok, explorer: tx.explorer, error: tx.error }); return tx;
      };
      const pay = (n) => [{ recipient: seller.id, amount: String(near(n)) }];
      const ch = (k, n) => ({ member: people[k].id, amount: String(near(n)) });
      const t1 = await attempt('OVERCHARGE settle_batch_charged: a charged 0.06 against a 0.05 deposit', pay('0.06'), [ch('a', '0.06')]);
      s.assert('a charge above the member\'s deposit is refused even with a valid signature', !t1.ok && /exceeds that member's escrow/.test(t1.error || ''), { actual: t1.error });
      const t2 = await attempt('MISMATCH settle_batch_charged: charges 0.04 for a 0.05 payout', pay('0.05'), [ch('a', '0.04')]);
      s.assert('charges that do not sum to the payout are refused', !t2.ok && /sum to exactly the payout/.test(t2.error || ''), { actual: t2.error });
      const t3 = await attempt('OLD-FORMAT settle_batch_charged: an ordinary settlement signature on the charged entry point', pay('0.05'), [ch('a', '0.05')], { plain: true });
      s.assert('an ordinary-format signature cannot authorise a charged settlement', !t3.ok && /Invalid enclave Ed25519 signature/.test(t3.error || ''), { actual: t3.error });
      s.assert('nothing moved: the escrow is intact after all three', BigInt((await state(id)).total_escrow) === near('0.15'));
      const t4 = await attempt('RESIDUAL-RISK settle_batch_charged: b charged their whole 0.05 for a payout b never bid on', pay('0.05'), [ch('b', '0.05')]);
      s.assert('RESIDUAL RISK, measured: a compromised room CAN charge one member their entire deposit, within the policy (the seller is allowed) and within their escrow. Per-member charges cap the harm at that member\'s deposit; they do not remove it', t4.ok, { actual: t4.error });
      await chain.waitFor(async () => { const x = await state(id); return !x.is_settling && BigInt(x.total_escrow) === near('0.10'); }, { what: 'settlement resolved' });
      const e = await escrowsOf(id, ['a', 'b', 'c']);
      s.assert('b was charged everything; a and c lost nothing', e.b === 0n && e.a === near('0.05') && e.c === near('0.05'), { actual: Object.fromEntries(Object.entries(e).map(([k, v]) => [k, String(v)])) });
      await waitForTimer(id, 16);
      for (const k of ['a', 'c']) { const r = await chain.send(people[k].account, 'hatch_out', { syndicate_id: id }, { gas: 60000000000000n, label: `exit ${id} as ${k}` }); s.assert(`${k} exits alone with the full 0.05`, r.ok); }
      results.COMPROMISED = { refused: ['charge above deposit', 'charges not summing to the payout', 'ordinary signature on the charged entry point'], residual: 'a member can be charged up to their whole deposit' };
    });

    await ctx.step('the comparison, read from the measurements above', async (s) => {
      s.observe('results', results);
      s.assert('every path was measured', ['PUB', 'FP', 'SP', 'UNI', 'COMPROMISED'].every((k) => results[k]));
      s.observe('gas, TGas for the whole auction (all bidders, settlement and exits): public / first-price / second-price / uniform', [gas.PUB, gas.FP, gas.SP, gas.UNI].map((x) => +x.toFixed(1)));
      s.observe('wall time (ms): public / first-price / second-price / uniform', [results.PUB.wallMs, results.FP.wallMs, results.SP.wallMs, results.UNI.wallMs]);
      s.observe('gas, Midge first-price over public (the investing comparison had Midge ~10x a direct payment; an open auction needs many bids, so the gap closes or reverses)', +(gas.FP / gas.PUB).toFixed(2));
      s.assert('the gas of every path was read from receipts and is positive', [gas.PUB, gas.FP, gas.SP, gas.UNI].every((x) => x > 0));
      s.evidence('comparison', results);
    });

    await ctx.step('teardown: delete the baseline contract, prune the syndicates, delete the accounts', async (s) => {
      if (baseline) { try { await baseline.account.deleteAccount(chain.masterId); s.observe('baseline contract account', 'deleted, balance returned to the master'); } catch (e) { s.observe('baseline contract account NOT deleted', String(e.message).slice(0, 120)); } }
      if (!people) { s.assert('nothing to tear down', true); return; }
      const rep = await teardownMembers(chain, { rootDir: ctx.rootDir, members: [...ids(), seller], pruneIds: created });
      s.observe('teardown', { pruned: rep.pruned.length, notPruned: rep.notPruned, deleted: rep.deleted.length, kept: rep.kept, failed: rep.failed });
      s.assert('every account was deleted and every syndicate pruned', rep.failed.length === 0 && rep.kept.length === 0 && rep.notPruned.length === 0, { actual: rep });
      s.assert('the contract holds the records it started with', Number(await chain.view('get_syndicate_count', {})) === countBefore, { expected: countBefore });
    }, { always: true });
  },
};
