# Lab run 20261105T044116Z-6a24

- **Code:** `8d4d0d475ba0ae4c34c5ae06f13b938df5a3f62d` on `master` (**7 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `8a0180ff698c44b5…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 39 events, hash-chained; root `b4e37594685dac91716dd2a9065f3544da6cc56fcb9375d03273cf9e6d9909d7`. Verify with `node lab/verify-run.js lab/runs/20261105T044116Z-6a24`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-AUCTION-PROGRAMS-01 Sealed-bid auction rules the Roost can run: first-price, second-price (Vickrey) and uniform-price, and what the Roost will sign for them | offline | **PASS** | 4 | 23 |  |

## E-AUCTION-PROGRAMS-01: Sealed-bid auction rules the Roost can run: first-price, second-price (Vickrey) and uniform-price, and what the Roost will sign for them

**Hypothesis.** Each format gives the textbook outcome on worked examples and keeps its invariants over thousands of random bid sets: charges sum exactly to the seller's proceeds, no member pays more than they bid, the highest bid wins, a uniform auction fills from the top and charges everyone the same price, and the same bids always give the same outcome. Under second-price, bidding your true value is never worse than any other bid (tested against rivals drawn at random); under first-price it is not (a case where shading a bid wins more is found). The Roost signs only the outcome it computed: altered charges, altered allocations, charges on an ordinary aggregate, and a second signature are all refused, and the signed message has the 7-field charged format. Fails if any invariant breaks, if truthful bidding is ever beaten under second-price, or if the Roost signs anything other than its own outcome.

**What this does not prove**
- The rules are the standard textbook ones; this tests that the code implements them and that the Roost cannot be made to sign anything else. It does not test that these are the right rules for any real sale.
- Bids are not authenticated to a NEAR account: whoever submits a sealed bid names the flyerId. An impersonator could grief another member (GAP-023). The contract still caps any charge at that member's deposit and the Roost caps it at the bid.
- The strategy tests use random rivals and a grid of alternative bids; they support the theory, they are not a proof.
- The Roost is a local HostedRoost with a simulated attestation provider.

| Step | Result | Assertions | Time |
|---|---|---|---|
| worked examples, checked by hand | ✓ pass | 8/8 | 2 ms |
| invariants over 4,000 random bid sets | ✓ pass | 1/1 | 217 ms |
| second-price: telling the truth is never beaten; first-price: it is | ✓ pass | 2/2 | 76 ms |
| the Roost signs only the outcome it computed | ✓ pass | 12/12 | 230 ms |

### worked examples, checked by hand

- ✓ first-price: b (8) wins and pays 8
- ✓ second-price: b (8) wins and pays the second-highest bid, 6
- ✓ second-price with one bid pays the reserve (2), not its own bid
- ✓ a tie goes to the bid that arrived first
- ✓ bids under the reserve are ignored, and with none above it nothing is sold
- ✓ uniform: a gets 4, b gets 5, c gets the last 1 unit; d gets nothing
- ✓ uniform: oversubscribed, so everyone pays the marginal bid, c's 6 per unit; proceeds 10 x 6
- ✓ uniform: undersubscribed (7 of 10 units wanted), the clearing price is the reserve, 2

### invariants over 4,000 random bid sets

- observed **bid sets x formats checked**: `12000`
- ✓ no invariant broke in any trial

### second-price: telling the truth is never beaten; first-price: it is

- observed **second-price deviations tested**: `50000`
- ✓ under second-price no deviation from the true value ever did better
- ✓ under first-price, bidding the true value (10) against a rival at 6 earns 0, while shading to 6.5 wins the same lot and earns 3.5

### the Roost signs only the outcome it computed

- observed **the published outcome**: `{"format":"uniform","lotUnits":10,"reserve":"0","sold":true,"bidsReceived":4,"bidsEligible":4,"excludedFlyers":[],"clearingPrice":"6","fills…`
- ✓ the Roost reports clearing price 6 and proceeds 60, and charges a 24, b 30, c 6 NEAR
- ✓ the published outcome never contains the losing bid d, or any bid above what the winners pay
- ✓ altered charges (one yocto more on a) are refused
- ✓ charges swapped between members are refused
- ✓ altered allocations (the seller paid one yocto more) are refused
- ✓ an auction outcome cannot be settled without its charges
- ✓ charges cannot be signed for an ordinary aggregate
- ✓ the signed message has the 7-field charged format ending in the order hash
- ✓ the signature verifies under the Roost's attested settlement key
- ✓ a second signature for the same outcome is refused
- observed **charges hash vector (also asserted in the contract tests)**: `277962d41d643c5f0b7aaf5616124070cdb5f906d57e7a5ab0f6906f9c7e8be9`
- ✓ the charges hash equals the value the contract's own compute_charges_hash gives for the same charges (asserted in contracts/fly-coordinator/tests/unit_tests.rs)
- ✓ a first-price outcome is a single winner and one charge equal to the proceeds

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
