import crypto from 'node:crypto';
import { FlyChainClient } from '../../src/chain/client.js';

// GAP-025 and the side-agent note of 2026-11-07: a deposit is consent to a group's terms. If a client copies the hash from the
// contract, the check always passes, so a depositor consents to whatever the owner chose. This experiment drives the real client
// against a stubbed chain and records the hash it would submit.
//
// Predictions, written before the first run:
//  1. Called with neither a hash nor terms, deposit() throws and submits nothing.
//  2. Called with terms equal to the group's, it submits the hash IT computed from those terms (v2 for a new group), not one read from the contract.
//  3. Called with a timer, cap, deadline or recipient different from the group's, it throws naming the difference and submits nothing.
//  4. For a group whose stored hash is the old formula (timer_in_consent_hash false), it submits the old-formula hash of the stated terms.
//  5. If the contract's stored hash were wrong (does not equal the hash of its own terms), a client that computes from terms submits a hash that differs from it, so the contract would refuse.
const NEAR_ACCOUNT = 'depositor.testnet';
const terms = (o = {}) => ({ allowed_recipients: ['r.testnet'], max_release_bps_per_epoch: 2500, settle_deadline_block: 1000000, timeout_blocks: 30, timer_in_consent_hash: true, policy_hash: 'stored-by-the-contract', ...o });

function clientWith(group) {
  const c = new FlyChainClient({ accountId: NEAR_ACCOUNT, privateKey: 'ed25519:' + '1'.repeat(88), contractId: 'c.test' });
  const sent = [];
  c.account = { signAndSendTransaction: async (tx) => { sent.push(tx); return { transaction_outcome: { id: 'tx' } }; } };
  c.callView = async (method) => (method === 'get_policy_terms' ? group : method === 'get_policy_hash' ? group?.policy_hash : null);
  c.sent = sent;
  return c;
}
const argsOf = (tx) => JSON.parse(Buffer.from(tx.actions[0].functionCall.args).toString());
const STATED = { allowedRecipients: ['r.testnet'], maxReleaseBps: 2500, settleDeadlineBlock: 1000000, timeoutBlocks: 30 };

export default {
  id: 'E-DEPOSIT-CONSENT-01',
  title: 'A deposit consents to terms the depositor states; the client never copies the hash from the contract',
  tier: 'offline',
  requires: [],
  hypothesis: 'The chain client submits a deposit only with a hash computed from terms the caller stated, refuses when the group differs, and never echoes the contract\'s own stored hash. The failure that must not happen: a deposit that consents to a 10-block timer because the client asked the contract for its hash.',
  limits: ['Offline against a stubbed chain: it checks what the client would submit, not that the contract refuses it (the contract side is in the Rust tests and the testnet check). The MCP tool, API and SDK are exercised through the same client method.', 'Run by one operator on 2026-11-07.'],
  async run(ctx) {
    await ctx.step('no hash and no terms: refused, nothing submitted', async (s) => {
      const c = clientWith(terms());
      let err = null;
      try { await c.deposit({ syndicateId: 'g', amountNear: '0.02' }); } catch (e) { err = e; }
      s.assert('deposit() throws', Boolean(err), { actual: err?.message });
      s.assert('the message tells the caller to state the terms and says it will not copy the contract\'s hash', /state them/.test(err?.message || '') && /will not copy/.test(err?.message || ''), { actual: err?.message });
      s.assert('nothing was submitted', c.sent.length === 0, { actual: c.sent.length });
    });
    await ctx.step('stated terms equal to the group\'s: submits the hash the client computed', async (s) => {
      const c = clientWith(terms());
      await c.deposit({ syndicateId: 'g', amountNear: '0.02', expect: STATED });
      const sent = argsOf(c.sent[0]).policy_hash;
      const expected = c.computePolicyHash({ allowed_recipients: ['r.testnet'], max_release_bps_per_epoch: 2500, settle_deadline_block: 1000000 }, 30);
      s.assert('one transaction was submitted', c.sent.length === 1, { actual: c.sent.length });
      s.assert('its hash is the version-2 hash of the stated terms', sent === expected, { expected, actual: sent });
      s.assert('it is not the hash the contract stored', sent !== 'stored-by-the-contract', { actual: sent });
      const independent = crypto.createHash('sha256').update('release_policy:v2:r.testnet:2500:1000000:30', 'utf8').digest('hex'); // spelled out here, not by the function under test
      s.assert('it equals a hash spelled out independently, so the timer really is in the string', sent === independent, { expected: independent, actual: sent });
      s.assert('and the version-2 hash differs from the old formula, so the timer is in it', sent !== c.legacyPolicyHash({ allowed_recipients: ['r.testnet'], max_release_bps_per_epoch: 2500, settle_deadline_block: 1000000 }));
    });
    await ctx.step('terms that differ from the group\'s: refused, naming what differs', async (s) => {
      for (const [what, stated, pattern] of [
        ['timer', { ...STATED, timeoutBlocks: 300 }, /exit timer: you expected 300 blocks, the group has 30/],
        ['cap', { ...STATED, maxReleaseBps: 10000 }, /release cap: you expected 10000 bps, the group has 2500/],
        ['deadline', { ...STATED, settleDeadlineBlock: 5 }, /settle deadline/],
        ['recipient', { ...STATED, allowedRecipients: ['other.testnet'] }, /recipients: you expected \[other.testnet\]/],
      ]) {
        const c = clientWith(terms());
        let err = null;
        try { await c.deposit({ syndicateId: 'g', amountNear: '0.02', expect: stated }); } catch (e) { err = e; }
        s.assert(`a different ${what} is refused and named`, Boolean(err) && pattern.test(err.message), { actual: err?.message });
        s.assert(`nothing is submitted for a different ${what}`, c.sent.length === 0, { actual: c.sent.length });
      }
    });
    await ctx.step('a group opened before GAP-025: the old-formula hash of the stated terms', async (s) => {
      const c = clientWith(terms({ timer_in_consent_hash: false }));
      await c.deposit({ syndicateId: 'g', amountNear: '0.02', expect: STATED });
      const sent = argsOf(c.sent[0]).policy_hash;
      s.assert('it submits the version-1 hash', sent === c.legacyPolicyHash({ allowed_recipients: ['r.testnet'], max_release_bps_per_epoch: 2500, settle_deadline_block: 1000000 }), { actual: sent });
    });
    await ctx.step('a contract whose stored hash is wrong: the computed hash would not match it', async (s) => {
      const c = clientWith(terms({ policy_hash: 'a-hash-the-owner-swapped-in' }));
      await c.deposit({ syndicateId: 'g', amountNear: '0.02', expect: STATED });
      s.assert('the client submitted its own hash, which differs from the stored one, so the contract would refuse', argsOf(c.sent[0]).policy_hash !== 'a-hash-the-owner-swapped-in');
    });
    await ctx.step('a hash the caller computed itself is passed through unchanged', async (s) => {
      const c = clientWith(terms());
      await c.deposit({ syndicateId: 'g', amountNear: '0.02', policyHash: 'caller-computed' });
      s.assert('submitted as given', argsOf(c.sent[0]).policy_hash === 'caller-computed');
    });
    await ctx.step('computePolicyHash needs the timer', async (s) => {
      const c = clientWith(terms());
      let err = null; try { c.computePolicyHash({ allowed_recipients: ['r'], max_release_bps_per_epoch: 1, settle_deadline_block: 1 }); } catch (e) { err = e; }
      s.assert('calling it without a timer throws', Boolean(err), { actual: err?.message });
    });
  },
};
