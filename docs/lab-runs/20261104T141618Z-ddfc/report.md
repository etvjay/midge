# Lab run 20261104T141618Z-ddfc

- **Code:** `355928f912e752528a8ee16b38282ec487a90897` on `master` (**6 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `8a0180ff698c44b5…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 567 events, hash-chained; root `fba397038b0922215af270639fcd3db9c06d12305502bef4cfff26895a9cff61`. Verify with `node lab/verify-run.js lab/runs/20261104T141618Z-ddfc`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-LAB-01 The lab records honestly and detects tampering | offline | **PASS** | 6 | 33 |  |
| E-SUITE-OFFLINE Existing verification suites, offline and keyless | offline | **PASS** | 10 | 198 |  |
| E-CHECK-FOUNDRY Claims, gaps and commits are consistent with the repository | offline | **PASS** | 1 | 6 |  |
| E-RUST-CONTRACT The NEAR contract passes its Rust tests, lints and formatting | offline | **PASS** | 3 | 6 |  |
| E-IFACE-MODEL Every HTTP route, SSE stream, SDK method and MCP tool is exercised, and the interfaces tell the truth | offline | **PASS** | 19 | 156 |  |

## E-LAB-01: The lab records honestly and detects tampering

**Hypothesis.** A run log cannot be edited, trimmed or reordered without detection, secrets never reach the log, and an experiment's verdict is derived from its recorded assertions and cannot be declared.

**What this does not prove**
- The hash chain proves the log is unchanged since it was written. It does not prove the events were produced honestly, which is why experiments attach checkable evidence (transaction hashes, attestation digests, file digests).
- An attacker who rewrites the whole log and its summary consistently would pass the chain check; anchoring the root hash somewhere public (a testnet transaction) closes that gap and is a separate step.

| Step | Result | Assertions | Time |
|---|---|---|---|
| secrets are redacted before they are written or hashed | ✓ pass | 5/5 | 1 ms |
| events whose data has a field named hash (a transaction hash) still verify | ✓ pass | 4/4 | 1 ms |
| an untouched log verifies as intact | ✓ pass | 2/2 | 1 ms |
| editing, deleting, reordering or truncating a log is detected | ✓ pass | 5/5 | 2 ms |
| verdicts are derived from assertions, not declared | ✓ pass | 14/14 | 352 ms |
| canonical encoding is order independent | ✓ pass | 3/3 | 0 ms |

### secrets are redacted before they are written or hashed

- ✓ the exact secret value is absent from the file
- ✓ a NEAR-style secret key pattern is absent
- ✓ a GitHub token pattern is absent
- ✓ the redaction marker names which secret it was
- ✓ a blob holding a secret is redacted too

### events whose data has a field named hash (a transaction hash) still verify

- ✓ the chain verifies with a data field called hash
- ✓ the data field survived unchanged
- ✓ a field that would collide with the envelope is rejected loudly
- ✓ so is a field called type

### an untouched log verifies as intact

- ✓ the chain, sequence and closing commitment verify
- ✓ every event is counted

### editing, deleting, reordering or truncating a log is detected

- ✓ changing one field of one event is detected
- ✓ deleting an event is detected
- ✓ reordering two events is detected
- ✓ truncating the closing event is detected
- ✓ a forged hash that does not match the content is detected

### verdicts are derived from assertions, not declared

- ✓ a passing experiment passes
- ✓ a false assertion fails the experiment
- ✓ a thrown error fails the experiment and is recorded as a critical problem
- ✓ a step with no assertions fails and is flagged as proving nothing
- ✓ an explicit skip yields PARTIAL, not PASS
- ✓ a missing capability yields SKIP with the reason recorded
- ✓ a failed critical step skips the later steps
- ✓ a step marked always runs even after a critical failure (teardown must not be skipped)
- ✓ a result that changes between attempts is reported as FLAKY
- ✓ an experiment that throws outside any step fails and is recorded as critical
- ✓ the independent audit agrees with every verdict the runner declared
- ✓ the audit re-derives the same verdict for every experiment
- ✓ the nested run itself verifies as intact
- ✓ the nested run wrote a report and an index entry

### canonical encoding is order independent

- ✓ key order does not change the encoding
- ✓ array order does
- ✓ bigint values are encoded without throwing

## E-SUITE-OFFLINE: Existing verification suites, offline and keyless

**Hypothesis.** Every deterministic check in the repository passes with recorded fixtures, no network and no API keys, which is how a judge's machine will run them.

**What this does not prove**
- Offline mode replays recorded fixtures for attestation, the 1Click registry and the testnet ledger. It shows the logic is sound against recorded data, not that the live services still behave the same.
- Facilities (RFQ, OTC, FAR shard, compute syndicate) are in-memory simulations; passing here means the simulation is internally consistent.

| Step | Result | Assertions | Time |
|---|---|---|---|
| 01 hardware attestation (recorded fixture) | ✓ pass | 2/2 | 432 ms |
| 02 confidential intents (1Click registry) | ✓ pass | 2/2 | 33 ms |
| 03 hatch protocol and escape hatch (JS model) | ✓ pass | 2/2 | 96 ms |
| 04 dark vault, pods, FAR shard simulation | ✓ pass | 14/14 | 46 ms |
| 05 confidential RFQ and private adjudication | ✓ pass | 7/7 | 48 ms |
| 06 OTC block trades and compute syndicate | ✓ pass | 12/12 | 623 ms |
| 07 five-layer resilience failure matrix | ✓ pass | 13/13 | 38 ms |
| 08 HTTP API, SSE, x402 and MCP end to end | ✓ pass | 25/25 | 634 ms |
| 09 model-sealed Roost against a mock gateway | ✓ pass | 55/55 | 1084 ms |
| 10 hosted Roost with a fake attestation provider | ✓ pass | 66/66 | 530 ms |

### 01 hardware attestation (recorded fixture)

- note: running verifications/01-hardware-attestation.js with recorded fixtures (no network, no keys)
- ✓ the script's own verdict banner says PASS: HAQ VERIFIED [RECORDED FIXTURE]: Intel TDX Quote v4 Cryptographically Verified to Intel Root CA.
- observed **data source the script reported**: `recorded fixture (not live)`
- observed **detail lines the script reported**: `["Intel TDX Quote: PARSED v4 (TEE Type: 0x81 TDX, Length: 5006 bytes)","MRTD Measurement: 7fe60787222bd394... (Parsed)","Gateway Signer Key:…`
- ✓ verifications/01-hardware-attestation.js exited with code 0
- observed **checks parsed from the output**: `0`
- observed **duration (ms)**: `432`
- observed **full output**: `
======================================================
 [VERIFICATION 1] LIVE TEE HARDWARE ATTESTATION (HAQ)
 Target: N` (full: blobs/71f10b9cbc1c0aff9323ff71fd63f5cbb29f6adc335868ea2f01320f732fa034, sha256 71f10b9cbc1c…)

### 02 confidential intents (1Click registry)

- note: running verifications/02-confidential-intents.js with recorded fixtures (no network, no keys)
- ✓ the script's own verdict banner says PASS: CONFIDENTIAL INTENTS VERIFIED [RECORDED FIXTURE]: 210 assets audited & schemas match.
- observed **data source the script reported**: `recorded fixture (not live)`
- observed **detail lines the script reported**: `["wNEAR: Price $3.96 | Decimals: 24 | AssetId: nep141:wrap.near","USDC: Price $0.99956 | Decimals: 6 | AssetId: nep141:17208628f84f5...","ET…`
- ✓ verifications/02-confidential-intents.js exited with code 0
- observed **checks parsed from the output**: `0`
- observed **duration (ms)**: `32`
- observed **full output**: `
======================================================
 [VERIFICATION 2] CONFIDENTIAL INTENTS & LIQUIDITY
 Target: 1Cli` (full: blobs/08e479580940cf1dee9b049c35246ae075071050bc83267cd82893603fde2c87, sha256 08e479580940…)

### 03 hatch protocol and escape hatch (JS model)

- note: running verifications/03-hatch-escape-hatch.js with recorded fixtures (no network, no keys)
- ✓ the script's own verdict banner says PASS: HATCH & ESCAPE HATCH VERIFIED [RECORDED FIXTURE]: Safety invariants hold.
- observed **data source the script reported**: `recorded fixture (not live)`
- observed **detail lines the script reported**: `["Hatched Sub-Account: dark-swarm-alpha.fly-coordinator.testnet","Nonce: 42e06945f568cfe3...","OutLayer Max Spend: 100 USDC","Enclave Ed2551…`
- ✓ verifications/03-hatch-escape-hatch.js exited with code 0
- observed **checks parsed from the output**: `0`
- observed **duration (ms)**: `95`
- observed **full output**: `
======================================================
 [VERIFICATION 3] HATCH PROTOCOL & ESCAPE HATCH (FMEA)
 Target: ` (full: blobs/f7eb89547241a258c16a7e00c388ce3441312a917e8d5462cc9722e6c6b5036c, sha256 f7eb89547241…)

### 04 dark vault, pods, FAR shard simulation

- note: running verifications/04-dark-vault-epochs.js with recorded fixtures (no network, no keys)
- ✓ Hatched Type:        DARK_VAULT (Epoch: 1)
- ✓ Sub-Account:         institutional-dark-vault.fly-coordinator.testnet
- ✓ EVM (Ethereum):      0xff8c3d0757a15f0958393b17a2b93927603e17ad
- ✓ Bitcoin (Taproot):   tb1p40a3xxnjmgljwzlyx6wllrpaqat6zhcftqunk9azhyujwcp7z7ksu3z4qe
- ✓ Solana (Ed25519):    CaLmYWGvnkjfRFx3JEyuj4n9UzXumnNNvH5K3GAA869a
- ✓ Pod Created:         quant-arb-pod-01 (Members: 2)
- ✓ HTTP 402 Issued:     inv_db9551843d52b84ce7f1068f (2.5 USDC)
- ✓ Payment Settled:     rcpt_314211978e2b9cfcb7898d79 via PINGPAY_CONFIDENTIAL_MICROPAYMENT
- ✓ IMT Minted on FAR:   1000 imt:nep141:wrap.near (PBFT_200MS)
- ✓ Epoch 1 Settled:     DARK_VAULT_EPOCH_2 (New Nonce: 881f439e877bd13d...)
- ✓ Vault Remains:       ACTIVE (Now in Epoch 2)
- ✓ Clean Withdrawal:    with_a35760c467f94dd723a452c5f599c396 (DEPOSITOR_GRAPH_BROKEN)
- ✓ the script's own verdict banner says PASS: DARK VAULT, PODS & MULTICHAIN MPC VERIFIED (Simulated Environment).
- observed **data source the script reported**: `in-process`
- ✓ verifications/04-dark-vault-epochs.js exited with code 0
- observed **checks parsed from the output**: `12`
- observed **duration (ms)**: `46`
- observed **full output**: `
======================================================
 [VERIFICATION 4] DARK VAULT, PODS, FAR SHARD & MPC
 Target: Mul` (full: blobs/d2c535010f3c40a36b465b74808b2e921b9204096b3355b2bbe0c6f573597de3, sha256 d2c535010f3c…)

### 05 confidential RFQ and private adjudication

- note: running verifications/05-confidential-rfq-adjudication.js with recorded fixtures (no network, no keys)
- ✓ RFQ Created in Roost: rfq_623820394556ea18024138ec (Status: OPEN_IN_ROOST)
- ✓ 3 Sealed Quotes Ingested into Enclave Memory.
- ✓ Matched Lender:      galaxy-prime.near (Lowest APR: 4.8%)
- ✓ Bound Principal:     10,000,000 USDC vs 5000 ETH
- ✓ Loan Status:         ACTIVE_SHIELDED
- ✓ the script's own verdict banner says PASS: CONFIDENTIAL RFQ & PRIVATE ADJUDICATION VERIFIED (Simulated Facility).
- observed **data source the script reported**: `in-process`
- ✓ verifications/05-confidential-rfq-adjudication.js exited with code 0
- observed **checks parsed from the output**: `5`
- observed **duration (ms)**: `48`
- observed **full output**: `
======================================================
 [VERIFICATION 5] CONFIDENTIAL RFQ & PRIVATE ADJUDICATION
 Targe` (full: blobs/a8d4ff39f8a4cd5f76fa465c85dd46cd51f30a0ef06e819f5a67a97eb3046856, sha256 a8d4ff39f8a4…)

### 06 OTC block trades and compute syndicate

- note: running verifications/06-otc-and-compute-facilities.js with recorded fixtures (no network, no keys)
- ✓ Sealed Orders Ingested: 1 BUY (otc_7040ee09dddf6e1b1bd03533), 1 SELL (otc_cf4e0f7dc10ae0522a2f0218)
- ✓ Matched Volume:    50,000 wNEAR for 200,000 USDC
- ✓ Clearing Price:    $4.00
- ✓ Settlement Shard:  FAR_PRIVATE_SHARD_01
- ✓ MEV Protection:    ZERO_SLIPPAGE_ZERO_FRONT_RUNNING
- ✓ Pooled Compute Pool: 15 NEAR across 3 agents
- ✓ Attestation Quote:   quote present, NOT verified here
- ✓ Model Signer:        0xfdbd7952498b333206f360d71d97a1e0961e8ddf
- ✓ Privacy Protection:  undefined
- ✓ Result Digest:       f57ca95bd5b84283d46c2e54...
- ✓ the script's own verdict banner says PASS: OTC BLOCK TRADES & COMPUTE SYNDICATE VERIFIED (Simulated Facility).
- observed **data source the script reported**: `in-process`
- ✓ verifications/06-otc-and-compute-facilities.js exited with code 0
- observed **checks parsed from the output**: `10`
- observed **duration (ms)**: `623`
- observed **full output**: `======================================================
 [VERIFICATION 6] OTC BLOCK TRADES & COMPUTE SYNDICATE
 Target: C` (full: blobs/20655a5d5b6ecd258b29bee56a166dfe86245ae26906a2dc298e6cec90b2e8d7, sha256 20655a5d5b6e…)

### 07 five-layer resilience failure matrix

- note: running verifications/07-resilience-failure-matrix.js with recorded fixtures (no network, no keys)
- ✓ Remedy:    ON_CHAIN_TIMELOCK_ESCAPE_HATCH (REFUNDED_100_PERCENT)
- ✓ Outcome:   80 USDC refunded 100% to flyer-l1
- ✓ Scenario A (Quorum Met):   QUORUM_MAINTAINED_REWEIGHTED
- ✓ Scenario B (Quorum Broken): QUORUM_BROKEN_ROUND_ABORTED
- ✓ Execution Status:  TRADE_REVERTED_SLIPPAGE_BREACH
- ✓ Protection:        ATOMIC_REVERSION_IMT_UNWIND
- ✓ IMT Restored:      1000 IMT tokens safe on FAR Private Shard
- ✓ Attempt 2:         RETRY_QUEUED_ATTEMPT_2 (Idempotent replay)
- ✓ Attempt 4:         TARGET_CHAIN_ABORTED_FALLBACK_ACTIVE
- ✓ Policy Verdict:    TRANSACTION_BLOCKED_AT_BOUNDARY
- ✓ Guard Boundary:    Blocked at sub-account layer before touching on-chain state.
- ✓ the script's own verdict banner says PASS: 5-LAYER RESILIENCE FAILURE MATRIX VERIFIED.
- observed **data source the script reported**: `in-process`
- ✓ verifications/07-resilience-failure-matrix.js exited with code 0
- observed **checks parsed from the output**: `11`
- observed **duration (ms)**: `37`
- observed **full output**: `======================================================
 [VERIFICATION 7] 5-LAYER RESILIENCE FAILURE MATRIX
 Target: Dete` (full: blobs/4f03e50f6ddab3113bee30268beed93eb621de5a190b910ad8c5a8e1415af4f9, sha256 4f03e50f6dda…)

### 08 HTTP API, SSE, x402 and MCP end to end

- note: running verifications/08-api-sse-mcp-e2e.js with recorded fixtures (no network, no keys)
- ✓ Gateway daemon live on http://127.0.0.1:39991
- ✓ Hatched Syndicate: e2e-swarm-live (DARK_VAULT)
- ✓ Deposited Escrow:   75 NEAR (Flyer: agent-alpha.near)
- ✓ SSE Stream State:   ACTIVE (Streaming)
- ✓ Roost Public Key:   Retrieved RSA-2048 (Model: Qwen/Qwen3.6-35B-A3B-FP8)
- ✓ Sealed Ingestion:   ENCRYPTED_IN_ENCLAVE_RAM (344 bytes encrypted)
- ✓ Confidential RFQ:   Matched at 4.9% APR | Health: HEALTHY
- ✓ OTC Block Cross:    10000 wNEAR for 40000 USDC ($4.00/NEAR)
- ✓ Step A (No Auth):   HTTP 402 Payment Required
- ✓ Step B (Settled):   rcpt_5e389501e015037a42568e48 (PINGPAY_CONFIDENTIAL_MICROPAYMENT)
- ✓ Security Check:     Unsigned receipt rejected (HTTP 402, HMAC proof required)
- ✓ Step C (With Auth): HTTP 200 OK
- ✓ MCP Tools Listed:   10 Tools Available for LLM Agents
- ✓ MCP Tool Executed:  midge_hatch_syndicate -> mcp-agent-syndicate (mcp-agent-syndicate.fly-coordinator.testnet) [Mode: model]
- ✓ MCP Tool Executed:  midge_deposit -> 0.05 NEAR deposited [Mode: model]
- ✓ MCP Tool Executed:  midge_settle -> SETTLED_MODEL [Mode: model]
- ✓ MCP Tool Executed:  midge_list_syndicates -> 1 syndicates discovered [Mode: model]
- ✓ MCP Tool Executed:  midge_get_my_syndicates -> 1 member syndicates found [Mode: model]
- ✓ Chain MCP Executed: midge_list_syndicates -> 3 on-chain syndicates [Mode: chain]
- ✓ Public Route Check: /health returns HTTP 200 without API key
- ✓ API Key Enforcement: Protected route returns HTTP 401 Unauthorized
- ✓ Auth Verification:  Protected route returns HTTP 200 with X-Midge-Api-Key
- ✓ Body Limit Guard:   Payload >512KB rejected with HTTP 413
- ✓ the script's own verdict banner says PASS: HTTP DAEMON, SSE, x402 & MCP SERVER VERIFIED (Integrated Gateway).
- observed **data source the script reported**: `in-process`
- ✓ verifications/08-api-sse-mcp-e2e.js exited with code 0
- observed **checks parsed from the output**: `23`
- observed **duration (ms)**: `634`
- observed **full output**: `======================================================
 [VERIFICATION 8] HTTP DAEMON, SSE, x402 & MCP SERVER
 Target: Co` (full: blobs/4fcbbd4d38c719cb2a89a2dd95adb360e13acf46c826cbeaf667766b4e86b05b, sha256 4fcbbd4d38c7…)

### 09 model-sealed Roost against a mock gateway

- note: running verifications/09-model-sealed-roost.js with recorded fixtures (no network, no keys)
- ✓ accepts a model attestation whose quote binds our nonce and the model key (7 checks)
- ✓ keeps the attested model public key
- ✓ rejects: nonce missing from the quote
- ✓ rejects: model key missing from the quote
- ✓ rejects: quote with the wrong version
- ✓ rejects: attestation for a different model
- ✓ rejects: report with no candidates
- ✓ three sealed bids aggregate to the exact total
- ✓ every run agrees (3/3)
- ✓ every response signature verifies against the attested key
- ✓ queue is cleared after a successful round
- ✓ the coordinator never held a bid in the clear (marker absent from state and from every request on the wire)
- ✓ model-sealed round reports its limits honestly
- ✓ rejects: runs that disagree
- ✓ ...and keeps the ciphertext for a retry (runs that disagree)
- ✓ rejects: a count that does not match the bids submitted
- ✓ ...and keeps the ciphertext for a retry (a count that does not match the bids submitted)
- ✓ rejects: a plaintext reply instead of an encrypted one
- ✓ ...and keeps the ciphertext for a retry (a plaintext reply instead of an encrypted one)
- ✓ rejects: a tampered encrypted reply
- ✓ ...and keeps the ciphertext for a retry (a tampered encrypted reply)
- ✓ rejects: a reply with an extra field (a leaked bid)
- ✓ ...and keeps the ciphertext for a retry (a reply with an extra field (a leaked bid))
- ✓ rejects: a reply with extra text around the JSON
- ✓ ...and keeps the ciphertext for a retry (a reply with extra text around the JSON)
- ✓ rejects: a signature that does not verify
- ✓ ...and keeps the ciphertext for a retry (a signature that does not verify)
- ✓ rejects: a signature from a key that is not the attested model key
- ✓ ...and keeps the ciphertext for a retry (a signature from a key that is not the attested model key)
- ✓ rejects when the model key changed since bids were sealed
- ✓ reset() drops stale ciphertext
- ✓ rejects non-hex ciphertext
- ✓ rejects ciphertext that is too short
- ✓ rejects ciphertext that is too long
- ✓ rejects a second bid from the same flyer
- ✓ rejects aggregating an empty round
- ✓ rejects bids beyond the round capacity
- ✓ a bid sealed to a different key cannot be used (gateway cannot decrypt it)
- ✓ 50 sealed bids aggregate to the exact total
- ✓ factory builds the local simulation when asked for it by name
- ✓ factory builds the model-sealed backend
- ✓ factory rejects an unknown backend
- ✓ local backend states plainly that it hides nothing
- ✓ default is model-sealed when a NEAR AI key is configured
- ✓ default falls back to the local simulation only without a key, and says it fell back
- ✓ asking for the local simulation by name is not a fallback
- ✓ a key in the environment selects model-sealed
- ✓ a member verifies the attestation without an API key
- ✓ bids sealed by members after their own verification aggregate correctly
- ✓ a member refuses a key the coordinator asserts but the attestation does not support
- ✓ a member refuses when the attestation does not verify
- ✓ a member refuses to treat a local-simulation session as sealed
- ✓ API key is not reachable through JSON
- ✓ the script's own verdict banner says PASS: MODEL-SEALED ROOST: 53 checks passed against a mock gateway (live behaviour: npm run verify:roost-model).
- observed **data source the script reported**: `in-process`
- ✓ verifications/09-model-sealed-roost.js exited with code 0
- observed **checks parsed from the output**: `53`
- observed **duration (ms)**: `1084`
- observed **full output**: `
======================================================
 [VERIFICATION 10] MODEL-SEALED ROOST (E2EE TO NEAR AI MODEL TEE` (full: blobs/fa25978528cf45018d1df0c6dbdd9c0d93742575b0049db7ea33c12abde101d7, sha256 fa25978528cf…)

### 10 hosted Roost with a fake attestation provider

- note: running verifications/10-hosted-roost.js with recorded fixtures (no network, no keys)
- ✓ settlement and intent keys are distinct 32-byte keys
- ✓ two Roost instances never share keys
- ✓ report data is sha512(domain, settle key, intent key, nonce)
- ✓ the provider was asked to attest exactly that report data
- ✓ a different nonce gives different report data
- ✓ swapping a key changes the report data
- ✓ a malformed nonce is refused
- ✓ a real-mode Roost reports its inputs as hidden only conditionally
- ✓ a simulator-backed Roost never claims hidden inputs
- ✓ 0.1 + 0.2 + 0.3 is exactly 0.6 (no floating point error)
- ✓ the queue is cleared after a round
- ✓ 50 bids sum exactly
- ✓ the largest and smallest representable amounts are exact
- ✓ toMicro and formatMicro round-trip
- ✓ the coordinator-side state never holds a bid in the clear
- ✓ valid bids are summed and invalid ones excluded
- ✓ excluded flyers are named, their content is never exposed
- ✓ a round with no valid bid is refused
- ✓ input validation: duplicate flyer, capacity, non-hex, too short, too long
- ✓ rejects allocations above what the sealed bids support
- ✓ rejects an orderHash from a different round
- ✓ rejects duplicate recipients, bad amounts, empty and oversized lists
- ✓ rejects separators that could forge the signed message
- ✓ signs the contract message format and the signature verifies
- ✓ the signature does not verify under another key or for another message
- ✓ an aggregate can be signed only once
- ✓ signing without any aggregate is refused
- ✓ the allocations hash ignores order and sorts recipients byte-wise
- ✓ members can read the session and the attestation without credentials
- ✓ the server itself refuses aggregate and settle without the coordinator key
- ✓ a member client cannot even attempt coordinator calls
- ✓ a wrong coordinator key is refused
- ✓ the coordinator gets the exact aggregate over HTTP
- ✓ the coordinator gets a verifying settlement signature over HTTP
- ✓ no response contains a bid in the clear
- ✓ oversized bodies are refused
- ✓ unknown routes and debug routes do not exist
- ✓ a server cannot be built without a coordinator key
- ✓ a correct attestation passes every check (12 checks)
- ✓ the caller supplies the nonce: a replayed bundle for another nonce fails
- ✓ a verifier that rejects the quote fails the run
- ✓ a quote that does not verify fails
- ✓ an event log that does not replay fails
- ✓ report data that is not ours fails
- ✓ a different compose hash (modified build) fails
- ✓ an unpinned OS image fails
- ✓ a development OS image fails
- ✓ an out-of-date TCB fails by default and passes only when explicitly accepted
- ✓ a non-TDX platform fails
- ✓ swapping the settlement key in the bundle fails
- ✓ an unreachable verifier fails closed
- ✓ a malformed bundle fails closed
- ✓ hash ignores key order, respects array order, and maps NaN to null
- ✓ derives the hash from an app-compose string and it equals sha256 of that exact string
- ✓ derives the hash from an app-compose object as well
- ✓ detects a provider that changed our compose text
- ✓ detects a different image digest in the compose
- ✓ says so when the response holds no app-compose
- ✓ KNOWN ANSWER from real hardware: the derived hash equals the hash a real Phala TDX VM attested (8a0180ff698c44b5)
- ✓ KNOWN ANSWER: hashing the null fields as Phala reports them would NOT reproduce it (nulls mean absent)
- ✓ the verifier accepts when the attested hash is among the derived candidates
- ✓ the verifier rejects when the attested hash is not among them
- ✓ the verifier rejects an empty or malformed pin list
- ✓ serialising the Roost exposes only public keys
- ✓ the script's own verdict banner says PASS: HOSTED ROOST: 64 checks passed with a fake attestation provider (hardware evidence: real CVM run + dstack veri
- observed **data source the script reported**: `in-process`
- ✓ verifications/10-hosted-roost.js exited with code 0
- observed **checks parsed from the output**: `64`
- observed **duration (ms)**: `530`
- observed **full output**: `
======================================================
 [VERIFICATION 11] HOSTED ROOST (EXACT SUMS, ATTESTED KEYS, BOUN` (full: blobs/d1a4eefaaf45d7a4f5e533c1cc252c8f02a4bb01233bef73a94df3beb3a7c53a, sha256 d1a4eefaaf45…)

## E-CHECK-FOUNDRY: Claims, gaps and commits are consistent with the repository

**Hypothesis.** Every claim and gap recorded in foundry/ points to files that exist and commits that are ancestors of HEAD, so the ledger cannot drift from the code.

**What this does not prove**
- It checks that records are consistent with the repository, not that a claim is true.

| Step | Result | Assertions | Time |
|---|---|---|---|
| foundry control-plane audit | ✓ pass | 6/6 | 120 ms |

### foundry control-plane audit

- ✓ Checked state.json: Project 'midge', Status 'TESTED'
- ✓ Checked claims.jsonl: 15 claims audited and validated against evidence.
- ✓ Checked gaps.jsonl: 19 gaps recorded (0 critical open).
- ✓ Checked phases directory: 8 phase specifications found.
- ✓ ALL FOUNDRY CONTROL PLANE INVARIANTS SATISFIED (0 VIOLATIONS)
- ✓ check-foundry exited with code 0
- observed **checks parsed from the output**: `5`
- observed **duration (ms)**: `120`
- observed **full output**: `╔════════════════════════════════════════════════════════════════╗
║       BUILDER FOUNDRY CONTROL PLANE INTEGRITY AUDIT` (full: blobs/a852d29feac05d7c1712c5bb11089a58cc3f9521b2cb0d38bb699816130d4586, sha256 a852d29feac0…)

## E-RUST-CONTRACT: The NEAR contract passes its Rust tests, lints and formatting

**Hypothesis.** The coordinator contract compiles warning-free under clippy, is formatted, and passes all unit, integration and property tests.

**What this does not prove**
- Unit and property tests run against a mock environment; the contract has not been audited by a third party.
- The deployed code is checked separately by comparing its on-chain code hash with a local build.

| Step | Result | Assertions | Time |
|---|---|---|---|
| cargo clippy -D warnings | ✓ pass | 2/2 | 207 ms |
| cargo fmt --check | ✓ pass | 1/1 | 71 ms |
| cargo test | ✓ pass | 3/3 | 10856 ms |

### cargo clippy -D warnings

- ✓ cargo clippy exited with code 0
- observed **checks parsed from the output**: `0`
- observed **duration (ms)**: `206`
- observed **full output**: ``
- ✓ clippy printed no warnings

### cargo fmt --check

- ✓ cargo fmt --check exited with code 0
- observed **checks parsed from the output**: `0`
- observed **duration (ms)**: `71`
- observed **full output**: ``

### cargo test

- ✓ cargo test exited with code 0
- observed **checks parsed from the output**: `0`
- observed **duration (ms)**: `10855`
- observed **full output**: `    Finished `test` profile [unoptimized + debuginfo] target(s) in 0.16s
     Running unittests src/lib.rs (target/debug` (full: blobs/7e6b0ca5fa8f24ab2fcd7c90033f753fa5329e2d8e2ab88de985e5556d392c7a, sha256 7e6b0ca5fa8f…)
- ✓ no Rust test failed
- ✓ the expected number of Rust tests ran (47: 37 unit, 6 integration, 4 invariant)

## E-IFACE-MODEL: Every HTTP route, SSE stream, SDK method and MCP tool is exercised, and the interfaces tell the truth

**Hypothesis.** Every route the API declares, every method the SDK exposes and every MCP tool is exercised at least once against a local daemon in model mode, and none of them reports success for something it did not do. The failure that must NOT happen: a tool that answers "valid", "sealed" or "matched" without having verified, sealed or matched anything, or a single request that takes the server down.

**What this does not prove**
- Model mode and a local Roost: this checks the interfaces' behaviour and honesty, not the chain. The chain paths are E-IFACE-CHAIN.
- The compute facility's network call is replaced by a recorded fixture; the code path from the route to the facility is real, the attestation is not.
- Coverage means "called with at least one valid and one invalid input and the result asserted", not exhaustive input testing.
- Model mode and the stub-client checks cannot prove the chain paths; E-IFACE-CHAIN does. Anything still open is recorded as a problem in the report.

| Step | Result | Assertions | Time |
|---|---|---|---|
| derive the interface surface from source | ✓ pass | 5/5 | 1 ms |
| start the API daemon in model mode with a local Roost | ✓ pass | 2/2 | 10 ms |
| SDK: syndicate lifecycle (hatch, get, list, by member, deposit, settle, hatch-out) | ✓ pass | 11/11 | 3227 ms |
| API: input validation and error behaviour | ✓ pass | 8/8 | 12 ms |
| SDK: Roost (session key, attestation, sealing, aggregation) | ✓ pass | 7/7 | 592 ms |
| SDK: facilities (RFQ, OTC, compute) and commerce (x402) | ✓ pass | 15/15 | 35 ms |
| SDK: MPC, emergency hatch-out and the routes the SDK has no method for | ✓ pass | 8/8 | 11 ms |
| SSE: both streams deliver events as they happen | ✓ pass | 8/8 | 412 ms |
| SDK: both SSE streams as async iterators | ✓ pass | 5/5 | 222 ms |
| SDK sealBid and the Roost API with a model-sealed Roost (mock NEAR AI gateway, no key needed) | ✓ pass | 6/6 | 110 ms |
| security controls: API key, CORS, public health | ✓ pass | 8/8 | 10 ms |
| chain mode (stub client, no network): each response says what served it, and a write without keys is refused | ✓ pass | 8/8 | 51 ms |
| one request must not take the server down (found by this experiment) | ✓ pass | 1/1 | 705 ms |
| KNOWN GAPs in the model-mode API (pinned: asserting today's behaviour so a fix turns this red) | ✓ pass | 17/17 | 108 ms |
| stop the daemon | ✓ pass | 1/1 | 0 ms |
| chain client: argument shapes and signing parity with the contract (no network) | ✓ pass | 11/11 | 53 ms |
| MCP (in process): every tool, and the four that used to claim success without doing anything | ✓ pass | 23/23 | 3289 ms |
| MCP (stdio JSON-RPC): initialize, list, call, errors | ✓ pass | 7/7 | 179 ms |
| coverage: what the declared surface offers versus what was exercised | ✓ pass | 5/5 | 1 ms |

### derive the interface surface from source

- observed **http routes**: `["GET /health","GET /v1/health","GET /v1/stream/syndicate/*","GET /v1/stream/facilities/rfq/*","POST /v1/syndicates/hatch","GET /v1/syndicat…`
- observed **sdk methods**: `["health","streamSyndicate","streamRfqLoan","hatchSyndicate","getSyndicate","listSyndicates","getSyndicatesByMember","deposit","settleBatch"…`
- observed **mcp tools**: `["midge_hatch_syndicate","midge_deposit","midge_settle","midge_hatch_out","midge_list_syndicates","midge_get_my_syndicates","midge_submit_se…`
- ✓ the extractor finds 32 routes (a different number means the source changed: review the new routes)
- ✓ the SDK exposes 32 methods
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
- ✓ an emergency hatch-out claiming an early block is locked
- ✓ sdk.health() reports OK and the coordinator contract
- ✓ /health is the same as /v1/health
- ✓ sdk.getTimelock reports the creation block, the timeout, the model's current block and the blocks remaining
- ✓ sdk.createPod and sdk.listPods: a pod can be created and listed
- ✓ the pods response is an object that says it is the model (it used to be a bare array with no label)

### SSE: both streams deliver events as they happen

- ✓ /v1/stream/syndicate/sse-mw279ups: content type is text/event-stream
- ✓ the syndicate stream sends "connected" first
- ✓ a deposit appears on the stream as deposit_received
- ✓ a sealed intent appears as sealed_intent_received with a count and no amount
- ✓ /v1/stream/syndicate/someone-else-mw279ups: content type is text/event-stream
- ✓ a stream for a different syndicate does not receive these events
- ✓ /v1/stream/facilities/rfq/loan_62f5c7e15994bf2747ec732f: content type is text/event-stream
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

- ✓ list is served by the chain
- ✓ get-by-id is served by the chain, in the API shape, with the exact escrow in yocto
- ✓ an unknown id is a 404, not an answer from the model
- ✓ the timelock is read from the chain: 50 blocks from 100, now 130, so 20 remain
- ✓ hatch without write access is refused with HTTP 409 and instructions (it used to be answered from the model)
- ✓ so are deposit, settle, hatch-out and the emergency exit
- ✓ facilities are labelled model even in chain mode (they never touch the chain)
- ✓ the Roost is labelled off-chain, not chain and not model

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
- ✓ hatch without an enclave key is refused before anything is sent
- ✓ hatch with an all-zero enclave key is refused (nobody could ever settle it)
- ✓ settleBatch without a string nonce is refused (the old numeric default 1 could never match)
- ✓ settleBatch without a 64-byte signature is refused

### MCP (in process): every tool, and the four that used to claim success without doing anything

- ✓ tools/list returns the ten tools
- ✓ hatch creates a real model-mode syndicate
- ✓ deposit lands in the model syndicate
- ✓ midge_deposit into an unknown syndicate is an error
- ✓ list includes it
- ✓ get_my_syndicates returns the one the account is in
- ✓ get_my_syndicates invents nothing for an account in no syndicate
- observed **midge_settle in model mode**: `{"mode":"model","notice":"[MODEL MODE, no chain]","status":"SETTLED_MODEL","syndicateId":"mcp-mw279ups","allocations":[["recipient.near","0.…`
- ✓ midge_hatch_out before the timelock is locked, not refunded (it used to pass block 999999)
- ✓ and succeeds once the model's own clock has passed the timeout
- ✓ verify_haq_attestation never says VALID for a nonce it did not verify against a quote
- ✓ with a local simulation Roost it says NOT_VERIFIED and why
- ✓ submit_sealed_intent refuses a plaintext amount
- ✓ submit_sealed_intent forwards ciphertext to the Roost and reports its count
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
- ✓ tools/list over stdio returns the ten tools
- ✓ a tool call over stdio returns text content that parses as JSON
- ✓ over stdio, verify_haq_attestation does not say VALID for a bogus nonce either
- ✓ an unknown tool is a JSON-RPC error -32000
- ✓ an unknown method is -32601
- ✓ over stdio in model mode, a hatch is not an unlabelled mock ("HATCHED_MOCK")

### coverage: what the declared surface offers versus what was exercised

- observed **coverage**: `{"routes":"32/32","sdk":"32/32","mcp":"10/10","requestsToRoutes":98}`
- ✓ every declared HTTP route was exercised
- ✓ every SDK method was called
- ✓ every MCP tool was called
- observed **HTTP routes with no SDK method**: `[]`
- ✓ every HTTP route is reachable from an SDK method (health, both SSE streams, pods and the timelock had none)
- ✓ every request the experiment sent was attributed to a declared route or the 404 probe

## Problems found

| Severity | Where | Problem |
|---|---|---|
| minor | E-SUITE-OFFLINE / 01 hardware attestation (recorded fixture) | verifications/01-hardware-attestation.js does not report its checks individually: its own verdict banner and exit code are the only evidence, so a reader cannot see which invariants were checked without reading the source |
| minor | E-SUITE-OFFLINE / 02 confidential intents (1Click registry) | verifications/02-confidential-intents.js does not report its checks individually: its own verdict banner and exit code are the only evidence, so a reader cannot see which invariants were checked without reading the source |
| minor | E-SUITE-OFFLINE / 03 hatch protocol and escape hatch (JS model) | verifications/03-hatch-escape-hatch.js does not report its checks individually: its own verdict banner and exit code are the only evidence, so a reader cannot see which invariants were checked without reading the source |
| minor | E-RUST-CONTRACT / cargo clippy -D warnings | cargo clippy does not report its checks individually: its own verdict banner and exit code are the only evidence, so a reader cannot see which invariants were checked without reading the source |
| minor | E-RUST-CONTRACT / cargo fmt --check | cargo fmt --check does not report its checks individually: its own verdict banner and exit code are the only evidence, so a reader cannot see which invariants were checked without reading the source |
| minor | E-RUST-CONTRACT / cargo test | cargo test does not report its checks individually: its own verdict banner and exit code are the only evidence, so a reader cannot see which invariants were checked without reading the source |
