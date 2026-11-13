// The accuracy test is only worth running if its scoring is sound. This checks the scenarios, the oracle, and that the scorer separates a perfect reviewer from bad ones.
import test from 'node:test';
import assert from 'node:assert/strict';
import { devScenarios, heldOutScenarios, hardScenarios, oracle, score, aggregate, FOUR } from '../lab/lib/payrun-scenarios.js';
import { reviewPayrun } from '../src/advisor/payrun-analyst.js';

const byId = Object.fromEntries(devScenarios().map((s) => [s.id, s]));
const advisorFrom = (fn) => ({ ask: async ({ user }) => ({ plaintext: JSON.stringify(fn(JSON.parse(user))), record: { model: 'scripted' } }) });

/** A reference reviewer that reads only the message (as the model does) and applies the stated rules. */
const reference = (m) => {
  const findings = [];
  for (const l of m.lines) {
    if (m.stated.taxRatePct !== null) {
      if (l.taxRatePct === 0 && m.stated.taxRatePct > 0) findings.push({ line: l.line, code: 'zero-deduction', severity: 'warn', note: 'No tax withheld.' });
      else if (l.taxRatePct > 0 && l.taxRatePct < m.stated.taxRatePct - 0.05) findings.push({ line: l.line, code: 'rate-below-schedule', severity: 'warn', note: 'Tax below the stated rate.' });
      else if (l.taxRatePct > m.stated.taxRatePct + 0.05) findings.push({ line: l.line, code: 'rate-above-schedule', severity: 'warn', note: 'Tax above the stated rate.' });
    }
    if (m.stated.benefitsCapPct !== null && l.benefitsRatePct > m.stated.benefitsCapPct + 0.05) findings.push({ line: l.line, code: 'benefits-above-cap', severity: 'warn', note: 'Benefits above the cap.' });
  }
  return { findings, summary: 'Reviewed.', questions: [] };
};
const run = async (sc, advisor) => reviewPayrun({ lines: sc.lines, rulesText: sc.rules, stated: sc.stated, earlierAddresses: sc.earlierAddresses, advisor, enabled: true });

test('the scenario sets have the sizes promised in the plan, are deterministic, and share nothing', () => {
  const dev = devScenarios(); const held = heldOutScenarios();
  assert.equal(dev.length, 42); assert.equal(held.length, 30);
  assert.deepEqual(JSON.stringify(devScenarios()), JSON.stringify(dev));
  assert.deepEqual(JSON.stringify(heldOutScenarios()), JSON.stringify(held));
  const ids = new Set(dev.map((s) => s.id)); assert.ok(held.every((s) => !ids.has(s.id)));
  const key = (s) => JSON.stringify(s.lines.map((l) => [l.gross, l.tax, l.benefits]));
  const devKeys = new Set(dev.map(key)); assert.equal(held.filter((s) => devKeys.has(key(s))).length, 0, 'no held-out run equals a development run');
});

test('the hard set has 16 cases, shares nothing with the other sets, and has the right answers', () => {
  const hard = hardScenarios(); assert.equal(hard.length, 16);
  const key = (s) => JSON.stringify(s.lines.map((l) => [l.gross, l.tax, l.benefits]));
  const others = new Set([...devScenarios(), ...heldOutScenarios()].map(key)); assert.equal(hard.filter((s) => others.has(key(s))).length, 0);
  const need = (id) => oracle(hard.find((s) => s.id === id)).required;
  assert.equal(need('hard-tax-point-one-under').length, 1); assert.deepEqual(need('hard-tax-point-one-under')[0].anyOf, ['rate-below-schedule']);
  assert.equal(need('hard-benefits-point-one-over').length, 1); assert.equal(need('hard-benefits-exactly-at-cap').length, 0);
  assert.equal(need('hard-two-lines-no-tax').length, 2); assert.equal(need('hard-extreme-tax-rate').length, 1);
  assert.equal(need('hard-stated-tax-zero').length, 1, 'with a stated tax rate of 0, a tax of 0 is correct and a tax of 2 is not');
  assert.deepEqual(need('hard-stated-tax-zero')[0].anyOf, ['rate-above-schedule']);
  assert.equal(need('hard-cap-zero').length, 1); assert.equal(need('hard-fractional-rate').length, 1);
  assert.equal(need('hard-identical-lines').length, 0); assert.equal(need('hard-very-different-gross').length, 0);
  assert.equal(need('hard-larger-mixed-run').length, 4, 'the line exactly at the cap passes');
  assert.equal(hard.filter((s) => s.kind === 'unclear').length, 4);
});

test('the hand-designed cases have the right answers, including the boundaries', () => {
  const need = (id) => oracle(byId[id]).required;
  assert.equal(need('hand-tax-above').length, 1); assert.deepEqual(need('hand-tax-above')[0].anyOf, ['rate-above-schedule']);
  assert.deepEqual(need('hand-tax-zero')[0].anyOf, ['zero-deduction', 'rate-below-schedule']);
  assert.equal(need('hand-all-broken').length, 4);
  assert.equal(need('hand-two-codes-one-line').length, 2);
  assert.equal(need('hand-boundary-exact-pass').length, 0, 'a number exactly at a limit passes');
  assert.equal(need('hand-tax-point-one-over').length, 1, 'one tenth of a point over the tax limit is flagged');
  assert.equal(need('hand-benefits-point-one-over').length, 1);
  assert.equal(need('hand-no-cap-rules').length, 0, 'with no cap stated, high benefits are not a mistake');
  assert.equal(need('hand-tiered-rules-unclear').length, 0); assert.equal(need('hand-silent-tax-rule').length, 0);
  assert.equal(need('hand-eight-three-mistakes').length, 3);
  assert.equal(need('hand-eight-clean').length, 0);
});

test('every generated case has at least one line and the planted mistakes are at least a full point away from the limit', () => {
  for (const s of [...devScenarios(), ...heldOutScenarios()].filter((x) => x.kind !== 'unclear')) {
    assert.ok(s.lines.length >= 1 && s.lines.length <= 8, s.id);
    const o = oracle(s);
    for (const r of o.required) {
      const row = o.analysis.rows.find((x) => x.label === r.line);
      if (r.anyOf.includes('rate-above-schedule')) assert.ok(row.taxRatePct - s.stated.taxRatePct >= 0.1 - 1e-9, s.id);
      if (r.anyOf.includes('benefits-above-cap')) assert.ok(row.benefitsRatePct - s.stated.benefitsCapPct >= 0.1 - 1e-9, s.id);
    }
  }
});

test('a reference reviewer that reads only the message agrees with the oracle everywhere, and the code verifies every one of its findings', async () => {
  const scores = [];
  for (const sc of [...devScenarios(), ...heldOutScenarios(), ...hardScenarios().filter((x) => x.kind !== 'unclear')]) {
    const out = await run(sc, advisorFrom(reference));
    assert.equal(out.used, true, sc.id);
    scores.push(score(sc, out));
  }
  const a = aggregate(scores);
  assert.equal(a.recall, 1); assert.equal(a.precision, 1); assert.equal(a.falseClaims, 0); assert.equal(a.cleanRate, 1); assert.equal(a.parseRate, 1);
  assert.equal(a.unclearOverreach, 0);
});

test('the scorer tells a perfect reviewer from a silent one, an over-eager one and a lying one', async () => {
  const all = devScenarios().filter((s) => s.kind !== 'unclear');
  const silent = aggregate(await Promise.all(all.map(async (sc) => score(sc, await run(sc, advisorFrom(() => ({ findings: [], summary: 'ok', questions: [] })))))));
  assert.ok(silent.recall < 0.1 && silent.precision === 1 && silent.cleanRate === 1);
  const eager = aggregate(await Promise.all(all.map(async (sc) => score(sc, await run(sc, advisorFrom((m) => ({ findings: m.lines.map((l) => ({ line: l.line, code: 'rate-above-schedule', severity: 'warn', note: 'x' })), summary: 'x', questions: [] })))))));
  assert.ok(eager.precision < 0.5 && eager.cleanRate < 0.3 && eager.falseClaims > 0);
  const liar = aggregate(await Promise.all(all.map(async (sc) => score(sc, await run(sc, advisorFrom((m) => ({ findings: [{ line: m.lines[0].line, code: 'zero-deduction', severity: 'warn', note: 'x' }], summary: 'x', questions: [] })))))));
  assert.ok(liar.falseClaims > 0 && liar.falseClaimRate > 0.2);
  const broken = aggregate(await Promise.all(all.slice(0, 5).map(async (sc) => score(sc, await run(sc, advisorFrom(() => 'not an object'))))));
  assert.equal(broken.parseRate, 0);
  assert.ok(FOUR.length === 4);
});
