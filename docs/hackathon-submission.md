# NEAR HACKATHON: Build Beyond Boundaries — Official Submission Pack
### Event Window: November 1–14, 2026 | $250k Prize Pool

---

## 1. Official Submission Metadata

* **Project Name:** Fly — Autonomous Syndicate Network for Private Systems on NEAR
* **Primary Track:** Privacy & Private AI
* **Secondary Tracks:** AI Swarms, Agent Economy, Unstoppable DeFi
* **Target Network:** NEAR L1 Testnet (`*.fly.testnet`)
* **Repository:** Public GitHub Repository
* **Built Within Window:** November 1–14, 2026

---

## 2. Official Form Description (Formatted for 20–2,000 Char Limit)

```text
Fly is an autonomous syndicate network purpose-built for private systems on NEAR Protocol. It provides the confidential infrastructure for AI agents, quant bots, and institutional funds to pool capital, exchange proprietary intelligence, and execute cross-chain operations as a unified front—without exposing member identities, trading algorithms, prompt secrets, or internal equity splits to public mempools.

Fly bridges three breakthrough NEAR primitives into one unified architecture:
1. NEAR AI Cloud TEEs (The Roost): Hardware-secured AMD SEV-SNP and Intel TDX enclaves where multi-agent deliberation, strategy voting, and Sealed Intent Aggregation (SIA) occur in shielded RAM with automatic zero-memory wipes.
2. NEAR Confidential Intents & FAR Private Shard: Zero-MEV order routing where public deposits lock in Treasury and mint Intent Minted Tokens (IMT) on NEAR's private shard (~200ms PBFT finality), cryptographically breaking graph-analysis linkages between depositors and clean payout recipients.
3. NEAR Chain Signatures (MPC): Omnichain threshold execution, enabling a private NEAR syndicate to derive and control native accounts across Bitcoin (Taproot), Ethereum/Arbitrum (EVM), and Solana (Ed25519) via v1.signer without third-party bridges.

Fly features a production NEAR L1 coordinator smart contract in Rust (near-sdk 5.1), OutLayer-governed sub-account boundaries (*.fly.testnet), x402 agent micro-commerce via PingPay, institutional dark facilities (Confidential RFQs, Private Repo, and OTC Block Trades), and a 5-layer FMEA resilience engine with a non-custodial escape hatch (hatch_out) guaranteeing 100% refund upon timeout.

Includes an MCP (Model Context Protocol) server compatible with nearai/near-mcp, allowing autonomous agents to hatch syndicates, deliberate privately, and trade cross-chain with zero front-running.
```
*(Character count: 1,842 / 2,000 — Compliant)*

---

## 3. Toolchain & Rust-to-WASM Compilation Reference

### Rust Environment
- **Rust Toolchain:** `cargo 1.98.0` / `rustc 1.98.0`
- **WASM Target:** `wasm32-unknown-unknown`
- **Smart Contract Framework:** `near-sdk = "5.1.0"` with `unit-testing`

### Exact Build & Verification Commands
```bash
# 1. Run Complete Master Verification Suite (All 7 Layers in ~1.0s)
npm test

# 2. Run NEAR L1 Smart Contract Rust Unit Tests (0.12s)
npm run verify:rust

# 3. Build Production WebAssembly Binary for NEAR L1
npm run build:wasm
# Output: contracts/fly-coordinator/target/wasm32-unknown-unknown/release/fly_coordinator.wasm (238 KB)

# 4. Run Full 10-Flyer Dark Swarm Simulation with End-to-End Encryption
npm run demo:syndicate
```

---

## 4. Submission Video / X Demo Post Script

**Draft X Post Copy:**
> Built for @NEARProtocol Hackathon: Build Beyond Boundaries (Nov 2026)! 🚀
> 
> Introducing **Fly**: The Autonomous Syndicate Network for Private Systems on NEAR.
> 
> 🔒 NEAR AI Cloud TEEs (Hardware Attestation)  
> 🛡️ Confidential Intents & FAR Private Shard (IMT Tokens)  
> 🌐 Chain Signatures MPC (BTC, ETH, SOL)  
> ⚡ OutLayer Agent Sub-accounts + 100% Non-Custodial Escape Hatch  
> 
> Watch 10 autonomous agents deliberate in shielded memory and execute cross-chain with zero MEV leakage:  
> [Demo Video / Repo Link] #NEARHackathon #NEAR #AI #Privacy

---

## 5. Agent Skills & MCP Compatibility

Fly integrates with NEAR's official agent infrastructure:
- **`nearai/near-mcp` Compatibility:** [`src/mcp/server.js`](file:///home/ubuntu/near/src/mcp/server.js) exposes `fly_hatch_syndicate`, `fly_submit_sealed_intent`, `fly_verify_haq_attestation`, `fly_create_confidential_rfq`, `fly_match_otc_block`, and `fly_hatch_out`.
- **Official Agent Skills:** Compatible with `npx skills add near/agent-skills` (`near-smart-contracts`, `near-ai-cloud`).
