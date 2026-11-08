# Exhaustive Architectural Comparison: Midge vs. Decentralized Coordination & Privacy Landscape

**Research Context & Evidence Base:** two Parallel Task API research reports (a competitive landscape and a problem-evidence report, November 2026). They are **not published in this repository** (they are kept on the author's machine), so the statements about other systems below are the author's reading of public material, to be checked against each project's own documentation before being relied on.

---

## 1. What Counts as an Independent Exit?

In the decentralized ecosystem, projects frequently describe themselves as "non-custodial" or "user-controlled." However, a critical distinction separates normal operational withdrawals from true **fail-stop independent recovery**:

> **The True Test of Independent Exit:**  
> Can an individual depositor recover their contract-recognized entitlement using their own authorization and available on-chain evidence, **without** the failed TEE, application operator, manager, signer quorum, bridge validator, or replacement confidential-compute service?

Under this standard:
- An ordinary withdrawal that requires the coordinator to compute state or co-sign is **not** independent.
- A multisig recovery that requires reaching a $K$-of-$N$ threshold among third parties is **not** independent.
- A vault redemption queued behind an off-chain manager approval window is **not** independent.
- A TEE recovery mechanism that depends on the enclave re-deriving an ephemeral key or unsealing state is **not** independent.

Midge focuses its architectural guarantee specifically on this boundary: **constrained arbitration with independent recovery**.

---

## 2. 10-System Competitive Landscape Matrix

| Project / System | Primary Mechanism | Confidentiality Scope | Unilateral Per-User Exit if TEE/Operator Fails? | On-Chain Hardware Attestation? | Cross-Chain Execution Model |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Midge (NEAR)** | Constrained arbitration + public-escrow independent exit | Off-chain deliberation & intent weights in TEE RAM; zeroed on aggregation | **Yes, 100% Unilateral (`hatch_out`):** Any depositor reclaims exact escrow after block timelock without operator or enclave action | **Live DCAP-QVL Verified:** Intel TDX Quote v4 verified to Intel Root CA with TCB UpToDate | NEAR Chain Signatures MPC (`v1.signer-prod.testnet`) across BTC, EVM, Solana |
| **Shade Agents (Phala / NEAR)** | Verifiable agent framework + contract guardrails | Private model weights, API keys, and internal agent state | **App-specific:** No general per-depositor timeout refund in framework crate | **Yes (Framework Capability):** `shade-attestation` crate verifies TEE quotes in NEAR contracts | Chain Signatures MPC across target blockchains |
| **OutLayer (NEAR / Web3)** | TEE application execution + payment checks + vaults | Ephemeral keys & off-chain function execution in enclave | **Customer-recovery only (1–30d window):** Docs explicitly state this is *not* an end-user protection mechanism; payment reclaim requires TEE key re-derivation | **Yes (Vault/MPC Path):** DAO contract verifies attestation before master key release | Integrates with NEAR Intents and relayers |
| **NEAR Confidential Intents** | Two-chain architecture (NEAR + FAR private shard) | Private token balances, order amounts, and trade matching on FAR | **Not established for FAR/bridge outage:** Solver `recover` intents address execution failure, not permissionless exit from a stopped private chain | **Not established:** Operates via permissioned validator set and PoA bridge | Bridged execution between NEAR L1 and FAR private shard |
| **Enzyme Finance (EVM)** | Managed on-chain investment vaults | None (all portfolio positions, deposits, and trades are public) | **Conditional & configuration-specific:** Blue provides redemption functions; Onyx uses async redemption queue dependent on manager/liquidity | **N/A:** Pure on-chain smart contract logic | Single-chain EVM deployment per vault |
| **Safe (Gnosis Safe)** | Multi-owner smart contract wallet | None (all proposals, signers, and transactions are public) | **Not a default depositor right:** Signers govern collective treasury; no individual claim on asset fractions | **N/A:** Human or threshold cryptographic keys | Multi-chain deployments with separate state per chain |
| **Railgun (EVM / Arbitrum)** | Smart contract ZK privacy pool | Sender, recipient, token, and transaction amount shielded via ZK-SNARKs | **Conditional on user secrets:** User unshields funds using private viewing/spending keys; requires network provers | **N/A:** Cryptographic ZK-SNARK proof system | Independent contract deployments across supported EVM networks |
| **Aztec Network** | Privacy-first ZK-rollup L2 on Ethereum | Private state transitions, encrypted notes, and confidential contracts | **Rollup-dependent:** L1/L2 portal exit depends on state data availability and rollup contract status | **N/A:** ZK-SNARK rollup proof verification | Ethereum L1 portal bridging |
| **Secret Network** | Confidential Cosmos L1 using SGX nodes | Contract state and function inputs/outputs encrypted in SGX | **App-specific:** Timeout refunds in contract share execution fate with the confidential consensus network | **Network-level:** Enclave admission governed by network consensus | IBC bridging to Cosmos ecosystem |
| **Oasis Sapphire / ROFL** | Confidential EVM runtime + off-chain TEE app framework | Contract storage and runtime compute executed inside enclaves | **App-specific:** Contract-level exits can be built, but rely on Sapphire liveness or cross-chain bridge | **Runtime-level:** Key manager and compute nodes attested | Cross-chain messaging and bridge integrations |
| **Flashbots SUAVE / BuilderNet** | Confidential orderflow auction & MEV redistribution | Order parameters hidden in TEE until block construction | **N/A for general depositors:** Designed for transaction orderflow, not pooled multi-agent capital | **Operator-level:** Enclave attestation for block builders | Ethereum block building and MEV-Boost settlement |

---

## 3. Deep-Dive Comparative Analyses

### 3.1. OutLayer: The Closest Architectural Neighbor
OutLayer provides execution infrastructure for Web3 applications and agents using TEEs. It offers two distinct mechanisms:
1. **Payment Checks:** A sender locks funds for an agent or user with an expiration time. However, if the payment check is unclaimed, reclaiming funds requires the TEE to re-derive the ephemeral private key. If the TEE service is permanently lost or crashes, reclaim becomes blocked.
2. **Application Vaults:** OutLayer provides a **1–30 day customer unilateral-exit window** where the customer who deployed the vault can reclaim the master key. Crucially, OutLayer's official documentation explicitly warns:
   > *"This recovery mechanism is designed for application owners, not as an end-user protection mechanism."*

**Midge's Differentiation:** Midge shifts the recovery right from the application owner to the **individual end-user/agent depositor**. If a Midge coordinator stalls, every individual flyer can invoke `hatch_out()` directly on NEAR L1 to repatriate their exact escrow balance, completely independent of the operator, creator, or TEE.

### 3.2. Shade Agents & NEAR AI Cloud: Overlap and Separation
Phala's Shade Agents framework combines TEE verification in NEAR contracts with Chain Signatures. This represents important prior art:
- Shade demonstrates that NEAR contracts can verify Intel SGX/TDX quotes and use contract guardrails.
- However, Shade focuses on **single-agent autonomous workers**. It does not address multi-agent syndicate pooling, individual beneficial ownership, pro-rata balance deductions, or fail-stop depositor refund accounting.
- Standalone maintenance for the original Shade framework ended in April 2026, and its public repositories carry explicit warnings that the code has not undergone formal security audits.

Similarly, **NEAR AI Cloud** provides confidential inference APIs with Intel TDX attestation reports. However:
- NEAR AI Cloud SDKs have end-to-end encryption **disabled by default**.
- Third-party models (OpenAI, Anthropic) proxied through the gateway do not inherit upstream TEE hardware guarantees.
- A valid response signature proves only that *an attested model generated the text*; it does not prove the caller was authorized to settle pooled funds.

**Midge's Approach:** Midge treats NEAR AI Cloud inference as an optional provenance receipt, **never as settlement authorization**. Authorization remains strictly governed by the registered enclave key and bounded by the immutable `ReleasePolicy` on NEAR L1.

### 3.3. NEAR Confidential Intents & FAR Shard
NEAR's Confidential Intents architecture provides private swap execution using a two-chain architecture:
- Public NEAR accounts bridge assets into a permissioned, private FAR (Fast, Anonymous, Resilient) shard.
- A small set of permissioned validators process private state transitions, connected to NEAR L1 via a Proof-of-Authority (PoA) bridge.
- If the FAR shard validators stall or the bridge encounters an outage, individual users have no direct L1 smart contract mechanism to permissionlessly extract their bridged balances.

**Midge's Approach:** Midge keeps capital **directly in the NEAR L1 coordinator escrow contract**. Deliberation and order aggregation happen confidentially inside TEE memory, but the underlying capital never leaves the primary blockchain ledger. If the off-chain deliberation stops, the L1 escape hatch remains immediately operational.

### 3.4. Managed Pools (Enzyme) vs. Collective Governance (Safe / SputnikDAO)
- **Enzyme Finance:** Provides audited EVM investment vaults. While Enzyme Blue provides direct redemption functions, Onyx uses an asynchronous redemption queue where withdrawals can be throttled or delayed based on portfolio liquidity and manager actions. It does not address multi-agent autonomous negotiation or cross-chain MPC settlement.
- **Safe / SputnikDAO:** Governed by $M$-of-$N$ threshold voting. If signers disagree or lose keys, capital is trapped. Furthermore, multi-sig transactions are completely public, leaking strategic rebalancing intentions to front-running bots before execution.

---

## 4. Honest Assessment of Novelty & Boundaries

| Proposed Element | Closest Existing Precedent | Novelty Assessment | Defensible Technical Contribution |
| :--- | :--- | :--- | :--- |
| **TEE Proposes On-Chain Actions** | Shade Agents, Phala dstack, Oasis Sapphire | **Low as a general concept** | Hard on-chain `ReleasePolicy` constraints (allowlist, max BPS cap, deadline) that prevent a compromised TEE from stealing funds |
| **Funds Held in Contract Escrow** | Standard smart contract vaults | **Low** | Minimalist custody surface (5.81 TGas settlement, 5.10 TGas escape hatch) |
| **Signed Batch Settlement** | Signed intents, CoW Swap, 1Click Swap | **Low by itself** | Canonical Ed25519 6-tuple domain separation binding contract, syndicate, epoch, nonce, allocations hash, and order hash |
| **Per-Depositor Timeout Escape** | Rollup escape hatches, HTLC atomic swaps | **Moderate as an end-user guarantee** | True operator-independent exit: does not require TEE keys, master keys, or private chain liveness |
| **Autonomous Syndicate Swarms** | Syndicate.io investment clubs, DAOs | **Moderate at composition level** | Enabling heterogeneous AI agents and humans to pool capital with private strategy weights and public safety guarantees |

### Summary Verdict:
Midge does not claim to invent a new cryptographic primitive. Its defensible innovation is an **enforceable failure boundary**:
> *"Private syndicate coordination and shared execution facilities, with contract-limited settlement and depositor exits that do not depend on the coordinator remaining alive."*
