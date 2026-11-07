# Lab run 20261107T164154Z-6577

- **Code:** `1129c7d02df453041a20e119edcbf0d93895ef9b` on `master` (**7 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `8a0180ff698c44b5…`
- **Capabilities at start:** network=no, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 1709 events, hash-chained; root `e1219aacffc2c95cbf34b581d59e3ac76a92712b088bcec0a52a203f6bd238f4`. Verify with `node lab/verify-run.js lab/runs/20261107T164154Z-6577`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-ROOMSERVICE-04 runRoom slice 4: MCP tools for rooms over stdio and streamable HTTP, one dispatcher, no secret key in any tool | offline | **PASS** | 8 | 60 | 3 attempts: PASS, PASS, PASS |
| E-ROOMSERVICE-05 runRoom slice 5: a live event stream (SSE) that shows a round happening and leaks nothing sealed | offline | **PASS** | 8 | 36 | 3 attempts: PASS, PASS, PASS |
| E-ROOMSERVICE-06 runRoom slice 6: a practice room that runs all seven kinds end to end, is plainly a simulation, holds no real key, and gives the same settlement through every door | offline | **PASS** | 13 | 75 | 3 attempts: PASS, PASS, PASS |
| E-ROOMSERVICE-01 runRoom slice 1: one door for the vote room: describe, open, submit, run; typed errors; retry-safe; same answers as the old path | offline | **PASS** | 8 | 56 | 3 attempts: PASS, PASS, PASS |
| E-ROOMSERVICE-02 runRoom slice 2: all seven room kinds behind the same four verbs; same answers as the old path; wrong parameters never become internal errors | offline | **PASS** | 21 | 117 | 3 attempts: PASS, PASS, PASS |
| E-ROOMSERVICE-03 runRoom slice 3: the web API for rooms: keys, one error shape, rate limits, an OpenAPI document that matches the router, and an SDK | offline | **PASS** | 8 | 81 | 3 attempts: PASS, PASS, PASS |

## E-ROOMSERVICE-04: runRoom slice 4: MCP tools for rooms over stdio and streamable HTTP, one dispatcher, no secret key in any tool

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, written before any code. Four tools mirror the four verbs; none takes a secret key; the coordinator tools need the coordinator key over HTTP; one dispatcher serves stdio and HTTP; a vote through the tools gives the same settlement as the service. The failure that must not happen: a room opened or run over HTTP with no key, a secret key accepted as a tool argument, or an Origin-less browser attack path (DNS rebinding) left open.

**What this does not prove**
- Offline: a real HTTP server on a local port, and the real stdio binary as a child process pointed at a local rooms server.
- The protocol subset implemented is initialize, ping, tools/list and tools/call (single and batch) over JSON responses; server-initiated messages and resumable streams are not.
- One operator plays every member.

| Step | Result | Assertions | Time |
|---|---|---|---|
| the tool list: four new tools, ten old ones, no secret key anywhere | ✓ pass | 5/5 | 2 ms |
| a vote through the tools gives the service's settlement | ✓ pass | 8/8 | 60 ms |
| the coordinator tools refuse a caller who is not the coordinator | ✓ pass | 3/3 | 1 ms |
| executeTool with no context is not the coordinator | ✓ pass | 2/2 | 1 ms |
| an RFQ's plain terms need the flag, also through the tools | ✓ pass | 3/3 | 17 ms |
| streamable HTTP: the protocol, the key, and the checks around it | ✓ pass | 28/28 | 93 ms |
| limits: body size, and one rate limit shared with the rooms API | ✓ pass | 6/6 | 13 ms |
| the stdio binary uses the same dispatcher and reaches a remote rooms server | ✓ pass | 5/5 | 281 ms |

### the tool list: four new tools, ten old ones, no secret key anywhere

- ✓ without rooms the list is the original ten
- ✓ with rooms it adds exactly the four room tools
- ✓ no room tool has a parameter that could carry a secret key
- ✓ every room tool has a description and an object input schema
- ✓ the submit tool says the input must already be signed

### a vote through the tools gives the service's settlement

- ✓ describe lists seven programs
- ✓ input 1 accepted without the coordinator key
- ✓ input 2 accepted without the coordinator key
- ✓ input 3 accepted without the coordinator key
- ✓ input 4 accepted without the coordinator key
- ✓ input 5 accepted without the coordinator key
- ✓ same order hash as the service
- ✓ same contract call arguments

### the coordinator tools refuse a caller who is not the coordinator

- ✓ midge_open_room_round without the coordinator is an error with code NOT_AUTHORISED
- ✓ midge_run_room without the coordinator is an error with code NOT_AUTHORISED
- ✓ the default (no context given) is not the coordinator

### executeTool with no context is not the coordinator

- ✓ a library caller who passes no context cannot open a round
- ✓ but can read the description

### an RFQ's plain terms need the flag, also through the tools

- ✓ by default there is no confidential section and no units or notional
- ✓ with includeConfidential true: the terms
- ✓ only the boolean true counts: the string "yes" does not

### streamable HTTP: the protocol, the key, and the checks around it

- ✓ initialize answers with a protocol version, server info and the tools capability
- ✓ tools/list over HTTP shows 14 tools
- ✓ describe needs no key
- ✓ opening a round without the key is HTTP 401 with a JSON-RPC error
- ✓ running without the key is HTTP 401
- ✓ a wrong key is HTTP 401
- ✓ a key that is only a prefix of the real one is HTTP 401
- ✓ a ping with no id is a notification: 202 and no body
- ✓ an empty batch is -32600
- ✓ with the key, the round opens
- ✓ a Bearer token works as well
- ✓ submitting a signed input needs no key
- ✓ the run returns the settlement
- ✓ a room error comes back as a JSON-RPC error carrying the room code
- ✓ a forged input is refused with NOT_AUTHORISED (an error, not a crash)
- ✓ a notification (no id) gets 202 and no body
- ✓ a batch returns an array of responses in order
- ✓ an unknown method is -32601
- ✓ invalid JSON is HTTP 400 with -32700
- ✓ a message without jsonrpc "2.0" is -32600
- ✓ an unknown tool is a JSON-RPC error, not a crash
- ✓ GET /mcp is 405 with Allow: POST
- ✓ a path that is not /mcp is not handled here
- ✓ a browser request from an origin that is not allowed is refused (DNS-rebinding guard)
- ✓ a request with no Origin header (an agent, not a browser) is fine
- ✓ responses are never cached
- ✓ an origin on the allow-list is accepted
- ✓ an origin that merely starts with an allowed one is refused

### limits: body size, and one rate limit shared with the rooms API

- ✓ two MCP and one rooms request pass
- ✓ the fourth, on either door, is 429 because the allowance is shared
- ✓ over MCP the 429 is a JSON-RPC error with RATE_LIMITED
- ✓ the MCP 429 carries Retry-After too
- ✓ a body over the limit is 413
- ✓ a streamed body over the limit with no declared length is 413 as well

### the stdio binary uses the same dispatcher and reaches a remote rooms server

- ✓ initialize works on stdio
- ✓ the stdio server lists the room tools when MIDGE_ROOMS_URL is set
- ✓ describe reaches the remote rooms server
- ✓ a vote run through the stdio binary returns the finished contract call
- ✓ a room error over stdio carries the room code

## E-ROOMSERVICE-05: runRoom slice 5: a live event stream (SSE) that shows a round happening and leaks nothing sealed

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, written before any code. The stream shows round_opened, input_accepted (a count) and round_run (program, decided, order hash) and nothing else, replays what a reconnecting client missed from a ring of the last 100, caps its clients, cleans up after each, and keeps the rooms API otherwise unchanged. The failure that must not happen: a flyer id, ciphertext, choice or trade term in any frame, or a leaked subscriber after a client leaves.

**What this does not prove**
- Offline, a real HTTP server and a real streaming client on a local port.
- A slow consumer that never reads is not simulated (the stream is dropped if its write buffer grows past a bound; that branch is covered by a unit-level check only where noted).
- Replay is from memory: a restart of the room loses the ring.
- One operator plays every member.

| Step | Result | Assertions | Time |
|---|---|---|---|
| a vote shows up on the stream in order, with only the safe fields | ✓ pass | 6/6 | 41 ms |
| a run that decides nothing says so; an RFQ's terms never appear | ✓ pass | 2/2 | 69 ms |
| an identical retry does not publish the round twice | ✓ pass | 2/2 | 264 ms |
| a reconnecting client is caught up from the ring of the last 100 | ✓ pass | 7/7 | 439 ms |
| limits, heartbeat and cleanup | ✓ pass | 8/8 | 367 ms |
| a finished stream leaves no timer behind, and a client that never reads is dropped | ✓ pass | 5/5 | 237 ms |
| the hub: a broken subscriber does not stop the others | ✓ pass | 4/4 | 2 ms |
| the SDK can follow the stream | ✓ pass | 2/2 | 392 ms |

### a vote shows up on the stream in order, with only the safe fields

- ✓ the stream is 200 text/event-stream, no-store, with a retry hint
- ✓ the order is round_opened, five input_accepted, round_run
- ✓ input_accepted carries only a running count: 1 to 5
- ✓ round_run carries exactly the program, whether it decided, and the order hash
- ✓ ids rise by one from the first event
- ✓ the raw stream contains no member id, ciphertext, signature, key, choice, winner, recipient or settlement signature

### a run that decides nothing says so; an RFQ's terms never appear

- ✓ a tie is reported as decided false, with no order hash
- ✓ even when the caller asked for the terms, the stream has no units, price, side or notional

### an identical retry does not publish the round twice

- ✓ exactly one round_run
- ✓ a refused input publishes nothing

### a reconnecting client is caught up from the ring of the last 100

- ✓ after Last-Event-ID 140 it gets exactly events 141 to 150, in order
- ✓ from the start it gets only the 100 still held: 51 to 150
- ✓ with no Last-Event-ID it gets no history, only what comes next
- ✓ and then the new event, id 151
- ✓ an empty Last-Event-ID header is treated as none, not as 0
- ✓ the ?lastEventId= form works for clients that cannot set the header: 148 to 151 (151 is the event published a moment ago)
- ✓ a Last-Event-ID that is not a number is treated as none

### limits, heartbeat and cleanup

- ✓ two streams are accepted
- ✓ the third is 503 UNAVAILABLE with Retry-After
- ✓ the refused one subscribed nothing
- ✓ an idle stream gets a keepalive comment
- ✓ when a client leaves its subscription is gone
- ✓ and the freed place can be used
- ✓ after everyone leaves there are no subscribers
- ✓ opening a stream counts against the rate limit

### a finished stream leaves no timer behind, and a client that never reads is dropped

- ✓ four open streams hold four heartbeat timers
- ✓ when they close, every heartbeat timer is cleared
- ✓ it is subscribed
- ✓ the stream that never reads is dropped once its buffer passes 1 MiB
- ✓ and its place is free again

### the hub: a broken subscriber does not stop the others

- ✓ both events reached the healthy subscriber
- ✓ after unsubscribing it gets nothing more
- ✓ since(id) returns only later events and respects the ring size
- ✓ the ring keeps only the newest 3

### the SDK can follow the stream

- ✓ it delivers the same seven events with parsed data and ids
- ✓ with lastEventId 5 it is caught up on 6 and 7

## E-ROOMSERVICE-06: runRoom slice 6: a practice room that runs all seven kinds end to end, is plainly a simulation, holds no real key, and gives the same settlement through every door

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, written before any code. createDemoRoom gives a labelled-simulation room with generated member keys; all seven kinds run through it, charges equal payouts, signatures verify; the same vote through the service, HTTP, the SDK and MCP gives the same settlement; it refuses a real contract; pay-run statements open only for their own reader. The failure that must not happen: a real or reusable key held by the demo, a demo round accepted for a real contract, or the demo claiming privacy it does not give.

**What this does not prove**
- Offline. The room is a simulation: its host key is ephemeral and its settlements are valid for no contract. Nothing here touches a chain.
- Not a browser bundle: it runs on Node. A browser build is a later step.
- The "hides" and "reveals" texts are written by hand per scenario; only some are checked mechanically (listed in the steps).
- One operator plays every member.

| Step | Result | Assertions | Time |
|---|---|---|---|
| it says it is a simulation, and holds no secret anyone can read | ✓ pass | 8/8 | 30 ms |
| it refuses to be used for a real contract | ✓ pass | 4/4 | 10 ms |
| ballot: runs end to end; charges equal payouts; the signature verifies | ✓ pass | 6/6 | 64 ms |
| pool: runs end to end; charges equal payouts; the signature verifies | ✓ pass | 6/6 | 55 ms |
| auction: runs end to end; charges equal payouts; the signature verifies | ✓ pass | 6/6 | 60 ms |
| quote: runs end to end; charges equal payouts; the signature verifies | ✓ pass | 6/6 | 33 ms |
| cross: runs end to end; charges equal payouts; the signature verifies | ✓ pass | 6/6 | 36 ms |
| rfq: runs end to end; charges equal payouts; the signature verifies | ✓ pass | 6/6 | 38 ms |
| payrun: runs end to end; charges equal payouts; the signature verifies | ✓ pass | 6/6 | 41 ms |
| what an observer sees: the vote hides who voted what; the pool honestly shows each amount | ✓ pass | 5/5 | 71 ms |
| a pay run's statements open only for their own reader | ✓ pass | 7/7 | 55 ms |
| the same vote through the service, HTTP, the SDK and MCP gives the same settlement | ✓ pass | 3/3 | 193 ms |
| a scenario can be replayed in a fresh round, and rooms do not share state | ✓ pass | 6/6 | 197 ms |

### it says it is a simulation, and holds no secret anyone can read

- ✓ describe says simulated
- ✓ and carries a plain notice that it is a simulation valid for no contract
- ✓ seven programs
- ✓ nothing it exposes names or contains a secret key (a NEAR secret key is ed25519: plus about 88 characters; a public key is about 44)
- ✓ a public key it does expose is the short form
- ✓ members are listed by public key only
- ✓ its contract is the fixed demo contract
- ✓ two demo rooms have different host keys (nothing is reusable)

### it refuses to be used for a real contract

- ✓ opening a round for the real testnet contract is INVALID_PARAMS
- ✓ and the message says why
- ✓ the demo contract itself is accepted
- ✓ a contract that merely ends like the demo one is refused

### ballot: runs end to end; charges equal payouts; the signature verifies

- ✓ the scenario has a title, a plain description, and what it hides and reveals
- ✓ it decided and produced a contract call
- ✓ the charges add up to exactly the payouts (the contract requires it)
- ✓ the signature verifies against the demo host's key
- ✓ it reports the sealed inputs it used (what the members typed)
- ✓ and the public events the round produced, in order

### pool: runs end to end; charges equal payouts; the signature verifies

- ✓ the scenario has a title, a plain description, and what it hides and reveals
- ✓ it decided and produced a contract call
- ✓ the charges add up to exactly the payouts (the contract requires it)
- ✓ the signature verifies against the demo host's key
- ✓ it reports the sealed inputs it used (what the members typed)
- ✓ and the public events the round produced, in order

### auction: runs end to end; charges equal payouts; the signature verifies

- ✓ the scenario has a title, a plain description, and what it hides and reveals
- ✓ it decided and produced a contract call
- ✓ the charges add up to exactly the payouts (the contract requires it)
- ✓ the signature verifies against the demo host's key
- ✓ it reports the sealed inputs it used (what the members typed)
- ✓ and the public events the round produced, in order

### quote: runs end to end; charges equal payouts; the signature verifies

- ✓ the scenario has a title, a plain description, and what it hides and reveals
- ✓ it decided and produced a contract call
- ✓ the charges add up to exactly the payouts (the contract requires it)
- ✓ the signature verifies against the demo host's key
- ✓ it reports the sealed inputs it used (what the members typed)
- ✓ and the public events the round produced, in order

### cross: runs end to end; charges equal payouts; the signature verifies

- ✓ the scenario has a title, a plain description, and what it hides and reveals
- ✓ it decided and produced a contract call
- ✓ the charges add up to exactly the payouts (the contract requires it)
- ✓ the signature verifies against the demo host's key
- ✓ it reports the sealed inputs it used (what the members typed)
- ✓ and the public events the round produced, in order

### rfq: runs end to end; charges equal payouts; the signature verifies

- ✓ the scenario has a title, a plain description, and what it hides and reveals
- ✓ it decided and produced a contract call
- ✓ the charges add up to exactly the payouts (the contract requires it)
- ✓ the signature verifies against the demo host's key
- ✓ it reports the sealed inputs it used (what the members typed)
- ✓ and the public events the round produced, in order

### payrun: runs end to end; charges equal payouts; the signature verifies

- ✓ the scenario has a title, a plain description, and what it hides and reveals
- ✓ it decided and produced a contract call
- ✓ the charges add up to exactly the payouts (the contract requires it)
- ✓ the signature verifies against the demo host's key
- ✓ it reports the sealed inputs it used (what the members typed)
- ✓ and the public events the round produced, in order

### what an observer sees: the vote hides who voted what; the pool honestly shows each amount

- ✓ for the vote, no voter's choice is attributable: nothing links a member to A, B or abstain
- ✓ and no tally or count per option appears
- ✓ the vote's reveals text admits the charges name every voter
- ✓ for the pool, the per-member charges equal what each member sealed, so an observer learns every amount
- ✓ and the pool's reveals text says so in plain words

### a pay run's statements open only for their own reader

- ✓ there is one statement per payee, one for the employer, one for the auditor
- ✓ a payee opens their own statement and sees their own receipt
- ✓ another payee's key cannot open it
- ✓ the employer opens theirs and sees every line: the four payments plus the tax and benefits receipts
- ✓ a payee cannot open the employer's
- ✓ the auditor sees totals and a headcount, and no names
- ✓ an unknown reader gets nothing

### the same vote through the service, HTTP, the SDK and MCP gives the same settlement

- ✓ HTTP gives the service's order hash, payouts, charges, method, nonce and outcome
- ✓ the SDK does too
- ✓ and so does MCP

### a scenario can be replayed in a fresh round, and rooms do not share state

- ✓ running the same scenario twice works (each run opens its own round)
- ✓ with a different round nonce each time
- ✓ so the second signature is not a replay of the first
- ✓ each run reports only its own events: round_opened, one per input, round_run
- ✓ another demo room is untouched by it
- ✓ an unknown scenario is UNKNOWN_PROGRAM

## E-ROOMSERVICE-01: runRoom slice 1: one door for the vote room: describe, open, submit, run; typed errors; retry-safe; same answers as the old path

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, written before any code. RoomService gives the same outcome, order hash, allocations and charges as the old runBallot + signSettlement path, returns the finished contract call, refuses bad calls with a typed code and leaves the queue unharmed, and is safe to retry. The failure that must not happen: a settlement signed for something the host did not compute, or a refused call that eats the round's inputs.

**What this does not prove**
- Offline, on local hosts with a simulated attestation provider and a stubbed account-key check.
- Only the vote room kind is registered; the other six programs and the four adapters (MCP, REST, SSE, SDK) are later slices.
- One operator plays every member.

| Step | Result | Assertions | Time |
|---|---|---|---|
| describe: one program, the host's keys | ✓ pass | 3/3 | 2 ms |
| a five-member vote returns the finished contract call, and the signature verifies | ✓ pass | 9/9 | 32 ms |
| parity: the same answers as the old path on a twin host | ✓ pass | 3/3 | 66 ms |
| a tie decides nothing: no settlement, nothing signed | ✓ pass | 3/3 | 40 ms |
| typed errors, and a refused call leaves the inputs alone | ✓ pass | 25/25 | 36 ms |
| retry-safe: an identical run returns the same result; a different one is refused | ✓ pass | 4/4 | 33 ms |
| defaults, unexpected errors, and a cached result never goes stale | ✓ pass | 6/6 | 164 ms |
| the registry is real: a second program runs through the same verbs | ✓ pass | 3/3 | 5 ms |

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
| describe lists seven programs | ✓ pass | 3/3 | 1 ms |
| pool: parity with the old path, and a contract call whose signature verifies | ✓ pass | 8/8 | 42 ms |
| pool: deciding nothing signs nothing | ✓ pass | 2/2 | 26 ms |
| pool: wrong parameters are INVALID_PARAMS, never an internal error, and the inputs stay | ✓ pass | 8/8 | 23 ms |
| auction: parity with the old path, and a contract call whose signature verifies | ✓ pass | 8/8 | 42 ms |
| auction: deciding nothing signs nothing | ✓ pass | 2/2 | 27 ms |
| auction: wrong parameters are INVALID_PARAMS, never an internal error, and the inputs stay | ✓ pass | 8/8 | 32 ms |
| quote: parity with the old path, and a contract call whose signature verifies | ✓ pass | 8/8 | 32 ms |
| quote: deciding nothing signs nothing | ✓ pass | 2/2 | 16 ms |
| quote: wrong parameters are INVALID_PARAMS, never an internal error, and the inputs stay | ✓ pass | 9/9 | 19 ms |
| cross: parity with the old path, and a contract call whose signature verifies | ✓ pass | 8/8 | 52 ms |
| cross: deciding nothing signs nothing | ✓ pass | 2/2 | 27 ms |
| cross: wrong parameters are INVALID_PARAMS, never an internal error, and the inputs stay | ✓ pass | 7/7 | 23 ms |
| rfq: parity with the old path, and a contract call whose signature verifies | ✓ pass | 8/8 | 61 ms |
| rfq: deciding nothing signs nothing | ✓ pass | 2/2 | 31 ms |
| rfq: wrong parameters are INVALID_PARAMS, never an internal error, and the inputs stay | ✓ pass | 8/8 | 41 ms |
| payrun: parity with the old path, and a contract call whose signature verifies | ✓ pass | 8/8 | 83 ms |
| payrun: wrong parameters are INVALID_PARAMS, never an internal error, and the inputs stay | ✓ pass | 7/7 | 29 ms |
| a pay run's receipts leave only as sealed statements | ✓ pass | 3/3 | 30 ms |
| an RFQ's plain terms are left out unless asked for, and the retry is stable | ✓ pass | 4/4 | 29 ms |
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
- ✓ {"employer":"er.near","taxAddress":7,"benefitsAddress":"ben.near","employerKeyHex":"4bca33 -> INVALID_PARAMS
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

## E-ROOMSERVICE-03: runRoom slice 3: the web API for rooms: keys, one error shape, rate limits, an OpenAPI document that matches the router, and an SDK

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, written before any code. The HTTP adapter only translates: a vote over HTTP gives the same settlement as the service on a twin host; every failure has one status and the body { error, code }; the coordinator key guards open and run; the rate limit holds and recovers; the OpenAPI document documents exactly the routes served. The failure that must not happen: an unauthenticated open or run, an error that leaks a stack or a secret, or a documented route that is not served (or the reverse).

**What this does not prove**
- Offline: a real HTTP server on a local port, a simulated attestation provider, a stubbed account-key check.
- The rate limit uses an injected clock; real-time behaviour under load is not tested.
- The server speaks plain HTTP on localhost; TLS and a reverse proxy are deployment concerns.
- One operator plays every member.

| Step | Result | Assertions | Time |
|---|---|---|---|
| describe is open; open and run need the coordinator key | ✓ pass | 8/8 | 12 ms |
| a vote over HTTP gives the same settlement as the service on a twin host | ✓ pass | 10/10 | 76 ms |
| every failure has one status and the body { error, code } | ✓ pass | 16/16 | 94 ms |
| the rate limit holds, tells the client, and recovers | ✓ pass | 10/10 | 15 ms |
| behind a proxy: the forwarded address is trusted only from our own proxy, and cannot be forged to dodge the limit | ✓ pass | 12/12 | 34 ms |
| an RFQ's plain terms need the flag and the coordinator key | ✓ pass | 3/3 | 27 ms |
| the OpenAPI document matches the router | ✓ pass | 13/13 | 7 ms |
| the SDK returns the same results and raises RoomError with the server's code | ✓ pass | 9/9 | 356 ms |

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

### behind a proxy: the forwarded address is trusted only from our own proxy, and cannot be forged to dodge the limit

- ✓ a client behind our proxy gets its own allowance: two pass
- ✓ its third is limited
- ✓ a different forwarded client is not affected by it
- ✓ entries an attacker prepends do not help: the address our proxy saw is the last one
- ✓ our own proxies in the chain are skipped to find the real client
- ✓ a garbage header falls back to the connecting address, not to a free pass
- ✓ IPv6 addresses work
- ✓ a chain with an unreadable hop is not believed (the address before it could be forged): it counts against the connecting address
- ✓ an IPv4-mapped IPv6 address is the same client as the plain IPv4 one
- ✓ and a proxy listed in the mapped form is recognised too
- ✓ by default the header is ignored: three different forwarded addresses share the real one, so the third is limited
- ✓ a proxy list that does not include the connecting address is no better than none

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
