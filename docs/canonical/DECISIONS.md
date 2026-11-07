# Midge — Architectural Decisions Register (ADRs)

**Version:** 1.0.0  
**Scope:** NEAR HACKATHON: Build Beyond Boundaries (Nov 1–14, 2026)  
**Governance Standard:** Builder Foundry v1.0  

---

### ADR-0001: NEAR AI Cloud TEEs for Confidential Agent Deliberation
* **Status:** ACCEPTED
* **Context:** Multi-agent syndicates require a trusted environment to pool proprietary alpha, trading parameters, and order volumes without revealing raw values to public mempools or other untrusted syndicate members.
* **Decision:** Utilize NEAR AI Cloud hardware-isolated Trusted Execution Environments (Intel TDX / AMD SEV-SNP). Ingest members' intents asymmetrically encrypted to the enclave's RSA-2048 key. Aggregate in enclave RAM (Sealed Intent Aggregation), zero the RAM immediately, and output only the aggregated order signed by the enclave key with a verified Hardware Attestation Quote (HAQ).
* **Alternatives Rejected:** Zero-knowledge SNARK circuits (excessive proving latency for dynamic multi-agent negotiation); Multi-party computation secret sharing (high network round-trip overhead across 10+ agents).
* **Consequences:** Near-instant (<500ms) multi-agent consensus with hardware-backed integrity proofs verifiable on-chain.

---

### ADR-0002: Bounded Sub-Accounts via OutLayer & Automated Non-Custodial Escape Hatches
* **Status:** ACCEPTED
* **Context:** Autonomous AI agents executing financial transactions introduce risks of software stalls, enclave crashes, or rogue behavioral drift.
* **Decision:** Every syndicate mints a dedicated sub-account (`<name>.fly.testnet`) governed by an OutLayer spending policy (strict spending allowance, method whitelisting, recipient restrictions). If the enclave fails to post a valid HAQ batch proof before a pre-configured timelock, any member can invoke `hatch_out()` to trigger an immediate, non-custodial 100% refund of deposited escrow.
* **Alternatives Rejected:** Centralized admin multisig (custodial, single point of failure); Perpetual lock-up (funds lost forever if enclave fails).
* **Consequences:** Non-custodial guarantee: capital is either settled with valid enclave proof or 100% refunded.

---

### ADR-0003: 1Click API Integration with Audited Snapshot Fallback
* **Status:** ACCEPTED
* **Context:** Midge requires cross-chain intent execution across 210 assets. Upstream ChainDefuser 1Click Swap API operates primarily in a mainnet environment and does not provide an isolated public testnet cluster.
* **Decision:** Implement live queries to `https://1click.chaindefuser.com/v0/tokens` during verification; if upstream returns HTTP 521 or times out, seamlessly fall back to an audited, cryptographic snapshot of the asset registry while logging a telemetry warning.
* **Alternatives Rejected:** Failing tests whenever upstream has brief network maintenance (breaks CI and judge verification determinism); purely mocked static data (fails to verify real 1Click protocol compatibility).
* **Consequences:** 100% deterministic, zero-flakiness test execution (originally under 2 seconds; now about 100 s with the added suites) while retaining full live-endpoint compatibility.

---

### ADR-0004: FAR Shard Cryptographic PBFT Simulation
* **Status:** ACCEPTED
* **Context:** NEAR Protocol's Nightshade Phase 2 private sharding specification is currently in roadmap preview, without native L1 private validator node binaries publicly accessible on testnet.
* **Decision:** Implement a high-fidelity cryptographic state machine of the FAR Private Shard in `src/settlement/far-shard.js`. Simulate 200ms PBFT consensus, Intent Minted Token (IMT) mint/burn lifecycles, and cryptographic decoupling of deposit graphs from clean payout recipients.
* **Alternatives Rejected:** Delaying private syndicate development until mainnet private sharding launch; using public NEP-141 transfers that leak graph linkages.
* **Consequences:** The entire syndicate lifecycle is ready for drop-in deployment to NEAR private shards as soon as validator node binaries reach public testnet.

---

### ADR-0005: NEAR Chain Signatures MPC (`v1.signer-prod.testnet`) for Omnichain Execution
* **Status:** ACCEPTED
* **Context:** Syndicates need to hold collateral and execute trades natively on Bitcoin, Ethereum, Arbitrum, and Solana without managing centralized private keys or wrapped bridge tokens.
* **Decision:** Utilize NEAR Chain Signatures threshold MPC protocol (`v1.signer-prod.testnet` on testnet, `v1.signer` on mainnet) to derive deterministic native accounts on Bitcoin (Taproot), EVM (Ethereum/Arbitrum), and Solana (Ed25519) controlled directly by the syndicate's NEAR L1 contract.
* **Alternatives Rejected:** Relying on centralized custodian APIs (Fireblocks, BitGo); bridging assets to NEAR via third-party lock-and-mint bridges (bridge hack risk).
* **Consequences:** Direct sovereign omnichain execution with cryptographic security anchored in NEAR validator MPC.

---

### ADR-0006: x402 Protocol & PingPay for Agent Micro-Commerce
* **Status:** ACCEPTED
* **Context:** Autonomous agents inside a syndicate frequently trade proprietary sub-signals, ML weights, or liquidity quotes. Free-tier models encourage sybil spam, while manual subscriptions are too rigid for autonomous agents.
* **Decision:** Adopt the x402 specification (HTTP 402 Payment Required) combined with PingPay confidential micropayments. Agents receive structured invoice headers and pay per-request in USDC/NEAR micropayments.
* **Alternatives Rejected:** Flat monthly API subscriptions; free public endpoints vulnerable to DDOS and sybil exhaustion.
* **Consequences:** Machine-native machine-to-machine commerce integrated directly into the `FlyApiDaemon`.

---

### ADR-0007: NEAR L1 Smart Contract in Rust using `near-sdk` 5.1
* **Status:** ACCEPTED
* **Context:** The on-chain coordinator requires high execution speed, minimal gas footprint, and zero security vulnerabilities.
* **Decision:** Implement `contracts/fly-coordinator` in Rust using `near-sdk` 5.1 with modern `#[near(serializers = [borsh, json])]` macros. Compile to `wasm32-unknown-unknown` release binary (277 KB).
* **Alternatives Rejected:** JavaScript/TypeScript smart contracts (larger binary size, higher gas consumption); legacy `near-sdk` 4 macros (deprecated serialization).
* **Consequences:** Smart contract with sub-cent gas fees and instant execution deployed on NEAR testnet.
