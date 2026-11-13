// The playground page's state, as plain functions with no page code in them, so it is tested without a browser. The page calls `reduce` with an action
// and draws the state it returns.
import { defaultLines, validateLines } from '../../src/playground/defaults.js';

export const runKey = (lines) => JSON.stringify(lines.map((l) => [l.person, l.gross, l.tax, l.benefits]));
export const lineProblems = (lines) => { const v = validateLines(lines); return v.ok ? [] : [v.problem]; };

// Two starting points. The planted one is the same mistake the recorded runs use: no tax withheld on Cy's line.
export const PRESETS = {
  clean: () => defaultLines(),
  planted: () => { const l = defaultLines(); l[2].tax = '0'; return l; },
};

const emptyRound = () => ({ step: null, position: null, etaSeconds: null, detail: {} });

export function initialState() {
  const lines = PRESETS.clean(); lines[3] = { ...lines[3], person: 'You' }; // the last line is yours, and you can rename it
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
    case 'round-refused': return { ...s, step: 'run', error: a.reason };
    case 'round-started': return { ...s, step: 'round', ticket: a.ticket, round: emptyRound(), error: null };
    case 'round-state': {
      const { step, position = null, etaSeconds = null, detail = {} } = a.state;
      if (step === 'failed' || step === 'expired') return { ...s, step: 'run', ticket: null, round: emptyRound(), error: detail.reason || 'The round ended before it finished. Please try again.' };
      if (step === 'done') return { ...s, step: 'settled', result: detail, round: { step, position, etaSeconds, detail } };
      return { ...s, round: { step, position, etaSeconds, detail } };
    }
    case 'show-payslip': return { ...s, step: 'payslip' };
    case 'restart': return initialState();
    default: return s;
  }
}
