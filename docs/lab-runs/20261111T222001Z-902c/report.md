# Lab run 20261111T222001Z-902c

- **Code:** `df3e9aa662a0a58610dbac919a209f17c4dd3fe5` on `pin-gap052` (**97 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `73f42e651241e148…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 69 events, hash-chained; root `43b37ecab8c64ca496d1536baf99764b7f066407f61307122f29312624fe33d5`. Verify with `node lab/verify-run.js lab/runs/20261111T222001Z-902c`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-HOSTED-ESCROW-LIVE-01 The hosted Roost with the escrow check ON, on a real Phala TDX VM: an unfunded member is left out inside the VM and the settlement lands on testnet | hardware | **PASS** | 7 | 42 |  |

## E-HOSTED-ESCROW-LIVE-01: The hosted Roost with the escrow check ON, on a real Phala TDX VM: an unfunded member is left out inside the VM and the settlement lands on testnet

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. The compose file now carries the escrow settings, so the attestation measures them; inside the VM the Roost reads the contract's escrow from two providers, leaves the unfunded member out, signs, and the real contract accepts the settlement.

**What this does not prove**
- One operator controls all members, the coordinator, the recipient and the VM account. This is the system working on real hardware, not independent parties.
- The attestation proves which image and compose the VM runs, including which providers it asks; it does not prove the providers are honest, and it does not audit the code inside the image.
- It does not show the VM failing closed when both providers are down, the exit race, or a two-room settlement.
- The VM exists for a few minutes; the coordinator key is generated for this session.
- Testnet only; the contract has not been audited by a third party.

| Step | Result | Assertions | Time |
|---|---|---|---|
| preflight: the Phala account is empty, the pins are present, and the compose file carries the escrow settings | ✓ pass | 5/5 | 3393 ms |
| deploy the Roost on a real TDX VM (capped by a dead-man's switch) | ✓ pass | 3/3 | 48967 ms |
| prediction 1 and 2: verify the attestation exactly as a member would, and see that it covers the escrow settings | ✓ pass | 16/16 | 2691 ms |
| set up: three members and a recipient, and a group whose room key is the ATTESTED settlement key | ✓ pass | 6/6 | 25056 ms |
| prediction 3 and 4: inside the VM the unfunded member is left out, the settlement lands, and the block read is reported | ✓ pass | 7/7 | 5975 ms |
| prediction 5: teardown of the chain side | ✓ pass | 2/2 | 30168 ms |
| prediction 5: teardown: delete the VM and prove the account is empty | ✓ pass | 3/3 | 7907 ms |

### preflight: the Phala account is empty, the pins are present, and the compose file carries the escrow settings

- ✓ no CVM is already running on the account
- ✓ the compose file is pinned to a CI-built image digest
- ✓ the compose file contains ROOST_RPC_URLS
- ✓ the compose file contains ROOST_CONTRACT_ID
- ✓ a production OS image hash is pinned
- observed **instance type and rate**: `{"type":"tdx.small","usdPerHour":0.058}`

### deploy the Roost on a real TDX VM (capped by a dead-man's switch)

- note: deploying midge-lab-11112220
- evidence cvm: {"id":"f2453a55a0021b4172cf5aa252fa045678fb2893","url":"https://f2453a55a0021b4172cf5aa252fa045678fb2893-8080.dstack-pha1-prod5.phala.network","deadmanHours":1}
- ✓ the VM answered /healthz
- ✓ public logs are off
- ✓ it runs a production (non-dev) OS image with the pinned hash

### prediction 1 and 2: verify the attestation exactly as a member would, and see that it covers the escrow settings

- ✓ Phala's app-compose contains our compose file byte for byte
- ✓ the compose the VM runs (byte for byte our file) contains ROOST_RPC_URLS, so the compose hash the attestation measures covers it
- ✓ the compose the VM runs (byte for byte our file) contains ROOST_CONTRACT_ID, so the compose hash the attestation measures covers it
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

### set up: three members and a recipient, and a group whose room key is the ATTESTED settlement key

- ✓ the settlement key the contract will trust equals the attested one
- ✓ four accounts exist and are funded
- ✓ the group was hatched
- ✓ heonq5aa.fly-1793636729.testnet deposited 0.02
- ✓ heonq5ac.fly-1793636729.testnet deposited 0.02
- ✓ A and C hold 0.02 each; B holds nothing

### prediction 3 and 4: inside the VM the unfunded member is left out, the settlement lands, and the block read is reported

- observed **seconds the VM took to read the chain and run the pool**: `1`
- ✓ the VM left out B, and only B, by account
- ✓ the VM charged A and C 0.01 each
- observed **block the VM read**: `{"height":277275905,"hash":"FhZVyR48XkqLPT8oDXK4RoAriUtxNSB6viCdwtqdiPCu","raceFree":false}`
- ✓ it read a real block
- ✓ raceFree is false (the exit timer ran out long ago)
- evidence settlement signed inside the VM: {"ok":true,"hash":"EAEweq9oLZPpNUta9fpNeq8tY1nqQfhoaMUreQ4p4KVr","error":null,"explorer":"https://testnet.nearblocks.io/txns/EAEweq9oLZPpNUta9fpNeq8tY1nqQfhoaMUreQ4p4KVr"}
- ✓ the contract accepted the settlement the VM signed
- ✓ A and C hold 0.01 each; B was never charged
- ✓ the recipient received exactly 0.02

### prediction 5: teardown of the chain side

- ✓ the group was pruned and every account deleted
- ✓ the contract holds the groups it started with

### prediction 5: teardown: delete the VM and prove the account is empty

- observed **teardown**: `{"deleted":true,"id":"f2453a55a0021b4172cf5aa252fa045678fb2893","seconds":117,"estimatedUsd":0.0019}`
- ✓ the VM was deleted
- ✓ no CVM is left running on the account
- observed **estimated cost (USD)**: `0.0019`
- ✓ the session cost under $0.05

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
