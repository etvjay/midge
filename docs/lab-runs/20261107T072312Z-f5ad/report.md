# Lab run 20261107T072312Z-f5ad

- **Code:** `4c5c1c0a22e268692c73cbfd961e95a7a49f447a` on `master` (**2 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `8a0180ff698c44b5…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 64 events, hash-chained; root `a66c56db14a79010d664d3a44bc2c73e8234bd1d5aabc81c561b78790a12f73e`. Verify with `node lab/verify-run.js lab/runs/20261107T072312Z-f5ad`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-CMP-INVEST-02 Investing together, each backer funding their own amount: per-member charges against equal shares, same backers, same run | testnet | **PASS** | 5 | 40 |  |

## E-CMP-INVEST-02: Investing together, each backer funding their own amount: per-member charges against equal shares, same backers, same run

**Hypothesis.** Predictions written first in docs/lab/USECASE_PLAN.md. Four backers put in 0.01, 0.02, 0.03 and 0.04 NEAR through the same room with a common 0.05 deposit. (1) With the pooled program and settle_batch_charged each backer's remainder at exit is exactly their deposit less their own amount (0.04, 0.03, 0.02, 0.01). (2) But the charges are arguments of the public settlement transaction, so an observer reading only that transaction recovers all four contributions. (3) With an ordinary equal-share settlement the same observer recovers none, and each backer bears 0.025 whatever they put in. (4) Before either round settles the escrows are all equal and say nothing. So for pooled investing, hiding the amounts and funding each backer fairly are not both available on this contract. Fails if the observer cannot recover the contributions from the charged settlement, if a remainder differs from deposit less contribution, or if the equal-share round leaks any amount.

**What this does not prove**
- One operator controls every account; the room is a local HostedRoost with a simulated attestation provider.
- The observer reads the settlement transaction's public arguments through an archival RPC, which is what an explorer shows. It does not model an attacker who also sees the room.
- Hiding the charges (the room signing per-member receipts that members claim against, or zero-knowledge proofs) is not built and not tested; it is named in the plan as a design option.
- Amounts are tiny testnet NEAR. Bids are not authenticated to an account (GAP-023).

| Step | Result | Assertions | Time |
|---|---|---|---|
| set up: four backers and a recipient | ✓ pass | 1/1 | 12478 ms |
| CHARGED · each backer funds their own amount (pooled program, settle_batch_charged) | ✓ pass | 18/18 | 140747 ms |
| EQUAL SHARES · the same backers, an ordinary settlement | ✓ pass | 18/18 | 81312 ms |
| the trade-off, read from the two rounds above | ✓ pass | 1/1 | 0 ms |
| teardown: prune the syndicates, compact, delete the accounts | ✓ pass | 2/2 | 266450 ms |

### set up: four backers and a recipient

- ✓ five accounts exist

### CHARGED · each backer funds their own amount (pooled program, settle_batch_charged)

- ✓ hatch inv2-mw62tu5x-charged
- ✓ a deposits 0.05
- ✓ b deposits 0.05
- ✓ c deposits 0.05
- ✓ d deposits 0.05
- ✓ prediction 4: before settlement the escrows are all equal, so they say nothing about the amounts (0 of 4 recovered)
- observed **what the Roost computed**: `{"format":"pool","recipient":"w2tu5xr.fly-1793636729.testnet","sold":true,"members":4,"total":"0.1","leftOut":[],"executionModel":"HOSTED_SE…`
- evidence tx: {"label":"settle_batch_charged inv2-mw62tu5x-charged","hash":"7jR4DKre2omnrgcWSvwvU7opa26izxazR5Uaru4tAE2V","ok":true,"explorer":"https://testnet.nearblocks.io/txns/7jR4DKre2omnrgcWSvwvU7opa26izxazR5Uaru4tAE2V","error":n…
- ✓ the settlement succeeded
- ✓ the recipient received exactly 0.10
- ✓ a exits alone
- ✓ b exits alone
- ✓ c exits alone
- ✓ d exits alone
- ✓ the syndicate ended fully refunded
- observed **what the observer reads from the public settlement arguments**: `{"syndicate_id":"inv2-mw62tu5x-charged","attestation_nonce":"e3bfe6dc28c06015c9135277eb2244bc679964a5d272dfd509a97c72262aaa59","aggregate_or…`
- ✓ prediction 2: from the settlement transaction alone an observer recovers all four contributions (4 of 4)
- ✓ prediction 1: a got back exactly their deposit less their own 0.01
- ✓ prediction 1: b got back exactly their deposit less their own 0.02
- ✓ prediction 1: c got back exactly their deposit less their own 0.03
- ✓ prediction 1: d got back exactly their deposit less their own 0.04
- evidence CHARGED: {"recovered":4,"of":4,"remainders":{"a":"0.04","b":"0.03","c":"0.02","d":"0.01"},"settleTx":"7jR4DKre2omnrgcWSvwvU7opa26izxazR5Uaru4tAE2V"}

### EQUAL SHARES · the same backers, an ordinary settlement

- ✓ hatch inv2-mw62tu5x-equal
- ✓ a deposits 0.05
- ✓ b deposits 0.05
- ✓ c deposits 0.05
- ✓ d deposits 0.05
- ✓ prediction 4: before settlement the escrows are all equal, so they say nothing about the amounts (0 of 4 recovered)
- evidence tx: {"label":"settle_batch inv2-mw62tu5x-equal","hash":"JAu5v4E3Umwhk8hG9TXvyk4iMozcXKR3ts31uyfwp2Dc","ok":true,"explorer":"https://testnet.nearblocks.io/txns/JAu5v4E3Umwhk8hG9TXvyk4iMozcXKR3ts31uyfwp2Dc","error":null}
- ✓ the settlement succeeded
- ✓ the recipient received exactly 0.10
- ✓ a exits alone
- ✓ b exits alone
- ✓ c exits alone
- ✓ d exits alone
- ✓ the syndicate ended fully refunded
- observed **what the observer reads from the public settlement arguments**: `{"syndicate_id":"inv2-mw62tu5x-equal","attestation_nonce":"01443f1b15fe9b0799c0a977910be48106fc6890107990402beb60423c6bff78","aggregate_orde…`
- ✓ prediction 3: from the settlement transaction alone an observer recovers none of the contributions (0 of 4)
- ✓ prediction 3: a bore exactly 0.025 whatever they put in (their own was 0.01)
- ✓ prediction 3: b bore exactly 0.025 whatever they put in (their own was 0.02)
- ✓ prediction 3: c bore exactly 0.025 whatever they put in (their own was 0.03)
- ✓ prediction 3: d bore exactly 0.025 whatever they put in (their own was 0.04)
- evidence EQUAL: {"recovered":0,"of":4,"borne":{"a":"0.025","b":"0.025","c":"0.025","d":"0.025"},"settleTx":"JAu5v4E3Umwhk8hG9TXvyk4iMozcXKR3ts31uyfwp2Dc"}

### the trade-off, read from the two rounds above

- observed **trade-off**: `{"charged":{"contributionsRecoveredByAnObserver":4,"fundedByOwnAmount":true},"equalShares":{"contributionsRecoveredByAnObserver":0,"fundedBy…`
- ✓ each style has exactly one of the two properties: per-member charges fund fairly and leak the amounts; equal shares hide the amounts and fund unfairly
- evidence comparison: {"charged":{"contributionsRecoveredByAnObserver":4,"fundedByOwnAmount":true},"equalShares":{"contributionsRecoveredByAnObserver":0,"fundedByOwnAmount":false}}

### teardown: prune the syndicates, compact, delete the accounts

- observed **teardown**: `{"pruned":2,"notPruned":[],"deleted":5,"kept":[],"failed":[]}`
- ✓ every account was deleted and every syndicate pruned
- ✓ the contract holds the records it started with

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
