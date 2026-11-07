# Quotes and block trades: plan and predictions

*Written 2026-11-07 before any run. Layman line under each new term. Replaces the JavaScript simulations in `src/facilities/` (`rfq-adjudication.js`, `otc-block-trade.js`), which never touched a host, the contract or a signature.*

## Two room programs

**Best quote** (lending quotes and RFQ). Dealers or lenders seal one quote each; the program picks the best eligible one by a fixed rule.
*Layman:* several lenders whisper a rate to a clerk; the clerk announces only the winner.

| Shape | Who sends sealed quotes | Winner | Money moves |
|---|---|---|---|
| **Lend** | lenders send a rate (basis points) | lowest rate at or under the borrower's limit | the winning lender funds the loan to the borrower; losers pay nothing and get their deposit back |
| **Buy RFQ** | dealers send a price per unit | lowest price at or under the taker's limit | the taker pays the winning dealer units x price |

Pricing is first-price (the winner gets their own quote) or second-price (the winner gets the runner-up's quote).

**Cross** (block trade). Buyers and sellers seal an order (side, units, limit) and the room crosses them at a public reference price.
*Layman:* two desks leave sealed orders; if they overlap at today's posted price the clerk matches the overlap and shows nobody the rest.

Matched units are the smaller side's total. Buyers with a limit at or above the reference and sellers with a limit at or below it take part. *(Original rule: the more aggressive limit fills first. Replaced on 2026-11-07 before any run: see "Revised before any run" below.)* Every fill is at the reference price. Buyers are charged units x reference; sellers receive the same.

## What this does not do (stated up front)

- **Only the cash leg settles.** The contract moves NEAR and nothing else. A loan is funded, but repayment, collateral and default are not enforced. A block trade pays the cash side; the asset side is not delivered atomically.
- **The reference price is given, not verified.** It is supplied when the round runs. No oracle checks it.
- **Recipients are fixed in the rules.** A policy lists at most 8 allowed recipients, so a round has at most 8 borrowers, dealers or sellers.
- **Deposits are public.** To hide quotes, every participant must deposit the same amount.

## Predictions (tested offline first, then on testnet against public baselines)

Offline (`E-QUOTE-PROGRAMS-01`), by construction: the winner is the lowest eligible quote; an ineligible quote never wins; ties go to the fixed order; matched buys equal matched sells; no fill exceeds its order; charges equal allocations; the same inputs always give the same outcome; the room signs only its own outcome.

Testnet comparison (designed, not yet run; each number to be written before its run):
1. **Information leaked.** In a public quote round an observer reads every lender's rate and a public order book shows every desk's size and direction: 4 of 4 quotes and 2 of 2 orders recovered. Sealed: 0, apart from the winner and the clearing price/volume at settlement.
2. **Who wins.** With known private costs, the sealed rounds pick the lowest-cost lender; a public round can be won by a watcher who undercuts at the last moment (the auction result, repeated, not assumed).
3. **Cost of using the room.** Gas and wall time measured, no prediction beyond: I expect the sealed round to cost more per participant than a direct payment and about the same as the public multi-step round, as with auctions.
4. **Failure.** A host that never signs: nothing settles and every participant exits alone with the full deposit.

## Status

2026-11-07: the two programs and their Roost methods (`runQuote`, `runCross`, routes `/quote` and `/cross`) are built. `E-QUOTE-PROGRAMS-01` (offline) passes and is mutation-tested: 13 deliberate breaks, all caught. The public baselines and the testnet comparisons are next. The JavaScript simulations in `src/facilities/` remain for the older verifications and are simulations only.

## Predictions for E-CMP-QUOTE-01 (lending quotes), written 2026-11-07 before the run

Five lenders with private costs of funds (basis points a year): a 450, b 400, c 500, d 600, and s 420 (s watches the chain and can quote late). Borrower: a 0.05 NEAR loan, maximum 700 bps. Public baseline: our own open reverse-quote contract (`contracts/public-market`), where honest lenders open at the maximum and undercut the best by 25 bps down to their cost, then s undercuts by 1 bp near the end. Midge: all five deposit the same 0.05, quote sealed, the host picks the winner; first-price (lenders quote cost + 50) and second-price (lenders quote their cost).

1. **Visibility.** All 4 honest lenders' quotes are public; an observer reading only the quote log attributes a cost within 10% to at least 3 of the 4 (their lowest quote). In the sealed rounds an observer attributes a cost to none of the 5, and the agreed rate is not on chain at all.
2. **Who wins.** The honest public rounds end with b leading at 450 bps. s quotes 449 in the last blocks: either it lands and wins at 449 (a lender with a higher cost than b wins), or it lands late, the contract refuses it, and b wins at 450. I do not predict which; the result is recorded.
3. **Sealed.** First-price: b wins at 450. Second-price: b wins at 420 (the runner-up, s's true cost). The lowest-cost lender wins both, with s present. The borrower's rate: second-price 420, first-price 450, public 449 or 450.
4. **Money.** In each sealed round the borrower receives exactly 0.05, only the winner is charged (exactly 0.05) and every other lender exits with the full deposit.
5. **Dead host.** If the host never signs, nothing settles and all five exit with the full 0.05.
6. **Cost.** Total gas of the first-price round divided by the public round is between 0.5 and 1.5.

## Predictions for E-CMP-CROSS-01 (block trade), written 2026-11-07 before the run

Reference price 0.0005 NEAR per unit. Buyers: B1 100 units, limit 0.00055; B2 50 units, limit 0.000525. Sellers: S1 80 units, limit 0.000475; S2 90 units, limit 0.0005. F (a watcher) joins late. Public baseline: the open order book in `contracts/public-market` (buyers deposit units x limit, sellers nothing). Midge: all participants deposit the same 0.06 and seal their orders; the host crosses.

1. **Visibility.** In the public book an observer reads side, size and limit for every desk: 4 of 4 exactly, and F can see that sell units (170) exceed buy units (150). In the sealed round the escrows are all equal and say nothing; after settlement the chain shows each matched desk's side and filled units (4 of 4) but no limit (0 of 4) and not S2's 20 unfilled units.
2. **Outcome.** Both versions match 150 units at the reference price: S1 sells 80, S2 sells 70, B1 buys 100, B2 buys 50; sellers receive 0.075 NEAR in total and buyers pay the same.
3. **Queue jumping.** The cross fills the more aggressive limit first, so a late seller F with an extreme limit (0.00001) displaces S2's fill in the public book and in the sealed round alike. Sealing does not stop it; this is a property of the priority rule, not of the room.
4. **Dead host.** Nothing settles; all exit with the full 0.06.
5. **Cost.** The sealed round locks more capital (every participant deposits 0.06) than the public book (only buyers deposit). Gas is measured with no prediction beyond: sealed is within 0.3 to 3 times the public.

## Revised before any run: the cross is pro-rata (2026-11-07, 10:50 UTC)

**What was wrong.** The cross above filled the most aggressive limit first. Everyone trades at the reference price, so an extreme limit (a seller asking almost nothing, a buyer offering far more than needed) costs nothing and moves that trader to the front. Sealing the orders does not stop it: a trader can set an extreme limit without seeing anyone else's order. My own prediction 3 for E-CMP-CROSS-01 (below, kept) treated this as an accepted property of the rule. A reviewer pointed out it is a flaw, and the fix is cheaper before the run than after, so it was changed first. No experiment had run.

**The rule now.** The limit decides **only who qualifies**. Matched units are the smaller side's total. The short side is filled in full; the long side is filled in proportion to order size (largest remainder, ties to the fixed order). A public per-order cap (`max_units`) clamps any one order's size.

**What this does not fix.** Pro-rata invites over-ordering, because a trader pays only for what is filled. The public cap limits this but does not remove it: every trader can still claim up to the cap. Sellers' size cannot be bounded by a deposit (the asset leg is not on this chain). A reference price that is given, not verified, remains an input.

**Regression evidence.** The new tests fail against the old priority rule (six assertions, including the extreme-limit and "the limit decides nothing but qualifying" checks) and pass on the fix. Mutation tests: 12 of 13 deliberate breaks of the program and host are caught, the 13th being an equivalent mutant (pro-rating a side that is already the short side gives the same answer); the public contract's 11 breaks are all caught after one test was added.

**Revised predictions for E-CMP-CROSS-01.** Prediction 2 now reads: both versions match 150 units at the reference price with the pro-rata split S1 71 and S2 79 when F is absent. Prediction 3 now reads: **F, a late seller with an extreme limit (0.00001) and 40 units, gets no queue position.** With F present the sell side is 210 units for 150 matched, so the fills are S1 57, S2 64 and F 29 in the public book and in the sealed round alike, and F gets exactly what it would get with a limit equal to the reference. Under the old rule F would have filled 40 first and displaced S2 to 30. The public cap in both versions is 100 units.
