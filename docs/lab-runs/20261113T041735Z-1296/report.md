# Lab run 20261113T041735Z-1296

- **Code:** `acaa451e138af84f9912c54de310304d10ec39f9` on `browser-client` (**1 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `29f58898aa3bf050…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 37 events, hash-chained; root `e09be7f8f871afefc6d06d7c1c25327de8cbcfe9c8cd261d67c6e6889429e79d`. Verify with `node lab/verify-run.js lab/runs/20261113T041735Z-1296`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-PAYRUN-ANALYST-REPRO-01 The engineered pay run reviewer, twenty times on the attested NEAR AI Cloud model: the planted mistake is caught every time, the corrected run is passed every time, and no claim is false | live-external | **PASS** | 2 | 6 |  |

## E-PAYRUN-ANALYST-REPRO-01: The engineered pay run reviewer, twenty times on the attested NEAR AI Cloud model: the planted mistake is caught every time, the corrected run is passed every time, and no claim is false

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. Ten reviews of a run with one planted mistake (a line with no tax withheld) each have a code-verified finding on that line with zero-deduction or rate-below-schedule; ten reviews of the corrected run have none of the four rule-break codes; none of the twenty has a false claim; all twenty parse on the first attempt; and the set of catches is identical across the ten.

**What this does not prove**
- One model (Qwen/Qwen3.6-35B-A3B-FP8), temperature 0, two synthetic runs of four lines, run from this machine.
- It shows repeatability on this input, not general accuracy on payroll. The mistake is planted and is of a kind the brief names.
- The model has no authority on tax law and is told to reason only from the employer's rules.

| Step | Result | Assertions | Time |
|---|---|---|---|
| ask the attested model 10 times on each run, with no retry | ✓ pass | 1/1 | 99191 ms |
| prediction 1 to 5: caught every time, passed every time, no false claims, the same set | ✓ pass | 5/5 | 1 ms |

### ask the attested model 10 times on each run, with no retry

- observed **the brief (characters)**: `7024`
- observed **P1**: `A:zero-deduction:verified`
- observed **P2**: `A:zero-deduction:verified`
- observed **P3**: `A:zero-deduction:verified`
- observed **P4**: `A:zero-deduction:verified`
- observed **P5**: `A:zero-deduction:verified`
- observed **P6**: `A:zero-deduction:verified`
- observed **P7**: `A:zero-deduction:verified`
- observed **P8**: `A:zero-deduction:verified`
- observed **P9**: `A:zero-deduction:verified`
- observed **P10**: `A:zero-deduction:verified`
- observed **C1**: `no findings`
- observed **C2**: `no findings`
- observed **C3**: `no findings`
- observed **C4**: `no findings`
- observed **C5**: `no findings`
- observed **C6**: `no findings`
- observed **C7**: `no findings`
- observed **C8**: `no findings`
- observed **C9**: `no findings`
- observed **C10**: `no findings`
- ✓ all 20 replies were used on the first attempt

### prediction 1 to 5: caught every time, passed every time, no false claims, the same set

- ✓ the planted mistake (line A) is caught in 10 of 10 reviews
- ✓ no review contains a false claim (a checkable finding the code marks not verified)
- ✓ the corrected run is passed in 10 of 10 reviews (none of the four rule-break codes)
- observed **distinct catch sets on P**: `["[\"A:zero-deduction\"]"]`
- observed **distinct catch sets on C**: `["[]"]`
- ✓ the set of catches is identical across the ten reviews of the planted run
- ✓ and empty across the ten reviews of the corrected run

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
