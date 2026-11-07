# Lab run 20261107T131007Z-d8a0

- **Code:** `8952c930895a95624e620f5f8bdcbf43d2ce12ed` on `master` (**3 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `8a0180ff698c44b5…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 98 events, hash-chained; root `b2a93156b2e60f6699cbe8e2bf2b14782e04f74d3b1760e084453509b3e31fa9`. Verify with `node lab/verify-run.js lab/runs/20261107T131007Z-d8a0`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-ONGOING-01 Ongoing groups on testnet: a Dark Vault that lives across three rounds with three programs, takes a late deposit, and what its release cap really bounds | testnet | **PASS** | 10 | 60 |  |

## E-ONGOING-01: Ongoing groups on testnet: a Dark Vault that lives across three rounds with three programs, takes a late deposit, and what its release cap really bounds

**Hypothesis.** Predictions are fixed in docs/lab/PROGRAMME_PLAN.md (committed before this ran). A. Four members deposit 0.1 each into a Dark Vault (25% cap, 16-block exit timer); round 1 an investing pool (0.05 to rp); a fifth member deposits 0.1; round 2 a ballot among all five (0.05 to ra); round 3 a lending quote (0.04 to rl, won by u3 at 400 bps). (1) The epoch rises by exactly 1 per settlement and the round nonce changes each time. (2) The late member joins between rounds and is counted and charged correctly; escrows sum to the group total after every round. (3) Replaying round 1's signed settlement after round 2 is refused and changes nothing. (4) The exit timer restarts each epoch: an exit right after round 3 is refused; 16 blocks after the last settlement every member exits alone with exactly deposit minus charges (u1 0.08, u2 0.08, u3 0.035, u4 0.075, u5 0.09). B. With a key we hold standing in for a compromised host, a payout above 25% of the current escrow is refused, but payouts of exactly 25% of the current escrow succeed back to back (0.1, 0.075, 0.05625), releasing 0.23125 of 0.4, which is 57.8% against a stated 25% per epoch: expected to be a design weakness. Fails if A breaks; B is recorded as a finding if it holds.

**What this does not prove**
- One operator controls every account and the host; the members are scripted. The host is a local HostedRoost with a simulated attestation provider; signed inputs use real NEAR keys and the real account-key lookup.
- Three rounds and five members: not a long-lived or large group. There is no baseline; this tests the contract's lifecycle claims against what it says.
- Part B uses a key we hold to stand in for a compromised host, because a real host refuses to sign more than it computed.
- Only the cash leg settles. Deposits are public.

| Step | Result | Assertions | Time |
|---|---|---|---|
| set up: five members and four recipients | ✓ pass | 1/1 | 21574 ms |
| A · open the Dark Vault; four founders deposit 0.1 each | ✓ pass | 5/5 | 11282 ms |
| A · round 1: an investing pool, 0.05 NEAR to rp | ✓ pass | 4/4 | 5577 ms |
| A · a fifth member deposits between rounds | ✓ pass | 3/3 | 4693 ms |
| A · round 2: a ballot among all five, the pool of 0.05 to the winner | ✓ pass | 6/6 | 6752 ms |
| A · round 1's signed settlement replayed after round 2 is refused and changes nothing | ✓ pass | 2/2 | 2239 ms |
| A · round 3: a lending quote, 0.04 NEAR loan to rl won by u3 at 400 bps | ✓ pass | 11/11 | 8374 ms |
| A · the exit timer restarted with the last epoch: an immediate exit is refused, and 16 blocks later everyone leaves with exactly their remainder | ✓ pass | 12/12 | 24430 ms |
| B · the cap: a payout above 25% of the current escrow is refused, yet payouts at exactly 25% succeed back to back | ✓ pass | 14/14 | 41496 ms |
| teardown: prune the syndicates, delete the accounts | ✓ pass | 2/2 | 47844 ms |

### set up: five members and four recipients

- ✓ nine accounts exist

### A · open the Dark Vault; four founders deposit 0.1 each

- ✓ hatch a DARK_VAULT syndicate
- ✓ u1 deposits 0.1
- ✓ u2 deposits 0.1
- ✓ u3 deposits 0.1
- ✓ u4 deposits 0.1
- observed **the group at the start**: `{"type":"DarkVault","epoch":1,"nonce":"b4422ee4b5d1"}`

### A · round 1: an investing pool, 0.05 NEAR to rp

- evidence tx: {"label":"settle_batch_charged round 1","hash":"AmXQetDj72qbw9EJ25dU1E3EH9GVBPzSEzqQCgk2ZDY8","ok":true,"explorer":"https://testnet.nearblocks.io/txns/AmXQetDj72qbw9EJ25dU1E3EH9GVBPzSEzqQCgk2ZDY8","error":null}
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
- evidence tx: {"label":"settle_batch_charged round 2","hash":"3v2YFmGzFMPFrtiwehD8cQg4yJJmJVrKduGLugvEUwaS","ok":true,"explorer":"https://testnet.nearblocks.io/txns/3v2YFmGzFMPFrtiwehD8cQg4yJJmJVrKduGLugvEUwaS","error":null}
- ✓ round 2: the settlement succeeded
- ✓ round 2: the epoch rose by exactly 1 (2 to 3) and the round nonce changed
- ✓ round 2: ra received exactly 0.05
- ✓ (2) the late member was charged 0.01 like everyone else: u5 now has 0.09
- ✓ round 2: the members' escrows sum to the group total

### A · round 1's signed settlement replayed after round 2 is refused and changes nothing

- evidence tx: {"label":"replay of round 1","hash":"6rGCbYyKXgEJcSA8JP8VGMfDKB3Dgzh3LocTU7xcx9si","ok":false,"explorer":"https://testnet.nearblocks.io/txns/6rGCbYyKXgEJcSA8JP8VGMfDKB3Dgzh3LocTU7xcx9si","error":"Smart contract panicked:…
- ✓ (3) the replay is refused (nonce mismatch)
- ✓ (3) nothing changed: same total, same epoch, same escrows, nothing in flight

### A · round 3: a lending quote, 0.04 NEAR loan to rl won by u3 at 400 bps

- ✓ u3 wins at 400 bps
- evidence tx: {"label":"settle_batch_charged round 3","hash":"v6RkFFPqH1vYFYtyY4BduvKF9D9Ktu5mMXepKU7X2WD","ok":true,"explorer":"https://testnet.nearblocks.io/txns/v6RkFFPqH1vYFYtyY4BduvKF9D9Ktu5mMXepKU7X2WD","error":null}
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

### A · the exit timer restarted with the last epoch: an immediate exit is refused, and 16 blocks later everyone leaves with exactly their remainder

- evidence tx: {"label":"early exit as u1","hash":"5wANZrfJJUsYh65MFfMZzNhDMAPsh1i7cw2MxPjmmDbc","ok":false,"explorer":"https://testnet.nearblocks.io/txns/5wANZrfJJUsYh65MFfMZzNhDMAPsh1i7cw2MxPjmmDbc","error":"Smart contract panicked: …
- ✓ (4) an exit right after round 3 is refused: the deliberation window restarted
- observed **blocks since the group was opened, far more than the 16-block timer**: `65`
- ✓ (4) u1 exits alone
- ✓ (4) u1 got back exactly 0.08
- ✓ (4) u2 exits alone
- ✓ (4) u2 got back exactly 0.08
- ✓ (4) u3 exits alone
- ✓ (4) u3 got back exactly 0.035
- ✓ (4) u4 exits alone
- ✓ (4) u4 got back exactly 0.075
- ✓ (4) u5 exits alone
- ✓ (4) u5 got back exactly 0.09
- ✓ the group ended fully refunded

### B · the cap: a payout above 25% of the current escrow is refused, yet payouts at exactly 25% succeed back to back

- ✓ hatch with a key we hold, standing in for a compromised host
- ✓ u1 deposits 0.1
- ✓ u2 deposits 0.1
- ✓ u3 deposits 0.1
- ✓ u4 deposits 0.1
- evidence tx: {"label":"payout above the cap: 0.11 of 0.4, charged 0.055 to each of two members so only the cap can refuse it","hash":"6t1CvTgumcTR6JoJFe7fUkrjEhghgbAoSH4uHw6AVaiN","ok":false,"explorer":"https://testnet.nearblocks.io/…
- ✓ (B) a payout of 0.11 against a 25% cap of 0.1 is refused even with a valid signature
- ✓ (B) nothing moved
- evidence tx: {"label":"payout at exactly 25% of the current escrow: 0.1","hash":"E959gDwo1a1v4y8krHjWrYTFsLgvhaqK1fqeVhPaVhmE","ok":true,"explorer":"https://testnet.nearblocks.io/txns/E959gDwo1a1v4y8krHjWrYTFsLgvhaqK1fqeVhPaVhmE","er…
- ✓ (B) a payout of 0.1, exactly 25% of the current escrow, succeeds
- evidence tx: {"label":"payout at exactly 25% of the current escrow: 0.075","hash":"9G59k4dGRd6vtJVwFtYciEYgkuXqEJ6UnKmLdnim5r7N","ok":true,"explorer":"https://testnet.nearblocks.io/txns/9G59k4dGRd6vtJVwFtYciEYgkuXqEJ6UnKmLdnim5r7N","…
- ✓ (B) a payout of 0.075, exactly 25% of the current escrow, succeeds
- evidence tx: {"label":"payout at exactly 25% of the current escrow: 0.05625","hash":"6oemTTNiQkqdqyw1VaXCddPrUrReiMX57naD2f8uFQuN","ok":true,"explorer":"https://testnet.nearblocks.io/txns/6oemTTNiQkqdqyw1VaXCddPrUrReiMX57naD2f8uFQuN"…
- ✓ (B) a payout of 0.05625, exactly 25% of the current escrow, succeeds
- observed **released within a few minutes, as a share of the original 0.4 NEAR, against a stated 25% per epoch**: `57.81%`
- ✓ (B) FINDING: three back-to-back settlements released 0.23125 of 0.4, which is 57.8% of the group, 2.3 times the stated 25% per epoch: the cap bounds each settlement, not the pace of release
- ✓ u2 exits alone with exactly 0.025
- ✓ u3 exits alone with exactly 0.04375
- ✓ u4 exits alone with exactly 0.1

### teardown: prune the syndicates, delete the accounts

- evidence findings: {"epochs":[1,2,3,4],"cap":{"stated":"25% per epoch","releasedPct":57.81,"settlements":3}}
- observed **teardown**: `{"pruned":2,"notPruned":[],"deleted":9,"kept":[],"failed":[]}`
- ✓ every account was deleted and every syndicate pruned
- ✓ the contract holds the records it started with

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
