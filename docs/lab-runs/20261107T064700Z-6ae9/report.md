# Lab run 20261107T064700Z-6ae9

- **Code:** `423b600fe8b0ec120327e1732cbd962f9322fb7e` on `master` (**14 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `8a0180ff698c44b5…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 174 events, hash-chained; root `28a483dfe0098f14421044c32179b854c6b0a128158d86c002ef53f5da968f54`. Verify with `node lab/verify-run.js lab/runs/20261107T064700Z-6ae9`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-CMP-AUCTION-01 Auctions on testnet: a public open auction against sealed first-price, sealed second-price and uniform-price run by the Roost | testnet | **PASS** | 8 | 127 |  |

## E-CMP-AUCTION-01: Auctions on testnet: a public open auction against sealed first-price, sealed second-price and uniform-price run by the Roost

**Hypothesis.** Five bidders value one lot at 0.060, 0.045, 0.030, 0.020 and 0.055 NEAR (the last is a sniper who can watch the chain). In a public open auction an observer can attribute a valuation, within 5%, to most bidders from public bids, and the sniper, who can read every bid, always has a winning bid available from public state alone; if it lands before the end it takes the lot from the highest-value bidder, and if it lands late the contract refuses it. (The first version of this experiment predicted that the sniper would land; in two runs it did not, because bid latency here is ~25 blocks and varies. That prediction was falsified and is kept as evidence in docs/lab-runs; this version asserts what is actually true.) In Midge, with everyone depositing the same amount, an observer attributes no valuation to any named bidder, the highest-value bidder wins, losers are refunded exactly, the winner pays exactly the charge the Roost computed, and a Roost that tries to charge a member more than their deposit, charge a total that is not the payout, or reuse an ordinary settlement signature is refused by the contract. A uniform-price run charges every filled bid one price. Fails if any of that does not hold. Also measured: revenue, gas and time, and the residual risk of per-member charges (a compromised room can charge a member up to their whole deposit).

**What this does not prove**
- One operator controls every account. The bidders are scripted: honest bidders raise by 10% up to their value (public) or bid truthfully (second-price) or at 80% of value (first-price, the textbook equilibrium shade for five bidders); only the sniper is adversarial. This shows what the mechanisms do against these strategies, not what real bidders would do, and one scripted instance is not a statistical comparison of revenue.
- The public baseline is our own minimal open (English) auction contract, the common on-chain pattern. It is not Uniswap's or anyone else's contract. There is no public uniform-price baseline: the uniform-price run is Midge only, checked against its own rule.
- The Roost is a local HostedRoost with a simulated attestation provider (the hardware room is E-COMBINED-LIVE-01); the Roost image on Phala does not yet contain the auction code.
- Sealed bids are not authenticated to an account (GAP-023); every bidder here is honest about who they are.
- Deposits are public. They hide bids only because everyone deposits the same 0.07 NEAR. Losers recover their deposit only after the exit timer.
- The sniper's success depends on timing against ~1 s blocks and is recorded, not guaranteed.

| Step | Result | Assertions | Time |
|---|---|---|---|
| set up: five bidders, a seller, and the public auction contract deployed fresh | ✓ pass | 2/2 | 19773 ms |
| PUBLIC · an open auction: honest bidders raise by 10% up to their value, then the sniper watches the chain and bids at the end | ✓ pass | 25/25 | 422608 ms |
| MIDGE · sealed first-price (bids at 80% of value): common deposit, the Roost runs the auction, the contract charges each member their own amount | ✓ pass | 28/28 | 98129 ms |
| MIDGE · sealed second-price, Vickrey (true-value bids): common deposit, the Roost runs the auction, the contract charges each member their own amount | ✓ pass | 28/28 | 111160 ms |
| MIDGE · uniform-price: 100 units, sealed bids of (price, quantity), everyone filled pays one clearing price | ✓ pass | 28/28 | 99824 ms |
| COMPROMISED ROOM · a room that signs charges it should not: the contract's limits, and the risk that remains | ✓ pass | 12/12 | 56788 ms |
| the comparison, read from the measurements above | ✓ pass | 2/2 | 1 ms |
| teardown: delete the baseline contract, prune the syndicates, delete the accounts | ✓ pass | 2/2 | 134781 ms |

### set up: five bidders, a seller, and the public auction contract deployed fresh

- ✓ the public auction wasm is built (npm run build:wasm:baseline)
- ✓ the public auction is deployed and answers

### PUBLIC · an open auction: honest bidders raise by 10% up to their value, then the sniper watches the chain and bids at the end

- ✓ create
- ✓ d bids 0.01
- ✓ c bids 0.011001
- ✓ b bids 0.012102
- ✓ a bids 0.013313
- ✓ d bids 0.014645
- ✓ c bids 0.01611
- ✓ b bids 0.017722
- ✓ a bids 0.019495
- ✓ d bids 0.02
- ✓ c bids 0.022001
- ✓ b bids 0.024202
- ✓ a bids 0.026623
- ✓ c bids 0.029286
- ✓ b bids 0.032215
- ✓ a bids 0.035437
- ✓ b bids 0.038981
- ✓ a bids 0.04288
- ✓ b bids 0.045
- ✓ a bids 0.049501
- observed **bids placed before the sniper**: `["d 0.01","c 0.011001","b 0.012102","a 0.013313","d 0.014645","c 0.01611","b 0.017722","a 0.019495","d 0.02","c 0.022001","b 0.024202","a 0.…`
- ✓ the honest bidding finished with time to spare before the end
- observed **measured: block time (ms), mean bid latency (blocks), the sniper sends this many blocks before the end**: `{"blockMs":603,"latencyBlocks":7,"lead":10}`
- ✓ the auction closed and paid the seller
- observed **result**: `{"winner":"s","highestValueBidder":"a","price":0.050492,"attributedWithin5pct":3,"of":5,"bidsOnChain":20,"gasTGas":52.3,"wallMs":422606,"sni…`
- ✓ prediction: an observer can attribute a valuation within 5% to most of the five bidders from the public bids alone (at least 3)
- ✓ the public state alone gave the sniper a winning bid: the leader's bid raised by 2% was within the sniper's value (0.055), and the sniper values the lot below the highest-value bidder (0.060)
- observed **the sniper's bid**: `landed before the end`
- ✓ either the sniper's bid landed in time and took the lot from the highest-value bidder, or it landed late and the contract refused it and the highest-value bidder kept the lot
- evidence PUBLIC: {"winner":"s","highestValueBidder":"a","price":0.050492,"attributedWithin5pct":3,"of":5,"bidsOnChain":20,"gasTGas":52.3,"wallMs":422606,"sniped":true,"blocksBeforeEnd":4,"sniperOpportunity":true,"bidTxs":["9oM1V7ocwaBSpw…

### MIDGE · sealed first-price (bids at 80% of value): common deposit, the Roost runs the auction, the contract charges each member their own amount

- ✓ hatch auc-mw61ja4w-fp
- ✓ a deposits 0.07
- ✓ b deposits 0.07
- ✓ c deposits 0.07
- ✓ d deposits 0.07
- ✓ s deposits 0.07
- ✓ the public escrows are all equal, so they attribute no valuation to any named bidder
- observed **sealed first-price (bids at 80% of value): what the Roost computed (and will publish by settling)**: `{"format":"first-price","lotUnits":1,"reserve":"0.01","sold":true,"bidsReceived":5,"bidsEligible":5,"excludedFlyers":[],"clearingPrice":"0.0…`
- evidence tx: {"label":"settle_batch_charged auc-mw61ja4w-fp","hash":"GdrFG8bYUmvVkTikjnFrS1pe3431yQv2JYGM6Pa6FXy","ok":true,"explorer":"https://testnet.nearblocks.io/txns/GdrFG8bYUmvVkTikjnFrS1pe3431yQv2JYGM6Pa6FXy","error":null}
- ✓ settle_batch_charged succeeded
- ✓ the seller received exactly the proceeds, 0.048 NEAR
- ✓ a's escrow fell by exactly their own charge (0.048)
- ✓ b's escrow fell by exactly their own charge (0)
- ✓ c's escrow fell by exactly their own charge (0)
- ✓ d's escrow fell by exactly their own charge (0)
- ✓ s's escrow fell by exactly their own charge (0)
- ✓ a exits alone
- ✓ b exits alone
- ✓ c exits alone
- ✓ d exits alone
- ✓ s exits alone
- ✓ a got back exactly their deposit less their charge
- ✓ b got back exactly their deposit less their charge
- ✓ c got back exactly their deposit less their charge
- ✓ d got back exactly their deposit less their charge
- ✓ s got back exactly their deposit less their charge
- ✓ the syndicate ended fully refunded
- observed **result**: `{"winner":"a","price":0.048,"attributedWithin5pct":0,"of":5,"unattributedPriceInSettlement":0.048,"gasTGas":47.2,"wallMs":98099}`
- ✓ the highest-value bidder (a) won
- ✓ the winner paid their own shaded bid, 0.048
- ✓ no bidder's valuation is attributable within 5% from the public escrows or the winner's charge
- evidence FP: {"winner":"a","price":0.048,"attributedWithin5pct":0,"of":5,"unattributedPriceInSettlement":0.048,"gasTGas":47.2,"wallMs":98099,"settleTx":"GdrFG8bYUmvVkTikjnFrS1pe3431yQv2JYGM6Pa6FXy"}

### MIDGE · sealed second-price, Vickrey (true-value bids): common deposit, the Roost runs the auction, the contract charges each member their own amount

- ✓ hatch auc-mw61ja4w-sp
- ✓ a deposits 0.07
- ✓ b deposits 0.07
- ✓ c deposits 0.07
- ✓ d deposits 0.07
- ✓ s deposits 0.07
- ✓ the public escrows are all equal, so they attribute no valuation to any named bidder
- observed **sealed second-price, Vickrey (true-value bids): what the Roost computed (and will publish by settling)**: `{"format":"second-price","lotUnits":1,"reserve":"0.01","sold":true,"bidsReceived":5,"bidsEligible":5,"excludedFlyers":[],"clearingPrice":"0.…`
- evidence tx: {"label":"settle_batch_charged auc-mw61ja4w-sp","hash":"EWTUfReVXaKhiRm6akLLjr8R6UEMSGyHe8SD9w8t6fhS","ok":true,"explorer":"https://testnet.nearblocks.io/txns/EWTUfReVXaKhiRm6akLLjr8R6UEMSGyHe8SD9w8t6fhS","error":null}
- ✓ settle_batch_charged succeeded
- ✓ the seller received exactly the proceeds, 0.055 NEAR
- ✓ a's escrow fell by exactly their own charge (0.055)
- ✓ b's escrow fell by exactly their own charge (0)
- ✓ c's escrow fell by exactly their own charge (0)
- ✓ d's escrow fell by exactly their own charge (0)
- ✓ s's escrow fell by exactly their own charge (0)
- ✓ a exits alone
- ✓ b exits alone
- ✓ c exits alone
- ✓ d exits alone
- ✓ s exits alone
- ✓ a got back exactly their deposit less their charge
- ✓ b got back exactly their deposit less their charge
- ✓ c got back exactly their deposit less their charge
- ✓ d got back exactly their deposit less their charge
- ✓ s got back exactly their deposit less their charge
- ✓ the syndicate ended fully refunded
- observed **result**: `{"winner":"a","price":0.055,"attributedWithin5pct":0,"of":5,"unattributedPriceInSettlement":0.055,"gasTGas":47.3,"wallMs":111157}`
- ✓ the highest-value bidder (a) won
- ✓ the winner paid the second-highest bid: the sniper's 0.055
- ✓ no bidder's valuation is attributable within 5% from the public escrows or the winner's charge
- evidence SP: {"winner":"a","price":0.055,"attributedWithin5pct":0,"of":5,"unattributedPriceInSettlement":0.055,"gasTGas":47.3,"wallMs":111157,"settleTx":"EWTUfReVXaKhiRm6akLLjr8R6UEMSGyHe8SD9w8t6fhS"}

### MIDGE · uniform-price: 100 units, sealed bids of (price, quantity), everyone filled pays one clearing price

- ✓ hatch auc-mw61ja4w-uni
- ✓ a deposits 0.07
- ✓ b deposits 0.07
- ✓ c deposits 0.07
- ✓ d deposits 0.07
- ✓ s deposits 0.07
- ✓ the public escrows are all equal, so they attribute no valuation to any named bidder
- observed **uniform-price, 100 units: what the Roost computed (and will publish by settling)**: `{"format":"uniform","lotUnits":100,"reserve":"0.0001","sold":true,"bidsReceived":5,"bidsEligible":5,"excludedFlyers":[],"clearingPrice":"0.0…`
- evidence tx: {"label":"settle_batch_charged auc-mw61ja4w-uni","hash":"EjdX3vqcrf5dnGQKbRtjCRaX5zRrNwaWrEezdMGC7kC5","ok":true,"explorer":"https://testnet.nearblocks.io/txns/EjdX3vqcrf5dnGQKbRtjCRaX5zRrNwaWrEezdMGC7kC5","error":null}
- ✓ settle_batch_charged succeeded
- ✓ the seller received exactly the proceeds, 0.07 NEAR
- ✓ a's escrow fell by exactly their own charge (0.028)
- ✓ b's escrow fell by exactly their own charge (0.0245)
- ✓ c's escrow fell by exactly their own charge (0)
- ✓ d's escrow fell by exactly their own charge (0)
- ✓ s's escrow fell by exactly their own charge (0.0175)
- ✓ a exits alone
- ✓ b exits alone
- ✓ c exits alone
- ✓ d exits alone
- ✓ s exits alone
- ✓ a got back exactly their deposit less their charge
- ✓ b got back exactly their deposit less their charge
- ✓ c got back exactly their deposit less their charge
- ✓ d got back exactly their deposit less their charge
- ✓ s got back exactly their deposit less their charge
- ✓ the syndicate ended fully refunded
- ✓ a got 40, s got 25, b got the last 35 of the 50 it asked for; c and d got nothing
- ✓ everyone filled paid the same clearing price, b's 0.0007 per unit (the marginal bid)
- ✓ the proceeds are exactly 100 units x 0.0007 = 0.07 NEAR
- evidence UNI: {"clearingPrice":0.0007,"proceeds":0.07,"unitsSold":100,"gasTGas":48.1,"wallMs":99822,"losersNamedOnChain":0,"settleTx":"EjdX3vqcrf5dnGQKbRtjCRaX5zRrNwaWrEezdMGC7kC5"}

### COMPROMISED ROOM · a room that signs charges it should not: the contract's limits, and the risk that remains

- ✓ hatch with a key we hold, standing in for a compromised room
- ✓ a deposits 0.05
- ✓ b deposits 0.05
- ✓ c deposits 0.05
- evidence tx: {"label":"OVERCHARGE settle_batch_charged: a charged 0.06 against a 0.05 deposit","hash":"EVNKtVmkAUdduVXwnodJmgLYD4VMFFUoH3i33PWxJ7mA","ok":false,"explorer":"https://testnet.nearblocks.io/txns/EVNKtVmkAUdduVXwnodJmgLYD4…
- ✓ a charge above the member's deposit is refused even with a valid signature
- evidence tx: {"label":"MISMATCH settle_batch_charged: charges 0.04 for a 0.05 payout","hash":"HCQcoiLgmjmW6929NTLE1Kp8LA3chTERTiNH4v9RV1cD","ok":false,"explorer":"https://testnet.nearblocks.io/txns/HCQcoiLgmjmW6929NTLE1Kp8LA3chTERTiN…
- ✓ charges that do not sum to the payout are refused
- evidence tx: {"label":"OLD-FORMAT settle_batch_charged: an ordinary settlement signature on the charged entry point","hash":"3LgBPLKt3x4Z9T6mGWUBbZcYCd46YBTqRrRrFHxTMQ4J","ok":false,"explorer":"https://testnet.nearblocks.io/txns/3LgB…
- ✓ an ordinary-format signature cannot authorise a charged settlement
- ✓ nothing moved: the escrow is intact after all three
- evidence tx: {"label":"RESIDUAL-RISK settle_batch_charged: b charged their whole 0.05 for a payout b never bid on","hash":"5d3cPH1SgxpaGWd2VDM7q4gapmHaKJY53YFv1R1bNg2o","ok":true,"explorer":"https://testnet.nearblocks.io/txns/5d3cPH1…
- ✓ RESIDUAL RISK, measured: a compromised room CAN charge one member their entire deposit, within the policy (the seller is allowed) and within their escrow. Per-member charges cap the harm at that member's deposit; they do not remove it
- ✓ b was charged everything; a and c lost nothing
- ✓ a exits alone with the full 0.05
- ✓ c exits alone with the full 0.05

### the comparison, read from the measurements above

- observed **results**: `{"PUB":{"winner":"s","highestValueBidder":"a","price":0.050492,"attributedWithin5pct":3,"of":5,"bidsOnChain":20,"gasTGas":52.3,"wallMs":4226…`
- ✓ every path was measured
- observed **gas, TGas for the whole auction (all bidders, settlement and exits): public / first-price / second-price / uniform**: `[52.3,47.2,47.3,48.1]`
- observed **wall time (ms): public / first-price / second-price / uniform**: `[422606,98099,111157,99822]`
- observed **gas, Midge first-price over public (the investing comparison had Midge ~10x a direct payment; an open auction needs many bids, so the gap closes or reverses)**: `0.9`
- ✓ the gas of every path was read from receipts and is positive
- evidence comparison: {"PUB":{"winner":"s","highestValueBidder":"a","price":0.050492,"attributedWithin5pct":3,"of":5,"bidsOnChain":20,"gasTGas":52.3,"wallMs":422606,"sniped":true,"blocksBeforeEnd":4,"sniperOpportunity":true},"FP":{"winner":"a…

### teardown: delete the baseline contract, prune the syndicates, delete the accounts

- observed **baseline contract account**: `deleted, balance returned to the master`
- observed **teardown**: `{"pruned":4,"notPruned":[],"deleted":6,"kept":[],"failed":[]}`
- ✓ every account was deleted and every syndicate pruned
- ✓ the contract holds the records it started with

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
