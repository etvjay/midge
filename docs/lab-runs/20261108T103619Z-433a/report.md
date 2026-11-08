# Lab run 20261108T103619Z-433a

- **Code:** `535a4460bddb5e7c0b03d9fc5658f493849d488e` on `master` (**1 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `8a0180ff698c44b5…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 260 events, hash-chained; root `72bc32332c9f2841973fbcd413c3b8d4f655b4529103f805b75432d2e0f4da71`. Verify with `node lab/verify-run.js lab/runs/20261108T103619Z-433a`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-ESCROWBOUND-01 Escrow-bound charged rounds: the real reader against stub providers, the real host and service | offline | **PASS** | 5 | 31 | 3 attempts: PASS, PASS, PASS |
| E-ESCROWBOUND-LIVE-01 Escrow-bound charged rounds on testnet: a settlement with an unfunded member is rejected; abandon, then the reader leaves them out and it lands | testnet | **PASS** | 6 | 24 | 3 attempts: PASS, PASS, PASS |

## E-ESCROWBOUND-01: Escrow-bound charged rounds: the real reader against stub providers, the real host and service

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. The room reads, from several providers at one block, what each bidder holds, leaves out anyone who cannot cover their worst case, fails closed when the chain cannot be read, says when no member could leave before the payout lands, and lets the coordinator give up a signed round. This narrows rejections; it does not make them impossible.

**What this does not prove**
- The providers are stubs, so this shows what the room does with their answers, not that real providers answer this way (E-ESCROWBOUND-LIVE-01 does that on testnet).
- It cannot show the race itself: a member leaving between the read and the payout needs the real contract.
- The service and host are real; the contract is not in this experiment.

| Step | Result | Assertions | Time |
|---|---|---|---|
| prediction 1: a bidder with no escrow is left out and named; the others settle; the block is in the signed order hash | ✓ pass | 6/6 | 124 ms |
| prediction 2: a provider that is down, slow, behind or disagrees makes the run UNAVAILABLE and keeps the queue | ✓ pass | 10/10 | 603 ms |
| prediction 3: raceFree only when no member could leave before the payout is likely to land (the definition was tightened after review: the read's age and the snapshot's allowed age count too) | ✓ pass | 6/6 | 499 ms |
| prediction 4: a signed round cannot be re-opened; abandon makes it possible and leaves a record | ✓ pass | 7/7 | 135 ms |
| prediction 5: a roll member who never voted and cannot pay is left out of a ballot | ✓ pass | 2/2 | 47 ms |

### prediction 1: a bidder with no escrow is left out and named; the others settle; the block is in the signed order hash

- ✓ only the unfunded bidder is left out, by account
- ✓ the charges are the other two
- ✓ the payout is exactly the sum of those charges
- ✓ the outcome carries the block that was read
- ✓ the left-out list is account ids and nothing else
- ✓ another block gives another signed order hash

### prediction 2: a provider that is down, slow, behind or disagrees makes the run UNAVAILABLE and keeps the queue

- ✓ down: UNAVAILABLE
- ✓ down: the three bids are still queued and nothing was signed
- ✓ never answers: UNAVAILABLE
- ✓ never answers: the three bids are still queued and nothing was signed
- ✓ a minute behind: UNAVAILABLE
- ✓ a minute behind: the three bids are still queued and nothing was signed
- ✓ disagrees about a balance: UNAVAILABLE
- ✓ disagrees about a balance: the three bids are still queued and nothing was signed
- ✓ disagrees about the exit timing: UNAVAILABLE
- ✓ disagrees about the exit timing: the three bids are still queued and nothing was signed

### prediction 3: raceFree only when no member could leave before the payout is likely to land (the definition was tightened after review: the read's age and the snapshot's allowed age count too)

- ✓ exit opens at block 4100 (timer ends 100 blocks on): race-free
- ✓ exit opened long ago (block 110): not race-free
- ✓ exit opens at exactly 4060: not race-free (strict)
- ✓ exit opens at 4061: race-free
- ✓ an exit at 4110 with a fresh block: race-free
- ✓ the same exit at 4110 but the block was read 50 s ago (about 50 blocks behind the head): not race-free

### prediction 4: a signed round cannot be re-opened; abandon makes it possible and leaves a record

- ✓ the room signed a settlement
- ✓ a different run in the same round is refused (ALREADY_SIGNED)
- ✓ re-opening the same round is refused
- ✓ abandon succeeds and names what was given up
- ✓ and it is on record in the host
- ✓ abandoning again has nothing to abandon
- ✓ the round can sign a new settlement, and with the changed bid it is a different one

### prediction 5: a roll member who never voted and cannot pay is left out of a ballot

- ✓ m5 is left out although they never voted
- ✓ four members are charged a share each

## E-ESCROWBOUND-LIVE-01: Escrow-bound charged rounds on testnet: a settlement with an unfunded member is rejected; abandon, then the reader leaves them out and it lands

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. On the real contract, a pooled round with one unfunded member is rejected; after the coordinator abandons the signed round, the room reads the escrow from two real providers at one block, leaves the unfunded member out, and the settlement lands.

**What this does not prove**
- One operator controls every account in the run, and the room is a local host, not a TEE.
- It does not show the race itself: a member leaving between the read and the payout. The room reports raceFree false here, and says so.
- Two providers agreeing on one block is not proof they are honest or independent.
- The unfunded member is simply an account that never deposited; other ways to be unable to pay (a partial balance) are covered offline.
- If createMembers fails part-way the accounts it made are only in the lab ledger (run node scripts/lab-env.mjs cleanup), and a group that was hatched but never deposited into stays Active and cannot be pruned (audit lead 5).
- raceFree here is the reader's estimate, not a guarantee.

| Step | Result | Assertions | Time |
|---|---|---|---|
| set up: three members and a recipient, a local room, and a group on the contract | ✓ pass | 4/4 | 16616 ms |
| prediction 1: with no reader, a settlement that charges the unfunded member is rejected by the contract and changes nothing | ✓ pass | 4/4 | 2157 ms |
| prediction 2: the room refuses to re-open that round; abandon makes it possible and is on record | ✓ pass | 3/3 | 0 ms |
| prediction 3: with the reader, the unfunded member is left out and the settlement lands | ✓ pass | 9/9 | 13746 ms |
| prediction 5: with one provider unreachable the read fails closed and the queue is kept | ✓ pass | 2/2 | 800 ms |
| prediction 6: teardown: exit, prune, delete the accounts | ✓ pass | 2/2 | 33470 ms |

### set up: three members and a recipient, a local room, and a group on the contract

- ✓ the group was hatched with the local room as its room key
- ✓ ep62oim1.fly-1793636729.testnet deposited 0.02
- ✓ ep62oim3.fly-1793636729.testnet deposited 0.02
- ✓ the group holds 0.04; A and C hold 0.02 each; B holds nothing
- observed **the round nonce on chain**: `0dd50d4134f6ab1a…`

### prediction 1: with no reader, a settlement that charges the unfunded member is rejected by the contract and changes nothing

- ✓ the room charged all three, as it had no way to know
- evidence baseline settlement: {"ok":false,"hash":"BCw2ZkfVcYmkb8UN5swVW8ZyA2U5rvrqXayCtfPBFtjy","error":"Smart contract panicked: panicked at src/lib.rs:979:17:\n[Settle REJECT] Charge for ep62oim2.fly-1793636729.testnet exceeds that member's escrow.…
- ✓ the contract rejected it
- ✓ naming the charge
- ✓ the group is unchanged: 0.04, same nonce, nothing in flight

### prediction 2: the room refuses to re-open that round; abandon makes it possible and is on record

- ✓ re-opening the same round is refused
- ✓ abandon names the order hash it gave up
- ✓ the host keeps a record

### prediction 3: with the reader, the unfunded member is left out and the settlement lands

- ✓ B is left out and named
- ✓ A and C are charged 0.01 each
- observed **block read**: `{"height":276764374,"hash":"89m2gtDh7ECPX1iHv6dudKqKnUJCqaxNVui6Cwxz3FdB","raceFree":false}`
- ✓ a real block was read
- ✓ prediction 4: raceFree is false, because the exit timer ran out long ago
- evidence settlement with the reader: {"ok":true,"hash":"BDibBVTjHvZRx63BkqHYeEzRpMxJRWfdhvFXf88YKT6E","error":null,"explorer":"https://testnet.nearblocks.io/txns/BDibBVTjHvZRx63BkqHYeEzRpMxJRWfdhvFXf88YKT6E"}
- ✓ the contract accepted it
- ✓ A and C hold 0.01 each
- ✓ B was never charged and holds nothing
- ✓ the group holds 0.02 and the nonce has changed
- ✓ the recipient received exactly 0.02

### prediction 5: with one provider unreachable the read fails closed and the queue is kept

- ✓ the run answers UNAVAILABLE
- ✓ the bid is still queued and nothing was signed

### prediction 6: teardown: exit, prune, delete the accounts

- observed **teardown**: `{"pruned":1,"notPruned":[],"deleted":4,"kept":[],"failed":[]}`
- ✓ every account was deleted and the group pruned
- ✓ the contract holds the groups it started with

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
