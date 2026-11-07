# Lab run 20261107T142417Z-f27b

- **Code:** `41e02aa400c304e8d2b9adfe368d0dd86add8791` on `master` (**2 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `8a0180ff698c44b5…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 69 events, hash-chained; root `6b8ad898653096721aa16f674e4ff160274fb41e72d4a2b456fd5104488d2290`. Verify with `node lab/verify-run.js lab/runs/20261107T142417Z-f27b`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-TIMER-CONSENT-01 GAP-025 on testnet: the exit timer is in the hash depositors consent to; a 9-block timer is refused; older groups are intact | testnet | **PASS** | 6 | 49 |  |

## E-TIMER-CONSENT-01: GAP-025 on testnet: the exit timer is in the hash depositors consent to; a 9-block timer is refused; older groups are intact

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, written before the redeploy. A hatch below 10 blocks is refused, a new group is stored with the version-2 hash, a deposit that leaves out or misstates the timer is refused, one that names it is accepted, and groups opened before the change are intact and marked as not covering their timer. The failure that must not happen: a deposit accepted with a hash that omits the timer, or an older group changed by the deploy.

**What this does not prove**
- One operator controls every account; the host is local and not in the test (no round is settled here).
- It shows the contract and the checks, not that a person reads the terms.
- The older groups checked are the ones still on the contract on the day of the run (they are not mine to create again).

| Step | Result | Assertions | Time |
|---|---|---|---|
| set up: two members, a recipient, a local host key | ✓ pass | 1/1 | 6064 ms |
| prediction 1: a 9-block timer is refused at hatch | ✓ pass | 4/4 | 2334 ms |
| prediction 2: a 12-block timer is accepted and stored with the version-2 hash | ✓ pass | 5/5 | 2307 ms |
| prediction 3: a deposit that leaves out or misstates the timer is refused; one that names it is accepted | ✓ pass | 5/5 | 7969 ms |
| prediction 4: the groups opened before the change are intact and marked | ✓ pass | 32/32 | 6148 ms |
| teardown: exit, prune, delete the accounts | ✓ pass | 2/2 | 22625 ms |

### set up: two members, a recipient, a local host key

- ✓ three accounts exist
- observed **syndicates on the contract before this run**: `15`

### prediction 1: a 9-block timer is refused at hatch

- evidence hatch 9: {"ok":false,"hash":"FTKjx1VEpurrh9uTqFnyTjmcQp5F3ZpfTXfun7qMFtH5","error":"Smart contract panicked: panicked at src/lib.rs:530:9:\n[Hatch REJECT] timeout_blocks must be at least 10 (a sanity floor, not a recommendation: …
- ✓ the hatch was refused
- ✓ for the floor, naming it
- ✓ no such group exists
- ✓ the group count is unchanged

### prediction 2: a 12-block timer is accepted and stored with the version-2 hash

- ✓ the hatch succeeded
- ✓ the stored hash equals the version-2 hash computed independently here
- ✓ it is not the old formula
- ✓ the terms view reports 12 blocks and a 24-block window
- ✓ and that the timer is covered by the hash

### prediction 3: a deposit that leaves out or misstates the timer is refused; one that names it is accepted

- ✓ a deposit with the old formula (no timer) is refused
- ✓ a deposit that assumed a 300-block timer is refused
- ✓ neither changed the escrow
- ✓ a deposit naming the real 12-block timer is accepted
- ✓ and the escrow is 0.02

### prediction 4: the groups opened before the change are intact and marked

- observed **groups in the pre-deploy snapshot**: `15`
- ✓ the snapshot has the 15 groups the contract held
- ✓ older group syn-flash-1793645977: hash, timer, status and escrow unchanged by the deploy
- ✓ older group syn-flash-1793645977 reads back as not covering its timer
- ✓ older group syn-atk-wl-1793645988: hash, timer, status and escrow unchanged by the deploy
- ✓ older group syn-atk-wl-1793645988 reads back as not covering its timer
- ✓ older group syn-flash-1793646106: hash, timer, status and escrow unchanged by the deploy
- ✓ older group syn-flash-1793646106 reads back as not covering its timer
- ✓ older group syn-atk-wl-1793646119: hash, timer, status and escrow unchanged by the deploy
- ✓ older group syn-atk-wl-1793646119 reads back as not covering its timer
- ✓ older group syn-atk-cap-1793646126: hash, timer, status and escrow unchanged by the deploy
- ✓ older group syn-atk-cap-1793646126 reads back as not covering its timer
- ✓ older group syn-escape-1793646136: hash, timer, status and escrow unchanged by the deploy
- ✓ older group syn-escape-1793646136 reads back as not covering its timer
- ✓ older group lab-mw20t3zk-1: hash, timer, status and escrow unchanged by the deploy
- ✓ older group lab-mw20t3zk-1 reads back as not covering its timer
- ✓ older group lab-mw20u2n7-1: hash, timer, status and escrow unchanged by the deploy
- ✓ older group lab-mw20u2n7-1 reads back as not covering its timer
- ✓ older group no-keys-syn: hash, timer, status and escrow unchanged by the deploy
- ✓ older group no-keys-syn reads back as not covering its timer
- ✓ older group syn-flash-1793803348: hash, timer, status and escrow unchanged by the deploy
- ✓ older group syn-flash-1793803348 reads back as not covering its timer
- ✓ older group syn-escape-1793803376: hash, timer, status and escrow unchanged by the deploy
- ✓ older group syn-escape-1793803376 reads back as not covering its timer
- ✓ older group syn-atk-cap-1793803367: hash, timer, status and escrow unchanged by the deploy
- ✓ older group syn-atk-cap-1793803367 reads back as not covering its timer
- ✓ older group syn-atk-wl-1793803361: hash, timer, status and escrow unchanged by the deploy
- ✓ older group syn-atk-wl-1793803361 reads back as not covering its timer
- ✓ older group ifc-mw2962xo-1: hash, timer, status and escrow unchanged by the deploy
- ✓ older group ifc-mw2962xo-1 reads back as not covering its timer
- ✓ older group sec-mw29sqcx-1: hash, timer, status and escrow unchanged by the deploy
- ✓ older group sec-mw29sqcx-1 reads back as not covering its timer
- ✓ the contract holds those 15 plus this run's one group

### teardown: exit, prune, delete the accounts

- observed **teardown**: `{"pruned":1,"notPruned":[],"deleted":3,"kept":[],"failed":[]}`
- ✓ every account was deleted and every syndicate pruned
- ✓ the contract holds the records it started with

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
