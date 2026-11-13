# Lab run 20261113T040200Z-54f6

- **Code:** `c9d4201bbc6dbdf0262aade1b39020955ec99904` on `browser-client` (**6 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `29f58898aa3bf050…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 62 events, hash-chained; root `3a5b6fe2e78f5a5ab14b2f5a72e115d790c64318455d80df981f83cef3133537`. Verify with `node lab/verify-run.js lab/runs/20261113T040200Z-54f6`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-PAYRUN-ANALYST-ACCURACY-01 Does the pay run reviewer make mistakes that break accuracy? A scored test across many runs (development set) | live-external | **PASS** | 2 | 6 |  |

## E-PAYRUN-ANALYST-ACCURACY-01: Does the pay run reviewer make mistakes that break accuracy? A scored test across many runs (development set)

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. Scored against right answers worked out by code from the numbers, the reviewer catches at least 95 percent of planted mistakes, at least 95 percent of its rule-break findings are about a line and a code the code agrees with, at most 2 percent of its checkable findings are marked not verified, at least 95 percent of clean runs have no rule-break finding, and at least 95 percent of replies parse on the first attempt.

**What this does not prove**
- One model (Qwen/Qwen3.6-35B-A3B-FP8) at temperature 0, synthetic runs of 1 to 8 lines, one review per run, from this machine.
- The right answers come from code that reads the same rounded numbers the model is given, so the test measures rule application, not real payroll judgement.
- The development set may have been used to improve the brief; only the held-out numbers are an honest estimate, and they are not re-run.

| Step | Result | Assertions | Time |
|---|---|---|---|
| review 42 dev runs, one review each, no retry, and score each against the right answer | ✓ pass | 1/1 | 126294 ms |
| the bars set in the plan before the run | ✓ pass | 5/5 | 1 ms |

### review 42 dev runs, one review each, no retry, and score each against the right answer

- observed **set**: `dev`
- observed **brief sha256**: `765247d1c3af6de7bf903b3facaf6f5741d19f1efb97b37207a8f318ac899768`
- observed **brief characters**: `7024`
- observed **hand-tax-above**: `mistake planted 1 caught 1 rule-findings 1 matching 1 false 0`
- observed **hand-tax-below**: `mistake planted 1 caught 1 rule-findings 1 matching 1 false 0`
- observed **hand-tax-zero**: `mistake planted 1 caught 1 rule-findings 1 matching 1 false 0`
- observed **hand-benefits-above**: `mistake planted 1 caught 1 rule-findings 1 matching 1 false 0`
- observed **hand-two-mistakes**: `mistake planted 2 caught 2 rule-findings 2 matching 2 false 0`
- observed **hand-three-mistakes**: `mistake planted 3 caught 3 rule-findings 3 matching 3 false 0`
- observed **hand-all-broken**: `mistake planted 4 caught 4 rule-findings 4 matching 4 false 0`
- observed **hand-one-line-clean**: `clean planted 0 caught 0 rule-findings 0 matching 0 false 0`
- observed **hand-one-line-zero**: `mistake planted 1 caught 1 rule-findings 1 matching 1 false 0`
- observed **hand-eight-clean**: `clean planted 0 caught 0 rule-findings 0 matching 0 false 0`
- observed **hand-eight-three-mistakes**: `mistake planted 3 caught 3 rule-findings 3 matching 3 false 0`
- observed **hand-boundary-exact-pass**: `clean planted 0 caught 0 rule-findings 0 matching 0 false 0`
- observed **hand-tax-point-one-over**: `mistake planted 1 caught 1 rule-findings 1 matching 1 false 0`
- observed **hand-benefits-point-one-over**: `mistake planted 1 caught 1 rule-findings 1 matching 1 false 0`
- observed **hand-two-codes-one-line**: `mistake planted 2 caught 2 rule-findings 2 matching 2 false 0`
- observed **hand-no-cap-rules**: `clean planted 0 caught 0 rule-findings 0 matching 0 false 0`
- observed **hand-phrasing-2**: `mistake planted 1 caught 1 rule-findings 1 matching 1 false 0`
- observed **hand-phrasing-3**: `mistake planted 1 caught 1 rule-findings 1 matching 1 false 0`
- observed **hand-address-reused**: `clean planted 0 caught 0 rule-findings 0 matching 0 false 0`
- observed **hand-invoice-period-flags**: `clean planted 0 caught 0 rule-findings 0 matching 0 false 0`
- observed **hand-tiered-rules-unclear**: `unclear planted 0 caught 0 rule-findings 0 matching 0 false 0`
- observed **hand-silent-tax-rule**: `unclear planted 0 caught 0 rule-findings 0 matching 0 false 0`
- observed **dev-gen-1**: `clean planted 0 caught 0 rule-findings 0 matching 0 false 0`
- observed **dev-gen-2**: `clean planted 0 caught 0 rule-findings 0 matching 0 false 0`
- observed **dev-gen-3**: `mistake planted 4 caught 4 rule-findings 4 matching 4 false 0`
- observed **dev-gen-4**: `clean planted 0 caught 0 rule-findings 0 matching 0 false 0`
- observed **dev-gen-5**: `mistake planted 3 caught 3 rule-findings 3 matching 3 false 0`
- observed **dev-gen-6**: `clean planted 0 caught 0 rule-findings 0 matching 0 false 0`
- observed **dev-gen-7**: `mistake planted 1 caught 1 rule-findings 1 matching 1 false 0`
- observed **dev-gen-8**: `mistake planted 3 caught 3 rule-findings 3 matching 3 false 0`
- observed **dev-gen-9**: `mistake planted 1 caught 1 rule-findings 1 matching 1 false 0`
- observed **dev-gen-10**: `clean planted 0 caught 0 rule-findings 0 matching 0 false 0`
- observed **dev-gen-11**: `clean planted 0 caught 0 rule-findings 0 matching 0 false 0`
- observed **dev-gen-12**: `mistake planted 1 caught 1 rule-findings 1 matching 1 false 0`
- observed **dev-gen-13**: `clean planted 0 caught 0 rule-findings 0 matching 0 false 0`
- observed **dev-gen-14**: `mistake planted 1 caught 1 rule-findings 1 matching 1 false 0`
- observed **dev-gen-15**: `clean planted 0 caught 0 rule-findings 0 matching 0 false 0`
- observed **dev-gen-16**: `clean planted 0 caught 0 rule-findings 0 matching 0 false 0`
- observed **dev-gen-17**: `mistake planted 1 caught 1 rule-findings 1 matching 1 false 0`
- observed **dev-gen-18**: `mistake planted 4 caught 4 rule-findings 4 matching 4 false 0`
- observed **dev-gen-19**: `clean planted 0 caught 0 rule-findings 0 matching 0 false 0`
- observed **dev-gen-20**: `clean planted 0 caught 0 rule-findings 0 matching 0 false 0`
- observed **transport retries (network failures only)**: `2`
- ✓ all 42 scores were recorded

### the bars set in the plan before the run

- observed **aggregate**: `{"reviews":42,"parsed":42,"parseRate":1,"planted":42,"caught":42,"recall":1,"ruleFindings":42,"matching":42,"precision":1,"checkable":47,"fa…`
- observed **unclear-rule runs where the reviewer reported a rule break (no bar)**: `0 of 2`
- ✓ recall: at least 95 percent of planted mistakes are caught (42 of 42, 100.0%)
- ✓ precision: at least 95 percent of rule-break findings match the right answer (42 of 42, 100.0%)
- ✓ false claims: at most 2 percent of checkable findings are marked not verified (0 of 47, 0.0%)
- ✓ clean runs: at least 95 percent have no rule-break finding (17 of 17, 100.0%)
- ✓ parsing: at least 95 percent of replies parse on the first attempt (42 of 42, 100.0%)

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
