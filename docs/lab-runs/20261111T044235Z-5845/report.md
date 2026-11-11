# Lab run 20261111T044235Z-5845

- **Code:** `904dc2bb5bf4ed1f0eb6779085f23a34c37d0097` on `gap-closure` (**1 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `edd3ff37e9a64d22…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 85 events, hash-chained; root `345e83cb025ff51f4de0ea113dbe944c957e73c1490052c4ed24bd137784d723`. Verify with `node lab/verify-run.js lab/runs/20261111T044235Z-5845`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-HOSTED-DARKVAULT-LIVE-02 A Dark Vault run by the hosted Roost on a real Phala TDX VM (second run, no ballot): a pool, a late deposit and a second pool, then a lending quote, settled on testnet with the VM's escrow check on | hardware | **PASS** | 8 | 54 |  |

## E-HOSTED-DARKVAULT-LIVE-02: A Dark Vault run by the hosted Roost on a real Phala TDX VM (second run, no ballot): a pool, a late deposit and a second pool, then a lending quote, settled on testnet with the VM's escrow check on

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. The pinned hosted image attests; the VM runs a pool, a ballot (counting a late depositor) and a lending quote for one Dark Vault group, and the contract settles each; the books close exactly; teardown leaves nothing.

**What this does not prove**
- One operator controls every account and the VM. This is the system working on real hardware, not independent parties.
- The attestation proves which image and compose the VM runs; it does not prove the escrow providers are honest or audit the code inside the image.
- Three rounds and five members: not a long-lived or large group. The VM exists for the length of the session and the coordinator key is generated for it.
- Only the cash leg settles. Deposits and payouts are public on NEAR.
- Testnet only; the contract has not been audited by a third party.

| Step | Result | Assertions | Time |
|---|---|---|---|
| preflight: the Phala account is empty and the compose file is pinned with the escrow settings | ✓ pass | 4/4 | 2347 ms |
| prediction 1: deploy on a real TDX VM and verify the attestation as a member would | ✓ pass | 16/16 | 48930 ms |
| set up: five members, four recipients, and a Dark Vault whose room key is the ATTESTED settlement key; four founders deposit | ✓ pass | 7/7 | 33198 ms |
| prediction 2: round 1, a pool run by the VM, 0.05 to rp | ✓ pass | 4/4 | 15075 ms |
| prediction 3: a fifth member deposits, then round 2, a second pool, counts them | ✓ pass | 7/7 | 42362 ms |
| prediction 4 and 5: round 3, a lending quote, then the books close | ✓ pass | 11/11 | 45141 ms |
| prediction 6: teardown of the chain side (members exit with their remainders, group pruned, accounts deleted) | ✓ pass | 2/2 | 79629 ms |
| prediction 6: teardown: delete the VM and prove the account is empty | ✓ pass | 3/3 | 7598 ms |

### preflight: the Phala account is empty and the compose file is pinned with the escrow settings

- ✓ no CVM is already running on the account
- ✓ the compose file is pinned to a CI-built image digest
- ✓ the compose file carries the escrow settings
- ✓ a production OS image hash is pinned
- observed **instance type and rate**: `{"type":"tdx.small","usdPerHour":0.058}`

### prediction 1: deploy on a real TDX VM and verify the attestation as a member would

- note: deploying midge-lab-11110442
- evidence cvm: {"id":"3314822e2fa1f53154404aa0c55f8d8db0734220","url":"https://3314822e2fa1f53154404aa0c55f8d8db0734220-8080.dstack-pha1-prod5.phala.network","deadmanHours":1}
- ✓ public logs are off
- ✓ it runs a production (non-dev) OS image with the pinned hash
- ✓ Phala's app-compose contains our compose file byte for byte
- ✓ bundle has the expected format
- ✓ bundle report data matches our keys and our nonce
- ✓ dstack-verifier accepts the attestation
- ✓ Intel quote verifies
- ✓ event log replays to the measured RTMR3
- ✓ OS image hash verifies against the published image
- ✓ platform is a dstack TDX confidential VM
- ✓ TCB status is acceptable
- ✓ OS image is not a development image
- ✓ quote report data equals sha512(our keys, our nonce)
- ✓ compose hash equals the pinned hash of our build
- ✓ OS image hash is one we pin
- ✓ the VM does not claim to be a simulator
- evidence attestation: {"composeHash":"909c6baa34becdfda8a42225b3e849535945f4626086a8f3866af7ab354f2b49","osImageHash":"ec43cb8c5e04b6bb6c53b33b16076a01d83d01f7f4b703f2f78a0d947d6247e6"}

### set up: five members, four recipients, and a Dark Vault whose room key is the ATTESTED settlement key; four founders deposit

- ✓ the settlement key the contract will trust equals the attested one
- ✓ nine accounts exist
- ✓ the group was hatched
- ✓ u1 deposits 0.1
- ✓ u2 deposits 0.1
- ✓ u3 deposits 0.1
- ✓ u4 deposits 0.1

### prediction 2: round 1, a pool run by the VM, 0.05 to rp

- observed **block the VM read**: `{"height":277167527,"hash":"4tMdUy8Gj6nUERh19HZ2QNkNdf1fgR2LjooqghRULfDG","raceFree":false}`
- evidence tx: {"label":"settle_batch_charged round 1","hash":"FSBfK3AvFHQi21qDA1ekUcXJdRadyFJPGAGvBZqs2vG6","ok":true,"explorer":"https://testnet.nearblocks.io/txns/FSBfK3AvFHQi21qDA1ekUcXJdRadyFJPGAGvBZqs2vG6","error":null}
- ✓ round 1: the contract accepted the settlement the VM signed
- ✓ round 1: the epoch rose by exactly 1 and the round nonce changed
- ✓ round 1: rp received exactly 0.05 and nothing else moved
- ✓ round 1: the members' escrows sum to the group total

### prediction 3: a fifth member deposits, then round 2, a second pool, counts them

- ✓ u5 deposits 0.1 into the running group
- ✓ the late member is charged: five charges of 0.01
- evidence tx: {"label":"settle_batch_charged round 2","hash":"He76aGa559pF2ZbZPsnerMftBmN818Pgq1dYdyqGMqav","ok":true,"explorer":"https://testnet.nearblocks.io/txns/He76aGa559pF2ZbZPsnerMftBmN818Pgq1dYdyqGMqav","error":null}
- ✓ round 2: the contract accepted the settlement the VM signed
- ✓ round 2: the epoch rose by exactly 1 and the round nonce changed
- ✓ round 2: ra received exactly 0.05
- ✓ the late member was charged 0.01 like everyone else: u5 has 0.09
- ✓ round 2: the members' escrows sum to the group total

### prediction 4 and 5: round 3, a lending quote, then the books close

- ✓ u3 wins at 400 bps
- evidence tx: {"label":"settle_batch_charged round 3","hash":"3AeG8hGLSoDHQv7GEYYeKUJyZXA521e5Ym7ziU4W8m5U","ok":true,"explorer":"https://testnet.nearblocks.io/txns/3AeG8hGLSoDHQv7GEYYeKUJyZXA521e5Ym7ziU4W8m5U","error":null}
- ✓ round 3: the contract accepted the settlement the VM signed
- ✓ round 3: the epoch rose by exactly 1 and the round nonce changed
- ✓ round 3: rl received exactly 0.04
- ✓ round 3: the members' escrows sum to the group total
- ✓ u1 has exactly 0.08 left
- ✓ u2 has exactly 0.08 left
- ✓ u3 has exactly 0.035 left
- ✓ u4 has exactly 0.075 left
- ✓ u5 has exactly 0.09 left
- ✓ three settlements, three epochs: the epoch rose by exactly 3 and every nonce was different

### prediction 6: teardown of the chain side (members exit with their remainders, group pruned, accounts deleted)

- observed **teardown**: `{"pruned":1,"notPruned":[],"deleted":9,"kept":[],"failed":[]}`
- ✓ the group was pruned and every account deleted
- ✓ the contract holds the groups it started with

### prediction 6: teardown: delete the VM and prove the account is empty

- observed **teardown**: `{"deleted":true,"id":"3314822e2fa1f53154404aa0c55f8d8db0734220","seconds":268,"estimatedUsd":0.0043}`
- ✓ the VM was deleted
- ✓ no CVM is left running on the account
- observed **estimated cost (USD)**: `0.0043`
- ✓ the session cost under $0.10

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
