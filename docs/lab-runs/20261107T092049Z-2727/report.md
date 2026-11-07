# Lab run 20261107T092049Z-2727

- **Code:** `cb8d12bb6e025200876fe21f6140899adbdf2650` on `master` (**5 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `8a0180ff698c44b5…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 75 events, hash-chained; root `6ea0bf7f07e8d31a0f5f6324ce990ef2d5c15743dff20f1c91b50a93c5b3d699`. Verify with `node lab/verify-run.js lab/runs/20261107T092049Z-2727`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-TWO-ROOM-LIVE-01 Two-room agreement on testnet: two Roosts must both sign; a lying room, one room twice, or one signature alone move no money | testnet | **PASS** | 6 | 48 |  |

## E-TWO-ROOM-LIVE-01: Two-room agreement on testnet: two Roosts must both sign; a lying room, one room twice, or one signature alone move no money

**Hypothesis.** Written before the run (docs/lab/TWO_ROOM_SPEC.md). On a two-room syndicate: (1) a settlement signed by room A alone is refused; (2) room A honest and room B signing a different charge set (B greedy) is refused; (3) one room's signature supplied twice is refused; (4) after those three refusals the escrow is unchanged and the honest settlement from both rooms still succeeds; (5) two real Roosts fed the same signed inputs sign the identical message and the contract pays exactly the total with each member charged only their own amount; (6) a member who sends different bids to the two rooms makes them disagree and the contract refuses, and after the coordinator finds that member by salted digests and both rooms exclude them, the same two rooms settle and that member is not charged; (7) if room B never signs, nothing settles, and every member exits alone and recovers the full deposit. Fails if any refused call succeeds, if money moves on a refusal, or if an honest two-room settlement is refused.

**What this does not prove**
- One operator controls every account, both Roosts and the coordinator. Both Roosts are local with a simulated attestation provider: this tests the contract and the agreement logic, not independence or hardware.
- In (1) to (4) room B is a plain signing key we hold, standing in for a compromised or greedy room, because a real Roost refuses to sign anything it did not compute.
- The rooms exchange nothing but salted digests; the digests reveal no amount, and the coordinator sees them.
- The Roost's two-room mode removes time priority; ties break by a hash. Testnet only; third-party audit: none.

| Step | Result | Assertions | Time |
|---|---|---|---|
| set up: four members, a recipient, and the first two-room checks on a fresh deployment | ✓ pass | 2/2 | 12528 ms |
| ATTACKS · a single signature, a greedy second room, one room twice: each refused, the escrow untouched, then the honest pair settles | ✓ pass | 8/8 | 18801 ms |
| HONEST · two real Roosts, same signed inputs, one identical message | ✓ pass | 12/12 | 25823 ms |
| EQUIVOCATION · d tells the rooms different bids: refused, then found by digests, excluded, and the rooms settle | ✓ pass | 15/15 | 34629 ms |
| ROOM GONE · room B never signs: nothing settles and every member exits alone with the full deposit | ✓ pass | 8/8 | 24884 ms |
| teardown: prune the syndicates, compact, delete the accounts | ✓ pass | 3/3 | 49945 ms |

### set up: four members, a recipient, and the first two-room checks on a fresh deployment

- ✓ five accounts exist
- ✓ the deployed contract has the two-room entry points (get_second_enclave_key answers)

### ATTACKS · a single signature, a greedy second room, one room twice: each refused, the escrow untouched, then the honest pair settles

- ✓ hatch_two_room succeeds
- ✓ the second key is registered on chain
- evidence tx: {"label":"room A alone","hash":"BFHiE1qPkWqFyGd9KghtEFHpYoYoTYvspPZnPB6k5PaQ","ok":false,"explorer":"https://testnet.nearblocks.io/txns/BFHiE1qPkWqFyGd9KghtEFHpYoYoTYvspPZnPB6k5PaQ","error":"Smart contract panicked: [HAQ…
- ✓ (1) a settlement signed by room A alone is refused
- evidence tx: {"label":"room B greedy","hash":"AB1cJsYEuwocj9MJnAXJxUpbGmsuvmfUX36qrroF5vWM","ok":false,"explorer":"https://testnet.nearblocks.io/txns/AB1cJsYEuwocj9MJnAXJxUpbGmsuvmfUX36qrroF5vWM","error":"Smart contract panicked: pan…
- ✓ (2) room A honest, room B signing a different charge set (greedy) is refused
- evidence tx: {"label":"room A twice","hash":"9Nhmpjhd1perWNs2LCgrjpCsvEhsaRYPpeJt6y8T6jLD","ok":false,"explorer":"https://testnet.nearblocks.io/txns/9Nhmpjhd1perWNs2LCgrjpCsvEhsaRYPpeJt6y8T6jLD","error":"Smart contract panicked: pani…
- ✓ (3) one room's signature supplied twice is refused
- ✓ (4) after three refusals every escrow is unchanged and no settlement is in flight
- evidence tx: {"label":"honest pair (room B key we hold)","hash":"Fhb39xscxUPX8aC44EweaGgFVqrUnxFdbBuwyXBXj77H","ok":true,"explorer":"https://testnet.nearblocks.io/txns/Fhb39xscxUPX8aC44EweaGgFVqrUnxFdbBuwyXBXj77H","error":null}
- ✓ (4) the honest pair then settles: the refusals did not break the round
- ✓ the recipient received exactly 0.06
- evidence gas: {"twoRoomSettleTGas":6.959118453343}

### HONEST · two real Roosts, same signed inputs, one identical message

- ✓ the rooms have different settlement keys
- ✓ hatch_two_room succeeds
- ✓ salted digests of each member's input match between the rooms
- ✓ (5) the two rooms signed the byte-identical message
- evidence tx: {"label":"two real Roosts","hash":"7hTi4Yw2JKiqedu87PU6woE9pWZfeyLX9c5xU99g3QHm","ok":true,"explorer":"https://testnet.nearblocks.io/txns/7hTi4Yw2JKiqedu87PU6woE9pWZfeyLX9c5xU99g3QHm","error":null}
- evidence gas: {"twoRoomSettleTGas":6.978956245495}
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
- evidence tx: {"label":"rooms disagree","hash":"EmRYZ1kCFHwAAKhrB4Hd4c9rBTsxUr1b49v5a1fR2fCC","ok":false,"explorer":"https://testnet.nearblocks.io/txns/EmRYZ1kCFHwAAKhrB4Hd4c9rBTsxUr1b49v5a1fR2fCC","error":"Smart contract panicked: pa…
- ✓ (6) the contract refuses the disagreeing pair
- ✓ (6) nothing moved
- ✓ (6) with d excluded the rooms sign the identical message
- evidence tx: {"label":"rooms agree after excluding d","hash":"BEmjPCAAsNhZDrLdyqR6nYhMTeEMEYYkjmL39bSJaPfC","ok":true,"explorer":"https://testnet.nearblocks.io/txns/BEmjPCAAsNhZDrLdyqR6nYhMTeEMEYYkjmL39bSJaPfC","error":null}
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
- evidence tx: {"label":"A alone, B gone","hash":"HMc9cGY1uTFpiqPa42aojeb22eb4W8DVau3YT6jWSi77","ok":false,"explorer":"https://testnet.nearblocks.io/txns/HMc9cGY1uTFpiqPa42aojeb22eb4W8DVau3YT6jWSi77","error":"Smart contract panicked: […
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

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
