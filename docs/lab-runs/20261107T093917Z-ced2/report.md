# Lab run 20261107T093917Z-ced2

- **Code:** `65c3229d2af7743841ae8a43c7b6fbc176959d51` on `master` (**5 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `8a0180ff698c44b5…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 771 events, hash-chained; root `62f8474d548ecaf4656b8884387a9e551421895c78314611427302d1ceb4abfa`. Verify with `node lab/verify-run.js lab/runs/20261107T093917Z-ced2`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-LAB-01 The lab records honestly and detects tampering | offline | **PASS** | 7 | 36 |  |
| E-SUITE-OFFLINE Existing verification suites, offline and keyless | offline | **PASS** | 10 | 198 |  |
| E-CHECK-FOUNDRY Claims, gaps and commits are consistent with the repository | offline | **PASS** | 1 | 6 |  |
| E-RUST-CONTRACT The NEAR contract passes its Rust tests, lints and formatting | offline | **PASS** | 3 | 6 |  |
| E-IFACE-MODEL Every HTTP route, SSE stream, SDK method and MCP tool is exercised, and the interfaces tell the truth | offline | **PASS** | 20 | 168 |  |
| E-ADVISOR-MODEL The attested advisor: honest answers verify, wrong answers are caught, and tampering with the record is detected | offline | **PASS** | 5 | 51 |  |
| E-AUCTION-PROGRAMS-01 Sealed-bid auction rules the Roost can run: first-price, second-price (Vickrey) and uniform-price, and what the Roost will sign for them | offline | **PASS** | 4 | 23 |  |
| E-POOL-PROGRAM-01 The pooled room program: each member charged exactly their own sealed amount, and the Roost signs only that | offline | **PASS** | 2 | 13 |  |
| E-SIGNED-INPUT-01 Signed sealed inputs: a ballot or bid must be signed by a key that belongs to the account it names, for this round, once | offline | **PASS** | 4 | 19 |  |
| E-TWO-ROOM-01 Two Roosts, same inputs, same signed message: the Roost side of two-room agreement | offline | **PASS** | 6 | 22 |  |

## E-LAB-01: The lab records honestly and detects tampering

**Hypothesis.** A run log cannot be edited, trimmed or reordered without detection, secrets never reach the log, and an experiment's verdict is derived from its recorded assertions and cannot be declared.

**What this does not prove**
- The hash chain proves the log is unchanged since it was written. It does not prove the events were produced honestly, which is why experiments attach checkable evidence (transaction hashes, attestation digests, file digests).
- An attacker who rewrites the whole log and its summary consistently would pass the chain check; anchoring the root hash somewhere public (a testnet transaction) closes that gap and is a separate step.

| Step | Result | Assertions | Time |
|---|---|---|---|
| secrets are redacted before they are written or hashed | ✓ pass | 5/5 | 1 ms |
| events whose data has a field named hash (a transaction hash) still verify | ✓ pass | 4/4 | 1 ms |
| evidence containing a BigInt is recorded and verifies (it used to crash the run) | ✓ pass | 3/3 | 0 ms |
| an untouched log verifies as intact | ✓ pass | 2/2 | 1 ms |
| editing, deleting, reordering or truncating a log is detected | ✓ pass | 5/5 | 3 ms |
| verdicts are derived from assertions, not declared | ✓ pass | 14/14 | 341 ms |
| canonical encoding is order independent | ✓ pass | 3/3 | 1 ms |

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

### evidence containing a BigInt is recorded and verifies (it used to crash the run)

- ✓ writing an event with a BigInt does not throw
- ✓ the log still verifies
- ✓ the BigInt is stored as a string with an n suffix

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
| 01 hardware attestation (recorded fixture) | ✓ pass | 2/2 | 291 ms |
| 02 confidential intents (1Click registry) | ✓ pass | 2/2 | 36 ms |
| 03 hatch protocol and escape hatch (JS model) | ✓ pass | 2/2 | 89 ms |
| 04 dark vault, pods, FAR shard simulation | ✓ pass | 14/14 | 43 ms |
| 05 confidential RFQ and private adjudication | ✓ pass | 7/7 | 50 ms |
| 06 OTC block trades and compute syndicate | ✓ pass | 12/12 | 638 ms |
| 07 five-layer resilience failure matrix | ✓ pass | 13/13 | 37 ms |
| 08 HTTP API, SSE, x402 and MCP end to end | ✓ pass | 25/25 | 647 ms |
| 09 model-sealed Roost against a mock gateway | ✓ pass | 55/55 | 1062 ms |
| 10 hosted Roost with a fake attestation provider | ✓ pass | 66/66 | 521 ms |

### 01 hardware attestation (recorded fixture)

- note: running verifications/01-hardware-attestation.js with recorded fixtures (no network, no keys)
- ✓ the script's own verdict banner says PASS: HAQ VERIFIED [RECORDED FIXTURE]: Intel TDX Quote v4 Cryptographically Verified to Intel Root CA.
- observed **data source the script reported**: `recorded fixture (not live)`
- observed **detail lines the script reported**: `["Intel TDX Quote: PARSED v4 (TEE Type: 0x81 TDX, Length: 5006 bytes)","MRTD Measurement: 7fe60787222bd394... (Parsed)","Gateway Signer Key:…`
- ✓ verifications/01-hardware-attestation.js exited with code 0
- observed **checks parsed from the output**: `0`
- observed **duration (ms)**: `291`
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
- observed **duration (ms)**: `35`
- observed **full output**: `
======================================================
 [VERIFICATION 2] CONFIDENTIAL INTENTS & LIQUIDITY
 Target: 1Cli` (full: blobs/08e479580940cf1dee9b049c35246ae075071050bc83267cd82893603fde2c87, sha256 08e479580940…)

### 03 hatch protocol and escape hatch (JS model)

- note: running verifications/03-hatch-escape-hatch.js with recorded fixtures (no network, no keys)
- ✓ the script's own verdict banner says PASS: HATCH & ESCAPE HATCH VERIFIED [RECORDED FIXTURE]: Safety invariants hold.
- observed **data source the script reported**: `recorded fixture (not live)`
- observed **detail lines the script reported**: `["Hatched Sub-Account: dark-swarm-alpha.fly-coordinator.testnet","Nonce: 0d8c71caf72a17b1...","OutLayer Max Spend: 100 USDC","Enclave Ed2551…`
- ✓ verifications/03-hatch-escape-hatch.js exited with code 0
- observed **checks parsed from the output**: `0`
- observed **duration (ms)**: `89`
- observed **full output**: `
======================================================
 [VERIFICATION 3] HATCH PROTOCOL & ESCAPE HATCH (FMEA)
 Target: ` (full: blobs/036278674fe4c4f2980dd9f1f95d3f1f4e41821a7fea8d9667f80096cc78c25f, sha256 036278674fe4…)

### 04 dark vault, pods, FAR shard simulation

- note: running verifications/04-dark-vault-epochs.js with recorded fixtures (no network, no keys)
- ✓ Hatched Type:        DARK_VAULT (Epoch: 1)
- ✓ Sub-Account:         institutional-dark-vault.fly-coordinator.testnet
- ✓ EVM (Ethereum):      0xff8c3d0757a15f0958393b17a2b93927603e17ad
- ✓ Bitcoin (Taproot):   tb1p40a3xxnjmgljwzlyx6wllrpaqat6zhcftqunk9azhyujwcp7z7ksu3z4qe
- ✓ Solana (Ed25519):    CaLmYWGvnkjfRFx3JEyuj4n9UzXumnNNvH5K3GAA869a
- ✓ Pod Created:         quant-arb-pod-01 (Members: 2)
- ✓ HTTP 402 Issued:     inv_6ea555ac2955f06f2103257c (2.5 USDC)
- ✓ Payment Settled:     rcpt_84f90fc3b756a72c8df16a0c via PINGPAY_CONFIDENTIAL_MICROPAYMENT
- ✓ IMT Minted on FAR:   1000 imt:nep141:wrap.near (PBFT_200MS)
- ✓ Epoch 1 Settled:     DARK_VAULT_EPOCH_2 (New Nonce: 6411f8305377ec4d...)
- ✓ Vault Remains:       ACTIVE (Now in Epoch 2)
- ✓ Clean Withdrawal:    with_09a7bb37aed82e27b296408bd84dc1ea (DEPOSITOR_GRAPH_BROKEN)
- ✓ the script's own verdict banner says PASS: DARK VAULT, PODS & MULTICHAIN MPC VERIFIED (Simulated Environment).
- observed **data source the script reported**: `in-process`
- ✓ verifications/04-dark-vault-epochs.js exited with code 0
- observed **checks parsed from the output**: `12`
- observed **duration (ms)**: `43`
- observed **full output**: `
======================================================
 [VERIFICATION 4] DARK VAULT, PODS, FAR SHARD & MPC
 Target: Mul` (full: blobs/8029eb3d0f88334566e44ae652ca93f0f136f158f8bb2068f60549532fd1cfe7, sha256 8029eb3d0f88…)

### 05 confidential RFQ and private adjudication

- note: running verifications/05-confidential-rfq-adjudication.js with recorded fixtures (no network, no keys)
- ✓ RFQ Created in Roost: rfq_130644604c012e6488ae2def (Status: OPEN_IN_ROOST)
- ✓ 3 Sealed Quotes Ingested into Enclave Memory.
- ✓ Matched Lender:      galaxy-prime.near (Lowest APR: 4.8%)
- ✓ Bound Principal:     10,000,000 USDC vs 5000 ETH
- ✓ Loan Status:         ACTIVE_SHIELDED
- ✓ the script's own verdict banner says PASS: CONFIDENTIAL RFQ & PRIVATE ADJUDICATION VERIFIED (Simulated Facility).
- observed **data source the script reported**: `in-process`
- ✓ verifications/05-confidential-rfq-adjudication.js exited with code 0
- observed **checks parsed from the output**: `5`
- observed **duration (ms)**: `50`
- observed **full output**: `
======================================================
 [VERIFICATION 5] CONFIDENTIAL RFQ & PRIVATE ADJUDICATION
 Targe` (full: blobs/7bbbb530d4005fcb5cbab385ce2b99ce7f8a2dfa3c516fd9180af8649113062c, sha256 7bbbb530d400…)

### 06 OTC block trades and compute syndicate

- note: running verifications/06-otc-and-compute-facilities.js with recorded fixtures (no network, no keys)
- ✓ Sealed Orders Ingested: 1 BUY (otc_a9396d4625304ae90f469965), 1 SELL (otc_50096337999f332b6b7396ab)
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
- observed **duration (ms)**: `637`
- observed **full output**: `======================================================
 [VERIFICATION 6] OTC BLOCK TRADES & COMPUTE SYNDICATE
 Target: C` (full: blobs/0c1764601e80c4baad429977b0c9ad1b7a81b824067765ef507c532aceddc696, sha256 0c1764601e80…)

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
- ✓ Gateway daemon live on http://127.0.0.1:43191
- ✓ Hatched Syndicate: e2e-swarm-live (DARK_VAULT)
- ✓ Deposited Escrow:   75 NEAR (Flyer: agent-alpha.near)
- ✓ SSE Stream State:   ACTIVE (Streaming)
- ✓ Roost Public Key:   Retrieved RSA-2048 (Model: Qwen/Qwen3.6-35B-A3B-FP8)
- ✓ Sealed Ingestion:   ENCRYPTED_IN_ENCLAVE_RAM (344 bytes encrypted)
- ✓ Confidential RFQ:   Matched at 4.9% APR | Health: HEALTHY
- ✓ OTC Block Cross:    10000 wNEAR for 40000 USDC ($4.00/NEAR)
- ✓ Step A (No Auth):   HTTP 402 Payment Required
- ✓ Step B (Settled):   rcpt_168a4b5df679e80d58cc779d (PINGPAY_CONFIDENTIAL_MICROPAYMENT)
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
- observed **duration (ms)**: `646`
- observed **full output**: `======================================================
 [VERIFICATION 8] HTTP DAEMON, SSE, x402 & MCP SERVER
 Target: Co` (full: blobs/84cf4a160640ab23f3985202a75e8cc71d57ba3ed60893875875d08d2112354f, sha256 84cf4a160640…)

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
- observed **duration (ms)**: `1061`
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
- observed **duration (ms)**: `520`
- observed **full output**: `
======================================================
 [VERIFICATION 11] HOSTED ROOST (EXACT SUMS, ATTESTED KEYS, BOUN` (full: blobs/d1a4eefaaf45d7a4f5e533c1cc252c8f02a4bb01233bef73a94df3beb3a7c53a, sha256 d1a4eefaaf45…)

## E-CHECK-FOUNDRY: Claims, gaps and commits are consistent with the repository

**Hypothesis.** Every claim and gap recorded in foundry/ points to files that exist and commits that are ancestors of HEAD, so the ledger cannot drift from the code.

**What this does not prove**
- It checks that records are consistent with the repository, not that a claim is true.

| Step | Result | Assertions | Time |
|---|---|---|---|
| foundry control-plane audit | ✓ pass | 6/6 | 155 ms |

### foundry control-plane audit

- ✓ Checked state.json: Project 'midge', Status 'TESTED'
- ✓ Checked claims.jsonl: 15 claims audited and validated against evidence.
- ✓ Checked gaps.jsonl: 23 gaps recorded (0 critical open).
- ✓ Checked phases directory: 8 phase specifications found.
- ✓ ALL FOUNDRY CONTROL PLANE INVARIANTS SATISFIED (0 VIOLATIONS)
- ✓ check-foundry exited with code 0
- observed **checks parsed from the output**: `5`
- observed **duration (ms)**: `155`
- observed **full output**: `╔════════════════════════════════════════════════════════════════╗
║       BUILDER FOUNDRY CONTROL PLANE INTEGRITY AUDIT` (full: blobs/d744540c1b508e43e9d9cba8a0d1c5a21ab4a26abfdf89ea81ab0e7600ebc79f, sha256 d744540c1b50…)

## E-RUST-CONTRACT: The NEAR contract passes its Rust tests, lints and formatting

**Hypothesis.** The coordinator contract compiles warning-free under clippy, is formatted, and passes all unit, integration and property tests.

**What this does not prove**
- Unit and property tests run against a mock environment; the contract has not been audited by a third party.
- The deployed code is checked separately by comparing its on-chain code hash with a local build.

| Step | Result | Assertions | Time |
|---|---|---|---|
| cargo clippy -D warnings | ✓ pass | 2/2 | 479 ms |
| cargo fmt --check | ✓ pass | 1/1 | 86 ms |
| cargo test | ✓ pass | 3/3 | 14914 ms |

### cargo clippy -D warnings

- ✓ cargo clippy exited with code 0
- observed **checks parsed from the output**: `0`
- observed **duration (ms)**: `479`
- observed **full output**: ``
- ✓ clippy printed no warnings

### cargo fmt --check

- ✓ cargo fmt --check exited with code 0
- observed **checks parsed from the output**: `0`
- observed **duration (ms)**: `85`
- observed **full output**: ``

### cargo test

- ✓ cargo test exited with code 0
- observed **checks parsed from the output**: `0`
- observed **duration (ms)**: `14914`
- observed **full output**: `   Compiling fly-coordinator v0.1.0 (/home/ubuntu/near/contracts/fly-coordinator)
    Finished `test` profile [unoptimiz` (full: blobs/fd8cbf96160da1a2aed8e968128a40e8477d97cb171e51dfb2fd4052a12c82dd, sha256 fd8cbf96160d…)
- ✓ no Rust test failed
- ✓ the expected number of Rust tests ran (82: 71 unit, 6 integration, 5 invariant)

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
| start the API daemon in model mode with a local Roost | ✓ pass | 2/2 | 9 ms |
| SDK: syndicate lifecycle (hatch, get, list, by member, deposit, settle, hatch-out) | ✓ pass | 11/11 | 3223 ms |
| API: input validation and error behaviour | ✓ pass | 8/8 | 11 ms |
| SDK: Roost (session key, attestation, sealing, aggregation) | ✓ pass | 7/7 | 1057 ms |
| SDK: facilities (RFQ, OTC, compute) and commerce (x402) | ✓ pass | 15/15 | 25 ms |
| SDK: MPC, emergency hatch-out and the routes the SDK has no method for | ✓ pass | 8/8 | 11 ms |
| SSE: both streams deliver events as they happen | ✓ pass | 8/8 | 401 ms |
| SDK: both SSE streams as async iterators | ✓ pass | 5/5 | 218 ms |
| SDK sealBid and the Roost API with a model-sealed Roost (mock NEAR AI gateway, no key needed) | ✓ pass | 6/6 | 105 ms |
| pagination: total is the record count, order asc/desc, hasMore, and bad input is a 400 | ✓ pass | 8/8 | 30 ms |
| security controls: API key, CORS, public health | ✓ pass | 8/8 | 7 ms |
| chain mode (stub client, no network): each response says what served it, and a write without keys is refused | ✓ pass | 9/9 | 53 ms |
| one request must not take the server down (found by this experiment) | ✓ pass | 1/1 | 714 ms |
| KNOWN GAPs in the model-mode API (pinned: asserting today's behaviour so a fix turns this red) | ✓ pass | 17/17 | 163 ms |
| stop the daemon | ✓ pass | 1/1 | 1 ms |
| chain client: argument shapes and signing parity with the contract (no network) | ✓ pass | 14/14 | 70 ms |
| MCP (in process): every tool, and the four that used to claim success without doing anything | ✓ pass | 23/23 | 3272 ms |
| MCP (stdio JSON-RPC): initialize, list, call, errors | ✓ pass | 7/7 | 138 ms |
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

- ✓ /v1/stream/syndicate/sse-mw67p9de: content type is text/event-stream
- ✓ the syndicate stream sends "connected" first
- ✓ a deposit appears on the stream as deposit_received
- ✓ a sealed intent appears as sealed_intent_received with a count and no amount
- ✓ /v1/stream/syndicate/someone-else-mw67p9de: content type is text/event-stream
- ✓ a stream for a different syndicate does not receive these events
- ✓ /v1/stream/facilities/rfq/loan_aff586635bdacc8c948bb03d: content type is text/event-stream
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

- ✓ tools/list returns the ten tools
- ✓ hatch creates a real model-mode syndicate
- ✓ deposit lands in the model syndicate
- ✓ midge_deposit into an unknown syndicate is an error
- ✓ list includes it
- ✓ get_my_syndicates returns the one the account is in
- ✓ get_my_syndicates invents nothing for an account in no syndicate
- observed **midge_settle in model mode**: `{"mode":"model","notice":"[MODEL MODE, no chain]","status":"SETTLED_MODEL","syndicateId":"mcp-mw67p9de","allocations":[["recipient.near","0.…`
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

## E-ADVISOR-MODEL: The attested advisor: honest answers verify, wrong answers are caught, and tampering with the record is detected

**Hypothesis.** An advisor that asks an attested model to split an amount among recipients returns a proposal that is validated strictly and a record that anyone can check: the model's signature over the exact request and response, the decrypted allocations, and their hash against the chain. The failures that must NOT happen: a proposal that pays more than the total or someone not listed is accepted; an answer that was not sealed, was tampered with or was not signed by the attested key is accepted; or a record that was edited afterwards still verifies.

**What this does not prove**
- The "model" is a mock gateway that implements the NEAR AI Cloud protocol (E2EE v2, signed receipts) and replies with whatever each test scripts. It tests the advisor's checks, not the quality of any real model. The live model is E-ADVISOR-LIVE-01.
- The attestation is the mock's (certificate-chain verification is skipped here); the live experiment requires it.
- A proposal that is valid and off the rule is accepted or rejected by policy (requireRule), not by the contract: the contract has no notion of "the rule".

| Step | Result | Assertions | Time |
|---|---|---|---|
| exact arithmetic helpers | ✓ pass | 4/4 | 1 ms |
| an honest answer: validated, matches the rule, and its record verifies end to end | ✓ pass | 12/12 | 28 ms |
| wrong answers are caught by the validator, and the fallback is the exact rule | ✓ pass | 20/20 | 164 ms |
| transport and attestation failures fail closed | ✓ pass | 7/7 | 61 ms |
| tampering with the stored record is detected | ✓ pass | 8/8 | 25 ms |

### exact arithmetic helpers

- ✓ parseMicro reads at most six decimals and refuses seven, negatives and junk
- ✓ formatMicro and microToYocto round-trip
- ✓ the rule 3:2:1 of 0.06 is 0.03, 0.02, 0.01 exactly
- ✓ a total that does not divide is floored and never exceeds the total

### an honest answer: validated, matches the rule, and its record verifies end to end

- ✓ the proposal is valid and equals the rule
- ✓ the allocations are in the contract's shape: recipient and a yocto string
- ✓ the stored response body hashes to the recorded response hash
- ✓ the signed text binds this model, this request hash and this response hash
- ✓ the signature is a provider_tee signature
- ✓ the signer is the attested model key
- ✓ the model's signature verifies
- ✓ decrypting the stored response with the recorded key gives the recorded plaintext
- ✓ the allocations in the attested response hash to the allocations hash on chain
- ✓ a fresh attestation of the model returns the same key
- ✓ the gateway saw only ciphertext: neither the total nor a recipient id appears in the request
- ✓ chooseAllocations uses the model's answer and says so
- observed **the stored record (without the response body)**: `{"model":"Qwen/Qwen3.6-35B-A3B-FP8","tcbStatus":"not-checked","requestSha256":"3f9e6c5783d82121","responseSha256":"3f1141e880be3d79","signer…`

### wrong answers are caught by the validator, and the fallback is the exact rule

- ✓ REJECTED: pays more than the total (0.12 of 0.06)
- ✓   and the fallback is the exact rule: 0.03, 0.02, 0.01
- ✓ REJECTED: pays a recipient that is not listed
- ✓   and the fallback is the exact rule: 0.03, 0.02, 0.01
- ✓ REJECTED: lists a recipient twice
- ✓   and the fallback is the exact rule: 0.03, 0.02, 0.01
- ✓ REJECTED: a zero amount
- ✓   and the fallback is the exact rule: 0.03, 0.02, 0.01
- ✓ REJECTED: a negative amount
- ✓   and the fallback is the exact rule: 0.03, 0.02, 0.01
- ✓ REJECTED: seven decimals
- ✓   and the fallback is the exact rule: 0.03, 0.02, 0.01
- ✓ REJECTED: prose around the JSON
- ✓   and the fallback is the exact rule: 0.03, 0.02, 0.01
- ✓ REJECTED: an extra field
- ✓   and the fallback is the exact rule: 0.03, 0.02, 0.01
- ✓ REJECTED: an empty array
- ✓   and the fallback is the exact rule: 0.03, 0.02, 0.01
- ✓ a valid but off-rule split passes validation (it is bounded) and is flagged as not the rule
- ✓ with requireRule (the default) it falls back to the rule

### transport and attestation failures fail closed

- ✓ a reply that is not sealed (plaintext) is refused
- ✓ a reply that was tampered with in transit is refused
- ✓ a reply whose signature is wrong is refused
- ✓ a reply signed by a key other than the attested one is refused
- ✓ an attestation whose quote does not contain the model key is refused
- ✓ an attestation whose quote does not contain our nonce is refused
- ✓ without a key the advisor refuses to start

### tampering with the stored record is detected

- ✓ the untouched record verifies
- ✓ editing the plaintext after the fact fails (it no longer matches what the stored response decrypts to)
- ✓ altering the stored response body fails (the hash no longer matches)
- ✓ replacing the decryption key fails
- ✓ claiming a different model key fails (the signature does not verify under it)
- ✓ claiming a different request fails (the signed text names the original)
- ✓ comparing with a different on-chain allocations hash fails (the settled allocations are not the attested ones)
- ✓ the offline receipt check alone also passes for the untouched record

## E-AUCTION-PROGRAMS-01: Sealed-bid auction rules the Roost can run: first-price, second-price (Vickrey) and uniform-price, and what the Roost will sign for them

**Hypothesis.** Each format gives the textbook outcome on worked examples and keeps its invariants over thousands of random bid sets: charges sum exactly to the seller's proceeds, no member pays more than they bid, the highest bid wins, a uniform auction fills from the top and charges everyone the same price, and the same bids always give the same outcome. Under second-price, bidding your true value is never worse than any other bid (tested against rivals drawn at random); under first-price it is not (a case where shading a bid wins more is found). The Roost signs only the outcome it computed: altered charges, altered allocations, charges on an ordinary aggregate, and a second signature are all refused, and the signed message has the 7-field charged format. Fails if any invariant breaks, if truthful bidding is ever beaten under second-price, or if the Roost signs anything other than its own outcome.

**What this does not prove**
- The rules are the standard textbook ones; this tests that the code implements them and that the Roost cannot be made to sign anything else. It does not test that these are the right rules for any real sale.
- Bids are not authenticated to a NEAR account: whoever submits a sealed bid names the flyerId. An impersonator could grief another member (GAP-023). The contract still caps any charge at that member's deposit and the Roost caps it at the bid.
- The strategy tests use random rivals and a grid of alternative bids; they support the theory, they are not a proof.
- The Roost is a local HostedRoost with a simulated attestation provider.

| Step | Result | Assertions | Time |
|---|---|---|---|
| worked examples, checked by hand | ✓ pass | 8/8 | 1 ms |
| invariants over 4,000 random bid sets | ✓ pass | 1/1 | 188 ms |
| second-price: telling the truth is never beaten; first-price: it is | ✓ pass | 2/2 | 50 ms |
| the Roost signs only the outcome it computed | ✓ pass | 12/12 | 89 ms |

### worked examples, checked by hand

- ✓ first-price: b (8) wins and pays 8
- ✓ second-price: b (8) wins and pays the second-highest bid, 6
- ✓ second-price with one bid pays the reserve (2), not its own bid
- ✓ a tie goes to the bid that arrived first
- ✓ bids under the reserve are ignored, and with none above it nothing is sold
- ✓ uniform: a gets 4, b gets 5, c gets the last 1 unit; d gets nothing
- ✓ uniform: oversubscribed, so everyone pays the marginal bid, c's 6 per unit; proceeds 10 x 6
- ✓ uniform: undersubscribed (7 of 10 units wanted), the clearing price is the reserve, 2

### invariants over 4,000 random bid sets

- observed **bid sets x formats checked**: `12000`
- ✓ no invariant broke in any trial

### second-price: telling the truth is never beaten; first-price: it is

- observed **second-price deviations tested**: `50000`
- ✓ under second-price no deviation from the true value ever did better
- ✓ under first-price, bidding the true value (10) against a rival at 6 earns 0, while shading to 6.5 wins the same lot and earns 3.5

### the Roost signs only the outcome it computed

- observed **the published outcome**: `{"format":"uniform","lotUnits":10,"reserve":"0","sold":true,"bidsReceived":4,"bidsEligible":4,"excludedFlyers":[],"clearingPrice":"6","fills…`
- ✓ the Roost reports clearing price 6 and proceeds 60, and charges a 24, b 30, c 6 NEAR
- ✓ the published outcome never contains the losing bid d, or any bid above what the winners pay
- ✓ altered charges (one yocto more on a) are refused
- ✓ charges swapped between members are refused
- ✓ altered allocations (the seller paid one yocto more) are refused
- ✓ an auction outcome cannot be settled without its charges
- ✓ charges cannot be signed for an ordinary aggregate
- ✓ the signed message has the 7-field charged format ending in the order hash
- ✓ the signature verifies under the Roost's attested settlement key
- ✓ a second signature for the same outcome is refused
- observed **charges hash vector (also asserted in the contract tests)**: `277962d41d643c5f0b7aaf5616124070cdb5f906d57e7a5ab0f6906f9c7e8be9`
- ✓ the charges hash equals the value the contract's own compute_charges_hash gives for the same charges (asserted in contracts/fly-coordinator/tests/unit_tests.rs)
- ✓ a first-price outcome is a single winner and one charge equal to the proceeds

## E-POOL-PROGRAM-01: The pooled room program: each member charged exactly their own sealed amount, and the Roost signs only that

**Hypothesis.** The pooled program totals the sealed amounts exactly and charges each member exactly their own amount: charges sum to the total, a minimum and a cap leave out the right amounts in arrival order, and the same amounts always give the same result. The Roost signs a pool outcome only with exactly its own charges and allocations, in the charged 7-field message, and never twice. Fails if any amount is mis-charged or the Roost signs anything else.

**What this does not prove**
- Pure-function and signing tests on a local Roost with a simulated attestation provider. Bids are not authenticated to an account (GAP-023).

| Step | Result | Assertions | Time |
|---|---|---|---|
| worked examples and 3,000 random rounds | ✓ pass | 5/5 | 35 ms |
| the Roost signs only the pool outcome it computed | ✓ pass | 8/8 | 56 ms |

### worked examples and 3,000 random rounds

- ✓ 0.01 + 0.02 + 0.03 + 0.04 = 0.10, each charged their own
- ✓ with a 0.09 cap, the third 0.04 (last to arrive) is left out and the total is 0.08
- ✓ an amount under the minimum is left out
- ✓ nothing at all is left to sell when every amount is out
- ✓ no invariant broke in 3,000 random rounds

### the Roost signs only the pool outcome it computed

- ✓ the Roost reports total 0.1 and charges a 0.01, b 0.02, c 0.03, d 0.04
- ✓ a charge raised by one yocto is refused
- ✓ charges swapped between members are refused
- ✓ a pool outcome cannot be settled without its charges
- ✓ the signed message has 7 fields
- ✓ a second signature is refused
- ✓ an empty round is refused
- ✓ a recipient with a colon is refused

## E-SIGNED-INPUT-01: Signed sealed inputs: a ballot or bid must be signed by a key that belongs to the account it names, for this round, once

**Hypothesis.** A sealed input is accepted only if it carries a valid signature, by the NEAR key of the account it names (checked against the chain), over its ciphertext and this round's contract, syndicate, epoch and nonce. A forged, wrong-account, wrong-round, replayed or stale input is refused; a newer input from the same account replaces its older one (re-voting). Fails if any of these is accepted or any honest input refused.

**What this does not prove**
- The account-key check is injected here as a stub that mirrors the chain's answer; the real RPC check is exercised on testnet separately. Inputs hide the choice, not who submitted (deposits are public anyway).

| Step | Result | Assertions | Time |
|---|---|---|---|
| honest inputs are accepted, forged ones are not | ✓ pass | 8/8 | 21 ms |
| the signature is bound to this round | ✓ pass | 5/5 | 15 ms |
| re-voting: the newest input replaces the older one; replays and stale inputs do not | ✓ pass | 4/4 | 15 ms |
| settlement is refused for a different round than the one opened | ✓ pass | 2/2 | 5 ms |

### honest inputs are accepted, forged ones are not

- ✓ an honest signed input is accepted
- ✓ an unsigned input is refused when signatures are required
- ✓ a corrupted signature is refused
- ✓ a valid signature over a different ciphertext is refused
- ✓ signing with a key that is not on the named account is refused
- ✓ a key that is valid for the signature but unknown to the account is refused (mallory names herself)
- ✓ if the chain cannot be reached the input is refused, not accepted (fail closed)
- ✓ only the one honest input is queued

### the signature is bound to this round

- ✓ an input signed for another contract is refused
- ✓ an input signed for another syndicate is refused
- ✓ an input signed for another epoch is refused
- ✓ an input signed for another round nonce is refused
- ✓ an honest input is still accepted after the refusals

### re-voting: the newest input replaces the older one; replays and stale inputs do not

- ✓ resubmitting the same sequence number is refused (replay)
- ✓ a higher sequence number is accepted and does not add a second entry
- ✓ an older, validly signed input cannot overwrite the newer one (stale)
- ✓ the pool counts the newest input (7 + 5 = 12), not the first (1 + 5)

### settlement is refused for a different round than the one opened

- ✓ signing for another nonce than the open round is refused
- ✓ signing for the open round works

## E-TWO-ROOM-01: Two Roosts, same inputs, same signed message: the Roost side of two-room agreement

**Hypothesis.** Two independent Roosts (own keys), given the same members' inputs sealed separately to each, compute the same outcome and sign the byte-identical settlement message, for the plain total, a pool, and each auction format, whatever order the inputs arrived in. If the inputs differ the messages differ. A member who sends different bids to the two rooms is detectable by comparing salted per-member digests and can be excluded, after which the rooms agree. Fails if two honest rooms ever sign different messages, or two rooms with different inputs sign the same one.

**What this does not prove**
- Both Roosts here are local and unsealed; this checks the agreement logic, not the hardware. Ties are broken by a hash of the account and the round nonce, so two-room mode has no time priority. A member could grind account names to bias a tie; not addressed.

| Step | Result | Assertions | Time |
|---|---|---|---|
| the plain total: same inputs in any order give the same message | ✓ pass | 4/4 | 21 ms |
| a pool and every auction format agree, including ties | ✓ pass | 8/8 | 113 ms |
| different inputs give different messages | ✓ pass | 2/2 | 34 ms |
| a member who equivocates is found by salted digests and can be excluded | ✓ pass | 5/5 | 87 ms |
| digests are bound to the member and do not depend on how the body was written | ✓ pass | 2/2 | 11 ms |
| an unsalted input has no usable digest | ✓ pass | 1/1 | 4 ms |

### the plain total: same inputs in any order give the same message

- ✓ both rooms report the same total
- ✓ both rooms derive the same order hash
- ✓ the two signed messages are byte-identical
- ✓ the rooms have different settlement keys (they really are two rooms)

### a pool and every auction format agree, including ties

- ✓ pool: with all-equal bids (every position a tie) both rooms pick the same winners and charges
- ✓ pool: both rooms sign the identical message
- ✓ first-price: with all-equal bids (every position a tie) both rooms pick the same winners and charges
- ✓ first-price: both rooms sign the identical message
- ✓ second-price: with all-equal bids (every position a tie) both rooms pick the same winners and charges
- ✓ second-price: both rooms sign the identical message
- ✓ uniform: with all-equal bids (every position a tie) both rooms pick the same winners and charges
- ✓ uniform: both rooms sign the identical message

### different inputs give different messages

- ✓ one member's different amount changes the order hash
- ✓ so the signed messages differ and the contract would see no valid pair

### a member who equivocates is found by salted digests and can be excluded

- ✓ the digests differ for exactly the equivocating member
- ✓ a digest does not reveal the amount (it includes the member's secret salt: 1 NEAR and 5 NEAR digests do not match a guessing table)
- ✓ left alone, the two rooms disagree (the equivocator can block settlement)
- ✓ after both rooms exclude the equivocator they agree on the same message
- ✓ and the equivocator is not charged

### digests are bound to the member and do not depend on how the body was written

- ✓ two members who sealed the identical body get different digests (a digest cannot be moved between members)
- ✓ the same body with its keys in another order gives the same digest in another room

### an unsalted input has no usable digest

- ✓ the digest for a body with no salt is null, so the coordinator must exclude or ignore it

## Problems found

| Severity | Where | Problem |
|---|---|---|
| minor | E-SUITE-OFFLINE / 01 hardware attestation (recorded fixture) | verifications/01-hardware-attestation.js does not report its checks individually: its own verdict banner and exit code are the only evidence, so a reader cannot see which invariants were checked without reading the source |
| minor | E-SUITE-OFFLINE / 02 confidential intents (1Click registry) | verifications/02-confidential-intents.js does not report its checks individually: its own verdict banner and exit code are the only evidence, so a reader cannot see which invariants were checked without reading the source |
| minor | E-SUITE-OFFLINE / 03 hatch protocol and escape hatch (JS model) | verifications/03-hatch-escape-hatch.js does not report its checks individually: its own verdict banner and exit code are the only evidence, so a reader cannot see which invariants were checked without reading the source |
| minor | E-RUST-CONTRACT / cargo clippy -D warnings | cargo clippy does not report its checks individually: its own verdict banner and exit code are the only evidence, so a reader cannot see which invariants were checked without reading the source |
| minor | E-RUST-CONTRACT / cargo fmt --check | cargo fmt --check does not report its checks individually: its own verdict banner and exit code are the only evidence, so a reader cannot see which invariants were checked without reading the source |
| minor | E-RUST-CONTRACT / cargo test | cargo test does not report its checks individually: its own verdict banner and exit code are the only evidence, so a reader cannot see which invariants were checked without reading the source |
