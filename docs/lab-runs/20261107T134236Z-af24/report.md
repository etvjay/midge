# Lab run 20261107T134236Z-af24

- **Code:** `327e604e12d44d00bb114641cfd12c1bd40d2d51` on `master` (**3 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `8a0180ff698c44b5…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 118 events, hash-chained; root `439e14630f71c0466a53cceae207b56559cca66212314f5165e73dbec5b39334`. Verify with `node lab/verify-run.js lab/runs/20261107T134236Z-af24`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-ONGOING-01 Ongoing groups on testnet: a Dark Vault that lives across three rounds with three programs, takes a late deposit, and what its release cap really bounds | testnet | **PASS** | 12 | 73 |  |

## E-ONGOING-01: Ongoing groups on testnet: a Dark Vault that lives across three rounds with three programs, takes a late deposit, and what its release cap really bounds

**Hypothesis.** Predictions are fixed in docs/lab/PROGRAMME_PLAN.md (committed before the first run, and again before this re-run on the GAP-024 fix). A. Four members deposit 0.1 each into a Dark Vault (25% cap, 24-block exit timer, so a 48-block release window); round 1 an investing pool (0.05 to rp); a fifth member deposits 0.1; round 2 a ballot among all five (0.05 to ra); round 3 a lending quote (0.04 to rl, won by u3 at 400 bps); each round waits for the previous window to end, so each opens its own window. (1) The epoch rises by exactly 1 per round and the nonce changes each time. (2) The late member joins between rounds and is counted and charged; escrows sum to the group total after every round. (3) Replaying round 1's signed settlement after round 2 is refused and changes nothing. (4) An exit straight after round 3 is refused; a fourth, small round inside round 3's window does not advance the epoch or move the exit timer's start; members can exit at the window start plus the timer, which is earlier than the fourth settlement plus the timer (the old rule would have locked them out until then), with exactly deposit minus charges. B. With a key we hold standing in for a compromised host, 25% cap, 24-block timer: 0.11 of 0.4 is refused; exactly 0.1 succeeds; a second payout of 0.075 straight after is refused (cumulative), and so is 0.001; after the window ends 0.075 (25% of the then-current 0.3) succeeds; the window's real length in seconds is read from the chain and the implied time to release 90% is reported; members exit with exact remainders. The limit is only as strict as the timer. Fails if any breaks.

**What this does not prove**
- One operator controls every account and the host; the members are scripted. The host is a local HostedRoost with a simulated attestation provider; signed inputs use real NEAR keys and the real account-key lookup.
- Three rounds and five members: not a long-lived or large group. There is no baseline; this tests the contract's lifecycle claims against what it says.
- Part B uses a key we hold to stand in for a compromised host, because a real host refuses to sign more than it computed.
- Only the cash leg settles. Deposits are public.

| Step | Result | Assertions | Time |
|---|---|---|---|
| set up: five members and four recipients | ✓ pass | 1/1 | 20088 ms |
| A · open the Dark Vault; four founders deposit 0.1 each | ✓ pass | 5/5 | 12365 ms |
| A · round 1: an investing pool, 0.05 NEAR to rp | ✓ pass | 4/4 | 5994 ms |
| A · a fifth member deposits between rounds | ✓ pass | 3/3 | 4984 ms |
| A · round 2: a ballot among all five, the pool of 0.05 to the winner | ✓ pass | 6/6 | 24957 ms |
| A · round 1's signed settlement replayed after round 2 is refused and changes nothing | ✓ pass | 2/2 | 2579 ms |
| A · round 3: a lending quote, 0.04 NEAR loan to rl won by u3 at 400 bps | ✓ pass | 11/11 | 29177 ms |
| A · an exit straight after round 3 is refused: the window opened by round 3 started the timer | ✓ pass | 3/3 | 2797 ms |
| A · round 4, inside round 3's window: a settlement that must not advance the epoch or restart the exit timer | ✓ pass | 5/5 | 6702 ms |
| A · the members leave at the window's start plus the timer, earlier than the old rule would have allowed, with exactly their remainders | ✓ pass | 12/12 | 16302 ms |
| B · the cap, fixed: a payout above 25% is refused, exactly 25% succeeds, and a second payout straight after is refused until the window ends | ✓ pass | 19/19 | 69634 ms |
| teardown: prune the syndicates, delete the accounts | ✓ pass | 2/2 | 46014 ms |

### set up: five members and four recipients

- ✓ nine accounts exist

### A · open the Dark Vault; four founders deposit 0.1 each

- ✓ hatch a DARK_VAULT syndicate
- ✓ u1 deposits 0.1
- ✓ u2 deposits 0.1
- ✓ u3 deposits 0.1
- ✓ u4 deposits 0.1
- observed **the group at the start**: `{"type":"DarkVault","epoch":1,"nonce":"e52eb23b4961"}`

### A · round 1: an investing pool, 0.05 NEAR to rp

- evidence tx: {"label":"settle_batch_charged round 1","hash":"CTiuhRt21xSXxAboCfzNM1nRLJWAyuyhWgehPrKkwS6L","ok":true,"explorer":"https://testnet.nearblocks.io/txns/CTiuhRt21xSXxAboCfzNM1nRLJWAyuyhWgehPrKkwS6L","error":null}
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
- evidence tx: {"label":"settle_batch_charged round 2","hash":"3PgjEfGZqM2v5ZnqEDKgVwMdtPTjjtt3zCbZsqBZFw4k","ok":true,"explorer":"https://testnet.nearblocks.io/txns/3PgjEfGZqM2v5ZnqEDKgVwMdtPTjjtt3zCbZsqBZFw4k","error":null}
- ✓ round 2: the settlement succeeded
- ✓ round 2: the epoch rose by exactly 1 (2 to 3) and the round nonce changed
- ✓ round 2: ra received exactly 0.05
- ✓ (2) the late member was charged 0.01 like everyone else: u5 now has 0.09
- ✓ round 2: the members' escrows sum to the group total

### A · round 1's signed settlement replayed after round 2 is refused and changes nothing

- evidence tx: {"label":"replay of round 1","hash":"3Bf5d5aD1cHfY1jDZKiS96amiMxEeJsBCWCYP9VyCzyk","ok":false,"explorer":"https://testnet.nearblocks.io/txns/3Bf5d5aD1cHfY1jDZKiS96amiMxEeJsBCWCYP9VyCzyk","error":"Smart contract panicked:…
- ✓ (3) the replay is refused (nonce mismatch)
- ✓ (3) nothing changed: same total, same epoch, same escrows, nothing in flight

### A · round 3: a lending quote, 0.04 NEAR loan to rl won by u3 at 400 bps

- ✓ u3 wins at 400 bps
- evidence tx: {"label":"settle_batch_charged round 3","hash":"ACUw3Smek3py3e9d7gzyuk2gum29jVbjd6FZcogWfL4h","ok":true,"explorer":"https://testnet.nearblocks.io/txns/ACUw3Smek3py3e9d7gzyuk2gum29jVbjd6FZcogWfL4h","error":null}
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
- evidence tx: {"label":"early exit as u1","hash":"79gF264hW92JsD4Jjeqz5U8rAdAzB9XXL7UbPizZ5t3q","ok":false,"explorer":"https://testnet.nearblocks.io/txns/79gF264hW92JsD4Jjeqz5U8rAdAzB9XXL7UbPizZ5t3q","error":"Smart contract panicked: …
- ✓ precondition: only 10 blocks have passed since the window opened, inside the 24-block timer
- ✓ (4) so an exit now is refused: the window opened by round 3 started the timer
- observed **blocks since the group was opened, far more than the timer**: `149`

### A · round 4, inside round 3's window: a settlement that must not advance the epoch or restart the exit timer

- evidence tx: {"label":"settle_batch_charged round 4","hash":"3Tu44qqRdSAw4e6AhHr4PRusApMEMa1RoJCa2QjQmAX5","ok":true,"explorer":"https://testnet.nearblocks.io/txns/3Tu44qqRdSAw4e6AhHr4PRusApMEMa1RoJCa2QjQmAX5","error":null}
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
- observed **block of the exit, against the block the old rule would have kept them out until (the round 4 settlement plus the timer)**: `{"exitBlock":276638884,"oldRuleLockedUntil":276638896}`
- ✓ (4) the exit happened before round 4's settlement plus the timer: a settlement inside the window no longer keeps members out
- ✓ the group ended fully refunded

### B · the cap, fixed: a payout above 25% is refused, exactly 25% succeeds, and a second payout straight after is refused until the window ends

- ✓ hatch with a key we hold, standing in for a compromised host
- ✓ u1 deposits 0.1
- ✓ u2 deposits 0.1
- ✓ u3 deposits 0.1
- ✓ u4 deposits 0.1
- evidence tx: {"label":"payout above the cap: 0.11 of 0.4, charged 0.055 to each of two members so only the cap can refuse it","hash":"CVeWzhJLdmwypkFc6DYQtpbvvnTFSSq1pJGnA9a22W43","ok":false,"explorer":"https://testnet.nearblocks.io/…
- ✓ (B1) a payout of 0.11 against a 25% cap of 0.1 is refused even with a valid signature
- evidence tx: {"label":"payout at exactly 25% of the escrow: 0.1","hash":"CHiETorW63VYs2LWtyNwyskB9FJwxdygNjyXTHqb7XrN","ok":true,"explorer":"https://testnet.nearblocks.io/txns/CHiETorW63VYs2LWtyNwyskB9FJwxdygNjyXTHqb7XrN","error":nul…
- ✓ (B1) a payout of exactly 0.1 succeeds
- ✓ the chain recorded a window opened by that settlement with start escrow 0.4, released 0.1, lasting twice the timer (48 blocks)
- evidence tx: {"label":"the drain that worked before the fix: 0.075, 25% of the remaining 0.3, straight after","hash":"7WSWGEeNXnC6ZRXPadenkxiMQ9mdrqSXX92uupkMuX6j","ok":false,"explorer":"https://testnet.nearblocks.io/txns/7WSWGEeNXnC…
- ✓ (B2) the second payout straight after is REFUSED: cumulative release in this window would exceed the cap
- evidence tx: {"label":"even a milliNEAR more is refused inside the window","hash":"J9M5EaHXtS576DkPNArenijZ5JV8mq5imXQJ6zMHY2hm","ok":false,"explorer":"https://testnet.nearblocks.io/txns/J9M5EaHXtS576DkPNArenijZ5JV8mq5imXQJ6zMHY2hm",…
- ✓ (B2) 0.001 more is refused too
- ✓ (B2) nothing moved: the escrow is 0.3 and nothing is in flight
- evidence tx: {"label":"after the window ends: 0.075, 25% of the then-current 0.3","hash":"6qTjqweXEGEsiGrke8rF839x6zxN475pQEJifpg1Mi1i","ok":true,"explorer":"https://testnet.nearblocks.io/txns/6qTjqweXEGEsiGrke8rF839x6zxN475pQEJifpg1…
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

- evidence findings: {"epochs":[1,2,3,4],"round3Window":{"start":276638856,"ends":276638904,"epochStart":276638856,"epoch":4},"cap":{"stated":"25% per window of twice the timer","timerBlocks":24,"windowSeconds":27.4,"secondBackToBackPayoutRe…
- observed **teardown**: `{"pruned":2,"notPruned":[],"deleted":9,"kept":[],"failed":[]}`
- ✓ every account was deleted and every syndicate pruned
- ✓ the contract holds the records it started with

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
