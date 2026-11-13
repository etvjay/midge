import crypto from 'node:crypto';

/**
 * The model gate for the playground. A round may start only for lines that a model has just reviewed, in the same session, and the model is called a
 * limited number of times, because every call costs money. This is enforced by the playground service. The room and the contract do not see it, and
 * the page says so.
 *
 * The hash covers what the model judged (each person, gross, tax and benefits, in order) and nothing else. It leaves out the payee address and the
 * payslip key, which only exist after the accounts are created, so creating accounts does not close the gate.
 */
export function createReviewGate({ now = Date.now, maxPerSession = 6, maxPerHour = 60 } = {}) {
  const sessions = new Map(); // session -> { calls, latest: { hash, result } | null }
  const hour = []; // times of every reserved call
  const canonical = (lines) => JSON.stringify(lines.map((l) => [String(l.person), String(l.gross), String(l.tax), String(l.benefits)]));
  const linesHash = (lines) => crypto.createHash('sha256').update(canonical(lines)).digest('hex');
  const of = (session) => { if (!sessions.has(session)) sessions.set(session, { calls: 0, latest: null }); return sessions.get(session); };

  return {
    linesHash,
    /** Counts one model call before it is made. Throws a plain sentence when the visitor's session or the hour is used up. */
    reserve({ session }) {
      const s = of(session); const t = now();
      while (hour.length && hour[0] <= t - 3600 * 1000) hour.shift();
      if (s.calls >= maxPerSession) throw new Error(`A session can ask for ${maxPerSession} reviews. Please start a new session to review more.`);
      if (hour.length >= maxPerHour) throw new Error('The review service has reached its limit for this hour. Please try again later.');
      s.calls += 1; hour.push(t);
    },
    record({ session, lines, result }) {
      if (!result || result.used !== true) throw new Error('That is not a review: the model did not return one.');
      of(session).latest = { hash: linesHash(lines), result };
    },
    allow({ session, lines }) {
      const latest = sessions.get(session)?.latest;
      if (!latest) return { ok: false, reason: 'These lines have not been reviewed yet. Ask for a review first.' };
      if (latest.hash !== linesHash(lines)) return { ok: false, reason: 'The lines changed after the last review. Ask for a new review of these lines.' };
      return { ok: true, review: latest.result };
    },
  };
}
