import { HostedRoost, payrunApprovalMessage } from '../../src/roost-service/hosted-roost.js';
import { generateClientKey, sealToModel, openFromModel } from '../../src/enclave/e2ee.js';
import { signInputWithNearKey, inputMessage, nearKeyPair } from '../../src/roost-service/signed-input.js';

const provider = { simulated: true, attest: async () => Buffer.from('lab-local-no-hardware'), info: async () => ({}) };
const ROUND = { contractId: 'c.near', syndicateId: 'pay', epoch: 1, roundNonce: 'ab'.repeat(32) };
const employer = nearKeyPair(); const approver = nearKeyPair(); const stranger = nearKeyPair();
const keyCheck = async (id, pk) => (id === 'er.near' && pk === employer.publicKey) || (id === 'ap.near' && pk === approver.publicKey) || (id === 'x.near' && pk === stranger.publicKey);
const payeeKeys = [0, 1, 2].map(() => generateClientKey());
const LINES = [['Alice', '0.05', '0.0075', '0.0025'], ['Bo', '0.04', '0.006', '0.002'], ['Cy', '0.03', '0.0045', '0.0015']].map(([person, gross, tax, benefits], i) => ({ payee: `p${i}.near`, person, invoiceId: `PAY-${i}`, period: '2026-11', gross, tax, benefits, payeeKey: payeeKeys[i].publicKeyHex }));
const read = generateClientKey(); const auditor = generateClientKey(); const approverRead = generateClientKey();
const base = { employer: 'er.near', taxAddress: 'tax.near', benefitsAddress: 'ben.near', employerKeyHex: read.publicKeyHex, auditorKeyHex: auditor.publicKeyHex, runId: 'run-1' };

const mk = () => { const r = new HostedRoost({ provider, requireSignedInputs: true, accountKeyCheck: keyCheck }); r.openRound(ROUND); return r; };
const submit = async (r) => { const cipherTextHex = sealToModel(JSON.stringify({ lines: LINES }), r.intentPublicKey); return r.submitSignedIntent({ flyerId: 'er.near', cipherTextHex, publicKey: employer.publicKey, signature: signInputWithNearKey(employer.secretKey, inputMessage({ ...ROUND, flyerId: 'er.near', seq: 1, cipherTextHex })), seq: 1 }); };
const sign = (r, out) => r.signSettlement({ ...ROUND, allocations: out.allocations, orderHash: out.orderHash, charges: out.charges });
const approve = (r, { who = 'ap.near', key = approver, orderHash, runId = 'run-1', round = ROUND } = {}) => r.approvePayrun({ runId, orderHash, approver: who, publicKey: key.publicKey, signature: signInputWithNearKey(key.secretKey, payrunApprovalMessage({ ...round, runId, orderHash })) });
const refused = async (fn, re) => { try { await fn(); return 'accepted'; } catch (e) { return re.test(e.message) ? true : e.message; } };

export default {
  id: 'E-PAYRUN-MAKER-CHECKER-01',
  title: 'Maker-checker for pay runs: a run that names an approver is not signed until that different account approves that exact run',
  tier: 'offline',
  requires: [],
  hypothesis: 'Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. Without an approver a pay run signs as before; with one, the room refuses to sign until the approver, a different account, signs an approval bound to the round, the run id and the order hash with a key that belongs to the approver\'s account; the approver\'s sealed summary matches the run; and approval and signing each happen once.',
  limits: ['Offline, on a local room with a simulated attestation provider and a stubbed account-key check. The contract does not check the approval; the room does.'],
  async run(ctx) {
    await ctx.step('without an approver nothing changes', async (s) => {
      const r = mk(); await submit(r); const out = r.runPayrun(base);
      s.assert('the run reports no approval needed', !out.outcome.approval);
      s.assert('and it signs as before', typeof sign(r, out).signature === 'string');
    });
    await ctx.step('with an approver, nothing is signed until the approval, and only the approver counts', async (s) => {
      const params = { ...base, approver: 'ap.near', approverKeyHex: approverRead.publicKeyHex };
      let r = mk(); await submit(r);
      s.assert('naming the employer as approver is refused', (await refused(async () => r.runPayrun({ ...params, approver: 'er.near' }), /approver.*differ|differ.*approver/i)) === true);
      r = mk(); await submit(r); const out = r.runPayrun(params);
      s.assert('the run says an approval is needed and by whom', out.outcome.approval?.required === true && out.outcome.approval?.approver === 'ap.near', { actual: out.outcome.approval });
      s.assert('signing before the approval is refused and names it', (await refused(async () => sign(r, out), /approv/i)) === true);
      const summary = JSON.parse(openFromModel(out.statements.approver.cipherHex, approverRead.secretX25519));
      s.assert('the approver\'s sealed summary carries the same order hash, headcount, totals and transfers', summary.orderHash === out.orderHash && summary.totals.headcount === 3 && summary.totals.gross === '0.12' && JSON.stringify(summary.allocations) === JSON.stringify(out.allocations), { actual: summary });
      s.assert('the summary does not open with another key', (await refused(async () => openFromModel(out.statements.approver.cipherHex, read.secretX25519), /./)) === true);
      s.assert('an approval signed by a stranger\'s key is refused', (await refused(() => approve(r, { key: stranger, orderHash: out.orderHash }), /not a key|signature/i)) === true);
      s.assert('an approval sent by the employer is refused', (await refused(() => approve(r, { who: 'er.near', key: employer, orderHash: out.orderHash }), /approver/i)) === true);
      s.assert('an approval for a different order hash is refused', (await refused(() => approve(r, { orderHash: 'cd'.repeat(32) }), /does not match the pay run/i)) === true);
      s.assert('an approval for a different run id is refused', (await refused(() => approve(r, { orderHash: out.orderHash, runId: 'run-2' }), /run/i)) === true);
      s.assert('an approval signed for another round is refused', (await refused(() => approve(r, { orderHash: out.orderHash, round: { ...ROUND, roundNonce: 'ef'.repeat(32) } }), /signature/i)) === true);
      s.assert('still nothing can be signed', (await refused(async () => sign(r, out), /approv/i)) === true);
      const ok = await approve(r, { orderHash: out.orderHash });
      s.assert('the approver\'s own approval is accepted', ok.approved === true && ok.orderHash === out.orderHash, { actual: ok });
      s.assert('a second approval is refused', (await refused(() => approve(r, { orderHash: out.orderHash }), /already/i)) === true);
      const signed = sign(r, out);
      s.assert('then the room signs, with the usual seven-field message', typeof signed.signature === 'string' && signed.message.split(':').length === 7);
      s.assert('and a second signature is refused', (await refused(async () => sign(r, out), /already been signed/)) === true);
    });
  },
};
