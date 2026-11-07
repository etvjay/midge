# Programme: the next use cases, in build order

*Written 2026-11-07. Each item follows the lab loop: limits and predictions written before the run, a public or multisig baseline, a testnet run, an independent audit, mutation tests, and a kept failing run when a prediction fails. Layman line under each new term. Deadline: 14 November (7 days).*

## Honest scope

Eight items plus the playground is more than a week of live-tested work. Order is by what each item needs from the previous one. The first four are the core; the rest are cut candidates, listed with what is lost if they are cut.

| # | Item | Needs | Tier |
|---|---|---|---|
| 0 | **Multisig baseline** | nothing | core (every comparison below needs it) |
| 1 | **Voting and ballot box** | signed inputs (done), item 0 | core |
| 2 | **Payroll, invoicing, receipts, accounting views** | item 0, a receipts layer | core |
| 3 | **RFQ, both sides** (taker buys or sells, makers quote) | the quote program (done) | core |
| 4 | **Playground** | items 1 to 3 as scenarios | core |
| 5 | **Order book with makers and takers** (batch matching, speed and confidentiality measured) | item 3 | next |
| 6 | **Ongoing groups** (several rounds, live) | any program | next |
| 7 | **Rooms that interact** | a design decision | cut candidate |
| 8 | **Paying out on other chains** | a contract change and funded testnet addresses | cut candidate |

## 0. Multisig baseline

A plain on-chain m-of-n treasury: an owner proposes a payment, signers approve in public, anyone executes at the threshold. *Layman: three of five trustees must sign the cheque, and everyone can read who signed.* It is the baseline for voting (a vote by approvals), payroll (a pay run) and quotes (an organizer picks). It trusts the signers: a majority can pay anyone.

## 1. Voting and ballot box

A ballot program: the options are fixed recipients set when the room opens; members seal one choice each, signed by their own key; a later signed ballot replaces an earlier one (re-voting); a quorum and a majority rule decide; only the winner is published, never the tally; the winner decides where the pool goes. *Layman: everyone drops a signed envelope in a box, the clerk announces only who won, and the money goes there.*
**Baselines:** an open on-chain vote; the multisig. **Measured:** votes an observer can infer; how far a last voter can swing an open vote; double and outsider votes refused; the dead-host exit; two hosts.
**Limits up front:** the weight is money (a deposit), not people. No coercion resistance beyond re-voting. A unanimous result is visible only if the tally is published, which it is not, but the count cannot then be checked except by trusting the host (two hosts reduce that).

## 1b. Voting: done

Run on 2026-11-07: see `VOTE_RESULTS.md` (`E-CMP-VOTE-01` PASS). The multisig baseline (item 0) is built and was used in that run.

## 2b. Payroll: done

Run on 2026-11-07: see `PAYROLL_RESULTS.md` (`E-CMP-PAYROLL-01` PASS), including the expected weakness that stable distinct salaries link a person across months by amount.

## 2. Payroll, invoicing, receipts and accounting views

The settlement publishes who is paid and how much, so the amounts cannot be hidden from the chain. What can be hidden is **who the payee is**, and what can be added is **a private paper trail**:
- **Unlinkable payout addresses.** Each pay run pays fresh one-time addresses. The room, not the chain, knows which person each belongs to. *Layman: the cheque is made out to a fresh account number only your employer's clerk can match to your name.*
- **Signed receipts and statements.** The host issues each payee a signed, encrypted receipt (invoice id, period, gross, deductions, net) and an employer-level statement; an auditor gets only category totals. The root of all receipts goes into the signed order hash, which the contract already records, so anyone can check that a receipt belongs to the run without seeing the others. *Layman: you get a stamped statement of your own pay; the auditor gets the totals; the public gets a seal that the totals are real.* This is the **sub-transaction view**: each party sees its own lines.
- **Limit:** a settlement pays at most 8 recipients, so a larger pay run is several settlements. The amounts are public. Receipts prove a payment to its payee; they do not stop a dishonest host from issuing a wrong receipt (two hosts reduce that).
**Baselines:** a public pay run (every name and amount visible); the multisig. **Measured:** how many payees an observer can name from the chain (public: all; unlinkable: none), whether each payee verifies their own receipt against the on-chain root, whether a tampered receipt fails, and whether the auditor's view reveals only totals.

## 3b. RFQ, both sides: done

Run on 2026-11-07: see `RFQ_RESULTS.md` (`E-CMP-RFQ-01` PASS). Makers quote two ways; the taker's side stays sealed.

## 3. RFQ, both sides

The quote program today covers lending (lenders quote a rate) and a taker who buys (makers quote a price, lowest wins). Add the taker who sells: makers quote a bid, the highest wins. *Layman: you ask several dealers for a price to buy or to sell; only the best answer is announced.* **Baselines:** an open quote round; the multisig/organizer. **Measured:** as for lending quotes, plus whether the right side wins in both directions.

## 4. Playground

The real host and program code in the browser (pure JavaScript, already), real rules, a sealed-versus-open side-by-side for the scenarios above, clearly labelled a simulation of the chain; then a mode that runs the same scenario on testnet with a wallet. The browser run is the same code the lab tests.

## 5. Order book with makers and takers (frequent batch matching)

Continuous matching rewards speed, so a watcher beats a slower trader. A **frequent batch auction** collects orders for a short epoch and clears them all at one uniform price, which removes the race; the epoch length is the speed knob. *Layman: instead of "first to shout wins", the clerk collects shouts for a few seconds and trades everyone at one fair price.* Makers rest limit orders; takers cross them; partial fills pro-rata at the margin; a new signed order replaces an old one (cancel/replace).
**Measured:** latency from order to fill against epoch length; throughput; what an observer sees; whether a watcher can front-run (open book: yes; sealed batch: no). **Not in v1:** margin, leverage, funding and liquidation. The contract moves NEAR only, so a perpetual's margin and liquidation are not enforced by anything here; calling it a perp book would be false. v1 is a spot-style book with collateral deposits.

## 6. Ongoing groups

A room that lasts several rounds (Dark Vault): deposits between rounds, partial settlements, the exit timer restarting each epoch. Contract tests exist; it has never run live. A live run of three rounds with any of the programs above.

## 7. Rooms that interact (design first)

The simplest sound form: one room's settlement pays into another room's deposit, so a group can fund a sub-group. That needs the paying room's rules to allow a recipient that is itself a room, and care that a payment into a room cannot be pulled back out except by that room's exit. A written design and a decision come before any code. *Layman: a department's budget is paid into another department's account, under both departments' rules.*

## 8. Paying out on other chains

The NEAR contract would ask the Chain Signatures MPC to sign a payment on Ethereum, Bitcoin or Solana, bound to the room's rules. Today that path is a simulation apart from one verified signature. The first milestone is only to sign and broadcast a Sepolia transfer from a derived address funded from a faucet; binding it to a room's release policy is a second, larger contract change.

## Order of work, and what gets cut first

0, 1, 2, 3, 4 are the core. If time runs short the cuts, in order, are 8, 7, 5, 6; each cut item stays in the repository as a written design. Every item's predictions are written into this folder before its run, as with the quote and cross runs.

## Predictions for E-CMP-VOTE-01 (voting), written 2026-11-07 before the run

Five members m1 to m5 each put 0.02 NEAR into a pool of 0.1. Two options: A (recipient ra) and B (recipient rb). Preferences: m1, m2 and m5 prefer A; m3 and m4 prefer B. Quorum 50%, majority rule. Three paths: an **open poll** (our own contract, votes public, a later vote replaces an earlier one); **Midge sealed ballot** (signed ballots, equal deposits, the host counts); a **3-of-5 multisig** whose signers are the five members and which pays whatever three of them approve.

1. **Visibility.** In the open poll an observer reads all 5 votes by account (5 of 5), and before the last vote the public tally is 2 to 2 so the fifth voter knows their vote decides. In the sealed ballot an observer reads 0 of 5 votes; the settlement carries no tally and no turnout, only the pool paid to the winner's recipient and equal charges on all five.
2. **Outcome.** With honest voting both the open poll and the sealed ballot pay the whole 0.1 NEAR to ra (A wins 3 to 2).
3. **Outsiders and doubles.** A non-member's vote is refused or ignored in both. A member voting twice counts once.
4. **The latest vote counts.** In the sealed ballot a re-vote changes the result: with first ballots m1 B, m2 B, m3 B, m4 A, m5 A the host would pay B (3 to 2); after m1 and m2 re-vote A with a higher sequence number it pays A (4 to 1). *(Revised before the run: the first wording, that m3 and m4 switch to A, would not have changed the winner.)*
5. **Multisig.** Three of the five signers can send the whole pool to an address outside both options (a thief) and it works; under Midge a payout to a recipient outside the rules is refused by the contract even with a valid host signature (a signing key we hold stands in for a compromised host), and the escrow is intact.
6. **Dead host.** If the host never signs, nothing is paid and all five exit alone with the full 0.02.
7. **Cost.** Total gas of the sealed ballot over the open poll is between 0.5 and 3.

## Payroll design and predictions (E-PAYRUN-PROGRAM-01 offline, E-CMP-PAYROLL-01 on testnet), written 2026-11-07 before either runs

**Shape.** The employer is the only member: it deposits the funds and seals one signed pay run (per person: one-time payout address, invoice id, period, gross, tax withheld, benefits). The host checks the arithmetic (net = gross − tax − benefits), pays each person's **net** to their one-time address, pays the **tax total** to the tax authority and the **benefits total** to the benefits provider as one transfer each, and charges the employer the gross total. At most 8 recipients per settlement: 4 people + tax + benefits = 6.
**Receipts.** For every line the host builds a receipt, hashes it into a Merkle tree, signs each receipt hash with its settlement key, and encrypts each statement to its owner's key: the person gets their own receipt and Merkle proof; the employer gets every line; an auditor gets category totals only (gross, tax, benefits, net, headcount: no names, addresses or individual amounts). The settlement's order hash is `sha256("midge-payrun-v1:" + runId + ":" + receiptsRoot)`, which the contract records, so a person can recompute it from their proof and compare it with the chain. *Layman: you get a stamped statement of your own pay; the auditor gets the totals; the chain carries a seal that you can check your statement against.*
**What stays public, said first.** Every payment's address and amount. A tax total and a benefits total are public too.

**Offline predictions (E-PAYRUN-PROGRAM-01):** net = gross − tax − benefits for every line and the allocations sum to the employer's charge; a person decrypts their own statement and no one else's; the host signature and the Merkle proof verify, and a changed amount, a wrong proof or a wrong root each fail; the order hash recomputes from the root; the auditor statement contains no name, address or individual amount; more than 8 recipients, an unbalanced line or a pay run not sealed by the employer is refused; two hosts produce the same root and order hash; the host signs only the allocations and charge it computed.

**Testnet predictions (E-CMP-PAYROLL-01):** employees e1 to e4 with gross 0.05, 0.04, 0.03, 0.02 NEAR, tax 15% and benefits 5% of gross, paid in two consecutive months with the same salaries. Public path: the employer pays the four employees' reused addresses directly.
1. **Public payroll.** An observer links 4 of 4 payees across the two months by address and reads every net, tax and benefits amount; given one leaked address (e1's) the observer reads e1's pay in both months.
2. **Midge, fresh addresses.** The observer links 0 of 4 payees across the months **by address**. **But the observer links 4 of 4 by amount alone**, because the four salaries are distinct and unchanged, so a single leaked address still exposes that person's pay in both months. Private who is therefore weaker across runs than within one run; this is an expected result, not a surprise.
3. **Receipts.** Each of the 4 people verifies their own receipt (host signature, Merkle proof, and the order hash recomputed from the root equals the one on chain); a receipt with a changed amount fails; the auditor's totals equal what the chain shows (net paid to the four addresses + tax + benefits = the employer's charge minus nothing); a person's receipt breakdown (net, tax, benefits) matches the sub-transactions: their net equals the transfer to their address, and the four tax lines sum to the one tax transfer.
4. **Money.** In each month the employer is charged exactly the gross total (0.14), each address receives exactly its net, the tax authority and the benefits provider receive exactly their totals, and nothing else moves.
5. **Dead host.** If the host never signs, nothing is paid and the employer exits alone with the full deposit.
6. **Cost.** ~~Gas of one Midge pay run over one public pay run is between 0.5 and 5.~~ *Revised before the run, 2026-11-07:* the investing comparison measured Midge at about ten times a direct payment, and a public pay run is six plain transfers, so I now predict Midge uses between 3 and 20 times the gas of the public pay run. (The first band was optimistic given that earlier measurement.)
**Not tested:** a multisig-approved payroll (it adds approvals but is as public as the direct run), and payees that rotate their keys.

## Two-sided RFQ: design and predictions (E-RFQ-PROGRAM-01 offline, E-CMP-RFQ-01 on testnet), written 2026-11-07 before the live run

**Shape.** One taker and four makers. The taker seals a request (side, units, limit, a secret salt); each maker seals a **two-way quote** (a bid and an ask), so a maker never learns which way the taker trades or how much. A buy goes to the lowest ask at or under the limit, a sell to the highest bid at or over it. On a buy the taker is charged and the winning maker paid; on a sell the winning maker is charged and the taker paid. *Layman: you ask four dealers for a two-way price without saying whether you are buying or selling; only the winner is announced.* **Baseline:** an open RFQ where the taker states side, size and limit on chain and makers quote one way.
**A finding from the offline work:** the order hash is public and a hash of (units, price) can be brute-forced, so the request carries a secret salt that goes into it; without one the host refuses. The highest direction of the best-quote program, which the sell side depends on, had never been tested before this; it is now (and was correct).

**Live predictions.** Makers' true two-way quotes (NEAR per unit): m1 bid 0.00195 ask 0.00205; m2 0.0019 / 0.0020; m3 0.00197 / 0.0021; m4 0.00185 / 0.00215. 10 units. Buy limit 0.0022, sell limit 0.0018. Open path: makers quote the side that was announced, in improving order. Sealed path: all five deposit the same 0.03 into one room and the two RFQs run as two rounds of it.
1. **Visibility.** Open: an observer reads the taker's side, size and limit (3 of 3) for both RFQs and every maker's one-sided quote (4 of 4), and every maker sees the side before quoting. Sealed: 0 of 3 of the taker's side, size and limit and 0 of 4 makers' quotes before settlement. The settlement shows who paid whom and the notional, so the side leaks at settlement; it does not show units or price per unit, and the notional does not identify them (more than one whole-unit price gives the same notional).
2. **Winners.** Buy: m2 at 0.002 in both paths. Sell: m3 at 0.00197 in both.
3. **Money.** Buy: m2 receives exactly 0.02 and the taker is charged exactly 0.02. Sell: the taker receives exactly 0.0197 and m3 is charged exactly 0.0197. Nothing else moves. In the sealed room the second round runs on the room's rotated nonce after the first settles part of the escrow.
4. **Dead host.** If the host never signs, nothing settles and all five exit with the full 0.03.
5. **Cost.** Gas of the sealed path over the open path (both RFQs, deposits and settlements, no exits) is between 0.5 and 4; the sealed RFQs finish faster than the open ones (an open RFQ runs for its window).
**Not tested live:** second-price (tested offline), a sniper (shown for lending quotes), and the asset leg (only cash moves).
