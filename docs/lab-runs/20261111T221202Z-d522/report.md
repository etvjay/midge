# Lab run 20261111T221202Z-d522

- **Code:** `df3e9aa662a0a58610dbac919a209f17c4dd3fe5` on `pin-gap052` (**97 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `73f42e651241e148…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 66 events, hash-chained; root `d9eb82f0981913c70d47ca73a648bb3973522c31f2cd5df0524d2554fbef9825`. Verify with `node lab/verify-run.js lab/runs/20261111T221202Z-d522`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-HOSTED-RFQ-LIVE-01 A sealed-quote RFQ on the real hardware room, settled on the production contract: the best eligible quote wins, the books are exact, the losing quotes stay sealed | hardware | **PASS** | 7 | 39 |  |

## E-HOSTED-RFQ-LIVE-01: A sealed-quote RFQ on the real hardware room, settled on the production contract: the best eligible quote wins, the books are exact, the losing quotes stay sealed

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. A request that could cost more than the taker has is refused and kept; the lowest eligible ask wins; the books are exact; the losing quotes appear nowhere in what the room returns; the order hash on chain is the VM's.

**What this does not prove**
- One operator controls every account and the VM. This is the system working on real hardware, not independent parties.
- The room sees every quote: this hides quotes from the other makers and the public, not from the room. The amount paid is public once settled.
- A buy-side, first-price RFQ with one winner; sell-side, second-price and ties are not run here.
- The VM exists for the length of the session and is deleted; no hosted room is running.

| Step | Result | Assertions | Time |
|---|---|---|---|
| preflight: the Phala account is empty and the compose file is pinned with the escrow settings | ✓ pass | 5/5 | 3135 ms |
| prediction 1: deploy on a real TDX VM and verify the attestation as a member would | ✓ pass | 16/16 | 51792 ms |
| set up: a taker, three makers, and a group whose room key is the ATTESTED settlement key; the taker deposits 0.2 | ✓ pass | 3/3 | 21623 ms |
| prediction 2: a request that could cost more than the taker has is refused, and the queue is kept | ✓ pass | 2/2 | 3363 ms |
| prediction 3, 4 and 5: the best eligible quote wins, the books are exact, the losers stay sealed, the order hash is bound | ✓ pass | 8/8 | 7083 ms |
| prediction 6: teardown of the chain side (members exit with their remainders, group pruned, accounts deleted) | ✓ pass | 2/2 | 29661 ms |
| prediction 6: teardown: delete the VM and prove the account is empty | ✓ pass | 3/3 | 9406 ms |

### preflight: the Phala account is empty and the compose file is pinned with the escrow settings

- ✓ no CVM is already running on the account
- ✓ the compose file is pinned to a CI-built image digest
- ✓ the compose file carries the escrow settings and requires signed inputs
- ✓ the compose file is pinned to an image digest
- ✓ a production OS image hash is pinned
- observed **instance type and rate**: `{"type":"tdx.small","usdPerHour":0.058}`

### prediction 1: deploy on a real TDX VM and verify the attestation as a member would

- note: deploying midge-lab-11112212
- evidence cvm: {"id":"710e5b8dca63214cf053be9acab766b107f41401","url":"https://710e5b8dca63214cf053be9acab766b107f41401-8080.dstack-pha1-prod5.phala.network","deadmanHours":1}
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

### set up: a taker, three makers, and a group whose room key is the ATTESTED settlement key; the taker deposits 0.2

- ✓ the settlement key the contract will trust equals the attested one
- ✓ the group was hatched
- ✓ the taker deposited 0.2

### prediction 2: a request that could cost more than the taker has is refused, and the queue is kept

- observed **how it was refused**: `roost /rfq answered 400: [ROOST REJECT] rqocahztk.fly-1793636729.testnet cannot cover the most this request could charge (units x limit); th…`
- ✓ the VM refused it as more than the taker can cover
- ✓ the queue was kept: asking again gives the same refusal, not "no request was sealed"

### prediction 3, 4 and 5: the best eligible quote wins, the books are exact, the losers stay sealed, the order hash is bound

- ✓ three quotes were received and two were eligible (m3's ask is over the limit)
- ✓ m2 won
- ✓ prediction 4: nothing the room returned contains m1's ask, m3's ask or any bid
- ✓ the terms are 2 units at 0.032
- evidence tx: {"label":"settle_batch_charged RFQ","hash":"HXpz86oa2maYMmP5fe8xoRSor4HXieWo44a6grED5xCx","ok":true,"explorer":"https://testnet.nearblocks.io/txns/HXpz86oa2maYMmP5fe8xoRSor4HXieWo44a6grED5xCx","error":null}
- ✓ the contract accepted the settlement the VM signed
- ✓ m2 received exactly 0.064 NEAR and nothing else moved
- ✓ the taker was charged exactly 0.064: 0.136 left
- ✓ prediction 5: the order hash in the settlement transaction on chain is the one the VM computed

### prediction 6: teardown of the chain side (members exit with their remainders, group pruned, accounts deleted)

- observed **teardown**: `{"pruned":1,"notPruned":[],"deleted":4,"kept":[],"failed":[]}`
- ✓ the group was pruned and every account deleted
- ✓ the contract holds the groups it started with

### prediction 6: teardown: delete the VM and prove the account is empty

- observed **teardown**: `{"deleted":true,"id":"710e5b8dca63214cf053be9acab766b107f41401","seconds":119,"estimatedUsd":0.0019}`
- ✓ the VM was deleted
- ✓ no CVM is left running on the account
- observed **estimated cost (USD)**: `0.0019`
- ✓ the session cost under $0.10

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
