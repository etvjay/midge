# Lab run 20261107T124146Z-ca19

- **Code:** `943a177821eda023d9925ba27fa1a64b2a2ccdcd` on `master` (**3 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `8a0180ff698c44b5…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 117 events, hash-chained; root `5478a786714ba50382bf4ec3fef2bc8474866067f5b9c65bcbe1eb65bb6053b8`. Verify with `node lab/verify-run.js lab/runs/20261107T124146Z-ca19`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-CMP-RFQ-01 Two-sided RFQ on testnet: an open RFQ where the taker's side is public against a sealed RFQ where makers quote both ways and never see it | testnet | **PASS** | 10 | 73 |  |

## E-CMP-RFQ-01: Two-sided RFQ on testnet: an open RFQ where the taker's side is public against a sealed RFQ where makers quote both ways and never see it

**Hypothesis.** Predictions are fixed in docs/lab/PROGRAMME_PLAN.md (committed before this ran). One taker and four makers with two-way quotes, 10 units, buy limit 0.0022, sell limit 0.0018, a buy and a sell RFQ on each path. (1) Open: an observer reads the taker's side, size and limit (3 of 3) and every maker's one-sided quote (4 of 4) in both RFQs, and every maker sees the side before quoting. Sealed: 0 of 3 and 0 of 4 before settlement; the settlement shows who paid whom and the notional but not units or price per unit, and the notional does not identify them. (2) Buy goes to m2 at 0.002 and sell to m3 at 0.00197 in both paths. (3) Buy: m2 receives exactly 0.02 and the taker is charged exactly 0.02; sell: the taker receives exactly 0.0197 and m3 is charged exactly 0.0197; nothing else moves; the sealed room's second round runs on the rotated nonce after the first settles part of the escrow. (4) If the host never signs, nothing settles and all five exit with the full 0.03. (5) Gas of the sealed path over the open path is between 0.5 and 4 and the sealed RFQs finish faster. Fails if any breaks.

**What this does not prove**
- One operator controls every account and the host; the makers are scripted and quote their true two-way prices; in the open path they post in improving order. Neither path models makers skewing their quotes once they learn the taker's side: that is the reason sealing the side matters, and this run shows only that the side is public in one path and not in the other.
- The open baseline is our own minimal RFQ contract (contracts/public-market), not anyone else's. The host is a local HostedRoost with a simulated attestation provider; signed inputs use real NEAR keys and the real account-key lookup.
- Only the cash leg settles: nothing delivers the asset. The settlement reveals who pays whom (the side) and the notional. Deposits are public and hide roles only because everyone deposits the same 0.03.
- Second-price pricing is tested offline, not live. A late sniper was shown for lending quotes, not repeated here.

| Step | Result | Assertions | Time |
|---|---|---|---|
| set up: a taker, four makers, and the open RFQ contract deployed fresh | ✓ pass | 2/2 | 19252 ms |
| OPEN · a buy RFQ: the taker states side, size and limit on chain; makers see them and quote one way, improving | ✓ pass | 10/10 | 92760 ms |
| OPEN · a sell RFQ: the taker states side, size and limit on chain; makers see them and quote one way, improving | ✓ pass | 10/10 | 87709 ms |
| MIDGE · set up one room: every participant deposits the same 0.03, so deposits reveal nobody's role | ✓ pass | 7/7 | 12120 ms |
| MIDGE · a sealed buy RFQ: the taker's request and the makers' two-way quotes are sealed; only the winner is charged and paid | ✓ pass | 6/6 | 4447 ms |
| MIDGE · a sealed sell RFQ: the taker's request and the makers' two-way quotes are sealed; only the winner is charged and paid | ✓ pass | 6/6 | 4608 ms |
| MIDGE · everyone exits alone with exactly the remaining escrow | ✓ pass | 11/11 | 19159 ms |
| DEAD HOST · the host never signs: nothing settles and every participant exits alone with the full deposit | ✓ pass | 16/16 | 29441 ms |
| the comparison, read from the measurements above | ✓ pass | 3/3 | 1 ms |
| teardown: delete the baseline contract, prune the syndicates, delete the accounts | ✓ pass | 2/2 | 27982 ms |

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
- evidence tx: {"label":"close buy rfq","hash":"8JF13p4y726LBHqx9LYT5rTRk7XWoUQo5QeX9hDap5Rm","ok":true,"explorer":"https://testnet.nearblocks.io/txns/8JF13p4y726LBHqx9LYT5rTRk7XWoUQo5QeX9hDap5Rm","error":null}
- ✓ the RFQ closed
- ✓ (2) m2 won the buy at 0.002
- ✓ (3) m2 received exactly 0.02 and the taker was refunded the 0.002 difference
- observed **result**: `{"winner":"m2","price":2000,"takerSideReadable":true,"sizeReadable":true,"limitReadable":true,"quotesReadable":4,"wallMs":92760}`
- evidence OPEN-buy: {"winner":"m2","price":2000,"takerSideReadable":true,"sizeReadable":true,"limitReadable":true,"quotesReadable":4,"wallMs":92760}

### OPEN · a sell RFQ: the taker states side, size and limit on chain; makers see them and quote one way, improving

- ✓ the taker opens the RFQ
- ✓ (1) before any maker quotes, an observer reads the taker's side, size and limit: 3 of 3
- ✓ m4 quotes 0.00185 per unit after reading the public sell request
- ✓ m2 quotes 0.0019 per unit after reading the public sell request
- ✓ m1 quotes 0.00195 per unit after reading the public sell request
- ✓ m3 quotes 0.00197 per unit after reading the public sell request
- ✓ (1) every maker's quote is public: 4 of 4
- evidence tx: {"label":"close sell rfq","hash":"qPyNe44H6SVdDmcBbp8vcB8N4dKwsy7jeRVrT5iuk5p","ok":true,"explorer":"https://testnet.nearblocks.io/txns/qPyNe44H6SVdDmcBbp8vcB8N4dKwsy7jeRVrT5iuk5p","error":null}
- ✓ the RFQ closed
- ✓ (2) m3 won the sell at 0.00197
- ✓ (3) the taker received exactly 0.0197 from m3's escrow
- observed **result**: `{"winner":"m3","price":1970,"takerSideReadable":true,"sizeReadable":true,"limitReadable":true,"quotesReadable":4,"wallMs":87708}`
- evidence OPEN-sell: {"winner":"m3","price":1970,"takerSideReadable":true,"sizeReadable":true,"limitReadable":true,"quotesReadable":4,"wallMs":87708}

### MIDGE · set up one room: every participant deposits the same 0.03, so deposits reveal nobody's role

- ✓ hatch
- ✓ t deposits 0.03
- ✓ m1 deposits 0.03
- ✓ m2 deposits 0.03
- ✓ m3 deposits 0.03
- ✓ m4 deposits 0.03
- ✓ (1) the public escrows are all equal, so they reveal neither who is the taker nor any size

### MIDGE · a sealed buy RFQ: the taker's request and the makers' two-way quotes are sealed; only the winner is charged and paid

- evidence tx: {"label":"settle_batch_charged rfq-mw6e7ivf-sealed buy","hash":"6VjyuMYkU1QNVkrPFM7ZK3ESkUwu7DZn6usRYdXPZDQY","ok":true,"explorer":"https://testnet.nearblocks.io/txns/6VjyuMYkU1QNVkrPFM7ZK3ESkUwu7DZn6usRYdXPZDQY","error"…
- ✓ the settlement succeeded
- ✓ (2) m2 won the buy at 0.002
- ✓ (3) m2 received exactly 0.02 and nothing else moved
- ✓ (3) only the payer's escrow fell, by exactly the cost
- ✓ (1) the settlement carries only who pays whom and the amount: no side, units, limit or price per unit field
- ✓ (1) the notional does not identify the units: many whole-unit sizes up to 100 give the same notional
- observed **how many unit counts from 1 to 100 divide the notional evenly**: `14`
- observed **result**: `{"winner":"m2","price":"0.002","takerSideReadable":false,"sizeReadable":false,"limitReadable":false,"quotesReadable":0,"wallMs":4447}`
- evidence SEALED-buy: {"winner":"m2","price":"0.002","takerSideReadable":false,"sizeReadable":false,"limitReadable":false,"quotesReadable":0,"wallMs":4447,"settleTx":"6VjyuMYkU1QNVkrPFM7ZK3ESkUwu7DZn6usRYdXPZDQY"}

### MIDGE · a sealed sell RFQ: the taker's request and the makers' two-way quotes are sealed; only the winner is charged and paid

- evidence tx: {"label":"settle_batch_charged rfq-mw6e7ivf-sealed sell","hash":"5Kjj7cGMAdM7ewwE53Eg1KrQVvYU1k2FGeHQMm54QgGR","ok":true,"explorer":"https://testnet.nearblocks.io/txns/5Kjj7cGMAdM7ewwE53Eg1KrQVvYU1k2FGeHQMm54QgGR","error…
- ✓ the settlement succeeded
- ✓ (2) m3 won the sell at 0.00197
- ✓ (3) the taker received exactly 0.0197 and nothing else moved
- ✓ (3) only the payer's escrow fell, by exactly the cost
- ✓ (1) the settlement carries only who pays whom and the amount: no side, units, limit or price per unit field
- ✓ (1) the notional does not identify the units: many whole-unit sizes up to 100 give the same notional
- observed **how many unit counts from 1 to 100 divide the notional evenly**: `9`
- observed **result**: `{"winner":"m3","price":"0.00197","takerSideReadable":false,"sizeReadable":false,"limitReadable":false,"quotesReadable":0,"wallMs":4607}`
- evidence SEALED-sell: {"winner":"m3","price":"0.00197","takerSideReadable":false,"sizeReadable":false,"limitReadable":false,"quotesReadable":0,"wallMs":4607,"settleTx":"5Kjj7cGMAdM7ewwE53Eg1KrQVvYU1k2FGeHQMm54QgGR"}

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

- observed **results**: `{"PUB":{"buy":{"winner":"m2","price":2000,"takerSideReadable":true,"sizeReadable":true,"limitReadable":true,"quotesReadable":4,"wallMs":9276…`
- ✓ every path was measured
- observed **gas, TGas for both RFQs: open / sealed (hatch, deposits and settlements; no exits)**: `[29.1,28.8]`
- observed **wall time (ms): open buy / open sell / sealed buy / sealed sell**: `[92760,87708,4447,4607]`
- ✓ (5) gas of the sealed path over the open path (hatch, deposits and settlements; no exits) is between 0.5 and 4
- ✓ (5) each sealed RFQ finished faster than its open counterpart
- evidence comparison: {"PUB":{"buy":{"winner":"m2","price":2000,"takerSideReadable":true,"sizeReadable":true,"limitReadable":true,"quotesReadable":4,"wallMs":92760},"sell":{"winner":"m3","price":1970,"takerSideReadable":true,"sizeReadable":tr…

### teardown: delete the baseline contract, prune the syndicates, delete the accounts

- observed **baseline contract account**: `deleted, balance returned to the master`
- observed **teardown**: `{"pruned":2,"notPruned":[],"deleted":5,"kept":[],"failed":[]}`
- ✓ every account was deleted and every syndicate pruned
- ✓ the contract holds the records it started with

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
