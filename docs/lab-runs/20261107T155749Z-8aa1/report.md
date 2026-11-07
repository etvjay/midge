# Lab run 20261107T155749Z-8aa1

- **Code:** `dea79c279a9649e8bbaea6b08aec29080b0f0271` on `master` (**4 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `8a0180ff698c44b5…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 224 events, hash-chained; root `533994c438c4f63211b47a14aaa588074e7290aef994587d95be94666c9bd150`. Verify with `node lab/verify-run.js lab/runs/20261107T155749Z-8aa1`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-ROOMSERVICE-01 runRoom slice 1: one door for the vote room: describe, open, submit, run; typed errors; retry-safe; same answers as the old path | offline | **PASS** | 8 | 56 | 3 attempts: PASS, PASS, PASS |

## E-ROOMSERVICE-01: runRoom slice 1: one door for the vote room: describe, open, submit, run; typed errors; retry-safe; same answers as the old path

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, written before any code. RoomService gives the same outcome, order hash, allocations and charges as the old runBallot + signSettlement path, returns the finished contract call, refuses bad calls with a typed code and leaves the queue unharmed, and is safe to retry. The failure that must not happen: a settlement signed for something the host did not compute, or a refused call that eats the round's inputs.

**What this does not prove**
- Offline, on local hosts with a simulated attestation provider and a stubbed account-key check.
- Only the vote room kind is registered; the other six programs and the four adapters (MCP, REST, SSE, SDK) are later slices.
- One operator plays every member.

| Step | Result | Assertions | Time |
|---|---|---|---|
| describe: one program, the host's keys | ✓ pass | 3/3 | 3 ms |
| a five-member vote returns the finished contract call, and the signature verifies | ✓ pass | 9/9 | 64 ms |
| parity: the same answers as the old path on a twin host | ✓ pass | 3/3 | 75 ms |
| a tie decides nothing: no settlement, nothing signed | ✓ pass | 3/3 | 39 ms |
| typed errors, and a refused call leaves the inputs alone | ✓ pass | 25/25 | 47 ms |
| retry-safe: an identical run returns the same result; a different one is refused | ✓ pass | 4/4 | 40 ms |
| defaults, unexpected errors, and a cached result never goes stale | ✓ pass | 6/6 | 148 ms |
| the registry is real: a second program runs through the same verbs | ✓ pass | 3/3 | 6 ms |

### describe: one program, the host's keys

- ✓ exactly one program, ballot
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

- ✓ it is listed beside ballot
- ✓ it runs and, deciding nothing, returns a null settlement
- ✓ its bad parameters are INVALID_PARAMS

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
