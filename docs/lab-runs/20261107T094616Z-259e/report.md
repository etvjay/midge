# Lab run 20261107T094616Z-259e

- **Code:** `65c3229d2af7743841ae8a43c7b6fbc176959d51` on `master` (**13 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `8a0180ff698c44b5…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 38 events, hash-chained; root `d985a5bda83159bde6a663d447f5b57b02f9bc7bfc99143e04d25fb9fa75446b`. Verify with `node lab/verify-run.js lab/runs/20261107T094616Z-259e`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-CALLBACK-GAS-01 GAP-008: how much gas does the follow-up step of a payout really burn, per member? | testnet | **PASS** | 5 | 16 |  |

## E-CALLBACK-GAS-01: GAP-008: how much gas does the follow-up step of a payout really burn, per member?

**Hypothesis.** Written before the run. The follow-up step (on_settlement_payout) applies each member's deduction and clears the settling mark. Its cost is a base plus a per-member part. Prediction: the base is under 10 TGas and the per-member part is under 1 TGas, so the sizing 25 TGas + 1 TGas per member (capped at 100) is enough for the 50-member maximum (about 75 TGas). The contract deployed at the time of the run may give it a flat 25 TGas; if the measured cost extrapolated to 50 members exceeds the allotment in force, that is the GAP-008 risk, shown. Fails if the follow-up step fails to run or settle, or if the measured per-member cost is 1 TGas or more (the sizing would then be too small).

**What this does not prove**
- Measures gas from the settlement's own receipts on testnet for 4 and N members and extrapolates linearly to 50; it does not run 50 members.
- It cannot make a real callback run out of gas, so the recovery path itself is shown by unit tests, not live.
- One operator controls every account and the host is local.

| Step | Result | Assertions | Time |
|---|---|---|---|
| set up: 20 members and a recipient | ✓ pass | 1/1 | 52442 ms |
| 4 members | ✓ pass | 5/5 | 16496 ms |
| 20 members | ✓ pass | 5/5 | 49759 ms |
| the per-member cost, extrapolated to the 50-member maximum | ✓ pass | 3/3 | 1 ms |
| teardown: exit, prune, compact, delete the accounts | ✓ pass | 2/2 | 208970 ms |

### set up: 20 members and a recipient

- ✓ 21 accounts exist

### 4 members

- ✓ hatch gas4-mw67xt5s
- evidence tx: {"label":"settle_batch gas4-mw67xt5s (4 members)","hash":"5usNn64fXn2ZsVXsXwftYhhy36u8X4ozQDEjzKAW62Ny","ok":true,"explorer":"https://testnet.nearblocks.io/txns/5usNn64fXn2ZsVXsXwftYhhy36u8X4ozQDEjzKAW62Ny","error":null}
- ✓ the 4-member settlement succeeded
- ✓ the transaction status with receipts was readable
- ✓ the follow-up step ran and logged the settlement
- ✓ it reported success (not a failed payout)
- evidence callback: {"members":4,"callbackBurntTGas":2.884523038194,"pendingAfter":"n/a"}

### 20 members

- ✓ hatch gas20-mw67xt5s
- evidence tx: {"label":"settle_batch gas20-mw67xt5s (20 members)","hash":"A7QdKtUhXAyFJ4RFeefTxdRffaXivaqEmcXHUmUAaoWL","ok":true,"explorer":"https://testnet.nearblocks.io/txns/A7QdKtUhXAyFJ4RFeefTxdRffaXivaqEmcXHUmUAaoWL","error":nul…
- ✓ the 20-member settlement succeeded
- ✓ the transaction status with receipts was readable
- ✓ the follow-up step ran and logged the settlement
- ✓ it reported success (not a failed payout)
- evidence callback: {"members":20,"callbackBurntTGas":6.874910884867,"pendingAfter":"n/a"}

### the per-member cost, extrapolated to the 50-member maximum

- observed **fit**: `{"baseTGas":1.89,"perMemberTGas":0.249,"at50TGas":14.4,"flatAllotmentTGas":25,"sizedAllotmentAt50TGas":75}`
- evidence fit: {"baseTGas":1.89,"perMemberTGas":0.249,"at50TGas":14.4}
- ✓ the base cost is under 10 TGas
- ✓ the per-member cost is under 1 TGas (the sizing constant)
- ✓ so the sized allotment at 50 members (75 TGas) covers the extrapolated cost with room to spare
- observed **a flat 25 TGas would be enough at 50 members**: `true`

### teardown: exit, prune, compact, delete the accounts

- observed **teardown**: `{"pruned":2,"notPruned":[],"deleted":21,"kept":[],"failed":[]}`
- ✓ every account was deleted and every syndicate pruned
- ✓ the contract holds the records it started with

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
