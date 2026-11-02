# Fly: Autonomous Syndicate Network for Private Systems on NEAR

[![CI](https://github.com/fly-syndicate/fly-protocol/actions/workflows/ci.yml/badge.svg)](https://github.com/fly-syndicate/fly-protocol/actions/workflows/ci.yml)

**NEAR HACKATHON: Build Beyond Boundaries (November 1–14, 2026)**  
**Primary Track:** Privacy & Private AI  
**Secondary Tracks:** AI Swarms, Agent Economy, Unstoppable DeFi, Security  

---

## 1. Core Thesis & What Fly Solves

When autonomous AI agent swarms and human capital collectives coordinate on public blockchains, they face an intractable trilemma: **custody risk**, **alpha leakage**, and **liveness failure**. Existing privacy solutions either shield simple token transfers while leaving off-chain deliberation unverified, or force participants to surrender their private keys to an off-chain bot or enclave that can crash, trap funds, or be terminated by an operator. Conversely, public multi-sigs like SputnikDAO leak trades to mempool front-runners, expose participant weights, and stall in committee deadlock.

**Fly's Architectural Breakthrough: The TEE is an Arbiter, Never a Custodian.**  
Fly is an autonomous syndicate protocol on NEAR Protocol. Collectives of AI agents and human wallets pool capital into bounded sub-accounts (`hatch`) governed by OutLayer spend policies. Members submit asymmetric encrypted intents directly into hardware-isolated Trusted Execution Environments (**NEAR AI Cloud Intel TDX / NVIDIA CVM**). Deliberation, private pricing, and Sealed Intent Aggregation (SIA) execute exclusively inside enclave RAM before being wiped. 

The enclave never holds custody; it merely acts as a cryptographic oracle whose sole power is signing an aggregate batch settlement order verified by the NEAR L1 coordinator contract (`c.fly-1793636729.testnet`) in just 5.81 TGas. Omnichain orders settle natively across Ethereum, Bitcoin Taproot, and Solana via **NEAR Chain Signatures MPC** (`v1.signer-prod.testnet`). Crucially, if an enclave stalls, crashes, or goes rogue, Fly's **Hatch Protocol** provides a 100% non-custodial, permissionless escape hatch (`hatch_out`): any individual depositor can reclaim their exact escrow balance after a block timelock without coordinator permission and without draining other flyers.

---

## 2. Judge & Evaluator Reproduction Guide ("Do X, See Y")

Fly provides a zero-setup, deterministic verification harness requiring standard Node.js (v18+) and Cargo/Rust (1.80+). All verifications can be inspected with a single canonical command:

```bash
./scripts/verify
# or: make verify
# or: npm run verify
```
*Total verification runtime: **<25.0s** (Deterministic, 36 Rust tests, DCAP Root CA bound, zero external keys needed).*

---

### Step 0: Inspect Live NEAR Testnet Deployment & Transactions
Fly is deployed and live on NEAR Testnet at coordinator account:  
👉 **[`c.fly-1793636729.testnet`](https://testnet.nearblocks.io/address/c.fly-1793636729.testnet)**

* **Do:**
  ```bash
  npm run verify:testnet
  ```
* **See:**
  - Audits 8 on-chain transactions executed on NEAR Testnet:
    1. **Syndicate Hatch:** [`AEZ7Ar5LXQekRUp5RdpYYRAPrGAKGqXA4iVriXPPrhL5`](https://testnet.nearblocks.io/txns/AEZ7Ar5LXQekRUp5RdpYYRAPrGAKGqXA4iVriXPPrhL5)
    2. **Flyer 1 Deposit (0.02 NEAR):** [`97sBa13ErjwjL3hJQWWQjHhyNJqJGT4uHZ4JwqLBiqpa`](https://testnet.nearblocks.io/txns/97sBa13ErjwjL3hJQWWQjHhyNJqJGT4uHZ4JwqLBiqpa)
    3. **Flyer 2 Deposit (0.02 NEAR):** [`VshLnMCWvyhXApZyeV35kTLxH5FC3iXAF5XF6Qk42ek`](https://testnet.nearblocks.io/txns/VshLnMCWvyhXApZyeV35kTLxH5FC3iXAF5XF6Qk42ek)
    4. **Flyer 3 Deposit (0.02 NEAR):** [`J9iVhzc7QUvoFBHfsJ7KSat7LbfMtwXaicTntXyF5PdQ`](https://testnet.nearblocks.io/txns/J9iVhzc7QUvoFBHfsJ7KSat7LbfMtwXaicTntXyF5PdQ)
    5. **Flash Settlement (5.81 TGas):** [`12vpDrnpZudg8egtdMXvt27sDfQjk9sZTg3SzJREadUh`](https://testnet.nearblocks.io/txns/12vpDrnpZudg8egtdMXvt27sDfQjk9sZTg3SzJREadUh) — Verifies Ed25519 signature and dispatches 0.06 NEAR payout.
    6. **Escape Hatch Syndicate Hatch:** [`HWZEtG8neAgvseohv63ba4B2FcXW36vvPPmMZyLAyQJu`](https://testnet.nearblocks.io/txns/HWZEtG8neAgvseohv63ba4B2FcXW36vvPPmMZyLAyQJu)
    7. **Flyer 2 Escape Deposit:** [`DU9ULPqj3rDcht5wQ53nrobq5EdLdJCENhq8tn2nyQNk`](https://testnet.nearblocks.io/txns/DU9ULPqj3rDcht5wQ53nrobq5EdLdJCENhq8tn2nyQNk)
    8. **Non-Custodial Escape Hatch (4.92 TGas):** [`DR3VmCytXwPM1pk7pvN9GLQnStRWdvEH9eBAZTc7vFgk`](https://testnet.nearblocks.io/txns/DR3VmCytXwPM1pk7pvN9GLQnStRWdvEH9eBAZTc7vFgk) — Repatriates 100% escrow balance after timelock.

---

### Step 1: Run Canonical Complete Verification
* **Do:**
  ```bash
  ./scripts/verify
  ```
* **See:**
  - `[STEP 1/4]` 36 NEAR L1 Rust smart contract tests (28 unit, 6 integration, 2 proptest property-based fuzzing tests across 10,000+ transitions) pass cleanly with Clippy and Fmt (`near-sdk 5.1`).
  - `[STEP 2/4]` Release WebAssembly contract compiles cleanly to `target/wasm32-unknown-unknown/release/fly_coordinator.wasm` (319 KB).
  - `[STEP 3/4]` 9 architectural verification layers execute in ~8s, validating live Intel TDX DCAP verification, deployed testnet contract states, TEE inference attestation, and API controls.
  - `[STEP 4/4]` Builder Foundry Control Plane passes with 0 invariant violations across 11 claims and 7 gaps.

---

### Step 2: Verify Live Intel TDX DCAP-QVL Remote Attestation
* **Do:**
  ```bash
  npm run verify:tee
  ```
* **See:**
  - Generates a fresh 32-byte cryptographic session nonce.
  - Queries `https://cloud-api.near.ai/v1/attestation/report` for active enclave model `Qwen/Qwen3.6-35B-A3B-FP8`.
  - Parses raw 5,006-byte Intel TDX Quote v4 binary: verifies Quote Version (4), Attestation Key Type (2: ECDSA-256), and TEE Type (0x81: Intel TDX).
  - Validates `REPORTDATA` 64-byte field binding the gateway signer and client nonce.
  - **DCAP-QVL Verification:** Executes `dcap-qvl verify` validating Intel PCK certificates, SGX/TDX Intermediate CA, and Intel SGX Root CA. Reports TCB status `UpToDate` with 0 security advisories.
  - **Tamper Resilience:** Mutates a byte in the TD Report and confirms DCAP immediately rejects it with cryptographic failure.

---

### Step 3: Verify Live NEAR Chain Signatures MPC Call
* **Do:**
  ```bash
  npm run verify:mpc
  ```
* **See:**
  - Connects to NEAR Testnet and queries the official MPC signing contract: `v1.signer-prod.testnet`.
  - Derives omnichain public keys and native addresses:
    - **EVM (Ethereum / Arbitrum / Base):** `0x0309Dbc3e7F5C40Bb957723Cebb4BE5329BB22c0`
    - **Bitcoin Taproot (BIP-341/350 bech32m):** `tb1p6ju0fp902dwqfxk80k82cdtj2kk3eutdez7xwqxap3p4ydvfkj8qyldyzl`
    - **Solana Ed25519 (Base58):** `FKP1RDHJnkxGNx8umRSNzp1k15UM9P2W6dFZDFEGATz5`
  - Calls `sign` on `v1.signer-prod.testnet` (tx: [`6ekiiKnp7QGMWYZWzE5cC8DZWwBmw8mS8MPm9JAvYsnk`](https://testnet.nearblocks.io/txns/6ekiiKnp7QGMWYZWzE5cC8DZWwBmw8mS8MPm9JAvYsnk)).
  - Reconstructs uncompressed ECDSA public key from $(r, s, v)$ and cryptographically verifies it against the derived key byte-for-byte.

---

### Step 4: Verify Hatch Protocol & Escape Hatch FMEA
* **Do:**
  ```bash
  npm run verify:hatch
  ```
* **See:**
  - Audits local OutLayer deposit caps and Ed25519 signature bounds.
  - Directly queries deployed testnet contract (`c.fly-1793636729.testnet`) via public RPC without keys:
    - Confirms `syn-flash-1793637420` reached `Settled` with 0 escrow remaining and 0.06 NEAR paid.
    - Confirms `syn-escape-1793637435` reached `AbortedRefunded` with 0 escrow remaining after unilateral `hatch_out`.

---

### Step 5: Verify HTTP Daemon, SSE, x402 & MCP Tooling
* **Do:**
  ```bash
  npm run verify:api
  ```
* **See:**
  - Boots `FlyApiDaemon` on ephemeral port.
  - Verifies Server-Sent Events (SSE) streaming at `/v1/stream/syndicate/{id}`.
  - Executes x402 micro-commerce flow: initial HTTP 402, payment invoice generation, HMAC bearer proof verification, and protected resource release.
  - Audits Model Context Protocol (MCP) server: 8 tools exposed to LLM agents (`fly_hatch_syndicate`, `fly_deposit_escrow`, `fly_submit_sealed_intent`, `fly_list_syndicates`, `fly_get_my_syndicates`, etc.).
  - Verifies Security Controls: public `/health`, protected `/v1/roost/session-key` returning HTTP 401 without `X-Fly-Api-Key` and HTTP 200 with it, and payload limit guard (>512KB rejected with HTTP 413).

---

### Step 6: Run Autonomous Syndicate Network Demo
* **Do:**
  ```bash
  npm run demo:network
  # or: node scripts/network-demo.js
  ```
* **See:**
  - Demonstrates multi-syndicate network topology: 3 specialized autonomous syndicates (`syn-research-alpha`, `syn-trading-beta`, `syn-compute-gamma`) hosted within the single coordinator contract.
  - Cross-syndicate agent membership: `agent-cross.near` concurrently participates as a depositor in Alpha (Research) and Beta (Trading).
  - On-chain registry discovery: queries `list_syndicates(from, limit)` and `get_syndicates_by_member(account_id)` via secondary index.
  - Inter-syndicate value exchange: Beta purchases proprietary volatility alpha from Alpha using the x402 payment scheme.
  - Concurrent execution lifecycles: Beta achieves quorum and settles batch payout, while stalled Gamma safely executes non-custodial `hatch_out` refunds with 0 stuck escrow.

---

## 3. Real vs. Simulated Implementation Matrix

To ensure complete transparency and intellectual honesty for human and automated AI judges (Claude Code, Codex), the following table documents the exact execution status of every protocol component:

| Component | Implementation File | Status | Nature | Description |
| :--- | :--- | :--- | :--- | :--- |
| **NEAR L1 Smart Contract** | `contracts/fly-coordinator/src/lib.rs` | **LIVE DEMONSTRATED** | **DEPLOYED & REAL CODE** | Deployed to testnet at `c.fly-1793636729.testnet`. Written in Rust (`near-sdk 5.1`). Compiles to 319 KB release WASM. 36 tests (28 unit, 6 integration, 2 proptest invariant fuzzers). Real on-chain settlements (5.81 TGas) and escape hatch refunds (4.92 TGas). |
| **TEE Remote Attestation** | `verifications/01-hardware-attestation.js` | **LIVE DEMONSTRATED** | **LIVE EXTERNAL & DCAP-QVL** | Queries live NEAR AI Cloud (`cloud-api.near.ai/v1/attestation/report`) with fresh nonces. Parses binary Intel TDX Quote v4. Verified via `dcap-qvl` to Intel SGX Root CA with TCB `UpToDate`, 0 advisories, and tamper rejection. (GAP-006 CLOSED). |
| **Chain Signatures MPC** | `scripts/testnet-mpc.js`, `src/multichain/chain-signatures.js` | **LIVE DEMONSTRATED** | **LIVE EXTERNAL & MPC SIGNED** | Executed live threshold signing on `v1.signer-prod.testnet` (tx: `6ekiiKnp7QGMWYZWzE5cC8DZWwBmw8mS8MPm9JAvYsnk`). Derived BTC Taproot, EVM, and Solana addresses. Cryptographically verified ECDSA recovery. (GAP-005 CLOSED). |
| **TEE Inference Attestation** | `scripts/verify-inference.js` | **VERIFIED** | **LIVE EXTERNAL / FIXTURE** | Validates official NEAR AI Cloud inference response signatures (`<MODEL>:<req_hash>:<resp_hash>`) via EIP-191 signer recovery against hardware-attested enclave keys. Tamper-rejected on flipped bytes. |
| **1Click Asset Registry** | `verifications/02-confidential-intents.js` | **VERIFIED** | **LIVE EXTERNAL** | Audits 210 cross-chain assets from live 1Click Swap API with deterministic snapshot fallback for test resilience. |
| **The Hatch & OutLayer** | `src/contracts/nest.js`, `src/policies/outlayer.js` | **TESTED** | **LOCAL & ON-CHAIN AUDITED** | OutLayer policy guard enforces deposit limits. Escape hatch logic verified both in local state machine and on deployed testnet contract. |
| **Syndicate Network & Discovery** | `scripts/network-demo.js` | **DEMONSTRATED** | **REAL SCRIPT & DISCOVERY** | Demonstrates 3 specialized syndicates in one coordinator contract, cross-syndicate member discovery (`list_syndicates`, `get_syndicates_by_member`), x402 inter-syndicate commerce, and escape hatch exit. |
| **API Daemon & SSE** | `src/api/server.js` | **INTEGRATED** | **REAL SERVER** | 20 HTTP REST endpoints bound to `127.0.0.1`, `X-Fly-Api-Key` enforcement, origin-restricted CORS, 512KB body size limits, real-time SSE streams, and HMAC-verified x402 payment proofs. |
| **Model Context Protocol** | `src/mcp/server.js`, `bin/fly-mcp.js` | **INTEGRATED** | **REAL TOOLING** | 8 syndicate tools exposed over stdio JSON-RPC 2.0 compatible with Claude Code, Codex, and Claude Desktop. |
| **TEE Aggregator Runtime** | `src/enclave/roost.js` | **TESTED** | **LOCAL PROCESS** | Ingestion, RSA-2048 decryption, batch aggregation, and RAM wiping execute in local Node.js process (GAP-004). Remote TEE VM container deployment is planned for production. |
| **FAR Private Shard** | `src/settlement/far-shard.js` | **TESTED** | **LOCAL SIMULATION** | Evaluated as an in-process PBFT 200ms cryptographic state machine with IMT tokens and decoupled graphs (GAP-002) pending native L1 private sharding validator nodes. |
| **Confidential RFQ & OTC** | `src/facilities/rfq-adjudication.js`, `otc-block-trade.js` | **TESTED** | **LOCAL SIMULATION** | In-memory Zero-MEV borrow matching and midpoint crossing dark pool simulations. |

---

## 4. Trust Model & Security Boundaries

1. **Root of Trust at Hatch (Trust-the-Creator Model):**
   - The enclave public key and `payout_recipient` are defined by the syndicate creator upon calling `hatch()`.
   - **Important:** If an owner sets their own wallet as `payout_recipient` and their own keypair as `enclave_public_key`, they can sign a settlement payout to themselves.
   - Therefore, Fly operates on a **Trust-the-Creator / Verified-Roost model**: Flyers MUST inspect the syndicate's `payout_recipient` and `enclave_public_key` (cross-checking the hardware attestation report) BEFORE depositing escrow.
   - `expected_code_hash` is permanently recorded on-chain as audited reference metadata.

2. **Public Deposits vs. Confidential Deliberation:**
   - **What is Public:** Syndicate creation parameters, flyer account IDs, deposited NEAR amounts, and the final batch payout recipient are recorded on NEAR L1.
   - **What is Confidential:** Individual order parameters (exact token pairs, execution strategies, price limits, slippage tolerance, and inter-agent credit purchases) are encrypted with the Roost's public key and processed exclusively in TEE memory.

3. **Domain Separation & Cryptographic Settlement:**
   - Every Ed25519 settlement batch signature binds the strict 6-tuple:  
     `current_account_id:syndicate_id:epoch:round_nonce:payout_recipient:aggregate_order_hash`.
   - Any front-runner attempting to alter the recipient or replay a signature across contracts, syndicates, or epochs will fail contract verification.

4. **Non-Custodial Escape Valve (`hatch_out`):**
   - Escrows are stored in a contract-level `LookupMap<(syndicate_id, account_id), NearToken>`.
   - If an enclave stalls beyond `timeout_blocks`, any individual depositor can invoke `hatch_out()` to retrieve their exact deposited balance.
   - Other flyers' escrows remain untouched. The contract safely clears the flyer's escrow entry and updates the active flyer counter.
   - If an asynchronous refund `Promise` fails, `on_hatch_out_payout` restores the escrow entry without exceeding the 50-flyer capacity cap.

5. **Sybil Griefing & Resource Bounds:**
   - Syndicates enforce a hard limit of 50 active flyers and a minimum deposit of 0.01 NEAR.
   - Sybil griefing (50 accounts depositing 0.01 NEAR to fill capacity) is bounded: the attacker must lock up capital until `timeout_blocks` elapses. Dynamic per-flyer storage staking is documented in GAP-007.

---

## 5. Network Topology & Discovery Architecture

Fly is designed as an **Autonomous Syndicate Network**: a single NEAR L1 coordinator smart contract hosts multiple independent syndicates, each specialized in a financial or computational mission (e.g. signal research, algorithmic execution, AI compute).

```
                      ┌─────────────────────────────────────────┐
                      │   NEAR L1 Coordinator Smart Contract    │
                      │       (c.fly-1793636729.testnet)        │
                      └────┬─────────────────┬────────────────┬─┘
                           │                 │                │
            ┌──────────────▼─────┐    ┌──────▼──────┐   ┌─────▼──────────────┐
            │ Research Syndicate │    │ Execution   │   │ Compute Syndicate  │
            │ syn-research-alpha │    │ syn-trading │   │ syn-compute-gamma  │
            └─────────┬──────────┘    └──────▲──────┘   └────────────────────┘
                      │                      │
                      └───────[ x402 ]───────┘
                     Micropayment Commerce
```

1. **On-Chain Discovery & Pagination:**
   - **`list_syndicates(from_index, limit)`**: Allows autonomous agents and indexers to discover active syndicates with bounded gas (default page size: 10, max cap: 50).
   - **`list_syndicates_by_member(account_id, from_index, limit)`**: Dedicated secondary index (`member_syndicates: LookupMap<AccountId, Vec<String>>`) enabling instant O(1) membership lookup for agents participating across multiple syndicates.
   - **`get_syndicate_count()`**: Fast O(1) count for pagination boundaries.

2. **Cross-Syndicate Value Exchange (x402 Micropayments):**
   - Syndicates interact through HTTP 402 agent commerce: e.g. Trading Syndicate Beta purchases proprietary volatility alpha signals from Research Syndicate Alpha, authenticated via HMAC bearer receipts and settled peer-to-peer.

3. **NEP-297 Standard Event Stream:**
   - The coordinator emits standard `EVENT_JSON:{"standard":"fly","version":"1.0.0","event":"..."}` logs on `syndicate_hatched`, `syndicate_deposited`, `syndicate_settled`, and `syndicate_hatched_out`.
   - Compensating failure events (`syndicate_settlement_failed`, `syndicate_hatch_out_failed`) ensure off-chain indexers and agent daemons remain perfectly synchronized if asynchronous payout transfers fail.

---

## 6. Architectural Comparison

For an exhaustive architectural comparison contrasting Fly with **NEAR Business (Multisig)**, **Phala Shade Agents**, and **Plain On-Chain Escrow**, see:  
📖 **[`docs/canonical/COMPARISON.md`](docs/canonical/COMPARISON.md)**

For video demo choreography and script, see:  
🎬 **[`docs/canonical/DEMO_SCRIPT.md`](docs/canonical/DEMO_SCRIPT.md)**

For hackathon track justifications and submission assets, see:  
📋 **[`docs/canonical/SUBMISSION_ASSETS.md`](docs/canonical/SUBMISSION_ASSETS.md)**

---

## 7. Repository Architecture & File Index

```
├── Makefile                      # Targets: make verify, make test, make wasm, make demo, make check
├── scripts/
│   ├── verify                    # Canonical judge verification script (<20.0s runtime)
│   ├── check-foundry.js          # Builder Foundry v1.0 governance control plane auditor
│   ├── network-demo.js           # Multi-syndicate network discovery & x402 commerce demo
│   ├── verify-inference.js       # NEAR AI Cloud TEE inference response signature verification
│   ├── testnet-e2e.js            # Live NEAR testnet E2E settlement & escape hatch runner
│   └── testnet-mpc.js            # Live NEAR Chain Signatures MPC threshold signing script
├── foundry/                      # Builder Foundry Control Plane (v1.0 Standard)
│   ├── state.json                # Project status & verification git head
│   ├── claims.jsonl              # 11 audited claims with evidence paths and states
│   ├── gaps.jsonl                # 7 recorded gaps with closure conditions and guards
│   ├── assumptions.md            # Documented assumptions & resolutions
│   └── contradictions.md         # Documented contradictions & mitigation strategies
├── contracts/
│   └── fly-coordinator/          # NEAR L1 coordinator smart contract (Rust / near-sdk 5.1)
│       ├── Cargo.toml
│       ├── src/lib.rs            # hatch(), deposit(), settle_batch(), hatch_out(), list_syndicates()
│       ├── tests/
│       │   ├── unit_tests.rs     # 28 comprehensive unit tests
│       │   ├── integration_tests.rs # 6 multi-agent lifecycle & safety tests
│       │   └── invariants.rs     # 2 proptest property-based fuzzing invariant suites
│       └── target/wasm32-unknown-unknown/release/fly_coordinator.wasm (319 KB)
├── src/
│   ├── contracts/nest.js         # Nest coordinator contract state machine mirror
│   ├── enclave/
│   │   ├── crypto.js             # Asymmetric RSA-2048 encryption & zeroing helpers
│   │   └── roost.js              # Roost TEE daemon with TDX Quote v4 byte verification
│   ├── multichain/
│   │   └── chain-signatures.js   # NEAR Chain Signatures MPC (EVM, Bitcoin Taproot, Solana)
│   ├── api/
│   │   └── server.js             # 20 REST endpoints, SSE streams, X-Fly-Api-Key, 512KB limit
│   ├── mcp/
│   │   └── server.js             # Standalone MCP server (8 tools for AI agent swarms)
│   └── facilities/               # RFQ, OTC dark pool, and compute credit syndicate modules
├── verifications/                # 9 standalone architectural verification scripts
│   └── fixtures/                 # Recorded fixtures for offline deterministic verification
└── docs/                         # Canonical SDLC Documentation
    └── canonical/
        ├── COMPARISON.md         # Comparative analysis vs multisigs, shade agents, escrow
        ├── DEMO_SCRIPT.md        # 3-minute video recording script
        ├── SUBMISSION_ASSETS.md  # X post, project description, 5-track rationale
        ├── testnet-evidence.json # 8 live NEAR testnet transaction records
        ├── mpc-evidence.json     # Live Chain Signatures MPC transaction record
        ├── inference-evidence.json # NEAR AI Cloud TEE inference response signature record
        └── EVIDENCE_LEDGER.md    # Evidence ledger with testnet explorer links
```
