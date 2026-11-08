# Lab run 20261108T153206Z-a0f0

- **Code:** `3775e4d85c4ccd289c78fad7f4086bb44f738a0b` on `master` (**1 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `edd3ff37e9a64d22…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 50 events, hash-chained; root `63e325d2e2e1f21bac30fb536242a357075697e96f32fdb0bb0ffef801f83f5d`. Verify with `node lab/verify-run.js lab/runs/20261108T153206Z-a0f0`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-NONCE-CALLBACK-LIVE-01 The nonce-checked follow-up and the phase view on the real contract after the redeploy | testnet | **PASS** | 7 | 27 |  |

## E-NONCE-CALLBACK-LIVE-01: The nonce-checked follow-up and the phase view on the real contract after the redeploy

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md (with a disclosed amendment to prediction 4), committed before this file existed. After the redeploy the chain runs the recorded build, the phase view agrees with every group on the contract, a real settlement is followed by on_settlement_payout_for_round carrying the signed round nonce, and two consecutive settlements both complete.

**What this does not prove**
- A late follow-up of an earlier settlement cannot be produced on a real chain on demand, and this host cannot create two byte-identical settlements (its order hash includes the round), so GAP-028 itself is shown by the unit tests only.
- A settlement that was in flight at the moment of the upgrade (the legacy path) is also unit-tested only.
- One operator controls every account; the room is a local host, not a TEE.

| Step | Result | Assertions | Time |
|---|---|---|---|
| prediction 1: the chain runs the recorded build and still holds the same groups | ✓ pass | 1/1 | 986 ms |
| prediction 2: the phase view agrees with every group, and is null for an unknown id | ✓ pass | 3/3 | 6621 ms |
| set up: three members, a recipient, a group on the contract | ✓ pass | 6/6 | 19832 ms |
| prediction 3: settlement 1 is followed by the follow-up that names its own round | ✓ pass | 7/7 | 8764 ms |
| prediction 4 (amended): settlement 2 is followed by the follow-up that names its own round | ✓ pass | 7/7 | 7105 ms |
| the two settlements named different rounds | ✓ pass | 1/1 | 0 ms |
| prediction 5: teardown: exit, prune, delete the accounts | ✓ pass | 2/2 | 36695 ms |

### prediction 1: the chain runs the recorded build and still holds the same groups

- ✓ the on-chain code hash is the last recorded deployment
- observed **groups on the contract**: `15`

### prediction 2: the phase view agrees with every group, and is null for an unknown id

- ✓ an id that does not exist gives null
- ✓ the list was readable and non-empty
- ✓ every group's phase matches its status, members and settling flag
- observed **phases**: `15`

### set up: three members, a recipient, a group on the contract

- ✓ the group was hatched
- ✓ before any deposit the phase is Unfunded
- ✓ nzqexcm1.fly-1793636729.testnet deposited
- ✓ nzqexcm2.fly-1793636729.testnet deposited
- ✓ nzqexcm3.fly-1793636729.testnet deposited
- ✓ after deposits the phase is Open

### prediction 3: settlement 1 is followed by the follow-up that names its own round

- evidence tx: {"label":"settle_batch 1 nc-mw7zqexc","hash":"GfFaem88mwHEDNxV3rKaWfxWmHEhPofEtPvMXkRBiBJ3","ok":true,"explorer":"https://testnet.nearblocks.io/txns/GfFaem88mwHEDNxV3rKaWfxWmHEhPofEtPvMXkRBiBJ3","error":null}
- ✓ settlement 1 was accepted
- ✓ the transaction with its receipts was readable
- ✓ the follow-up was scheduled as on_settlement_payout_for_round
- ✓ it carries the round nonce that was signed
- ✓ the pending record is gone after the follow-up
- ✓ the phase is Open again
- ✓ the round nonce changed

### prediction 4 (amended): settlement 2 is followed by the follow-up that names its own round

- evidence tx: {"label":"settle_batch 2 nc-mw7zqexc","hash":"7dRZMR8V9uzS8XzCciVoRSQJXA3RZiqVaFkAATt7G6A4","ok":true,"explorer":"https://testnet.nearblocks.io/txns/7dRZMR8V9uzS8XzCciVoRSQJXA3RZiqVaFkAATt7G6A4","error":null}
- ✓ settlement 2 was accepted
- ✓ the transaction with its receipts was readable
- ✓ the follow-up was scheduled as on_settlement_payout_for_round
- ✓ it carries the round nonce that was signed
- ✓ the pending record is gone after the follow-up
- ✓ the phase is Open again
- ✓ the round nonce changed

### the two settlements named different rounds

- ✓ two different nonces

### prediction 5: teardown: exit, prune, delete the accounts

- observed **teardown**: `{"pruned":1,"notPruned":[],"deleted":4,"kept":[],"failed":[]}`
- ✓ every account was deleted and the group pruned
- ✓ the contract holds the groups it started with

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
