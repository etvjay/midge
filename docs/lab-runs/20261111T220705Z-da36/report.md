# Lab run 20261111T220705Z-da36

- **Code:** `df3e9aa662a0a58610dbac919a209f17c4dd3fe5` on `pin-gap052` (**92 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `73f42e651241e148…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 85 events, hash-chained; root `8d306252f5091c7328c5958dfa0d9405109755e9395024006ac430f6a1585f6f`. Verify with `node lab/verify-run.js lab/runs/20261111T220705Z-da36`

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
| preflight: the Phala account is empty and the compose file is pinned with the escrow settings | ✓ pass | 4/4 | 1810 ms |
| prediction 1: deploy on a real TDX VM and verify the attestation as a member would | ✓ pass | 16/16 | 53712 ms |
| set up: five members, four recipients, and a Dark Vault whose room key is the ATTESTED settlement key; four founders deposit | ✓ pass | 7/7 | 49423 ms |
| prediction 2: round 1, a pool run by the VM, 0.05 to rp | ✓ pass | 4/4 | 7104 ms |
| prediction 3: a fifth member deposits, then round 2, a second pool, counts them | ✓ pass | 7/7 | 37135 ms |
| prediction 4 and 5: round 3, a lending quote, then the books close | ✓ pass | 11/11 | 36407 ms |
| prediction 6: teardown of the chain side (members exit with their remainders, group pruned, accounts deleted) | ✓ pass | 2/2 | 79175 ms |
| prediction 6: teardown: delete the VM and prove the account is empty | ✓ pass | 3/3 | 10744 ms |

### preflight: the Phala account is empty and the compose file is pinned with the escrow settings

- ✓ no CVM is already running on the account
- ✓ the compose file is pinned to a CI-built image digest
- ✓ the compose file carries the escrow settings
- ✓ a production OS image hash is pinned
- observed **instance type and rate**: `{"type":"tdx.small","usdPerHour":0.058}`

### prediction 1: deploy on a real TDX VM and verify the attestation as a member would

- note: deploying midge-lab-11112207
- evidence cvm: {"id":"79242d2e9732f3db388d66fd7ed15f63bd5fb5b8","url":"https://79242d2e9732f3db388d66fd7ed15f63bd5fb5b8-8080.dstack-pha1-prod5.phala.network","deadmanHours":1}
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
- evidence attestation: {"composeHash":"5124af593da2edda0c9184a088c1f69351c66d3ae311ee275d0acb231705eab2","osImageHash":"ec43cb8c5e04b6bb6c53b33b16076a01d83d01f7f4b703f2f78a0d947d6247e6"}

### set up: five members, four recipients, and a Dark Vault whose room key is the ATTESTED settlement key; four founders deposit

- ✓ the settlement key the contract will trust equals the attested one
- ✓ nine accounts exist
- ✓ the group was hatched
- ✓ u1 deposits 0.1
- ✓ u2 deposits 0.1
- ✓ u3 deposits 0.1
- ✓ u4 deposits 0.1

### prediction 2: round 1, a pool run by the VM, 0.05 to rp

- observed **block the VM read**: `{"height":277274625,"hash":"5kL13V8h6VxWr51qEXBLf7UM5sisSuEpTyHHa8krBrHg","raceFree":false}`
- evidence tx: {"label":"settle_batch_charged round 1","hash":"74FVkPLYs7t6U6cdDjkyoRM32f8tC8fvSi7cwSCPDZbi","ok":true,"explorer":"https://testnet.nearblocks.io/txns/74FVkPLYs7t6U6cdDjkyoRM32f8tC8fvSi7cwSCPDZbi","error":null}
- ✓ round 1: the contract accepted the settlement the VM signed
- ✓ round 1: the epoch rose by exactly 1 and the round nonce changed
- ✓ round 1: rp received exactly 0.05 and nothing else moved
- ✓ round 1: the members' escrows sum to the group total

### prediction 3: a fifth member deposits, then round 2, a second pool, counts them

- ✓ u5 deposits 0.1 into the running group
- ✓ the late member is charged: five charges of 0.01
- evidence tx: {"label":"settle_batch_charged round 2","hash":"JDzNb8oueqKyo3UZfwcuvNtTd7SvcJQTuGDjH9PcCYqZ","ok":true,"explorer":"https://testnet.nearblocks.io/txns/JDzNb8oueqKyo3UZfwcuvNtTd7SvcJQTuGDjH9PcCYqZ","error":null}
- ✓ round 2: the contract accepted the settlement the VM signed
- ✓ round 2: the epoch rose by exactly 1 and the round nonce changed
- ✓ round 2: ra received exactly 0.05
- ✓ the late member was charged 0.01 like everyone else: u5 has 0.09
- ✓ round 2: the members' escrows sum to the group total

### prediction 4 and 5: round 3, a lending quote, then the books close

- ✓ u3 wins at 400 bps
- evidence tx: {"label":"settle_batch_charged round 3","hash":"7xqgrDkScTtFYLuLWDB3BvLn1hkenDFEytWrjYaYKTWd","ok":true,"explorer":"https://testnet.nearblocks.io/txns/7xqgrDkScTtFYLuLWDB3BvLn1hkenDFEytWrjYaYKTWd","error":null}
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

- observed **teardown**: `{"deleted":true,"id":"79242d2e9732f3db388d66fd7ed15f63bd5fb5b8","seconds":270,"estimatedUsd":0.0043}`
- ✓ the VM was deleted
- ✓ no CVM is left running on the account
- observed **estimated cost (USD)**: `0.0043`
- ✓ the session cost under $0.10

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
