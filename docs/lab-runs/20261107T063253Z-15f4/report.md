# Lab run 20261107T063253Z-15f4

- **Code:** `423b600fe8b0ec120327e1732cbd962f9322fb7e` on `master` (**13 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `8a0180ff698c44b5…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 173 events, hash-chained; root `d772a508d5c3b7ff7f90949e60a484097e12ad7593cb841d1feb61d026e0ad38`. Verify with `node lab/verify-run.js lab/runs/20261107T063253Z-15f4`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-CMP-AUCTION-01 Auctions on testnet: a public open auction against sealed first-price, sealed second-price and uniform-price run by the Roost | testnet | **FAIL** | 8 | 127 (2 failed) |  |

## E-CMP-AUCTION-01: Auctions on testnet: a public open auction against sealed first-price, sealed second-price and uniform-price run by the Roost

**Hypothesis.** Five bidders value one lot at 0.060, 0.045, 0.030, 0.020 and 0.055 NEAR (the last is a sniper who can watch the chain). In a public open auction an observer can attribute a valuation, within 5%, to most bidders from public bids, and the sniper, bidding in the last blocks over a bid the highest-value bidder cannot answer, takes the lot from the highest-value bidder. In Midge, with everyone depositing the same amount, an observer attributes no valuation to any named bidder, the highest-value bidder wins, losers are refunded exactly, the winner pays exactly the charge the Roost computed, and a Roost that tries to charge a member more than their deposit, charge a total that is not the payout, or reuse an ordinary settlement signature is refused by the contract. A uniform-price run charges every filled bid one price. Fails if any of that does not hold. Also measured: revenue, gas and time, and the residual risk of per-member charges (a compromised room can charge a member up to their whole deposit).

**What this does not prove**
- One operator controls every account. The bidders are scripted: honest bidders raise by 10% up to their value (public) or bid truthfully (second-price) or at 80% of value (first-price, the textbook equilibrium shade for five bidders); only the sniper is adversarial. This shows what the mechanisms do against these strategies, not what real bidders would do, and one scripted instance is not a statistical comparison of revenue.
- The public baseline is our own minimal open (English) auction contract, the common on-chain pattern. It is not Uniswap's or anyone else's contract. There is no public uniform-price baseline: the uniform-price run is Midge only, checked against its own rule.
- The Roost is a local HostedRoost with a simulated attestation provider (the hardware room is E-COMBINED-LIVE-01); the Roost image on Phala does not yet contain the auction code.
- Sealed bids are not authenticated to an account (GAP-023); every bidder here is honest about who they are.
- Deposits are public. They hide bids only because everyone deposits the same 0.07 NEAR. Losers recover their deposit only after the exit timer.
- The sniper's success depends on timing against ~1 s blocks and is recorded, not guaranteed.

| Step | Result | Assertions | Time |
|---|---|---|---|
| set up: five bidders, a seller, and the public auction contract deployed fresh | ✓ pass | 2/2 | 19574 ms |
| PUBLIC · an open auction: honest bidders raise by 10% up to their value, then the sniper watches the chain and bids at the end | ✗ fail | 23/25 | 421378 ms |
| MIDGE · sealed first-price (bids at 80% of value): common deposit, the Roost runs the auction, the contract charges each member their own amount | ✓ pass | 28/28 | 49158 ms |
| MIDGE · sealed second-price, Vickrey (true-value bids): common deposit, the Roost runs the auction, the contract charges each member their own amount | ✓ pass | 28/28 | 74279 ms |
| MIDGE · uniform-price: 100 units, sealed bids of (price, quantity), everyone filled pays one clearing price | ✓ pass | 28/28 | 138394 ms |
| COMPROMISED ROOM · a room that signs charges it should not: the contract's limits, and the risk that remains | ✓ pass | 12/12 | 35073 ms |
| the comparison, read from the measurements above | ✓ pass | 2/2 | 1 ms |
| teardown: delete the baseline contract, prune the syndicates, delete the accounts | ✓ pass | 2/2 | 64385 ms |

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
- observed **measured: block time (ms), mean bid latency (blocks), the sniper sends this many blocks before the end**: `{"blockMs":577,"latencyBlocks":25,"lead":28}`
- ✓ the auction closed and paid the seller
- observed **result**: `{"winner":"a","highestValueBidder":"a","price":0.049501,"attributedWithin5pct":3,"of":5,"bidsOnChain":19,"gasTGas":49.8,"wallMs":421376,"sni…`
- ✓ prediction: an observer can attribute a valuation within 5% to most of the five bidders from the public bids alone (at least 3)
- ✗ prediction: the sniper, bidding timed to land just before the end, over a bid nobody had time to answer, won the lot — expected , got {"winner":"a","highestValueBidder":"a","price":0.049501,"attributedWithin5pct":3,"of":5,"bidsOnChain":19,"gasTGas":49.8,"wallMs":421376,"sniped":false,"blocksBe…
- ✗ so the lot went to a bidder who values it less than the highest-value bidder (0.055 against 0.060) — expected , got 
- evidence PUBLIC: {"winner":"a","highestValueBidder":"a","price":0.049501,"attributedWithin5pct":3,"of":5,"bidsOnChain":19,"gasTGas":49.8,"wallMs":421376,"sniped":false,"blocksBeforeEnd":-13,"bidTxs":["AyFtvLYEGi2ukyubnzYumYVsiddGT7eEshe6…

### MIDGE · sealed first-price (bids at 80% of value): common deposit, the Roost runs the auction, the contract charges each member their own amount

- ✓ hatch auc-mw6114js-fp
- ✓ a deposits 0.07
- ✓ b deposits 0.07
- ✓ c deposits 0.07
- ✓ d deposits 0.07
- ✓ s deposits 0.07
- ✓ the public escrows are all equal, so they attribute no valuation to any named bidder
- observed **sealed first-price (bids at 80% of value): what the Roost computed (and will publish by settling)**: `{"format":"first-price","lotUnits":1,"reserve":"0.01","sold":true,"bidsReceived":5,"bidsEligible":5,"excludedFlyers":[],"clearingPrice":"0.0…`
- evidence tx: {"label":"settle_batch_charged auc-mw6114js-fp","hash":"2Gr24eLSHWGdD9o4gYYPF3wpMvKrRturLrNoPrPHpeqK","ok":true,"explorer":"https://testnet.nearblocks.io/txns/2Gr24eLSHWGdD9o4gYYPF3wpMvKrRturLrNoPrPHpeqK","error":null}
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
- observed **result**: `{"winner":"a","price":0.048,"attributedWithin5pct":0,"of":5,"unattributedPriceInSettlement":0.048,"gasTGas":47.2,"wallMs":49131}`
- ✓ the highest-value bidder (a) won
- ✓ the winner paid their own shaded bid, 0.048
- ✓ no bidder's valuation is attributable within 5% from the public escrows or the winner's charge
- evidence FP: {"winner":"a","price":0.048,"attributedWithin5pct":0,"of":5,"unattributedPriceInSettlement":0.048,"gasTGas":47.2,"wallMs":49131,"settleTx":"2Gr24eLSHWGdD9o4gYYPF3wpMvKrRturLrNoPrPHpeqK"}

### MIDGE · sealed second-price, Vickrey (true-value bids): common deposit, the Roost runs the auction, the contract charges each member their own amount

- ✓ hatch auc-mw6114js-sp
- ✓ a deposits 0.07
- ✓ b deposits 0.07
- ✓ c deposits 0.07
- ✓ d deposits 0.07
- ✓ s deposits 0.07
- ✓ the public escrows are all equal, so they attribute no valuation to any named bidder
- observed **sealed second-price, Vickrey (true-value bids): what the Roost computed (and will publish by settling)**: `{"format":"second-price","lotUnits":1,"reserve":"0.01","sold":true,"bidsReceived":5,"bidsEligible":5,"excludedFlyers":[],"clearingPrice":"0.…`
- evidence tx: {"label":"settle_batch_charged auc-mw6114js-sp","hash":"6WNWW6ZLoupFSVBxdLBXUoWFhvCvs5GbkJJqRmN6Kp6o","ok":true,"explorer":"https://testnet.nearblocks.io/txns/6WNWW6ZLoupFSVBxdLBXUoWFhvCvs5GbkJJqRmN6Kp6o","error":null}
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
- observed **result**: `{"winner":"a","price":0.055,"attributedWithin5pct":0,"of":5,"unattributedPriceInSettlement":0.055,"gasTGas":47.3,"wallMs":74278}`
- ✓ the highest-value bidder (a) won
- ✓ the winner paid the second-highest bid: the sniper's 0.055
- ✓ no bidder's valuation is attributable within 5% from the public escrows or the winner's charge
- evidence SP: {"winner":"a","price":0.055,"attributedWithin5pct":0,"of":5,"unattributedPriceInSettlement":0.055,"gasTGas":47.3,"wallMs":74278,"settleTx":"6WNWW6ZLoupFSVBxdLBXUoWFhvCvs5GbkJJqRmN6Kp6o"}

### MIDGE · uniform-price: 100 units, sealed bids of (price, quantity), everyone filled pays one clearing price

- ✓ hatch auc-mw6114js-uni
- ✓ a deposits 0.07
- ✓ b deposits 0.07
- ✓ c deposits 0.07
- ✓ d deposits 0.07
- ✓ s deposits 0.07
- ✓ the public escrows are all equal, so they attribute no valuation to any named bidder
- observed **uniform-price, 100 units: what the Roost computed (and will publish by settling)**: `{"format":"uniform","lotUnits":100,"reserve":"0.0001","sold":true,"bidsReceived":5,"bidsEligible":5,"excludedFlyers":[],"clearingPrice":"0.0…`
- evidence tx: {"label":"settle_batch_charged auc-mw6114js-uni","hash":"3We1DQQMMd8ucbjftrmtDW68oDEJ3HdDt9YXS8znSw8X","ok":true,"explorer":"https://testnet.nearblocks.io/txns/3We1DQQMMd8ucbjftrmtDW68oDEJ3HdDt9YXS8znSw8X","error":null}
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
- evidence UNI: {"clearingPrice":0.0007,"proceeds":0.07,"unitsSold":100,"gasTGas":48.1,"wallMs":138393,"losersNamedOnChain":0,"settleTx":"3We1DQQMMd8ucbjftrmtDW68oDEJ3HdDt9YXS8znSw8X"}

### COMPROMISED ROOM · a room that signs charges it should not: the contract's limits, and the risk that remains

- ✓ hatch with a key we hold, standing in for a compromised room
- ✓ a deposits 0.05
- ✓ b deposits 0.05
- ✓ c deposits 0.05
- evidence tx: {"label":"OVERCHARGE settle_batch_charged: a charged 0.06 against a 0.05 deposit","hash":"AAkeLhhNer4c8KMSEVfamstFEkYijjtDegqkLBTYi4qx","ok":false,"explorer":"https://testnet.nearblocks.io/txns/AAkeLhhNer4c8KMSEVfamstFEk…
- ✓ a charge above the member's deposit is refused even with a valid signature
- evidence tx: {"label":"MISMATCH settle_batch_charged: charges 0.04 for a 0.05 payout","hash":"8zEHs3fYyrXCjeGriSgMyPMu7zjpacrJw8mEwfmntPFQ","ok":false,"explorer":"https://testnet.nearblocks.io/txns/8zEHs3fYyrXCjeGriSgMyPMu7zjpacrJw8m…
- ✓ charges that do not sum to the payout are refused
- evidence tx: {"label":"OLD-FORMAT settle_batch_charged: an ordinary settlement signature on the charged entry point","hash":"3SddJoihVhJNTkvDZJTYNSk8ZTFX41cfbBJRoq1ywiVb","ok":false,"explorer":"https://testnet.nearblocks.io/txns/3Sdd…
- ✓ an ordinary-format signature cannot authorise a charged settlement
- ✓ nothing moved: the escrow is intact after all three
- evidence tx: {"label":"RESIDUAL-RISK settle_batch_charged: b charged their whole 0.05 for a payout b never bid on","hash":"CYuUkZo8XhZWJ7fqWzAFeBuJhFUFsc95hFM8AbFsot5d","ok":true,"explorer":"https://testnet.nearblocks.io/txns/CYuUkZo…
- ✓ RESIDUAL RISK, measured: a compromised room CAN charge one member their entire deposit, within the policy (the seller is allowed) and within their escrow. Per-member charges cap the harm at that member's deposit; they do not remove it
- ✓ b was charged everything; a and c lost nothing
- ✓ a exits alone with the full 0.05
- ✓ c exits alone with the full 0.05

### the comparison, read from the measurements above

- observed **results**: `{"PUB":{"winner":"a","highestValueBidder":"a","price":0.049501,"attributedWithin5pct":3,"of":5,"bidsOnChain":19,"gasTGas":49.8,"wallMs":4213…`
- ✓ every path was measured
- observed **gas, TGas for the whole auction (all bidders, settlement and exits): public / first-price / second-price / uniform**: `[49.8,47.2,47.3,48.1]`
- observed **wall time (ms): public / first-price / second-price / uniform**: `[421376,49131,74278,138393]`
- observed **gas, Midge first-price over public (the investing comparison had Midge ~10x a direct payment; an open auction needs many bids, so the gap closes or reverses)**: `0.95`
- ✓ the gas of every path was read from receipts and is positive
- evidence comparison: {"PUB":{"winner":"a","highestValueBidder":"a","price":0.049501,"attributedWithin5pct":3,"of":5,"bidsOnChain":19,"gasTGas":49.8,"wallMs":421376,"sniped":false,"blocksBeforeEnd":-13},"FP":{"winner":"a","price":0.048,"attri…

### teardown: delete the baseline contract, prune the syndicates, delete the accounts

- observed **baseline contract account**: `deleted, balance returned to the master`
- observed **teardown**: `{"pruned":4,"notPruned":[],"deleted":6,"kept":[],"failed":[]}`
- ✓ every account was deleted and every syndicate pruned
- ✓ the contract holds the records it started with

## Problems found

| Severity | Where | Problem |
|---|---|---|
| major | E-CMP-AUCTION-01 / PUBLIC · an open auction: honest bidders raise by 10% up to their value, then the sniper watches the chain and bids at the end | assertion failed: prediction: the sniper, bidding timed to land just before the end, over a bid nobody had time to answer, won the lot — {"actual":{"winner":"a","highestValueBidder":"a","price":0.049501,"attributedWithin5pct":3,"of":5,"bidsOnChain":19,"gasTGas":49.8,"wallMs":421376,"sniped":false,"blocksBeforeEnd":-13}} |
| major | E-CMP-AUCTION-01 / PUBLIC · an open auction: honest bidders raise by 10% up to their value, then the sniper watches the chain and bids at the end | assertion failed: so the lot went to a bidder who values it less than the highest-value bidder (0.055 against 0.060) — {} |
