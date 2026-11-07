# `runRoom` slice 1: results

*Experiment `E-ROOMSERVICE-01` (offline), run 2026-11-07. Predictions: `PROGRAMME_PLAN.md` ("`runRoom` slice 1"), committed before any code. Kept run: `docs/lab-runs/20261107T155749Z-8aa1` (PASS, three repeats, no flakiness). Design: `docs/RUNROOM_DESIGN.md`.*

**In plain words.** The vote room now has one small door. A caller opens a round, members submit sealed inputs, and one call runs the room and returns the finished contract call, instead of five hand-copied steps.

## What was built
`src/roost-service/room-service.js`: `RoomService` with four verbs (`describe`, `open`, `submit`, `run`), a registry of room kinds (one so far: the vote), and seven typed error codes. It adds no clearing logic; it calls the host's own `runBallot` and `signSettlement`, so the host still signs only what it computed.

## Against the predictions
All nine held: one program described with the host's keys; a five-member vote returns `settle_batch_charged` with the six contract arguments and a signature that verifies against the host's key over a message rebuilt independently; **the same order hash, allocations, charges and outcome as the old path on a twin host**; a tie returns no settlement and signs nothing; every bad call returns its typed code and leaves the inputs queued; an identical retry returns the identical result with one signature, and anything different is refused until a new round opens; the result carries no ciphertext and no tally; a second program runs through the same verbs.

## Corrections and what testing found
- **Design correction (before coding):** signed inputs are bound to the open round, so the service needs an `open` verb and must remember its last result for retry-safety.
- **My wrong assumption (this run):** I asserted a numeric share was invalid; the host accepts numbers. That "bad" call ran, signed, and every later call correctly returned `ALREADY_SIGNED`. The assertion was removed.
- **Duplicated rules removed:** mutation testing showed five of the service's own value checks (option and roll counts, a non-empty share) could never change an outcome because the host rejects the same inputs. They were deleted so the host is the one source of truth. Tests for those boundaries remain and pass through the host.
- **A dead branch removed:** the service mapped a host error that `submit`'s earlier check already made unreachable.
- **Mutation testing:** 20 deliberate breaks, all caught after those fixes (one escaped the first time and led to the direct `submit`-before-`open` test).

## Not shown
The other six room kinds, the four adapters (MCP, REST, SSE, SDK), a hardware host, and the two-host second signature (returned as a later step). One operator played every member.

## Slice 2: the other six room kinds (`E-ROOMSERVICE-02`)

*Kept run `docs/lab-runs/20261107T161239Z-4aad` (PASS, three repeats, with `E-ROOMSERVICE-01`). Predictions: `PROGRAMME_PLAN.md`, committed before any code.*

Pool, auction, quote, cross, RFQ and pay run now sit behind the same four verbs. For each: the same order hash, allocations, charges and outcome as the old path on a twin host; a contract call (`settle_batch_charged`) whose signature verifies against the host's key; a variant that decides nothing returns no settlement and signs nothing; wrong parameters return `INVALID_PARAMS` and leave the inputs queued.

- **Confidential extras held.** A pay run's receipts leave only as sealed statements (one per payee, one for the employer, one for the auditor), and the outcome and settlement name no person, invoice or tax amount. An RFQ's plain terms (side, units, price) are left out of every default result and returned only with `includeConfidential: true`; an identical retry gives the same single signature either way.
- **Signed-input programs** (vote, RFQ, pay run) refuse an unsigned host with `NOT_AUTHORISED`; `describe()` says which need signing.
- **A real bug found by the table of wrong parameters:** an unknown `pricing` value on a quote or an RFQ made the host throw a raw error, which would have surfaced as an internal error. The host now rejects it with a proper message (two checks, each mutation-tested).
- **My wrong assumption, again:** I listed a numeric `referencePrice` as invalid; the host accepts numbers. It ran, consumed the queue and failed the next assertion. Removed.
- **Slice 1's "exactly one program" assertion was superseded** by the seven-program registry and rewritten; the rest of slice 1 is unchanged.
- **Mutation testing:** 13 deliberate breaks of the service plus the 2 host checks, all caught (one of my 14 was not a real mutation and matched no text).

**Weakness that remains (stated before the run):** the existing host route for an RFQ already returns plain terms to its caller. Slice 2 keeps `RoomService` from adding to that; it does not change that route.
