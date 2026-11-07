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

Matched units are the smaller side's total. Buyers with a limit at or above the reference and sellers with a limit at or below it take part; the more aggressive limit fills first, then a fixed order. Every fill is at the reference price. Buyers are charged units x reference; sellers receive the same.

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
