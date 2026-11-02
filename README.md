# Fly: Autonomous Syndicate Network for Private Systems on NEAR
### NEAR L1 Hackathon: Build Beyond Boundaries (November 2026)
**Primary Track:** Privacy & Private AI | **Secondary Tracks:** AI Swarms, Agent Economy, Unstoppable DeFi

---

## 1. Executive Overview

**Fly** is an autonomous coordination and syndicate protocol for private systems on NEAR Protocol. It enables autonomous AI agents, algorithmic bots, and institutional capital allocators to instantiate **ephemeral (Flash)** or **persistent (Dark Vault)** confidential syndicates. Members pool capital, aggregate proprietary intelligence, and execute cross-chain operations without disclosing member identities, underlying strategies, or internal quotas to public mempools.

```
                    THE FLY ARCHITECTURE IN ACTION

    [Flyers] ────────> [Sealed Intent] ────────> [The Roost]
   (Agents/Funds)     (Asymmetric RSA)          (Hardware TEE)
                                                      │
                                          [Hardware Attestation Quorum]
                                                      │
                                                      ▼
   [Omnichain Identity] <──── [Chain Signatures] <── [The Nest]
   (BTC / EVM / SOL)          (Decentralized MPC)   (NEAR L1 Contract)
                                                      │
                                          [FAR Private Shard Settlement]
                                                      │
                                                      ▼
                                             [Decoupled Payout]
```

Fly combines four novel architectural pillars:
1. **The Roost (NEAR AI Cloud TEEs):** Hardware-isolated enclaves (AMD SEV-SNP / Intel TDX) executing in-memory **Sealed Intent Aggregation (SIA)** and zeroing raw memory upon consensus.
2. **The Nest (`fly-coordinator.near`):** NEAR L1 smart contract (implemented in Rust with `near-sdk`) verifying **Hardware Attestation Quorum (HAQ)** proofs with fresh 32-byte nonces.
3. **FAR Private Shard & Confidential Intents:** Zero-MEV execution on NEAR's permissioned private shard (~200ms PBFT finality) using **Intent Minted Tokens (IMT)** to break graph-analysis linkages between depositors and payouts.
4. **Omnichain Threshold Execution (NEAR Chain Signatures):** Controlling synthetic native Bitcoin Taproot, EVM, and Solana addresses from a unified syndicate identity.

---

## 2. Definitive Conceptual Framework & Terminologies

### A. Protocol Entities & Roles
| Term | Domain | Definition |
| :--- | :--- | :--- |
| **Syndicate** | Governance | The fundamental organizational unit. A confidential collective pooling capital and compute toward a shared objective. |
| **Pod** | Execution | A specialized tactical sub-unit within a Dark Vault (e.g. Quant Arb, Liquidation, Model Inference Pod) with scoped risk limits. |
| **Roost** | Confidential Compute | The hardware-isolated execution enclave on NEAR AI Cloud (AMD SEV-SNP / Intel TDX) where confidential deliberations occur. |
| **Flyer** | Actor | An autonomous participant (AI agent, trading bot, or institutional principal) operating via policy-bound NEAR sub-accounts. |
| **Nest** | On-Chain L1 | The central NEAR coordinator smart contract (`fly-coordinator.near`) managing registries, sub-accounts, attestation verification, and settlement. |

### B. Core Operational Concepts
| Term | Domain | Definition |
| :--- | :--- | :--- |
| **SIA (Sealed Intent Aggregation)** | Cryptography | Combining encrypted member parameters (slippage, reservation price, collateral, votes) into a single batch order and zeroing member inputs in RAM. |
| **HAQ (Hardware Attestation Quorum)** | Security | The cryptographic ceremony coined by Fly binding enclave MRENCLAVE measurement, 32-byte round nonce, and quorum threshold into an on-chain smart contract gate. |
| **Flash Syndicate** | Lifecycle | Ephemeral syndicate spun up in <200ms to execute a single task (OTC block trade, inference run), distributing assets and dissolving immediately. |
| **Dark Vault** | Lifecycle | Persistent confidential treasury with multi-epoch lifecycle, recurring compute budgets, dynamic member entry/exit, and sub-pods. |
| **Attestation Nonce** | Security | A 32-byte cryptographically secure challenge generated per round preventing replay attacks. |

### C. Financial & Settlement Mechanics
| Term | Domain | Definition |
| :--- | :--- | :--- |
| **FAR Private Shard** | Privacy | NEAR's dedicated permissioned private shard operating on PBFT consensus with ~200ms finality and no public RPC/explorer. |
| **IMT (Intent Minted Tokens)** | Tokenomics | Private-side token representation minted upon public Treasury lock and burned upon withdrawal. |
| **Decoupled Settlement Graph** | Anonymity | Architectural graph separation preventing analytics tools (Arkham, Chainalysis) from connecting depositors with payout recipients. |
| **Omnichain Threshold Identity** | Cross-Chain | Synthetic native Bitcoin Taproot, EVM, and Solana Ed25519 addresses derived and controlled via NEAR Chain Signatures MPC. |
| **Confidential RFQs & Private Repo** | Institutional | Borrowing USDC against collateral (e.g. ETH) via sealed quotes, private margin adjudication, and MEV-free orderly auction on FAR shard. |
| **OTC Block Trade Facility** | Dark Pools | Private pairwise / multilateral crossing of large orders at mid-market prices with zero front-running or DEX slippage. |
| **Confidential AI Compute Syndicate** | Private AI | Pooling NEAR credits across agents to purchase confidential TEE model inference (`Qwen/Qwen3.6-35B-A3B-FP8`) without logging prompts. |

### D. Agent Safety & Communication Mechanics
| Term | Domain | Definition |
| :--- | :--- | :--- |
| **OutLayer Policy Guard** | Security | Cryptographic boundary applied to agent sub-accounts enforcing spending caps, method whitelisting, and expiration. |
| **x402 Agent Micro-Commerce** | Communication | HTTP 402 ("Payment Required") protocol for agents to buy real-time oracle feeds or sub-reports via PingPay and NEAR Intents. |
| **The Hatch Protocol (`hatch_out`)** | Resilience | Non-custodial escape valve unlocking 100% refund of escrow if deliberation exceeds block timeout. |

---

## 3. The 5-Layer Failure Matrix (FMEA)

Fly implements deterministic resilience across all failure modes:

| Layer | Failure Scenario | Protocol Remedy | Verification Ref |
| :--- | :--- | :--- | :--- |
| **1. Enclave / TEE** | Enclave crash, memory leak, or invalid quote | On-Chain Timelock & `hatch_out()` (100% refund) | `npm run verify:hatch`, `npm run verify:matrix` |
| **2. Flyer / Agent** | Agent drops out, crashes, or sends malformed cipher | Dynamic Quorum Rebalancing (re-weights if $\ge$ quorum; aborts & refunds if $<$ quorum) | `npm run verify:matrix` |
| **3. Solver / Market** | Slippage breached or solver on FAR shard times out | Atomic Reversion & Shielded IMT Unwind (zero partial fill, escrow balance restored) | `npm run verify:matrix` |
| **4. Cross-Chain MPC** | Target gas spike, RPC drop, or MPC network delay | Idempotent Resubmission & Sovereign Fallback (safe retry; holds local NEAR custody if expired) | `npm run verify:matrix` |
| **5. Policy Breach** | Rogue agent tries to exceed spend cap or call unapproved method | OutLayer Policy Guard rejection at sub-account boundary before reaching state | `npm run verify:matrix` |

---

## 4. Deterministic Verification Commands (For AI Judges & Evaluators)

Run all verifications with zero external dependencies:

```bash
# 1. Run Complete Master Verification Suite (8 Verifications, ~1.1s)
npm test

# 2. Live TEE Hardware Attestation (HAQ) against NEAR AI Cloud
npm run verify:tee

# 3. Live 1Click Confidential Intents Liquidity & Asset Registry Audit
npm run verify:intents

# 4. Hatch Protocol, Sub-Account Minting & Escape Hatch (FMEA)
npm run verify:hatch

# 5. Persistent Dark Vault, Specialized Pods, FAR Shard & Omnichain MPC
npm run verify:vault

# 6. Confidential RFQ, Sealed Quotes & Private Margin Adjudication
npm run verify:rfq

# 7. OTC Block Trades & Confidential AI Compute Syndicate (Use Case B)
npm run verify:otc

# 8. 5-Layer Resilience Failure Matrix (FMEA)
npm run verify:matrix

# 9. HTTP Gateway Daemon, Real-time SSE Streams, x402 Commerce & MCP Server
npm run verify:api

# 10. NEAR L1 Rust Smart Contract Unit Tests (near-sdk 5.1)
npm run verify:rust

# 11. Compile Release WebAssembly Contract (238 KB)
npm run build:wasm

# 12. Run Full 10-Flyer Dark Swarm Simulation with End-to-End Encryption
npm run demo:syndicate
```

---

## 5. Repository Structure

```
├── contracts/
│   └── fly-coordinator/          # Production NEAR L1 smart contract (Rust / near-sdk 5.1)
│       ├── Cargo.toml
│       └── src/lib.rs            # hatch(), deposit(), settle_batch(), hatch_out()
├── src/
│   ├── contracts/nest.js         # Nest coordinator state machine (L1 simulation)
│   ├── enclave/
│   │   ├── crypto.js             # Asymmetric RSA-2048 encryption & SHA-256 signing
│   │   └── roost.js              # Roost TEE deliberation daemon (in-RAM SIA aggregation)
│   ├── facilities/
│   │   ├── rfq-adjudication.js   # Confidential RFQs, sealed quotes, private margin adjudication
│   │   ├── otc-block-trade.js    # OTC block trading dark matching at midpoint
│   │   └── compute-syndicate.js  # Confidential AI compute credit pooling (NEAR AI Cloud)
│   ├── multichain/
│   │   └── chain-signatures.js   # NEAR Chain Signatures MPC (BTC, EVM, SOL derivation)
│   ├── settlement/
│   │   └── far-shard.js          # FAR Private Shard bridge & IMT token lifecycle
│   ├── policies/
│   │   └── outlayer.js           # OutLayer policy guard & sub-account boundary
│   ├── commerce/
│   │   └── x402.js               # x402 Agent Micro-Commerce engine (HTTP 402 + PingPay)
│   ├── syndicate/
│   │   └── pod.js                # Tactical execution sub-swarms inside Dark Vaults
│   ├── resilience/
│   │   └── failure-matrix.js     # 5-layer deterministic failure remedies
│   └── simulation/
│       └── runner.js             # 10-Flyer Dark Swarm end-to-end execution
├── verifications/                # 7 standalone deterministic verification scripts
├── docs/                         # Canonical SDLC documentation
│   ├── srs.md                    # IEEE 29148 System Requirements Specification
│   ├── use-cases.md              # UC-001 through UC-008 specifications
│   ├── rtm.md                    # Requirements Traceability Matrix (22 FRs, 7 NFRs)
│   ├── architecture.md           # C4 Level 1/2 models & ADR-001 through ADR-004
│   └── implementation-plan.md    # Feature slicing & test plan
└── verify-all.js                 # Master test orchestrator
```

---

## 6. SDLC Traceability & Quality Standards

- **SRS Specification:** [docs/srs.md](file:///home/ubuntu/near/docs/srs.md)
- **Requirements Traceability:** [docs/rtm.md](file:///home/ubuntu/near/docs/rtm.md)
- **Software Architecture & ADRs:** [docs/architecture.md](file:///home/ubuntu/near/docs/architecture.md)
- **Use Cases & Workflows:** [docs/use-cases.md](file:///home/ubuntu/near/docs/use-cases.md)
- **Implementation Slices:** [docs/implementation-plan.md](file:///home/ubuntu/near/docs/implementation-plan.md)
