# Ongoing groups on testnet: results

*Experiment `E-ONGOING-01`, run `20261107T131007Z-d8a0`, PASS, 60 assertions, log re-derived intact. Predictions were written in `PROGRAMME_PLAN.md` before the run, including the cap weakness in part B. There is no baseline: this tests the contract's lifecycle claims against what it says.*

## A. A real life: three rounds, three programs, a late member

A Dark Vault (25% release cap, 16-block exit timer). Four members deposit 0.1 each (0.4). Round 1 is an investing pool, 0.05 to `rp`. A fifth member deposits 0.1 into the running group. Round 2 is a ballot among all five, 0.05 to the winner `ra` (A won 3 to 2, the late member voting). Round 3 is a lending quote, a 0.04 loan to `rl` won by u3 at 400 bps. One host served all three rounds with three different programs.

| Claim | Result |
|---|---|
| The epoch rises by exactly 1 per settlement and the round nonce changes | epochs 1, 2, 3, 4; four distinct nonces |
| A late member can deposit between rounds and is counted and charged | yes: u5 voted in round 2 and was charged 0.01 like the others |
| Escrows sum to the group total after every round | yes, after each of the three rounds and after the late deposit |
| Each round paid exactly what it should | rp 0.05, ra 0.05, rl 0.04, nothing else moved |
| Round 1's signed settlement replayed after round 2 | refused (nonce mismatch); total, epoch and every escrow unchanged |
| The exit timer restarts with each epoch | an exit right after round 3 was refused ("Deliberation window still active") 65 blocks after the group opened, far more than 16 |
| After the timer, everyone exits alone with exactly their remainder | u1 0.08, u2 0.08, u3 0.035, u4 0.075, u5 0.09 (total 0.36) |

## B. What the cap really bounds: a finding

I predicted this from reading the code: the cap is a share of the **current** escrow at each settlement, and the epoch advances by settlement, not by time. With a key we hold standing in for a compromised host, a Dark Vault of four members with 0.1 each and a 25% cap:

| Payout | Result |
|---|---|
| 0.11 (above 25% of 0.4), charged across two members so only the cap can refuse it | refused ("exceeds max_release_bps_per_epoch cap"), nothing moved |
| 0.1 (exactly 25% of 0.4) | succeeded |
| 0.075 (exactly 25% of the remaining 0.3), straight after | succeeded |
| 0.05625 (exactly 25% of the remaining 0.225), straight after | succeeded |

Three payments released **0.23125 of 0.4, which is 57.81%, within minutes**, against a stated 25% per epoch. Ten would release about 94%. The recipients allowlist still held (money can go only to allowed recipients), and every member could still exit after the timer with exactly their remainder (u2 0.025, u3 0.04375, u4 0.1; u1 had been charged all of theirs).

**Why this matters.** "A compromised host can release at most X% per epoch" was a headline protection. It is not true as written: the cap bounds each settlement, not the pace. In a Dark Vault there is a second effect: each settlement restarts the exit timer, so a host that settles more often than the timer keeps members out while draining. This is recorded as **GAP-024** (HIGH), stated on the site, README, whitepaper and glossary, and not fixed. A fix has to track release over a time window or force spacing between settlements, and has to avoid breaking the stored state of existing groups (separate storage keys, as the second-host key does). It is a contract change and needs a decision.

## What this does not show

- One operator ran every account and the host; the members are scripted. The host was local with a simulated attestation provider; signed inputs used real NEAR keys and the real lookup.
- Three rounds and five members: not a long-lived or large group.
- Part B uses a key we hold, because a real host refuses to sign more than it computed. It shows what the contract allows a compromised host to do, not that a real host would.
- No baseline was run.
