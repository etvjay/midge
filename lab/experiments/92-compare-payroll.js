import crypto from 'node:crypto';
import { connect, near, computePolicyHash } from '../lib/near.js';
import { createMembers, teardownMembers } from '../lib/members.js';
import { HostedRoost } from '../../src/roost-service/hosted-roost.js';
import { generateClientKey, openFromModel, sealToModel } from '../../src/enclave/e2ee.js';
import { signInputWithNearKey, inputMessage, makeAccountKeyCheck } from '../../src/roost-service/signed-input.js';
import { verifyStatement, payrunOrderHash } from '../../src/roost-service/receipts.js';

const provider = { simulated: true, attest: async () => Buffer.from('lab-local-no-hardware'), info: async () => ({}) };
const PEOPLE = [['Alice', '0.05'], ['Bo', '0.04'], ['Cy', '0.03'], ['Di', '0.02']];   // name, gross NEAR per month
const TAX = 0.15; const BEN = 0.05; const DEPOSIT = '0.15';
const net = (g) => Number(g) * (1 - TAX - BEN); const taxOf = (g) => Number(g) * TAX; const benOf = (g) => Number(g) * BEN;
const micro = (x) => BigInt(Math.round(Number(x) * 1e6));

export default {
  id: 'E-CMP-PAYROLL-01',
  title: 'Payroll on testnet: a public pay run with reused addresses against a sealed pay run with one-time addresses and signed receipts, two months',
  tier: 'testnet',
  requires: ['near-key', 'network'],
  hypothesis: 'Predictions are fixed in docs/lab/PROGRAMME_PLAN.md (committed before this ran; the gas band was revised before the run). Four people with gross 0.05, 0.04, 0.03, 0.02 NEAR, 15% tax and 5% benefits, paid in two months with the same salaries. (1) Public payroll: an observer links 4 of 4 payees across the months by address and reads every net, tax and benefits amount; given one leaked address (Alice\'s) the observer reads her pay in both months. (2) Midge with one-time addresses: the observer links 0 of 4 payees by address, but 4 of 4 by amount alone, because the salaries are distinct and unchanged, so one leaked address still exposes that person\'s pay in both months. (3) Each of the 4 people verifies their own receipt (decrypts, host signature, Merkle proof, order hash against the chain); a receipt with a changed amount fails; the auditor\'s totals equal what the chain shows; each person\'s net equals the transfer to their address and the four tax lines sum to the one tax transfer. (4) In each month the employer is charged exactly the gross total (0.14), each address receives exactly its net, and the tax and benefits providers exactly their totals. (5) If the host never signs, nothing is paid and the employer exits alone with the full deposit. (6) Midge uses between 3 and 20 times the gas of the public pay run. Fails if any breaks.',
  limits: [
    'One operator controls every account and the host; the people are scripted. Every payment\'s address and amount is public on NEAR in both paths: this tests who can be named, not how much can be seen.',
    'The observer is modelled from chain data only, plus one assumed leak of one person\'s address. Amounts are fingerprints: with distinct, stable salaries a one-time address does not stop an observer linking the same person across months. This is the main limit of "private who".',
    'The host is local with a simulated attestation provider; signed inputs use real NEAR keys and the real account-key lookup. The employer\'s statement and the auditor\'s key are read by the experiment itself.',
    'A multisig-approved payroll is not run: it adds approvals but is as public as the direct run. A dishonest host could issue a wrong receipt; two hosts would reduce that and this run uses one.',
    'At most 8 recipients per settlement: 4 people plus tax plus benefits is 6.',
  ],
  async run(ctx) {
    const chain = await connect(ctx.rootDir);
    const coord = chain.sub('c');
    const tag = Date.now().toString(36);
    const created = []; const results = {}; const gas = { PUB: 0, MIDGE: 0 };
    let P = null; let countBefore;
    const ids = () => Object.values(P);
    const height = (f = 'optimistic') => chain.blockHeight(f);
    const state = (id) => chain.view('get_syndicate', { syndicate_id: id });
    const keyCheck = makeAccountKeyCheck({ rpcUrl: 'https://test.rpc.fastnear.com', contractId: chain.coordinatorId });
    const waitForTimer = (id) => chain.waitFor(async () => (await height('final')) - Number((await state(id)).epoch_start_block) >= 16, { what: 'the exit timer', timeoutMs: 120000 });
    const txArgs = async (hash, signer) => { for (const url of ['https://test.rpc.fastnear.com', 'https://archival-rpc.testnet.fastnear.com']) { try { const r = await (await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'EXPERIMENTAL_tx_status', params: [hash, signer] }) })).json(); if (r.result) return JSON.parse(Buffer.from(r.result.transaction.actions[0].FunctionCall.args, 'base64').toString('utf8')); } catch { /* next */ } } return null; };
    const directTransfer = (hash, signer) => chain.waitFor(async () => { const r = await (await fetch('https://archival-rpc.testnet.fastnear.com', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'EXPERIMENTAL_tx_status', params: [hash, signer] }) })).json(); const t = r.result?.transaction; const a = t?.actions?.find((x) => x.Transfer); return a ? { to: t.receiver_id, amount: BigInt(a.Transfer.deposit) } : null; }, { what: 'the transfer to be readable', timeoutMs: 60000, everyMs: 1500 });
    const gasOfOutcome = (res) => (Number(BigInt(res.transaction_outcome.outcome.gas_burnt)) + (res.receipts_outcome || []).reduce((x, r) => x + Number(BigInt(r.outcome.gas_burnt)), 0)) / 1e12;

    const lineFor = (person, i, payee, keys) => ({ payee, person, invoiceId: `INV-${person}-${tag.slice(-4)}`, period: '2026-11', gross: PEOPLE[i][1], tax: taxOf(PEOPLE[i][1]).toFixed(6), benefits: benOf(PEOPLE[i][1]).toFixed(6), payeeKey: keys[i].publicKeyHex });

    await ctx.step('set up: an employer, four people with reused addresses, eight one-time addresses, the tax authority and the benefits provider', async (s) => {
      countBefore = Number(await chain.view('get_syndicate_count', {}));
      const names = ['er', 'p1', 'p2', 'p3', 'p4', 'a1', 'a2', 'a3', 'a4', 'b1', 'b2', 'b3', 'b4', 'tx', 'bn'];
      const made = await createMembers(chain, { rootDir: ctx.rootDir, tag: `y${tag.slice(-5)}`, count: names.length, fundNear: '0.06', names });
      P = Object.fromEntries(names.map((k, i) => [k, made[i]]));
      await chain.master.transfer({ receiverId: P.er.id, amount: near('1.4') });
      await chain.waitFor(async () => BigInt((await P.er.account.getBalance()).toString()) >= near('1.2'), { what: 'the employer funded' });
      s.assert('fifteen accounts exist and the employer is funded', made.length === 15);
    }, { critical: true });

    // ================= public payroll: reused addresses =================
    const observed = { PUB: {}, MIDGE: {} };
    await ctx.step('PUBLIC · the employer pays the same four addresses, tax and benefits directly, two months running', async (s) => {
      for (const month of [1, 2]) {
        const seen = [];
        const pay = async (to, amount) => { const res = await P.er.account.transfer({ receiverId: to, amount: near(amount) }); gas.PUB += gasOfOutcome(res); const hash = res.transaction.hash; seen.push(await directTransfer(hash, P.er.id)); s.evidence('tx', { label: `public pay month ${month} -> ${to}`, hash, ok: true, explorer: `https://testnet.nearblocks.io/txns/${hash}` }); };
        for (let i = 0; i < 4; i += 1) await pay(P[`p${i + 1}`].id, net(PEOPLE[i][1]).toFixed(6));
        await pay(P.tx.id, PEOPLE.reduce((x, p) => x + taxOf(p[1]), 0).toFixed(6)); await pay(P.bn.id, PEOPLE.reduce((x, p) => x + benOf(p[1]), 0).toFixed(6));
        observed.PUB[month] = seen;
      }
      const m1 = observed.PUB[1]; const m2 = observed.PUB[2]; const people = (m) => m.filter((t) => t.to !== P.tx.id && t.to !== P.bn.id);
      const linkedByAddress = people(m1).filter((a) => people(m2).some((b) => b.to === a.to)).length;
      s.assert('(1) an observer links 4 of 4 payees across the months by address', linkedByAddress === 4, { actual: linkedByAddress });
      s.assert('(1) every net amount is readable: 0.04, 0.032, 0.024, 0.016, and the tax and benefits totals 0.021 and 0.007', people(m1).map((t) => t.amount).join() === [0.04, 0.032, 0.024, 0.016].map((x) => String(near(String(x)))).join() && m1.find((t) => t.to === P.tx.id).amount === near('0.021') && m1.find((t) => t.to === P.bn.id).amount === near('0.007'), { actual: m1.map((t) => [t.to.split('.')[0], String(t.amount)]) });
      const leaked = P.p1.id; const aliceMonths = [m1, m2].map((m) => m.find((t) => t.to === leaked)?.amount);
      s.assert('(1) given only Alice\'s address the observer reads her pay in both months (0.04 and 0.04)', aliceMonths.every((a) => a === near('0.04')), { actual: aliceMonths.map(String) });
      results.PUB = { linkedAcrossMonthsByAddress: linkedByAddress, of: 4, amountsReadable: true, aliceExposedMonths: 2, gasTGas: +gas.PUB.toFixed(1) };
      s.observe('result', results.PUB); s.evidence('PUBLIC', results.PUB);
    });

    // ================= Midge: one-time addresses, receipts =================
    const employerReadKey = generateClientKey(); const auditorKey = generateClientKey();
    const payeeKeys = PEOPLE.map(() => generateClientKey());
    const policyFor = (addrs) => ({ allowed_recipients: addrs, max_release_bps_per_epoch: 10000, settle_deadline_block: 500000000 });
    async function midgeMonth(s, month) {
      const addr = [1, 2, 3, 4].map((i) => P[`${month === 1 ? 'a' : 'b'}${i}`].id); const all = [...addr, P.tx.id, P.bn.id];
      const id = `pay-${tag}-m${month}`; created.push(id); const host = new HostedRoost({ provider, requireSignedInputs: true, accountKeyCheck: keyCheck });
      const h = await chain.send(coord.account, 'hatch', { syndicate_id: id, syndicate_type: 'FLASH', quorum_threshold: 1, max_spend_near: 1, enclave_public_key: host.settlePublicKey, expected_code_hash: crypto.randomBytes(32).toString('hex'), timeout_blocks: 16, payout_recipient: addr[0], release_policy: policyFor(all) }, { deposit: near('0.01'), gas: 40000000000000n, label: `hatch ${id}` });
      gas.MIDGE += h.gasTGas || 0; s.assert(`month ${month}: hatch`, h.ok, { actual: h.error }); await chain.waitFor(() => state(id), { what: 'syndicate' });
      const dep = await chain.send(P.er.account, 'deposit', { syndicate_id: id, policy_hash: computePolicyHash(policyFor(all), 16) }, { deposit: near(DEPOSIT), gas: 30000000000000n, label: `deposit er -> ${id}` });
      gas.MIDGE += dep.gasTGas || 0; s.assert(`month ${month}: the employer deposits ${DEPOSIT}`, dep.ok, { actual: dep.error });
      await chain.waitFor(async () => BigInt((await state(id)).total_escrow) === near(DEPOSIT), { what: 'deposit' });
      const st = await state(id); const round = { contractId: chain.coordinatorId, syndicateId: id, epoch: Number(st.epoch), roundNonce: st.round_nonce }; host.openRound(round);
      const lines = PEOPLE.map(([name], i) => lineFor(name, i, addr[i], payeeKeys));
      const cipherTextHex = sealToModel(JSON.stringify({ lines }), host.intentPublicKey);
      await host.submitSignedIntent({ flyerId: P.er.id, cipherTextHex, publicKey: P.er.key.keyPair.getPublicKey().toString(), signature: signInputWithNearKey(P.er.key.keyPair.toString(), inputMessage({ ...round, flyerId: P.er.id, seq: 1, cipherTextHex })), seq: 1 });
      const out = host.runPayrun({ employer: P.er.id, taxAddress: P.tx.id, benefitsAddress: P.bn.id, employerKeyHex: employerReadKey.publicKeyHex, auditorKeyHex: auditorKey.publicKeyHex, runId: `run-${tag}-m${month}` });
      const signed = host.signSettlement({ ...round, allocations: out.allocations, orderHash: out.orderHash, charges: out.charges });
      const tx = await chain.send(coord.account, 'settle_batch_charged', { syndicate_id: id, attestation_nonce: round.roundNonce, aggregate_order_hash: out.orderHash, allocations: out.allocations, charges: out.charges, enclave_signature: signed.signature }, { gas: 150000000000000n, label: `settle_batch_charged ${id}` });
      gas.MIDGE += tx.gasTGas || 0; s.evidence('tx', { label: tx.label, hash: tx.hash, ok: tx.ok, explorer: tx.explorer, error: tx.error }); s.assert(`month ${month}: the settlement succeeded`, tx.ok, { actual: tx.error });
      await chain.waitFor(async () => { const x = await state(id); return !x.is_settling && BigInt(x.total_escrow) === near(DEPOSIT) - near('0.14'); }, { what: 'settlement resolved' });
      const moved = (await chain.transfersOf(tx.hash, coord.id)).filter((m) => m.fromContract);
      const args = await txArgs(tx.hash, coord.id);
      const byTo = Object.fromEntries(moved.map((m) => [m.to, BigInt(m.amount)]));
      s.assert(`(4) month ${month}: exactly six transfers moved, and nothing else`, moved.length === 6 && all.every((a) => byTo[a] !== undefined), { actual: moved.length });
      s.assert(`(4) month ${month}: each address received exactly its net: 0.04, 0.032, 0.024, 0.016`, addr.every((a, i) => byTo[a] === near(net(PEOPLE[i][1]).toFixed(6))), { actual: addr.map((a) => String(byTo[a])) });
      s.assert(`(4) month ${month}: the tax authority received 0.021 and the benefits provider 0.007`, byTo[P.tx.id] === near('0.021') && byTo[P.bn.id] === near('0.007'));
      s.assert(`(4) month ${month}: the employer was charged exactly the gross total, 0.14`, args.charges.length === 1 && BigInt(args.charges[0].amount) === near('0.14') && args.charges[0].member === P.er.id);
      return { id, out, addr, moved: byTo, args, host, settleTx: tx.hash };
    }

    const months = {};
    for (const month of [1, 2]) {
      await ctx.step(`MIDGE · month ${month}: the employer seals the pay run, the host pays one-time addresses and issues receipts`, async (s) => {
        const r = await midgeMonth(s, month); months[month] = r;
        // receipts: each person verifies their own
        const onChainOrder = r.args.aggregate_order_hash;
        s.assert(`month ${month}: the order hash on chain equals the one recomputed from the run id and the receipts root`, onChainOrder === payrunOrderHash(`run-${tag}-m${month}`, r.out.receiptsRoot));
        const checks = r.addr.map((a, i) => verifyStatement({ cipherHex: r.out.statements.payees[a].cipherHex, secretX25519: payeeKeys[i].secretX25519, hostSettlePublicKey: r.out.settlePublicKey, onChainOrderHash: onChainOrder }));
        s.assert(`(3) month ${month}: all four people verify their own receipt (decrypts, host signature, Merkle proof, order hash against the chain)`, checks.every((c) => c.ok), { actual: checks.map((c) => c.checks) });
        const mine = checks[0].receipt; s.assert(`(3) month ${month}: Alice\'s receipt shows gross 0.05, tax 0.0075, benefits 0.0025, net 0.04, and her net equals the transfer to her one-time address`, mine.net === '0.04' && mine.tax === '0.0075' && mine.benefits === '0.0025' && near(mine.net) === r.moved[r.addr[0]], { actual: mine });
        const doc = JSON.parse(openFromModel(r.out.statements.payees[r.addr[0]].cipherHex, payeeKeys[0].secretX25519)); doc.receipt.net = '0.05';
        s.assert(`(3) month ${month}: a receipt with the net changed to 0.05 fails verification`, verifyStatement({ cipherHex: sealToModel(JSON.stringify(doc), payeeKeys[0].publicKeyHex), secretX25519: payeeKeys[0].secretX25519, hostSettlePublicKey: r.out.settlePublicKey, onChainOrderHash: onChainOrder }).ok === false);
        // sub-transactions: the four tax lines sum to the one tax transfer; the auditor's totals match the chain
        const emp = JSON.parse(openFromModel(r.out.statements.employer.cipherHex, employerReadKey.secretX25519));
        const taxLines = emp.lines.filter((l) => l.receipt.kind === 'pay').reduce((x, l) => x + micro(l.receipt.tax), 0n);
        s.assert(`(3) month ${month}: the four tax lines in the employer\'s statement sum to the one tax transfer on chain (0.021)`, taxLines * 10n ** 18n === r.moved[P.tx.id], { actual: String(taxLines) });
        const aud = JSON.parse(openFromModel(r.out.statements.auditor.cipherHex, auditorKey.secretX25519));
        const netOnChain = r.addr.reduce((x, a) => x + r.moved[a], 0n);
        s.assert(`(3) month ${month}: the auditor\'s totals equal what the chain shows (net ${aud.net}, tax ${aud.tax}, benefits ${aud.benefits}, gross ${aud.gross}) and carry no name or address`, near(aud.net) === netOnChain && near(aud.tax) === r.moved[P.tx.id] && near(aud.benefits) === r.moved[P.bn.id] && near(aud.gross) === netOnChain + r.moved[P.tx.id] + r.moved[P.bn.id] && !JSON.stringify(aud).match(/Alice|a1\.|b1\./), { actual: aud });
      });
    }

    await ctx.step('MIDGE · what an observer can and cannot link across the two months', async (s) => {
      const peopleOf = (m) => months[m].addr.map((a) => ({ to: a, amount: months[m].moved[a] }));
      const m1 = peopleOf(1); const m2 = peopleOf(2);
      const byAddress = m1.filter((a) => m2.some((b) => b.to === a.to)).length;
      s.assert('(2) by address the observer links 0 of 4 payees across the months: every address is new', byAddress === 0, { actual: byAddress });
      const byAmount = m1.filter((a) => m2.filter((b) => b.amount === a.amount).length === 1).length;
      s.assert('(2) BY AMOUNT the observer links 4 of 4: the salaries are distinct and unchanged, so each month-1 amount matches exactly one month-2 payee', byAmount === 4, { actual: byAmount });
      const leaked = months[1].addr[0]; const leakedPay = months[1].moved[leaked]; const sameAmount = m2.filter((b) => b.amount === leakedPay);
      s.assert('(2) one leaked address (Alice\'s month-1 address) still exposes her month-2 pay: the observer finds the one month-2 address that received the same amount', sameAmount.length === 1 && sameAmount[0].to === months[2].addr[0], { actual: sameAmount.map((x) => x.to) });
      results.MIDGE = { linkedAcrossMonthsByAddress: byAddress, linkedAcrossMonthsByAmount: byAmount, of: 4, amountsReadable: true, gasTGas: +gas.MIDGE.toFixed(1) };
      s.observe('result', results.MIDGE); s.evidence('MIDGE', results.MIDGE);
    });

    await ctx.step('DEAD HOST · the host never signs: nothing is paid and the employer exits alone with the full deposit', async (s) => {
      const id = `pay-${tag}-dead`; created.push(id); const host = new HostedRoost({ provider }); const all = [P.a1.id, P.tx.id];
      s.assert('hatch', (await chain.send(coord.account, 'hatch', { syndicate_id: id, syndicate_type: 'FLASH', quorum_threshold: 1, max_spend_near: 1, enclave_public_key: host.settlePublicKey, expected_code_hash: crypto.randomBytes(32).toString('hex'), timeout_blocks: 16, payout_recipient: all[0], release_policy: policyFor(all) }, { deposit: near('0.01'), gas: 40000000000000n, label: `hatch ${id}` })).ok);
      await chain.waitFor(() => state(id), { what: 'syndicate' });
      s.assert('the employer deposits', (await chain.send(P.er.account, 'deposit', { syndicate_id: id, policy_hash: computePolicyHash(policyFor(all), 16) }, { deposit: near(DEPOSIT), gas: 30000000000000n, label: 'deposit' })).ok);
      await chain.waitFor(async () => BigInt((await state(id)).total_escrow) === near(DEPOSIT), { what: 'deposit' });
      await waitForTimer(id);
      const r = await chain.send(P.er.account, 'hatch_out', { syndicate_id: id }, { gas: 60000000000000n, label: 'exit' }); s.assert('the employer exits alone', r.ok, { actual: r.error });
      const back = (await chain.transfersOf(r.hash, P.er.id)).filter((m) => m.fromContract && m.to === P.er.id);
      s.assert('(5) the employer recovered the full 0.15', back.length === 1 && BigInt(back[0].amount) === near(DEPOSIT), { actual: back });
      results.DEAD = { recovered: true };
    });

    await ctx.step('the comparison, read from the measurements above', async (s) => {
      s.observe('results', results);
      s.assert('every path was measured', ['PUB', 'MIDGE', 'DEAD'].every((k) => results[k]));
      const ratio = +(gas.MIDGE / gas.PUB).toFixed(2);
      s.observe('gas, TGas for two pay runs: public / Midge (hatch, deposit and settlement per month)', [gas.PUB, gas.MIDGE].map((x) => +x.toFixed(1)));
      s.assert('(6) Midge uses between 3 and 20 times the gas of the public pay run', ratio >= 3 && ratio <= 20, { actual: ratio });
      s.evidence('comparison', results);
    });

    await ctx.step('teardown: prune the syndicates, delete the accounts', async (s) => {
      if (!P) { s.assert('nothing to tear down', true); return; }
      const rep = await teardownMembers(chain, { rootDir: ctx.rootDir, members: ids(), pruneIds: created });
      s.observe('teardown', { pruned: rep.pruned.length, notPruned: rep.notPruned, deleted: rep.deleted.length, kept: rep.kept, failed: rep.failed });
      s.assert('every account was deleted and every syndicate pruned', rep.failed.length === 0 && rep.kept.length === 0 && rep.notPruned.length === 0, { actual: rep });
      s.assert('the contract holds the records it started with', Number(await chain.view('get_syndicate_count', {})) === countBefore, { expected: countBefore });
    }, { always: true });
  },
};
