# Lab run 20261112T154404Z-bb66

- **Code:** `2da0909b4e39ca32a5964dbbbff8852b118fedb5` on `program-batch-weighted-ballot-prorata-pool` (**9 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `620a25cc9310e33b…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 59 events, hash-chained; root `501e0f47bda4b8416acee8cd88b483a15fc78b95eab4d42c14662e924a6ae7e2`. Verify with `node lab/verify-run.js lab/runs/20261112T154404Z-bb66`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-BALLOT-WEIGHTED-01 Ballot room program: weighted votes and a supermajority rule, with no change when neither is used | offline | **PASS** | 2 | 26 |  |
| E-POOL-PRORATA-01 Pool room program: pro-rata scaling when oversubscribed, so arrival order stops deciding who is shut out | offline | **PASS** | 2 | 19 |  |

## E-BALLOT-WEIGHTED-01: Ballot room program: weighted votes and a supermajority rule, with no change when neither is used

**Hypothesis.** With no weights the ballot program returns exactly what it returned before; with weights, quorum and the winning share are measured in weight; a supermajority needs its bar (on the bar passes); order does not matter; the outcome still carries no tally; bad weights and thresholds are refused; and the host charges every roll member the same share whatever their weight.

**What this does not prove**
- Offline, on local hosts with a simulated attestation provider and a stubbed account-key check. A weight is supplied by the caller and is public in the request; the contract cannot tell one person from many accounts, so a weight is a share and not a person.

| Step | Result | Assertions | Time |
|---|---|---|---|
| the counting rule: unchanged without weights, weighted with them | ✓ pass | 17/17 | 332 ms |
| the host: weights and a threshold change the votes, not the charges, and the order hash | ✓ pass | 9/9 | 149 ms |

### the counting rule: unchanged without weights, weighted with them

- ✓ without weights the result equals the old code over 3,000 random rounds, both rules, three quorums
- ✓ a weight of 3 beats two weights of 1 under majority (3 of 5 is more than half)
- ✓ quorum is measured in weight: two heads of three is only 2 of 5 weight and misses a 50% quorum
- ✓ one head of three with weight 3 of 5 meets a 50% quorum and decides
- ✓ 4 of 5 equal weights (80%) passes a two-thirds bar
- ✓ 3 of 5 (60%) fails a two-thirds bar and says so
- ✓ exactly on the bar passes: 2 of 3 non-abstaining weight at 6,667 bps is 66.67% and passes at 6,666 bps
- ✓ one point under the bar fails: 2 of 3 at 6,667 bps is 66.666...% and fails
- ✓ a supermajority of 10,000 bps needs every non-abstaining weight
- ✓ a weight of 0 is refused
- ✓ a negative weight is refused
- ✓ a fractional weight is refused
- ✓ a weight for someone outside the roll is refused
- ✓ a threshold of 5,000 is refused (that is a majority)
- ✓ a threshold over 10,000 is refused
- ✓ supermajority without a threshold is refused
- ✓ no invariant broke in 3,000 random weighted rounds (order-independent, weighted quorum, unique weighted leader, majority and supermajority bars, no tally)

### the host: weights and a threshold change the votes, not the charges, and the order hash

- ✓ unweighted, B wins 3 of 4 non-abstaining heads
- ✓ with m1 weighted 5, A (5) beats B (3) and wins
- ✓ the weighted run charges every roll member the same 0.02, voters or not
- ✓ weights that leave the winner unchanged still change the order hash (B wins either way)
- ✓ the published outcome has no weights, tally or turnout
- ✓ B has 3 of 4 (75%) and fails an 80% bar: nothing is decided and nothing is paid
- ✓ the same ballots pass a 75% bar exactly and pay the pool to rb.near
- ✓ the host refuses a weight for an account that is not on the roll
- ✓ the host refuses supermajority without a threshold

## E-POOL-PRORATA-01: Pool room program: pro-rata scaling when oversubscribed, so arrival order stops deciding who is shut out

**Hypothesis.** In pro-rata mode a pool at or under its cap takes every bid in full; over the cap every bid is scaled by the same ratio (rounded down), the total never passes the cap and is within one micro-NEAR per member of it, no contribution exceeds its bid, the result does not depend on arrival order, and the host charges each member exactly their scaled amount. First-come mode is unchanged.

**What this does not prove**
- Pure-function and signing tests on a local Roost with a simulated attestation provider. Bids are not authenticated to an account here (the unsigned host). Charges are public at settlement, so pro-rata hides nothing extra.

| Step | Result | Assertions | Time |
|---|---|---|---|
| the rule: worked examples and 3,000 random rounds | ✓ pass | 11/11 | 49 ms |
| the host: each member is charged exactly their scaled amount, and the Roost signs only that | ✓ pass | 8/8 | 51 ms |

### the rule: worked examples and 3,000 random rounds

- ✓ first-come still leaves out the last to arrive (unchanged)
- ✓ pro-rata scales all three to 0.03 each and takes the full cap
- ✓ the same three bids with the order reversed give the same contributions in pro-rata mode
- ✓ and a different result in first-come mode (the last to arrive changes)
- ✓ under the cap every bid is taken in full
- ✓ rounding is down: three bids of 10 over a cap of 10 give 3, 3 and 3 (total 9, never 10 plus a bit)
- ✓ a bid that scales to zero is left out and reported
- ✓ the minimum applies to the bid as sent, before scaling: a is out, b and c are scaled to 0.02
- ✓ pro-rata without a cap is refused
- ✓ an unknown mode is refused
- ✓ no invariant broke in 3,000 random rounds (cap, rounding down, order-independent, nothing exceeds its bid, full when under the cap)

### the host: each member is charged exactly their scaled amount, and the Roost signs only that

- ✓ each of the three is charged 0.03 and the recipient receives 0.09
- ✓ the outcome says pro-rata and reports nobody left out
- ✓ first-come mode on the same bids still leaves the third out
- ✓ the order hash differs between the two modes on the same bids
- ✓ a charge raised by one yocto is refused
- ✓ charging the unscaled bids (0.04 each) is refused
- ✓ the honest outcome signs
- ✓ the host refuses pro-rata without a cap

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
