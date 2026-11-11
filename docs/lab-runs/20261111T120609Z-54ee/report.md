# Lab run 20261111T120609Z-54ee

- **Code:** `ab01ac563fbfeb39b01bafbbbeb56451638c678b` on `completeness` (**1 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `73f42e651241e148…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 197 events, hash-chained; root `ee27f814605b5b3e73cdd94f64d2ddaaa283bf8f31dfd38105fe5126e0280d44`. Verify with `node lab/verify-run.js lab/runs/20261111T120609Z-54ee`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-QUOTE-PROGRAMS-01 Best-quote (lending, RFQ) and cross (block trade) room programs: right winners, conserved cash, signed only as computed | offline | **PASS** | 4 | 31 |  |
| E-BALLOT-PROGRAM-01 Ballot room program: right winner, no tally in the outcome, outsiders and unsigned ballots refused, re-voting, order-independent | offline | **PASS** | 2 | 27 |  |
| E-PAYRUN-PROGRAM-01 Pay-run room program: balanced lines, one-time payees, signed encrypted receipts under a Merkle root, auditor totals only | offline | **PASS** | 3 | 44 |  |
| E-RFQ-PROGRAM-01 Two-sided RFQ room program: makers quote both ways, the taker's side stays sealed, the right maker wins in both directions | offline | **PASS** | 2 | 27 |  |
| E-DEPOSIT-CONSENT-01 A deposit consents to terms the depositor states; the client never copies the hash from the contract | offline | **PASS** | 7 | 20 |  |

## E-QUOTE-PROGRAMS-01: Best-quote (lending, RFQ) and cross (block trade) room programs: right winners, conserved cash, signed only as computed

**Hypothesis.** The best-quote program picks the lowest eligible quote (ties to the fixed order) and prices it first- or second-price; an ineligible quote never wins. The cross program crosses eligible buyers and sellers at the reference price: matched units are the smaller side's total, no fill exceeds its order, the more aggressive limit fills first, and buyers' cash equals sellers' cash. The same inputs give the same outcome whatever the arrival order in two-host mode. The Roost signs only the outcome it computed, once, with its charges. Fails if any of these breaks.

**What this does not prove**
- Offline, on local hosts with a simulated attestation provider. Only the cash leg is modelled: no repayment, collateral or asset delivery. The reference price is an input, not verified.

| Step | Result | Assertions | Time |
|---|---|---|---|
| best quote: worked examples and 3,000 random rounds | ✓ pass | 6/6 | 24 ms |
| cross (pro-rata): worked examples and 3,000 random rounds | ✓ pass | 10/10 | 76 ms |
| the Roost runs the programs and signs only what it computed | ✓ pass | 13/13 | 172 ms |
| two hosts: any arrival order gives the same signed message | ✓ pass | 2/2 | 46 ms |

### best quote: worked examples and 3,000 random rounds

- ✓ lowest rate wins and is paid its own rate (first-price)
- ✓ second-price pays the runner-up's rate
- ✓ a lone eligible quote is paid its own under second-price
- ✓ a quote above the limit never wins
- ✓ a tie goes to the earlier order
- ✓ no invariant broke in 3,000 random rounds (winner is the lowest eligible, price within bounds, value independent of order)

### cross (pro-rata): worked examples and 3,000 random rounds

- ✓ 150 buy units meet 170 sell units: 150 match at the reference
- ✓ the short side (buyers) fills in full: b1 100, b2 50
- ✓ the long side (sellers) fills pro-rata with largest remainder: s1 gets 71 (70.59), s2 gets 79 (79.41)
- ✓ a buyer below the reference does not take part
- ✓ a seller above the reference does not take part
- ✓ a seller with an extreme limit (0.00001) is filled pro-rata like everyone else: F 29, s1 57, s2 64 (not F 40 first)
- ✓ and gets exactly what the same seller gets with a limit equal to the reference: the limit decides nothing but qualifying
- ✓ a public per-order cap clamps an inflated order: b1 asking for 100,000 is treated as 100
- ✓ when two long-side orders have equal remainders (7.5 each of 15), the extra unit goes to the earlier order: first 8, second 7
- ✓ no invariant broke in 3,000 random rounds (units and cash conserved, short side full, long side within one unit of pro-rata, caps respected, limits decide only who qualifies, deterministic)

### the Roost runs the programs and signs only what it computed

- ✓ lend: lender l2 wins at 400 bps and funds 5 NEAR to the borrower
- ✓ lend: the signed message has 7 fields
- ✓ lend, second-price: the winner is quoted the runner-up's rate (450)
- ✓ lend: no eligible quote means no trade and nothing to sign
- ✓ lend: the borrower cannot win by quoting against themselves
- ✓ buy RFQ: dealer d2 wins at 1.20 and is paid 12 NEAR by the taker
- ✓ cross: 150 units match pro-rata; sellers s1 and s2 are paid 71 and 79; buyers b1 and b2 pay 100 and 50
- ✓ a charge raised by one yocto is refused
- ✓ an allocation moved to another recipient is refused
- ✓ a cross outcome cannot be settled without its charges
- ✓ a second signature is refused
- ✓ cross with a cap of 100 units: b1's inflated 100,000 counts as 100, sell side clamps to 100, so 100 units match and the buyers split 67 and 33
- ✓ cross: a malformed order is left out and reported, not fatal

### two hosts: any arrival order gives the same signed message

- ✓ lend with all quotes tied: both hosts pick the same winner and sign the same order hash
- ✓ cross with equal limits and an uneven pro-rata split (10 + 10 buy against 15 sell): both hosts split the same way and sign the same order hash

## E-BALLOT-PROGRAM-01: Ballot room program: right winner, no tally in the outcome, outsiders and unsigned ballots refused, re-voting, order-independent

**Hypothesis.** The ballot program counts one signed ballot per roll member (the latest wins), applies a quorum and a majority or plurality rule, and decides only with a strict winner; a tie, a missed quorum or a missed majority decides nothing. The result does not depend on the order ballots arrive. The published outcome carries the winner and whether it was decided, never a tally or a turnout count. The host refuses to run a ballot unless inputs are signed, ignores ballots from outside the roll, spoils ballots for unknown options, and signs only a payment to the winning option's recipient with equal charges on the roll. Fails if any of these breaks.

**What this does not prove**
- Offline, on local hosts with a simulated attestation provider and a stubbed account-key check. The weight of a vote is a deposit-funded share, not a person: the contract cannot tell one person from many accounts. Re-voting reduces but does not remove vote-buying. The roll is supplied by the coordinator; the contract only caps charges to real depositors.

| Step | Result | Assertions | Time |
|---|---|---|---|
| the counting rule: worked examples and 3,000 random rounds | ✓ pass | 14/14 | 147 ms |
| the host: signed ballots only, outsiders ignored, re-voting, payment to the winner, nothing else signed | ✓ pass | 13/13 | 145 ms |

### the counting rule: worked examples and 3,000 random rounds

- ✓ A wins 3 of 4 non-abstaining ballots with full turnout
- ✓ a tie decides nothing
- ✓ under plurality a three-way split with two tied leaders is a tie
- ✓ under plurality A wins with 2 of 4
- ✓ the same ballots under majority decide nothing: 2 of 4 is not more than half
- ✓ 2 of 5 ballots miss a 60% quorum
- ✓ a ballot for an unknown option is spoiled and does not count toward quorum
- ✓ an outsider's ballot is ignored and reported, not counted
- ✓ two ballots from one roll member count once (the host gives it one; the program also refuses a second)
- ✓ a quorum exactly on the boundary is met (3 of 5 at 60%) and one fewer is not
- ✓ a later ballot from the same member replaces the earlier one: m1's A then B gives B 2 to 0
- ✓ "later" means a higher order, not the later position in the list
- ✓ when abstentions outnumber the votes the single vote still decides by the stated rule (majority of non-abstaining ballots)
- ✓ no invariant broke in 3,000 random rounds (order-independent, strict leader, majority and quorum respected, no tally in the outcome)

### the host: signed ballots only, outsiders ignored, re-voting, payment to the winner, nothing else signed

- ✓ a host that does not require signed inputs refuses to count a ballot
- ✓ A wins: the outcome names A and its recipient
- ✓ the published outcome carries no tally, no turnout and no ballot
- ✓ the payment is the pool (5 x 0.02 = 0.1 NEAR) to ra.near, charged 0.02 to every roll member, voters or not
- ✓ the signed message has 7 fields
- ✓ re-voting: m3 and m4 change their ballots to A and A wins 4 to 1
- ✓ an outsider's signed ballot is ignored and reported by account only
- ✓ and the pool goes to the winning option's recipient, rb.near, not the first option's
- ✓ an undecided ballot (tie) pays nothing and leaves nothing to sign
- ✓ paying the pool to the losing option is refused
- ✓ charging one voter the whole pool is refused
- ✓ a ballot outcome cannot be settled without its charges
- ✓ two hosts that received the same ballots in opposite orders sign the same message

## E-PAYRUN-PROGRAM-01: Pay-run room program: balanced lines, one-time payees, signed encrypted receipts under a Merkle root, auditor totals only

**Hypothesis.** The pay-run program pays each person their net (gross minus tax minus benefits) and the tax and benefits providers their totals, and charges the employer the gross total. The host builds a signed receipt per line under a Merkle root; a person decrypts only their own, the signature and proof verify, and the order hash recomputes from the root; a changed amount, a wrong proof or a wrong root fails; the auditor statement carries totals only. More than 8 recipients, an unbalanced line, or a pay run not sealed by the employer is refused. Two hosts produce the same root and order hash. The host signs only the allocations and charge it computed. Fails if any of these breaks.

**What this does not prove**
- Offline, on local hosts with a simulated attestation provider and a stubbed account-key check. The amounts of every payment are public on NEAR once settled; receipts hide nothing on chain. A dishonest host could issue a wrong receipt; two hosts reduce that and this run uses one. Receipt privacy depends on each person keeping their key.

| Step | Result | Assertions | Time |
|---|---|---|---|
| the receipts library: Merkle root, proofs, canonical form | ✓ pass | 8/8 | 12 ms |
| the arithmetic: nets, totals, and what is refused | ✓ pass | 13/13 | 2 ms |
| the host: statements, verification, tampering, and what it signs | ✓ pass | 23/23 | 131 ms |

### the receipts library: Merkle root, proofs, canonical form

- ✓ for 1 to 12 leaves every proof verifies its own leaf and no other, a tampered leaf fails, and a different root fails
- ✓ a leaf hash is sha256(0x00 || canonical JSON)
- ✓ three leaves make node(node(l0,l1), l2)
- ✓ five leaves make node(node(node(l0,l1),node(l2,l3)), l4)
- ✓ the proof for leaf 4 of 5 is a single left sibling, the root of the first four
- ✓ the canonical form does not depend on key order
- ✓ a single-leaf tree has the leaf as its proof-less root
- ✓ the order hash is a function of the run id and root only

### the arithmetic: nets, totals, and what is refused

- ✓ four people are paid their net (80% of gross): 0.04, 0.032, 0.024, 0.016
- ✓ the tax authority gets the 15% total, 0.021, and the benefits provider the 5% total, 0.007
- ✓ the allocations sum to the gross total, 0.14, which the employer is charged
- ✓ there are six receipts, one per person and one each for tax and benefits
- ✓ the totals are net 0.112, tax 0.021, benefits 0.007, headcount 4
- ✓ a line whose tax and benefits exceed the gross is refused
- ✓ a line whose net is exactly zero is refused (gross 0.05, tax 0.04, benefits 0.01)
- ✓ a zero gross is refused
- ✓ two people on one address are refused
- ✓ a person paid to the tax authority's address is refused
- ✓ seven people plus tax and benefits is nine recipients: refused (at most 8)
- ✓ an amount with more than 6 decimal places is refused
- ✓ with no deductions the tax and benefits transfers are omitted (4 allocations, 4 receipts)

### the host: statements, verification, tampering, and what it signs

- ✓ a host that does not require signed inputs refuses to run a pay run
- ✓ the public outcome names the run, the root, the headcount and the gross total, and no names or per-person amounts
- ✓ the order hash is the one recomputed from the run id and the root
- ✓ the employer is charged the gross total, 0.14, once
- ✓ the settlement message has 7 fields
- ✓ all four people verify their own receipt: decrypts, host signature, Merkle proof, and the order hash
- ✓ a1's receipt carries their own breakdown: gross 0.05, tax 0.0075, benefits 0.0025, net 0.04
- ✓ a person cannot open someone else's statement
- ✓ a statement checked against another run's order hash fails
- ✓ a statement checked against the wrong host key fails
- ✓ a receipt with the net changed to 0.05 fails (signature and proof)
- ✓ a receipt moved to another payee address fails
- ✓ a receipt with a proof from another line fails
- ✓ a receipt with a forged root fails
- ✓ the auditor sees totals and the root only: no name, address, invoice or individual amount
- ✓ the auditor's totals are net 0.112, tax 0.021, benefits 0.007, gross 0.14
- ✓ the employer sees every line, with names
- ✓ paying the first person's net to another address is refused
- ✓ charging the employer twice the gross is refused
- ✓ a pay run sealed by someone other than the employer is refused
- ✓ an unbalanced line is refused
- ✓ the same pay run listed in a different order gives the same root (lines are put in a canonical order by payee address)
- ✓ two hosts given the lines in opposite orders produce the same root, order hash and allocations (as sets)

## E-RFQ-PROGRAM-01: Two-sided RFQ room program: makers quote both ways, the taker's side stays sealed, the right maker wins in both directions

**Hypothesis.** The best-quote program picks the highest eligible quote in the highest direction as correctly as the lowest in the lowest. The RFQ host takes one sealed request from the taker (side, units, limit, a secret salt) and a sealed two-way quote (bid and ask) from each maker. A buy goes to the lowest ask at or under the limit, a sell to the highest bid at or over it; first-price or second-price. The payer is the taker on a buy and the winning maker on a sell; the payee is the other; the charge is bounded by what the payer committed. A crossed quote, a quote from outside the maker list or from the taker is not counted. The order hash does not let an observer recover units or price (it carries the taker's secret salt). Two hosts agree. The host signs only what it computed. Fails if any of these breaks.

**What this does not prove**
- Offline, on local hosts with a simulated attestation provider and a stubbed account-key check. Only the cash leg settles: nothing delivers the asset. Settlement reveals the side (who pays whom) and the notional; it does not reveal units or the price per unit. The maker list is supplied by the coordinator and must match the contract's allowed recipients.

| Step | Result | Assertions | Time |
|---|---|---|---|
| the highest direction, which the sell side depends on: worked examples and 3,000 random rounds | ✓ pass | 6/6 | 21 ms |
| the host: both sides, both pricings, who pays whom, and what is refused | ✓ pass | 21/21 | 366 ms |

### the highest direction, which the sell side depends on: worked examples and 3,000 random rounds

- ✓ the highest bid at or over the limit wins and is paid its own bid (first-price)
- ✓ second-price pays the runner-up's bid
- ✓ a bid under the limit never wins
- ✓ a bid exactly at the limit is eligible
- ✓ a tie goes to the earlier order
- ✓ no invariant broke in 3,000 random rounds (winner is the highest eligible, price within [limit, winner quote], value independent of order)

### the host: both sides, both pricings, who pays whom, and what is refused

- ✓ a host that does not require signed inputs refuses to run an RFQ
- ✓ buy: m2 wins at its ask of 0.002; the taker pays m2 10 x 0.002 = 0.02 NEAR
- ✓ the terms (side, units, price) are in the host's private reply, not in the public outcome
- ✓ the signed message has 7 fields
- ✓ sell: m3 wins at its bid of 0.00197; m3 pays the taker 10 x 0.00197 = 0.0197 NEAR
- ✓ buy, second-price: m2 wins and pays the runner-up's ask, 0.00205 (m1), so 0.0205 NEAR
- ✓ sell, second-price: m3 wins and is charged the runner-up's bid, 0.00195 (m1), so 0.0195 NEAR
- ✓ buy with a limit under every ask: no trade and nothing to sign
- ✓ sell with a limit over every bid: no trade
- ✓ a buy limit exactly at the best ask still trades
- ✓ a quote from outside the maker list is ignored and reported by account, even if it would win
- ✓ the taker's own request is never counted as a quote
- ✓ a crossed quote (bid above ask) is not counted, even though its ask would win
- ✓ without the taker's request there is nothing to run
- ✓ a request without a secret salt is refused (the order hash would be guessable)
- ✓ an observer who tries every (units, price) pair cannot reproduce the on-chain order hash: it carries the taker's secret salt
- ✓ paying the winner's money to another maker is refused
- ✓ charging the taker double is refused
- ✓ an RFQ outcome cannot be settled without its charges
- ✓ two hosts that received the buy RFQ in opposite orders sign the same order hash, allocations and charges
- ✓ two hosts that received the sell RFQ in opposite orders sign the same order hash, allocations and charges

## E-DEPOSIT-CONSENT-01: A deposit consents to terms the depositor states; the client never copies the hash from the contract

**Hypothesis.** The chain client submits a deposit only with a hash computed from terms the caller stated, refuses when the group differs, and never echoes the contract's own stored hash. The failure that must not happen: a deposit that consents to a 10-block timer because the client asked the contract for its hash.

**What this does not prove**
- Offline against a stubbed chain: it checks what the client would submit, not that the contract refuses it (the contract side is in the Rust tests and the testnet check). The MCP tool, API and SDK are exercised through the same client method.
- Run by one operator on 2026-11-07.

| Step | Result | Assertions | Time |
|---|---|---|---|
| no hash and no terms: refused, nothing submitted | ✓ pass | 3/3 | 42 ms |
| stated terms equal to the group's: submits the hash the client computed | ✓ pass | 5/5 | 2 ms |
| terms that differ from the group's: refused, naming what differs | ✓ pass | 8/8 | 4 ms |
| a group opened before GAP-025: the old-formula hash of the stated terms | ✓ pass | 1/1 | 1 ms |
| a contract whose stored hash is wrong: the computed hash would not match it | ✓ pass | 1/1 | 0 ms |
| a hash the caller computed itself is passed through unchanged | ✓ pass | 1/1 | 1 ms |
| computePolicyHash needs the timer | ✓ pass | 1/1 | 1 ms |

### no hash and no terms: refused, nothing submitted

- ✓ deposit() throws
- ✓ the message tells the caller to state the terms and says it will not copy the contract's hash
- ✓ nothing was submitted

### stated terms equal to the group's: submits the hash the client computed

- ✓ one transaction was submitted
- ✓ its hash is the version-2 hash of the stated terms
- ✓ it is not the hash the contract stored
- ✓ it equals a hash spelled out independently, so the timer really is in the string
- ✓ and the version-2 hash differs from the old formula, so the timer is in it

### terms that differ from the group's: refused, naming what differs

- ✓ a different timer is refused and named
- ✓ nothing is submitted for a different timer
- ✓ a different cap is refused and named
- ✓ nothing is submitted for a different cap
- ✓ a different deadline is refused and named
- ✓ nothing is submitted for a different deadline
- ✓ a different recipient is refused and named
- ✓ nothing is submitted for a different recipient

### a group opened before GAP-025: the old-formula hash of the stated terms

- ✓ it submits the version-1 hash

### a contract whose stored hash is wrong: the computed hash would not match it

- ✓ the client submitted its own hash, which differs from the stored one, so the contract would refuse

### a hash the caller computed itself is passed through unchanged

- ✓ submitted as given

### computePolicyHash needs the timer

- ✓ calling it without a timer throws

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
