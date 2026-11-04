import crypto from 'node:crypto';
import { connect, fmt, near, computePolicyHash, loadEnvFile } from '../lib/near.js';
import { createMembers, teardownMembers } from '../lib/members.js';
import { expectedCodeHash } from '../lib/contract.js';
import { HostedRoost } from '../../src/roost-service/hosted-roost.js';
import { sealToModel } from '../../src/enclave/e2ee.js';
import { fetchVerifiedModelKey } from '../../src/enclave/attestation.js';
import { AttestedAdvisor, chooseAllocations, verifyAdviceRecord, formatMicro, parseMicro, proportionalSplit, microToYocto } from '../../src/advisor/attested-advisor.js';

const provider = { simulated: true, attest: async () => Buffer.from('lab-local-no-hardware'), info: async () => ({}) };

export default {
  id: 'E-ADVISOR-LIVE-01',
  title: 'The Roost, NEAR AI and the contract together: the attested model proposes the split, the Roost bounds it, the contract enforces it',
  tier: 'cloud',
  requires: ['nearai-key', 'near-key', 'network', 'dcap-qvl'],
  hypothesis: 'Members seal bids to a Roost that totals them exactly. The attested NEAR AI model (certificate chain verified, E2EE, signed receipt) is asked only how to split that total among the policy\'s recipients, and sees nothing else. What it proposes is validated, signed by the Roost only within the total, and paid by the contract only to the policy\'s recipients. The stored advice record verifies independently and its allocations match the allocations hash the contract logged. The failures that must NOT happen: a proposal pays more than the sealed bids total, or someone outside the policy; or an unreachable or misbehaving model stops the round.',
  limits: [
    'The model is told the total and the recipients\' weights. The total is revealed to NEAR AI Cloud (the attested model, not the operator), never an individual bid. If even the total must stay hidden, do not use an advisor.',
    'The Roost is a local HostedRoost with a simulated attestation provider: the Roost\'s hardware is E-HOSTED-LIVE-01. This tests how the pieces connect, not the TEE.',
    'The task has an exact answer (3:2:1 of 0.06), so the model\'s output can be checked. For a judgement call there is no exact answer; the bounds (total, recipients) still hold and the rest is the model\'s opinion, attested but not proven correct.',
    'Whether the model gets this task right is an observation (it is a probabilistic aggregator); the experiment asserts what happens either way.',
    'One operator controls every account. Testnet only.',
  ],
  async run(ctx) {
    const apiKey = loadEnvFile(ctx.rootDir).NEARAI_API_KEY || process.env.NEARAI_API_KEY;
    const chain = await connect(ctx.rootDir);
    const tag = Date.now().toString(36);
    const roost = new HostedRoost({ provider });
    const coord = chain.sub('c');
    const want = expectedCodeHash(ctx.rootDir);
    const created = [];
    let flyers; let rcpts; let countBefore; let proposal = null; let chosen = null;
    const state = (id) => chain.view('get_syndicate', { syndicate_id: id });
    const policy = () => ({ allowed_recipients: rcpts.map((r) => r.id), max_release_bps_per_epoch: 10000, settle_deadline_block: 500000000 });
    const hatch = (id) => { created.push(id); return chain.send(coord.account, 'hatch', { syndicate_id: id, syndicate_type: 'FLASH', quorum_threshold: 1, max_spend_near: 1, enclave_public_key: roost.settlePublicKey, expected_code_hash: crypto.randomBytes(32).toString('hex'), timeout_blocks: 50, payout_recipient: rcpts[0].id, release_policy: policy() }, { deposit: near('0.01'), gas: 40000000000000n, label: `hatch ${id}` }); };
    const deposit = (f, id, amt) => chain.send(f.account, 'deposit', { syndicate_id: id, policy_hash: computePolicyHash(policy()) }, { deposit: near(amt), gas: 30000000000000n, label: `deposit ${f.id} -> ${id}` });
    const bidAndAggregate = (members, amountEach, label) => { for (const m of members) roost.submitSealedIntent({ flyerId: m.id, cipherTextHex: sealToModel(JSON.stringify({ amount: amountEach }), roost.intentPublicKey) }); return roost.aggregateAndClear({ roundId: `${tag}-${label}` }); };
    const settle = async (id, allocations, agg) => {
      const st = await state(id);
      const signed = roost.signSettlement({ contractId: chain.coordinatorId, syndicateId: id, epoch: Number(st.epoch), roundNonce: st.round_nonce, allocations, orderHash: agg.orderHash });
      const tx = await chain.send(coord.account, 'settle_batch', { syndicate_id: id, attestation_nonce: st.round_nonce, aggregate_order_hash: agg.orderHash, allocations, enclave_signature: signed.signature }, { gas: 100000000000000n, label: `settle_batch ${id}` });
      return { tx, signed };
    };
    /** The allocations hash the CONTRACT logged for a settlement, read from the transaction's own receipts. */
    const loggedAllocationsHash = async (hash) => {
      const r = await (await fetch('https://archival-rpc.testnet.fastnear.com', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'EXPERIMENTAL_tx_status', params: [hash, chain.coordinatorId] }) })).json();
      for (const o of r.result?.receipts_outcome || []) for (const l of o.outcome?.logs || []) { const m = l.match(/"event":"syndicate_settled".*?"allocations_hash":"([0-9a-f]{64})"/); if (m) return m[1]; }
      return null;
    };

    await ctx.step('set up: two flyers, three recipients, a Roost, and a syndicate whose policy lists exactly those recipients', async (s) => {
      countBefore = Number(await chain.view('get_syndicate_count', {}));
      const hash = await chain.codeHash();
      s.assert(`the deployed contract is the build expected from ${want.source}`, hash === want.hash, { expected: want.hash, actual: hash });
      const made = await createMembers(chain, { rootDir: ctx.rootDir, tag: `v${tag.slice(-5)}`, count: 5, fundNear: '0.12', names: ['a', 'b', 'r', 's', 't'] });
      flyers = made.slice(0, 2); rcpts = made.slice(2);
      s.assert('hatch syndicate #1', (await hatch(`adv-${tag}-1`)).ok);
      await chain.waitFor(() => state(`adv-${tag}-1`), { what: 'syndicate 1' });
      for (const f of flyers) s.assert(`${f.id} deposits 0.03`, (await deposit(f, `adv-${tag}-1`, '0.03')).ok);
      await chain.waitFor(async () => BigInt((await state(`adv-${tag}-1`)).total_escrow) === near('0.06'), { what: 'escrow 0.06' });
    }, { critical: true });

    let agg1;
    await ctx.step('the Roost totals the sealed bids exactly; that total is all the model is told', async (s) => {
      agg1 = bidAndAggregate(flyers, '0.03', 'one');
      s.assert('the Roost\'s total is exactly 0.06', agg1.aggregateOrder.totalInputAmount === '0.06' && agg1.aggregateOrder.flyerCount === 2, { actual: agg1.aggregateOrder });
    }, { critical: true });

    await ctx.step('the attested model proposes a 3:2:1 split among the recipients (live, certificate chain required)', async (s) => {
      const advisor = new AttestedAdvisor({ apiKey, chain: 'required' });
      const recipients = [{ id: rcpts[0].id, weight: 3 }, { id: rcpts[1].id, weight: 2 }, { id: rcpts[2].id, weight: 1 }];
      proposal = await advisor.proposeAllocation({ totalNear: agg1.aggregateOrder.totalInputAmount, recipients, onError: 'fallback' });
      if (!proposal.record) { s.observe('the model could not be used', proposal.error); s.assert('the model failed and the round continues on the exact rule (an observation: the model is probabilistic and remote)', true); chosen = chooseAllocations(proposal, { requireRule: true }); s.assert('what is settled is the exact rule', chosen.source === 'fallback' && chosen.allocations.length === 3); return; }
      const r = proposal.record;
      s.observe('model', { model: r.model, tcbStatus: r.tcbStatus, signer: r.signature.signing_address.slice(0, 16) });
      s.observe('what the model answered', r.plaintext.slice(0, 400));
      s.assert('the model\'s attestation checks all passed', r.attestationChecks.length > 0 && r.attestationChecks.every((c) => c.ok), { actual: r.attestationChecks });
      s.assert('the receipt verifies: hashes, the model\'s signature, the signer being the attested key', (await verifyAdviceRecord(r, { onChainAllocationsHash: '0'.repeat(64) })).checks.slice(0, 5).every((c) => c.ok));
      s.observe('the proposal is valid', proposal.validation.ok ? 'yes' : `no: ${proposal.validation.problems.join('; ')}`);
      s.observe('the proposal equals the rule 3:2:1', proposal.sameAsRule ? 'yes' : 'no');
      chosen = chooseAllocations(proposal, { requireRule: true });
      s.observe('what will be settled', { source: chosen.source, reason: chosen.reason });
      s.assert('whatever the model said, what is settled is a valid split of exactly the rule', chosen.allocations.length === 3 && chosen.allocations.map((a) => a.amount).join() === proportionalSplit(parseMicro('0.06'), recipients).map((x) => microToYocto(x.micro)).join(), { actual: chosen });
    }, { critical: true });

    await ctx.step('the Roost signs within the total and the contract pays the recipients exactly', async (s) => {
      const { tx, signed } = await settle(`adv-${tag}-1`, chosen.allocations, agg1);
      s.evidence('tx', { label: tx.label, hash: tx.hash, ok: tx.ok, explorer: tx.explorer, error: tx.error });
      s.assert('settle_batch succeeded', tx.ok, { actual: tx.error });
      await chain.waitFor(async () => /settled/i.test(String((await state(`adv-${tag}-1`)).status)), { what: 'Settled' });
      const moves = await chain.waitFor(async () => { const t = await chain.transfersOf(tx.hash, chain.coordinatorId); return t.filter((x) => x.fromContract).length >= 3 ? t : null; }, { what: 'receipts', timeoutMs: 60000 });
      const paid = moves.filter((m) => m.fromContract);
      const byTo = Object.fromEntries(paid.map((m) => [m.to, m.amount]));
      s.assert('the contract paid exactly 0.03, 0.02 and 0.01 NEAR to the three recipients and nobody else', paid.length === 3 && rcpts.every((r, i) => byTo[r.id] === ['30000000000000000000000', '20000000000000000000000', '10000000000000000000000'][i]), { actual: byTo });
      const logged = await loggedAllocationsHash(tx.hash);
      s.assert('the contract logged an allocations hash for the settlement', Boolean(logged));
      s.assert('it equals the hash the Roost signed', logged === signed.allocationsHash, { expected: signed.allocationsHash, actual: logged });
      if (chosen.source === 'model') {
        const rep = await verifyAdviceRecord(proposal.record, { onChainAllocationsHash: logged, freshAttestation: () => fetchVerifiedModelKey({ model: proposal.record.model, apiKey, chain: 'required' }) });
        for (const c of rep.checks) s.assert(`advice record: ${c.name}`, c.ok, { actual: c.detail });
        // Stored so that anyone can re-verify it from the run log alone: node scripts/verify-advice.mjs <run dir>
        s.evidence('advice-record', { record: proposal.record, onChainAllocationsHash: logged, settleTx: tx.hash, explorer: tx.explorer, contract: chain.coordinatorId });
        const forged = JSON.parse(JSON.stringify(proposal.record)); forged.plaintext = forged.plaintext.replace(/0\.0\d{4}/, '0.049999');
        s.assert('editing the stored advice afterwards is detected', !(await verifyAdviceRecord(forged, { onChainAllocationsHash: logged })).ok);
      } else s.note(`the model's answer was not used (${chosen.reason}); the exact rule was settled, so there is no model record to tie to the chain`);
    }, { critical: true });

    await ctx.step('a compromised or lying advisor cannot exceed the bounds (syndicate #2 holds 0.04)', async (s) => {
      const id = `adv-${tag}-2`;
      s.assert('hatch syndicate #2', (await hatch(id)).ok);
      await chain.waitFor(() => state(id), { what: 'syndicate 2' });
      s.assert('flyer a deposits 0.04', (await deposit(flyers[0], id, '0.04')).ok);
      await chain.waitFor(async () => BigInt((await state(id)).total_escrow) === near('0.04'), { what: 'escrow 0.04' });
      const agg2 = bidAndAggregate([flyers[0]], '0.04', 'two');
      const st = await state(id);
      const sign = (allocs) => { try { return roost.signSettlement({ contractId: chain.coordinatorId, syndicateId: id, epoch: Number(st.epoch), roundNonce: st.round_nonce, allocations: allocs, orderHash: agg2.orderHash }); } catch (e) { return { error: e.message }; } };
      const over = sign([{ recipient: rcpts[0].id, amount: String(near('0.03')) }, { recipient: rcpts[1].id, amount: String(near('0.03')) }]);
      s.assert('a split of 0.06 from a 0.04 total: the Roost refuses to sign (validator bypassed on purpose)', /exceed what the sealed bids support/.test(over.error || ''), { actual: over });
      const thief = await chain.sub(`thief${tag.slice(-4)}`).id;
      const stolen = sign([{ recipient: thief, amount: String(near('0.04')) }]);
      s.assert('a split to an account outside the policy: the Roost does not know the policy and signs', Boolean(stolen.signature));
      const tx = await chain.send(coord.account, 'settle_batch', { syndicate_id: id, attestation_nonce: st.round_nonce, aggregate_order_hash: agg2.orderHash, allocations: [{ recipient: thief, amount: String(near('0.04')) }], enclave_signature: stolen.signature }, { gas: 100000000000000n, label: `LYING-ADVICE settle_batch ${id}` });
      s.evidence('tx', { label: tx.label, hash: tx.hash, ok: tx.ok, explorer: tx.explorer, error: tx.error });
      s.assert('the contract rejects it: the recipient is not in the release policy', !tx.ok && /whitelist/i.test(tx.error || ''), { actual: tx.error });
      const after = await state(id);
      s.assert('the syndicate is still active with its 0.04 intact', /active/i.test(String(after.status)) && BigInt(after.total_escrow) === near('0.04'), { actual: after.status });
    });

    await ctx.step('an unreachable model delays nothing: the round settles on the exact rule', async (s) => {
      const id = `adv-${tag}-2`;
      const down = new AttestedAdvisor({ apiKey, baseUrl: 'http://127.0.0.1:9', chain: 'skip' });
      let err = null; try { await down.proposeAllocation({ totalNear: '0.04', recipients: [{ id: rcpts[0].id, weight: 1 }, { id: rcpts[1].id, weight: 1 }] }); } catch (e) { err = e.message; }
      s.assert('asking an unreachable gateway fails', Boolean(err), { actual: err });
      const rule = proportionalSplit(parseMicro('0.04'), [{ id: rcpts[0].id, weight: 1 }, { id: rcpts[1].id, weight: 1 }]).map((x) => ({ recipient: x.recipient, amount: microToYocto(x.micro) }));
      const agg3 = bidAndAggregate([flyers[0]], '0.04', 'three');
      const { tx } = await settle(id, rule, agg3);
      s.assert('the round settled on the exact rule (0.02 and 0.02) without the model', tx.ok, { actual: tx.error });
      await chain.waitFor(async () => /settled/i.test(String((await state(id)).status)), { what: 'Settled #2' });
    });

    await ctx.step('teardown: prune the syndicates, compact, delete the accounts', async (s) => {
      const rep = await teardownMembers(chain, { rootDir: ctx.rootDir, members: [...(flyers || []), ...(rcpts || [])], pruneIds: created });
      s.observe('teardown', { pruned: rep.pruned.length, notPruned: rep.notPruned, deleted: rep.deleted.length, kept: rep.kept, failed: rep.failed });
      s.assert('every account was deleted and every syndicate pruned', rep.failed.length === 0 && rep.kept.length === 0 && rep.notPruned.length === 0, { actual: rep });
      s.assert('the contract holds the records it started with', Number(await chain.view('get_syndicate_count', {})) === countBefore, { expected: countBefore });
    }, { always: true });
  },
};
