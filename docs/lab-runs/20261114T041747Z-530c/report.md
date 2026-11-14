# Lab run 20261114T041747Z-530c

- **Code:** `139611f92809ea3712d73ff9be97089987a73b7a` on `playground` (**15 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `6bf6e4ecc506c941…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 45 events, hash-chained; root `a7e88dadbc76ccbfd6f3744e70679161ba1444d96c19f064968bef8ce33a36ce`. Verify with `node lab/verify-run.js lab/runs/20261114T041747Z-530c`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-PLAYGROUND-SERVICE-01 The playground service with a fake chain and a fake room: the queue and its limits, the model gate, the round with its cleanup, and the HTTP rules | offline | **PASS** | 4 | 33 |  |

## E-PLAYGROUND-SERVICE-01: The playground service with a fake chain and a fake room: the queue and its limits, the model gate, the round with its cleanup, and the HTTP rules

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. A second tab from one address gets the same ticket; the hourly, daily, line-length and funder limits refuse with their reasons; a round starts only for lines a model has just reviewed; the round settles with exact books and leaves only the visitor's account; an abandoned, failed or unsigned round gives the deposit back and cleans up; and the service sends cross-site headers only to the site's origin and never reveals the room's admin key.

**What this does not prove**
- Offline: the chain and the room are stand-ins that copy the contract's hatch, deposit, settle, exit and prune rules and the room's refusal to sign before approval. Nothing here shows the real contract or a real room behaving that way; E-PLAYGROUND-LOCAL-01 and E-PLAYGROUND-LIVE-01 do.

| Step | Result | Assertions | Time |
|---|---|---|---|
| prediction 1: the queue gives each session its own ticket and refuses with a reason when a limit is reached | ✓ pass | 8/8 | 5 ms |
| prediction 2: a round can start only for lines a model has just reviewed | ✓ pass | 6/6 | 2 ms |
| prediction 3: the round settles with exact books and leaves only the visitor's account; abandoned, failed and unsigned rounds clean up | ✓ pass | 11/11 | 66 ms |
| prediction 4: the service sends cross-site headers only to the site's origin, caps bodies, and never reveals the room's admin key | ✓ pass | 8/8 | 48 ms |

### prediction 1: the queue gives each session its own ticket and refuses with a reason when a limit is reached

- ✓ a reload of the same session resumes its own ticket, and a different session from the same address gets a ticket of its own
- ✓ a ticket is owned only by the session that joined it
- ✓ the fourth round from one address in an hour is refused as address-limit
- ✓ and is allowed again after the hour
- ✓ the 61st round of a day is refused as daily-cap
- ✓ a ninth waiting ticket is refused as queue-full
- ✓ a funder balance under the floor is refused as funder-low, and no ticket exists afterwards
- ✓ an unsigned active ticket expires after ten minutes and the next ticket becomes active

### prediction 2: a round can start only for lines a model has just reviewed

- ✓ the gate is closed before any review
- ✓ it opens for the same lines
- ✓ one edited value closes it with a plain reason
- ✓ a review that was not used never opens the gate
- ✓ the seventh review in a session is refused
- ✓ the 61st review in an hour is refused

### prediction 3: the round settles with exact books and leaves only the visitor's account; abandoned, failed and unsigned rounds clean up

- ✓ a round cannot start before the start-up sweep has run
- ✓ the employer deposited exactly the gross total, 0.18 NEAR
- ✓ the round returns the settlement, the order hash, the visitor's sealed payslip and the visitor's account
- ✓ only the visitor's account survives cleanup, the group is pruned and the ledger is empty
- ✓ an approval signed for a different order hash is refused by the room
- ✓ an approval signed with a key that is not the approver's is refused by the room
- ✓ after both refusals nothing was settled
- ✓ abandoning during approval takes the deposit back out, prunes the group and leaves only the visitor's account
- ✓ a failure while hatching deletes every service-held account
- ✓ no approval within the time limit ends the round and gives the deposit back
- ✓ the start-up sweep cleans up what a crashed process left in the ledger

### prediction 4: the service sends cross-site headers only to the site's origin, caps bodies, and never reveals the room's admin key

- ✓ the site's own origin gets the cross-site header
- ✓ a foreign origin gets none, on a request and on a preflight
- ✓ a body over 16 KiB gets 413
- ✓ the room's admin key appears in no response
- ✓ another session, or none, cannot read, approve or cancel a round even with its ticket: each gets the answer for an unknown ticket
- ✓ without a review of the same lines, a round is refused with 403
- ✓ a caller cannot become another address by writing it into X-Forwarded-For: the entry the proxy added decides
- ✓ and claiming the first caller's leftmost entry does not hand over the first caller's ticket

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
