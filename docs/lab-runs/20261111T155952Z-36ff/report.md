# Lab run 20261111T155952Z-36ff

- **Code:** `337ad4824dd7ac656cb901587b80e78e26b093b5` on `completeness` (**3 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `73f42e651241e148…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 368 events, hash-chained; root `170071394f21610770f30241330de7462ad9efc9edea7853feb8d3ff1dbc1caa`. Verify with `node lab/verify-run.js lab/runs/20261111T155952Z-36ff`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-CONTRACT-FOREIGN-LIVE-01 The Midge contract, not a script, asks the NEAR MPC signer for foreign payments after checking the group's rules: Solana devnet and Ethereum Sepolia payments land, out-of-rules requests are refused | testnet | **PASS** | 5 | 25 |  |
| E-FOREIGN-SIGNER-FAIL-LIVE-01 A signer call that fails mid-request, live: the reservation and the obligation are released, the same obligation id works again with the real signer | testnet | **FAIL** | 7 | 6 (2 failed) |  |
| E-TWO-ROOM-LIVE-01 Two-room agreement on testnet: two Roosts must both sign; a lying room, one room twice, or one signature alone move no money | testnet | **FAIL** | 6 | 38 |  |
| E-CALLBACK-GAS-01 GAP-008: how much gas does the follow-up step of a payout really burn, per member? | testnet | **FAIL** | 5 | 24 (1 failed) |  |
| E-ONGOING-01 Ongoing groups on testnet: a Dark Vault that lives across three rounds with three programs, takes a late deposit, and what its release cap really bounds | testnet | **PASS** | 12 | 73 |  |
| E-TIMER-CONSENT-01 GAP-025 on testnet: the exit timer is in the hash depositors consent to; a 9-block timer is refused; older groups are intact | testnet | **PASS** | 6 | 49 |  |

## E-CONTRACT-FOREIGN-LIVE-01: The Midge contract, not a script, asks the NEAR MPC signer for foreign payments after checking the group's rules: Solana devnet and Ethereum Sepolia payments land, out-of-rules requests are refused

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. Needs the test contract m.<account> deployed (node scripts/deploy-rules-contract.mjs) and the group payroll-live-1 created and funded once (npm run verify:contract-payroll).

**What this does not prove**
- One operator controls the room key (a test key, not a hosted Roost), the contract and the payees.
- The contract is a test deployment (m.<account>); production c.<account> is not upgraded.
- Money at the group's foreign addresses is outside the NEAR escrow, so a member's exit does not reach it.
- Solana devnet and Ethereum Sepolia only; nothing is sent on Bitcoin. The signer failing mid-request is shown separately by E-FOREIGN-SIGNER-FAIL-LIVE-01.

| Step | Result | Assertions | Time |
|---|---|---|---|
| prediction 1: the keys are the contract's, and the group is funded | ✓ pass | 8/8 | 23513 ms |
| prediction 2: an in-rules Solana payment is requested by the contract, signed, lands, and the payee gains exactly the amount | ✓ pass | 4/4 | 9247 ms |
| prediction 3: an in-rules Ethereum payment is requested by the contract, recovers to the contract-derived address, lands | ✓ pass | 4/4 | 13430 ms |
| prediction 4: the contract's books moved by exactly what was paid, and both obligations are marked signed | ✓ pass | 4/4 | 815 ms |
| prediction 5: four out-of-rules requests are each refused with their own reason, and the totals do not move | ✓ pass | 5/5 | 10561 ms |

### prediction 1: the keys are the contract's, and the group is funded

- ✓ the group exists on the test contract (run npm run verify:contract-payroll once if not)
- ✓ the contract holds the group's foreign policy
- ✓ the contract names a signer path for the group that includes the group id and its creation block
- ✓ the addresses derived from the bare group id are NOT the ones the group uses, so a freed and re-hatched id cannot take over its money
- ✓ the Solana address derived for the contract differs from the one for our own account with the same path
- ✓ the Ethereum address derived for the contract differs from the one for our own account with the same path
- evidence solana: {"label":"top-up of the group address","signature":"28VVs63xtV8dkvi7fPMueKak9nHGgqWT7Vd3U9KnL5UGfC59gwwtEtDSPumjzDqjYdjrfzUuAm5mckGCqVKYdkUE"}
- evidence sepolia: {"label":"top-up of the group address","hash":"0xb95af8a1cac6c61e2c3858223ae652a3e05e15b44810e83d683aa8fa0da788cb"}
- ✓ the Solana group address holds enough for a payment
- ✓ the Ethereum group address holds enough for a payment

### prediction 2: an in-rules Solana payment is requested by the contract, signed, lands, and the payee gains exactly the amount

- evidence near: {"nearTx":"4vWdtZrsbrkTgaeE7SoUFXmhCgfB4ukPgC3uk8v3691k","ok":true}
- ✓ the contract accepted the room-signed request and returned a signature
- ✓ the signature verifies against the contract-derived Solana key over the message rebuilt here independently
- evidence solana: {"signature":"3PpxqXM7RsgKW4QQPu84hFbQBCDG1b63hmzWqJZgpaECtY6kUQ39zCyg6v5brtoBkkmaigvHjpo4QdW95LduEKqU","status":"finalized","err":null}
- ✓ the transaction landed on Solana devnet without error
- ✓ the payee gained exactly the amount

### prediction 3: an in-rules Ethereum payment is requested by the contract, recovers to the contract-derived address, lands

- evidence near: {"nearTx":"CdZGGgzGcoxnPmHGaxyVRQZY2yzJjeZQHsNZGbhWyXCr","ok":true}
- ✓ the contract accepted the room-signed request and returned a signature
- ✓ the signature recovers to the contract-derived Ethereum address over the digest ethers computes independently
- evidence sepolia: {"hash":"0x3019b1143ce9240bf12b293e47b4d5a277b2cdae5ac283c8e26323191776bae3","block":12112769,"status":1}
- ✓ the transaction landed on Sepolia with status 1
- ✓ the payee gained exactly the amount

### prediction 4: the contract's books moved by exactly what was paid, and both obligations are marked signed

- ✓ the Solana payee's running total rose by exactly the amount
- ✓ the Ethereum payee's running total rose by exactly the amount
- ✓ obligation exp-sol-mwcb1o9g is recorded as signed
- ✓ obligation exp-eth-mwcb1o9g is recorded as signed

### prediction 5: four out-of-rules requests are each refused with their own reason, and the totals do not move

- evidence refusal: {"label":"an unlisted payee","nearTx":null,"error":"Smart contract panicked: [Foreign REJECT] payee is not allowed on this chain"}
- ✓ refused: an unlisted payee
- evidence refusal: {"label":"an amount over the per-payment cap","nearTx":null,"error":"Smart contract panicked: panicked at src/lib.rs:1968:9:\n[Foreign REJECT] amount is over the per-payment cap"}
- ✓ refused: an amount over the per-payment cap
- evidence refusal: {"label":"a reused obligation id","nearTx":null,"error":"Smart contract panicked: panicked at src/lib.rs:1950:9:\n[Foreign REJECT] obligation exp-sol-mwcb1o9g was already requested"}
- ✓ refused: a reused obligation id
- evidence refusal: {"label":"a request the room did not sign (amount changed after signing)","nearTx":null,"error":"Smart contract panicked: panicked at src/lib.rs:1944:9:\n[HAQ REJECT] Invalid enclave Ed25519 signature over foreign paymen…
- ✓ refused: a request the room did not sign (amount changed after signing)
- ✓ the recorded totals did not move

## E-FOREIGN-SIGNER-FAIL-LIVE-01: A signer call that fails mid-request, live: the reservation and the obligation are released, the same obligation id works again with the real signer

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. Runs on the TEST copy of the contract deployed with the test-signer-override feature build. Pointing the signer at an account that does not exist makes the cross-contract call fail; the callback releases the reservation; the same obligation id is accepted again with the real signer and its signature verifies.

**What this does not prove**
- Runs on the TEST copy of the contract deployed with a feature build (test-signer-override) that production does not contain; it shows the contract's behaviour when a cross-contract call fails, not the real MPC network failing.
- The Solana path only; the Ethereum path shares the same callback. A failure arriving after the window has rolled is covered by unit tests.
- One operator controls the room key, the contract and the payee.

| Step | Result | Assertions | Time |
|---|---|---|---|
| set up: the test copy runs the test-signer-override build (the default build is put back at the end) | ✗ fail | 2/3 | 6478 ms |
| set up: a group with a foreign policy (one Solana payee, 2,000,000 per payment and in total, window 100 blocks), its address funded | – skip | 0/0 | 0 ms |
| prediction 1: only the contract's own account may point the signer elsewhere | – skip | 0/0 | 0 ms |
| prediction 2: a failing signer releases the reservation and the obligation | – skip | 0/0 | 0 ms |
| prediction 3: with the real signer the same obligation id is accepted again, and its signature verifies | – skip | 0/0 | 0 ms |
| teardown: the default build is put back on the test copy | ✓ pass | 2/2 | 5966 ms |
| teardown: the owner removes the unfunded group | ✗ fail | 0/1 | 1778 ms |

### set up: the test copy runs the test-signer-override build (the default build is put back at the end)

- ✓ the feature build exists (build it with: npm run build:wasm:testsigner)
- ✓ the feature build is not the production build
- evidence deploy: {"account":"m.fly-1793636729.testnet","featureBuild":"Fsa5uNhmY4Pdopq53GAooeiMnVQ9N6yXYZPnUtPxUZLS","defaultBuild":"3dGAu1yG9gaZbMTXWX3eYjN8mVM2LUyQR8Czu9W1vg1C"}
- ✗ the test copy has get_test_signer and no override is set — expected , got 

### set up: a group with a foreign policy (one Solana payee, 2,000,000 per payment and in total, window 100 blocks), its address funded

- skipped: an earlier critical step failed

### prediction 1: only the contract's own account may point the signer elsewhere

- skipped: an earlier critical step failed

### prediction 2: a failing signer releases the reservation and the obligation

- skipped: an earlier critical step failed

### prediction 3: with the real signer the same obligation id is accepted again, and its signature verifies

- skipped: an earlier critical step failed

### teardown: the default build is put back on the test copy

- ✓ the test copy runs the default build again
- ✓ and the test method is gone

### teardown: the owner removes the unfunded group

- ✗ the group was pruned — expected , got Smart contract panicked: Syndicate not found

## E-TWO-ROOM-LIVE-01: Two-room agreement on testnet: two Roosts must both sign; a lying room, one room twice, or one signature alone move no money

**Hypothesis.** Written before the run (docs/lab/TWO_ROOM_SPEC.md). On a two-room syndicate: (1) a settlement signed by room A alone is refused; (2) room A honest and room B signing a different charge set (B greedy) is refused; (3) one room's signature supplied twice is refused; (4) after those three refusals the escrow is unchanged and the honest settlement from both rooms still succeeds; (5) two real Roosts fed the same signed inputs sign the identical message and the contract pays exactly the total with each member charged only their own amount; (6) a member who sends different bids to the two rooms makes them disagree and the contract refuses, and after the coordinator finds that member by salted digests and both rooms exclude them, the same two rooms settle and that member is not charged; (7) if room B never signs, nothing settles, and every member exits alone and recovers the full deposit. Fails if any refused call succeeds, if money moves on a refusal, or if an honest two-room settlement is refused.

**What this does not prove**
- One operator controls every account, both Roosts and the coordinator. Both Roosts are local with a simulated attestation provider: this tests the contract and the agreement logic, not independence or hardware.
- In (1) to (4) room B is a plain signing key we hold, standing in for a compromised or greedy room, because a real Roost refuses to sign anything it did not compute.
- The rooms exchange nothing but salted digests; the digests reveal no amount, and the coordinator sees them.
- The Roost's two-room mode removes time priority; ties break by a hash. Testnet only; third-party audit: none.

| Step | Result | Assertions | Time |
|---|---|---|---|
| set up: four members, a recipient, and the first two-room checks on a fresh deployment | ✓ pass | 2/2 | 12605 ms |
| ATTACKS · a single signature, a greedy second room, one room twice: each refused, the escrow untouched, then the honest pair settles | ✓ pass | 8/8 | 16079 ms |
| HONEST · two real Roosts, same signed inputs, one identical message | ✓ pass | 12/12 | 23154 ms |
| EQUIVOCATION · d tells the rooms different bids: refused, then found by digests, excluded, and the rooms settle | ✗ fail | 5/5 | 14028 ms |
| ROOM GONE · room B never signs: nothing settles and every member exits alone with the full deposit | ✓ pass | 8/8 | 23166 ms |
| teardown: prune the syndicates, compact, delete the accounts | ✓ pass | 3/3 | 66405 ms |

### set up: four members, a recipient, and the first two-room checks on a fresh deployment

- ✓ five accounts exist
- ✓ the deployed contract has the two-room entry points (get_second_enclave_key answers)

### ATTACKS · a single signature, a greedy second room, one room twice: each refused, the escrow untouched, then the honest pair settles

- ✓ hatch_two_room succeeds
- ✓ the second key is registered on chain
- evidence tx: {"label":"room A alone","hash":"9vrX9mzR6mKDmZdffuVEev8BeUJwtzHRJy4yae9dVkJm","ok":false,"explorer":"https://testnet.nearblocks.io/txns/9vrX9mzR6mKDmZdffuVEev8BeUJwtzHRJy4yae9dVkJm","error":"Smart contract panicked: [HAQ…
- ✓ (1) a settlement signed by room A alone is refused
- evidence tx: {"label":"room B greedy","hash":"6uniNNrHo5wt5ejqHMAUHLwZu2751EUsNbX4JCdN51Qm","ok":false,"explorer":"https://testnet.nearblocks.io/txns/6uniNNrHo5wt5ejqHMAUHLwZu2751EUsNbX4JCdN51Qm","error":"Smart contract panicked: pan…
- ✓ (2) room A honest, room B signing a different charge set (greedy) is refused
- evidence tx: {"label":"room A twice","hash":"2vsYUzThHhiS4MNTfuxN2gzEWitWE7CZQd3sSgqwBv8k","ok":false,"explorer":"https://testnet.nearblocks.io/txns/2vsYUzThHhiS4MNTfuxN2gzEWitWE7CZQd3sSgqwBv8k","error":"Smart contract panicked: pani…
- ✓ (3) one room's signature supplied twice is refused
- ✓ (4) after three refusals every escrow is unchanged and no settlement is in flight
- evidence tx: {"label":"honest pair (room B key we hold)","hash":"CH4cpmyfJPAbJGzrSCTLL8bWXhdmiDyfhtPmBHArEY5B","ok":true,"explorer":"https://testnet.nearblocks.io/txns/CH4cpmyfJPAbJGzrSCTLL8bWXhdmiDyfhtPmBHArEY5B","error":null}
- ✓ (4) the honest pair then settles: the refusals did not break the round
- ✓ the recipient received exactly 0.06
- evidence gas: {"twoRoomSettleTGas":8.107311260996}

### HONEST · two real Roosts, same signed inputs, one identical message

- ✓ the rooms have different settlement keys
- ✓ hatch_two_room succeeds
- ✓ salted digests of each member's input match between the rooms
- ✓ (5) the two rooms signed the byte-identical message
- evidence tx: {"label":"two real Roosts","hash":"j6e4cDErxLz1KVdfBZQ99HtPSA9BurGzBirKdT6BDJ8","ok":true,"explorer":"https://testnet.nearblocks.io/txns/j6e4cDErxLz1KVdfBZQ99HtPSA9BurGzBirKdT6BDJ8","error":null}
- evidence gas: {"twoRoomSettleTGas":8.137088661248}
- ✓ (5) the settlement succeeded
- ✓ (5) the recipient received exactly 0.06
- ✓ a exits alone
- ✓ b exits alone
- ✓ c exits alone
- ✓ (5) a got back exactly their deposit less their own 0.01
- ✓ (5) b got back exactly their deposit less their own 0.02
- ✓ (5) c got back exactly their deposit less their own 0.03

### EQUIVOCATION · d tells the rooms different bids: refused, then found by digests, excluded, and the rooms settle

- ✓ hatch_two_room succeeds
- ✓ (6) the salted digests differ for exactly d
- ✓ (6) with d in, the rooms signed different messages
- evidence tx: {"label":"rooms disagree","hash":"ELv6oWV1ra8a45pyyjg2ZHJXxYJqwVztLCau2N6su7Rm","ok":false,"explorer":"https://testnet.nearblocks.io/txns/ELv6oWV1ra8a45pyyjg2ZHJXxYJqwVztLCau2N6su7Rm","error":"Smart contract panicked: pa…
- ✓ (6) the contract refuses the disagreeing pair
- ✓ (6) nothing moved

### ROOM GONE · room B never signs: nothing settles and every member exits alone with the full deposit

- ✓ hatch_two_room succeeds
- evidence tx: {"label":"A alone, B gone","hash":"BBMxsLYCnsYbpVWtrzGZfWCHDEEFzUVJoinWDS12HmCc","ok":false,"explorer":"https://testnet.nearblocks.io/txns/BBMxsLYCnsYbpVWtrzGZfWCHDEEFzUVJoinWDS12HmCc","error":"Smart contract panicked: […
- ✓ (7) room A cannot settle without room B
- ✓ a exits alone
- ✓ b exits alone
- ✓ c exits alone
- ✓ (7) a recovered the full deposit alone
- ✓ (7) b recovered the full deposit alone
- ✓ (7) c recovered the full deposit alone

### teardown: prune the syndicates, compact, delete the accounts

- observed **teardown**: `{"pruned":4,"notPruned":[],"deleted":5,"kept":[],"failed":[]}`
- ✓ every account was deleted and every syndicate pruned
- ✓ the contract holds the records it started with
- ✓ no second-room key is left behind for a pruned syndicate

## E-CALLBACK-GAS-01: GAP-008: how much gas does the follow-up step of a payout really burn, per member?

**Hypothesis.** Written before the run. The follow-up step (on_settlement_payout) applies each member's deduction and clears the settling mark. Its cost is a base plus a per-member part. Prediction: the base is under 10 TGas and the per-member part is under 1 TGas, so the sizing 25 TGas + 1 TGas per member (capped at 100) is enough for the 50-member maximum (about 75 TGas). The contract deployed at the time of the run may give it a flat 25 TGas; if the measured cost extrapolated to 50 members exceeds the allotment in force, that is the GAP-008 risk, shown. Fails if the follow-up step fails to run or settle, or if the measured per-member cost is 1 TGas or more (the sizing would then be too small).

**What this does not prove**
- Measures gas from the settlement's own receipts on testnet for 4 and N members and extrapolates linearly to 50; it does not run 50 members.
- It cannot make a real callback run out of gas, so the recovery path itself is shown by unit tests, not live.
- One operator controls every account and the host is local.

| Step | Result | Assertions | Time |
|---|---|---|---|
| set up: 20 members and a recipient | ✓ pass | 1/1 | 46654 ms |
| 4 members | ✓ pass | 9/9 | 15004 ms |
| 20 members | ✓ pass | 9/9 | 53627 ms |
| the per-member cost, extrapolated to the 50-member maximum | ✓ pass | 3/3 | 1 ms |
| teardown: exit, prune, compact, delete the accounts | ✗ fail | 1/2 | 246027 ms |

### set up: 20 members and a recipient

- ✓ 21 accounts exist

### 4 members

- ✓ hatch gas4-mwcb6jlp
- evidence tx: {"label":"settle_batch gas4-mwcb6jlp (4 members)","hash":"kBYMVi2MNQ6jrRDFq6KDF89kwsZJEQTkgucNqhHBUeJ","ok":true,"explorer":"https://testnet.nearblocks.io/txns/kBYMVi2MNQ6jrRDFq6KDF89kwsZJEQTkgucNqhHBUeJ","error":null}
- ✓ the 4-member settlement succeeded
- ✓ the transaction status with receipts was readable
- ✓ the follow-up step ran and logged the settlement
- ✓ it reported success (not a failed payout)
- ✓ the allotted gas for the follow-up step could be read from the receipts
- ✓ the follow-up step burnt less than it was allotted (it did not run out)
- ✓ on the fixed contract the follow-up step is allotted 25 TGas + 1 per member (>= 29 TGas for 4 members)
- ✓ and the pending record is gone once the follow-up step has run
- evidence allotment: {"members":4,"allottedTGas":246.400877660255}
- evidence callback: {"members":4,"callbackBurntTGas":3.465708033164,"pendingAfter":null}

### 20 members

- ✓ hatch gas20-mwcb6jlp
- evidence tx: {"label":"settle_batch gas20-mwcb6jlp (20 members)","hash":"5Wzcsai2VYkGHUiQRsrfZ9rCDPU51HFozKeHmAsbYa77","ok":true,"explorer":"https://testnet.nearblocks.io/txns/5Wzcsai2VYkGHUiQRsrfZ9rCDPU51HFozKeHmAsbYa77","error":nul…
- ✓ the 20-member settlement succeeded
- ✓ the transaction status with receipts was readable
- ✓ the follow-up step ran and logged the settlement
- ✓ it reported success (not a failed payout)
- ✓ the allotted gas for the follow-up step could be read from the receipts
- ✓ the follow-up step burnt less than it was allotted (it did not run out)
- ✓ on the fixed contract the follow-up step is allotted 25 TGas + 1 per member (>= 45 TGas for 20 members)
- ✓ and the pending record is gone once the follow-up step has run
- evidence allotment: {"members":20,"allottedTGas":246.317028088106}
- evidence callback: {"members":20,"callbackBurntTGas":7.458367546185,"pendingAfter":null}

### the per-member cost, extrapolated to the 50-member maximum

- observed **fit**: `{"baseTGas":2.47,"perMemberTGas":0.25,"at50TGas":14.9,"flatAllotmentTGas":25,"sizedAllotmentAt50TGas":75}`
- evidence fit: {"baseTGas":2.47,"perMemberTGas":0.25,"at50TGas":14.9}
- ✓ the base cost is under 10 TGas
- ✓ the per-member cost is under 1 TGas (the sizing constant)
- ✓ so the sized allotment at 50 members (75 TGas) covers the extrapolated cost with room to spare
- observed **a flat 25 TGas would be enough at 50 members**: `true`

### teardown: exit, prune, compact, delete the accounts

- observed **teardown**: `{"pruned":2,"notPruned":[],"deleted":20,"kept":[],"failed":[{"id":"gb6jlpm19.fly-1793636729.testnet","error":"Signer gb6jlpm19.fly-179363672…`
- ✗ every account was deleted and every syndicate pruned — expected , got {"label":"json","sha256":"979754f21644d4cb646439e2b90ba83253de740ffa9f1bb01681c7c4b8cd0462","bytes":2739,"blob":"blobs/979754f21644d4cb646439e2b90ba83253de740ff…
- ✓ the contract holds the records it started with

## E-ONGOING-01: Ongoing groups on testnet: a Dark Vault that lives across three rounds with three programs, takes a late deposit, and what its release cap really bounds

**Hypothesis.** Predictions are fixed in docs/lab/PROGRAMME_PLAN.md (committed before the first run, and again before this re-run on the GAP-024 fix). A. Four members deposit 0.1 each into a Dark Vault (25% cap, 24-block exit timer, so a 48-block release window); round 1 an investing pool (0.05 to rp); a fifth member deposits 0.1; round 2 a ballot among all five (0.05 to ra); round 3 a lending quote (0.04 to rl, won by u3 at 400 bps); each round waits for the previous window to end, so each opens its own window. (1) The epoch rises by exactly 1 per round and the nonce changes each time. (2) The late member joins between rounds and is counted and charged; escrows sum to the group total after every round. (3) Replaying round 1's signed settlement after round 2 is refused and changes nothing. (4) An exit straight after round 3 is refused; a fourth, small round inside round 3's window does not advance the epoch or move the exit timer's start; members can exit at the window start plus the timer, which is earlier than the fourth settlement plus the timer (the old rule would have locked them out until then), with exactly deposit minus charges. B. With a key we hold standing in for a compromised host, 25% cap, 24-block timer: 0.11 of 0.4 is refused; exactly 0.1 succeeds; a second payout of 0.075 straight after is refused (cumulative), and so is 0.001; after the window ends 0.075 (25% of the then-current 0.3) succeeds; the window's real length in seconds is read from the chain and the implied time to release 90% is reported; members exit with exact remainders. The limit is only as strict as the timer. Fails if any breaks.

**What this does not prove**
- One operator controls every account and the host; the members are scripted. The host is a local HostedRoost with a simulated attestation provider; signed inputs use real NEAR keys and the real account-key lookup.
- Three rounds and five members: not a long-lived or large group. There is no baseline; this tests the contract's lifecycle claims against what it says.
- Part B uses a key we hold to stand in for a compromised host, because a real host refuses to sign more than it computed.
- Only the cash leg settles. Deposits are public.

| Step | Result | Assertions | Time |
|---|---|---|---|
| set up: five members and four recipients | ✓ pass | 1/1 | 56081 ms |
| A · open the Dark Vault; four founders deposit 0.1 each | ✓ pass | 5/5 | 11843 ms |
| A · round 1: an investing pool, 0.05 NEAR to rp | ✓ pass | 4/4 | 5996 ms |
| A · a fifth member deposits between rounds | ✓ pass | 3/3 | 4446 ms |
| A · round 2: a ballot among all five, the pool of 0.05 to the winner | ✓ pass | 6/6 | 30157 ms |
| A · round 1's signed settlement replayed after round 2 is refused and changes nothing | ✓ pass | 2/2 | 2338 ms |
| A · round 3: a lending quote, 0.04 NEAR loan to rl won by u3 at 400 bps | ✓ pass | 11/11 | 33003 ms |
| A · an exit straight after round 3 is refused: the window opened by round 3 started the timer | ✓ pass | 3/3 | 2720 ms |
| A · round 4, inside round 3's window: a settlement that must not advance the epoch or restart the exit timer | ✓ pass | 5/5 | 7552 ms |
| A · the members leave at the window's start plus the timer, earlier than the old rule would have allowed, with exactly their remainders | ✓ pass | 12/12 | 18929 ms |
| B · the cap, fixed: a payout above 25% is refused, exactly 25% succeeds, and a second payout straight after is refused until the window ends | ✓ pass | 19/19 | 76495 ms |
| teardown: prune the syndicates, delete the accounts | ✓ pass | 2/2 | 49874 ms |

### set up: five members and four recipients

- ✓ nine accounts exist

### A · open the Dark Vault; four founders deposit 0.1 each

- ✓ hatch a DARK_VAULT syndicate
- ✓ u1 deposits 0.1
- ✓ u2 deposits 0.1
- ✓ u3 deposits 0.1
- ✓ u4 deposits 0.1
- observed **the group at the start**: `{"type":"DarkVault","epoch":1,"nonce":"0b5c4d7c423c"}`

### A · round 1: an investing pool, 0.05 NEAR to rp

- evidence tx: {"label":"settle_batch_charged round 1","hash":"GG15E9ZGWvjeqJaMPdfRTV4beFgXCFc63G3Jp8wVcki","ok":true,"explorer":"https://testnet.nearblocks.io/txns/GG15E9ZGWvjeqJaMPdfRTV4beFgXCFc63G3Jp8wVcki","error":null}
- ✓ round 1: the settlement succeeded
- ✓ round 1: the epoch rose by exactly 1 (1 to 2) and the round nonce changed
- ✓ round 1: rp received exactly 0.05 and nothing else moved
- ✓ round 1: the members' escrows sum to the group total

### A · a fifth member deposits between rounds

- ✓ u5 deposits 0.1 into the running group
- ✓ (2) the group now holds 0.45 and u5 has 0.1
- ✓ after the late deposit: the members' escrows sum to the group total

### A · round 2: a ballot among all five, the pool of 0.05 to the winner

- ✓ (2) the late member counts: A wins 3 to 2 and the pool goes to ra
- evidence tx: {"label":"settle_batch_charged round 2","hash":"DmiFBdHDgzvJHTEFZDKbuQxcTzfG66i76nPBk7tbsBad","ok":true,"explorer":"https://testnet.nearblocks.io/txns/DmiFBdHDgzvJHTEFZDKbuQxcTzfG66i76nPBk7tbsBad","error":null}
- ✓ round 2: the settlement succeeded
- ✓ round 2: the epoch rose by exactly 1 (2 to 3) and the round nonce changed
- ✓ round 2: ra received exactly 0.05
- ✓ (2) the late member was charged 0.01 like everyone else: u5 now has 0.09
- ✓ round 2: the members' escrows sum to the group total

### A · round 1's signed settlement replayed after round 2 is refused and changes nothing

- evidence tx: {"label":"replay of round 1","hash":"4sukHPmhXBSp6gaiWdHy1yP9p9W9MNuVhzyvYYt83bQd","ok":false,"explorer":"https://testnet.nearblocks.io/txns/4sukHPmhXBSp6gaiWdHy1yP9p9W9MNuVhzyvYYt83bQd","error":"Smart contract panicked:…
- ✓ (3) the replay is refused (nonce mismatch)
- ✓ (3) nothing changed: same total, same epoch, same escrows, nothing in flight

### A · round 3: a lending quote, 0.04 NEAR loan to rl won by u3 at 400 bps

- ✓ u3 wins at 400 bps
- evidence tx: {"label":"settle_batch_charged round 3","hash":"3sFxj9eR5UHMzUTNXKGGGPP2AycbWd5hXuhyBtAauHhf","ok":true,"explorer":"https://testnet.nearblocks.io/txns/3sFxj9eR5UHMzUTNXKGGGPP2AycbWd5hXuhyBtAauHhf","error":null}
- ✓ round 3: the settlement succeeded
- ✓ round 3: the epoch rose by exactly 1 (3 to 4) and the round nonce changed
- ✓ round 3: rl received exactly 0.04
- ✓ round 3: the members' escrows sum to the group total
- ✓ u1 has exactly 0.08 left
- ✓ u2 has exactly 0.08 left
- ✓ u3 has exactly 0.035 left
- ✓ u4 has exactly 0.075 left
- ✓ u5 has exactly 0.09 left
- ✓ (1) three settlements, three epochs: the epoch went up by exactly 3 and every nonce was different

### A · an exit straight after round 3 is refused: the window opened by round 3 started the timer

- ✓ round 3 opened a new window and the group's epoch start is that window's start
- evidence tx: {"label":"early exit as u1","hash":"H6niiC2RyEs8kUebKCbPXTCZ5uCLjkLwnZBCKLAJhiNb","ok":false,"explorer":"https://testnet.nearblocks.io/txns/H6niiC2RyEs8kUebKCbPXTCZ5uCLjkLwnZBCKLAJhiNb","error":"Smart contract panicked: …
- ✓ precondition: only 10 blocks have passed since the window opened, inside the 24-block timer
- ✓ (4) so an exit now is refused: the window opened by round 3 started the timer
- observed **blocks since the group was opened, far more than the timer**: `147`

### A · round 4, inside round 3's window: a settlement that must not advance the epoch or restart the exit timer

- evidence tx: {"label":"settle_batch_charged round 4","hash":"4p5busVMWG4AgHXK3pfdfcpU98Fx1XneAY3Da4Lq64dK","ok":true,"explorer":"https://testnet.nearblocks.io/txns/4p5busVMWG4AgHXK3pfdfcpU98Fx1XneAY3Da4Lq64dK","error":null}
- ✓ round 4: the settlement succeeded
- ✓ round 4 landed inside round 3's window: same window start
- ✓ (4) the epoch did not advance and the exit timer's start did not move
- ✓ round 4: the window recorded 0.05 released, 0.04 + 0.01
- ✓ round 4: the members' escrows sum to the group total

### A · the members leave at the window's start plus the timer, earlier than the old rule would have allowed, with exactly their remainders

- ✓ (4) u1 exits alone
- ✓ (4) u1 got back exactly 0.07
- ✓ (4) u2 exits alone
- ✓ (4) u2 got back exactly 0.08
- ✓ (4) u3 exits alone
- ✓ (4) u3 got back exactly 0.035
- ✓ (4) u4 exits alone
- ✓ (4) u4 got back exactly 0.075
- ✓ (4) u5 exits alone
- ✓ (4) u5 got back exactly 0.09
- observed **block of the exit, against the block the old rule would have kept them out until (the round 4 settlement plus the timer)**: `{"exitBlock":277238343,"oldRuleLockedUntil":277238357}`
- ✓ (4) the exit happened before round 4's settlement plus the timer: a settlement inside the window no longer keeps members out
- ✓ the group ended fully refunded

### B · the cap, fixed: a payout above 25% is refused, exactly 25% succeeds, and a second payout straight after is refused until the window ends

- ✓ hatch with a key we hold, standing in for a compromised host
- ✓ u1 deposits 0.1
- ✓ u2 deposits 0.1
- ✓ u3 deposits 0.1
- ✓ u4 deposits 0.1
- evidence tx: {"label":"payout above the cap: 0.11 of 0.4, charged 0.055 to each of two members so only the cap can refuse it","hash":"GtTZRAdgXRdJVJfFWuhzcZuT5BbWCSJbiqwPf43Qc5rP","ok":false,"explorer":"https://testnet.nearblocks.io/…
- ✓ (B1) a payout of 0.11 against a 25% cap of 0.1 is refused even with a valid signature
- evidence tx: {"label":"payout at exactly 25% of the escrow: 0.1","hash":"Edhm1nNDCwm6g52touhXBaL91A5uxiLT36s7N2igy1NZ","ok":true,"explorer":"https://testnet.nearblocks.io/txns/Edhm1nNDCwm6g52touhXBaL91A5uxiLT36s7N2igy1NZ","error":nul…
- ✓ (B1) a payout of exactly 0.1 succeeds
- ✓ the chain recorded a window opened by that settlement with start escrow 0.4, released 0.1, lasting twice the timer (48 blocks)
- evidence tx: {"label":"the drain that worked before the fix: 0.075, 25% of the remaining 0.3, straight after","hash":"D69K5KeJPnKqRwBvoaX7F25A5d5jRXrcTrXWYCDHRGvE","ok":false,"explorer":"https://testnet.nearblocks.io/txns/D69K5KeJPnK…
- ✓ (B2) the second payout straight after is REFUSED: cumulative release in this window would exceed the cap
- evidence tx: {"label":"even a milliNEAR more is refused inside the window","hash":"6eTz9gg2n2dPS2GvHKXcHdN1R2sAQM6sqbKXKLcehAFU","ok":false,"explorer":"https://testnet.nearblocks.io/txns/6eTz9gg2n2dPS2GvHKXcHdN1R2sAQM6sqbKXKLcehAFU",…
- ✓ (B2) 0.001 more is refused too
- ✓ (B2) nothing moved: the escrow is 0.3 and nothing is in flight
- evidence tx: {"label":"after the window ends: 0.075, 25% of the then-current 0.3","hash":"Hwakcv9AuKqvcr947nAwj6vpz6LJaVCAJ4p9axBTVyEd","ok":true,"explorer":"https://testnet.nearblocks.io/txns/Hwakcv9AuKqvcr947nAwj6vpz6LJaVCAJ4p9axBT…
- ✓ (B3) after the window ended the allowance returned, sized to the escrow then: 0.075 succeeds
- ✓ (B3) a new window with start escrow 0.3 and 0.075 released
- observed **the real length of a release window at this timer, in seconds, and the time to release 90% at a 25% cap (8 windows): here, and with a one-hour timer (about 6,300 blocks, a two-hour window)**: `{"windowSeconds":27.4,"windowsFor90":9,"secondsForNinetyPercentHere":247,"hoursForNinetyPercentWithAOneHourTimer":18,"oneHourInBlocks":6305}`
- ✓ u2 exits alone
- ✓ u2 got back exactly 0.025
- ✓ u3 exits alone
- ✓ u3 got back exactly 0.1
- ✓ u4 exits alone
- ✓ u4 got back exactly 0.1

### teardown: prune the syndicates, delete the accounts

- evidence findings: {"epochs":[1,2,3,4],"round3Window":{"start":277238316,"ends":277238364,"epochStart":277238316,"epoch":4},"cap":{"stated":"25% per window of twice the timer","timerBlocks":24,"windowSeconds":27.4,"secondBackToBackPayoutRe…
- observed **teardown**: `{"pruned":2,"notPruned":[],"deleted":9,"kept":[],"failed":[]}`
- ✓ every account was deleted and every syndicate pruned
- ✓ the contract holds the records it started with

## E-TIMER-CONSENT-01: GAP-025 on testnet: the exit timer is in the hash depositors consent to; a 9-block timer is refused; older groups are intact

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, written before the redeploy. A hatch below 10 blocks is refused, a new group is stored with the version-2 hash, a deposit that leaves out or misstates the timer is refused, one that names it is accepted, and groups opened before the change are intact and marked as not covering their timer. The failure that must not happen: a deposit accepted with a hash that omits the timer, or an older group changed by the deploy.

**What this does not prove**
- One operator controls every account; the host is local and not in the test (no round is settled here).
- It shows the contract and the checks, not that a person reads the terms.
- The older groups checked are the ones still on the contract on the day of the run (they are not mine to create again).

| Step | Result | Assertions | Time |
|---|---|---|---|
| set up: two members, a recipient, a local host key | ✓ pass | 1/1 | 7999 ms |
| prediction 1: a 9-block timer is refused at hatch | ✓ pass | 4/4 | 2852 ms |
| prediction 2: a 12-block timer is accepted and stored with the version-2 hash | ✓ pass | 5/5 | 2408 ms |
| prediction 3: a deposit that leaves out or misstates the timer is refused; one that names it is accepted | ✓ pass | 5/5 | 9181 ms |
| prediction 4: the groups opened before the change are intact and marked | ✓ pass | 32/32 | 6447 ms |
| teardown: exit, prune, delete the accounts | ✓ pass | 2/2 | 24740 ms |

### set up: two members, a recipient, a local host key

- ✓ three accounts exist
- observed **syndicates on the contract before this run**: `16`

### prediction 1: a 9-block timer is refused at hatch

- evidence hatch 9: {"ok":false,"hash":"27z7Ma3bQBNwpXYg4vGm9PppNnCVAerTZJnvBgoLPWue","error":"Smart contract panicked: panicked at src/lib.rs:647:9:\n[Hatch REJECT] timeout_blocks must be at least 10 (a sanity floor, not a recommendation: …
- ✓ the hatch was refused
- ✓ for the floor, naming it
- ✓ no such group exists
- ✓ the group count is unchanged

### prediction 2: a 12-block timer is accepted and stored with the version-2 hash

- ✓ the hatch succeeded
- ✓ the stored hash equals the version-2 hash computed independently here
- ✓ it is not the old formula
- ✓ the terms view reports 12 blocks and a 24-block window
- ✓ and that the timer is covered by the hash

### prediction 3: a deposit that leaves out or misstates the timer is refused; one that names it is accepted

- ✓ a deposit with the old formula (no timer) is refused
- ✓ a deposit that assumed a 300-block timer is refused
- ✓ neither changed the escrow
- ✓ a deposit naming the real 12-block timer is accepted
- ✓ and the escrow is 0.02

### prediction 4: the groups opened before the change are intact and marked

- observed **groups in the pre-deploy snapshot**: `15`
- ✓ the snapshot has the 15 groups the contract held
- ✓ older group syn-flash-1793645977: hash, timer, status and escrow unchanged by the deploy
- ✓ older group syn-flash-1793645977 reads back as not covering its timer
- ✓ older group syn-atk-wl-1793645988: hash, timer, status and escrow unchanged by the deploy
- ✓ older group syn-atk-wl-1793645988 reads back as not covering its timer
- ✓ older group syn-flash-1793646106: hash, timer, status and escrow unchanged by the deploy
- ✓ older group syn-flash-1793646106 reads back as not covering its timer
- ✓ older group syn-atk-wl-1793646119: hash, timer, status and escrow unchanged by the deploy
- ✓ older group syn-atk-wl-1793646119 reads back as not covering its timer
- ✓ older group syn-atk-cap-1793646126: hash, timer, status and escrow unchanged by the deploy
- ✓ older group syn-atk-cap-1793646126 reads back as not covering its timer
- ✓ older group syn-escape-1793646136: hash, timer, status and escrow unchanged by the deploy
- ✓ older group syn-escape-1793646136 reads back as not covering its timer
- ✓ older group lab-mw20t3zk-1: hash, timer, status and escrow unchanged by the deploy
- ✓ older group lab-mw20t3zk-1 reads back as not covering its timer
- ✓ older group lab-mw20u2n7-1: hash, timer, status and escrow unchanged by the deploy
- ✓ older group lab-mw20u2n7-1 reads back as not covering its timer
- ✓ older group no-keys-syn: hash, timer, status and escrow unchanged by the deploy
- ✓ older group no-keys-syn reads back as not covering its timer
- ✓ older group syn-flash-1793803348: hash, timer, status and escrow unchanged by the deploy
- ✓ older group syn-flash-1793803348 reads back as not covering its timer
- ✓ older group syn-escape-1793803376: hash, timer, status and escrow unchanged by the deploy
- ✓ older group syn-escape-1793803376 reads back as not covering its timer
- ✓ older group syn-atk-cap-1793803367: hash, timer, status and escrow unchanged by the deploy
- ✓ older group syn-atk-cap-1793803367 reads back as not covering its timer
- ✓ older group syn-atk-wl-1793803361: hash, timer, status and escrow unchanged by the deploy
- ✓ older group syn-atk-wl-1793803361 reads back as not covering its timer
- ✓ older group ifc-mw2962xo-1: hash, timer, status and escrow unchanged by the deploy
- ✓ older group ifc-mw2962xo-1 reads back as not covering its timer
- ✓ older group sec-mw29sqcx-1: hash, timer, status and escrow unchanged by the deploy
- ✓ older group sec-mw29sqcx-1 reads back as not covering its timer
- ✓ the contract holds those 15 plus this run's one group

### teardown: exit, prune, delete the accounts

- observed **teardown**: `{"pruned":1,"notPruned":[],"deleted":3,"kept":[],"failed":[]}`
- ✓ every account was deleted and every syndicate pruned
- ✓ the contract holds the records it started with

## Problems found

| Severity | Where | Problem |
|---|---|---|
| critical | E-TWO-ROOM-LIVE-01 / EQUIVOCATION · d tells the rooms different bids: refused, then found by digests, excluded, and the rooms settle | step threw: [ROOST REJECT] this round was already signed; open a new round with a new nonce — {"stack":["RoostAggregationError: [ROOST REJECT] this round was already signed; open a new round with a new nonce","    at HostedRoost.openRound (file:///home/ubuntu/near/src/roost-service/hosted-roos… |
| major | E-FOREIGN-SIGNER-FAIL-LIVE-01 / set up: the test copy runs the test-signer-override build (the default build is put back at the end) | assertion failed: the test copy has get_test_signer and no override is set — {} |
| major | E-FOREIGN-SIGNER-FAIL-LIVE-01 / teardown: the owner removes the unfunded group | assertion failed: the group was pruned — {"actual":"Smart contract panicked: Syndicate not found"} |
| major | E-CALLBACK-GAS-01 / teardown: exit, prune, compact, delete the accounts | assertion failed: every account was deleted and every syndicate pruned — {"actual":{"label":"json","sha256":"979754f21644d4cb646439e2b90ba83253de740ffa9f1bb01681c7c4b8cd0462","bytes":2739,"blob":"blobs/979754f21644d4cb646439e2b90ba83253de740ffa9f1bb01681c7c4b8cd0462","prev… |
