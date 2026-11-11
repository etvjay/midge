# Lab run 20261111T093006Z-7ddf

- **Code:** `9b18791320a6152e3cd74bbf3db787934b1c9dab` on `payrun-hardware` (**3 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `99a59326369ec75f…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 30 events, hash-chained; root `a4cabdb74ff96d21433991fac81e90f62b58bf6853b382bf049f7522c17e54f5`. Verify with `node lab/verify-run.js lab/runs/20261111T093006Z-7ddf`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-OUTLAYER-SETTLE-01 An OutLayer program holding a protected Ed25519 seed signs a Midge settlement that the production contract accepts | live-external | **FAIL** | 7 | 6 (2 failed) |  |

## E-OUTLAYER-SETTLE-01: An OutLayer program holding a protected Ed25519 seed signs a Midge settlement that the production contract accepts

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. The OutLayer program reports a stable key; a settlement it signs (after recomputing the allocations hash itself) is accepted by the contract and pays exactly; it refuses allocations outside its bound; its signature does not cover different allocations and cannot be replayed.

**What this does not prove**
- This does not move the room to OutLayer: only the settlement-signing step runs there. Sealed inputs, aggregation and the escrow read stay where they are.
- The program trusts the caller for the bound and the order hash, so it is a signing step, not a room.
- OutLayer is a third-party platform; its workers are registered on chain once, and this run does not verify the worker's TDX quote.
- The run is triggered by an account through the outlayer CLI (a request_execution call), not by a NEAR contract.
- Testnet only.

| Step | Result | Assertions | Time |
|---|---|---|---|
| preflight: the CLI is logged in on testnet as the throwaway account | ✓ pass | 1/1 | 13 ms |
| prediction 1: two separate OutLayer runs report the same Ed25519 public key | ✗ fail | 2/4 | 21632 ms |
| set up: a depositor, a recipient, and a group on the production contract whose room key is the OutLayer program's key | – skip | 0/0 | 0 ms |
| prediction 3: the program refuses allocations above the bound it was given | – skip | 0/0 | 0 ms |
| prediction 2: a settlement signed inside OutLayer is accepted by the contract and pays exactly | – skip | 0/0 | 0 ms |
| prediction 4: replaying the used signature after the settlement is refused | – skip | 0/0 | 0 ms |
| teardown: the depositor leaves with the rest, the group is pruned, the accounts are deleted | ✓ pass | 1/1 | 0 ms |

### preflight: the CLI is logged in on testnet as the throwaway account

- ✓ whoami names the throwaway account on testnet

### prediction 1: two separate OutLayer runs report the same Ed25519 public key

- evidence outlayer: {"txA":null,"txB":null}
- ✗ both runs succeeded — expected , got [null,"Executing on-chain with NEAR deposit.\n\nRunning ol.fly-1793636729.testnet/midge-room-signer (on-chain, ~0.0020 NEAR)...\nError: On-chain execution faile…
- ✗ the key is 32 bytes of hex — expected , got null
- ✓ the two runs report the same key
- ✓ the results are under 900 bytes

### set up: a depositor, a recipient, and a group on the production contract whose room key is the OutLayer program's key

- skipped: an earlier critical step failed

### prediction 3: the program refuses allocations above the bound it was given

- skipped: an earlier critical step failed

### prediction 2: a settlement signed inside OutLayer is accepted by the contract and pays exactly

- skipped: an earlier critical step failed

### prediction 4: replaying the used signature after the settlement is refused

- skipped: an earlier critical step failed

### teardown: the depositor leaves with the rest, the group is pruned, the accounts are deleted

- ✓ nothing to tear down

## Problems found

| Severity | Where | Problem |
|---|---|---|
| critical | E-OUTLAYER-SETTLE-01 / prediction 1: two separate OutLayer runs report the same Ed25519 public key | step threw: Cannot read properties of null (reading 'public_key') — {"stack":["TypeError: Cannot read properties of null (reading 'public_key')","    at ctx.step.critical (file:///home/ubuntu/near/lab/experiments/114-outlayer-settle-live.js:51:23)","    at Object.step… |
| major | E-OUTLAYER-SETTLE-01 / prediction 1: two separate OutLayer runs report the same Ed25519 public key | assertion failed: both runs succeeded — {"actual":[null,"Executing on-chain with NEAR deposit.\n\nRunning ol.fly-1793636729.testnet/midge-room-signer (on-chain, ~0.0020 NEAR)...\nError: On-chain execution failed\n\nCaused by:\n    0: Transa… |
| major | E-OUTLAYER-SETTLE-01 / prediction 1: two separate OutLayer runs report the same Ed25519 public key | assertion failed: the key is 32 bytes of hex — {"actual":null} |
