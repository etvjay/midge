# Lab run 20261111T161635Z-d4d4

- **Code:** `337ad4824dd7ac656cb901587b80e78e26b093b5` on `completeness` (**5 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `73f42e651241e148…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 152 events, hash-chained; root `cc326dcfed78843cf54824013013659cd6310f7d77b9dd40ae1d5b3139e41f18`. Verify with `node lab/verify-run.js lab/runs/20261111T161635Z-d4d4`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-FOREIGN-SIGNER-FAIL-LIVE-01 A signer call that fails mid-request, live: the reservation and the obligation are released, the same obligation id works again with the real signer | testnet | **FAIL** | 7 | 11 (1 failed) |  |
| E-TWO-ROOM-LIVE-01 Two-room agreement on testnet: two Roosts must both sign; a lying room, one room twice, or one signature alone move no money | testnet | **PASS** | 6 | 48 |  |
| E-CALLBACK-GAS-01 GAP-008: how much gas does the follow-up step of a payout really burn, per member? | testnet | **PASS** | 5 | 24 |  |

## E-FOREIGN-SIGNER-FAIL-LIVE-01: A signer call that fails mid-request, live: the reservation and the obligation are released, the same obligation id works again with the real signer

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. Runs on the TEST copy of the contract deployed with the test-signer-override feature build. Pointing the signer at an account that does not exist makes the cross-contract call fail; the callback releases the reservation; the same obligation id is accepted again with the real signer and its signature verifies.

**What this does not prove**
- Runs on the TEST copy of the contract deployed with a feature build (test-signer-override) that production does not contain; it shows the contract's behaviour when a cross-contract call fails, not the real MPC network failing.
- The Solana path only; the Ethereum path shares the same callback. A failure arriving after the window has rolled is covered by unit tests.
- One operator controls the room key, the contract and the payee.

| Step | Result | Assertions | Time |
|---|---|---|---|
| set up: the test copy runs the test-signer-override build (the default build is put back at the end) | ✓ pass | 3/3 | 5834 ms |
| set up: a group with a foreign policy (one Solana payee, 2,000,000 per payment and in total, window 100 blocks), its address funded | ✓ pass | 1/1 | 4535 ms |
| prediction 1: only the contract's own account may point the signer elsewhere | ✗ fail | 3/4 | 4369 ms |
| prediction 2: a failing signer releases the reservation and the obligation | – skip | 0/0 | 0 ms |
| prediction 3: with the real signer the same obligation id is accepted again, and its signature verifies | – skip | 0/0 | 0 ms |
| teardown: the default build is put back on the test copy | ✓ pass | 2/2 | 6908 ms |
| teardown: the owner removes the unfunded group | ✓ pass | 1/1 | 1279 ms |

### set up: the test copy runs the test-signer-override build (the default build is put back at the end)

- ✓ the feature build exists (build it with: npm run build:wasm:testsigner)
- ✓ the feature build is not the production build
- evidence deploy: {"account":"m.fly-1793636729.testnet","featureBuild":"Fsa5uNhmY4Pdopq53GAooeiMnVQ9N6yXYZPnUtPxUZLS","defaultBuild":"3dGAu1yG9gaZbMTXWX3eYjN8mVM2LUyQR8Czu9W1vg1C"}
- ✓ the test copy has get_test_signer and it points at no other signer

### set up: a group with a foreign policy (one Solana payee, 2,000,000 per payment and in total, window 100 blocks), its address funded

- ✓ the group exists with its foreign policy

### prediction 1: only the contract's own account may point the signer elsewhere

- evidence tx: {"label":"set_test_signer from the main account","hash":"31oTsLBJGrEkMdd4z22Ev1SvdBCQwoNBpUgr2KtPfKKA","ok":false,"error":"Smart contract panicked: panicked at src/lib.rs:2349:9:\nassertion `left == right` failed: [Test …
- ✓ a call from our main account is refused
- ✗ nothing was set — expected , got 
- ✓ a call from the contract's own account is accepted
- ✓ the signer now points at an account that does not exist

### prediction 2: a failing signer releases the reservation and the obligation

- skipped: an earlier critical step failed

### prediction 3: with the real signer the same obligation id is accepted again, and its signature verifies

- skipped: an earlier critical step failed

### teardown: the default build is put back on the test copy

- ✓ the test copy runs the default build again
- ✓ and the test method is gone

### teardown: the owner removes the unfunded group

- ✓ the group was pruned

## E-TWO-ROOM-LIVE-01: Two-room agreement on testnet: two Roosts must both sign; a lying room, one room twice, or one signature alone move no money

**Hypothesis.** Written before the run (docs/lab/TWO_ROOM_SPEC.md). On a two-room syndicate: (1) a settlement signed by room A alone is refused; (2) room A honest and room B signing a different charge set (B greedy) is refused; (3) one room's signature supplied twice is refused; (4) after those three refusals the escrow is unchanged and the honest settlement from both rooms still succeeds; (5) two real Roosts fed the same signed inputs sign the identical message and the contract pays exactly the total with each member charged only their own amount; (6) a member who sends different bids to the two rooms makes them disagree and the contract refuses, and after the coordinator finds that member by salted digests and both rooms exclude them, the same two rooms settle and that member is not charged; (7) if room B never signs, nothing settles, and every member exits alone and recovers the full deposit. Fails if any refused call succeeds, if money moves on a refusal, or if an honest two-room settlement is refused.

**What this does not prove**
- One operator controls every account, both Roosts and the coordinator. Both Roosts are local with a simulated attestation provider: this tests the contract and the agreement logic, not independence or hardware.
- In (1) to (4) room B is a plain signing key we hold, standing in for a compromised or greedy room, because a real Roost refuses to sign anything it did not compute.
- The rooms exchange nothing but salted digests; the digests reveal no amount, and the coordinator sees them.
- The Roost's two-room mode removes time priority; ties break by a hash. Testnet only; third-party audit: none.

| Step | Result | Assertions | Time |
|---|---|---|---|
| set up: four members, a recipient, and the first two-room checks on a fresh deployment | ✓ pass | 2/2 | 13856 ms |
| ATTACKS · a single signature, a greedy second room, one room twice: each refused, the escrow untouched, then the honest pair settles | ✓ pass | 8/8 | 19652 ms |
| HONEST · two real Roosts, same signed inputs, one identical message | ✓ pass | 12/12 | 23909 ms |
| EQUIVOCATION · d tells the rooms different bids: refused, then found by digests, excluded, and the rooms settle | ✓ pass | 15/15 | 35749 ms |
| ROOM GONE · room B never signs: nothing settles and every member exits alone with the full deposit | ✓ pass | 8/8 | 24571 ms |
| teardown: prune the syndicates, compact, delete the accounts | ✓ pass | 3/3 | 49476 ms |

### set up: four members, a recipient, and the first two-room checks on a fresh deployment

- ✓ five accounts exist
- ✓ the deployed contract has the two-room entry points (get_second_enclave_key answers)

### ATTACKS · a single signature, a greedy second room, one room twice: each refused, the escrow untouched, then the honest pair settles

- ✓ hatch_two_room succeeds
- ✓ the second key is registered on chain
- evidence tx: {"label":"room A alone","hash":"8dgV2F6Qsjkfs89ASt71e5TdnuqLdNvRv3LGqdW8V6v1","ok":false,"explorer":"https://testnet.nearblocks.io/txns/8dgV2F6Qsjkfs89ASt71e5TdnuqLdNvRv3LGqdW8V6v1","error":"Smart contract panicked: [HAQ…
- ✓ (1) a settlement signed by room A alone is refused
- evidence tx: {"label":"room B greedy","hash":"4ZektiWedghwgfYL98DjyMdPV951pAFDumKt4jDy5NxU","ok":false,"explorer":"https://testnet.nearblocks.io/txns/4ZektiWedghwgfYL98DjyMdPV951pAFDumKt4jDy5NxU","error":"Smart contract panicked: pan…
- ✓ (2) room A honest, room B signing a different charge set (greedy) is refused
- evidence tx: {"label":"room A twice","hash":"39moaAzbiatRndKF38u7E9CjSADVLJ9BuFwjpvZfPsyT","ok":false,"explorer":"https://testnet.nearblocks.io/txns/39moaAzbiatRndKF38u7E9CjSADVLJ9BuFwjpvZfPsyT","error":"Smart contract panicked: pani…
- ✓ (3) one room's signature supplied twice is refused
- ✓ (4) after three refusals every escrow is unchanged and no settlement is in flight
- evidence tx: {"label":"honest pair (room B key we hold)","hash":"EezDmdYWWryjkcnbjWuyT3kVAUurmxL6EvG4Z2hkqrsm","ok":true,"explorer":"https://testnet.nearblocks.io/txns/EezDmdYWWryjkcnbjWuyT3kVAUurmxL6EvG4Z2hkqrsm","error":null}
- ✓ (4) the honest pair then settles: the refusals did not break the round
- ✓ the recipient received exactly 0.06
- evidence gas: {"twoRoomSettleTGas":8.107438788176}

### HONEST · two real Roosts, same signed inputs, one identical message

- ✓ the rooms have different settlement keys
- ✓ hatch_two_room succeeds
- ✓ salted digests of each member's input match between the rooms
- ✓ (5) the two rooms signed the byte-identical message
- evidence tx: {"label":"two real Roosts","hash":"LDtf34tqnsKJkNnwNJMTgyqxASB9GEtRGWAqtvhdiXh","ok":true,"explorer":"https://testnet.nearblocks.io/txns/LDtf34tqnsKJkNnwNJMTgyqxASB9GEtRGWAqtvhdiXh","error":null}
- evidence gas: {"twoRoomSettleTGas":8.128029545192}
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
- evidence tx: {"label":"rooms disagree","hash":"DNk6oP5iJSsGXsiWwE9oDBmLhpW2JPx9WRTcpydVk7QQ","ok":false,"explorer":"https://testnet.nearblocks.io/txns/DNk6oP5iJSsGXsiWwE9oDBmLhpW2JPx9WRTcpydVk7QQ","error":"Smart contract panicked: pa…
- ✓ (6) the contract refuses the disagreeing pair
- ✓ (6) nothing moved
- ✓ (6) with d excluded the rooms sign the identical message
- evidence tx: {"label":"rooms agree after excluding d","hash":"HSHA55e41axMXiAYtk2MzMt93Ri9KRAqdCmVBLjSthpX","ok":true,"explorer":"https://testnet.nearblocks.io/txns/HSHA55e41axMXiAYtk2MzMt93Ri9KRAqdCmVBLjSthpX","error":null}
- ✓ (6) the settlement succeeds
- ✓ a exits alone
- ✓ b exits alone
- ✓ c exits alone
- ✓ d exits alone
- ✓ (6) d was not charged: d got back the full deposit
- ✓ (6) a was charged only their own 0.01
- ✓ (6) b was charged only their own 0.02
- ✓ (6) c was charged only their own 0.03

### ROOM GONE · room B never signs: nothing settles and every member exits alone with the full deposit

- ✓ hatch_two_room succeeds
- evidence tx: {"label":"A alone, B gone","hash":"FwZZWdJjHSFzsFSsmxG3bD4iqnw7AL1CZq8qJmBfnzd3","ok":false,"explorer":"https://testnet.nearblocks.io/txns/FwZZWdJjHSFzsFSsmxG3bD4iqnw7AL1CZq8qJmBfnzd3","error":"Smart contract panicked: […
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
| set up: 20 members and a recipient | ✓ pass | 1/1 | 52302 ms |
| 4 members | ✓ pass | 9/9 | 14477 ms |
| 20 members | ✓ pass | 9/9 | 53412 ms |
| the per-member cost, extrapolated to the 50-member maximum | ✓ pass | 3/3 | 1 ms |
| teardown: exit, prune, compact, delete the accounts | ✓ pass | 2/2 | 199700 ms |

### set up: 20 members and a recipient

- ✓ 21 accounts exist

### 4 members

- ✓ hatch gas4-mwcbr9b4
- evidence tx: {"label":"settle_batch gas4-mwcbr9b4 (4 members)","hash":"6CWJViLD7KPU1D1FCR8BMLUq9DiJLnXcuoCEwbPE5aYH","ok":true,"explorer":"https://testnet.nearblocks.io/txns/6CWJViLD7KPU1D1FCR8BMLUq9DiJLnXcuoCEwbPE5aYH","error":null}
- ✓ the 4-member settlement succeeded
- ✓ the transaction status with receipts was readable
- ✓ the follow-up step ran and logged the settlement
- ✓ it reported success (not a failed payout)
- ✓ the allotted gas for the follow-up step could be read from the receipts
- ✓ the follow-up step burnt less than it was allotted (it did not run out)
- ✓ on the fixed contract the follow-up step is allotted 25 TGas + 1 per member (>= 29 TGas for 4 members)
- ✓ and the pending record is gone once the follow-up step has run
- evidence allotment: {"members":4,"allottedTGas":246.400838167967}
- evidence callback: {"members":4,"callbackBurntTGas":3.465708033164,"pendingAfter":null}

### 20 members

- ✓ hatch gas20-mwcbr9b4
- evidence tx: {"label":"settle_batch gas20-mwcbr9b4 (20 members)","hash":"7qukifhKndPJhrHikqZCmmSPpo6jC66XvDEc7pjiWxse","ok":true,"explorer":"https://testnet.nearblocks.io/txns/7qukifhKndPJhrHikqZCmmSPpo6jC66XvDEc7pjiWxse","error":nul…
- ✓ the 20-member settlement succeeded
- ✓ the transaction status with receipts was readable
- ✓ the follow-up step ran and logged the settlement
- ✓ it reported success (not a failed payout)
- ✓ the allotted gas for the follow-up step could be read from the receipts
- ✓ the follow-up step burnt less than it was allotted (it did not run out)
- ✓ on the fixed contract the follow-up step is allotted 25 TGas + 1 per member (>= 45 TGas for 20 members)
- ✓ and the pending record is gone once the follow-up step has run
- evidence allotment: {"members":20,"allottedTGas":246.31475960669}
- evidence callback: {"members":20,"callbackBurntTGas":7.460647546185,"pendingAfter":null}

### the per-member cost, extrapolated to the 50-member maximum

- observed **fit**: `{"baseTGas":2.47,"perMemberTGas":0.25,"at50TGas":15,"flatAllotmentTGas":25,"sizedAllotmentAt50TGas":75}`
- evidence fit: {"baseTGas":2.47,"perMemberTGas":0.25,"at50TGas":15}
- ✓ the base cost is under 10 TGas
- ✓ the per-member cost is under 1 TGas (the sizing constant)
- ✓ so the sized allotment at 50 members (75 TGas) covers the extrapolated cost with room to spare
- observed **a flat 25 TGas would be enough at 50 members**: `true`

### teardown: exit, prune, compact, delete the accounts

- observed **teardown**: `{"pruned":2,"notPruned":[],"deleted":21,"kept":[],"failed":[]}`
- ✓ every account was deleted and every syndicate pruned
- ✓ the contract holds the records it started with

## Problems found

| Severity | Where | Problem |
|---|---|---|
| major | E-FOREIGN-SIGNER-FAIL-LIVE-01 / prediction 1: only the contract's own account may point the signer elsewhere | assertion failed: nothing was set — {} |
