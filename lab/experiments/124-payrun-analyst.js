import crypto from 'node:crypto';
import { analyseRun, buildReviewMessage, parseReply, crossCheck, reviewPayrun, CODES } from '../../src/advisor/payrun-analyst.js';
import { buildPayrun } from '../../src/roost-service/payrun-program.js';

const rngOf = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
const FIRST = ['Zora', 'Marguerite', 'Anselm', 'Philippa', 'Dmitri', 'Oluwaseun', 'Ingrid', 'Tobias'];
const LAST = ['Whitlock', 'Okonkwo', 'Vandermeer', 'Castellanos', 'Brightwater', 'Lindqvist', 'Haverford', 'Nakamura'];
const run = (n, rnd) => Array.from({ length: n }, (_, i) => {
  const g = Number(`${1 + Math.floor(rnd() * 90)}.${String(Math.floor(rnd() * 1e6)).padStart(6, '0')}`);
  const tax = (g * (0.1 + rnd() * 0.25)).toFixed(6); const ben = (g * rnd() * 0.08).toFixed(6);
  return { person: `${FIRST[Math.floor(rnd() * 8)]} ${LAST[Math.floor(rnd() * 8)]}${i}`, payee: `p${crypto.randomBytes(5).toString('hex')}.testnet`, invoiceId: `INV-${crypto.randomBytes(3).toString('hex')}`, period: '2026-11', gross: g.toFixed(6), tax, benefits: ben };
});
const scripted = (reply) => ({ ask: async () => ({ plaintext: typeof reply === 'string' ? reply : JSON.stringify(reply), record: { model: 'scripted', requestSha256: 'x', responseSha256: 'y' } }) });
const LINES = [
  { person: 'Zora Whitlock', payee: 'z1.testnet', invoiceId: 'INV-1', period: '2026-11', gross: '100', tax: '20', benefits: '3' },
  { person: 'Marguerite Okonkwo', payee: 'z2.testnet', invoiceId: 'INV-2', period: '2026-11', gross: '100', tax: '20', benefits: '3' },
  { person: 'Anselm Vandermeer', payee: 'z3.testnet', invoiceId: 'INV-3', period: '2026-11', gross: '100', tax: '0', benefits: '0' },
  { person: 'Philippa Castellanos', payee: 'z4.testnet', invoiceId: 'INV-4', period: '2026-11', gross: '100', tax: '20', benefits: '9' },
  { person: 'Dmitri Brightwater', payee: 'z5.testnet', invoiceId: 'INV-5', period: '2026-11', gross: '240', tax: '48', benefits: '7' },
];
const STATED = { taxRatePct: 20, benefitsCapPct: 5 };

export default {
  id: 'E-PAYRUN-ANALYST-01',
  title: 'AI review of a pay run, checked by code: nothing identifying is sent, flags come from the code, replies are held to a shape, findings are cross-checked, the run is untouched',
  tier: 'offline',
  requires: [],
  hypothesis: 'The message built for the model carries no name, account, invoice id or exact amount over 500 generated runs; bands and rates are exact; linkability flags come from the code; a malformed or leaking reply is rejected whole; a finding is verified only when the numbers support it; and the pay run is identical with the review on, off, failing or returning nonsense.',
  limits: ['Offline, with a scripted stand-in for the model. It shows the guards and the cross-check, not how well a real model reasons (see E-PAYRUN-ANALYST-LIVE-01). Bands and rates still carry some information about a line.'],
  async run(ctx) {
    await ctx.step('what is sent: nothing identifying, exact bands and rates, order-independent labels', async (s) => {
      const rnd = rngOf(41); let leaks = 0; let first = null;
      for (let t = 0; t < 500; t += 1) {
        const lines = run(1 + Math.floor(rnd() * 8), rnd);
        try {
          const { message } = buildReviewMessage({ lines, rulesText: 'Tax is a flat percentage withheld from gross. Benefits are capped as a share of gross.', stated: STATED });
          const text = JSON.stringify(message);
          for (const l of lines) for (const v of [l.person, l.payee, l.invoiceId, l.gross, l.tax, l.benefits]) if (text.includes(v)) { leaks += 1; first = first || v; }
          if (/[0-9a-f]{64}|\.testnet|\.near/i.test(text)) { leaks += 1; first = first || 'shape'; }
        } catch (e) { leaks += 1; first = first || e.message; }
      }
      s.assert('over 500 generated runs the message contains none of the names, accounts, invoice ids or exact amounts, nor anything shaped like an identifier', leaks === 0, { actual: { leaks, first } });
      const a = analyseRun({ lines: LINES });
      const byLine = Object.fromEntries(a.rows.map((r) => [r.i, r]));
      s.assert('a gross equal to the median is band 100; 240 against a median of 100 is band 240', byLine[0].grossBandPct === 100 && byLine[4].grossBandPct === 240, { actual: [byLine[0].grossBandPct, byLine[4].grossBandPct] });
      s.assert('rates are exact to a tenth of a percent (20.0, 0.0, 9.0 and 2.9 for 7 of 240)', byLine[0].taxRatePct === 20 && byLine[2].taxRatePct === 0 && byLine[3].benefitsRatePct === 9 && byLine[4].benefitsRatePct === 2.9, { actual: [byLine[0].taxRatePct, byLine[2].taxRatePct, byLine[3].benefitsRatePct, byLine[4].benefitsRatePct] });
      const reversed = buildReviewMessage({ lines: [...LINES].reverse(), rulesText: 'r', stated: STATED }).message; const fwd = buildReviewMessage({ lines: LINES, rulesText: 'r', stated: STATED }).message;
      s.assert('listing the lines in a different order gives the same message (labels follow the numbers, not the list)', JSON.stringify(reversed) === JSON.stringify(fwd));
      const shifted = LINES.map((l, i) => (i === 0 ? { ...l, gross: '101', tax: '20.2', benefits: '3.03' } : l));
      s.assert('exact amounts inside the same bands and rates give the same message', JSON.stringify(buildReviewMessage({ lines: shifted, rulesText: 'r', stated: STATED }).message) === JSON.stringify(fwd));
      let refused = 'sent'; try { buildReviewMessage({ lines: LINES, rulesText: 'Pay Zora Whitlock the usual rate', stated: STATED }); } catch (e) { refused = /Zora/.test(e.message); }
      s.assert('employer rules text that names a person is refused before anything is sent', refused === true, { actual: refused });
      let refused2 = 'sent'; try { buildReviewMessage({ lines: LINES, rulesText: 'send to abc.testnet', stated: STATED }); } catch (e) { refused2 = /account id/.test(e.message); }
      s.assert('rules text that contains an account id is refused', refused2 === true, { actual: refused2 });
    });

    await ctx.step('linkability flags come from the code, with or without a model', async (s) => {
      const a = analyseRun({ lines: LINES, earlierAddresses: ['z2.testnet'] });
      const has = (code, i) => a.flags.some((f) => f.code === code && f.line === a.rows[i].label);
      s.assert('the 240 line is the only one in its net band: unique-amount', has('unique-amount', 4));
      s.assert('the line with the earlier address is address-reused', has('address-reused', 1));
      s.assert('the lines in a shared net band are not flagged unique', !has('unique-amount', 0));
      s.assert('a run of one is headcount-one', analyseRun({ lines: [LINES[0]] }).flags.some((f) => f.code === 'headcount-one'));
      const off = await reviewPayrun({ lines: LINES, stated: STATED, earlierAddresses: ['z2.testnet'] });
      s.assert('with the review off the flags are still returned and no model is used', off.used === false && off.codeFlags.length >= 2, { actual: off });
    });

    await ctx.step('the reply is held to a shape, and every finding is cross-checked', async (s) => {
      const a = analyseRun({ lines: LINES }); const labels = a.rows.map((r) => r.label);
      const L = (i) => a.rows[i].label;
      const good = { findings: [{ line: L(2), code: 'zero-deduction', severity: 'warn', note: 'No tax or benefits taken.' }, { line: L(3), code: 'benefits-above-cap', severity: 'warn', note: 'Benefits are above the stated cap.' }, { line: L(0), code: 'rate-above-schedule', severity: 'warn', note: 'Looks high.' }], summary: 'Two lines need a look.', questions: ['Is the zero-tax line exempt?'] };
      const r = await reviewPayrun({ lines: LINES, rulesText: 'Flat tax, capped benefits.', stated: STATED, advisor: scripted(good), enabled: true });
      s.assert('a well-formed reply is used', r.used === true && r.findings.length === 3, { actual: r.reason });
      const chk = (code) => r.findings.find((f) => f.code === code)?.check;
      s.assert('a true zero-deduction finding is verified', chk('zero-deduction') === 'verified');
      s.assert('a true benefits-above-cap finding is verified', chk('benefits-above-cap') === 'verified');
      s.assert('a false rate-above-schedule finding (that line is exactly at 20%) is not verified', chk('rate-above-schedule') === 'not-verified');
      const bad = (o) => parseReply(JSON.stringify(o), labels).ok;
      s.assert('an unknown code is rejected', bad({ ...good, findings: [{ line: L(0), code: 'fraud', severity: 'warn', note: 'x' }] }) === false);
      s.assert('an unknown line label is rejected', bad({ ...good, findings: [{ line: 'Z', code: 'other', severity: 'info', note: 'x' }] }) === false);
      s.assert('a note over 160 characters is rejected', bad({ ...good, findings: [{ line: L(0), code: 'other', severity: 'info', note: 'x'.repeat(161) }] }) === false);
      s.assert('extra fields are rejected', bad({ ...good, approve: true }) === false && bad({ ...good, findings: [{ line: L(0), code: 'other', severity: 'info', note: 'x', amount: '5' }] }) === false);
      s.assert('a reply that mentions an account id is rejected whole', bad({ ...good, summary: 'Pay z9.testnet instead' }) === false);
      s.assert('text that is not JSON is rejected and the review reports it was not used', (await reviewPayrun({ lines: LINES, stated: STATED, advisor: scripted('Sure! Here is my analysis...'), enabled: true })).used === false);
      s.assert('a reply wrapped in a code fence still parses', bad(good) && parseReply('```json\n' + JSON.stringify(good) + '\n```', labels).ok);
      s.assert('every code in the allowed list is known to the cross-check without throwing', CODES.every((c) => ['verified', 'not-verified'].includes(crossCheck({ line: L(0), code: c }, a, STATED))));
      s.assert('zero-deduction means no tax withheld: verified for a line with no tax but 3% benefits, not verified for a line with tax', crossCheck({ line: a.rows.find((r) => r.taxRatePct === 0).label, code: 'zero-deduction' }, a, STATED) === 'verified' && crossCheck({ line: L(0), code: 'zero-deduction' }, a, STATED) === 'not-verified');
      s.assert('codes the numbers cannot settle (other, schedule-ambiguous) are never verified, whatever the model says', ['other', 'schedule-ambiguous'].every((c) => crossCheck({ line: L(0), code: c }, a, STATED) === 'not-verified'));
      s.assert('a rate-outlier claim on a line at the median rate is not verified', crossCheck({ line: L(0), code: 'rate-outlier' }, a, STATED) === 'not-verified');
      const failing = await reviewPayrun({ lines: LINES, stated: STATED, advisor: { ask: async () => { throw new Error('gateway down'); } }, enabled: true });
      s.assert('a gateway failure is reported, not thrown', failing.used === false && /gateway down/.test(failing.reason));
    });

    await ctx.step('the review cannot change the run', async (s) => {
      const payLines = LINES.map((l, i) => ({ ...l, payee: `pay${i}.testnet`, payeeKey: crypto.randomBytes(32).toString('hex') }));
      const mk = () => JSON.stringify(buildPayrun({ lines: payLines, taxAddress: 'tax.testnet', benefitsAddress: 'ben.testnet', runId: 'r' }), (k, v) => (typeof v === 'bigint' ? String(v) : v));
      const before = mk();
      const rv = await reviewPayrun({ lines: payLines, stated: STATED, advisor: scripted({ findings: [], summary: 'ok', questions: [] }), enabled: true });
      await reviewPayrun({ lines: payLines, stated: STATED, advisor: scripted('garbage'), enabled: true });
      await reviewPayrun({ lines: payLines, stated: STATED, advisor: { ask: async () => { throw new Error('x'); } }, enabled: true });
      await reviewPayrun({ lines: payLines, stated: STATED });
      s.assert('the pay run result is byte-identical after the review ran on, with nonsense, failing and off', mk() === before);
      s.assert('the review result carries no allocation, signature or order hash', !['allocations', 'signature', 'orderHash', 'charges', 'receipts'].some((k) => k in rv));
    });
  },
};
