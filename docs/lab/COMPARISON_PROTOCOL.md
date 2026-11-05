# Comparison protocol: Midge against existing ways of doing the same job

*Written 2026-11-05 BEFORE any comparison run, so the predictions cannot be adjusted afterwards. Results go in `docs/lab-runs/` and are summarised in `docs/lab/COMPARISON_RESULTS.md` once they exist.*

## Question

For jobs where a group must decide together with money at stake, does Midge give the group something measurable that the two common alternatives do not, and what does it cost?

## The three paths, on the same chain with the same members

| Path | What it is | Stands for |
|---|---|---|
| **P · Public** | Members send their bids and money openly on NEAR testnet; a public rule settles. No operator. | Most DAO and DeFi coordination |
| **O · Organizer** | Members send money to one organizer account, who decides privately and pays out. | OTC desks, pooled purchases, custodial syndicates |
| **M · Midge** | Members deposit under a fixed policy, seal bids to the Roost, the Roost totals, the contract settles within the policy, and any member can exit alone. | This project |

Not run, compared from cited documentation and marked "not measured by us": Railgun, Aztec, CoW-style batch auctions, encrypted-mempool designs. A multisig baseline (k-of-n signers) is a later addition.

## Measures (the same for every path)

| # | Measure | How it is read |
|---|---|---|
| L | **Leak:** what a stranger learns | An observer reads only public chain data (transactions, state views, logs) and tries to reconstruct each member's private input. Reported as the fraction recovered. |
| T | **Theft:** can the operator take the pot | The operator tries; asserted by whether the funds moved. P has no operator, so its theft test is the settlement rule's. |
| V | **Vanish:** if the operator disappears, can each member get their money back alone, and when | The operator stops responding mid-round; each member tries to recover. Time measured in blocks. |
| C | **Cost** | Gas and fees per member, summed from receipts. |
| S | **Speed** | Wall time from the first bid to funds settled. |
| F | **Failure surface** | What one compromised component can do (asserted by an attempt). |

## Use cases

| Use case | Needs | Status |
|---|---|---|
| Investing together (angel round) | Sum of sealed contributions, one recipient | Runs today |
| Shared AI compute | Sum of sealed credits, pay a provider | Runs today |
| Lending quotes (best offer wins) | A room program that picks the best sealed quote | Needs a new room program |
| Block trade (cross at a reference price) | A room program that matches two sealed sides | Needs a new room program |

## Predictions, written down first

1. **Leak (L), P:** an observer recovers 100% of bids. This is the control.
2. **Leak (L), O:** an observer recovers the amounts sent but not the organizer's decision; the members' inputs are as visible as in P.
3. **Leak (L), M, naive deposits (each member deposits exactly their bid): the observer recovers about 100% of bids from the deposits alone.** I expect Midge's sealing to add nothing here, because deposits are public on NEAR. If this prediction holds, the privacy claim only survives when members deposit a common amount and bid inside it.
4. **Leak (L), M, common deposits (everyone deposits the same fixed amount, bids sealed inside it):** the observer recovers 0% of individual bids and learns only the total paid out, which is public in any settlement.
5. **Theft (T):** P: not possible by one party. O: the organizer takes 100%. M: the contract refuses any payout outside the policy even with a valid signature, so the thief gets 0%, and the Roost cannot exceed the sealed total.
6. **Vanish (V):** P: not applicable. O: members get 0 back without the organizer. M: every member recovers exactly their own remaining share, alone, after the exit timer.
7. **Cost (C):** M costs more per member than P or O, because of the policy deposit, the settlement signature and the exit path. I expect within 3x of P in gas, and a small fixed overhead for the Phala machine.
8. **Speed (S):** O is fastest, P next, M slowest (attestation, sealing, signing). I do not expect M to be under 60 s end to end with a cold Phala machine.
9. **Payout funding:** a payout is funded pro-rata by deposit, not by the bid of its recipient (read from the contract). I predict an experiment will show a member who bid zero still bears a share of a payout.

## What would count as a failure of Midge (stated now)

- Prediction 4 fails: a stranger recovers individual bids even with common deposits.
- Any attempt in T succeeds under M.
- Any member under M cannot recover their own remaining share after the exit timer.
- Prediction 9 fails in the other direction in a way that lets one member take another's funds.

## Limits (every run)

One operator controls every account in every path; this shows behaviour, not independent users. Testnet only; no third-party audit of the contract. The Phala machine and NEAR AI are real, everything else is as stated per experiment. The observer sees only what public RPC and the explorer show.

## Further experiments (after the comparison)

Swarm scale (20 buyers x 5 sellers, 2 to 25 members), the room dying mid-round, front-running observer, Dark Vault live over several rounds, real independent members, coordinator key compromised, room restart, signature reuse elsewhere, racing settlements, exit at the deadline edge, advisor prompt injection, GAP-007 storage griefing, GAP-008 gas exhaustion, a 24-hour Dark Vault.
