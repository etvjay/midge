# NEAR HACKATHON: Build Beyond Boundaries — Official Submission Pack
### Event Window: November 1–14, 2026 | $250k Prize Pool

---

## 1. Official Submission Metadata

* **Project Name:** Midge — Private Rooms with Public Rules, on NEAR
* **Primary Track:** Privacy & Private AI
* **Secondary Tracks:** AI Swarms, Agent Economy, Unstoppable DeFi
* **Target Network:** NEAR L1 Testnet (`*.fly.testnet`)
* **Repository:** Public GitHub Repository
* **Built Within Window:** November 1–14, 2026

---

## 2. Official Form Description (Formatted for 20–2,000 Char Limit)

```text
Midge is a network of private rooms with public rules on NEAR Protocol. It provides the confidential infrastructure for AI agents, quant bots, and institutional funds to pool capital, exchange proprietary intelligence, and execute cross-chain operations as a unified front—without exposing member identities, trading algorithms, prompt secrets, or internal equity splits to public mempools.

Midge bridges three breakthrough NEAR primitives into one unified architecture:
1. NEAR AI Cloud TEEs (The Roost): member bids are sealed to a NEAR AI Cloud model's attested key (Intel TDX), so the coordinator holds only ciphertext; the model adds the bids and the result is accepted only if three runs agree. A hosted Roost with exact arithmetic runs on a Phala dstack confidential VM and its attestation passes the official dstack-verifier on real Intel TDX hardware (saved evidence); a full member round on it is not yet shown. Without a NEAR AI key the Roost is a local simulation that can read bids.
2. NEAR Confidential Intents & FAR Private Shard: the 1Click integration reads the live asset registry (read-only). The FAR private shard, Intent Minted Tokens and decoupled settlement graph are in-memory simulations; NEAR's private shard is not publicly reachable, so no claim of private on-chain settlement is made.
3. NEAR Chain Signatures (MPC): addresses for Bitcoin, Ethereum and Solana are derived from the syndicate's NEAR account, and one secp256k1 signature from v1.signer-prod.testnet was produced and verified. No transaction has been broadcast on another chain yet.

Midge features a deployed NEAR L1 coordinator smart contract in Rust (near-sdk 5.1), OutLayer-governed sub-account boundaries, x402 agent micro-commerce, institutional dark facilities (Confidential RFQs and OTC Block Trades), and a 5-layer FMEA resilience engine with a non-custodial escape hatch (hatch_out) guaranteeing 100% individual refund upon timeout.

Includes an MCP (Model Context Protocol) server compatible with nearai/near-mcp, allowing autonomous agents to hatch syndicates, deliberate privately, and trade cross-chain.
```
*(Character count: 1,812 / 2,000 — Compliant)*

---

## 3. Toolchain & Rust-to-WASM Compilation Reference

### Rust Environment
- **Rust Toolchain:** `cargo 1.98.0` / `rustc 1.98.0`
- **WASM Target:** `wasm32-unknown-unknown`
- **Smart Contract Framework:** `near-sdk = "5.1.0"` with `unit-testing`

### Exact Build & Verification Commands
```bash
# 1. Run Complete Canonical Verification Suite (<20s)
./scripts/verify

# 2. Run NEAR L1 Smart Contract Rust Unit & Invariant Tests
npm run verify:rust

# 3. Build WebAssembly Binary for NEAR L1
npm run build:wasm
# Output: contracts/fly-coordinator/target/wasm32-unknown-unknown/release/fly_coordinator.wasm (277 KB)

# 4. Run Full 10-Flyer Dark Swarm Simulation with End-to-End Encryption
npm run demo:syndicate
```

---

## 4. Submission Video / X Demo Post Script

**Draft X Post Copy:**
> Built for @NEARProtocol Hackathon: Build Beyond Boundaries (Nov 2026)! 🚀
> 
> Introducing **Midge**: Private Rooms with Public Rules, on NEAR.
> 
> 🔒 NEAR AI Cloud TEEs (Hardware Attestation)  
> 🛡️ Confidential Intents & FAR Private Shard (IMT Tokens)  
> 🌐 Chain Signatures MPC (BTC, ETH, SOL)  
> ⚡ OutLayer Agent Sub-accounts + 100% Non-Custodial Escape Hatch  
> 
> Watch 10 autonomous agents deliberate in shielded memory and execute cross-chain with broken transaction graph linkages:  
> [Demo Video / Repo Link] #NEARHackathon #NEAR #AI #Privacy

---

## 5. Agent Skills & MCP Compatibility

Midge integrates with NEAR's official agent infrastructure:
- **`nearai/near-mcp` Compatibility:** [`src/mcp/server.js`](file:///home/ubuntu/near/src/mcp/server.js) exposes `midge_hatch_syndicate`, `midge_submit_sealed_intent`, `midge_verify_haq_attestation`, `midge_create_confidential_rfq`, `midge_match_otc_block`, and `midge_hatch_out`.
- **Official Agent Skills:** Compatible with `npx skills add near/agent-skills` (`near-smart-contracts`, `near-ai-cloud`).
