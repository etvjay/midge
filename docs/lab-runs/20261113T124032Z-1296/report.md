# Lab run 20261113T124032Z-1296

- **Code:** `76c886977e994c71c0904d30cbca082b6186025c` on `hw-room-gaps` (**2 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `20b299a37ee3a320…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 61 events, hash-chained; root `1da21159b896fffff687f0966b5cfc6bcde3f7b331a0cee59f2353829861f82e`. Verify with `node lab/verify-run.js lab/runs/20261113T124032Z-1296`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-HOSTED-CROSS-LIVE-02 A block trade with a minimum fill on the real hardware room: an order whose pro-rata fill would be under its minimum is cancelled, the cross is recomputed, and the production contract settles exactly | hardware | **PASS** | 6 | 36 |  |

## E-HOSTED-CROSS-LIVE-02: A block trade with a minimum fill on the real hardware room: an order whose pro-rata fill would be under its minimum is cancelled, the cross is recomputed, and the production contract settles exactly

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. A buyer who set a minimum of 3 units and would have been filled 2 is cancelled; the cross is computed again without them, so the other buyer fills all 5 units; the published outcome says one order was cancelled and not whose; the contract charges and pays exactly.

**What this does not prove**
- One operator controls every account and the VM.
- Only the middle of a block trade is modelled: no indications of interest or firm-up step, no minimum fill, no time priority, a supplied reference price, and only the cash leg settles.
- Charges and payouts are public on NEAR, so filled units can be worked out from the cash and the public reference price.

| Step | Result | Assertions | Time |
|---|---|---|---|
| preflight: the Phala account is empty and the compose file is pinned | ✓ pass | 4/4 | 1931 ms |
| prediction 1: deploy on a real TDX VM and verify the attestation as a member would | ✓ pass | 16/16 | 49639 ms |
| set up: three buyers and two sellers, a group whose room key is the ATTESTED settlement key, the buyers deposit | ✓ pass | 5/5 | 32021 ms |
| prediction 1 to 3: firm orders are sealed and signed, a minimum fill cancels one order, and the cross is right | ✓ pass | 6/6 | 6309 ms |
| prediction 4: teardown of the chain side (members exit with their remainders, group pruned, accounts deleted) | ✓ pass | 2/2 | 40777 ms |
| prediction 4: teardown: delete the VM and prove the account is empty | ✓ pass | 3/3 | 6119 ms |

### preflight: the Phala account is empty and the compose file is pinned

- ✓ no CVM is already running on the account
- ✓ the compose file is pinned to a CI-built image digest and requires signed inputs
- ✓ the pinned digest is the one CI built from the merge that added the room gaps (0e1fbad0)
- ✓ a production OS image hash is pinned
- observed **instance type and rate**: `{"type":"tdx.small","usdPerHour":0.058}`

### prediction 1: deploy on a real TDX VM and verify the attestation as a member would

- note: deploying midge-lab-11131240
- evidence cvm: {"id":"cf64fb0551a915129c8854900c7655fd7e985c2a","url":"https://cf64fb0551a915129c8854900c7655fd7e985c2a-8080.dstack-pha1-prod9.phala.network","deadmanHours":1}
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
- evidence attestation: {"composeHash":"6bf6e4ecc506c9417fbd4b83736066a4aea79a8786b0a295f222dbe02fb483b6","osImageHash":"ec43cb8c5e04b6bb6c53b33b16076a01d83d01f7f4b703f2f78a0d947d6247e6"}

### set up: three buyers and two sellers, a group whose room key is the ATTESTED settlement key, the buyers deposit

- ✓ the settlement key the contract will trust equals the attested one
- ✓ the group was hatched
- ✓ b1 deposits 0.08
- ✓ b2 deposits 0.08
- ✓ b3 deposits 0.08

### prediction 1 to 3: firm orders are sealed and signed, a minimum fill cancels one order, and the cross is right

- evidence outcome: {"excludedForEscrow":[],"escrowBlock":{"height":277511291,"hash":"9v6CXcYjc11to8jcLNgPmGcDq6yscCTYb8d688zwdfzv","raceFree":false},"shape":"cross","referencePrice":"0.01","maxUnits":null,"matchedUnits":5,"cash":"0.05","bu…
- ✓ 5 units matched for 0.05, one order was cancelled for being under its minimum, and one buyer and two sellers filled
- ✓ the published outcome names no one and carries no limit price
- ✓ b1 is charged 0.05 for all 5 units and b2 is not charged
- evidence tx: {"label":"settle_batch_charged block trade","hash":"2bfmycSyEVuMUzE25gcAqQ9pKU7DFPV3D3SrSPEWe2gm","ok":true,"explorer":"https://testnet.nearblocks.io/txns/2bfmycSyEVuMUzE25gcAqQ9pKU7DFPV3D3SrSPEWe2gm","error":null}
- ✓ the contract accepted the settlement the VM signed
- ✓ prediction 3: s1 received exactly 0.03 and s2 exactly 0.02, and nothing else moved
- ✓ b1 has 0.03 left, and b2 and b3 all of their 0.08

### prediction 4: teardown of the chain side (members exit with their remainders, group pruned, accounts deleted)

- observed **teardown**: `{"pruned":1,"notPruned":[],"deleted":5,"kept":[],"failed":[]}`
- ✓ the group was pruned and every account deleted
- ✓ the contract holds the groups it started with

### prediction 4: teardown: delete the VM and prove the account is empty

- observed **teardown**: `{"deleted":true,"id":"cf64fb0551a915129c8854900c7655fd7e985c2a","seconds":132,"estimatedUsd":0.0021}`
- ✓ the VM was deleted
- ✓ no CVM is left running on the account
- observed **estimated cost (USD)**: `0.0021`
- ✓ the session cost under $0.15

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
