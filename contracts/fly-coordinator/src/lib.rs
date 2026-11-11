pub mod foreign;
pub use foreign::{ForeignObligation, ForeignPayee, ForeignPaymentRequest, ForeignPolicy};
use near_sdk::json_types::U128;

use near_sdk::store::{IterableMap, LookupMap};
use near_sdk::{env, near, AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseResult};

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

/// How much of a settlement one member funds. Used by `settle_batch_charged`, where the room names who pays what
/// (an auction winner pays price x quantity; a loser pays nothing), instead of the equal-by-deposit split.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Charge {
    pub member: AccountId,
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

    /// The hash new groups are opened with and depositors consent to (version 2): the same fields as `compute_hash` plus the exit
    /// timer, because the release pacing and the wait to exit both depend on it (GAP-025).
    pub fn compute_hash_with_timeout(&self, timeout_blocks: u64) -> String {
        let mut sorted = self.allowed_recipients.clone();
        sorted.sort();
        sorted.dedup();
        let canonical_str = format!(
            "release_policy:v2:{}:{}:{}:{}",
            sorted
                .iter()
                .map(|a| a.as_str())
                .collect::<Vec<_>>()
                .join(","),
            self.max_release_bps_per_epoch,
            self.settle_deadline_block,
            timeout_blocks
        );
        hex::encode(env::sha256(canonical_str.as_bytes()))
    }

    /// Version 1 hash (recipients, cap, deadline). Groups opened before GAP-025 keep this hash; it does not cover the timer.
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

/// floor(a * b / c) computed exactly through a 256-bit intermediate, so that it cannot overflow or clamp.
/// A balance of 0.05 NEAR times a payout of 0.10 NEAR is 5e45 yocto-squared, far above u128::MAX (3.4e38); the previous
/// `saturating_mul` clamped it, which made every member's share ~1.7e15 yocto and charged the whole payout to one member.
/// Returns u128::MAX if the true result does not fit (it cannot when a <= c, which is how it is used).
pub fn mul_div_floor(a: u128, b: u128, c: u128) -> u128 {
    assert!(c != 0, "division by zero");
    const M: u128 = (1u128 << 64) - 1;
    let (a0, a1, b0, b1) = (a & M, a >> 64, b & M, b >> 64);
    let (p00, p01, p10, p11) = (a0 * b0, a0 * b1, a1 * b0, a1 * b1);
    let mid = (p00 >> 64) + (p01 & M) + (p10 & M);
    let lo = (p00 & M) | (mid << 64);
    let hi = p11 + (p01 >> 64) + (p10 >> 64) + (mid >> 64);
    if hi >= c {
        return u128::MAX;
    }
    // restoring long division of the 256-bit value (hi, lo) by c; hi < c keeps the remainder below c throughout
    let (mut rem, mut q) = (hi, 0u128);
    for i in (0..128).rev() {
        let carry = rem >> 127;
        rem = (rem << 1) | ((lo >> i) & 1);
        if carry == 1 || rem >= c {
            rem = rem.wrapping_sub(c);
            q |= 1u128 << i;
        }
    }
    q
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
        let share = mul_div_floor(*balance, total_payout_yocto, total_escrow_yocto);
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

/// Canonical SHA-256 hash of the charges, sorted by member: "member:amount" joined by ",".
pub fn compute_charges_hash(charges: &[Charge]) -> String {
    let mut sorted = charges.to_vec();
    sorted.sort_by(|a, b| a.member.cmp(&b.member));
    let s = sorted
        .iter()
        .map(|c| format!("{}:{}", c.member, c.amount.as_yoctonear()))
        .collect::<Vec<_>>()
        .join(",");
    hex::encode(env::sha256(s.as_bytes()))
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

/// Where a group is in its life, in the words of docs/STATE_MACHINE.md. A view only; nothing is stored.
#[near(serializers = [json])]
#[derive(Clone, PartialEq, Debug)]
pub enum GroupPhase {
    /// Active, funded, nothing in flight: deposits, settlements and exits are possible.
    Open,
    /// A payout has been sent and its follow-up step has not run: settlements and exits wait. This includes a final payout
    /// that will leave the group Settled, because a failed transfer would put it back to Active.
    PayoutInFlight,
    /// A settlement used the whole group.
    Settled,
    /// The last member left.
    Refunded,
    /// Active with no member and no escrow: hatched and never funded. Its creator can remove it at once with
    /// `prune_syndicate`, and anyone can after `UNFUNDED_PRUNE_BLOCKS` (GAP-030).
    Unfunded,
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

/// A payout whose follow-up step has not run for this many blocks may be settled by anyone (GAP-008).
pub const STUCK_SETTLEMENT_BLOCKS: u64 = 100;
/// A sanity floor for a group's exit timer, in blocks (about 6 seconds on testnet). It stops absurd values such as 1 block, which
/// would make the release window (twice the timer) meaningless. It is NOT a recommendation: a real group must choose its timer on
/// purpose, and depositors consent to the chosen value through the policy hash (GAP-025).
pub const MIN_TIMEOUT_BLOCKS: u64 = 10;
/// How long a group that was hatched and never funded must wait before anyone (not only its creator) may remove it:
/// about seven days at one block a second. It frees storage and an id that someone is squatting on (GAP-030).
pub const UNFUNDED_PRUNE_BLOCKS: u64 = 604_800;
/// Gas given to the follow-up step: a base plus a little per member, so a 50-member settlement cannot starve it.
const CALLBACK_BASE_TGAS: u64 = 25;
const CALLBACK_PER_MEMBER_TGAS: u64 = 1;
const CALLBACK_MAX_TGAS: u64 = 100;

/// The terms a depositor consents to, as the contract holds them (GAP-025).
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct PolicyTerms {
    pub allowed_recipients: Vec<AccountId>,
    pub max_release_bps_per_epoch: u16,
    pub settle_deadline_block: u64,
    pub timeout_blocks: u64,
    pub release_window_blocks: u64,
    pub policy_hash: String,
    pub timer_in_consent_hash: bool,
}

/// How much has been released since a time window opened (GAP-024). A window lasts twice the exit timer. Within it the release
/// cap is cumulative: everything released must stay within cap x (escrow at the window's start + deposits since).
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct ReleaseWindow {
    pub start_block: u64,
    pub start_escrow: NearToken,
    pub released: NearToken,
    pub ends_at_block: u64,
}

fn window_slot(syndicate_id: &str) -> Vec<u8> {
    let mut k = b"w:".to_vec();
    k.extend_from_slice(syndicate_id.as_bytes());
    k
}

fn read_window(syndicate_id: &str) -> Option<ReleaseWindow> {
    env::storage_read(&window_slot(syndicate_id))
        .and_then(|raw| near_sdk::borsh::from_slice(&raw).ok())
}

fn write_window(syndicate_id: &str, w: &ReleaseWindow) {
    env::storage_write(
        &window_slot(syndicate_id),
        &near_sdk::borsh::to_vec(w).unwrap_or_else(|_| {
            env::panic_str("[Settle REJECT] Could not record the release window")
        }),
    );
}

fn foreign_policy_slot(id: &str) -> Vec<u8> {
    let mut k = b"f:".to_vec();
    k.extend_from_slice(id.as_bytes());
    k
}

fn foreign_obligation_slot(id: &str, obligation: &str) -> Vec<u8> {
    format!("fo:{}:{}:{}", id.len(), id, obligation).into_bytes()
}

fn foreign_spent_slot(id: &str, chain: &str, payee: &str) -> Vec<u8> {
    format!("fs:{}:{}:{}:{}", id.len(), id, chain, payee).into_bytes()
}

/// Ethereum addresses compare without case; Solana addresses are exact.
fn normalize_foreign(chain: &str, address: &str) -> String {
    if chain.starts_with("ethereum") {
        address
            .trim_start_matches("0x")
            .trim_start_matches("0X")
            .to_lowercase()
    } else {
        address.to_string()
    }
}

fn read_foreign_spent(id: &str, chain: &str, payee_norm: &str) -> u128 {
    env::storage_read(&foreign_spent_slot(id, chain, payee_norm))
        .and_then(|raw| near_sdk::borsh::from_slice(&raw).ok())
        .unwrap_or(0)
}

fn write_foreign_spent(id: &str, chain: &str, payee_norm: &str, v: u128) {
    env::storage_write(
        &foreign_spent_slot(id, chain, payee_norm),
        &near_sdk::borsh::to_vec(&v).unwrap(),
    );
}

/// What a settlement in flight still has to do, kept until its follow-up step finishes or someone recovers it.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct PendingSettlement {
    pub since_block: u64,
    pub allocations: Vec<Allocation>,
    pub charges: Vec<Charge>,
    pub total_payout: NearToken,
    pub allocations_hash: String,
    pub order_hash: String,
}

fn pending_slot(syndicate_id: &str) -> Vec<u8> {
    let mut k = b"p:".to_vec();
    k.extend_from_slice(syndicate_id.as_bytes());
    k
}

/// The round nonce the settlement in flight was signed for. The follow-up step names the nonce it belongs to and is
/// ignored unless it matches, so a late follow-up from an earlier settlement with a byte-identical payload cannot finish a
/// newer one (GAP-028). Kept in its own slot so the pending record's layout does not change.
fn nonce_slot(syndicate_id: &str) -> Vec<u8> {
    let mut k = b"n:".to_vec();
    k.extend_from_slice(syndicate_id.as_bytes());
    k
}

/// Raw storage key for a two-room syndicate's second room key.
fn second_key_slot(syndicate_id: &str) -> Vec<u8> {
    let mut k = b"k2:".to_vec();
    k.extend_from_slice(syndicate_id.as_bytes());
    k
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
        self.hatch_inner(
            syndicate_id,
            syndicate_type,
            quorum_threshold,
            max_spend_near,
            enclave_public_key,
            None,
            expected_code_hash,
            timeout_blocks,
            payout_recipient,
            release_policy,
        )
    }

    /// hatch_two_room(): like hatch, but the syndicate registers TWO room keys (two independent Roosts running the same
    /// program). Its settlements must then carry both signatures over the same message (settle_batch_two_room /
    /// settle_batch_charged_two_room); a single-signature settlement is refused. If the rooms disagree they sign
    /// different messages, no valid pair exists, nothing is paid, and members use the exit.
    #[payable]
    #[allow(clippy::too_many_arguments)]
    pub fn hatch_two_room(
        &mut self,
        syndicate_id: String,
        syndicate_type: Option<String>,
        quorum_threshold: Option<u32>,
        max_spend_near: Option<u128>,
        enclave_public_key: String,
        second_enclave_public_key: String,
        expected_code_hash: String,
        timeout_blocks: Option<u64>,
        payout_recipient: Option<AccountId>,
        release_policy: Option<ReleasePolicy>,
    ) -> String {
        let second = hex::decode(&second_enclave_public_key).unwrap_or_else(|_| {
            env::panic_str("[Hatch REJECT] Invalid hex second room public key")
        });
        assert_eq!(
            second.len(),
            32,
            "[Hatch REJECT] The second room public key must be exactly 32 bytes (64 hex characters)."
        );
        assert!(
            enclave_public_key.to_lowercase() != second_enclave_public_key.to_lowercase(),
            "[Hatch REJECT] The two room keys must be different."
        );
        self.hatch_inner(
            syndicate_id,
            syndicate_type,
            quorum_threshold,
            max_spend_near,
            enclave_public_key,
            Some(second_enclave_public_key.to_lowercase()),
            expected_code_hash,
            timeout_blocks,
            payout_recipient,
            release_policy,
        )
    }

    #[allow(clippy::too_many_arguments)]
    fn hatch_inner(
        &mut self,
        syndicate_id: String,
        syndicate_type: Option<String>,
        quorum_threshold: Option<u32>,
        max_spend_near: Option<u128>,
        enclave_public_key: String,
        second_enclave_public_key: Option<String>,
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

        // The flat storage deposit pays for a small record. Bound the one caller-sized string so it stays that way.
        assert!(
            expected_code_hash.len() <= 128,
            "[Hatch REJECT] expected_code_hash is too long (128 bytes at most)."
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
        assert!(
            timeout >= MIN_TIMEOUT_BLOCKS,
            "[Hatch REJECT] timeout_blocks must be at least 10 (a sanity floor, not a recommendation: choose the timer on purpose)."
        );

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
        let policy_hash = policy.compute_hash_with_timeout(timeout);
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
        // The second room key lives under its own storage key, so existing records and contract state are untouched.
        match &second_enclave_public_key {
            Some(k) => {
                env::storage_write(&second_key_slot(&syndicate_id), k.as_bytes());
            }
            None => {
                env::storage_remove(&second_key_slot(&syndicate_id));
            }
        }

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
        // A member drained to zero by a charged settlement stays listed, so a later deposit must not list them again.
        if current_balance.as_yoctonear() == 0 && !syn.flyers.contains(&caller) {
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
        if let Some(mut w) = read_window(&syndicate_id) {
            w.start_escrow = w.start_escrow.saturating_add(attached);
            write_window(&syndicate_id, &w);
        }

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
        self.settle_inner(
            syndicate_id,
            attestation_nonce,
            aggregate_order_hash,
            allocations,
            Vec::new(),
            enclave_signature,
            None,
        );
    }

    /// settle_batch_two_room(): settle_batch for a two-room syndicate. Both rooms sign the same message.
    pub fn settle_batch_two_room(
        &mut self,
        syndicate_id: String,
        attestation_nonce: String,
        aggregate_order_hash: String,
        allocations: Vec<Allocation>,
        enclave_signature: String,
        second_enclave_signature: String,
    ) {
        self.settle_inner(
            syndicate_id,
            attestation_nonce,
            aggregate_order_hash,
            allocations,
            Vec::new(),
            enclave_signature,
            Some(second_enclave_signature),
        );
    }

    /// settle_batch_charged_two_room(): settle_batch_charged for a two-room syndicate. Both rooms sign the same message,
    /// charges included, so two rooms that disagree on who pays cannot settle.
    #[allow(clippy::too_many_arguments)]
    pub fn settle_batch_charged_two_room(
        &mut self,
        syndicate_id: String,
        attestation_nonce: String,
        aggregate_order_hash: String,
        allocations: Vec<Allocation>,
        charges: Vec<Charge>,
        enclave_signature: String,
        second_enclave_signature: String,
    ) {
        assert!(
            !charges.is_empty(),
            "[Settle REJECT] Charges list cannot be empty."
        );
        self.settle_inner(
            syndicate_id,
            attestation_nonce,
            aggregate_order_hash,
            allocations,
            charges,
            enclave_signature,
            Some(second_enclave_signature),
        );
    }

    /// settle_batch_charged(): like settle_batch, but the room also names how much EACH MEMBER pays toward the payout,
    /// signed together with the allocations. The contract requires: every charged member is a depositor with at least
    /// that much escrow, no member twice, every amount positive, and the charges sum to exactly the payout. A member can
    /// therefore never be charged more than they deposited, and the signature covers who pays what.
    /// The signed message has one more field than settle_batch's (the charges hash), so a signature for one entry point
    /// cannot be replayed on the other.
    pub fn settle_batch_charged(
        &mut self,
        syndicate_id: String,
        attestation_nonce: String,
        aggregate_order_hash: String,
        allocations: Vec<Allocation>,
        charges: Vec<Charge>,
        enclave_signature: String,
    ) {
        assert!(
            !charges.is_empty(),
            "[Settle REJECT] Charges list cannot be empty."
        );
        self.settle_inner(
            syndicate_id,
            attestation_nonce,
            aggregate_order_hash,
            allocations,
            charges,
            enclave_signature,
            None,
        );
    }

    #[allow(clippy::too_many_arguments)]
    fn settle_inner(
        &mut self,
        syndicate_id: String,
        attestation_nonce: String,
        aggregate_order_hash: String,
        allocations: Vec<Allocation>,
        charges: Vec<Charge>,
        enclave_signature: String,
        second_enclave_signature: Option<String>,
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

        // The signed message joins its fields with ':'. An order hash holding one could make a charged signature
        // verify as an uncharged settlement, so the separator is not allowed inside it.
        assert!(
            !aggregate_order_hash.contains(':') && aggregate_order_hash.len() <= 256,
            "[Settle REJECT] Invalid order hash"
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

        // GAP-024: the cap bounds the pace of release, not just each settlement. A window opens at the first settlement and lasts
        // twice the exit timer; within it the total released may not exceed cap x (escrow at the start + deposits since).
        let now = env::block_height();
        let (mut window, opens_new_window) = match read_window(&syndicate_id) {
            Some(w) if now < w.ends_at_block => (w, false),
            _ => (
                ReleaseWindow {
                    start_block: now,
                    start_escrow: syn.total_escrow,
                    released: NearToken::from_yoctonear(0),
                    ends_at_block: now.saturating_add(syn.timeout_blocks.saturating_mul(2)),
                },
                true,
            ),
        };
        let allowance = syn.release_policy.calculate_max_payout(window.start_escrow);
        assert!(
            window
                .released
                .as_yoctonear()
                .saturating_add(total_payout_yocto)
                <= allowance.as_yoctonear(),
            "[Settle REJECT] Allocation sum exceeds max_release_bps_per_epoch cap. (cumulative release in this window would exceed it)"
        );

        // 4b. Validate charges (only for settle_batch_charged)
        if !charges.is_empty() {
            assert!(
                charges.len() <= MAX_FLYERS_PER_SYNDICATE as usize,
                "[Settle REJECT] Too many charges."
            );
            let mut seen_members: Vec<AccountId> = Vec::new();
            let mut charged_total: u128 = 0;
            for c in &charges {
                assert!(
                    !seen_members.contains(&c.member),
                    "[Settle REJECT] Duplicate member in charges."
                );
                seen_members.push(c.member.clone());
                assert!(
                    c.amount.as_yoctonear() > 0,
                    "[Settle REJECT] Charge amount must be positive."
                );
                let held = self
                    .escrows
                    .get(&(syn.id.clone(), c.member.clone()))
                    .copied()
                    .unwrap_or_else(|| NearToken::from_yoctonear(0));
                assert!(
                    c.amount.as_yoctonear() <= held.as_yoctonear(),
                    "[Settle REJECT] Charge for {} exceeds that member's escrow.",
                    c.member
                );
                charged_total = charged_total
                    .checked_add(c.amount.as_yoctonear())
                    .unwrap_or_else(|| env::panic_str("[Settle REJECT] Charges overflow"));
            }
            assert_eq!(
                charged_total, total_payout_yocto,
                "[Settle REJECT] Charges must sum to exactly the payout."
            );
        }

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

        let message = if charges.is_empty() {
            format!(
                "{}:{}:{}:{}:{}:{}",
                env::current_account_id(),
                syn.id,
                syn.epoch,
                syn.round_nonce,
                allocations_hash,
                aggregate_order_hash
            )
        } else {
            format!(
                "{}:{}:{}:{}:{}:{}:{}",
                env::current_account_id(),
                syn.id,
                syn.epoch,
                syn.round_nonce,
                allocations_hash,
                compute_charges_hash(&charges),
                aggregate_order_hash
            )
        };
        match (
            env::storage_read(&second_key_slot(&syndicate_id)),
            second_enclave_signature,
        ) {
            (None, None) => {
                assert!(
                    env::ed25519_verify(&sig_arr, message.as_bytes(), &pk_arr),
                    "[HAQ REJECT] Invalid enclave Ed25519 signature over deliberation batch!"
                );
            }
            (Some(_), None) => env::panic_str(
                "[HAQ REJECT] This is a two-room syndicate: settle with settle_batch_two_room or settle_batch_charged_two_room, carrying both room signatures.",
            ),
            (None, Some(_)) => env::panic_str(
                "[HAQ REJECT] This is not a two-room syndicate: use settle_batch or settle_batch_charged.",
            ),
            (Some(second_key), Some(second_sig)) => {
                assert!(
                    env::ed25519_verify(&sig_arr, message.as_bytes(), &pk_arr),
                    "[HAQ REJECT] Invalid signature from the first room over the deliberation batch!"
                );
                let second_pk_bytes = hex::decode(&second_key).unwrap_or_else(|_| {
                    env::panic_str("[HAQ REJECT] Stored second room key is not valid hex")
                });
                let second_sig_bytes = hex::decode(&second_sig).unwrap_or_else(|_| {
                    env::panic_str("[HAQ REJECT] Invalid hex signature from the second room")
                });
                assert!(
                    second_pk_bytes.len() == 32 && second_sig_bytes.len() == 64,
                    "[HAQ REJECT] The second room key must be 32 bytes and its signature 64 bytes."
                );
                let mut second_pk = [0u8; 32];
                second_pk.copy_from_slice(&second_pk_bytes);
                let mut second_sig_arr = [0u8; 64];
                second_sig_arr.copy_from_slice(&second_sig_bytes);
                assert!(
                    env::ed25519_verify(&second_sig_arr, message.as_bytes(), &second_pk),
                    "[HAQ REJECT] Invalid signature from the second room over the deliberation batch!"
                );
            }
        }

        syn.settled_batches.push(aggregate_order_hash.clone());
        syn.total_escrow = syn
            .total_escrow
            .saturating_sub(NearToken::from_yoctonear(total_payout_yocto));
        syn.total_settled_payouts = syn
            .total_settled_payouts
            .saturating_add(NearToken::from_yoctonear(total_payout_yocto));
        syn.is_settling = true;
        let signed_nonce = syn.round_nonce.clone(); // the nonce this settlement was signed for, before it rotates below
        window.released = window
            .released
            .saturating_add(NearToken::from_yoctonear(total_payout_yocto));
        write_window(&syndicate_id, &window);

        if syn.total_escrow.as_yoctonear() == 0 {
            syn.status = SyndicateStatus::Settled;
        } else {
            // Escrow remains, so the syndicate stays open for another round. The signature binds the round
            // nonce, so the nonce must change after EVERY settlement that leaves escrow behind, for both
            // types. Rotating it only for DarkVault let anyone replay a partial Flash settlement until the
            // escrow was drained. Only DarkVault starts a new epoch (and restarts the hatch_out timer).
            // The epoch and the exit timer advance with a new TIME WINDOW, not with every settlement: a host that settles often
            // must not be able to keep members out (GAP-024).
            if syn.syndicate_type == SyndicateType::DarkVault && opens_new_window {
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

        // Remember what the follow-up step must do, so a payout whose follow-up never runs can be finished by anyone
        // after STUCK_SETTLEMENT_BLOCKS instead of blocking exits and settlements for ever (GAP-008).
        let pending = PendingSettlement {
            since_block: env::block_height(),
            allocations: allocations.clone(),
            charges: charges.clone(),
            total_payout: NearToken::from_yoctonear(total_payout_yocto),
            allocations_hash: allocations_hash.clone(),
            order_hash: aggregate_order_hash.clone(),
        };
        env::storage_write(
            &pending_slot(&syn.id),
            &near_sdk::borsh::to_vec(&pending).unwrap_or_else(|_| {
                env::panic_str("[Settle REJECT] Could not record the settlement")
            }),
        );
        env::storage_write(&nonce_slot(&syn.id), signed_nonce.as_bytes());
        let members = (syn.flyers.len().max(charges.len())) as u64;
        let callback_tgas =
            (CALLBACK_BASE_TGAS + CALLBACK_PER_MEMBER_TGAS * members).min(CALLBACK_MAX_TGAS);

        if let Some(promise) = transfer_promise {
            let _ = promise.then(
                Self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(callback_tgas))
                    .on_settlement_payout_for_round(
                        syn.id.clone(),
                        allocations,
                        charges,
                        NearToken::from_yoctonear(total_payout_yocto),
                        allocations_hash,
                        aggregate_order_hash,
                        signed_nonce,
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
        // What leaves no longer backs the release cap, or a deposit that comes straight back out would inflate it.
        if let Some(mut w) = read_window(&syndicate_id) {
            w.start_escrow = w.start_escrow.saturating_sub(flyer_balance);
            write_window(&syndicate_id, &w);
        }

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

    /// Follow-up step of a settlement, for payouts scheduled by code that did not yet name the round. It is kept only so
    /// a settlement that was in flight when the contract was upgraded can still be finished; new settlements schedule
    /// `on_settlement_payout_for_round`, which cannot be confused with another settlement of the same payload (GAP-028).
    #[private]
    pub fn on_settlement_payout(
        &mut self,
        syndicate_id: String,
        allocations: Vec<Allocation>,
        charges: Vec<Charge>,
        total_payout: NearToken,
        allocations_hash: String,
        order_hash: String,
    ) -> bool {
        self.settlement_follow_up(
            syndicate_id,
            allocations,
            charges,
            total_payout,
            allocations_hash,
            order_hash,
        )
    }

    /// Follow-up step of a settlement (CA-002, CA-003), naming the round nonce the settlement was signed for. It acts only
    /// if that nonce is the one recorded for the settlement in flight; otherwise it is a late follow-up of an earlier
    /// settlement and changes nothing.
    #[private]
    #[allow(clippy::too_many_arguments)]
    pub fn on_settlement_payout_for_round(
        &mut self,
        syndicate_id: String,
        allocations: Vec<Allocation>,
        charges: Vec<Charge>,
        total_payout: NearToken,
        allocations_hash: String,
        order_hash: String,
        round_nonce: String,
    ) -> bool {
        let in_flight = env::storage_read(&nonce_slot(&syndicate_id));
        if in_flight.as_deref() != Some(round_nonce.as_bytes()) {
            return true;
        }
        self.settlement_follow_up(
            syndicate_id,
            allocations,
            charges,
            total_payout,
            allocations_hash,
            order_hash,
        )
    }

    fn settlement_follow_up(
        &mut self,
        syndicate_id: String,
        allocations: Vec<Allocation>,
        charges: Vec<Charge>,
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

        // If someone already finished this settlement (recover_stuck_settlement), the late follow-up must change nothing.
        let in_flight = self
            .syndicates
            .get(&syndicate_id)
            .map(|syn| syn.is_settling)
            .unwrap_or(false);
        let has_pending = env::storage_read(&pending_slot(&syndicate_id)).is_some();
        if !in_flight && !has_pending {
            return true;
        }
        // A follow-up may only finish the settlement that scheduled it. If that one was already finished by
        // recover_stuck_settlement and a newer one is in flight, this callback is stale and must change nothing.
        let matches_pending = env::storage_read(&pending_slot(&syndicate_id))
            .and_then(|raw| near_sdk::borsh::from_slice::<PendingSettlement>(&raw).ok())
            .map(|p| {
                p.allocations == allocations
                    && p.charges == charges
                    && p.total_payout == total_payout
                    && p.allocations_hash == allocations_hash
                    && p.order_hash == order_hash
            })
            .unwrap_or(false);
        if !matches_pending {
            return true;
        }
        env::storage_remove(&pending_slot(&syndicate_id));
        env::storage_remove(&nonce_slot(&syndicate_id));
        self.finish_settlement(
            syndicate_id,
            charges,
            total_payout,
            failed_yocto,
            allocations_hash,
            order_hash,
        )
    }

    /// Applies the books for a settlement: deducts each member's share of what landed, restores what failed, clears the
    /// in-flight mark. Called by the follow-up step with the real outcome, and by recover_stuck_settlement assuming the
    /// payout landed (the only assumption that can never let members withdraw money that has already left).
    fn finish_settlement(
        &mut self,
        syndicate_id: String,
        charges: Vec<Charge>,
        total_payout: NearToken,
        failed_yocto: u128,
        allocations_hash: String,
        order_hash: String,
    ) -> bool {
        let total_payout_yocto = total_payout.as_yoctonear();
        let succeeded_yocto = total_payout_yocto.saturating_sub(failed_yocto);

        if let Some(syn) = self.syndicates.get_mut(&syndicate_id) {
            syn.is_settling = false;

            if succeeded_yocto > 0 {
                // Deduct flyer balances pro-rata for the succeeded payout portion (OO-008, CA-004)
                let deductions = if charges.is_empty() {
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
                    compute_pro_rata_deductions(
                        &flyer_balances,
                        succeeded_yocto,
                        if deductions_base > 0 {
                            deductions_base
                        } else {
                            1
                        },
                    )
                } else {
                    // Charged settlement: each named member pays their own charge. If only part of the payout landed,
                    // each charge is scaled by the share that landed (exact, with the dust to the largest charge).
                    let named: Vec<(AccountId, u128)> = charges
                        .iter()
                        .map(|c| (c.member.clone(), c.amount.as_yoctonear()))
                        .collect();
                    compute_pro_rata_deductions(&named, succeeded_yocto, total_payout_yocto.max(1))
                };

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
                // The failed part was not released: give its allowance back (GAP-024)
                if let Some(mut w) = read_window(&syndicate_id) {
                    w.released = NearToken::from_yoctonear(
                        w.released.as_yoctonear().saturating_sub(failed_yocto),
                    );
                    write_window(&syndicate_id, &w);
                }
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

    /// recover_stuck_settlement(): finishes a settlement whose follow-up step never ran (it ran out of gas or was lost).
    /// Anyone may call it once STUCK_SETTLEMENT_BLOCKS have passed since the settlement started. It assumes the payout
    /// landed: the members are charged exactly as the follow-up step would have charged them. Assuming the payout failed
    /// instead could let members withdraw money that has already left the contract, which also holds other groups' funds.
    /// If a transfer really did fail, that part stays in the contract and is not credited back to the members.
    pub fn recover_stuck_settlement(&mut self, syndicate_id: String) {
        let raw = env::storage_read(&pending_slot(&syndicate_id)).unwrap_or_else(|| {
            env::panic_str("[Recover REJECT] No settlement is in flight for this syndicate.")
        });
        let pending: PendingSettlement = near_sdk::borsh::from_slice(&raw).unwrap_or_else(|_| {
            env::panic_str("[Recover REJECT] The pending record is unreadable.")
        });
        let ready_at = pending.since_block.saturating_add(STUCK_SETTLEMENT_BLOCKS);
        assert!(
            env::block_height() >= ready_at,
            "[Recover REJECT] The settlement is not stuck yet: it can be recovered from block {}.",
            ready_at
        );
        env::storage_remove(&pending_slot(&syndicate_id));
        env::storage_remove(&nonce_slot(&syndicate_id));
        env::log_str(&format!(
            "EVENT_JSON:{{\"standard\":\"fly\",\"version\":\"1.0.0\",\"event\":\"settlement_recovered\",\"data\":[{{\"syndicate_id\":\"{}\",\"started_at_block\":{},\"recovered_at_block\":{},\"total_payout\":\"{}\"}}]}}",
            syndicate_id,
            pending.since_block,
            env::block_height(),
            pending.total_payout.as_yoctonear()
        ));
        self.finish_settlement(
            syndicate_id,
            pending.charges,
            pending.total_payout,
            0,
            pending.allocations_hash,
            pending.order_hash,
        );
    }

    /// Where a group is in its life (see `GroupPhase`); nothing for an id that does not exist.
    pub fn get_group_phase(&self, syndicate_id: String) -> Option<GroupPhase> {
        let syn = self.syndicates.get(&syndicate_id)?;
        // A payout in flight comes first: a final one marks the group Settled at once, but if a transfer then fails the
        // follow-up step puts the group back to Active, so it is not settled until the follow-up has run.
        if syn.is_settling {
            return Some(GroupPhase::PayoutInFlight);
        }
        Some(match syn.status {
            SyndicateStatus::Settled => GroupPhase::Settled,
            SyndicateStatus::AbortedRefunded => GroupPhase::Refunded,
            SyndicateStatus::Active if syn.flyers.is_empty() => GroupPhase::Unfunded,
            SyndicateStatus::Active => GroupPhase::Open,
        })
    }

    /// The settlement waiting for its follow-up step, if any.
    pub fn get_pending_settlement(&self, syndicate_id: String) -> Option<PendingSettlement> {
        env::storage_read(&pending_slot(&syndicate_id))
            .and_then(|raw| near_sdk::borsh::from_slice(&raw).ok())
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

            // The transfer failed and the money is back in escrow, so it backs the release cap again.
            if let Some(mut w) = read_window(&syndicate_id) {
                w.start_escrow = w.start_escrow.saturating_add(refund_amount);
                write_window(&syndicate_id, &w);
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

    /// Everything a depositor consents to, and whether the exit timer is covered by the hash they must present. `false` marks a group
    /// opened before GAP-025: its hash covers the recipients, the cap and the deadline but not the timer, so read the timer yourself.
    pub fn get_policy_terms(&self, syndicate_id: String) -> Option<PolicyTerms> {
        self.syndicates.get(&syndicate_id).map(|s| PolicyTerms {
            allowed_recipients: s.release_policy.allowed_recipients.clone(),
            max_release_bps_per_epoch: s.release_policy.max_release_bps_per_epoch,
            settle_deadline_block: s.release_policy.settle_deadline_block,
            timeout_blocks: s.timeout_blocks,
            release_window_blocks: s.timeout_blocks.saturating_mul(2),
            policy_hash: s.policy_hash.clone(),
            timer_in_consent_hash: s.policy_hash
                == s.release_policy.compute_hash_with_timeout(s.timeout_blocks),
        })
    }

    /// The current release window, if a settlement has opened one.
    pub fn get_release_window(&self, syndicate_id: String) -> Option<ReleaseWindow> {
        read_window(&syndicate_id)
    }

    /// The second room's public key, if this is a two-room syndicate.
    pub fn get_second_enclave_key(&self, syndicate_id: String) -> Option<String> {
        env::storage_read(&second_key_slot(&syndicate_id))
            .map(|b| String::from_utf8(b).unwrap_or_default())
    }

    pub fn get_syndicate(&self, syndicate_id: String) -> Option<SyndicateRecord> {
        self.syndicates.get(&syndicate_id).cloned()
    }

    /// set_foreign_policy(): the owner fixes, once and before the first deposit, which payees on other chains the group may pay and
    /// how much (per payment, in total, and in Ethereum fees). A depositor can read it first (`get_foreign_policy`); it cannot change.
    pub fn set_foreign_policy(&mut self, syndicate_id: String, policy: ForeignPolicy) {
        let syn = self
            .syndicates
            .get(&syndicate_id)
            .unwrap_or_else(|| env::panic_str("Syndicate not found"));
        assert_eq!(
            syn.owner,
            env::predecessor_account_id(),
            "[Foreign REJECT] only the owner may set the foreign policy"
        );
        assert!(
            syn.total_escrow.as_yoctonear() == 0 && syn.flyer_count == 0,
            "[Foreign REJECT] the foreign policy is set before the first deposit"
        );
        assert!(
            env::storage_read(&foreign_policy_slot(&syndicate_id)).is_none(),
            "[Foreign REJECT] the foreign policy is already set"
        );
        assert!(
            !policy.payees.is_empty() && policy.payees.len() <= 8,
            "[Foreign REJECT] one to eight foreign payees"
        );
        let mut seen: Vec<(String, String)> = Vec::new();
        for p in &policy.payees {
            assert!(
                foreign::KNOWN_CHAINS.contains(&p.chain.as_str()),
                "[Foreign REJECT] unknown chain {}",
                p.chain
            );
            let ok = if p.chain.starts_with("solana") {
                foreign::base58_decode(&p.address)
                    .map(|b| b.len() == 32)
                    .unwrap_or(false)
            } else {
                foreign::hex_to_20(&p.address).is_some()
            };
            assert!(
                ok,
                "[Foreign REJECT] {} is not a valid address on {}",
                p.address, p.chain
            );
            assert!(
                p.max_amount.0 > 0 && p.max_total.0 >= p.max_amount.0,
                "[Foreign REJECT] caps must be positive and the total at least one payment"
            );
            let key = (p.chain.clone(), normalize_foreign(&p.chain, &p.address));
            assert!(
                !seen.contains(&key),
                "[Foreign REJECT] duplicate foreign payee"
            );
            seen.push(key);
        }
        env::storage_write(
            &foreign_policy_slot(&syndicate_id),
            &near_sdk::borsh::to_vec(&policy)
                .unwrap_or_else(|_| env::panic_str("could not store the policy")),
        );
    }

    pub fn get_foreign_policy(&self, syndicate_id: String) -> Option<ForeignPolicy> {
        env::storage_read(&foreign_policy_slot(&syndicate_id))
            .and_then(|raw| near_sdk::borsh::from_slice(&raw).ok())
    }

    pub fn get_foreign_obligation(
        &self,
        syndicate_id: String,
        obligation_id: String,
    ) -> Option<ForeignObligation> {
        env::storage_read(&foreign_obligation_slot(&syndicate_id, &obligation_id))
            .and_then(|raw| near_sdk::borsh::from_slice(&raw).ok())
    }

    pub fn get_foreign_spent(&self, syndicate_id: String, chain: String, payee: String) -> U128 {
        U128(read_foreign_spent(
            &syndicate_id,
            &chain,
            &normalize_foreign(&chain, &payee),
        ))
    }

    /// request_foreign_payment(): pay a payee on another chain. The room signs the payment; the contract checks that signature, the
    /// group's foreign policy (payee on that chain, per-payment cap, running total, Ethereum fee cap) and that the obligation id is
    /// new, reserves the budget, builds the foreign transaction itself from those checked fields, and asks the NEAR MPC signer to
    /// sign it with a key derived from THIS contract and the group id. The signature comes back to the caller, who broadcasts it.
    /// If the signer fails, the reservation is released and the obligation can be asked for again.
    pub fn request_foreign_payment(
        &mut self,
        syndicate_id: String,
        attestation_nonce: String,
        request: ForeignPaymentRequest,
        enclave_signature: String,
    ) -> Promise {
        let syn = self
            .syndicates
            .get(&syndicate_id)
            .unwrap_or_else(|| env::panic_str("Syndicate not found"))
            .clone();
        assert_eq!(
            syn.status,
            SyndicateStatus::Active,
            "[HAQ REJECT] Syndicate is not active."
        );
        assert_eq!(
            syn.round_nonce, attestation_nonce,
            "[HAQ REJECT] Nonce mismatch. Replay attack blocked."
        );
        assert!(
            env::storage_read(&second_key_slot(&syndicate_id)).is_none(),
            "[Foreign REJECT] foreign payments are not supported for two-room groups yet"
        );
        let policy = self
            .get_foreign_policy(syndicate_id.clone())
            .unwrap_or_else(|| {
                env::panic_str("[Foreign REJECT] no foreign policy is set for this group")
            });

        let r = &request;
        assert!(
            !r.obligation_id.is_empty()
                && r.obligation_id.len() <= 64
                && r.obligation_id
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'_' || b == b'-'),
            "[Foreign REJECT] obligation id must be 1 to 64 plain characters"
        );
        // The room approved exactly this payment.
        let message = foreign::foreign_payment_message(
            env::current_account_id().as_str(),
            &syn.id,
            syn.epoch,
            &syn.round_nonce,
            r,
        );
        let pk_bytes = hex::decode(&syn.enclave_public_key)
            .unwrap_or_else(|_| env::panic_str("[HAQ REJECT] Enclave public key must be hex"));
        let sig_bytes = hex::decode(&enclave_signature)
            .unwrap_or_else(|_| env::panic_str("[HAQ REJECT] Invalid hex signature"));
        assert!(
            pk_bytes.len() == 32 && sig_bytes.len() == 64,
            "[HAQ REJECT] Key must be 32 bytes and signature 64 bytes"
        );
        let mut pk = [0u8; 32];
        pk.copy_from_slice(&pk_bytes);
        let mut sg = [0u8; 64];
        sg.copy_from_slice(&sig_bytes);
        assert!(
            env::ed25519_verify(&sg, message.as_bytes(), &pk),
            "[HAQ REJECT] Invalid enclave Ed25519 signature over foreign payment!"
        );

        // The group's rules.
        assert!(
            env::storage_read(&foreign_obligation_slot(&syndicate_id, &r.obligation_id)).is_none(),
            "[Foreign REJECT] obligation {} was already requested",
            r.obligation_id
        );
        let wanted = normalize_foreign(&r.chain, &r.payee);
        let rule = policy
            .payees
            .iter()
            .find(|p| p.chain == r.chain && normalize_foreign(&p.chain, &p.address) == wanted)
            .unwrap_or_else(|| {
                env::panic_str("[Foreign REJECT] payee is not allowed on this chain")
            });
        assert!(
            r.amount.0 > 0 && r.amount.0 <= rule.max_amount.0,
            "[Foreign REJECT] amount is over the per-payment cap"
        );
        let spent = read_foreign_spent(&syndicate_id, &r.chain, &wanted);
        assert!(
            spent.saturating_add(r.amount.0) <= rule.max_total.0,
            "[Foreign REJECT] total would pass the running cap for this payee"
        );

        // Build the transaction the signer will sign, from the fields just checked.
        let (domain_id, payload) = if r.chain.starts_with("solana") {
            let to = foreign::base58_decode(&r.payee)
                .filter(|b| b.len() == 32)
                .unwrap_or_else(|| {
                    env::panic_str("[Foreign REJECT] payee is not a Solana address")
                });
            let from = foreign::base58_decode(&r.from)
                .filter(|b| b.len() == 32)
                .unwrap_or_else(|| env::panic_str("[Foreign REJECT] from is not a Solana address"));
            let bh = r
                .recent_blockhash
                .as_ref()
                .and_then(|b| foreign::base58_decode(b))
                .filter(|b| b.len() == 32)
                .unwrap_or_else(|| {
                    env::panic_str("[Foreign REJECT] a Solana payment needs a recent blockhash")
                });
            let lamports = u64::try_from(r.amount.0).unwrap_or_else(|_| {
                env::panic_str("[Foreign REJECT] amount does not fit a Solana transfer")
            });
            let (mut f, mut t, mut b) = ([0u8; 32], [0u8; 32], [0u8; 32]);
            f.copy_from_slice(&from);
            t.copy_from_slice(&to);
            b.copy_from_slice(&bh);
            let msg = foreign::solana_transfer_message(&f, &t, lamports, &b);
            (
                1u32,
                near_sdk::serde_json::json!({ "Eddsa": hex::encode(msg) }),
            )
        } else {
            let to = foreign::hex_to_20(&r.payee).unwrap_or_else(|| {
                env::panic_str("[Foreign REJECT] payee is not an Ethereum address")
            });
            assert!(
                foreign::hex_to_20(&r.from).is_some(),
                "[Foreign REJECT] from is not an Ethereum address"
            );
            let (nonce, prio, max_fee, gas) =
                match (r.evm_nonce, r.max_priority_fee, r.max_fee, r.gas_limit) {
                    (Some(n), Some(p), Some(m), Some(g)) => (n, p.0, m.0, g),
                    _ => env::panic_str(
                        "[Foreign REJECT] an Ethereum payment needs nonce, fees and gas limit",
                    ),
                };
            assert!(
                prio <= max_fee,
                "[Foreign REJECT] priority fee is above the max fee"
            );
            assert!(
                (gas as u128).saturating_mul(max_fee) <= policy.max_fee_cost.0,
                "[Foreign REJECT] fee (gas limit x max fee) is over the cap"
            );
            let digest = foreign::evm_transfer_digest(
                11_155_111,
                nonce,
                prio,
                max_fee,
                gas,
                &to,
                r.amount.0,
                |b| env::keccak256(b),
            );
            (
                0u32,
                near_sdk::serde_json::json!({ "Ecdsa": hex::encode(digest) }),
            )
        };

        // Reserve the budget and record the obligation before asking, so a second request cannot spend the same budget.
        write_foreign_spent(&syndicate_id, &r.chain, &wanted, spent + r.amount.0);
        let ob = ForeignObligation {
            chain: r.chain.clone(),
            payee: r.payee.clone(),
            amount: r.amount,
            since_block: env::block_height(),
            signed: false,
        };
        env::storage_write(
            &foreign_obligation_slot(&syndicate_id, &r.obligation_id),
            &near_sdk::borsh::to_vec(&ob)
                .unwrap_or_else(|_| env::panic_str("could not record the obligation")),
        );
        env::log_str(&format!("EVENT_JSON:{{\"event\":\"foreign_payment_requested\",\"group\":\"{}\",\"obligation\":\"{}\",\"chain\":\"{}\",\"payee\":\"{}\",\"amount\":\"{}\"}}", syndicate_id, r.obligation_id, r.chain, r.payee, r.amount.0));

        let signer: AccountId = if env::current_account_id().as_str().ends_with(".testnet") {
            "v1.signer-prod.testnet"
        } else {
            "v1.signer"
        }
        .parse()
        .unwrap();
        let args = near_sdk::serde_json::json!({ "request": { "payload_v2": payload, "path": syndicate_id, "domain_id": domain_id } }).to_string().into_bytes();
        Promise::new(signer)
            .function_call(
                "sign".to_string(),
                args,
                NearToken::from_yoctonear(1),
                Gas::from_tgas(200),
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(15))
                    .on_foreign_signed(
                        syndicate_id,
                        r.obligation_id.clone(),
                        r.chain.clone(),
                        wanted,
                        r.amount,
                    ),
            )
    }

    /// Follow-up of a foreign payment request: if the signer failed, release the reservation so the obligation can be asked for again.
    #[private]
    #[allow(deprecated)]
    pub fn on_foreign_signed(
        &mut self,
        syndicate_id: String,
        obligation_id: String,
        chain: String,
        payee: String,
        amount: U128,
    ) -> Option<String> {
        assert_eq!(
            env::promise_results_count(),
            1,
            "expected one promise result"
        );
        match env::promise_result(0) {
            PromiseResult::Successful(bytes) => {
                if let Some(raw) =
                    env::storage_read(&foreign_obligation_slot(&syndicate_id, &obligation_id))
                {
                    if let Ok(mut ob) = near_sdk::borsh::from_slice::<ForeignObligation>(&raw) {
                        ob.signed = true;
                        env::storage_write(
                            &foreign_obligation_slot(&syndicate_id, &obligation_id),
                            &near_sdk::borsh::to_vec(&ob).unwrap(),
                        );
                    }
                }
                Some(String::from_utf8_lossy(&bytes).to_string())
            }
            PromiseResult::Failed => {
                env::storage_remove(&foreign_obligation_slot(&syndicate_id, &obligation_id));
                let spent = read_foreign_spent(&syndicate_id, &chain, &payee);
                write_foreign_spent(
                    &syndicate_id,
                    &chain,
                    &payee,
                    spent.saturating_sub(amount.0),
                );
                None
            }
        }
    }

    /// prune_syndicate(): garbage collection of a finished syndicate (permissionless), or of a never-funded one (its
    /// creator at once, anyone after UNFUNDED_PRUNE_BLOCKS).
    ///
    /// A Settled or AbortedRefunded syndicate with no escrow left keeps its record in contract storage forever, and the
    /// contract account pays for that storage out of the same balance that holds everyone's escrow. Anyone may remove
    /// such a record. The record is gone after this call (get_syndicate returns null); the history stays in the event
    /// log, which `syndicate_pruned` extends with the final status. Reusing the id is safe: the first round nonce is
    /// derived from the id and the block it was hatched in, so a signature for the old syndicate verifies on no new one.
    pub fn prune_syndicate(&mut self, syndicate_id: String) {
        let syn = self
            .syndicates
            .get(&syndicate_id)
            .unwrap_or_else(|| env::panic_str("Syndicate not found"));
        let finished = matches!(
            syn.status,
            SyndicateStatus::Settled | SyndicateStatus::AbortedRefunded
        );
        // Hatched and never funded: Active, nobody listed, nothing held, nothing in flight. It has no member who could
        // exit, so without this it would stay for ever (GAP-030).
        let never_funded = syn.status == SyndicateStatus::Active
            && !syn.is_settling
            && syn.flyers.is_empty()
            && syn.total_escrow.as_yoctonear() == 0;
        assert!(
            finished || never_funded,
            "[Prune REJECT] Only a Settled or AbortedRefunded syndicate, or one that was never funded, can be pruned."
        );
        if never_funded {
            let open_to_all_from = syn.created_at_block.saturating_add(UNFUNDED_PRUNE_BLOCKS);
            assert!(
                env::predecessor_account_id() == syn.owner || env::block_height() >= open_to_all_from,
                "[Prune REJECT] A never-funded syndicate can be pruned by its creator, or by anyone from block {}.",
                open_to_all_from
            );
        }
        assert!(
            syn.total_escrow.as_yoctonear() == 0,
            "[Prune REJECT] The syndicate still holds escrow."
        );
        assert!(
            !syn.is_settling,
            "[Prune REJECT] A settlement is still in flight."
        );
        let owner = syn.owner.clone();
        let status = syn.status.clone();
        let epoch = syn.epoch;
        let policy_hash = syn.policy_hash.clone();
        let total_settled = syn.total_settled_payouts.as_yoctonear();

        self.syndicates.remove(&syndicate_id);
        env::storage_remove(&second_key_slot(&syndicate_id));
        env::storage_remove(&window_slot(&syndicate_id));
        if let Some(ids) = self.member_syndicates.get(&owner).cloned() {
            let kept: Vec<String> = ids.into_iter().filter(|id| id != &syndicate_id).collect();
            self.member_syndicates.insert(owner, kept);
        }

        env::log_str(&format!(
            "EVENT_JSON:{{\"standard\":\"fly\",\"version\":\"1.0.0\",\"event\":\"syndicate_pruned\",\"data\":[{{\"syndicate_id\":\"{}\",\"final_status\":\"{:?}\",\"epoch\":{},\"total_settled_payouts\":\"{}\",\"policy_hash\":\"{}\"}}]}}",
            syndicate_id, status, epoch, total_settled, policy_hash
        ));
    }

    /// compact_member_index(): drops ids of syndicates that no longer exist from an account's index and returns how
    /// many were dropped. Permissionless and bounded by that one account's list. Pruning cannot clean the index of
    /// every flyer (a finished syndicate no longer lists them), so each account compacts its own.
    pub fn compact_member_index(&mut self, account_id: AccountId) -> u64 {
        let ids = self
            .member_syndicates
            .get(&account_id)
            .cloned()
            .unwrap_or_default();
        let before = ids.len();
        let kept: Vec<String> = ids
            .into_iter()
            .filter(|id| self.syndicates.get(id).is_some())
            .collect();
        let removed = (before - kept.len()) as u64;
        if removed > 0 {
            self.member_syndicates.insert(account_id, kept);
        }
        removed
    }

    /// Number of syndicates in an account's index (creator or flyer). May include ids that were pruned until the account
    /// calls compact_member_index.
    pub fn get_member_syndicate_count(&self, account_id: AccountId) -> u64 {
        self.member_syndicates
            .get(&account_id)
            .map(|v| v.len() as u64)
            .unwrap_or(0)
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
