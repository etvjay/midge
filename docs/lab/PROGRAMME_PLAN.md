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


## `runRoom` slice 2: predictions (E-ROOMSERVICE-02, offline), written 2026-11-07 before any code

**What slice 2 is.** The other six room kinds (pool, auction, quote, cross, RFQ, pay run) join the vote behind the same four verbs. In plain words: every kind of room now has the same door.

**Predictions:**
1. `describe()` lists seven programs: ballot, pool, auction, quote, cross, rfq, payrun, each with its parameters.
2. **Parity, per program:** on a twin host with the same inputs, the service returns the same order hash, allocations, charges and outcome as the old path. (Hosts use deterministic order so the two are comparable.)
3. Every decided run returns a ready contract call whose signature verifies against the host's key over a message rebuilt independently; the method is `settle_batch_charged` for all six (each carries per-member charges).
4. A run that decides nothing (no eligible quote, no crossing orders, a sold-out reserve, no winning RFQ quote) returns a null settlement and signs nothing.
5. A table of wrong parameters per program (wrong type, missing, out of range) returns `INVALID_PARAMS` every time, never `INTERNAL`, and leaves the queue as it was.
6. **Confidentiality of extras:** a pay run returns its receipts only as sealed statements (one per payee, one for the employer, one for the auditor) and the result contains no payee name or amount in the clear; an RFQ's terms (side, units, price) are left out unless the caller asks with `includeConfidential: true`.
7. Programs needing signed inputs (RFQ, pay run, vote) refuse an unsigned host with a typed code; the others work on an unsigned host.
8. Existing behaviour holds: retry-safety, `ALREADY_SIGNED`, typed errors (the slice-1 tests still pass).

**A weakness I expect to remain:** the existing host route for an RFQ already returns the plain terms to whoever calls it; slice 2 does not change that route, it only keeps `RoomService` from adding to it.

**Not tested:** the adapters, a hardware host, a testnet settlement through `RoomService`.


## `runRoom` slices 3 to 6: predictions, written 2026-11-07 before any code

In plain words: the one door (`RoomService`) now gets four ways in (web API, AI-agent tools, a live event stream, a code library) plus a ready-made practice room. Each way in only translates; none contains room logic. Experiments `E-ROOMSERVICE-03` to `-06`, offline, real HTTP on a local port.

**Correction to the design:** MCP needs four tools that mirror the four verbs (describe, open, submit a pre-signed input, run), not two. The coordinator who opens and runs a round and the members who submit are different principals, and a secret key must never pass through a tool argument, so a member's input arrives already signed.

### Slice 3: web API (`/v1/rooms`), OpenAPI document, rate limits, SDK
1. `GET /v1/rooms` returns the description (seven programs) with no key.
2. Opening a round and running one need the coordinator key (`X-Roost-Admin-Key` or `Authorization: Bearer`); without it or with a wrong one, 401. Submitting an input needs no key, only a valid member signature.
3. A full vote over HTTP (open, five signed inputs, run) returns the same settlement as calling the service directly on a twin host.
4. Every error code maps to one status and one body shape `{ error, code }`: INVALID_PARAMS 400, NOT_AUTHORISED 401 (no key) or 403 (forged input), UNKNOWN_PROGRAM 404, ROUND_NOT_OPEN / NO_INPUTS / ALREADY_SIGNED 409, INTERNAL 500 with no stack. Unknown route 404, wrong method 405 with `Allow`, bad JSON 400, oversized body 413, all in the same shape.
5. Rate limit: past the per-client limit, 429 with `Retry-After`; `X-RateLimit-Limit/Remaining/Reset` on every response; the allowance returns after the window; another client is unaffected.
6. An RFQ's plain terms appear only with `includeConfidential: true` and the coordinator key.
7. `GET /v1/rooms/openapi.json` is a valid OpenAPI 3.0 document that documents exactly the routes the router serves (a drift test compares both lists), every program's parameter names, every error code, and the key scheme.
8. The SDK (`RoomsClient`) returns the same results over HTTP and raises `RoomError` with the server's code.
9. Responses carry `cache-control: no-store`.

### Slice 4: MCP (tools, stdio and streamable HTTP)
1. `tools/list` shows the four new tools and still the ten old ones. None has a secret-key parameter.
2. A vote through the tools gives the same settlement as the service.
3. One dispatcher serves stdio and HTTP; the same request gives the same response on both.
4. Over HTTP (`POST /mcp`): initialize, list and call work; a notification gets 202; `GET` gets 405; open and run need the coordinator key, describe and submit do not; tool errors come back as JSON-RPC errors carrying the room error code; the same rate limit applies.

### Slice 5: live events (SSE)
1. `GET /v1/rooms/events` streams `round_opened`, `input_accepted` (a count only), and `round_run` (program, decided yes/no, order hash). No flyer id, no ciphertext, no outcome detail.
2. A run that decides nothing reports `decided: false`.
3. Each event has an id; reconnecting with `Last-Event-ID` replays what was missed (ring of the last 100).
4. A client cap (503 beyond it), cleanup on disconnect, and a heartbeat comment.

### Slice 6: a practice room (`createDemoRoom`)
1. One call builds a labelled-simulation room with generated member keys and a helper that signs and seals an input; `describe()` says simulated.
2. All seven room kinds run end to end through it.
3. The same vote through HTTP, the SDK and MCP gives the identical settlement (cross-surface parity).
4. It holds no real key and cannot be pointed at a real chain.

**Not tested:** a browser bundle, a hardware host, a testnet settlement through these adapters, load beyond the rate-limit and client-cap tests.

## Escrow-bound charged rounds (audit lead 9): predictions, written 2026-11-08 before the experiments exist or run

**What it is, in plain words.** The contract refuses a charged payout if any member is charged more than they hold, and one such member sinks the whole round. The Roost now reads, from the contract, what each bidder holds, at one block, from two or more providers, and leaves out anyone who cannot cover their worst case. It also lets the coordinator give up a signed round the contract rejected, and says when no member could possibly leave before the payout lands. This **narrows** rejections; a member whose exit timer has run can still leave between the read and the payout, so it is "much rarer", not "impossible".

**E-ESCROWBOUND-01 (offline; the real reader against stub providers, the real host and service).** Predictions:
1. A bidder with no escrow is left out and named (account only); everyone else is charged; the settlement signs. The block read is inside the signed order hash and two different blocks give two different hashes.
2. A provider that is down, slow, behind, or disagrees about a balance or the exit timing makes the run answer UNAVAILABLE and leaves the queue as it was.
3. `raceFree` is true only when height + 30 is below the first block at which anyone could leave; unknown timing is never race-free.
4. A signed round cannot be re-opened with the same nonce, `abandon` makes it possible, and the abandoned order hash is on record.
5. A roll member who never voted and cannot pay is left out of a ballot.

**E-ESCROWBOUND-LIVE-01 (testnet; the real contract, real providers).** Three members A, B, C and a recipient. A and C deposit 0.02 NEAR each; B never deposits. A pool round has all three put in 0.01.
1. **Baseline.** Without the reader the signed settlement (A, B, C at 0.01 each) is **rejected by the contract** with the over-escrow message; afterwards the group is unchanged: escrow 0.04, same round nonce, nothing in flight.
2. **Stuck, then unstuck.** Re-opening the same round is refused by the host; `abandon` succeeds and records the abandoned order hash.
3. **With the reader.** `bindEscrow` reads a real block from two providers; B is left out and named; the charges are A and C at 0.01; the settlement is **accepted** and lands: A and C hold 0.01 each, the group holds 0.02, the nonce has changed, and the recipient receives 0.02.
4. `raceFree` is **false** (the 10-block exit timer ran out long ago), so the live result is honest about the race it does not remove.
5. With one provider replaced by a dead address the read fails closed (UNAVAILABLE) and the queue is kept.
6. Teardown leaves nothing behind: the group is pruned, every account deleted, the group count equals the count before the run.

**Not tested live:** the race itself (a member exiting between the read and the payout); that two providers can disagree in practice; behaviour under a provider that lies. **Weakness I expect to remain:** the check trusts the providers to answer honestly, and one operator controls every account in the run.


### Results: escrow-bound charged rounds (written after the runs; the predictions above were not edited)
Run `20261108T081854Z-d13c`, 3 repeats of each experiment, log verified (254 events), promoted to `docs/lab-runs/20261108T081854Z-d13c`. **All predictions held.** E-ESCROWBOUND-01 (offline) 3/3 PASS. E-ESCROWBOUND-LIVE-01 (testnet) 3/3 PASS: the baseline settlement that charged the unfunded member was rejected by the contract and left the group unchanged; the host refused to re-open the signed round and `abandon` recorded it; with the reader (test.rpc.fastnear.com + rpc.testnet.near.org) the unfunded member was left out, the settlement landed and the recipient received exactly 0.02; `raceFree` was false; one dead provider failed the read closed with the queue kept; every account was deleted and the group count returned to its starting value.

**One of my own assertions was wrong, not a prediction:** the first offline run failed because I had asserted the second settlement must differ from the first, which the committed prediction did not say; with the deterministic test mode the same inputs at the same block give the identical settlement, which is harmless. I changed the experiment to re-submit a changed bid.

**What this does not show.** The race itself, a provider that lies, or the hosted Roost (the image is not rebuilt). It trusts the providers.


### Results, second run (after a fresh review of the branch; the predictions above were still not edited)
Run `20261108T103619Z-433a`, 3 repeats of each experiment, log verified (260 events), promoted to `docs/lab-runs/20261108T103619Z-433a`. **All predictions held again**, now against the reader as corrected by the review. It supersedes `20261108T081854Z-d13c` as the evidence for this feature.

What changed between the two runs, openly: (1) every provider now vouches for the block by hash and every reply must come from it, which the live run confirmed against `test.rpc.fastnear.com` and `rpc.testnet.near.org`; (2) **`raceFree` was tightened** (prediction 3 and 4 of the live experiment said height + 30; the definition now also counts the read's age and the 30 s a read may be used, so it is stricter and the experiment's numbers were updated, not the prediction text); (3) auction and cross worst cases were corrected (an exact-boundary test per program now exists); (4) the offline experiment's stub providers had to be updated for the stricter reader and one assertion of mine was arithmetic-wrong (an exit at 4190 where I meant 4110). The live prediction text says a "10-block" exit timer; the experiment uses 12 blocks. Neither matters to the result: the timer ran out long before the read.

**Still not shown.** The race itself, providers that lie, a two-room settlement run live, and the hosted Roost (the image is not rebuilt).


## Hosted Roost with the escrow check on: predictions, written 2026-11-08 before the experiment exists or runs

**What it is, in plain words.** The hosted Roost's image already contains the escrow check. Until now it was off on the VM, because turning it on means writing two settings into the compose file, and that file is part of what the VM's attestation measures. They are now written there on purpose. A member who verifies the Roost therefore also verifies which providers it asks and which contract it reads. The check was only ever tested with a local host; this tests it inside a real confidential VM.

**E-HOSTED-ESCROW-LIVE-01 (hardware: a real Phala TDX VM, the real testnet contract, the real providers).** Three members A, B, C and a recipient. A and C deposit 0.02 NEAR; B never deposits. All three bid 0.01 into a pool round run by the VM.
1. **The VM starts and attests on the new image.** The compose file in the repo is pinned to `cde03fef…` and carries the two escrow settings; Phala's app-compose contains our file byte for byte; the official verifier accepts the quote, with the compose hash derived from our file.
2. **The attested identity covers the escrow settings.** The compose file the VM runs contains the two setting lines, so the compose hash the attestation measures is a hash over them.
3. **The check works inside the VM.** The VM reads the contract's escrow through its own outbound network from two providers, leaves B out and names B, charges A and C 0.01 each, and signs; the contract accepts the settlement and it lands; the recipient receives exactly 0.02.
4. **The VM reports the block it read** (a real height and hash), and `raceFree` is **false** (the exit timer ran out long ago).
5. **Teardown leaves nothing:** the group is pruned, every account deleted, the VM deleted and the account empty, the session costing under $0.05.

**Not tested:** the VM failing closed when both providers are down; the exit race itself; a lying provider; a two-room settlement. **Weakness I expect to remain:** one operator controls every account and the VM; the attestation proves which providers are asked, not that they are honest.


### Results: hosted Roost with the escrow check on (written after the run; the predictions above were not edited)
Run `20261108T124630Z-b8de`, one run, log verified (69 events), promoted to `docs/lab-runs/20261108T124630Z-b8de`. **All five predictions held on the first run.** The VM started and attested on image `cde03fef…`; Phala's app-compose equalled our compose file byte for byte, which now contains the two escrow settings, so the compose hash `edd3ff37…` that the official verifier accepted covers them. Inside the VM, in 10 seconds, the Roost read block 276777717 from the two providers through its own network, left out the unfunded member, and charged the other two 0.01 each; the contract accepted the settlement and the recipient received exactly 0.02; `raceFree` was false; the VM, the accounts and the group were all removed (0 VMs, 0 leftover accounts, 15 groups), at an estimated cost of $0.0019.

Two things found on the way, openly: the first attempt at this hardware run, with the previous compose file, died when the host disk filled (see the incident in the ledger; the VM it had created was deleted after its ownership was proved), and the November 4 bundle is pinned in `roost.expected.json` beside the new build because that file previously held only one hash.

**Still not shown.** The VM failing closed when both providers are down, the exit race, a lying provider, a two-room settlement, and a hosted Roost that stays up.

## Hosted Roost fails closed: predictions, written 2026-11-08 before the experiment exists or runs

**What it is, in plain words.** With the escrow check on, a Roost that cannot read the chain must refuse to run a charged round, and must not lose the bids it was holding. This was tested only on a local host. This tests it inside a real confidential VM whose two providers are deliberately unreachable.

**E-HOSTED-FAILCLOSED-LIVE-01 (hardware).** The VM runs the same pinned image with a compose file that differs from the real one only in its two provider URLs, which are on the reserved `.invalid` domain and can never resolve. No testnet funds are needed.
1. **The VM starts and attests**, and the attestation covers the unreachable settings (the compose the VM runs equals the variant file byte for byte).
2. **A charged round is refused with 503** (`could not read escrow`), in a bounded time (under the 30 s total deadline plus slack), not a hang.
3. **The bid is not lost:** the coordinator's digest list shows the same one input before and after the refusal, and nothing was signed (a settlement attempt is refused for want of an aggregate).
4. **Retrying gives the same answer**, so the failure is stable and not a one-off.
5. **Teardown leaves nothing:** the VM is deleted, the account is empty, the cost is under $0.05.

**Not tested:** that the Roost recovers when the providers come back (the VM's providers are fixed in its measured compose, so a recovery test needs a second VM); partial failure (one provider up, one down), covered offline; the exit race. **Weakness I expect to remain:** this shows the refusal, not that refusing is always the right availability trade-off.

### Results: hosted Roost fails closed (written after the run; the predictions above were not edited)
Run `20261108T131539Z-a3bd`, one run, 50 events, log verified, promoted to `docs/lab-runs/20261108T131539Z-a3bd`. **All five predictions held on the first run.** The VM attested with the fixture compose (byte for byte what Phala holds). A charged round was refused with 503 `could not read escrow: fetch failed` in 55 ms (the names never resolve, so it failed at once rather than waiting out the 30 s deadline), the retry gave the same answer, the bid's digest was the same before and after, and a settlement attempt was refused for want of an aggregate. The VM was deleted: 0 VMs left, about $0.0009.

**Still not shown:** recovery when the providers come back; a slow (rather than absent) provider on hardware, which is the timeout path; and that the real compose, not the fixture, was run through an outage.

## Nonce-checked follow-up and the phase view, live: predictions, written 2026-11-08 before the experiment exists or the contract is redeployed

**What it is, in plain words.** The contract's follow-up step after a payout now names the round it belongs to and is ignored unless that is the settlement in flight (GAP-028), and a read-only view says which phase a group is in. Unit tests show this. This checks it on the real contract after the redeploy.

**E-NONCE-CALLBACK-LIVE-01 (testnet).** After the new code is on the chain:
1. **The chain runs the build:** the on-chain code hash equals the last entry in `docs/canonical/deployments.json`, and the contract still holds the same groups as before the deploy.
2. **The phase view agrees with the records:** for every group on the contract, `get_group_phase` matches its status and escrow (Settled for Settled, Refunded for AbortedRefunded, Open or Unfunded for Active), and an id that does not exist gives null.
3. **A real settlement uses the new follow-up:** the settlement's own receipts show the follow-up scheduled as `on_settlement_payout_for_round` carrying the round nonce that was signed; the group's phase is PayoutInFlight until it runs and Open afterwards; the pending record is gone.
4. **A second settlement with a byte-identical payload also completes:** the case GAP-028 could not tell apart does not wedge a normal run.
5. **Teardown leaves nothing:** all accounts deleted, groups pruned, the group count back to what it was.

**Not tested live, and said so:** the late follow-up itself (a follow-up of an earlier settlement arriving while a newer one is in flight) cannot be produced on a real chain on demand; it is shown by the unit tests only. A settlement that was in flight at the moment of the upgrade (the legacy path) is also unit-tested only. **Weakness I expect to remain:** one operator controls every account, and a pass shows the new path works, not that the old defect was reachable on testnet.

**Amendment to prediction 4, written 2026-11-08 before any run and before the deploy (the text above is left as it was written).** An offline check shows this host's order hash includes the round, so two rounds cannot produce byte-identical settlements; the exact case GAP-028 could not tell apart cannot be created live by this host. Prediction 4 becomes: **two consecutive settlements on one group both complete, and each follow-up names its own signed round nonce (the two nonces differ)**. The identical-payload case stays covered by the unit tests only, and this is said in the results.

**First run of E-NONCE-CALLBACK-LIVE-01 (run `20261108T153041Z-4486`, FAIL, kept as evidence), written 2026-11-08.** Predictions 1, 2, 3 and 5 held. Prediction 4 failed on two assertions, and the cause was **my experiment, not the contract**: I deposited 0.06 in total and paid 0.03 in each of two settlements, so the second settlement paid out the whole group. The contract correctly marked it Settled and did not rotate the nonce (a final settlement has no next round), which the unit tests also show. The experiment is fixed to deposit 0.09 so the group is still Open after both settlements, and is re-run as a new run; the prediction itself is unchanged.

### Results: nonce-checked follow-up and phase view, live (written after the runs; the predictions above were not edited)
Run `20261108T153206Z-a0f0`, PASS, 50 events, log verified, promoted (`docs/lab-runs/20261108T153206Z-a0f0`), after the first run `20261108T153041Z-4486` failed on my own funding error (above). **All five predictions held in the second run.** The chain's code hash was the last recorded deployment (`FMVXMpB3…`), still 15 groups; the phase view agreed with every group and gave null for an unknown id; a group read Unfunded before any deposit and Open after; each of two real settlements was followed by `on_settlement_payout_for_round` carrying the round nonce that was signed (two different nonces), the pending record was gone afterwards and the phase was Open again; the teardown left no account and no group behind (15 groups).

**Not shown live, as stated beforehand:** the late follow-up itself, a settlement in flight at the moment of the upgrade, and byte-identical settlements. Those are unit-tested only. A separate finding while checking the README: the transaction recorded as the "wrong nonce replay" proof was refused because the group was already settled, not for a nonce mismatch; the real live nonce evidence is `E-ONGOING-01`. The labels were corrected.

## Removing a never-funded group, live: predictions, written 2026-11-08 before the experiment exists or the contract is redeployed

**What it is, in plain words.** A group that someone hatched and nobody ever funded has no member, so it has no exit and could not be removed; it sat in the contract's storage for ever. The new rule lets its creator remove it at once, and anyone remove it after about seven days (GAP-030). Unit tests show this. This checks it on the real contract after the redeploy.

**E-UNFUNDED-PRUNE-LIVE-01 (testnet).**
1. **The chain runs the recorded build:** the on-chain code hash equals the last entry in `docs/canonical/deployments.json`, and the contract holds the same groups as before the deploy.
2. **An unfunded group reads Unfunded** from `get_group_phase`.
3. **A stranger cannot remove it early:** the call is refused with the never-funded message and the group is still there.
4. **Its creator can remove it at once:** afterwards `get_syndicate` and `get_group_phase` give null, and the creator's index no longer lists it.
5. **A funded group is not removed, even by its creator:** the call is refused and the group is untouched.
6. **Teardown leaves nothing:** all accounts deleted, groups removed, the group count back to what it was.

**Not tested live, and said so:** the path after the waiting period (anyone removes it), because it needs about seven days of blocks and cannot be made to pass faster on a real chain; it is shown by the unit tests only. **Weakness I expect to remain:** one operator controls every account.

## The measurement pin against the real NEAR AI host: predictions, written 2026-11-08 before the experiment exists or runs

**What it is, in plain words.** A pin makes a caller accept only a model host whose boot measurements are ones the owner listed. The tests show this with a fake host. This checks it against the real NEAR AI host, using the recorded baseline (`docs/canonical/model-measurements.json`). It needs no API key and spends nothing.

**E-MODEL-PIN-LIVE-01 (cloud tier, read-only).**
1. **The real host's measurements held still:** read three times with fresh nonces, all six registers are identical across reads.
2. **The baseline matches what the host reports now,** for each pinned field.
3. **A fetch pinned to the baseline is accepted** with the Intel certificate chain verified and the TCB status acceptable, and reports that it was pinned.
4. **A fetch with one pinned field wrong is refused, naming that field,** for each of the five fields in turn.
5. **A list holding a wrong value and the right one is accepted** (the way a rotation would be handled).

**Not tested, and said so:** that the baseline is the build NEAR AI publishes (I have not checked it against anything they publish); that the values stay the same for days; what happens when NEAR AI really ships a new build. **Weakness I expect to remain:** the baseline is a sighting, not a verification, and the file says so.

### Results: removing a never-funded group, live, and the measurement pin against the real host (written after the runs; the predictions above were not edited)
**E-UNFUNDED-PRUNE-LIVE-01**, run `20261108T170650Z-a88e`, PASS on the first run, 40 events, log verified, promoted. The chain ran the recorded build (`854fzUj2…`) with the same 15 groups; an unfunded group read Unfunded; a stranger's early removal was refused with the never-funded message and the group stayed; the creator removed it at once (group and phase null, creator's index clean); a funded group was refused even for its creator and was untouched; the teardown left no account and no group (15 groups). **Not shown live, as stated beforehand:** the path after the waiting period (unit tests only).

**E-MODEL-PIN-LIVE-01**, run `20261108T170912Z-53f2`, PASS on the first run, log verified, promoted. Against the real NEAR AI host: three reads gave identical measurements; the recorded baseline matched; a fetch pinned to it was accepted with the Intel chain verified and TCB UpToDate; a wrong value in each of the five fields was refused naming that field; a list holding a wrong and the right value was accepted. **Not shown:** that the baseline is NEAR AI's published build, stability over days, a real rotation.

## A Dark Vault run by the hosted Roost on real hardware: predictions, written 2026-11-11 before the experiment exists or runs

**What it is, in plain words.** The ongoing-group experiment (E-ONGOING-01) ran a Dark Vault across three rounds on testnet, but with a local room and a simulated attestation. The hosted-Roost experiments (E-HOSTED-LIVE-01, E-HOSTED-ESCROW-LIVE-01) ran one round on a real Phala TDX VM. Nothing yet had the real VM run a group that lives across several rounds. This does that, on the pinned image `cde03fef…`, against the real testnet contract with the VM's escrow check on.

**E-HOSTED-DARKVAULT-LIVE-01 (hardware).** Five members (u1 to u5) and four recipients. Four founders deposit 0.1 each into a DARK_VAULT group whose room key is the VM's attested settlement key. The VM runs three rounds; the contract settles each.
1. **The VM starts and attests** on the pinned image, as in the earlier hosted runs (compose equals our file byte for byte, official verifier accepts the quote, production OS image, not a simulator).
2. **Round 1, a pool:** u1 to u4 bid 0.01, 0.01, 0.015, 0.015; the VM reads the chain's escrow, signs; the contract accepts; `rp` receives exactly 0.05; the epoch rises by exactly 1 and the round nonce changes.
3. **A late fifth deposit, then round 2, a ballot:** u5 deposits 0.1 between rounds; the VM's escrow read counts u5; A wins 3 to 2; `ra` receives exactly 0.05; u5 is charged 0.01 like the others (0.09 left).
4. **Round 3, a lending quote:** u3 wins at 400 bps; `rl` receives exactly 0.04.
5. **The books close:** after round 3 the escrows are u1 0.08, u2 0.08, u3 0.035, u4 0.075, u5 0.09 and they sum to the group total 0.36; the epoch rose by 3 and every nonce was different.
6. **Teardown leaves nothing:** the members exit with their remainders, the group is pruned, every account deleted, the VM deleted and the Phala account empty, the session costing under $0.10.

**Not tested:** two rooms, a VM failing mid-group, the VM staying up beyond the session, a lying provider. **Weakness I expect to remain:** one operator controls every account and the VM; the attestation proves which image runs, not that the providers are honest.

### Results: the hosted Dark Vault, first run (written after the run; the predictions above were not edited)
Run `20261111T043528Z-3f73`, **FAIL**, one run (kept locally, not promoted). **Predictions 1 and 2 held on real hardware:** the VM attested on the pinned image (16 checks, the official verifier accepted the quote) and ran round 1, a pool; the contract accepted the settlement the VM signed and `rp` received exactly 0.05. **Prediction 3 failed:** the VM refused the ballot with "a ballot is only counted on a host that requires signed inputs". The hosted server's entry point never turns signed inputs on, so ballots, RFQs and pay runs cannot run on the real VM; they had only ever run against local rooms (GAP-046). Round 3 then timed out because round 2 never happened and its expected totals were wrong, a consequence and not a second finding. **Prediction 6 held:** all nine accounts were deleted, the group pruned, the VM deleted and the Phala account empty, the session costing under $0.10.

## The hosted Dark Vault, second run: predictions, written 2026-11-11 before the experiment exists or runs
Same group, same image, with what the pinned image can do today: round 2 is a second **pool** (all five members bid 0.01, the late depositor included), not a ballot.
**E-HOSTED-DARKVAULT-LIVE-02 (hardware).**
1. The VM attests on the pinned image, as before.
2. Round 1 (pool, four founders): `rp` receives exactly 0.05; epoch +1; the nonce changes.
3. A late fifth deposit, then round 2 (pool, five members): the VM's escrow read counts u5; `ra` receives exactly 0.05; every member is charged 0.01, so u5 has 0.09.
4. Round 3 (lending quote): u3 wins at 400 bps; `rl` receives exactly 0.04.
5. The books close: u1 0.08, u2 0.08, u3 0.035, u4 0.075, u5 0.09, summing to the group total 0.36; the epoch rose by exactly 3 and every nonce was different.
6. Teardown leaves nothing: group pruned, accounts deleted, VM deleted, account empty, under $0.10.
**Not tested (and why):** a ballot, an RFQ and a pay run on hardware, because the pinned image cannot run them (GAP-046).

## Contract-requested foreign payments: predictions, written 2026-11-11 before the experiment exists or runs

**What it is, in plain words.** On 2026-11-10 a script ran a payroll in which the Midge contract (test deployment `m.fly-1793636729.testnet`) checked a group's rules and asked the NEAR MPC signer to sign two payments, on Solana devnet and Ethereum Sepolia. That was a one-off script, so by the project's own rule it is not yet proof. This is the same flow as a lab experiment, run again on the same contract and group (`payroll-live-1`), whose derived addresses are already funded.

**E-CONTRACT-FOREIGN-LIVE-01 (testnet and two foreign testnets).**
1. **The keys are the contract's.** The Solana and Ethereum addresses the signer derives for the contract and the group id differ from the ones it derives for our own account with the same path; the group's funded balances are non-zero.
2. **An in-rules Solana payment:** the contract accepts the room-signed request, the signer's reply verifies against the contract-derived Solana key over the message the script rebuilds independently, the transaction lands on devnet, and the payee's balance rises by exactly the amount.
3. **An in-rules Ethereum payment:** the signature recovers to the contract-derived Ethereum address over the EIP-1559 digest that ethers computes independently, the transaction lands on Sepolia with status 1, and the payee's balance rises by exactly the amount.
4. **The books:** the contract's recorded running total for each payee rose by exactly the amount just paid, and each obligation is marked signed.
5. **Refusals:** an unlisted payee, an amount over the per-payment cap, a reused obligation id and a request the room did not sign are each refused by the contract with its own message, and the recorded totals do not move.

**Not tested:** the signer failing mid-request (covered by a unit test only), two-room groups, the production contract, the hosted Roost signing these requests (a test key signs). **Weakness I expect to remain:** one operator controls the room key, the contract and the payees; money at the foreign addresses is outside the NEAR exit.

### Results: contract-requested foreign payments (written after the run; the predictions above were not edited)
**E-CONTRACT-FOREIGN-LIVE-01**, run `20261111T045220Z-5a19`, PASS on the first run, log verified, promoted. All five predictions held: the keys derived for the contract differ from those for our own account with the same path; an in-rules Solana payment and an in-rules Ethereum payment were each requested by the contract, verified against independently rebuilt messages and digests, landed, and the payees gained exactly the amounts; the contract's running totals rose by exactly what was paid and both obligations are marked signed; four out-of-rules requests (unlisted payee, over the cap, reused obligation, a request the room did not sign) were each refused with their own reason and the totals did not move. Still not shown: the signer failing mid-request on a live chain, two-room groups, the production contract, and a hosted Roost signing these requests. No mutation check of the experiment's assertions was run.

## A ballot on the rebuilt hosted Roost, signed inputs required: predictions, written 2026-11-11 before the experiment exists or runs

**What it is, in plain words.** The first hosted Dark Vault run failed because the pinned image never required signed inputs, so the room refused a ballot (GAP-046). CI has since rebuilt the image from the merged fix (digest `0e09e816…3804d4`) and the compose file now sets `ROOST_REQUIRE_SIGNED_INPUTS=1`. This runs a ballot on a real Phala TDX VM with that image.

**E-HOSTED-SIGNED-LIVE-01 (hardware).** Three members a, b, c deposit 0.05 each into a group whose room key is the VM's attested settlement key; two recipients ra and rb.
1. **The VM attests on the new image.** Phala's app-compose equals our compose file byte for byte, the file carries `ROOST_REQUIRE_SIGNED_INPUTS=1` and the new digest, and the official verifier accepts the quote (so the setting is part of what is measured).
2. **The room is in signed-input mode.** An unsigned sealed intent sent to `/intents` is refused with "only accepts signed inputs".
3. **Signed inputs are checked against the chain.** A vote signed with a key that is not an access key of the member's NEAR account is refused; the three real signed votes are accepted.
4. **The ballot runs.** Votes A, A, B; A wins 2 to 1; the VM signs; the contract accepts; `ra` receives exactly 0.03; each member is charged exactly 0.01.
5. **Teardown leaves nothing:** accounts deleted, group pruned, VM deleted, Phala account empty, session under $0.10.

**Not tested:** an RFQ and a pay run on hardware (same mechanism, not exercised), two rooms, the VM staying up. **Weakness I expect to remain:** the account-key check asks one RPC provider; one operator controls every account and the VM.

### Results: a ballot on the rebuilt hosted Roost (written after the run; the predictions above were not edited)
**E-HOSTED-SIGNED-LIVE-01**, run `20261111T050533Z-d6d9`, PASS on the first run, log verified (65 events), promoted. All five predictions held on a real Phala TDX VM: it attested on the rebuilt image with the compose hash `223b105261c3b481…` (now the newest pin in `roost.expected.json`); an unsigned sealed intent was refused; a vote signed by a key that is not an access key of the member's account was refused; three real signed votes were accepted; A won 2 to 1, the contract accepted the settlement the VM signed, `ra` received exactly 0.03 and each member was charged exactly 0.01; the accounts, the group and the VM were removed and the Phala account is empty. This closes GAP-046. Not shown: an RFQ and a pay run on hardware.

### Results: contract-requested foreign payments, re-run on the windowed contract (written after the run; the predictions above were not edited)
After GAP-047 and GAP-048 were fixed (a per-window running total, prune cleanup, finished groups still able to pay listed payees) the test contract was redeployed and the same experiment, **E-CONTRACT-FOREIGN-LIVE-01**, was run against it on a new group, `payroll-live-2`: run `20261111T052928Z-c176`, PASS, log verified, promoted. All five predictions held again. Not shown live: a window rollover, a failed signer call, a finished group paying, and the prune rules (unit tests only).

## The redacted pre-flight advisory: predictions, written 2026-11-11 before the experiment exists or runs

**What it is, in plain words.** An optional explainer that asks the attested NEAR AI Cloud model to put a pre-flight result into plain words. It is built so using it does not weaken the room's confidentiality: the model is sent finding codes and ratios rounded to the nearest ten percent, never a name, address, id or exact amount, and it is off unless the operator turns it on. This runs it against the real model.

**E-PREFLIGHT-ADVICE-LIVE-01 (live NEAR AI Cloud, no chain).** A scenario with a person, two Solana addresses, an obligation id and exact amounts, whose deterministic pre-flight has two warnings (changed destination, unusual amount).
1. **The model gets only the redacted message.** The message contains none of the scenario's identifying strings (names, both addresses, the obligation id, any exact amount) and nothing shaped like an address, and is under 600 characters.
2. **Coarse by design.** Two payments in the same ten-percent bucket produce an identical message.
3. **The model is the attested one.** The attestation chain verifies with TCB `UpToDate`, and the model's signed receipt verifies (hashes, signature, signer equals the attested key).
4. **Advice only.** The reply is plain text; the pre-flight decision returned beside it is identical to the one computed without the model; a reply containing an address-shaped string would be refused.
5. **Off by default.** With the advisory not enabled the model is not called (zero requests).

**Not tested:** whether the explanation is useful to an operator (I expect it to mostly restate the codes), the room running this inside the hosted VM, and any model other than Qwen/Qwen3.6-35B-A3B-FP8. **Weakness I expect to remain:** the model still learns the finding codes, the chain family, rounded ratios and that a payment is being checked.

### Results: the redacted pre-flight advisory (written after the run; the predictions above were not edited)
**E-PREFLIGHT-ADVICE-LIVE-01**, run `20261111T054638Z-e227`, PASS on the first run, log verified, promoted. All five predictions held against the real attested model (Qwen/Qwen3.6-35B-A3B-FP8, TCB UpToDate): the message contained none of the scenario's identifying strings and nothing shaped like an address; two payments in the same ten-percent bucket produced the same message; the attestation chain and the model's signed receipt verified; the decision beside the advice was identical to the deterministic one; and with the advisory off, or on with no advisor configured, no request was made. Found on the way, openly: the reply mostly restates the codes, so it adds little beyond the deterministic wording; and rounding to the nearest ten percent sent a payment at 95% of its cap as "100%". A mutation check (guard removed and the redaction made to include the destination) was caught by the same wire check the tests use. Not shown: usefulness to an operator, the explainer inside the hosted VM, other models.

### Results: contract-requested foreign payments on the upgraded production contract (written after the run; the predictions above were not edited)
After the production contract `c.fly-1793636729.testnet` was upgraded (code hash `EULUXozH…`, 15 groups intact), the same experiment, **E-CONTRACT-FOREIGN-LIVE-01**, was run against it (`MIDGE_RULES_PREFIX=c`) on a new group `payroll-prod-1` that had been created and funded by `npm run verify:contract-payroll` with a short exit timer: run `20261111T061602Z-acbc`, PASS, log verified, promoted. All five predictions held again. The group was by then finished (the member had taken the deposit back), so the run also showed a finished group paying its listed payees within the caps. The run's log does not record which contract it ran on; this paragraph and the deployment history are the record.

## A pay run with invoices and an auditor pack on the hardware room: predictions, written 2026-11-11 before the experiment exists or runs

**What it is, in plain words.** The hosted room's pay run (sealed lines, one-time payee accounts, Merkle receipts under the on-chain order hash) had only run against local rooms. The room now also accepts payee-signed invoices, matches them to the employer's lines, and opens chosen lines for an auditor on the employer's signed request. This runs all of it on a real Phala TDX VM on the rebuilt image, with settlement on the production contract.

**E-HOSTED-PAYRUN-LIVE-01 (hardware).** An employer and three payees (accounts created for the run), a tax account and a benefits account; the employer deposits 0.2 NEAR into a group whose room key is the VM's attested settlement key and whose policy lists the payees, tax and benefits.
1. **The VM attests** on the rebuilt image with signed inputs required, as before.
2. **A mismatch stops the run.** The three payees send sealed signed invoices; the employer's queued run has one line whose amount differs from its invoice; the VM refuses the run, names the mismatch, and the queue is kept.
3. **The corrected run settles.** After reopening the round and resubmitting, a run whose lines all match runs; the VM signs; the production contract accepts; each payee account receives exactly its net, the tax and benefits accounts exactly their totals, and the employer is charged exactly the gross total.
4. **Receipts are bound to invoices.** Each payee opens their own statement with their own key; it verifies against the order hash found in the settlement transaction on chain; its receipt carries the hash of that payee's invoice; another payee's key cannot open it.
5. **The auditor sees only what the employer opens.** The employer signs a request for one line; the VM returns a pack sealed to the auditor; the auditor decrypts it and verifies it against the on-chain order hash; it contains the one opened line and no other person's name; a request signed by anyone else is refused.
6. **The stateless checks answer on the VM.** A pre-flight of an over-cap foreign payment is blocked; an invoice check passes for a matching approval and fails for a changed destination.
7. **Teardown leaves nothing:** accounts deleted, the group left in a state that can be pruned or is pruned, the VM deleted, the Phala account empty, under $0.10.

**Not tested:** foreign-chain payments from the hardware room (the contract path is covered by its own experiment), two rooms, the VM staying up. **Weakness I expect to remain:** one operator controls every account and the VM; every payment's address and amount is public on NEAR once settled (this hides who a payee is, not how much); the coordinator holds the key that triggers the run.
