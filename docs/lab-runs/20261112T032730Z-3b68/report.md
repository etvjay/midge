# Lab run 20261112T032730Z-3b68

- **Code:** `ab13215baf9e0fa03b2d13d922ed6a5ab1fa56ae` on `repin-new-commit-image` (**5 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `5124af593da2edda…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 65 events, hash-chained; root `5778c94e6809a555aa42844d3c729c802dc99c9ffca2f59f1311aadeef82ec51`. Verify with `node lab/verify-run.js lab/runs/20261112T032730Z-3b68`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-HOSTED-SIGNED-LIVE-01 A Dark Vault run by the hosted Roost on a real Phala TDX VM (second run, no ballot): a pool, a late deposit and a second pool, then a lending quote, settled on testnet with the VM's escrow check on | hardware | **PASS** | 6 | 40 |  |

## E-HOSTED-SIGNED-LIVE-01: A Dark Vault run by the hosted Roost on a real Phala TDX VM (second run, no ballot): a pool, a late deposit and a second pool, then a lending quote, settled on testnet with the VM's escrow check on

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. The rebuilt image attests with signed inputs required in the measured compose file; an unsigned input and a wrong-key vote are refused; a majority ballot is settled by the contract; teardown leaves nothing.

**What this does not prove**
- One operator controls every account and the VM. This is the system working on real hardware, not independent parties.
- The attestation proves which image and compose the VM runs; it does not prove the escrow providers are honest or audit the code inside the image.
- Three rounds and five members: not a long-lived or large group. The VM exists for the length of the session and the coordinator key is generated for it.
- Only the cash leg settles. Deposits and payouts are public on NEAR.
- Testnet only; the contract has not been audited by a third party.

| Step | Result | Assertions | Time |
|---|---|---|---|
| preflight: the Phala account is empty and the compose file is pinned with the escrow settings | ✓ pass | 5/5 | 1756 ms |
| prediction 1: deploy on a real TDX VM and verify the attestation as a member would | ✓ pass | 16/16 | 58567 ms |
| set up: three members, two recipients, a group whose room key is the ATTESTED settlement key, three deposits of 0.05 | ✓ pass | 5/5 | 33538 ms |
| prediction 2 and 3: the room is in signed-input mode; a wrong-key vote is refused; three real signed votes are accepted | ✓ pass | 9/9 | 7260 ms |
| prediction 6: teardown of the chain side (members exit with their remainders, group pruned, accounts deleted) | ✓ pass | 2/2 | 41284 ms |
| prediction 6: teardown: delete the VM and prove the account is empty | ✓ pass | 3/3 | 5858 ms |

### preflight: the Phala account is empty and the compose file is pinned with the escrow settings

- ✓ no CVM is already running on the account
- ✓ the compose file is pinned to a CI-built image digest
- ✓ the compose file carries the escrow settings and requires signed inputs
- ✓ the compose file pins an image digest and requires signed inputs (the attestation then proves which one runs; this check once hard-coded an earlier digest and went stale when the image was rebuilt)
- ✓ a production OS image hash is pinned
- observed **instance type and rate**: `{"type":"tdx.small","usdPerHour":0.058}`

### prediction 1: deploy on a real TDX VM and verify the attestation as a member would

- note: deploying midge-lab-11120327
- evidence cvm: {"id":"aa1aa0cb474b3dafb569d98ecf2aa4d045afeafb","url":"https://aa1aa0cb474b3dafb569d98ecf2aa4d045afeafb-8080.dstack-pha1-prod9.phala.network","deadmanHours":1}
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
- evidence attestation: {"composeHash":"620a25cc9310e33bbc2c62c23e66f6e6e223163d4b218354e39456d72058a8d2","osImageHash":"ec43cb8c5e04b6bb6c53b33b16076a01d83d01f7f4b703f2f78a0d947d6247e6"}

### set up: three members, two recipients, a group whose room key is the ATTESTED settlement key, three deposits of 0.05

- ✓ the settlement key the contract will trust equals the attested one
- ✓ the group was hatched
- ✓ ma deposits 0.05
- ✓ mb deposits 0.05
- ✓ mc deposits 0.05

### prediction 2 and 3: the room is in signed-input mode; a wrong-key vote is refused; three real signed votes are accepted

- ✓ an unsigned sealed intent is refused: this room only accepts signed inputs
- ✓ a vote signed with a key that is not an access key of the member's account is refused
- observed **how the wrong-key vote was refused**: `roost /signed-intents answered 400: [ROOST REJECT] ed25519:FaHnUo5ar7rFiz3eUqtB25D56WfWPELD1myVZPNqwSRW is not a key of hszlzjkmc.fly-179363…`
- ✓ the three real signed votes were accepted
- ✓ A wins 2 to 1
- evidence tx: {"label":"settle_batch_charged ballot","hash":"88Mk7LThf7SmAs7qeE4D1Sk7yw6V1Aah2J1eTijq9wFM","ok":true,"explorer":"https://testnet.nearblocks.io/txns/88Mk7LThf7SmAs7qeE4D1Sk7yw6V1Aah2J1eTijq9wFM","error":null}
- ✓ the contract accepted the settlement the VM signed
- ✓ prediction 4: ra received exactly 0.03
- ✓ ma was charged exactly 0.01 (0.04 left)
- ✓ mb was charged exactly 0.01 (0.04 left)
- ✓ mc was charged exactly 0.01 (0.04 left)

### prediction 6: teardown of the chain side (members exit with their remainders, group pruned, accounts deleted)

- observed **teardown**: `{"pruned":1,"notPruned":[],"deleted":5,"kept":[],"failed":[]}`
- ✓ the group was pruned and every account deleted
- ✓ the contract holds the groups it started with

### prediction 6: teardown: delete the VM and prove the account is empty

- observed **teardown**: `{"deleted":true,"id":"aa1aa0cb474b3dafb569d98ecf2aa4d045afeafb","seconds":144,"estimatedUsd":0.0023}`
- ✓ the VM was deleted
- ✓ no CVM is left running on the account
- observed **estimated cost (USD)**: `0.0023`
- ✓ the session cost under $0.10

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
