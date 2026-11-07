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

## Ongoing groups: predictions (E-ONGOING-01 on testnet), written 2026-11-07 before the run

An ongoing group is a Dark Vault: it lasts across rounds, takes deposits between them, and each settlement that leaves money behind starts a new epoch. No open baseline exists for this (it tests the contract's lifecycle claims); the comparison is against what the contract says.

**A. A real life.** Four members deposit 0.1 each into a Dark Vault (25% release cap, 16-block exit timer). Round 1 is an investing pool (0.05 to rp); a fifth member then deposits 0.1; round 2 is a ballot among all five (0.05 to the winner, `ra`); round 3 is a lending quote (0.04 loan to rl, won by u3 at 400 bps). One host serves all three rounds with three different programs.
1. The epoch rises by exactly 1 per settlement and the round nonce changes each time.
2. The late member deposits between rounds and is then counted in round 2 and charged correctly; after every round the members' escrows sum to the group's total.
3. Replaying round 1's signed settlement after round 2 is refused (nonce mismatch) and changes nothing.
4. The exit timer restarts each epoch: an exit right after round 3 is refused even though far more than 16 blocks have passed since the group was opened; 16 blocks after the last settlement every member exits alone with exactly deposit minus charges: u1 0.08, u2 0.08, u3 0.035, u4 0.075, u5 0.09 (total 0.36).
**B. The cap (predicted from reading the code, expected to be a weakness).** The cap is a share of the group's *current* escrow at each settlement, and the epoch advances by settlement, not by time. With a key we hold standing in for a compromised host, a payout above 25% of the current escrow is refused (0.11 of 0.4), but three payouts of exactly 25% of the current escrow succeed back to back (0.1, then 0.075, then 0.05625), releasing 0.23125 of the original 0.4, that is 57.8% against a stated 25% per epoch. If this holds it is a design weakness (a new gap), not a pass: the "per epoch" cap does not bound how fast a compromised host can drain the group.
**Not tested:** a baseline, many members, or a very long-lived group.


## GAP-024 fix: predictions for the live re-run of E-ONGOING-01, written 2026-11-07 before it ran

**What the fix is, in real time.** A release window lasts twice the exit timer. Within a window the total released may not exceed the cap times the escrow at the window's start plus deposits since. A Dark Vault's epoch and exit timer advance with a new window, not with every settlement. **The limit is only as strict as the timer.** Testnet blocks are about 0.57 s (measured), so a 24-block timer, which this experiment uses, gives a window of 48 blocks, about 27 seconds: a compromised host could still release 25% every half minute, and about 90% in eight windows, under four minutes. A one-hour timer (about 6,300 blocks) gives a two-hour window and the same 90% would take about 16 hours; it also makes members wait up to an hour to exit. The contract accepts any timer of 1 block or more and the timer is not part of the policy hash depositors consent to, so a group opened with a tiny timer has no effective pacing. **The timer must be chosen on purpose for a real group; the 16 and 24 blocks used in tests are not a recommendation.**

**Predictions (part B, a key we hold standing in for a compromised host, cap 25%, timer 24 blocks):**
1. A payout of 0.11 of 0.4 is refused; a payout of exactly 0.1 succeeds.
2. A second payout of 0.075 (25% of the remaining 0.3), straight after, is **refused** with the cumulative-release message, and so is any further payout, even 0.001, inside the same window. Nothing moves.
3. After the window ends (48 blocks after it opened) a payout of 0.075, 25% of the then-current 0.3, succeeds: the allowance returns in a new window sized to the escrow then.
4. The window's length in real seconds is read from the chain and the implied time to release 90% at this timer and at a one-hour timer is reported.
5. Members can still exit after the timer with exact remainders.
**Part A, changed to match the new rule (each round waits for the previous window to end, so each round opens its own window):** the epoch still rises by exactly 1 per round; a fourth, small round inside the third round's window **does not** advance the epoch or move the exit timer's start, and the members can exit at the window's start plus the timer, which is **earlier** than the fourth settlement plus the timer (the old rule would have locked them out until then). An exit straight after round 3 is refused while the timer from the window's start has not elapsed.

*Correction, 2026-11-07, after the re-run:* releasing 90% at a 25% cap takes 9 windows, not 8 (8 windows leave 10.01%), so the one-hour-timer figure above, "about 16 hours", is about 18 hours; at the 24-block timer it is about 247 seconds. All predictions for part A and part B held (73 of 73 assertions, run `20261107T134236Z-af24`).


## GAP-025 fix: predictions for the live check (E-TIMER-CONSENT-01), written 2026-11-07 before the contract was redeployed

**What the fix is, in plain words.** When you put money into a group you agree to its rules, and the contract checks that you name the same rules. The rules used to leave out the exit timer, so a group could be opened with a one-block timer and nobody who deposited would ever have agreed to it. Now the timer is part of the rules you agree to, and a timer shorter than 10 blocks (about 6 seconds) is refused. The 10 is a sanity floor, not a recommendation: a real group must still choose its timer on purpose, and the release limit is only as strict as that timer.

**The side-agent note, adopted:** the protection works only if the depositor's app works out the hash from the terms the person expects. A client that asks the contract for its hash and sends it back always passes. The client now refuses to do that (offline experiment `E-DEPOSIT-CONSENT-01`, 7 mutations caught).

**Predictions (testnet, after redeploy):**
1. A hatch with a 9-block timer is refused with the floor message; the group does not exist afterwards and the group count is unchanged.
2. A hatch with a 12-block timer succeeds. Its stored hash equals the version-2 hash computed independently in the experiment, and `get_policy_terms` reports 12 blocks, a 24-block window and `timer_in_consent_hash: true`.
3. A deposit using the old formula (no timer) is refused; a deposit that assumed a 300-block timer is refused; neither changes the escrow. A deposit naming the real timer (12) succeeds.
4. **The 15 groups that existed before the deploy are intact:** the group count is unchanged by the deploy, at least one of them reads back with its stored hash unchanged, and `get_policy_terms` reports `timer_in_consent_hash: false` for it, so anyone reading it knows its timer is not covered.
5. **A weakness I expect to remain:** groups opened before this change still have a timer their depositors never agreed to. The view marks them, nothing more.

**Not tested:** that a real person reads the terms before depositing (the check is in the software, not in people); a floor above 10 (the right floor depends on what the group holds and how fast its members can react).


## `runRoom` slice 1: predictions (E-ROOMSERVICE-01, offline), written 2026-11-07 before any code

**What slice 1 is.** A new module, `RoomService`, in front of the host with one room kind (the vote). Design: `docs/RUNROOM_DESIGN.md`. In plain words: one small door that takes sealed inputs, runs the vote, and hands back the finished contract call, instead of five hand-copied steps.

**Correction to the design, found while writing the tests:** signed inputs are bound to the open round, so the round must be opened before anyone submits. The service therefore has a fourth verb, `open(round)`, and `run` must be given the same round. Also, the host clears its queue when a round runs, so retry-safety needs the service to remember the last result: an identical repeat returns the same result, anything different is refused until a new round is opened.

**Predictions (through the service interface only):**
1. `describe()` lists exactly one program, `ballot`, with its parameters, and reports the host's settlement key.
2. A five-member vote (A, A, A, B, abstain) returns winner A and a ready contract call: method `settle_batch_charged`, with the six arguments the contract takes; the signature verifies against the host's key over the message rebuilt independently from those arguments.
3. **Parity:** the result's order hash, allocations and charges equal what the old path (`runBallot` then `signSettlement`) gives on a twin host with the same inputs.
4. A tie decides nothing: `settlement` is `null`, there is no order hash, and nothing was signed (a later settlement signature for that round is impossible).
5. Typed errors, each with its code and with the queue unharmed: unknown program (`UNKNOWN_PROGRAM`), bad parameters (`INVALID_PARAMS`), run with no inputs (`NO_INPUTS`), run before a round is opened or for another round (`ROUND_NOT_OPEN`), a forged or unsigned input (`NOT_AUTHORISED`).
6. A refused run changes nothing: after a bad-parameter run, the same inputs still run correctly.
7. Idempotence: running the same vote twice returns the identical result and signs once; running anything different after a decided vote is refused with `ALREADY_SIGNED` until `open` is called again.
8. The result never contains a submitted ciphertext, and its outcome has no tally.
9. The registry is real: a second program passed to the constructor is listed and runs through the same three verbs.

**Not tested:** the other six programs, the adapters (MCP, REST, SSE, SDK), a hardware host.
