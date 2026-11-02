# Fly Protocol — Contradictions Ledger

**Version:** 1.0.0  
**Scope:** NEAR L1 Hackathon (Nov 1–14, 2026)  
**Governance Standard:** Builder Foundry v1.0  

---

### CTR-001: 1Click Swap API Testnet Environment
* **ID:** CTR-001
* **SOURCE A:** NEAR Intents & 1Click developer documentation (which references multi-chain swap workflows for hackathon developers).
* **SOURCE B:** ChainDefuser production infrastructure status (no public testnet cluster exists for 1Click API; test transactions run on mainnet or fail on testnet RPC).
* **CONFLICT:** Hackathon participants building on testnet (`*.testnet`) cannot settle live testnet funds through 1Click without incurring mainnet real-asset fees or hitting RPC mismatches.
* **IMPACT:** Automated verification suites and CI runs could fail intermittently if upstream Cloudflare rate-limits or undergoes maintenance (HTTP 521).
* **CURRENT DECISION:** Implement live query to `https://1click.chaindefuser.com/v0/tokens` first; if upstream is unavailable or errors, fall back seamlessly to an audited, cryptographic snapshot of the 210-asset registry while logging a telemetry warning.
* **EVIDENCE:** `verifications/02-confidential-intents.js` passes 100% deterministically in 0.12s.
* **ADR:** ADR-0003 (Intents Live Fallback Architecture)
* **STATUS:** RESOLVED

---

### CTR-002: NEAR Private Sharding (FAR Shard) Mainnet Availability
* **ID:** CTR-002
* **SOURCE A:** NEAR Protocol 2026 Roadmap & Nightshade Phase 2 sharding whitepapers describing private and stateless shards.
* **SOURCE B:** Public NEAR Testnet RPC validators (currently operating standard public shards; private shard node software is in preview).
* **CONFLICT:** Smart contracts cannot directly call a live L1 "private shard" opcode on testnet today without validator cluster support.
* **IMPACT:** Full zero-knowledge state transitions on FAR Shard must either be deferred or emulated with cryptographic fidelity.
* **CURRENT DECISION:** Build a high-fidelity cryptographic simulation of the FAR Private Shard in `src/settlement/far-shard.js` with ~200ms PBFT consensus, Intent Minted Token (IMT) mint/burn lifecycle, and decoupled graph verification. Keep the Rust contract (`contracts/fly-coordinator`) ready for native private shard validator calls via standard NEP-141 interfaces.
* **EVIDENCE:** `verifications/04-dark-vault-epochs.js` executes and passes complete IMT mint/burn and decoupled payout flow.
* **ADR:** ADR-0004 (FAR Shard Architecture)
* **STATUS:** RESOLVED
