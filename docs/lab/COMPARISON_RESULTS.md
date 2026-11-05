# Comparison results: investing together

*Experiment `E-CMP-INVEST-01`, run on NEAR testnet on 2026-11-05. Protocol and predictions: `COMPARISON_PROTOCOL.md` (written before the run). Recorded runs: `docs/lab-runs/20261105T033904Z-0c2a` (FAIL, the contract bug) and `docs/lab-runs/20261105T035414Z-7a52` (PASS, after the fix). Every number below is read from those logs.*

## The setup

Four backers invest 0.01, 0.02, 0.03 and 0.04 NEAR (0.10 in all) into one recipient, three ways, on the same chain with the same fresh accounts. An observer reads only public chain data and tries to recover each backer's amount.

| Path | What it is |
|---|---|
| **Public** | Each backer pays the recipient directly. |
| **Organizer** | Each backer pays one organizer account, which forwards the total. |
| **Midge, deposits equal to bids** | Each member deposits exactly their bid under a fixed policy; bids are sealed to the room; the contract pays the total to the recipient. |
| **Midge, common deposit** | Every member deposits 0.05 and bids inside it; the room totals the sealed bids (0.10) and the contract pays that. |

## Results

| | Public | Organizer | Midge, deposits = bids | Midge, common deposit |
|---|---|---|---|---|
| Bids a stranger recovers from public data | **4 of 4** | **4 of 4** | **4 of 4** | **0 of 4** |
| Gas per member (burnt, from receipts) | 0.4 TGas | 0.6 TGas | 4.1 TGas | 4.2 TGas |
| Wall time, first payment to funds settled | 9.8 s | 11.6 s | 14.9 s | 18.8 s |
| Can the operator take the pot | not applicable | **yes, 100%** | no | no |
| If the operator disappears | not applicable | members recover **0%**; they cannot move money out of the organizer's account | not run in this variant: the round settled in full, so nothing was left to exit | each member recovered their remainder alone (0.025 each) |

## Against the predictions

| # | Prediction | Result |
|---|---|---|
| 1 | Public: an observer recovers every bid | **Held** (4 of 4) |
| 2 | Organizer: an observer recovers every bid sent to it | **Held** (4 of 4) |
| 3 | Midge with deposits equal to bids: sealing adds nothing, the observer reads every bid from the escrows | **Held** (4 of 4). This is a limit of Midge, not of the baselines. |
| 4 | Midge with a common deposit: the observer recovers none | **Held** (0 of 4; every escrow is 0.05, so the escrows say nothing; neither the common deposit nor the total divided by four matches any bid) |
| 5 | Theft: the organizer takes everything; Midge refuses payouts outside the policy and the room cannot exceed its sealed total | **Held.** The organizer moved a 0.04 pot to an account of its choosing and nothing stopped it. Under Midge the room refused to sign 0.20 against a 0.10 sealed total, and the contract refused a validly signed payout to an account outside the policy; the escrow stayed intact. |
| 6 | Vanish: organizer members get 0; Midge members recover their share alone | **Held** (the Midge exit was tested in the common-deposit round, with no contact with the room or the coordinator) |
| 7 | Midge costs more gas than the public round, within about 3x | **Held in direction, missed in size: about 10 times** (4.2 against 0.4 TGas per member). A prediction I got wrong: I had not counted the deposit call and the settlement signature check. |
| 8 | Midge is the slowest | **Held** (18.8 s against 9.8 s), with a local room. A real Phala machine adds about a minute of start-up and attestation. |
| 9 | A payout is funded by deposit, not by the recipient's bid | **Held, and it matters** (below) |

## What this shows, and what it does not

**For "investing together", Midge hides each backer's amount only if everyone deposits the same.** With deposits equal to bids, the privacy gain over a public round is zero, because deposits are public on NEAR. With a common deposit the bids are hidden, but then the contract funds the payout in equal shares: the member who bid 0.01 effectively paid 0.025 and the member who bid 0.04 paid 0.025. So for a round where backers put in different amounts, Midge as built can hide the amounts or can fund them fairly, but not both. A room program that settles each member's own contribution would need the contract to deduct per member, not pro rata. That is a design change, not a bug, and I have not built it.

**What Midge gives that the baselines do not, measured:** no operator can take the pot or pay outside the fixed policy, and every member can leave alone with their own remainder. The organizer path gives members neither. The cost is about ten times the gas of a direct payment and about twice the time, with a local room.

**What this does not show:** independent users (one operator ran every account); a strong public baseline such as a commit-reveal contract; the time and cost of a real hardware room (measured separately in `E-COMBINED-LIVE-01`: a VM costing $0.0019 per run); other privacy systems (Railgun, Aztec, batch auctions), which are compared only from their documentation and not measured here.

## A bug the experiment found

The first run failed. After a 0.10 payout out of 0.20 deposited, one member could not exit and the other three exited with their full deposit. The contract multiplied each member's balance by the payout in a type too small for real amounts and clamped the result (GAP-022). The fix and its tests are in commit `68d6b9d`; the contract was redeployed as `9y8w4PU5…`; the second run above is against the fixed contract. The first run is kept as evidence, not deleted.
