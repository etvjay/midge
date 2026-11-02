use near_sdk::store::{IterableMap, LookupMap};
use near_sdk::{env, near, AccountId, NearToken, PanicOnDefault, Promise};

/// Minimum storage deposit to prevent storage griefing attacks (0.005 NEAR).
const MIN_STORAGE_DEPOSIT_YOCTO: u128 = 5_000_000_000_000_000_000_000;

/// Minimum deposit per flyer to prevent dusting attacks (0.01 NEAR).
const MIN_DEPOSIT_YOCTO: u128 = 10_000_000_000_000_000_000_000;

/// Maximum number of distinct flyers per syndicate to bound gas consumption.
const MAX_FLYERS_PER_SYNDICATE: u32 = 50;

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
                    .unwrap_or_else(|| env::panic_str("[Hatch REJECT] max_spend_near exceeds yoctoNEAR limit"));
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
        if current_balance.as_yoctonear() == 0 {
            assert!(
                syn.flyer_count < MAX_FLYERS_PER_SYNDICATE,
                "[Deposit REJECT] Maximum 50 flyers reached for this syndicate."
            );
            syn.flyer_count += 1;
            syn.active_flyer_count += 1;
        }

        self.escrows.insert(escrow_key, new_balance);
        syn.total_escrow = syn.total_escrow.saturating_add(attached);
    }

    /// settle_batch(): Verifies HAQ attestation signature and executes settlement payout.
    /// Enforces domain-separated message signing: (contract_id:syndicate_id:epoch:round_nonce:order_hash).
    /// For Flash syndicates: transfers pooled escrow to payout recipient via Promise and clears state.
    /// For DarkVault: resets epoch_start_block for the new epoch and rolls over escrow.
    pub fn settle_batch(
        &mut self,
        syndicate_id: String,
        attestation_nonce: String,
        aggregate_order_hash: String,
        enclave_signature: String,
        payout_account: Option<AccountId>,
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

        // Domain-separated signed message: (contract_id, syndicate_id, epoch, round_nonce, order_hash)
        let message = format!(
            "{}:{}:{}:{}:{}",
            env::current_account_id(),
            syn.id,
            syn.epoch,
            syn.round_nonce,
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
                let payout_target = payout_account.unwrap_or_else(|| syn.payout_recipient.clone());
                let payout_amount = syn.total_escrow;

                // Transfer pooled funds to the settlement account
                if payout_amount.as_yoctonear() > 0 {
                    let _ = Promise::new(payout_target).transfer(payout_amount);
                }

                syn.total_settled_payouts = syn.total_settled_payouts.saturating_add(payout_amount);
                syn.total_escrow = NearToken::from_yoctonear(0);
                syn.status = SyndicateStatus::Settled;
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

        // 4. Zero caller's balance in LookupMap to prevent double refund attacks
        self.escrows.insert(escrow_key, NearToken::from_yoctonear(0));
        syn.total_escrow = syn.total_escrow.saturating_sub(flyer_balance);
        syn.active_flyer_count = syn.active_flyer_count.saturating_sub(1);

        // 5. Update syndicate status to AbortedRefunded if all escrow is cleared
        if syn.total_escrow.as_yoctonear() == 0 {
            syn.status = SyndicateStatus::AbortedRefunded;
        }

        Promise::new(caller).transfer(flyer_balance)
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

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    fn get_context(
        predecessor: AccountId,
        attached_deposit: NearToken,
        block_height: u64,
    ) -> VMContextBuilder {
        let mut builder = VMContextBuilder::new();
        builder
            .current_account_id("fly-coordinator.testnet".parse().unwrap())
            .predecessor_account_id(predecessor)
            .attached_deposit(attached_deposit)
            .block_height(block_height);
        builder
    }

    // Helper: generate real Ed25519 keypair and valid domain-separated signature
    fn make_enclave_key_and_signature(
        contract_id: &str,
        syndicate_id: &str,
        epoch: u64,
        nonce: &str,
        order_hash: &str,
    ) -> (String, String) {
        let signing_key = SigningKey::from_bytes(&[42u8; 32]);
        let verifying_key = signing_key.verifying_key();
        let message = format!("{}:{}:{}:{}:{}", contract_id, syndicate_id, epoch, nonce, order_hash);
        let signature = signing_key.sign(message.as_bytes());
        (
            hex::encode(verifying_key.to_bytes()),
            hex::encode(signature.to_bytes()),
        )
    }

    #[test]
    fn test_hatch_and_ed25519_settle_with_payout() {
        let owner: AccountId = "alice.near".parse().unwrap();
        let ctx = get_context(owner.clone(), NearToken::from_near(1), 100);
        testing_env!(ctx.build());

        let mut contract = FlyCoordinator::new();
        let (enclave_pk, _) = make_enclave_key_and_signature("fly-coordinator.testnet", "swarm-01", 1, "", "");

        let syn_id = contract.hatch(
            "swarm-01".to_string(),
            Some("FLASH".to_string()),
            Some(2),
            Some(50),
            enclave_pk.clone(),
            "mrenclave_code_hash".to_string(),
            Some(30),
            Some("payout-recipient.near".parse().unwrap()),
        );

        let syn = contract.get_syndicate(syn_id.clone()).unwrap();
        assert_eq!(syn.sub_account.as_str(), "swarm-01.fly-coordinator.testnet");
        assert_eq!(syn.owner, owner);
        assert_eq!(syn.payout_recipient.as_str(), "payout-recipient.near");
        let active_nonce = syn.round_nonce.clone();

        // Flyer 1 deposits
        let f1: AccountId = "flyer1.near".parse().unwrap();
        let ctx = get_context(f1.clone(), NearToken::from_near(10), 105);
        testing_env!(ctx.build());
        contract.deposit(syn_id.clone());

        assert_eq!(contract.get_escrow(syn_id.clone(), f1).as_near(), 10);

        // Flyer 2 deposits
        let f2: AccountId = "flyer2.near".parse().unwrap();
        let ctx = get_context(f2.clone(), NearToken::from_near(15), 106);
        testing_env!(ctx.build());
        contract.deposit(syn_id.clone());

        assert_eq!(contract.get_escrow(syn_id.clone(), f2).as_near(), 15);

        // Generate genuine Ed25519 signature over (contract, id, epoch, nonce, order_hash)
        let order_hash = "order_twap_batch_01".to_string();
        let (_, valid_sig) = make_enclave_key_and_signature(
            "fly-coordinator.testnet",
            &syn_id,
            1,
            &active_nonce,
            &order_hash,
        );

        // Settle batch with genuine signature and custom payout account
        let ctx = get_context(owner, NearToken::from_near(0), 110);
        testing_env!(ctx.build());
        contract.settle_batch(
            syn_id.clone(),
            active_nonce,
            order_hash,
            valid_sig,
            Some("settlement-agent.near".parse().unwrap()),
        );

        let syn_after = contract.get_syndicate(syn_id).unwrap();
        assert_eq!(syn_after.status, SyndicateStatus::Settled);
        assert_eq!(syn_after.total_settled_payouts, NearToken::from_near(25));
        assert_eq!(syn_after.total_escrow, NearToken::from_yoctonear(0));
    }

    #[test]
    #[should_panic(expected = "[HAQ REJECT] Invalid enclave Ed25519 signature over deliberation batch!")]
    fn test_bad_signature_fails() {
        let owner: AccountId = "alice.near".parse().unwrap();
        let ctx = get_context(owner.clone(), NearToken::from_near(1), 100);
        testing_env!(ctx.build());

        let mut contract = FlyCoordinator::new();
        let (enclave_pk, _) = make_enclave_key_and_signature("fly-coordinator.testnet", "bad-sig-swarm", 1, "", "");

        let syn_id = contract.hatch(
            "bad-sig-swarm".to_string(),
            Some("FLASH".to_string()),
            Some(1),
            Some(50),
            enclave_pk,
            "hash".to_string(),
            Some(30),
            None,
        );

        let syn = contract.get_syndicate(syn_id.clone()).unwrap();
        let active_nonce = syn.round_nonce.clone();

        let f1: AccountId = "flyer1.near".parse().unwrap();
        let ctx = get_context(f1, NearToken::from_near(10), 105);
        testing_env!(ctx.build());
        contract.deposit(syn_id.clone());

        // Fake 64-byte signature
        let fake_sig = hex::encode([99u8; 64]);
        let ctx = get_context(owner, NearToken::from_near(0), 110);
        testing_env!(ctx.build());
        contract.settle_batch(syn_id, active_nonce, "order_hash".to_string(), fake_sig, None);
    }

    #[test]
    #[should_panic(expected = "[HAQ REJECT] Invalid enclave Ed25519 signature over deliberation batch!")]
    fn test_signature_cross_contract_replay_fails() {
        let owner: AccountId = "alice.near".parse().unwrap();
        let ctx = get_context(owner.clone(), NearToken::from_near(1), 100);
        testing_env!(ctx.build());

        let mut contract = FlyCoordinator::new();
        let (enclave_pk, _) = make_enclave_key_and_signature("fly-coordinator.testnet", "cross-swarm", 1, "", "");

        let syn_id = contract.hatch(
            "cross-swarm".to_string(),
            Some("FLASH".to_string()),
            Some(1),
            Some(50),
            enclave_pk,
            "hash".to_string(),
            Some(30),
            None,
        );

        let syn = contract.get_syndicate(syn_id.clone()).unwrap();
        let active_nonce = syn.round_nonce.clone();

        let f1: AccountId = "flyer1.near".parse().unwrap();
        let ctx = get_context(f1, NearToken::from_near(10), 105);
        testing_env!(ctx.build());
        contract.deposit(syn_id.clone());

        // Signature created for another contract account: "different-coordinator.near"
        let (_, diff_contract_sig) = make_enclave_key_and_signature(
            "different-coordinator.near",
            &syn_id,
            1,
            &active_nonce,
            "order_hash",
        );

        let ctx = get_context(owner, NearToken::from_near(0), 110);
        testing_env!(ctx.build());
        contract.settle_batch(syn_id, active_nonce, "order_hash".to_string(), diff_contract_sig, None);
    }

    #[test]
    #[should_panic(expected = "[Deposit REJECT] Minimum deposit of 0.01 NEAR required.")]
    fn test_below_min_deposit_fails() {
        let owner: AccountId = "alice.near".parse().unwrap();
        let ctx = get_context(owner, NearToken::from_near(1), 100);
        testing_env!(ctx.build());

        let mut contract = FlyCoordinator::new();
        let (enclave_pk, _) = make_enclave_key_and_signature("fly-coordinator.testnet", "min-dep-swarm", 1, "", "");
        let syn_id = contract.hatch(
            "min-dep-swarm".to_string(),
            None,
            Some(1),
            Some(50),
            enclave_pk,
            "hash".to_string(),
            Some(30),
            None,
        );

        // Deposit 1 yoctoNEAR (below 0.01 NEAR minimum)
        let f1: AccountId = "flyer1.near".parse().unwrap();
        let ctx = get_context(f1, NearToken::from_yoctonear(1), 105);
        testing_env!(ctx.build());
        contract.deposit(syn_id);
    }

    #[test]
    #[should_panic(expected = "[Deposit REJECT] Maximum 50 flyers reached for this syndicate.")]
    fn test_max_flyers_cap_enforced() {
        let owner: AccountId = "alice.near".parse().unwrap();
        let ctx = get_context(owner, NearToken::from_near(1), 100);
        testing_env!(ctx.build());

        let mut contract = FlyCoordinator::new();
        let (enclave_pk, _) = make_enclave_key_and_signature("fly-coordinator.testnet", "cap-swarm", 1, "", "");
        let syn_id = contract.hatch(
            "cap-swarm".to_string(),
            None,
            Some(1),
            Some(50),
            enclave_pk,
            "hash".to_string(),
            Some(30),
            None,
        );

        // Fill 50 distinct flyers
        for i in 0..50 {
            let flyer: AccountId = format!("flyer{}.near", i).parse().unwrap();
            let ctx = get_context(flyer, NearToken::from_near(1), 105 + i);
            testing_env!(ctx.build());
            contract.deposit(syn_id.clone());
        }

        // 51st flyer must be rejected
        let flyer51: AccountId = "flyer51.near".parse().unwrap();
        let ctx = get_context(flyer51, NearToken::from_near(1), 200);
        testing_env!(ctx.build());
        contract.deposit(syn_id);
    }

    #[test]
    #[should_panic(expected = "[Hatch REJECT] quorum_threshold must be >= 1.")]
    fn test_hatch_invalid_quorum_fails() {
        let owner: AccountId = "alice.near".parse().unwrap();
        let ctx = get_context(owner, NearToken::from_near(1), 100);
        testing_env!(ctx.build());

        let mut contract = FlyCoordinator::new();
        let (enclave_pk, _) = make_enclave_key_and_signature("fly-coordinator.testnet", "zero-quorum", 1, "", "");
        contract.hatch(
            "zero-quorum".to_string(),
            None,
            Some(0), // Invalid quorum
            Some(50),
            enclave_pk,
            "hash".to_string(),
            Some(30),
            None,
        );
    }

    #[test]
    #[should_panic(expected = "[Hatch REJECT] timeout_blocks must be >= 1.")]
    fn test_hatch_invalid_timeout_fails() {
        let owner: AccountId = "alice.near".parse().unwrap();
        let ctx = get_context(owner, NearToken::from_near(1), 100);
        testing_env!(ctx.build());

        let mut contract = FlyCoordinator::new();
        let (enclave_pk, _) = make_enclave_key_and_signature("fly-coordinator.testnet", "zero-timeout", 1, "", "");
        contract.hatch(
            "zero-timeout".to_string(),
            None,
            Some(1),
            Some(50),
            enclave_pk,
            "hash".to_string(),
            Some(0), // Invalid timeout
            None,
        );
    }

    #[test]
    #[should_panic(expected = "[QUORUM REJECT] Active flyer count below threshold.")]
    fn test_below_quorum_fails() {
        let owner: AccountId = "alice.near".parse().unwrap();
        let ctx = get_context(owner.clone(), NearToken::from_near(1), 100);
        testing_env!(ctx.build());

        let mut contract = FlyCoordinator::new();
        let (enclave_pk, _) = make_enclave_key_and_signature("fly-coordinator.testnet", "quorum-swarm", 1, "", "");

        let syn_id = contract.hatch(
            "quorum-swarm".to_string(),
            Some("FLASH".to_string()),
            Some(3), // Requires 3
            Some(50),
            enclave_pk,
            "hash".to_string(),
            Some(30),
            None,
        );

        let syn = contract.get_syndicate(syn_id.clone()).unwrap();
        let active_nonce = syn.round_nonce.clone();

        // Only 1 flyer deposits
        let f1: AccountId = "flyer1.near".parse().unwrap();
        let ctx = get_context(f1, NearToken::from_near(10), 105);
        testing_env!(ctx.build());
        contract.deposit(syn_id.clone());

        let (_, valid_sig) = make_enclave_key_and_signature(
            "fly-coordinator.testnet",
            &syn_id,
            1,
            &active_nonce,
            "order_hash",
        );

        let ctx = get_context(owner, NearToken::from_near(0), 110);
        testing_env!(ctx.build());
        contract.settle_batch(syn_id, active_nonce, "order_hash".to_string(), valid_sig, None);
    }

    #[test]
    #[should_panic(expected = "[HAQ REJECT] Nonce mismatch. Replay attack blocked.")]
    fn test_wrong_nonce_fails() {
        let owner: AccountId = "alice.near".parse().unwrap();
        let ctx = get_context(owner.clone(), NearToken::from_near(1), 100);
        testing_env!(ctx.build());

        let mut contract = FlyCoordinator::new();
        let (enclave_pk, _) = make_enclave_key_and_signature("fly-coordinator.testnet", "nonce-swarm", 1, "", "");

        let syn_id = contract.hatch(
            "nonce-swarm".to_string(),
            Some("FLASH".to_string()),
            Some(1),
            Some(50),
            enclave_pk,
            "hash".to_string(),
            Some(30),
            None,
        );

        let f1: AccountId = "flyer1.near".parse().unwrap();
        let ctx = get_context(f1, NearToken::from_near(10), 105);
        testing_env!(ctx.build());
        contract.deposit(syn_id.clone());

        let (_, sig) = make_enclave_key_and_signature(
            "fly-coordinator.testnet",
            &syn_id,
            1,
            "wrong_nonce_value",
            "order_hash",
        );

        let ctx = get_context(owner, NearToken::from_near(0), 110);
        testing_env!(ctx.build());
        contract.settle_batch(syn_id, "wrong_nonce_value".to_string(), "order_hash".to_string(), sig, None);
    }

    #[test]
    #[should_panic(expected = "[Deposit REJECT] Deposit exceeds OutLayer max_spend_per_flyer policy limit.")]
    fn test_deposit_limit_exceeded_fails() {
        let owner: AccountId = "alice.near".parse().unwrap();
        let ctx = get_context(owner, NearToken::from_near(1), 100);
        testing_env!(ctx.build());

        let mut contract = FlyCoordinator::new();
        let (enclave_pk, _) = make_enclave_key_and_signature("fly-coordinator.testnet", "limit-swarm", 1, "", "");

        let syn_id = contract.hatch(
            "limit-swarm".to_string(),
            Some("FLASH".to_string()),
            Some(1),
            Some(20), // Max 20 NEAR
            enclave_pk,
            "hash".to_string(),
            Some(30),
            None,
        );

        let f1: AccountId = "flyer1.near".parse().unwrap();
        let ctx = get_context(f1, NearToken::from_near(25), 105); // Attaches 25 NEAR
        testing_env!(ctx.build());
        contract.deposit(syn_id);
    }

    #[test]
    #[should_panic(expected = "[Deposit REJECT] Cannot deposit into inactive syndicate.")]
    fn test_deposit_to_non_active_fails() {
        let owner: AccountId = "alice.near".parse().unwrap();
        let ctx = get_context(owner.clone(), NearToken::from_near(1), 100);
        testing_env!(ctx.build());

        let mut contract = FlyCoordinator::new();
        let (enclave_pk, _) = make_enclave_key_and_signature("fly-coordinator.testnet", "settle-dep-swarm", 1, "", "");

        let syn_id = contract.hatch(
            "settle-dep-swarm".to_string(),
            Some("FLASH".to_string()),
            Some(1),
            Some(50),
            enclave_pk,
            "hash".to_string(),
            Some(30),
            None,
        );

        let syn = contract.get_syndicate(syn_id.clone()).unwrap();
        let active_nonce = syn.round_nonce.clone();

        let f1: AccountId = "flyer1.near".parse().unwrap();
        let ctx = get_context(f1.clone(), NearToken::from_near(10), 105);
        testing_env!(ctx.build());
        contract.deposit(syn_id.clone());

        let (_, valid_sig) = make_enclave_key_and_signature(
            "fly-coordinator.testnet",
            &syn_id,
            1,
            &active_nonce,
            "order_hash",
        );

        let ctx = get_context(owner, NearToken::from_near(0), 110);
        testing_env!(ctx.build());
        contract.settle_batch(syn_id.clone(), active_nonce, "order_hash".to_string(), valid_sig, None);

        // Attempt deposit after settled
        let ctx = get_context(f1, NearToken::from_near(5), 120);
        testing_env!(ctx.build());
        contract.deposit(syn_id);
    }

    #[test]
    #[should_panic(expected = "[Hatch REJECT] Syndicate ID must only contain lowercase alphanumeric, '-' or '_' characters.")]
    fn test_invalid_id_characters_fails() {
        let owner: AccountId = "alice.near".parse().unwrap();
        let ctx = get_context(owner, NearToken::from_near(1), 100);
        testing_env!(ctx.build());

        let mut contract = FlyCoordinator::new();
        let (enclave_pk, _) = make_enclave_key_and_signature("fly-coordinator.testnet", "BAD ID", 1, "", "");
        contract.hatch(
            "BAD ID".to_string(),
            None,
            Some(1),
            Some(50),
            enclave_pk,
            "hash".to_string(),
            Some(30),
            None,
        );
    }

    #[test]
    fn test_dark_vault_epoch_rollover_resets_escape_hatch_timer() {
        let owner: AccountId = "alice.near".parse().unwrap();
        let ctx = get_context(owner.clone(), NearToken::from_near(1), 100);
        testing_env!(ctx.build());

        let mut contract = FlyCoordinator::new();
        let (enclave_pk, _) = make_enclave_key_and_signature("fly-coordinator.testnet", "vault-epoch", 1, "", "");

        let syn_id = contract.hatch(
            "vault-epoch".to_string(),
            Some("DARK_VAULT".to_string()),
            Some(1),
            Some(50),
            enclave_pk,
            "hash".to_string(),
            Some(30), // timeout: 30 blocks
            None,
        );

        let f1: AccountId = "flyer1.near".parse().unwrap();
        let ctx = get_context(f1.clone(), NearToken::from_near(10), 105);
        testing_env!(ctx.build());
        contract.deposit(syn_id.clone());

        let syn = contract.get_syndicate(syn_id.clone()).unwrap();
        let nonce_epoch1 = syn.round_nonce.clone();
        assert_eq!(syn.epoch, 1);
        assert_eq!(syn.epoch_start_block, 100);

        let (_, sig1) = make_enclave_key_and_signature(
            "fly-coordinator.testnet",
            &syn_id,
            1,
            &nonce_epoch1,
            "batch_01",
        );

        // Settle epoch 1 at block 120
        let ctx = get_context(owner, NearToken::from_near(0), 120);
        testing_env!(ctx.build());
        contract.settle_batch(syn_id.clone(), nonce_epoch1.clone(), "batch_01".to_string(), sig1, None);

        let syn_epoch2 = contract.get_syndicate(syn_id.clone()).unwrap();
        assert_eq!(syn_epoch2.epoch, 2);
        assert_ne!(syn_epoch2.round_nonce, nonce_epoch1);
        assert_eq!(syn_epoch2.epoch_start_block, 120); // Reset to block 120!

        // Attempt hatch_out at block 130:
        // Blocks since epoch 2 start: 130 - 120 = 10 (< timeout 30)
        // Must fail with Deliberation window still active!
        let ctx = get_context(f1.clone(), NearToken::from_near(0), 130);
        testing_env!(ctx.build());
        let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let mut c = contract;
            let _ = c.hatch_out(syn_id);
        }));
        assert!(res.is_err(), "hatch_out should fail mid-epoch in DarkVault!");
    }

    #[test]
    #[should_panic(expected = "[Hatch-Out LOCKED] Deliberation window still active.")]
    fn test_premature_hatch_out_fails() {
        let owner: AccountId = "alice.near".parse().unwrap();
        let ctx = get_context(owner, NearToken::from_near(1), 100);
        testing_env!(ctx.build());

        let mut contract = FlyCoordinator::new();
        let (enclave_pk, _) = make_enclave_key_and_signature("fly-coordinator.testnet", "premature-swarm", 1, "", "");

        let syn_id = contract.hatch(
            "premature-swarm".to_string(),
            Some("FLASH".to_string()),
            Some(1),
            Some(50),
            enclave_pk,
            "hash".to_string(),
            Some(50), // timeout: 50 blocks
            None,
        );

        let f1: AccountId = "flyer1.near".parse().unwrap();
        let ctx = get_context(f1.clone(), NearToken::from_near(10), 105);
        testing_env!(ctx.build());
        contract.deposit(syn_id.clone());

        // Attempt hatch_out at block 120 (only 20 blocks passed < 50)
        let ctx = get_context(f1, NearToken::from_near(0), 120);
        testing_env!(ctx.build());
        let _ = contract.hatch_out(syn_id);
    }

    #[test]
    fn test_hatch_out_after_timeout_refunds_only_caller() {
        let owner: AccountId = "alice.near".parse().unwrap();
        let ctx = get_context(owner, NearToken::from_near(1), 100);
        testing_env!(ctx.build());

        let mut contract = FlyCoordinator::new();
        let (enclave_pk, _) = make_enclave_key_and_signature("fly-coordinator.testnet", "timeout-swarm", 1, "", "");

        let syn_id = contract.hatch(
            "timeout-swarm".to_string(),
            Some("FLASH".to_string()),
            Some(2),
            Some(50),
            enclave_pk,
            "hash".to_string(),
            Some(50),
            None,
        );

        let f1: AccountId = "flyer1.near".parse().unwrap();
        let ctx = get_context(f1.clone(), NearToken::from_near(10), 105);
        testing_env!(ctx.build());
        contract.deposit(syn_id.clone());

        let f2: AccountId = "flyer2.near".parse().unwrap();
        let ctx = get_context(f2.clone(), NearToken::from_near(20), 106);
        testing_env!(ctx.build());
        contract.deposit(syn_id.clone());

        // Past timeout: Block 160 > 100 + 50
        let ctx = get_context(f1.clone(), NearToken::from_near(0), 160);
        testing_env!(ctx.build());
        let _ = contract.hatch_out(syn_id.clone());

        // f1 is refunded
        assert_eq!(contract.get_escrow(syn_id.clone(), f1).as_yoctonear(), 0);
        // f2's escrow remains intact!
        assert_eq!(contract.get_escrow(syn_id.clone(), f2.clone()).as_near(), 20);

        let syn = contract.get_syndicate(syn_id.clone()).unwrap();
        assert_eq!(syn.total_escrow.as_near(), 20);
        assert_eq!(syn.status, SyndicateStatus::Active); // Not yet aborted because f2 still in escrow

        // f2 now hatches out
        let ctx = get_context(f2.clone(), NearToken::from_near(0), 165);
        testing_env!(ctx.build());
        let _ = contract.hatch_out(syn_id.clone());

        let syn_final = contract.get_syndicate(syn_id).unwrap();
        assert_eq!(syn_final.total_escrow.as_yoctonear(), 0);
        assert_eq!(syn_final.status, SyndicateStatus::AbortedRefunded);
    }

    #[test]
    #[should_panic(expected = "[Hatch-Out REJECT] Cannot refund already settled syndicate.")]
    fn test_hatch_out_after_settled_fails() {
        let owner: AccountId = "alice.near".parse().unwrap();
        let ctx = get_context(owner.clone(), NearToken::from_near(1), 100);
        testing_env!(ctx.build());

        let mut contract = FlyCoordinator::new();
        let (enclave_pk, _) = make_enclave_key_and_signature("fly-coordinator.testnet", "settled-swarm", 1, "", "");

        let syn_id = contract.hatch(
            "settled-swarm".to_string(),
            Some("FLASH".to_string()),
            Some(1),
            Some(50),
            enclave_pk,
            "hash".to_string(),
            Some(30),
            None,
        );

        let syn = contract.get_syndicate(syn_id.clone()).unwrap();
        let active_nonce = syn.round_nonce.clone();

        let f1: AccountId = "flyer1.near".parse().unwrap();
        let ctx = get_context(f1.clone(), NearToken::from_near(10), 105);
        testing_env!(ctx.build());
        contract.deposit(syn_id.clone());

        let (_, valid_sig) = make_enclave_key_and_signature(
            "fly-coordinator.testnet",
            &syn_id,
            1,
            &active_nonce,
            "order_hash",
        );

        let ctx = get_context(owner, NearToken::from_near(0), 110);
        testing_env!(ctx.build());
        contract.settle_batch(syn_id.clone(), active_nonce, "order_hash".to_string(), valid_sig, None);

        // Attempt hatch_out after settled at block 150
        let ctx = get_context(f1, NearToken::from_near(0), 150);
        testing_env!(ctx.build());
        let _ = contract.hatch_out(syn_id);
    }

    #[test]
    #[should_panic(expected = "[Hatch-Out REJECT] No escrow balance to refund for caller.")]
    fn test_double_hatch_out_fails() {
        let owner: AccountId = "alice.near".parse().unwrap();
        let ctx = get_context(owner, NearToken::from_near(1), 100);
        testing_env!(ctx.build());

        let mut contract = FlyCoordinator::new();
        let (enclave_pk, _) = make_enclave_key_and_signature("fly-coordinator.testnet", "double-swarm", 1, "", "");

        let syn_id = contract.hatch(
            "double-swarm".to_string(),
            Some("FLASH".to_string()),
            Some(1),
            Some(50),
            enclave_pk,
            "hash".to_string(),
            Some(30),
            None,
        );

        let f1: AccountId = "flyer1.near".parse().unwrap();
        let ctx = get_context(f1.clone(), NearToken::from_near(10), 105);
        testing_env!(ctx.build());
        contract.deposit(syn_id.clone());

        // First refund at block 150
        let ctx = get_context(f1.clone(), NearToken::from_near(0), 150);
        testing_env!(ctx.build());
        let _ = contract.hatch_out(syn_id.clone());

        // Second refund attempt by same caller
        let ctx = get_context(f1, NearToken::from_near(0), 155);
        testing_env!(ctx.build());
        let _ = contract.hatch_out(syn_id);
    }
}
