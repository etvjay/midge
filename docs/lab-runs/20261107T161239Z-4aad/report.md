# Lab run 20261107T161239Z-4aad

- **Code:** `6be86ad88ffac9541c047f78295237cb84dcc286` on `master` (**6 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `8a0180ff698c44b5…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 707 events, hash-chained; root `f11ef913bd786139b1a0d433e6a7c8b13aa415dac137519624a516bdc02fd12b`. Verify with `node lab/verify-run.js lab/runs/20261107T161239Z-4aad`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-ROOMSERVICE-01 runRoom slice 1: one door for the vote room: describe, open, submit, run; typed errors; retry-safe; same answers as the old path | offline | **PASS** | 8 | 56 | 3 attempts: PASS, PASS, PASS |
| E-ROOMSERVICE-02 runRoom slice 2: all seven room kinds behind the same four verbs; same answers as the old path; wrong parameters never become internal errors | offline | **PASS** | 21 | 117 | 3 attempts: PASS, PASS, PASS |

## E-ROOMSERVICE-01: runRoom slice 1: one door for the vote room: describe, open, submit, run; typed errors; retry-safe; same answers as the old path

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, written before any code. RoomService gives the same outcome, order hash, allocations and charges as the old runBallot + signSettlement path, returns the finished contract call, refuses bad calls with a typed code and leaves the queue unharmed, and is safe to retry. The failure that must not happen: a settlement signed for something the host did not compute, or a refused call that eats the round's inputs.

**What this does not prove**
- Offline, on local hosts with a simulated attestation provider and a stubbed account-key check.
- Only the vote room kind is registered; the other six programs and the four adapters (MCP, REST, SSE, SDK) are later slices.
- One operator plays every member.

| Step | Result | Assertions | Time |
|---|---|---|---|
| describe: one program, the host's keys | ✓ pass | 3/3 | 2 ms |
| a five-member vote returns the finished contract call, and the signature verifies | ✓ pass | 9/9 | 62 ms |
| parity: the same answers as the old path on a twin host | ✓ pass | 3/3 | 81 ms |
| a tie decides nothing: no settlement, nothing signed | ✓ pass | 3/3 | 37 ms |
| typed errors, and a refused call leaves the inputs alone | ✓ pass | 25/25 | 41 ms |
| retry-safe: an identical run returns the same result; a different one is refused | ✓ pass | 4/4 | 45 ms |
| defaults, unexpected errors, and a cached result never goes stale | ✓ pass | 6/6 | 128 ms |
| the registry is real: a second program runs through the same verbs | ✓ pass | 3/3 | 6 ms |

### describe: one program, the host's keys

- ✓ ballot is listed first (slice 1 had it alone; slice 2 adds six more, checked in E-ROOMSERVICE-02)
- ✓ it lists its parameters
- ✓ it reports the host's settlement and sealing keys

### a five-member vote returns the finished contract call, and the signature verifies

- ✓ A wins
- ✓ the call is settle_batch_charged
- ✓ with exactly the six arguments the contract takes
- ✓ the nonce and syndicate are the round's
- ✓ the pool is paid to A's recipient: 5 shares of 0.01 NEAR
- ✓ each of the five is charged one share
- ✓ the signature verifies against the host's key over the message rebuilt from the arguments
- ✓ the result contains none of the submitted ciphertexts
- ✓ and its outcome has no tally, counts or turnout

### parity: the same answers as the old path on a twin host

- ✓ same order hash
- ✓ same allocations and charges
- ✓ same outcome

### a tie decides nothing: no settlement, nothing signed

- ✓ undecided
- ✓ the settlement is null and there is no order hash
- ✓ the host signed nothing for this round

### typed errors, and a refused call leaves the inputs alone

- ✓ run before a round is open is ROUND_NOT_OPEN
- ✓ submit before a round is open is ROUND_NOT_OPEN
- ✓ run with no inputs is NO_INPUTS
- ✓ an unknown program is UNKNOWN_PROGRAM
- ✓ a forged signature is NOT_AUTHORISED
- ✓ an account's signature from another account's key is NOT_AUTHORISED
- ✓ an input with no signature at all is NOT_AUTHORISED
- ✓ none of those reached the queue
- ✓ a one-option ballot is INVALID_PARAMS
- ✓ a missing parameter is INVALID_PARAMS
- ✓ a rule that does not exist is INVALID_PARAMS
- ✓ a quorum above 10000 basis points is INVALID_PARAMS
- ✓ a negative quorum is INVALID_PARAMS
- ✓ a fractional quorum is INVALID_PARAMS
- ✓ nine options is INVALID_PARAMS
- ✓ a roll of 51 is INVALID_PARAMS
- ✓ an empty roll is INVALID_PARAMS
- ✓ options given as a string is INVALID_PARAMS, not an internal error
- ✓ options given as null is INVALID_PARAMS
- ✓ a roll given as a string is INVALID_PARAMS
- ✓ a share given as an object is INVALID_PARAMS
- ✓ an empty share is INVALID_PARAMS
- ✓ a run for another round is ROUND_NOT_OPEN
- ✓ the three inputs are still queued after those refused runs
- ✓ and the same inputs then run correctly: 3 ballots of 5 meet the 50% quorum and A wins

### retry-safe: an identical run returns the same result; a different one is refused

- ✓ the identical run returns the identical result, signature included (one signature was made)
- ✓ a different run after a decided vote is ALREADY_SIGNED
- ✓ so is a new input
- ✓ opening a new round clears it: running the old round again is ROUND_NOT_OPEN

### defaults, unexpected errors, and a cached result never goes stale

- ✓ quorumBps and rule default to 5000 and majority
- ✓ an unexpected error becomes INTERNAL
- ✓ and its text is not echoed
- ✓ first, a tie
- ✓ after three fresh ballots the identical call decides, it does not replay the tie
- ✓ the new round's settlement carries the new nonce, not the old result

### the registry is real: a second program runs through the same verbs

- ✓ it is listed after the built-in programs
- ✓ it runs and, deciding nothing, returns a null settlement
- ✓ its bad parameters are INVALID_PARAMS

## E-ROOMSERVICE-02: runRoom slice 2: all seven room kinds behind the same four verbs; same answers as the old path; wrong parameters never become internal errors

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, written before any code. Each of pool, auction, quote, cross, RFQ and pay run, run through RoomService, gives the same outcome, order hash, allocations and charges as the old path and a contract call whose signature verifies; deciding nothing signs nothing; wrong parameters are INVALID_PARAMS and leave the queue alone; a pay run's receipts leave only as sealed statements and an RFQ's plain terms only on request. The failure that must not happen: a settlement signed for something the host did not compute, a wrong-parameter call that becomes an internal error or eats the inputs, or private detail in a default result.

**What this does not prove**
- Offline, on local hosts with a simulated attestation provider and a stubbed account-key check.
- The adapters (MCP, REST, SSE, SDK), a hardware host and a testnet settlement through RoomService are later slices or other experiments.
- The existing host route for an RFQ already returns plain terms to its caller; this slice does not change that route.
- One operator plays every member.

| Step | Result | Assertions | Time |
|---|---|---|---|
| describe lists seven programs | ✓ pass | 3/3 | 2 ms |
| pool: parity with the old path, and a contract call whose signature verifies | ✓ pass | 8/8 | 60 ms |
| pool: deciding nothing signs nothing | ✓ pass | 2/2 | 37 ms |
| pool: wrong parameters are INVALID_PARAMS, never an internal error, and the inputs stay | ✓ pass | 8/8 | 23 ms |
| auction: parity with the old path, and a contract call whose signature verifies | ✓ pass | 8/8 | 49 ms |
| auction: deciding nothing signs nothing | ✓ pass | 2/2 | 36 ms |
| auction: wrong parameters are INVALID_PARAMS, never an internal error, and the inputs stay | ✓ pass | 8/8 | 23 ms |
| quote: parity with the old path, and a contract call whose signature verifies | ✓ pass | 8/8 | 39 ms |
| quote: deciding nothing signs nothing | ✓ pass | 2/2 | 18 ms |
| quote: wrong parameters are INVALID_PARAMS, never an internal error, and the inputs stay | ✓ pass | 9/9 | 18 ms |
| cross: parity with the old path, and a contract call whose signature verifies | ✓ pass | 8/8 | 67 ms |
| cross: deciding nothing signs nothing | ✓ pass | 2/2 | 32 ms |
| cross: wrong parameters are INVALID_PARAMS, never an internal error, and the inputs stay | ✓ pass | 7/7 | 26 ms |
| rfq: parity with the old path, and a contract call whose signature verifies | ✓ pass | 8/8 | 70 ms |
| rfq: deciding nothing signs nothing | ✓ pass | 2/2 | 37 ms |
| rfq: wrong parameters are INVALID_PARAMS, never an internal error, and the inputs stay | ✓ pass | 8/8 | 30 ms |
| payrun: parity with the old path, and a contract call whose signature verifies | ✓ pass | 8/8 | 80 ms |
| payrun: wrong parameters are INVALID_PARAMS, never an internal error, and the inputs stay | ✓ pass | 7/7 | 37 ms |
| a pay run's receipts leave only as sealed statements | ✓ pass | 3/3 | 41 ms |
| an RFQ's plain terms are left out unless asked for, and the retry is stable | ✓ pass | 4/4 | 32 ms |
| programs that need signed inputs refuse an unsigned host | ✓ pass | 2/2 | 8 ms |

### describe lists seven programs

- ✓ ballot, pool, auction, quote, cross, rfq, payrun, in that order
- ✓ each lists its parameters and whether it needs signed inputs
- ✓ RFQ, pay run and vote need signed inputs; pool, auction, quote and cross do not

### pool: parity with the old path, and a contract call whose signature verifies

- ✓ it decided and returned a settlement
- ✓ same order hash
- ✓ same allocations
- ✓ same charges
- ✓ same public outcome
- ✓ the method is settle_batch_charged
- ✓ the signature verifies against the host's key over the message rebuilt from the arguments
- ✓ the nonce and syndicate are the round's

### pool: deciding nothing signs nothing

- ✓ no settlement and no order hash
- ✓ the host signed nothing

### pool: wrong parameters are INVALID_PARAMS, never an internal error, and the inputs stay

- ✓ {} -> INVALID_PARAMS
- ✓ {"recipient":5} -> INVALID_PARAMS
- ✓ {"recipient":"a:b"} -> INVALID_PARAMS
- ✓ {"recipient":"r.near","min":"x"} -> INVALID_PARAMS
- ✓ {"recipient":"r.near","cap":{}} -> INVALID_PARAMS
- ✓ {"recipient":"r.near","min":null} -> INVALID_PARAMS
- ✓ every input is still queued after those refusals
- ✓ and the right parameters then run

### auction: parity with the old path, and a contract call whose signature verifies

- ✓ it decided and returned a settlement
- ✓ same order hash
- ✓ same allocations
- ✓ same charges
- ✓ same public outcome
- ✓ the method is settle_batch_charged
- ✓ the signature verifies against the host's key over the message rebuilt from the arguments
- ✓ the nonce and syndicate are the round's

### auction: deciding nothing signs nothing

- ✓ no settlement and no order hash
- ✓ the host signed nothing

### auction: wrong parameters are INVALID_PARAMS, never an internal error, and the inputs stay

- ✓ {} -> INVALID_PARAMS
- ✓ {"format":"dutch","seller":"s.near"} -> INVALID_PARAMS
- ✓ {"format":"first-price","seller":7} -> INVALID_PARAMS
- ✓ {"format":"first-price","seller":"s.near","lotUnits":0} -> INVALID_PARAMS
- ✓ {"format":"first-price","seller":"s.near","lotUnits":"3"} -> INVALID_PARAMS
- ✓ {"format":"first-price","seller":"s.near","reserve":"abc"} -> INVALID_PARAMS
- ✓ every input is still queued after those refusals
- ✓ and the right parameters then run

### quote: parity with the old path, and a contract call whose signature verifies

- ✓ it decided and returned a settlement
- ✓ same order hash
- ✓ same allocations
- ✓ same charges
- ✓ same public outcome
- ✓ the method is settle_batch_charged
- ✓ the signature verifies against the host's key over the message rebuilt from the arguments
- ✓ the nonce and syndicate are the round's

### quote: deciding nothing signs nothing

- ✓ no settlement and no order hash
- ✓ the host signed nothing

### quote: wrong parameters are INVALID_PARAMS, never an internal error, and the inputs stay

- ✓ {} -> INVALID_PARAMS
- ✓ {"shape":"swap","counterparty":"b"} -> INVALID_PARAMS
- ✓ {"shape":"lend"} -> INVALID_PARAMS
- ✓ {"shape":"lend","counterparty":"b","amount":"5","limit":"x"} -> INVALID_PARAMS
- ✓ {"shape":"buy","counterparty":"b","units":0,"limit":"1"} -> INVALID_PARAMS
- ✓ {"shape":"lend","counterparty":"b","amount":"0","limit":700} -> INVALID_PARAMS
- ✓ {"shape":"lend","counterparty":"b","amount":"5","limit":700,"pricing":"third"} -> INVALID_PARAMS
- ✓ every input is still queued after those refusals
- ✓ and the right parameters then run

### cross: parity with the old path, and a contract call whose signature verifies

- ✓ it decided and returned a settlement
- ✓ same order hash
- ✓ same allocations
- ✓ same charges
- ✓ same public outcome
- ✓ the method is settle_batch_charged
- ✓ the signature verifies against the host's key over the message rebuilt from the arguments
- ✓ the nonce and syndicate are the round's

### cross: deciding nothing signs nothing

- ✓ no settlement and no order hash
- ✓ the host signed nothing

### cross: wrong parameters are INVALID_PARAMS, never an internal error, and the inputs stay

- ✓ {} -> INVALID_PARAMS
- ✓ {"referencePrice":"0"} -> INVALID_PARAMS
- ✓ {"referencePrice":"abc"} -> INVALID_PARAMS
- ✓ {"referencePrice":"1","maxUnits":0} -> INVALID_PARAMS
- ✓ {"referencePrice":"1","maxUnits":"5"} -> INVALID_PARAMS
- ✓ every input is still queued after those refusals
- ✓ and the right parameters then run

### rfq: parity with the old path, and a contract call whose signature verifies

- ✓ it decided and returned a settlement
- ✓ same order hash
- ✓ same allocations
- ✓ same charges
- ✓ same public outcome
- ✓ the method is settle_batch_charged
- ✓ the signature verifies against the host's key over the message rebuilt from the arguments
- ✓ the nonce and syndicate are the round's

### rfq: deciding nothing signs nothing

- ✓ no settlement and no order hash
- ✓ the host signed nothing

### rfq: wrong parameters are INVALID_PARAMS, never an internal error, and the inputs stay

- ✓ {} -> INVALID_PARAMS
- ✓ {"taker":5} -> INVALID_PARAMS
- ✓ {"taker":"taker.near","makers":"m1.near"} -> INVALID_PARAMS
- ✓ {"taker":"taker.near","makers":[]} -> INVALID_PARAMS
- ✓ {"taker":"taker.near","makers":["taker.near"]} -> INVALID_PARAMS
- ✓ {"taker":"taker.near","makers":["m1.near"],"pricing":"third"} -> INVALID_PARAMS
- ✓ every input is still queued after those refusals
- ✓ and the right parameters then run

### payrun: parity with the old path, and a contract call whose signature verifies

- ✓ it decided and returned a settlement
- ✓ same order hash
- ✓ same allocations
- ✓ same charges
- ✓ same public outcome
- ✓ the method is settle_batch_charged
- ✓ the signature verifies against the host's key over the message rebuilt from the arguments
- ✓ the nonce and syndicate are the round's

### payrun: wrong parameters are INVALID_PARAMS, never an internal error, and the inputs stay

- ✓ {} -> INVALID_PARAMS
- ✓ {"employer":5} -> INVALID_PARAMS
- ✓ {"employer":"er.near","employerKeyHex":"zz","auditorKeyHex":"zz"} -> INVALID_PARAMS
- ✓ {"employer":"er.near","taxAddress":"tax.near","benefitsAddress":"ben.near","employerKeyHex -> INVALID_PARAMS
- ✓ {"employer":"er.near","taxAddress":7,"benefitsAddress":"ben.near","employerKeyHex":"bba4fc -> INVALID_PARAMS
- ✓ every input is still queued after those refusals
- ✓ and the right parameters then run

### a pay run's receipts leave only as sealed statements

- ✓ the outcome and settlement name no person, invoice or tax amount
- ✓ statements are returned: one per payee, one employer, one auditor
- ✓ each statement is ciphertext, with no name in it

### an RFQ's plain terms are left out unless asked for, and the retry is stable

- ✓ by default there is no confidential section and no units or price anywhere
- ✓ asked for, the same call returns the terms: a buy of 10 units
- ✓ with the identical settlement (one signature)
- ✓ and without the flag the terms are gone again

### programs that need signed inputs refuse an unsigned host

- ✓ rfq: a submit without a signature is NOT_AUTHORISED
- ✓ payrun: a submit without a signature is NOT_AUTHORISED

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
