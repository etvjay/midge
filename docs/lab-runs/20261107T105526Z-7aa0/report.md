# Lab run 20261107T105526Z-7aa0

- **Code:** `f8a5475ba2978a25489bd44c3edd50297114071b` on `master` (**5 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `8a0180ff698c44b5…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 131 events, hash-chained; root `a81f6ab305c4603f0f0b9023ee350f3319094e18863018f0e611648f88baeb8d`. Verify with `node lab/verify-run.js lab/runs/20261107T105526Z-7aa0`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-CMP-QUOTE-01 Lending quotes on testnet: an open reverse-quote round against sealed first-price and second-price rounds run by the host | testnet | **PASS** | 7 | 93 |  |

## E-CMP-QUOTE-01: Lending quotes on testnet: an open reverse-quote round against sealed first-price and second-price rounds run by the host

**Hypothesis.** Predictions are fixed in docs/lab/RFQ_PLAN.md (committed before this ran). Five lenders with private costs 450, 400, 500, 600 and 420 bps (the last is a sniper that can watch the chain) compete to fund a 0.05 NEAR loan, maximum 700 bps. (1) In the open round every honest lender's quote is public and an observer attributes a cost within 10% to at least 3 of the 4 honest lenders from their lowest quote; in the sealed rounds none, and the agreed rate is not on chain at all. (2) The honest open round leaves b leading at 450; the sniper quotes 449 at the end: either it lands and wins at 449, or it is refused as late and b wins at 450 (recorded, not predicted). (3) Sealed first-price (quotes cost + 50): b wins at 450; sealed second-price (quotes cost): b wins at 420. (4) In each sealed round the borrower receives exactly 0.05, only the winner is charged exactly 0.05, and every other lender exits with the full deposit. (5) If the host never signs, nothing settles and all five exit with the full 0.05. (6) Gas of the first-price round over the open round is between 0.5 and 1.5. Fails if any of these breaks.

**What this does not prove**
- One operator controls every account. The lenders are scripted: honest lenders open at the maximum and undercut by 25 bps down to their cost (open round), or quote cost + 50 (first-price) or cost (second-price); only the sniper adapts.
- The open baseline is our own minimal reverse-quote contract (contracts/public-market), not anyone else's. The host is a local HostedRoost with a simulated attestation provider.
- Only the cash leg settles: the loan is funded, but the rate, repayment and default are not on this chain or enforced by it. Under Midge the agreed rate is known only to the parties who hold the host's outcome.
- Deposits are public. They hide quotes only because everyone deposits the same 0.05 NEAR, which is the loan size; losers recover their deposit only after the exit timer.
- Quotes are not signed to an account in this run (the signed-input path was not used). The sniper's success depends on timing against ~1 s blocks and is recorded, not guaranteed.

| Step | Result | Assertions | Time |
|---|---|---|---|
| set up: five lenders, a borrower, and the open quote contract deployed fresh | ✓ pass | 2/2 | 24952 ms |
| OPEN · honest lenders open at the maximum and undercut by 25 bps down to their cost, then the sniper watches the chain and undercuts by 1 bp at the end | ✓ pass | 19/19 | 264539 ms |
| MIDGE · sealed first-price (lenders quote cost + 50): common deposit, the host picks the winner, the contract charges only the winner | ✓ pass | 28/28 | 35650 ms |
| MIDGE · sealed second-price (lenders quote their true cost): common deposit, the host picks the winner, the contract charges only the winner | ✓ pass | 28/28 | 35704 ms |
| DEAD HOST · the host never signs: nothing settles and every lender exits alone with the full deposit | ✓ pass | 12/12 | 33826 ms |
| the comparison, read from the measurements above | ✓ pass | 2/2 | 0 ms |
| teardown: delete the baseline contract, prune the syndicates, delete the accounts | ✓ pass | 2/2 | 39380 ms |

### set up: five lenders, a borrower, and the open quote contract deployed fresh

- ✓ the public market wasm is built (npm run build:wasm:market)
- ✓ the open quote contract is deployed and answers

### OPEN · honest lenders open at the maximum and undercut by 25 bps down to their cost, then the sniper watches the chain and undercuts by 1 bp at the end

- ✓ open the request
- ✓ d quotes 700 bps
- ✓ c quotes 675 bps
- ✓ a quotes 650 bps
- ✓ b quotes 625 bps
- ✓ d quotes 600 bps
- ✓ c quotes 575 bps
- ✓ a quotes 550 bps
- ✓ b quotes 525 bps
- ✓ c quotes 500 bps
- ✓ a quotes 475 bps
- ✓ b quotes 450 bps
- observed **quotes before the sniper**: `["d 700","c 675","a 650","b 625","d 600","c 575","a 550","b 525","c 500","a 475","b 450"]`
- ✓ the honest round leaves b leading at 450 bps (prediction 2)
- ✓ the honest quoting finished with time to spare before the end
- observed **measured: block time (ms), mean quote latency (blocks), the sniper sends this many blocks before the end**: `{"blockMs":571,"latencyBlocks":5,"lead":8}`
- ✓ the request closed
- ✓ the borrower received exactly the 0.05 loan
- observed **result**: `{"winner":"s","rate":449,"lowestCostLender":"b","attributedWithin10pct":3,"of":4,"quotesOnChain":12,"honestLendersVisible":4,"gasTGas":36.6,…`
- ✓ (1) every honest lender's quotes are public: 4 of 4
- ✓ (1) an observer attributes a cost within 10% to at least 3 of the 4 honest lenders from their lowest quote
- observed **the sniper's quote**: `landed before the end`
- ✓ (2) either the sniper's 449 landed in time and won, or it was refused as late and b kept the lead at 450
- evidence OPEN: {"winner":"s","rate":449,"lowestCostLender":"b","attributedWithin10pct":3,"of":4,"quotesOnChain":12,"honestLendersVisible":4,"gasTGas":36.6,"wallMs":264535,"sniped":true,"blocksBeforeEnd":3}

### MIDGE · sealed first-price (lenders quote cost + 50): common deposit, the host picks the winner, the contract charges only the winner

- ✓ hatch qt-mw6aerka-fp
- ✓ a deposits 0.05
- ✓ b deposits 0.05
- ✓ c deposits 0.05
- ✓ d deposits 0.05
- ✓ s deposits 0.05
- ✓ the public escrows are all equal, so they attribute no cost to any named lender
- observed **sealed first-price (lenders quote cost + 50): what the host computed**: `{"shape":"lend","pricing":"first","counterparty":"qaerkar.fly-1793636729.testnet","won":true,"winner":"qaerkab.fly-1793636729.testnet","quot…`
- evidence tx: {"label":"settle_batch_charged qt-mw6aerka-fp","hash":"7GNttPTHAps5wQqfgT5NPbTVRbJuH4gJmgAtmjqBJxNn","ok":true,"explorer":"https://testnet.nearblocks.io/txns/7GNttPTHAps5wQqfgT5NPbTVRbJuH4gJmgAtmjqBJxNn","error":null}
- ✓ settle_batch_charged succeeded
- ✓ (4) the borrower received exactly 0.05
- ✓ (4) a's escrow is untouched at 0.05
- ✓ (4) b's escrow is now 0 (charged the loan)
- ✓ (4) c's escrow is untouched at 0.05
- ✓ (4) d's escrow is untouched at 0.05
- ✓ (4) s's escrow is untouched at 0.05
- ✓ the settlement carries no rate: its arguments are only the syndicate, nonce, order hash, allocations, charges and signature
- ✓ a exits alone
- ✓ c exits alone
- ✓ d exits alone
- ✓ s exits alone
- ✓ (4) the winner was charged its whole deposit, so it has nothing to exit with and the contract says so
- ✓ (4) a exits with the full 0.05
- ✓ (4) b exits with 0
- ✓ (4) c exits with the full 0.05
- ✓ (4) d exits with the full 0.05
- ✓ (4) s exits with the full 0.05
- ✓ the syndicate ended fully refunded
- observed **result**: `{"winner":"b","rate":450,"attributedWithin10pct":0,"of":5,"rateOnChain":false,"gasTGas":43.5,"wallMs":35614}`
- ✓ (3) the lowest-cost lender, b, won with the sniper present
- ✓ (3) the agreed rate is 450 bps
- evidence FP: {"winner":"b","rate":450,"attributedWithin10pct":0,"of":5,"rateOnChain":false,"gasTGas":43.5,"wallMs":35614,"settleTx":"7GNttPTHAps5wQqfgT5NPbTVRbJuH4gJmgAtmjqBJxNn"}

### MIDGE · sealed second-price (lenders quote their true cost): common deposit, the host picks the winner, the contract charges only the winner

- ✓ hatch qt-mw6aerka-sp
- ✓ a deposits 0.05
- ✓ b deposits 0.05
- ✓ c deposits 0.05
- ✓ d deposits 0.05
- ✓ s deposits 0.05
- ✓ the public escrows are all equal, so they attribute no cost to any named lender
- observed **sealed second-price (lenders quote their true cost): what the host computed**: `{"shape":"lend","pricing":"second","counterparty":"qaerkar.fly-1793636729.testnet","won":true,"winner":"qaerkab.fly-1793636729.testnet","quo…`
- evidence tx: {"label":"settle_batch_charged qt-mw6aerka-sp","hash":"8aJRwzdpLbTtvAUSEnV8jdf6XmaXopy2sNzBsaZHe9uu","ok":true,"explorer":"https://testnet.nearblocks.io/txns/8aJRwzdpLbTtvAUSEnV8jdf6XmaXopy2sNzBsaZHe9uu","error":null}
- ✓ settle_batch_charged succeeded
- ✓ (4) the borrower received exactly 0.05
- ✓ (4) a's escrow is untouched at 0.05
- ✓ (4) b's escrow is now 0 (charged the loan)
- ✓ (4) c's escrow is untouched at 0.05
- ✓ (4) d's escrow is untouched at 0.05
- ✓ (4) s's escrow is untouched at 0.05
- ✓ the settlement carries no rate: its arguments are only the syndicate, nonce, order hash, allocations, charges and signature
- ✓ a exits alone
- ✓ c exits alone
- ✓ d exits alone
- ✓ s exits alone
- ✓ (4) the winner was charged its whole deposit, so it has nothing to exit with and the contract says so
- ✓ (4) a exits with the full 0.05
- ✓ (4) b exits with 0
- ✓ (4) c exits with the full 0.05
- ✓ (4) d exits with the full 0.05
- ✓ (4) s exits with the full 0.05
- ✓ the syndicate ended fully refunded
- observed **result**: `{"winner":"b","rate":420,"attributedWithin10pct":0,"of":5,"rateOnChain":false,"gasTGas":43.6,"wallMs":35699}`
- ✓ (3) the lowest-cost lender, b, won with the sniper present
- ✓ (3) the agreed rate is 420 bps
- evidence SP: {"winner":"b","rate":420,"attributedWithin10pct":0,"of":5,"rateOnChain":false,"gasTGas":43.6,"wallMs":35699,"settleTx":"8aJRwzdpLbTtvAUSEnV8jdf6XmaXopy2sNzBsaZHe9uu"}

### DEAD HOST · the host never signs: nothing settles and every lender exits alone with the full deposit

- ✓ hatch
- ✓ a deposits
- ✓ b deposits
- ✓ c deposits
- ✓ d deposits
- ✓ s deposits
- ✓ a exits alone
- ✓ b exits alone
- ✓ c exits alone
- ✓ d exits alone
- ✓ s exits alone
- ✓ (5) every lender recovered the full 0.05 alone

### the comparison, read from the measurements above

- observed **results**: `{"PUB":{"winner":"s","rate":449,"lowestCostLender":"b","attributedWithin10pct":3,"of":4,"quotesOnChain":12,"honestLendersVisible":4,"gasTGas…`
- ✓ every path was measured
- observed **gas, TGas for the whole round: open / first-price / second-price**: `[36.6,43.5,43.6]`
- observed **wall time (ms): open / first-price / second-price**: `[264535,35614,35699]`
- ✓ (6) gas of the first-price round over the open round is between 0.5 and 1.5
- observed **borrower's rate: open / first-price / second-price (bps)**: `[449,450,420]`
- evidence comparison: {"PUB":{"winner":"s","rate":449,"lowestCostLender":"b","attributedWithin10pct":3,"of":4,"quotesOnChain":12,"honestLendersVisible":4,"gasTGas":36.6,"wallMs":264535,"sniped":true,"blocksBeforeEnd":3},"FP":{"winner":"b","ra…

### teardown: delete the baseline contract, prune the syndicates, delete the accounts

- observed **baseline contract account**: `deleted, balance returned to the master`
- observed **teardown**: `{"pruned":3,"notPruned":[],"deleted":6,"kept":[],"failed":[]}`
- ✓ every account was deleted and every syndicate pruned
- ✓ the contract holds the records it started with

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
