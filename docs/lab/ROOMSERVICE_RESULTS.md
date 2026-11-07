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

## Slices 3 to 6: four ways in and a practice room

*Experiments `E-ROOMSERVICE-03` to `-06`, offline, real HTTP on a local port. Kept run `docs/lab-runs/20261107T164154Z-6577` (all six experiments, three repeats each, PASS). Predictions: `PROGRAMME_PLAN.md`, committed before any code. OpenAPI file: `docs/openapi/rooms.json` (rebuilt by `npm run build:openapi`, with a drift test).*

In plain words: the one door now has four ways in (a web API, AI-agent tools, a live event stream, a code library) and a ready-made practice room. Each way in only translates; none contains room logic.

| Slice | What it is | Result |
|---|---|---|
| 3 | `/v1/rooms` web API, OpenAPI document, rate limit, `RoomsClient` SDK | A vote over HTTP gives the service's settlement; one error shape `{ error, code }` for every failure with no stack or secret; the coordinator key guards open and run; the OpenAPI document documents exactly the routes served |
| 4 | MCP: four tools over stdio and streamable HTTP, one dispatcher | No tool takes a secret key; the HTTP endpoint refuses coordinator tools without the key (401), refuses unlisted browser origins, shares one rate limit with the web API; the stdio binary reaches a remote rooms server |
| 5 | Live events (SSE) | `round_opened`, `input_accepted` (a count), `round_run` (program, decided, order hash) and nothing else; replay from a ring of 100; client cap, cleanup and a keepalive; slow readers dropped |
| 6 | `createDemoRoom` | Labelled simulation; all seven kinds run end to end with charges equal to payouts and signatures that verify; the same vote through the service, HTTP, the SDK and MCP gives the identical settlement; refuses any real contract |

### What testing found
- **A side-agent note was right and was fixed:** the rate limit identified callers by connecting address, so behind a proxy every user would share one allowance, while trusting `X-Forwarded-For` blindly would let anyone forge their way past it. `trustedProxies` now trusts the header only from our own proxy, reads it from the right, skips our proxies, never believes an unreadable hop, and ignores it entirely by default (`client-id.js`, 10 mutations caught).
- **The event stream's hardest cases were untested at first:** mutation testing showed heartbeat timers, empty and query forms of `Last-Event-ID`, and dropping a client that never reads were all unchecked. They are now tested (including a raw socket that never reads).
- **My own wrong assumptions, three times:** a public key is not a secret (my first "no secret" pattern flagged them); the ring legitimately held an event I had forgotten; unref'd timers are invisible to `getActiveResourcesInfo`.
- **Equivalent mutants, stated:** a few mutations change nothing observable (a blocked client's internal counter, the early declared-length check that gives the same 413 as the streamed one).
- **Mutation testing overall:** about 110 deliberate breaks across the new modules, all caught except the equivalent ones above.

### Not shown
A browser bundle (the practice room runs on Node), a hardware host, a testnet settlement through these doors, resumable MCP streams or server-initiated messages, load beyond the rate-limit and client-cap tests, and TLS or a real proxy in front (the proxy rule is tested with a local client only). The practice room's "hides" and "reveals" texts are written by hand; only some are checked mechanically. One operator played every member.

**Honest limits to keep in view:** per-member charges are public (the pool's payouts list each member's amount); a pay run is a private who with private receipts, not private amounts; the room still signs only what it computed, but it can still charge a member their whole deposit within the rules.
