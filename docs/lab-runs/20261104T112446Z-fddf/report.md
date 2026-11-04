# Lab run 20261104T112446Z-fddf

- **Code:** `509877b6a43917faa90d64848ab07b9485e7f863` on `master` (**6 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `8a0180ff698c44b5…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 363 events, hash-chained; root `abbbe467cd27523c85c77b0111060e7cd57c061ccfdb9b8c858221d786602ac7`. Verify with `node lab/verify-run.js lab/runs/20261104T112446Z-fddf`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-LAB-01 The lab records honestly and detects tampering | offline | **PASS** | 6 | 32 |  |
| E-SUITE-OFFLINE Existing verification suites, offline and keyless | offline | **PASS** | 10 | 198 |  |
| E-CHECK-FOUNDRY Claims, gaps and commits are consistent with the repository | offline | **PASS** | 1 | 6 |  |
| E-RUST-CONTRACT The NEAR contract passes its Rust tests, lints and formatting | offline | **PASS** | 3 | 6 |  |

## E-LAB-01: The lab records honestly and detects tampering

**Hypothesis.** A run log cannot be edited, trimmed or reordered without detection, secrets never reach the log, and an experiment's verdict is derived from its recorded assertions and cannot be declared.

**What this does not prove**
- The hash chain proves the log is unchanged since it was written. It does not prove the events were produced honestly, which is why experiments attach checkable evidence (transaction hashes, attestation digests, file digests).
- An attacker who rewrites the whole log and its summary consistently would pass the chain check; anchoring the root hash somewhere public (a testnet transaction) closes that gap and is a separate step.

| Step | Result | Assertions | Time |
|---|---|---|---|
| secrets are redacted before they are written or hashed | ✓ pass | 5/5 | 2 ms |
| events whose data has a field named hash (a transaction hash) still verify | ✓ pass | 4/4 | 1 ms |
| an untouched log verifies as intact | ✓ pass | 2/2 | 1 ms |
| editing, deleting, reordering or truncating a log is detected | ✓ pass | 5/5 | 4 ms |
| verdicts are derived from assertions, not declared | ✓ pass | 13/13 | 355 ms |
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
| 01 hardware attestation (recorded fixture) | ✓ pass | 2/2 | 334 ms |
| 02 confidential intents (1Click registry) | ✓ pass | 2/2 | 35 ms |
| 03 hatch protocol and escape hatch (JS model) | ✓ pass | 2/2 | 87 ms |
| 04 dark vault, pods, FAR shard simulation | ✓ pass | 14/14 | 43 ms |
| 05 confidential RFQ and private adjudication | ✓ pass | 7/7 | 55 ms |
| 06 OTC block trades and compute syndicate | ✓ pass | 12/12 | 799 ms |
| 07 five-layer resilience failure matrix | ✓ pass | 13/13 | 48 ms |
| 08 HTTP API, SSE, x402 and MCP end to end | ✓ pass | 25/25 | 656 ms |
| 09 model-sealed Roost against a mock gateway | ✓ pass | 55/55 | 1213 ms |
| 10 hosted Roost with a fake attestation provider | ✓ pass | 66/66 | 549 ms |

### 01 hardware attestation (recorded fixture)

- note: running verifications/01-hardware-attestation.js with recorded fixtures (no network, no keys)
- ✓ the script's own verdict banner says PASS: HAQ VERIFIED [RECORDED FIXTURE]: Intel TDX Quote v4 Cryptographically Verified to Intel Root CA.
- observed **data source the script reported**: `recorded fixture (not live)`
- observed **detail lines the script reported**: `["Intel TDX Quote: PARSED v4 (TEE Type: 0x81 TDX, Length: 5006 bytes)","MRTD Measurement: 7fe60787222bd394... (Parsed)","Gateway Signer Key:…`
- ✓ verifications/01-hardware-attestation.js exited with code 0
- observed **checks parsed from the output**: `0`
- observed **duration (ms)**: `333`
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
- observed **detail lines the script reported**: `["Hatched Sub-Account: dark-swarm-alpha.fly-coordinator.testnet","Nonce: 76ba1f1856064675...","OutLayer Max Spend: 100 USDC","Enclave Ed2551…`
- ✓ verifications/03-hatch-escape-hatch.js exited with code 0
- observed **checks parsed from the output**: `0`
- observed **duration (ms)**: `86`
- observed **full output**: `
======================================================
 [VERIFICATION 3] HATCH PROTOCOL & ESCAPE HATCH (FMEA)
 Target: ` (full: blobs/905dca65e89324fa746a92028a2a224064b2eeac7e7d7e62b96371f2867f0370, sha256 905dca65e893…)

### 04 dark vault, pods, FAR shard simulation

- note: running verifications/04-dark-vault-epochs.js with recorded fixtures (no network, no keys)
- ✓ Hatched Type:        DARK_VAULT (Epoch: 1)
- ✓ Sub-Account:         institutional-dark-vault.fly-coordinator.testnet
- ✓ EVM (Ethereum):      0xff8c3d0757a15f0958393b17a2b93927603e17ad
- ✓ Bitcoin (Taproot):   tb1p40a3xxnjmgljwzlyx6wllrpaqat6zhcftqunk9azhyujwcp7z7ksu3z4qe
- ✓ Solana (Ed25519):    CaLmYWGvnkjfRFx3JEyuj4n9UzXumnNNvH5K3GAA869a
- ✓ Pod Created:         quant-arb-pod-01 (Members: 2)
- ✓ HTTP 402 Issued:     inv_fb31f9b961a2c6fd5bfcd8ab (2.5 USDC)
- ✓ Payment Settled:     rcpt_50818c19fdfed56f39f4e827 via PINGPAY_CONFIDENTIAL_MICROPAYMENT
- ✓ IMT Minted on FAR:   1000 imt:nep141:wrap.near (PBFT_200MS)
- ✓ Epoch 1 Settled:     DARK_VAULT_EPOCH_2 (New Nonce: 67654b816cea56be...)
- ✓ Vault Remains:       ACTIVE (Now in Epoch 2)
- ✓ Clean Withdrawal:    with_38880684ef7a46458d90d499c7765934 (DEPOSITOR_GRAPH_BROKEN)
- ✓ the script's own verdict banner says PASS: DARK VAULT, PODS & MULTICHAIN MPC VERIFIED (Simulated Environment).
- observed **data source the script reported**: `in-process`
- ✓ verifications/04-dark-vault-epochs.js exited with code 0
- observed **checks parsed from the output**: `12`
- observed **duration (ms)**: `42`
- observed **full output**: `
======================================================
 [VERIFICATION 4] DARK VAULT, PODS, FAR SHARD & MPC
 Target: Mul` (full: blobs/316d450d786bd4a828c1d68cd4ade10a00dd815c392697cb190b7a87b07be671, sha256 316d450d786b…)

### 05 confidential RFQ and private adjudication

- note: running verifications/05-confidential-rfq-adjudication.js with recorded fixtures (no network, no keys)
- ✓ RFQ Created in Roost: rfq_2be7ded7f247a846ae400bf6 (Status: OPEN_IN_ROOST)
- ✓ 3 Sealed Quotes Ingested into Enclave Memory.
- ✓ Matched Lender:      galaxy-prime.near (Lowest APR: 4.8%)
- ✓ Bound Principal:     10,000,000 USDC vs 5000 ETH
- ✓ Loan Status:         ACTIVE_SHIELDED
- ✓ the script's own verdict banner says PASS: CONFIDENTIAL RFQ & PRIVATE ADJUDICATION VERIFIED (Simulated Facility).
- observed **data source the script reported**: `in-process`
- ✓ verifications/05-confidential-rfq-adjudication.js exited with code 0
- observed **checks parsed from the output**: `5`
- observed **duration (ms)**: `54`
- observed **full output**: `
======================================================
 [VERIFICATION 5] CONFIDENTIAL RFQ & PRIVATE ADJUDICATION
 Targe` (full: blobs/b5418dec8dcb66d7eeb5bb3ff2b4a7cb51580ce6e249383d1272072d6b27aa04, sha256 b5418dec8dcb…)

### 06 OTC block trades and compute syndicate

- note: running verifications/06-otc-and-compute-facilities.js with recorded fixtures (no network, no keys)
- ✓ Sealed Orders Ingested: 1 BUY (otc_1d1cd42ccbe736f595205f4e), 1 SELL (otc_9ba8cdb80eadf29e5d611064)
- ✓ Matched Volume:    50,000 wNEAR for 200,000 USDC
- ✓ Clearing Price:    $4.00
- ✓ Settlement Shard:  FAR_PRIVATE_SHARD_01
- ✓ MEV Protection:    ZERO_SLIPPAGE_ZERO_FRONT_RUNNING
- ✓ Pooled Compute Pool: 15 NEAR across 3 agents
- ✓ Hardware Attested:   YES (Intel TDX)
- ✓ Model Signer:        0xfdbd7952498b333206f360d71d97a1e0961e8ddf
- ✓ Privacy Protection:  ZERO_PROMPT_LOGGING_TEE_ISOLATION
- ✓ Result Digest:       f57ca95bd5b84283d46c2e54...
- ✓ the script's own verdict banner says PASS: OTC BLOCK TRADES & COMPUTE SYNDICATE VERIFIED (Simulated Facility).
- observed **data source the script reported**: `in-process`
- ✓ verifications/06-otc-and-compute-facilities.js exited with code 0
- observed **checks parsed from the output**: `10`
- observed **duration (ms)**: `798`
- observed **full output**: `======================================================
 [VERIFICATION 6] OTC BLOCK TRADES & COMPUTE SYNDICATE
 Target: C` (full: blobs/2079446cd949b09f2f2e1469aea3225a3df2491bf4df5c866b6a77bfb28003cb, sha256 2079446cd949…)

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
- observed **duration (ms)**: `48`
- observed **full output**: `======================================================
 [VERIFICATION 7] 5-LAYER RESILIENCE FAILURE MATRIX
 Target: Dete` (full: blobs/4f03e50f6ddab3113bee30268beed93eb621de5a190b910ad8c5a8e1415af4f9, sha256 4f03e50f6dda…)

### 08 HTTP API, SSE, x402 and MCP end to end

- note: running verifications/08-api-sse-mcp-e2e.js with recorded fixtures (no network, no keys)
- ✓ Gateway daemon live on http://127.0.0.1:42071
- ✓ Hatched Syndicate: e2e-swarm-live (DARK_VAULT)
- ✓ Deposited Escrow:   75 NEAR (Flyer: agent-alpha.near)
- ✓ SSE Stream State:   ACTIVE (Streaming)
- ✓ Roost Public Key:   Retrieved RSA-2048 (Model: Qwen/Qwen3.6-35B-A3B-FP8)
- ✓ Sealed Ingestion:   ENCRYPTED_IN_ENCLAVE_RAM (344 bytes encrypted)
- ✓ Confidential RFQ:   Matched at 4.9% APR | Health: HEALTHY
- ✓ OTC Block Cross:    10000 wNEAR for 40000 USDC ($4.00/NEAR)
- ✓ Step A (No Auth):   HTTP 402 Payment Required
- ✓ Step B (Settled):   rcpt_5911797ee2217c7a65569491 (PINGPAY_CONFIDENTIAL_MICROPAYMENT)
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
- observed **duration (ms)**: `656`
- observed **full output**: `======================================================
 [VERIFICATION 8] HTTP DAEMON, SSE, x402 & MCP SERVER
 Target: Co` (full: blobs/1596ce27af4542c25a8f9099811f1e096c04e6d7d9e749114d51b9e7ec2f9cc4, sha256 1596ce27af45…)

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
- observed **duration (ms)**: `1213`
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
- observed **duration (ms)**: `548`
- observed **full output**: `
======================================================
 [VERIFICATION 11] HOSTED ROOST (EXACT SUMS, ATTESTED KEYS, BOUN` (full: blobs/d1a4eefaaf45d7a4f5e533c1cc252c8f02a4bb01233bef73a94df3beb3a7c53a, sha256 d1a4eefaaf45…)

## E-CHECK-FOUNDRY: Claims, gaps and commits are consistent with the repository

**Hypothesis.** Every claim and gap recorded in foundry/ points to files that exist and commits that are ancestors of HEAD, so the ledger cannot drift from the code.

**What this does not prove**
- It checks that records are consistent with the repository, not that a claim is true.

| Step | Result | Assertions | Time |
|---|---|---|---|
| foundry control-plane audit | ✓ pass | 6/6 | 91 ms |

### foundry control-plane audit

- ✓ Checked state.json: Project 'midge', Status 'TESTED'
- ✓ Checked claims.jsonl: 15 claims audited and validated against evidence.
- ✓ Checked gaps.jsonl: 8 gaps recorded (0 critical open).
- ✓ Checked phases directory: 8 phase specifications found.
- ✓ ALL FOUNDRY CONTROL PLANE INVARIANTS SATISFIED (0 VIOLATIONS)
- ✓ check-foundry exited with code 0
- observed **checks parsed from the output**: `5`
- observed **duration (ms)**: `90`
- observed **full output**: `╔════════════════════════════════════════════════════════════════╗
║       BUILDER FOUNDRY CONTROL PLANE INTEGRITY AUDIT` (full: blobs/977177c906077d961d149e224472d2feaf68ef89f615102ac85736d6c1508c65, sha256 977177c90607…)

## E-RUST-CONTRACT: The NEAR contract passes its Rust tests, lints and formatting

**Hypothesis.** The coordinator contract compiles warning-free under clippy, is formatted, and passes all unit, integration and property tests.

**What this does not prove**
- Unit and property tests run against a mock environment; the contract has not been audited by a third party.
- The deployed code is checked separately by comparing its on-chain code hash with a local build.

| Step | Result | Assertions | Time |
|---|---|---|---|
| cargo clippy -D warnings | ✓ pass | 2/2 | 1750 ms |
| cargo fmt --check | ✓ pass | 1/1 | 192 ms |
| cargo test | ✓ pass | 3/3 | 12239 ms |

### cargo clippy -D warnings

- ✓ cargo clippy exited with code 0
- observed **checks parsed from the output**: `0`
- observed **duration (ms)**: `1750`
- observed **full output**: ``
- ✓ clippy printed no warnings

### cargo fmt --check

- ✓ cargo fmt --check exited with code 0
- observed **checks parsed from the output**: `0`
- observed **duration (ms)**: `192`
- observed **full output**: ``

### cargo test

- ✓ cargo test exited with code 0
- observed **checks parsed from the output**: `0`
- observed **duration (ms)**: `12238`
- observed **full output**: `    Finished `test` profile [unoptimized + debuginfo] target(s) in 0.59s
     Running unittests src/lib.rs (target/debug` (full: blobs/7829ce55212922f0e52e11c7d94ce1e5b2ae52f5b62700675de9d7dab4de4c01, sha256 7829ce552129…)
- ✓ no Rust test failed
- ✓ the expected number of Rust tests ran (44: 34 unit, 6 integration, 4 invariant)

## Problems found

| Severity | Where | Problem |
|---|---|---|
| minor | E-SUITE-OFFLINE / 01 hardware attestation (recorded fixture) | verifications/01-hardware-attestation.js does not report its checks individually: its own verdict banner and exit code are the only evidence, so a reader cannot see which invariants were checked without reading the source |
| minor | E-SUITE-OFFLINE / 02 confidential intents (1Click registry) | verifications/02-confidential-intents.js does not report its checks individually: its own verdict banner and exit code are the only evidence, so a reader cannot see which invariants were checked without reading the source |
| minor | E-SUITE-OFFLINE / 03 hatch protocol and escape hatch (JS model) | verifications/03-hatch-escape-hatch.js does not report its checks individually: its own verdict banner and exit code are the only evidence, so a reader cannot see which invariants were checked without reading the source |
| minor | E-RUST-CONTRACT / cargo clippy -D warnings | cargo clippy does not report its checks individually: its own verdict banner and exit code are the only evidence, so a reader cannot see which invariants were checked without reading the source |
| minor | E-RUST-CONTRACT / cargo fmt --check | cargo fmt --check does not report its checks individually: its own verdict banner and exit code are the only evidence, so a reader cannot see which invariants were checked without reading the source |
| minor | E-RUST-CONTRACT / cargo test | cargo test does not report its checks individually: its own verdict banner and exit code are the only evidence, so a reader cannot see which invariants were checked without reading the source |
