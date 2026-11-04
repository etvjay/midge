use near_sdk::store::{IterableMap, LookupMap};
use near_sdk::{env, near, AccountId, Gas, NearToken, PanicOnDefault, Promise};

/// Minimum storage deposit to prevent storage griefing attacks (0.005 NEAR).
pub const MIN_STORAGE_DEPOSIT_YOCTO: u128 = 5_000_000_000_000_000_000_000;

/// Minimum deposit per flyer to prevent dusting attacks (0.01 NEAR).
pub const MIN_DEPOSIT_YOCTO: u128 = 10_000_000_000_000_000_000_000;

/// Maximum number of distinct flyers per syndicate to bound gas consumption.
pub const MAX_FLYERS_PER_SYNDICATE: u32 = 50;

/// Default page limit for paginated queries.
pub const DEFAULT_PAGE_LIMIT: u64 = 10;

/// Maximum page limit to bound view call gas consumption.
pub const MAX_PAGE_LIMIT: u64 = 50;

/// Maximum number of allowed recipients in release policy to bound gas and loop size (API-012, CA-005).
pub const MAX_POLICY_RECIPIENTS: usize = 8;

/// Maximum number of distinct allocations per settlement batch.
pub const MAX_ALLOCATIONS_PER_BATCH: usize = 8;

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Allocation {
    pub recipient: AccountId,
    pub amount: NearToken,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, PartialEq, Debug)]
pub struct ReleasePolicy {
    pub allowed_recipients: Vec<AccountId>, // 1..=MAX_POLICY_RECIPIENTS
    pub max_release_bps_per_epoch: u16,     // 1..=10_000 (basis points, 10000 = 100%)
    pub settle_deadline_block: u64,
}

impl ReleasePolicy {
    pub fn validate(&self, current_block: u64) {
        assert!(
            !self.allowed_recipients.is_empty(),
            "[Policy REJECT] allowed_recipients cannot be empty."
        );
        assert!(
            self.allowed_recipients.len() <= MAX_POLICY_RECIPIENTS,
            "[Policy REJECT] allowed_recipients count cannot exceed {}.",
            MAX_POLICY_RECIPIENTS
        );
        assert!(
            self.max_release_bps_per_epoch >= 1 && self.max_release_bps_per_epoch <= 10_000,
            "[Policy REJECT] max_release_bps_per_epoch must be between 1 and 10000."
        );
        assert!(
            self.settle_deadline_block > current_block,
            "[Policy REJECT] settle_deadline_block must be in the future."
        );
    }

    pub fn is_recipient_allowed(&self, recipient: &AccountId) -> bool {
        self.allowed_recipients.contains(recipient)
    }

    pub fn calculate_max_payout(&self, total_escrow: NearToken) -> NearToken {
        let max_yocto = (total_escrow
            .as_yoctonear()
            .saturating_mul(self.max_release_bps_per_epoch as u128))
            / 10_000;
        NearToken::from_yoctonear(max_yocto)
    }

    pub fn is_deadline_passed(&self, current_block: u64) -> bool {
        current_block > self.settle_deadline_block
    }

    /// Computes canonical SHA-256 hash over sorted allowed_recipients, max_release_bps_per_epoch, and settle_deadline_block.
    pub fn compute_hash(&self) -> String {
        let mut sorted = self.allowed_recipients.clone();
        sorted.sort();
        sorted.dedup();
        let canonical_str = format!(
            "release_policy:v1:{}:{}:{}",
            sorted
                .iter()
                .map(|a| a.as_str())
                .collect::<Vec<_>>()
                .join(","),
            self.max_release_bps_per_epoch,
            self.settle_deadline_block
        );
        hex::encode(env::sha256(canonical_str.as_bytes()))
    }
}

/// Pure domain function calculating pro-rata deductions across flyers with exact remainder dust conservation (OO-008, CA-004).
/// Returns a list of (flyer, deduction_yocto) such that sum(deductions) == total_payout_yocto.
pub fn compute_pro_rata_deductions(
    flyer_balances: &[(AccountId, u128)],
    total_payout_yocto: u128,
    total_escrow_yocto: u128,
) -> Vec<(AccountId, u128)> {
    if total_payout_yocto == 0 || total_escrow_yocto == 0 {
        return flyer_balances.iter().map(|(a, _)| (a.clone(), 0)).collect();
    }
    if total_payout_yocto >= total_escrow_yocto {
        // Full settlement: deduct entire balance from each flyer
        return flyer_balances.to_vec();
    }

    let mut deductions = Vec::with_capacity(flyer_balances.len());
    let mut sum_deducted = 0u128;
    let mut max_balance_idx = 0;
    let mut max_balance = 0u128;

    for (idx, (account, balance)) in flyer_balances.iter().enumerate() {
        if *balance > max_balance {
            max_balance = *balance;
            max_balance_idx = idx;
        }
        let share = (*balance).saturating_mul(total_payout_yocto) / total_escrow_yocto;
        let clamped_share = share.min(*balance);
        sum_deducted = sum_deducted.saturating_add(clamped_share);
        deductions.push((account.clone(), clamped_share));
    }

    // Allocate remainder dust to the flyer with the largest balance (OO-008, CA-004)
    if total_payout_yocto > sum_deducted {
        let dust = total_payout_yocto - sum_deducted;
        let (max_account, current_deduction) = &deductions[max_balance_idx];
        let original_balance = flyer_balances[max_balance_idx].1;
        let new_deduction = (current_deduction + dust).min(original_balance);
        deductions[max_balance_idx] = (max_account.clone(), new_deduction);
    }

    deductions
}

/// Canonical SHA-256 hash of sorted allocations list.
pub fn compute_allocations_hash(allocations: &[Allocation]) -> String {
    let mut sorted = allocations.to_vec();
    sorted.sort_by(|a, b| a.recipient.cmp(&b.recipient));
    let alloc_str = sorted
        .iter()
        .map(|a| format!("{}:{}", a.recipient, a.amount.as_yoctonear()))
        .collect::<Vec<_>>()
        .join(",");
    hex::encode(env::sha256(alloc_str.as_bytes()))
}

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
    pub release_policy: ReleasePolicy,
    pub policy_hash: String,
    pub is_settling: bool,
}

impl SyndicateRecord {
    /// Returns true if the account is either the creator/owner or an active flyer in this syndicate.
    pub fn has_member(&self, account_id: &AccountId) -> bool {
        self.owner == *account_id || self.flyers.contains(account_id)
    }
}

fn sanitize_pagination(
    from_index: Option<u64>,
    limit: Option<u64>,
    total_count: u64,
) -> (usize, usize) {
    let from_idx = from_index.unwrap_or(0);
    if from_idx >= total_count {
        return (total_count as usize, 0);
    }
    let start = match usize::try_from(from_idx) {
        Ok(s) => s,
        Err(_) => return (total_count as usize, 0),
    };
    let page_limit = limit.unwrap_or(DEFAULT_PAGE_LIMIT).min(MAX_PAGE_LIMIT) as usize;
    (start, page_limit)
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct FlyCoordinator {
    pub syndicates: IterableMap<String, SyndicateRecord>,
    // Dedicated LookupMap to prevent unbounded state deserialization in SyndicateRecord
    // Key: (syndicate_id, flyer_account_id) -> NearToken
    pub escrows: LookupMap<(String, AccountId), NearToken>,
    // Secondary index: account_id -> list of syndicate IDs where account is creator or flyer
    pub member_syndicates: LookupMap<AccountId, Vec<String>>,
}

#[near]
#[allow(clippy::too_many_arguments)]
impl FlyCoordinator {
    #[init]
    pub fn new() -> Self {
        Self {
            syndicates: IterableMap::new(b"s"),
            escrows: LookupMap::new(b"e"),
            member_syndicates: LookupMap::new(b"m"),
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
        release_policy: Option<ReleasePolicy>,
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

        // Release policy initialization & validation (Task Y1, API-013, API-014)
        let policy = match release_policy {
            Some(mut p) => {
                p.allowed_recipients.sort();
                p.allowed_recipients.dedup();
                p.validate(created_at_block);
                p
            }
            None => {
                let default_recipient = payout_recipient.clone().unwrap_or_else(|| owner.clone());
                ReleasePolicy {
                    allowed_recipients: vec![default_recipient],
                    max_release_bps_per_epoch: 10_000,
                    settle_deadline_block: created_at_block + timeout * 10,
                }
            }
        };
        let policy_hash = policy.compute_hash();
        let primary_recipient = policy.allowed_recipients[0].clone();

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

        let record = SyndicateRecord {
            id: syndicate_id.clone(),
            owner: owner.clone(),
            syndicate_type: syn_type.clone(),
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
            payout_recipient: primary_recipient,
            release_policy: policy,
            policy_hash: policy_hash.clone(),
            is_settling: false,
        };

        self.syndicates.insert(syndicate_id.clone(), record);

        // Update secondary member index for creator (API-001)
        let mut owner_syns = self
            .member_syndicates
            .get(&owner)
            .cloned()
            .unwrap_or_default();
        if !owner_syns.contains(&syndicate_id) {
            owner_syns.push(syndicate_id.clone());
            self.member_syndicates.insert(owner.clone(), owner_syns);
        }

        // NEP-297 standard event
        env::log_str(&format!(
            "EVENT_JSON:{{\"standard\":\"fly\",\"version\":\"1.0.0\",\"event\":\"syndicate_hatched\",\"data\":[{{\"syndicate_id\":\"{}\",\"owner\":\"{}\",\"syndicate_type\":\"{:?}\",\"quorum_threshold\":{},\"timeout_blocks\":{},\"policy_hash\":\"{}\"}}]}}",
            syndicate_id,
            owner,
            syn_type,
            quorum,
            timeout,
            policy_hash
        ));

        syndicate_id
    }

    /// deposit(): Locks NEAR into the syndicate escrow.
    /// Enforces explicit depositor consent to the syndicate's immutable release policy (Task Y1).
    /// Enforces minimum deposit, cap on total distinct flyers, and OutLayer spend limits.
    #[payable]
    pub fn deposit(&mut self, syndicate_id: String, policy_hash: Option<String>) {
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

        // Explicit depositor consent check (Task Y1)
        assert_eq!(
            policy_hash.as_deref(),
            Some(syn.policy_hash.as_str()),
            "[Deposit REJECT] Policy hash mismatch: depositor did not consent to current release policy."
        );

        assert!(
            !syn.is_settling,
            "[Deposit REJECT] Settlement is currently in flight."
        );

        let escrow_key = (syndicate_id.clone(), caller.clone());
        let current_balance = self
            .escrows
            .get(&escrow_key)
            .copied()
            .unwrap_or_else(|| NearToken::from_yoctonear(0));

        let new_balance = current_balance
            .checked_add(attached)
            .unwrap_or_else(|| env::panic_str("[Deposit REJECT] Escrow balance overflow."));

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

            // Update secondary member index for flyer (API-001)
            let mut caller_syns = self
                .member_syndicates
                .get(&caller)
                .cloned()
                .unwrap_or_default();
            if !caller_syns.contains(&syndicate_id) {
                caller_syns.push(syndicate_id.clone());
                self.member_syndicates.insert(caller.clone(), caller_syns);
            }
        }

        self.escrows.insert(escrow_key, new_balance);
        syn.total_escrow = syn.total_escrow.saturating_add(attached);

        // NEP-297 standard event (API-008: syndicate_deposited)
        env::log_str(&format!(
            "EVENT_JSON:{{\"standard\":\"fly\",\"version\":\"1.0.0\",\"event\":\"syndicate_deposited\",\"data\":[{{\"syndicate_id\":\"{}\",\"flyer\":\"{}\",\"amount\":\"{}\",\"active_flyers\":{},\"policy_hash\":\"{}\"}}]}}",
            syn.id,
            caller,
            attached.as_yoctonear(),
            syn.active_flyer_count,
            syn.policy_hash
        ));
    }

    /// settle_batch(): Verifies HAQ attestation signature and executes bounded settlement payouts (Task Y1).
    /// Enforces domain-separated message signing: (contract_id:syndicate_id:epoch:round_nonce:allocations_hash:order_hash).
    /// Enforces whitelisted recipients, epoch bps release caps, deadline block, and pro-rata deductions.
    pub fn settle_batch(
        &mut self,
        syndicate_id: String,
        attestation_nonce: String,
        aggregate_order_hash: String,
        allocations: Vec<Allocation>,
        enclave_signature: String,
    ) {
        let syn = self
            .syndicates
            .get_mut(&syndicate_id)
            .unwrap_or_else(|| env::panic_str("Syndicate not found"));

        assert_eq!(
            syn.status,
            SyndicateStatus::Active,
            "[HAQ REJECT] Syndicate is not active."
        );

        // In-flight settlement guard (CA-001)
        assert!(
            !syn.is_settling,
            "[Settle REJECT] Settlement is already in flight."
        );

        // 1. Enforce settle deadline
        let current_block = env::block_height();
        assert!(
            !syn.release_policy.is_deadline_passed(current_block),
            "[Settle REJECT] Settle deadline block height exceeded."
        );

        // 2. Validate nonce binding
        assert_eq!(
            syn.round_nonce, attestation_nonce,
            "[HAQ REJECT] Nonce mismatch. Replay attack blocked."
        );

        // 3. Verify Quorum threshold
        assert!(
            syn.active_flyer_count >= syn.quorum_threshold,
            "[QUORUM REJECT] Active flyer count below threshold."
        );

        // 4. Validate allocations (API-011, API-012, CA-005)
        assert!(
            !allocations.is_empty(),
            "[Settle REJECT] Allocations list cannot be empty."
        );
        assert!(
            allocations.len() <= MAX_ALLOCATIONS_PER_BATCH,
            "[Settle REJECT] Allocations count cannot exceed {}.",
            MAX_ALLOCATIONS_PER_BATCH
        );

        let mut seen_recipients = Vec::new();
        let mut total_payout_yocto: u128 = 0;

        for alloc in &allocations {
            assert!(
                !seen_recipients.contains(&alloc.recipient),
                "[Settle REJECT] Duplicate recipient in allocations."
            );
            seen_recipients.push(alloc.recipient.clone());

            assert!(
                syn.release_policy.is_recipient_allowed(&alloc.recipient),
                "[Settle REJECT] Recipient {} is not in allowed_recipients whitelist.",
                alloc.recipient
            );
            assert!(
                alloc.amount.as_yoctonear() > 0,
                "[Settle REJECT] Allocation amount must be positive."
            );
            total_payout_yocto = total_payout_yocto
                .checked_add(alloc.amount.as_yoctonear())
                .unwrap_or_else(|| env::panic_str("[Settle REJECT] Total payout overflow"));
        }

        assert!(
            total_payout_yocto <= syn.total_escrow.as_yoctonear(),
            "[Settle REJECT] Allocation sum exceeds total escrow."
        );

        let max_allowed = syn.release_policy.calculate_max_payout(syn.total_escrow);
        assert!(
            total_payout_yocto <= max_allowed.as_yoctonear(),
            "[Settle REJECT] Allocation sum exceeds max_release_bps_per_epoch cap."
        );

        // 5. Canonical allocations hash
        let allocations_hash = compute_allocations_hash(&allocations);

        // 6. Cryptographic Ed25519 Enclave Signature Verification
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

        let message = format!(
            "{}:{}:{}:{}:{}:{}",
            env::current_account_id(),
            syn.id,
            syn.epoch,
            syn.round_nonce,
            allocations_hash,
            aggregate_order_hash
        );
        assert!(
            env::ed25519_verify(&sig_arr, message.as_bytes(), &pk_arr),
            "[HAQ REJECT] Invalid enclave Ed25519 signature over deliberation batch!"
        );

        syn.settled_batches.push(aggregate_order_hash.clone());
        syn.total_escrow = syn
            .total_escrow
            .saturating_sub(NearToken::from_yoctonear(total_payout_yocto));
        syn.total_settled_payouts = syn
            .total_settled_payouts
            .saturating_add(NearToken::from_yoctonear(total_payout_yocto));
        syn.is_settling = true;

        if syn.total_escrow.as_yoctonear() == 0 {
            syn.status = SyndicateStatus::Settled;
        } else {
            // Escrow remains, so the syndicate stays open for another round. The signature binds the round
            // nonce, so the nonce must change after EVERY settlement that leaves escrow behind, for both
            // types. Rotating it only for DarkVault let anyone replay a partial Flash settlement until the
            // escrow was drained. Only DarkVault starts a new epoch (and restarts the hatch_out timer).
            if syn.syndicate_type == SyndicateType::DarkVault {
                syn.epoch += 1;
                syn.epoch_start_block = env::block_height();
            }
            let next_seed = format!(
                "{}:{}:{}:{}",
                syn.id,
                syn.epoch,
                env::block_height(),
                syn.settled_batches.len()
            );
            syn.round_nonce = hex::encode(env::sha256(next_seed.as_bytes()));
        }

        // 8. Multi-recipient Promise Dispatch (CA-002)
        let mut transfer_promise: Option<Promise> = None;
        for alloc in &allocations {
            let p = Promise::new(alloc.recipient.clone()).transfer(alloc.amount);
            transfer_promise = match transfer_promise {
                Some(prev) => Some(prev.and(p)),
                None => Some(p),
            };
        }

        if let Some(promise) = transfer_promise {
            let _ = promise.then(
                Self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(25))
                    .on_settlement_payout(
                        syn.id.clone(),
                        allocations,
                        NearToken::from_yoctonear(total_payout_yocto),
                        allocations_hash,
                        aggregate_order_hash,
                    ),
            );
        }
    }

    /// hatch_out(): Automated non-custodial escape hatch.
    /// Unlocks 100% refund of caller's remaining escrow if timeout or deadline expired.
    /// Blocked while settlement is in flight or if syndicate is fully settled.
    pub fn hatch_out(&mut self, syndicate_id: String) -> Promise {
        let caller = env::predecessor_account_id();
        let current_block = env::block_height();

        let syn = self
            .syndicates
            .get_mut(&syndicate_id)
            .unwrap_or_else(|| env::panic_str("Syndicate not found"));

        assert_ne!(
            syn.status,
            SyndicateStatus::Settled,
            "[Hatch-Out REJECT] Cannot refund already settled syndicate."
        );

        // In-flight settlement guard (CA-001)
        assert!(
            !syn.is_settling,
            "[Hatch-Out REJECT] Settlement is currently in flight. Try again after resolution."
        );

        assert!(
            syn.total_escrow.as_yoctonear() > 0,
            "[Hatch-Out REJECT] No escrow balance to refund."
        );

        let blocks_passed = current_block.saturating_sub(syn.epoch_start_block);
        let timeout_expired = blocks_passed >= syn.timeout_blocks;
        let deadline_passed = syn.release_policy.is_deadline_passed(current_block);

        if !timeout_expired && !deadline_passed && syn.status == SyndicateStatus::Active {
            env::panic_str("[Hatch-Out LOCKED] Deliberation window still active.");
        }

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

        self.escrows.remove(&escrow_key);
        syn.total_escrow = syn.total_escrow.saturating_sub(flyer_balance);
        syn.active_flyer_count = syn.active_flyer_count.saturating_sub(1);
        syn.flyers.retain(|f| f != &caller);

        if syn.total_escrow.as_yoctonear() == 0 {
            syn.status = SyndicateStatus::AbortedRefunded;
        }

        env::log_str(&format!(
            "EVENT_JSON:{{\"standard\":\"fly\",\"version\":\"1.0.0\",\"event\":\"syndicate_hatched_out\",\"data\":[{{\"syndicate_id\":\"{}\",\"flyer\":\"{}\",\"refund_amount\":\"{}\",\"policy_hash\":\"{}\"}}]}}",
            syn.id,
            caller,
            flyer_balance.as_yoctonear(),
            syn.policy_hash
        ));

        Promise::new(caller.clone()).transfer(flyer_balance).then(
            Self::ext(env::current_account_id())
                .with_static_gas(Gas::from_tgas(15))
                .on_hatch_out_payout(syndicate_id, caller, flyer_balance),
        )
    }

    /// Callback for settlement payout transfer handling with partial rollback (CA-002, CA-003).
    #[private]
    pub fn on_settlement_payout(
        &mut self,
        syndicate_id: String,
        allocations: Vec<Allocation>,
        total_payout: NearToken,
        allocations_hash: String,
        order_hash: String,
    ) -> bool {
        assert_eq!(
            env::current_account_id(),
            env::predecessor_account_id(),
            "Method is private"
        );

        let results_count = env::promise_results_count();
        let mut failed_yocto: u128 = 0;

        for i in 0..results_count {
            #[allow(deprecated)]
            match env::promise_result(i) {
                near_sdk::PromiseResult::Successful(_) => {}
                near_sdk::PromiseResult::Failed => {
                    if let Some(alloc) = allocations.get(i as usize) {
                        failed_yocto = failed_yocto.saturating_add(alloc.amount.as_yoctonear());
                    }
                }
            }
        }

        let total_payout_yocto = total_payout.as_yoctonear();
        let succeeded_yocto = total_payout_yocto.saturating_sub(failed_yocto);

        if let Some(syn) = self.syndicates.get_mut(&syndicate_id) {
            syn.is_settling = false;

            if succeeded_yocto > 0 {
                // Deduct flyer balances pro-rata for the succeeded payout portion (OO-008, CA-004)
                let flyer_balances: Vec<(AccountId, u128)> = syn
                    .flyers
                    .iter()
                    .map(|f| {
                        let key = (syn.id.clone(), f.clone());
                        let b = self
                            .escrows
                            .get(&key)
                            .copied()
                            .unwrap_or_else(|| NearToken::from_yoctonear(0))
                            .as_yoctonear();
                        (f.clone(), b)
                    })
                    .collect();

                let deductions_base = syn
                    .total_escrow
                    .as_yoctonear()
                    .saturating_add(total_payout_yocto);
                let deductions = compute_pro_rata_deductions(
                    &flyer_balances,
                    succeeded_yocto,
                    if deductions_base > 0 {
                        deductions_base
                    } else {
                        1
                    },
                );

                for (flyer, deduction) in deductions {
                    let key = (syn.id.clone(), flyer.clone());
                    let current = self
                        .escrows
                        .get(&key)
                        .copied()
                        .unwrap_or_else(|| NearToken::from_yoctonear(0))
                        .as_yoctonear();
                    let new_bal = current.saturating_sub(deduction);
                    if new_bal == 0 && syn.status == SyndicateStatus::Settled {
                        self.escrows.remove(&key);
                    } else {
                        self.escrows.insert(key, NearToken::from_yoctonear(new_bal));
                    }
                }
            }

            if failed_yocto > 0 {
                // Restore failed payout portion to syndicate total_escrow and revert Settled status
                syn.total_escrow = syn
                    .total_escrow
                    .saturating_add(NearToken::from_yoctonear(failed_yocto));
                syn.total_settled_payouts = syn
                    .total_settled_payouts
                    .saturating_sub(NearToken::from_yoctonear(failed_yocto));
                syn.status = SyndicateStatus::Active;

                env::log_str(&format!(
                    "EVENT_JSON:{{\"standard\":\"fly\",\"version\":\"1.0.0\",\"event\":\"syndicate_settlement_failed\",\"data\":[{{\"syndicate_id\":\"{}\",\"reverted_amount\":\"{}\"}}]}}",
                    syndicate_id,
                    failed_yocto
                ));
                return false;
            } else {
                // 100% Succeeded
                if syn.status == SyndicateStatus::Settled {
                    syn.flyers.clear();
                    syn.active_flyer_count = 0;
                }

                // Authoritative event emission upon asynchronous success (CA-003)
                env::log_str(&format!(
                    "EVENT_JSON:{{\"standard\":\"fly\",\"version\":\"1.0.0\",\"event\":\"syndicate_settled\",\"data\":[{{\"syndicate_id\":\"{}\",\"epoch\":{},\"allocations_hash\":\"{}\",\"total_payout\":\"{}\",\"order_hash\":\"{}\",\"policy_hash\":\"{}\"}}]}}",
                    syn.id,
                    syn.epoch,
                    allocations_hash,
                    total_payout.as_yoctonear(),
                    order_hash,
                    syn.policy_hash
                ));
            }
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
            // Compensating NEP-297 event on escape hatch rollback (CA-001)
            env::log_str(&format!(
                "EVENT_JSON:{{\"standard\":\"fly\",\"version\":\"1.0.0\",\"event\":\"syndicate_hatch_out_failed\",\"data\":[{{\"syndicate_id\":\"{}\",\"flyer\":\"{}\",\"reverted_amount\":\"{}\"}}]}}",
                syndicate_id,
                flyer_id,
                refund_amount.as_yoctonear()
            ));
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

    /// Returns the total count of hatched syndicates.
    pub fn get_syndicate_count(&self) -> u64 {
        self.syndicates.len() as u64
    }

    /// Returns a paginated list of syndicates.
    /// Default limit: 10, Maximum limit: 50.
    pub fn list_syndicates(
        &self,
        from_index: Option<u64>,
        limit: Option<u64>,
    ) -> Vec<SyndicateRecord> {
        let total = self.syndicates.len() as u64;
        let (start, page_limit) = sanitize_pagination(from_index, limit, total);
        if page_limit == 0 {
            return Vec::new();
        }
        self.syndicates
            .values()
            .skip(start)
            .take(page_limit)
            .cloned()
            .collect()
    }

    /// Returns a paginated list of syndicates where the account is creator or flyer.
    /// Uses dedicated secondary index to guarantee bounded storage reads (API-001).
    pub fn list_syndicates_by_member(
        &self,
        account_id: AccountId,
        from_index: Option<u64>,
        limit: Option<u64>,
    ) -> Vec<SyndicateRecord> {
        let member_syn_ids = self
            .member_syndicates
            .get(&account_id)
            .cloned()
            .unwrap_or_default();
        let total = member_syn_ids.len() as u64;
        let (start, page_limit) = sanitize_pagination(from_index, limit, total);
        if page_limit == 0 {
            return Vec::new();
        }
        member_syn_ids
            .iter()
            .skip(start)
            .take(page_limit)
            .filter_map(|id| self.syndicates.get(id).cloned())
            .collect()
    }

    /// Alias for list_syndicates_by_member (API-007).
    pub fn get_syndicates_by_member(
        &self,
        account_id: AccountId,
        from_index: Option<u64>,
        limit: Option<u64>,
    ) -> Vec<SyndicateRecord> {
        self.list_syndicates_by_member(account_id, from_index, limit)
    }

    /// Returns the release policy of a syndicate (API-015).
    pub fn get_release_policy(&self, syndicate_id: String) -> Option<ReleasePolicy> {
        self.syndicates
            .get(&syndicate_id)
            .map(|s| s.release_policy.clone())
    }

    /// Returns the policy hash of a syndicate (API-015).
    pub fn get_policy_hash(&self, syndicate_id: String) -> Option<String> {
        self.syndicates
            .get(&syndicate_id)
            .map(|s| s.policy_hash.clone())
    }
}
