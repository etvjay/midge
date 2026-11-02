# Software Architecture Document (SAD)
## Project: Fly — Syndicate Network for Private Systems on NEAR
**Document Identifier:** SAD-FLY-2026-V1.0  
**Status:** Approved & Implemented Baseline  

---

## 1. System Context (C4 Level 1)

Fly acts as the confidential multi-party coordination layer connecting autonomous agent swarms and capital pools with decentralized execution targets.

```mermaid
flowchart TD
    subgraph Clients ["Fly Clients & Members"]
        A1["Autonomous AI Agents<br/>(Local LLMs / Strategies)"]
        A2["Institutional Principals<br/>(Treasury Wallets)"]
        A3["AI Judges & Evaluators<br/>(Claude Code / Codex)"]
    end

    subgraph Fly_Boundary ["Fly Protocol System Boundary"]
        Roost["The Roost<br/>(NEAR AI Cloud TEE Enclave)"]
        Nest["The Nest<br/>(NEAR L1 Coordinator Contract)"]
    end

    subgraph External_NEAR ["NEAR Protocol Ecosystem"]
        FAR["FAR Private Shard<br/>(Confidential Intents / IMT Tokens)"]
        MPC["Chain Signatures Network<br/>(Threshold MPC Signers)"]
        OutLayer["OutLayer Policy Service<br/>(Transaction Rule Engine)"]
    end

    subgraph Omnichain ["Target Chains"]
        BTC["Bitcoin (Taproot)"]
        EVM["Ethereum / Arbitrum (EVM)"]
        SOL["Solana (Ed25519)"]
    end

    Clients -->|Encrypted Intents & Auth| Roost
    Clients -->|hatch() & Escrow Deposits| Nest
    Roost -->|HAQ Attestation Proof| Nest
    Nest -->|Verify OutLayer Policy| OutLayer
    Nest -->|Confidential Swap Orders| FAR
    Nest -->|Omnichain Signature Requests| MPC
    MPC -->|Native Transactions| Omnichain
```

---

## 2. Container Architecture (C4 Level 2)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 FLY SYSTEM CONTAINERS                                   │
├──────────────────────────────┬────────────────────────────┬────────────────────────────┤
│ Container                    │ Technology Stack           │ Primary Responsibility     │
├──────────────────────────────┼────────────────────────────┼────────────────────────────┤
│ 1. Nest Coordinator Contract │ NEAR Smart Contract (Rust) │ State machine, escrow      │
│                              │ deployed to NEAR Testnet   │ ledger, HAQ proof gate,    │
│                              │ (`c.fly-1793636729.testnet`)│ and hatch_out() timelock.  │
├──────────────────────────────┼────────────────────────────┼────────────────────────────┤
│ 2. Roost Enclave Daemon      │ Node.js / Rust querying    │ Ingests encrypted intents, │
│                              │ Intel TDX / NVIDIA CVM on  │ executes SIA aggregation,  │
│                              │ NEAR AI Cloud              │ generates fresh HAQ proof. │
├──────────────────────────────┼────────────────────────────┼────────────────────────────┤
│ 3. 1Click Intent Adapter     │ TypeScript / OpenAPI 3.0   │ Connects to 1Click API,    │
│                              │ (`chaindefuser.com/v0`)    │ queries live cross-chain   │
│                              │                            │ assets, routes via FAR.    │
├──────────────────────────────┼────────────────────────────┼────────────────────────────┤
│ 4. Fly API, SSE & MCP Gateway│ Node.js Daemon, SSE, MCP   │ Agent interface exposing   │
│                              │ JSON-RPC 2.0 (`stdio`)     │ 6 tools for LLMs, streaming│
│                              │                            │ real-time syndicate events.│
└──────────────────────────────┴────────────────────────────┴────────────────────────────┘
```

---

## 3. Architectural Decision Records (ADRs)

### ADR-001: NEAR AI Cloud TEEs for Confidential Deliberation
* **Context:** Autonomous agents need to pool private strategies, weights, and bids without exposing intellectual property to peer agents or public observers.
* **Decision:** Run the Roost coordinator daemon within hardware-isolated TEE enclaves on NEAR AI Cloud (`cloud-api.near.ai/v1`). Every deliberation round binds an attestation quote to a freshly generated 32-byte session nonce.
* **Consequences:** 
  * *(Positive)* Cryptographic proof that memory cannot be inspected by cloud operators; eliminates MEV and front-running.
  * *(Trade-off)* Requires enclave initialization latency (~490ms), which is acceptable for batch syndicate rounds.

### ADR-002: FAR Private Shard & Confidential Intents for Shielded Liquidity
* **Context:** Syndicate capital accumulation on public AMMs causes price slippage and copy-trading.
* **Decision:** Route aggregate trades through NEAR Confidential Intents settled on the **FAR Private Shard** using **IMT tokens**.
* **Consequences:**
  * *(Positive)* Sub-second finality (~200ms) with zero public mempool exposure; depositor wallets are cryptographically unlinked from external swaps.
  * *(Trade-off)* Relies on permissioned validator set on FAR instead of pure client-side ZKPs, prioritizing execution speed and cross-chain scale.

### ADR-003: NEAR Chain Signatures MPC for Omnichain Sovereignty
* **Context:** Syndicates need to execute investments and buyouts natively on Bitcoin, Ethereum, and Solana without centralized bridging or wrapped tokens.
* **Decision:** Use NEAR Chain Signatures (`v1.signer`). The Nest contract acts as the controller; once HAQ verification confirms syndicate consensus, it commands the decentralized MPC network to sign native transactions.
* **Consequences:**
  * *(Positive)* One syndicate identity governs accounts across 35+ chains with zero bridge risk.
  * *(Trade-off)* Asynchronous cross-chain confirmation times depend on target chain block intervals.

### ADR-004: Hierarchical Sub-Accounts & OutLayer Policy Guardrails
* **Context:** Rogue agents suffering prompt injections or logic bugs could attempt unauthorized capital draining.
* **Decision:** Instantiate syndicates as named sub-accounts (`<id>.fly.testnet`). Agents hold Function Call Access Keys bounded by **OutLayer** rules (spending caps, contract method whitelists, block timeouts).
* **Consequences:**
  * *(Positive)* Mathematical blast-radius confinement; compromised agents cannot drain parent treasuries.
  * *(Positive)* Enables the `hatch_out()` non-custodial escape hatch: timelocks guarantee 100% fund clawback if an enclave stalls.
