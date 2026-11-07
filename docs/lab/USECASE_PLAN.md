# Use cases that back the claims: plan and predictions

*Written 2026-11-07, before the runs below. The playground (browser first, then testnet) is built on these scenarios. Each use case gets a testnet run against a baseline, a written prediction first, and its limits stated.*

## Order

| # | Use case | Needs | Status |
|---|---|---|---|
| 1 | **Investing together, per-member** | a "pooled" room program; `settle_batch_charged` | next |
| 2 | **Voting / ballot box** | a ballot room program; a tally rule; a roll | planned |
| 3 | **Lending quotes (sealed best quote)** and **block trades** | two room programs | planned |
| 4 | **Token sale / sealed auction (flagship)** | nothing new: polish what ran (`E-CMP-AUCTION-01`) | ran, to be made repeatable and shown |
| 5 | **Playground** | the real Roost and program code bundled for the browser, then a testnet mode | after 1 to 3 |

## Use case 1: investing together, each backer funds their own amount

Earlier result (`E-CMP-INVEST-01`): with a common deposit the amounts stay hidden but the contract funds the payout in equal shares, so a backer who put in 0.01 paid 0.025. Per-member charges let each backer pay their own amount.

**Predictions (written before the run):**

1. **Fair funding holds.** With the pooled program and `settle_batch_charged`, each backer's remainder at exit is their deposit less their own contribution, exactly (0.04, 0.03, 0.02, 0.01 of a 0.05 deposit).
2. **But the amounts are no longer hidden.** The charges are arguments of the settlement transaction, which is public. An observer reading only that transaction recovers every contribution: **4 of 4**, where the equal-share round gave 0 of 4.
3. **So on this contract, for pooled investing, hiding the amounts and funding each backer fairly cannot both be had.** Equal shares hide the amounts and are unfair; per-member charges are fair and reveal the amounts at settlement. Before the escrows are settled (while the round is open) the common deposit still hides everything.
4. The equal deposit still prevents the leak *before* settlement: the escrows an observer reads before the round settles are all equal (0 of 4).

**What would count as a failure of my reasoning:** an observer cannot recover the contributions from the settlement transaction; or a backer's remainder differs from deposit less contribution.

**Not tested here:** hiding the charges (it would need the room to sign per-member receipts that members claim against, trusting the room more, or zero-knowledge proofs). I note it as a design option, not as something built.

## Use cases 2 and 3: what each is and what it does not do

- **Voting.** Sealed votes weighted by deposit; the room tallies and publishes only the result; a double vote and a vote from outside the roll are refused; the result decides whether a treasury payout is made. *Limit stated up front:* the weight is money (the deposit), not people, because the contract cannot tell one person from many accounts.
- **Lending quotes (sealed best quote).** Lenders seal the rate they ask; the lowest rate wins and funds the loan from its deposit; losing lenders are refunded. *Limit:* the contract settles the disbursement only; repayment and default are not enforced.
- **Block trade.** Sealed buy and sell orders cross at a public reference price; matched volume is the smaller side. *Limit:* only the cash leg settles on this contract; the asset leg is not delivered atomically, because the contract moves NEAR and nothing else.

## Not claimed

Independent users, a real counterparty, or hardware for any of these: they run on a local Roost with scripted participants. Each write-up will say so.
