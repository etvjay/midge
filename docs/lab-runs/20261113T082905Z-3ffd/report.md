# Lab run 20261113T082905Z-3ffd

- **Code:** `a2faef585060f273ac4a447d690af324fa1447cb` on `browser-client` (**6 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `29f58898aa3bf050…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 25 events, hash-chained; root `f17222d6aaeb577fd4b9c981a255967b0dbca784bdfa04018adb59d81cf889ed`. Verify with `node lab/verify-run.js lab/runs/20261113T082905Z-3ffd`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-PAYRUN-MAKER-CHECKER-01 Maker-checker for pay runs: a run that names an approver is not signed until that different account approves that exact run | offline | **PASS** | 2 | 17 |  |

## E-PAYRUN-MAKER-CHECKER-01: Maker-checker for pay runs: a run that names an approver is not signed until that different account approves that exact run

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. Without an approver a pay run signs as before; with one, the room refuses to sign until the approver, a different account, signs an approval bound to the round, the run id and the order hash with a key that belongs to the approver's account; the approver's sealed summary matches the run; and approval and signing each happen once.

**What this does not prove**
- Offline, on a local room with a simulated attestation provider and a stubbed account-key check. The contract does not check the approval; the room does.

| Step | Result | Assertions | Time |
|---|---|---|---|
| without an approver nothing changes | ✓ pass | 2/2 | 30 ms |
| with an approver, nothing is signed until the approval, and only the approver counts | ✓ pass | 15/15 | 34 ms |

### without an approver nothing changes

- ✓ the run reports no approval needed
- ✓ and it signs as before

### with an approver, nothing is signed until the approval, and only the approver counts

- ✓ naming the employer as approver is refused
- ✓ the run says an approval is needed and by whom
- ✓ signing before the approval is refused and names it
- ✓ the approver's sealed summary carries the same order hash, headcount, totals and transfers
- ✓ the summary does not open with another key
- ✓ an approval signed by a stranger's key is refused
- ✓ an approval sent by the employer is refused
- ✓ an approval for a different order hash is refused
- ✓ an approval for a different run id is refused
- ✓ an approval signed for another round is refused
- ✓ still nothing can be signed
- ✓ the approver's own approval is accepted
- ✓ a second approval is refused
- ✓ then the room signs, with the usual seven-field message
- ✓ and a second signature is refused

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
