use near_sdk::{env, near, AccountId, NearToken, PanicOnDefault, Promise};
use std::collections::HashMap;

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
    pub syndicate_type: SyndicateType,
    pub sub_account: AccountId,
    pub quorum_threshold: u32,
    pub max_spend_per_flyer: NearToken,
    pub expected_code_hash: String,
    pub timeout_blocks: u64,
    pub created_at_block: u64,
    pub status: SyndicateStatus,
    pub epoch: u64,
    pub round_nonce: String,
    pub escrow: HashMap<AccountId, NearToken>,
    pub total_escrow: NearToken,
    pub settled_batches: Vec<String>,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct FlyCoordinator {
    pub syndicates: HashMap<String, SyndicateRecord>,
}

#[near]
impl FlyCoordinator {
    #[init]
    pub fn new() -> Self {
        Self {
            syndicates: HashMap::new(),
        }
    }

    /// hatch(): Instantiates a new confidential syndicate instance on NEAR L1.
    pub fn hatch(
        &mut self,
        syndicate_id: String,
        syndicate_type: Option<String>,
        quorum_threshold: Option<u32>,
        max_spend_near: Option<u128>,
        expected_code_hash: String,
        timeout_blocks: Option<u64>,
    ) -> String {
        assert!(
            !self.syndicates.contains_key(&syndicate_id),
            "Syndicate already hatched."
        );

        let syn_type = match syndicate_type.as_deref() {
            Some("DARK_VAULT") => SyndicateType::DarkVault,
            _ => SyndicateType::Flash,
        };

        let sub_account: AccountId = format!("{}.fly.testnet", syndicate_id)
            .parse()
            .unwrap_or_else(|_| env::panic_str("Invalid sub-account format"));

        let created_at_block = env::block_height();
        let timeout = timeout_blocks.unwrap_or(50);
        let quorum = quorum_threshold.unwrap_or(3);
        let max_spend = NearToken::from_near(max_spend_near.unwrap_or(100));

        let seed = format!("{}:{}", syndicate_id, created_at_block);
        let round_nonce = near_sdk::env::sha256(seed.as_bytes())
            .iter()
            .map(|b| format!("{:02x}", b))
            .collect::<String>();

        let record = SyndicateRecord {
            id: syndicate_id.clone(),
            syndicate_type: syn_type,
            sub_account,
            quorum_threshold: quorum,
            max_spend_per_flyer: max_spend,
            expected_code_hash,
            timeout_blocks: timeout,
            created_at_block,
            status: SyndicateStatus::Active,
            epoch: 1,
            round_nonce,
            escrow: HashMap::new(),
            total_escrow: NearToken::from_yoctonear(0),
            settled_batches: Vec::new(),
        };

        self.syndicates.insert(syndicate_id.clone(), record);
        syndicate_id
    }

    /// deposit(): Locks funds into syndicate escrow enforcing OutLayer spending caps.
    #[payable]
    pub fn deposit(&mut self, syndicate_id: String) {
        let deposit_amount = env::attached_deposit();
        let flyer_id = env::predecessor_account_id();

        let syn = self
            .syndicates
            .get_mut(&syndicate_id)
            .unwrap_or_else(|| env::panic_str("Syndicate not found"));

        assert_eq!(
            syn.status,
            SyndicateStatus::Active,
            "Syndicate is not in Active status"
        );

        let current_balance = syn
            .escrow
            .get(&flyer_id)
            .cloned()
            .unwrap_or_else(|| NearToken::from_yoctonear(0));

        let new_balance = current_balance.saturating_add(deposit_amount);

        assert!(
            new_balance.as_yoctonear() <= syn.max_spend_per_flyer.as_yoctonear(),
            "[OutLayer Policy Rejection] Deposit exceeds Flyer limit."
        );

        syn.escrow.insert(flyer_id, new_balance);
        syn.total_escrow = syn.total_escrow.saturating_add(deposit_amount);
    }

    /// settle_batch(): Verifies HAQ attestation (code hash + nonce + quorum) and clears batch.
    pub fn settle_batch(
        &mut self,
        syndicate_id: String,
        attestation_nonce: String,
        enclave_code_hash: String,
        aggregate_order_hash: String,
    ) {
        let syn = self
            .syndicates
            .get_mut(&syndicate_id)
            .unwrap_or_else(|| env::panic_str("Syndicate not found"));

        assert_eq!(
            syn.status,
            SyndicateStatus::Active,
            "Syndicate is not active"
        );

        assert_eq!(
            enclave_code_hash, syn.expected_code_hash,
            "[HAQ REJECT] MRENCLAVE code hash mismatch!"
        );

        assert_eq!(
            attestation_nonce, syn.round_nonce,
            "[HAQ REJECT] Nonce mismatch. Replay attack blocked."
        );

        let active_count = syn
            .escrow
            .iter()
            .filter(|(_, &amount)| amount.as_yoctonear() > 0)
            .count() as u32;

        assert!(
            active_count >= syn.quorum_threshold,
            "[QUORUM REJECT] Active flyer count below threshold."
        );

        syn.settled_batches.push(aggregate_order_hash.clone());

        match syn.syndicate_type {
            SyndicateType::Flash => {
                syn.status = SyndicateStatus::Settled;
            }
            SyndicateType::DarkVault => {
                syn.epoch += 1;
                let next_seed = format!("{}:{}:{}", syn.id, syn.epoch, env::block_height());
                syn.round_nonce = near_sdk::env::sha256(next_seed.as_bytes())
                    .iter()
                    .map(|b| format!("{:02x}", b))
                    .collect::<String>();
            }
        }
    }

    /// hatch_out(): Non-custodial escape hatch.
    /// Unlocks 100% refund of caller's escrow if block timeout has expired.
    pub fn hatch_out(&mut self, syndicate_id: String) -> Promise {
        let caller = env::predecessor_account_id();
        let current_block = env::block_height();

        let syn = self
            .syndicates
            .get_mut(&syndicate_id)
            .unwrap_or_else(|| env::panic_str("Syndicate not found"));

        let blocks_passed = current_block.saturating_sub(syn.created_at_block);
        if blocks_passed < syn.timeout_blocks && syn.status == SyndicateStatus::Active {
            env::panic_str("[Hatch-Out LOCKED] Deliberation window still active.");
        }

        let flyer_balance = syn
            .escrow
            .get(&caller)
            .cloned()
            .unwrap_or_else(|| NearToken::from_yoctonear(0));

        assert!(
            flyer_balance.as_yoctonear() > 0,
            "No escrow balance to refund."
        );

        syn.escrow.insert(caller.clone(), NearToken::from_yoctonear(0));
        syn.total_escrow = syn.total_escrow.saturating_sub(flyer_balance);
        syn.status = SyndicateStatus::AbortedRefunded;

        Promise::new(caller).transfer(flyer_balance)
    }

    pub fn get_syndicate(&self, syndicate_id: String) -> Option<SyndicateRecord> {
        self.syndicates.get(&syndicate_id).cloned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    fn get_context(predecessor: AccountId, attached_deposit: NearToken, block_height: u64) -> VMContextBuilder {
        let mut builder = VMContextBuilder::new();
        builder
            .predecessor_account_id(predecessor)
            .attached_deposit(attached_deposit)
            .block_height(block_height);
        builder
    }

    #[test]
    fn test_hatch_and_haq_settle() {
        let owner: AccountId = "alice.near".parse().unwrap();
        let ctx = get_context(owner.clone(), NearToken::from_near(0), 100);
        testing_env!(ctx.build());

        let mut contract = FlyCoordinator::new();
        let expected_hash = "mrenclave_sha256_mock_hash".to_string();

        let syn_id = contract.hatch(
            "swarm-test-01".to_string(),
            Some("FLASH".to_string()),
            Some(2),
            Some(50),
            expected_hash.clone(),
            Some(30),
        );

        let syn = contract.get_syndicate(syn_id.clone()).unwrap();
        let active_nonce = syn.round_nonce.clone();

        let f1: AccountId = "flyer1.near".parse().unwrap();
        let ctx = get_context(f1, NearToken::from_near(10), 105);
        testing_env!(ctx.build());
        contract.deposit(syn_id.clone());

        let f2: AccountId = "flyer2.near".parse().unwrap();
        let ctx = get_context(f2, NearToken::from_near(15), 106);
        testing_env!(ctx.build());
        contract.deposit(syn_id.clone());

        let ctx = get_context(owner, NearToken::from_near(0), 110);
        testing_env!(ctx.build());
        contract.settle_batch(
            syn_id.clone(),
            active_nonce,
            expected_hash,
            "order_hash_twap_usdc_near".to_string(),
        );

        let syn_after = contract.get_syndicate(syn_id).unwrap();
        assert_eq!(syn_after.status, SyndicateStatus::Settled);
    }

    #[test]
    #[should_panic(expected = "[Hatch-Out LOCKED] Deliberation window still active.")]
    fn test_premature_hatch_out_fails() {
        let owner: AccountId = "alice.near".parse().unwrap();
        let ctx = get_context(owner, NearToken::from_near(0), 100);
        testing_env!(ctx.build());

        let mut contract = FlyCoordinator::new();
        let syn_id = contract.hatch(
            "timelock-swarm".to_string(),
            Some("FLASH".to_string()),
            Some(1),
            Some(50),
            "valid_hash".to_string(),
            Some(50),
        );

        let f1: AccountId = "flyer1.near".parse().unwrap();
        let ctx = get_context(f1.clone(), NearToken::from_near(10), 105);
        testing_env!(ctx.build());
        contract.deposit(syn_id.clone());

        let ctx = get_context(f1, NearToken::from_near(0), 120);
        testing_env!(ctx.build());
        let _ = contract.hatch_out(syn_id);
    }
}
