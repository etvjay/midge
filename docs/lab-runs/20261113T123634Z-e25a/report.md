# Lab run 20261113T123634Z-e25a

- **Code:** `a527f485ad8096170cb156d3caaba00b06a0ffd4` on `hw-room-gaps` (**1 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `20b299a37ee3a320…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 65 events, hash-chained; root `887ad9deee0239a5bf77b9e88f4752599673994f1413e2f4f7b9626a62453d88`. Verify with `node lab/verify-run.js lab/runs/20261113T123634Z-e25a`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-HOSTED-RFQ-LIVE-03 A sealed-quote RFQ on the real hardware room with a quote that expires and a maker nobody invited: the expired quote and the uninvited one are left out, the best valid quote wins, and the production contract settles exactly | hardware | **PASS** | 6 | 39 |  |

## E-HOSTED-RFQ-LIVE-03: A sealed-quote RFQ on the real hardware room with a quote that expires and a maker nobody invited: the expired quote and the uninvited one are left out, the best valid quote wins, and the production contract settles exactly

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. A quote whose validUntil has passed when the round clears is named as expired and left out; an uninvited maker with the best price is an outsider and does not win; the best valid invited quote wins; the contract charges the taker and pays the winner exactly.

**What this does not prove**
- One operator controls every account and the VM. This is the system working on real hardware, not independent parties.
- The room sees every quote: this hides quotes from the other makers and the public, not from the room. The amount paid is public once settled.
- Expiry uses the room VM's clock. The run records the difference between this machine's clock and the VM's, and waits 40 seconds against a 15 second deadline, so a skew of a few seconds cannot change the result.
- A buy-side, first-price RFQ with one winner.
- The VM exists for the length of the session and is deleted; no hosted room is running.

| Step | Result | Assertions | Time |
|---|---|---|---|
| preflight: the Phala account is empty and the compose file is pinned with the escrow settings | ✓ pass | 5/5 | 2275 ms |
| prediction 1: deploy on a real TDX VM and verify the attestation as a member would | ✓ pass | 16/16 | 49721 ms |
| set up: a taker, three makers, and a group whose room key is the ATTESTED settlement key; the taker deposits 0.2 | ✓ pass | 3/3 | 35870 ms |
| prediction 1 to 3: an expired quote and an uninvited maker are left out, and the best valid invited quote wins | ✓ pass | 10/10 | 47537 ms |
| prediction 4: teardown of the chain side (members exit with their remainders, group pruned, accounts deleted) | ✓ pass | 2/2 | 34562 ms |
| prediction 4: teardown: delete the VM and prove the account is empty | ✓ pass | 3/3 | 5994 ms |

### preflight: the Phala account is empty and the compose file is pinned with the escrow settings

- ✓ no CVM is already running on the account
- ✓ the compose file is pinned to a CI-built image digest
- ✓ the compose file carries the escrow settings and requires signed inputs
- ✓ the compose file is pinned to an image digest
- ✓ a production OS image hash is pinned
- observed **instance type and rate**: `{"type":"tdx.small","usdPerHour":0.058}`

### prediction 1: deploy on a real TDX VM and verify the attestation as a member would

- note: deploying midge-lab-11131236
- evidence cvm: {"id":"bd6f9b3eed06ac9f41fd3e2c6dcf00419160593e","url":"https://bd6f9b3eed06ac9f41fd3e2c6dcf00419160593e-8080.dstack-pha1-prod5.phala.network","deadmanHours":1}
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

### set up: a taker, three makers, and a group whose room key is the ATTESTED settlement key; the taker deposits 0.2

- ✓ the settlement key the contract will trust equals the attested one
- ✓ the group was hatched
- ✓ the taker deposited 0.2

### prediction 1 to 3: an expired quote and an uninvited maker are left out, and the best valid invited quote wins

- observed **this machine's clock minus the VM's, in seconds**: `1`
- ✓ the two clocks agree to within 10 seconds, far inside the 25 second margin the run leaves
- evidence outcome: {"excludedForEscrow":[],"escrowBlock":{"height":277510960,"hash":"AFiKvBWLUNMoDvv3k4gDxWCFAwFNerQvj1kpjAYFj5rZ","raceFree":false},"shape":"rfq","pricing":"first","taker":"r3ynxf0tk.fly-1793636729.testnet","won":true,"win…
- ✓ m1, whose 15 second quote had passed, is named as expired
- ✓ m4, who was not invited and had the best price, is an outsider and did not win
- ✓ m2 won, from two valid quotes
- ✓ nothing the room returned contains m1's, m3's or m4's ask, or any bid
- ✓ the terms are 2 units at 0.04
- evidence tx: {"label":"settle_batch_charged rfq with an expired quote","hash":"9NqDDEn5bakgYKaZGy52FGkdt7McjPTvQGGC94NhZ5Kk","ok":true,"explorer":"https://testnet.nearblocks.io/txns/9NqDDEn5bakgYKaZGy52FGkdt7McjPTvQGGC94NhZ5Kk","erro…
- ✓ the contract accepted the settlement the VM signed
- ✓ prediction 3: m2 received exactly 0.08 NEAR and nothing else moved
- ✓ the taker was charged exactly 0.08: 0.12 left
- ✓ the order hash in the settlement transaction on chain is the one the VM computed

### prediction 4: teardown of the chain side (members exit with their remainders, group pruned, accounts deleted)

- observed **teardown**: `{"pruned":1,"notPruned":[],"deleted":5,"kept":[],"failed":[]}`
- ✓ the group was pruned and every account deleted
- ✓ the contract holds the groups it started with

### prediction 4: teardown: delete the VM and prove the account is empty

- observed **teardown**: `{"deleted":true,"id":"bd6f9b3eed06ac9f41fd3e2c6dcf00419160593e","seconds":171,"estimatedUsd":0.0028}`
- ✓ the VM was deleted
- ✓ no CVM is left running on the account
- observed **estimated cost (USD)**: `0.0028`
- ✓ the session cost under $0.10

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
