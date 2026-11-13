# Lab run 20261113T040421Z-97c8

- **Code:** `c9d4201bbc6dbdf0262aade1b39020955ec99904` on `browser-client` (**6 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `29f58898aa3bf050…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 50 events, hash-chained; root `d691bd53ade2fffd362ea80262f5fe0b6ccffc248de488c52c2148f9af34dc15`. Verify with `node lab/verify-run.js lab/runs/20261113T040421Z-97c8`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-PAYRUN-ANALYST-ACCURACY-01 Does the pay run reviewer make mistakes that break accuracy? A scored test across many runs (held-out set) | live-external | **PASS** | 2 | 6 |  |

## E-PAYRUN-ANALYST-ACCURACY-01: Does the pay run reviewer make mistakes that break accuracy? A scored test across many runs (held-out set)

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. Scored against right answers worked out by code from the numbers, the reviewer catches at least 95 percent of planted mistakes, at least 95 percent of its rule-break findings are about a line and a code the code agrees with, at most 2 percent of its checkable findings are marked not verified, at least 95 percent of clean runs have no rule-break finding, and at least 95 percent of replies parse on the first attempt.

**What this does not prove**
- One model (Qwen/Qwen3.6-35B-A3B-FP8) at temperature 0, synthetic runs of 1 to 8 lines, one review per run, from this machine.
- The right answers come from code that reads the same rounded numbers the model is given, so the test measures rule application, not real payroll judgement.
- The development set may have been used to improve the brief; only the held-out numbers are an honest estimate, and they are not re-run.

| Step | Result | Assertions | Time |
|---|---|---|---|
| review 30 held runs, one review each, no retry, and score each against the right answer | ✓ pass | 1/1 | 88079 ms |
| the bars set in the plan before the run | ✓ pass | 5/5 | 0 ms |

### review 30 held runs, one review each, no retry, and score each against the right answer

- observed **set**: `held`
- observed **brief sha256**: `765247d1c3af6de7bf903b3facaf6f5741d19f1efb97b37207a8f318ac899768`
- observed **brief characters**: `7024`
- observed **held-gen-1**: `clean planted 0 caught 0 rule-findings 0 matching 0 false 0`
- observed **held-gen-2**: `mistake planted 3 caught 3 rule-findings 3 matching 3 false 0`
- observed **held-gen-3**: `clean planted 0 caught 0 rule-findings 0 matching 0 false 0`
- observed **held-gen-4**: `mistake planted 1 caught 1 rule-findings 1 matching 1 false 0`
- observed **held-gen-5**: `mistake planted 1 caught 1 rule-findings 1 matching 1 false 0`
- observed **held-gen-6**: `mistake planted 3 caught 3 rule-findings 3 matching 3 false 0`
- observed **held-gen-7**: `mistake planted 1 caught 1 rule-findings 1 matching 1 false 0`
- observed **held-gen-8**: `clean planted 0 caught 0 rule-findings 0 matching 0 false 0`
- observed **held-gen-9**: `mistake planted 5 caught 5 rule-findings 5 matching 5 false 0`
- observed **held-gen-10**: `mistake planted 2 caught 2 rule-findings 2 matching 2 false 0`
- observed **held-gen-11**: `mistake planted 1 caught 1 rule-findings 1 matching 1 false 0`
- observed **held-gen-12**: `clean planted 0 caught 0 rule-findings 0 matching 0 false 0`
- observed **held-gen-13**: `mistake planted 3 caught 3 rule-findings 3 matching 3 false 0`
- observed **held-gen-14**: `clean planted 0 caught 0 rule-findings 0 matching 0 false 0`
- observed **held-gen-15**: `mistake planted 1 caught 1 rule-findings 1 matching 1 false 0`
- observed **held-gen-16**: `mistake planted 2 caught 2 rule-findings 2 matching 2 false 0`
- observed **held-gen-17**: `mistake planted 1 caught 1 rule-findings 1 matching 1 false 0`
- observed **held-gen-18**: `mistake planted 1 caught 1 rule-findings 1 matching 1 false 0`
- observed **held-gen-19**: `mistake planted 3 caught 3 rule-findings 3 matching 3 false 0`
- observed **held-gen-20**: `clean planted 0 caught 0 rule-findings 0 matching 0 false 0`
- observed **held-gen-21**: `mistake planted 1 caught 1 rule-findings 1 matching 1 false 0`
- observed **held-gen-22**: `mistake planted 2 caught 2 rule-findings 2 matching 2 false 0`
- observed **held-gen-23**: `mistake planted 4 caught 4 rule-findings 4 matching 4 false 0`
- observed **held-gen-24**: `clean planted 0 caught 0 rule-findings 0 matching 0 false 0`
- observed **held-gen-25**: `mistake planted 2 caught 2 rule-findings 2 matching 2 false 0`
- observed **held-gen-26**: `mistake planted 1 caught 1 rule-findings 1 matching 1 false 0`
- observed **held-gen-27**: `mistake planted 5 caught 5 rule-findings 5 matching 5 false 0`
- observed **held-gen-28**: `mistake planted 4 caught 4 rule-findings 4 matching 4 false 0`
- observed **held-gen-29**: `clean planted 0 caught 0 rule-findings 0 matching 0 false 0`
- observed **held-gen-30**: `clean planted 0 caught 0 rule-findings 0 matching 0 false 0`
- observed **transport retries (network failures only)**: `0`
- ✓ all 30 scores were recorded

### the bars set in the plan before the run

- observed **aggregate**: `{"reviews":30,"parsed":30,"parseRate":1,"planted":47,"caught":47,"recall":1,"ruleFindings":47,"matching":47,"precision":1,"checkable":48,"fa…`
- observed **unclear-rule runs where the reviewer reported a rule break (no bar)**: `0 of 0`
- ✓ recall: at least 95 percent of planted mistakes are caught (47 of 47, 100.0%)
- ✓ precision: at least 95 percent of rule-break findings match the right answer (47 of 47, 100.0%)
- ✓ false claims: at most 2 percent of checkable findings are marked not verified (0 of 48, 0.0%)
- ✓ clean runs: at least 95 percent have no rule-break finding (9 of 9, 100.0%)
- ✓ parsing: at least 95 percent of replies parse on the first attempt (30 of 30, 100.0%)

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
