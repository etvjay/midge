import { generateClientKey } from '../enclave/e2ee.js';
import { nearKeyPair, verifyNearSignature } from '../roost-service/signed-input.js';
import { payrunApprovalMessage } from '../roost-service/hosted-roost.js';

/**
 * Stand-ins for the chain and the room, with just enough behaviour for the round: the contract's hatch, deposit, settle, exit and prune rules, and a room that
 * refuses to sign until the approver has approved the exact run. They are used by the unit tests and by the offline experiment E-PLAYGROUND-SERVICE-01.
 */
export const FUNDER = 'play.f.testnet';
export const NEAR = 10n ** 24n;

// A fake chain with just the contract behaviour the round depends on: hatch, deposit, settle, exit, prune, and accounts that can be created and deleted.
export function fakeChain({ failOn = null } = {}) {
  const accounts = new Map(); const groups = new Map(); const sent = [];
  const chain = {
    contractId: 'c.f.testnet', funderId: FUNDER, funder: { accountId: FUNDER }, accounts, groups, sent,
    accountIdFor: (p) => `${p}.${FUNDER}`,
    keys: new Map(),
    derive: (id) => { if (!chain.keys.has(id)) { const k = nearKeyPair(); chain.keys.set(id, { keyPair: { toString: () => k.secretKey, getPublicKey: () => ({ toString: () => k.publicKey }) }, publicKey: k.publicKey }); } return chain.keys.get(id); },
    handleFor: (id) => ({ id, account: { accountId: id }, keyPair: chain.derive(id).keyPair }),
    async createAccount({ prefix, publicKey }) { const id = `${prefix}.${FUNDER}`; accounts.set(id, { publicKey }); return { id, account: publicKey ? null : { accountId: id } }; },
    async deleteAccount(h) { accounts.delete(h.id); return true; },
    async exists(id) { return accounts.has(id); },
    async view(method, args) {
      if (method !== 'get_syndicate') throw new Error(`fake chain has no ${method}`);
      const g = groups.get(args.syndicate_id); if (!g) return null;
      return { epoch: g.epoch, round_nonce: g.nonce, total_escrow: String(g.escrow), is_settling: false, status: g.status };
    },
    async waitFor(fn) { for (let i = 0; i < 5; i += 1) { const v = await fn(); if (v) return v; } throw new Error('timed out'); },
    async send(account, method, args, { deposit = 0n } = {}) {
      sent.push({ from: account.accountId, method, args });
      if (failOn === method) return { ok: false, hash: null, error: `${method} failed` };
      if (method === 'hatch') { groups.set(args.syndicate_id, { epoch: 0, nonce: 'n0', escrow: 0n, status: 'Active', employer: null }); return { ok: true, hash: 'H-hatch' }; }
      if (method === 'deposit') { const g = groups.get(args.syndicate_id); g.escrow += deposit; g.employer = account.accountId; return { ok: true, hash: 'H-dep' }; }
      if (method === 'settle_batch_charged') { const g = groups.get(args.syndicate_id); g.escrow -= args.allocations.reduce((a, x) => a + BigInt(x.amount), 0n); if (g.escrow === 0n) g.status = 'Settled'; return { ok: true, hash: 'H-settle' }; }
      if (method === 'hatch_out') { const g = groups.get(args.syndicate_id); g.escrow = 0n; g.status = 'AbortedRefunded'; return { ok: true, hash: 'H-out' }; }
      if (method === 'prune_syndicate') { const g = groups.get(args.syndicate_id); if (!['Settled', 'AbortedRefunded'].includes(g.status)) return { ok: false, error: 'not finished' }; groups.delete(args.syndicate_id); return { ok: true, hash: 'H-prune' }; }
      return { ok: true, hash: 'H-other' };
    },
  };
  return chain;
}

export function fakeRoom({ refuseApproval = false, accountKeyCheck = null } = {}) {
  const intent = generateClientKey(); const calls = [];
  let approved = false; let current = null; let openRound = null;
  return {
    calls,
    async getSession() { return { intentPublicKey: intent.publicKeyHex, settlePublicKey: 'ee'.repeat(32) }; },
    async openRound(r) { calls.push(['openRound', r]); openRound = r; return r; },
    async submitSignedIntent(p) { calls.push(['submit', p.flyerId]); return { accepted: true }; },
    async runPayrun(p) {
      calls.push(['runPayrun', p]); approved = false;
      // The pay run releases exactly the gross total (0.18), which is what the employer deposited, so the group ends Settled.
      const allocations = [{ recipient: p.taxAddress, amount: String(13n * NEAR / 100n) }, { recipient: p.approver, amount: String(5n * NEAR / 100n) }];
      current = { orderHash: 'ab'.repeat(32), allocations, charges: [{ member: p.employer, amount: String(18n * NEAR / 100n) }] };
      return { outcome: { approval: { required: true, approver: p.approver } }, ...current, statements: { payees: Object.fromEntries(p.__payees.map((a) => [a, { cipherHex: `slip-${a}` }])), approver: { cipherHex: 'summary-cipher' } } };
    },
    // Like the real room: the approval must be signed by the approver's key over the message bound to this round, run and order hash.
    async approvePayrun(p) {
      calls.push(['approve', p]);
      const refuse = (why) => { throw new Error(`roost /payrun/approve answered 400: ${why}`); };
      if (refuseApproval) refuse('the approval does not match the pay run waiting for approval');
      if (p.orderHash !== current.orderHash) refuse('the approval does not match the pay run waiting for approval');
      const message = payrunApprovalMessage({ ...openRound, runId: p.runId, orderHash: p.orderHash });
      if (!verifyNearSignature(p.publicKey, message, p.signature)) refuse('the approval signature does not verify');
      if (accountKeyCheck && !(await accountKeyCheck(p.approver, p.publicKey))) refuse(`${p.publicKey} is not a key of ${p.approver}`);
      approved = true; return { approved: true };
    },
    async signSettlement() { calls.push(['sign']); if (!approved) throw new Error('this pay run needs its approver\'s sign-off'); return { signature: 'sig' }; },
  };
}

