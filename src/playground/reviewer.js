import { analyseRun, reviewPayrun } from '../advisor/payrun-analyst.js';
import { RULES, STATED } from './defaults.js';

/**
 * The review the playground runs for a visitor's edited lines: the same reviewer, instructions and code cross-check as the hardware runs. The model is
 * sent letters, ratios and rates, never a name or an amount. A transport failure is retried once, because a visitor should not lose a review to a
 * dropped connection. A reply the model gave and the code rejected is never retried: that is the reviewer failing, and the visitor sees it.
 */
export function makeReviewer({ advisor }) {
  return async function review(lines) {
    const full = lines.map((l, i) => ({ payee: `review-only-${i}`, person: l.person, gross: l.gross, tax: l.tax, benefits: l.benefits }));
    let out = await reviewPayrun({ lines: full, rulesText: RULES, stated: STATED, advisor, enabled: true });
    if (!out.used && /could not be used/.test(out.reason || '')) out = await reviewPayrun({ lines: full, rulesText: RULES, stated: STATED, advisor, enabled: true });
    const labels = analyseRun({ lines: full }).rows.map((r) => r.label);
    return { ...out, labels, rules: RULES, stated: STATED };
  };
}
