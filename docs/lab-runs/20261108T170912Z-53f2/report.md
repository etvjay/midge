# Lab run 20261108T170912Z-53f2

- **Code:** `87378a8084af785822a9650d2556d6bae15fac70` on `master` (**6 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `edd3ff37e9a64d22…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 38 events, hash-chained; root `e414807c2990cd90eeb91d96e562794d61b05eee06f43e9de5f059c2428e7b79`. Verify with `node lab/verify-run.js lab/runs/20261108T170912Z-53f2`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-MODEL-PIN-LIVE-01 The measurement pin against the real NEAR AI host: the baseline is accepted, a wrong value is refused, a list works | cloud | **PASS** | 5 | 22 |  |

## E-MODEL-PIN-LIVE-01: The measurement pin against the real NEAR AI host: the baseline is accepted, a wrong value is refused, a list works

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. The real host reports the same measurements on every read; the recorded baseline equals them; a fetch pinned to the baseline is accepted with the Intel chain and TCB checked; one wrong field is refused by name; a list holding the wrong and the right value is accepted. Read-only; no API key; spends nothing.

**What this does not prove**
- The baseline is what was observed on one day. This does not show it is the build NEAR AI publishes, that the values stay the same for days, or what happens when NEAR AI ships a new build.
- The Intel certificate chain check needs dcap-qvl on the machine.

| Step | Result | Assertions | Time |
|---|---|---|---|
| prediction 1: the real host's measurements hold still across three reads, each with a fresh nonce | ✓ pass | 2/2 | 1781 ms |
| prediction 2: the recorded baseline matches what the host reports now | ✓ pass | 5/5 | 2 ms |
| prediction 3: a fetch pinned to the baseline is accepted, chain verified, and says it was pinned | ✓ pass | 4/4 | 438 ms |
| prediction 4: one wrong field is refused, naming that field, for each of the five | ✓ pass | 10/10 | 924 ms |
| prediction 5: a list holding a wrong value and the right one is accepted | ✓ pass | 1/1 | 166 ms |

### prediction 1: the real host's measurements hold still across three reads, each with a fresh nonce

- observed **model**: `Qwen/Qwen3.6-35B-A3B-FP8`
- observed **TCB status**: `UpToDate`
- ✓ all six registers are identical across the reads
- ✓ the Intel certificate chain was verified and the TCB is acceptable

### prediction 2: the recorded baseline matches what the host reports now

- ✓ mrtd is in the baseline
- ✓ rtmr0 is in the baseline
- ✓ rtmr1 is in the baseline
- ✓ rtmr2 is in the baseline
- ✓ rtmr3 is in the baseline

### prediction 3: a fetch pinned to the baseline is accepted, chain verified, and says it was pinned

- ✓ accepted
- ✓ reported as pinned
- ✓ the certificate chain check ran and passed
- ✓ the TCB status is acceptable

### prediction 4: one wrong field is refused, naming that field, for each of the five

- ✓ a wrong mrtd is refused
- ✓ and the refusal names mrtd
- ✓ a wrong rtmr0 is refused
- ✓ and the refusal names rtmr0
- ✓ a wrong rtmr1 is refused
- ✓ and the refusal names rtmr1
- ✓ a wrong rtmr2 is refused
- ✓ and the refusal names rtmr2
- ✓ a wrong rtmr3 is refused
- ✓ and the refusal names rtmr3

### prediction 5: a list holding a wrong value and the right one is accepted

- ✓ accepted, as a rotation would be

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
