# Lab run 20261111T093643Z-7985

- **Code:** `9b18791320a6152e3cd74bbf3db787934b1c9dab` on `payrun-hardware` (**5 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `99a59326369ec75f…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 46 events, hash-chained; root `7d6a71ee0e84ef18896c1ce56e04bc359fe393f58cdede80b58cb825c5239a2e`. Verify with `node lab/verify-run.js lab/runs/20261111T093643Z-7985`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-OUTLAYER-SETTLE-01 An OutLayer program holding a protected Ed25519 seed signs a Midge settlement that the production contract accepts | live-external | **PASS** | 7 | 21 |  |

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
| preflight: the CLI is logged in on testnet as the throwaway account | ✓ pass | 1/1 | 7 ms |
| prediction 1: two separate OutLayer runs report the same Ed25519 public key | ✓ pass | 4/4 | 31983 ms |
| set up: a depositor, a recipient, and a group on the production contract whose room key is the OutLayer program's key | ✓ pass | 2/2 | 9563 ms |
| prediction 3: the program refuses allocations above the bound it was given | ✓ pass | 2/2 | 8735 ms |
| prediction 2: a settlement signed inside OutLayer is accepted by the contract and pays exactly | ✓ pass | 8/8 | 14600 ms |
| prediction 4: replaying the used signature after the settlement is refused | ✓ pass | 2/2 | 2022 ms |
| teardown: the depositor leaves with the rest, the group is pruned, the accounts are deleted | ✓ pass | 2/2 | 19988 ms |

### preflight: the CLI is logged in on testnet as the throwaway account

- ✓ whoami names the throwaway account on testnet

### prediction 1: two separate OutLayer runs report the same Ed25519 public key

- evidence outlayer: {"txA":"2Z2tCgdoEvAcT2HCc7jrH48Qn1q5d469ceQr3k9XveZd","txB":"DHRPeSgf7txrNVx4Lm5oReq65W6ksbUXfYg9u64w7XYr","attemptsA":1,"attemptsB":2}
- ✓ both runs succeeded
- ✓ the key is 32 bytes of hex
- ✓ the two runs report the same key
- ✓ the results are under 900 bytes

### set up: a depositor, a recipient, and a group on the production contract whose room key is the OutLayer program's key

- ✓ the group was hatched with the OutLayer key as its room key
- ✓ the depositor deposited 0.05

### prediction 3: the program refuses allocations above the bound it was given

- evidence outlayer: {"tx":"7DTKwXnQVNVmJ4D37sukJKkk6wYSKb7E8DURmX3g8AJP"}
- ✓ it answered, and declined to sign
- ✓ and said why: the bound

### prediction 2: a settlement signed inside OutLayer is accepted by the contract and pays exactly

- evidence outlayer: {"tx":"BeQZYheGrFtqYEf5jjAjUELD1qDs88tKraQJdbxxMBk7","attempts":1}
- ✓ OutLayer returned a signature
- ✓ it is the same key as before
- ✓ the allocations hash the program computed equals the repo's own function
- ✓ the result is under 900 bytes
- evidence tx: {"label":"settle with different allocations","hash":"E9gqpSxACdLvuzUALJ3irefJDp75pf9oPgsdukVaBASf","ok":false,"error":"Smart contract panicked: panicked at src/lib.rs:1156:17:\n[HAQ REJECT] Invalid enclave Ed25519 signat…
- ✓ prediction 4: the same signature with 0.03 instead of 0.02 is refused
- evidence tx: {"label":"settle_batch signed by OutLayer","hash":"pgiTZU1EWs49eacgjckg3K8SBTzCnTcHkj93gQ6pnZY","ok":true,"explorer":"https://testnet.nearblocks.io/txns/pgiTZU1EWs49eacgjckg3K8SBTzCnTcHkj93gQ6pnZY","error":null}
- ✓ the contract accepted the settlement the OutLayer program signed
- ✓ the recipient received exactly 0.02 NEAR and nothing else moved
- ✓ the recipient's balance rose by 0.02

### prediction 4: replaying the used signature after the settlement is refused

- evidence tx: {"label":"replay","hash":"B8hWoZnQqqPYb6yd1M9z3CjFete1X9hY86afzCnnQNyc","ok":false,"error":"Smart contract panicked: panicked at src/lib.rs:991:9:\nassertion `left == right` failed: [HAQ REJECT] Nonce mismatch. Replay at…
- ✓ the replay is refused
- ✓ and the group still holds 0.03

### teardown: the depositor leaves with the rest, the group is pruned, the accounts are deleted

- observed **teardown**: `{"pruned":1,"notPruned":[],"deleted":2,"kept":[],"failed":[]}`
- ✓ the group was pruned and both accounts deleted
- ✓ the contract holds the groups it started with

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
