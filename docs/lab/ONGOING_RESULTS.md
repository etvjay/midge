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

## B. What the cap bounds: the finding, the fix, the re-run

**Before the fix (run `20261107T131007Z-d8a0`, kept as evidence).** The cap was a share of the *current* escrow at each settlement and a Dark Vault's epoch advanced per settlement. With a key we hold standing in for a compromised host, a 25% cap and payouts of exactly 25% of the current escrow (0.1, 0.075, 0.05625) all succeeded back to back, releasing **57.81%** of the group within minutes. Each settlement also restarted the exit timer, so a host settling often could keep members out while draining. Recorded as **GAP-024** (HIGH).

**The fix (contract `DNZDmhLR…`, tx `DPbQ2944…`, 15 existing groups intact).** A group has a release window of twice its exit timer. Within a window the total released may not exceed the cap times (the escrow at the window's start plus deposits since). A failed payout gives its allowance back. A Dark Vault's epoch and exit timer advance with a new window, not with every settlement. The window is stored under its own key, so existing groups are untouched. 14 new unit tests, 106 in all, 11 deliberate breaks each caught.

**After the fix (run `20261107T134236Z-af24`, PASS, 73 assertions).** A key we hold, a 25% cap, a 24-block timer:

| Step | Result |
|---|---|
| 0.11 of 0.4 | refused |
| 0.1 (exactly 25%) | succeeded; the chain recorded a window with start escrow 0.4, released 0.1, lasting 48 blocks |
| 0.075 (25% of the remaining 0.3) straight after | **refused**: cumulative release in this window would exceed the cap |
| even 0.001 more | **refused**; nothing moved |
| 0.075 after the window ended | succeeded: the allowance returned in a new window sized to the then-current 0.3 |

In part A, each round waited for the previous window and opened its own, so the epoch rose by exactly 1 per round. A fourth small round **inside** round 3's window did not advance the epoch or move the exit timer's start, and members exited at the window's start plus the timer, **12 blocks before** the fourth settlement plus the timer, which is when the old rule would have let them go. They left with exactly deposit minus charges (u1 0.07, u2 0.08, u3 0.035, u4 0.075, u5 0.09).

## The limit, in real time

The cap is paced by time: at most its share of what the group holds per release window, and a window is twice the group's exit timer. In real time that is only as strict as the timer the group chose. Measured on testnet with a 24-block timer (a 27-second window), a stand-in for a compromised host was refused a second payout straight after the first and could still release about 90% in nine windows, roughly four minutes. With a one-hour timer the same release would take about 18 hours, and members would wait up to an hour to exit. The timer must be chosen on purpose. Since the GAP-025 fix (2026-11-07) the timer is part of the rules depositors agree to and the contract refuses a timer under 10 blocks (about 6 seconds, a sanity floor and not a recommendation). Groups opened before that fix keep the old rules, so their timers were never agreed to; the contract marks them (`get_policy_terms`).

## What this does not show

- One operator ran every account and the host; the members are scripted. The host was local with a simulated attestation provider; signed inputs used real NEAR keys and the real lookup.
- Part B uses a key we hold, because a real host refuses to sign more than it computed. It shows what the contract allows a compromised host to do.
- A 24-block timer. A longer timer was not run live; its effect follows from the rule and the unit tests.
- Three to four rounds and five members: not a long-lived or large group. No baseline was run.
