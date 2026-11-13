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

### Addendum to E-CONTRACT-FOREIGN-LIVE-01, written 2026-11-11 before the changed experiment ran (GAP-049)
A review note pointed out that the contract derived a group's foreign keys from the group id alone, so a pruned and re-hatched id would control the same Solana and Ethereum addresses as the old group (confirmed in the code: the signer path was the id). The path now names the group's creation block (`<id>:<block>`, exposed by `get_foreign_path`). **Prediction 1b:** (a) the contract's path for the group equals `<id>:<created_at_block>`; (b) the addresses derived from the bare group id are different from the ones the group uses; (c) the payments of predictions 2 and 3 are still signed by keys derived from that path (the signature verifies against the address derived from the path, which fails if the contract used any other path). Predictions 1 to 5 are unchanged.

### Results: the signer-path fix (written after the runs; the predictions above were not edited)
**E-CONTRACT-FOREIGN-LIVE-01**, run `20261111T063342Z-0a0b` on the test copy and run `20261111T063548Z-dd0c` on the production contract (`MIDGE_RULES_PREFIX=c`, group `payroll-prod-2`), both PASS, logs verified, promoted. Prediction 1b held: the contract's path for the group was `<id>:<created_at_block>`, the addresses derived from the bare id differ from the ones the group uses, and both payments verified against addresses derived from that path (a signature from any other path would not have). On the production script run the Ethereum step first failed with a gas-estimation error right after funding (a transient Sepolia node lag; the experiment passed and a re-run of the script completed); the finished test group `payroll-prod-1` was then pruned, which also showed the freed id has no path.

### Results: a pay run with invoices and an auditor pack on the hardware room (written after the run; the predictions above were not edited)
**E-HOSTED-PAYRUN-LIVE-01**, run `20261111T092424Z-5756`, PASS on the first hardware run, 89 events, log verified, promoted. All seven predictions held on a real Phala TDX VM on image `c08dfb45…`: it attested (compose hash `99a59326369ec75f…`, now the newest pin); a line whose amount differed from its invoice (0.035 against 0.03) stopped the run and was named, and asking again gave the same refusal, so the queue was kept; after reopening the round the corrected run settled on the production contract with exact amounts (0.043, 0.034, 0.025 to the payees, 0.012 tax, 0.006 benefits, the employer charged 0.12 of 0.2); each payee's statement carried the hash of their own invoice and verified against the order hash read from the settlement transaction on chain, and another payee's key could not open it; the employer opened one line (Bo's) for the auditor, who verified it, the pack named no other person, and a request signed by anyone else was refused ("is not a key of" the employer account); pre-flight blocked an over-cap payment and the invoice check passed and failed as expected on the VM; teardown deleted all six accounts, the group was pruned, the VM was deleted, the account is empty, cost $0.0025. A local dry run of the same experiment against a room configured like the VM, on the real chain, had found one bug in the experiment (a missing import) before any VM was started. Not shown: an RFQ on hardware, foreign-chain payments from the hardware room, a hosted room that stays up.

## An OutLayer program signs a Midge settlement: predictions, written 2026-11-11 before the experiment exists or runs

**What it is, in plain words.** OutLayer runs Rust/WASM programs in Intel TDX hardware on its own workers, with encrypted secrets only the program can read. `outlayer/room-signer` is the settlement-signing step of a Midge room as such a program: its Ed25519 seed is a protected secret nobody can read (generated inside OutLayer), and it signs only after recomputing the allocations hash itself, exactly as the contract does, and checking the allocations against a bound it was given. This tests whether the Midge contract accepts a settlement signed that way. It does not move the room to OutLayer: sealed inputs, aggregation and escrow reading stay where they are.

**E-OUTLAYER-SETTLE-01 (testnet; OutLayer testnet and the production contract).** A depositor and a recipient (accounts created for the run) and a group on the production contract whose room key is the public key the OutLayer program reports.
1. **A stable key.** Two separate OutLayer runs report the same public key, a 32-byte Ed25519 key.
2. **The contract accepts an OutLayer-signed settlement.** The program, given the group's contract, id, epoch, nonce, an order hash and one allocation of 0.02 NEAR within its bound, returns a signature; `settle_batch` with that signature succeeds and the recipient receives exactly 0.02 NEAR. The allocations hash the program returns equals the repo's own `computeAllocationsHash`.
3. **The program refuses outside its bound.** Given allocations above the bound it was handed, it returns no signature.
4. **A signature only covers what was signed.** Presenting the signature with different allocations (0.03 instead of 0.02) is refused by the contract; replaying the used signature after the settlement is refused.
5. **Size.** Every result is under OutLayer's 900-byte limit.

**Not tested:** that OutLayer's attestation for the run verifies (this run does not check the worker's TDX quote), sealed inputs or aggregation on OutLayer, a NEAR contract (rather than an account) calling OutLayer, cost beyond cents, mainnet. **Weakness I expect to remain:** the program trusts the caller for the bound and the order hash, so it is a signing step and not a room; the platform is third-party and its workers are registered on chain once, not checked per run.

### Results: an OutLayer program signs a Midge settlement (written after the runs; the predictions above were not edited)
**E-OUTLAYER-SETTLE-01** was run four times. Two runs **failed**: `20261111T093006Z-7ddf` at the first OutLayer call (the error text was cut off in the log; a by-hand call at once afterwards succeeded) and `20261111T093310Z-5c32` when the signing call returned nothing three times in a row (by-hand calls of the same input then succeeded, three times, with identical signatures). A bounded retry (three attempts, the count recorded) was then added; in the passing run one call needed a second attempt. The cause of the intermittent failure is **not known**; it looks like the OutLayer on-chain call path and not the program. Two runs **passed**; the one cited, `20261111T093643Z-7985`, PASS, 46 events, log verified, promoted, with the OutLayer transaction hashes recorded. All five predictions held: two runs reported the same 32-byte key; a settlement signed inside OutLayer was accepted by the production contract and the recipient received exactly 0.02 NEAR; the allocations hash the program computed equalled the repo's function; the program declined allocations above its bound; the same signature with 0.03 instead of 0.02 was refused ("Invalid enclave Ed25519 signature"); the replay was refused; results were about 320 bytes. Not shown: the worker's TDX quote, sealed inputs or aggregation on OutLayer, a contract calling OutLayer.

## The per-window foreign running total, live: predictions, written 2026-11-11 before the experiment exists or runs

**What it is, in plain words.** A payee's running total on the contract is the most that may be reserved inside one window (GAP-047), so a reservation that never resolves locks capacity for one window and not forever. This was shown only by unit tests. This runs it live on the test copy of the contract with the shortest window the contract allows (100 blocks, about two minutes), paying on Solana devnet.

**E-FOREIGN-WINDOW-LIVE-01 (testnet and Solana devnet).** A group with a foreign policy listing one Solana payee: at most 2,000,000 lamports per payment and 2,000,000 in total per window of 100 blocks.
1. **Inside the window the cap holds.** A payment of 1,500,000 is accepted, signed through the contract, and lands on devnet. A second request of 1,000,000 (total 2,500,000) is refused for passing the running cap in this window, and `get_foreign_spent` still reads 1,500,000.
2. **The window ends.** After 100 blocks from the first reservation, `get_foreign_spent` reads 0 (the allowance is back).
3. **The same request is now accepted.** The request for 1,000,000 that was refused (with a new obligation id, since ids are never reused) is accepted, its signature verifies against the address derived from the group's signer path, it lands on devnet, and `get_foreign_spent` reads 1,000,000, not 2,500,000.
4. **Ids stay burned.** Re-sending the first obligation id after the window is still refused.

**Not tested:** a signer call failing mid-request, the window on the production contract, Ethereum. **Weakness I expect to remain:** the check runs on the test copy of the contract, which has the same code as production but is a separate account.

### Results: the per-window foreign running total, live (written after the runs; the predictions above were not edited)
**E-FOREIGN-WINDOW-LIVE-01** was run twice. The first, `20261111T094250Z-a874`, **failed** on a bug in my experiment: it read the payee's balance at the `confirmed` level as soon as the transaction was `processed`, and saw no change. The second, `20261111T094402Z-fb66`, PASS, 32 events, log verified, promoted. All four predictions held on the test copy of the contract and Solana devnet: 1,500,000 lamports passed through the contract, were signed and landed; a further 1,000,000 was refused for passing the running cap in this window and `get_foreign_spent` still read 1,500,000; after 100 blocks it read 0; the same request with a new obligation id passed, its signature verified against the address derived from the group's signer path, it landed, and `get_foreign_spent` read 1,000,000 (not 2,500,000); re-sending the first obligation id was still refused. Not shown: a signer call failing mid-request; the window on the production contract.

### Results: the fail-closed hardware test on the current compose (written after the run; nothing was predicted again)
**E-HOSTED-FAILCLOSED-LIVE-01** was re-run on the current compose (signed inputs required, image `c08dfb45…`): run `20261111T094151Z-c01e`, **FAIL**, promoted as evidence. The fixture attested (14 checks), then the experiment's bid was refused ("this Roost only accepts signed inputs"), because the experiment sends an unsigned bid. This is the consequence of the signed-only decision for an experiment I had not listed. Reading the code shows a second effect, recorded as GAP-050: with signed inputs required, accepting a bid needs the account-key check, which asks the first RPC provider only, so with the providers unreachable no bid can be queued, and bid intake rests on one provider for key checks. The fail-closed property on the current compose is therefore **not shown**; the older promoted run stands for the older build.

## A sealed-quote RFQ on the hardware room: predictions, written 2026-11-11 before the experiment exists or runs

**What it is, in plain words.** A request for quote (RFQ): a taker wants to buy some units at no more than a limit; makers each send a sealed bid and ask; the room picks the lowest eligible ask, charges the taker, pays the winning maker, and tells nobody what the losing makers quoted. The hosted room has this program (`runRfq`) and it has run only on local rooms. This runs it on a real Phala TDX VM, settled on the production contract.

**E-HOSTED-RFQ-LIVE-01 (hardware).** A taker `tk` and three makers `m1`, `m2`, `m3` (accounts created for the run); a group whose room key is the VM's attested settlement key and whose policy lists the three makers; the taker deposits 0.2 NEAR. The taker buys 2 units with a limit of 0.05 each, first-price. Quotes (bid, ask): `m1` (0.011, 0.041), `m2` (0.011, 0.032), `m3` (0.011, 0.067).
1. **The VM attests** on the current image and compose (signed inputs required), as before.
2. **A request that could cost more than the taker has is refused and the queue is kept.** A first attempt for 10 units at the same limit (up to 0.5 NEAR against a deposit of 0.2) is refused with "cannot cover" and asking again gives the same refusal.
3. **The best eligible quote wins and the books are exact.** After reopening the round and resubmitting a 2-unit request: `m3` (ask 0.067, over the 0.05 limit) is received but not eligible (3 received, 2 eligible); `m2` wins at its own ask; the VM signs; the production contract accepts; `m2` receives exactly 0.064 NEAR (2 x 0.032), the taker is charged exactly 0.064 (0.136 left), and `m1` and `m3` receive nothing.
4. **The losers stay sealed.** Nothing the room returned (outcome, terms, allocations) contains `m1`'s ask 0.041 or `m3`'s ask 0.067 or any bid.
5. **The order hash is bound.** The order hash in the settlement transaction on chain equals the one the VM computed.
6. **Teardown leaves nothing:** accounts deleted, group pruned, VM deleted, account empty, under $0.10.

**Not tested:** a sell-side RFQ, second-price, a tie, a taker whose request is hidden from makers beyond the room (the room sees everything), two rooms. **Weakness I expect to remain:** the room sees every quote, so this hides quotes from the other makers and from the public, not from the room; the amount paid is public once settled.

### Results: a sealed-quote RFQ on the hardware room (written after the run; the predictions above were not edited)
**E-HOSTED-RFQ-LIVE-01**, run `20261111T095919Z-b620`, PASS on the first hardware run, 66 events, log verified, promoted, about $0.0024. All six predictions held on a real Phala TDX VM: it attested the same compose hash as the pay run (`99a59326…`); a 10-unit request (up to 0.5 NEAR against a 0.2 deposit) was refused as more than the taker could cover and asking again gave the same refusal, so the queue was kept; after reopening, a 2-unit request received three quotes of which two were eligible (m3's ask of 0.067 was over the 0.05 limit); m2 won at its own ask of 0.032; the contract accepted the settlement; m2 received exactly 0.064 NEAR and nothing else moved; the taker was charged exactly 0.064 (0.136 left); nothing the room returned contained 0.041, 0.067 or any bid; the order hash in the settlement transaction equalled the VM's; teardown deleted four accounts, pruned the group and deleted the VM. A local dry run of the same experiment against a room configured like the VM had found no bug. Not shown: a sell-side RFQ, second-price, ties.

### Addendum to E-HOSTED-FAILCLOSED-LIVE-01, written 2026-11-11 before the rewritten experiment ran (GAP-050)
On the signed-only compose the experiment's unsigned bid is refused (run `20261111T094151Z-c01e`), and bid intake needed a chain read through the first escrow provider only. The account-key check now has its own provider list (`ROOST_ACCOUNT_CHECK_RPC_URLS`, every provider must confirm the key), and the fail-closed fixture breaks only the escrow providers. The experiment is rewritten to send a **signed** bid from a throwaway account (created for the run and deleted after). Predictions 1 to 5 are unchanged in substance. **New predictions:** (6) the signed bid is **accepted** by the VM even though both escrow providers are unreachable, because key checks use their own working providers; the charged round is then refused with 503 as before, the bid survives, and nothing can be signed. (7) A bid signed with a key that is not an access key of the account is refused by the same check. (8) The compose the VM attests lists two different account-check providers, both reachable, and two escrow providers that are not. **Not tested:** the account-check providers failing (a unit test shows a failed or disagreeing provider refuses the key); recovery.

### Results: GAP-050 on hardware (written after the runs; the predictions above were not edited)
After PR #7 merged, CI rebuilt the image (`6605aa8c…`); both compose files were re-pinned to it. Five hardware attempts followed, and three failed for reasons that were not the property under test.
- `20261111T101125Z-61f5` (pay run) **failed in setup**: the main account had only 0.37 NEAR because an earlier failed setup had left five funded accounts behind (about 2 NEAR); the experiment's second batch could not be paid for and the helper did not roll back. Cleaned up by hand; `createMembers` now checks the balance before creating anything and deletes what it made if it fails part-way.
- `20261111T101240Z-eb5d` (fail-closed) **failed its preflight**: run immediately after the pay run, the Phala account still listed the previous VM as it was being deleted. The two runs are now separated by a wait for the account to be empty.
- `20261111T101447Z-93d8` (pay run) passed every prediction but **failed its cleanup**: I had cut the accounts' funding to 0.25 NEAR and the employer's `hatch_out` needs about 0.06 NEAR available to attach its gas (it had 0.0495), so it could not exit and the group could not be pruned. Cleaned up by hand (a top-up, exit, prune, delete); the pay run now funds the employer with 0.4 NEAR and the others 0.1.
- `20261111T102056Z-1b53` (**fail-closed**) PASS, 56 events, promoted, about $0.001. On the signed-only compose, with both escrow providers unresolvable and the two account-check providers real: the fixture attested; a bid signed with a key that is not the account's was refused; the account's own signed bid was **accepted**; the charged round was refused with 503 in 44 ms ("could not read escrow"); a retry gave the same answer; the bid was still there unchanged; nothing could be signed. All of predictions 1 to 8 held.
- `20261111T102349Z-a216` (**pay run**) PASS, 89 events, promoted, about $0.0025: every prediction held again on the rebuilt image and the new compose; its attested compose hash `73f42e651241e148…` is now the newest pin.
Not shown: the account-check providers failing on a live VM (unit tests only), recovery when providers return.

## A sell-side, second-price RFQ with an unfunded high bidder and a tie, on the hardware room: predictions, written 2026-11-11 before the experiment exists or runs

**What it is, in plain words.** The first hardware RFQ was a buyer asking for the lowest ask, paid at the winner's own ask. This is the other direction: a **seller** asks for the highest bid, the winner pays the **second-highest** bid, and the winner is the one charged, so the room must leave out a higher bidder who cannot afford it. A second round checks how a **tie** is broken. Settled on the production contract.

**E-HOSTED-RFQ-LIVE-02 (hardware).** A taker `tk` who sells 2 units with a limit of 0.02 per unit, and four makers `m1` to `m4`; the group lists only `tk` as a recipient; makers `m1` (0.1), `m2` (0.2) and `m4` (0.05) deposit, and `m3` deposits nothing. Round A, second-price, bids (bid, ask): `m1` (0.031, 0.05), `m2` (0.045, 0.05), `m3` (0.060, 0.05), `m4` (0.010, 0.05).
1. **The VM attests** on the current image and compose.
2. **Round A: the unfunded high bidder is left out by name.** `m3` bids the most (0.060) but holds nothing; the VM excludes `m3` and says so (`excludedForEscrow` is exactly `[m3]`).
3. **Round A: the highest eligible bid wins and pays the second price.** `m4`'s bid (0.010) is below the 0.02 limit and is ineligible. Of the quotes read (3), 2 are eligible. `m2` wins and pays the runner-up's bid: 2 x 0.031 = 0.062. The contract accepts; `tk` receives exactly 0.062; `m2` is charged exactly 0.062 (0.138 left); `m1`, `m3` and `m4` are charged nothing.
4. **Round A: the winner's own bid stays sealed.** What the room returned contains the price 0.031 (that is the rule) but neither `m2`'s own bid 0.045, nor `m3`'s 0.060, nor `m4`'s 0.010.
5. **Round B: a tie goes to the earlier submission.** First-price; `m2` submits 0.040 first and `m1` then submits 0.040. `m2` wins and `tk` receives exactly 2 x 0.040 = 0.080; `m2` is charged 0.080 (0.058 left); `m1` is not charged.
6. **The order hashes are bound.** For both settlements the order hash in the transaction on chain equals the VM's.
7. **Teardown leaves nothing:** makers exit with what is left, group pruned, accounts deleted, VM deleted, Phala account empty, under $0.10.

**Not tested:** more than one tied pair, ties across more than two makers, a taker who is also a maker. **Weakness I expect to remain:** the room sees every bid, and the second price reveals the runner-up's bid to the public by design.

## One account-check provider down, on the hardware room: predictions, written 2026-11-11 before the experiment exists or runs

**What it is, in plain words.** Since GAP-050 the hosted room accepts a signed bid only if **every** configured account-check provider confirms the member's key. That was shown by unit tests only. This runs it on a real Phala TDX VM whose compose lists two account-check providers of which one can never resolve (a test fixture that differs from the real compose in that one line), with the escrow providers working.

**E-HOSTED-ACCTCHECK-FAIL-LIVE-01 (hardware).** One throwaway NEAR account (0.1 NEAR, deleted after) with a valid key.
1. **The VM attests**, and the compose it runs equals the fixture byte for byte; the fixture lists two different account-check providers, one real and one on the reserved `.invalid` domain.
2. **A correctly signed bid is refused.** A bid signed with the account's real key is refused, because the check cannot reach one of its providers; the refusal says the key could not be checked, and does not say it was accepted.
3. **Retries get the same answer,** and the room is still up (it answers `/healthz` and `/session`).
4. **Nothing was queued.** The room's input digests are empty, so no round can be run on a bid that was never accepted: a charged round is refused as having no inputs, not run.
5. **The failure is the provider's and not the key's.** On the real compose (both providers working) the same signed bid is accepted: shown here by the earlier promoted runs, not repeated.
6. **Teardown leaves nothing:** account deleted, VM deleted, Phala account empty, under $0.05.

**Not tested:** one provider answering "no" while the other answers "yes" (unit tests), recovery when the provider returns (it needs a second VM). **Weakness I expect to remain:** availability: one failing provider stops all bid intake. That is the price of requiring every provider to agree.

## A signer call that fails mid-request, live: predictions, written 2026-11-11 before the experiment exists or runs

**What it is, in plain words.** When the contract asks the NEAR MPC signer to sign a foreign payment, it first reserves the payee's budget and records the obligation; if the signer then fails, the callback must release both so the same obligation can be asked for again. That was shown by unit tests only, because the real signer does not fail on demand. This makes the contract's cross-contract call fail for real: a build of the contract with a `test-signer-override` feature (deployed to the TEST copy `m.<account>` only, never to production; the default build does not contain it) lets the contract's own account point the signer at an account that does not exist.

**E-FOREIGN-SIGNER-FAIL-LIVE-01 (testnet, the test copy running the feature build).** A group with a foreign policy listing one Solana payee, at most 2,000,000 lamports per payment and 2,000,000 per window.
1. **The override is the contract's own.** `set_test_signer` called from our main account is refused; called from the contract's own account it is accepted and the signer points at a nonexistent account.
2. **A failing signer releases everything.** The contract accepts a valid room-signed request for 2,000,000 lamports, reserves, calls the nonexistent signer, the promise fails, and when the callback has run `get_foreign_obligation` returns nothing and `get_foreign_spent` reads 0. The request's final result carries no signature.
3. **The same obligation id works again.** With the signer pointed back at the real one, the same obligation id for the same 2,000,000 is accepted (it would be refused for passing the cap if the failed reservation had leaked, and for being used if the id had been burned), a signature is returned, and it verifies against the address derived from the group's signer path.
4. **Teardown:** the group removed; then the test copy is redeployed with the default build, so it equals production again (its code hash equals production's).

**Not tested:** a failure on the Ethereum path (same code), a failure arriving after the window has rolled (unit tests), a signer that fails after a long delay. **Weakness I expect to remain:** this shows the contract's behaviour when a cross-contract call fails; it does not show the real MPC network failing, and the build under test has the extra feature the default build lacks.

## A NEAR contract triggers an OutLayer program, and the result settles a Midge group: predictions, written 2026-11-11 before the experiment exists or runs

**What it is, in plain words.** The first OutLayer proof (E-OUTLAYER-SETTLE-01) was run by an account through the CLI. OutLayer is meant to be called by contracts, with the result coming back through NEAR's yield/resume. `outlayer/caller` is a small contract (153 KB) with an owner-only `request` that calls `request_execution` on `outlayer.testnet` and a callback that stores the program's JSON output. It is deployed on the throwaway account `ol.<account>`, where the secret's access list already points. The program is the same `midge-room-signer`.

**E-OUTLAYER-CONTRACT-01 (testnet, OutLayer testnet, the production contract).**
1. **A contract, not an account, makes the call.** The caller contract is deployed on `ol.<account>` (its code hash recorded) with that account as owner. A `request` from our main account is refused ("only the owner may trigger a run"); one with less than 0.003 NEAR attached is refused.
2. **The callback receives the program's output.** The owner's `request` with `{"op":"pubkey"}` makes the contract call OutLayer; when the callback has arrived (the results counter rises) `get_last` holds JSON with `ok: true` and the same public key the CLI runs reported earlier (`73889bf2…82fd2`).
3. **A contract-triggered signature settles a Midge group.** On the production contract, a group whose room key is that public key: the caller contract's `request` with a `sign` input (one allocation of 0.02 NEAR within the bound) yields, in `get_last`, a signature; `settle_batch` with it is accepted and the recipient receives exactly 0.02 NEAR; the same signature with 0.03 is refused; a replay is refused.
4. **Teardown:** the depositor leaves, the group is pruned, the accounts deleted. The caller contract stays on the throwaway account.

**Not tested:** the OutLayer call failing (the callback records "failed"; a unit test shows it), the contract being called by a Midge contract rather than an externally owned caller (the Midge contract does not call OutLayer), the worker's TDX quote. **Weakness I expect to remain:** OutLayer's testnet call path failed intermittently in the earlier experiment (cause unknown), so this run may need retries; the platform is third-party.

## Results: the four slices closed on 2026-11-11 (sell-side RFQ, an account-check provider down, a signer failing mid-request, a contract triggering OutLayer)

**E-HOSTED-RFQ-LIVE-02**, run `20261111T111840Z-68db`, PASS on the first hardware run, 74 events, log verified, promoted, about $0.003. A seller asked for the highest bid on a real Phala TDX VM; the unfunded high bidder `m3` (0.060) was left out by name; `m2` won with the highest eligible bid and paid the second price (2 x 0.031 = 0.062), the contract accepted, the seller received exactly 0.062 and `m2` was charged exactly 0.062; the winner's own bid stayed sealed; in round B a tie at 0.040 went to the earlier submission (`m2`); order hashes on chain equalled the VM's; teardown left the Phala account empty. The earlier local dry run had found one test bug (my m3 bid was above its own ask, which makes a crossed quote the room cannot read); the asks were raised and the real run passed. Not shown: ties across more than two makers, a taker who is also a maker.

**E-HOSTED-ACCTCHECK-FAIL-LIVE-01**, run `20261111T112230Z-4e29`, PASS, 55 events, log verified, promoted, about $0.0014. On a VM whose compose lists one real and one unresolvable account-check provider (a fixture that differs from the real compose in that line only), a bid correctly signed with the account's real key was refused with the text "could not check that ed25519:… is a key of …"; retries gave the same answer and the room stayed up; nothing was queued; teardown left the Phala account empty. **One prediction was worded wrongly:** prediction 4 said a charged round would be refused "as having no inputs". The pool call was in fact refused for a different reason (the group does not exist on chain, so the escrow check fails first, status 503); the assertion that matters (status 400 or above, no allocations, no signature) held, and that is what is claimed. The input digests were empty as predicted.

**E-FOREIGN-SIGNER-FAIL-LIVE-01**, run `20261111T113046Z-6c27`, PASS, 31 events, log verified, promoted. On the test copy running the `test-signer-override` build (the default build does not contain the test methods: checked on the compiled wasm), a call from our main account to `set_test_signer` was refused; with the signer pointed at an account that does not exist, a valid room-signed request for 2,000,000 lamports failed in the cross-contract call, the callback released the reservation and the obligation (`get_foreign_obligation` empty, `get_foreign_spent` 0, no signature); with the real signer restored the same obligation id for the same amount was accepted and its signature verified against the address derived from the group's signer path. The test copy was then redeployed with the default build (code hash `3dGAu1yG…`, the test method gone). Not shown: the real MPC network failing, an Ethereum-path failure.

**E-OUTLAYER-CONTRACT-01**, run `20261111T114956Z-9ee3`, PASS, 51 events, log verified, promoted. A 153 KB caller contract on the throwaway account (code hash `ECX5VLz6…`) made every OutLayer call: a request from another account and one with too little deposit were refused with the contract's own messages; its callback stored the same public key the CLI runs reported (`73889bf2…82fd2`) on two separate calls; a `sign` call whose allocations were above the bound was declined by the program; a signature obtained that way for 0.02 NEAR was accepted by `settle_batch` on the production contract and paid exactly 0.02; the same signature with 0.03 was refused; the replay was refused. All OutLayer calls succeeded on the first attempt. **Three earlier attempts failed and were not promoted:** two because refusals reached the caller as a bare wasm trap (a build without near-sdk's `unit-testing` feature does not carry the panic message; found on chain by a temporary debug build, then fixed and commented in the manifest) and one because my experiment forgot an `await` after making the call function asynchronous. Not shown: the worker's TDX quote, the OutLayer call failing live, the Midge contract itself calling OutLayer.

## Amendment, 2026-11-11, before re-running on the pinned image: the older hardware experiments that sent unsigned inputs

The wholeness sweep found that four hardware experiments (`105` escrow, `108` and `109` Dark Vault, `70` combined) submit unsigned sealed inputs, which the pinned image (compose hash `73f42e65…`, signed inputs required for every program) refuses. Their promoted runs are real, but they ran on earlier images, so none of them shows the **current** pinned room doing that work. `109` (the Dark Vault, the one a claim rests on) is changed to seal **and sign** every input with the member's own account key for the current round, exactly as `111`, `116` and `117` do. **The predictions of `E-HOSTED-DARKVAULT-LIVE-02` are unchanged**: attestation, three settled rounds (a pool, a second pool with the late depositor counted, a lending quote), the books closing, teardown leaving nothing. If it fails on the pinned image that is a finding and is recorded as one. `105` is changed the same way next; `108` is the documented failed first run and is left as it is; `70` needs a NEAR AI key and is left for the cloud tier.

**E-HOSTED-DARKVAULT-LIVE-02, re-run on the pinned image**, run `20261111T122520Z-e900`, PASS, 85 events, log verified, promoted. The VM attested compose hash `73f42e65…` (the current pin) and ran all three rounds with every input signed by the member's own account key: a pool (0.05 to `rp`), a second pool that counted the late depositor, a lending quote, and the books closed. Teardown left the Phala account empty. **One earlier attempt of this re-run failed and was not promoted:** run `20261111T122312Z-47be` stopped at set-up because the experiment funded all nine accounts at 0.4 NEAR and the main account held 2.1; recipients are now funded at 0.05 and depositors at 0.3 (a tested funding map in `lab/lib/members.js`). The first run of this experiment (`20261111T044235Z-5845`) stays valid evidence for the earlier image.

**Re-runs on the current pinned image (compose hash `73f42e65…`), 2026-11-11.** `E-HOSTED-RFQ-LIVE-01` run `20261111T123128Z-34a0` PASS (66 events) and `E-HOSTED-SIGNED-LIVE-01` run `20261111T123523Z-0974` PASS (65 events), both promoted, both attesting the current pin. **One attempt failed and was not promoted:** `20261111T123447Z-fe00`, a pre-flight failure before any VM existed, because the signed-ballot experiment hard-coded the previous image digest (`0e09e816…`) in one assertion; it now checks that an image digest is pinned and signed inputs are required, and lets the attestation prove which image runs, as the newer experiments do. With these and `E-HOSTED-DARKVAULT-LIVE-02`, `-PAYRUN-LIVE-01`, `-RFQ-LIVE-02` and the fixture runs, every hosted-room slice has a passing run on the current pin except the escrow-only experiment `E-HOSTED-ESCROW-LIVE-01` (Nov 8, unsigned inputs) and the first Dark Vault run, which are left as the record of the earlier image.

**Correction to the amendment above.** It said `105` (escrow only) would be changed to sign its inputs next. On reflection it is not: the property it shows (a bidder who cannot pay is left out by name and not charged) is now shown on the **current** pinned image by `E-HOSTED-RFQ-LIVE-02` (the unfunded high bidder) and by the Dark Vault's late depositor, so a rewrite would repeat that. `105`, `30` (the first hosted run, 2026-11-04) and `108` stay as the record of the earlier images, and the claims that cite them now say so. `70` (NEAR AI proposes, the Roost signs) needs a NEAR AI key and belongs to the cloud tier.


## Results: the comparison experiments re-run against the deployed contract, 2026-11-11 (afternoon)

The testnet sweep (`20261111T123924Z-0295`, **not promoted**: 14 pass, 13 fail) re-ran experiments that last passed on 5 to 8 November against older production contracts. The failures were not contract faults. They were: a missing build (the poll, auction and multisig wasms), a funding shortage (the main account held 1.5 NEAR against needs of 2.3 to 3.9), the free RPC's rate limit (`-429`, retried only for view calls), a contract wasm that had grown past a hard-coded funding amount (the quote and cross contracts are 325 KB, about 3.25 NEAR of storage, against 3.2 funded), a stale call (the invest comparison signed twice in a round the room now refuses to re-sign), and drift. Fixes: the retry now sits at the RPC transport (tested), build scripts for every wasm, funding raised, a round opened and abandoned the way a real room does. The main account was refilled from the public testnet helper (9.998 NEAR to a new account, moved to the main account) and from the throwaway OutLayer account's spare balance.
- `20261111T151252Z-adf6` (promoted, with its failures): `E-CMP-AUCTION-01`, `-INVEST-02`, `-VOTE-01`, `-PAYROLL-01`, `-RFQ-01` PASS; `-INVEST-01`, `-QUOTE-01`, `-CROSS-01` FAIL for the last two causes above.
- `20261111T154524Z-e1cb` (promoted): `E-CMP-INVEST-01`, `-QUOTE-01`, `-CROSS-01` PASS.
Still open from the sweep: `E-CHAIN-ROUND-LOCAL` and `E-IFACE-CHAIN` (GAP-051: they require production to equal a build of this checkout), and a re-run of `E-CONTRACT-FOREIGN-LIVE-01` and `E-FOREIGN-SIGNER-FAIL-LIVE-01` after their self-contained fixes.

**The remaining sweep failures, re-run.** `20261111T155952Z-36ff` (promoted, failures included): `E-CONTRACT-FOREIGN-LIVE-01` PASS (it now tops up its own group's addresses; its group's signer path changed in GAP-049, which left the standing group unfunded), `E-ONGOING-01` PASS, `E-TIMER-CONSENT-01` PASS; `E-FOREIGN-SIGNER-FAIL-LIVE-01`, `E-TWO-ROOM-LIVE-01` and `E-CALLBACK-GAS-01` FAIL for stale expectations. `20261111T161635Z-d4d4` (promoted): `E-TWO-ROOM-LIVE-01` PASS (both rooms now abandon the refused signature before the round is reopened) and `E-CALLBACK-GAS-01` PASS (the earlier teardown miss did not recur); `E-FOREIGN-SIGNER-FAIL-LIVE-01` FAIL again. `20261111T162605Z-def8` (promoted): `E-FOREIGN-SIGNER-FAIL-LIVE-01` PASS. Its failures were all mine and worth stating: it asserted the test copy's signer override was empty, but an earlier failed run had left it pointing at a dead account (a failed run aborting between "break the signer" and "restore it"). It now repairs that state at the start and always restores the real signer in teardown, so a failed run cannot leave the test copy broken. Still open: `E-CHAIN-ROUND-LOCAL` and `E-IFACE-CHAIN` (GAP-051).

## Reversal, 2026-11-11 (evening): the older hardware experiments are rewritten to sign, after all

An earlier note in this plan said `105` (escrow) and `30` (the first hosted run) would stay as the record of earlier images and not be rewritten. That is reversed: the stated weakness was that those claims rest on images the pinned compose no longer matches, and it can be closed cheaply. `E-HOSTED-ESCROW-LIVE-01` now seals **and signs** each member's input for the current round, exactly as `E-HOSTED-DARKVAULT-LIVE-02` does. `E-HOSTED-LIVE-01` (a full syndicate round through the shared chain-round flow) gets the same through a `signedInputs` option on the flow, which the local experiment does not use. The **predictions of both are unchanged**: the escrow experiment still predicts that an unfunded member is left out by account inside the VM and the settlement lands; the hosted round still predicts a full syndicate round on NEAR. If either fails on the pinned image that is a finding and is recorded as one. The older runs (`b8de`, `bd50`) stay as the record of the earlier images.

## GAP-052 on hardware, first try (2026-11-11, evening)
The image with the key-check fix was built by CI on merge of PR #11 (`sha256:3014e8f0…c38531`, pullable) and `E-HOSTED-PAYRUN-LIVE-01` was run on a real VM with it: run `20261111T212638Z-cbf5` (**FAIL**, kept local, not promoted). The VM attested a new compose hash (`02031340…`), which is **not** pinned because it will change with the next image. Predictions 1 passed; the first signed input was then refused with "could not check that … is a key of …", where the older image said "is not a key". That confirms the fix is in the image and that, from the VM, a chain provider cannot answer even after retries. The refusal did not name the provider, so it now carries the provider's reason; that needs another image build.

## Results: the rebuilt image on hardware, 2026-11-11 (evening)
CI built the image with the GAP-052 key-check fix when PR #11 merged (`sha256:3014e8f0…`), and again with the provider-naming change when PR #12 merged (`sha256:8b24055f…`, pullable). **What the hardware showed, in order.** Run `20261111T212638Z-cbf5` (**FAIL**, kept local) on the first image: the refusal changed from "is not a key" to "could not check", which proved the fix was in the image and that a chain provider could not answer the VM. Run `20261111T215843Z-2f09` (**FAIL**, kept local) on the second image: the refusal now named it, `rpc.testnet.near.org could not answer (HTTP 429)`. The legacy NEAR endpoint rate-limits the VM, and answered in 6.4 seconds even from the development machine. Probing alternatives from the development machine, `near-testnet.drpc.org` answered a good key, a wrong key and the escrow reader at one block (0.8 s against 9.9 s); Lava is discontinued and the others did not resolve. The room's providers (`ROOST_RPC_URLS` and `ROOST_ACCOUNT_CHECK_RPC_URLS`) became `test.rpc.fastnear.com` and `near-testnet.drpc.org`, which changed the compose hash.

**Then nine hardware experiments passed on that image**, each promoted with its log verified: `E-HOSTED-PAYRUN-LIVE-01` `20261111T220404Z-581c`, `E-HOSTED-DARKVAULT-LIVE-02` `20261111T220705Z-da36`, `E-HOSTED-RFQ-LIVE-01` `20261111T221202Z-d522`, `E-HOSTED-RFQ-LIVE-02` `20261111T221430Z-fdef`, `E-HOSTED-SIGNED-LIVE-01` `20261111T221718Z-ace0`, `E-HOSTED-ESCROW-LIVE-01` `20261111T222001Z-902c` (rewritten to sign its inputs), `E-HOSTED-LIVE-01` `20261111T222226Z-03a5` (the first hosted round, now signed), `E-HOSTED-FAILCLOSED-LIVE-01` `20261111T222555Z-1881` and `E-HOSTED-ACCTCHECK-FAIL-LIVE-01` `20261111T222732Z-fb9b`. The first seven attested compose hash `5124af59…`, which is now pinned in `roost.expected.json` (newest first, earlier hashes kept); the last two ran on fixture composes with their own hashes. This closes the stated weakness that the Dark Vault, escrow and first-round claims rested on older images. **Not shown:** that dRPC stays reachable from the VM over time (a public endpoint can rate-limit too; the refusal will now say so), and that three independent providers would be more robust.

## Re-pin to the image built from the rewritten master, 2026-11-12
After the history rewrite CI built the same source tree as a new image from commit `6bf33ae` (`sha256:310f1130…`), so its build attestation names a commit that exists, unlike the image pinned on 2026-11-11. The three compose files were re-pinned to it and the nine hardware experiments were run again on real VMs, each promoted with its log verified: `E-HOSTED-PAYRUN-LIVE-01` `20261112T031407Z-8c64`, `E-HOSTED-DARKVAULT-LIVE-02` `20261112T031652Z-b62e`, `E-HOSTED-RFQ-LIVE-01` `20261112T032202Z-a3a8`, `E-HOSTED-RFQ-LIVE-02` `20261112T032438Z-98db`, `E-HOSTED-SIGNED-LIVE-01` `20261112T032730Z-3b68`, `E-HOSTED-ESCROW-LIVE-01` `20261112T033017Z-6d62`, `E-HOSTED-LIVE-01` `20261112T033236Z-3fb0`, `E-HOSTED-FAILCLOSED-LIVE-01` `20261112T033559Z-259c`, `E-HOSTED-ACCTCHECK-FAIL-LIVE-01` `20261112T033738Z-90d0`. The main compose hash is `620a25cc9310e33bbc2c62c23e66f6e6e223163d4b218354e39456d72058a8d2`, now first in `roost.expected.json`; the fail-closed and account-check fixtures ran on composes with their own hashes. Same providers (`test.rpc.fastnear.com`, `near-testnet.drpc.org`) as the previous pin. The previous pin's runs stay as evidence. **Not shown:** that dRPC stays reachable from the VM over time.

## Program batch: weighted ballots with a supermajority, and pro-rata pools: predictions, written 2026-11-12 before the experiments exist or run

**What it is, in plain words.** Two room programs get a second mode, and nothing existing changes. The ballot today counts one vote per roll member and decides by majority or plurality. A group that gives members unequal shares needs weighted votes, and a decision with a higher bar (for example two thirds) needs a supermajority rule. The pool today takes bids in arrival order and leaves out a bid once the cap would be passed, so who is shut out depends on who was fast. A pro-rata mode instead scales every bid down by the same ratio when the pool is oversubscribed, so arrival order stops mattering. (An earlier note in this session suggested a reserve price and a per-member cap. Both already exist: the auctions have `reserveMicro`, the pool has `minMicro` and `capMicro`. They are not part of this batch.) Defaults stay as they are, so every earlier promoted run still describes the same behaviour.

**E-BALLOT-WEIGHTED-01 (offline).** `clearBallot` gains an optional `weights` map (a positive whole number per roll member, default 1) and a rule `supermajority` with `thresholdBps` (5001 to 10000).
1. **No weights, no change.** For any ballots, a call without `weights` returns the same result as the current code, over 3,000 random rounds.
2. **Weights count.** With weights 3, 1, 1 for three members, the 3-weight member alone beats the other two, and quorum is measured in weight, not in heads.
3. **A supermajority needs its bar.** A winner with 66% of non-abstaining weight fails a 6,667 bps threshold and passes 6,600; exactly on the threshold passes.
4. **Order independence and no tally.** The result does not depend on ballot order, and the outcome still carries no tally, turnout or weight.
5. **Refusals.** A weight of 0, a negative or fractional weight, a weight for someone outside the roll, a threshold under 5,001 or over 10,000, and `supermajority` without a threshold are refused with a clear error.
6. **On the host.** `runBallot` with weights and a threshold decides as the program does, charges every roll member the same share (weights change votes, not payments), and the order hash differs between a weighted and an unweighted run of the same ballots.
7. **Mutations the experiment must catch:** counting heads instead of weight; `>` instead of `>=` at the threshold; ignoring `weights` in the quorum.

**E-POOL-PRORATA-01 (offline).** `clearPool` gains `mode: 'pro-rata'`; it needs a cap.
1. **Under the cap nothing changes.** When the eligible total is at or under the cap, every bid is taken in full, as in first-come mode.
2. **Over the cap, one ratio.** When over, each contribution is `floor(bid x cap / eligible total)`; the total is at most the cap and within one micro-NEAR per member of it; no contribution exceeds its bid.
3. **Arrival order stops mattering.** Shuffling the bids gives the same contributions (first-come mode does not, and the experiment shows the difference on the same bids).
4. **Charges equal contributions.** On the host, each member is charged exactly their scaled amount, the recipient gets exactly the total, and the order hash differs from first-come mode on the same bids.
5. **Edges.** A bid whose scaled amount is zero is left out and reported; a bid under `min` is left out before scaling; pro-rata without a cap is refused.
6. **Mutations the experiment must catch:** rounding up instead of down (the total would pass the cap); scaling by arrival rank; applying `min` after scaling.

**E-HOSTED-PROGRAMS-LIVE-01 (hardware, after a new image is built and pinned).** The same two modes on a real Phala TDX VM: a weighted supermajority ballot that decides and one that fails the bar, and an oversubscribed pro-rata pool, each settled on the test copy `m.fly-1793636729.testnet` with every input signed. Predictions: the VM attests the new compose hash; the settlements are accepted; each member's charge equals the scaled amount to the micro-NEAR; the failed supermajority pays nothing; teardown leaves the Phala account empty, under $0.15.

**Not tested here:** more than 8 payees in a pay run (that is a separate change to how one run is split into settlements), weights taken from deposits (here the caller supplies them and they are public in the request), two rooms. **Weaknesses I expect to remain:** weights are public and supplied by the caller, and a member can hold several accounts, so a weight is a deposit-funded share and not a person; pro-rata hides nothing extra (the charges are public at settlement).

### Results: weighted ballots with a supermajority, and pro-rata pools (written after the runs; the predictions above were not edited)

Run `20261112T154404Z-bb66` (offline tier, 59 events, log verified, promoted): `E-BALLOT-WEIGHTED-01` PASS and `E-POOL-PRORATA-01` PASS. `./scripts/verify` exits 0 (465 JavaScript tests, 0 foundry violations, 102 s).

- **Predictions that held.** Without weights the ballot returns what a frozen copy of the old code returns, over 3,000 random rounds, both rules and three quorums. Quorum and shares are counted in weight. Exactly on a supermajority bar passes and one point under fails. The outcome carries no tally, turnout or weight. Bad weights and thresholds are refused, by the program and by the host. In the pool, every contribution is `floor(bid x cap / eligible total)` over the cap and the full bid under it; the total never passes the cap and is within one micro-NEAR per member of it; the result is the same for any arrival order, and first-come mode (unchanged) gives a different answer to the same bids in reversed order. The host charges each member exactly their scaled amount and refuses charges that differ by one yocto or that use the unscaled bids.
- **Mutations.** Six changes to the code were each caught by the experiment, then reverted: counting heads instead of weight, `<=` instead of `<` at the bar, ignoring weights in the quorum, rounding up in the pool, scaling by arrival rank, and applying the minimum after scaling.
- **A correction to the plan's own premise.** The batch was first described as adding a reserve price and a per-member cap. Both already existed (auction `reserveMicro`; pool `minMicro` and `capMicro`), so they were dropped from the batch before the predictions were written.
- **Also changed.** The HTTP room service and `/ballot` and `/pool` routes accept `weights`, `thresholdBps` (rule `supermajority`) and pool `mode`; the order hash includes them only when used, so every earlier hash is unchanged.
- **Not done.** The hardware run (`E-HOSTED-PROGRAMS-LIVE-01`) needs a new image built by CI and pinned, then a VM. Pay runs over 8 payees are not part of this change. Claims and the ledger are not yet updated for the new modes.

## An AI review of a pay run, with the code checking the AI: predictions, written 2026-11-12 before the experiments exist or run

**What it is, in plain words.** A pay run already has deterministic checks (arithmetic, invoices, caps). Some questions need reading and reasoning: do these tax and benefit rates fit the rules the employer wrote in plain words, which lines look wrong, and which amounts could let an outsider guess who was paid. This adds an optional review by an attested NEAR AI Cloud model. The model is told no name, account, address, invoice id or exact amount. It is given, per line, a letter label, the gross as a band relative to the run's median, the tax rate and the benefits rate to a tenth of a percent, and three yes-or-no flags the code computed (invoice matched, address used in an earlier run, period matches). It also gets the employer's own rules as plain text. It replies with findings in a fixed shape. The code then re-checks every finding it can check from the numbers and marks the rest "not verified". The review is advice only: it never changes a run, a signature or a payment, and it is off unless the caller turns it on.

**E-PAYRUN-ANALYST-01 (offline, with a scripted stand-in for the model).**
1. **The model is sent nothing identifying.** Over 500 generated runs with random names, accounts, invoice ids and amounts, the message built for the model contains none of them, nor anything shaped like an account id, address or 64-character hex value. A run whose employer rules text contains an account id or a person's name is refused before anything is sent.
2. **Bands and rates are right.** A gross of exactly the median is band 100; one 20% above is 120; rates are exact to a tenth of a percent; two runs that differ only in exact amounts inside the same bands produce the same message.
3. **Linkability is computed by the code, not guessed.** A line whose net amount is the only one in its 10% band is flagged `unique-amount`; a payee address that appeared in an earlier run is flagged `address-reused`; a run of one is flagged `headcount-one`. These flags come with or without the model.
4. **The reply is held to a shape.** A reply with an unknown code, an unknown line label, a note over 160 characters, extra fields, or anything shaped like an identifier is rejected whole, and the deterministic text is used instead.
5. **Findings are cross-checked.** A claimed `rate-above-schedule` on a line whose rate is not above the employer's stated rate is marked `not-verified`; a true one is marked `verified`. A model that lies about the numbers cannot get a "verified" mark.
6. **Advice cannot change the run.** The pay run result is byte-identical with the review on, off, failing, or returning nonsense.
7. **Mutations the experiment must catch:** sending the exact gross; skipping the leak check on the employer's rules; marking every finding verified; letting a reply with extra fields through.

**E-PAYRUN-ANALYST-LIVE-01 (live, NEAR AI Cloud, opt-in, a few cents).** The same module against the attested gateway with a six-line synthetic run that contains one line with a missing tax deduction, one with benefits over the stated cap, and one unique amount.
1. **The gateway answers over the attested channel** and the record (key, attestation, request and response hashes) verifies.
2. **The reply parses in the fixed shape** on the first try or after one retry; if it does not, the run falls back to the deterministic text and the experiment records that as a miss.
3. **It finds the planted problems.** The missing deduction and the benefits cap are reported on the right line labels and both cross-check as `verified`. I expect the unique amount to be found by the code flags, and the model to mention it in about half the runs.
4. **It invents nothing the code can check.** Every `verified` finding is true; any false claim is marked `not-verified`.
5. **Nothing identifying left the machine:** the logged request contains none of the synthetic names, accounts or amounts.

**Not tested:** real tax law (the model has no authority on it and is told to reason only from the employer's text), a real company's data, more than 8 lines, the model on every run. **Weaknesses I expect to remain:** the model may miss a problem or phrase one badly; bands and rates still carry some information; the review is only as good as the rules text the employer writes; and a model behind an attested gateway is still a third party that sees the redacted message.

### Results: the program batch on hardware, and the AI review of a pay run (written after the runs; the predictions above were not edited)

**E-HOSTED-PROGRAMS-LIVE-01**, run `20261112T173152Z-e25d`, PASS on the first hardware run, 76 events, log verified, promoted, about $0.0027. On a real Phala TDX VM running image `sha256:76dd150f…` (built by CI from merge commit `0e1bced`; compose hash `29f58898…`): the VM attested; a weighted supermajority ballot (member `ma` weighted 3, a 70% bar) decided nothing and the group's escrow stayed at 0.15; the same signed votes at a 60% bar, exactly the winner's weighted share, decided, the contract accepted the settlement, `ra` received exactly 0.03 and each voter was charged exactly 0.01; an oversubscribed pro-rata pool (three bids of 0.04, a cap of 0.09) charged each member exactly 0.03 and paid `rp` exactly 0.09; teardown pruned the group, deleted six accounts and the VM, and left the Phala account empty. Transactions: `BUdWySUK…` (ballot) and `8nt2BPFG…` (pool). The cost prediction (under $0.15) held with a wide margin. Only the cash leg settles, charges are public, and one operator ran everything.

**E-PAYRUN-ANALYST-01** (offline), run `20261112T173655Z-f9e9`, PASS. The experiment was written and run in one pass with the module, so it was never seen failing first. To show it has teeth, five mutations were tried: sending the exact gross, skipping the leak check on the employer's text, marking every finding verified, letting extra fields through, and verifying a false rate claim. Four were caught at once. **The mutation that marked every finding verified slipped through**, because the test only checked that the cross-check returned one of two words. Two assertions were added (codes the numbers cannot settle are never verified; a rate-outlier claim on a line at the median rate is not), and all five were then caught.

**E-PAYRUN-ANALYST-LIVE-01** against the attested model, three runs. Run `20261112T173516Z-5565`: **FAIL**. The model answered in the fixed shape on the first attempt and put the missing tax deduction on the right line, but the code marked it not-verified, because the code defined `zero-deduction` as no tax and no benefits while the planted line had 3% benefits. Prediction 3 said the finding would verify, so the code's definition was the fault, not the model's. The code's definition and the prompt were changed to "no tax is withheld on the line" and the offline experiment gained an assertion for it. Run `20261112T173557Z-e315`: **FAIL**, with the finding now verified; the experiment's own recomputation still used the old definition. It was changed to match. Run `20261112T173632Z-569c`: PASS, first attempt, receipt verified, the missing deduction and the benefits over the cap both found on the right lines and verified, the unique amount flagged by the code, no identifying string in the request. All three runs are promoted. Not shown: usefulness of the notes to an accountant, any run with real data, and how often the model misses a planted problem (three runs, one model).

## A pay run on hardware with an AI review that catches a planted mistake, and a repeatability test for the reviewer: predictions, written 2026-11-13 before the experiments exist or run

**What it is, in plain words.** The optional AI review of a pay run is now an engineered reviewer: a brief with a defined role (a careful, sceptical payroll reviewer who reasons only from the employer's rules), a fixed procedure, two worked examples that are not the test case, and the meaning of every code. Two experiments check it. The first asks whether it gives the same judgement every time. The second runs it inside a real pay run on hardware, where it must catch a deliberately planted mistake that the invoice check cannot see, and where everything the page will later show (receipts, statements, an auditor pack) is saved as evidence.

**"The same judgement" is defined before the runs.** A review is reduced to its set of (line, code) findings, and the wording of the notes is ignored. A review counts as catching the planted mistake when it has a finding on the planted line, with the code `zero-deduction` or `rate-below-schedule`, that the code verifies against the numbers. A false claim is any finding with a code the numbers can settle (`zero-deduction`, `rate-above-schedule`, `rate-below-schedule`, `benefits-above-cap`, `rate-outlier`, `unique-amount`, `address-reused`, `headcount-one`) that the code marks not verified.

**E-PAYRUN-ANALYST-REPRO-01 (live-external, the attested NEAR AI Cloud model, a few cents).** Twenty reviews, ten on each of two redacted runs of four lines. Run P has one planted mistake: a line with no tax withheld, while the employer's rules say a flat 15 percent. Run C is the same run with that line corrected. The brief's examples use different numbers and different mistakes from both.
1. **P is caught every time.** In 10 of 10 reviews of P there is a verified finding on the planted line with `zero-deduction` or `rate-below-schedule`.
2. **No false claims.** In 0 of 20 reviews is there a false claim.
3. **C is passed every time.** In 10 of 10 reviews of C there is no finding with `zero-deduction`, `rate-above-schedule`, `rate-below-schedule` or `benefits-above-cap`, because none is true.
4. **The shape holds.** All 20 replies parse in the fixed shape on the first attempt (no retry is used in this experiment).
5. **The same set.** The set of (line, code) findings that count as catches is identical across the 10 reviews of P, and across the 10 of C it is empty.
6. **Rounds.** If the bar is missed, that is an engineering failure of the brief, not an excuse. The brief is improved and the experiment re-run, up to three rounds in all, every attempt recorded locally. Only the passing run is promoted, and the round that passed is stated in the results. If no round passes, the work stops and the misses are reported.
**Expected weakness.** A model that is right 10 of 10 on one run has not been shown right on every run. The test shows repeatability on this input, not general accuracy on payroll.

**E-HOSTED-PAYRUN-LIVE-02 (hardware, production contract, a Phala VM for about five minutes, about $0.003, plus testnet NEAR that returns at teardown).** One employer, four payees (Alice, Bo, Cy, Dee; gross 0.05, 0.04, 0.03 and 0.06 NEAR), a tax account and a benefits account, each payee given a fresh one-time address.
1. **The VM attests** the pinned image (`sha256:76dd150f…`, compose hash `29f58898…`).
2. **A mismatch is refused.** Dee's invoice says 0.065 and the approved line says 0.06; the room refuses the whole run and keeps the queue.
3. **The reviewer catches the planted mistake.** Cy's line has no tax withheld, and her invoice matches her line, so the invoice check passes it. The redacted run goes to the attested model; with at most one retry, the review has a verified finding on Cy's line (`zero-deduction` or `rate-below-schedule`). The request contains none of the names, one-time addresses, invoice ids or exact amounts. The model's receipt verifies.
4. **The corrected run settles on the production contract.** After Cy's tax is set to 0.0045 (15 percent) the room signs and the contract accepts. Alice's address receives exactly 0.04, Bo's 0.032, Cy's 0.024 and Dee's 0.048; the tax account 0.027 and the benefits account 0.009; the employer is charged 0.18.
5. **The sub-transaction sums hold.** The four tax lines in the employer's statement add up to the one tax transfer on chain, the benefits lines to the one benefits transfer, each net to its payee's transfer.
6. **Receipts verify.** Each payee's receipt verifies against the order hash read from the settlement transaction on chain. A receipt with its net raised fails, and another payee's key cannot open it.
7. **The auditor pack opens one line.** The employer signs a request for Bo's line; the auditor verifies it against the on-chain order hash; the pack names no other person; a request signed by another key is refused.
8. **The evidence is saved.** The sealed receipts, the employer statement, the auditor pack and the totals view, the throwaway keys that open them (made for this run, testnet only), and the review's redacted message, reply and receipt are recorded as evidence, so a page can verify them without trusting this machine.
9. **Teardown leaves nothing.** Accounts deleted, group pruned, VM deleted, Phala account empty, under $0.10.
**Not tested:** more than 6 recipients, two rooms, foreign-chain payments, a room that stays up. **Weaknesses I expect to remain:** one operator ran everything; amounts and addresses are public on NEAR; the planted mistake is planted, so this shows the reviewer catching a mistake of a kind it was told about (a zero tax line), not that it would catch every real one.

### Results: the engineered pay run reviewer, and a hardware pay run with a planted mistake (written after the runs; the predictions above were not edited)

**E-PAYRUN-ANALYST-REPRO-01**, run `20261113T034504Z-c6cd`, PASS on the first round, 37 events, log verified, promoted. Against the attested NEAR AI Cloud model (`Qwen/Qwen3.6-35B-A3B-FP8`, temperature 0), twenty reviews with the brief as it stands in `src/advisor/payrun-analyst.js`: in all 10 reviews of the run with the planted mistake the only finding was `zero-deduction` on the planted line, verified by the code; in all 10 reviews of the corrected run there were no findings; none of the 20 had a false claim; all 20 replies parsed on the first attempt; the catch set was identical across the ten and empty across the other ten. **No improvement rounds were needed**, so the passing run used the first brief written; there are no failed drafts. Not shown: accuracy on other runs or other mistakes (the test is one input and one planted mistake), and the reviewer's wording, which varies and is ignored by definition.

**E-HOSTED-PAYRUN-LIVE-02**, run `20261113T034712Z-5244`, PASS on the first hardware run, 107 events, log verified, promoted, about $0.0023. On a real Phala TDX VM running image `sha256:76dd150f…` (compose hash `29f58898…`): the VM attested; Dee's invoice (0.06) against the employer's line (0.065) stopped the run and was named, and asking again gave the same refusal; the attested reviewer, on its first attempt, flagged Cy's line (no tax withheld, which the invoice check cannot see) with `zero-deduction`, verified by the code, from a request with none of the names, one-time addresses, invoice ids or exact amounts, and with a receipt that verified; after the correction the run settled on the production contract in transaction `C8owyMBu…` with exact amounts (0.04, 0.032, 0.024 and 0.048 to the four payees, 0.027 tax, 0.009 benefits, 0.18 charged); the four tax lines, the four benefits lines, each net and the gross total added up to the public transfers; every receipt verified against the order hash read from the chain, a receipt with its net raised failed and another payee's key could not open one; the auditor pack opened only Bo's line and a request signed by another key was refused; the receipts, statements, pack, totals view, review message and reply, and the throwaway keys were saved as evidence; teardown deleted seven accounts, pruned the group, deleted the VM and left the Phala account empty. The planted mistake is planted: this shows the reviewer catching a kind of mistake its brief names, not every real one.

## Does the pay run reviewer make mistakes that break accuracy? A scored test across many runs: predictions, written 2026-11-13 before the experiment exists or runs

**What it is, in plain words.** The repeatability test showed the reviewer gives the same answer on one input. It did not show the answer is right on other inputs. This test gives the reviewer many different pay runs, each with a known right answer worked out by code from the numbers, and scores it: did it find every planted mistake, did it invent any, and did it behave on runs where the rules themselves are unclear. There are two sets. The development set (hand-designed cases and runs from seed 1) may be used to improve the brief. The held-out set (runs from seed 2, never seen while improving) is run once, after the brief is final, and its numbers are the ones reported.

**How the right answer is worked out.** The code reads the same rounded numbers the model is given. For a line, tax of 0 is a `zero-deduction`; tax above 0 but more than 0.05 points under the stated rate is `rate-below-schedule`; more than 0.05 points over is `rate-above-schedule`; a benefits rate more than 0.05 points over the stated cap is `benefits-above-cap`; a number exactly at the limit passes. A planted mistake is caught when the review has a finding on that line with the right code (for a line with no tax, `zero-deduction` or `rate-below-schedule` both count).

**The cases.**
- Hand-designed (development): one mistake of each kind; two and three mistakes in one run; every line broken; a one-line run and an eight-line run; lines exactly at the tax limit and at the benefits cap (these must pass); lines one tenth of a point over each limit (these must be flagged); rules with no benefits cap; rules written in three different phrasings; a line whose address was used before (`address-reused`); a line whose invoice or period flag is false (no code names it, so nothing is required); tiered rules the stated numbers cannot express, and a rule that says nothing about tax (the right answer is no rule-break findings, or `schedule-ambiguous`).
- Generated: 20 runs from seed 1 (development) and 30 from seed 2 (held out), of 2 to 8 lines, with random rates, caps and amounts, each line either correct or carrying one planted mistake of a random kind by at least one full point.

**Predictions (the bars are set before the run).** Measured on the held-out set only:
1. **Recall.** At least 95 percent of planted mistakes are caught.
2. **Precision.** At least 95 percent of rule-break findings (`zero-deduction`, `rate-above-schedule`, `rate-below-schedule`, `benefits-above-cap`) are about a line and a code the code agrees with.
3. **No false claims.** At most 2 percent of checkable findings are marked not verified by the code.
4. **Clean runs stay clean.** In at least 95 percent of runs with no planted mistake there is no rule-break finding.
5. **Parsing.** At least 95 percent of replies parse in the fixed shape on the first attempt.
6. **Unclear rules.** Reported without a bar: how often the reviewer invents rule-break findings when the rules cannot be applied.
**Expected weak spots (said before the run).** Lines exactly at a limit; eight-line runs with several mistakes; tiered or silent rules, where I expect some invention; and a line with both a tax and a benefits mistake.
**What a miss means.** Any bar missed on the development set sends the brief back for improvement, up to three rounds, every attempt kept locally. A miss on the held-out set after the final round is reported as it is: the held-out numbers are never re-run to look better, and the brief is not changed after seeing them.
**Not tested:** real payroll data, amounts (the reviewer never sees them), another model, or mistakes the brief does not name.

### Amendment to the accuracy test, 2026-11-13, written after two development rounds and before the held-out set was run
Round 1 on the development set missed two bars (a boundary mistake, 0.1 point over the limit, was missed; three false claims came from tiered rules where the reviewer invented rate findings). The brief was improved: a stated number of null means no rate or cap finding at all, and every rate is compared with the stated number to one decimal place, so a rate 0.1 over is over. Round 2 fixed both (no false claims, the boundary caught) but two reviews of 42 never got an answer because the network call failed (`fetch failed`), and a review with no answer counts its planted mistakes as missed. That is a fault in our call, not an answer the reviewer gave, so the experiment now retries a **network failure only**, up to twice; a reply the model gives is never retried, however wrong. The number of transport retries is recorded. The bars and the definitions are unchanged, and the held-out set has not been run.

### Results so far, and a second held-out set of hard cases, written 2026-11-13 before the hard set exists or runs
**Development set (the brief was improved against it).** Round 1 failed two bars (recall 41 of 42, false claims 3 of 48); round 2 fixed both and was spoiled by two network failures; round 3, with the transport-only retry, passed every bar (recall 42 of 42, precision 42 of 42, false claims 0 of 47, clean runs 17 of 17, parsing 42 of 42). Rounds 1 and 2 are kept locally and not promoted. **Held-out set (30 generated runs, run once with the brief frozen):** recall 47 of 47, precision 47 of 47, false claims 0 of 48, clean runs 9 of 9, parsing 30 of 30, no transport retries. **That is weaker evidence than it looks:** the held-out runs come from the same ordinary distribution as the generated development runs (mistakes at least a full point from the limit), and the hard cases (boundaries, unclear rules) were only in the development set, which the brief was tuned on.

**The hard held-out set (16 new hand-designed cases, never seen while improving the brief).** One tenth of a point under the tax rate and over the cap with numbers the brief does not use; benefits exactly at a cap of 4; two lines with no tax; an extreme tax rate (60 percent against 15); no benefits at all; a stated tax rate of 0 (a regime with no tax, where a tax of 0 is correct); a cap of 0; a fractional rate of 12.5 with a line at 12.6; identical lines; very different gross amounts; a larger run with several kinds of mistake and a line exactly at the cap; and four cases where the rules cannot be applied or disagree with themselves: tax of 15 percent for employees and 0 for contractors, a rate said to be "approximately 15 percent" with lines at 14.9 and 15.2, rules that say 20 percent against stated numbers of 15, and a rule that exempts some people without saying who. The right answers come from the same oracle, with one correction found while writing these cases: a stated tax rate of 0 means a tax of 0 is correct, so the oracle no longer calls it a zero-deduction.
**Predictions (set before the run, and the bars are looser because the cases are adversarial).** Recall at least 90 percent of planted mistakes; precision at least 90 percent; false claims at most 5 percent; clean runs at least 90 percent without a rule-break finding; parsing at least 95 percent. **Expected weak spots, said before the run:** the "approximately 15 percent" case, the contradictory rules, the exemption rule and the stated tax rate of 0, where I expect at least one to fail. **Which cases are scored.** The four unclear cases are reported separately (how often the reviewer invents a rule break) and are not in the recall and precision bars. They are not used to improve the brief: it is frozen, and a miss is reported as it is.

### Results: the scored accuracy test (written after the runs; the predictions above were not edited)
The brief was frozen after round 3 on the development set (`src/advisor/payrun-analyst.js`, sha256 recorded in each run). Each set was run once with that brief.
- **Development set, round 3** (run `20261113T040200Z-54f6`, promoted): recall 42 of 42, precision 42 of 42, false claims 0 of 47, clean runs 17 of 17, parsing 42 of 42, two transport retries. The brief was improved against this set, so these numbers show the improvement worked and nothing more. Rounds 1 and 2 (failed) are kept locally and not promoted.
- **Held-out set, 30 generated runs** (run `20261113T040421Z-97c8`, promoted): recall 47 of 47, precision 47 of 47, false claims 0 of 48, clean runs 9 of 9, parsing 30 of 30, no retries.
- **Hard held-out set, 16 new hand-designed cases** (run `20261113T040717Z-2978`, promoted): recall 12 of 12, precision 12 of 12, false claims 0 of 21, clean runs 4 of 4, parsing 16 of 16. Of the four cases that cannot be scored, the reviewer reported a rule break in two. In the "approximately 15 percent" case it flagged both the line at 14.9 and the line at 15.2, and in the exemption case it flagged the line with no tax, which is what the rule asks an employer to document; in the contractors case and the case where the rules disagreed with the stated numbers it reported nothing.
**Predictions that were wrong.** I predicted at least one of the four hard unclear or unusual cases (approximately, contradictory rules, exemption, a stated tax rate of 0) would fail; none did. I also predicted weak spots at the boundaries and with larger runs; the boundary and the eight-line runs held on every set after the round-1 fix.
**What was broken, and found by this test.** In round 1 the reviewer missed a line 0.1 point over the tax limit and invented rate findings under tiered rules (three false claims, 6.3 percent of checkable findings). Both were failures of the brief and were fixed by it. Round 2 was spoiled by two dropped network connections, which counted as missed mistakes; the call now retries a network failure (not a model reply) up to twice.
**What this does not show.** Samples are small (47 and 12 planted mistakes in the two held-out sets, and 9 and 4 clean runs). All runs are synthetic and use the same four codes the brief names. The oracle reads the same rounded numbers the model is given, so this measures applying the employer's stated rules, not judging real payroll. One model, temperature 0, one review per run, so run-to-run variation is covered only by the separate repeatability test on one input.

**A discrepancy to close.** The repeatability run (`20261113T034504Z-c6cd`) and the hardware pay run (`20261113T034712Z-5244`) used the first version of the reviewer's brief. The accuracy test then improved the brief, so the brief now in the repository is not the one those two runs used. Both runs remain true of the first brief and their claims now say so. Re-running both on the final brief is cheap (a few cents and about $0.003 of Phala) and is the way to make every claim about one brief.

### Re-run on the final brief, 2026-11-13, written before the re-runs
The predictions for `E-PAYRUN-ANALYST-REPRO-01` and `E-HOSTED-PAYRUN-LIVE-02` above are unchanged and apply to the brief now in the repository (the one the accuracy test validated). Both experiments are re-run once each. If a re-run fails, that is reported as it is, and the earlier runs stay as the record of the first brief.

### Results: the re-runs on the final brief (written after the runs; the predictions above were not edited)
**E-PAYRUN-ANALYST-REPRO-01**, run `20261113T041735Z-1296`, PASS: in 10 of 10 reviews of the run with the planted mistake the only finding was `zero-deduction` on the planted line, verified; in 10 of 10 of the corrected run there were no findings; no false claims; all 20 replies parsed on the first attempt. **E-HOSTED-PAYRUN-LIVE-02**, run `20261113T041922Z-5bc2`, PASS on the first attempt, about $0.0023: every prediction held again on a new group, with the reviewer catching Cy's line (`zero-deduction`, verified, first attempt) and the settlement in transaction `GNzfiVES…`. Both claims (`CLM-PAYRUN-ANALYST-03`, `CLM-HOSTED-PAYRUN-02`) now cite these runs; the first runs on the earlier brief are kept as history.
