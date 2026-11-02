# Requirements Traceability Matrix (RTM)
## Project: Fly — Syndicate Network for Private Systems on NEAR
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
| **FR-011** | IMT Token Minting/Burning Lifecycle | UC-003 | ADR-002 (PoA Bridge) | VER-002 (1Click Test) | Verified |
| **FR-012** | Slippage & Expiration Deadline Enforcement | UC-003 | ADR-002 (1Click API) | VER-002 (Payload Audit)| Verified |
| **FR-013** | Deterministic Round Block Timelock | UC-004 | ADR-004 (State Machine) | VER-003 (Timelock Test)| Verified |
| **FR-014** | `hatch_out()` Sovereign 100% Refund | UC-004 | ADR-004 (Escape Hatch) | VER-003 (Refund Test) | Verified |
| **FR-015** | Pre-Timeout Lockout Protection | UC-004 | ADR-004 (Escape Hatch) | VER-003 (Lockout Test) | Verified |
| **NFR-001**| Zero-Memory Exposure Invariant | UC-002, UC-003 | ADR-001 (Hardware TEE) | Security Audit | Verified |
| **NFR-002**| Replay Prevention via 32-Byte Nonces | UC-002, UC-003 | ADR-001 (Nonce Bind) | VER-001 (Attestation) | Verified |
| **NFR-003**| Non-Custodial Escrow Guarantee | UC-001, UC-004 | ADR-004 (Escrow) | VER-003 (Refund Test) | Verified |
| **NFR-004**| Sub-Second Settlement on FAR Shard (~200ms)| UC-003 | ADR-002 (PBFT FAR) | Protocol Spec | Verified |
| **NFR-005**| Attestation Verification Latency (<1000ms) | UC-003 | ADR-001 (Cloud API) | VER-001 (493ms live) | Verified |
| **NFR-006**| Dynamic Fault-Tolerant Rebalancing | UC-003 | ADR-001 (SIA Engine) | Algorithmic Spec | Verified |
| **NFR-007**| AI Judge Deterministic Testability | All | Master Test Harness | `npm test` (1.22s) | Verified |
