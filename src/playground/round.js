import crypto from 'node:crypto';
import { sealToModel, generateClientKey } from '../enclave/e2ee.js';
import { signInputWithNearKey, inputMessage } from '../roost-service/signed-input.js';
import { payrunApprovalMessage } from '../roost-service/hosted-roost.js';
import { computePolicyHash } from './chain.js';
import { validateLines, grossTotalMicro, PERIOD } from './defaults.js';

/**
 * One playground round, from the visitor's lines to a settlement and the cleanup behind it. It is the steps of the hardware experiment
 * E-HOSTED-PAYRUN-LIVE-04, run by a service instead of a script:
 *
 *   accounts, then a group whose room key is the room's settlement key, then the employer's deposit (exactly the gross total, so the group is
 *   Settled when the pay is released and can be pruned at once), then the sealed run, then the VISITOR's approval, then the room's signature
 *   and the settlement. Cleanup runs in the background after the result, or after a failure, and never deletes an account that still has
 *   escrow in a group.
 *
 * The visitor's account is created with the visitor's key alone. The service holds no key for it, so it is never deleted by the service.
 */
export class RoundError extends Error { constructor(message) { super(message); this.name = 'RoundError'; } }

const NEAR = 10n ** 24n;
const near = (micro) => micro * 10n ** 18n; // micro-NEAR to yoctoNEAR
const HEX64 = /^[0-9a-f]{64}$/;
const sleepFor = (ms) => new Promise((r) => setTimeout(r, ms));

export function createRound({ chain, room, keyCheck, ledger, prepare = null, onState = () => {}, approvalTimeoutMs = 10 * 60 * 1000, accountPrefix = (t) => `p${t.slice(0, 8)}`, sleep = sleepFor, log = () => {} }) {
  let ready = false;
  const live = new Map(); // ticket -> { state, detail, waiters, approval, abandoned }
  const cleanups = new Set();

  const setState = (ticket, state, detail = {}) => {
    const rec = live.get(ticket); if (!rec) return;
    rec.state = state; rec.detail = detail;
    onState(ticket, state, detail);
    for (const w of [...rec.waiters]) if (w.state === state) { rec.waiters.delete(w); w.resolve(detail); }
    if (state === 'failed') for (const w of rec.waiters) { rec.waiters.delete(w); w.reject(new RoundError(detail.reason)); }
  };

  // The room reads the chain through public RPC providers, which rate-limit (HTTP 429), and answers 503 when it could not read. Such a refusal is temporary and the
  // room keeps its queue, so the same call is made again after a short wait. Only a refusal the room itself says is a 429 or a 5xx is retried: a 400 (a real
  // refusal) and a dropped connection (where the room may already have taken the input) are not.
  // The room also answers 400 when a chain provider could not answer a key check or an escrow read ("could not check that ... could not answer", "could not read escrow"),
  // so its words count as well as its status. A real mismatch says "is not a key of" and is not temporary.
  const TEMPORARY = /roost \S+ answered (429|50[234]):|could not (check that|read escrow|answer)/i;
  // The public RPC providers can rate limit the room for a minute or more, as they did on 2026-11-14, so the wait grows by three seconds a try and stops growing at
  // fifteen: ten tries wait out about two minutes. A visitor sees "Sealing the run" for that long and still gets a round, instead of a failure.
  async function viaRoom(label, fn, { tries = 10, baseMs = 3000, capMs = 15000 } = {}) {
    for (let i = 0; ; i += 1) {
      try { return await fn(); } catch (e) {
        if (!TEMPORARY.test(String(e?.message))) throw e;
        if (i >= tries - 1) throw new RoundError('The public NEAR network is busy and the room could not read from it after ten tries. Nothing was paid. Please try again in a minute.');
        log(`${label}: ${String(e.message).slice(0, 140)}; trying again`);
        await sleep(Math.min(capMs, baseMs * (i + 1)));
      }
    }
  }

  async function cleanup({ groupId = null, employer = null, handles = [] }) {
    let employerSafe = true;
    if (groupId) {
      let g = await chain.view('get_syndicate', { syndicate_id: groupId }).catch(() => null);
      if (g && BigInt(g.total_escrow) > 0n) {
        if (employer) {
          for (let i = 0; i < 10; i += 1) { const r = await chain.send(employer.account, 'hatch_out', { syndicate_id: groupId }, { gas: 60_000_000_000_000n, label: `exit ${groupId}` }); if (r.ok) break; await sleep(4000); }
          g = await chain.view('get_syndicate', { syndicate_id: groupId }).catch(() => g);
        }
        if (BigInt(g.total_escrow) > 0n) employerSafe = false;
      }
      if (g) {
        let pruned = false;
        for (let i = 0; i < 6 && !pruned; i += 1) { const r = await chain.send(chain.funder, 'prune_syndicate', { syndicate_id: groupId }, { gas: 30_000_000_000_000n, label: `prune ${groupId}` }); pruned = r.ok; if (!pruned) await sleep(3000); }
        if (pruned) ledger.remove(groupId);
      } else ledger.remove(groupId);
    }
    for (const h of handles) {
      if (employer && h.id === employer.id && !employerSafe) continue;
      if (await chain.deleteAccount(h)) ledger.remove(h.id);
    }
  }
  const track = (p) => { cleanups.add(p); p.finally(() => cleanups.delete(p)).catch(() => {}); return p; };

  async function sweepStartup() {
    const rows = ledger.all();
    for (const r of rows.filter((x) => x.kind === 'group')) {
      try { await cleanup({ groupId: r.id, employer: r.employer ? chain.handleFor(r.employer) : null, handles: [] }); } catch (e) { log(`sweep: group ${r.id}: ${e.message}`); }
    }
    for (const r of ledger.all().filter((x) => x.kind === 'account')) {
      try { if (await chain.deleteAccount(chain.handleFor(r.id))) ledger.remove(r.id); } catch (e) { log(`sweep: account ${r.id}: ${e.message}`); }
    }
    ready = true;
  }

  /** Retries cleanups that did not finish (a ledger row older than `olderThanMs` that no running round owns). Called on a timer. */
  async function sweepStale({ olderThanMs = 15 * 60 * 1000 } = {}) {
    const cutoff = Date.now() - olderThanMs;
    const busyGroups = new Set([...live.values()].filter((r) => r.state && !['done', 'failed'].includes(r.state)).map((r) => r.groupId).filter(Boolean));
    const stale = ledger.all().filter((r) => Date.parse(r.at || 0) < cutoff && !busyGroups.has(r.id) && !busyGroups.has(r.group));
    for (const r of stale.filter((x) => x.kind === 'group')) {
      try { await cleanup({ groupId: r.id, employer: r.employer ? chain.handleFor(r.employer) : null, handles: [] }); } catch (e) { log(`stale group ${r.id}: ${e.message}`); }
    }
    for (const r of ledger.all().filter((x) => x.kind === 'account' && Date.parse(x.at || 0) < cutoff)) {
      try { if (await chain.deleteAccount(chain.handleFor(r.id))) ledger.remove(r.id); } catch (e) { log(`stale account ${r.id}: ${e.message}`); }
    }
  }

  async function run(ticket, { visitorPublicKey, payeeKeyHex, lines, youIndex }) {
    const rec = live.get(ticket);
    const tid = accountPrefix(ticket); const groupId = `pg-${ticket.slice(0, 10)}`; const runId = `run-${ticket.slice(0, 10)}`;
    const service = []; let employer = null; let groupId2 = null;
    const alive = () => { if (rec.abandoned) throw new RoundError('The round was abandoned.'); };
    try {
      // The room may be asleep: the page wakes it when it opens, which takes about 40 seconds, and a visitor can press Start sooner than that. Waiting here, before
      // anything is created, means a visitor who is quick waits a moment instead of failing, and a room that cannot be started fails the round with nothing to clean up.
      if (prepare) { setState(ticket, 'waking-room'); await prepare(); alive(); }
      setState(ticket, 'creating-accounts');
      const session = await room.getSession();
      const gross = grossTotalMicro(lines);
      const make = async (role, fundMicro, publicKey = null) => {
        alive();
        const r = await chain.createAccount({ prefix: `${tid}${role}`, publicKey, fundNear: (Number(fundMicro) / 1e6).toFixed(6) });
        if (!publicKey) { const h = { id: r.id, account: r.account }; service.push(h); ledger.add({ kind: 'account', id: r.id }); }
        return r;
      };
      // The employer pays the deposit and may have to pay for the exit call, which reserves 0.06 NEAR of gas (60 Tgas). It gets the deposit plus 0.15 NEAR, and
      // what is not used goes back to the funder when the account is deleted.
      const you = await make('v', 10_000n, visitorPublicKey);
      employer = null;
      const er = await make('er', gross + 150_000n); employer = service.find((h) => h.id === er.id);
      const bots = []; for (const k of [1, 2, 3]) bots.push(await make(`a${k}`, 3_000n));
      const tx = await make('tx', 3_000n); const bf = await make('bf', 3_000n);

      const employerKey = chain.derive(employer.id).keyPair;
      await chain.waitFor(() => keyCheck(employer.id, employerKey.getPublicKey().toString()), { timeoutMs: 90_000, what: `the chain providers to agree on the employer's key` });
      await chain.waitFor(() => keyCheck(you.id, visitorPublicKey), { timeoutMs: 90_000, what: `the chain providers to agree on your key` });

      alive(); setState(ticket, 'hatching');
      const policy = { allowed_recipients: [you.id, ...bots.map((b) => b.id), tx.id, bf.id], max_release_bps_per_epoch: 10000, settle_deadline_block: 500000000 };
      const hatch = await chain.send(chain.funder, 'hatch', { syndicate_id: groupId, syndicate_type: 'FLASH', quorum_threshold: 1, max_spend_near: 1, enclave_public_key: session.settlePublicKey, expected_code_hash: crypto.randomBytes(32).toString('hex'), timeout_blocks: 12, payout_recipient: tx.id, release_policy: policy }, { deposit: NEAR / 100n, gas: 40_000_000_000_000n, label: `hatch ${groupId}` });
      if (!hatch.ok) throw new RoundError(`The group could not be created: hatch failed (${hatch.error}).`);
      groupId2 = groupId; ledger.add({ kind: 'group', id: groupId, employer: employer.id });
      await chain.waitFor(() => chain.view('get_syndicate', { syndicate_id: groupId }), { what: 'the group to appear' });

      alive(); setState(ticket, 'depositing');
      const grossYocto = near(gross);
      const dep = await chain.send(employer.account, 'deposit', { syndicate_id: groupId, policy_hash: computePolicyHash(policy, 12) }, { deposit: grossYocto, gas: 30_000_000_000_000n, label: 'employer deposit' });
      if (!dep.ok) throw new RoundError(`The employer's deposit failed (${dep.error}).`);
      await chain.waitFor(async () => BigInt((await chain.view('get_syndicate', { syndicate_id: groupId })).total_escrow) === grossYocto, { what: 'the deposit' });
      // The room reads the employer's escrow at a finalised block. Asking it to run before the deposit is final makes it refuse with "cannot cover the gross pay".
      await chain.waitFor(async () => BigInt((await chain.viewFinal('get_syndicate', { syndicate_id: groupId })).total_escrow) === grossYocto, { timeoutMs: 120_000, everyMs: 2000, what: 'the deposit to be final' });

      alive(); setState(ticket, 'sealing');
      const st = await chain.view('get_syndicate', { syndicate_id: groupId });
      const round = { contractId: chain.contractId, syndicateId: groupId, epoch: Number(st.epoch), roundNonce: st.round_nonce };
      await room.openRound(round);
      const slots = [...bots.map((b) => b.id)]; slots.splice(youIndex, 0, you.id);
      const full = lines.map((l, i) => ({ payee: slots[i], person: l.person.trim(), invoiceId: `PAY-${i + 1}`, period: PERIOD, gross: l.gross, tax: l.tax, benefits: l.benefits, payeeKey: i === youIndex ? payeeKeyHex : generateClientKey().publicKeyHex }));
      const cipherTextHex = sealToModel(JSON.stringify({ lines: full }), session.intentPublicKey);
      await viaRoom('submit the run', () => room.submitSignedIntent({ flyerId: employer.id, cipherTextHex, publicKey: employerKey.getPublicKey().toString(), signature: signInputWithNearKey(employerKey.toString(), inputMessage({ ...round, flyerId: employer.id, seq: 1, cipherTextHex })), seq: 1 }));
      const out = await viaRoom('run the pay run', () => room.runPayrun({ employer: employer.id, taxAddress: tx.id, benefitsAddress: bf.id, employerKeyHex: generateClientKey().publicKeyHex, auditorKeyHex: generateClientKey().publicKeyHex, runId, requireInvoices: false, approver: you.id, approverKeyHex: payeeKeyHex }));

      const cast = [
        { role: 'you', name: lines[youIndex].person.trim(), id: you.id },
        { role: 'er', name: 'Employer', id: employer.id },
        ...bots.map((b, k) => ({ role: `a${k + 1}`, name: lines.filter((_, i) => i !== youIndex)[k].person.trim(), id: b.id })),
        { role: 'tx', name: 'Tax account', id: tx.id }, { role: 'bf', name: 'Benefits account', id: bf.id },
      ];
      const approvalMessage = payrunApprovalMessage({ ...round, runId, orderHash: out.orderHash });
      const approved = new Promise((resolve, reject) => { rec.approval = { resolve, reject, ctx: { runId, orderHash: out.orderHash, approver: you.id } }; });
      const timer = setTimeout(() => rec.approval?.reject(new RoundError('You did not approve in time, so the round was cancelled and its funds returned.')), approvalTimeoutMs);
      setState(ticket, 'awaiting-approval', { approvalMessage, summaryCipherHex: out.statements.approver.cipherHex, orderHash: out.orderHash, runId, round, approver: you.id, cast });
      try { await approved; } finally { clearTimeout(timer); rec.approval = null; }

      alive(); setState(ticket, 'settling');
      const signed = await room.signSettlement({ ...round, allocations: out.allocations, orderHash: out.orderHash, charges: out.charges });
      const tx2 = await chain.send(chain.funder, 'settle_batch_charged', { syndicate_id: groupId, attestation_nonce: round.roundNonce, aggregate_order_hash: out.orderHash, allocations: out.allocations, charges: out.charges, enclave_signature: signed.signature }, { gas: 150_000_000_000_000n, label: 'settlement' });
      if (!tx2.ok) throw new RoundError(`The settlement was refused by the contract (${tx2.error}).`);
      await chain.waitFor(async () => { const g = await chain.view('get_syndicate', { syndicate_id: groupId }); return !g.is_settling && BigInt(g.total_escrow) === 0n; }, { timeoutMs: 90_000, what: 'the settlement to finish' });
      const result = { settleTx: tx2.hash, orderHash: out.orderHash, runId, round, visitorAccount: you.id, payslipCipherHex: out.statements.payees[you.id].cipherHex, allocations: out.allocations, charged: out.charges[0].amount, cast, contractId: chain.contractId, settlerId: chain.funderId };
      setState(ticket, 'done', result);
      track(cleanup({ groupId: groupId2, employer, handles: service }));
      return result;
    } catch (e) {
      const reason = e instanceof RoundError ? e.message : e.message;
      setState(ticket, 'failed', { reason });
      track(cleanup({ groupId: groupId2, employer, handles: service }));
      throw e instanceof RoundError ? e : new RoundError(reason);
    }
  }

  return {
    sweepStartup, sweepStale,
    start({ ticket, visitorPublicKey, payeeKeyHex, lines, youIndex = 3 }) {
      if (!ready) return Promise.reject(new RoundError('The service is still finishing its start-up cleanup. Please try again in a minute.'));
      const check = validateLines(lines);
      if (!check.ok) return Promise.reject(new RoundError(check.problem));
      if (typeof visitorPublicKey !== 'string' || !/^ed25519:[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(visitorPublicKey)) return Promise.reject(new RoundError('Your public key is not a valid NEAR ed25519 key.'));
      if (!HEX64.test(String(payeeKeyHex))) return Promise.reject(new RoundError('Your payslip key must be 32 bytes of hex.'));
      if (!Number.isInteger(youIndex) || youIndex < 0 || youIndex > 3) return Promise.reject(new RoundError('Choose which of the four lines is yours.'));
      live.set(ticket, { state: null, detail: {}, waiters: new Set(), approval: null, abandoned: false });
      return run(ticket, { visitorPublicKey, payeeKeyHex, lines, youIndex });
    },
    async approve({ ticket, publicKey, signature }) {
      const rec = live.get(ticket);
      if (!rec || rec.state !== 'awaiting-approval' || !rec.approval) throw new RoundError('This round is not waiting for an approval.');
      const { runId, orderHash, approver } = rec.approval.ctx;
      await viaRoom('approve', () => room.approvePayrun({ runId, orderHash, approver, publicKey, signature }));
      rec.approval.resolve();
      return { approved: true };
    },
    abandon(ticket) { const rec = live.get(ticket); if (!rec) return; rec.abandoned = true; rec.approval?.reject(new RoundError('The round was abandoned.')); },
    status(ticket) { const rec = live.get(ticket); return rec ? { state: rec.state, detail: rec.detail } : null; },
    waitFor(ticket, state) {
      const rec = live.get(ticket); if (!rec) return Promise.reject(new Error('no such round'));
      if (rec.state === state) return Promise.resolve(rec.detail);
      return new Promise((resolve, reject) => rec.waiters.add({ state, resolve, reject }));
    },
    async idle() { await Promise.allSettled([...cleanups]); },
  };
}
