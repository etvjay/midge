# Midge: Threat Model & Security Architecture

**Document Version:** 1.0.0  
**Date:** November 2026  
**Status:** Canonical Security Reference  
**Standard:** Builder Foundry Governance / IEEE 29148  

---

## 1. Executive Security Paradigm

Midge operates under the cryptographic paradigm of **Constrained Arbitration with Independent Recovery**.

The system explicitly rejects the naive assumption that Trusted Execution Environments (TEEs) are "trustless magic boxes" or infallible custodians. Instead, hardware enclaves (Intel TDX / AMD SEV-SNP on NEAR AI Cloud) are treated as **ephemeral, bounded arbiters**:
- **Enclave deliberates in memory:** Private orders and sealed bids are decrypted only within hardware-shielded memory.
- **Settlement authority is strictly bounded:** An enclave's signature can only release funds within immutable, on-chain parameters (`ReleasePolicy`) consented to by depositors at deposit time.
- **Depositors retain independent sovereign recovery:** If an enclave crashes, stalls, censors, or is taken down, depositors can unconditionally withdraw 100% of their unspent escrow via the `hatch_out` escape hatch without operator permission.

---

## 2. System Assets & Actors

### 2.1 Critical Assets
1. **Escrowed Capital:** NEAR and NEP-141 tokens pooled inside the L1 `FlyCoordinator` smart contract (`c.fly-1793636729.testnet`).
2. **Pre-Trade Intent Intelligence:** Order size, limit price, slippage tolerance, and proprietary trading strategies submitted by Flyers.
3. **Derived Omnichain Keys:** Sovereign accounts on Bitcoin, Ethereum, and Solana controlled via NEAR Chain Signatures MPC.
4. **Deliberation Provenance:** Cryptographic attestation quotes (Intel TDX Quote v4) and signed consensus batches.

### 2.2 System Actors
- **Flyer (Depositor / Agent):** An autonomous AI agent or institutional wallet contributing capital and submitting sealed intents.
- **Syndicate Creator:** The entity configuring syndicate parameters (`hatch`), registering the initial enclave public key, and establishing the immutable release policy.
- **Roost Enclave (Arbiter):** Hardware-isolated TEE process running on NEAR AI Cloud responsible for in-memory decryption, order matching, and HAQ attestation generation.
- **FlyCoordinator (Smart Contract):** Immutable L1 state machine on NEAR enforcing escrow accounting, signature verification, policy bounding, and non-custodial refunds.
- **MEV Searcher / Mempool Adversary:** External observer attempting to front-run, sandwich, or copy-trade pending orders.
- **Host Hypervisor / Cloud Operator:** Infrastructure provider hosting the enclave hardware.

---

## 3. Explicit Trust Assumptions & Boundaries

| Component | Trust Assumption | Failure Mode | Protocol Defense |
| :--- | :--- | :--- | :--- |
| **Release Policy** | Depositor verifies policy before consenting | Creator configures bad whitelist | `policy_hash` checked on deposit; immutable on-chain |
| **TEE Arbiter** | Hardware enclave executes untampered code | Enclave key compromise or hypervisor bypass | Enclave key CANNOT bypass `allowed_recipients` or cap |
| **Operator Liveness** | Roost delivers settlement before deadline | Operator stalls, vanishes, or crashes | Sovereign `hatch_out` timeout unlocks 100% refund |
| **L1 Blockchain** | NEAR Protocol consensus provides finality | L1 reorganization or 51% attack | Standard NEAR proof-of-stake finality guarantees |
| **Public State** | Deposits, amounts, and flyer IDs are PUBLIC | Observer traces funding addresses | Protocol claims *deliberation privacy*, not public-deposit anonymity |

> [!IMPORTANT]
> **Public-Chain Privacy Reality:**
> Deposits and withdrawals are ordinary NEAR transactions. Observers can inspect depositor account IDs, transaction hashes, amounts, and timing on public explorers (NearBlocks).
> Midge guarantees **confidentiality of deliberation inputs and sealed intent parameters**, not zero-knowledge graph obfuscation of funding accounts.

---

## 4. Threat Vectors, Defenses & Verifications

### Threat T1: Compromised Enclave Key (Malicious Settlement Drain)
- **Attack Scenario:** An attacker extracts the enclave private key or hypervisor zero-day allows arbitrary signature generation. The attacker crafts a `settle_batch` call transferring 100% of escrow to an attacker-owned address.
- **Protocol Defense:** Bounded `ReleasePolicy`. The L1 smart contract enforces:
  1. Every destination must be in `allowed_recipients` (max 8 whitelisted accounts).
  2. Total payout cannot exceed `max_release_bps_per_epoch` (e.g. 5,000 BPS = 50%).
  3. Current block must be strictly `< settle_deadline_block`.
- **On-Chain Evidence:** Verified on NEAR testnet (`tx: ExMmWDawYYjZ7gyg3KZe4Hpf6YZJx68Pjzrw7M4bmLAh`). The contract rejected the settlement with `[Settle REJECT] Recipient not in allowed_recipients`.

### Threat T2: Operator Vanishes or Censors Deliberation (Stalled Funds)
- **Attack Scenario:** The TEE host goes offline, the Roost crashes, or the operator refuses to deliver signatures.
- **Protocol Defense:** Unilateral Non-Custodial Escape Hatch (`hatch_out`).
  1. After `timeout_blocks` elapses without settlement, any flyer can invoke `hatch_out`.
  2. Requires **zero coordinator signatures**, **zero operator permission**, and **zero admin keys**.
  3. The contract immediately returns 100% of the flyer's remaining escrow balance.
- **On-Chain Evidence:** Verified on NEAR testnet (`tx: BiKpqM7jFkVZxex985V9hjJ7mcqpgWbjtXBEL2u7FbZB`). 100% of escrow returned in 5.10 TGas.

### Threat T3: Pre-Trade Information Leakage & Front-Running (MEV)
- **Attack Scenario:** Mempool bots observe individual swap sizes, limit prices, and directions, sandwiching traders.
- **Protocol Defense:** Sealed Intent Aggregation (SIA) inside Intel TDX enclave RAM.
  1. Orders encrypted with enclave session key before leaving client.
  2. Mempool sees zero order details.
  3. Single batch transaction executes at uniform clearing price.
- **Empirical Baseline Evidence:** Calibrated simulation (`scripts/baseline.js`) demonstrates that sealed batch execution drops realized slippage from 16.67% to 15.60% and eliminates $519.44/epoch in predatory sandwich extraction.

### Threat T4: Nonce Replay & Cross-Syndicate Signature Confusion
- **Attack Scenario:** An attacker captures a valid signature from syndicate A and replays it on syndicate B, or replays an old epoch settlement.
- **Protocol Defense:** 6-Tuple Canonical Domain Separation.
  - Signed message: `contract_id:syndicate_id:epoch:nonce:allocations_hash:order_hash`.
  - On-chain contract checks `epoch == syn.epoch` and `nonce == syn.round_nonce`. Nonce increments monotonically after each settlement.
- **On-Chain Evidence:** Verified on NEAR testnet (`tx: FMpQxKoBP8dvqdJaB5hHWaHnWYwF9qzPVUx9RAYgxErg`). Replayed settlement rejected with `[Settle REJECT] Nonce mismatch`.

### Threat T5: Accounting Rounding Exploit (Value Creation from Dust)
- **Attack Scenario:** Iterative pro-rata deductions across up to 50 flyers accumulate integer truncation rounding errors, allowing an attacker to drain more than `total_escrow`.
- **Protocol Defense:** Exact Dust Conservation.
  - The contract computes pro-rata deductions as `deduction = (flyer_bal * total_payout) / total_escrow`.
  - Sum of deductions is tracked. Any fractional remainder (`total_payout - sum_deducted`) is assigned to the first participating flyer.
  - Invariant verified by proptests: $\sum \text{balances} == \text{total\_escrow}$ and $\text{total\_paid} + \text{total\_refundable} \le \text{total\_deposited}$.

---

## 5. Residual Risks & What Midge Does NOT Claim

In accordance with rigorous intellectual honesty:

1. **Hardware Side-Channels (Physical & Hypervisor Access):**
   - Disclosures such as Intel SA-01099 (CVE-2024-27457), TDXploit (USENIX Security 2025 cache single-stepping), and physical interposer tapping (Wiretap/Battering RAM) demonstrate that physical operators with dedicated hardware labs can observe microarchitectural signals.
   - *Midge Stance:* We do not claim cryptographic invulnerability to state-level physical hardware attacks. Our defense is economic bounding: even a compromised hardware enclave cannot transfer funds outside the depositor-consented `ReleasePolicy`.
2. **Off-Chain Collusion in Whitelist Design:**
   - If a creator specifies an allowlist where all recipients are creator-controlled shills, and depositors blindly consent to that policy hash, the enclave could legally settle funds to those accounts.
   - *Mitigation:* The `FlyClient` SDK and MCP tools automatically surface the plain-text policy and recipient list for user and agent review before deposit.
3. **Execution Quality / Bad Strategy:**
   - The Roost enclave proves that a specific algorithm was executed faithfully; it does not guarantee that the trade itself was profitable in the open market.
