# Lab run 20261108T170650Z-a88e

- **Code:** `971797908f9f91b1b77ad370d31166d645ed8cff` on `master` (**1 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `edd3ff37e9a64d22…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 40 events, hash-chained; root `236dc9738d642df75f0e2c3dcc6d54d1bf072a32295cf08065e10cd3d420e76c`. Verify with `node lab/verify-run.js lab/runs/20261108T170650Z-a88e`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-UNFUNDED-PRUNE-LIVE-01 A never-funded group can be removed by its creator, not early by a stranger, and a funded group is never removed this way: on the real contract | testnet | **PASS** | 7 | 17 |  |

## E-UNFUNDED-PRUNE-LIVE-01: A never-funded group can be removed by its creator, not early by a stranger, and a funded group is never removed this way: on the real contract

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. After the redeploy the chain runs the recorded build; an unfunded group reads Unfunded; a stranger cannot remove it early; its creator can, at once; a funded group is refused even for its creator; nothing is left behind.

**What this does not prove**
- The path after the waiting period (anyone may remove a never-funded group after about seven days) cannot be reached on a real chain in a test; it is shown by the unit tests only.
- One operator controls every account.

| Step | Result | Assertions | Time |
|---|---|---|---|
| prediction 1: the chain runs the recorded build and holds the same groups | ✓ pass | 1/1 | 781 ms |
| set up: a stranger, a depositor, a recipient, and one group nobody funds | ✓ pass | 1/1 | 9287 ms |
| prediction 2: an unfunded group reads Unfunded | ✓ pass | 1/1 | 412 ms |
| prediction 3: a stranger cannot remove it early | ✓ pass | 3/3 | 2402 ms |
| prediction 4: its creator can remove it at once | ✓ pass | 4/4 | 2746 ms |
| prediction 5: a funded group is not removed, even by its creator | ✓ pass | 5/5 | 6466 ms |
| prediction 6: teardown: exit, prune, delete the accounts | ✓ pass | 2/2 | 30336 ms |

### prediction 1: the chain runs the recorded build and holds the same groups

- ✓ the on-chain code hash is the last recorded deployment
- observed **groups on the contract**: `15`

### set up: a stranger, a depositor, a recipient, and one group nobody funds

- ✓ the group was hatched

### prediction 2: an unfunded group reads Unfunded

- ✓ the phase is Unfunded

### prediction 3: a stranger cannot remove it early

- evidence stranger: {"ok":false,"error":"Smart contract panicked: panicked at src/lib.rs:1705:13:\n[Prune REJECT] A never-funded syndicate can be pruned by its creator, or by anyone from block 277408976.","hash":"DtG6BJ3nXZAAMPsEqtXuBLJjX7B…
- ✓ the call was refused
- ✓ with the never-funded message
- ✓ and the group is still there

### prediction 4: its creator can remove it at once

- evidence creator: {"ok":true,"error":null,"hash":"2euhYe9AFk3esWcNV39uDuj4pwyjGcBCLSUNyhAKa6U8","explorer":"https://testnet.nearblocks.io/txns/2euhYe9AFk3esWcNV39uDuj4pwyjGcBCLSUNyhAKa6U8"}
- ✓ the call succeeded
- ✓ the group is gone
- ✓ and its phase is null
- ✓ the creator's index no longer lists it

### prediction 5: a funded group is not removed, even by its creator

- ✓ a second group was hatched
- ✓ a member deposited
- ✓ it is Open
- evidence refused: {"ok":false,"error":"Smart contract panicked: panicked at src/lib.rs:1699:9:\n[Prune REJECT] Only a Settled or AbortedRefunded syndicate, or one that was never funded, can be pruned.","hash":"GEQwV9eatbwCLupXsKH5oNxAR5dn…
- ✓ the call was refused
- ✓ and the funded group is untouched

### prediction 6: teardown: exit, prune, delete the accounts

- observed **teardown**: `{"pruned":1,"notPruned":[],"deleted":3,"kept":[],"failed":[]}`
- ✓ every account was deleted and the funded group removed
- ✓ the contract holds the groups it started with

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
