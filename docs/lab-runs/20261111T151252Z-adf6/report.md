# Lab run 20261111T151252Z-adf6

- **Code:** `e2674424263c429aa5dfac37e93cf7750d6a51c5` on `completeness` (**3 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `73f42e651241e148…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 658 events, hash-chained; root `b6e68afee443e5a8d26c8835861ee8675305d2fdfb2178e1908705b41300084f`. Verify with `node lab/verify-run.js lab/runs/20261111T151252Z-adf6`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-CMP-INVEST-01 Investing together on testnet: a public round, a trusted organizer and Midge, same chain and same members | testnet | **FAIL** | 9 | 36 (3 failed) |  |
| E-CMP-AUCTION-01 Auctions on testnet: a public open auction against sealed first-price, sealed second-price and uniform-price run by the Roost | testnet | **PASS** | 8 | 127 |  |
| E-CMP-INVEST-02 Investing together, each backer funding their own amount: per-member charges against equal shares, same backers, same run | testnet | **PASS** | 5 | 40 |  |
| E-CMP-QUOTE-01 Lending quotes on testnet: an open reverse-quote round against sealed first-price and second-price rounds run by the host | testnet | **FAIL** | 7 | 3 |  |
| E-CMP-CROSS-01 Block trade on testnet: an open order book against a sealed cross run by the host, same pro-rata rule | testnet | **FAIL** | 6 | 3 |  |
| E-CMP-VOTE-01 Voting on testnet: an open poll and a 3-of-5 multisig against a sealed ballot counted by the host | testnet | **PASS** | 8 | 68 |  |
| E-CMP-PAYROLL-01 Payroll on testnet: a public pay run with reused addresses against a sealed pay run with one-time addresses and signed receipts, two months | testnet | **PASS** | 8 | 41 |  |
| E-CMP-RFQ-01 Two-sided RFQ on testnet: an open RFQ where the taker's side is public against a sealed RFQ where makers quote both ways and never see it | testnet | **PASS** | 10 | 73 |  |

## E-CMP-INVEST-01: Investing together on testnet: a public round, a trusted organizer and Midge, same chain and same members

**Hypothesis.** Four backers invest private amounts (0.01, 0.02, 0.03, 0.04 NEAR) into one recipient. Public: an observer reading only public chain data recovers every amount. Organizer: the same, and the organizer can take the pot while members cannot get it back. Midge with deposits equal to bids: the observer also recovers every amount, because deposits are public. Midge with a common deposit: the observer recovers none, no one can take the pot or pay outside the policy, and each member recovers their own remainder alone. Fails if an observer recovers any individual bid from the common-deposit round, if any theft attempt under Midge succeeds, or if a member cannot recover their remainder. Also measured: gas, wall time, and who funds a payout (the contract deducts it pro-rata by deposit).

**What this does not prove**
- One operator controls every account in every path (four backers, an organizer, a recipient, the coordinator). This shows behaviour, not independent users.
- The Roost here is a local HostedRoost with a simulated attestation provider; the hardware room is E-HOSTED-LIVE-01 and E-COMBINED-LIVE-01. Speed under Midge therefore excludes the machine start-up and attestation (about a minute on Phala).
- The "public" path is plain transfers to the recipient: there is no shared pool contract. It is the simplest honest baseline, not the strongest public design (a commit-reveal contract would leak less).
- The observer reads only public chain data (the receipts of the transactions an explorer would list for the target account, and the contract's public views). It does not model an attacker who also controls the Roost or sees network traffic.
- Amounts are tiny testnet NEAR. The gas figures are gas burnt, read from receipts, not a price.
- Not run here: other privacy systems (compared from their documentation), a multisig baseline, shared AI compute.

| Step | Result | Assertions | Time |
|---|---|---|---|
| set up: four backers, a recipient and an organizer, fresh accounts | ✓ pass | 1/1 | 14940 ms |
| P · public: each backer pays the recipient directly; an observer reads the public receipts | ✓ pass | 1/1 | 10025 ms |
| O · organizer: backers pay one account, the organizer forwards the total; the observer reads the public receipts | ✓ pass | 2/2 | 12257 ms |
| O · theft and vanish: members cannot get the pot back, the organizer can take it | ✓ pass | 3/3 | 10973 ms |
| M-naive · Midge, each backer deposits exactly their bid: the observer reads the public escrows | ✓ pass | 8/8 | 14122 ms |
| M-common · Midge, everyone deposits 0.05 and bids inside it: what the observer reads, then theft attempts, then settlement | ✗ fail | 11/11 | 13637 ms |
| M-common · the room is gone: each member exits alone with their remainder; who funded the payout | ✗ fail | 5/7 | 15211 ms |
| the comparison, read from the measurements above | ✗ fail | 0/1 | 0 ms |
| teardown: prune the syndicates, compact, delete the accounts | ✓ pass | 2/2 | 34157 ms |

### set up: four backers, a recipient and an organizer, fresh accounts

- ✓ six accounts exist

### P · public: each backer pays the recipient directly; an observer reads the public receipts

- observed **what the observer read**: `{"i9d8k7a.fly-1793636729.testnet":"0.01","i9d8k7b.fly-1793636729.testnet":"0.02","i9d8k7c.fly-1793636729.testnet":"0.03","i9d8k7d.fly-179363…`
- ✓ prediction 1: the observer recovers all four amounts from the public transfers
- evidence P: {"txs":["3vN1ks7Yc82qp8UKHUoDSiaeXfH8gtT8nvnF8BRekBPQ","GMXVqkuJr3wrrKtwVAg9dWAQVqztqa7RQ9LZaoQmQohp","8p1ji4fEPnqv5eNqor44sRPxMVAJBkHy4wjaiowGyjWy","GaUJ8V8jNxkYguTXjtUGp9XTC8QCEwJH5qXSBhD7qrd"],"recovered":4,"of":4,"ga…

### O · organizer: backers pay one account, the organizer forwards the total; the observer reads the public receipts

- ✓ prediction 2: the observer recovers all four amounts sent to the organizer
- ✓ the organizer forwarded exactly 0.10 to the recipient
- evidence O: {"txs":["9RYC5icpKGoMXgrZpyPUYFWXMtcaGCR8Lw6Vb4oX6dQx","ARn5AbF7picMZrdAWGze2fAERmUYvtxjHm1z7efWY66Y","EqSN6Y9mkLwC3XNTVja7BTg18x2r8jtBwrX5Ea8mWHPh","24WkUqis4cMGdJBkfgjYKPMKJxDhDUt6wwAqG5kcDHnh"],"forward":"Fbhw1dCKY9BZ…

### O · theft and vanish: members cannot get the pot back, the organizer can take it

- ✓ prediction 6 (organizer): a backer cannot pull money out of the organizer's account
- ✓ the organizer's balance is unchanged by the failed attempt
- ✓ prediction 5 (organizer): the organizer can send the 0.04 pot to an account of its own choosing; nothing stops it

### M-naive · Midge, each backer deposits exactly their bid: the observer reads the public escrows

- ✓ hatch
- ✓ a deposits 0.01
- ✓ b deposits 0.02
- ✓ c deposits 0.03
- ✓ d deposits 0.04
- ✓ settle_batch succeeded
- ✓ the recipient received exactly 0.10
- ✓ prediction 3: with deposits equal to bids, the observer recovers all four bids from the public escrows, sealing adds nothing
- evidence M-naive: {"syndicate":"cmp-mwc9d8k7-n","settle":"HfoUvPD5rmNei8aWjxAomuLYVjtosH9DhtYzrB2LtBye","recovered":4,"of":4,"gasTGas":18.9,"perMemberTGas":4.7,"wallMs":14120}

### M-common · Midge, everyone deposits 0.05 and bids inside it: what the observer reads, then theft attempts, then settlement

- ✓ hatch
- ✓ a deposits 0.05
- ✓ b deposits 0.05
- ✓ c deposits 0.05
- ✓ d deposits 0.05
- observed **what the observer reads: every escrow**: `{"i9d8k7a.fly-1793636729.testnet":"0.05","i9d8k7b.fly-1793636729.testnet":"0.05","i9d8k7c.fly-1793636729.testnet":"0.05","i9d8k7d.fly-179363…`
- ✓ every escrow is the same, so the escrows say nothing about who bid what
- ✓ prediction 4: the observer's best guess (the common deposit, or the total divided by four) matches none of the four bids
- ✓ the Roost totals the sealed bids to exactly 0.10 although 0.20 is deposited
- ✓ prediction 5 (Roost): asked to pay the whole 0.20 deposit against a 0.10 sealed total, the Roost refuses to sign
- evidence tx: {"label":"OUTSIDE-POLICY settle cmp-mwc9d8k7-c","hash":"pqPCEjZkybthRiyGy8bwQM543YgrxbrEnyQKWDiXHvc","ok":false,"explorer":"https://testnet.nearblocks.io/txns/pqPCEjZkybthRiyGy8bwQM543YgrxbrEnyQKWDiXHvc","error":"Smart c…
- ✓ prediction 5 (contract): a validly signed payout to an account outside the policy is refused
- ✓ the escrow is intact after the attempt

### M-common · the room is gone: each member exits alone with their remainder; who funded the payout

- ✓ a exits alone
- evidence tx: {"label":"exit cmp-mwc9d8k7-c as a","hash":"9H3DyrFuByDgrVNR1aydj4yw3ATmKFCxFUNv453RgsD6","ok":true,"explorer":"https://testnet.nearblocks.io/txns/9H3DyrFuByDgrVNR1aydj4yw3ATmKFCxFUNv453RgsD6"}
- ✓ b exits alone
- evidence tx: {"label":"exit cmp-mwc9d8k7-c as b","hash":"EED98hugZJCbKndenBi4YDivBADCbLRF2MnJda5XWaoa","ok":true,"explorer":"https://testnet.nearblocks.io/txns/EED98hugZJCbKndenBi4YDivBADCbLRF2MnJda5XWaoa"}
- ✓ c exits alone
- evidence tx: {"label":"exit cmp-mwc9d8k7-c as c","hash":"3w97whA9vMdqBgUwcx9EYMsgjkgv5VnUjbtk3TdrdrEj","ok":true,"explorer":"https://testnet.nearblocks.io/txns/3w97whA9vMdqBgUwcx9EYMsgjkgv5VnUjbtk3TdrdrEj"}
- ✓ d exits alone
- evidence tx: {"label":"exit cmp-mwc9d8k7-c as d","hash":"HAwng4LGJ2aJGX8gPWPniHWY9oaCkX7fx2DVh2XGGqhP","ok":true,"explorer":"https://testnet.nearblocks.io/txns/HAwng4LGJ2aJGX8gPWPniHWY9oaCkX7fx2DVh2XGGqhP"}
- observed **what each member got back at exit (deposit 0.05 each)**: `{"a":"0.05","b":"0.05","c":"0.05","d":"0.05"}`
- ✗ prediction 6 (Midge): every member recovered a remainder alone, 0.10 in all — expected , got {"a":"0.05","b":"0.05","c":"0.05","d":"0.05"}
- observed **what each member effectively paid toward the 0.10 payout**: `{"a":"0 (their bid was 0.01)","b":"0 (their bid was 0.02)","c":"0 (their bid was 0.03)","d":"0 (their bid was 0.04)"}`
- ✗ prediction 9: the payout was funded equally (0.025 each) whatever each member bid, so a member who bid 0.01 paid 0.025 and one who bid 0.04 paid 0.025 — expected , got {"a":"0n","b":"0n","c":"0n","d":"0n"}
- ✓ the syndicate ended fully refunded with nothing left

### the comparison, read from the measurements above

- observed **results**: `{"P":{"recovered":4,"of":4,"gasTGas":1.8,"perMemberTGas":0.4,"wallMs":9191},"O":{"recovered":4,"of":4,"gasTGas":2.2,"perMemberTGas":0.6,"wal…`
- ✗ every path was measured — expected , got 

### teardown: prune the syndicates, compact, delete the accounts

- observed **teardown**: `{"pruned":2,"notPruned":[],"deleted":6,"kept":[],"failed":[]}`
- ✓ every account was deleted and every syndicate pruned
- ✓ the contract holds the records it started with

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
| set up: five bidders, a seller, and the public auction contract deployed fresh | ✓ pass | 2/2 | 20367 ms |
| PUBLIC · an open auction: honest bidders raise by 10% up to their value, then the sniper watches the chain and bids at the end | ✓ pass | 25/25 | 412310 ms |
| MIDGE · sealed first-price (bids at 80% of value): common deposit, the Roost runs the auction, the contract charges each member their own amount | ✓ pass | 28/28 | 35818 ms |
| MIDGE · sealed second-price, Vickrey (true-value bids): common deposit, the Roost runs the auction, the contract charges each member their own amount | ✓ pass | 28/28 | 36708 ms |
| MIDGE · uniform-price: 100 units, sealed bids of (price, quantity), everyone filled pays one clearing price | ✓ pass | 28/28 | 35234 ms |
| COMPROMISED ROOM · a room that signs charges it should not: the contract's limits, and the risk that remains | ✓ pass | 12/12 | 24449 ms |
| the comparison, read from the measurements above | ✓ pass | 2/2 | 0 ms |
| teardown: delete the baseline contract, prune the syndicates, delete the accounts | ✓ pass | 2/2 | 41851 ms |

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
- observed **measured: block time (ms), mean bid latency (blocks), the sniper sends this many blocks before the end**: `{"blockMs":585,"latencyBlocks":5,"lead":8}`
- ✓ the auction closed and paid the seller
- observed **result**: `{"winner":"s","highestValueBidder":"a","price":0.050492,"attributedWithin5pct":3,"of":5,"bidsOnChain":20,"gasTGas":52.2,"wallMs":412308,"sni…`
- ✓ prediction: an observer can attribute a valuation within 5% to most of the five bidders from the public bids alone (at least 3)
- ✓ the public state alone gave the sniper a winning bid: the leader's bid raised by 2% was within the sniper's value (0.055), and the sniper values the lot below the highest-value bidder (0.060)
- observed **the sniper's bid**: `landed before the end`
- ✓ either the sniper's bid landed in time and took the lot from the highest-value bidder, or it landed late and the contract refused it and the highest-value bidder kept the lot
- evidence PUBLIC: {"winner":"s","highestValueBidder":"a","price":0.050492,"attributedWithin5pct":3,"of":5,"bidsOnChain":20,"gasTGas":52.2,"wallMs":412308,"sniped":true,"blocksBeforeEnd":2,"sniperOpportunity":true,"bidTxs":["6UTX2H9rpFpTV7…

### MIDGE · sealed first-price (bids at 80% of value): common deposit, the Roost runs the auction, the contract charges each member their own amount

- ✓ hatch auc-mwc9fx9k-fp
- ✓ a deposits 0.07
- ✓ b deposits 0.07
- ✓ c deposits 0.07
- ✓ d deposits 0.07
- ✓ s deposits 0.07
- ✓ the public escrows are all equal, so they attribute no valuation to any named bidder
- observed **sealed first-price (bids at 80% of value): what the Roost computed (and will publish by settling)**: `{"format":"first-price","lotUnits":1,"reserve":"0.01","sold":true,"bidsReceived":5,"bidsEligible":5,"excludedFlyers":[],"clearingPrice":"0.0…`
- evidence tx: {"label":"settle_batch_charged auc-mwc9fx9k-fp","hash":"BdkAZNHchys6Jgw64vT8jdkYitEZfKUtEyXwQwGoX4mH","ok":true,"explorer":"https://testnet.nearblocks.io/txns/BdkAZNHchys6Jgw64vT8jdkYitEZfKUtEyXwQwGoX4mH","error":null}
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
- observed **result**: `{"winner":"a","price":0.048,"attributedWithin5pct":0,"of":5,"unattributedPriceInSettlement":0.048,"gasTGas":53,"wallMs":35816}`
- ✓ the highest-value bidder (a) won
- ✓ the winner paid their own shaded bid, 0.048
- ✓ no bidder's valuation is attributable within 5% from the public escrows or the winner's charge
- evidence FP: {"winner":"a","price":0.048,"attributedWithin5pct":0,"of":5,"unattributedPriceInSettlement":0.048,"gasTGas":53,"wallMs":35816,"settleTx":"BdkAZNHchys6Jgw64vT8jdkYitEZfKUtEyXwQwGoX4mH"}

### MIDGE · sealed second-price, Vickrey (true-value bids): common deposit, the Roost runs the auction, the contract charges each member their own amount

- ✓ hatch auc-mwc9fx9k-sp
- ✓ a deposits 0.07
- ✓ b deposits 0.07
- ✓ c deposits 0.07
- ✓ d deposits 0.07
- ✓ s deposits 0.07
- ✓ the public escrows are all equal, so they attribute no valuation to any named bidder
- observed **sealed second-price, Vickrey (true-value bids): what the Roost computed (and will publish by settling)**: `{"format":"second-price","lotUnits":1,"reserve":"0.01","sold":true,"bidsReceived":5,"bidsEligible":5,"excludedFlyers":[],"clearingPrice":"0.…`
- evidence tx: {"label":"settle_batch_charged auc-mwc9fx9k-sp","hash":"GBFnAE93RZaq6vDj59ou9Y25XFFpzvXqwDLPoa4US1Rm","ok":true,"explorer":"https://testnet.nearblocks.io/txns/GBFnAE93RZaq6vDj59ou9Y25XFFpzvXqwDLPoa4US1Rm","error":null}
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
- observed **result**: `{"winner":"a","price":0.055,"attributedWithin5pct":0,"of":5,"unattributedPriceInSettlement":0.055,"gasTGas":53.1,"wallMs":36706}`
- ✓ the highest-value bidder (a) won
- ✓ the winner paid the second-highest bid: the sniper's 0.055
- ✓ no bidder's valuation is attributable within 5% from the public escrows or the winner's charge
- evidence SP: {"winner":"a","price":0.055,"attributedWithin5pct":0,"of":5,"unattributedPriceInSettlement":0.055,"gasTGas":53.1,"wallMs":36706,"settleTx":"GBFnAE93RZaq6vDj59ou9Y25XFFpzvXqwDLPoa4US1Rm"}

### MIDGE · uniform-price: 100 units, sealed bids of (price, quantity), everyone filled pays one clearing price

- ✓ hatch auc-mwc9fx9k-uni
- ✓ a deposits 0.07
- ✓ b deposits 0.07
- ✓ c deposits 0.07
- ✓ d deposits 0.07
- ✓ s deposits 0.07
- ✓ the public escrows are all equal, so they attribute no valuation to any named bidder
- observed **uniform-price, 100 units: what the Roost computed (and will publish by settling)**: `{"format":"uniform","lotUnits":100,"reserve":"0.0001","sold":true,"bidsReceived":5,"bidsEligible":5,"excludedFlyers":[],"clearingPrice":"0.0…`
- evidence tx: {"label":"settle_batch_charged auc-mwc9fx9k-uni","hash":"9BwagAXejHUJs1fw4unkoiRsKz1M8zz9Cx7UtQUEXCiC","ok":true,"explorer":"https://testnet.nearblocks.io/txns/9BwagAXejHUJs1fw4unkoiRsKz1M8zz9Cx7UtQUEXCiC","error":null}
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
- evidence UNI: {"clearingPrice":0.0007,"proceeds":0.07,"unitsSold":100,"gasTGas":53.8,"wallMs":35233,"losersNamedOnChain":0,"settleTx":"9BwagAXejHUJs1fw4unkoiRsKz1M8zz9Cx7UtQUEXCiC"}

### COMPROMISED ROOM · a room that signs charges it should not: the contract's limits, and the risk that remains

- ✓ hatch with a key we hold, standing in for a compromised room
- ✓ a deposits 0.05
- ✓ b deposits 0.05
- ✓ c deposits 0.05
- evidence tx: {"label":"OVERCHARGE settle_batch_charged: a charged 0.06 against a 0.05 deposit","hash":"9MSZje7tYK8aYnWLXVjtw9ezANMwQtqEXXkgHEgi9FBZ","ok":false,"explorer":"https://testnet.nearblocks.io/txns/9MSZje7tYK8aYnWLXVjtw9ezAN…
- ✓ a charge above the member's deposit is refused even with a valid signature
- evidence tx: {"label":"MISMATCH settle_batch_charged: charges 0.04 for a 0.05 payout","hash":"zsqUk3KCxSFdpR6qaz6SbDMbFFfVi6cuM2L435qfvRC","ok":false,"explorer":"https://testnet.nearblocks.io/txns/zsqUk3KCxSFdpR6qaz6SbDMbFFfVi6cuM2L4…
- ✓ charges that do not sum to the payout are refused
- evidence tx: {"label":"OLD-FORMAT settle_batch_charged: an ordinary settlement signature on the charged entry point","hash":"28VEmc2WeDL9BRC1zs2S9h88eZdpYXvNgk8vroauk9yw","ok":false,"explorer":"https://testnet.nearblocks.io/txns/28VE…
- ✓ an ordinary-format signature cannot authorise a charged settlement
- ✓ nothing moved: the escrow is intact after all three
- evidence tx: {"label":"RESIDUAL-RISK settle_batch_charged: b charged their whole 0.05 for a payout b never bid on","hash":"GKKqPrxC2HLofjhLDozPovMzCvyGmnQyVr4PevJo5wAS","ok":true,"explorer":"https://testnet.nearblocks.io/txns/GKKqPrx…
- ✓ RESIDUAL RISK, measured: a compromised room CAN charge one member their entire deposit, within the policy (the seller is allowed) and within their escrow. Per-member charges cap the harm at that member's deposit; they do not remove it
- ✓ b was charged everything; a and c lost nothing
- ✓ a exits alone with the full 0.05
- ✓ c exits alone with the full 0.05

### the comparison, read from the measurements above

- observed **results**: `{"PUB":{"winner":"s","highestValueBidder":"a","price":0.050492,"attributedWithin5pct":3,"of":5,"bidsOnChain":20,"gasTGas":52.2,"wallMs":4123…`
- ✓ every path was measured
- observed **gas, TGas for the whole auction (all bidders, settlement and exits): public / first-price / second-price / uniform**: `[52.2,53,53.1,53.8]`
- observed **wall time (ms): public / first-price / second-price / uniform**: `[412308,35816,36706,35233]`
- observed **gas, Midge first-price over public (the investing comparison had Midge ~10x a direct payment; an open auction needs many bids, so the gap closes or reverses)**: `1.02`
- ✓ the gas of every path was read from receipts and is positive
- evidence comparison: {"PUB":{"winner":"s","highestValueBidder":"a","price":0.050492,"attributedWithin5pct":3,"of":5,"bidsOnChain":20,"gasTGas":52.2,"wallMs":412308,"sniped":true,"blocksBeforeEnd":2,"sniperOpportunity":true},"FP":{"winner":"a…

### teardown: delete the baseline contract, prune the syndicates, delete the accounts

- observed **baseline contract account**: `deleted, balance returned to the master`
- observed **teardown**: `{"pruned":4,"notPruned":[],"deleted":6,"kept":[],"failed":[]}`
- ✓ every account was deleted and every syndicate pruned
- ✓ the contract holds the records it started with

## E-CMP-INVEST-02: Investing together, each backer funding their own amount: per-member charges against equal shares, same backers, same run

**Hypothesis.** Predictions written first in docs/lab/USECASE_PLAN.md. Four backers put in 0.01, 0.02, 0.03 and 0.04 NEAR through the same room with a common 0.05 deposit. (1) With the pooled program and settle_batch_charged each backer's remainder at exit is exactly their deposit less their own amount (0.04, 0.03, 0.02, 0.01). (2) But the charges are arguments of the public settlement transaction, so an observer reading only that transaction recovers all four contributions. (3) With an ordinary equal-share settlement the same observer recovers none, and each backer bears 0.025 whatever they put in. (4) Before either round settles the escrows are all equal and say nothing. So for pooled investing, hiding the amounts and funding each backer fairly are not both available on this contract. Fails if the observer cannot recover the contributions from the charged settlement, if a remainder differs from deposit less contribution, or if the equal-share round leaks any amount.

**What this does not prove**
- One operator controls every account; the room is a local HostedRoost with a simulated attestation provider.
- The observer reads the settlement transaction's public arguments through an archival RPC, which is what an explorer shows. It does not model an attacker who also sees the room.
- Hiding the charges (the room signing per-member receipts that members claim against, or zero-knowledge proofs) is not built and not tested; it is named in the plan as a design option.
- Amounts are tiny testnet NEAR. Bids are not authenticated to an account (GAP-023).

| Step | Result | Assertions | Time |
|---|---|---|---|
| set up: four backers and a recipient | ✓ pass | 1/1 | 12671 ms |
| CHARGED · each backer funds their own amount (pooled program, settle_batch_charged) | ✓ pass | 18/18 | 31389 ms |
| EQUAL SHARES · the same backers, an ordinary settlement | ✓ pass | 18/18 | 30299 ms |
| the trade-off, read from the two rounds above | ✓ pass | 1/1 | 1 ms |
| teardown: prune the syndicates, compact, delete the accounts | ✓ pass | 2/2 | 28690 ms |

### set up: four backers and a recipient

- ✓ five accounts exist

### CHARGED · each backer funds their own amount (pooled program, settle_batch_charged)

- ✓ hatch inv2-mwc9sxfi-charged
- ✓ a deposits 0.05
- ✓ b deposits 0.05
- ✓ c deposits 0.05
- ✓ d deposits 0.05
- ✓ prediction 4: before settlement the escrows are all equal, so they say nothing about the amounts (0 of 4 recovered)
- observed **what the Roost computed**: `{"format":"pool","recipient":"w9sxfir.fly-1793636729.testnet","sold":true,"members":4,"total":"0.1","leftOut":[],"executionModel":"HOSTED_SE…`
- evidence tx: {"label":"settle_batch_charged inv2-mwc9sxfi-charged","hash":"3DfkucM8imdr9H2DruQYgPFyhxyaowuXWKzaUWBwSNkg","ok":true,"explorer":"https://testnet.nearblocks.io/txns/3DfkucM8imdr9H2DruQYgPFyhxyaowuXWKzaUWBwSNkg","error":n…
- ✓ the settlement succeeded
- ✓ the recipient received exactly 0.10
- ✓ a exits alone
- ✓ b exits alone
- ✓ c exits alone
- ✓ d exits alone
- ✓ the syndicate ended fully refunded
- observed **what the observer reads from the public settlement arguments**: `{"syndicate_id":"inv2-mwc9sxfi-charged","attestation_nonce":"6ee0c83361f08b8dd94f05c6fa8d61a66574c8b6deb2b0ea4dcbb64a0d65de55","aggregate_or…`
- ✓ prediction 2: from the settlement transaction alone an observer recovers all four contributions (4 of 4)
- ✓ prediction 1: a got back exactly their deposit less their own 0.01
- ✓ prediction 1: b got back exactly their deposit less their own 0.02
- ✓ prediction 1: c got back exactly their deposit less their own 0.03
- ✓ prediction 1: d got back exactly their deposit less their own 0.04
- evidence CHARGED: {"recovered":4,"of":4,"remainders":{"a":"0.04","b":"0.03","c":"0.02","d":"0.01"},"settleTx":"3DfkucM8imdr9H2DruQYgPFyhxyaowuXWKzaUWBwSNkg"}

### EQUAL SHARES · the same backers, an ordinary settlement

- ✓ hatch inv2-mwc9sxfi-equal
- ✓ a deposits 0.05
- ✓ b deposits 0.05
- ✓ c deposits 0.05
- ✓ d deposits 0.05
- ✓ prediction 4: before settlement the escrows are all equal, so they say nothing about the amounts (0 of 4 recovered)
- evidence tx: {"label":"settle_batch inv2-mwc9sxfi-equal","hash":"Chgo5eeS9DwYc5xT1aQysJp4o9qcc5ZpyjZhardBq57B","ok":true,"explorer":"https://testnet.nearblocks.io/txns/Chgo5eeS9DwYc5xT1aQysJp4o9qcc5ZpyjZhardBq57B","error":null}
- ✓ the settlement succeeded
- ✓ the recipient received exactly 0.10
- ✓ a exits alone
- ✓ b exits alone
- ✓ c exits alone
- ✓ d exits alone
- ✓ the syndicate ended fully refunded
- observed **what the observer reads from the public settlement arguments**: `{"syndicate_id":"inv2-mwc9sxfi-equal","attestation_nonce":"afe1eb0975e6a7ef13d2561a1639af73861e5590a57a785af88b10bb14573466","aggregate_orde…`
- ✓ prediction 3: from the settlement transaction alone an observer recovers none of the contributions (0 of 4)
- ✓ prediction 3: a bore exactly 0.025 whatever they put in (their own was 0.01)
- ✓ prediction 3: b bore exactly 0.025 whatever they put in (their own was 0.02)
- ✓ prediction 3: c bore exactly 0.025 whatever they put in (their own was 0.03)
- ✓ prediction 3: d bore exactly 0.025 whatever they put in (their own was 0.04)
- evidence EQUAL: {"recovered":0,"of":4,"borne":{"a":"0.025","b":"0.025","c":"0.025","d":"0.025"},"settleTx":"Chgo5eeS9DwYc5xT1aQysJp4o9qcc5ZpyjZhardBq57B"}

### the trade-off, read from the two rounds above

- observed **trade-off**: `{"charged":{"contributionsRecoveredByAnObserver":4,"fundedByOwnAmount":true},"equalShares":{"contributionsRecoveredByAnObserver":0,"fundedBy…`
- ✓ each style has exactly one of the two properties: per-member charges fund fairly and leak the amounts; equal shares hide the amounts and fund unfairly
- evidence comparison: {"charged":{"contributionsRecoveredByAnObserver":4,"fundedByOwnAmount":true},"equalShares":{"contributionsRecoveredByAnObserver":0,"fundedByOwnAmount":false}}

### teardown: prune the syndicates, compact, delete the accounts

- observed **teardown**: `{"pruned":2,"notPruned":[],"deleted":5,"kept":[],"failed":[]}`
- ✓ every account was deleted and every syndicate pruned
- ✓ the contract holds the records it started with

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
| set up: five lenders, a borrower, and the open quote contract deployed fresh | ✗ fail | 1/1 | 20285 ms |
| OPEN · honest lenders open at the maximum and undercut by 25 bps down to their cost, then the sniper watches the chain and undercuts by 1 bp at the end | – skip | 0/0 | 0 ms |
| MIDGE · sealed first-price (lenders quote cost + 50): common deposit, the host picks the winner, the contract charges only the winner | – skip | 0/0 | 0 ms |
| MIDGE · sealed second-price (lenders quote their true cost): common deposit, the host picks the winner, the contract charges only the winner | – skip | 0/0 | 0 ms |
| DEAD HOST · the host never signs: nothing settles and every lender exits alone with the full deposit | – skip | 0/0 | 0 ms |
| the comparison, read from the measurements above | – skip | 0/0 | 0 ms |
| teardown: delete the baseline contract, prune the syndicates, delete the accounts | ✓ pass | 2/2 | 30779 ms |

### set up: five lenders, a borrower, and the open quote contract deployed fresh

- ✓ the public market wasm is built (npm run build:wasm:market)

### OPEN · honest lenders open at the maximum and undercut by 25 bps down to their cost, then the sniper watches the chain and undercuts by 1 bp at the end

- skipped: an earlier critical step failed

### MIDGE · sealed first-price (lenders quote cost + 50): common deposit, the host picks the winner, the contract charges only the winner

- skipped: an earlier critical step failed

### MIDGE · sealed second-price (lenders quote their true cost): common deposit, the host picks the winner, the contract charges only the winner

- skipped: an earlier critical step failed

### DEAD HOST · the host never signs: nothing settles and every lender exits alone with the full deposit

- skipped: an earlier critical step failed

### the comparison, read from the measurements above

- skipped: an earlier critical step failed

### teardown: delete the baseline contract, prune the syndicates, delete the accounts

- observed **baseline contract account**: `deleted, balance returned to the master`
- observed **teardown**: `{"pruned":0,"notPruned":[],"deleted":6,"kept":[],"failed":[]}`
- ✓ every account was deleted and every syndicate pruned
- ✓ the contract holds the records it started with

## E-CMP-CROSS-01: Block trade on testnet: an open order book against a sealed cross run by the host, same pro-rata rule

**Hypothesis.** Predictions are fixed in docs/lab/RFQ_PLAN.md (committed before this ran, with the pro-rata revision made before any run). Reference price 0.0005 NEAR per unit, per-order cap 100 units. Buyers b1 (100 units, limit 0.00055) and b2 (50, 0.000525); sellers s1 (80, 0.000475), s2 (90, 0.0005) and f, a late seller with an extreme limit (40 units, 0.00001). (1) In the open book an observer reads side, size and limit for every desk, 5 of 5 exactly, and sees sell units (210) exceed buy units (150); in the sealed round the escrows are all equal, and the settlement shows each matched desk's side and filled units (5 of 5) but no limit (0 of 5) and none of the unfilled units. (2) Both versions match 150 units at the reference price and sellers receive 0.075 NEAR in total. (3) f gets no queue position: the fills are s1 57, s2 64, f 29 and b1 100, b2 50 in both versions, and f gets what it would get with a limit equal to the reference (under the earlier most-aggressive-first rule f would have filled 40 and displaced s2 to 30). (4) If the host never signs nothing settles and everyone exits with the full 0.06. (5) The sealed round locks more capital than the open book and burns more gas. (My first prediction was a gas ratio between 0.3 and 3; the first run measured 3.18 and failed that band, run 20261107T110304Z-2d88, kept as evidence. The claim is now only that sealed costs more.) Fails if any of these breaks.

**What this does not prove**
- One operator controls every account. The desks are scripted. The open book is our own minimal contract (contracts/public-market), not anyone else's; the host is a local HostedRoost with a simulated attestation provider.
- Only the cash leg settles: sellers are paid and buyers charged; nothing delivers the asset, so a seller can be paid without delivering, and orders' sizes cannot be bounded by an asset deposit. The reference price is supplied, not verified by an oracle.
- Pro-rata invites over-ordering because a trader pays only for what is filled; the public cap (100 units) limits it but does not remove it. This run does not test that.
- Deposits are public. They hide orders only because every participant deposits the same 0.06 NEAR; the open book needs no seller deposit, so it locks less capital.
- Orders are not signed to an account in this run (the signed-input path was not used).

| Step | Result | Assertions | Time |
|---|---|---|---|
| set up: five desks and the open order book deployed fresh | ✗ fail | 1/1 | 20244 ms |
| OPEN · the desks post their orders in public, a watcher reads the book, then f joins late with an extreme limit, and anyone crosses it | – skip | 0/0 | 0 ms |
| MIDGE · sealed cross: common deposit, every desk seals one order, the host crosses, the contract charges buyers and pays sellers | – skip | 0/0 | 0 ms |
| DEAD HOST · the host never signs: nothing settles and every desk exits alone with the full deposit | – skip | 0/0 | 0 ms |
| the comparison, read from the measurements above | – skip | 0/0 | 0 ms |
| teardown: delete the baseline contract, prune the syndicates, delete the accounts | ✓ pass | 2/2 | 30141 ms |

### set up: five desks and the open order book deployed fresh

- ✓ the public market wasm is built (npm run build:wasm:market)

### OPEN · the desks post their orders in public, a watcher reads the book, then f joins late with an extreme limit, and anyone crosses it

- skipped: an earlier critical step failed

### MIDGE · sealed cross: common deposit, every desk seals one order, the host crosses, the contract charges buyers and pays sellers

- skipped: an earlier critical step failed

### DEAD HOST · the host never signs: nothing settles and every desk exits alone with the full deposit

- skipped: an earlier critical step failed

### the comparison, read from the measurements above

- skipped: an earlier critical step failed

### teardown: delete the baseline contract, prune the syndicates, delete the accounts

- observed **baseline contract account**: `deleted, balance returned to the master`
- observed **teardown**: `{"pruned":0,"notPruned":[],"deleted":5,"kept":[],"failed":[]}`
- ✓ every account was deleted and every syndicate pruned
- ✓ the contract holds the records it started with

## E-CMP-VOTE-01: Voting on testnet: an open poll and a 3-of-5 multisig against a sealed ballot counted by the host

**Hypothesis.** Predictions are fixed in docs/lab/PROGRAMME_PLAN.md (committed before this ran; prediction 4 was reworded before the run). Five members each put 0.02 NEAR into a 0.1 pool; two options A (ra) and B (rb); m1, m2 and m5 prefer A, m3 and m4 prefer B; quorum 50%, majority rule. (1) In the open poll an observer reads all 5 votes by account and, before the fifth vote, the public tally is 2 to 2 so the fifth voter knows they decide; in the sealed ballot an observer reads 0 of 5 and the settlement carries no tally or turnout, only the pool paid to the winner and equal charges on all five. (2) Both pay the whole 0.1 to ra. (3) An outsider's vote is refused or ignored in both; a member voting twice counts once. (4) In the sealed ballot a re-vote changes the result: with first ballots m1 B, m2 B, m3 B, m4 A, m5 A the host would pay B; after m1 and m2 re-vote A it pays A. (5) Three of five multisig signers can send the whole pool to an address outside both options and it works; under Midge a payout outside the rules is refused by the contract even with a valid host signature (a key we hold stands in for a compromised host), with the escrow intact. (6) If the host never signs, nothing is paid and all five exit alone with 0.02. (7) Gas of the sealed ballot over the open poll is between 0.5 and 3. Fails if any breaks.

**What this does not prove**
- One operator controls every account, the host and the coordinator. The voters are scripted; the preferences are assumed, not discovered.
- The weight of a vote is a deposit-funded share, not a person: the contract cannot tell one person from many accounts. Nothing here tests coercion or vote-buying beyond re-voting.
- The open poll and the multisig are our own minimal contracts (contracts/public-market, contracts/public-multisig), not anyone else's. The host is a local HostedRoost with a simulated attestation provider; signed inputs use real NEAR keys and the real account-key lookup.
- In the sealed ballot every member's whole deposit is the pool share, so after settlement nobody has an escrow left to exit with; the exit is shown separately with the host never signing.
- The count cannot be checked by anyone but the host (two hosts would reduce that trust; this run uses one). The public tally is hidden, so a dishonest host could report a wrong winner, within the options and the equal charges.

| Step | Result | Assertions | Time |
|---|---|---|---|
| set up: five members, an outsider, two recipients, a thief, and the open poll and multisig contracts deployed fresh | ✓ pass | 4/4 | 48054 ms |
| OPEN POLL · everyone deposits and votes in public; a later vote replaces an earlier one; the last voter reads the tally first | ✓ pass | 20/20 | 255048 ms |
| MIDGE · sealed ballot: equal deposits, signed ballots, the host counts and publishes only the winner | ✓ pass | 13/13 | 19735 ms |
| RE-VOTE · the latest signed ballot counts: B is ahead, two members change to A, and the result flips | ✓ pass | 3/3 | 2725 ms |
| MULTISIG · the five members are the signers; three of them approve a payment, and the money goes where they say | ✓ pass | 11/11 | 21139 ms |
| COMPROMISED HOST · the same thief payment under Midge: refused by the contract even with a valid host signature, escrow intact | ✓ pass | 13/13 | 33501 ms |
| the comparison, read from the measurements above | ✓ pass | 2/2 | 0 ms |
| teardown: delete the baseline contracts, prune the syndicates, delete the accounts | ✓ pass | 2/2 | 51575 ms |

### set up: five members, an outsider, two recipients, a thief, and the open poll and multisig contracts deployed fresh

- ✓ the poll and multisig wasms are built (npm run build:wasm:market, npm run build:wasm:multisig)
- ✓ the multisig is initialised
- ✓ the open poll contract answers
- ✓ the multisig is initialised with the five members and a threshold of 3

### OPEN POLL · everyone deposits and votes in public; a later vote replaces an earlier one; the last voter reads the tally first

- ✓ open the poll
- ✓ m1 joins with 0.02
- ✓ m2 joins with 0.02
- ✓ m3 joins with 0.02
- ✓ m4 joins with 0.02
- ✓ m5 joins with 0.02
- ✓ (3) an outsider cannot join the poll
- ✓ (3) an outsider cannot vote
- ✓ m1 votes A
- ✓ m3 votes B
- ✓ m2 votes A
- ✓ m4 votes B
- ✓ m1 votes A
- ✓ (1) before the last vote the public tally is 2 to 2: the fifth voter reads it and knows their vote decides
- ✓ (3) m1 voted twice and still counts once
- ✓ m5 votes A
- ✓ (1) an observer reads all 5 votes by account, each matching what that member voted: 5 of 5
- ✓ the voting finished with time to spare before the end
- evidence tx: {"label":"close poll","hash":"67Y7bu8aeWKYaUxNt4ZZuhC488V61tNTJr1K39soUJpe","ok":true,"explorer":"https://testnet.nearblocks.io/txns/67Y7bu8aeWKYaUxNt4ZZuhC488V61tNTJr1K39soUJpe","error":null}
- ✓ the poll closed
- ✓ (2) the whole 0.1 NEAR went to ra (A won 3 to 2)
- observed **result**: `{"winner":"A","votesReadable":5,"tallyBeforeLastVote":{"A":2,"B":2},"gasTGas":27.2,"wallMs":255048}`
- evidence OPEN: {"winner":"A","votesReadable":5,"tallyBeforeLastVote":{"A":2,"B":2},"gasTGas":27.2,"wallMs":255048}

### MIDGE · sealed ballot: equal deposits, signed ballots, the host counts and publishes only the winner

- ✓ hatch
- ✓ m1 deposits 0.02
- ✓ m2 deposits 0.02
- ✓ m3 deposits 0.02
- ✓ m4 deposits 0.02
- ✓ m5 deposits 0.02
- ✓ (1) the public escrows are all equal, so they reveal nothing about any vote
- observed **what the host publishes**: `{"shape":"ballot","rule":"majority","decided":true,"winner":"A","recipient":"v9xb8ara.fly-1793636729.testnet","reason":null,"quorumMet":true…`
- ✓ (2) A wins and the outcome names ra, with no tally, turnout or ballot
- ✓ (3) the outsider's signed ballot was ignored and reported by account only
- evidence tx: {"label":"settle_batch_charged vote-mwc9xb8a-sealed","hash":"9yAEmbmqPRy8Wvj9Wptp4c3KUFv9uQtzH2iMrQuN1aep","ok":true,"explorer":"https://testnet.nearblocks.io/txns/9yAEmbmqPRy8Wvj9Wptp4c3KUFv9uQtzH2iMrQuN1aep","error":nu…
- ✓ the settlement succeeded
- ✓ (2) the whole 0.1 NEAR went to ra
- ✓ (1) the settlement carries only the pool to ra and an equal charge on each of the five: it reveals no vote, no tally and no turnout
- ✓ (1) the five charges are identical and equal to the share, so non-voters and voters look the same: 0 of 5 votes can be read
- observed **result**: `{"winner":"A","votesReadable":0,"tallyOnChain":false,"turnoutOnChain":false,"gasTGas":25.3,"wallMs":19733}`
- evidence SEALED: {"winner":"A","votesReadable":0,"tallyOnChain":false,"turnoutOnChain":false,"gasTGas":25.3,"wallMs":19733,"settleTx":"9yAEmbmqPRy8Wvj9Wptp4c3KUFv9uQtzH2iMrQuN1aep"}

### RE-VOTE · the latest signed ballot counts: B is ahead, two members change to A, and the result flips

- ✓ (4) with the first ballots the host would pay B (3 to 2)
- ✓ (4) after m1 and m2 re-vote A with a higher sequence number the host pays A (4 to 1)
- ✓ a replayed older ballot (sequence 1) cannot overwrite the newer one

### MULTISIG · the five members are the signers; three of them approve a payment, and the money goes where they say

- ✓ m1 sends 0.02 to the multisig
- ✓ m2 sends 0.02 to the multisig
- ✓ m3 sends 0.02 to the multisig
- ✓ m4 sends 0.02 to the multisig
- ✓ m5 sends 0.02 to the multisig
- ✓ m1 proposes paying the whole pool to t, which is neither option
- ✓ m2 approves
- ✓ m3 approves
- ✓ (5) the approvals are public: m1, m2 and m3 by name; m4 and m5, who might object, have no say
- evidence tx: {"label":"execute m4","hash":"FduZo8VUV5svz3taufVatCyBqZ7mmUWMmqTacAbM1roj","ok":true,"explorer":"https://testnet.nearblocks.io/txns/FduZo8VUV5svz3taufVatCyBqZ7mmUWMmqTacAbM1roj","error":null}
- ✓ (5) three of the five signers sent the whole pool to the thief and it worked
- ✓ (5) t received exactly 0.1 NEAR

### COMPROMISED HOST · the same thief payment under Midge: refused by the contract even with a valid host signature, escrow intact

- ✓ hatch with a key we hold, standing in for a compromised host
- ✓ m1 deposits
- ✓ m2 deposits
- ✓ m3 deposits
- ✓ m4 deposits
- ✓ m5 deposits
- evidence tx: {"label":"thief payment, validly signed","hash":"NzPCGVWSSpoVkZ8yuZSBE6XLVE3H6s1utAP6Xd7ed7q","ok":false,"explorer":"https://testnet.nearblocks.io/txns/NzPCGVWSSpoVkZ8yuZSBE6XLVE3H6s1utAP6Xd7ed7q","error":"Smart contract…
- ✓ (5) a validly signed payout to a recipient outside the rules is refused by the contract
- ✓ (5) the escrow is intact and nothing is in flight
- ✓ (6) m1 exits alone with the full 0.02 (the host never signed anything valid)
- ✓ (6) m2 exits alone with the full 0.02 (the host never signed anything valid)
- ✓ (6) m3 exits alone with the full 0.02 (the host never signed anything valid)
- ✓ (6) m4 exits alone with the full 0.02 (the host never signed anything valid)
- ✓ (6) m5 exits alone with the full 0.02 (the host never signed anything valid)

### the comparison, read from the measurements above

- observed **results**: `{"PUB":{"winner":"A","votesReadable":5,"tallyBeforeLastVote":{"A":2,"B":2},"gasTGas":27.2,"wallMs":255048},"SEAL":{"winner":"A","votesReadab…`
- ✓ every path was measured
- observed **gas, TGas for the whole vote: open poll / sealed ballot**: `[27.2,25.3]`
- observed **wall time (ms): open poll / sealed ballot**: `[255048,19733]`
- ✓ (7) the sealed ballot burns between 0.5 and 3 times the open poll's gas
- evidence comparison: {"PUB":{"winner":"A","votesReadable":5,"tallyBeforeLastVote":{"A":2,"B":2},"gasTGas":27.2,"wallMs":255048},"SEAL":{"winner":"A","votesReadable":0,"tallyOnChain":false,"turnoutOnChain":false,"gasTGas":25.3,"wallMs":19733}…

### teardown: delete the baseline contracts, prune the syndicates, delete the accounts

- observed **open poll contract account**: `deleted, balance returned to the master`
- observed **multisig contract account**: `deleted, balance returned to the master`
- observed **teardown**: `{"pruned":2,"notPruned":[],"deleted":9,"kept":[],"failed":[]}`
- ✓ every account was deleted and every syndicate pruned
- ✓ the contract holds the records it started with

## E-CMP-PAYROLL-01: Payroll on testnet: a public pay run with reused addresses against a sealed pay run with one-time addresses and signed receipts, two months

**Hypothesis.** Predictions are fixed in docs/lab/PROGRAMME_PLAN.md (committed before this ran; the gas band was revised before the run). Four people with gross 0.05, 0.04, 0.03, 0.02 NEAR, 15% tax and 5% benefits, paid in two months with the same salaries. (1) Public payroll: an observer links 4 of 4 payees across the months by address and reads every net, tax and benefits amount; given one leaked address (Alice's) the observer reads her pay in both months. (2) Midge with one-time addresses: the observer links 0 of 4 payees by address, but 4 of 4 by amount alone, because the salaries are distinct and unchanged, so one leaked address still exposes that person's pay in both months. (3) Each of the 4 people verifies their own receipt (decrypts, host signature, Merkle proof, order hash against the chain); a receipt with a changed amount fails; the auditor's totals equal what the chain shows; each person's net equals the transfer to their address and the four tax lines sum to the one tax transfer. (4) In each month the employer is charged exactly the gross total (0.14), each address receives exactly its net, and the tax and benefits providers exactly their totals. (5) If the host never signs, nothing is paid and the employer exits alone with the full deposit. (6) Midge uses between 3 and 20 times the gas of the public pay run. Fails if any breaks.

**What this does not prove**
- One operator controls every account and the host; the people are scripted. Every payment's address and amount is public on NEAR in both paths: this tests who can be named, not how much can be seen.
- The observer is modelled from chain data only, plus one assumed leak of one person's address. Amounts are fingerprints: with distinct, stable salaries a one-time address does not stop an observer linking the same person across months. This is the main limit of "private who".
- The host is local with a simulated attestation provider; signed inputs use real NEAR keys and the real account-key lookup. The employer's statement and the auditor's key are read by the experiment itself.
- A multisig-approved payroll is not run: it adds approvals but is as public as the direct run. A dishonest host could issue a wrong receipt; two hosts would reduce that and this run uses one.
- At most 8 recipients per settlement: 4 people plus tax plus benefits is 6.

| Step | Result | Assertions | Time |
|---|---|---|---|
| set up: an employer, four people with reused addresses, eight one-time addresses, the tax authority and the benefits provider | ✓ pass | 1/1 | 38958 ms |
| PUBLIC · the employer pays the same four addresses, tax and benefits directly, two months running | ✓ pass | 3/3 | 27433 ms |
| MIDGE · month 1: the employer seals the pay run, the host pays one-time addresses and issues receipts | ✓ pass | 13/13 | 8603 ms |
| MIDGE · month 2: the employer seals the pay run, the host pays one-time addresses and issues receipts | ✓ pass | 13/13 | 7980 ms |
| MIDGE · what an observer can and cannot link across the two months | ✓ pass | 3/3 | 1 ms |
| DEAD HOST · the host never signs: nothing is paid and the employer exits alone with the full deposit | ✓ pass | 4/4 | 18190 ms |
| the comparison, read from the measurements above | ✓ pass | 2/2 | 1 ms |
| teardown: prune the syndicates, delete the accounts | ✓ pass | 2/2 | 96955 ms |

### set up: an employer, four people with reused addresses, eight one-time addresses, the tax authority and the benefits provider

- ✓ fifteen accounts exist and the employer is funded

### PUBLIC · the employer pays the same four addresses, tax and benefits directly, two months running

- evidence tx: {"label":"public pay month 1 -> ya6ke7p1.fly-1793636729.testnet","hash":"3v29sWx5DfjUbpKKNpiPFLZyEif95aG675QcGyaTsYhf","ok":true,"explorer":"https://testnet.nearblocks.io/txns/3v29sWx5DfjUbpKKNpiPFLZyEif95aG675QcGyaTsYhf…
- evidence tx: {"label":"public pay month 1 -> ya6ke7p2.fly-1793636729.testnet","hash":"7CAVJtLsVpvcb1ZhqypKVBFoJYPQN7Rhtd9jvxZSAxjF","ok":true,"explorer":"https://testnet.nearblocks.io/txns/7CAVJtLsVpvcb1ZhqypKVBFoJYPQN7Rhtd9jvxZSAxjF…
- evidence tx: {"label":"public pay month 1 -> ya6ke7p3.fly-1793636729.testnet","hash":"32y2GyDj85YGLkQm43w1kBBbJd5PFdTV1gWZGpaTNmYq","ok":true,"explorer":"https://testnet.nearblocks.io/txns/32y2GyDj85YGLkQm43w1kBBbJd5PFdTV1gWZGpaTNmYq…
- evidence tx: {"label":"public pay month 1 -> ya6ke7p4.fly-1793636729.testnet","hash":"3sedAHuq9x3BdTgvAPaPp4Km13ChzGjqXwaRqHah71by","ok":true,"explorer":"https://testnet.nearblocks.io/txns/3sedAHuq9x3BdTgvAPaPp4Km13ChzGjqXwaRqHah71by…
- evidence tx: {"label":"public pay month 1 -> ya6ke7tx.fly-1793636729.testnet","hash":"FiFVvm8s1aeLw6ur4vT4PzwLXzeuq2WbScJd2V8K7H5b","ok":true,"explorer":"https://testnet.nearblocks.io/txns/FiFVvm8s1aeLw6ur4vT4PzwLXzeuq2WbScJd2V8K7H5b…
- evidence tx: {"label":"public pay month 1 -> ya6ke7bn.fly-1793636729.testnet","hash":"4uKJviuK7CMzU9ZHdR5Xor1FEPXrJzEHXursF7rQw7Jh","ok":true,"explorer":"https://testnet.nearblocks.io/txns/4uKJviuK7CMzU9ZHdR5Xor1FEPXrJzEHXursF7rQw7Jh…
- evidence tx: {"label":"public pay month 2 -> ya6ke7p1.fly-1793636729.testnet","hash":"2eSP8VZJpEZpjSayJ8UGwQPPeKtnht4NMjwkZGdrdzJ5","ok":true,"explorer":"https://testnet.nearblocks.io/txns/2eSP8VZJpEZpjSayJ8UGwQPPeKtnht4NMjwkZGdrdzJ5…
- evidence tx: {"label":"public pay month 2 -> ya6ke7p2.fly-1793636729.testnet","hash":"2LiRur3Es9FaMwCb67VQhgLedQduxUpAmkhutbAvCG8i","ok":true,"explorer":"https://testnet.nearblocks.io/txns/2LiRur3Es9FaMwCb67VQhgLedQduxUpAmkhutbAvCG8i…
- evidence tx: {"label":"public pay month 2 -> ya6ke7p3.fly-1793636729.testnet","hash":"FvZ3jpNmzTnAijWB5fMPb6kK6H4hjbyC1vALhifix3Jo","ok":true,"explorer":"https://testnet.nearblocks.io/txns/FvZ3jpNmzTnAijWB5fMPb6kK6H4hjbyC1vALhifix3Jo…
- evidence tx: {"label":"public pay month 2 -> ya6ke7p4.fly-1793636729.testnet","hash":"6M3GEnxmhgiqUSPC81MYFpAz8VJmYGRWYtQgDpNAFcrJ","ok":true,"explorer":"https://testnet.nearblocks.io/txns/6M3GEnxmhgiqUSPC81MYFpAz8VJmYGRWYtQgDpNAFcrJ…
- evidence tx: {"label":"public pay month 2 -> ya6ke7tx.fly-1793636729.testnet","hash":"3zRym3dn7UWpVQhxfoMM3oYTE1WaNqG8FN69HPJXmqh5","ok":true,"explorer":"https://testnet.nearblocks.io/txns/3zRym3dn7UWpVQhxfoMM3oYTE1WaNqG8FN69HPJXmqh5…
- evidence tx: {"label":"public pay month 2 -> ya6ke7bn.fly-1793636729.testnet","hash":"9ZTFxKghNeX4zVeJZr9VSt3HkmoKhoqH8Zw9jvQ58BnM","ok":true,"explorer":"https://testnet.nearblocks.io/txns/9ZTFxKghNeX4zVeJZr9VSt3HkmoKhoqH8Zw9jvQ58BnM…
- ✓ (1) an observer links 4 of 4 payees across the months by address
- ✓ (1) every net amount is readable: 0.04, 0.032, 0.024, 0.016, and the tax and benefits totals 0.021 and 0.007
- ✓ (1) given only Alice's address the observer reads her pay in both months (0.04 and 0.04)
- observed **result**: `{"linkedAcrossMonthsByAddress":4,"of":4,"amountsReadable":true,"aliceExposedMonths":2,"gasTGas":5.4}`
- evidence PUBLIC: {"linkedAcrossMonthsByAddress":4,"of":4,"amountsReadable":true,"aliceExposedMonths":2,"gasTGas":5.4}

### MIDGE · month 1: the employer seals the pay run, the host pays one-time addresses and issues receipts

- ✓ month 1: hatch
- ✓ month 1: the employer deposits 0.15
- evidence tx: {"label":"settle_batch_charged pay-mwca6ke7-m1","hash":"wGA5roPs3xxjoWaqbrh3gpYjS2f1kwcxvcB2Ui2q1sc","ok":true,"explorer":"https://testnet.nearblocks.io/txns/wGA5roPs3xxjoWaqbrh3gpYjS2f1kwcxvcB2Ui2q1sc","error":null}
- ✓ month 1: the settlement succeeded
- ✓ (4) month 1: exactly six transfers moved, and nothing else
- ✓ (4) month 1: each address received exactly its net: 0.04, 0.032, 0.024, 0.016
- ✓ (4) month 1: the tax authority received 0.021 and the benefits provider 0.007
- ✓ (4) month 1: the employer was charged exactly the gross total, 0.14
- ✓ month 1: the order hash on chain equals the one recomputed from the run id and the receipts root
- ✓ (3) month 1: all four people verify their own receipt (decrypts, host signature, Merkle proof, order hash against the chain)
- ✓ (3) month 1: Alice's receipt shows gross 0.05, tax 0.0075, benefits 0.0025, net 0.04, and her net equals the transfer to her one-time address
- ✓ (3) month 1: a receipt with the net changed to 0.05 fails verification
- ✓ (3) month 1: the four tax lines in the employer's statement sum to the one tax transfer on chain (0.021)
- ✓ (3) month 1: the auditor's totals equal what the chain shows (net 0.112, tax 0.021, benefits 0.007, gross 0.14) and carry no name or address

### MIDGE · month 2: the employer seals the pay run, the host pays one-time addresses and issues receipts

- ✓ month 2: hatch
- ✓ month 2: the employer deposits 0.15
- evidence tx: {"label":"settle_batch_charged pay-mwca6ke7-m2","hash":"CW5Bgf9nULbxpXwyqCXDWvSKhNWiEQEmJChvSGqUu1xS","ok":true,"explorer":"https://testnet.nearblocks.io/txns/CW5Bgf9nULbxpXwyqCXDWvSKhNWiEQEmJChvSGqUu1xS","error":null}
- ✓ month 2: the settlement succeeded
- ✓ (4) month 2: exactly six transfers moved, and nothing else
- ✓ (4) month 2: each address received exactly its net: 0.04, 0.032, 0.024, 0.016
- ✓ (4) month 2: the tax authority received 0.021 and the benefits provider 0.007
- ✓ (4) month 2: the employer was charged exactly the gross total, 0.14
- ✓ month 2: the order hash on chain equals the one recomputed from the run id and the receipts root
- ✓ (3) month 2: all four people verify their own receipt (decrypts, host signature, Merkle proof, order hash against the chain)
- ✓ (3) month 2: Alice's receipt shows gross 0.05, tax 0.0075, benefits 0.0025, net 0.04, and her net equals the transfer to her one-time address
- ✓ (3) month 2: a receipt with the net changed to 0.05 fails verification
- ✓ (3) month 2: the four tax lines in the employer's statement sum to the one tax transfer on chain (0.021)
- ✓ (3) month 2: the auditor's totals equal what the chain shows (net 0.112, tax 0.021, benefits 0.007, gross 0.14) and carry no name or address

### MIDGE · what an observer can and cannot link across the two months

- ✓ (2) by address the observer links 0 of 4 payees across the months: every address is new
- ✓ (2) BY AMOUNT the observer links 4 of 4: the salaries are distinct and unchanged, so each month-1 amount matches exactly one month-2 payee
- ✓ (2) one leaked address (Alice's month-1 address) still exposes her month-2 pay: the observer finds the one month-2 address that received the same amount
- observed **result**: `{"linkedAcrossMonthsByAddress":0,"linkedAcrossMonthsByAmount":4,"of":4,"amountsReadable":true,"gasTGas":34}`
- evidence MIDGE: {"linkedAcrossMonthsByAddress":0,"linkedAcrossMonthsByAmount":4,"of":4,"amountsReadable":true,"gasTGas":34}

### DEAD HOST · the host never signs: nothing is paid and the employer exits alone with the full deposit

- ✓ hatch
- ✓ the employer deposits
- ✓ the employer exits alone
- ✓ (5) the employer recovered the full 0.15

### the comparison, read from the measurements above

- observed **results**: `{"PUB":{"linkedAcrossMonthsByAddress":4,"of":4,"amountsReadable":true,"aliceExposedMonths":2,"gasTGas":5.4},"MIDGE":{"linkedAcrossMonthsByAd…`
- ✓ every path was measured
- observed **gas, TGas for two pay runs: public / Midge (hatch, deposit and settlement per month)**: `[5.4,34]`
- ✓ (6) Midge uses between 3 and 20 times the gas of the public pay run
- evidence comparison: {"PUB":{"linkedAcrossMonthsByAddress":4,"of":4,"amountsReadable":true,"aliceExposedMonths":2,"gasTGas":5.4},"MIDGE":{"linkedAcrossMonthsByAddress":0,"linkedAcrossMonthsByAmount":4,"of":4,"amountsReadable":true,"gasTGas":…

### teardown: prune the syndicates, delete the accounts

- observed **teardown**: `{"pruned":3,"notPruned":[],"deleted":15,"kept":[],"failed":[]}`
- ✓ every account was deleted and every syndicate pruned
- ✓ the contract holds the records it started with

## E-CMP-RFQ-01: Two-sided RFQ on testnet: an open RFQ where the taker's side is public against a sealed RFQ where makers quote both ways and never see it

**Hypothesis.** Predictions are fixed in docs/lab/PROGRAMME_PLAN.md (committed before this ran). One taker and four makers with two-way quotes, 10 units, buy limit 0.0022, sell limit 0.0018, a buy and a sell RFQ on each path. (1) Open: an observer reads the taker's side, size and limit (3 of 3) and every maker's one-sided quote (4 of 4) in both RFQs, and every maker sees the side before quoting. Sealed: 0 of 3 and 0 of 4 before settlement; the settlement shows who paid whom and the notional but not units or price per unit, and the notional does not identify them. (2) Buy goes to m2 at 0.002 and sell to m3 at 0.00197 in both paths. (3) Buy: m2 receives exactly 0.02 and the taker is charged exactly 0.02; sell: the taker receives exactly 0.0197 and m3 is charged exactly 0.0197; nothing else moves; the sealed room's second round runs on the rotated nonce after the first settles part of the escrow. (4) If the host never signs, nothing settles and all five exit with the full 0.03. (5) Gas of the sealed path over the open path is between 0.5 and 4 and the sealed RFQs finish faster. Fails if any breaks.

**What this does not prove**
- One operator controls every account and the host; the makers are scripted and quote their true two-way prices; in the open path they post in improving order. Neither path models makers skewing their quotes once they learn the taker's side: that is the reason sealing the side matters, and this run shows only that the side is public in one path and not in the other.
- The open baseline is our own minimal RFQ contract (contracts/public-market), not anyone else's. The host is a local HostedRoost with a simulated attestation provider; signed inputs use real NEAR keys and the real account-key lookup.
- Only the cash leg settles: nothing delivers the asset. The settlement reveals who pays whom (the side) and the notional. Deposits are public and hide roles only because everyone deposits the same 0.03.
- Second-price pricing is tested offline, not live. A late sniper was shown for lending quotes, not repeated here.

| Step | Result | Assertions | Time |
|---|---|---|---|
| set up: a taker, four makers, and the open RFQ contract deployed fresh | ✓ pass | 2/2 | 17409 ms |
| OPEN · a buy RFQ: the taker states side, size and limit on chain; makers see them and quote one way, improving | ✓ pass | 10/10 | 90259 ms |
| OPEN · a sell RFQ: the taker states side, size and limit on chain; makers see them and quote one way, improving | ✓ pass | 10/10 | 89611 ms |
| MIDGE · set up one room: every participant deposits the same 0.03, so deposits reveal nobody's role | ✓ pass | 7/7 | 13621 ms |
| MIDGE · a sealed buy RFQ: the taker's request and the makers' two-way quotes are sealed; only the winner is charged and paid | ✓ pass | 6/6 | 4068 ms |
| MIDGE · a sealed sell RFQ: the taker's request and the makers' two-way quotes are sealed; only the winner is charged and paid | ✓ pass | 6/6 | 4812 ms |
| MIDGE · everyone exits alone with exactly the remaining escrow | ✓ pass | 11/11 | 18011 ms |
| DEAD HOST · the host never signs: nothing settles and every participant exits alone with the full deposit | ✓ pass | 16/16 | 31825 ms |
| the comparison, read from the measurements above | ✓ pass | 3/3 | 0 ms |
| teardown: delete the baseline contract, prune the syndicates, delete the accounts | ✓ pass | 2/2 | 30774 ms |

### set up: a taker, four makers, and the open RFQ contract deployed fresh

- ✓ the public market wasm is built (npm run build:wasm:market)
- ✓ the open RFQ contract answers

### OPEN · a buy RFQ: the taker states side, size and limit on chain; makers see them and quote one way, improving

- ✓ the taker opens the RFQ
- ✓ (1) before any maker quotes, an observer reads the taker's side, size and limit: 3 of 3
- ✓ m4 quotes 0.00215 per unit after reading the public buy request
- ✓ m3 quotes 0.0021 per unit after reading the public buy request
- ✓ m1 quotes 0.00205 per unit after reading the public buy request
- ✓ m2 quotes 0.002 per unit after reading the public buy request
- ✓ (1) every maker's quote is public: 4 of 4
- evidence tx: {"label":"close buy rfq","hash":"9oGbp2FT1YoAi34ed4MkY6umn6Esz9oJRnhTJePQNosP","ok":true,"explorer":"https://testnet.nearblocks.io/txns/9oGbp2FT1YoAi34ed4MkY6umn6Esz9oJRnhTJePQNosP","error":null}
- ✓ the RFQ closed
- ✓ (2) m2 won the buy at 0.002
- ✓ (3) m2 received exactly 0.02 and the taker was refunded the 0.002 difference
- observed **result**: `{"winner":"m2","price":2000,"takerSideReadable":true,"sizeReadable":true,"limitReadable":true,"quotesReadable":4,"wallMs":90258}`
- evidence OPEN-buy: {"winner":"m2","price":2000,"takerSideReadable":true,"sizeReadable":true,"limitReadable":true,"quotesReadable":4,"wallMs":90258}

### OPEN · a sell RFQ: the taker states side, size and limit on chain; makers see them and quote one way, improving

- ✓ the taker opens the RFQ
- ✓ (1) before any maker quotes, an observer reads the taker's side, size and limit: 3 of 3
- ✓ m4 quotes 0.00185 per unit after reading the public sell request
- ✓ m2 quotes 0.0019 per unit after reading the public sell request
- ✓ m1 quotes 0.00195 per unit after reading the public sell request
- ✓ m3 quotes 0.00197 per unit after reading the public sell request
- ✓ (1) every maker's quote is public: 4 of 4
- evidence tx: {"label":"close sell rfq","hash":"J36kRTVLAphiWWtgUEfn3gAWUogF5sNB4fxc1sbhmibn","ok":true,"explorer":"https://testnet.nearblocks.io/txns/J36kRTVLAphiWWtgUEfn3gAWUogF5sNB4fxc1sbhmibn","error":null}
- ✓ the RFQ closed
- ✓ (2) m3 won the sell at 0.00197
- ✓ (3) the taker received exactly 0.0197 from m3's escrow
- observed **result**: `{"winner":"m3","price":1970,"takerSideReadable":true,"sizeReadable":true,"limitReadable":true,"quotesReadable":4,"wallMs":89611}`
- evidence OPEN-sell: {"winner":"m3","price":1970,"takerSideReadable":true,"sizeReadable":true,"limitReadable":true,"quotesReadable":4,"wallMs":89611}

### MIDGE · set up one room: every participant deposits the same 0.03, so deposits reveal nobody's role

- ✓ hatch
- ✓ t deposits 0.03
- ✓ m1 deposits 0.03
- ✓ m2 deposits 0.03
- ✓ m3 deposits 0.03
- ✓ m4 deposits 0.03
- ✓ (1) the public escrows are all equal, so they reveal neither who is the taker nor any size

### MIDGE · a sealed buy RFQ: the taker's request and the makers' two-way quotes are sealed; only the winner is charged and paid

- evidence tx: {"label":"settle_batch_charged rfq-mwcaat9s-sealed buy","hash":"Djh6XBi4D5e3gpDpcenuHiVcLj2mbVCBAaMKUqGMr43i","ok":true,"explorer":"https://testnet.nearblocks.io/txns/Djh6XBi4D5e3gpDpcenuHiVcLj2mbVCBAaMKUqGMr43i","error"…
- ✓ the settlement succeeded
- ✓ (2) m2 won the buy at 0.002
- ✓ (3) m2 received exactly 0.02 and nothing else moved
- ✓ (3) only the payer's escrow fell, by exactly the cost
- ✓ (1) the settlement carries only who pays whom and the amount: no side, units, limit or price per unit field
- ✓ (1) the notional does not identify the units: many whole-unit sizes up to 100 give the same notional
- observed **how many unit counts from 1 to 100 divide the notional evenly**: `14`
- observed **result**: `{"winner":"m2","price":"0.002","takerSideReadable":false,"sizeReadable":false,"limitReadable":false,"quotesReadable":0,"wallMs":4068}`
- evidence SEALED-buy: {"winner":"m2","price":"0.002","takerSideReadable":false,"sizeReadable":false,"limitReadable":false,"quotesReadable":0,"wallMs":4068,"settleTx":"Djh6XBi4D5e3gpDpcenuHiVcLj2mbVCBAaMKUqGMr43i"}

### MIDGE · a sealed sell RFQ: the taker's request and the makers' two-way quotes are sealed; only the winner is charged and paid

- evidence tx: {"label":"settle_batch_charged rfq-mwcaat9s-sealed sell","hash":"8hTwVLEGbcUuijTujrMRYv5Rir3PpN99WaEzSQhTZTUu","ok":true,"explorer":"https://testnet.nearblocks.io/txns/8hTwVLEGbcUuijTujrMRYv5Rir3PpN99WaEzSQhTZTUu","error…
- ✓ the settlement succeeded
- ✓ (2) m3 won the sell at 0.00197
- ✓ (3) the taker received exactly 0.0197 and nothing else moved
- ✓ (3) only the payer's escrow fell, by exactly the cost
- ✓ (1) the settlement carries only who pays whom and the amount: no side, units, limit or price per unit field
- ✓ (1) the notional does not identify the units: many whole-unit sizes up to 100 give the same notional
- observed **how many unit counts from 1 to 100 divide the notional evenly**: `9`
- observed **result**: `{"winner":"m3","price":"0.00197","takerSideReadable":false,"sizeReadable":false,"limitReadable":false,"quotesReadable":0,"wallMs":4812}`
- evidence SEALED-sell: {"winner":"m3","price":"0.00197","takerSideReadable":false,"sizeReadable":false,"limitReadable":false,"quotesReadable":0,"wallMs":4812,"settleTx":"8hTwVLEGbcUuijTujrMRYv5Rir3PpN99WaEzSQhTZTUu"}

### MIDGE · everyone exits alone with exactly the remaining escrow

- ✓ t exits alone
- ✓ t got back exactly 10000000000000000000000
- ✓ m1 exits alone
- ✓ m1 got back exactly 30000000000000000000000
- ✓ m2 exits alone
- ✓ m2 got back exactly 30000000000000000000000
- ✓ m3 exits alone
- ✓ m3 got back exactly 10300000000000000000000
- ✓ m4 exits alone
- ✓ m4 got back exactly 30000000000000000000000
- ✓ the room ended fully refunded

### DEAD HOST · the host never signs: nothing settles and every participant exits alone with the full deposit

- ✓ hatch
- ✓ t deposits
- ✓ m1 deposits
- ✓ m2 deposits
- ✓ m3 deposits
- ✓ m4 deposits
- ✓ (4) t exits alone
- ✓ (4) t recovered the full 0.03
- ✓ (4) m1 exits alone
- ✓ (4) m1 recovered the full 0.03
- ✓ (4) m2 exits alone
- ✓ (4) m2 recovered the full 0.03
- ✓ (4) m3 exits alone
- ✓ (4) m3 recovered the full 0.03
- ✓ (4) m4 exits alone
- ✓ (4) m4 recovered the full 0.03

### the comparison, read from the measurements above

- observed **results**: `{"PUB":{"buy":{"winner":"m2","price":2000,"takerSideReadable":true,"sizeReadable":true,"limitReadable":true,"quotesReadable":4,"wallMs":9025…`
- ✓ every path was measured
- observed **gas, TGas for both RFQs: open / sealed (hatch, deposits and settlements; no exits)**: `[29.1,31.6]`
- observed **wall time (ms): open buy / open sell / sealed buy / sealed sell**: `[90258,89611,4068,4812]`
- ✓ (5) gas of the sealed path over the open path (hatch, deposits and settlements; no exits) is between 0.5 and 4
- ✓ (5) each sealed RFQ finished faster than its open counterpart
- evidence comparison: {"PUB":{"buy":{"winner":"m2","price":2000,"takerSideReadable":true,"sizeReadable":true,"limitReadable":true,"quotesReadable":4,"wallMs":90258},"sell":{"winner":"m3","price":1970,"takerSideReadable":true,"sizeReadable":tr…

### teardown: delete the baseline contract, prune the syndicates, delete the accounts

- observed **baseline contract account**: `deleted, balance returned to the master`
- observed **teardown**: `{"pruned":2,"notPruned":[],"deleted":5,"kept":[],"failed":[]}`
- ✓ every account was deleted and every syndicate pruned
- ✓ the contract holds the records it started with

## Problems found

| Severity | Where | Problem |
|---|---|---|
| critical | E-CMP-INVEST-01 / M-common · Midge, everyone deposits 0.05 and bids inside it: what the observer reads, then theft attempts, then settlement | step threw: [ROOST REJECT] nothing to abandon: this round has no signed settlement — {"stack":["RoostAggregationError: [ROOST REJECT] nothing to abandon: this round has no signed settlement","    at HostedRoost.abandonSignedRound (file:///home/ubuntu/near/src/roost-service/hosted-roos… |
| critical | E-CMP-INVEST-01 / M-common · the room is gone: each member exits alone with their remainder; who funded the payout | step threw: Cannot set properties of undefined (setting 'fundedBy') — {"stack":["TypeError: Cannot set properties of undefined (setting 'fundedBy')","    at file:///home/ubuntu/near/lab/experiments/80-compare-invest.js:183:32","    at process.processTicksAndRejections (… |
| critical | E-CMP-INVEST-01 / the comparison, read from the measurements above | step threw: Cannot read properties of undefined (reading 'perMemberTGas') — {"stack":["TypeError: Cannot read properties of undefined (reading 'perMemberTGas')","    at file:///home/ubuntu/near/lab/experiments/80-compare-invest.js:189:141","    at Object.step (file:///home/ub… |
| critical | E-CMP-QUOTE-01 / set up: five lenders, a borrower, and the open quote contract deployed fresh | step threw: Account pmc9v4y2.fly-1793636729.testnet lacks balance 77486556536742900000000 yoctoNear for state — {"stack":["LackBalanceForStateActionError: Account pmc9v4y2.fly-1793636729.testnet lacks balance 77486556536742900000000 yoctoNear for state","    at parseActionError (file:///home/ubuntu/near/node_mo… |
| critical | E-CMP-CROSS-01 / set up: five desks and the open order book deployed fresh | step threw: Account pcc9w8cm.fly-1793636729.testnet lacks balance 77486556536742900000000 yoctoNear for state — {"stack":["LackBalanceForStateActionError: Account pcc9w8cm.fly-1793636729.testnet lacks balance 77486556536742900000000 yoctoNear for state","    at parseActionError (file:///home/ubuntu/near/node_mo… |
| major | E-CMP-INVEST-01 / M-common · the room is gone: each member exits alone with their remainder; who funded the payout | assertion failed: prediction 6 (Midge): every member recovered a remainder alone, 0.10 in all — {"actual":{"a":"0.05","b":"0.05","c":"0.05","d":"0.05"}} |
| major | E-CMP-INVEST-01 / M-common · the room is gone: each member exits alone with their remainder; who funded the payout | assertion failed: prediction 9: the payout was funded equally (0.025 each) whatever each member bid, so a member who bid 0.01 paid 0.025 and one who bid 0.04 paid 0.025 — {"actual":{"a":"0n","b":"0n","c":"0n","d":"0n"}} |
| major | E-CMP-INVEST-01 / the comparison, read from the measurements above | assertion failed: every path was measured — {} |
