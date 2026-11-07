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
