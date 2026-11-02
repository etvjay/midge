# Fly Protocol — Canonical Evidence Ledger

**Version:** 1.0.0  
**Governance Standard:** Builder Foundry v1.0 & Repository Starter Virtuous Cycle  
**Hackathon:** NEAR HACKATHON: Build Beyond Boundaries (Nov 1–14, 2026)  
**Git Head:** `5a4830d8fc33670dad3707e5a76fab1c6c49c4ca`  

---

## 1. Hackathon Track Alignment & Evidence Proofs

### Track 1: Privacy & Private AI (Primary Track)
* **Hackathon Criteria:** Demonstrable zero-knowledge or confidential execution, hardware attestation, and data protection for AI workflows.
* **Fly Primitive:** NEAR AI Cloud TEEs (The Roost) + Sealed Intent Aggregation (SIA) + Zero-Prompt Logging Compute Syndicate.
* **Verification Command:** `npm run verify:tee && npm run verify:otc`
* **Evidence Output:**
  ```text
  [PASS] HAQ VERIFICATION SUCCESSFUL: Enclave state is genuine & verified.
    - Gateway Attestation: VALID
    - Intel TDX Quote:     PRESENT
    - Gateway Signer Key:  0xb98a789cdc4817275f5155593ba73ef2a957e779
    - Model TEE Enclave:   ACTIVE
    - NVIDIA GPU Payload:  ATTESTED
    - Model Signer Key:    0xfdbd7952498b333206f360d71d97a1e0961e8ddf
  ```
* **State:** `LIVE_DEMONSTRATED`

---

### Track 2: AI Swarms & Agent Economy (Secondary Track)
* **Hackathon Criteria:** Autonomous multi-agent coordination, micro-payments, and standardized agent tool interfaces.
* **Fly Primitive:** 10-Flyer Dark Swarm Deliberation + x402 Micro-Commerce (PingPay) + MCP Server (`nearai/near-mcp` compatible).
* **Verification Command:** `npm run demo:syndicate && npm run verify:api`
* **Evidence Output:**
  ```text
  [PASS] DARK SWARM EXECUTION COMPLETE: 10/10 FLYERS PROCESSED
    - Minted Sub-Account:  dark-swarm-10.fly.testnet
    - Quorum Required:     7/10 Flyers
    - 10 Asymmetrically Encrypted Intents Ingested into Enclave RAM.
    - Raw Member RAM:      CLEARED (Zero-Knowledge Invariant Preserved)
    - Decoupled Graph:     Zero on-chain links between depositor wallets and payout addresses.
  [PASS] HTTP DAEMON, SSE, x402 & MCP SERVER VERIFIED (Integrated Gateway).
    - HTTP 402 Challenge: Issued and redeemed via PingPay micropayment HMAC bearer proof
    - MCP Tools:           6 Tools Listed & Executed over stdio JSON-RPC
  ```
* **State:** `INTEGRATED`

---

### Track 3: Unstoppable DeFi & Cross-Chain Intents (Secondary Track)
* **Hackathon Criteria:** Non-custodial financial operations, omnichain execution, and zero-MEV order routing.
* **Fly Primitive:** 1Click Swap API + FAR Private Shard (IMT) + NEAR Chain Signatures MPC + Confidential RFQ Borrow Facility.
* **Verification Command:** `npm run verify:intents && npm run verify:vault && npm run verify:rfq`
* **Evidence Output:**
  ```text
  [PASS] CONFIDENTIAL INTENTS VERIFIED: 1Click API live & contract schemas match (210 Assets).
  [PASS] DARK VAULT & MULTICHAIN VERIFIED (Simulated Environment):
    - EVM (Ethereum):    0xff8c3d0757a15f0958393b17a2b93927603e17ad
    - Bitcoin (Taproot): tb1p40a3xxnjmgljwzlyx6wllrpaqat6zhcftqunk9azhyujwcp7z7ksu3z4qe
    - Solana (Ed25519):  CaLmYWGvnkjfRFx3JEyuj4n9UzXumnNNvH5K3GAA869a
  [PASS] CONFIDENTIAL RFQ & ADJUDICATION VERIFIED (Simulated Facility):
    - $10,000,000 USDC borrowed against 5,000 ETH @ 4.9% APR (Zero DEX flash dumps)
  ```
* **State:** `SIMULATED`

---

## 2. Complete Protocol Claims Ledger

| Claim ID | Protocol Claim | Verified State | Verification Command | Evidence Location |
|---|---|---|---|---|
| **CLM-HAQ-01** | Live TEE Hardware Attestation quote from NEAR AI Cloud (Intel TDX & NVIDIA GPU) with fresh nonce validation | `LIVE_DEMONSTRATED` | `npm run verify:tee` | `verifications/01-hardware-attestation.js` |
| **CLM-INTENTS-01** | Cross-chain confidential intent schema audits 210 assets via 1Click Swap API with FAR Shard routing | `LIVE_DEMONSTRATED` | `npm run verify:intents` | `verifications/02-confidential-intents.js` |
| **CLM-HATCH-01** | Nest coordinator binds sub-accounts to OutLayer spending caps and executes 100% refund on TEE timelock expiration | `TESTED` | `npm run verify:hatch` | `verifications/03-hatch-escape-hatch.js` |
| **CLM-VAULT-01** | Dark Vault manages multi-epoch rollover, Pod sub-swarms, and derives omnichain addresses for BTC, ETH, and SOL | `SIMULATED` | `npm run verify:vault` | `verifications/04-dark-vault-epochs.js` |
| **CLM-RFQ-01** | Confidential RFQ borrow facility executes sealed quote matching and private margin adjudication without public liquidation dumps | `SIMULATED` | `npm run verify:rfq` | `verifications/05-confidential-rfq-adjudication.js` |
| **CLM-OTC-01** | Institutional dark pool crosses complementary block trades at midpoint reference prices with zero slippage, and pools AI compute budgets | `SIMULATED` | `npm run verify:otc` | `verifications/06-otc-and-compute-facilities.js` |
| **CLM-FMEA-01** | 5-layer resilience failure matrix handles Enclave crashes, Agent dropouts, Solver slippages, MPC timeouts, and Rogue agents | `TESTED` | `npm run verify:matrix` | `verifications/07-resilience-failure-matrix.js` |
| **CLM-API-01** | Fly API daemon exposes 18 REST endpoints, real-time SSE event streaming, and x402 PingPay micropayment challenge middleware | `INTEGRATED` | `npm run verify:api` | `verifications/08-api-sse-mcp-e2e.js` |
| **CLM-MCP-01** | Model Context Protocol (MCP) server exposes 6 syndicate tools compatible with `nearai/near-mcp` | `INTEGRATED` | `npm run verify:api` | `src/mcp/server.js`, `bin/fly-mcp.js` |
| **CLM-RUST-01** | Production NEAR L1 smart contract in Rust (near-sdk 5.1) compiles to release WebAssembly (271 KB) and passes 23 tests (19 unit + 4 integration) | `TESTED` | `npm run verify:rust && npm run build:wasm` | `contracts/fly-coordinator/src/lib.rs`, `contracts/fly-coordinator/tests/integration_tests.rs` |
| **CLM-SWARM-01** | 10-Flyer Dark Swarm simulation performs RSA-2048 encryption, in-RAM aggregation, zero-memory wipes, and decoupled pro-rata payouts | `SIMULATED` | `npm run demo:syndicate` | `src/simulation/runner.js` |

---

## 3. Single-Command Reproducibility

Any evaluator or autonomous verification agent can reproduce every claim above via:
```bash
# Complete Judge Verification (<2.0s)
./scripts/verify

# Or via Makefile
make verify

# Or via npm
npm run verify
```
All verifications are deterministic, require zero external API keys, and fail closed if any invariant is violated.
