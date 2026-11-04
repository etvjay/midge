# Lab run 20261104T112702Z-6252

- **Code:** `4a30d55d2201f615d4712a9f977ce32f50185ef5` on `master` (**4 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `8a0180ff698c44b5…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 151 events, hash-chained; root `9eb0a0e6be3c563cad3197ec400c5e3ea6102f82eca8bdcf6f953fcef136fe30`. Verify with `node lab/verify-run.js lab/runs/20261104T112702Z-6252`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-HOSTED-LIVE-01 The hosted Roost on a real Phala TDX VM runs a full syndicate round on NEAR testnet | hardware | **PASS** | 19 | 73 |  |

## E-HOSTED-LIVE-01: The hosted Roost on a real Phala TDX VM runs a full syndicate round on NEAR testnet

**Hypothesis.** A member who verifies the Roost's attestation on a real Intel TDX VM (official verifier, keys bound to a fresh nonce, compose hash derived from our own file) can seal bids to it; the VM aggregates them exactly and signs a settlement that the NEAR contract accepts only for what the sealed bids support. The VM's attested compose hash becomes the syndicate's on-chain expected code hash. Every attack that failed against a local Roost fails the same way, and the VM is deleted at the end.

**What this does not prove**
- One operator controls all members, the coordinator, the recipient and the VM account. This shows the system working end to end on real hardware, not independent parties.
- The attestation proves the VM runs the pinned compose and image; it does not audit the code inside the image, and it is only as strong as Intel TDX and Phala's platform.
- The VM exists for a few minutes. Nothing here shows a VM kept up for days or a failure of the VM mid-round.
- The coordinator key is generated for this session and held by this process; the model is a coordinator with a key, not a decentralised one.
- Testnet only; the contract has not been audited by a third party.

| Step | Result | Assertions | Time |
|---|---|---|---|
| preflight: the Phala account is empty and the pins are present | ✓ pass | 3/3 | 2621 ms |
| deploy the Roost on a real TDX VM (capped by a dead-man's switch) | ✓ pass | 4/4 | 46137 ms |
| verify the attestation exactly as a member would | ✓ pass | 14/14 | 2890 ms |
| the Roost's access control holds on the public internet | ✓ pass | 6/6 | 204 ms |
| the keys a member would seal to are the attested keys | ✓ pass | 3/3 | 0 ms |
| preflight: accounts, balances and deployed contract | ✓ pass | 3/3 | 2076 ms |
| hatch a syndicate whose settlement key is the Roost's | ✓ pass | 2/2 | 1833 ms |
| members deposit with explicit consent to the policy hash | ✓ pass | 5/5 | 7199 ms |
| members seal bids; the Roost aggregates them exactly | ✓ pass | 2/2 | 289 ms |
| ATTACK 1: the Roost refuses to sign more than the sealed bids support | ✓ pass | 1/1 | 219 ms |
| settle on chain with the Roost's signature | ✓ pass | 4/4 | 3980 ms |
| ATTACK 2: replaying the same signed settlement is rejected | ✓ pass | 2/2 | 2075 ms |
| ATTACK 3: a valid Roost signature cannot pay a recipient outside the policy | ✓ pass | 5/5 | 8706 ms |
| ATTACK 4: a settlement signed by a different key is rejected | ✓ pass | 2/2 | 2505 ms |
| cleanup: settle syndicate #2 legitimately with the real Roost | ✓ pass | 2/2 | 3538 ms |
| the Roost stalls: a member takes their own funds back with hatch_out | ✓ pass | 7/7 | 18155 ms |
| return the funds: the recipient pays the members back so the experiment can be repeated | ✓ pass | 3/3 | 6981 ms |
| ledger: every transaction, and what the experiment cost | ✓ pass | 2/2 | 1033 ms |
| teardown: delete the VM and prove the account is empty | ✓ pass | 3/3 | 5746 ms |

### preflight: the Phala account is empty and the pins are present

- ✓ no CVM is already running on the account (so nothing is billing unseen)
- ✓ the compose file is pinned to a CI-built image digest
- ✓ a production OS image hash is pinned
- observed **instance type and rate**: `{"type":"tdx.small","usdPerHour":0.058}`

### deploy the Roost on a real TDX VM (capped by a dead-man's switch)

- note: deploying midge-lab-11041127
- evidence cvm: {"id":"818f9690eecaf174b9fe20eafa0fa29c9b14d9bd","url":"https://818f9690eecaf174b9fe20eafa0fa29c9b14d9bd-8080.dstack-pha-prod5.phala.network","deadmanHours":1}
- ✓ the VM answered /healthz
- ✓ the VM was created with public logs off
- ✓ it runs a production (non-dev) OS image
- ✓ it runs the pinned production OS image hash

### verify the attestation exactly as a member would

- observed **verifier image**: `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`
- ✓ Phala's app-compose contains our compose file byte for byte
- observed **attestation**: `{"bytes":12947,"simulated":false}`
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
- evidence attestation: {"composeHash":"8a0180ff698c44b5e743acca369fbfe9f309fbf084cf87415f6962fb8e1be6c8","osImageHash":"ec43cb8c5e04b6bb6c53b33b16076a01d83d01f7f4b703f2f78a0d947d6247e6","nonce":"08490d50f424d26f4df32010e5ffbf80d043e8b5e8cca201…

### the Roost's access control holds on the public internet

- ✓ /aggregate without the coordinator key is refused (401)
- ✓ /settle without the coordinator key is refused (401)
- ✓ /debug does not exist
- ✓ /env does not exist
- ✓ /state does not exist
- ✓ /logs does not exist

### the keys a member would seal to are the attested keys

- ✓ the intent key a member would seal to equals the attested intent key
- ✓ the settlement key the contract will trust equals the attested settlement key
- ✓ the session says it is not simulated

### preflight: accounts, balances and deployed contract

- observed **balances (NEAR)**: `{"fly-1793636729.testnet":"1.1876","f1.fly-1793636729.testnet":"0.1633","f2.fly-1793636729.testnet":"0.1881","f3.fly-1793636729.testnet":"0.…`
- note: Measured: a full round costs about 0.002 NEAR net, because unused prepaid gas is refunded. The balance needed is the temporary peak: a deposit (up to 0.03) plus prepaid gas (up to 0.06 at current testnet gas prices).
- ✓ every member has enough testnet NEAR for the peak of this experiment (0.09 each)
- ✓ the master account can pay for hatching (0.1 NEAR)
- observed **deployed code hash**: `GwjB69No5TfDcuFTrff67kNmRUd7fQDW75kMxZp9Mxwi`
- ✓ the deployed contract is the audited build

### hatch a syndicate whose settlement key is the Roost's

- evidence tx: {"label":"hatch lab-hwmw218yjl-1","hash":"89zGdN5kJQ1eYm2aDZDdkFpwGc77Y1rCxHWXfGBWadsk","ok":true,"explorer":"https://testnet.nearblocks.io/txns/89zGdN5kJQ1eYm2aDZDdkFpwGc77Y1rCxHWXfGBWadsk","gasTGas":2.548929730317,"err…
- ✓ hatch succeeded on chain
- observed **syndicate state**: `{"status":"Active","epoch":1,"flyers":0}`
- ✓ the syndicate is active

### members deposit with explicit consent to the policy hash

- evidence tx: {"label":"deposit f1.fly-1793636729.testnet -> lab-hwmw218yjl-1","hash":"BwkA2suQzho3RX5W7hUYKZuHTLxnW6Va9ipX85gSiu1i","ok":true,"explorer":"https://testnet.nearblocks.io/txns/BwkA2suQzho3RX5W7hUYKZuHTLxnW6Va9ipX85gSiu1i…
- ✓ f1.fly-1793636729.testnet deposited 0.02 NEAR
- evidence tx: {"label":"deposit f2.fly-1793636729.testnet -> lab-hwmw218yjl-1","hash":"DHBxSLRexFsSm3kne1oT2bSft8D76UHZxfSZA5KW9JgJ","ok":true,"explorer":"https://testnet.nearblocks.io/txns/DHBxSLRexFsSm3kne1oT2bSft8D76UHZxfSZA5KW9JgJ…
- ✓ f2.fly-1793636729.testnet deposited 0.02 NEAR
- evidence tx: {"label":"deposit f3.fly-1793636729.testnet -> lab-hwmw218yjl-1","hash":"5HdqB28XEffe9Zyw5Zc6dPhV5gcjUG4Mpu2fUJ8tQZHn","ok":true,"explorer":"https://testnet.nearblocks.io/txns/5HdqB28XEffe9Zyw5Zc6dPhV5gcjUG4Mpu2fUJ8tQZHn…
- ✓ f3.fly-1793636729.testnet deposited 0.02 NEAR
- ✓ escrow equals the three deposits exactly
- ✓ three active flyers

### members seal bids; the Roost aggregates them exactly

- observed **aggregate**: `{"totalInputAmount":"0.06","flyerCount":3,"excludedFlyers":[],"executionModel":"HOSTED_EXACT_BATCH","confidentiality":"tee-hosted","timestam…`
- ✓ the total is exactly 0.06
- ✓ three bids counted and none excluded

### ATTACK 1: the Roost refuses to sign more than the sealed bids support

- ✓ over-allocation is refused by the Roost

### settle on chain with the Roost's signature

- evidence tx: {"label":"settle_batch lab-hwmw218yjl-1","hash":"5g6UA4obrGHPSVQGhJvrQQN8P5xP62H22hk7i83WUcCX","ok":true,"explorer":"https://testnet.nearblocks.io/txns/5g6UA4obrGHPSVQGhJvrQQN8P5xP62H22hk7i83WUcCX","gasTGas":6.1260126839…
- ✓ settle_batch succeeded
- observed **recipient balance change (NEAR)**: `0.06`
- ✓ the syndicate is Settled
- ✓ the recipient received exactly the escrow
- ✓ the escrow is empty

### ATTACK 2: replaying the same signed settlement is rejected

- evidence tx: {"label":"REPLAY settle_batch lab-hwmw218yjl-1","hash":null,"ok":false,"explorer":null,"gasTGas":0,"error":"Smart contract panicked: panicked at src/lib.rs:505:9:\nassertion `left == right` failed: [HAQ REJECT] Syndicate…
- observed **contract answer**: `Smart contract panicked: panicked at src/lib.rs:505:9:
assertion `left == right` failed: [HAQ REJECT] Syndicate is not active.
  left: Settl…`
- ✓ the replay failed
- ✓ the recipient balance did not change

### ATTACK 3: a valid Roost signature cannot pay a recipient outside the policy

- ✓ hatch #2 succeeded
- ✓ f1.fly-1793636729.testnet deposited 0.02
- ✓ f2.fly-1793636729.testnet deposited 0.02
- evidence tx: {"label":"settle_batch lab-hwmw218yjl-2","hash":null,"ok":false,"explorer":null,"gasTGas":0,"error":"Smart contract panicked: panicked at src/lib.rs:557:13:\n[Settle REJECT] Recipient thief-hwmw218yjl.testnet is not in a…
- observed **contract answer**: `Smart contract panicked: panicked at src/lib.rs:557:13:
[Settle REJECT] Recipient thief-hwmw218yjl.testnet is not in allowed_recipients whit…`
- ✓ the contract rejected a payout to an unapproved recipient
- ✓ the syndicate is still active with the escrow intact

### ATTACK 4: a settlement signed by a different key is rejected

- evidence tx: {"label":"settle_batch lab-hwmw218yjl-2","hash":null,"ok":false,"explorer":null,"gasTGas":0,"error":"Smart contract panicked: panicked at src/lib.rs:615:9:\n[HAQ REJECT] Invalid enclave Ed25519 signature over deliberatio…
- observed **contract answer**: `Smart contract panicked: panicked at src/lib.rs:615:9:
[HAQ REJECT] Invalid enclave Ed25519 signature over deliberation batch!`
- ✓ the contract rejected a signature from a key it was not hatched with
- ✓ nothing moved

### cleanup: settle syndicate #2 legitimately with the real Roost

- evidence tx: {"label":"settle_batch lab-hwmw218yjl-2","hash":"9xcAdYa86ismypD76ePv4SqPEeF1VxHg4RAhdipUd76R","ok":true,"explorer":"https://testnet.nearblocks.io/txns/9xcAdYa86ismypD76ePv4SqPEeF1VxHg4RAhdipUd76R","gasTGas":5.9267362726…
- ✓ the legitimate settlement succeeded after the failed attacks
- ✓ syndicate #2 is Settled

### the Roost stalls: a member takes their own funds back with hatch_out

- ✓ hatch #3 (timeout 2 blocks) succeeded
- ✓ f2 deposited 0.03
- evidence tx: {"label":"hatch_out lab-hwmw218yjl-3","hash":"8ZcUymgBwKSVgn7mmhPmBfnk6jMKAzmeGH2m8UrYrq25","ok":true,"explorer":"https://testnet.nearblocks.io/txns/8ZcUymgBwKSVgn7mmhPmBfnk6jMKAzmeGH2m8UrYrq25","gasTGas":5.100554026739,…
- ✓ hatch_out succeeded without any operator or enclave signature
- ✓ the escrow is empty and the syndicate is aborted/refunded
- observed **transfers made by the contract in this transaction**: `[{"to":"f2.fly-1793636729.testnet","near":"0.03"}]`
- observed **transfers made by the system (gas refunds, not the contract)**: `["0.000201","0.057876","0.002377"]`
- ✓ the contract made exactly one transfer
- ✓ it went to the member who called hatch_out
- ✓ and it was exactly the 0.03 NEAR they deposited (no more, no less)
- note: Balance deltas were rejected as evidence here: gas refunds from earlier transactions land after a reading is taken and made a correct refund look like a double payment. The receipts above are authoritative.

### return the funds: the recipient pays the members back so the experiment can be repeated

- evidence tx: {"label":"return 0.04 NEAR to f1.fly-1793636729.testnet","hash":"Aav3qKKkaxp2zuTQ7nMaM1WFQMLmgJWqEL1oVupj1GoS","ok":true,"explorer":"https://testnet.nearblocks.io/txns/Aav3qKKkaxp2zuTQ7nMaM1WFQMLmgJWqEL1oVupj1GoS","error…
- ✓ returned 0.04 NEAR to f1.fly-1793636729.testnet
- evidence tx: {"label":"return 0.04 NEAR to f2.fly-1793636729.testnet","hash":"GPv6eeqA4efG868HcLx2yxbemYvvVfsAGkzUoS3YpYth","ok":true,"explorer":"https://testnet.nearblocks.io/txns/GPv6eeqA4efG868HcLx2yxbemYvvVfsAGkzUoS3YpYth","error…
- ✓ returned 0.04 NEAR to f2.fly-1793636729.testnet
- evidence tx: {"label":"return 0.02 NEAR to f3.fly-1793636729.testnet","hash":"25AaHhdi5HtqLBbfBLZN48RKzDWebuuR7pED9VEHfnK8","ok":true,"explorer":"https://testnet.nearblocks.io/txns/25AaHhdi5HtqLBbfBLZN48RKzDWebuuR7pED9VEHfnK8","error…
- ✓ returned 0.02 NEAR to f3.fly-1793636729.testnet

### ledger: every transaction, and what the experiment cost

- observed **transactions sent**: `18`
- observed **transactions that failed (expected: the 3 attack attempts)**: `["REPLAY settle_batch lab-hwmw218yjl-1","settle_batch lab-hwmw218yjl-2","settle_batch lab-hwmw218yjl-2"]`
- ✓ exactly the three attacks failed on chain
- observed **net NEAR spent across all accounts (gas and storage)**: `0.00213`
- ✓ the whole experiment cost less than 0.02 NEAR net (measured previously: about 0.002)

### teardown: delete the VM and prove the account is empty

- observed **teardown**: `{"deleted":true,"id":"818f9690eecaf174b9fe20eafa0fa29c9b14d9bd","seconds":111,"estimatedUsd":0.0018}`
- ✓ the VM was deleted
- ✓ no CVM is left running on the account
- observed **estimated cost (USD)**: `0.0018`
- ✓ the session cost under $0.05

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
