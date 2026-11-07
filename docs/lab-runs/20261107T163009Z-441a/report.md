# Lab run 20261107T163009Z-441a

- **Code:** `e9cf883c8836c2d0fa31e1d9034635ba760d647b` on `master` (**10 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `8a0180ff698c44b5…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 236 events, hash-chained; root `d62266e435b1c1a2deee4fd22651ebc19f73b459d599c33c2e2b38d56f8d9918`. Verify with `node lab/verify-run.js lab/runs/20261107T163009Z-441a`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-ROOMSERVICE-04 runRoom slice 4: MCP tools for rooms over stdio and streamable HTTP, one dispatcher, no secret key in any tool | offline | **PASS** | 8 | 60 | 3 attempts: PASS, PASS, PASS |

## E-ROOMSERVICE-04: runRoom slice 4: MCP tools for rooms over stdio and streamable HTTP, one dispatcher, no secret key in any tool

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, written before any code. Four tools mirror the four verbs; none takes a secret key; the coordinator tools need the coordinator key over HTTP; one dispatcher serves stdio and HTTP; a vote through the tools gives the same settlement as the service. The failure that must not happen: a room opened or run over HTTP with no key, a secret key accepted as a tool argument, or an Origin-less browser attack path (DNS rebinding) left open.

**What this does not prove**
- Offline: a real HTTP server on a local port, and the real stdio binary as a child process pointed at a local rooms server.
- The protocol subset implemented is initialize, ping, tools/list and tools/call (single and batch) over JSON responses; server-initiated messages and resumable streams are not.
- One operator plays every member.

| Step | Result | Assertions | Time |
|---|---|---|---|
| the tool list: four new tools, ten old ones, no secret key anywhere | ✓ pass | 5/5 | 3 ms |
| a vote through the tools gives the service's settlement | ✓ pass | 8/8 | 128 ms |
| the coordinator tools refuse a caller who is not the coordinator | ✓ pass | 3/3 | 2 ms |
| executeTool with no context is not the coordinator | ✓ pass | 2/2 | 1 ms |
| an RFQ's plain terms need the flag, also through the tools | ✓ pass | 3/3 | 24 ms |
| streamable HTTP: the protocol, the key, and the checks around it | ✓ pass | 28/28 | 215 ms |
| limits: body size, and one rate limit shared with the rooms API | ✓ pass | 6/6 | 20 ms |
| the stdio binary uses the same dispatcher and reaches a remote rooms server | ✓ pass | 5/5 | 439 ms |

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

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
