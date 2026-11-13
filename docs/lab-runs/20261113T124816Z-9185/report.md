# Lab run 20261113T124816Z-9185

- **Code:** `e7e03e75d84431312c3ae40937b41048ca1f7f75` on `hw-room-gaps` (**2 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `20b299a37ee3a320…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 60 events, hash-chained; root `a1d2a90e61030236e0ec73e1eac44710e33dfae767fe49dfc586c3828d27d354`. Verify with `node lab/verify-run.js lab/runs/20261113T124816Z-9185`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-HOSTED-BALLOT-DECIDE-LIVE-01 A decision-only vote on the real hardware room: three members vote with no money in play, a wrong-key vote is refused, the room signs the decision, a browser check verifies it against the attested key, and the round can never be settled | hardware | **PASS** | 6 | 35 |  |

## E-HOSTED-BALLOT-DECIDE-LIVE-01: A decision-only vote on the real hardware room: three members vote with no money in play, a wrong-key vote is refused, the room signs the decision, a browser check verifies it against the attested key, and the round can never be settled

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. A vote with an explicit null share moves no money; the room signs a decision that the browser verifier accepts against the settlement key the hardware attested; asking the room to settle that round is refused; and nothing moves on chain.

**What this does not prove**
- One operator controls every account and the VM. This is the system working on real hardware, not independent parties.
- The decision is signed by the room and is not recorded on chain: the contract cannot record a result with no payment. Anyone can check the signature against the room's attested key, but the chain does not show the decision.
- The room sees every vote; this hides votes from the other members and the public, not from the room.
- The VM exists for the length of the session and is deleted; no hosted room is running.

| Step | Result | Assertions | Time |
|---|---|---|---|
| preflight: the Phala account is empty and the compose file is pinned | ✓ pass | 4/4 | 2113 ms |
| prediction 1: deploy on a real TDX VM and verify the attestation as a member would | ✓ pass | 16/16 | 49901 ms |
| set up: three members and a group whose room key is the ATTESTED settlement key; nobody deposits | ✓ pass | 2/2 | 15199 ms |
| prediction 1 to 4: votes are signed, a wrong-key vote is refused, the room signs a decision, the browser verifies it, and the round cannot be settled | ✓ pass | 7/7 | 2852 ms |
| prediction 5: teardown of the chain side (members exit with their remainders, group pruned, accounts deleted) | ✓ pass | 3/3 | 15251 ms |
| prediction 5: teardown: delete the VM and prove the account is empty | ✓ pass | 3/3 | 6307 ms |

### preflight: the Phala account is empty and the compose file is pinned

- ✓ no CVM is already running on the account
- ✓ the compose file is pinned to a CI-built image digest and requires signed inputs
- ✓ the pinned digest is the one CI built from the merge that added the room gaps (0e1fbad0)
- ✓ a production OS image hash is pinned
- observed **instance type and rate**: `{"type":"tdx.small","usdPerHour":0.058}`

### prediction 1: deploy on a real TDX VM and verify the attestation as a member would

- note: deploying midge-lab-11131248
- evidence cvm: {"id":"bc804272d7c549e68d911acf5e714a1fd2bdb421","url":"https://bc804272d7c549e68d911acf5e714a1fd2bdb421-8080.dstack-pha1-prod9.phala.network","deadmanHours":1}
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

### set up: three members and a group whose room key is the ATTESTED settlement key; nobody deposits

- ✓ the settlement key the contract will trust equals the attested one
- ✓ the group was hatched

### prediction 1 to 4: votes are signed, a wrong-key vote is refused, the room signs a decision, the browser verifies it, and the round cannot be settled

- ✓ a vote signed with a key that is not the member's is refused
- evidence outcome: {"shape":"ballot","rule":"majority","payout":false,"decided":true,"winner":"A","recipient":null,"reason":null,"quorumMet":true,"outsiders":[],"unreadable":[],"executionModel":"HOSTED_SEALED_BALLOT","confidentiality":"tee…
- evidence decision: {"message":"midge-decision-v1:c.fly-1793636729.testnet:hbd-mwez2zi4:1:7f9e9aed125746d530dd4be0f9d7d5c7206a2e54beb95702e4a1eabe3277ce2a:bd-mwez2zi4:majority:A:-:66dce4f8ae98bc9280789b51e95a477f0982d9037b944f159ef6cf284759…
- ✓ the room reports a decision for A and no payout: no allocations, charges or order hash
- ✓ the browser verifier accepts the decision against the settlement key the hardware attested, and reads back the winner, group and round
- ✓ a changed winner does not verify
- ✓ asking the room to settle that round is refused
- ✓ the round cannot be opened again to decide twice
- ✓ nothing moved on chain: the group's escrow is 0, and its epoch and round nonce are unchanged

### prediction 5: teardown of the chain side (members exit with their remainders, group pruned, accounts deleted)

- ✓ the creator pruned the never-funded group
- observed **teardown**: `{"pruned":0,"notPruned":[],"deleted":3,"kept":[],"failed":[]}`
- ✓ the group was pruned and every account deleted
- ✓ the contract holds the groups it started with

### prediction 5: teardown: delete the VM and prove the account is empty

- observed **teardown**: `{"deleted":true,"id":"bc804272d7c549e68d911acf5e714a1fd2bdb421","seconds":87,"estimatedUsd":0.0014}`
- ✓ the VM was deleted
- ✓ no CVM is left running on the account
- observed **estimated cost (USD)**: `0.0014`
- ✓ the session cost under $0.15

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
