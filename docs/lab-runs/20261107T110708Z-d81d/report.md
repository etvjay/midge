# Lab run 20261107T110708Z-d81d

- **Code:** `f8a5475ba2978a25489bd44c3edd50297114071b` on `master` (**6 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `8a0180ff698c44b5…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 91 events, hash-chained; root `f1ada44f7fafd038c0f55b8c2c2290405c46b7b41f0e02f592ff3fb6f411a0cb`. Verify with `node lab/verify-run.js lab/runs/20261107T110708Z-d81d`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-CMP-CROSS-01 Block trade on testnet: an open order book against a sealed cross run by the host, same pro-rata rule | testnet | **PASS** | 6 | 60 |  |

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
| set up: five desks and the open order book deployed fresh | ✓ pass | 3/3 | 17009 ms |
| OPEN · the desks post their orders in public, a watcher reads the book, then f joins late with an extreme limit, and anyone crosses it | ✓ pass | 14/14 | 92416 ms |
| MIDGE · sealed cross: common deposit, every desk seals one order, the host crosses, the contract charges buyers and pays sellers | ✓ pass | 26/26 | 36837 ms |
| DEAD HOST · the host never signs: nothing settles and every desk exits alone with the full deposit | ✓ pass | 12/12 | 31410 ms |
| the comparison, read from the measurements above | ✓ pass | 3/3 | 0 ms |
| teardown: delete the baseline contract, prune the syndicates, delete the accounts | ✓ pass | 2/2 | 33090 ms |

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
- evidence tx: {"label":"cross book","hash":"96L9GVMFFSKprQ85rNa2BCHcoGc2rQK6wGWXiJp29yze","ok":true,"explorer":"https://testnet.nearblocks.io/txns/96L9GVMFFSKprQ85rNa2BCHcoGc2rQK6wGWXiJp29yze","error":null}
- ✓ the book crossed
- ✓ (2) 150 units matched at the reference: sellers received 0.075 NEAR in total
- ✓ (3) the sellers' fills are s1 57, s2 64, f 29: f gets no queue position
- ✓ buyers got back deposit minus cash: b1 0.005, b2 0.00125
- ✓ the book reports 150 matched units
- observed **result**: `{"matchedUnits":150,"sellerFills":{"s1":57,"s2":64,"f":29},"ordersReadableBeforeCross":5,"limitsReadable":5,"gasTGas":16,"wallMs":92416,"cap…`
- evidence OPEN: {"matchedUnits":150,"sellerFills":{"s1":57,"s2":64,"f":29},"ordersReadableBeforeCross":5,"limitsReadable":5,"gasTGas":16,"wallMs":92416,"capitalLockedNear":0.08125}

### MIDGE · sealed cross: common deposit, every desk seals one order, the host crosses, the contract charges buyers and pays sellers

- ✓ hatch
- ✓ b1 deposits 0.06
- ✓ b2 deposits 0.06
- ✓ s1 deposits 0.06
- ✓ s2 deposits 0.06
- ✓ f deposits 0.06
- ✓ (1) the public escrows are all equal, so they reveal neither side nor size nor limit of any desk
- observed **what the host computed**: `{"shape":"cross","referencePrice":"0.0005","maxUnits":100,"matchedUnits":150,"cash":"0.075","buyers":2,"sellers":3,"ordersReceived":5,"unrea…`
- evidence tx: {"label":"settle_batch_charged cross-mw6att22-sealed","hash":"GeSoWvKFMqfHjaAvZ5gRKaF6XRBFXHahZWjRmMjYkQra","ok":true,"explorer":"https://testnet.nearblocks.io/txns/GeSoWvKFMqfHjaAvZ5gRKaF6XRBFXHahZWjRmMjYkQra","error":n…
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
- evidence SEALED: {"matchedUnits":150,"sellerFills":{"s1":57,"s2":64,"f":29},"escrowsEqualBefore":true,"sidesAndFillsReadable":5,"limitsReadable":0,"unfilledUnitsReadable":0,"gasTGas":50.8,"wallMs":36837,"capitalLockedNear":0.3,"settleTx"…

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

- observed **results**: `{"PUB":{"matchedUnits":150,"sellerFills":{"s1":57,"s2":64,"f":29},"ordersReadableBeforeCross":5,"limitsReadable":5,"gasTGas":16,"wallMs":924…`
- ✓ every path was measured
- ✓ (5) the sealed round locks more capital than the open book
- observed **gas, TGas for the whole trade: open book / sealed**: `[16,50.8]`
- observed **wall time (ms): open book / sealed**: `[92416,36837]`
- observed **sealed gas over open-book gas (the first run measured 3.18 against a predicted band of 0.3 to 3: the sealed path needs a hatch, five deposits, a settlement and the exits, the open book only seven calls)**: `3.18`
- ✓ (5) the sealed round burns more gas than the open book
- evidence comparison: {"PUB":{"matchedUnits":150,"sellerFills":{"s1":57,"s2":64,"f":29},"ordersReadableBeforeCross":5,"limitsReadable":5,"gasTGas":16,"wallMs":92416,"capitalLockedNear":0.08125},"SEAL":{"matchedUnits":150,"sellerFills":{"s1":5…

### teardown: delete the baseline contract, prune the syndicates, delete the accounts

- observed **baseline contract account**: `deleted, balance returned to the master`
- observed **teardown**: `{"pruned":2,"notPruned":[],"deleted":5,"kept":[],"failed":[]}`
- ✓ every account was deleted and every syndicate pruned
- ✓ the contract holds the records it started with

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
