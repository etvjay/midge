# Fly Protocol — Canonical Current State

**Repository Version:** 1.0.0  
**Git Head:** `9ed0c93d746855a51ccb79cacde5850072cae510`  
**Governance Standard:** Builder Foundry v1.0  
**Hackathon Target:** NEAR HACKATHON: Build Beyond Boundaries (Nov 1–14, 2026)  
**Overall Status:** `TESTED_AND_INTEGRATED`  

---

## 1. Executive Summary

Fly is an autonomous syndicate network purpose-built for private systems on NEAR Protocol. It enables autonomous AI agents, quant funds, and privacy collectives to pool capital, deliberate in hardware-attested enclaves, and execute cross-chain operations as a unified front without leaking member identities, proprietary trading models, prompt weights, or internal equity splits to public mempools.

All 8 architectural verification layers, the NEAR L1 Rust smart contract (23 tests: 19 unit + 4 integration with domain-separated Ed25519 signature verification, LookupMap escrow storage, and Flash Promise settlement payouts with failure recovery callbacks), release WebAssembly binary (271 KB), and the Builder Foundry governance control plane are implemented and verified in **<4.0 seconds**.

---

## 2. Component Implementation & Verification Matrix (Real vs. Simulated)

| Component | Surface / Path | Execution Nature | Verification Command | Cryptographic Evidence / Deliverable |
|---|---|---|---|---|
| **The Roost (Attestation)** | `src/enclave/roost.js` | **LIVE DEMO** | `npm run verify:tee` | Live HTTP query to `cloud-api.near.ai/v1/attestation/report` with 32-byte nonce; Intel TDX Quote v4 parsed & nonce bound (GAP-006) |
| **The Roost (Enclave Runtime)** | `src/enclave/roost.js` | **LOCAL SIMULATION** | `npm run demo:syndicate` | In-memory Sealed Intent Aggregation (SIA), RSA-2048 encryption, and Ed25519 signature generation |
| **1Click Asset Registry** | `verifications/02-confidential-intents.js` | **LIVE AUDIT** | `npm run verify:intents` | 210 assets audited live across NEAR, BTC, ETH, SOL via 1Click Swap API with audited snapshot fallback |
| **FAR Private Shard** | `src/settlement/far-shard.js` | **LOCAL SIMULATION** | `npm run verify:vault` | ~200ms PBFT consensus simulation, IMT mint/burn, decoupled payout graph (GAP-002) |
| **The Hatch & OutLayer** | `src/contracts/nest.js`, `src/policies/outlayer.js` | **TESTED (JS MODEL)** | `npm run verify:hatch` | State machine mirror and unit tests for `*.testnet` sub-accounts, 100 USDC spend cap, per-user 100% refund on TEE timeout |
| **Dark Vault & Pods** | `src/contracts/nest.js` | **SIMULATED** | `npm run verify:vault` | Multi-epoch progression (Epoch 1 → 2), Pod sub-syndicates (`quant-arb-pod-01`) |
| **Chain Signatures MPC** | `src/multichain/chain-signatures.js` | **SIMULATED MOCK** | `npm run verify:vault` | Derived addresses: Taproot Bitcoin, EVM (Ethereum/Arbitrum), and Solana Ed25519 per NEAR MPC spec (GAP-005) |
| **Confidential RFQs** | `src/facilities/rfq-adjudication.js` | **LOCAL SIMULATION** | `npm run verify:rfq` | $10M USDC borrow against 5,000 ETH @ 4.9% APR; private margin check without DEX dumps |
| **OTC Block Dark Pool** | `src/facilities/otc-block-trade.js` | **LOCAL SIMULATION** | `npm run verify:otc` | 10,000 wNEAR crossed at $4.00/NEAR midpoint with 0% slippage |
| **AI Compute Syndicate** | `src/facilities/compute-syndicate.js` | **LIVE ATTEST / LOCAL EXEC** | `npm run verify:otc` | Hardware-attested inference on `Qwen/Qwen3.6-35B-A3B-FP8` with zero prompt logging |
| **5-Layer Resilience (FMEA)** | `src/resilience/failure-matrix.js` | **TESTED** | `npm run verify:matrix` | Deterministic handling: Enclave crash, Agent dropout, Solver slippage, MPC timeout, Rogue agent |
| **FlyApiDaemon & SSE** | `src/api/server.js` | **INTEGRATED (Localhost)** | `npm run verify:api` | 18 HTTP REST endpoints on 127.0.0.1, real-time Server-Sent Events stream (`/v1/stream/syndicate/:id`) |
| **x402 Agent Commerce** | `src/commerce/x402.js` | **INTEGRATED** | `npm run verify:api` | HTTP 402 challenge, PingPay confidential micropayment HMAC bearer verification, token-gated alpha |
| **MCP Server** | `src/mcp/server.js`, `bin/fly-mcp.js` | **INTEGRATED (stdio)** | `npm run verify:api` | 6 tools exposed via stdio JSON-RPC 2.0 compatible with `nearai/near-mcp` |
| **FlyClient SDK** | `src/sdk/client.js` | **TESTED** | `npm run verify:api` | Unified JavaScript/TypeScript client library |
| **NEAR L1 Smart Contract** | `contracts/fly-coordinator` | **TESTED** | `npm run verify:rust` | 23 Rust tests (19 unit + 4 integration) in `near-sdk` 5.1 with Ed25519 signature checks, LookupMap storage guards, Flash Promise payouts, and refund safety |
| **Release WASM Binary** | `contracts/fly-coordinator/target` | **TESTED** | `npm run build:wasm` | 271 KB compiled WebAssembly binary (`wasm32-unknown-unknown`) |
| **Foundry Control Plane** | `foundry/` | **INTEGRATED** | `npm run check:foundry` | `state.json`, `claims.jsonl` (11 claims), `gaps.jsonl` (6 gaps, 1 high deferred), 8 phase specs |

---

## 3. Known Limitations & Builder Foundry Gaps

1. **NEAR L1 Private Sharding (GAP-002):**
   - *Current State:* Evaluated as an in-process PBFT 200ms cryptographic state machine with IMT token accounting and decoupled graph verification.
   - *Roadmap:* Integration with native NEAR Nightshade Phase 2 validator RPC once private sharding ships.
2. **1Click Swap API Environment (GAP-001):**
   - *Current State:* 1Click API operates in a mainnet environment without dedicated public testnet; verified via live asset queries with audited snapshot fallback.
3. **Chain Signatures Testnet Signing (GAP-005):**
   - *Current State:* Address derivation follows NEAR MPC specification; live on-chain `sign` calls to `v1.signer-prod.testnet` are gated on user-funded deployer credentials.
4. **Bare-Metal TEE Hosting (GAP-004):**
   - *Current State:* Live TEE remote attestation report is queried and verified from NEAR AI Cloud; internal intent aggregation runs as a local memory-wiped process.
5. **Intel DCAP-QVL Verification (GAP-006):**
   - *Current State:* Intel TDX report presence, model signer key, and cryptographic session nonce binding are verified; full byte-level DCAP SGX root CA chain verification is planned.
