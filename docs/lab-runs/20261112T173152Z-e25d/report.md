# Lab run 20261112T173152Z-e25d

- **Code:** `0e1bced6138203dc2d37413c04a21dec6c159c22` on `pin-programs-image` (**5 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `620a25cc9310e33b…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 76 events, hash-chained; root `ba1e83f36e9ac7ffccde8aa0dfb5bd1d0c0b3eeb120feb678d6560f90c377f79`. Verify with `node lab/verify-run.js lab/runs/20261112T173152Z-e25d`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-HOSTED-PROGRAMS-LIVE-01 A weighted supermajority ballot that misses its bar and then meets it exactly, and a pro-rata pool, run by the hosted Roost on a real Phala TDX VM and settled on testnet | hardware | **PASS** | 8 | 47 |  |

## E-HOSTED-PROGRAMS-LIVE-01: A weighted supermajority ballot that misses its bar and then meets it exactly, and a pro-rata pool, run by the hosted Roost on a real Phala TDX VM and settled on testnet

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. The VM attests the new pinned image; a weighted ballot at a 70% bar decides nothing and leaves the escrow untouched; the same signed votes at a 60% bar (exactly the winner's weighted share) decide, and the contract accepts the settlement with every voter charged one equal share; an oversubscribed pro-rata pool charges each member exactly the scaled amount and pays the recipient exactly the total; teardown leaves nothing.

**What this does not prove**
- One operator controls every account and the VM. This is the system working on real hardware, not independent parties.
- The attestation proves which image and compose the VM runs; it does not audit the code inside the image.
- Two settled rounds and three members: not a long-lived or large group. Deposits and payouts are public on NEAR, so pro-rata and weights hide nothing extra.
- Weights are supplied by the coordinator and are public in the request. Testnet only.

| Step | Result | Assertions | Time |
|---|---|---|---|
| preflight: the Phala account is empty and the compose file is pinned | ✓ pass | 4/4 | 2357 ms |
| prediction 1: deploy on a real TDX VM and verify the attestation as a member would | ✓ pass | 16/16 | 54931 ms |
| set up: three members, three recipients, a group whose room key is the ATTESTED settlement key, three deposits of 0.05 | ✓ pass | 5/5 | 48028 ms |
| prediction 2: a weighted supermajority ballot below its bar decides nothing and leaves the escrow untouched | ✓ pass | 3/3 | 2401 ms |
| prediction 3: the same signed votes at a 60% bar (exactly the weighted share) decide, and the contract accepts the settlement | ✓ pass | 7/7 | 6442 ms |
| prediction 4: an oversubscribed pro-rata pool charges each member exactly the scaled amount and pays the recipient exactly the total | ✓ pass | 7/7 | 6757 ms |
| prediction 5: teardown of the chain side (members exit with their remainders, group pruned, accounts deleted) | ✓ pass | 2/2 | 45068 ms |
| prediction 5: teardown: delete the VM and prove the account is empty | ✓ pass | 3/3 | 6019 ms |

### preflight: the Phala account is empty and the compose file is pinned

- ✓ no CVM is already running on the account
- ✓ the compose file is pinned to a CI-built image digest and requires signed inputs
- ✓ the pinned digest is the one CI built from the merge that added the programs (76dd150f)
- ✓ a production OS image hash is pinned
- observed **instance type and rate**: `{"type":"tdx.small","usdPerHour":0.058}`

### prediction 1: deploy on a real TDX VM and verify the attestation as a member would

- note: deploying midge-lab-11121731
- evidence cvm: {"id":"bc1a16a4b97d2ef39aea26b3f2753bad117c8471","url":"https://bc1a16a4b97d2ef39aea26b3f2753bad117c8471-8080.dstack-pha1-prod5.phala.network","deadmanHours":1}
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
- evidence attestation: {"composeHash":"29f58898aa3bf050246346985e4b7c8161c85aed4fdf19ff03a6dc4de0fc34a4","osImageHash":"ec43cb8c5e04b6bb6c53b33b16076a01d83d01f7f4b703f2f78a0d947d6247e6"}

### set up: three members, three recipients, a group whose room key is the ATTESTED settlement key, three deposits of 0.05

- ✓ the settlement key the contract will trust equals the attested one
- ✓ the group was hatched
- ✓ ma deposits 0.05
- ✓ mb deposits 0.05
- ✓ mc deposits 0.05

### prediction 2: a weighted supermajority ballot below its bar decides nothing and leaves the escrow untouched

- ✓ A holds 3 of 5 weight (60%), under a 70% bar: undecided, no order hash, nothing to sign
- ✓ the outcome carries no tally, turnout or weight
- ✓ the group's escrow is unchanged on chain (0.15)

### prediction 3: the same signed votes at a 60% bar (exactly the weighted share) decide, and the contract accepts the settlement

- ✓ A wins on the bar exactly
- ✓ every voter is charged one equal share (weights change votes, not payments)
- evidence tx: {"label":"settle_batch_charged weighted ballot","hash":"BUdWySUKYmNGmRAcijNpBLS5hyV1se1R6gfnzVazX1v","ok":true,"explorer":"https://testnet.nearblocks.io/txns/BUdWySUKYmNGmRAcijNpBLS5hyV1se1R6gfnzVazX1v","error":null}
- ✓ the contract accepted the settlement the VM signed
- ✓ ra received exactly 0.03
- ✓ ma was charged exactly 0.01 (0.04 left)
- ✓ mb was charged exactly 0.01 (0.04 left)
- ✓ mc was charged exactly 0.01 (0.04 left)

### prediction 4: an oversubscribed pro-rata pool charges each member exactly the scaled amount and pays the recipient exactly the total

- ✓ the outcome says pro-rata, scaled, nobody left out
- ✓ each of the three is charged 0.03 and the recipient is allocated 0.09
- evidence tx: {"label":"settle_batch_charged pro-rata pool","hash":"8nt2BPFGYyCTud1NssCbxhpvrYMNDDdfMoBJjQfkcRTJ","ok":true,"explorer":"https://testnet.nearblocks.io/txns/8nt2BPFGYyCTud1NssCbxhpvrYMNDDdfMoBJjQfkcRTJ","error":null}
- ✓ the contract accepted the settlement the VM signed
- ✓ rp received exactly 0.09
- ✓ ma was charged exactly 0.03 (0.01 left)
- ✓ mb was charged exactly 0.03 (0.01 left)
- ✓ mc was charged exactly 0.03 (0.01 left)

### prediction 5: teardown of the chain side (members exit with their remainders, group pruned, accounts deleted)

- observed **teardown**: `{"pruned":1,"notPruned":[],"deleted":6,"kept":[],"failed":[]}`
- ✓ the group was pruned and every account deleted
- ✓ the contract holds the groups it started with

### prediction 5: teardown: delete the VM and prove the account is empty

- observed **teardown**: `{"deleted":true,"id":"bc1a16a4b97d2ef39aea26b3f2753bad117c8471","seconds":167,"estimatedUsd":0.0027}`
- ✓ the VM was deleted
- ✓ no CVM is left running on the account
- observed **estimated cost (USD)**: `0.0027`
- ✓ the session cost under $0.15

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
