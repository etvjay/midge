# FlyCoordinator: Independent-Exit Escrow with Bounded Release Policy

[![Contract Tests](https://img.shields.io/badge/Rust_Tests-44_Passing-success.svg)](https://github.com/near/fly)
[![NEAR SDK](https://img.shields.io/badge/NEAR_SDK-5.1.0-blue.svg)](https://crates.io/crates/near-sdk)
[![WASM Size](https://img.shields.io/badge/WASM_Size-304_KB-informational.svg)](contracts/fly-coordinator/target/wasm32-unknown-unknown/release/fly_coordinator.wasm)
[![License](https://img.shields.io/badge/License-MIT%2FApache--2.0-blue.svg)](LICENSE)

A battle-tested, gas-optimized NEAR Protocol L1 smart contract implementing **constrained arbitration with independent recovery**. It provides pooled capital coordination for autonomous AI agent swarms and human collectives without custodial risk or operator lock-in.

---

## 1. Architectural Philosophy

Standard pooled-capital contracts suffer from an asymmetric trust problem:
- **Discretionary Custodians:** If an off-chain actor (bot, operator, or TEE enclave) has authority to sign payouts, a compromised key can drain 100% of the pooled funds to an attacker.
- **Operator Lock-In:** If the off-chain coordinator crashes, stalls, or is censored, depositor funds remain trapped indefinitely unless an expensive multisig committee steps in.

`FlyCoordinator` resolves this dilemma by separating **coordination authority** from **custody authority**:
1. **Bounded Settlement Authority:** The off-chain coordinator is never a custodian. It can only propose settlements strictly conforming to an immutable `ReleasePolicy` (allowlisted recipient accounts, per-epoch percentage caps, and strict deadlines) to which depositors explicitly consented upon depositing.
2. **Independent Escape Hatch (`hatch_out`):** If an enclave or operator stalls past `timeout_blocks`, any individual depositor can unilaterally reclaim 100% of their remaining eligible balance directly from the contract. This operation requires zero operator cooperation, zero enclave signatures, and does not touch or dilute any other participant's escrow.

---

## 2. Interface Specification

### Change Methods (`&mut self`)

#### `hatch`
Initializes a new syndicate instance with an immutable release policy and enclave binding.
```rust
pub fn hatch(
    &mut self,
    syndicate_id: String,
    syndicate_type: SyndicateType,
    quorum_threshold: u64,
    enclave_public_key: String,
    expected_code_hash: String,
    timeout_blocks: u64,
    release_policy: ReleasePolicy,
)
```
- **Attached Deposit:** Minimum `0.05 NEAR` (covers contract storage staking).
- **Validations:** ID character whitelist (`[a-zA-Z0-9_-]`), quorum $\ge 1$, timeout blocks $\ge 10$, non-empty recipient allowlist in `ReleasePolicy`.

#### `deposit`
Allows an agent or user wallet to escrow funds into a syndicate, explicitly consenting to its release policy.
```rust
pub fn deposit(
    &mut self,
    syndicate_id: String,
    policy_hash: String,
)
```
- **Attached Deposit:** Minimum `0.01 NEAR`.
- **Validations:** Syndicate must be in `Active` status; `policy_hash` must match the SHA-256 hash of the syndicate's immutable `ReleasePolicy`; active flyer count must not exceed the Sybil cap (50).

#### `settle_batch`
Executes an enclave-authorized batch settlement payout within policy bounds.
```rust
pub fn settle_batch(
    &mut self,
    syndicate_id: String,
    allocations: Vec<(AccountId, U128)>,
    order_hash: String,
    epoch: u64,
    nonce: u64,
    enclave_signature: String,
) -> Promise
```
- **Validations:**
  - Nonce must strictly equal `syndicate.round_nonce + 1`.
  - Current block height must not exceed `release_policy.settle_deadline_block`.
  - Every recipient in `allocations` must be explicitly listed in `release_policy.allowed_recipients`.
  - Total payout must not exceed `release_policy.max_release_bps_per_epoch` of the syndicate's available escrow.
  - Ed25519 signature must verify over the canonical 6-tuple message:
    `current_account_id:syndicate_id:epoch:round_nonce:allocations_hash:order_hash`
- **Gas Usage:** ~5.92 TGas total (including cross-contract payout Promise).

#### `hatch_out`
Unilateral non-custodial escape hatch for individual depositors after timeout.
```rust
pub fn hatch_out(&mut self, syndicate_id: String) -> Promise
```
- **Validations:** Current block height must exceed `last_interaction_block + timeout_blocks`; caller must have an active escrow balance $> 0$; syndicate must not currently be in the middle of an asynchronous settlement.
- **Gas Usage:** ~5.10 TGas total.

---

### View Methods (`&self`)

```rust
pub fn get_syndicate(&self, syndicate_id: String) -> Option<SyndicateRecord>;
pub fn get_release_policy(&self, syndicate_id: String) -> Option<ReleasePolicy>;
pub fn get_policy_hash(&self, syndicate_id: String) -> Option<String>;
pub fn get_escrow(&self, syndicate_id: String, account_id: AccountId) -> NearToken;
pub fn get_syndicate_count(&self) -> u64;
pub fn list_syndicates(&self, from_index: Option<u64>, limit: Option<u64>) -> Vec<SyndicateRecord>;
pub fn list_syndicates_by_member(&self, account_id: AccountId, from_index: Option<u64>, limit: Option<u64>) -> Vec<SyndicateRecord>;
```

---

## 3. Formal Invariants & Security Guarantees

| Invariant | Description | Enforcement Mechanism |
| :--- | :--- | :--- |
| **INV-1: Escrow Conservation** | `total_escrow == sum(escrows)` across all flyers at all times. | Pro-rata deductions distribute remainder dust deterministically to the largest contributor. |
| **INV-2: Policy Immutability** | A syndicate's `ReleasePolicy` cannot be altered after `hatch()`. | Stored in immutable `SyndicateRecord`; depositors must verify and pass `policy_hash` on deposit. |
| **INV-3: Bounded Settlement Authority** | An enclave signature cannot pay unauthorized recipients or exceed caps. | L1 smart contract validates each recipient against `allowed_recipients` and verifies `max_release_bps`. |
| **INV-4: Replay & Domain Separation** | Settlement signatures cannot be replayed across contracts, syndicates, or nonces. | Signed message strictly binds `contract_id:syndicate_id:epoch:nonce:allocations_hash:order_hash`. |
| **INV-5: Unilateral Independent Recovery** | Any flyer can reclaim their exact escrow after timeout without operator assistance. | `hatch_out()` executes autonomously via L1 consensus; refunds caller directly and cleans up state. |
| **INV-6: Idempotent Rollback Safety** | Failed asynchronous payout transfers do not cause state desynchronization. | Private callback `on_settlement_payout` and `on_hatch_out_payout` verify promise status and restore state. |
| **INV-7: Anti-Sybil Bounded Capacity** | A single syndicate cannot exceed 50 concurrent active flyers. | Contract rejects deposits beyond 50 flyers; minimum deposit of 0.01 NEAR prevents zero-cost spam. |

---

## 4. Reproducible Build & Verification

```bash
# Ensure Rust and wasm32 target are installed
rustup target add wasm32-unknown-unknown

# Compile deterministic release binary
RUSTFLAGS="-C link-arg=-s" cargo build --target wasm32-unknown-unknown --release

# Run comprehensive test suite (Unit, Integration, Proptest Invariant Fuzzing)
cargo test
```

### Verified Cryptographic Artifacts
- **Target WASM:** `contracts/fly-coordinator/target/wasm32-unknown-unknown/release/fly_coordinator.wasm`
- **WASM Size:** 304 KB (311,421 bytes)
- **SHA-256:** `ece45a939ac5cfcf4754b8fe8437facc70c11b0f0f45a30c3cc1133a3217b6a1`
- **Deployed Testnet Code Hash:** `GwjB69No5TfDcuFTrff67kNmRUd7fQDW75kMxZp9Mxwi`
- **Active Testnet Instance:** [`c.fly-1793636729.testnet`](https://testnet.nearblocks.io/address/c.fly-1793636729.testnet)
