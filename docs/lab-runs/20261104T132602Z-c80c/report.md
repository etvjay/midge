# Lab run 20261104T132602Z-c80c

- **Code:** `476af425fc337b1a85d15ba23b26f16dd11def62` on `master` (**2 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `8a0180ff698c44b5…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 145 events, hash-chained; root `15e76ca7892c90bea20571e60e0e92030f5a6a45ad6b6c5541e2052d1e0368d5`. Verify with `node lab/verify-run.js lab/runs/20261104T132602Z-c80c`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-IFACE-MODEL Every HTTP route, SSE stream, SDK method and MCP tool is exercised, and the interfaces tell the truth | offline | **FAIL** | 15 | 95 (10 failed) |  |

## E-IFACE-MODEL: Every HTTP route, SSE stream, SDK method and MCP tool is exercised, and the interfaces tell the truth

**Hypothesis.** Every route the API declares, every method the SDK exposes and every MCP tool is exercised at least once against a local daemon in model mode, and none of them reports success for something it did not do. The failure that must NOT happen: a tool that answers "valid", "sealed" or "matched" without having verified, sealed or matched anything, or a single request that takes the server down.

**What this does not prove**
- Model mode and a local Roost: this checks the interfaces' behaviour and honesty, not the chain. The chain paths are E-IFACE-CHAIN.
- The compute facility's network call is replaced by a recorded fixture; the code path from the route to the facility is real, the attestation is not.
- Coverage means "called with at least one valid and one invalid input and the result asserted", not exhaustive input testing.
- Several API behaviours that are unsafe outside model mode are pinned here as KNOWN GAPs: the experiment asserts the current behaviour and records a problem, so fixing one turns this red and forces the gap to be closed in the ledger.

| Step | Result | Assertions | Time |
|---|---|---|---|
| derive the interface surface from source | ✓ pass | 5/5 | 3 ms |
| start the API daemon in model mode with a local Roost | ✓ pass | 2/2 | 26 ms |
| SDK: syndicate lifecycle (hatch, get, list, by member, deposit, settle, hatch-out) | ✓ pass | 8/8 | 19 ms |
| API: input validation and error behaviour | ✓ pass | 8/8 | 13 ms |
| SDK: Roost (session key, attestation, sealing, aggregation) | ✓ pass | 7/7 | 575 ms |
| SDK: facilities (RFQ, OTC, compute) and commerce (x402) | ✓ pass | 14/14 | 26 ms |
| SDK: MPC, emergency hatch-out and the routes the SDK has no method for | ✗ fail | 6/7 | 10 ms |
| SSE: both streams deliver events as they happen | ✓ pass | 8/8 | 374 ms |
| security controls: API key, CORS, public health | ✓ pass | 8/8 | 74 ms |
| one request must not take the server down (found by this experiment) | ✗ fail | 0/1 | 256 ms |
| KNOWN GAPs in the model-mode API (pinned: asserting today's behaviour so a fix turns this red) | ✗ fail | 2/3 | 11 ms |
| stop the daemon | ✓ pass | 1/1 | 0 ms |
| MCP (in process): every tool, and the four that used to claim success without doing anything | ✗ fail | 8/12 | 100 ms |
| MCP (stdio JSON-RPC): initialize, list, call, errors | ✗ fail | 6/7 | 169 ms |
| coverage: what the declared surface offers versus what was exercised | ✗ fail | 2/4 | 1 ms |

### derive the interface surface from source

- observed **http routes**: `["GET /health","GET /v1/health","GET /v1/stream/syndicate/*","GET /v1/stream/facilities/rfq/*","POST /v1/syndicates/hatch","GET /v1/syndicat…`
- observed **sdk methods**: `["hatchSyndicate","getSyndicate","listSyndicates","getSyndicatesByMember","deposit","settleBatch","hatchOut","getSessionKey","getAttestation…`
- observed **mcp tools**: `["midge_hatch_syndicate","midge_deposit","midge_settle","midge_hatch_out","midge_list_syndicates","midge_get_my_syndicates","midge_submit_se…`
- ✓ the extractor finds 32 routes (a different number means the source changed: review the new routes)
- ✓ the SDK exposes 26 methods
- ✓ the MCP server lists 10 tools
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
- ✓ hatchOut refunds the depositor in full
- ✓ a second hatchOut finds nothing to refund

### API: input validation and error behaviour

- ✓ an invalid syndicate id is a 400
- ✓ a zero quorum is a 400
- ✓ malformed JSON is a 400
- ✓ an unknown path is a 404
- ✓ an unknown syndicate is a 404
- ✓ depositing into an unknown syndicate is refused
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
- ✓ KNOWN GAP-017: the "inference result" is the SHA-256 of the prompt, not a model output (pinned)
- ✓ a protected resource without payment is HTTP 402 with the payment headers
- ✓ a bare receipt id is not accepted as proof of payment
- ✓ the signed proof releases the data to the buyer
- ✓ settling above the buyer's maximum price is refused

### SDK: MPC, emergency hatch-out and the routes the SDK has no method for

- ✓ getOmnichainIdentity returns the MPC contract and a root key
- ✗ requestMpcSignature returns a signature body, not an empty object — expected , got {"mode":"model","notice":"[MODEL MODE, no chain]"}
- ✓ an emergency hatch-out claiming an early block is locked
- ✓ /v1/health is the same as /health
- ✓ the timelock view reports the creation block and timeout
- ✓ a pod can be created and listed
- ✓ the pods list is a bare array while every other response is an object with a mode field
- observed **HTTP routes with no SDK method**: `["GET /health","GET /v1/health","GET /v1/stream/syndicate/*","GET /v1/stream/facilities/rfq/*","POST /v1/syndicates/:p/settle","GET /v1/synd…`

### SSE: both streams deliver events as they happen

- ✓ /v1/stream/syndicate/sse-mw25gvhs: content type is text/event-stream
- ✓ the syndicate stream sends "connected" first
- ✓ a deposit appears on the stream as deposit_received
- ✓ a sealed intent appears as sealed_intent_received with a count and no amount
- ✓ /v1/stream/syndicate/someone-else-mw25gvhs: content type is text/event-stream
- ✓ a stream for a different syndicate does not receive these events
- ✓ /v1/stream/facilities/rfq/loan_e5494319ccbe856fb12e1f1b: content type is text/event-stream
- ✓ a loan health check appears on the RFQ stream

### security controls: API key, CORS, public health

- ✓ /health is public
- ✓ a protected route without a key is 401
- ✓ a wrong key is 401
- ✓ the right key in X-Midge-Api-Key is accepted
- ✓ the right key as a Bearer token is accepted
- ✓ a foreign origin gets no CORS allowance
- ✓ a localhost origin is allowed
- ✓ an OPTIONS preflight is a 204

### one request must not take the server down (found by this experiment)

- observed **child process**: `{"exitCode":1,"parsed":null}`
- ✗ a rejected MPC signing request is answered with a 4xx and the server keeps serving — expected , got process exited with code 1 before answering

### KNOWN GAPs in the model-mode API (pinned: asserting today's behaviour so a fix turns this red)

- ✓ GAP-013 (pinned): any caller can force another member's exit by claiming a high block height
- ✗ GAP-014 (pinned): a bid sealed under syndicate A is aggregated when syndicate B asks — expected , got {"pair":"USDC/NEAR","totalInputAmount":12,"flyerCount":2,"executionModel":"TWAP_AGGREGATED_BATCH","confidentiality":"basic","timestamp":1793798763995}
- ✓ GAP-016 (pinned): model-mode settle of a syndicate that does not exist answers SETTLED_MODEL

### stop the daemon

- ✓ the daemon stopped

### MCP (in process): every tool, and the four that used to claim success without doing anything

- ✓ tools/list returns the ten tools
- ✓ hatch creates a real model-mode syndicate
- ✓ deposit lands in the model syndicate
- ✓ midge_deposit into an unknown syndicate is an error
- ✓ list includes it
- ✓ get_my_syndicates returns the one the account is in
- ✓ get_my_syndicates invents nothing for an account in no syndicate
- observed **midge_settle in model mode**: `{"mode":"model","notice":"[MODEL MODE, no chain]","status":"SETTLED_MODEL","syndicateId":"mcp-mw25gvhs","allocations":[["recipient.near","0.…`
- observed **midge_hatch_out in model mode**: `{"mode":"model","notice":"[MODEL MODE, no chain]","syndicateId":"mcp-mw25gvhs","refundedTo":"agent.near","amount":0.05,"status":"REFUNDED_10…`
- ✗ verify_haq_attestation never says VALID for a nonce it did not verify against a quote — expected , got {"mode":"model","notice":"[MODEL MODE, no chain]","status":"HAQ_ATTESTATION_VALID","nonce":"this-is-not-a-real-nonce","model":"Qwen/Qwen3.6-35B-A3B-FP8","tcbSta…
- ✗ with a local simulation Roost it says NOT_VERIFIED and why — expected , got {"mode":"model","notice":"[MODEL MODE, no chain]","status":"HAQ_ATTESTATION_VALID","nonce":"this-is-not-a-real-nonce","model":"Qwen/Qwen3.6-35B-A3B-FP8","tcbSta…
- ✗ submit_sealed_intent refuses a plaintext amount — expected , got {"ok":true,"r":{"mode":"model","notice":"[MODEL MODE, no chain]","status":"SEALED_ENCRYPTED_IN_ROOST_RAM","syndicateId":"s","flyerId":"f","amount":12345,"pair":…
- ✗ submit_sealed_intent forwards ciphertext to the Roost and reports its count — expected , got {"mode":"model","notice":"[MODEL MODE, no chain]","status":"SEALED_ENCRYPTED_IN_ROOST_RAM","syndicateId":"s","flyerId":"f","pair":"USDC/NEAR"}
- ✓ and does not echo the amount

### MCP (stdio JSON-RPC): initialize, list, call, errors

- ✓ initialize reports a protocol version and server name
- ✓ tools/list over stdio returns the ten tools
- ✓ a tool call over stdio returns text content that parses as JSON
- ✗ over stdio, verify_haq_attestation does not say VALID for a bogus nonce either — expected , got {
  "mode": "model",
  "notice": "[MODEL MODE, no chain]",
  "status": "HAQ_ATTESTATION_VALID",
  "nonce": "not-a-real-nonce",
  "model": "Qwen/Qwen3.6-35B-A3B-
- ✓ an unknown tool is a JSON-RPC error -32000
- ✓ an unknown method is -32601
- ✓ over stdio in model mode, a hatch is not an unlabelled mock ("HATCHED_MOCK")

### coverage: what the declared surface offers versus what was exercised

- observed **coverage**: `{"routes":"32/32","sdk":"25/26","mcp":"8/10","requestsToRoutes":71}`
- ✓ every declared HTTP route was exercised
- ✗ every SDK method was called — expected , got ["settleBatch"]
- ✗ every MCP tool was called — expected , got ["midge_create_confidential_rfq","midge_match_otc_block"]
- ✓ every request the experiment sent was attributed to a declared route or the 404 probe

## Problems found

| Severity | Where | Problem |
|---|---|---|
| critical | E-IFACE-MODEL / MCP (in process): every tool, and the four that used to claim success without doing anything | step threw: Cannot aggregate empty sealed intent queue — {"stack":["Error: Cannot aggregate empty sealed intent queue","    at RoostEnclave.aggregateAndClear (file:///home/ubuntu/near/src/enclave/roost.js:121:13)","    at file:///home/ubuntu/near/lab/experi… |
| major | E-IFACE-MODEL / SDK: MPC, emergency hatch-out and the routes the SDK has no method for | assertion failed: requestMpcSignature returns a signature body, not an empty object — {"actual":{"mode":"model","notice":"[MODEL MODE, no chain]"}} |
| major | E-IFACE-MODEL / one request must not take the server down (found by this experiment) | assertion failed: a rejected MPC signing request is answered with a 4xx and the server keeps serving — {"actual":"process exited with code 1 before answering"} |
| major | E-IFACE-MODEL / KNOWN GAPs in the model-mode API (pinned: asserting today's behaviour so a fix turns this red) | GAP-013: POST /v1/emergency/hatch-out takes currentBlock and flyerId from the request body, so any caller can open the timelock and force any member out of an active round (model mode only; the contract uses the real block height) |
| major | E-IFACE-MODEL / KNOWN GAPs in the model-mode API (pinned: asserting today's behaviour so a fix turns this red) | assertion failed: GAP-014 (pinned): a bid sealed under syndicate A is aggregated when syndicate B asks — {"actual":{"pair":"USDC/NEAR","totalInputAmount":12,"flyerCount":2,"executionModel":"TWAP_AGGREGATED_BATCH","confidentiality":"basic","timestamp":1793798763995}} |
| major | E-IFACE-MODEL / KNOWN GAPs in the model-mode API (pinned: asserting today's behaviour so a fix turns this red) | GAP-014: the Roost endpoints ignore syndicateId; one bid queue is shared by every syndicate, so aggregating for syndicate B returns and clears syndicate A's bids |
| major | E-IFACE-MODEL / MCP (in process): every tool, and the four that used to claim success without doing anything | assertion failed: verify_haq_attestation never says VALID for a nonce it did not verify against a quote — {"actual":{"mode":"model","notice":"[MODEL MODE, no chain]","status":"HAQ_ATTESTATION_VALID","nonce":"this-is-not-a-real-nonce","model":"Qwen/Qwen3.6-35B-A3B-FP8","tcbStatus":"UpToDate"}} |
| major | E-IFACE-MODEL / MCP (in process): every tool, and the four that used to claim success without doing anything | assertion failed: with a local simulation Roost it says NOT_VERIFIED and why — {"actual":{"mode":"model","notice":"[MODEL MODE, no chain]","status":"HAQ_ATTESTATION_VALID","nonce":"this-is-not-a-real-nonce","model":"Qwen/Qwen3.6-35B-A3B-FP8","tcbStatus":"UpToDate"}} |
| major | E-IFACE-MODEL / MCP (in process): every tool, and the four that used to claim success without doing anything | assertion failed: submit_sealed_intent refuses a plaintext amount — {"actual":{"ok":true,"r":{"mode":"model","notice":"[MODEL MODE, no chain]","status":"SEALED_ENCRYPTED_IN_ROOST_RAM","syndicateId":"s","flyerId":"f","amount":12345,"pair":"USDC/NEAR"}}} |
| major | E-IFACE-MODEL / MCP (in process): every tool, and the four that used to claim success without doing anything | assertion failed: submit_sealed_intent forwards ciphertext to the Roost and reports its count — {"actual":{"mode":"model","notice":"[MODEL MODE, no chain]","status":"SEALED_ENCRYPTED_IN_ROOST_RAM","syndicateId":"s","flyerId":"f","pair":"USDC/NEAR"}} |
| major | E-IFACE-MODEL / MCP (stdio JSON-RPC): initialize, list, call, errors | assertion failed: over stdio, verify_haq_attestation does not say VALID for a bogus nonce either — {"actual":"{\n  \"mode\": \"model\",\n  \"notice\": \"[MODEL MODE, no chain]\",\n  \"status\": \"HAQ_ATTESTATION_VALID\",\n  \"nonce\": \"not-a-real-nonce\",\n  \"model\": \"Qwen/Qwen3.6-35B-A3B-"} |
| major | E-IFACE-MODEL / coverage: what the declared surface offers versus what was exercised | assertion failed: every SDK method was called — {"actual":["settleBatch"]} |
| major | E-IFACE-MODEL / coverage: what the declared surface offers versus what was exercised | assertion failed: every MCP tool was called — {"actual":["midge_create_confidential_rfq","midge_match_otc_block"]} |
| minor | E-IFACE-MODEL / API: input validation and error behaviour | a client error (deposit into an unknown syndicate) is reported as HTTP 500 instead of 404/409, so a client cannot tell its mistake from a server fault |
| minor | E-IFACE-MODEL / SDK: facilities (RFQ, OTC, compute) and commerce (x402) | GAP-017: /v1/facilities/compute/infer returns sha256(prompt) as "inferenceResultHash" and hardwareVerified only checks that a quote is present; no inference runs and no quote is verified |
| minor | E-IFACE-MODEL / SDK: MPC, emergency hatch-out and the routes the SDK has no method for | GET /v1/syndicates/:id/pods returns a bare array without the "mode" field every other route includes, so a client cannot tell model data from chain data there |
| minor | E-IFACE-MODEL / SDK: MPC, emergency hatch-out and the routes the SDK has no method for | the SDK has no method for 8 HTTP routes: GET /health; GET /v1/health; GET /v1/stream/syndicate/*; GET /v1/stream/facilities/rfq/*; POST /v1/syndicates/:p/settle; GET /v1/syndicates/:p/pods; POST /v1/syndicates/:p/pods; GET /v1/emergency/timelock/* |
| minor | E-IFACE-MODEL / KNOWN GAPs in the model-mode API (pinned: asserting today's behaviour so a fix turns this red) | GAP-016: model-mode /settle acknowledges any request with SETTLED_MODEL without checking the syndicate, the allocations or a signature; in chain mode hatch, deposit and get-by-id still use the in-memory model, so one API session mixes chain and model state |
