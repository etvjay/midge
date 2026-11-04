---
name: research-sequence-lab
description: Run tests, demos and verification as a logged research sequence instead of a narrative. Every check becomes an experiment with a hypothesis, recorded steps, per-step assertions, evidence and a tamper-evident hash-chained log that an independent auditor re-verifies. Use this whenever the user wants to show verifiability, prove a system works honestly, build reproducible demos, find problems systematically, evaluate or eval-log a sequence of runs, "run these steps with logging", test a protocol, API, contract or agent end to end, attack-test something, or set up a testnet or sandbox others can re-run, even if they never say "lab" or "experiment". Also use it when a prior test result is being reported as a story and needs evidence behind it.
---

# Research sequence lab

A way to run checks so that the result is evidence, not a story. Each check is an **experiment**: a stated hypothesis, steps that make **assertions**, the **evidence** behind them, and the **problems** found. A run writes a hash-chained, append-only log. Verdicts are derived from the assertions, and a separate auditor re-derives them from the raw log, so neither the harness nor you can quietly declare a pass.

Why bother: a demo narrated in prose can't be re-checked and hides the cases where the author was wrong. In the project this came from, the log found a real contract bug, three wrong assumptions of the author, and a bug in the harness itself, all of which a narrated run would have smoothed over. See `references/lessons.md` for those and the rule each one produced.

## Set up (once per project)

```bash
node <skill-dir>/scripts/scaffold.js <project-root>
node lab/run.js --only E-LAB-01        # the engine tests itself; do not trust any result until this passes
```

This installs a dependency-free engine into `lab/` (Node 18+), an example experiment, and a `.gitignore` entry for `lab/runs/`. It never overwrites an existing engine without `--force`. Optional project config: `lab/lab.config.json` (tracked dependencies, tools, pinned files, files holding secrets) and `lab/capabilities.js` (what this machine can do). Copy the `*.example.*` files from `lab/`.

## The loop

1. **Write the experiment** in `lab/experiments/NN-topic.js` from `assets/experiment.template.js`.
   - `hypothesis`: what you expect, and the specific failure that must NOT happen. A hypothesis that can't be wrong is a description. (The runner prints these in the report but does not enforce them; that discipline is yours.)
   - `limits`: what the run does not show. Always include who controlled what (one operator acting as every party is not independent users), what is simulated, and the date.
   - `tier` and `requires`: put cheap, keyless checks first. A missing requirement SKIPS with the reason recorded; it never passes silently.
2. **Write steps that assert.** `s.observe` records a fact, `s.assert(claim, ok, {expected, actual})` is the only thing that affects the verdict, `s.evidence(kind, data)` records proof. A step with no assertion fails, because evidence without a claim proves nothing.
3. **Run it:** `node lab/run.js --only E-X --repeat 3`. Repeats expose flakiness; the verdict is `FLAKY` if attempts disagree. The exit code follows the independent audit and the chain check, not the runner's own opinion.
4. **Read the log, not your expectation.** When something fails, open `report.md` and the events and classify it before touching anything:
   - *My assumption was wrong* (the status is `Active`, not `Open`): fix the experiment, and say so in the commit.
   - *The harness lied or broke* (a data field collided with the log's own field): fix the engine, add a regression test to `E-LAB-01`, and confirm the new test fails against the old engine.
   - *The system has a real bug*: write a test that fails on the current code first, then fix, then add an experiment step that would have caught it, and record the gap in whatever ledger the project keeps.
5. **Verify and promote.** `node lab/verify-run.js lab/runs/<id>` re-checks the chain and re-derives verdicts. Scan the run for secrets using the real secret values, not just patterns, then `node lab/promote.js lab/runs/<id>` to keep it under `docs/lab-runs/`.
6. **Commit in separate commits** (fix, experiment, evidence) and push only when the user approves. Report numbers read from the log (assertions, failures, transactions, cost), the limits, and what was NOT tested.

## Rules that make the evidence worth something

- **Assert the effect, not the error.** For a "must fail" step, assert that state did not change (balance, status, counts). An error that came back for the wrong reason is a pass for the wrong test. Check the reason too when it matters.
- **Use the authoritative source.** Prefer the system's own record (receipts, logs, state views) over a derived number such as a balance delta that other operations pollute.
- **Never write a vacuous assertion.** `ok || true`, comparing a value to itself, or asserting only that something "ran" passes whatever happens. If you catch yourself writing one, find what it should compare to.
- **Test the thing that could be hidden.** If the happy path closes the case (settling the full amount ends the session), the replay test passes for the wrong reason. Run the partial and boundary variants.
- **Make teardown unskippable.** Use `{ always: true }` for steps that delete paid or shared resources, then check independently that nothing remains. Give paid runs a preflight (account empty, pins present) and a dead-man's switch that deletes the resource even if the process dies.
- **Mutation-test the harness.** Break one rule in a scratch copy of the engine (ignore `always`, skip the chain check, drop a field) and confirm `E-LAB-01` fails. A self-test that can't fail proves nothing.
- **Secrets never reach the log.** The recorder redacts known values and key patterns before hashing. Still scan before promoting; redaction is a safety net, not the check.
- **Say what you did not test.** Every report ends with the limits. If a component only exists as a model or simulation, write that, not "verified".

## Commands

```bash
node lab/run.js --list                          # experiments, tier, requirements
node lab/run.js --tier offline                  # one tier
node lab/run.js --only E-A,E-B --repeat 3       # chosen experiments, repeated
node lab/verify-run.js lab/runs/<id>            # integrity plus re-derived verdicts
node lab/promote.js lab/runs/<id>               # keep a verified run in docs/lab-runs/
```

## Working with existing checks

To bring existing scripts under the lab without rewriting them, use `core/legacy.js` (`runScript`): it runs a command, turns every ✓/✗ line it prints into an assertion, adds one for the exit code and one for its own PASS/FAIL banner, and stores the redacted output. Expect it to flag scripts that report only narrative lines, which is itself a finding.
