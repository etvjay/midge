#![allow(deprecated)]

use ed25519_dalek::{Signer, SigningKey};
use fly_coordinator::{FlyCoordinator, SyndicateStatus};
#[allow(deprecated)]
use near_sdk::test_utils::testing_env_with_promise_results;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::testing_env;
use near_sdk::{AccountId, NearToken, PromiseResult};
use proptest::prelude::*;

fn get_context(
    predecessor: AccountId,
    attached_deposit: NearToken,
    block_height: u64,
) -> VMContextBuilder {
    let mut builder = VMContextBuilder::new();
    builder
        .current_account_id("fly-coordinator.testnet".parse().unwrap())
        .signer_account_id(predecessor.clone())
        .predecessor_account_id(predecessor)
        .attached_deposit(attached_deposit)
        .block_height(block_height);
    builder
}

fn generate_enclave_keypair_and_sig(
    contract_id: &str,
    syndicate_id: &str,
    epoch: u64,
    nonce: &str,
    payout_recipient: &str,
    order_hash: &str,
) -> (String, String) {
    let signing_key = SigningKey::from_bytes(&[88u8; 32]);
    let verifying_key = signing_key.verifying_key();
    let message = format!(
        "{}:{}:{}:{}:{}:{}",
        contract_id, syndicate_id, epoch, nonce, payout_recipient, order_hash
    );
    let signature = signing_key.sign(message.as_bytes());
    (
        hex::encode(verifying_key.to_bytes()),
        hex::encode(signature.to_bytes()),
    )
}

#[test]
fn test_overshoot_cap_50_limit_enforced_on_callback() {
    let coordinator_account: AccountId = "fly-coordinator.testnet".parse().unwrap();
    let creator: AccountId = "creator.near".parse().unwrap();
    let payout: AccountId = "treasury.near".parse().unwrap();

    let ctx = get_context(creator.clone(), NearToken::from_near(1), 100);
    testing_env!(ctx.build());

    let mut contract = FlyCoordinator::new();
    let (enclave_pk, _) = generate_enclave_keypair_and_sig(
        coordinator_account.as_str(),
        "syn-cap-test",
        1,
        "",
        payout.as_str(),
        "",
    );

    let syn_id = contract.hatch(
        "syn-cap-test".to_string(),
        Some("FLASH".to_string()),
        Some(1),
        Some(100),
        enclave_pk,
        "mrenclave_code".to_string(),
        Some(10),
        Some(payout),
    );

    // 1. Fill syndicate with 50 distinct flyers
    for i in 0..50 {
        let flyer: AccountId = format!("flyer-{:02}.near", i).parse().unwrap();
        let ctx = get_context(flyer, NearToken::from_near(1), 101);
        testing_env!(ctx.build());
        contract.deposit(syn_id.clone());
    }

    let syn = contract.get_syndicate(syn_id.clone()).unwrap();
    assert_eq!(syn.active_flyer_count, 50);

    // 2. Flyer 0 exits via hatch_out
    let flyer0: AccountId = "flyer-00.near".parse().unwrap();
    let ctx = get_context(flyer0.clone(), NearToken::from_near(0), 120);
    testing_env!(ctx.build());
    let _ = contract.hatch_out(syn_id.clone());

    let syn_after_exit = contract.get_syndicate(syn_id.clone()).unwrap();
    assert_eq!(syn_after_exit.active_flyer_count, 49);

    // 3. Simulated failure of hatch_out refund transfer
    let self_account: AccountId = "fly-coordinator.testnet".parse().unwrap();
    let ctx = get_context(self_account, NearToken::from_near(0), 121);
    testing_env_with_promise_results(ctx.build(), PromiseResult::Failed);

    let ok = contract.on_hatch_out_payout(syn_id.clone(), flyer0.clone(), NearToken::from_near(1));
    assert!(!ok);

    let syn_restored = contract.get_syndicate(syn_id.clone()).unwrap();
    assert_eq!(syn_restored.active_flyer_count, 50);

    // 4. Invariant: Try another simulated failure with a dummy 51st flyer - must not exceed 50
    let flyer51: AccountId = "flyer-51.near".parse().unwrap();
    let self_account: AccountId = "fly-coordinator.testnet".parse().unwrap();
    let ctx = get_context(self_account, NearToken::from_near(0), 122);
    testing_env_with_promise_results(ctx.build(), PromiseResult::Failed);

    let _ = contract.on_hatch_out_payout(syn_id.clone(), flyer51, NearToken::from_near(1));
    let syn_capped = contract.get_syndicate(syn_id).unwrap();
    assert!(
        syn_capped.active_flyer_count <= 50,
        "Active flyer count must never exceed 50!"
    );
}

#[derive(Debug, Clone)]
enum Action {
    Deposit {
        flyer_idx: usize,
        amount_yocto: u128,
    },
    HatchOut {
        flyer_idx: usize,
    },
    CallbackFailedHatchOut {
        flyer_idx: usize,
        amount_yocto: u128,
    },
}

// Proptest invariant strategy: generate random action sequences across up to 10 flyers
prop_compose! {
    fn arb_action()(
        act_type in 0..3,
        flyer_idx in 0..10usize,
        amount_milli in 10..100u64,
    ) -> Action {
        let amount_yocto = (amount_milli as u128) * 1_000_000_000_000_000_000_000; // 0.01 - 0.10 NEAR
        match act_type {
            0 => Action::Deposit { flyer_idx, amount_yocto },
            1 => Action::HatchOut { flyer_idx },
            _ => Action::CallbackFailedHatchOut { flyer_idx, amount_yocto },
        }
    }
}

use std::sync::atomic::{AtomicU64, Ordering};
static RUN_COUNTER: AtomicU64 = AtomicU64::new(1);

proptest! {
    #![proptest_config(ProptestConfig::with_cases(
        std::env::var("PROPTEST_CASES")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(30)
    ))]

    #[test]
    fn prop_syndicate_escrow_and_flyer_invariants(actions in prop::collection::vec(arb_action(), 1..25)) {
        let run_id = RUN_COUNTER.fetch_add(1, Ordering::SeqCst);
        let syn_name = format!("prop-syn-{}", run_id);
        let coordinator_account: AccountId = "fly-coordinator.testnet".parse().unwrap();
        let creator: AccountId = "creator.near".parse().unwrap();
        let payout: AccountId = "treasury.near".parse().unwrap();

        let ctx = get_context(creator.clone(), NearToken::from_near(1), 100);
        testing_env!(ctx.build());

        let mut contract = FlyCoordinator::new();
        let (enclave_pk, _) = generate_enclave_keypair_and_sig(
            coordinator_account.as_str(),
            &syn_name,
            1,
            "",
            payout.as_str(),
            "",
        );

        let syn_id = contract.hatch(
            syn_name,
            Some("FLASH".to_string()),
            Some(1),
            Some(50), // max 50 NEAR per flyer
            enclave_pk,
            "mrenclave_code".to_string(),
            Some(10), // 10 block timeout
            Some(payout),
        );

        let mut block_height = 101u64;
        let flyers: Vec<AccountId> = (0..10).map(|i| format!("user-{:02}.near", i).parse().unwrap()).collect();

        for action in actions {
            block_height += 1;
            match action {
                Action::Deposit { flyer_idx, amount_yocto } => {
                    let flyer = &flyers[flyer_idx % flyers.len()];
                    let deposit_token = NearToken::from_yoctonear(amount_yocto);

                    // Check if deposit would exceed limit before running
                    let current_escrow = contract.get_escrow(syn_id.clone(), flyer.clone());
                    let syn = contract.get_syndicate(syn_id.clone()).unwrap();
                    let would_exceed_spend = current_escrow.saturating_add(deposit_token).as_yoctonear() > syn.max_spend_per_flyer.as_yoctonear();
                    let would_exceed_cap = current_escrow.as_yoctonear() == 0 && syn.active_flyer_count >= 50;

                    if syn.status == SyndicateStatus::Active && !would_exceed_spend && !would_exceed_cap {
                        let ctx = get_context(flyer.clone(), deposit_token, block_height);
                        testing_env!(ctx.build());
                        contract.deposit(syn_id.clone());
                    }
                }
                Action::HatchOut { flyer_idx } => {
                    let flyer = &flyers[flyer_idx % flyers.len()];
                    let current_escrow = contract.get_escrow(syn_id.clone(), flyer.clone());
                    let syn = contract.get_syndicate(syn_id.clone()).unwrap();

                    // Can only hatch out if deliberation window passed, status is not settled, and balance > 0
                    if syn.status != SyndicateStatus::Settled && current_escrow.as_yoctonear() > 0 {
                        let exit_block = syn.epoch_start_block + syn.timeout_blocks + 1;
                        if block_height < exit_block {
                            block_height = exit_block;
                        }
                        let ctx = get_context(flyer.clone(), NearToken::from_yoctonear(0), block_height);
                        testing_env!(ctx.build());
                        let _ = contract.hatch_out(syn_id.clone());

                        // Invariant: after hatch_out, user balance in contract is 0 (removed from LookupMap)
                        let post_escrow = contract.get_escrow(syn_id.clone(), flyer.clone());
                        prop_assert_eq!(post_escrow.as_yoctonear(), 0, "Escrow entry must be cleared after hatch_out");
                    }
                }
                Action::CallbackFailedHatchOut { flyer_idx, amount_yocto } => {
                    let flyer = &flyers[flyer_idx % flyers.len()];
                    let syn = contract.get_syndicate(syn_id.clone()).unwrap();
                    if syn.status != SyndicateStatus::Settled {
                        let self_account: AccountId = "fly-coordinator.testnet".parse().unwrap();
                        let ctx = get_context(self_account, NearToken::from_near(0), block_height);
                        testing_env_with_promise_results(ctx.build(), PromiseResult::Failed);
                        let _ = contract.on_hatch_out_payout(syn_id.clone(), flyer.clone(), NearToken::from_yoctonear(amount_yocto));
                    }
                }
            }

            // CORE INVARIANTS CHECK AFTER EVERY ACTION:
            let syn = contract.get_syndicate(syn_id.clone()).unwrap();

            // 1. Sum of all flyer escrows == syn.total_escrow
            let mut sum_escrows: u128 = 0;
            let mut non_zero_count = 0u32;
            for flyer in &flyers {
                let bal = contract.get_escrow(syn_id.clone(), flyer.clone()).as_yoctonear();
                if bal > 0 {
                    non_zero_count += 1;
                    sum_escrows = sum_escrows.saturating_add(bal);
                }
            }
            prop_assert_eq!(
                syn.total_escrow.as_yoctonear(),
                sum_escrows,
                "Invariant violation: syn.total_escrow ({}) does not equal sum of individual escrows ({})",
                syn.total_escrow.as_yoctonear(),
                sum_escrows
            );

            // 2. Active flyer count <= 50 and matches non-zero entries
            prop_assert!(
                syn.active_flyer_count <= 50,
                "Invariant violation: active_flyer_count ({}) exceeds 50 cap",
                syn.active_flyer_count
            );
            prop_assert_eq!(
                syn.active_flyer_count,
                non_zero_count,
                "Invariant violation: active_flyer_count ({}) does not match non-zero escrows ({})",
                syn.active_flyer_count,
                non_zero_count
            );
        }
    }
}
