import crypto from 'node:crypto';
import { Account, KeyPairSigner } from 'near-api-js';
import { connect, near, fmt, computePolicyHash } from '../lib/near.js';
import { createMembers, teardownMembers, memberHandle } from '../lib/members.js';
import { HostedRoost } from '../../src/roost-service/hosted-roost.js';
import { sealToModel } from '../../src/enclave/e2ee.js';

const provider = { simulated: true, attest: async () => Buffer.from('lab-local-no-hardware'), info: async () => ({}) };
const BIDS = { a: '0.01', b: '0.02', c: '0.03', d: '0.04' };   // what each backer privately wants to put in
const COMMON = '0.05';                                           // the common deposit in the Midge variant
const TOTAL = '0.10';

export default {
  id: 'E-CMP-INVEST-01',
  title: 'Investing together on testnet: a public round, a trusted organizer and Midge, same chain and same members',
  tier: 'testnet',
  requires: ['near-key', 'network'],
  hypothesis: 'Four backers invest private amounts (0.01, 0.02, 0.03, 0.04 NEAR) into one recipient. Public: an observer reading only public chain data recovers every amount. Organizer: the same, and the organizer can take the pot while members cannot get it back. Midge with deposits equal to bids: the observer also recovers every amount, because deposits are public. Midge with a common deposit: the observer recovers none, no one can take the pot or pay outside the policy, and each member recovers their own remainder alone. Fails if an observer recovers any individual bid from the common-deposit round, if any theft attempt under Midge succeeds, or if a member cannot recover their remainder. Also measured: gas, wall time, and who funds a payout (the contract deducts it pro-rata by deposit).',
  limits: [
    'One operator controls every account in every path (four backers, an organizer, a recipient, the coordinator). This shows behaviour, not independent users.',
    'The Roost here is a local HostedRoost with a simulated attestation provider; the hardware room is E-HOSTED-LIVE-01 and E-COMBINED-LIVE-01. Speed under Midge therefore excludes the machine start-up and attestation (about a minute on Phala).',
    'The "public" path is plain transfers to the recipient: there is no shared pool contract. It is the simplest honest baseline, not the strongest public design (a commit-reveal contract would leak less).',
    'The observer reads only public chain data (the receipts of the transactions an explorer would list for the target account, and the contract\'s public views). It does not model an attacker who also controls the Roost or sees network traffic.',
    'Amounts are tiny testnet NEAR. The gas figures are gas burnt, read from receipts, not a price.',
    'Not run here: other privacy systems (compared from their documentation), a multisig baseline, shared AI compute.',
  ],
  async run(ctx) {
    const chain = await connect(ctx.rootDir);
    const coord = chain.sub('c');
    const tag = Date.now().toString(36);
    const created = []; const results = {};
    let who; let recipient; let organizer; let countBefore;
    const flyers = () => Object.values(who);
    const hexId = (n) => `cmp-${tag}-${n}`;

    // ---- helpers
    const gasOf = (r) => [r?.transaction_outcome, ...(r?.receipts_outcome || [])].reduce((a, o) => a + BigInt(o?.outcome?.gas_burnt || 0), 0n);
    const pay = async (from, toId, amount) => { const t = Date.now(); const r = await from.account.transfer({ receiverId: toId, amount: near(amount) }); return { hash: r?.transaction?.hash || r?.transaction_outcome?.id, signer: from.id, gasT: Number(gasOf(r) / 1000000000n) / 1000, ms: Date.now() - t }; };
    /** What an observer learns from a public transfer: who sent how much to the target account. */
    const observeTransfers = async (txs, targetId) => { const seen = {}; for (const t of txs) for (const m of await chain.transfersOf(t.hash, t.signer)) if (m.to === targetId && m.predecessor === t.signer) seen[t.signer] = (seen[t.signer] || 0n) + BigInt(m.amount); return seen; };
    const recovered = (seen) => Object.entries(BIDS).filter(([k, v]) => seen[who[k].id] === near(v)).length;
    const policyFor = (r) => ({ allowed_recipients: [r.id], max_release_bps_per_epoch: 10000, settle_deadline_block: 500000000 });
    const state = (id) => chain.view('get_syndicate', { syndicate_id: id });
    const timers = {}; // exit timer per group: it is part of what depositors consent to (GAP-025)
    const hatch = (id, roost, p, timeout) => { timers[id] = timeout; created.push(id); return chain.send(coord.account, 'hatch', { syndicate_id: id, syndicate_type: 'FLASH', quorum_threshold: 1, max_spend_near: 1, enclave_public_key: roost.settlePublicKey, expected_code_hash: crypto.randomBytes(32).toString('hex'), timeout_blocks: timeout, payout_recipient: recipient.id, release_policy: p }, { deposit: near('0.01'), gas: 40000000000000n, label: `hatch ${id}` }); };
    const deposit = (f, id, p, amt) => chain.send(f.account, 'deposit', { syndicate_id: id, policy_hash: computePolicyHash(p, timers[id]) }, { deposit: near(amt), gas: 30000000000000n, label: `deposit ${f.id} -> ${id}` });
    const escrowsSeenByObserver = async (id) => { const seen = {}; for (const f of flyers()) seen[f.id] = BigInt(await chain.view('get_escrow', { syndicate_id: id, account_id: f.id })); return seen; };

    await ctx.step('set up: four backers, a recipient and an organizer, fresh accounts', async (s) => {
      countBefore = Number(await chain.view('get_syndicate_count', {}));
      const made = await createMembers(chain, { rootDir: ctx.rootDir, tag: `i${tag.slice(-5)}`, count: 6, fundNear: '0.3', names: ['a', 'b', 'c', 'd', 'r', 'o'] });
      who = { a: made[0], b: made[1], c: made[2], d: made[3] }; recipient = made[4]; organizer = made[5];
      s.assert('six accounts exist', made.length === 6);
    }, { critical: true });

    // ================= P: public =================
    await ctx.step('P · public: each backer pays the recipient directly; an observer reads the public receipts', async (s) => {
      const t0 = Date.now(); const txs = [];
      for (const [k, v] of Object.entries(BIDS)) txs.push(await pay(who[k], recipient.id, v));
      const ms = Date.now() - t0;
      const seen = await observeTransfers(txs, recipient.id);
      const gas = txs.reduce((a, t) => a + t.gasT, 0);
      results.P = { recovered: recovered(seen), of: 4, gasTGas: +gas.toFixed(1), perMemberTGas: +(gas / 4).toFixed(1), wallMs: ms };
      s.observe('what the observer read', Object.fromEntries(Object.entries(seen).map(([k, v]) => [k, fmt(v)])));
      s.assert('prediction 1: the observer recovers all four amounts from the public transfers', results.P.recovered === 4, { actual: results.P });
      s.evidence('P', { txs: txs.map((t) => t.hash), ...results.P });
    });

    // ================= O: organizer =================
    await ctx.step('O · organizer: backers pay one account, the organizer forwards the total; the observer reads the public receipts', async (s) => {
      const t0 = Date.now(); const txs = [];
      for (const [k, v] of Object.entries(BIDS)) txs.push(await pay(who[k], organizer.id, v));
      const fwd = await pay(organizer, recipient.id, TOTAL);
      const ms = Date.now() - t0;
      const seen = await observeTransfers(txs, organizer.id);
      const gas = txs.reduce((a, t) => a + t.gasT, 0) + fwd.gasT;
      results.O = { recovered: recovered(seen), of: 4, gasTGas: +gas.toFixed(1), perMemberTGas: +(gas / 4).toFixed(1), wallMs: ms };
      s.assert('prediction 2: the observer recovers all four amounts sent to the organizer', results.O.recovered === 4, { actual: results.O });
      const forwarded = (await chain.transfersOf(fwd.hash, organizer.id)).filter((m) => m.to === recipient.id);
      s.assert('the organizer forwarded exactly 0.10 to the recipient', forwarded.length === 1 && BigInt(forwarded[0].amount) === near(TOTAL), { actual: forwarded });
      s.evidence('O', { txs: txs.map((t) => t.hash), forward: fwd.hash, ...results.O });
    });

    await ctx.step('O · theft and vanish: members cannot get the pot back, the organizer can take it', async (s) => {
      const txs = []; for (const k of ['a', 'b', 'c', 'd']) txs.push(await pay(who[k], organizer.id, '0.01'));
      const held = await chain.balance(organizer.account);
      let backerCanWithdraw = true; let why = null;
      try { await new Account(organizer.id, chain.provider, new KeyPairSigner(who.a.key.keyPair)).transfer({ receiverId: who.a.id, amount: near('0.01') }); } catch (e) { backerCanWithdraw = false; why = String(e.message).slice(0, 120); }
      s.assert('prediction 6 (organizer): a backer cannot pull money out of the organizer\'s account', backerCanWithdraw === false, { actual: why });
      const heldAfter = await chain.balance(organizer.account);
      s.assert('the organizer\'s balance is unchanged by the failed attempt', heldAfter >= held - near('0.001'), { before: String(held), after: String(heldAfter) });
      const thiefAcc = chain.masterId; // any account the organizer controls and chooses; it exists, so the transfer can succeed
      const stolen = await organizer.account.transfer({ receiverId: thiefAcc, amount: near('0.04') }).then(() => true).catch((e) => String(e.message).slice(0, 100));
      s.assert('prediction 5 (organizer): the organizer can send the 0.04 pot to an account of its own choosing; nothing stops it', stolen === true, { actual: stolen });
      results.O.theft = 'organizer took 100% of the second pot'; results.O.vanish = 'members recovered 0%';
    });

    // ================= M: Midge, deposits equal to bids =================
    const sealed = (roost, members, amountOf) => { for (const m of members) roost.submitSealedIntent({ flyerId: m.id, cipherTextHex: sealToModel(JSON.stringify({ amount: amountOf(m) }), roost.intentPublicKey) }); };
    await ctx.step('M-naive · Midge, each backer deposits exactly their bid: the observer reads the public escrows', async (s) => {
      const id = hexId('n'); const roost = new HostedRoost({ provider }); const p = policyFor(recipient); const t0 = Date.now();
      s.assert('hatch', (await hatch(id, roost, p, 50)).ok); await chain.waitFor(() => state(id), { what: 'syndicate' });
      const txs = []; for (const [k, v] of Object.entries(BIDS)) { const r = await deposit(who[k], id, p, v); s.assert(`${k} deposits ${v}`, r.ok); txs.push(r); }
      await chain.waitFor(async () => BigInt((await state(id)).total_escrow) === near(TOTAL), { what: 'escrow 0.10' });
      const seen = await escrowsSeenByObserver(id);
      const rec = Object.entries(BIDS).filter(([k, v]) => seen[who[k].id] === near(v)).length;
      sealed(roost, flyers(), (m) => BIDS[Object.keys(who).find((k) => who[k].id === m.id)]);
      const agg = roost.aggregateAndClear({ roundId: `${tag}-n` });
      const st = await state(id);
      const signed = roost.signSettlement({ contractId: chain.coordinatorId, syndicateId: id, epoch: Number(st.epoch), roundNonce: st.round_nonce, allocations: [{ recipient: recipient.id, amount: String(near(TOTAL)) }], orderHash: agg.orderHash });
      const tx = await chain.send(coord.account, 'settle_batch', { syndicate_id: id, attestation_nonce: st.round_nonce, aggregate_order_hash: agg.orderHash, allocations: [{ recipient: recipient.id, amount: String(near(TOTAL)) }], enclave_signature: signed.signature }, { gas: 100000000000000n, label: `settle ${id}` });
      s.assert('settle_batch succeeded', tx.ok, { actual: tx.error });
      await chain.waitFor(async () => /settled/i.test(String((await state(id)).status)), { what: 'Settled' });
      const paid = (await chain.transfersOf(tx.hash, chain.coordinatorId)).filter((m) => m.fromContract && m.to === recipient.id);
      s.assert('the recipient received exactly 0.10', paid.length === 1 && BigInt(paid[0].amount) === near(TOTAL), { actual: paid });
      const gas = txs.reduce((a, t) => a + t.gasTGas, 0) + tx.gasTGas;
      results.Mnaive = { recovered: rec, of: 4, gasTGas: +gas.toFixed(1), perMemberTGas: +(gas / 4).toFixed(1), wallMs: Date.now() - t0 };
      s.assert('prediction 3: with deposits equal to bids, the observer recovers all four bids from the public escrows, sealing adds nothing', rec === 4, { actual: results.Mnaive });
      s.evidence('M-naive', { syndicate: id, settle: tx.hash, ...results.Mnaive });
    });

    // ================= M: Midge, common deposit =================
    await ctx.step('M-common · Midge, everyone deposits 0.05 and bids inside it: what the observer reads, then theft attempts, then settlement', async (s) => {
      const id = hexId('c'); const roost = new HostedRoost({ provider }); const p = policyFor(recipient); const t0 = Date.now();
      s.assert('hatch', (await hatch(id, roost, p, 14)).ok); await chain.waitFor(() => state(id), { what: 'syndicate' });
      const txs = []; for (const k of Object.keys(BIDS)) { const r = await deposit(who[k], id, p, COMMON); s.assert(`${k} deposits ${COMMON}`, r.ok); txs.push(r); }
      await chain.waitFor(async () => BigInt((await state(id)).total_escrow) === near('0.20'), { what: 'escrow 0.20' });
      const seen = await escrowsSeenByObserver(id);
      const values = Object.values(seen);
      const guesses = [near(COMMON), near('0.20') / 4n, near(TOTAL) / 4n];
      const best = Math.max(...guesses.map((g) => Object.entries(BIDS).filter(([k, v]) => g === near(v)).length));
      s.observe('what the observer reads: every escrow', Object.fromEntries(Object.entries(seen).map(([k, v]) => [k, fmt(v)])));
      s.assert('every escrow is the same, so the escrows say nothing about who bid what', new Set(values.map(String)).size === 1);
      s.assert('prediction 4: the observer\'s best guess (the common deposit, or the total divided by four) matches none of the four bids', best === 0, { actual: best });
      sealed(roost, flyers(), (m) => BIDS[Object.keys(who).find((k) => who[k].id === m.id)]);
      const agg = roost.aggregateAndClear({ roundId: `${tag}-c` });
      s.assert('the Roost totals the sealed bids to exactly 0.10 although 0.20 is deposited', BigInt(Math.round(Number(agg.aggregateOrder.totalInputAmount) * 1e6)) * 10n ** 18n === near(TOTAL) && agg.aggregateOrder.flyerCount === 4, { actual: agg.aggregateOrder });
      const st = await state(id);
      const over = (() => { try { return roost.signSettlement({ contractId: chain.coordinatorId, syndicateId: id, epoch: Number(st.epoch), roundNonce: st.round_nonce, allocations: [{ recipient: recipient.id, amount: String(near('0.20')) }], orderHash: agg.orderHash }); } catch (e) { return { error: e.message }; } })();
      s.assert('prediction 5 (Roost): asked to pay the whole 0.20 deposit against a 0.10 sealed total, the Roost refuses to sign', /exceed/i.test(over.error || ''), { actual: over });
      const thief = chain.sub(`mt${tag.slice(-4)}`).id;
      const stolen = roost.signSettlement({ contractId: chain.coordinatorId, syndicateId: id, epoch: Number(st.epoch), roundNonce: st.round_nonce, allocations: [{ recipient: thief, amount: String(near(TOTAL)) }], orderHash: agg.orderHash });
      const steal = await chain.send(coord.account, 'settle_batch', { syndicate_id: id, attestation_nonce: st.round_nonce, aggregate_order_hash: agg.orderHash, allocations: [{ recipient: thief, amount: String(near(TOTAL)) }], enclave_signature: stolen.signature }, { gas: 100000000000000n, label: `OUTSIDE-POLICY settle ${id}` });
      s.evidence('tx', { label: steal.label, hash: steal.hash, ok: steal.ok, explorer: steal.explorer, error: steal.error });
      s.assert('prediction 5 (contract): a validly signed payout to an account outside the policy is refused', !steal.ok && /whitelist/i.test(steal.error || ''), { actual: steal.error });
      s.assert('the escrow is intact after the attempt', BigInt((await state(id)).total_escrow) === near('0.20'));
      // the Roost signed once for the thief above; a new sealed round is needed for the honest settlement
      roost.abandonSignedRound(); // the contract refused the thief's settlement; the room keeps its signature on record and lets the round run again (the room refuses a second signature otherwise)
      sealed(roost, flyers(), (m) => BIDS[Object.keys(who).find((k) => who[k].id === m.id)]);
      const agg2 = roost.aggregateAndClear({ roundId: `${tag}-c2` });
      const st2 = await state(id);
      const alloc = [{ recipient: recipient.id, amount: String(near(TOTAL)) }];
      const ok = roost.signSettlement({ contractId: chain.coordinatorId, syndicateId: id, epoch: Number(st2.epoch), roundNonce: st2.round_nonce, allocations: alloc, orderHash: agg2.orderHash });
      const tx = await chain.send(coord.account, 'settle_batch', { syndicate_id: id, attestation_nonce: st2.round_nonce, aggregate_order_hash: agg2.orderHash, allocations: alloc, enclave_signature: ok.signature }, { gas: 100000000000000n, label: `settle ${id}` });
      s.assert('settle_batch of the honest 0.10 succeeded', tx.ok, { actual: tx.error });
      await chain.waitFor(async () => { const x = await state(id); return !x.is_settling && BigInt(x.total_escrow) === near('0.10'); }, { what: 'settlement resolved with 0.10 left' });
      const paid = (await chain.transfersOf(tx.hash, chain.coordinatorId)).filter((m) => m.fromContract && m.to === recipient.id);
      s.assert('the recipient received exactly 0.10', paid.length === 1 && BigInt(paid[0].amount) === near(TOTAL), { actual: paid });
      const gas = txs.reduce((a, t) => a + t.gasTGas, 0) + tx.gasTGas;
      results.Mcommon = { recovered: 0, of: 4, gasTGas: +gas.toFixed(1), perMemberTGas: +(gas / 4).toFixed(1), wallMs: Date.now() - t0, settleTx: tx.hash, syndicate: id };
      s.evidence('M-common', results.Mcommon);
    });

    await ctx.step('M-common · the room is gone: each member exits alone with their remainder; who funded the payout', async (s) => {
      const id = hexId('c');
      // From here nothing talks to the Roost or the coordinator. Wait for the exit timer, then each member leaves alone.
      const after = {}; const exits = [];
      await chain.waitFor(async () => { const x = await state(id); return Number(await chain.provider.viewBlock({ finality: 'final' }).then((b) => b.header.height)) - Number(x.epoch_start_block) >= 14; }, { what: 'the exit timer', timeoutMs: 90000 });
      for (const k of Object.keys(BIDS)) {
        const r = await chain.send(who[k].account, 'hatch_out', { syndicate_id: id }, { gas: 60000000000000n, label: `exit ${id} as ${k}` });
        s.assert(`${k} exits alone`, r.ok, { actual: r.error });
        const back = (await chain.transfersOf(r.hash, who[k].id)).filter((m) => m.fromContract && m.to === who[k].id);
        after[k] = back.length ? BigInt(back[0].amount) : 0n; exits.push(r);
        s.evidence('tx', { label: r.label, hash: r.hash, ok: r.ok, explorer: r.explorer });
      }
      const refunds = Object.fromEntries(Object.entries(after).map(([k, v]) => [k, fmt(v, 4)]));
      s.observe('what each member got back at exit (deposit 0.05 each)', refunds);
      s.assert('prediction 6 (Midge): every member recovered a remainder alone, 0.10 in all', Object.values(after).reduce((a, b) => a + b, 0n) === near('0.10'), { actual: refunds });
      const paidShare = Object.fromEntries(Object.entries(after).map(([k, v]) => [k, near(COMMON) - v]));
      s.observe('what each member effectively paid toward the 0.10 payout', Object.fromEntries(Object.entries(paidShare).map(([k, v]) => [k, `${fmt(v, 4)} (their bid was ${BIDS[k]})`])));
      s.assert('prediction 9: the payout was funded equally (0.025 each) whatever each member bid, so a member who bid 0.01 paid 0.025 and one who bid 0.04 paid 0.025', Object.values(paidShare).every((v) => v === near('0.025')), { actual: paidShare });
      s.assert('the syndicate ended fully refunded with nothing left', /aborted|refunded/i.test(String((await state(id)).status)) && BigInt((await state(id)).total_escrow) === 0n);
      results.Mcommon.fundedBy = 'equal shares of the common deposit (0.025 each), not by bid'; results.Mcommon.vanish = 'every member recovered their remainder alone';
    });

    await ctx.step('the comparison, read from the measurements above', async (s) => {
      s.observe('results', results);
      s.assert('every path was measured', ['P', 'O', 'Mnaive', 'Mcommon'].every((k) => results[k]));
      s.assert('prediction 7: Midge costs more gas per member than the public round (a real overhead, read from receipts)', results.Mcommon.perMemberTGas > results.P.perMemberTGas, { actual: { P: results.P.perMemberTGas, M: results.Mcommon.perMemberTGas } });
      s.observe('gas ratio, common-deposit Midge to public', +(results.Mcommon.perMemberTGas / results.P.perMemberTGas).toFixed(1));
      s.observe('wall time (ms), P / O / M-naive / M-common', [results.P.wallMs, results.O.wallMs, results.Mnaive.wallMs, results.Mcommon.wallMs]);
      s.evidence('comparison', results);
    });

    await ctx.step('teardown: prune the syndicates, compact, delete the accounts', async (s) => {
      if (!who) { s.assert('nothing to tear down', true); return; }
      const rep = await teardownMembers(chain, { rootDir: ctx.rootDir, members: [...flyers(), recipient, organizer], pruneIds: created });
      s.observe('teardown', { pruned: rep.pruned.length, notPruned: rep.notPruned, deleted: rep.deleted.length, kept: rep.kept, failed: rep.failed });
      s.assert('every account was deleted and every syndicate pruned', rep.failed.length === 0 && rep.kept.length === 0 && rep.notPruned.length === 0, { actual: rep });
      s.assert('the contract holds the records it started with', Number(await chain.view('get_syndicate_count', {})) === countBefore, { expected: countBefore });
    }, { always: true });
  },
};
