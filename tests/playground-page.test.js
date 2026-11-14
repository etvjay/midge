import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, reduce, canReview, canStart, runKey, PRESETS, lineProblems } from '../site/src/playground-state.js';

test('the run starts as the clean four-person run, and the planted preset removes Cy\'s tax', () => {
  const s = initialState();
  assert.equal(s.lines.length, 4); assert.equal(s.lines[2].person, 'Cy');
  const planted = reduce(s, { type: 'preset', name: 'planted' });
  assert.equal(planted.lines[2].tax, '0'); assert.equal(PRESETS.clean().lines, undefined);
  assert.equal(reduce(planted, { type: 'preset', name: 'clean' }).lines[2].tax, '0.0045');
});

test('a review opens the start button for exactly those lines, and any edit closes it again', () => {
  let s = initialState();
  assert.equal(canReview(s), true); assert.equal(canStart(s), false, 'not reviewed yet');
  s = reduce(s, { type: 'review-done', review: { used: true, findings: [] } });
  assert.equal(canStart(s), true);
  const edited = reduce(s, { type: 'edit', index: 0, field: 'gross', value: '0.051' });
  assert.equal(canStart(edited), false); assert.equal(edited.review, null, 'the old review no longer describes this run');
  assert.equal(edited.lines[0].gross, '0.051');
  const back = reduce(edited, { type: 'edit', index: 0, field: 'gross', value: '0.05' });
  assert.equal(canStart(back), false, 'putting the value back does not bring an old review back; the review is asked for again');
});

test('a review that was not used does not open the start button', () => {
  const s = reduce(initialState(), { type: 'review-done', review: { used: false, reason: 'the model did not answer' } });
  assert.equal(canStart(s), false); assert.equal(s.reviewError, 'the model did not answer');
});

test('the name is yours: only the last line\'s name is editable, and bad amounts are reported before anything is sent', () => {
  let s = initialState();
  assert.equal(reduce(s, { type: 'edit', index: 0, field: 'person', value: 'Mallory' }).lines[0].person, 'Alice', 'the other three names are fixed');
  assert.equal(reduce(s, { type: 'edit', index: 3, field: 'person', value: 'Dana' }).lines[3].person, 'Dana');
  s = reduce(s, { type: 'edit', index: 1, field: 'gross', value: '9' });
  assert.match(lineProblems(s.lines).join(' '), /gross/i); assert.equal(canReview(s), false);
});

test('a round that the service refuses keeps the visitor\'s edits and shows the reason', () => {
  let s = reduce(initialState(), { type: 'review-done', review: { used: true, findings: [] } });
  s = reduce(s, { type: 'round-refused', reason: 'The line is full right now. Please try again in a few minutes.' });
  assert.equal(s.step, 'run'); assert.match(s.error, /line is full/); assert.equal(s.lines[0].person, 'Alice'); assert.equal(canStart(s), true, 'the review still stands, so they can try again');
});

test('the round moves through the service\'s steps and ends with the result', () => {
  let s = reduce(initialState(), { type: 'review-done', review: { used: true, findings: [] } });
  s = reduce(s, { type: 'round-started', ticket: 't1' });
  assert.equal(s.step, 'round'); assert.equal(s.ticket, 't1');
  s = reduce(s, { type: 'round-state', state: { step: 'waiting', position: 2, etaSeconds: 90, detail: {} } });
  assert.equal(s.round.step, 'waiting'); assert.equal(s.round.position, 2);
  s = reduce(s, { type: 'round-state', state: { step: 'awaiting-approval', detail: { approvalMessage: 'm', orderHash: 'h' } } });
  assert.equal(s.round.detail.approvalMessage, 'm');
  s = reduce(s, { type: 'round-state', state: { step: 'done', detail: { settleTx: 'T', visitorAccount: 'v.t' } } });
  assert.equal(s.step, 'settled'); assert.equal(s.result.settleTx, 'T');
  assert.equal(reduce(s, { type: 'show-payslip' }).step, 'payslip');
  assert.equal(reduce(s, { type: 'restart' }).step, 'run');
});

test('a failed round shows its reason and lets the visitor start again with the same edits', () => {
  let s = reduce(initialState(), { type: 'review-done', review: { used: true, findings: [] } });
  s = reduce(s, { type: 'round-started', ticket: 't1' });
  s = reduce(s, { type: 'round-state', state: { step: 'failed', detail: { reason: 'The group could not be created.' } } });
  assert.equal(s.step, 'run'); assert.match(s.error, /could not be created/); assert.equal(s.ticket, null);
});

test('the run key changes with every value the model judged and with nothing else', () => {
  const a = initialState().lines; const b = a.map((l) => ({ ...l }));
  assert.equal(runKey(a), runKey(b));
  b[2].tax = '0'; assert.notEqual(runKey(a), runKey(b));
});

// ---- the approval message is built by the page, never taken from the service ----
import { approvalToSign, APPROVAL_DOMAIN } from '../site/src/playground-state.js';
import { payrunApprovalMessage } from '../src/roost-service/hosted-roost.js';

const GOOD = { round: { syndicateId: 'pg-0123456789', epoch: 3, roundNonce: 'ab'.repeat(32) }, runId: 'run-0123456789', orderHash: 'cd'.repeat(32) };
const withService = (over = {}) => ({ ...GOOD, approvalMessage: payrunApprovalMessage({ contractId: 'c.fly-1.testnet', ...GOOD.round, runId: GOOD.runId, orderHash: GOOD.orderHash }), ...over });

test('the message the page signs is the room\'s own format, built from the page\'s contract id and the round\'s fields', () => {
  const d = withService();
  const r = approvalToSign({ contractId: 'c.fly-1.testnet', detail: d });
  assert.equal(r.message, d.approvalMessage);
  assert.equal(r.message, payrunApprovalMessage({ contractId: 'c.fly-1.testnet', syndicateId: 'pg-0123456789', epoch: 3, roundNonce: 'ab'.repeat(32), runId: 'run-0123456789', orderHash: 'cd'.repeat(32) }));
  assert.equal(r.agrees, true);
  assert.ok(r.message.startsWith(`${APPROVAL_DOMAIN}:c.fly-1.testnet:`));
});

test('a string that the service sends instead is never what gets signed, so a transaction hash cannot be slipped in', () => {
  // A NEAR transaction signature is ed25519 over exactly 32 bytes (the transaction's hash). A service that returns a 32 character string as the "message" would,
  // if the page signed it as given, obtain a signature that is valid for a transaction. The page signs only its own long, prefixed message.
  const hashLike = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
  const r = approvalToSign({ contractId: 'c.fly-1.testnet', detail: withService({ approvalMessage: hashLike }) });
  assert.equal(r.agrees, false, 'the page tells the visitor the service\'s message does not match');
  assert.notEqual(r.message, hashLike);
  assert.ok(r.message.length > 100 && r.message.startsWith(`${APPROVAL_DOMAIN}:`), 'what would be signed is always long and prefixed');
});

test('a field that is not in its expected shape means nothing is signed', () => {
  const bad = [
    { contractId: null }, { contractId: 'C.Bad Id' }, { contractId: 'c.fly:1.testnet' },
    { detail: withService({ runId: 'run-1:evil' }) }, { detail: withService({ runId: 'x' }) },
    { detail: withService({ orderHash: 'cd'.repeat(31) }) }, { detail: withService({ orderHash: 'CD'.repeat(32) }) },
    { detail: { ...withService(), round: { ...GOOD.round, syndicateId: 'pg-1:2' } } }, { detail: { ...withService(), round: { ...GOOD.round, epoch: -1 } } },
    { detail: { ...withService(), round: { ...GOOD.round, epoch: '3' } } }, { detail: { ...withService(), round: { ...GOOD.round, roundNonce: 'a:b' } } },
    { detail: { ...withService(), round: null } }, { detail: null },
  ];
  for (const over of bad) {
    const r = approvalToSign({ contractId: 'c.fly-1.testnet', detail: withService(), ...over });
    assert.equal(r.message, null, JSON.stringify(over).slice(0, 80)); assert.equal(r.agrees, false);
  }
});

test('the page never hands a string from the service to the signing function: every signature is over the message the page built', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync('site/src/playground-page.js', 'utf8');
  const calls = [...src.matchAll(/signInputWithNearKey\(([^)]*\))/g)].map((m) => m[1]);
  assert.ok(calls.length >= 1, 'the page signs the approval');
  for (const c of calls) { assert.match(c, /toSign\.message/, `signed argument: ${c}`); assert.ok(!/approvalMessage/.test(c), `signed argument: ${c}`); }
  assert.ok(/approvalToSign\(/.test(src) && /toSign\.message === null/.test(src), 'and it refuses to sign when the message cannot be built');
});
