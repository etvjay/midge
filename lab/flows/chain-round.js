import crypto from 'node:crypto';
import { HostedRoost } from '../../src/roost-service/hosted-roost.js';
import { sealToModel } from '../../src/enclave/e2ee.js';
import { near, fmt, sleep, computePolicyHash } from '../lib/near.js';

/**
 * A full syndicate round on NEAR testnet against a hosted Roost, as a sequence of recorded steps:
 * hatch, deposit, sealed bids, exact aggregation, bounded signing, on-chain settlement, then four attacks that
 * must fail, then the non-custodial exit when the Roost stalls. The Roost may be local (chain logic only) or on
 * a real TDX VM (hardware); the flow does not care, which is the point.
 *
 * Every "must fail" step asserts that the on-chain STATE did not change, not only that an error came back.
 */
/** The contract build this lab was written against. Changes with any contract change; see foundry/gaps.jsonl GAP-009. */
export const EXPECTED_CODE_HASH = 'Gh8NAA2e78ETMMAWvExPnYfuKtRe2wQT2FHJ2RRXcPR9';
const fakeProvider = { simulated: true, attest: async () => Buffer.from('rogue-no-hardware'), info: async () => ({}) };

export async function chainRoundFlow(ctx, { chain, roost, expectedCodeHash = null, runTag }) {
  const { member, coordinator, session } = roost; // member: no admin key; coordinator: has it
  const F = ['f1', 'f2', 'f3'].map((p) => chain.sub(p));
  const coord = chain.sub('c');
  const rcpt = chain.sub('r1');
  const intentKey = session.intentPublicKey;
  const synId = (n) => `lab-${runTag}-${n}`;
  const policy = (deadline = 500000000) => ({ allowed_recipients: [rcpt.id], max_release_bps_per_epoch: 10000, settle_deadline_block: deadline });
  const bid = (flyerId, amount) => member.submitSealedIntent({ flyerId, cipherTextHex: sealToModel(JSON.stringify({ amount }), intentKey) });
  const state = async (id) => chain.view('get_syndicate', { syndicate_id: id });
  const bal = (acc) => chain.balance(acc);

  async function hatch(id, { timeoutBlocks = 50, pol = policy(), payout = rcpt.id } = {}) {
    return chain.send(coord.account, 'hatch', {
      syndicate_id: id, syndicate_type: 'FLASH', quorum_threshold: 1, max_spend_near: 1,
      enclave_public_key: session.settlePublicKey,
      expected_code_hash: expectedCodeHash || crypto.randomBytes(32).toString('hex'),
      timeout_blocks: timeoutBlocks, payout_recipient: payout, release_policy: pol,
    }, { deposit: near('0.01'), gas: 40000000000000n, label: `hatch ${id}` });
  }
  async function deposit(flyer, id, amountNear, pol = policy()) {
    return chain.send(flyer.account, 'deposit', { syndicate_id: id, policy_hash: computePolicyHash(pol) }, { deposit: near(amountNear), gas: 30000000000000n, label: `deposit ${flyer.id} -> ${id}` });
  }
  async function sealedRound(flyers, amountEach) {
    for (const f of flyers) await bid(f.id, amountEach);
    return coordinator.aggregate({ roundId: `${runTag}` });
  }
  async function settle(id, allocations, aggregate, { signer } = {}) {
    const st = await state(id);
    const params = { contractId: chain.coordinatorId, syndicateId: id, epoch: Number(st.epoch), roundNonce: st.round_nonce, allocations, orderHash: aggregate.orderHash };
    const signed = signer ? signer(params) : await coordinator.signSettlement(params);
    const tx = await chain.send(coord.account, 'settle_batch', { syndicate_id: id, attestation_nonce: st.round_nonce, aggregate_order_hash: aggregate.orderHash, allocations, enclave_signature: signed.signature }, { gas: 100000000000000n, label: `settle_batch ${id}` });
    return { tx, signed, params };
  }
  /** Run a transaction, ALWAYS record it as evidence (with its error text), and assert it succeeded. */
  const must = async (s, claim, txPromise) => { const tx = await txPromise; txEvidence(s, tx); s.assert(claim, tx.ok, { actual: tx.error }); return tx; };
  const txEvidence = (s, tx) => s.evidence('tx', { label: tx.label, hash: tx.hash, ok: tx.ok, explorer: tx.explorer, gasTGas: tx.gasTGas, error: tx.error });

  const out = {};

  await ctx.step('preflight: accounts, balances and deployed contract', async (s) => {
    const have = {};
    for (const a of [chain.master, ...F.map((f) => f.account), rcpt.account]) { try { have[a.accountId] = await bal(a); } catch { have[a.accountId] = null; } }
    if (have[rcpt.id] === null) {
      const r = await chain.master.createSubAccount({ accountOrPrefix: 'r1', publicKey: rcpt.key.keyPair.getPublicKey(), nearToTransfer: near('0.05') });
      s.evidence('tx', { label: 'create recipient account r1', hash: r.transaction?.hash || r.transaction_outcome?.id, explorer: chain.explorer(r.transaction?.hash || r.transaction_outcome?.id) });
      have[rcpt.id] = await bal(rcpt.account);
    }
    s.observe('balances (NEAR)', Object.fromEntries(Object.entries(have).map(([k, v]) => [k, fmt(v)])));
    s.note('Measured: a full round costs about 0.002 NEAR net, because unused prepaid gas is refunded. The balance needed is the temporary peak: a deposit (up to 0.03) plus prepaid gas (up to 0.06 at current testnet gas prices).');
    s.assert('every member has enough testnet NEAR for the peak of this experiment (0.09 each)', F.every((f) => have[f.id] !== null && have[f.id] > near('0.09')), { actual: Object.fromEntries(F.map((f) => [f.id, have[f.id] && fmt(have[f.id])])) });
    s.assert('the master account can pay for hatching (0.1 NEAR)', have[chain.masterId] > near('0.1'));
    const hash = await chain.codeHash();
    s.observe('deployed code hash', hash);
    s.assert('the deployed contract is the audited build', hash === EXPECTED_CODE_HASH, { expected: EXPECTED_CODE_HASH, actual: hash });
    // The contract account pays for its own code and state (1e19 yocto per byte) out of the same balance that holds
    // escrow. When headroom ran out, hatch failed mid-run with "lacks balance for state"; check it up front instead.
    const acct = await chain.provider.query({ request_type: 'view_account', finality: 'final', account_id: chain.coordinatorId });
    const headroom = BigInt(acct.amount) - BigInt(acct.storage_usage) * 10n ** 19n;
    s.observe('contract account storage', { balance: fmt(acct.amount), bytesUsed: acct.storage_usage, headroomNear: fmt(headroom) });
    s.assert('the contract account has at least 0.15 NEAR of storage headroom (each syndicate record costs about 0.01)', headroom > near('0.15'), { actual: fmt(headroom) });
    out.startBalances = have;
  }, { critical: true });

  const id1 = synId(1);
  await ctx.step('hatch a syndicate whose settlement key is the Roost\'s', async (s) => {
    const tx = await hatch(id1); txEvidence(s, tx);
    s.assert('hatch succeeded on chain', tx.ok, { actual: tx.error });
    const st = await chain.waitFor(() => state(id1), { what: 'syndicate to appear' });
    s.observe('syndicate state', { status: st.status, epoch: st.epoch, flyers: st.active_flyer_count });
    s.assert('the syndicate is active', /active|open/i.test(String(st.status)), { actual: st.status });
  }, { critical: true });

  await ctx.step('members deposit with explicit consent to the policy hash', async (s) => {
    for (const f of F) { const tx = await deposit(f, id1, '0.02'); txEvidence(s, tx); s.assert(`${f.id} deposited 0.02 NEAR`, tx.ok, { actual: tx.error }); }
    const st = await chain.waitFor(async () => { const x = await state(id1); return BigInt(x.total_escrow) === near('0.06') ? x : null; }, { what: 'escrow to reach 0.06' });
    s.assert('escrow equals the three deposits exactly', BigInt(st.total_escrow) === near('0.06'), { expected: String(near('0.06')), actual: st.total_escrow });
    s.assert('three active flyers', Number(st.active_flyer_count) === 3, { actual: st.active_flyer_count });
  }, { critical: true });

  let aggregate;
  await ctx.step('members seal bids; the Roost aggregates them exactly', async (s) => {
    aggregate = await sealedRound(F, '0.02');
    s.observe('aggregate', aggregate.aggregateOrder);
    s.assert('the total is exactly 0.06', aggregate.aggregateOrder.totalInputAmount === '0.06', { expected: '0.06', actual: aggregate.aggregateOrder.totalInputAmount });
    s.assert('three bids counted and none excluded', aggregate.aggregateOrder.flyerCount === 3 && aggregate.aggregateOrder.excludedFlyers.length === 0);
  }, { critical: true });

  await ctx.step('ATTACK 1: the Roost refuses to sign more than the sealed bids support', async (s) => {
    const st = await state(id1);
    let err = null;
    try { await coordinator.signSettlement({ contractId: chain.coordinatorId, syndicateId: id1, epoch: Number(st.epoch), roundNonce: st.round_nonce, orderHash: aggregate.orderHash, allocations: [{ recipient: rcpt.id, amount: String(near('0.06') + 1n) }] }); } catch (e) { err = e.message; }
    s.assert('over-allocation is refused by the Roost', Boolean(err) && /exceed what the sealed bids support/.test(err), { actual: err });
  });

  await ctx.step('settle on chain with the Roost\'s signature', async (s) => {
    const before = await bal(rcpt.account);
    const st = await state(id1);
    const { tx, signed } = await settle(id1, [{ recipient: rcpt.id, amount: st.total_escrow }], aggregate);
    txEvidence(s, tx);
    s.assert('settle_batch succeeded', tx.ok, { actual: tx.error });
    const after1 = await chain.waitFor(async () => { const x = await state(id1); return /settled/i.test(String(x.status)) ? x : null; }, { what: 'Settled status' });
    const after = await bal(rcpt.account);
    s.observe('recipient balance change (NEAR)', fmt(after - before, 6));
    s.assert('the syndicate is Settled', /settled/i.test(String(after1.status)), { actual: after1.status });
    s.assert('the recipient received exactly the escrow', after - before === BigInt(st.total_escrow), { expected: st.total_escrow, actual: String(after - before) });
    s.assert('the escrow is empty', BigInt(after1.total_escrow) === 0n, { actual: after1.total_escrow });
    out.settled = { tx, signed, allocations: [{ recipient: rcpt.id, amount: st.total_escrow }] };
  }, { critical: true });

  await ctx.step('ATTACK 2: replaying the same signed settlement is rejected', async (s) => {
    const before = await bal(rcpt.account); const st = await state(id1);
    const r = out.settled;
    const tx = await chain.send(coord.account, 'settle_batch', { syndicate_id: id1, attestation_nonce: st.round_nonce, aggregate_order_hash: aggregate.orderHash, allocations: r.allocations, enclave_signature: r.signed.signature }, { gas: 100000000000000n, label: `REPLAY settle_batch ${id1}` });
    txEvidence(s, tx);
    s.observe('contract answer', tx.error);
    s.assert('the replay failed', !tx.ok);
    s.assert('the recipient balance did not change', (await bal(rcpt.account)) === before);
  });

  const id2 = synId(2);
  let agg2;
  await ctx.step('ATTACK 3: a valid Roost signature cannot pay a recipient outside the policy', async (s) => {
    await must(s, 'hatch #2 succeeded', hatch(id2));
    await chain.waitFor(() => state(id2), { what: 'syndicate 2' });
    for (const f of F.slice(0, 2)) await must(s, `${f.id} deposited 0.02`, deposit(f, id2, '0.02'));
    await chain.waitFor(async () => BigInt((await state(id2)).total_escrow) === near('0.04'), { what: 'escrow 0.04' });
    agg2 = await sealedRound(F.slice(0, 2), '0.02');
    const thief = `thief-${runTag}.testnet`;
    const stBefore = await state(id2);
    const { tx } = await settle(id2, [{ recipient: thief, amount: stBefore.total_escrow }], agg2);
    txEvidence(s, tx);
    s.observe('contract answer', tx.error);
    s.assert('the contract rejected a payout to an unapproved recipient', !tx.ok);
    const stAfter = await state(id2);
    s.assert('the syndicate is still active with the escrow intact', /active|open/i.test(String(stAfter.status)) && stAfter.total_escrow === stBefore.total_escrow, { expected: stBefore.total_escrow, actual: stAfter.total_escrow });
  });

  await ctx.step('ATTACK 4: a settlement signed by a different key is rejected', async (s) => {
    const rogue = new HostedRoost({ provider: fakeProvider });
    for (const f of F.slice(0, 2)) rogue.submitSealedIntent({ flyerId: f.id, cipherTextHex: sealToModel(JSON.stringify({ amount: '0.02' }), rogue.intentPublicKey) });
    const rogueAgg = rogue.aggregateAndClear({ roundId: 'rogue' });
    const stBefore = await state(id2);
    const { tx } = await settle(id2, [{ recipient: rcpt.id, amount: stBefore.total_escrow }], rogueAgg, { signer: (p) => rogue.signSettlement(p) });
    txEvidence(s, tx);
    s.observe('contract answer', tx.error);
    s.assert('the contract rejected a signature from a key it was not hatched with', !tx.ok);
    const stAfter = await state(id2);
    s.assert('nothing moved', /active|open/i.test(String(stAfter.status)) && stAfter.total_escrow === stBefore.total_escrow);
  });

  await ctx.step('cleanup: settle syndicate #2 legitimately with the real Roost', async (s) => {
    const agg = await sealedRound(F.slice(0, 2), '0.02');
    const st = await state(id2);
    const { tx } = await settle(id2, [{ recipient: rcpt.id, amount: st.total_escrow }], agg);
    txEvidence(s, tx);
    s.assert('the legitimate settlement succeeded after the failed attacks', tx.ok, { actual: tx.error });
    const fin = await chain.waitFor(async () => { const x = await state(id2); return /settled/i.test(String(x.status)) ? x : null; }, { what: 'Settled #2' });
    s.assert('syndicate #2 is Settled', Boolean(fin));
  });

  const id4 = synId(4);
  await ctx.step('ATTACK 5: a partial settlement cannot be replayed, and the next round needs a fresh signature', async (s) => {
    // Regression for GAP-009: before 2026-11-04 the nonce rotated only for Dark Vaults, so a signature for part of
    // the escrow could be replayed by anyone until the escrow was gone. Settling the FULL escrow (as the steps above
    // do) cannot see this, because the syndicate is then closed and the replay fails for that reason instead.
    await must(s, 'hatch #4 succeeded', hatch(id4));
    await chain.waitFor(() => state(id4), { what: 'syndicate 4' });
    await must(s, 'f1 deposited 0.03', deposit(F[0], id4, '0.03'));
    await chain.waitFor(async () => BigInt((await state(id4)).total_escrow) === near('0.03'), { what: 'escrow 0.03' });
    const aggA = await sealedRound(F.slice(0, 1), '0.03');
    const st0 = await state(id4);
    const part = [{ recipient: rcpt.id, amount: String(near('0.01')) }];
    const first = await settle(id4, part, aggA);
    txEvidence(s, first.tx);
    s.assert('the partial settlement (0.01 of 0.03) succeeded', first.tx.ok, { actual: first.tx.error });
    const st1 = await chain.waitFor(async () => { const x = await state(id4); return BigInt(x.total_escrow) === near('0.02') ? x : null; }, { what: 'escrow 0.02' });
    s.assert('0.02 is left and the syndicate is still active', /active|open/i.test(String(st1.status)), { actual: st1.status });
    s.assert('the round nonce rotated after the partial settlement', st1.round_nonce !== st0.round_nonce, { actual: st1.round_nonce });
    s.assert('it is still epoch 1 (a Flash syndicate does not start new epochs)', Number(st1.epoch) === Number(st0.epoch), { actual: st1.epoch });
    const before = await bal(rcpt.account);
    const replay = await chain.send(coord.account, 'settle_batch', { syndicate_id: id4, attestation_nonce: st0.round_nonce, aggregate_order_hash: aggA.orderHash, allocations: part, enclave_signature: first.signed.signature }, { gas: 100000000000000n, label: `REPLAY settle_batch ${id4} (partial)` });
    txEvidence(s, replay);
    s.observe('contract answer', replay.error);
    s.assert('the replay of the partial settlement failed', !replay.ok);
    const st2 = await state(id4);
    s.assert('the escrow is unchanged by the replay', st2.total_escrow === st1.total_escrow, { expected: st1.total_escrow, actual: st2.total_escrow });
    s.assert('the recipient received nothing from the replay', (await bal(rcpt.account)) === before);
    const aggB = await sealedRound(F.slice(0, 1), '0.02');
    const second = await settle(id4, [{ recipient: rcpt.id, amount: st2.total_escrow }], aggB);
    txEvidence(s, second.tx);
    s.assert('a fresh signature on the new nonce settles the rest', second.tx.ok, { actual: second.tx.error });
    const fin = await chain.waitFor(async () => { const x = await state(id4); return /settled/i.test(String(x.status)) ? x : null; }, { what: 'Settled #4' });
    s.assert('syndicate #4 is Settled with no escrow left', Boolean(fin) && BigInt(fin.total_escrow) === 0n);
  });

  const id3 = synId(3);
  await ctx.step('the Roost stalls: a member takes their own funds back with hatch_out', async (s) => {
    await must(s, 'hatch #3 (timeout 2 blocks) succeeded', hatch(id3, { timeoutBlocks: 2 }));
    await chain.waitFor(() => state(id3), { what: 'syndicate 3' });
    const f2 = F[1];
    await must(s, 'f2 deposited 0.03', deposit(f2, id3, '0.03'));
    await chain.waitFor(async () => BigInt((await state(id3)).total_escrow) === near('0.03'), { what: 'escrow 0.03' });
    await sleep(10000); // the Roost never signs; the timelock passes
    const tx = await chain.send(f2.account, 'hatch_out', { syndicate_id: id3 }, { gas: 60000000000000n, label: `hatch_out ${id3}` });
    txEvidence(s, tx);
    s.assert('hatch_out succeeded without any operator or enclave signature', tx.ok, { actual: tx.error });
    const st = await chain.waitFor(async () => { const x = await state(id3); return BigInt(x.total_escrow) === 0n ? x : null; }, { what: 'escrow refunded' });
    s.assert('the escrow is empty and the syndicate is aborted/refunded', BigInt(st.total_escrow) === 0n, { actual: st.status });
    // Evidence is the transaction's own receipts: balance deltas include gas refunds that arrive later.
    const moves = await chain.waitFor(async () => { const t = await chain.transfersOf(tx.hash, f2.id); return t.some((x) => x.fromContract) ? t : null; }, { what: 'receipts of hatch_out', timeoutMs: 60000 });
    const fromContract = moves.filter((m) => m.fromContract);
    s.observe('transfers made by the contract in this transaction', fromContract.map((m) => ({ to: m.to, near: fmt(m.amount, 6) })));
    s.observe('transfers made by the system (gas refunds, not the contract)', moves.filter((m) => !m.fromContract).map((m) => fmt(m.amount, 6)));
    s.assert('the contract made exactly one transfer', fromContract.length === 1, { actual: fromContract.length });
    s.assert('it went to the member who called hatch_out', fromContract[0]?.to === f2.id, { actual: fromContract[0]?.to });
    s.assert('and it was exactly the 0.03 NEAR they deposited (no more, no less)', fromContract[0]?.amount === String(near('0.03')), { expected: String(near('0.03')), actual: fromContract[0]?.amount });
    s.note('Balance deltas were rejected as evidence here: gas refunds from earlier transactions land after a reading is taken and made a correct refund look like a double payment. The receipts above are authoritative.');
  });

  await ctx.step('return the funds: the recipient pays the members back so the experiment can be repeated', async (s) => {
    // Round 1 took 0.02 from each of f1, f2, f3, round 2 took 0.02 from f1 and f2, and round 4 took 0.03 from f1; all of it went to the recipient.
    const back = [[F[0], '0.07'], [F[1], '0.04'], [F[2], '0.02']];
    for (const [f, amt] of back) {
      let ok = true; let hash = null; let error = null;
      try { const r = await rcpt.account.transfer({ receiverId: f.id, amount: near(amt) }); hash = r.transaction?.hash || r.transaction_outcome?.id; } catch (e) { ok = false; error = e.message.slice(0, 200); }
      chain.ledger.push({ label: `return ${amt} NEAR to ${f.id}`, method: 'transfer', from: rcpt.id, ok, hash, explorer: hash ? chain.explorer(hash) : null, error, gasTGas: 0 });
      s.evidence('tx', { label: `return ${amt} NEAR to ${f.id}`, hash, ok, explorer: hash ? chain.explorer(hash) : null, error });
      s.assert(`returned ${amt} NEAR to ${f.id}`, ok, { actual: error });
    }
  });

  await ctx.step('ledger: every transaction, and what the experiment cost', async (s) => {
    const sent = chain.ledger.length; const failed = chain.ledger.filter((t) => !t.ok);
    s.observe('transactions sent', sent);
    s.observe('transactions that failed (expected: the 3 attack attempts)', failed.map((t) => t.label));
    s.assert('exactly the four attack attempts failed on chain', failed.length === 4 && failed.every((t) => /REPLAY|settle_batch/.test(t.label)), { actual: failed.map((t) => t.label) });
    const end = {}; for (const a of [chain.master, ...F.map((f) => f.account), rcpt.account]) end[a.accountId] = await bal(a);
    const spent = Object.keys(end).reduce((acc, k) => acc + ((out.startBalances[k] ?? end[k]) - end[k]), 0n);
    s.observe('net NEAR spent across all accounts (gas and storage)', fmt(spent, 5));
    s.assert('the whole experiment cost less than 0.02 NEAR net (measured previously: about 0.002)', spent < near('0.02'), { actual: fmt(spent, 5) });
  });
  return out;
}
