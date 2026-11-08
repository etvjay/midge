# Lab run 20261108T124630Z-b8de

- **Code:** `8ed8dda62ef36e7a1d3e37d73a4a746fef5daed9` on `master` (**1 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `8a0180ff698c44b5…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 69 events, hash-chained; root `c75d7100025e1694884ebc6ca7b15ae39dd085f265ff2edcf8e5c3555e0f0840`. Verify with `node lab/verify-run.js lab/runs/20261108T124630Z-b8de`

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
| preflight: the Phala account is empty, the pins are present, and the compose file carries the escrow settings | ✓ pass | 5/5 | 5369 ms |
| deploy the Roost on a real TDX VM (capped by a dead-man's switch) | ✓ pass | 3/3 | 44867 ms |
| prediction 1 and 2: verify the attestation exactly as a member would, and see that it covers the escrow settings | ✓ pass | 16/16 | 3022 ms |
| set up: three members and a recipient, and a group whose room key is the ATTESTED settlement key | ✓ pass | 6/6 | 17439 ms |
| prediction 3 and 4: inside the VM the unfunded member is left out, the settlement lands, and the block read is reported | ✓ pass | 7/7 | 14819 ms |
| prediction 5: teardown of the chain side | ✓ pass | 2/2 | 33678 ms |
| prediction 5: teardown: delete the VM and prove the account is empty | ✓ pass | 3/3 | 8670 ms |

### preflight: the Phala account is empty, the pins are present, and the compose file carries the escrow settings

- ✓ no CVM is already running on the account
- ✓ the compose file is pinned to a CI-built image digest
- ✓ the compose file contains ROOST_RPC_URLS
- ✓ the compose file contains ROOST_CONTRACT_ID
- ✓ a production OS image hash is pinned
- observed **instance type and rate**: `{"type":"tdx.small","usdPerHour":0.058}`

### deploy the Roost on a real TDX VM (capped by a dead-man's switch)

- note: deploying midge-lab-11081246
- evidence cvm: {"id":"406f8cfd692b0ced6527b02dbfeba30532491f42","url":"https://406f8cfd692b0ced6527b02dbfeba30532491f42-8080.dstack-pha1-prod9.phala.network","deadmanHours":1}
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
- evidence attestation: {"composeHash":"edd3ff37e9a64d2258275dbde02fe6a5a8d98451373cd5e054c618b45afd7994","osImageHash":"ec43cb8c5e04b6bb6c53b33b16076a01d83d01f7f4b703f2f78a0d947d6247e6"}

### set up: three members and a recipient, and a group whose room key is the ATTESTED settlement key

- ✓ the settlement key the contract will trust equals the attested one
- ✓ four accounts exist and are funded
- ✓ the group was hatched
- ✓ hetulgpa.fly-1793636729.testnet deposited 0.02
- ✓ hetulgpc.fly-1793636729.testnet deposited 0.02
- ✓ A and C hold 0.02 each; B holds nothing

### prediction 3 and 4: inside the VM the unfunded member is left out, the settlement lands, and the block read is reported

- observed **seconds the VM took to read the chain and run the pool**: `10`
- ✓ the VM left out B, and only B, by account
- ✓ the VM charged A and C 0.01 each
- observed **block the VM read**: `{"height":276777717,"hash":"BCqNYiUt2dYpAr1sicRH3yZXerJpFupSWue9xtAsfT7K","raceFree":false}`
- ✓ it read a real block
- ✓ raceFree is false (the exit timer ran out long ago)
- evidence settlement signed inside the VM: {"ok":true,"hash":"Dv7aAk7ou7pRjTjNLMLopr3eyr3oz1tqZBTpwPzYxPkt","error":null,"explorer":"https://testnet.nearblocks.io/txns/Dv7aAk7ou7pRjTjNLMLopr3eyr3oz1tqZBTpwPzYxPkt"}
- ✓ the contract accepted the settlement the VM signed
- ✓ A and C hold 0.01 each; B was never charged
- ✓ the recipient received exactly 0.02

### prediction 5: teardown of the chain side

- ✓ the group was pruned and every account deleted
- ✓ the contract holds the groups it started with

### prediction 5: teardown: delete the VM and prove the account is empty

- observed **teardown**: `{"deleted":true,"id":"406f8cfd692b0ced6527b02dbfeba30532491f42","seconds":118,"estimatedUsd":0.0019}`
- ✓ the VM was deleted
- ✓ no CVM is left running on the account
- observed **estimated cost (USD)**: `0.0019`
- ✓ the session cost under $0.05

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
