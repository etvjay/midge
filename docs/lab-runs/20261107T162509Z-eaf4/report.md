# Lab run 20261107T162509Z-eaf4

- **Code:** `4110ac804126825d886c708e94310bf5db4eb086` on `master` (**9 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `8a0180ff698c44b5…`
- **Capabilities at start:** network=no, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 257 events, hash-chained; root `7d45e969f14d3c45af14f018792af6cecf096afc705476ed75d13d1c10f97296`. Verify with `node lab/verify-run.js lab/runs/20261107T162509Z-eaf4`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-ROOMSERVICE-03 runRoom slice 3: the web API for rooms: keys, one error shape, rate limits, an OpenAPI document that matches the router, and an SDK | offline | **PASS** | 7 | 69 | 3 attempts: PASS, PASS, PASS |

## E-ROOMSERVICE-03: runRoom slice 3: the web API for rooms: keys, one error shape, rate limits, an OpenAPI document that matches the router, and an SDK

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, written before any code. The HTTP adapter only translates: a vote over HTTP gives the same settlement as the service on a twin host; every failure has one status and the body { error, code }; the coordinator key guards open and run; the rate limit holds and recovers; the OpenAPI document documents exactly the routes served. The failure that must not happen: an unauthenticated open or run, an error that leaks a stack or a secret, or a documented route that is not served (or the reverse).

**What this does not prove**
- Offline: a real HTTP server on a local port, a simulated attestation provider, a stubbed account-key check.
- The rate limit uses an injected clock; real-time behaviour under load is not tested.
- The server speaks plain HTTP on localhost; TLS and a reverse proxy are deployment concerns.
- One operator plays every member.

| Step | Result | Assertions | Time |
|---|---|---|---|
| describe is open; open and run need the coordinator key | ✓ pass | 8/8 | 89 ms |
| a vote over HTTP gives the same settlement as the service on a twin host | ✓ pass | 10/10 | 151 ms |
| every failure has one status and the body { error, code } | ✓ pass | 16/16 | 154 ms |
| the rate limit holds, tells the client, and recovers | ✓ pass | 10/10 | 24 ms |
| an RFQ's plain terms need the flag and the coordinator key | ✓ pass | 3/3 | 69 ms |
| the OpenAPI document matches the router | ✓ pass | 13/13 | 8 ms |
| the SDK returns the same results and raises RoomError with the server's code | ✓ pass | 9/9 | 423 ms |

### describe is open; open and run need the coordinator key

- ✓ GET /v1/rooms is 200 with seven programs and no key
- ✓ responses are never cached
- ✓ opening a round without a key is 401 NOT_AUTHORISED
- ✓ with a wrong key it is 401 with the code
- ✓ running without a key is 401
- ✓ the right key in X-Roost-Admin-Key opens a round
- ✓ the right key as a Bearer token also works
- ✓ a key that is a prefix of the real one is refused

### a vote over HTTP gives the same settlement as the service on a twin host

- ✓ input m1.near accepted with no key
- ✓ input m2.near accepted with no key
- ✓ input m3.near accepted with no key
- ✓ input m4.near accepted with no key
- ✓ input m5.near accepted with no key
- ✓ the run is 200
- ✓ same order hash
- ✓ same allocations and charges
- ✓ the contract method and nonce are carried through
- ✓ an identical retry returns the identical body

### every failure has one status and the body { error, code }

- ✓ run before a round is open: 409 ROUND_NOT_OPEN
- ✓ run with no inputs: 409 NO_INPUTS
- ✓ unknown program: 404 UNKNOWN_PROGRAM
- ✓ bad parameters: 400 INVALID_PARAMS
- ✓ a forged input: 403 NOT_AUTHORISED
- ✓ an unexpected failure: 500 INTERNAL
- ✓ with no secret, path or stack in the body
- ✓ a different run after a decided vote: 409 ALREADY_SIGNED
- ✓ unknown route under /v1/rooms: 404 NOT_FOUND in the same shape
- ✓ wrong method: 405 METHOD_NOT_ALLOWED with an Allow header
- ✓ bad JSON: 400 INVALID_PARAMS
- ✓ a body over the limit: 413
- ✓ a streamed body over the limit with no declared length: 413
- ✓ a small streamed body is read normally: it reaches the service, which refuses it because this round is already settled (409)
- ✓ a body that is not an object: 400
- ✓ a failure inside the adapter itself is 500 INTERNAL with no secret, path or stack

### the rate limit holds, tells the client, and recovers

- ✓ three requests pass
- ✓ with the limit and a falling remaining count on each
- ✓ and a reset time
- ✓ the fourth is 429 RATE_LIMITED in the standard shape
- ✓ with Retry-After in seconds
- ✓ a blocked request does not consume more allowance (remaining stays 0)
- ✓ another client is unaffected
- ✓ just before the window ends, still blocked
- ✓ when the window ends the allowance returns
- ✓ rate-limit headers are on 404 and 401 responses too

### an RFQ's plain terms need the flag and the coordinator key

- ✓ by default: a settlement and no confidential section
- ✓ with the flag and the key: the terms
- ✓ the flag without the key is 401 and returns nothing

### the OpenAPI document matches the router

- ✓ it is served, open, as JSON
- ✓ it is OpenAPI 3.0 with an info block
- ✓ it documents exactly the routes the router serves
- ✓ every operation has a summary and at least one response with a description
- ✓ every $ref points at something that exists
- ✓ the error schema lists every code the server can return
- ✓ every program parameter appears in the document
- ✓ required parameters are marked required
- ✓ the coordinator key scheme is declared and used by exactly open and run
- ✓ the run request lists exactly the available programs
- ✓ the document names no secret
- ✓ the checked-in docs/openapi/rooms.json is the current document (run npm run build:openapi if this fails)
- ✓ buildOpenApi gives the same document as the server

### the SDK returns the same results and raises RoomError with the server's code

- ✓ describe returns seven programs
- ✓ run returns the settlement
- ✓ a different run is RoomError ALREADY_SIGNED with status 409
- ✓ an unknown program is UNKNOWN_PROGRAM:404
- ✓ a client with no key is refused: NOT_AUTHORISED:401
- ✓ a client with no key sends no key header at all
- ✓ a client with a key sends exactly that key
- ✓ a server that never answers is given up on after the timeout, as INTERNAL
- ✓ a client that cannot reach the server raises an error, not a hang

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
