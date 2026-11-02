use near_sdk::store::{IterableMap, LookupMap};
use near_sdk::{env, near, AccountId, Gas, NearToken, PanicOnDefault, Promise};

/// Minimum storage deposit to prevent storage griefing attacks (0.005 NEAR).
pub const MIN_STORAGE_DEPOSIT_YOCTO: u128 = 5_000_000_000_000_000_000_000;

/// Minimum deposit per flyer to prevent dusting attacks (0.01 NEAR).
pub const MIN_DEPOSIT_YOCTO: u128 = 10_000_000_000_000_000_000_000;

/// Maximum number of distinct flyers per syndicate to bound gas consumption.
pub const MAX_FLYERS_PER_SYNDICATE: u32 = 50;

#[near(serializers = [borsh, json])]
#[derive(Clone, PartialEq, Debug)]
pub enum SyndicateType {
    Flash,
    DarkVault,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, PartialEq, Debug)]
pub enum SyndicateStatus {
    Active,
    Settled,
    AbortedRefunded,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct SyndicateRecord {
    pub id: String,
    pub owner: AccountId,
    pub syndicate_type: SyndicateType,
    pub sub_account: AccountId,
    pub quorum_threshold: u32,
    pub max_spend_per_flyer: NearToken,
    pub enclave_public_key: String, // 32-byte hex-encoded Ed25519 public key
    pub expected_code_hash: String, // MRENCLAVE / measurement metadata
    pub timeout_blocks: u64,
    pub created_at_block: u64,
    pub epoch_start_block: u64,
    pub status: SyndicateStatus,
    pub epoch: u64,
    pub round_nonce: String,
    pub flyer_count: u32,
    pub active_flyer_count: u32,
    pub flyers: Vec<AccountId>, // Bounded by MAX_FLYERS_PER_SYNDICATE (<=50)
    pub total_escrow: NearToken,
    pub settled_batches: Vec<String>,
    pub total_settled_payouts: NearToken,
    pub payout_recipient: AccountId,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct FlyCoordinator {
    pub syndicates: IterableMap<String, SyndicateRecord>,
    // Dedicated LookupMap to prevent unbounded state deserialization in SyndicateRecord
    // Key: (syndicate_id, flyer_account_id) -> NearToken
    pub escrows: LookupMap<(String, AccountId), NearToken>,
}

#[near]
#[allow(clippy::too_many_arguments)]
impl FlyCoordinator {
    #[init]
    pub fn new() -> Self {
        Self {
            syndicates: IterableMap::new(b"s"),
            escrows: LookupMap::new(b"e"),
        }
    }

    /// hatch(): Instantiates a new confidential syndicate instance on NEAR L1.
    /// Requires minimum storage deposit, validates charset/length, quorum, and timeout.
    #[payable]
    #[allow(clippy::too_many_arguments)]
    pub fn hatch(
        &mut self,
        syndicate_id: String,
        syndicate_type: Option<String>,
        quorum_threshold: Option<u32>,
        max_spend_near: Option<u128>,
        enclave_public_key: String, // 64 hex characters (32 bytes)
        expected_code_hash: String,
        timeout_blocks: Option<u64>,
        payout_recipient: Option<AccountId>,
    ) -> String {
        // 1. Storage deposit guard
        let attached = env::attached_deposit();
        assert!(
            attached.as_yoctonear() >= MIN_STORAGE_DEPOSIT_YOCTO,
            "[Hatch REJECT] Minimum storage deposit of 0.005 NEAR required to hatch."
        );

        // 2. ID validation: 3..=64 characters, lowercase alphanumeric, '-' or '_'
        assert!(
            syndicate_id.len() >= 3 && syndicate_id.len() <= 64,
            "[Hatch REJECT] Syndicate ID length must be between 3 and 64 characters."
        );
        assert!(
            syndicate_id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_'),
            "[Hatch REJECT] Syndicate ID must only contain lowercase alphanumeric, '-' or '_' characters."
        );

        // 3. Prevent duplicate hatching
        assert!(
            !self.syndicates.contains_key(&syndicate_id),
            "[Hatch REJECT] Syndicate already hatched."
        );

        // 4. Validate Enclave Ed25519 public key format (32 bytes hex)
        let pk_bytes = hex::decode(&enclave_public_key)
            .unwrap_or_else(|_| env::panic_str("[Hatch REJECT] Invalid hex enclave public key"));
        assert_eq!(
            pk_bytes.len(),
            32,
            "[Hatch REJECT] Enclave public key must be exactly 32 bytes (64 hex characters)."
        );

        let syn_type = match syndicate_type.as_deref() {
            Some("DARK_VAULT") => SyndicateType::DarkVault,
            _ => SyndicateType::Flash,
        };

        let owner = env::predecessor_account_id();
        let sub_account: AccountId = format!("{}.{}", syndicate_id, env::current_account_id())
            .parse()
            .unwrap_or_else(|_| env::panic_str("Invalid sub-account format"));

        let created_at_block = env::block_height();
        let timeout = timeout_blocks.unwrap_or(50);
        let quorum = quorum_threshold.unwrap_or(3);

        // Validate quorum and timeout are positive
        assert!(quorum >= 1, "[Hatch REJECT] quorum_threshold must be >= 1.");
        assert!(timeout >= 1, "[Hatch REJECT] timeout_blocks must be >= 1.");

        // Safe NearToken arithmetic preventing u128 overflow
        let max_spend = match max_spend_near {
            Some(val) => {
                let yocto = val
                    .checked_mul(1_000_000_000_000_000_000_000_000)
                    .unwrap_or_else(|| {
                        env::panic_str("[Hatch REJECT] max_spend_near exceeds yoctoNEAR limit")
                    });
                NearToken::from_yoctonear(yocto)
            }
            None => NearToken::from_near(100),
        };

        let seed = format!("{}:{}", syndicate_id, created_at_block);
        let round_nonce = near_sdk::env::sha256(seed.as_bytes())
            .iter()
            .map(|b| format!("{:02x}", b))
            .collect::<String>();

        let recipient = payout_recipient.unwrap_or_else(|| owner.clone());

        let record = SyndicateRecord {
            id: syndicate_id.clone(),
            owner,
            syndicate_type: syn_type,
            sub_account,
            quorum_threshold: quorum,
            max_spend_per_flyer: max_spend,
            enclave_public_key,
            expected_code_hash,
            timeout_blocks: timeout,
            created_at_block,
            epoch_start_block: created_at_block,
            status: SyndicateStatus::Active,
            epoch: 1,
            round_nonce,
            flyer_count: 0,
            active_flyer_count: 0,
            flyers: Vec::new(),
            total_escrow: NearToken::from_yoctonear(0),
            settled_batches: Vec::new(),
            total_settled_payouts: NearToken::from_yoctonear(0),
            payout_recipient: recipient,
        };

        self.syndicates.insert(syndicate_id.clone(), record);
        syndicate_id
    }

    /// deposit(): Locks NEAR into the syndicate escrow.
    /// Enforces minimum deposit, cap on total distinct flyers, and OutLayer spend limits.
    #[payable]
    pub fn deposit(&mut self, syndicate_id: String) {
        let caller = env::predecessor_account_id();
        let attached = env::attached_deposit();

        assert!(
            attached.as_yoctonear() >= MIN_DEPOSIT_YOCTO,
            "[Deposit REJECT] Minimum deposit of 0.01 NEAR required."
        );

        let syn = self
            .syndicates
            .get_mut(&syndicate_id)
            .unwrap_or_else(|| env::panic_str("Syndicate not found"));

        assert_eq!(
            syn.status,
            SyndicateStatus::Active,
            "[Deposit REJECT] Cannot deposit into inactive syndicate."
        );

        let escrow_key = (syndicate_id.clone(), caller.clone());
        let current_balance = self
            .escrows
            .get(&escrow_key)
            .copied()
            .unwrap_or_else(|| NearToken::from_yoctonear(0));

        let new_balance = current_balance.saturating_add(attached);

        assert!(
            new_balance.as_yoctonear() <= syn.max_spend_per_flyer.as_yoctonear(),
            "[Deposit REJECT] Deposit exceeds OutLayer max_spend_per_flyer policy limit."
        );

        // If this is a new flyer, check max capacity
        // If this flyer currently has 0 balance, count as an active flyer
        if current_balance.as_yoctonear() == 0 {
            assert!(
                syn.active_flyer_count < MAX_FLYERS_PER_SYNDICATE,
                "[Deposit REJECT] Maximum 50 flyers reached for this syndicate."
            );
            syn.active_flyer_count += 1;
            syn.flyers.push(caller.clone());
        }

        self.escrows.insert(escrow_key, new_balance);
        syn.total_escrow = syn.total_escrow.saturating_add(attached);
    }

    /// settle_batch(): Verifies HAQ attestation signature and executes settlement payout.
    /// Enforces domain-separated message signing: (contract_id:syndicate_id:epoch:round_nonce:payout_recipient:order_hash).
    /// For Flash syndicates: transfers pooled escrow to immutable payout recipient via Promise and clears state.
    /// For DarkVault: resets epoch_start_block for the new epoch and rolls over escrow.
    pub fn settle_batch(
        &mut self,
        syndicate_id: String,
        attestation_nonce: String,
        aggregate_order_hash: String,
        enclave_signature: String,
    ) {
        let syn = self
            .syndicates
            .get_mut(&syndicate_id)
            .unwrap_or_else(|| env::panic_str("Syndicate not found"));

        assert_eq!(
            syn.status,
            SyndicateStatus::Active,
            "[HAQ REJECT] Syndicate is not active"
        );

        // 1. Verify nonce binding (prevents replay attacks)
        assert_eq!(
            attestation_nonce, syn.round_nonce,
            "[HAQ REJECT] Nonce mismatch. Replay attack blocked."
        );

        // 2. Verify Quorum threshold
        assert!(
            syn.active_flyer_count >= syn.quorum_threshold,
            "[QUORUM REJECT] Active flyer count below threshold."
        );

        // 3. Cryptographic Ed25519 Enclave Signature Verification with Strict Domain Separation
        let sig_bytes = hex::decode(&enclave_signature)
            .unwrap_or_else(|_| env::panic_str("[HAQ REJECT] Invalid hex enclave signature"));
        assert_eq!(
            sig_bytes.len(),
            64,
            "[HAQ REJECT] Enclave signature must be exactly 64 bytes (128 hex characters)"
        );
        let mut sig_arr = [0u8; 64];
        sig_arr.copy_from_slice(&sig_bytes);

        let pk_bytes = hex::decode(&syn.enclave_public_key)
            .unwrap_or_else(|_| env::panic_str("[HAQ REJECT] Invalid hex enclave public key"));
        assert_eq!(
            pk_bytes.len(),
            32,
            "[HAQ REJECT] Enclave public key must be exactly 32 bytes (64 hex characters)"
        );
        let mut pk_arr = [0u8; 32];
        pk_arr.copy_from_slice(&pk_bytes);

        // Domain-separated signed message: (contract_id, syndicate_id, epoch, round_nonce, payout_recipient, order_hash)
        let message = format!(
            "{}:{}:{}:{}:{}:{}",
            env::current_account_id(),
            syn.id,
            syn.epoch,
            syn.round_nonce,
            syn.payout_recipient,
            aggregate_order_hash
        );
        assert!(
            env::ed25519_verify(&sig_arr, message.as_bytes(), &pk_arr),
            "[HAQ REJECT] Invalid enclave Ed25519 signature over deliberation batch!"
        );

        // 4. Record settled batch and execute financial payout
        syn.settled_batches.push(aggregate_order_hash);

        match syn.syndicate_type {
            SyndicateType::Flash => {
                let payout_target = syn.payout_recipient.clone();
                let payout_amount = syn.total_escrow;

                syn.total_settled_payouts = syn.total_settled_payouts.saturating_add(payout_amount);
                syn.total_escrow = NearToken::from_yoctonear(0);
                syn.status = SyndicateStatus::Settled;

                // Transfer pooled funds to the immutable payout recipient with failure callback
                if payout_amount.as_yoctonear() > 0 {
                    let _ = Promise::new(payout_target).transfer(payout_amount).then(
                        Self::ext(env::current_account_id())
                            .with_static_gas(Gas::from_tgas(15))
                            .on_settlement_payout(syn.id.clone(), payout_amount),
                    );
                }
            }
            SyndicateType::DarkVault => {
                syn.epoch += 1;
                syn.epoch_start_block = env::block_height(); // Reset deliberation window for next epoch
                let next_seed = format!("{}:{}:{}", syn.id, syn.epoch, env::block_height());
                syn.round_nonce = near_sdk::env::sha256(next_seed.as_bytes())
                    .iter()
                    .map(|b| format!("{:02x}", b))
                    .collect::<String>();
            }
        }
    }

    /// hatch_out(): Automated non-custodial escape hatch.
    /// Unlocks 100% refund of the calling Flyer's individual escrow if block timeout has expired.
    /// Blocked after settlement; does not abort syndicate prematurely.
    /// In DarkVaults, timeout is measured from current epoch start block.
    pub fn hatch_out(&mut self, syndicate_id: String) -> Promise {
        let caller = env::predecessor_account_id();
        let current_block = env::block_height();

        let syn = self
            .syndicates
            .get_mut(&syndicate_id)
            .unwrap_or_else(|| env::panic_str("Syndicate not found"));

        // 1. Block refund if syndicate already successfully settled
        assert_ne!(
            syn.status,
            SyndicateStatus::Settled,
            "[Hatch-Out REJECT] Cannot refund already settled syndicate."
        );

        // 2. Timelock verification: Deliberation window must have expired since epoch start
        let blocks_passed = current_block.saturating_sub(syn.epoch_start_block);
        if blocks_passed < syn.timeout_blocks && syn.status == SyndicateStatus::Active {
            env::panic_str("[Hatch-Out LOCKED] Deliberation window still active.");
        }

        // 3. User balance verification: refund only caller's remaining escrow from LookupMap
        let escrow_key = (syndicate_id.clone(), caller.clone());
        let flyer_balance = self
            .escrows
            .get(&escrow_key)
            .copied()
            .unwrap_or_else(|| NearToken::from_yoctonear(0));

        assert!(
            flyer_balance.as_yoctonear() > 0,
            "[Hatch-Out REJECT] No escrow balance to refund for caller."
        );

        // 4. Remove caller's entry from LookupMap to reclaim storage and prevent double refund attacks
        self.escrows.remove(&escrow_key);
        syn.total_escrow = syn.total_escrow.saturating_sub(flyer_balance);
        syn.active_flyer_count = syn.active_flyer_count.saturating_sub(1);
        syn.flyers.retain(|f| f != &caller);

        // 5. Update syndicate status to AbortedRefunded if all escrow is cleared
        if syn.total_escrow.as_yoctonear() == 0 {
            syn.status = SyndicateStatus::AbortedRefunded;
        }

        Promise::new(caller.clone()).transfer(flyer_balance).then(
            Self::ext(env::current_account_id())
                .with_static_gas(Gas::from_tgas(15))
                .on_hatch_out_payout(syndicate_id, caller, flyer_balance),
        )
    }

    /// Callback for Flash settlement payout transfer failure handling.
    #[private]
    pub fn on_settlement_payout(&mut self, syndicate_id: String, payout_amount: NearToken) -> bool {
        assert_eq!(
            env::current_account_id(),
            env::predecessor_account_id(),
            "Method is private"
        );

        if !near_sdk::is_promise_success() {
            if let Some(syn) = self.syndicates.get_mut(&syndicate_id) {
                syn.status = SyndicateStatus::Active;
                syn.total_escrow = syn.total_escrow.saturating_add(payout_amount);
                syn.total_settled_payouts = syn.total_settled_payouts.saturating_sub(payout_amount);
            }
            return false;
        }

        // On successful settlement transfer: reclaim storage for all flyers in Flash syndicate
        if let Some(syn) = self.syndicates.get_mut(&syndicate_id) {
            for flyer in &syn.flyers {
                self.escrows.remove(&(syn.id.clone(), flyer.clone()));
            }
            syn.flyers.clear();
            syn.active_flyer_count = 0;
        }

        true
    }

    /// Callback for escape hatch refund payout transfer failure handling.
    #[private]
    pub fn on_hatch_out_payout(
        &mut self,
        syndicate_id: String,
        flyer_id: AccountId,
        refund_amount: NearToken,
    ) -> bool {
        assert_eq!(
            env::current_account_id(),
            env::predecessor_account_id(),
            "Method is private"
        );

        if !near_sdk::is_promise_success() {
            let escrow_key = (syndicate_id.clone(), flyer_id.clone());
            let current = self
                .escrows
                .get(&escrow_key)
                .copied()
                .unwrap_or_else(|| NearToken::from_yoctonear(0));

            // Only increment active_flyer_count and add to syn.flyers if current balance was 0
            // Enforce MAX_FLYERS_PER_SYNDICATE cap to prevent 51-flyer rollback overshoot
            if current.as_yoctonear() == 0 {
                if let Some(syn) = self.syndicates.get_mut(&syndicate_id) {
                    if syn.active_flyer_count < MAX_FLYERS_PER_SYNDICATE {
                        syn.active_flyer_count = syn.active_flyer_count.saturating_add(1);
                    }
                    if !syn.flyers.contains(&flyer_id)
                        && syn.flyers.len() < MAX_FLYERS_PER_SYNDICATE as usize
                    {
                        syn.flyers.push(flyer_id.clone());
                    }
                }
            }

            self.escrows
                .insert(escrow_key, current.saturating_add(refund_amount));

            if let Some(syn) = self.syndicates.get_mut(&syndicate_id) {
                syn.total_escrow = syn.total_escrow.saturating_add(refund_amount);
                if syn.status == SyndicateStatus::AbortedRefunded {
                    syn.status = SyndicateStatus::Active;
                }
            }
            return false;
        }
        true
    }

    /// Returns a flyer's current escrow balance in a syndicate.
    pub fn get_escrow(&self, syndicate_id: String, account_id: AccountId) -> NearToken {
        self.escrows
            .get(&(syndicate_id, account_id))
            .copied()
            .unwrap_or_else(|| NearToken::from_yoctonear(0))
    }

    pub fn get_syndicate(&self, syndicate_id: String) -> Option<SyndicateRecord> {
        self.syndicates.get(&syndicate_id).cloned()
    }
}
