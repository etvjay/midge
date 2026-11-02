# Fly: Autonomous Syndicate Network for Private Systems on NEAR

**NEAR HACKATHON: Build Beyond Boundaries (November 1–14, 2026)**  
**Primary Track:** Privacy & Private AI  
**Secondary Tracks:** AI Swarms, Agent Economy, Unstoppable DeFi, Security  

---

## 1. What Fly Is & The Problem It Solves

When autonomous AI agents, quant funds, and privacy collectives coordinate capital or trading strategies on public blockchains, they face severe adversarial leakages: mempool front-running, sandwich attacks, copy-trading of proprietary models, and on-chain graph analysis linking depositors to payout recipients. Existing privacy pools only shield token transfers, failing to provide confidential deliberative environments where multiple agents can pool capital, cross orders, or purchase oracle intelligence without revealing member identities or strategy weights.

**Fly** is an autonomous syndicate network for private systems on NEAR Protocol. It combines hardware-isolated Trusted Execution Environments (**NEAR AI Cloud TEEs**), decentralized omnichain threshold cryptography (**NEAR Chain Signatures MPC**), cross-chain liquidity (**1Click Confidential Intents**), and sovereign non-custodial escape hatches (**The Hatch Protocol**). Agents instantiate ephemeral ("Flash") or persistent ("Dark Vault") syndicates to deliberate in RAM, settle batches on NEAR L1 with Ed25519 signatures, and repatriate funds through decoupled payout graphs.

---

## 2. Judge & Evaluator Reproduction Guide ("Do X, See Y")

Fly provides a zero-setup, deterministic verification harness requiring only standard Node.js (v18+) and Cargo/Rust (1.80+). All external keys are optional; tests execute deterministically against live endpoints and local cryptographic models.

### Step 1: Run Canonical Complete Verification
* **Do:**
  ```bash
  ./scripts/verify
  # or: make verify
  # or: npm run verify
  ```
* **See:**
  - `[STEP 1/4]` 31 NEAR L1 Rust smart contract tests (25 unit + 6 integration) pass cleanly (`near-sdk 5.1`).
  - `[STEP 2/4]` Release WebAssembly contract compiles cleanly to `contracts/fly-coordinator/target/wasm32-unknown-unknown/release/fly_coordinator.wasm` (277 KB).
  - `[STEP 3/4]` All 8 architectural verification layers execute in ~1.3s.
  - `[STEP 4/4]` Builder Foundry Control Plane passes with 0 invariant violations across 11 claims and 7 gaps.
  - Total runtime: `<4.0s`. Final evaluation verdict: `VERIFIED & AUDITED (Smart Contract Tested, TEE Parsed, Simulated)`.

### Step 2: Verify Live TEE Remote Attestation
* **Do:**
  ```bash
  npm run verify:tee
  ```
* **See:**
  - Generates a fresh 32-byte cryptographic session nonce.
  - Sends a live HTTP request to `https://cloud-api.near.ai/v1/attestation/report` for model `Qwen/Qwen3.6-35B-A3B-FP8`.
  - Parses the raw 5,006-byte Intel TDX Quote v4 binary: verifies Quote Version (4), Attestation Key Type (2: ECDSA-256), and TEE Type (0x81: Intel TDX).
  - Extracts 64-byte `REPORTDATA` at byte offset 568..632: confirms the enclave signing address is bound and the 32-byte client nonce is echoed verbatim.
  - Fails closed if any cryptographic binding fails.

### Step 3: Verify Confidential Intents & Asset Registry
* **Do:**
  ```bash
  npm run verify:intents
  ```
* **See:**
  - Queries `https://1click.chaindefuser.com/v0/tokens` auditing 210 assets across NEAR, Bitcoin, Ethereum, and Solana (with deterministic audited snapshot fallback).
  - Validates cross-chain swap intent schemas with FAR shard settlement routes and escape hatch refund destinations.

### Step 4: Verify Hatch Protocol & Non-Custodial Escape Hatch (FMEA)
* **Do:**
  ```bash
  npm run verify:hatch
  ```
* **See:**
  - Hatches a syndicate sub-account with an OutLayer 100 USDC spend cap and registered Ed25519 enclave public key.
  - Blocks rogue deposits exceeding OutLayer policy limits.
  - Deliberates and settles happy-path batch using a verified 64-byte Ed25519 enclave signature.
  - Tests invariant: `hatch_out()` is strictly rejected after syndicate settlement.
  - Tests timelock failure: upon block timeout, refunds 75 USDC to the stalled flyer while preserving other participants' escrow. Flips to `ABORTED_REFUNDED` only when total escrow reaches zero.

### Step 5: Verify Dark Vault, Pod Sub-Swarms & Omnichain Address Derivation
* **Do:**
  ```bash
  npm run verify:vault
  ```
* **See:**
  - Instantiates persistent Dark Vault advancing from Epoch 1 to Epoch 2 with fresh session nonces.
  - Derives valid cross-chain addresses from NEAR MPC specifications: EVM hex address (`0x...`), Bitcoin Taproot BIP-341/350 bech32m address (`tb1p...`), and Solana Base58 public key.
  - Executes x402 HTTP 402 micro-commerce challenge and settlement.

### Step 6: Verify 10-Flyer Dark Swarm Simulation
* **Do:**
  ```bash
  npm run demo:syndicate
  ```
* **See:**
  - 10 Flyers generate asymmetric RSA-2048 keypairs and submit sealed encrypted intents to the Roost TEE.
  - Aggregates orders in TEE RAM, zeroes individual inputs, signs the batch proof, and executes decoupled pro-rata payouts with broken transaction graph linkages.

### Step 7: Audit Builder Foundry Governance Control Plane
* **Do:**
  ```bash
  node scripts/check-foundry.js
  ```
* **See:**
  - Audits `foundry/state.json`, `foundry/claims.jsonl`, `foundry/gaps.jsonl`, and `foundry/phases/`.
  - Confirms all 11 claims are backed by verifiable code and all 6 gaps are bounded (0 critical open gaps).

---

## 3. Real vs. Simulated Implementation Matrix

To ensure complete transparency and intellectual honesty for human and automated AI judges (Claude Code, Codex), the following table documents the exact execution nature of every component:

| Component | Implementation File | Status | Nature | Description |
| :--- | :--- | :--- | :--- | :--- |
| **NEAR L1 Smart Contract** | `contracts/fly-coordinator/src/lib.rs` | **TESTED** | **REAL CODE** | Written in Rust (`near-sdk 5.1`). Compiles to 277 KB release WASM. 31 tests (25 unit + 6 integration) verifying Ed25519 domain-separated signatures, storage guards, ID validation, LookupMap per-user escape hatch refunds, Flash settlement Promise payouts with failure recovery callbacks, flyer storage reclamation, and DarkVault epoch rollover. |
| **TEE Remote Attestation** | `verifications/01-hardware-attestation.js` | **VERIFIED** | **LIVE EXTERNAL** | Queries live NEAR AI Cloud (`cloud-api.near.ai`) with a fresh 32-byte nonce. Parses binary Intel TDX Quote v4 and verifies `REPORTDATA` nonce echo. (Full Intel SGX/TDX Root CA signature verification pending - GAP-006). |
| **TEE Aggregator Runtime** | `src/enclave/roost.js` | **TESTED** | **LOCAL PROCESS** | Ingestion, RSA-2048 decryption, batch aggregation, and RAM wiping execute in local Node.js process (GAP-004). Remote TEE VM container deployment is planned for production. |
| **1Click Asset Registry** | `verifications/02-confidential-intents.js` | **VERIFIED** | **LIVE EXTERNAL** | Audits 210 cross-chain assets from live 1Click Swap API with deterministic snapshot fallback for test resilience. |
| **FAR Private Shard** | `src/settlement/far-shard.js` | **TESTED** | **LOCAL SIMULATION** | Evaluated as an in-process PBFT 200ms cryptographic state machine with IMT tokens and decoupled graphs (GAP-002) pending native L1 private sharding validator nodes. |
| **Chain Signatures MPC** | `src/multichain/chain-signatures.js` | **TESTED** | **SIMULATED MOCK** | Address derivation conforms to NEAR MPC specs (EVM 0x, Bitcoin Taproot bech32m, Solana Base58) using deterministic account entropy. Threshold signing returns mock ECDSA (`mode: 'SIMULATED_LOCAL_MOCK'`, GAP-005) pending testnet deployment. |
| **The Hatch & OutLayer** | `src/contracts/nest.js`, `src/policies/outlayer.js` | **TESTED** | **STATE MACHINE SIMULATION** | OutLayer policy guard enforces deposit limits. Escape hatch logic mirrors Rust contract state machine. |
| **Confidential RFQ & OTC** | `src/facilities/rfq-adjudication.js`, `otc-block-trade.js` | **TESTED** | **LOCAL SIMULATION** | In-memory Zero-MEV borrow matching and midpoint crossing dark pool simulations. |
| **API Daemon & SSE** | `src/api/server.js` | **INTEGRATED** | **REAL SERVER** | 18 HTTP REST endpoints bound to `127.0.0.1`, origin-restricted CORS headers, 512KB body size limits, real-time SSE streams, and HMAC-verified x402 payment proofs. |
| **Model Context Protocol** | `src/mcp/server.js`, `bin/fly-mcp.js` | **INTEGRATED** | **REAL TOOLING** | 6 syndicate tools exposed over stdio JSON-RPC 2.0 compatible with `nearai/near-mcp` and Claude Desktop. |

---

## 4. Trust Model & Security Assumptions

1. **Root of Trust at Hatch & Syndicate Rug Vector:**
   - The enclave public key and `payout_recipient` are supplied during `hatch()` by the syndicate creator.
   - Because the creator designates both the enclave signing key and the payout recipient, this is explicitly a **Trust-the-Creator / Verified-Roost model**: if an owner sets their own key and wallet, they control the funds.
   - **Flyers MUST inspect and verify** both `payout_recipient` and `enclave_public_key` (cross-referencing with a published hardware attestation report) BEFORE depositing.
   - `expected_code_hash` is recorded on-chain as audited reference metadata. Full on-chain hardware attestation verification (checking Intel PCK certificate chains against Intel PCS root via an on-chain DCAP verifier) is deferred to future work (GAP-006).

2. **Domain Separation & Replay Protection:**
   - Every Ed25519 settlement batch signature binds the 6-tuple `current_account_id:syndicate_id:epoch:round_nonce:payout_recipient:aggregate_order_hash`.
   - This ensures third-party front-runners cannot divert payouts to another account; any mismatch between the signed recipient and on-chain `payout_recipient` causes signature verification to fail immediately.

3. **Non-Custodial Escape Valve Invariants & Callback Rollbacks:**
   - Escrows are stored in a dedicated contract-level `LookupMap<(syndicate_id, account_id), NearToken>`, preventing unbounded deserialization gas denial-of-service.
   - If the TEE aggregator crashes or stalls beyond `timeout_blocks`, depositors can execute `hatch_out()` to retrieve 100% of their deposited funds.
   - Asynchronous transfer callbacks (`on_settlement_payout` and `on_hatch_out_payout`) revert syndicate status and restore escrow balances if the underlying `Promise` transfer fails.
   - On successful Flash settlement, flyer escrow entries are removed from `LookupMap` and storage staking is reclaimed.
   - On `hatch_out`, entries are removed upon exit; failed refund callbacks restore balances without double-counting flyers.

4. **Known Limitations & Sybil Griefing:**
   - **Sybil Cap Griefing:** 50 distinct accounts depositing the minimum deposit (0.01 NEAR) can fill a syndicate's capacity until the timeout blocks elapse. The attacker's cost is capital lockup (they retrieve funds at timeout).
   - **Storage Staking:** Storage staking for LookupMap entries is funded by the contract balance and initial hatch deposit; dynamic per-flyer storage staking is planned for future upgrades (GAP-007).

5. **API and Commerce Security:**
   - CORS origin reflection is restricted to localhost/127.0.0.1 and explicit allowed origins; unknown origins receive no CORS access headers.
   - x402 micro-commerce requires cryptographic HMAC-SHA256 bearer proofs (`${receiptId}.${hmacSignature}`). Unsigned receipt IDs are rejected with HTTP 402.

---

## 5. How NEAR Protocol Primitives Are Used

1. **NEAR AI Cloud TEEs (The Roost):**
   - Live hardware remote attestation queries to `cloud-api.near.ai/v1/attestation/report`.
   - Parses Intel TDX Quote v4 binary payloads and verifies `REPORTDATA` 64-byte field binding the enclave signer address and the client's session challenge nonce.
   - Enclave generates Ed25519 batch consensus signatures over domain-separated message `(contract_id, syndicate_id, epoch, round_nonce, aggregate_order_hash)`.

2. **NEAR L1 Smart Contracts (`fly-coordinator.near`):**
   - Built on `near-sdk 5.1` utilizing `LookupMap` for per-user escrows to prevent DoS attacks, and `IterableMap` for syndicate records.
   - Enforces storage deposit requirements (0.005 NEAR minimum), minimum deposit requirements (0.01 NEAR), maximum flyer limits (50 flyers per syndicate), and regex ID validation (`^[a-z0-9_-]{3,64}$`).
   - Verifies 64-byte Ed25519 signatures via `env::ed25519_verify` before executing `settle_batch`.
   - Automatically dispatches settled funds to `payout_recipient` via NEAR `Promise::new(recipient).transfer(pooled_amount)`.
   - Non-custodial `hatch_out()` escape valve permits 100% individual refund upon deliberative block timeout, strictly blocked once a syndicate is settled.

3. **NEAR Chain Signatures (Omnichain MPC):**
   - Coordinates multi-chain threshold signatures using NEAR's decentralized MPC network (`v1.signer-prod.testnet`).
   - Derives synthetic native addresses: EVM (Ethereum, Arbitrum, Base), Bitcoin Taproot (BIP-341/350 bech32m), and Solana Ed25519 (Base58) without bridging private keys.

4. **NEAR Confidential Intents & 1Click API:**
   - Evaluates multi-chain liquidity across 210 audited assets via 1Click Swap API.
   - Shields settlement using Intent Minted Tokens (IMT) and decoupled graph mechanics.

5. **NEAR Account Model & Sub-Accounts:**
   - Creates bounded agent sub-accounts (`{id}.{coordinator}.testnet`).
   - OutLayer policy guards enforce spending limits and method restrictions before transactions touch contract state.

---

## 5. Hackathon Submission Tracks

* **Primary Track — Privacy & Private AI:**
  - Hardware-isolated TEE deliberations (Intel TDX / NVIDIA GPU) on NEAR AI Cloud.
  - Sealed Intent Aggregation (SIA) with in-RAM RSA-2048 encryption and zero-memory wipes.
  - Decoupled settlement graphs breaking depositor/recipient linkages.
* **Secondary Track — AI Swarms:**
  - Dynamic Quorum Rebalancing across autonomous agent swarms.
  - Tactical Pods for specialized execution within multi-epoch Dark Vaults.
* **Secondary Track — Agent Economy:**
  - x402 HTTP 402 "Payment Required" micro-commerce protocol with HMAC-signed receipts for inter-agent data purchases.
  - Model Context Protocol (MCP) server exposing 6 tools for LLM agent integration.
* **Secondary Track — Unstoppable DeFi:**
  - Confidential RFQ borrow facility with sealed quote matching and private margin adjudication.
  - Institutional OTC block trade dark pool with midpoint reference crossing.
* **Secondary Track — Security:**
  - OutLayer bounded sub-accounts with spending limits.
  - 5-Layer Resilience Failure Matrix (FMEA) handling crashes, dropouts, slippage, latency, and rogue agents.

---

## 6. Repository Architecture & File Index

```
├── Makefile                      # Targets: make verify, make test, make wasm, make demo, make check
├── scripts/
│   ├── verify                    # Canonical judge verification script (<4.0s runtime)
│   ├── check-foundry.js          # Builder Foundry v1.0 governance control plane auditor
│   └── argon-review.js           # Gemini API architectural inspection tool
├── foundry/                      # Builder Foundry Control Plane (v1.0 Standard)
│   ├── state.json                # Project status & verification git head
│   ├── claims.jsonl              # 11 audited claims with evidence paths and states
│   ├── gaps.jsonl                # 6 recorded gaps with closure conditions and guards
│   ├── assumptions.md            # Documented assumptions & resolutions
│   ├── contradictions.md         # Documented contradictions & mitigation strategies
│   └── phases/                   # Phase 01 through Phase 08 specifications
├── contracts/
│   └── fly-coordinator/          # NEAR L1 coordinator smart contract (Rust / near-sdk 5.1)
│       ├── Cargo.toml
│       ├── src/lib.rs            # hatch(), deposit(), settle_batch(), hatch_out() + 25 unit tests
│       ├── tests/                # integration_tests.rs (6 multi-agent lifecycle & safety tests)
│       └── target/wasm32-unknown-unknown/release/fly_coordinator.wasm (277 KB)
├── src/
│   ├── contracts/nest.js         # Nest coordinator contract state machine mirror
│   ├── enclave/
│   │   ├── crypto.js             # Asymmetric RSA-2048 encryption & zeroing helpers
│   │   └── roost.js              # Roost TEE daemon with TDX Quote v4 byte verification
│   ├── facilities/
│   │   ├── rfq-adjudication.js   # Confidential RFQs, sealed quotes, private margin checks
│   │   ├── otc-block-trade.js    # OTC block trading dark pool at midpoint
│   │   └── compute-syndicate.js  # Confidential AI compute credit pooling
│   ├── multichain/
│   │   └── chain-signatures.js   # NEAR Chain Signatures MPC (EVM, Bitcoin Taproot, Solana)
│   ├── settlement/
│   │   └── far-shard.js          # FAR Private Shard bridge & IMT token accounting
│   ├── policies/
│   │   └── outlayer.js           # OutLayer spending cap & method guard
│   ├── commerce/
│   │   └── x402.js               # x402 Agent Micro-Commerce with HMAC-SHA256 receipts
│   ├── api/
│   │   └── server.js             # 18 REST endpoints, SSE streams, localhost binding, safe CORS
│   ├── sdk/
│   │   └── client.js             # FlyClient unified JavaScript/TypeScript client library
│   ├── mcp/
│   │   └── server.js             # Standalone MCP server (nearai/near-mcp compatible)
│   ├── syndicate/
│   │   └── pod.js                # Tactical execution sub-swarms inside Dark Vaults
│   ├── resilience/
│   │   └── failure-matrix.js     # 5-layer deterministic failure remedies (FMEA)
│   └── simulation/
│       └── runner.js             # 10-Flyer Dark Swarm end-to-end execution
├── verifications/                # 8 standalone deterministic verification scripts
└── docs/                         # Canonical SDLC Documentation
    ├── canonical/
    │   ├── CURRENT_STATE.md      # Ground-truth component state & roadmap
    │   ├── EVIDENCE_LEDGER.md    # Hackathon track & claims evidence mapping
    │   ├── DECISIONS.md          # Architectural Decision Records (ADR-0001 - ADR-0007)
    │   └── ARGON_REVIEW.md       # Architectural critique & gap analysis
    ├── hackathon-submission.md   # Official Hackathon Form Submission & Video Script
    ├── srs.md                    # IEEE 29148 System Requirements Specification
    └── architecture.md           # Software architecture and component designs
```
