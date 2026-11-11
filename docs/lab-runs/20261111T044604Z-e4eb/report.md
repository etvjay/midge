# Lab run 20261111T044604Z-e4eb

- **Code:** `7ca126dc134943fdf75f21a87f090a31b0e0cf25` on `gap-closure` (**6 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `edd3ff37e9a64d22…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 225 events, hash-chained; root `6605f80779ddeb9553bf706279aa16cdc08bc37accebf0e2226b5c7c5489c658`. Verify with `node lab/verify-run.js lab/runs/20261111T044604Z-e4eb`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-IFACE-MODEL Every HTTP route, SSE stream, SDK method and MCP tool is exercised, and the interfaces tell the truth | offline | **PASS** | 20 | 174 |  |

## E-IFACE-MODEL: Every HTTP route, SSE stream, SDK method and MCP tool is exercised, and the interfaces tell the truth

**Hypothesis.** Every route the API declares, every method the SDK exposes and every MCP tool is exercised at least once against a local daemon in model mode, and none of them reports success for something it did not do. The failure that must NOT happen: a tool that answers "valid", "sealed" or "matched" without having verified, sealed or matched anything, or a single request that takes the server down.

**What this does not prove**
- Model mode and a local Roost: this checks the interfaces' behaviour and honesty, not the chain. The chain paths are E-IFACE-CHAIN.
- The compute facility's network call is replaced by a recorded fixture; the code path from the route to the facility is real, the attestation is not.
- Coverage means "called with at least one valid and one invalid input and the result asserted", not exhaustive input testing.
- Model mode and the stub-client checks cannot prove the chain paths; E-IFACE-CHAIN does. Anything still open is recorded as a problem in the report.

| Step | Result | Assertions | Time |
|---|---|---|---|
| derive the interface surface from source | ✓ pass | 5/5 | 2 ms |
| start the API daemon in model mode with a local Roost | ✓ pass | 2/2 | 13 ms |
| SDK: syndicate lifecycle (hatch, get, list, by member, deposit, settle, hatch-out) | ✓ pass | 11/11 | 3227 ms |
| API: input validation and error behaviour | ✓ pass | 8/8 | 13 ms |
| SDK: Roost (session key, attestation, sealing, aggregation) | ✓ pass | 7/7 | 636 ms |
| SDK: facilities (RFQ, OTC, compute) and commerce (x402) | ✓ pass | 15/15 | 386 ms |
| SDK: MPC, emergency hatch-out and the routes the SDK has no method for | ✓ pass | 11/11 | 25 ms |
| SSE: both streams deliver events as they happen | ✓ pass | 8/8 | 427 ms |
| SDK: both SSE streams as async iterators | ✓ pass | 5/5 | 220 ms |
| SDK sealBid and the Roost API with a model-sealed Roost (mock NEAR AI gateway, no key needed) | ✓ pass | 6/6 | 82 ms |
| pagination: total is the record count, order asc/desc, hasMore, and bad input is a 400 | ✓ pass | 8/8 | 28 ms |
| security controls: API key, CORS, public health | ✓ pass | 8/8 | 8 ms |
| chain mode (stub client, no network): each response says what served it, and a write without keys is refused | ✓ pass | 9/9 | 54 ms |
| one request must not take the server down (found by this experiment) | ✓ pass | 1/1 | 721 ms |
| KNOWN GAPs in the model-mode API (pinned: asserting today's behaviour so a fix turns this red) | ✓ pass | 17/17 | 116 ms |
| stop the daemon | ✓ pass | 1/1 | 0 ms |
| chain client: argument shapes and signing parity with the contract (no network) | ✓ pass | 14/14 | 57 ms |
| MCP (in process): every tool, and the four that used to claim success without doing anything | ✓ pass | 26/26 | 3268 ms |
| MCP (stdio JSON-RPC): initialize, list, call, errors | ✓ pass | 7/7 | 149 ms |
| coverage: what the declared surface offers versus what was exercised | ✓ pass | 5/5 | 1 ms |

### derive the interface surface from source

- observed **http routes**: `["GET /health","GET /v1/health","GET /v1/stream/syndicate/*","GET /v1/stream/facilities/rfq/*","POST /v1/syndicates/hatch","GET /v1/syndicat…`
- observed **sdk methods**: `["health","streamSyndicate","streamRfqLoan","hatchSyndicate","getSyndicate","listSyndicates","getSyndicatesByMember","deposit","settleBatch"…`
- observed **mcp tools**: `["midge_payroll_preflight","midge_check_invoice","midge_verify_auditor_pack","midge_hatch_syndicate","midge_deposit","midge_settle","midge_h…`
- ✓ the extractor finds 35 routes (a different number means the source changed: review the new routes)
- ✓ the SDK exposes 35 methods
- ✓ the MCP server lists 13 tools
- ✓ exactly two routes are SSE streams
- ✓ the matcher attributes a member path to the member route, not the by-id route

### start the API daemon in model mode with a local Roost

- ✓ the daemon answers /health
- ✓ responses say they are model mode, so nobody mistakes them for chain results

### SDK: syndicate lifecycle (hatch, get, list, by member, deposit, settle, hatch-out)

- ✓ hatchSyndicate returns the id, a sub-account and an active status
- ✓ a round nonce is issued
- ✓ deposit records the amount and the new escrow total
- ✓ getSyndicate shows the escrow and the depositor
- ✓ listSyndicates includes the new syndicate
- ✓ getSyndicatesByMember finds it for the depositor and for nobody else
- ✓ settleBatch in model mode answers SETTLED_MODEL for an existing syndicate and says so
- ✓ settleBatch for a syndicate that does not exist is refused
- ✓ hatchOut before the timelock expires is locked (HTTP 423), not refunded
- ✓ hatchOut refunds the depositor in full
- ✓ a second hatchOut finds nothing to refund

### API: input validation and error behaviour

- ✓ an invalid syndicate id is a 400
- ✓ a zero quorum is a 400
- ✓ malformed JSON is a 400
- ✓ an unknown path is a 404
- ✓ an unknown syndicate is a 404
- ✓ depositing into an unknown syndicate is a 404 (it used to be a 500, which a client reads as a server fault)
- ✓ a 600 KB body is refused (413 or a closed socket)
- ✓ the timelock of an unknown syndicate is a 404

### SDK: Roost (session key, attestation, sealing, aggregation)

- ✓ the session key says which backend it is and that inputs are NOT hidden from the operator
- ✓ getAttestationQuote returns a session nonce and the public key
- ✓ sealBid refuses a local-simulation Roost (it only trusts an attested model key)
- ✓ submitSealedIntent stores ciphertext and counts it
- ✓ the receipt does not contain the plaintext amount
- ✓ triggerBatchAggregation totals the bid exactly
- ✓ aggregating an empty queue is refused or returns zero, never a stale total

### SDK: facilities (RFQ, OTC, compute) and commerce (x402)

- ✓ createRfq returns an id and an OPEN status
- ✓ matchRfqLoan binds a loan at the quoted rate
- ✓ checkLoanHealth gives a verdict
- ✓ matching an RFQ with no quotes is refused
- ✓ crossOtcOrders matches 10000 wNEAR for 40000 USDC at 4.0
- ✓ crossing two BUY orders is refused
- ✓ depositComputeCredits pools the credits
- ✓ executeComputeInference with quorum returns a result bound to the prompt hash
- ✓ inference below quorum is refused
- ✓ GAP-017 (fixed): the response says it is a simulation, that no inference ran, and that the quote was not verified
- ✓ and the digest is still exactly the SHA-256 of the prompt, which the note says
- ✓ a protected resource without payment is HTTP 402 with the payment headers
- ✓ a bare receipt id is not accepted as proof of payment
- ✓ the signed proof releases the data to the buyer
- ✓ settling above the buyer's maximum price is refused

### SDK: MPC, emergency hatch-out and the routes the SDK has no method for

- ✓ getOmnichainIdentity returns the MPC contract and a root key
- ✓ requestMpcSignature returns a signature body, not an empty object
- ✓ payrollPreflight blocks a payment over the per-payment cap
- ✓ checkInvoice accepts a matching approval and refuses a different destination
- ✓ verifyAuditorPack accepts the right order hash and refuses a wrong one
- ✓ an emergency hatch-out claiming an early block is locked
- ✓ sdk.health() reports OK and the coordinator contract
- ✓ /health is the same as /v1/health
- ✓ sdk.getTimelock reports the creation block, the timeout, the model's current block and the blocks remaining
- ✓ sdk.createPod and sdk.listPods: a pod can be created and listed
- ✓ the pods response is an object that says it is the model (it used to be a bare array with no label)

### SSE: both streams deliver events as they happen

- ✓ /v1/stream/syndicate/sse-mwbmz638: content type is text/event-stream
- ✓ the syndicate stream sends "connected" first
- ✓ a deposit appears on the stream as deposit_received
- ✓ a sealed intent appears as sealed_intent_received with a count and no amount
- ✓ /v1/stream/syndicate/someone-else-mwbmz638: content type is text/event-stream
- ✓ a stream for a different syndicate does not receive these events
- ✓ /v1/stream/facilities/rfq/loan_15221587184c429dc53675be: content type is text/event-stream
- ✓ a loan health check appears on the RFQ stream

### SDK: both SSE streams as async iterators

- ✓ the first event is "connected" and names the syndicate
- ✓ a deposit arrives as { event: "deposit_received", data } with the amount
- ✓ breaking out of the loop ends the stream (three events were read, then it stopped)
- ✓ streamRfqLoan delivers "connected" then the health tick, and an AbortSignal ends it
- ✓ streaming an unknown path raises an error rather than hanging

### SDK sealBid and the Roost API with a model-sealed Roost (mock NEAR AI gateway, no key needed)

- ✓ the session says model-sealed, attested, and hidden from the operator
- ✓ sealBid verifies the model's attestation itself and returns ciphertext sealed to the attested key
- ✓ the ciphertext does not contain the amount
- ✓ submitSealedIntent stores the ciphertext (the API never sees a plaintext amount)
- ✓ triggerBatchAggregation: the attested model totals 42 + 8 = 50 across agreeing runs
- ✓ a key the coordinator advertises but the attestation does not support is refused by the member

### pagination: total is the record count, order asc/desc, hasMore, and bad input is a 400

- ✓ the first page ascending is 1,2,3 with total 7 (the record count, not the page length) and hasMore
- ✓ the first page descending is the newest first: 7,6,5
- ✓ the last descending page is just the oldest one and hasMore is false
- ✓ walking descending pages until hasMore is false returns every record exactly once
- ✓ a page past the end is empty, not an error
- ✓ by-member descending: newest first, with the account's total
- ✓ a limit above 50 is clamped to 50
- ✓ a bad order, a negative fromIndex and a zero limit are each a 400

### security controls: API key, CORS, public health

- ✓ /health is public
- ✓ a protected route without a key is 401
- ✓ a wrong key is 401
- ✓ the right key in X-Midge-Api-Key is accepted
- ✓ the right key as a Bearer token is accepted
- ✓ a foreign origin gets no CORS allowance
- ✓ a localhost origin is allowed
- ✓ an OPTIONS preflight is a 204

### chain mode (stub client, no network): each response says what served it, and a write without keys is refused

- ✓ list is served by the chain, in the API shape, with the record count as total
- ✓ get-by-id is served by the chain, in the API shape, with the exact escrow in yocto
- ✓ an unknown id is a 404, not an answer from the model
- ✓ the timelock is read from the chain: 50 blocks from 100, now 130, so 20 remain
- ✓ hatch without write access is refused with HTTP 409 and instructions (it used to be answered from the model)
- ✓ so are deposit, settle, hatch-out and the emergency exit
- ✓ facilities are labelled model even in chain mode (they never touch the chain)
- ✓ the Roost is labelled off-chain, not chain and not model
- ✓ when the chain cannot be read, the list is a 502 with the reason, not an answer from the model labelled chain (it used to fall back silently)

### one request must not take the server down (found by this experiment)

- observed **child process**: `{"exitCode":0,"parsed":{"r":403,"alive":200}}`
- ✓ a rejected MPC signing request is answered 403 and the server keeps serving

### KNOWN GAPs in the model-mode API (pinned: asserting today's behaviour so a fix turns this red)

- ✓ GAP-013 (fixed): claiming a high block height does not open the timelock (HTTP 423)
- ✓ the victim's escrow is untouched by the attempt
- ✓ GAP-014 (fixed): two syndicates get two different Roosts with different keys
- ✓ aggregating for syndicate B totals only B's bid (5), not A's (11)
- ✓ syndicate A's bid is still there afterwards and totals 11
- ✓ a bid sealed to syndicate A's key cannot be read by syndicate B's Roost (the sealing keys are per syndicate)
- ✓ the Roost routes require a syndicateId (HTTP 400)
- ✓ aggregating for a syndicate nothing was sealed for is a 404
- ✓ GAP-015 (fixed): a caller saying haqVerified:true no longer opens the MPC gate (HTTP 403)
- ✓ and the refusal says why (no Roost, nothing to verify)
- ✓ a caller asking for simulate:false is not forwarded either (still 403, never a live signature attempt)
- ✓ a local Roost has no hardware attestation, so the gate stays shut
- ✓ a model-sealed Roost that does not require the Intel certificate chain does not open it
- ✓ a model-sealed Roost with a failing check does not open it
- ✓ only a model-sealed Roost attested with the certificate chain opens it, and the response gives the basis
- ✓ an operator who starts the server with simulateHaq gets a signature, and the response says it was simulated
- ✓ GAP-016 (fixed): model-mode settle says it is not binding: no signature or allocation was checked and no state changed

### stop the daemon

- ✓ the daemon stopped

### chain client: argument shapes and signing parity with the contract (no network)

- ✓ pairs are normalised to { recipient, amount } objects with yocto strings
- ✓ objects are accepted too and come out the same
- ✓ the client's allocations hash equals the Roost's, which the contract accepts on testnet
- ✓ the hash does not depend on the order of the allocations
- ✓ signSettlement signs the contract's message: contract:syndicate:epoch:nonce:allocationsHash:orderHash
- ✓ and the signature verifies under the matching public key
- ✓ GAP-018 (fixed): a client built with no arguments and no environment has no write access, even though the repository has a .env
- ✓ a client that holds an account defaults to that account's own contract, c.<account> (it used to default to the author's contract for everyone)
- ✓ a client with no account (read-only) falls back to the public demonstration contract
- ✓ an explicit contractId always wins
- ✓ hatch without an enclave key is refused before anything is sent
- ✓ hatch with an all-zero enclave key is refused (nobody could ever settle it)
- ✓ settleBatch without a string nonce is refused (the old numeric default 1 could never match)
- ✓ settleBatch without a 64-byte signature is refused

### MCP (in process): every tool, and the four that used to claim success without doing anything

- ✓ tools/list returns the thirteen tools
- ✓ hatch creates a real model-mode syndicate
- ✓ deposit lands in the model syndicate
- ✓ midge_deposit into an unknown syndicate is an error
- ✓ list includes it
- ✓ get_my_syndicates returns the one the account is in
- ✓ get_my_syndicates invents nothing for an account in no syndicate
- observed **midge_settle in model mode**: `{"mode":"model","notice":"[MODEL MODE, no chain]","status":"SETTLED_MODEL","syndicateId":"mcp-mwbmz638","allocations":[["recipient.near","0.…`
- ✓ midge_hatch_out before the timelock is locked, not refunded (it used to pass block 999999)
- ✓ and succeeds once the model's own clock has passed the timeout
- ✓ verify_haq_attestation never says VALID for a nonce it did not verify against a quote
- ✓ with a local simulation Roost it says NOT_VERIFIED and why
- ✓ submit_sealed_intent refuses a plaintext amount
- ✓ submit_sealed_intent forwards ciphertext to the Roost and reports its count
- ✓ midge_payroll_preflight passes an in-rules payment
- ✓ midge_check_invoice matches its own approval
- ✓ midge_verify_auditor_pack verifies against the order hash
- ✓ and does not echo the amount
- ✓ the Roost really holds the bid
- ✓ create_confidential_rfq creates a real RFQ with an id
- ✓ match_otc_block refuses orders that do not exist
- ✓ chain mode without write keys: midge_hatch_syndicate is refused with an explanation, not answered from the model
- ✓ chain mode without write keys: midge_deposit is refused with an explanation, not answered from the model
- ✓ chain mode without write keys: midge_settle is refused with an explanation, not answered from the model
- ✓ chain mode without write keys: midge_hatch_out is refused with an explanation, not answered from the model
- ✓ chain mode without write keys can still read (list)
- ✓ an unknown tool is an error

### MCP (stdio JSON-RPC): initialize, list, call, errors

- ✓ initialize reports a protocol version and server name
- ✓ tools/list over stdio returns the thirteen tools
- ✓ a tool call over stdio returns text content that parses as JSON
- ✓ over stdio, verify_haq_attestation does not say VALID for a bogus nonce either
- ✓ an unknown tool is a JSON-RPC error -32000
- ✓ an unknown method is -32601
- ✓ over stdio in model mode, a hatch is not an unlabelled mock ("HATCHED_MOCK")

### coverage: what the declared surface offers versus what was exercised

- observed **coverage**: `{"routes":"35/35","sdk":"35/35","mcp":"13/13","requestsToRoutes":103}`
- ✓ every declared HTTP route was exercised
- ✓ every SDK method was called
- ✓ every MCP tool was called
- observed **HTTP routes with no SDK method**: `[]`
- ✓ every HTTP route is reachable from an SDK method (health, both SSE streams, pods and the timelock had none)
- ✓ every request the experiment sent was attributed to a declared route or the 404 probe

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
