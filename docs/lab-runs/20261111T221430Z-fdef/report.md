# Lab run 20261111T221430Z-fdef

- **Code:** `df3e9aa662a0a58610dbac919a209f17c4dd3fe5` on `pin-gap052` (**97 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `73f42e651241e148…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 74 events, hash-chained; root `a1408f4e944f439dd9c7617a0d4fe92b372974af7b80b982aaba438cc39648b3`. Verify with `node lab/verify-run.js lab/runs/20261111T221430Z-fdef`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-HOSTED-RFQ-LIVE-02 A sell-side, second-price RFQ on the real hardware room: an unfunded high bidder is left out by name, the winner pays the runner-up's bid, a tie goes to the earlier submission | hardware | **PASS** | 7 | 47 |  |

## E-HOSTED-RFQ-LIVE-02: A sell-side, second-price RFQ on the real hardware room: an unfunded high bidder is left out by name, the winner pays the runner-up's bid, a tie goes to the earlier submission

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. The highest bidder holds nothing and is excluded by name; the highest eligible bid wins and pays the second price; the winner's own bid stays sealed; a tie goes to the earlier submission; both order hashes on chain are the VM's.

**What this does not prove**
- One operator controls every account and the VM. This is the system working on real hardware, not independent parties.
- The room sees every bid, and the second price reveals the runner-up's bid to the public by design.
- One tied pair and one seller; larger ties and a taker who is also a maker are not run here.
- The VM exists for the length of the session and is deleted; no hosted room is running.

| Step | Result | Assertions | Time |
|---|---|---|---|
| preflight: the Phala account is empty and the compose file is pinned with the escrow settings | ✓ pass | 5/5 | 3001 ms |
| prediction 1: deploy on a real TDX VM and verify the attestation as a member would | ✓ pass | 16/16 | 51473 ms |
| set up: a seller, four makers, and a group whose room key is the ATTESTED settlement key; m1, m2 and m4 deposit, m3 does not | ✓ pass | 6/6 | 30997 ms |
| prediction 2, 3 and 4: round A, second-price: the unfunded high bidder is excluded by name; the highest eligible bid wins and pays the runner-up's bid; the winner's own bid stays sealed | ✓ pass | 10/10 | 7202 ms |
| prediction 5 and 6: round B, first-price: a tie goes to the earlier submission | ✓ pass | 5/5 | 6231 ms |
| prediction 6: teardown of the chain side (members exit with their remainders, group pruned, accounts deleted) | ✓ pass | 2/2 | 37820 ms |
| prediction 6: teardown: delete the VM and prove the account is empty | ✓ pass | 3/3 | 9534 ms |

### preflight: the Phala account is empty and the compose file is pinned with the escrow settings

- ✓ no CVM is already running on the account
- ✓ the compose file is pinned to a CI-built image digest
- ✓ the compose file carries the escrow settings and requires signed inputs
- ✓ the compose file is pinned to an image digest
- ✓ a production OS image hash is pinned
- observed **instance type and rate**: `{"type":"tdx.small","usdPerHour":0.058}`

### prediction 1: deploy on a real TDX VM and verify the attestation as a member would

- note: deploying midge-lab-11112214
- evidence cvm: {"id":"279bf2cda38eaab2bde73fdb809138a831d8914e","url":"https://279bf2cda38eaab2bde73fdb809138a831d8914e-8080.dstack-pha1-prod5.phala.network","deadmanHours":1}
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

### set up: a seller, four makers, and a group whose room key is the ATTESTED settlement key; m1, m2 and m4 deposit, m3 does not

- ✓ the settlement key the contract will trust equals the attested one
- ✓ the group was hatched
- ✓ m1 deposited 0.1
- ✓ m2 deposited 0.2
- ✓ m4 deposited 0.05
- ✓ m3 holds nothing in the group

### prediction 2, 3 and 4: round A, second-price: the unfunded high bidder is excluded by name; the highest eligible bid wins and pays the runner-up's bid; the winner's own bid stays sealed

- ✓ prediction 2: m3, the highest bidder, was excluded for escrow, by name and alone
- ✓ three quotes were read and two were eligible (m4 is under the limit)
- ✓ m2 won
- ✓ the price is the runner-up's bid: 2 units at 0.031
- ✓ prediction 4: the room returned the price 0.031 but not m2's own bid 0.045, m3's 0.060 or m4's 0.010
- evidence tx: {"label":"settle_batch_charged round A","hash":"4yRrjsd27jJhiHSeDB8UyjxkhenahgKHoQ1dqq7M86b3","ok":true,"explorer":"https://testnet.nearblocks.io/txns/4yRrjsd27jJhiHSeDB8UyjxkhenahgKHoQ1dqq7M86b3","error":null}
- ✓ round A: the contract accepted the settlement the VM signed
- ✓ tk received exactly 0.062 NEAR and nothing else moved
- ✓ m2 was charged exactly 0.062: 0.138 left
- ✓ m1 and m4 were not charged
- ✓ prediction 6: the order hash on chain is the one the VM computed (round A)

### prediction 5 and 6: round B, first-price: a tie goes to the earlier submission

- ✓ m2, who submitted first, won the tie
- evidence tx: {"label":"settle_batch_charged round B","hash":"DgauW6rPqKF5wTU6BAW5krYUrjxX4bEHw5u1aaUpGGri","ok":true,"explorer":"https://testnet.nearblocks.io/txns/DgauW6rPqKF5wTU6BAW5krYUrjxX4bEHw5u1aaUpGGri","error":null}
- ✓ round B: the contract accepted the settlement the VM signed
- ✓ tk received exactly 0.080 NEAR
- ✓ m2 was charged exactly 0.080: 0.058 left; m1 was not charged
- ✓ the order hash on chain is the one the VM computed (round B)

### prediction 6: teardown of the chain side (members exit with their remainders, group pruned, accounts deleted)

- observed **teardown**: `{"pruned":1,"notPruned":[],"deleted":5,"kept":[],"failed":[]}`
- ✓ the group was pruned and every account deleted
- ✓ the contract holds the groups it started with

### prediction 6: teardown: delete the VM and prove the account is empty

- observed **teardown**: `{"deleted":true,"id":"279bf2cda38eaab2bde73fdb809138a831d8914e","seconds":140,"estimatedUsd":0.0023}`
- ✓ the VM was deleted
- ✓ no CVM is left running on the account
- observed **estimated cost (USD)**: `0.0023`
- ✓ the session cost under $0.10

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
