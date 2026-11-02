# Architectural Comparison: Fly Protocol vs. Existing Approaches

This document contrasts Fly Protocol with existing coordination, treasury, and agent paradigms on NEAR Protocol, specifically **NEAR Business (SputnikDAO Multisig)**, **Phala Shade Agents**, and **Plain On-Chain Escrow**.

---

## 1. Architectural Comparison Matrix

| Dimension | Plain Escrow | SputnikDAO / NEAR Business | Shade Agents (Phala/NEAR) | Fly Protocol (Autonomous Syndicate) |
| :--- | :--- | :--- | :--- | :--- |
| **Primary Actor** | Two counterparties | Human corporate board / signers | Single autonomous worker agent | Heterogeneous swarms (AI agents + human wallets) |
| **Coordination Model** | Static contract conditions | Human multisig voting threshold | Unilateral agent logic | Autonomous TEE Roost deliberation & Sealed Intent Aggregation |
| **Trust Model** | Trust contract logic | Trust $M$-of-$N$ human signers | Trust enclave code + single operator | **TEE as Arbiter, NOT Custodian** + Permissionless Per-User Escape Hatch |
| **Confidentiality Scope** | None (public parameters) | Quote hash commitment; execution parameters public | Private model weights & state | **Hardware-Shielded Deliberation**: Order amounts, slippage, and strategies hidden in TEE RAM; zeroed on aggregation |
| **Failure Mode (Liveness)** | Funds locked if condition fails | Signer deadlock / collusion freezes treasury | Enclave crash freezes worker execution | **Non-Custodial Escape Hatch (`hatch_out`)**: Any depositor exits unilaterally after timelock; cannot drain others |
| **Hardware Attestation** | None | None | SGX remote attestation | **Live Intel TDX Quote v4 DCAP-QVL**: Cryptographically verified to Intel Root CA; tamper-rejected |
| **Cross-Chain Settlement** | Single chain | Manual MPC signing requests | Single-key MPC execution | **Omnichain Threshold MPC**: Deterministic path derivation across EVM, Bitcoin Taproot, and Solana |
| **Spend Bounding** | Contract balance | Multisig policy parameters | Internal agent heuristics | **OutLayer Enforced**: Hard caps per flyer, per syndicate, and epoch-isolated |
| **On-Chain Gas Footprint** | Low | Medium (multi-step approvals) | Medium | **Ultra-Low Flash Settlement**: 5.81 TGas on NEAR L1 |

---

## 2. In-Depth Architectural Differentiators

### A. TEE as Arbiter, Not Custodian
In traditional TEE designs, users send private keys or full custody to an enclave agent. If the enclave crashes, encounters memory corruption, or the operator terminates the instance, capital is frozen indefinitely.
- **Fly's Invariant:** The contract (`fly-coordinator`) holds the escrow. The enclave holds zero keys to user deposits. It acts purely as a cryptographic oracle whose sole authority is submitting a signed aggregate batch order (`settle_batch`) within strict domain-separated parameters (`contract_id`, `syndicate_id`, `epoch`, `nonce`, `payout_recipient`, `order_hash`).

### B. Non-Custodial Escape Hatch (`hatch_out`)
In multi-sig solutions like SputnikDAO or corporate treasuries like NEAR Business, returning stalled funds requires threshold approval from signers. If keys are lost or signers become unresponsive, capital is permanently locked.
- **Fly's Invariant:** Every flyer retains a self-sovereign escape hatch. If the syndicate fails to settle within `timeout_blocks`, any individual depositor can call `hatch_out` to repatriate their exact escrow. The operation removes their ledger entry, updates the active flyer count, and preserves the exact escrow balances of all other syndicate members.

### C. Sealed Intent Aggregation (SIA)
In typical decentralized exchanges and DAO pooling, individual deposits and orders are broadcast publicly, exposing participants to front-running, sandwich attacks, and MEV extraction.
- **Fly's Invariant:** Flyers submit asymmetric RSA/EC-encrypted intents directly into the hardware-attested Roost enclave. Intents are decrypted exclusively in enclave memory, aggregated into a collective batch order (e.g. TWAP or block trade), and the individual parameters are instantly wiped (`zero_memory_invariant`).

### D. Verifiable Omnichain Reach via NEAR Chain Signatures
Rather than bridging or wrapping assets through custodial bridges, Fly integrates NEAR's decentralized threshold MPC network (`v1.signer-prod.testnet`).
- **Fly's Invariant:** From a single syndicate sub-account, Fly deterministically derives valid cross-chain addresses for Ethereum, Bitcoin Taproot, and Solana, and executes threshold signatures verified byte-for-byte on-chain.
