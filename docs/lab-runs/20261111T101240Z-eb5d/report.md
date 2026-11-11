# Lab run 20261111T101240Z-eb5d

- **Code:** `cd55a54a43fa1bd0ac2225f9e0596234bf20c05c` on `gap050-pin` (**3 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `99a59326369ec75f…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 26 events, hash-chained; root `8d22c7ed73c324be161b2b4d362788ae7d91a46a792505a60a19bb608f25463d`. Verify with `node lab/verify-run.js lab/runs/20261111T101240Z-eb5d`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-HOSTED-FAILCLOSED-LIVE-01 The hosted Roost fails closed on real TDX hardware: with both escrow providers unreachable it refuses a charged round (503), keeps the bid and signs nothing | hardware | **FAIL** | 5 | 7 (1 failed) |  |

## E-HOSTED-FAILCLOSED-LIVE-01: The hosted Roost fails closed on real TDX hardware: with both escrow providers unreachable it refuses a charged round (503), keeps the bid and signs nothing

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. Inside a real confidential VM whose two providers can never resolve, a charged round is refused with 503 in bounded time, the sealed bid is still there afterwards, nothing can be signed, and retrying gives the same answer.

**What this does not prove**
- The first promoted run of this experiment (older build) sent an unsigned bid. On the signed-only compose that fails (run 20261111T094151Z-c01e, GAP-050); this version sends a signed bid from a throwaway account.
- The providers are on the reserved .invalid domain, so this shows a total outage, not a partial one (partial failure is covered offline).
- It does not show recovery: the providers are fixed in the VM's measured compose file, so recovery needs a second VM.
- The compose file is a test fixture that differs from the real one only in the two escrow provider URLs; it is attested here but is not a deployment members should trust.
- The account-check providers failing is covered by unit tests, not here. One operator controls the VM and the throwaway account (0.1 NEAR, deleted).

| Step | Result | Assertions | Time |
|---|---|---|---|
| preflight: the Phala account is empty and the fixture is the pinned image with unresolvable providers | ✗ fail | 3/4 | 2291 ms |
| deploy the fixture on a real TDX VM (capped by a dead-man's switch) | – skip | 0/0 | 0 ms |
| prediction 1: the VM attests, and the attestation covers the unreachable settings | – skip | 0/0 | 0 ms |
| teardown: delete the throwaway account | ✓ pass | 1/1 | 0 ms |
| prediction 5: teardown: delete the VM and prove the account is empty | ✓ pass | 2/2 | 2439 ms |

### preflight: the Phala account is empty and the fixture is the pinned image with unresolvable providers

- ✗ no CVM is already running on the account — expected , got ["midge-lab-11111011"]
- ✓ the fixture pins a CI-built image digest
- ✓ its escrow providers are on the reserved .invalid domain
- ✓ prediction 8: its account-check providers are two different, reachable ones
- observed **instance type and rate**: `{"type":"tdx.small","usdPerHour":0.058}`

### deploy the fixture on a real TDX VM (capped by a dead-man's switch)

- skipped: an earlier critical step failed

### prediction 1: the VM attests, and the attestation covers the unreachable settings

- skipped: an earlier critical step failed

### teardown: delete the throwaway account

- ✓ nothing to tear down

### prediction 5: teardown: delete the VM and prove the account is empty

- observed **teardown**: `{"deleted":true,"note":"no VM was created"}`
- ✓ the VM was deleted
- ✓ no CVM is left running on the account

## Problems found

| Severity | Where | Problem |
|---|---|---|
| critical | E-HOSTED-FAILCLOSED-LIVE-01 /  | experiment threw outside a step: Cannot read properties of null (reading 'url') — {"stack":["TypeError: Cannot read properties of null (reading 'url')","    at Object.run (file:///home/ubuntu/near/lab/experiments/106-hosted-failclosed-live.js:65:58)","    at process.processTicksAnd… |
| major | E-HOSTED-FAILCLOSED-LIVE-01 / preflight: the Phala account is empty and the fixture is the pinned image with unresolvable providers | assertion failed: no CVM is already running on the account — {"actual":["midge-lab-11111011"]} |
