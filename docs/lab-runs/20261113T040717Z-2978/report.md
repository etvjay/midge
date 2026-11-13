# Lab run 20261113T040717Z-2978

- **Code:** `59f951081e633b5a4abc3cacc0f52c4c0574859b` on `browser-client` (**1 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `29f58898aa3bf050…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 36 events, hash-chained; root `51b4f2528166290892f52c5d3b27de348dfff64bdde9f884237423513a16d9de`. Verify with `node lab/verify-run.js lab/runs/20261113T040717Z-2978`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-PAYRUN-ANALYST-ACCURACY-01 Does the pay run reviewer make mistakes that break accuracy? A scored test across many runs (hard held-out set) | live-external | **PASS** | 2 | 6 |  |

## E-PAYRUN-ANALYST-ACCURACY-01: Does the pay run reviewer make mistakes that break accuracy? A scored test across many runs (hard held-out set)

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. Scored against right answers worked out by code from the numbers, the reviewer catches at least 95 percent of planted mistakes, at least 95 percent of its rule-break findings are about a line and a code the code agrees with, at most 2 percent of its checkable findings are marked not verified, at least 95 percent of clean runs have no rule-break finding, and at least 95 percent of replies parse on the first attempt.

**What this does not prove**
- One model (Qwen/Qwen3.6-35B-A3B-FP8) at temperature 0, synthetic runs of 1 to 8 lines, one review per run, from this machine.
- The right answers come from code that reads the same rounded numbers the model is given, so the test measures rule application, not real payroll judgement.
- The development set may have been used to improve the brief; only the held-out numbers are an honest estimate, and they are not re-run.

| Step | Result | Assertions | Time |
|---|---|---|---|
| review 16 hard runs, one review each, no retry, and score each against the right answer | ✓ pass | 1/1 | 49264 ms |
| the bars set in the plan before the run | ✓ pass | 5/5 | 1 ms |

### review 16 hard runs, one review each, no retry, and score each against the right answer

- observed **set**: `hard`
- observed **brief sha256**: `765247d1c3af6de7bf903b3facaf6f5741d19f1efb97b37207a8f318ac899768`
- observed **brief characters**: `7024`
- observed **hard-tax-point-one-under**: `mistake planted 1 caught 1 rule-findings 1 matching 1 false 0`
- observed **hard-benefits-point-one-over**: `mistake planted 1 caught 1 rule-findings 1 matching 1 false 0`
- observed **hard-benefits-exactly-at-cap**: `clean planted 0 caught 0 rule-findings 0 matching 0 false 0`
- observed **hard-two-lines-no-tax**: `mistake planted 2 caught 2 rule-findings 2 matching 2 false 0`
- observed **hard-extreme-tax-rate**: `mistake planted 1 caught 1 rule-findings 1 matching 1 false 0`
- observed **hard-no-benefits-at-all**: `clean planted 0 caught 0 rule-findings 0 matching 0 false 0`
- observed **hard-stated-tax-zero**: `mistake planted 1 caught 1 rule-findings 1 matching 1 false 0`
- observed **hard-cap-zero**: `mistake planted 1 caught 1 rule-findings 1 matching 1 false 0`
- observed **hard-fractional-rate**: `mistake planted 1 caught 1 rule-findings 1 matching 1 false 0`
- observed **hard-identical-lines**: `clean planted 0 caught 0 rule-findings 0 matching 0 false 0`
- observed **hard-very-different-gross**: `clean planted 0 caught 0 rule-findings 0 matching 0 false 0`
- observed **hard-larger-mixed-run**: `mistake planted 4 caught 4 rule-findings 4 matching 4 false 0`
- observed **hard-unclear-contractors**: `unclear planted 0 caught 0 rule-findings 0 matching 0 false 0`
- observed **hard-unclear-approximately**: `unclear planted 2 caught 2 rule-findings 2 matching 2 false 0`
- observed **hard-unclear-rules-disagree**: `unclear planted 0 caught 0 rule-findings 0 matching 0 false 0`
- observed **hard-unclear-exemption**: `unclear planted 1 caught 1 rule-findings 1 matching 1 false 0`
- observed **transport retries (network failures only)**: `0`
- ✓ all 16 scores were recorded

### the bars set in the plan before the run

- observed **aggregate**: `{"reviews":16,"parsed":16,"parseRate":1,"planted":12,"caught":12,"recall":1,"ruleFindings":12,"matching":12,"precision":1,"checkable":21,"fa…`
- observed **unclear-rule runs where the reviewer reported a rule break (no bar)**: `2 of 4`
- ✓ recall: at least 90 percent of planted mistakes are caught (12 of 12, 100.0%)
- ✓ precision: at least 90 percent of rule-break findings match the right answer (12 of 12, 100.0%)
- ✓ false claims: at most 5 percent of checkable findings are marked not verified (0 of 21, 0.0%)
- ✓ clean runs: at least 90 percent have no rule-break finding (4 of 4, 100.0%)
- ✓ parsing: at least 95 percent of replies parse on the first attempt (16 of 16, 100.0%)

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
