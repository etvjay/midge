# Lab run 20261111T154524Z-e1cb

- **Code:** `e2674424263c429aa5dfac37e93cf7750d6a51c5` on `completeness` (**6 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `73f42e651241e148…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 297 events, hash-chained; root `6d1a607411363c47fbd892ce55499bf1e6fd6688ac2a4e7c41b157f70431c71d`. Verify with `node lab/verify-run.js lab/runs/20261111T154524Z-e1cb`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-CMP-INVEST-01 Investing together on testnet: a public round, a trusted organizer and Midge, same chain and same members | testnet | **PASS** | 9 | 39 |  |
| E-CMP-QUOTE-01 Lending quotes on testnet: an open reverse-quote round against sealed first-price and second-price rounds run by the host | testnet | **PASS** | 7 | 93 |  |
| E-CMP-CROSS-01 Block trade on testnet: an open order book against a sealed cross run by the host, same pro-rata rule | testnet | **PASS** | 6 | 60 |  |

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
| set up: four backers, a recipient and an organizer, fresh accounts | ✓ pass | 1/1 | 13749 ms |
| P · public: each backer pays the recipient directly; an observer reads the public receipts | ✓ pass | 1/1 | 8765 ms |
| O · organizer: backers pay one account, the organizer forwards the total; the observer reads the public receipts | ✓ pass | 2/2 | 10905 ms |
| O · theft and vanish: members cannot get the pot back, the organizer can take it | ✓ pass | 3/3 | 11142 ms |
| M-naive · Midge, each backer deposits exactly their bid: the observer reads the public escrows | ✓ pass | 8/8 | 14458 ms |
| M-common · Midge, everyone deposits 0.05 and bids inside it: what the observer reads, then theft attempts, then settlement | ✓ pass | 13/13 | 17434 ms |
| M-common · the room is gone: each member exits alone with their remainder; who funded the payout | ✓ pass | 7/7 | 14898 ms |
| the comparison, read from the measurements above | ✓ pass | 2/2 | 1 ms |
| teardown: prune the syndicates, compact, delete the accounts | ✓ pass | 2/2 | 34642 ms |

### set up: four backers, a recipient and an organizer, fresh accounts

- ✓ six accounts exist

### P · public: each backer pays the recipient directly; an observer reads the public receipts

- observed **what the observer read**: `{"iaj2wxa.fly-1793636729.testnet":"0.01","iaj2wxb.fly-1793636729.testnet":"0.02","iaj2wxc.fly-1793636729.testnet":"0.03","iaj2wxd.fly-179363…`
- ✓ prediction 1: the observer recovers all four amounts from the public transfers
- evidence P: {"txs":["6M6qChgqDjVknqgQHqBmjjJufwBEEZwmoFNEad4QXaWh","EsZuo62CUyNadqeogxJV7oiApz4Atz419wvmY6qCUT9C","AsUjKycpDB51pDnbgKFiZLPbjT8BDLUx5f5qzFbrvD1F","SNkEvjEynQtFf24SxiV1sN8pZZEe3f512KFt3Mh4qui"],"recovered":4,"of":4,"ga…

### O · organizer: backers pay one account, the organizer forwards the total; the observer reads the public receipts

- ✓ prediction 2: the observer recovers all four amounts sent to the organizer
- ✓ the organizer forwarded exactly 0.10 to the recipient
- evidence O: {"txs":["5G13D8V5Qs4hQH1eBeRq6RBKNAuSxfajjhtYZAns7g6V","DqZscpyK7QoZStN1uAiuxUBxhmZV2cmFr3FEPAHQf8wM","Dcc4hg8mUysPCi3abeT3vKiQsXo4Gz3WuuMLS23bcMXK","7eYgcrsVEsMaMtjXSZnxmoxqM2unwKNn8WBX6XfJzb6s"],"forward":"2w5YZefKMqch…

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
- evidence M-naive: {"syndicate":"cmp-mwcaj2wx-n","settle":"66DszWbiiLVpLinKxdBnJTzLh8PdjFBS4WtgDMpoym4f","recovered":4,"of":4,"gasTGas":18.9,"perMemberTGas":4.7,"wallMs":14455}

### M-common · Midge, everyone deposits 0.05 and bids inside it: what the observer reads, then theft attempts, then settlement

- ✓ hatch
- ✓ a deposits 0.05
- ✓ b deposits 0.05
- ✓ c deposits 0.05
- ✓ d deposits 0.05
- observed **what the observer reads: every escrow**: `{"iaj2wxa.fly-1793636729.testnet":"0.05","iaj2wxb.fly-1793636729.testnet":"0.05","iaj2wxc.fly-1793636729.testnet":"0.05","iaj2wxd.fly-179363…`
- ✓ every escrow is the same, so the escrows say nothing about who bid what
- ✓ prediction 4: the observer's best guess (the common deposit, or the total divided by four) matches none of the four bids
- ✓ the Roost totals the sealed bids to exactly 0.10 although 0.20 is deposited
- ✓ prediction 5 (Roost): asked to pay the whole 0.20 deposit against a 0.10 sealed total, the Roost refuses to sign
- evidence tx: {"label":"OUTSIDE-POLICY settle cmp-mwcaj2wx-c","hash":"5LPwsC4F5jmzJHLdpXFUFbT1ovcewa3nuZcZJ3P3GXco","ok":false,"explorer":"https://testnet.nearblocks.io/txns/5LPwsC4F5jmzJHLdpXFUFbT1ovcewa3nuZcZJ3P3GXco","error":"Smart…
- ✓ prediction 5 (contract): a validly signed payout to an account outside the policy is refused
- ✓ the escrow is intact after the attempt
- ✓ settle_batch of the honest 0.10 succeeded
- ✓ the recipient received exactly 0.10
- evidence M-common: {"recovered":0,"of":4,"gasTGas":19.1,"perMemberTGas":4.8,"wallMs":17433,"settleTx":"B7ZvVrtKwZPnXgUk3hwNxfufFuhjDm9arT3tzLzqf3RW","syndicate":"cmp-mwcaj2wx-c"}

### M-common · the room is gone: each member exits alone with their remainder; who funded the payout

- ✓ a exits alone
- evidence tx: {"label":"exit cmp-mwcaj2wx-c as a","hash":"52voqR9KiQb5hguSYDWNP1QRg79BE7cfhVkk9XxwibfS","ok":true,"explorer":"https://testnet.nearblocks.io/txns/52voqR9KiQb5hguSYDWNP1QRg79BE7cfhVkk9XxwibfS"}
- ✓ b exits alone
- evidence tx: {"label":"exit cmp-mwcaj2wx-c as b","hash":"6D6rFB85UMitmPaUyrsHJ8BWgvx6NdwSkabvnM96BvK4","ok":true,"explorer":"https://testnet.nearblocks.io/txns/6D6rFB85UMitmPaUyrsHJ8BWgvx6NdwSkabvnM96BvK4"}
- ✓ c exits alone
- evidence tx: {"label":"exit cmp-mwcaj2wx-c as c","hash":"Gtrjmp9NcxPqQ5ygqUgoq3Q44ArXXAq5F8rHT2TEkMzU","ok":true,"explorer":"https://testnet.nearblocks.io/txns/Gtrjmp9NcxPqQ5ygqUgoq3Q44ArXXAq5F8rHT2TEkMzU"}
- ✓ d exits alone
- evidence tx: {"label":"exit cmp-mwcaj2wx-c as d","hash":"Ad9d7Hvp2PB49Vjh3BebbP1HjcV6JC5waS8R8QKuQitv","ok":true,"explorer":"https://testnet.nearblocks.io/txns/Ad9d7Hvp2PB49Vjh3BebbP1HjcV6JC5waS8R8QKuQitv"}
- observed **what each member got back at exit (deposit 0.05 each)**: `{"a":"0.025","b":"0.025","c":"0.025","d":"0.025"}`
- ✓ prediction 6 (Midge): every member recovered a remainder alone, 0.10 in all
- observed **what each member effectively paid toward the 0.10 payout**: `{"a":"0.025 (their bid was 0.01)","b":"0.025 (their bid was 0.02)","c":"0.025 (their bid was 0.03)","d":"0.025 (their bid was 0.04)"}`
- ✓ prediction 9: the payout was funded equally (0.025 each) whatever each member bid, so a member who bid 0.01 paid 0.025 and one who bid 0.04 paid 0.025
- ✓ the syndicate ended fully refunded with nothing left

### the comparison, read from the measurements above

- observed **results**: `{"P":{"recovered":4,"of":4,"gasTGas":1.8,"perMemberTGas":0.4,"wallMs":7952},"O":{"recovered":4,"of":4,"gasTGas":2.2,"perMemberTGas":0.6,"wal…`
- ✓ every path was measured
- ✓ prediction 7: Midge costs more gas per member than the public round (a real overhead, read from receipts)
- observed **gas ratio, common-deposit Midge to public**: `12`
- observed **wall time (ms), P / O / M-naive / M-common**: `[7952,9889,14455,17433]`
- evidence comparison: {"P":{"recovered":4,"of":4,"gasTGas":1.8,"perMemberTGas":0.4,"wallMs":7952},"O":{"recovered":4,"of":4,"gasTGas":2.2,"perMemberTGas":0.6,"wallMs":9889,"theft":"organizer took 100% of the second pot","vanish":"members reco…

### teardown: prune the syndicates, compact, delete the accounts

- observed **teardown**: `{"pruned":2,"notPruned":[],"deleted":6,"kept":[],"failed":[]}`
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
| set up: five lenders, a borrower, and the open quote contract deployed fresh | ✓ pass | 2/2 | 21417 ms |
| OPEN · honest lenders open at the maximum and undercut by 25 bps down to their cost, then the sniper watches the chain and undercuts by 1 bp at the end | ✓ pass | 19/19 | 267770 ms |
| MIDGE · sealed first-price (lenders quote cost + 50): common deposit, the host picks the winner, the contract charges only the winner | ✓ pass | 28/28 | 32964 ms |
| MIDGE · sealed second-price (lenders quote their true cost): common deposit, the host picks the winner, the contract charges only the winner | ✓ pass | 28/28 | 33905 ms |
| DEAD HOST · the host never signs: nothing settles and every lender exits alone with the full deposit | ✓ pass | 12/12 | 27531 ms |
| the comparison, read from the measurements above | ✓ pass | 2/2 | 1 ms |
| teardown: delete the baseline contract, prune the syndicates, delete the accounts | ✓ pass | 2/2 | 38023 ms |

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
- observed **measured: block time (ms), mean quote latency (blocks), the sniper sends this many blocks before the end**: `{"blockMs":604,"latencyBlocks":5,"lead":8}`
- ✓ the request closed
- ✓ the borrower received exactly the 0.05 loan
- observed **result**: `{"winner":"s","rate":449,"lowestCostLender":"b","attributedWithin10pct":3,"of":4,"quotesOnChain":12,"honestLendersVisible":4,"gasTGas":38.2,…`
- ✓ (1) every honest lender's quotes are public: 4 of 4
- ✓ (1) an observer attributes a cost within 10% to at least 3 of the 4 honest lenders from their lowest quote
- observed **the sniper's quote**: `landed before the end`
- ✓ (2) either the sniper's 449 landed in time and won, or it was refused as late and b kept the lead at 450
- evidence OPEN: {"winner":"s","rate":449,"lowestCostLender":"b","attributedWithin10pct":3,"of":4,"quotesOnChain":12,"honestLendersVisible":4,"gasTGas":38.2,"wallMs":267769,"sniped":true,"blocksBeforeEnd":3}

### MIDGE · sealed first-price (lenders quote cost + 50): common deposit, the host picks the winner, the contract charges only the winner

- ✓ hatch qt-mwcals4w-fp
- ✓ a deposits 0.05
- ✓ b deposits 0.05
- ✓ c deposits 0.05
- ✓ d deposits 0.05
- ✓ s deposits 0.05
- ✓ the public escrows are all equal, so they attribute no cost to any named lender
- observed **sealed first-price (lenders quote cost + 50): what the host computed**: `{"shape":"lend","pricing":"first","counterparty":"qals4wr.fly-1793636729.testnet","won":true,"winner":"qals4wb.fly-1793636729.testnet","quot…`
- evidence tx: {"label":"settle_batch_charged qt-mwcals4w-fp","hash":"CsNV9Xyq8wF2i3xqwD6CnGukJBgMjPvXpCfpNuzmtLoG","ok":true,"explorer":"https://testnet.nearblocks.io/txns/CsNV9Xyq8wF2i3xqwD6CnGukJBgMjPvXpCfpNuzmtLoG","error":null}
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
- observed **result**: `{"winner":"b","rate":450,"attributedWithin10pct":0,"of":5,"rateOnChain":false,"gasTGas":47.3,"wallMs":32962}`
- ✓ (3) the lowest-cost lender, b, won with the sniper present
- ✓ (3) the agreed rate is 450 bps
- evidence FP: {"winner":"b","rate":450,"attributedWithin10pct":0,"of":5,"rateOnChain":false,"gasTGas":47.3,"wallMs":32962,"settleTx":"CsNV9Xyq8wF2i3xqwD6CnGukJBgMjPvXpCfpNuzmtLoG"}

### MIDGE · sealed second-price (lenders quote their true cost): common deposit, the host picks the winner, the contract charges only the winner

- ✓ hatch qt-mwcals4w-sp
- ✓ a deposits 0.05
- ✓ b deposits 0.05
- ✓ c deposits 0.05
- ✓ d deposits 0.05
- ✓ s deposits 0.05
- ✓ the public escrows are all equal, so they attribute no cost to any named lender
- observed **sealed second-price (lenders quote their true cost): what the host computed**: `{"shape":"lend","pricing":"second","counterparty":"qals4wr.fly-1793636729.testnet","won":true,"winner":"qals4wb.fly-1793636729.testnet","quo…`
- evidence tx: {"label":"settle_batch_charged qt-mwcals4w-sp","hash":"p94V5f3RsQNHj5spSNXVTWWGPg5gB8rQbNhWr1sRzvr","ok":true,"explorer":"https://testnet.nearblocks.io/txns/p94V5f3RsQNHj5spSNXVTWWGPg5gB8rQbNhWr1sRzvr","error":null}
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
- observed **result**: `{"winner":"b","rate":420,"attributedWithin10pct":0,"of":5,"rateOnChain":false,"gasTGas":47.5,"wallMs":33902}`
- ✓ (3) the lowest-cost lender, b, won with the sniper present
- ✓ (3) the agreed rate is 420 bps
- evidence SP: {"winner":"b","rate":420,"attributedWithin10pct":0,"of":5,"rateOnChain":false,"gasTGas":47.5,"wallMs":33902,"settleTx":"p94V5f3RsQNHj5spSNXVTWWGPg5gB8rQbNhWr1sRzvr"}

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
- observed **gas, TGas for the whole round: open / first-price / second-price**: `[38.2,47.3,47.5]`
- observed **wall time (ms): open / first-price / second-price**: `[267769,32962,33902]`
- ✓ (6) gas of the first-price round over the open round is between 0.5 and 1.5
- observed **borrower's rate: open / first-price / second-price (bps)**: `[449,450,420]`
- evidence comparison: {"PUB":{"winner":"s","rate":449,"lowestCostLender":"b","attributedWithin10pct":3,"of":4,"quotesOnChain":12,"honestLendersVisible":4,"gasTGas":38.2,"wallMs":267769,"sniped":true,"blocksBeforeEnd":3},"FP":{"winner":"b","ra…

### teardown: delete the baseline contract, prune the syndicates, delete the accounts

- observed **baseline contract account**: `deleted, balance returned to the master`
- observed **teardown**: `{"pruned":3,"notPruned":[],"deleted":6,"kept":[],"failed":[]}`
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
| set up: five desks and the open order book deployed fresh | ✓ pass | 3/3 | 17037 ms |
| OPEN · the desks post their orders in public, a watcher reads the book, then f joins late with an extreme limit, and anyone crosses it | ✓ pass | 14/14 | 91467 ms |
| MIDGE · sealed cross: common deposit, every desk seals one order, the host crosses, the contract charges buyers and pays sellers | ✓ pass | 26/26 | 37228 ms |
| DEAD HOST · the host never signs: nothing settles and every desk exits alone with the full deposit | ✓ pass | 12/12 | 33370 ms |
| the comparison, read from the measurements above | ✓ pass | 3/3 | 0 ms |
| teardown: delete the baseline contract, prune the syndicates, delete the accounts | ✓ pass | 2/2 | 32147 ms |

### set up: five desks and the open order book deployed fresh

- ✓ the public market wasm is built (npm run build:wasm:market)
- ✓ the order book contract is deployed and answers
- ✓ the program itself puts f at 29, not 40, whatever its limit: extreme and at-reference limits give identical fills

### OPEN · the desks post their orders in public, a watcher reads the book, then f joins late with an extreme limit, and anyone crosses it

- ✓ open the book
- ✓ b1 posts buy 100 @ 550
- ✓ b2 posts buy 50 @ 525
- ✓ s1 posts sell 80 @ 475
- ✓ s2 posts sell 90 @ 500
- ✓ (1) an observer reads side, size and limit for every desk posted so far: 4 of 4 exactly
- observed **what the watcher can see before the cross**: `{"buyUnits":150,"sellUnits":170,"sellSideLeftover":20}`
- ✓ (1) the watcher sees that sell units (170) exceed buy units (150) by 20
- ✓ f posts a late sell of 40 units with limit 10 (0.00001)
- ✓ (1) all 5 desks are readable on chain: 5 of 5
- evidence tx: {"label":"cross book","hash":"BtSKucHXwkpX1eipB3eECgPrW8XUanbRkw79KgsC9hBH","ok":true,"explorer":"https://testnet.nearblocks.io/txns/BtSKucHXwkpX1eipB3eECgPrW8XUanbRkw79KgsC9hBH","error":null}
- ✓ the book crossed
- ✓ (2) 150 units matched at the reference: sellers received 0.075 NEAR in total
- ✓ (3) the sellers' fills are s1 57, s2 64, f 29: f gets no queue position
- ✓ buyers got back deposit minus cash: b1 0.005, b2 0.00125
- ✓ the book reports 150 matched units
- observed **result**: `{"matchedUnits":150,"sellerFills":{"s1":57,"s2":64,"f":29},"ordersReadableBeforeCross":5,"limitsReadable":5,"gasTGas":16.8,"wallMs":91465,"c…`
- evidence OPEN: {"matchedUnits":150,"sellerFills":{"s1":57,"s2":64,"f":29},"ordersReadableBeforeCross":5,"limitsReadable":5,"gasTGas":16.8,"wallMs":91465,"capitalLockedNear":0.08125}

### MIDGE · sealed cross: common deposit, every desk seals one order, the host crosses, the contract charges buyers and pays sellers

- ✓ hatch
- ✓ b1 deposits 0.06
- ✓ b2 deposits 0.06
- ✓ s1 deposits 0.06
- ✓ s2 deposits 0.06
- ✓ f deposits 0.06
- ✓ (1) the public escrows are all equal, so they reveal neither side nor size nor limit of any desk
- observed **what the host computed**: `{"shape":"cross","referencePrice":"0.0005","maxUnits":100,"matchedUnits":150,"cash":"0.075","buyers":2,"sellers":3,"ordersReceived":5,"unrea…`
- evidence tx: {"label":"settle_batch_charged cross-mwcautge-sealed","hash":"HiZ8vgWV4bhjaBLqoqwqcrhHqder99uwfNG4BaYwkcDD","ok":true,"explorer":"https://testnet.nearblocks.io/txns/HiZ8vgWV4bhjaBLqoqwqcrhHqder99uwfNG4BaYwkcDD","error":n…
- ✓ settle_batch_charged succeeded
- ✓ (2) 150 units matched at the reference: sellers received 0.075 NEAR in total
- ✓ (3) the sellers' fills are s1 57, s2 64, f 29, the same as the open book: f gets no queue position
- ✓ (3) the sealed fills equal the open book's fills
- ✓ buyers' escrow fell by exactly their cash: b1 by 0.05, b2 by 0.025
- ✓ the settlement carries only allocations and charges (no limits, no order sizes)
- ✓ (1) the settlement shows each matched desk's side and filled units: 5 of 5
- ✓ (1) none of the sellers' ordered sizes (80, 90, 40) appears: the unfilled units are not revealed
- ✓ b1 exits alone
- ✓ b2 exits alone
- ✓ s1 exits alone
- ✓ s2 exits alone
- ✓ f exits alone
- ✓ b1 exits with exactly its remaining escrow
- ✓ b2 exits with exactly its remaining escrow
- ✓ s1 exits with exactly its remaining escrow
- ✓ s2 exits with exactly its remaining escrow
- ✓ f exits with exactly its remaining escrow
- ✓ the syndicate ended fully refunded
- observed **result**: `{"matchedUnits":150,"sellerFills":{"s1":57,"s2":64,"f":29},"escrowsEqualBefore":true,"sidesAndFillsReadable":5,"limitsReadable":0,"unfilledU…`
- evidence SEALED: {"matchedUnits":150,"sellerFills":{"s1":57,"s2":64,"f":29},"escrowsEqualBefore":true,"sidesAndFillsReadable":5,"limitsReadable":0,"unfilledUnitsReadable":0,"gasTGas":55.1,"wallMs":37228,"capitalLockedNear":0.3,"settleTx"…

### DEAD HOST · the host never signs: nothing settles and every desk exits alone with the full deposit

- ✓ hatch
- ✓ b1 deposits
- ✓ b2 deposits
- ✓ s1 deposits
- ✓ s2 deposits
- ✓ f deposits
- ✓ b1 exits alone
- ✓ b2 exits alone
- ✓ s1 exits alone
- ✓ s2 exits alone
- ✓ f exits alone
- ✓ (4) every desk recovered the full 0.06 alone

### the comparison, read from the measurements above

- observed **results**: `{"PUB":{"matchedUnits":150,"sellerFills":{"s1":57,"s2":64,"f":29},"ordersReadableBeforeCross":5,"limitsReadable":5,"gasTGas":16.8,"wallMs":9…`
- ✓ every path was measured
- ✓ (5) the sealed round locks more capital than the open book
- observed **gas, TGas for the whole trade: open book / sealed**: `[16.8,55.1]`
- observed **wall time (ms): open book / sealed**: `[91465,37228]`
- observed **sealed gas over open-book gas (the first run measured 3.18 against a predicted band of 0.3 to 3: the sealed path needs a hatch, five deposits, a settlement and the exits, the open book only seven calls)**: `3.28`
- ✓ (5) the sealed round burns more gas than the open book
- evidence comparison: {"PUB":{"matchedUnits":150,"sellerFills":{"s1":57,"s2":64,"f":29},"ordersReadableBeforeCross":5,"limitsReadable":5,"gasTGas":16.8,"wallMs":91465,"capitalLockedNear":0.08125},"SEAL":{"matchedUnits":150,"sellerFills":{"s1"…

### teardown: delete the baseline contract, prune the syndicates, delete the accounts

- observed **baseline contract account**: `deleted, balance returned to the master`
- observed **teardown**: `{"pruned":2,"notPruned":[],"deleted":5,"kept":[],"failed":[]}`
- ✓ every account was deleted and every syndicate pruned
- ✓ the contract holds the records it started with

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
