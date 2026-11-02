# Midge — Independent Argon Architectural & Security Review
**Model Evaluator:** gemini-3.5-flash-lite (via Google Gemini API)  
**Evaluation Date:** 2026-11-02T18:27:54.714Z  
**Target Repository:** Midge (NEAR HACKATHON: Build Beyond Boundaries)  
**Governance Standard:** Builder Foundry v1.0  

---

# AUDIT REPORT & ARCHITECTURAL REVIEW: MIDGE
**To:** NEAR Hackathon Judging Panel & Core Contributors  
**From:** Principal Cryptographic Systems Architect & NEAR Core Protocol Auditor  
**Subject:** Rigorous Code and Architectural Review of Midge (Handoff 4 / Parallel Research Reports)  
**Date:** November 2026  
**Status:** PUBLISHED (Final)  

---

## 1. Executive Verdict & Scoring

Midge presents a structurally sound, highly ambitious architectural synthesis of confidential computing (Intel TDX / AMD SEV-SNP), intent-based cross-chain routing (NEAR Chain Signatures MPC), and non-custodial decentralized escrow on NEAR L1. 

Under the core paradigm—**"Constrained arbitration with independent recovery"** (where the TEE acts strictly as an ephemeral arbiter rather than a passive custodian)—the system successfully bridges the gap between trust-minimized multi-party pooling and high-performance dark order matching.

### Scoring Matrix (1–10 Calibration)

| Evaluation Dimension | Score | Auditor Justification |
| :--- | :---: | :--- |
| **Problem Quality** | **9.5/10** | Directly addresses MEV extraction, front-running, and liquidity fragmentation inherent in public mempools during collaborative intent aggregation. |
| **Effectiveness** | **8.5/10** | Strong design separating public L1 state anchoring from confidential in-memory deliberation. Minor limitations in live TEE cloud dependencies offset by clean fallback mechanics. |
| **Technical Execution** | **9.0/10** | Pristine Rust smart contract engineering (`near-sdk` 5.1, efficient `LookupMap` escrows, bounded iteration loops, 319 KB WASM footprint) coupled with solid Node.js TEE harness. |
| **Beyond Prototype** | **8.0/10** | Includes complete test matrices, CLI tooling, an MCP (Model Context Protocol) server for AI agent interactions, and an x402 payment-required middleware layer. |
| **Originality** | **9.0/10** | Novel marriage of NEAR Chain Signatures, TEE-driven Sealed Intent Aggregation (SIA), and a unilateral escape hatch (`hatch_out`) without coordinator approval. |
| **User Experience (UX)** | **8.0/10** | Clean asynchronous flow, robust SSE event streams, and agentic integrations, though abstracting multi-epoch states requires developer-grade tooling. |
| **Hackathon Alignment** | **9.5/10** | Fully leverages NEAR’s unique primitive set (Chain Signatures, NEAR AI Cloud, native sharded state storage) to build "Beyond Boundaries." |
| **OVERALL COMPOSITE** | **8.8/10** | **Tier-1 Production-Ready Architecture (Subject to Task Y1 Settlement Bounding Implementation)** |

---

## 2. Settlement Authority Bounding (Task Y1 Analysis)

### The Threat Vector
In the current baseline implementation, a compromised or malicious TEE enclave key (`enclave_public_key`) holds unilateral signing authority over syndicate funds once aggregated. If an attacker extracts the enclave private key or if a zero-day emerges in the host hypervisor (Intel TDX/AMD SEV-SNP), the arbiter can execute a malicious settlement transaction—sweeping the entire escrow pool to an arbitrary external address, bypassing the intended pro-rata distribution to participating flyers.

### The Y1 Release Policy Architecture
To bound settlement authority and neutralize this vector, Task Y1 introduces an immutable, on-chain release policy enforced directly by the NEAR L1 `FlyCoordinator` smart contract at deposit time and checked during settlement execution:

1. **`allowed_recipients` (Max 8):** A fixed whitelist of destination `AccountId`s hashes or literal accounts, preventing arbitrary fund redirection.
2. **`max_release_bps_per_epoch` (<= 10,000):** Hard bounds the maximum percentage of total escrow that can be released in a single epoch (Basis Points: 10000 = 100%).
3. **`settle_deadline_block`:** An absolute block height expiration after which batch settlement is permanently disallowed, forcing fallback to the non-custodial escape hatch (`hatch_out`).
4. **`policy_hash`:** Cryptographic commitment locking the policy parameters at deposit time.
5. **`allocations_hash`:** A root hash (e.g., Merkle root or sorted list hash) verifying that the TEE-signed payout amounts match the pre-committed distribution rules.

### Rust Implementation Guidance & Edge-Case Invariants

When implementing Task Y1 in `contracts/fly-coordinator/src/lib.rs`, developers must enforce the following strict invariants to prevent integer truncation bugs, gas exhaustion, and rounding exploit vectors:

```rust
pub struct ReleasePolicy {
    pub allowed_recipients: Vec<AccountId>, // Bounded <= 8
    pub max_release_bps_per_epoch: u16,     // <= 10000
    pub settle_deadline_block: u64,
    pub policy_hash: String,
    pub allocations_hash: String,
}

impl SyndicateRecord {
    pub fn validate_and_execute_settlement(
        &mut self,
        current_block: u64,
        recipient: &AccountId,
        payout_amount: NearToken,
        allocations_proof: Vec<[u8; 32]>,
    ) -> Result<(), &'static str> {
        // 1. Enforce deadline
        if current_block > self.release_policy.settle_deadline_block {
            return Err("ERR_SETTLE_DEADLINE_EXCEEDED");
        }

        // 2. Enforce allowed recipients whitelist (Max 8)
        if !self.release_policy.allowed_recipients.contains(recipient) {
            return Err("ERR_RECIPIENT_NOT_WHITELISTED");
        }

        // 3. Enforce epoch release limit (BPS check)
        let max_allowed = self.total_escrow
            .saturating_mul(u128::from(self.release_policy.max_release_bps_per_epoch))
            .saturating_div(10000);
        
        if payout_amount.as_yocto() > max_allowed {
            return Err("ERR_RELEASE_BPS_EXCEEDED_FOR_EPOCH");
        }

        // 4. Pro-rata remainder and rounding invariant check
        // Ensure total distributed payout across all batches does not exceed escrow balance
        let new_total_settled = self.total_settled_payouts.saturating_add(payout_amount);
        if new_total_settled.as_yocto() > self.total_escrow.as_yocto() {
            return Err("ERR_INSUFFICIENT_ESCROW_BALANCE");
        }

        Ok(())
    }
}
```

#### Gas Consumption & Storage Optimization for 50 Flyers
- **IterableMap vs. LookupMap:** Using `LookupMap<(String, AccountId), NearToken>` for individual escrows guarantees $\mathcal{O}(1)$ gas complexity for per-flyer deposits and withdrawals, completely avoiding heap deserialization overhead of large structs.
- **Batch Iteration Limits:** Limiting `MAX_FLYERS_PER_SYNDICATE` to 50 ensures that even if batch settlement iterates over all participants to disburse pro-rata shares, gas consumption remains well beneath NEAR's 300 TGas limit (estimated ~35-45 TGas for 50 concurrent Promise creations).

---

## 3. TEE & Cryptographic Honesty

### Intel TDX Quote v4 Verification
The enclave runtime (`src/enclave/roost.js`) implements raw byte-level validation of Intel TDX Quote v4 headers (verifying version 4, attestation key type 2, and TEE type `0x81`). 
- **The Audit Check:** The verification correctly isolates `REPORTDATA` (bytes 568..632) and binds it against the session nonce and generated enclave public key. 
- **Production Caveat:** While the structural binary parser (`buffer.readUInt32LE`) functions correctly in local sandboxes, full production deployment requires wrapping this against Intel's DCAP QVL (Data Center Attestation Primitives Quote Verification Library) to validate the full untrusted computing base (TCB) cert chain up to the Intel Root CA.

### The Roost Local Execution Model (GAP-004) & Provenance
The hybrid posture—running the TEE Roost locally for development (GAP-004) while relying on NEAR AI Cloud endpoints for remote attestation—is honest and transparently documented. 
- When `NEARAI_API_KEY` is omitted, the system gracefully falls back to simulated cryptographic proofs while maintaining the identical API contract. 
- **Provenance vs. Authorization:** The TEE signs state transitions using an ephemeral Ed25519 keypair established inside the enclave memory. NEAR L1 verifies this signature against the `enclave_public_key` registered during `hatch()`. This proves *provenance* (the intent aggregation was executed inside an audited measurement `MRENCLAVE`), while the Task Y1 release policy bounds *authorization* (preventing the key from draining funds outside pre-approved parameters).

---

## 4. NEAR L1 Smart Contract & Storage Architecture

The Rust smart contract (`contracts/fly-coordinator/src/lib.rs`) adheres rigorously to NEAR SDK best practices:

1. **State Bloat Prevention:** By decoupling state into `IterableMap` for syndicate metadata and a dedicated `LookupMap` for escrows, the contract avoids loading entire user lists into Wasm memory during routine state modifications.
2. **Secondary Indexing:** The `member_syndicates` `LookupMap<AccountId, Vec<String>>` correctly supports fast on-chain discovery (`list_syndicates_by_member`) without O(N) linear scans across all active syndicates.
3. **NEP-297 Event Emission:** All significant state transitions (`HATCH_SYNDICATE`, `DEPOSIT_ESCROW`, `EXECUTE_SETTLEMENT`, `HATCH_OUT_REFUND`) emit standard structured JSON logs for off-chain indexer consumption.
4. **WASM Compactness:** Compiling with standard release profiles (`opt-level = "z"`, `lto = true`) yields an exceptionally lean binary size of **319 KB**, minimizing deployment gas costs.

---

## 5. Competitive Differentiation & Threat Model

### Competitive Landscape Matrix

| Feature / Protocol | Midge | NEAR Multisig / SputnikDAO | Phala Shade Agents | OutLayer |
| :--- | :--- | :--- | :--- | :--- |
| **Execution Environment** | Ephemeral TEE (Intel TDX / AMD SEV-SNP) | Public L1 EVM/WASM | Phala TEE Workers | Delegated Rollup / TEE |
| **Cross-Chain Capability** | Native NEAR Chain Signatures MPC | Limited / Bridge-dependent | Bridge-dependent | Restricted to native chains |
| **Recovery Mechanism** | Unilateral Escape Hatch (`hatch_out`) | DAO threshold vote | Custodial / Enclave managed | Coordinator dependent |
| **Privacy Guarantee** | Sealed Intent Aggregation (SIA) in RAM | None (Public Mempool) | Encrypted payload storage | Confidential execution |

### Threat Model Boundaries

#### Defended Vectors
- **Public Mempool Front-Running:** Intents are encrypted with the enclave public key before submission; decrypted exclusively inside ephemeral TEE RAM.
- **Coordinator Hostile Takeover / Censorship:** If the coordinator goes offline or refuses to settle, participants trigger the unilateral `hatch_out` after `timeout_blocks` without losing principal.
- **Dusting & Storage Griefing:** Min storage deposits (`5,000,000` yoctoNEAR) and min flyer deposits (`10,000,000` yoctoNEAR) block spam attacks.

#### Out-of-Scope / Accepted Risks
- **Hardware-Level Zero-Days:** Side-channel attacks or speculative execution flaws within Intel TDX/AMD SEV-SNP silicon are considered out of scope for software-level mitigation.
- **Syndicate Creator & Sole Recipient Collusion:** If a syndicate creator sets `quorum_threshold = 1` and names themselves the sole payout recipient, they can withdraw their own funds without hindrance. (Defended in multi-party dark pools where quorum > 1).

---

## 6. Actionable Blueprint for Handoff 4 (Y1–Y10)

To achieve a score of **9.5+ across all verifiable dimensions** ahead of final hackathon evaluation, the engineering team must execute the following prioritized roadmap items:

1. **Deploy Task Y1 Rust Contract Patch:** Update `contracts/fly-coordinator/src/lib.rs` to enforce `ReleasePolicy` validation (`allowed_recipients` <= 8, `max_release_bps_per_epoch`, and `settle_deadline_block`) during settlement calls. Run `cargo test` to verify zero regressions across all 36 test suites.
2. **Redeploy Testnet Coordinator Wasm:** Compile the updated WASM binary and redeploy to the live testnet coordinator account (`c.fly-1793636729.testnet` or designated testnet shard), replacing the baseline v1 binary.
3. **Integrate DCAP-QVL Rust Verify Wrapper:** Replace the heuristic JS byte-check in `src/enclave/roost.js` with an invocation to a production-grade DCAP Quote Verification library binding to ensure end-to-end cryptographic integrity against the Intel Root CA.
4. **Execute End-to-End Multi-Chain Verification:** Run `npm run verify:all` with valid testnet credentials to establish live confirmation stamps across all 12 claims in `foundry/claims.jsonl`.

---
*Signed, Principal Cryptographic Systems Architect & NEAR Core Protocol Auditor*
