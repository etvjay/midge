use ed25519_dalek::{Signer, SigningKey};
use fly_coordinator::{FlyCoordinator, SyndicateStatus};
#[allow(deprecated)]
use near_sdk::test_utils::testing_env_with_promise_results;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::testing_env;
use near_sdk::{AccountId, NearToken, PromiseResult};

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
    let signing_key = SigningKey::from_bytes(&[77u8; 32]);
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
fn test_integration_full_syndicate_lifecycle_with_payout() {
    let coordinator_account: AccountId = "fly-coordinator.testnet".parse().unwrap();
    let owner: AccountId = "syndicate-creator.near".parse().unwrap();
    let payout_treasury: AccountId = "alpha-treasury.near".parse().unwrap();

    let ctx = get_context(owner.clone(), NearToken::from_near(1), 100);
    testing_env!(ctx.build());

    let mut contract = FlyCoordinator::new();
    let (enclave_pk, _) = generate_enclave_keypair_and_sig(
        coordinator_account.as_str(),
        "alpha-syndicate",
        1,
        "",
        payout_treasury.as_str(),
        "",
    );

    // 1. Hatch syndicate
    let syn_id = contract.hatch(
        "alpha-syndicate".to_string(),
        Some("FLASH".to_string()),
        Some(3), // Quorum threshold of 3 flyers
        Some(100),
        enclave_pk,
        "mrenclave_code_measurement_hash".to_string(),
        Some(40), // 40 blocks timeout
        Some(payout_treasury.clone()),
    );

    let syn = contract
        .get_syndicate(syn_id.clone())
        .expect("Syndicate must exist");
    assert_eq!(syn.payout_recipient, payout_treasury);
    assert_eq!(syn.quorum_threshold, 3);
    assert_eq!(syn.status, SyndicateStatus::Active);

    // 2. 3 Multi-Agent Flyers deposit into syndicate escrow
    let flyers: Vec<AccountId> = vec![
        "agent-01.near".parse().unwrap(),
        "agent-02.near".parse().unwrap(),
        "agent-03.near".parse().unwrap(),
    ];

    let deposits = [
        NearToken::from_near(10),
        NearToken::from_near(20),
        NearToken::from_near(30),
    ];
    for (i, flyer) in flyers.iter().enumerate() {
        let ctx = get_context(flyer.clone(), deposits[i], 110 + i as u64);
        testing_env!(ctx.build());
        contract.deposit(syn_id.clone());
        assert_eq!(
            contract.get_escrow(syn_id.clone(), flyer.clone()),
            deposits[i]
        );
    }

    let syn_funded = contract.get_syndicate(syn_id.clone()).unwrap();
    assert_eq!(syn_funded.total_escrow, NearToken::from_near(60));
    assert_eq!(syn_funded.active_flyer_count, 3);

    // 3. Deliberation in TEE produces aggregate order and signature
    let active_nonce = syn_funded.round_nonce.clone();
    let order_hash = "agg_twap_batch_root_hash_0x1234".to_string();
    let (_, enclave_sig) = generate_enclave_keypair_and_sig(
        coordinator_account.as_str(),
        &syn_id,
        1,
        &active_nonce,
        payout_treasury.as_str(),
        &order_hash,
    );

    // 4. Settle batch
    let ctx = get_context(owner, NearToken::from_near(0), 130);
    testing_env!(ctx.build());
    contract.settle_batch(syn_id.clone(), active_nonce, order_hash, enclave_sig);

    let syn_settled = contract.get_syndicate(syn_id.clone()).unwrap();
    assert_eq!(syn_settled.status, SyndicateStatus::Settled);
    assert_eq!(syn_settled.total_settled_payouts, NearToken::from_near(60));
    assert_eq!(syn_settled.total_escrow, NearToken::from_yoctonear(0));

    // 5. Invariant check: hatch_out must be blocked after settlement
    let ctx = get_context(flyers[0].clone(), NearToken::from_near(0), 160);
    testing_env!(ctx.build());
    let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let mut c = contract;
        let _ = c.hatch_out(syn_id);
    }));
    assert!(
        res.is_err(),
        "hatch_out must be strictly blocked after settlement"
    );
}

#[test]
fn test_integration_theft_frontrun_fails() {
    let coordinator_account: AccountId = "fly-coordinator.testnet".parse().unwrap();
    let owner: AccountId = "alice.near".parse().unwrap();
    let payout_treasury: AccountId = "legit-treasury.near".parse().unwrap();

    let ctx = get_context(owner.clone(), NearToken::from_near(1), 100);
    testing_env!(ctx.build());

    let mut contract = FlyCoordinator::new();
    let (enclave_pk, _) = generate_enclave_keypair_and_sig(
        coordinator_account.as_str(),
        "secure-pool",
        1,
        "",
        payout_treasury.as_str(),
        "",
    );

    let syn_id = contract.hatch(
        "secure-pool".to_string(),
        Some("FLASH".to_string()),
        Some(1),
        Some(100),
        enclave_pk,
        "mrenclave_code".to_string(),
        Some(50),
        Some(payout_treasury.clone()),
    );

    // Flyer deposits
    let flyer: AccountId = "flyer-bob.near".parse().unwrap();
    let ctx = get_context(flyer, NearToken::from_near(50), 105);
    testing_env!(ctx.build());
    contract.deposit(syn_id.clone());

    let syn = contract.get_syndicate(syn_id.clone()).unwrap();
    let active_nonce = syn.round_nonce.clone();
    let order_hash = "order_hash_abc".to_string();

    // Attacker tries to forge signature for attacker-payout.near
    let (_, attacker_sig) = generate_enclave_keypair_and_sig(
        coordinator_account.as_str(),
        &syn_id,
        1,
        &active_nonce,
        "attacker-payout.near",
        &order_hash,
    );

    let attacker: AccountId = "eve-attacker.near".parse().unwrap();
    let ctx = get_context(attacker, NearToken::from_near(0), 110);
    testing_env!(ctx.build());

    let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let mut c = contract;
        c.settle_batch(syn_id, active_nonce, order_hash, attacker_sig);
    }));
    assert!(
        res.is_err(),
        "Frontrun with altered payout recipient must fail"
    );
}

#[test]
fn test_integration_escape_hatch_and_storage_reclamation() {
    let coordinator_account: AccountId = "fly-coordinator.testnet".parse().unwrap();
    let owner: AccountId = "alice.near".parse().unwrap();

    let ctx = get_context(owner.clone(), NearToken::from_near(1), 100);
    testing_env!(ctx.build());

    let mut contract = FlyCoordinator::new();
    let (enclave_pk, _) = generate_enclave_keypair_and_sig(
        coordinator_account.as_str(),
        "stalled-swarm",
        1,
        "",
        "stalled-swarm-treasury.near",
        "",
    );

    let syn_id = contract.hatch(
        "stalled-swarm".to_string(),
        Some("FLASH".to_string()),
        Some(2),
        Some(100),
        enclave_pk,
        "mrenclave_code".to_string(),
        Some(20), // 20 blocks timeout
        None,
    );

    let f1: AccountId = "flyer1.near".parse().unwrap();
    let f2: AccountId = "flyer2.near".parse().unwrap();

    // Both deposit
    let ctx = get_context(f1.clone(), NearToken::from_near(15), 105);
    testing_env!(ctx.build());
    contract.deposit(syn_id.clone());

    let ctx = get_context(f2.clone(), NearToken::from_near(25), 106);
    testing_env!(ctx.build());
    contract.deposit(syn_id.clone());

    // Round stalls past timeout (block 130 > 100 + 20)
    // f1 calls hatch_out
    let ctx = get_context(f1.clone(), NearToken::from_near(0), 130);
    testing_env!(ctx.build());
    let _ = contract.hatch_out(syn_id.clone());

    // Verify storage cleanup: f1 escrow is removed and balance is 0
    assert_eq!(contract.get_escrow(syn_id.clone(), f1).as_yoctonear(), 0);
    // f2 escrow is still intact
    assert_eq!(
        contract.get_escrow(syn_id.clone(), f2.clone()).as_near(),
        25
    );

    let syn_mid = contract.get_syndicate(syn_id.clone()).unwrap();
    assert_eq!(syn_mid.active_flyer_count, 1);
    assert_eq!(syn_mid.status, SyndicateStatus::Active);

    // f2 calls hatch_out
    let ctx = get_context(f2.clone(), NearToken::from_near(0), 135);
    testing_env!(ctx.build());
    let _ = contract.hatch_out(syn_id.clone());

    assert_eq!(contract.get_escrow(syn_id.clone(), f2).as_yoctonear(), 0);
    let syn_final = contract.get_syndicate(syn_id).unwrap();
    assert_eq!(syn_final.active_flyer_count, 0);
    assert_eq!(syn_final.total_escrow.as_yoctonear(), 0);
    assert_eq!(syn_final.status, SyndicateStatus::AbortedRefunded);
}

#[test]
fn test_integration_repeat_deposit_and_exit_loop() {
    let coordinator_account: AccountId = "fly-coordinator.testnet".parse().unwrap();
    let owner: AccountId = "alice.near".parse().unwrap();

    let ctx = get_context(owner, NearToken::from_near(1), 100);
    testing_env!(ctx.build());

    let mut contract = FlyCoordinator::new();
    let (enclave_pk, _) = generate_enclave_keypair_and_sig(
        coordinator_account.as_str(),
        "loop-swarm",
        1,
        "",
        "loop-swarm-treasury.near",
        "",
    );

    let syn_id = contract.hatch(
        "loop-swarm".to_string(),
        Some("FLASH".to_string()),
        Some(1),
        Some(50),
        enclave_pk,
        "mrenclave_code".to_string(),
        Some(10), // 10 blocks timeout
        None,
    );

    let anchor: AccountId = "anchor-flyer.near".parse().unwrap();
    let looping_flyer: AccountId = "looping-flyer.near".parse().unwrap();

    // Anchor flyer deposits 5 NEAR so syndicate stays active during loop tests
    let ctx = get_context(anchor, NearToken::from_near(5), 101);
    testing_env!(ctx.build());
    contract.deposit(syn_id.clone());

    // Looping flyer executes 10 sequential deposit -> exit cycles
    for i in 0..10 {
        let dep_block = 110 + i * 20;
        let ctx = get_context(looping_flyer.clone(), NearToken::from_near(1), dep_block);
        testing_env!(ctx.build());
        contract.deposit(syn_id.clone());

        let syn = contract.get_syndicate(syn_id.clone()).unwrap();
        assert_eq!(syn.active_flyer_count, 2);

        let exit_block = dep_block + 12; // past 10-block timeout
        let ctx = get_context(looping_flyer.clone(), NearToken::from_near(0), exit_block);
        testing_env!(ctx.build());
        let _ = contract.hatch_out(syn_id.clone());

        let syn_after = contract.get_syndicate(syn_id.clone()).unwrap();
        assert_eq!(syn_after.active_flyer_count, 1);
    }

    // Now verify that 48 OTHER flyers can still deposit (proving the 50-flyer cap was not exhausted)
    for i in 0..48 {
        let other: AccountId = format!("other-agent-{}.near", i).parse().unwrap();
        let ctx = get_context(other, NearToken::from_near(1), 320 + i as u64);
        testing_env!(ctx.build());
        contract.deposit(syn_id.clone());
    }

    let syn_full = contract.get_syndicate(syn_id).unwrap();
    // 1 anchor + 48 others = 49 active flyers
    assert_eq!(syn_full.active_flyer_count, 49);
}

#[test]
#[allow(deprecated)]
fn test_integration_settlement_failure_callback_rollback() {
    let coordinator_account: AccountId = "fly-coordinator.testnet".parse().unwrap();
    let owner: AccountId = "syndicate-creator.near".parse().unwrap();
    let payout_treasury: AccountId = "alpha-treasury.near".parse().unwrap();

    let ctx = get_context(owner.clone(), NearToken::from_near(1), 100);
    testing_env!(ctx.build());

    let mut contract = FlyCoordinator::new();
    let (enclave_pk, _) = generate_enclave_keypair_and_sig(
        coordinator_account.as_str(),
        "rollback-swarm",
        1,
        "",
        payout_treasury.as_str(),
        "",
    );

    let syn_id = contract.hatch(
        "rollback-swarm".to_string(),
        Some("FLASH".to_string()),
        Some(2),
        Some(100),
        enclave_pk,
        "mrenclave_code_hash".to_string(),
        Some(30), // 30 blocks timeout
        Some(payout_treasury.clone()),
    );

    let f1: AccountId = "agent-01.near".parse().unwrap();
    let f2: AccountId = "agent-02.near".parse().unwrap();

    let ctx = get_context(f1.clone(), NearToken::from_near(15), 105);
    testing_env!(ctx.build());
    contract.deposit(syn_id.clone());

    let ctx = get_context(f2.clone(), NearToken::from_near(25), 106);
    testing_env!(ctx.build());
    contract.deposit(syn_id.clone());

    let syn = contract.get_syndicate(syn_id.clone()).unwrap();
    let active_nonce = syn.round_nonce.clone();
    let order_hash = "order_hash_to_fail".to_string();

    let (_, enclave_sig) = generate_enclave_keypair_and_sig(
        coordinator_account.as_str(),
        &syn_id,
        1,
        &active_nonce,
        payout_treasury.as_str(),
        &order_hash,
    );

    // Call settle_batch
    let ctx = get_context(owner, NearToken::from_near(0), 110);
    testing_env!(ctx.build());
    contract.settle_batch(syn_id.clone(), active_nonce, order_hash, enclave_sig);

    // Prior to callback, status is Settled and total_escrow is 0
    let syn_settling = contract.get_syndicate(syn_id.clone()).unwrap();
    assert_eq!(syn_settling.status, SyndicateStatus::Settled);
    assert_eq!(syn_settling.total_escrow.as_yoctonear(), 0);

    // Now simulation: the cross-contract payout Promise transfer FAILS!
    let self_account: AccountId = "fly-coordinator.testnet".parse().unwrap();
    let ctx = get_context(self_account, NearToken::from_near(0), 115);
    testing_env_with_promise_results(ctx.build(), PromiseResult::Failed);

    let rollback_ok = contract.on_settlement_payout(syn_id.clone(), NearToken::from_near(40));
    assert!(!rollback_ok);

    // Invariant verification: Syndicate is reverted to Active, funds restored
    let syn_reverted = contract.get_syndicate(syn_id.clone()).unwrap();
    assert_eq!(syn_reverted.status, SyndicateStatus::Active);
    assert_eq!(syn_reverted.total_escrow.as_near(), 40);
    assert_eq!(syn_reverted.total_settled_payouts.as_yoctonear(), 0);

    // Flyers retain full individual escrow balances
    assert_eq!(
        contract.get_escrow(syn_id.clone(), f1.clone()).as_near(),
        15
    );
    assert_eq!(
        contract.get_escrow(syn_id.clone(), f2.clone()).as_near(),
        25
    );

    // After timeout (block 140 > 100 + 30), both flyers can successfully escape hatch out
    let ctx = get_context(f1.clone(), NearToken::from_near(0), 140);
    testing_env!(ctx.build());
    let _ = contract.hatch_out(syn_id.clone());

    let ctx = get_context(f2.clone(), NearToken::from_near(0), 141);
    testing_env!(ctx.build());
    let _ = contract.hatch_out(syn_id.clone());

    let syn_final = contract.get_syndicate(syn_id).unwrap();
    assert_eq!(syn_final.total_escrow.as_yoctonear(), 0);
    assert_eq!(syn_final.status, SyndicateStatus::AbortedRefunded);
}

#[test]
#[allow(deprecated)]
fn test_integration_hatch_out_failure_callback_rollback() {
    let coordinator_account: AccountId = "fly-coordinator.testnet".parse().unwrap();
    let owner: AccountId = "alice.near".parse().unwrap();

    let ctx = get_context(owner, NearToken::from_near(1), 100);
    testing_env!(ctx.build());

    let mut contract = FlyCoordinator::new();
    let (enclave_pk, _) = generate_enclave_keypair_and_sig(
        coordinator_account.as_str(),
        "hatchout-rollback",
        1,
        "",
        "hatchout-rollback-treasury.near",
        "",
    );

    let syn_id = contract.hatch(
        "hatchout-rollback".to_string(),
        Some("FLASH".to_string()),
        Some(1),
        Some(50),
        enclave_pk,
        "mrenclave_code".to_string(),
        Some(20),
        None,
    );

    let f1: AccountId = "flyer1.near".parse().unwrap();
    let ctx = get_context(f1.clone(), NearToken::from_near(30), 105);
    testing_env!(ctx.build());
    contract.deposit(syn_id.clone());

    // Flyer executes hatch_out at block 125
    let ctx = get_context(f1.clone(), NearToken::from_near(0), 125);
    testing_env!(ctx.build());
    let _ = contract.hatch_out(syn_id.clone());

    assert_eq!(
        contract
            .get_escrow(syn_id.clone(), f1.clone())
            .as_yoctonear(),
        0
    );
    let syn_after_exit = contract.get_syndicate(syn_id.clone()).unwrap();
    assert_eq!(syn_after_exit.status, SyndicateStatus::AbortedRefunded);

    // Transfer promise fails
    let self_account: AccountId = "fly-coordinator.testnet".parse().unwrap();
    let ctx = get_context(self_account, NearToken::from_near(0), 126);
    testing_env_with_promise_results(ctx.build(), PromiseResult::Failed);

    let ok = contract.on_hatch_out_payout(syn_id.clone(), f1.clone(), NearToken::from_near(30));
    assert!(!ok);

    // Balance restored in full, status back to Active
    assert_eq!(contract.get_escrow(syn_id.clone(), f1).as_near(), 30);
    let syn_restored = contract.get_syndicate(syn_id).unwrap();
    assert_eq!(syn_restored.total_escrow.as_near(), 30);
    assert_eq!(syn_restored.active_flyer_count, 1);
    assert_eq!(syn_restored.status, SyndicateStatus::Active);
}
