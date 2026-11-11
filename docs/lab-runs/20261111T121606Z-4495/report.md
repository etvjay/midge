# Lab run 20261111T121606Z-4495

- **Code:** `4c13e1231fa540670779476f6163c953dc98c2e2` on `completeness` (**3 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `73f42e651241e148…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 1586 events, hash-chained; root `da784b9ab49e566041b4d123ae4c73dcbb70375fe418a48cc6e2e2dea5dd1453`. Verify with `node lab/verify-run.js lab/runs/20261111T121606Z-4495`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-LAB-01 The lab records honestly and detects tampering | offline | **PASS** | 7 | 36 |  |
| E-SUITE-OFFLINE Existing verification suites, offline and keyless | offline | **PASS** | 10 | 197 |  |
| E-CHECK-FOUNDRY Claims, gaps and commits are consistent with the repository | offline | **PASS** | 1 | 7 |  |
| E-RUST-CONTRACT The NEAR contract passes its Rust tests, lints and formatting | offline | **PASS** | 3 | 6 |  |
| E-ROOMSERVICE-04 runRoom slice 4: MCP tools for rooms over stdio and streamable HTTP, one dispatcher, no secret key in any tool | offline | **PASS** | 8 | 61 |  |
| E-ROOMSERVICE-05 runRoom slice 5: a live event stream (SSE) that shows a round happening and leaks nothing sealed | offline | **PASS** | 8 | 36 |  |
| E-ROOMSERVICE-06 runRoom slice 6: a practice room that runs all seven kinds end to end, is plainly a simulation, holds no real key, and gives the same settlement through every door | offline | **PASS** | 13 | 75 |  |
| E-ESCROWBOUND-01 Escrow-bound charged rounds: the real reader against stub providers, the real host and service | offline | **PASS** | 5 | 31 |  |
| E-IFACE-MODEL Every HTTP route, SSE stream, SDK method and MCP tool is exercised, and the interfaces tell the truth | offline | **PASS** | 20 | 174 |  |
| E-ADVISOR-MODEL The attested advisor: honest answers verify, wrong answers are caught, and tampering with the record is detected | offline | **PASS** | 5 | 51 |  |
| E-AUCTION-PROGRAMS-01 Sealed-bid auction rules the Roost can run: first-price, second-price (Vickrey) and uniform-price, and what the Roost will sign for them | offline | **PASS** | 4 | 23 |  |
| E-POOL-PROGRAM-01 The pooled room program: each member charged exactly their own sealed amount, and the Roost signs only that | offline | **PASS** | 2 | 13 |  |
| E-SIGNED-INPUT-01 Signed sealed inputs: a ballot or bid must be signed by a key that belongs to the account it names, for this round, once | offline | **PASS** | 4 | 19 |  |
| E-TWO-ROOM-01 Two Roosts, same inputs, same signed message: the Roost side of two-room agreement | offline | **PASS** | 6 | 22 |  |
| E-QUOTE-PROGRAMS-01 Best-quote (lending, RFQ) and cross (block trade) room programs: right winners, conserved cash, signed only as computed | offline | **PASS** | 4 | 31 |  |
| E-BALLOT-PROGRAM-01 Ballot room program: right winner, no tally in the outcome, outsiders and unsigned ballots refused, re-voting, order-independent | offline | **PASS** | 2 | 27 |  |
| E-PAYRUN-PROGRAM-01 Pay-run room program: balanced lines, one-time payees, signed encrypted receipts under a Merkle root, auditor totals only | offline | **PASS** | 3 | 44 |  |
| E-RFQ-PROGRAM-01 Two-sided RFQ room program: makers quote both ways, the taker's side stays sealed, the right maker wins in both directions | offline | **PASS** | 2 | 27 |  |
| E-DEPOSIT-CONSENT-01 A deposit consents to terms the depositor states; the client never copies the hash from the contract | offline | **PASS** | 7 | 20 |  |
| E-ROOMSERVICE-01 runRoom slice 1: one door for the vote room: describe, open, submit, run; typed errors; retry-safe; same answers as the old path | offline | **PASS** | 8 | 56 |  |
| E-ROOMSERVICE-02 runRoom slice 2: all seven room kinds behind the same four verbs; same answers as the old path; wrong parameters never become internal errors | offline | **PASS** | 21 | 117 |  |
| E-ROOMSERVICE-03 runRoom slice 3: the web API for rooms: keys, one error shape, rate limits, an OpenAPI document that matches the router, and an SDK | offline | **PASS** | 8 | 81 |  |

## E-LAB-01: The lab records honestly and detects tampering

**Hypothesis.** A run log cannot be edited, trimmed or reordered without detection, secrets never reach the log, and an experiment's verdict is derived from its recorded assertions and cannot be declared.

**What this does not prove**
- The hash chain proves the log is unchanged since it was written. It does not prove the events were produced honestly, which is why experiments attach checkable evidence (transaction hashes, attestation digests, file digests).
- An attacker who rewrites the whole log and its summary consistently would pass the chain check; anchoring the root hash somewhere public (a testnet transaction) closes that gap and is a separate step.

| Step | Result | Assertions | Time |
|---|---|---|---|
| secrets are redacted before they are written or hashed | ✓ pass | 5/5 | 1 ms |
| events whose data has a field named hash (a transaction hash) still verify | ✓ pass | 4/4 | 1 ms |
| evidence containing a BigInt is recorded and verifies (it used to crash the run) | ✓ pass | 3/3 | 1 ms |
| an untouched log verifies as intact | ✓ pass | 2/2 | 1 ms |
| editing, deleting, reordering or truncating a log is detected | ✓ pass | 5/5 | 3 ms |
| verdicts are derived from assertions, not declared | ✓ pass | 14/14 | 354 ms |
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
| 01 hardware attestation (recorded fixture) | ✓ pass | 2/2 | 406 ms |
| 02 confidential intents (1Click registry) | ✓ pass | 2/2 | 35 ms |
| 03 hatch protocol and escape hatch (JS model) | ✓ pass | 2/2 | 103 ms |
| 04 dark vault, pods, FAR shard simulation | ✓ pass | 14/14 | 41 ms |
| 05 confidential RFQ and private adjudication | ✓ pass | 7/7 | 47 ms |
| 06 OTC block trades and compute syndicate | ✓ pass | 12/12 | 564 ms |
| 07 five-layer resilience failure matrix | ✓ pass | 13/13 | 39 ms |
| 08 HTTP API, SSE, x402 and MCP end to end | ✓ pass | 24/24 | 416 ms |
| 09 model-sealed Roost against a mock gateway | ✓ pass | 55/55 | 1188 ms |
| 10 hosted Roost with a fake attestation provider | ✓ pass | 66/66 | 518 ms |

### 01 hardware attestation (recorded fixture)

- note: running verifications/01-hardware-attestation.js with recorded fixtures (no network, no keys)
- ✓ the script's own verdict banner says PASS: HAQ VERIFIED [RECORDED FIXTURE]: Intel TDX Quote v4 Cryptographically Verified to Intel Root CA.
- observed **data source the script reported**: `recorded fixture (not live)`
- observed **detail lines the script reported**: `["Intel TDX Quote: PARSED v4 (TEE Type: 0x81 TDX, Length: 5006 bytes)","MRTD Measurement: 7fe60787222bd394... (Parsed)","Gateway Signer Key:…`
- ✓ verifications/01-hardware-attestation.js exited with code 0
- observed **checks parsed from the output**: `0`
- observed **duration (ms)**: `405`
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
- observed **detail lines the script reported**: `["Hatched Sub-Account: dark-swarm-alpha.fly-coordinator.testnet","Nonce: 62ebcfb49d78347e...","OutLayer Max Spend: 100 USDC","Enclave Ed2551…`
- ✓ verifications/03-hatch-escape-hatch.js exited with code 0
- observed **checks parsed from the output**: `0`
- observed **duration (ms)**: `103`
- observed **full output**: `
======================================================
 [VERIFICATION 3] HATCH PROTOCOL & ESCAPE HATCH (FMEA)
 Target: ` (full: blobs/956ebb79464c21759ecf9339b9f5224fbb69daa89249a819588dfa4849ba5775, sha256 956ebb79464c…)

### 04 dark vault, pods, FAR shard simulation

- note: running verifications/04-dark-vault-epochs.js with recorded fixtures (no network, no keys)
- ✓ Hatched Type:        DARK_VAULT (Epoch: 1)
- ✓ Sub-Account:         institutional-dark-vault.fly-coordinator.testnet
- ✓ EVM (Ethereum):      0xff8c3d0757a15f0958393b17a2b93927603e17ad
- ✓ Bitcoin (Taproot):   tb1p40a3xxnjmgljwzlyx6wllrpaqat6zhcftqunk9azhyujwcp7z7ksu3z4qe
- ✓ Solana (Ed25519):    CaLmYWGvnkjfRFx3JEyuj4n9UzXumnNNvH5K3GAA869a
- ✓ Pod Created:         quant-arb-pod-01 (Members: 2)
- ✓ HTTP 402 Issued:     inv_993d0a813cf0aea3f379b16b (2.5 USDC)
- ✓ Payment Settled:     rcpt_d09bec6c896e17779301b24c via PINGPAY_CONFIDENTIAL_MICROPAYMENT
- ✓ IMT Minted on FAR:   1000 imt:nep141:wrap.near (PBFT_200MS)
- ✓ Epoch 1 Settled:     DARK_VAULT_EPOCH_2 (New Nonce: 8d4cd13e69bc3e95...)
- ✓ Vault Remains:       ACTIVE (Now in Epoch 2)
- ✓ Clean Withdrawal:    with_44ed2a2321b1d6a4bfd46aef0b4fc56d (DEPOSITOR_GRAPH_BROKEN)
- ✓ the script's own verdict banner says PASS: DARK VAULT, PODS & MULTICHAIN MPC VERIFIED (Simulated Environment).
- observed **data source the script reported**: `in-process`
- ✓ verifications/04-dark-vault-epochs.js exited with code 0
- observed **checks parsed from the output**: `12`
- observed **duration (ms)**: `41`
- observed **full output**: `
======================================================
 [VERIFICATION 4] DARK VAULT, PODS, FAR SHARD & MPC
 Target: Mul` (full: blobs/969980554cb87420ad52f4b955070270634b435215d6f3e4b2e032c4bfd5b386, sha256 969980554cb8…)

### 05 confidential RFQ and private adjudication

- note: running verifications/05-confidential-rfq-adjudication.js with recorded fixtures (no network, no keys)
- ✓ RFQ Created in Roost: rfq_526c05427b37b1ce89bf76df (Status: OPEN_IN_ROOST)
- ✓ 3 Sealed Quotes Ingested into Enclave Memory.
- ✓ Matched Lender:      galaxy-prime.near (Lowest APR: 4.8%)
- ✓ Bound Principal:     10,000,000 USDC vs 5000 ETH
- ✓ Loan Status:         ACTIVE_SHIELDED
- ✓ the script's own verdict banner says PASS: CONFIDENTIAL RFQ & PRIVATE ADJUDICATION VERIFIED (Simulated Facility).
- observed **data source the script reported**: `in-process`
- ✓ verifications/05-confidential-rfq-adjudication.js exited with code 0
- observed **checks parsed from the output**: `5`
- observed **duration (ms)**: `46`
- observed **full output**: `
======================================================
 [VERIFICATION 5] CONFIDENTIAL RFQ & PRIVATE ADJUDICATION
 Targe` (full: blobs/06e3c526414ef19661f6158de70c700827477627b91f86c19f67e4007d3cfafe, sha256 06e3c526414e…)

### 06 OTC block trades and compute syndicate

- note: running verifications/06-otc-and-compute-facilities.js with recorded fixtures (no network, no keys)
- ✓ Sealed Orders Ingested: 1 BUY (otc_ff6a456438ca7606a3f6ee87), 1 SELL (otc_dc59af36c20ab6c5b3481197)
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
- observed **duration (ms)**: `564`
- observed **full output**: `======================================================
 [VERIFICATION 6] OTC BLOCK TRADES & COMPUTE SYNDICATE
 Target: C` (full: blobs/cd945754b62fb84695950b7681eef9407b883021ed29ef6d2e17d933e2b4ddc0, sha256 cd945754b62f…)

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
- observed **duration (ms)**: `39`
- observed **full output**: `======================================================
 [VERIFICATION 7] 5-LAYER RESILIENCE FAILURE MATRIX
 Target: Dete` (full: blobs/4f03e50f6ddab3113bee30268beed93eb621de5a190b910ad8c5a8e1415af4f9, sha256 4f03e50f6dda…)

### 08 HTTP API, SSE, x402 and MCP end to end

- note: running verifications/08-api-sse-mcp-e2e.js with recorded fixtures (no network, no keys)
- ✓ Gateway daemon live on http://127.0.0.1:36631
- ✓ Hatched Syndicate: e2e-swarm-live (DARK_VAULT)
- ✓ Deposited Escrow:   75 NEAR (Flyer: agent-alpha.near)
- ✓ SSE Stream State:   ACTIVE (Streaming)
- ✓ Roost Public Key:   Retrieved RSA-2048 (Model: Qwen/Qwen3.6-35B-A3B-FP8)
- ✓ Sealed Ingestion:   ENCRYPTED_IN_ENCLAVE_RAM (344 bytes encrypted)
- ✓ Confidential RFQ:   Matched at 4.9% APR | Health: HEALTHY
- ✓ OTC Block Cross:    10000 wNEAR for 40000 USDC ($4.00/NEAR)
- ✓ Step A (No Auth):   HTTP 402 Payment Required
- ✓ Step B (Settled):   rcpt_81e0357b42fca69a65c0718b (PINGPAY_CONFIDENTIAL_MICROPAYMENT)
- ✓ Security Check:     Unsigned receipt rejected (HTTP 402, HMAC proof required)
- ✓ Step C (With Auth): HTTP 200 OK
- ✓ MCP Tools Listed:   13 Tools Available for LLM Agents
- ✓ MCP Tool Executed:  midge_hatch_syndicate -> mcp-agent-syndicate (mcp-agent-syndicate.fly-coordinator.testnet) [Mode: model]
- ✓ MCP Tool Executed:  midge_deposit -> 0.05 NEAR deposited [Mode: model]
- ✓ MCP Tool Executed:  midge_settle -> SETTLED_MODEL [Mode: model]
- ✓ MCP Tool Executed:  midge_list_syndicates -> 1 syndicates discovered [Mode: model]
- ✓ MCP Tool Executed:  midge_get_my_syndicates -> 1 member syndicates found [Mode: model]
- ✓ Public Route Check: /health returns HTTP 200 without API key
- ✓ API Key Enforcement: Protected route returns HTTP 401 Unauthorized
- ✓ Auth Verification:  Protected route returns HTTP 200 with X-Midge-Api-Key
- ✓ Body Limit Guard:   Payload >512KB rejected with HTTP 413
- ✓ the script's own verdict banner says PASS: HTTP DAEMON, SSE, x402 & MCP SERVER VERIFIED (Integrated Gateway).
- observed **data source the script reported**: `in-process`
- observed **detail lines the script reported**: `["Chain MCP: SKIPPED (FLY_OFFLINE=1): the live testnet read is not demonstrated offline"]`
- ✓ verifications/08-api-sse-mcp-e2e.js exited with code 0
- observed **checks parsed from the output**: `22`
- observed **duration (ms)**: `416`
- observed **full output**: `======================================================
 [VERIFICATION 8] HTTP DAEMON, SSE, x402 & MCP SERVER
 Target: Co` (full: blobs/38f9d6d03615b107994ed6d7e829966fd0b4609d110693db59c6d1f64b721639, sha256 38f9d6d03615…)

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
- observed **duration (ms)**: `1188`
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
- observed **duration (ms)**: `518`
- observed **full output**: `
======================================================
 [VERIFICATION 11] HOSTED ROOST (EXACT SUMS, ATTESTED KEYS, BOUN` (full: blobs/d1a4eefaaf45d7a4f5e533c1cc252c8f02a4bb01233bef73a94df3beb3a7c53a, sha256 d1a4eefaaf45…)

## E-CHECK-FOUNDRY: Claims, gaps and commits are consistent with the repository

**Hypothesis.** Every claim and gap recorded in foundry/ points to files that exist and commits that are ancestors of HEAD, so the ledger cannot drift from the code.

**What this does not prove**
- It checks that records are consistent with the repository, not that a claim is true.

| Step | Result | Assertions | Time |
|---|---|---|---|
| foundry control-plane audit | ✓ pass | 7/7 | 312 ms |

### foundry control-plane audit

- ✓ Checked state.json: Project 'midge', Status 'TESTED'
- ✓ Checked claims.jsonl: 37 claims audited and validated against evidence.
- ✓ Checked gaps.jsonl: 51 gaps recorded (0 critical open).
- ✓ Checked phases directory: 9 phase specifications found.
- ✓ Checked invariants and docs/STATE_MACHINE.md: 0 error(s).
- ✓ ALL FOUNDRY CONTROL PLANE INVARIANTS SATISFIED (0 VIOLATIONS)
- ✓ check-foundry exited with code 0
- observed **checks parsed from the output**: `6`
- observed **duration (ms)**: `312`
- observed **full output**: `╔════════════════════════════════════════════════════════════════╗
║       BUILDER FOUNDRY CONTROL PLANE INTEGRITY AUDIT` (full: blobs/c76813648f657a0d28e852631cce00a057353fdda87b3fc2e4ef5d25e620f9a3, sha256 c76813648f65…)

## E-RUST-CONTRACT: The NEAR contract passes its Rust tests, lints and formatting

**Hypothesis.** The coordinator contract compiles warning-free under clippy, is formatted, and passes all unit, integration and property tests.

**What this does not prove**
- Unit and property tests run against a mock environment; the contract has not been audited by a third party.
- The deployed code is checked separately by comparing its on-chain code hash with a local build.

| Step | Result | Assertions | Time |
|---|---|---|---|
| cargo clippy -D warnings | ✓ pass | 2/2 | 90167 ms |
| cargo fmt --check | ✓ pass | 1/1 | 135 ms |
| cargo test | ✓ pass | 3/3 | 120483 ms |

### cargo clippy -D warnings

- ✓ cargo clippy exited with code 0
- observed **checks parsed from the output**: `0`
- observed **duration (ms)**: `90167`
- observed **full output**: ``
- ✓ clippy printed no warnings

### cargo fmt --check

- ✓ cargo fmt --check exited with code 0
- observed **checks parsed from the output**: `0`
- observed **duration (ms)**: `135`
- observed **full output**: ``

### cargo test

- ✓ cargo test exited with code 0
- observed **checks parsed from the output**: `0`
- observed **duration (ms)**: `120482`
- observed **full output**: `   Compiling libc v0.2.191
   Compiling cfg-if v1.0.5
   Compiling typenum v1.20.1
   Compiling zeroize v1.9.1
   Compil` (full: blobs/b28d0a3f21b34be7810c00c3c1080f9cb4537b7336b76c966d361c3bc7b023a2, sha256 b28d0a3f21b3…)
- ✓ no Rust test failed
- ✓ the expected number of Rust tests ran (174, the default build; the two signer-override tests run only with that feature)

## E-ROOMSERVICE-04: runRoom slice 4: MCP tools for rooms over stdio and streamable HTTP, one dispatcher, no secret key in any tool

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, written before any code. Four tools mirror the four verbs; none takes a secret key; the coordinator tools need the coordinator key over HTTP; one dispatcher serves stdio and HTTP; a vote through the tools gives the same settlement as the service. The failure that must not happen: a room opened or run over HTTP with no key, a secret key accepted as a tool argument, or an Origin-less browser attack path (DNS rebinding) left open.

**What this does not prove**
- Offline: a real HTTP server on a local port, and the real stdio binary as a child process pointed at a local rooms server.
- The protocol subset implemented is initialize, ping, tools/list and tools/call (single and batch) over JSON responses; server-initiated messages and resumable streams are not.
- One operator plays every member.

| Step | Result | Assertions | Time |
|---|---|---|---|
| the tool list: five room tools, thirteen base tools (ten original and three payroll checks), no secret key anywhere | ✓ pass | 5/5 | 2 ms |
| a vote through the tools gives the service's settlement | ✓ pass | 8/8 | 65 ms |
| the coordinator tools refuse a caller who is not the coordinator | ✓ pass | 3/3 | 2 ms |
| executeTool with no context is not the coordinator | ✓ pass | 2/2 | 1 ms |
| an RFQ's plain terms need the flag, also through the tools | ✓ pass | 3/3 | 15 ms |
| streamable HTTP: the protocol, the key, and the checks around it | ✓ pass | 29/29 | 89 ms |
| limits: body size, and one rate limit shared with the rooms API | ✓ pass | 6/6 | 13 ms |
| the stdio binary uses the same dispatcher and reaches a remote rooms server | ✓ pass | 5/5 | 281 ms |

### the tool list: five room tools, thirteen base tools (ten original and three payroll checks), no secret key anywhere

- ✓ without rooms the list is the thirteen base tools (the original ten and the three payroll checks)
- ✓ with rooms it adds exactly the five room tools (the fifth, abandon, was added with the escrow work)
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
- ✓ tools/list over HTTP shows 18 tools
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
- ✓ an unknown tool without the coordinator key is refused (401, default-deny since the lead 6 fix)
- ✓ an unknown tool with the coordinator key is a JSON-RPC error, not a crash
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
| a vote shows up on the stream in order, with only the safe fields | ✓ pass | 6/6 | 51 ms |
| a run that decides nothing says so; an RFQ's terms never appear | ✓ pass | 2/2 | 76 ms |
| an identical retry does not publish the round twice | ✓ pass | 2/2 | 263 ms |
| a reconnecting client is caught up from the ring of the last 100 | ✓ pass | 7/7 | 439 ms |
| limits, heartbeat and cleanup | ✓ pass | 8/8 | 361 ms |
| a finished stream leaves no timer behind, and a client that never reads is dropped | ✓ pass | 5/5 | 229 ms |
| the hub: a broken subscriber does not stop the others | ✓ pass | 4/4 | 0 ms |
| the SDK can follow the stream | ✓ pass | 2/2 | 360 ms |

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
| it says it is a simulation, and holds no secret anyone can read | ✓ pass | 8/8 | 16 ms |
| it refuses to be used for a real contract | ✓ pass | 4/4 | 8 ms |
| ballot: runs end to end; charges equal payouts; the signature verifies | ✓ pass | 6/6 | 32 ms |
| pool: runs end to end; charges equal payouts; the signature verifies | ✓ pass | 6/6 | 21 ms |
| auction: runs end to end; charges equal payouts; the signature verifies | ✓ pass | 6/6 | 24 ms |
| quote: runs end to end; charges equal payouts; the signature verifies | ✓ pass | 6/6 | 19 ms |
| cross: runs end to end; charges equal payouts; the signature verifies | ✓ pass | 6/6 | 22 ms |
| rfq: runs end to end; charges equal payouts; the signature verifies | ✓ pass | 6/6 | 26 ms |
| payrun: runs end to end; charges equal payouts; the signature verifies | ✓ pass | 6/6 | 32 ms |
| what an observer sees: the vote hides who voted what; the pool honestly shows each amount | ✓ pass | 5/5 | 40 ms |
| a pay run's statements open only for their own reader | ✓ pass | 7/7 | 31 ms |
| the same vote through the service, HTTP, the SDK and MCP gives the same settlement | ✓ pass | 3/3 | 118 ms |
| a scenario can be replayed in a fresh round, and rooms do not share state | ✓ pass | 6/6 | 81 ms |

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

## E-ESCROWBOUND-01: Escrow-bound charged rounds: the real reader against stub providers, the real host and service

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. The room reads, from several providers at one block, what each bidder holds, leaves out anyone who cannot cover their worst case, fails closed when the chain cannot be read, says when no member could leave before the payout lands, and lets the coordinator give up a signed round. This narrows rejections; it does not make them impossible.

**What this does not prove**
- The providers are stubs, so this shows what the room does with their answers, not that real providers answer this way (E-ESCROWBOUND-LIVE-01 does that on testnet).
- It cannot show the race itself: a member leaving between the read and the payout needs the real contract.
- The service and host are real; the contract is not in this experiment.

| Step | Result | Assertions | Time |
|---|---|---|---|
| prediction 1: a bidder with no escrow is left out and named; the others settle; the block is in the signed order hash | ✓ pass | 6/6 | 23 ms |
| prediction 2: a provider that is down, slow, behind or disagrees makes the run UNAVAILABLE and keeps the queue | ✓ pass | 10/10 | 117 ms |
| prediction 3: raceFree only when no member could leave before the payout is likely to land (the definition was tightened after review: the read's age and the snapshot's allowed age count too) | ✓ pass | 6/6 | 36 ms |
| prediction 4: a signed round cannot be re-opened; abandon makes it possible and leaves a record | ✓ pass | 7/7 | 19 ms |
| prediction 5: a roll member who never voted and cannot pay is left out of a ballot | ✓ pass | 2/2 | 27 ms |

### prediction 1: a bidder with no escrow is left out and named; the others settle; the block is in the signed order hash

- ✓ only the unfunded bidder is left out, by account
- ✓ the charges are the other two
- ✓ the payout is exactly the sum of those charges
- ✓ the outcome carries the block that was read
- ✓ the left-out list is account ids and nothing else
- ✓ another block gives another signed order hash

### prediction 2: a provider that is down, slow, behind or disagrees makes the run UNAVAILABLE and keeps the queue

- ✓ down: UNAVAILABLE
- ✓ down: the three bids are still queued and nothing was signed
- ✓ never answers: UNAVAILABLE
- ✓ never answers: the three bids are still queued and nothing was signed
- ✓ a minute behind: UNAVAILABLE
- ✓ a minute behind: the three bids are still queued and nothing was signed
- ✓ disagrees about a balance: UNAVAILABLE
- ✓ disagrees about a balance: the three bids are still queued and nothing was signed
- ✓ disagrees about the exit timing: UNAVAILABLE
- ✓ disagrees about the exit timing: the three bids are still queued and nothing was signed

### prediction 3: raceFree only when no member could leave before the payout is likely to land (the definition was tightened after review: the read's age and the snapshot's allowed age count too)

- ✓ exit opens at block 4100 (timer ends 100 blocks on): race-free
- ✓ exit opened long ago (block 110): not race-free
- ✓ exit opens at exactly 4060: not race-free (strict)
- ✓ exit opens at 4061: race-free
- ✓ an exit at 4110 with a fresh block: race-free
- ✓ the same exit at 4110 but the block was read 50 s ago (about 50 blocks behind the head): not race-free

### prediction 4: a signed round cannot be re-opened; abandon makes it possible and leaves a record

- ✓ the room signed a settlement
- ✓ a different run in the same round is refused (ALREADY_SIGNED)
- ✓ re-opening the same round is refused
- ✓ abandon succeeds and names what was given up
- ✓ and it is on record in the host
- ✓ abandoning again has nothing to abandon
- ✓ the round can sign a new settlement, and with the changed bid it is a different one

### prediction 5: a roll member who never voted and cannot pay is left out of a ballot

- ✓ m5 is left out although they never voted
- ✓ four members are charged a share each

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
| start the API daemon in model mode with a local Roost | ✓ pass | 2/2 | 5 ms |
| SDK: syndicate lifecycle (hatch, get, list, by member, deposit, settle, hatch-out) | ✓ pass | 11/11 | 3215 ms |
| API: input validation and error behaviour | ✓ pass | 8/8 | 11 ms |
| SDK: Roost (session key, attestation, sealing, aggregation) | ✓ pass | 7/7 | 589 ms |
| SDK: facilities (RFQ, OTC, compute) and commerce (x402) | ✓ pass | 15/15 | 193 ms |
| SDK: MPC, emergency hatch-out and the routes the SDK has no method for | ✓ pass | 11/11 | 21 ms |
| SSE: both streams deliver events as they happen | ✓ pass | 8/8 | 423 ms |
| SDK: both SSE streams as async iterators | ✓ pass | 5/5 | 217 ms |
| SDK sealBid and the Roost API with a model-sealed Roost (mock NEAR AI gateway, no key needed) | ✓ pass | 6/6 | 84 ms |
| pagination: total is the record count, order asc/desc, hasMore, and bad input is a 400 | ✓ pass | 8/8 | 31 ms |
| security controls: API key, CORS, public health | ✓ pass | 8/8 | 8 ms |
| chain mode (stub client, no network): each response says what served it, and a write without keys is refused | ✓ pass | 9/9 | 119 ms |
| one request must not take the server down (found by this experiment) | ✓ pass | 1/1 | 734 ms |
| KNOWN GAPs in the model-mode API (pinned: asserting today's behaviour so a fix turns this red) | ✓ pass | 17/17 | 150 ms |
| stop the daemon | ✓ pass | 1/1 | 0 ms |
| chain client: argument shapes and signing parity with the contract (no network) | ✓ pass | 14/14 | 88 ms |
| MCP (in process): every tool, and the four that used to claim success without doing anything | ✓ pass | 26/26 | 3257 ms |
| MCP (stdio JSON-RPC): initialize, list, call, errors | ✓ pass | 7/7 | 148 ms |
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

- ✓ /v1/stream/syndicate/sse-mwc36kpv: content type is text/event-stream
- ✓ the syndicate stream sends "connected" first
- ✓ a deposit appears on the stream as deposit_received
- ✓ a sealed intent appears as sealed_intent_received with a count and no amount
- ✓ /v1/stream/syndicate/someone-else-mwc36kpv: content type is text/event-stream
- ✓ a stream for a different syndicate does not receive these events
- ✓ /v1/stream/facilities/rfq/loan_fad4a4236bf4967518722925: content type is text/event-stream
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
- observed **midge_settle in model mode**: `{"mode":"model","notice":"[MODEL MODE, no chain]","status":"SETTLED_MODEL","syndicateId":"mcp-mwc36kpv","allocations":[["recipient.near","0.…`
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

## E-ADVISOR-MODEL: The attested advisor: honest answers verify, wrong answers are caught, and tampering with the record is detected

**Hypothesis.** An advisor that asks an attested model to split an amount among recipients returns a proposal that is validated strictly and a record that anyone can check: the model's signature over the exact request and response, the decrypted allocations, and their hash against the chain. The failures that must NOT happen: a proposal that pays more than the total or someone not listed is accepted; an answer that was not sealed, was tampered with or was not signed by the attested key is accepted; or a record that was edited afterwards still verifies.

**What this does not prove**
- The "model" is a mock gateway that implements the NEAR AI Cloud protocol (E2EE v2, signed receipts) and replies with whatever each test scripts. It tests the advisor's checks, not the quality of any real model. The live model is E-ADVISOR-LIVE-01.
- The attestation is the mock's (certificate-chain verification is skipped here); the live experiment requires it.
- A proposal that is valid and off the rule is accepted or rejected by policy (requireRule), not by the contract: the contract has no notion of "the rule".

| Step | Result | Assertions | Time |
|---|---|---|---|
| exact arithmetic helpers | ✓ pass | 4/4 | 1 ms |
| an honest answer: validated, matches the rule, and its record verifies end to end | ✓ pass | 12/12 | 27 ms |
| wrong answers are caught by the validator, and the fallback is the exact rule | ✓ pass | 20/20 | 152 ms |
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
- observed **the stored record (without the response body)**: `{"model":"Qwen/Qwen3.6-35B-A3B-FP8","tcbStatus":"not-checked","requestSha256":"8019f36a117b740f","responseSha256":"e5cfb4f13be002eb","signer…`

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
| invariants over 4,000 random bid sets | ✓ pass | 1/1 | 186 ms |
| second-price: telling the truth is never beaten; first-price: it is | ✓ pass | 2/2 | 61 ms |
| the Roost signs only the outcome it computed | ✓ pass | 12/12 | 129 ms |

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
| worked examples and 3,000 random rounds | ✓ pass | 5/5 | 61 ms |
| the Roost signs only the pool outcome it computed | ✓ pass | 8/8 | 96 ms |

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
| honest inputs are accepted, forged ones are not | ✓ pass | 8/8 | 38 ms |
| the signature is bound to this round | ✓ pass | 5/5 | 23 ms |
| re-voting: the newest input replaces the older one; replays and stale inputs do not | ✓ pass | 4/4 | 23 ms |
| settlement is refused for a different round than the one opened | ✓ pass | 2/2 | 7 ms |

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
| the plain total: same inputs in any order give the same message | ✓ pass | 4/4 | 37 ms |
| a pool and every auction format agree, including ties | ✓ pass | 8/8 | 124 ms |
| different inputs give different messages | ✓ pass | 2/2 | 28 ms |
| a member who equivocates is found by salted digests and can be excluded | ✓ pass | 5/5 | 79 ms |
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

## E-QUOTE-PROGRAMS-01: Best-quote (lending, RFQ) and cross (block trade) room programs: right winners, conserved cash, signed only as computed

**Hypothesis.** The best-quote program picks the lowest eligible quote (ties to the fixed order) and prices it first- or second-price; an ineligible quote never wins. The cross program crosses eligible buyers and sellers at the reference price: matched units are the smaller side's total, no fill exceeds its order, the more aggressive limit fills first, and buyers' cash equals sellers' cash. The same inputs give the same outcome whatever the arrival order in two-host mode. The Roost signs only the outcome it computed, once, with its charges. Fails if any of these breaks.

**What this does not prove**
- Offline, on local hosts with a simulated attestation provider. Only the cash leg is modelled: no repayment, collateral or asset delivery. The reference price is an input, not verified.

| Step | Result | Assertions | Time |
|---|---|---|---|
| best quote: worked examples and 3,000 random rounds | ✓ pass | 6/6 | 17 ms |
| cross (pro-rata): worked examples and 3,000 random rounds | ✓ pass | 10/10 | 75 ms |
| the Roost runs the programs and signs only what it computed | ✓ pass | 13/13 | 156 ms |
| two hosts: any arrival order gives the same signed message | ✓ pass | 2/2 | 36 ms |

### best quote: worked examples and 3,000 random rounds

- ✓ lowest rate wins and is paid its own rate (first-price)
- ✓ second-price pays the runner-up's rate
- ✓ a lone eligible quote is paid its own under second-price
- ✓ a quote above the limit never wins
- ✓ a tie goes to the earlier order
- ✓ no invariant broke in 3,000 random rounds (winner is the lowest eligible, price within bounds, value independent of order)

### cross (pro-rata): worked examples and 3,000 random rounds

- ✓ 150 buy units meet 170 sell units: 150 match at the reference
- ✓ the short side (buyers) fills in full: b1 100, b2 50
- ✓ the long side (sellers) fills pro-rata with largest remainder: s1 gets 71 (70.59), s2 gets 79 (79.41)
- ✓ a buyer below the reference does not take part
- ✓ a seller above the reference does not take part
- ✓ a seller with an extreme limit (0.00001) is filled pro-rata like everyone else: F 29, s1 57, s2 64 (not F 40 first)
- ✓ and gets exactly what the same seller gets with a limit equal to the reference: the limit decides nothing but qualifying
- ✓ a public per-order cap clamps an inflated order: b1 asking for 100,000 is treated as 100
- ✓ when two long-side orders have equal remainders (7.5 each of 15), the extra unit goes to the earlier order: first 8, second 7
- ✓ no invariant broke in 3,000 random rounds (units and cash conserved, short side full, long side within one unit of pro-rata, caps respected, limits decide only who qualifies, deterministic)

### the Roost runs the programs and signs only what it computed

- ✓ lend: lender l2 wins at 400 bps and funds 5 NEAR to the borrower
- ✓ lend: the signed message has 7 fields
- ✓ lend, second-price: the winner is quoted the runner-up's rate (450)
- ✓ lend: no eligible quote means no trade and nothing to sign
- ✓ lend: the borrower cannot win by quoting against themselves
- ✓ buy RFQ: dealer d2 wins at 1.20 and is paid 12 NEAR by the taker
- ✓ cross: 150 units match pro-rata; sellers s1 and s2 are paid 71 and 79; buyers b1 and b2 pay 100 and 50
- ✓ a charge raised by one yocto is refused
- ✓ an allocation moved to another recipient is refused
- ✓ a cross outcome cannot be settled without its charges
- ✓ a second signature is refused
- ✓ cross with a cap of 100 units: b1's inflated 100,000 counts as 100, sell side clamps to 100, so 100 units match and the buyers split 67 and 33
- ✓ cross: a malformed order is left out and reported, not fatal

### two hosts: any arrival order gives the same signed message

- ✓ lend with all quotes tied: both hosts pick the same winner and sign the same order hash
- ✓ cross with equal limits and an uneven pro-rata split (10 + 10 buy against 15 sell): both hosts split the same way and sign the same order hash

## E-BALLOT-PROGRAM-01: Ballot room program: right winner, no tally in the outcome, outsiders and unsigned ballots refused, re-voting, order-independent

**Hypothesis.** The ballot program counts one signed ballot per roll member (the latest wins), applies a quorum and a majority or plurality rule, and decides only with a strict winner; a tie, a missed quorum or a missed majority decides nothing. The result does not depend on the order ballots arrive. The published outcome carries the winner and whether it was decided, never a tally or a turnout count. The host refuses to run a ballot unless inputs are signed, ignores ballots from outside the roll, spoils ballots for unknown options, and signs only a payment to the winning option's recipient with equal charges on the roll. Fails if any of these breaks.

**What this does not prove**
- Offline, on local hosts with a simulated attestation provider and a stubbed account-key check. The weight of a vote is a deposit-funded share, not a person: the contract cannot tell one person from many accounts. Re-voting reduces but does not remove vote-buying. The roll is supplied by the coordinator; the contract only caps charges to real depositors.

| Step | Result | Assertions | Time |
|---|---|---|---|
| the counting rule: worked examples and 3,000 random rounds | ✓ pass | 14/14 | 152 ms |
| the host: signed ballots only, outsiders ignored, re-voting, payment to the winner, nothing else signed | ✓ pass | 13/13 | 133 ms |

### the counting rule: worked examples and 3,000 random rounds

- ✓ A wins 3 of 4 non-abstaining ballots with full turnout
- ✓ a tie decides nothing
- ✓ under plurality a three-way split with two tied leaders is a tie
- ✓ under plurality A wins with 2 of 4
- ✓ the same ballots under majority decide nothing: 2 of 4 is not more than half
- ✓ 2 of 5 ballots miss a 60% quorum
- ✓ a ballot for an unknown option is spoiled and does not count toward quorum
- ✓ an outsider's ballot is ignored and reported, not counted
- ✓ two ballots from one roll member count once (the host gives it one; the program also refuses a second)
- ✓ a quorum exactly on the boundary is met (3 of 5 at 60%) and one fewer is not
- ✓ a later ballot from the same member replaces the earlier one: m1's A then B gives B 2 to 0
- ✓ "later" means a higher order, not the later position in the list
- ✓ when abstentions outnumber the votes the single vote still decides by the stated rule (majority of non-abstaining ballots)
- ✓ no invariant broke in 3,000 random rounds (order-independent, strict leader, majority and quorum respected, no tally in the outcome)

### the host: signed ballots only, outsiders ignored, re-voting, payment to the winner, nothing else signed

- ✓ a host that does not require signed inputs refuses to count a ballot
- ✓ A wins: the outcome names A and its recipient
- ✓ the published outcome carries no tally, no turnout and no ballot
- ✓ the payment is the pool (5 x 0.02 = 0.1 NEAR) to ra.near, charged 0.02 to every roll member, voters or not
- ✓ the signed message has 7 fields
- ✓ re-voting: m3 and m4 change their ballots to A and A wins 4 to 1
- ✓ an outsider's signed ballot is ignored and reported by account only
- ✓ and the pool goes to the winning option's recipient, rb.near, not the first option's
- ✓ an undecided ballot (tie) pays nothing and leaves nothing to sign
- ✓ paying the pool to the losing option is refused
- ✓ charging one voter the whole pool is refused
- ✓ a ballot outcome cannot be settled without its charges
- ✓ two hosts that received the same ballots in opposite orders sign the same message

## E-PAYRUN-PROGRAM-01: Pay-run room program: balanced lines, one-time payees, signed encrypted receipts under a Merkle root, auditor totals only

**Hypothesis.** The pay-run program pays each person their net (gross minus tax minus benefits) and the tax and benefits providers their totals, and charges the employer the gross total. The host builds a signed receipt per line under a Merkle root; a person decrypts only their own, the signature and proof verify, and the order hash recomputes from the root; a changed amount, a wrong proof or a wrong root fails; the auditor statement carries totals only. More than 8 recipients, an unbalanced line, or a pay run not sealed by the employer is refused. Two hosts produce the same root and order hash. The host signs only the allocations and charge it computed. Fails if any of these breaks.

**What this does not prove**
- Offline, on local hosts with a simulated attestation provider and a stubbed account-key check. The amounts of every payment are public on NEAR once settled; receipts hide nothing on chain. A dishonest host could issue a wrong receipt; two hosts reduce that and this run uses one. Receipt privacy depends on each person keeping their key.

| Step | Result | Assertions | Time |
|---|---|---|---|
| the receipts library: Merkle root, proofs, canonical form | ✓ pass | 8/8 | 10 ms |
| the arithmetic: nets, totals, and what is refused | ✓ pass | 13/13 | 2 ms |
| the host: statements, verification, tampering, and what it signs | ✓ pass | 23/23 | 116 ms |

### the receipts library: Merkle root, proofs, canonical form

- ✓ for 1 to 12 leaves every proof verifies its own leaf and no other, a tampered leaf fails, and a different root fails
- ✓ a leaf hash is sha256(0x00 || canonical JSON)
- ✓ three leaves make node(node(l0,l1), l2)
- ✓ five leaves make node(node(node(l0,l1),node(l2,l3)), l4)
- ✓ the proof for leaf 4 of 5 is a single left sibling, the root of the first four
- ✓ the canonical form does not depend on key order
- ✓ a single-leaf tree has the leaf as its proof-less root
- ✓ the order hash is a function of the run id and root only

### the arithmetic: nets, totals, and what is refused

- ✓ four people are paid their net (80% of gross): 0.04, 0.032, 0.024, 0.016
- ✓ the tax authority gets the 15% total, 0.021, and the benefits provider the 5% total, 0.007
- ✓ the allocations sum to the gross total, 0.14, which the employer is charged
- ✓ there are six receipts, one per person and one each for tax and benefits
- ✓ the totals are net 0.112, tax 0.021, benefits 0.007, headcount 4
- ✓ a line whose tax and benefits exceed the gross is refused
- ✓ a line whose net is exactly zero is refused (gross 0.05, tax 0.04, benefits 0.01)
- ✓ a zero gross is refused
- ✓ two people on one address are refused
- ✓ a person paid to the tax authority's address is refused
- ✓ seven people plus tax and benefits is nine recipients: refused (at most 8)
- ✓ an amount with more than 6 decimal places is refused
- ✓ with no deductions the tax and benefits transfers are omitted (4 allocations, 4 receipts)

### the host: statements, verification, tampering, and what it signs

- ✓ a host that does not require signed inputs refuses to run a pay run
- ✓ the public outcome names the run, the root, the headcount and the gross total, and no names or per-person amounts
- ✓ the order hash is the one recomputed from the run id and the root
- ✓ the employer is charged the gross total, 0.14, once
- ✓ the settlement message has 7 fields
- ✓ all four people verify their own receipt: decrypts, host signature, Merkle proof, and the order hash
- ✓ a1's receipt carries their own breakdown: gross 0.05, tax 0.0075, benefits 0.0025, net 0.04
- ✓ a person cannot open someone else's statement
- ✓ a statement checked against another run's order hash fails
- ✓ a statement checked against the wrong host key fails
- ✓ a receipt with the net changed to 0.05 fails (signature and proof)
- ✓ a receipt moved to another payee address fails
- ✓ a receipt with a proof from another line fails
- ✓ a receipt with a forged root fails
- ✓ the auditor sees totals and the root only: no name, address, invoice or individual amount
- ✓ the auditor's totals are net 0.112, tax 0.021, benefits 0.007, gross 0.14
- ✓ the employer sees every line, with names
- ✓ paying the first person's net to another address is refused
- ✓ charging the employer twice the gross is refused
- ✓ a pay run sealed by someone other than the employer is refused
- ✓ an unbalanced line is refused
- ✓ the same pay run listed in a different order gives the same root (lines are put in a canonical order by payee address)
- ✓ two hosts given the lines in opposite orders produce the same root, order hash and allocations (as sets)

## E-RFQ-PROGRAM-01: Two-sided RFQ room program: makers quote both ways, the taker's side stays sealed, the right maker wins in both directions

**Hypothesis.** The best-quote program picks the highest eligible quote in the highest direction as correctly as the lowest in the lowest. The RFQ host takes one sealed request from the taker (side, units, limit, a secret salt) and a sealed two-way quote (bid and ask) from each maker. A buy goes to the lowest ask at or under the limit, a sell to the highest bid at or over it; first-price or second-price. The payer is the taker on a buy and the winning maker on a sell; the payee is the other; the charge is bounded by what the payer committed. A crossed quote, a quote from outside the maker list or from the taker is not counted. The order hash does not let an observer recover units or price (it carries the taker's secret salt). Two hosts agree. The host signs only what it computed. Fails if any of these breaks.

**What this does not prove**
- Offline, on local hosts with a simulated attestation provider and a stubbed account-key check. Only the cash leg settles: nothing delivers the asset. Settlement reveals the side (who pays whom) and the notional; it does not reveal units or the price per unit. The maker list is supplied by the coordinator and must match the contract's allowed recipients.

| Step | Result | Assertions | Time |
|---|---|---|---|
| the highest direction, which the sell side depends on: worked examples and 3,000 random rounds | ✓ pass | 6/6 | 17 ms |
| the host: both sides, both pricings, who pays whom, and what is refused | ✓ pass | 21/21 | 360 ms |

### the highest direction, which the sell side depends on: worked examples and 3,000 random rounds

- ✓ the highest bid at or over the limit wins and is paid its own bid (first-price)
- ✓ second-price pays the runner-up's bid
- ✓ a bid under the limit never wins
- ✓ a bid exactly at the limit is eligible
- ✓ a tie goes to the earlier order
- ✓ no invariant broke in 3,000 random rounds (winner is the highest eligible, price within [limit, winner quote], value independent of order)

### the host: both sides, both pricings, who pays whom, and what is refused

- ✓ a host that does not require signed inputs refuses to run an RFQ
- ✓ buy: m2 wins at its ask of 0.002; the taker pays m2 10 x 0.002 = 0.02 NEAR
- ✓ the terms (side, units, price) are in the host's private reply, not in the public outcome
- ✓ the signed message has 7 fields
- ✓ sell: m3 wins at its bid of 0.00197; m3 pays the taker 10 x 0.00197 = 0.0197 NEAR
- ✓ buy, second-price: m2 wins and pays the runner-up's ask, 0.00205 (m1), so 0.0205 NEAR
- ✓ sell, second-price: m3 wins and is charged the runner-up's bid, 0.00195 (m1), so 0.0195 NEAR
- ✓ buy with a limit under every ask: no trade and nothing to sign
- ✓ sell with a limit over every bid: no trade
- ✓ a buy limit exactly at the best ask still trades
- ✓ a quote from outside the maker list is ignored and reported by account, even if it would win
- ✓ the taker's own request is never counted as a quote
- ✓ a crossed quote (bid above ask) is not counted, even though its ask would win
- ✓ without the taker's request there is nothing to run
- ✓ a request without a secret salt is refused (the order hash would be guessable)
- ✓ an observer who tries every (units, price) pair cannot reproduce the on-chain order hash: it carries the taker's secret salt
- ✓ paying the winner's money to another maker is refused
- ✓ charging the taker double is refused
- ✓ an RFQ outcome cannot be settled without its charges
- ✓ two hosts that received the buy RFQ in opposite orders sign the same order hash, allocations and charges
- ✓ two hosts that received the sell RFQ in opposite orders sign the same order hash, allocations and charges

## E-DEPOSIT-CONSENT-01: A deposit consents to terms the depositor states; the client never copies the hash from the contract

**Hypothesis.** The chain client submits a deposit only with a hash computed from terms the caller stated, refuses when the group differs, and never echoes the contract's own stored hash. The failure that must not happen: a deposit that consents to a 10-block timer because the client asked the contract for its hash.

**What this does not prove**
- Offline against a stubbed chain: it checks what the client would submit, not that the contract refuses it (the contract side is in the Rust tests and the testnet check). The MCP tool, API and SDK are exercised through the same client method.
- Run by one operator on 2026-11-07.

| Step | Result | Assertions | Time |
|---|---|---|---|
| no hash and no terms: refused, nothing submitted | ✓ pass | 3/3 | 2 ms |
| stated terms equal to the group's: submits the hash the client computed | ✓ pass | 5/5 | 1 ms |
| terms that differ from the group's: refused, naming what differs | ✓ pass | 8/8 | 4 ms |
| a group opened before GAP-025: the old-formula hash of the stated terms | ✓ pass | 1/1 | 1 ms |
| a contract whose stored hash is wrong: the computed hash would not match it | ✓ pass | 1/1 | 1 ms |
| a hash the caller computed itself is passed through unchanged | ✓ pass | 1/1 | 0 ms |
| computePolicyHash needs the timer | ✓ pass | 1/1 | 1 ms |

### no hash and no terms: refused, nothing submitted

- ✓ deposit() throws
- ✓ the message tells the caller to state the terms and says it will not copy the contract's hash
- ✓ nothing was submitted

### stated terms equal to the group's: submits the hash the client computed

- ✓ one transaction was submitted
- ✓ its hash is the version-2 hash of the stated terms
- ✓ it is not the hash the contract stored
- ✓ it equals a hash spelled out independently, so the timer really is in the string
- ✓ and the version-2 hash differs from the old formula, so the timer is in it

### terms that differ from the group's: refused, naming what differs

- ✓ a different timer is refused and named
- ✓ nothing is submitted for a different timer
- ✓ a different cap is refused and named
- ✓ nothing is submitted for a different cap
- ✓ a different deadline is refused and named
- ✓ nothing is submitted for a different deadline
- ✓ a different recipient is refused and named
- ✓ nothing is submitted for a different recipient

### a group opened before GAP-025: the old-formula hash of the stated terms

- ✓ it submits the version-1 hash

### a contract whose stored hash is wrong: the computed hash would not match it

- ✓ the client submitted its own hash, which differs from the stored one, so the contract would refuse

### a hash the caller computed itself is passed through unchanged

- ✓ submitted as given

### computePolicyHash needs the timer

- ✓ calling it without a timer throws

## E-ROOMSERVICE-01: runRoom slice 1: one door for the vote room: describe, open, submit, run; typed errors; retry-safe; same answers as the old path

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, written before any code. RoomService gives the same outcome, order hash, allocations and charges as the old runBallot + signSettlement path, returns the finished contract call, refuses bad calls with a typed code and leaves the queue unharmed, and is safe to retry. The failure that must not happen: a settlement signed for something the host did not compute, or a refused call that eats the round's inputs.

**What this does not prove**
- Offline, on local hosts with a simulated attestation provider and a stubbed account-key check.
- Only the vote room kind is registered; the other six programs and the four adapters (MCP, REST, SSE, SDK) are later slices.
- One operator plays every member.

| Step | Result | Assertions | Time |
|---|---|---|---|
| describe: one program, the host's keys | ✓ pass | 3/3 | 1 ms |
| a five-member vote returns the finished contract call, and the signature verifies | ✓ pass | 9/9 | 21 ms |
| parity: the same answers as the old path on a twin host | ✓ pass | 3/3 | 37 ms |
| a tie decides nothing: no settlement, nothing signed | ✓ pass | 3/3 | 23 ms |
| typed errors, and a refused call leaves the inputs alone | ✓ pass | 25/25 | 23 ms |
| retry-safe: an identical run returns the same result; a different one is refused | ✓ pass | 4/4 | 21 ms |
| defaults, unexpected errors, and a cached result never goes stale | ✓ pass | 6/6 | 63 ms |
| the registry is real: a second program runs through the same verbs | ✓ pass | 3/3 | 4 ms |

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
| describe lists seven programs | ✓ pass | 3/3 | 0 ms |
| pool: parity with the old path, and a contract call whose signature verifies | ✓ pass | 8/8 | 29 ms |
| pool: deciding nothing signs nothing | ✓ pass | 2/2 | 11 ms |
| pool: wrong parameters are INVALID_PARAMS, never an internal error, and the inputs stay | ✓ pass | 8/8 | 13 ms |
| auction: parity with the old path, and a contract call whose signature verifies | ✓ pass | 8/8 | 25 ms |
| auction: deciding nothing signs nothing | ✓ pass | 2/2 | 12 ms |
| auction: wrong parameters are INVALID_PARAMS, never an internal error, and the inputs stay | ✓ pass | 8/8 | 13 ms |
| quote: parity with the old path, and a contract call whose signature verifies | ✓ pass | 8/8 | 19 ms |
| quote: deciding nothing signs nothing | ✓ pass | 2/2 | 10 ms |
| quote: wrong parameters are INVALID_PARAMS, never an internal error, and the inputs stay | ✓ pass | 9/9 | 10 ms |
| cross: parity with the old path, and a contract call whose signature verifies | ✓ pass | 8/8 | 24 ms |
| cross: deciding nothing signs nothing | ✓ pass | 2/2 | 11 ms |
| cross: wrong parameters are INVALID_PARAMS, never an internal error, and the inputs stay | ✓ pass | 7/7 | 12 ms |
| rfq: parity with the old path, and a contract call whose signature verifies | ✓ pass | 8/8 | 38 ms |
| rfq: deciding nothing signs nothing | ✓ pass | 2/2 | 16 ms |
| rfq: wrong parameters are INVALID_PARAMS, never an internal error, and the inputs stay | ✓ pass | 8/8 | 17 ms |
| payrun: parity with the old path, and a contract call whose signature verifies | ✓ pass | 8/8 | 32 ms |
| payrun: wrong parameters are INVALID_PARAMS, never an internal error, and the inputs stay | ✓ pass | 7/7 | 18 ms |
| a pay run's receipts leave only as sealed statements | ✓ pass | 3/3 | 15 ms |
| an RFQ's plain terms are left out unless asked for, and the retry is stable | ✓ pass | 4/4 | 17 ms |
| programs that need signed inputs refuse an unsigned host | ✓ pass | 2/2 | 5 ms |

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
- ✓ {"employer":"er.near","taxAddress":7,"benefitsAddress":"ben.near","employerKeyHex":"2239e8 -> INVALID_PARAMS
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
| describe is open; open and run need the coordinator key | ✓ pass | 8/8 | 11 ms |
| a vote over HTTP gives the same settlement as the service on a twin host | ✓ pass | 10/10 | 43 ms |
| every failure has one status and the body { error, code } | ✓ pass | 16/16 | 39 ms |
| the rate limit holds, tells the client, and recovers | ✓ pass | 10/10 | 8 ms |
| behind a proxy: the forwarded address is trusted only from our own proxy, and cannot be forged to dodge the limit | ✓ pass | 12/12 | 27 ms |
| an RFQ's plain terms need the flag and the coordinator key | ✓ pass | 3/3 | 18 ms |
| the OpenAPI document matches the router | ✓ pass | 13/13 | 5 ms |
| the SDK returns the same results and raises RoomError with the server's code | ✓ pass | 9/9 | 335 ms |

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

| Severity | Where | Problem |
|---|---|---|
| minor | E-SUITE-OFFLINE / 01 hardware attestation (recorded fixture) | verifications/01-hardware-attestation.js does not report its checks individually: its own verdict banner and exit code are the only evidence, so a reader cannot see which invariants were checked without reading the source |
| minor | E-SUITE-OFFLINE / 02 confidential intents (1Click registry) | verifications/02-confidential-intents.js does not report its checks individually: its own verdict banner and exit code are the only evidence, so a reader cannot see which invariants were checked without reading the source |
| minor | E-SUITE-OFFLINE / 03 hatch protocol and escape hatch (JS model) | verifications/03-hatch-escape-hatch.js does not report its checks individually: its own verdict banner and exit code are the only evidence, so a reader cannot see which invariants were checked without reading the source |
| minor | E-RUST-CONTRACT / cargo clippy -D warnings | cargo clippy does not report its checks individually: its own verdict banner and exit code are the only evidence, so a reader cannot see which invariants were checked without reading the source |
| minor | E-RUST-CONTRACT / cargo fmt --check | cargo fmt --check does not report its checks individually: its own verdict banner and exit code are the only evidence, so a reader cannot see which invariants were checked without reading the source |
| minor | E-RUST-CONTRACT / cargo test | cargo test does not report its checks individually: its own verdict banner and exit code are the only evidence, so a reader cannot see which invariants were checked without reading the source |
