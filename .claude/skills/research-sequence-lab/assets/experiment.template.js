// lab/experiments/10-<topic>.js  An experiment is data plus a run function. Fill in EVERY field. The runner does not
// enforce the hypothesis or the limits, it prints them at the top of the report; an experiment without them reads as
// unfinished, and the hypothesis and limits are what make a result honest.
export default {
  id: 'E-TOPIC-01',                       // stable; appears in logs, reports and commit messages
  title: 'One line a stranger can read',
  tier: 'offline',                        // your cost/risk ladder: offline < sandbox < live < paid hardware
  requires: [],                           // capability names from lab/capabilities.js; missing => SKIPPED with reason
  hypothesis: 'State what you expect and what would make you wrong, in one or two sentences. Name the failure that must NOT happen.',
  limits: [
    'What this run does not show (one operator, one date, a model not the real thing, a simulated dependency).',
  ],
  async run(ctx) {
    // Steps run in order. critical:true aborts the rest if it fails; always:true runs even after an abort (teardown).
    await ctx.step('setup: prove the preconditions', async (s) => {
      s.observe('what you measured', { any: 'json' });          // facts, no verdict
      s.assert('a claim that can be false (replace this placeholder)', true, { expected: 'x', actual: 'x' }); // verdict comes from these only
    }, { critical: true });

    await ctx.step('ATTACK: the thing that must fail', async (s) => {
      // For a rejection, assert that STATE did not change, not only that an error came back.
      s.evidence('request', { what: 'you sent', result: 'what came back' });
      // A step with no assertions FAILS: evidence alone is not a verdict. Replace these placeholders with real claims.
      s.assert('the request was rejected', true);
      s.assert('state is unchanged after the rejected request', true);
    });

    await ctx.step('teardown', async (s) => { s.assert('nothing left behind', true); }, { always: true });
  },
};
