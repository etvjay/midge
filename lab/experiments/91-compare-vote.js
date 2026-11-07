import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { connect, near, computePolicyHash } from '../lib/near.js';
import { createMembers, teardownMembers, memberHandle } from '../lib/members.js';
import { HostedRoost, computeAllocationsHash, computeChargesHash } from '../../src/roost-service/hosted-roost.js';
import { sealToModel } from '../../src/enclave/e2ee.js';
import { signInputWithNearKey, inputMessage, makeAccountKeyCheck } from '../../src/roost-service/signed-input.js';

const provider = { simulated: true, attest: async () => Buffer.from('lab-local-no-hardware'), info: async () => ({}) };
const MEMBERS = ['m1', 'm2', 'm3', 'm4', 'm5'];
const PREF = { m1: 'A', m2: 'A', m3: 'B', m4: 'B', m5: 'A' };     // what each member would vote for
const SHARE = '0.02'; const POOL = '0.1';

export default {
  id: 'E-CMP-VOTE-01',
  title: 'Voting on testnet: an open poll and a 3-of-5 multisig against a sealed ballot counted by the host',
  tier: 'testnet',
  requires: ['near-key', 'network'],
  hypothesis: 'Predictions are fixed in docs/lab/PROGRAMME_PLAN.md (committed before this ran; prediction 4 was reworded before the run). Five members each put 0.02 NEAR into a 0.1 pool; two options A (ra) and B (rb); m1, m2 and m5 prefer A, m3 and m4 prefer B; quorum 50%, majority rule. (1) In the open poll an observer reads all 5 votes by account and, before the fifth vote, the public tally is 2 to 2 so the fifth voter knows they decide; in the sealed ballot an observer reads 0 of 5 and the settlement carries no tally or turnout, only the pool paid to the winner and equal charges on all five. (2) Both pay the whole 0.1 to ra. (3) An outsider\'s vote is refused or ignored in both; a member voting twice counts once. (4) In the sealed ballot a re-vote changes the result: with first ballots m1 B, m2 B, m3 B, m4 A, m5 A the host would pay B; after m1 and m2 re-vote A it pays A. (5) Three of five multisig signers can send the whole pool to an address outside both options and it works; under Midge a payout outside the rules is refused by the contract even with a valid host signature (a key we hold stands in for a compromised host), with the escrow intact. (6) If the host never signs, nothing is paid and all five exit alone with 0.02. (7) Gas of the sealed ballot over the open poll is between 0.5 and 3. Fails if any breaks.',
  limits: [
    'One operator controls every account, the host and the coordinator. The voters are scripted; the preferences are assumed, not discovered.',
    'The weight of a vote is a deposit-funded share, not a person: the contract cannot tell one person from many accounts. Nothing here tests coercion or vote-buying beyond re-voting.',
    'The open poll and the multisig are our own minimal contracts (contracts/public-market, contracts/public-multisig), not anyone else\'s. The host is a local HostedRoost with a simulated attestation provider; signed inputs use real NEAR keys and the real account-key lookup.',
    'In the sealed ballot every member\'s whole deposit is the pool share, so after settlement nobody has an escrow left to exit with; the exit is shown separately with the host never signing.',
    'The count cannot be checked by anyone but the host (two hosts would reduce that trust; this run uses one). The public tally is hidden, so a dishonest host could report a wrong winner, within the options and the equal charges.',
  ],
  async run(ctx) {
    const chain = await connect(ctx.rootDir);
    const coord = chain.sub('c');
    const tag = Date.now().toString(36);
    const created = []; const results = {}; const gas = { PUB: 0, SEAL: 0 };
    let P = null; let market = null; let msig = null; let countBefore;
    const ids = () => Object.values(P);
    const track = (p, e) => { gas[p] += e.gasTGas || 0; return e; };
    const height = (f = 'optimistic') => chain.blockHeight(f);
    const state = (id) => chain.view('get_syndicate', { syndicate_id: id });
    const keyCheck = makeAccountKeyCheck({ rpcUrl: 'https://test.rpc.fastnear.com', contractId: chain.coordinatorId });
    const policyFor = () => ({ allowed_recipients: [P.ra.id, P.rb.id], max_release_bps_per_epoch: 10000, settle_deadline_block: 500000000 });
    const hatch = (id, keyHex) => { created.push(id); return chain.send(coord.account, 'hatch', { syndicate_id: id, syndicate_type: 'FLASH', quorum_threshold: 1, max_spend_near: 1, enclave_public_key: keyHex, expected_code_hash: crypto.randomBytes(32).toString('hex'), timeout_blocks: 16, payout_recipient: P.ra.id, release_policy: policyFor() }, { deposit: near('0.01'), gas: 40000000000000n, label: `hatch ${id}` }); };
    const deposit = (who, id) => chain.send(P[who].account, 'deposit', { syndicate_id: id, policy_hash: computePolicyHash(policyFor()) }, { deposit: near(SHARE), gas: 30000000000000n, label: `deposit ${who} -> ${id}` });
    const escrowsOf = async (id) => Object.fromEntries(await Promise.all(MEMBERS.map(async (k) => [k, BigInt(await chain.view('get_escrow', { syndicate_id: id, account_id: P[k].id }))])));
    const waitForTimer = (id) => chain.waitFor(async () => (await height('final')) - Number((await state(id)).epoch_start_block) >= 16, { what: 'the exit timer', timeoutMs: 120000 });
    const txArgs = async (hash, signer) => { for (const url of ['https://test.rpc.fastnear.com', 'https://archival-rpc.testnet.fastnear.com']) { try { const r = await (await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'EXPERIMENTAL_tx_status', params: [hash, signer] }) })).json(); if (r.result) return JSON.parse(Buffer.from(r.result.transaction.actions[0].FunctionCall.args, 'base64').toString('utf8')); } catch { /* next */ } } return null; };
    const mkHost = (round) => { const r = new HostedRoost({ provider, requireSignedInputs: true, accountKeyCheck: keyCheck }); r.openRound(round); return r; };
    const cast = async (r, round, who, body, seq = 1) => { const cipherTextHex = sealToModel(JSON.stringify(body), r.intentPublicKey); return r.submitSignedIntent({ flyerId: P[who].id, cipherTextHex, publicKey: P[who].key.keyPair.getPublicKey().toString(), signature: signInputWithNearKey(P[who].key.keyPair.toString(), inputMessage({ ...round, flyerId: P[who].id, seq, cipherTextHex })), seq }); };
    const roundOf = async (id) => { const st = await state(id); return { contractId: chain.coordinatorId, syndicateId: id, epoch: Number(st.epoch), roundNonce: st.round_nonce }; };
    const ballotParams = (id) => ({ options: { A: P.ra.id, B: P.rb.id }, roll: MEMBERS.map((k) => P[k].id), share: SHARE, quorumBps: 5000, rule: 'majority', roundId: id });
    const nameOf = (acct) => Object.keys(P).find((k) => P[k].id === acct);

    await ctx.step('set up: five members, an outsider, two recipients, a thief, and the open poll and multisig contracts deployed fresh', async (s) => {
      countBefore = Number(await chain.view('get_syndicate_count', {}));
      const mw = path.join(ctx.rootDir, 'contracts/public-market/target/wasm32-unknown-unknown/release/public_market.wasm');
      const sw = path.join(ctx.rootDir, 'contracts/public-multisig/target/wasm32-unknown-unknown/release/public_multisig.wasm');
      s.assert('both baseline wasms are built', fs.existsSync(mw) && fs.existsSync(sw));
      const names = [...MEMBERS, 'o', 'ra', 'rb', 't'];
      const made = await createMembers(chain, { rootDir: ctx.rootDir, tag: `v${tag.slice(-5)}`, count: names.length, fundNear: '0.4', names });
      P = Object.fromEntries(names.map((k, i) => [k, made[i]]));
      const deploy = async (prefix, wasm, fund) => { const id = `${prefix}${tag.slice(-6)}.${chain.masterId}`; const h = memberHandle(chain, id); await chain.master.createSubAccount({ accountOrPrefix: `${prefix}${tag.slice(-6)}`, publicKey: h.key.keyPair.getPublicKey(), nearToTransfer: near(fund) }); await chain.waitFor(async () => { try { await h.account.getBalance(); return true; } catch { return false; } }, { what: 'account' }); await h.account.deployContract(fs.readFileSync(wasm)); return h; };
      market = await deploy('pv', mw, '4.0'); msig = await deploy('ms', sw, '2.6');
      s.assert('the multisig is initialised', (await chain.send(msig.account, 'new', { signers: MEMBERS.map((k) => P[k].id), threshold: 3 }, { gas: 30000000000000n, contractId: msig.id, label: 'init multisig' })).ok);
      s.assert('the open poll contract answers', (await chain.view('get_poll', { poll_id: 'none' }, market.id)) === null);
      s.assert('the multisig is initialised with the five members and a threshold of 3', JSON.stringify(await chain.view('get_signers', {}, msig.id)) === JSON.stringify([MEMBERS.map((k) => P[k].id), 3]));
    }, { critical: true });

    // ================= open poll =================
    await ctx.step('OPEN POLL · everyone deposits and votes in public; a later vote replaces an earlier one; the last voter reads the tally first', async (s) => {
      const id = `poll-${tag}`; const t0 = Date.now(); const start = await height(); const end = start + 420;
      s.assert('open the poll', track('PUB', await chain.send(P.m1.account, 'open_poll', { poll_id: id, options: [{ id: 'A', recipient: P.ra.id }, { id: 'B', recipient: P.rb.id }], roll: MEMBERS.map((k) => P[k].id), share: String(near(SHARE)), quorum_bps: 5000, rule: 'majority', end_block: end }, { gas: 30000000000000n, contractId: market.id, label: 'open poll' })).ok);
      await chain.waitFor(() => chain.view('get_poll', { poll_id: id }, market.id), { what: 'poll' });
      for (const m of MEMBERS) s.assert(`${m} joins with ${SHARE}`, track('PUB', await chain.send(P[m].account, 'join_poll', { poll_id: id }, { deposit: near(SHARE), gas: 30000000000000n, contractId: market.id, label: `join ${m}` })).ok);
      const oJoin = await chain.send(P.o.account, 'join_poll', { poll_id: id }, { deposit: near(SHARE), gas: 30000000000000n, contractId: market.id, label: 'outsider joins' });
      s.assert('(3) an outsider cannot join the poll', !oJoin.ok && /only the roll can join/.test(oJoin.error || ''), { actual: oJoin.error });
      const oVote = await chain.send(P.o.account, 'vote', { poll_id: id, choice: 'A' }, { gas: 30000000000000n, contractId: market.id, label: 'outsider votes' });
      s.assert('(3) an outsider cannot vote', !oVote.ok && /only a member who joined/.test(oVote.error || ''), { actual: oVote.error });
      const castVote = async (m, c) => { const r = track('PUB', await chain.send(P[m].account, 'vote', { poll_id: id, choice: c }, { gas: 30000000000000n, contractId: market.id, label: `vote ${m} ${c}` })); s.assert(`${m} votes ${c}`, r.ok, { actual: r.error }); return r; };
      await castVote('m1', 'A'); await castVote('m3', 'B'); await castVote('m2', 'A'); await castVote('m4', 'B');
      await castVote('m1', 'A'); // m1 votes again: counts once
      await chain.waitFor(async () => (await chain.view('get_votes', { poll_id: id }, market.id)).length === 4, { what: 'four votes' });
      const before = await chain.view('get_votes', { poll_id: id }, market.id);
      const tally = (v) => ({ A: v.filter((x) => x[1] === 'A').length, B: v.filter((x) => x[1] === 'B').length });
      s.assert('(1) before the last vote the public tally is 2 to 2: the fifth voter reads it and knows their vote decides', JSON.stringify(tally(before)) === JSON.stringify({ A: 2, B: 2 }), { actual: tally(before) });
      s.assert('(3) m1 voted twice and still counts once', before.length === 4 && before.filter((x) => x[0] === P.m1.id).length === 1);
      await castVote('m5', 'A');
      const votes = await chain.view('get_votes', { poll_id: id }, market.id);
      const readable = votes.filter((v) => PREF[nameOf(v[0])] === v[1]).length;
      s.assert('(1) an observer reads all 5 votes by account, each matching what that member voted: 5 of 5', votes.length === 5 && readable === 5, { actual: votes.length });
      s.assert('the voting finished with time to spare before the end', end - (await height()) > 12);
      await chain.waitFor(async () => (await height()) >= end + 1, { what: 'the end of the poll', timeoutMs: 600000, everyMs: 900 });
      const closeTx = track('PUB', await chain.send(P.m1.account, 'close_poll', { poll_id: id }, { gas: 100000000000000n, contractId: market.id, label: 'close poll' }));
      s.evidence('tx', { label: closeTx.label, hash: closeTx.hash, ok: closeTx.ok, explorer: closeTx.explorer, error: closeTx.error });
      s.assert('the poll closed', closeTx.ok, { actual: closeTx.error });
      const paid = (await chain.transfersOf(closeTx.hash, P.m1.id)).filter((m) => m.predecessor === market.id);
      s.assert('(2) the whole 0.1 NEAR went to ra (A won 3 to 2)', paid.length === 1 && paid[0].to === P.ra.id && BigInt(paid[0].amount) === near(POOL), { actual: paid });
      results.PUB = { winner: 'A', votesReadable: 5, tallyBeforeLastVote: tally(before), gasTGas: +gas.PUB.toFixed(1), wallMs: Date.now() - t0 };
      s.observe('result', results.PUB); s.evidence('OPEN', results.PUB);
    });

    // ================= sealed ballot =================
    await ctx.step('MIDGE · sealed ballot: equal deposits, signed ballots, the host counts and publishes only the winner', async (s) => {
      const id = `vote-${tag}-sealed`; const t0 = Date.now(); const host = mkHost({ contractId: chain.coordinatorId, syndicateId: id, epoch: 0, roundNonce: 'x'.repeat(64) });
      s.assert('hatch', track('SEAL', await hatch(id, host.settlePublicKey)).ok); await chain.waitFor(() => state(id), { what: 'syndicate' });
      for (const m of MEMBERS) s.assert(`${m} deposits ${SHARE}`, track('SEAL', await deposit(m, id)).ok);
      await chain.waitFor(async () => BigInt((await state(id)).total_escrow) === near(SHARE) * 5n, { what: 'deposits' });
      s.assert('(1) the public escrows are all equal, so they reveal nothing about any vote', new Set(Object.values(await escrowsOf(id)).map(String)).size === 1);
      const round = await roundOf(id); host.openRound(round);
      for (const m of MEMBERS) await cast(host, round, m, { choice: PREF[m] });
      await cast(host, round, 'm1', { choice: 'A' }, 2); // m1 votes again: counts once
      await cast(host, round, 'o', { choice: 'B' });      // an outsider's validly signed ballot
      const out = host.runBallot(ballotParams(id));
      s.observe('what the host publishes', out.outcome);
      s.assert('(2) A wins and the outcome names ra, with no tally, turnout or ballot', out.outcome.decided && out.outcome.winner === 'A' && out.outcome.recipient === P.ra.id && !['tally', 'counts', 'turnout', 'cast', 'ballots'].some((k) => k in out.outcome));
      s.assert('(3) the outsider\'s signed ballot was ignored and reported by account only', out.outcome.outsiders.join() === P.o.id);
      const signed = host.signSettlement({ ...round, allocations: out.allocations, orderHash: out.orderHash, charges: out.charges });
      const tx = track('SEAL', await chain.send(coord.account, 'settle_batch_charged', { syndicate_id: id, attestation_nonce: round.roundNonce, aggregate_order_hash: out.orderHash, allocations: out.allocations, charges: out.charges, enclave_signature: signed.signature }, { gas: 150000000000000n, label: `settle_batch_charged ${id}` }));
      s.evidence('tx', { label: tx.label, hash: tx.hash, ok: tx.ok, explorer: tx.explorer, error: tx.error });
      s.assert('the settlement succeeded', tx.ok, { actual: tx.error });
      await chain.waitFor(async () => { const x = await state(id); return !x.is_settling && BigInt(x.total_escrow) === 0n; }, { what: 'settlement resolved' });
      const paid = (await chain.transfersOf(tx.hash, coord.id)).filter((m) => m.fromContract);
      s.assert('(2) the whole 0.1 NEAR went to ra', paid.length === 1 && paid[0].to === P.ra.id && BigInt(paid[0].amount) === near(POOL), { actual: paid });
      const args = await txArgs(tx.hash, coord.id);
      s.assert('(1) the settlement carries only the pool to ra and an equal charge on each of the five: it reveals no vote, no tally and no turnout', args && args.allocations.length === 1 && args.allocations[0].recipient === P.ra.id && args.charges.length === 5 && new Set(args.charges.map((c) => c.amount)).size === 1, { actual: args && { allocations: args.allocations?.length, charges: args.charges?.length } });
      s.assert('(1) the five charges are identical and equal to the share, so non-voters and voters look the same: 0 of 5 votes can be read', args.charges.every((c) => BigInt(c.amount) === near(SHARE)));
      results.SEAL = { winner: 'A', votesReadable: 0, tallyOnChain: false, turnoutOnChain: false, gasTGas: +gas.SEAL.toFixed(1), wallMs: Date.now() - t0 };
      s.observe('result', results.SEAL); s.evidence('SEALED', { ...results.SEAL, settleTx: tx.hash });
    });

    // ================= re-voting changes the result =================
    await ctx.step('RE-VOTE · the latest signed ballot counts: B is ahead, two members change to A, and the result flips', async (s) => {
      const round = { contractId: chain.coordinatorId, syndicateId: 'revote', epoch: 1, roundNonce: 'cd'.repeat(32) };
      const host = mkHost(round);
      for (const [m, c] of [['m1', 'B'], ['m2', 'B'], ['m3', 'B'], ['m4', 'A'], ['m5', 'A']]) await cast(host, round, m, { choice: c });
      const before = host.runBallot(ballotParams('rv1'));
      s.assert('(4) with the first ballots the host would pay B (3 to 2)', before.outcome.decided && before.outcome.winner === 'B');
      const host2 = mkHost(round);
      for (const [m, c] of [['m1', 'B'], ['m2', 'B'], ['m3', 'B'], ['m4', 'A'], ['m5', 'A']]) await cast(host2, round, m, { choice: c }, 1);
      await cast(host2, round, 'm1', { choice: 'A' }, 2); await cast(host2, round, 'm2', { choice: 'A' }, 2);
      const after = host2.runBallot(ballotParams('rv2'));
      s.assert('(4) after m1 and m2 re-vote A with a higher sequence number the host pays A (4 to 1)', after.outcome.decided && after.outcome.winner === 'A');
      const stale = await cast(host2, round, 'm1', { choice: 'B' }, 1).then(() => 'accepted', (e) => e.message);
      s.assert('a replayed older ballot (sequence 1) cannot overwrite the newer one', /sequence/.test(stale), { actual: stale });
    });

    // ================= multisig =================
    await ctx.step('MULTISIG · the five members are the signers; three of them approve a payment, and the money goes where they say', async (s) => {
      const bal0 = BigInt((await msig.account.getBalance()).toString());
      for (const m of MEMBERS) s.assert(`${m} sends 0.02 to the multisig`, (await P[m].account.transfer({ receiverId: msig.id, amount: near(SHARE) })) !== undefined);
      await chain.waitFor(async () => BigInt((await msig.account.getBalance()).toString()) >= bal0 + near(POOL) - near('0.001'), { what: 'treasury funded by the five transfers' });
      const send = (m, method, args) => chain.send(P[m].account, method, args, { gas: 50000000000000n, contractId: msig.id, label: `${method} ${m}` });
      const prop = await send('m1', 'propose', { to: P.t.id, amount: String(near(POOL)) }); s.assert('m1 proposes paying the whole pool to t, which is neither option', prop.ok, { actual: prop.error });
      s.assert('m2 approves', (await send('m2', 'approve', { proposal_id: 0 })).ok); s.assert('m3 approves', (await send('m3', 'approve', { proposal_id: 0 })).ok);
      const p = await chain.view('get_proposal', { proposal_id: 0 }, msig.id);
      s.assert('(5) the approvals are public: m1, m2 and m3 by name; m4 and m5, who might object, have no say', p.approvals.length === 3 && ['m1', 'm2', 'm3'].every((k) => p.approvals.includes(P[k].id)));
      const ex = await send('m4', 'execute', { proposal_id: 0 }); s.evidence('tx', { label: ex.label, hash: ex.hash, ok: ex.ok, explorer: ex.explorer, error: ex.error });
      s.assert('(5) three of the five signers sent the whole pool to the thief and it worked', ex.ok, { actual: ex.error });
      const paid = (await chain.transfersOf(ex.hash, P.m4.id)).filter((m) => m.predecessor === msig.id);
      s.assert('(5) t received exactly 0.1 NEAR', paid.length === 1 && paid[0].to === P.t.id && BigInt(paid[0].amount) === near(POOL), { actual: paid });
      results.MSIG = { thiefPaid: true, signersNeeded: 3, of: 5 };
    });

    // ================= the same attempt under Midge =================
    await ctx.step('COMPROMISED HOST · the same thief payment under Midge: refused by the contract even with a valid host signature, escrow intact', async (s) => {
      const id = `vote-${tag}-bad`; const kp = crypto.generateKeyPairSync('ed25519'); const pk = kp.publicKey.export({ format: 'der', type: 'spki' }).subarray(12).toString('hex');
      s.assert('hatch with a key we hold, standing in for a compromised host', (await hatch(id, pk)).ok); await chain.waitFor(() => state(id), { what: 'syndicate' });
      for (const m of MEMBERS) s.assert(`${m} deposits`, (await deposit(m, id)).ok);
      await chain.waitFor(async () => BigInt((await state(id)).total_escrow) === near(SHARE) * 5n, { what: 'deposits' });
      const st = await state(id); const allocations = [{ recipient: P.t.id, amount: String(near(POOL)) }]; const charges = MEMBERS.map((k) => ({ member: P[k].id, amount: String(near(SHARE)) })); const order = crypto.randomBytes(16).toString('hex');
      const msg = `${chain.coordinatorId}:${id}:${st.epoch}:${st.round_nonce}:${computeAllocationsHash(allocations)}:${computeChargesHash(charges)}:${order}`;
      const tx = await chain.send(coord.account, 'settle_batch_charged', { syndicate_id: id, attestation_nonce: st.round_nonce, aggregate_order_hash: order, allocations, charges, enclave_signature: crypto.sign(null, Buffer.from(msg, 'utf8'), kp.privateKey).toString('hex') }, { gas: 150000000000000n, label: 'thief payment, validly signed' });
      s.evidence('tx', { label: tx.label, hash: tx.hash, ok: tx.ok, explorer: tx.explorer, error: tx.error });
      s.assert('(5) a validly signed payout to a recipient outside the rules is refused by the contract', !tx.ok && /not in the allowed|allowlist|not allowed|recipient/i.test(tx.error || ''), { actual: tx.error });
      s.assert('(5) the escrow is intact and nothing is in flight', BigInt((await state(id)).total_escrow) === near(SHARE) * 5n && !(await state(id)).is_settling);
      await waitForTimer(id);
      for (const m of MEMBERS) { const r = await chain.send(P[m].account, 'hatch_out', { syndicate_id: id }, { gas: 60000000000000n, label: `exit ${id} as ${m}` }); s.assert(`(6) ${m} exits alone with the full ${SHARE} (the host never signed anything valid)`, r.ok); }
      results.BAD = { refused: true };
    });

    await ctx.step('the comparison, read from the measurements above', async (s) => {
      s.observe('results', results);
      s.assert('every path was measured', ['PUB', 'SEAL', 'MSIG', 'BAD'].every((k) => results[k]));
      const ratio = +(gas.SEAL / gas.PUB).toFixed(2);
      s.observe('gas, TGas for the whole vote: open poll / sealed ballot', [gas.PUB, gas.SEAL].map((x) => +x.toFixed(1)));
      s.observe('wall time (ms): open poll / sealed ballot', [results.PUB.wallMs, results.SEAL.wallMs]);
      s.assert('(7) the sealed ballot burns between 0.5 and 3 times the open poll\'s gas', ratio >= 0.5 && ratio <= 3, { actual: ratio });
      s.evidence('comparison', results);
    });

    await ctx.step('teardown: delete the baseline contracts, prune the syndicates, delete the accounts', async (s) => {
      for (const [label, h] of [['open poll', market], ['multisig', msig]]) if (h) { try { await h.account.deleteAccount(chain.masterId); s.observe(`${label} contract account`, 'deleted, balance returned to the master'); } catch (e) { s.observe(`${label} contract account NOT deleted`, String(e.message).slice(0, 120)); } }
      if (!P) { s.assert('nothing to tear down', true); return; }
      const rep = await teardownMembers(chain, { rootDir: ctx.rootDir, members: ids(), pruneIds: created });
      s.observe('teardown', { pruned: rep.pruned.length, notPruned: rep.notPruned, deleted: rep.deleted.length, kept: rep.kept, failed: rep.failed });
      s.assert('every account was deleted and every syndicate pruned', rep.failed.length === 0 && rep.kept.length === 0 && rep.notPruned.length === 0, { actual: rep });
      s.assert('the contract holds the records it started with', Number(await chain.view('get_syndicate_count', {})) === countBefore, { expected: countBefore });
    }, { always: true });
  },
};
