# Requirements Traceability Matrix (RTM)

> **Status of this document (added 2026-11-04):** a design and requirements document. It describes the intended design, including parts that are simulated or not yet built (for example the FAR private shard, the facilities, and a Roost running in a TEE we host). For what is actually built and how to verify it, see the "Real vs. Simulated" matrix in `README.md` and `docs/canonical/CURRENT_STATE.md`.
## Project: Midge — Syndicate Network for Private Systems on NEAR
**Document Identifier:** RTM-FLY-2026-V1.0  

---

| Req ID | Requirement Summary | Use Case | Architecture Ref | Verification Ref | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **FR-001** | Syndicate Spawning via `hatch()` | UC-001 | ADR-004 (Nest Factory) | VER-003 (Hatch Test) | Verified |
| **FR-002** | Hierarchical Sub-Accounts (`*.fly.testnet`) | UC-001 | ADR-004 (Account Model) | VER-003 (Hatch Test) | Verified |
| **FR-003** | OutLayer Spending Bounds Enforcement | UC-001, UC-002 | ADR-004 (Policy Guard) | VER-003 (Policy Rejection) | Verified |
| **FR-004** | Immutable Code Hash Registration | UC-001, UC-003 | ADR-001 (TEE Enclave) | VER-003 (Hatch Test) | Verified |
| **FR-005** | Enclave Session Key & Nonce Initialization | UC-002 | ADR-001 (TEE Enclave) | VER-001 (HAQ Test) | Verified |
| **FR-006** | Sealed Intent Ingestion into RAM | UC-002 | ADR-001 (TEE Memory) | VER-003 (SIA Sim) | Verified |
| **FR-007** | Sealed Intent Aggregation (SIA) Algorithm | UC-003 | ADR-001 (SIA Engine) | VER-003 (SIA Sim) | Verified |
| **FR-008** | Attestation Proof & Nonce Submission | UC-003 | ADR-001 (Attestation) | VER-001 (HAQ Test) | Verified |
| **FR-009** | On-Chain HAQ Validation Ceremony | UC-003 | ADR-001, ADR-004 | VER-001, VER-003 | Verified |
| **FR-010** | Confidential Intents Settlement on FAR Shard| UC-003 | ADR-002 (Private Shard) | VER-002 (1Click Test) | Verified |
| **FR-011** | IMT Token Minting/Burning Lifecycle | UC-003 | ADR-002 (PoA Bridge) | VER-002, VER-004 | Verified |
| **FR-012** | Slippage & Expiration Deadline Enforcement | UC-003 | ADR-002 (1Click API) | VER-002, VER-007 | Verified |
| **FR-013** | Deterministic Round Block Timelock | UC-004 | ADR-004 (State Machine) | VER-003, VER-007 | Verified |
| **FR-014** | `hatch_out()` Sovereign 100% Refund | UC-004 | ADR-004 (Escape Hatch) | VER-003, VER-007 | Verified |
| **FR-015** | Pre-Timeout Lockout Protection | UC-004 | ADR-004 (Escape Hatch) | VER-003, VER-007 | Verified |
| **FR-016** | Dark Vault Persistent Multi-Epoch Lifecycles | UC-001 | ADR-004 (Vault Model) | VER-004 (Dark Vault Test) | Verified |
| **FR-017** | Omnichain Threshold Identity Derivation | UC-005 | ADR-003 (Chain Signatures)| VER-004 (MPC Derivation) | Verified |
| **FR-018** | x402 Agent Micro-Commerce Negotiations | UC-002 | ADR-004 (Micro-Commerce)| VER-004 (x402 Micropayments)| Verified |
| **FR-019** | Confidential RFQs & Private Margin Adjudication | UC-006 | ADR-002 (Credit/Repo) | VER-005 (RFQ Adjudication)| Verified |
| **FR-020** | OTC Block Trade Private Crossing | UC-007 | ADR-002 (Dark Pools) | VER-006 (OTC Block Test) | Verified |
| **FR-021** | Confidential AI Compute Syndicate Pooling | UC-008 | ADR-001 (Pooled Compute)| VER-006 (Compute Syndicate)| Verified |
| **FR-022** | 5-Layer Resilience FMEA Recovery | UC-004 | ADR-004 (FMEA Matrix) | VER-007 (Resilience Test) | Verified |
| **NFR-001**| Zero-Memory Exposure Invariant | UC-002, UC-003 | ADR-001 (Hardware TEE) | Security Audit | Verified |
| **NFR-002**| Replay Prevention via 32-Byte Nonces | UC-002, UC-003 | ADR-001 (Nonce Bind) | VER-001 (Attestation) | Verified |
| **NFR-003**| Non-Custodial Escrow Guarantee | UC-001, UC-004 | ADR-004 (Escrow) | VER-003, VER-007 | Verified |
| **NFR-004**| Sub-Second Settlement on FAR Shard (~200ms)| UC-003 | ADR-002 (PBFT FAR) | VER-004 (IMT Lifecycle) | Verified |
| **NFR-005**| Attestation Verification Latency (<1000ms) | UC-003 | ADR-001 (Cloud API) | VER-001 (607ms live) | Verified |
| **NFR-006**| Dynamic Fault-Tolerant Rebalancing | UC-003 | ADR-001 (SIA Engine) | VER-007 (Layer 2 Rebalance)| Verified |
| **NFR-007**| AI Judge Deterministic Testability | All | Master Test Harness | `npm test` (1.65s) | Verified |
