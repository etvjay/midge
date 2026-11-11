# Lab run 20261111T114956Z-9ee3

- **Code:** `7e668a8ce214146f8b1387a06cd0f669953887a6` on `completeness` (**5 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `73f42e651241e148…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 51 events, hash-chained; root `b3d021351591016ca30acfe9125be9253c5b82b596232622d65b86cd41ce800b`. Verify with `node lab/verify-run.js lab/runs/20261111T114956Z-9ee3`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-OUTLAYER-CONTRACT-01 A NEAR contract triggers an OutLayer program and its callback receives the output; the signature it returns settles a Midge group on the production contract | live-external | **PASS** | 7 | 24 |  |

## E-OUTLAYER-CONTRACT-01: A NEAR contract triggers an OutLayer program and its callback receives the output; the signature it returns settles a Midge group on the production contract

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. A caller contract deployed on the throwaway account makes every OutLayer call; only its owner may; the callback stores the output; a signature obtained that way is accepted by the production contract and pays exactly.

**What this does not prove**
- The caller is a small purpose-built contract; the Midge contract itself does not call OutLayer, so the signature is presented to Midge by an account.
- OutLayer's on-chain call path failed intermittently in the earlier experiment (cause unknown), so calls are retried up to three times and the attempt count is recorded.
- This run does not verify the worker's TDX quote. OutLayer is a third-party platform. Testnet only.

| Step | Result | Assertions | Time |
|---|---|---|---|
| prediction 1: the caller contract is deployed on the throwaway account, owner-only, and needs a deposit | ✓ pass | 4/4 | 7349 ms |
| prediction 2: the contract calls OutLayer twice and its callback receives the same Ed25519 public key both times | ✓ pass | 4/4 | 22451 ms |
| set up: a depositor, a recipient, and a group on the production contract whose room key is the OutLayer program's key | ✓ pass | 2/2 | 9528 ms |
| prediction 3 (bound): the program refuses allocations above the bound it was given | ✓ pass | 2/2 | 10968 ms |
| prediction 3: a contract-triggered signature is accepted by the contract and pays exactly | ✓ pass | 8/8 | 14771 ms |
| prediction 3 (replay): replaying the used signature after the settlement is refused | ✓ pass | 2/2 | 2047 ms |
| teardown: the depositor leaves with the rest, the group is pruned, the accounts are deleted | ✓ pass | 2/2 | 19952 ms |

### prediction 1: the caller contract is deployed on the throwaway account, owner-only, and needs a deposit

- evidence caller: {"account":"ol.fly-1793636729.testnet","codeHash":"ECX5VLz6wMRfbnCsSRKhwDzTXLSuXjsewmTBPpZca4oY","localBuild":"ECX5VLz6wMRfbnCsSRKhwDzTXLSuXjsewmTBPpZca4oY","bytes":149604}
- ✓ the caller contract on the throwaway account is the build in this repository
- ✓ its owner is the throwaway account and it points at the midge-room-signer project
- evidence tx: {"label":"request from the main account","hash":"2AZWXnyDzGWjAhSJQonwBSikfMe2u2Gga1qQNJCm5XrE","ok":false,"error":"Smart contract panicked: only the owner may trigger a run"}
- ✓ a request from an account that is not the owner is refused
- ✓ a request with less than 0.003 NEAR attached is refused

### prediction 2: the contract calls OutLayer twice and its callback receives the same Ed25519 public key both times

- evidence outlayer: {"txA":"FgQS2zkPzJZBEbWFpA8f6V6a7T75vDZ6x6bZHwVgaZfc","txB":"3415kM4dzi11KZgbowh3xMagdWALrNuLP2cru7aDyJGz","attemptsA":1,"attemptsB":1}
- ✓ both runs succeeded
- ✓ the key is 32 bytes of hex
- ✓ the two runs report the same key
- ✓ the results are under 900 bytes

### set up: a depositor, a recipient, and a group on the production contract whose room key is the OutLayer program's key

- ✓ the group was hatched with the OutLayer key as its room key
- ✓ the depositor deposited 0.05

### prediction 3 (bound): the program refuses allocations above the bound it was given

- evidence outlayer: {"tx":"6aTfcTMqApzsC8jBEf28p4bhA3f2bhCCSRipbLLhiyd4"}
- ✓ it answered, and declined to sign
- ✓ and said why: the bound

### prediction 3: a contract-triggered signature is accepted by the contract and pays exactly

- evidence outlayer: {"tx":"AUoAWXeAWcdTK885ZUeQXEvA2du9HNgDmCi1gT6ptr9Q","attempts":1}
- ✓ OutLayer returned a signature
- ✓ it is the same key as before
- ✓ the allocations hash the program computed equals the repo's own function
- ✓ the result is under 900 bytes
- evidence tx: {"label":"settle with different allocations","hash":"5Dp8YTwudBoiu9d56823QYQWbGkLXsMX5MHAkMJrW7R6","ok":false,"error":"Smart contract panicked: panicked at src/lib.rs:1156:17:\n[HAQ REJECT] Invalid enclave Ed25519 signat…
- ✓ prediction 4: the same signature with 0.03 instead of 0.02 is refused
- evidence tx: {"label":"settle_batch signed by OutLayer","hash":"8F1cuTJPMVGSkNziey63QYdJLGn46zKgZXnHq9Y8eZ7A","ok":true,"explorer":"https://testnet.nearblocks.io/txns/8F1cuTJPMVGSkNziey63QYdJLGn46zKgZXnHq9Y8eZ7A","error":null}
- ✓ the contract accepted the settlement the OutLayer program signed
- ✓ the recipient received exactly 0.02 NEAR and nothing else moved
- ✓ the recipient's balance rose by 0.02

### prediction 3 (replay): replaying the used signature after the settlement is refused

- evidence tx: {"label":"replay","hash":"HEr8NbJPL835LSrmiYtjV4UM9f7j3HUZtUYhMKrAJgcq","ok":false,"error":"Smart contract panicked: panicked at src/lib.rs:991:9:\nassertion `left == right` failed: [HAQ REJECT] Nonce mismatch. Replay at…
- ✓ the replay is refused
- ✓ and the group still holds 0.03

### teardown: the depositor leaves with the rest, the group is pruned, the accounts are deleted

- observed **teardown**: `{"pruned":1,"notPruned":[],"deleted":2,"kept":[],"failed":[]}`
- ✓ the group was pruned and both accounts deleted
- ✓ the contract holds the groups it started with

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
