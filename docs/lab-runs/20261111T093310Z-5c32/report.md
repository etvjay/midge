# Lab run 20261111T093310Z-5c32

- **Code:** `9b18791320a6152e3cd74bbf3db787934b1c9dab` on `payrun-hardware` (**5 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `99a59326369ec75f…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 41 events, hash-chained; root `560018ba18538ba6ab59fba481f586f9a0a4aed00f5859aee50b48b26605460c`. Verify with `node lab/verify-run.js lab/runs/20261111T093310Z-5c32`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-OUTLAYER-SETTLE-01 An OutLayer program holding a protected Ed25519 seed signs a Midge settlement that the production contract accepts | live-external | **FAIL** | 7 | 17 (5 failed) |  |

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
| prediction 1: two separate OutLayer runs report the same Ed25519 public key | ✓ pass | 4/4 | 31245 ms |
| set up: a depositor, a recipient, and a group on the production contract whose room key is the OutLayer program's key | ✓ pass | 2/2 | 8846 ms |
| prediction 3: the program refuses allocations above the bound it was given | ✓ pass | 2/2 | 25689 ms |
| prediction 2: a settlement signed inside OutLayer is accepted by the contract and pays exactly | ✗ fail | 1/4 | 64542 ms |
| prediction 4: replaying the used signature after the settlement is refused | ✗ fail | 0/2 | 2078 ms |
| teardown: the depositor leaves with the rest, the group is pruned, the accounts are deleted | ✓ pass | 2/2 | 18441 ms |

### preflight: the CLI is logged in on testnet as the throwaway account

- ✓ whoami names the throwaway account on testnet

### prediction 1: two separate OutLayer runs report the same Ed25519 public key

- evidence outlayer: {"txA":"EcQJGsCxvxNcHrVDUQjw7bQ8cMaNnabYYt4h2hFhn3G","txB":"BfXFsZXjbeR5We91CuxuX7GQbCnLBXTJUm5Dm7GgbhkS","attemptsA":2,"attemptsB":1}
- ✓ both runs succeeded
- ✓ the key is 32 bytes of hex
- ✓ the two runs report the same key
- ✓ the results are under 900 bytes

### set up: a depositor, a recipient, and a group on the production contract whose room key is the OutLayer program's key

- ✓ the group was hatched with the OutLayer key as its room key
- ✓ the depositor deposited 0.05

### prediction 3: the program refuses allocations above the bound it was given

- evidence outlayer: {"tx":"7vrCxdpB1WX1Vj3GREnpUiAhTNW2XVHKu1yiYmBNEift"}
- ✓ it answered, and declined to sign
- ✓ and said why: the bound

### prediction 2: a settlement signed inside OutLayer is accepted by the contract and pays exactly

- evidence outlayer: {"tx":null}
- ✗ OutLayer returned a signature — expected , got null
- ✗ it is the same key as before — expected , got 
- ✗ the allocations hash the program computed equals the repo's own function — expected , got 
- ✓ the result is under 900 bytes

### prediction 4: replaying the used signature after the settlement is refused

- evidence tx: {"label":"replay","hash":"GpNBjuqB39KUPph4wh7KoQedfXGgMkiYEpNWERV2SAv8","ok":false,"error":"Smart contract panicked: Failed to deserialize input from JSON. Error: `invalid type: null, expected a string at line 1 column 2…
- ✗ the replay is refused — expected , got Smart contract panicked: Failed to deserialize input from JSON. Error: `invalid type: null, expected a string at line 1 column 284`
- ✗ and the group still holds 0.03 — expected , got 

### teardown: the depositor leaves with the rest, the group is pruned, the accounts are deleted

- observed **teardown**: `{"pruned":1,"notPruned":[],"deleted":2,"kept":[],"failed":[]}`
- ✓ the group was pruned and both accounts deleted
- ✓ the contract holds the groups it started with

## Problems found

| Severity | Where | Problem |
|---|---|---|
| critical | E-OUTLAYER-SETTLE-01 / prediction 2: a settlement signed inside OutLayer is accepted by the contract and pays exactly | step threw: Cannot read properties of null (reading 'signature') — {"stack":["TypeError: Cannot read properties of null (reading 'signature')","    at file:///home/ubuntu/near/lab/experiments/114-outlayer-settle-live.js:98:22","    at Object.step (file:///home/ubuntu… |
| major | E-OUTLAYER-SETTLE-01 / prediction 2: a settlement signed inside OutLayer is accepted by the contract and pays exactly | assertion failed: OutLayer returned a signature — {"actual":null} |
| major | E-OUTLAYER-SETTLE-01 / prediction 2: a settlement signed inside OutLayer is accepted by the contract and pays exactly | assertion failed: it is the same key as before — {} |
| major | E-OUTLAYER-SETTLE-01 / prediction 2: a settlement signed inside OutLayer is accepted by the contract and pays exactly | assertion failed: the allocations hash the program computed equals the repo's own function — {} |
| major | E-OUTLAYER-SETTLE-01 / prediction 4: replaying the used signature after the settlement is refused | assertion failed: the replay is refused — {"actual":"Smart contract panicked: Failed to deserialize input from JSON. Error: `invalid type: null, expected a string at line 1 column 284`"} |
| major | E-OUTLAYER-SETTLE-01 / prediction 4: replaying the used signature after the settlement is refused | assertion failed: and the group still holds 0.03 — {} |
