// The playground page's state, as plain functions with no page code in them, so it is tested without a browser. The page calls `reduce` with an action
// and draws the state it returns.
import { defaultLines, validateLines } from '../../src/playground/defaults.js';

export const runKey = (lines) => JSON.stringify(lines.map((l) => [l.person, l.gross, l.tax, l.benefits]));
export const lineProblems = (lines) => {
  const v = validateLines(lines);
  return v.ok ? [] : [v.problem];
};

// Two starting points. The planted one is the same mistake the recorded runs use: no tax withheld on Cy's line.
export const PRESETS = {
  clean: () => defaultLines(),
  planted: () => {
    const l = defaultLines();
    l[2].tax = '0';
    return l;
  },
};

const emptyRound = () => ({ step: null, position: null, etaSeconds: null, detail: {} });

export function initialState() {
  const lines = PRESETS.clean();
  lines[3] = { ...lines[3], person: 'You' }; // the last line is yours, and you can rename it
  return { step: 'run', lines, review: null, reviewError: null, reviewedKey: null, ticket: null, round: emptyRound(), result: null, error: null };
}

export const canReview = (s) => s.step === 'run' && lineProblems(s.lines).length === 0;
export const canStart = (s) => s.step === 'run' && s.review !== null && s.reviewedKey === runKey(s.lines) && lineProblems(s.lines).length === 0;

export function reduce(s, a) {
  switch (a.type) {
    case 'edit': {
      // Only your own line's name can change: the other three people are part of the test run.
      if (a.field === 'person' && a.index !== 3) return s;
      const lines = s.lines.map((l, i) => (i === a.index ? { ...l, [a.field]: a.value } : l));
      return { ...s, lines, review: null, reviewedKey: null, reviewError: null, error: null };
    }
    case 'preset': {
      const lines = PRESETS[a.name]().map((l, i) => (i === 3 ? { ...l, person: s.lines[3].person } : l));
      return { ...s, lines, review: null, reviewedKey: null, reviewError: null, error: null };
    }
    case 'review-done':
      return a.review?.used === true
        ? { ...s, review: a.review, reviewedKey: runKey(s.lines), reviewError: null }
        : { ...s, review: null, reviewedKey: null, reviewError: a.review?.reason || 'The review did not run.' };
    case 'round-refused':
      return { ...s, step: 'run', error: a.reason };
    case 'round-started':
      return { ...s, step: 'round', ticket: a.ticket, round: emptyRound(), error: null };
    case 'round-state': {
      const { step, position = null, etaSeconds = null, detail = {} } = a.state;
      if (step === 'failed' || step === 'expired')
        return { ...s, step: 'run', ticket: null, round: emptyRound(), error: detail.reason || 'The round ended before it finished. Please try again.' };
      if (step === 'done') return { ...s, step: 'settled', result: detail, round: { step, position, etaSeconds, detail } };
      return { ...s, round: { step, position, etaSeconds, detail } };
    }
    case 'show-payslip':
      return { ...s, step: 'payslip' };
    case 'restart':
      return initialState();
    default:
      return s;
  }
}

// ---- the approval message ----
// The visitor's NEAR key signs the approval, and the same key is a full-access key on their account. A signature over raw bytes is a signature over whatever
// bytes were given, and a NEAR transaction is signed over exactly 32 bytes (its hash). So the page never signs a string the service hands it. It builds the
// message itself, in the room's format (the same string as payrunApprovalMessage in src/roost-service/hosted-roost.js), from a contract id that the page
// was configured with and fields it checks the shape of. The message is always long and starts with a fixed prefix, so it can never be a transaction hash.
export const APPROVAL_DOMAIN = 'midge-payrun-approval-v1';
const CONTRACT_ID = /^[a-z0-9][a-z0-9._-]{1,62}$/;
const GROUP_ID = /^pg-[0-9a-f]{10}$/;
const RUN_ID = /^run-[0-9a-f]{10}$/;
const NONCE = /^[A-Za-z0-9_-]{1,128}$/;
const HASH = /^[0-9a-f]{64}$/;

/**
 * Returns { message, agrees }. `message` is what the page may sign, or null if any field is not in its expected shape. `agrees` says whether the service sent
 * the same message, which the page shows to the visitor; it signs `message` either way, and refuses when `message` is null.
 */
export function approvalToSign({ contractId, detail }) {
  const r = detail?.round;
  const ok =
    typeof contractId === 'string' &&
    CONTRACT_ID.test(contractId) &&
    r &&
    typeof r === 'object' &&
    typeof r.syndicateId === 'string' &&
    GROUP_ID.test(r.syndicateId) &&
    Number.isSafeInteger(r.epoch) &&
    r.epoch >= 0 &&
    typeof r.roundNonce === 'string' &&
    NONCE.test(r.roundNonce) &&
    typeof detail.runId === 'string' &&
    RUN_ID.test(detail.runId) &&
    typeof detail.orderHash === 'string' &&
    HASH.test(detail.orderHash);
  if (!ok) return { message: null, agrees: false };
  const message = `${APPROVAL_DOMAIN}:${contractId}:${r.syndicateId}:${r.epoch}:${r.roundNonce}:${detail.runId}:${detail.orderHash}`;
  return { message, agrees: message === detail.approvalMessage };
}
