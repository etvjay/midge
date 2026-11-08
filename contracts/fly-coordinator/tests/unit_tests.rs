#![allow(deprecated)]

use ed25519_dalek::{Signer, SigningKey};
use fly_coordinator::{
    compute_allocations_hash, compute_charges_hash, Allocation, Charge, FlyCoordinator, GroupPhase,
    ReleasePolicy, SyndicateStatus,
};
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

// Helper: generate real Ed25519 keypair and valid domain-separated signature
fn make_enclave_key_and_signature(
    contract_id: &str,
    syndicate_id: &str,
    epoch: u64,
    nonce: &str,
    allocations_hash: &str,
    order_hash: &str,
) -> (String, String) {
    let signing_key = SigningKey::from_bytes(&[42u8; 32]);
    let verifying_key = signing_key.verifying_key();
    let message = format!(
        "{}:{}:{}:{}:{}:{}",
        contract_id, syndicate_id, epoch, nonce, allocations_hash, order_hash
    );
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
    let (enclave_pk, _) =
        make_enclave_key_and_signature("fly-coordinator.testnet", "swarm-01", 1, "", "", "");

    let syn_id = contract.hatch(
        "swarm-01".to_string(),
        Some("FLASH".to_string()),
        Some(2),
        Some(50),
        enclave_pk.clone(),
        "mrenclave_code_hash".to_string(),
        Some(30),
        Some("payout-recipient.near".parse().unwrap()),
        None,
    );

    let syn = contract.get_syndicate(syn_id.clone()).unwrap();
    assert_eq!(syn.sub_account.as_str(), "swarm-01.fly-coordinator.testnet");
    assert_eq!(syn.owner, owner);
    assert_eq!(syn.payout_recipient.as_str(), "payout-recipient.near");
    let active_nonce = syn.round_nonce.clone();
    let p_hash = contract.get_policy_hash(syn_id.clone());

    // Flyer 1 deposits
    let f1: AccountId = "flyer1.near".parse().unwrap();
    let ctx = get_context(f1.clone(), NearToken::from_near(10), 105);
    testing_env!(ctx.build());
    contract.deposit(syn_id.clone(), p_hash.clone());

    assert_eq!(contract.get_escrow(syn_id.clone(), f1).as_near(), 10);

    // Flyer 2 deposits
    let f2: AccountId = "flyer2.near".parse().unwrap();
    let ctx = get_context(f2.clone(), NearToken::from_near(15), 106);
    testing_env!(ctx.build());
    contract.deposit(syn_id.clone(), p_hash);

    assert_eq!(contract.get_escrow(syn_id.clone(), f2).as_near(), 15);

    // Generate genuine Ed25519 signature over (contract, id, epoch, nonce, allocations_hash, order_hash)
    let order_hash = "order_twap_batch_01".to_string();
    let allocations = vec![Allocation {
        recipient: "payout-recipient.near".parse().unwrap(),
        amount: NearToken::from_near(25),
    }];
    let alloc_hash = compute_allocations_hash(&allocations);
    let (_, valid_sig) = make_enclave_key_and_signature(
        "fly-coordinator.testnet",
        &syn_id,
        1,
        &active_nonce,
        &alloc_hash,
        &order_hash,
    );

    // Settle batch with genuine signature
    let ctx = get_context(owner, NearToken::from_near(0), 110);
    testing_env!(ctx.build());
    contract.settle_batch(
        syn_id.clone(),
        active_nonce,
        order_hash,
        allocations,
        valid_sig,
    );

    let syn_after = contract.get_syndicate(syn_id).unwrap();
    assert_eq!(syn_after.status, SyndicateStatus::Settled);
    assert_eq!(syn_after.total_settled_payouts, NearToken::from_near(25));
    assert_eq!(syn_after.total_escrow, NearToken::from_yoctonear(0));
}

#[test]
#[should_panic(
    expected = "[HAQ REJECT] Invalid enclave Ed25519 signature over deliberation batch!"
)]
fn test_bad_signature_fails() {
    let owner: AccountId = "alice.near".parse().unwrap();
    let ctx = get_context(owner.clone(), NearToken::from_near(1), 100);
    testing_env!(ctx.build());

    let mut contract = FlyCoordinator::new();
    let (enclave_pk, _) =
        make_enclave_key_and_signature("fly-coordinator.testnet", "bad-sig-swarm", 1, "", "", "");

    let syn_id = contract.hatch(
        "bad-sig-swarm".to_string(),
        Some("FLASH".to_string()),
        Some(1),
        Some(50),
        enclave_pk,
        "hash".to_string(),
        Some(30),
        None,
        None,
    );

    let syn = contract.get_syndicate(syn_id.clone()).unwrap();
    let active_nonce = syn.round_nonce.clone();
    let p_hash = contract.get_policy_hash(syn_id.clone());

    let f1: AccountId = "flyer1.near".parse().unwrap();
    let ctx = get_context(f1, NearToken::from_near(10), 105);
    testing_env!(ctx.build());
    contract.deposit(syn_id.clone(), p_hash);

    // Fake 64-byte signature
    let fake_sig = hex::encode([99u8; 64]);
    let allocations = vec![Allocation {
        recipient: syn.payout_recipient.clone(),
        amount: NearToken::from_near(10),
    }];
    let ctx = get_context(owner, NearToken::from_near(0), 110);
    testing_env!(ctx.build());
    contract.settle_batch(
        syn_id,
        active_nonce,
        "order_hash".to_string(),
        allocations,
        fake_sig,
    );
}

#[test]
#[should_panic(
    expected = "[HAQ REJECT] Invalid enclave Ed25519 signature over deliberation batch!"
)]
fn test_signature_cross_contract_replay_fails() {
    let owner: AccountId = "alice.near".parse().unwrap();
    let ctx = get_context(owner.clone(), NearToken::from_near(1), 100);
    testing_env!(ctx.build());

    let mut contract = FlyCoordinator::new();
    let (enclave_pk, _) =
        make_enclave_key_and_signature("fly-coordinator.testnet", "cross-swarm", 1, "", "", "");

    let syn_id = contract.hatch(
        "cross-swarm".to_string(),
        Some("FLASH".to_string()),
        Some(1),
        Some(50),
        enclave_pk,
        "hash".to_string(),
        Some(30),
        None,
        None,
    );

    let syn = contract.get_syndicate(syn_id.clone()).unwrap();
    let active_nonce = syn.round_nonce.clone();
    let p_hash = contract.get_policy_hash(syn_id.clone());

    let f1: AccountId = "flyer1.near".parse().unwrap();
    let ctx = get_context(f1, NearToken::from_near(10), 105);
    testing_env!(ctx.build());
    contract.deposit(syn_id.clone(), p_hash);

    let allocations = vec![Allocation {
        recipient: syn.payout_recipient.clone(),
        amount: NearToken::from_near(10),
    }];
    let alloc_hash = compute_allocations_hash(&allocations);

    // Signature created for another contract account: "different-coordinator.near"
    let (_, diff_contract_sig) = make_enclave_key_and_signature(
        "different-coordinator.near",
        &syn_id,
        1,
        &active_nonce,
        &alloc_hash,
        "order_hash",
    );

    let ctx = get_context(owner, NearToken::from_near(0), 110);
    testing_env!(ctx.build());
    contract.settle_batch(
        syn_id,
        active_nonce,
        "order_hash".to_string(),
        allocations,
        diff_contract_sig,
    );
}

#[test]
#[should_panic(
    expected = "[Settle REJECT] Recipient attacker-wallet.near is not in allowed_recipients whitelist."
)]
fn test_settle_batch_rejects_altered_payout_recipient() {
    let owner: AccountId = "alice.near".parse().unwrap();
    let ctx = get_context(owner.clone(), NearToken::from_near(1), 100);
    testing_env!(ctx.build());

    let mut contract = FlyCoordinator::new();
    let (enclave_pk, _) = make_enclave_key_and_signature(
        "fly-coordinator.testnet",
        "payout-theft-test",
        1,
        "",
        "",
        "",
    );

    let syn_id = contract.hatch(
        "payout-theft-test".to_string(),
        Some("FLASH".to_string()),
        Some(1),
        Some(50),
        enclave_pk,
        "hash".to_string(),
        Some(30),
        Some("legit-treasury.near".parse().unwrap()),
        None,
    );

    let syn = contract.get_syndicate(syn_id.clone()).unwrap();
    let active_nonce = syn.round_nonce.clone();
    let p_hash = contract.get_policy_hash(syn_id.clone());

    let f1: AccountId = "flyer1.near".parse().unwrap();
    let ctx = get_context(f1, NearToken::from_near(10), 105);
    testing_env!(ctx.build());
    contract.deposit(syn_id.clone(), p_hash);

    let bad_allocations = vec![Allocation {
        recipient: "attacker-wallet.near".parse().unwrap(),
        amount: NearToken::from_near(10),
    }];
    let bad_alloc_hash = compute_allocations_hash(&bad_allocations);

    let (_, attacker_sig) = make_enclave_key_and_signature(
        "fly-coordinator.testnet",
        &syn_id,
        1,
        &active_nonce,
        &bad_alloc_hash,
        "order_hash",
    );

    let ctx = get_context(owner, NearToken::from_near(0), 110);
    testing_env!(ctx.build());
    contract.settle_batch(
        syn_id,
        active_nonce,
        "order_hash".to_string(),
        bad_allocations,
        attacker_sig,
    );
}

#[test]
#[should_panic(expected = "[Deposit REJECT] Minimum deposit of 0.01 NEAR required.")]
fn test_below_min_deposit_fails() {
    let owner: AccountId = "alice.near".parse().unwrap();
    let ctx = get_context(owner, NearToken::from_near(1), 100);
    testing_env!(ctx.build());

    let mut contract = FlyCoordinator::new();
    let (enclave_pk, _) =
        make_enclave_key_and_signature("fly-coordinator.testnet", "min-dep-swarm", 1, "", "", "");
    let syn_id = contract.hatch(
        "min-dep-swarm".to_string(),
        None,
        Some(1),
        Some(50),
        enclave_pk,
        "hash".to_string(),
        Some(30),
        None,
        None,
    );
    let p_hash = contract.get_policy_hash(syn_id.clone());

    // Deposit 1 yoctoNEAR (below 0.01 NEAR minimum)
    let f1: AccountId = "flyer1.near".parse().unwrap();
    let ctx = get_context(f1, NearToken::from_yoctonear(1), 105);
    testing_env!(ctx.build());
    contract.deposit(syn_id, p_hash);
}

#[test]
#[should_panic(expected = "[Deposit REJECT] Maximum 50 flyers reached for this syndicate.")]
fn test_max_flyers_cap_enforced() {
    let owner: AccountId = "alice.near".parse().unwrap();
    let ctx = get_context(owner, NearToken::from_near(1), 100);
    testing_env!(ctx.build());

    let mut contract = FlyCoordinator::new();
    let (enclave_pk, _) =
        make_enclave_key_and_signature("fly-coordinator.testnet", "cap-swarm", 1, "", "", "");
    let syn_id = contract.hatch(
        "cap-swarm".to_string(),
        None,
        Some(1),
        Some(50),
        enclave_pk,
        "hash".to_string(),
        Some(30),
        None,
        None,
    );
    let p_hash = contract.get_policy_hash(syn_id.clone());

    // Fill 50 distinct flyers
    for i in 0..50 {
        let flyer: AccountId = format!("flyer{}.near", i).parse().unwrap();
        let ctx = get_context(flyer, NearToken::from_near(1), 105 + i);
        testing_env!(ctx.build());
        contract.deposit(syn_id.clone(), p_hash.clone());
    }

    // 51st flyer must be rejected
    let flyer51: AccountId = "flyer51.near".parse().unwrap();
    let ctx = get_context(flyer51, NearToken::from_near(1), 200);
    testing_env!(ctx.build());
    contract.deposit(syn_id, p_hash);
}

#[test]
#[should_panic(expected = "[Hatch REJECT] quorum_threshold must be >= 1.")]
fn test_hatch_invalid_quorum_fails() {
    let owner: AccountId = "alice.near".parse().unwrap();
    let ctx = get_context(owner, NearToken::from_near(1), 100);
    testing_env!(ctx.build());

    let mut contract = FlyCoordinator::new();
    let (enclave_pk, _) =
        make_enclave_key_and_signature("fly-coordinator.testnet", "zero-quorum", 1, "", "", "");
    contract.hatch(
        "zero-quorum".to_string(),
        None,
        Some(0), // Invalid quorum
        Some(50),
        enclave_pk,
        "hash".to_string(),
        Some(30),
        None,
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
    let (enclave_pk, _) =
        make_enclave_key_and_signature("fly-coordinator.testnet", "zero-timeout", 1, "", "", "");
    contract.hatch(
        "zero-timeout".to_string(),
        None,
        Some(1),
        Some(50),
        enclave_pk,
        "hash".to_string(),
        Some(0), // Invalid timeout
        None,
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
    let (enclave_pk, _) =
        make_enclave_key_and_signature("fly-coordinator.testnet", "quorum-swarm", 1, "", "", "");

    let syn_id = contract.hatch(
        "quorum-swarm".to_string(),
        Some("FLASH".to_string()),
        Some(3), // Requires 3
        Some(50),
        enclave_pk,
        "hash".to_string(),
        Some(30),
        None,
        None,
    );

    let syn = contract.get_syndicate(syn_id.clone()).unwrap();
    let active_nonce = syn.round_nonce.clone();
    let p_hash = contract.get_policy_hash(syn_id.clone());

    // Only 1 flyer deposits
    let f1: AccountId = "flyer1.near".parse().unwrap();
    let ctx = get_context(f1, NearToken::from_near(10), 105);
    testing_env!(ctx.build());
    contract.deposit(syn_id.clone(), p_hash);

    let allocations = vec![Allocation {
        recipient: syn.payout_recipient.clone(),
        amount: NearToken::from_near(10),
    }];
    let alloc_hash = compute_allocations_hash(&allocations);

    let (_, valid_sig) = make_enclave_key_and_signature(
        "fly-coordinator.testnet",
        &syn_id,
        1,
        &active_nonce,
        &alloc_hash,
        "order_hash",
    );

    let ctx = get_context(owner, NearToken::from_near(0), 110);
    testing_env!(ctx.build());
    contract.settle_batch(
        syn_id,
        active_nonce,
        "order_hash".to_string(),
        allocations,
        valid_sig,
    );
}

#[test]
#[should_panic(expected = "[HAQ REJECT] Nonce mismatch. Replay attack blocked.")]
fn test_wrong_nonce_fails() {
    let owner: AccountId = "alice.near".parse().unwrap();
    let ctx = get_context(owner.clone(), NearToken::from_near(1), 100);
    testing_env!(ctx.build());

    let mut contract = FlyCoordinator::new();
    let (enclave_pk, _) =
        make_enclave_key_and_signature("fly-coordinator.testnet", "nonce-swarm", 1, "", "", "");

    let syn_id = contract.hatch(
        "nonce-swarm".to_string(),
        Some("FLASH".to_string()),
        Some(1),
        Some(50),
        enclave_pk,
        "hash".to_string(),
        Some(30),
        None,
        None,
    );

    let p_hash = contract.get_policy_hash(syn_id.clone());
    let f1: AccountId = "flyer1.near".parse().unwrap();
    let ctx = get_context(f1, NearToken::from_near(10), 105);
    testing_env!(ctx.build());
    contract.deposit(syn_id.clone(), p_hash);

    let syn = contract.get_syndicate(syn_id.clone()).unwrap();
    let allocations = vec![Allocation {
        recipient: syn.payout_recipient.clone(),
        amount: NearToken::from_near(10),
    }];
    let alloc_hash = compute_allocations_hash(&allocations);

    let (_, sig) = make_enclave_key_and_signature(
        "fly-coordinator.testnet",
        &syn_id,
        1,
        "wrong_nonce_value",
        &alloc_hash,
        "order_hash",
    );

    let ctx = get_context(owner, NearToken::from_near(0), 110);
    testing_env!(ctx.build());
    contract.settle_batch(
        syn_id,
        "wrong_nonce_value".to_string(),
        "order_hash".to_string(),
        allocations,
        sig,
    );
}

#[test]
#[should_panic(
    expected = "[Deposit REJECT] Deposit exceeds OutLayer max_spend_per_flyer policy limit."
)]
fn test_deposit_limit_exceeded_fails() {
    let owner: AccountId = "alice.near".parse().unwrap();
    let ctx = get_context(owner, NearToken::from_near(1), 100);
    testing_env!(ctx.build());

    let mut contract = FlyCoordinator::new();
    let (enclave_pk, _) =
        make_enclave_key_and_signature("fly-coordinator.testnet", "limit-swarm", 1, "", "", "");

    let syn_id = contract.hatch(
        "limit-swarm".to_string(),
        Some("FLASH".to_string()),
        Some(1),
        Some(20), // Max 20 NEAR
        enclave_pk,
        "hash".to_string(),
        Some(30),
        None,
        None,
    );

    let p_hash = contract.get_policy_hash(syn_id.clone());
    let f1: AccountId = "flyer1.near".parse().unwrap();
    let ctx = get_context(f1, NearToken::from_near(25), 105); // Attaches 25 NEAR
    testing_env!(ctx.build());
    contract.deposit(syn_id, p_hash);
}

#[test]
#[should_panic(expected = "[Deposit REJECT] Cannot deposit into inactive syndicate.")]
fn test_deposit_to_non_active_fails() {
    let owner: AccountId = "alice.near".parse().unwrap();
    let ctx = get_context(owner.clone(), NearToken::from_near(1), 100);
    testing_env!(ctx.build());

    let mut contract = FlyCoordinator::new();
    let (enclave_pk, _) = make_enclave_key_and_signature(
        "fly-coordinator.testnet",
        "settle-dep-swarm",
        1,
        "",
        "",
        "",
    );

    let syn_id = contract.hatch(
        "settle-dep-swarm".to_string(),
        Some("FLASH".to_string()),
        Some(1),
        Some(50),
        enclave_pk,
        "hash".to_string(),
        Some(30),
        None,
        None,
    );

    let syn = contract.get_syndicate(syn_id.clone()).unwrap();
    let active_nonce = syn.round_nonce.clone();
    let p_hash = contract.get_policy_hash(syn_id.clone());

    let f1: AccountId = "flyer1.near".parse().unwrap();
    let ctx = get_context(f1.clone(), NearToken::from_near(10), 105);
    testing_env!(ctx.build());
    contract.deposit(syn_id.clone(), p_hash.clone());

    let allocations = vec![Allocation {
        recipient: syn.payout_recipient.clone(),
        amount: NearToken::from_near(10),
    }];
    let alloc_hash = compute_allocations_hash(&allocations);

    let (_, valid_sig) = make_enclave_key_and_signature(
        "fly-coordinator.testnet",
        &syn_id,
        1,
        &active_nonce,
        &alloc_hash,
        "order_hash",
    );

    let ctx = get_context(owner, NearToken::from_near(0), 110);
    testing_env!(ctx.build());
    contract.settle_batch(
        syn_id.clone(),
        active_nonce,
        "order_hash".to_string(),
        allocations,
        valid_sig,
    );

    // Attempt deposit after settled
    let ctx = get_context(f1, NearToken::from_near(5), 120);
    testing_env!(ctx.build());
    contract.deposit(syn_id, p_hash);
}

#[test]
#[should_panic(
    expected = "[Hatch REJECT] Syndicate ID must only contain lowercase alphanumeric, '-' or '_' characters."
)]
fn test_invalid_id_characters_fails() {
    let owner: AccountId = "alice.near".parse().unwrap();
    let ctx = get_context(owner, NearToken::from_near(1), 100);
    testing_env!(ctx.build());

    let mut contract = FlyCoordinator::new();
    let (enclave_pk, _) =
        make_enclave_key_and_signature("fly-coordinator.testnet", "BAD ID", 1, "", "", "");
    contract.hatch(
        "BAD ID".to_string(),
        None,
        Some(1),
        Some(50),
        enclave_pk,
        "hash".to_string(),
        Some(30),
        None,
        None,
    );
}

#[test]
fn test_dark_vault_epoch_rollover_resets_escape_hatch_timer() {
    let owner: AccountId = "alice.near".parse().unwrap();
    let ctx = get_context(owner.clone(), NearToken::from_near(1), 100);
    testing_env!(ctx.build());

    let mut contract = FlyCoordinator::new();
    let (enclave_pk, _) =
        make_enclave_key_and_signature("fly-coordinator.testnet", "vault-epoch", 1, "", "", "");

    let syn_id = contract.hatch(
        "vault-epoch".to_string(),
        Some("DARK_VAULT".to_string()),
        Some(1),
        Some(50),
        enclave_pk,
        "hash".to_string(),
        Some(30), // timeout: 30 blocks
        None,
        None,
    );

    let p_hash = contract.get_policy_hash(syn_id.clone());
    let f1: AccountId = "flyer1.near".parse().unwrap();
    let ctx = get_context(f1.clone(), NearToken::from_near(10), 105);
    testing_env!(ctx.build());
    contract.deposit(syn_id.clone(), p_hash);

    let syn = contract.get_syndicate(syn_id.clone()).unwrap();
    let nonce_epoch1 = syn.round_nonce.clone();
    assert_eq!(syn.epoch, 1);
    assert_eq!(syn.epoch_start_block, 100);

    // Settle partial batch in DarkVault so syndicate remains active for epoch 2
    let allocations = vec![Allocation {
        recipient: syn.payout_recipient.clone(),
        amount: NearToken::from_near(5),
    }];
    let alloc_hash = compute_allocations_hash(&allocations);

    let (_, sig1) = make_enclave_key_and_signature(
        "fly-coordinator.testnet",
        &syn_id,
        1,
        &nonce_epoch1,
        &alloc_hash,
        "batch_01",
    );

    // Settle epoch 1 at block 120
    let ctx = get_context(owner, NearToken::from_near(0), 120);
    testing_env!(ctx.build());
    contract.settle_batch(
        syn_id.clone(),
        nonce_epoch1.clone(),
        "batch_01".to_string(),
        allocations,
        sig1,
    );

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
    assert!(
        res.is_err(),
        "hatch_out should fail mid-epoch in DarkVault!"
    );
}

#[test]
#[should_panic(expected = "[Hatch-Out LOCKED] Deliberation window still active.")]
fn test_premature_hatch_out_fails() {
    let owner: AccountId = "alice.near".parse().unwrap();
    let ctx = get_context(owner, NearToken::from_near(1), 100);
    testing_env!(ctx.build());

    let mut contract = FlyCoordinator::new();
    let (enclave_pk, _) =
        make_enclave_key_and_signature("fly-coordinator.testnet", "premature-swarm", 1, "", "", "");

    let syn_id = contract.hatch(
        "premature-swarm".to_string(),
        Some("FLASH".to_string()),
        Some(1),
        Some(50),
        enclave_pk,
        "hash".to_string(),
        Some(50), // timeout: 50 blocks
        None,
        None,
    );

    let p_hash = contract.get_policy_hash(syn_id.clone());
    let f1: AccountId = "flyer1.near".parse().unwrap();
    let ctx = get_context(f1.clone(), NearToken::from_near(10), 105);
    testing_env!(ctx.build());
    contract.deposit(syn_id.clone(), p_hash);

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
    let (enclave_pk, _) =
        make_enclave_key_and_signature("fly-coordinator.testnet", "timeout-swarm", 1, "", "", "");

    let syn_id = contract.hatch(
        "timeout-swarm".to_string(),
        Some("FLASH".to_string()),
        Some(2),
        Some(50),
        enclave_pk,
        "hash".to_string(),
        Some(50),
        None,
        None,
    );

    let p_hash = contract.get_policy_hash(syn_id.clone());
    let f1: AccountId = "flyer1.near".parse().unwrap();
    let ctx = get_context(f1.clone(), NearToken::from_near(10), 105);
    testing_env!(ctx.build());
    contract.deposit(syn_id.clone(), p_hash.clone());

    let f2: AccountId = "flyer2.near".parse().unwrap();
    let ctx = get_context(f2.clone(), NearToken::from_near(20), 106);
    testing_env!(ctx.build());
    contract.deposit(syn_id.clone(), p_hash);

    // Past timeout: Block 160 > 100 + 50
    let ctx = get_context(f1.clone(), NearToken::from_near(0), 160);
    testing_env!(ctx.build());
    let _ = contract.hatch_out(syn_id.clone());

    // f1 is refunded
    assert_eq!(contract.get_escrow(syn_id.clone(), f1).as_yoctonear(), 0);
    // f2's escrow remains intact!
    assert_eq!(
        contract.get_escrow(syn_id.clone(), f2.clone()).as_near(),
        20
    );

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
    let (enclave_pk, _) =
        make_enclave_key_and_signature("fly-coordinator.testnet", "settled-swarm", 1, "", "", "");

    let syn_id = contract.hatch(
        "settled-swarm".to_string(),
        Some("FLASH".to_string()),
        Some(1),
        Some(50),
        enclave_pk,
        "hash".to_string(),
        Some(30),
        None,
        None,
    );

    let syn = contract.get_syndicate(syn_id.clone()).unwrap();
    let active_nonce = syn.round_nonce.clone();
    let p_hash = contract.get_policy_hash(syn_id.clone());

    let f1: AccountId = "flyer1.near".parse().unwrap();
    let ctx = get_context(f1.clone(), NearToken::from_near(10), 105);
    testing_env!(ctx.build());
    contract.deposit(syn_id.clone(), p_hash);

    let allocations = vec![Allocation {
        recipient: syn.payout_recipient.clone(),
        amount: NearToken::from_near(10),
    }];
    let alloc_hash = compute_allocations_hash(&allocations);

    let (_, valid_sig) = make_enclave_key_and_signature(
        "fly-coordinator.testnet",
        &syn_id,
        1,
        &active_nonce,
        &alloc_hash,
        "order_hash",
    );

    let ctx = get_context(owner, NearToken::from_near(0), 110);
    testing_env!(ctx.build());
    contract.settle_batch(
        syn_id.clone(),
        active_nonce,
        "order_hash".to_string(),
        allocations,
        valid_sig,
    );

    // Attempt hatch_out after settled at block 150
    let ctx = get_context(f1, NearToken::from_near(0), 150);
    testing_env!(ctx.build());
    let _ = contract.hatch_out(syn_id);
}

#[test]
#[should_panic(expected = "[Hatch-Out REJECT] No escrow balance to refund.")]
fn test_double_hatch_out_fails() {
    let owner: AccountId = "alice.near".parse().unwrap();
    let ctx = get_context(owner, NearToken::from_near(1), 100);
    testing_env!(ctx.build());

    let mut contract = FlyCoordinator::new();
    let (enclave_pk, _) =
        make_enclave_key_and_signature("fly-coordinator.testnet", "double-swarm", 1, "", "", "");

    let syn_id = contract.hatch(
        "double-swarm".to_string(),
        Some("FLASH".to_string()),
        Some(1),
        Some(50),
        enclave_pk,
        "hash".to_string(),
        Some(30),
        None,
        None,
    );

    let p_hash = contract.get_policy_hash(syn_id.clone());
    let f1: AccountId = "flyer1.near".parse().unwrap();
    let ctx = get_context(f1.clone(), NearToken::from_near(10), 105);
    testing_env!(ctx.build());
    contract.deposit(syn_id.clone(), p_hash);

    // First refund at block 150
    let ctx = get_context(f1.clone(), NearToken::from_near(0), 150);
    testing_env!(ctx.build());
    let _ = contract.hatch_out(syn_id.clone());

    // Second refund attempt by same caller
    let ctx = get_context(f1, NearToken::from_near(0), 155);
    testing_env!(ctx.build());
    let _ = contract.hatch_out(syn_id);
}

#[test]
fn test_repeat_deposit_withdraw_does_not_inflate_flyer_cap() {
    let owner: AccountId = "alice.near".parse().unwrap();
    let ctx = get_context(owner, NearToken::from_near(1), 100);
    testing_env!(ctx.build());

    let mut contract = FlyCoordinator::new();
    let (enclave_pk, _) =
        make_enclave_key_and_signature("fly-coordinator.testnet", "repeat-swarm", 1, "", "", "");

    let syn_id = contract.hatch(
        "repeat-swarm".to_string(),
        Some("FLASH".to_string()),
        Some(1),
        Some(50),
        enclave_pk,
        "hash".to_string(),
        Some(10), // timeout 10 blocks
        None,
        None,
    );

    let p_hash = contract.get_policy_hash(syn_id.clone());
    let f1: AccountId = "flyer1.near".parse().unwrap();
    let f2: AccountId = "flyer2.near".parse().unwrap();

    // f2 deposits 5 NEAR keeping the syndicate active
    let ctx = get_context(f2.clone(), NearToken::from_near(5), 102);
    testing_env!(ctx.build());
    contract.deposit(syn_id.clone(), p_hash.clone());

    // Flyer 1 deposits and exits 5 times
    for i in 0..5 {
        let dep_block = 110 + i * 20;
        let ctx = get_context(f1.clone(), NearToken::from_near(1), dep_block);
        testing_env!(ctx.build());
        contract.deposit(syn_id.clone(), p_hash.clone());

        let syn = contract.get_syndicate(syn_id.clone()).unwrap();
        assert_eq!(syn.active_flyer_count, 2);

        let exit_block = dep_block + 15; // past timeout (10 blocks)
        let ctx = get_context(f1.clone(), NearToken::from_near(0), exit_block);
        testing_env!(ctx.build());
        let _ = contract.hatch_out(syn_id.clone());

        let syn_after = contract.get_syndicate(syn_id.clone()).unwrap();
        assert_eq!(syn_after.active_flyer_count, 1);
        assert_eq!(
            contract
                .get_escrow(syn_id.clone(), f1.clone())
                .as_yoctonear(),
            0
        );
    }

    // Now Flyer 1 deposits again successfully, active count is 2
    let ctx = get_context(f1.clone(), NearToken::from_near(2), 250);
    testing_env!(ctx.build());
    contract.deposit(syn_id.clone(), p_hash);

    let syn_final = contract.get_syndicate(syn_id.clone()).unwrap();
    assert_eq!(syn_final.active_flyer_count, 2);
    assert_eq!(contract.get_escrow(syn_id, f1).as_near(), 2);
}

#[test]
#[allow(deprecated)]
fn test_on_settlement_payout_success_cleans_up_flyer_storage() {
    let owner: AccountId = "alice.near".parse().unwrap();
    let ctx = get_context(owner.clone(), NearToken::from_near(1), 100);
    testing_env!(ctx.build());

    let mut contract = FlyCoordinator::new();
    let (enclave_pk, _) =
        make_enclave_key_and_signature("fly-coordinator.testnet", "settle-cb-succ", 1, "", "", "");

    let syn_id = contract.hatch(
        "settle-cb-succ".to_string(),
        Some("FLASH".to_string()),
        Some(2),
        Some(50),
        enclave_pk,
        "hash".to_string(),
        Some(30),
        None,
        None,
    );

    let p_hash = contract.get_policy_hash(syn_id.clone());
    let f1: AccountId = "flyer1.near".parse().unwrap();
    let f2: AccountId = "flyer2.near".parse().unwrap();

    let ctx = get_context(f1.clone(), NearToken::from_near(10), 105);
    testing_env!(ctx.build());
    contract.deposit(syn_id.clone(), p_hash.clone());

    let ctx = get_context(f2.clone(), NearToken::from_near(15), 106);
    testing_env!(ctx.build());
    contract.deposit(syn_id.clone(), p_hash);

    let syn = contract.get_syndicate(syn_id.clone()).unwrap();
    let active_nonce = syn.round_nonce.clone();
    let allocations = vec![Allocation {
        recipient: syn.payout_recipient.clone(),
        amount: NearToken::from_near(25),
    }];
    let alloc_hash = compute_allocations_hash(&allocations);

    let (_, valid_sig) = make_enclave_key_and_signature(
        "fly-coordinator.testnet",
        &syn_id,
        1,
        &active_nonce,
        &alloc_hash,
        "order_hash",
    );

    // Execute settle_batch
    let ctx = get_context(owner, NearToken::from_near(0), 110);
    testing_env!(ctx.build());
    contract.settle_batch(
        syn_id.clone(),
        active_nonce,
        "order_hash".to_string(),
        allocations.clone(),
        valid_sig,
    );

    // Simulate callback execution with successful transfer promise result
    let self_account: AccountId = "fly-coordinator.testnet".parse().unwrap();
    let ctx = get_context(self_account, NearToken::from_near(0), 111);
    testing_env_with_promise_results(ctx.build(), PromiseResult::Successful(vec![]));

    let success = contract.on_settlement_payout(
        syn_id.clone(),
        allocations,
        vec![],
        NearToken::from_near(25),
        alloc_hash,
        "order_hash".to_string(),
    );
    assert!(success);

    // Storage cleanup: verify flyer escrow entries are removed and flyers list cleared
    assert_eq!(contract.get_escrow(syn_id.clone(), f1).as_yoctonear(), 0);
    assert_eq!(contract.get_escrow(syn_id.clone(), f2).as_yoctonear(), 0);
    let syn_after = contract.get_syndicate(syn_id).unwrap();
    assert_eq!(syn_after.active_flyer_count, 0);
    assert!(syn_after.flyers.is_empty());
    assert_eq!(syn_after.status, SyndicateStatus::Settled);
}

#[test]
#[allow(deprecated)]
fn test_on_settlement_payout_failure_reverts_state() {
    let owner: AccountId = "alice.near".parse().unwrap();
    let ctx = get_context(owner.clone(), NearToken::from_near(1), 100);
    testing_env!(ctx.build());

    let mut contract = FlyCoordinator::new();
    let (enclave_pk, _) =
        make_enclave_key_and_signature("fly-coordinator.testnet", "settle-cb-fail", 1, "", "", "");

    let syn_id = contract.hatch(
        "settle-cb-fail".to_string(),
        Some("FLASH".to_string()),
        Some(1),
        Some(50),
        enclave_pk,
        "hash".to_string(),
        Some(30),
        None,
        None,
    );

    let p_hash = contract.get_policy_hash(syn_id.clone());
    let f1: AccountId = "flyer1.near".parse().unwrap();
    let ctx = get_context(f1.clone(), NearToken::from_near(20), 105);
    testing_env!(ctx.build());
    contract.deposit(syn_id.clone(), p_hash);

    let syn = contract.get_syndicate(syn_id.clone()).unwrap();
    let active_nonce = syn.round_nonce.clone();
    let allocations = vec![Allocation {
        recipient: syn.payout_recipient.clone(),
        amount: NearToken::from_near(20),
    }];
    let alloc_hash = compute_allocations_hash(&allocations);

    let (_, valid_sig) = make_enclave_key_and_signature(
        "fly-coordinator.testnet",
        &syn_id,
        1,
        &active_nonce,
        &alloc_hash,
        "order_hash",
    );

    // Execute settle_batch
    let ctx = get_context(owner, NearToken::from_near(0), 110);
    testing_env!(ctx.build());
    contract.settle_batch(
        syn_id.clone(),
        active_nonce,
        "order_hash".to_string(),
        allocations.clone(),
        valid_sig,
    );

    // Simulate callback execution with failed transfer promise result
    let self_account: AccountId = "fly-coordinator.testnet".parse().unwrap();
    let ctx = get_context(self_account, NearToken::from_near(0), 111);
    testing_env_with_promise_results(ctx.build(), PromiseResult::Failed);

    let ok = contract.on_settlement_payout(
        syn_id.clone(),
        allocations,
        vec![],
        NearToken::from_near(20),
        alloc_hash,
        "order_hash".to_string(),
    );
    assert!(!ok);

    // State reverted: status back to Active, escrow back to 20 NEAR, settled payouts 0
    let syn_reverted = contract.get_syndicate(syn_id.clone()).unwrap();
    assert_eq!(syn_reverted.status, SyndicateStatus::Active);
    assert_eq!(syn_reverted.total_escrow.as_near(), 20);
    assert_eq!(syn_reverted.total_settled_payouts.as_yoctonear(), 0);
    // Individual escrow balance was preserved!
    assert_eq!(
        contract.get_escrow(syn_id.clone(), f1.clone()).as_near(),
        20
    );

    // Now flyer can escape hatch out past timeout
    let ctx = get_context(f1.clone(), NearToken::from_near(0), 150);
    testing_env!(ctx.build());
    let _ = contract.hatch_out(syn_id);
}

#[test]
#[allow(deprecated)]
fn test_on_hatch_out_payout_failure_restores_escrow_and_status() {
    let owner: AccountId = "alice.near".parse().unwrap();
    let ctx = get_context(owner, NearToken::from_near(1), 100);
    testing_env!(ctx.build());

    let mut contract = FlyCoordinator::new();
    let (enclave_pk, _) = make_enclave_key_and_signature(
        "fly-coordinator.testnet",
        "hatchout-cb-fail",
        1,
        "",
        "",
        "",
    );

    let syn_id = contract.hatch(
        "hatchout-cb-fail".to_string(),
        Some("FLASH".to_string()),
        Some(1),
        Some(50),
        enclave_pk,
        "hash".to_string(),
        Some(20),
        None,
        None,
    );

    let p_hash = contract.get_policy_hash(syn_id.clone());
    let f1: AccountId = "flyer1.near".parse().unwrap();
    let ctx = get_context(f1.clone(), NearToken::from_near(10), 105);
    testing_env!(ctx.build());
    contract.deposit(syn_id.clone(), p_hash);

    // Flyer hatches out at block 130 past timeout (20 blocks)
    let ctx = get_context(f1.clone(), NearToken::from_near(0), 130);
    testing_env!(ctx.build());
    let _ = contract.hatch_out(syn_id.clone());

    // Prior to callback, escrow is removed and status is AbortedRefunded
    assert_eq!(
        contract
            .get_escrow(syn_id.clone(), f1.clone())
            .as_yoctonear(),
        0
    );
    let syn_during = contract.get_syndicate(syn_id.clone()).unwrap();
    assert_eq!(syn_during.status, SyndicateStatus::AbortedRefunded);

    // Simulate failed refund transfer callback
    let self_account: AccountId = "fly-coordinator.testnet".parse().unwrap();
    let ctx = get_context(self_account, NearToken::from_near(0), 131);
    testing_env_with_promise_results(ctx.build(), PromiseResult::Failed);

    let ok = contract.on_hatch_out_payout(syn_id.clone(), f1.clone(), NearToken::from_near(10));
    assert!(!ok);

    // Balance and status restored!
    assert_eq!(contract.get_escrow(syn_id.clone(), f1).as_near(), 10);
    let syn_restored = contract.get_syndicate(syn_id).unwrap();
    assert_eq!(syn_restored.total_escrow.as_near(), 10);
    assert_eq!(syn_restored.active_flyer_count, 1);
    assert_eq!(syn_restored.status, SyndicateStatus::Active);
}

#[test]
#[allow(deprecated)]
fn test_on_hatch_out_payout_failure_with_redeposit_prevents_double_counting() {
    let owner: AccountId = "alice.near".parse().unwrap();
    let ctx = get_context(owner, NearToken::from_near(1), 100);
    testing_env!(ctx.build());

    let mut contract = FlyCoordinator::new();
    let (enclave_pk, _) = make_enclave_key_and_signature(
        "fly-coordinator.testnet",
        "double-count-swarm",
        1,
        "",
        "",
        "",
    );

    let syn_id = contract.hatch(
        "double-count-swarm".to_string(),
        Some("FLASH".to_string()),
        Some(1),
        Some(50),
        enclave_pk,
        "hash".to_string(),
        Some(20),
        None,
        None,
    );

    let p_hash = contract.get_policy_hash(syn_id.clone());
    let f1: AccountId = "flyer1.near".parse().unwrap();
    let f2: AccountId = "flyer2.near".parse().unwrap();

    // f2 keeps syndicate active
    let ctx = get_context(f2, NearToken::from_near(5), 102);
    testing_env!(ctx.build());
    contract.deposit(syn_id.clone(), p_hash.clone());

    // f1 deposits 10 NEAR
    let ctx = get_context(f1.clone(), NearToken::from_near(10), 105);
    testing_env!(ctx.build());
    contract.deposit(syn_id.clone(), p_hash.clone());

    // f1 hatches out at block 130
    let ctx = get_context(f1.clone(), NearToken::from_near(0), 130);
    testing_env!(ctx.build());
    let _ = contract.hatch_out(syn_id.clone());

    let syn_after_exit = contract.get_syndicate(syn_id.clone()).unwrap();
    assert_eq!(syn_after_exit.active_flyer_count, 1);

    // Before callback arrives, f1 redeposits 3 NEAR
    let ctx = get_context(f1.clone(), NearToken::from_near(3), 132);
    testing_env!(ctx.build());
    contract.deposit(syn_id.clone(), p_hash);

    let syn_after_redeposit = contract.get_syndicate(syn_id.clone()).unwrap();
    assert_eq!(syn_after_redeposit.active_flyer_count, 2);

    // Now the refund transfer fails and callback fires
    let self_account: AccountId = "fly-coordinator.testnet".parse().unwrap();
    let ctx = get_context(self_account, NearToken::from_near(0), 135);
    testing_env_with_promise_results(ctx.build(), PromiseResult::Failed);

    let ok = contract.on_hatch_out_payout(syn_id.clone(), f1.clone(), NearToken::from_near(10));
    assert!(!ok);

    // Balance is 10 + 3 = 13 NEAR
    assert_eq!(contract.get_escrow(syn_id.clone(), f1).as_near(), 13);
    // Crucial invariant: active_flyer_count MUST remain 2 (f1 was NOT counted twice!)
    let syn_final = contract.get_syndicate(syn_id).unwrap();
    assert_eq!(syn_final.active_flyer_count, 2);
}

#[test]
#[should_panic(expected = "Method is private")]
fn test_on_settlement_payout_rejects_external_caller() {
    let attacker: AccountId = "attacker.near".parse().unwrap();
    let ctx = get_context(attacker, NearToken::from_near(0), 110);
    testing_env!(ctx.build());

    let mut contract = FlyCoordinator::new();
    contract.on_settlement_payout(
        "syn-1".to_string(),
        vec![],
        vec![],
        NearToken::from_near(10),
        "hash".to_string(),
        "order".to_string(),
    );
}

#[test]
#[should_panic(expected = "Method is private")]
fn test_on_hatch_out_payout_rejects_external_caller() {
    let attacker: AccountId = "attacker.near".parse().unwrap();
    let ctx = get_context(attacker, NearToken::from_near(0), 110);
    testing_env!(ctx.build());

    let mut contract = FlyCoordinator::new();
    let f1: AccountId = "flyer1.near".parse().unwrap();
    contract.on_hatch_out_payout("syn-1".to_string(), f1, NearToken::from_near(10));
}

#[test]
fn test_syndicate_discovery_and_pagination() {
    let owner: AccountId = "alice.near".parse().unwrap();
    let ctx = get_context(owner.clone(), NearToken::from_near(1), 100);
    testing_env!(ctx.build());

    let mut contract = FlyCoordinator::new();
    assert_eq!(contract.get_syndicate_count(), 0);
    assert_eq!(contract.list_syndicates(None, None).len(), 0);

    let (enclave_pk, _) =
        make_enclave_key_and_signature("fly-coordinator.testnet", "syn", 1, "", "", "");

    // Hatch 5 syndicates: syn-00 to syn-04
    for i in 0..5 {
        contract.hatch(
            format!("syn-{:02}", i),
            Some("FLASH".to_string()),
            Some(2),
            Some(50),
            enclave_pk.clone(),
            "code_hash".to_string(),
            Some(30),
            Some("payout.near".parse().unwrap()),
            None,
        );
    }

    assert_eq!(contract.get_syndicate_count(), 5);

    // List with default limit (returns all 5)
    let all = contract.list_syndicates(None, None);
    assert_eq!(all.len(), 5);

    // Paginate: from 0, limit 2
    let page1 = contract.list_syndicates(Some(0), Some(2));
    assert_eq!(page1.len(), 2);
    assert_eq!(page1[0].id, "syn-00");
    assert_eq!(page1[1].id, "syn-01");

    // Paginate: from 2, limit 2
    let page2 = contract.list_syndicates(Some(2), Some(2));
    assert_eq!(page2.len(), 2);
    assert_eq!(page2[0].id, "syn-02");
    assert_eq!(page2[1].id, "syn-03");

    // Paginate: from 4, limit 2 (returns 1 item: syn-04)
    let page3 = contract.list_syndicates(Some(4), Some(2));
    assert_eq!(page3.len(), 1);
    assert_eq!(page3[0].id, "syn-04");

    // Offset beyond count returns empty
    let page_empty = contract.list_syndicates(Some(10), Some(5));
    assert_eq!(page_empty.len(), 0);

    // Enforce max limit cap (request 100, capped at 50)
    let capped = contract.list_syndicates(Some(0), Some(100));
    assert_eq!(capped.len(), 5);
}

#[test]
fn test_get_syndicates_by_member() {
    let alice: AccountId = "alice.near".parse().unwrap();
    let bob: AccountId = "bob.near".parse().unwrap();
    let charlie: AccountId = "charlie.near".parse().unwrap();

    let ctx = get_context(alice.clone(), NearToken::from_near(1), 100);
    testing_env!(ctx.build());

    let mut contract = FlyCoordinator::new();
    let (enclave_pk, _) =
        make_enclave_key_and_signature("fly-coordinator.testnet", "syn", 1, "", "", "");

    // Alice hatches syn-research
    let syn1 = contract.hatch(
        "syn-research".to_string(),
        Some("FLASH".to_string()),
        Some(2),
        Some(50),
        enclave_pk.clone(),
        "code_hash".to_string(),
        Some(30),
        None,
        None,
    );
    let p1_hash = contract.get_policy_hash(syn1);

    // Bob hatches syn-trading
    let ctx = get_context(bob.clone(), NearToken::from_near(1), 101);
    testing_env!(ctx.build());
    let syn2 = contract.hatch(
        "syn-trading".to_string(),
        Some("FLASH".to_string()),
        Some(2),
        Some(50),
        enclave_pk.clone(),
        "code_hash".to_string(),
        Some(30),
        None,
        None,
    );
    let p2_hash = contract.get_policy_hash(syn2);

    // Charlie deposits in syn-research and syn-trading
    let ctx = get_context(charlie.clone(), NearToken::from_near(5), 102);
    testing_env!(ctx.build());
    contract.deposit("syn-research".to_string(), p1_hash);
    contract.deposit("syn-trading".to_string(), p2_hash);

    // Check member lookups
    // Alice is owner of syn-research
    let alice_syns = contract.get_syndicates_by_member(alice.clone(), None, None);
    assert_eq!(alice_syns.len(), 1);
    assert_eq!(alice_syns[0].id, "syn-research");

    // Bob is owner of syn-trading
    let bob_syns = contract.get_syndicates_by_member(bob.clone(), None, None);
    assert_eq!(bob_syns.len(), 1);
    assert_eq!(bob_syns[0].id, "syn-trading");

    // Charlie is flyer in BOTH syn-research and syn-trading
    let charlie_syns = contract.get_syndicates_by_member(charlie.clone(), None, None);
    assert_eq!(charlie_syns.len(), 2);
    let ids: Vec<String> = charlie_syns.iter().map(|s| s.id.clone()).collect();
    assert!(ids.contains(&"syn-research".to_string()));
    assert!(ids.contains(&"syn-trading".to_string()));

    // Dave is in none
    let dave: AccountId = "dave.near".parse().unwrap();
    let dave_syns = contract.get_syndicates_by_member(dave, None, None);
    assert_eq!(dave_syns.len(), 0);
}

#[test]
fn test_nep297_events_emission() {
    let owner: AccountId = "alice.near".parse().unwrap();
    let ctx = get_context(owner.clone(), NearToken::from_near(1), 100);
    testing_env!(ctx.build());

    let mut contract = FlyCoordinator::new();
    let (enclave_pk, _) =
        make_enclave_key_and_signature("fly-coordinator.testnet", "syn-event", 1, "", "", "");

    contract.hatch(
        "syn-event".to_string(),
        Some("FLASH".to_string()),
        Some(1),
        Some(50),
        enclave_pk,
        "code_hash".to_string(),
        Some(30),
        Some("payout.near".parse().unwrap()),
        None,
    );

    let logs = near_sdk::test_utils::get_logs();
    assert!(logs
        .iter()
        .any(|l| l.contains("EVENT_JSON") && l.contains("syndicate_hatched")));

    // Deposit emits syndicate_deposited event (API-008)
    let p_hash = contract.get_policy_hash("syn-event".to_string());
    let f1: AccountId = "f1.near".parse().unwrap();
    let ctx = get_context(f1, NearToken::from_near(5), 105);
    testing_env!(ctx.build());
    contract.deposit("syn-event".to_string(), p_hash);

    let logs = near_sdk::test_utils::get_logs();
    assert!(logs
        .iter()
        .any(|l| l.contains("EVENT_JSON") && l.contains("syndicate_deposited")));

    // Settle emits syndicate_settled event with allocations_hash (API-006, Task Y1)
    let syn = contract.get_syndicate("syn-event".to_string()).unwrap();
    let order_hash = "order_alpha_test".to_string();
    let allocations = vec![Allocation {
        recipient: "payout.near".parse().unwrap(),
        amount: NearToken::from_near(5),
    }];
    let alloc_hash = compute_allocations_hash(&allocations);
    let (_, sig) = make_enclave_key_and_signature(
        "fly-coordinator.testnet",
        "syn-event",
        1,
        &syn.round_nonce,
        &alloc_hash,
        &order_hash,
    );
    let ctx = get_context(owner.clone(), NearToken::from_near(0), 110);
    testing_env!(ctx.build());
    contract.settle_batch(
        "syn-event".to_string(),
        syn.round_nonce,
        order_hash.clone(),
        allocations.clone(),
        sig,
    );

    // Authoritative event is emitted upon callback completion (CA-003)
    let self_account: AccountId = "fly-coordinator.testnet".parse().unwrap();
    let ctx = get_context(self_account, NearToken::from_near(0), 111);
    testing_env_with_promise_results(ctx.build(), PromiseResult::Successful(vec![]));
    contract.on_settlement_payout(
        "syn-event".to_string(),
        allocations,
        vec![],
        NearToken::from_near(5),
        alloc_hash,
        order_hash,
    );

    let logs = near_sdk::test_utils::get_logs();
    assert!(logs.iter().any(|l| l.contains("EVENT_JSON")
        && l.contains("syndicate_settled")
        && l.contains("allocations_hash")));

    // Validate strict JSON parsing of all emitted NEP-297 events (API-010 / CA-004)
    for log in &logs {
        if let Some(json_str) = log.strip_prefix("EVENT_JSON:") {
            let v: near_sdk::serde_json::Value = near_sdk::serde_json::from_str(json_str)
                .expect("Emitted event log must be valid JSON");
            assert_eq!(v["standard"], "fly");
            assert_eq!(v["version"], "1.0.0");
            assert!(v["event"].is_string());
            assert!(v["data"].is_array());
        }
    }

    // Hatch second syndicate for hatch_out event test
    let (enclave_pk2, _) =
        make_enclave_key_and_signature("fly-coordinator.testnet", "syn-event-exit", 1, "", "", "");
    let ctx = get_context(owner, NearToken::from_near(1), 120);
    testing_env!(ctx.build());
    contract.hatch(
        "syn-event-exit".to_string(),
        Some("FLASH".to_string()),
        Some(1),
        Some(50),
        enclave_pk2,
        "code_hash".to_string(),
        Some(20),
        None,
        None,
    );
    let p_hash2 = contract.get_policy_hash("syn-event-exit".to_string());
    let f2: AccountId = "f2.near".parse().unwrap();
    let ctx = get_context(f2.clone(), NearToken::from_near(5), 125);
    testing_env!(ctx.build());
    contract.deposit("syn-event-exit".to_string(), p_hash2);

    // Exit at block 150 (> timeout of 20 blocks)
    let ctx = get_context(f2, NearToken::from_near(0), 150);
    testing_env!(ctx.build());
    let _ = contract.hatch_out("syn-event-exit".to_string());
    let logs = near_sdk::test_utils::get_logs();
    assert!(logs
        .iter()
        .any(|l| l.contains("EVENT_JSON") && l.contains("syndicate_hatched_out")));
}

// =========================================================================
// Task Y1 Specific Security & Bounded Settlement Authority Tests
// =========================================================================

#[test]
#[should_panic(
    expected = "[Settle REJECT] Recipient evil-treasury.near is not in allowed_recipients whitelist."
)]
fn test_y1_settlement_to_recipient_outside_allowlist_fails() {
    let owner: AccountId = "alice.near".parse().unwrap();
    let ctx = get_context(owner.clone(), NearToken::from_near(1), 100);
    testing_env!(ctx.build());

    let mut contract = FlyCoordinator::new();
    let (enclave_pk, _) = make_enclave_key_and_signature(
        "fly-coordinator.testnet",
        "syn-y1-whitelist",
        1,
        "",
        "",
        "",
    );

    let allowed: AccountId = "allowed-treasury.near".parse().unwrap();
    let policy = ReleasePolicy {
        allowed_recipients: vec![allowed.clone()],
        max_release_bps_per_epoch: 10_000,
        settle_deadline_block: 500,
    };

    let syn_id = contract.hatch(
        "syn-y1-whitelist".to_string(),
        Some("FLASH".to_string()),
        Some(1),
        Some(50),
        enclave_pk,
        "hash".to_string(),
        Some(30),
        Some(allowed),
        Some(policy),
    );

    let p_hash = contract.get_policy_hash(syn_id.clone());
    let f1: AccountId = "f1.near".parse().unwrap();
    let ctx = get_context(f1, NearToken::from_near(10), 105);
    testing_env!(ctx.build());
    contract.deposit(syn_id.clone(), p_hash);

    let syn = contract.get_syndicate(syn_id.clone()).unwrap();
    let bad_allocations = vec![Allocation {
        recipient: "evil-treasury.near".parse().unwrap(),
        amount: NearToken::from_near(10),
    }];
    let bad_alloc_hash = compute_allocations_hash(&bad_allocations);

    let (_, sig) = make_enclave_key_and_signature(
        "fly-coordinator.testnet",
        &syn_id,
        1,
        &syn.round_nonce,
        &bad_alloc_hash,
        "order_1",
    );

    let ctx = get_context(owner, NearToken::from_near(0), 110);
    testing_env!(ctx.build());
    contract.settle_batch(
        syn_id,
        syn.round_nonce,
        "order_1".to_string(),
        bad_allocations,
        sig,
    );
}

#[test]
#[should_panic(expected = "[Settle REJECT] Allocation sum exceeds max_release_bps_per_epoch cap.")]
fn test_y1_settlement_exceeding_max_release_bps_fails() {
    let owner: AccountId = "alice.near".parse().unwrap();
    let ctx = get_context(owner.clone(), NearToken::from_near(1), 100);
    testing_env!(ctx.build());

    let mut contract = FlyCoordinator::new();
    let (enclave_pk, _) =
        make_enclave_key_and_signature("fly-coordinator.testnet", "syn-y1-bps", 1, "", "", "");

    let allowed: AccountId = "treasury.near".parse().unwrap();
    // Cap at 2500 bps (25%)
    let policy = ReleasePolicy {
        allowed_recipients: vec![allowed.clone()],
        max_release_bps_per_epoch: 2_500,
        settle_deadline_block: 500,
    };

    let syn_id = contract.hatch(
        "syn-y1-bps".to_string(),
        Some("FLASH".to_string()),
        Some(1),
        Some(50),
        enclave_pk,
        "hash".to_string(),
        Some(30),
        Some(allowed.clone()),
        Some(policy),
    );

    let p_hash = contract.get_policy_hash(syn_id.clone());
    let f1: AccountId = "f1.near".parse().unwrap();
    let ctx = get_context(f1, NearToken::from_near(10), 105);
    testing_env!(ctx.build());
    contract.deposit(syn_id.clone(), p_hash);

    let syn = contract.get_syndicate(syn_id.clone()).unwrap();
    // Attempt to release 3 NEAR out of 10 NEAR (30% > 25% cap)
    let allocations = vec![Allocation {
        recipient: allowed,
        amount: NearToken::from_near(3),
    }];
    let alloc_hash = compute_allocations_hash(&allocations);

    let (_, sig) = make_enclave_key_and_signature(
        "fly-coordinator.testnet",
        &syn_id,
        1,
        &syn.round_nonce,
        &alloc_hash,
        "order_1",
    );

    let ctx = get_context(owner, NearToken::from_near(0), 110);
    testing_env!(ctx.build());
    contract.settle_batch(
        syn_id,
        syn.round_nonce,
        "order_1".to_string(),
        allocations,
        sig,
    );
}

#[test]
#[should_panic(expected = "[Settle REJECT] Settle deadline block height exceeded.")]
fn test_y1_settlement_after_deadline_fails() {
    let owner: AccountId = "alice.near".parse().unwrap();
    let ctx = get_context(owner.clone(), NearToken::from_near(1), 100);
    testing_env!(ctx.build());

    let mut contract = FlyCoordinator::new();
    let (enclave_pk, _) =
        make_enclave_key_and_signature("fly-coordinator.testnet", "syn-y1-deadline", 1, "", "", "");

    let allowed: AccountId = "treasury.near".parse().unwrap();
    // Deadline at block 150
    let policy = ReleasePolicy {
        allowed_recipients: vec![allowed.clone()],
        max_release_bps_per_epoch: 10_000,
        settle_deadline_block: 150,
    };

    let syn_id = contract.hatch(
        "syn-y1-deadline".to_string(),
        Some("FLASH".to_string()),
        Some(1),
        Some(50),
        enclave_pk,
        "hash".to_string(),
        Some(30),
        Some(allowed.clone()),
        Some(policy),
    );

    let p_hash = contract.get_policy_hash(syn_id.clone());
    let f1: AccountId = "f1.near".parse().unwrap();
    let ctx = get_context(f1, NearToken::from_near(10), 105);
    testing_env!(ctx.build());
    contract.deposit(syn_id.clone(), p_hash);

    let syn = contract.get_syndicate(syn_id.clone()).unwrap();
    let allocations = vec![Allocation {
        recipient: allowed,
        amount: NearToken::from_near(10),
    }];
    let alloc_hash = compute_allocations_hash(&allocations);

    let (_, sig) = make_enclave_key_and_signature(
        "fly-coordinator.testnet",
        &syn_id,
        1,
        &syn.round_nonce,
        &alloc_hash,
        "order_1",
    );

    // Call settle_batch at block 151 (past deadline 150)
    let ctx = get_context(owner, NearToken::from_near(0), 151);
    testing_env!(ctx.build());
    contract.settle_batch(
        syn_id,
        syn.round_nonce,
        "order_1".to_string(),
        allocations,
        sig,
    );
}

#[test]
#[should_panic(
    expected = "[Deposit REJECT] Policy hash mismatch: depositor did not consent to current release policy."
)]
fn test_y1_deposit_with_wrong_policy_hash_fails() {
    let owner: AccountId = "alice.near".parse().unwrap();
    let ctx = get_context(owner, NearToken::from_near(1), 100);
    testing_env!(ctx.build());

    let mut contract = FlyCoordinator::new();
    let (enclave_pk, _) =
        make_enclave_key_and_signature("fly-coordinator.testnet", "syn-y1-pol-hash", 1, "", "", "");

    let syn_id = contract.hatch(
        "syn-y1-pol-hash".to_string(),
        Some("FLASH".to_string()),
        Some(1),
        Some(50),
        enclave_pk,
        "hash".to_string(),
        Some(30),
        None,
        None,
    );

    let f1: AccountId = "f1.near".parse().unwrap();
    let ctx = get_context(f1, NearToken::from_near(10), 105);
    testing_env!(ctx.build());
    // Submit bogus policy hash
    contract.deposit(
        syn_id,
        Some("bogus_unapproved_policy_hash_0xdeadbeef".to_string()),
    );
}

#[test]
#[should_panic(
    expected = "[Hatch-Out REJECT] Settlement is currently in flight. Try again after resolution."
)]
fn test_y1_hatch_out_blocked_while_settling() {
    let owner: AccountId = "alice.near".parse().unwrap();
    let ctx = get_context(owner.clone(), NearToken::from_near(1), 100);
    testing_env!(ctx.build());

    let mut contract = FlyCoordinator::new();
    let (enclave_pk, _) =
        make_enclave_key_and_signature("fly-coordinator.testnet", "syn-y1-settling", 1, "", "", "");

    let syn_id = contract.hatch(
        "syn-y1-settling".to_string(),
        Some("DARK_VAULT".to_string()),
        Some(1),
        Some(50),
        enclave_pk,
        "hash".to_string(),
        Some(10),
        None,
        None,
    );

    let p_hash = contract.get_policy_hash(syn_id.clone());
    let f1: AccountId = "f1.near".parse().unwrap();
    let ctx = get_context(f1.clone(), NearToken::from_near(10), 105);
    testing_env!(ctx.build());
    contract.deposit(syn_id.clone(), p_hash);

    let syn = contract.get_syndicate(syn_id.clone()).unwrap();
    let allocations = vec![Allocation {
        recipient: syn.payout_recipient.clone(),
        amount: NearToken::from_near(5),
    }];
    let alloc_hash = compute_allocations_hash(&allocations);
    let (_, sig) = make_enclave_key_and_signature(
        "fly-coordinator.testnet",
        &syn_id,
        1,
        &syn.round_nonce,
        &alloc_hash,
        "order_1",
    );

    let ctx = get_context(owner, NearToken::from_near(0), 110);
    testing_env!(ctx.build());
    // Start settlement batch
    contract.settle_batch(
        syn_id.clone(),
        syn.round_nonce,
        "order_1".to_string(),
        allocations,
        sig,
    );

    // Verify is_settling flag is true
    let syn_settling = contract.get_syndicate(syn_id.clone()).unwrap();
    assert!(syn_settling.is_settling);

    // Flyer 1 attempts hatch_out at block 130 (past timeout) while settlement is still in flight!
    let ctx = get_context(f1, NearToken::from_near(0), 130);
    testing_env!(ctx.build());
    let _ = contract.hatch_out(syn_id);
}

#[test]
fn test_settle_batch_50_flyers_gas_budget() {
    let owner: AccountId = "alice.near".parse().unwrap();
    let ctx = get_context(owner.clone(), NearToken::from_near(1), 100);
    testing_env!(ctx.build());

    let mut contract = FlyCoordinator::new();
    let (enclave_pk, _) =
        make_enclave_key_and_signature("fly-coordinator.testnet", "syn-gas-50", 1, "", "", "");

    let allowed: AccountId = "treasury.near".parse().unwrap();
    let syn_id = contract.hatch(
        "syn-gas-50".to_string(),
        Some("FLASH".to_string()),
        Some(1),
        Some(50),
        enclave_pk,
        "hash".to_string(),
        Some(50),
        Some(allowed.clone()),
        None,
    );
    let p_hash = contract.get_policy_hash(syn_id.clone());

    // Deposit 50 flyers (1 NEAR each = 50 NEAR total)
    for i in 0..50 {
        let flyer: AccountId = format!("f{:02}.near", i).parse().unwrap();
        let ctx = get_context(flyer, NearToken::from_near(1), 101 + i as u64);
        testing_env!(ctx.build());
        contract.deposit(syn_id.clone(), p_hash.clone());
    }

    let syn = contract.get_syndicate(syn_id.clone()).unwrap();
    assert_eq!(syn.active_flyer_count, 50);
    assert_eq!(syn.total_escrow, NearToken::from_near(50));

    let allocations = vec![Allocation {
        recipient: allowed,
        amount: NearToken::from_near(50),
    }];
    let alloc_hash = compute_allocations_hash(&allocations);
    let (_, sig) = make_enclave_key_and_signature(
        "fly-coordinator.testnet",
        &syn_id,
        1,
        &syn.round_nonce,
        &alloc_hash,
        "order_gas_50",
    );

    let ctx = get_context(owner, NearToken::from_near(0), 160);
    testing_env!(ctx.build());
    contract.settle_batch(
        syn_id.clone(),
        syn.round_nonce,
        "order_gas_50".to_string(),
        allocations.clone(),
        sig,
    );

    // Now execute callback with success
    let self_account: AccountId = "fly-coordinator.testnet".parse().unwrap();
    let ctx = get_context(self_account, NearToken::from_near(0), 161);
    testing_env_with_promise_results(ctx.build(), PromiseResult::Successful(vec![]));
    let success = contract.on_settlement_payout(
        syn_id.clone(),
        allocations,
        vec![],
        NearToken::from_near(50),
        alloc_hash,
        "order_gas_50".to_string(),
    );
    assert!(success);

    let syn_final = contract.get_syndicate(syn_id).unwrap();
    assert_eq!(syn_final.status, SyndicateStatus::Settled);
    assert_eq!(syn_final.active_flyer_count, 0);
    assert_eq!(syn_final.total_escrow.as_yoctonear(), 0);
}

// ---- Regression: a partial Flash settlement must not be replayable --------------------------------
// Found 2026-11-04: round_nonce was rotated only for DarkVault, so one Roost signature for 3 NEAR could be
// replayed by anyone until the escrow was drained (10 -> 7 -> 4 -> 1). The signature binds the nonce, so
// rotating it after every settlement that leaves escrow behind makes the old signature unusable.

/// Hatches a FLASH syndicate with 10 NEAR escrow and settles 3 NEAR once; returns the state needed to replay.
fn partially_settled_flash(
    id: &str,
) -> (
    FlyCoordinator,
    String,
    String,
    Vec<Allocation>,
    String,
    AccountId,
) {
    let owner: AccountId = "alice.near".parse().unwrap();
    testing_env!(get_context(owner.clone(), NearToken::from_near(1), 100).build());
    let mut contract = FlyCoordinator::new();
    let (enclave_pk, _) =
        make_enclave_key_and_signature("fly-coordinator.testnet", id, 1, "", "", "");
    let syn_id = contract.hatch(
        id.to_string(),
        Some("FLASH".to_string()),
        Some(1),
        Some(50),
        enclave_pk,
        "hash".to_string(),
        Some(30),
        None,
        None,
    );
    let p_hash = contract.get_policy_hash(syn_id.clone());
    let f1: AccountId = "flyer1.near".parse().unwrap();
    testing_env!(get_context(f1, NearToken::from_near(10), 105).build());
    contract.deposit(syn_id.clone(), p_hash);

    let syn = contract.get_syndicate(syn_id.clone()).unwrap();
    let allocations = vec![Allocation {
        recipient: syn.payout_recipient.clone(),
        amount: NearToken::from_near(3),
    }];
    let alloc_hash = compute_allocations_hash(&allocations);
    let (_, sig) = make_enclave_key_and_signature(
        "fly-coordinator.testnet",
        &syn_id,
        1,
        &syn.round_nonce,
        &alloc_hash,
        "order_hash",
    );
    testing_env!(get_context(owner.clone(), NearToken::from_near(0), 110).build());
    contract.settle_batch(
        syn_id.clone(),
        syn.round_nonce.clone(),
        "order_hash".to_string(),
        allocations.clone(),
        sig.clone(),
    );
    let selfid: AccountId = "fly-coordinator.testnet".parse().unwrap();
    testing_env_with_promise_results(
        get_context(selfid, NearToken::from_near(0), 111).build(),
        PromiseResult::Successful(vec![]),
    );
    assert!(contract.on_settlement_payout(
        syn_id.clone(),
        allocations.clone(),
        vec![],
        NearToken::from_near(3),
        alloc_hash,
        "order_hash".to_string(),
    ));
    (contract, syn_id, syn.round_nonce, allocations, sig, owner)
}

#[test]
#[should_panic(expected = "Nonce mismatch")]
fn test_partial_flash_settlement_cannot_be_replayed() {
    let (mut contract, syn_id, old_nonce, allocations, sig, owner) =
        partially_settled_flash("replay-swarm");
    assert_eq!(
        contract
            .get_syndicate(syn_id.clone())
            .unwrap()
            .total_escrow
            .as_near(),
        7
    );
    testing_env!(get_context(owner, NearToken::from_near(0), 120).build());
    // Exactly what the first call sent, byte for byte.
    contract.settle_batch(
        syn_id,
        old_nonce,
        "order_hash".to_string(),
        allocations,
        sig,
    );
}

#[test]
fn test_partial_flash_settlement_rotates_nonce_but_keeps_epoch_and_timer() {
    let (contract, syn_id, old_nonce, _, _, _) = partially_settled_flash("rotate-swarm");
    let syn = contract.get_syndicate(syn_id).unwrap();
    assert_ne!(
        syn.round_nonce, old_nonce,
        "nonce must change after a partial settlement"
    );
    assert_eq!(syn.epoch, 1, "a Flash syndicate stays in epoch 1");
    assert_eq!(
        syn.epoch_start_block, 100,
        "the hatch_out timer must not restart for Flash"
    );
    assert_eq!(syn.status, SyndicateStatus::Active);
}

#[test]
fn test_partial_flash_settlement_allows_a_fresh_signature_on_the_new_nonce() {
    let (mut contract, syn_id, _, _, _, owner) = partially_settled_flash("next-swarm");
    let syn = contract.get_syndicate(syn_id.clone()).unwrap();
    let allocations = vec![Allocation {
        recipient: syn.payout_recipient.clone(),
        amount: NearToken::from_near(2),
    }];
    let alloc_hash = compute_allocations_hash(&allocations);
    let (_, sig) = make_enclave_key_and_signature(
        "fly-coordinator.testnet",
        &syn_id,
        1,
        &syn.round_nonce,
        &alloc_hash,
        "order_hash_2",
    );
    testing_env!(get_context(owner, NearToken::from_near(0), 121).build());
    contract.settle_batch(
        syn_id.clone(),
        syn.round_nonce,
        "order_hash_2".to_string(),
        allocations,
        sig,
    );
    assert_eq!(
        contract
            .get_syndicate(syn_id)
            .unwrap()
            .total_escrow
            .as_near(),
        5
    );
}

// ---- Pruning finished syndicates (GAP-010: records were never removed) ----------------------------------------

/// Hatches a FLASH syndicate at block 100, deposits 10 NEAR from flyer1 and settles all of it. Returns everything a
/// test needs to try to replay the settlement later.
fn settled_flash(
    contract: &mut FlyCoordinator,
    id: &str,
    hatch_block: u64,
) -> (String, Vec<Allocation>, String) {
    let owner: AccountId = "alice.near".parse().unwrap();
    testing_env!(get_context(owner.clone(), NearToken::from_near(1), hatch_block).build());
    let (enclave_pk, _) =
        make_enclave_key_and_signature("fly-coordinator.testnet", id, 1, "", "", "");
    let syn_id = contract.hatch(
        id.to_string(),
        Some("FLASH".to_string()),
        Some(1),
        Some(50),
        enclave_pk,
        "hash".to_string(),
        Some(30),
        None,
        None,
    );
    let p_hash = contract.get_policy_hash(syn_id.clone());
    let f1: AccountId = "flyer1.near".parse().unwrap();
    testing_env!(get_context(f1, NearToken::from_near(10), hatch_block + 5).build());
    contract.deposit(syn_id.clone(), p_hash);

    let syn = contract.get_syndicate(syn_id.clone()).unwrap();
    let allocations = vec![Allocation {
        recipient: syn.payout_recipient.clone(),
        amount: NearToken::from_near(10),
    }];
    let alloc_hash = compute_allocations_hash(&allocations);
    let (_, sig) = make_enclave_key_and_signature(
        "fly-coordinator.testnet",
        &syn_id,
        1,
        &syn.round_nonce,
        &alloc_hash,
        "order_hash",
    );
    testing_env!(get_context(owner, NearToken::from_near(0), hatch_block + 10).build());
    contract.settle_batch(
        syn_id.clone(),
        syn.round_nonce.clone(),
        "order_hash".to_string(),
        allocations.clone(),
        sig.clone(),
    );
    let selfid: AccountId = "fly-coordinator.testnet".parse().unwrap();
    testing_env_with_promise_results(
        get_context(selfid, NearToken::from_near(0), hatch_block + 11).build(),
        PromiseResult::Successful(vec![]),
    );
    assert!(contract.on_settlement_payout(
        syn_id.clone(),
        allocations.clone(),
        vec![],
        NearToken::from_near(10),
        alloc_hash,
        "order_hash".to_string(),
    ));
    assert_eq!(
        contract.get_syndicate(syn_id.clone()).unwrap().status,
        SyndicateStatus::Settled
    );
    (syn_id, allocations, sig)
}

#[test]
fn test_prune_removes_a_settled_syndicate_and_logs_it() {
    let mut contract = FlyCoordinator::new();
    let (id, _, _) = settled_flash(&mut contract, "prune-swarm", 100);
    assert_eq!(contract.get_syndicate_count(), 1);
    let caller: AccountId = "anyone.near".parse().unwrap();
    testing_env!(get_context(caller, NearToken::from_near(0), 200).build());
    contract.prune_syndicate(id.clone());
    assert!(contract.get_syndicate(id.clone()).is_none());
    assert_eq!(contract.get_syndicate_count(), 0);
    assert!(contract.list_syndicates(None, None).is_empty());
    let logs = near_sdk::test_utils::get_logs().join("\n");
    assert!(logs.contains("syndicate_pruned") && logs.contains("\"final_status\":\"Settled\""));
    let owner: AccountId = "alice.near".parse().unwrap();
    assert_eq!(contract.get_member_syndicate_count(owner), 0);
}

#[test]
#[should_panic(
    expected = "[Prune REJECT] Only a Settled or AbortedRefunded syndicate, or one that was never funded, can be pruned."
)]
fn test_prune_refuses_an_active_syndicate() {
    let owner: AccountId = "alice.near".parse().unwrap();
    testing_env!(get_context(owner.clone(), NearToken::from_near(1), 100).build());
    let mut contract = FlyCoordinator::new();
    let (enclave_pk, _) =
        make_enclave_key_and_signature("fly-coordinator.testnet", "live-swarm", 1, "", "", "");
    let id = contract.hatch(
        "live-swarm".to_string(),
        Some("FLASH".to_string()),
        Some(1),
        Some(50),
        enclave_pk,
        "hash".to_string(),
        Some(30),
        None,
        None,
    );
    // funded, so it is a live group and not a never-funded one
    let p_hash = contract.get_policy_hash(id.clone());
    testing_env!(get_context("bob.near".parse().unwrap(), NearToken::from_near(1), 101).build());
    contract.deposit(id.clone(), p_hash);
    testing_env!(get_context(owner, NearToken::from_near(0), 102).build());
    contract.prune_syndicate(id);
}

#[test]
#[should_panic(expected = "Syndicate not found")]
fn test_prune_refuses_an_unknown_syndicate() {
    let owner: AccountId = "alice.near".parse().unwrap();
    testing_env!(get_context(owner, NearToken::from_near(0), 100).build());
    let mut contract = FlyCoordinator::new();
    contract.prune_syndicate("never-existed".to_string());
}

#[test]
fn test_prune_an_aborted_refunded_syndicate() {
    let owner: AccountId = "alice.near".parse().unwrap();
    testing_env!(get_context(owner.clone(), NearToken::from_near(1), 100).build());
    let mut contract = FlyCoordinator::new();
    let (enclave_pk, _) =
        make_enclave_key_and_signature("fly-coordinator.testnet", "abort-swarm", 1, "", "", "");
    let id = contract.hatch(
        "abort-swarm".to_string(),
        Some("FLASH".to_string()),
        Some(1),
        Some(50),
        enclave_pk,
        "hash".to_string(),
        Some(30),
        None,
        None,
    );
    let p_hash = contract.get_policy_hash(id.clone());
    let f1: AccountId = "flyer1.near".parse().unwrap();
    testing_env!(get_context(f1.clone(), NearToken::from_near(5), 105).build());
    contract.deposit(id.clone(), p_hash);
    testing_env!(get_context(f1, NearToken::from_near(0), 200).build());
    let _ = contract.hatch_out(id.clone());
    assert_eq!(
        contract.get_syndicate(id.clone()).unwrap().status,
        SyndicateStatus::AbortedRefunded
    );
    contract.prune_syndicate(id.clone());
    assert!(contract.get_syndicate(id).is_none());
}

#[test]
#[should_panic(expected = "Nonce mismatch")]
fn test_a_pruned_id_can_be_reused_and_the_old_signature_is_dead() {
    let mut contract = FlyCoordinator::new();
    let (id, allocations, old_sig) = settled_flash(&mut contract, "reuse-swarm", 100);
    let old_nonce = {
        // the first round nonce is sha256(id:created_block); recompute what the old syndicate had
        let seed = format!("{}:{}", id, 100);
        near_sdk::env::sha256(seed.as_bytes())
            .iter()
            .map(|b| format!("{:02x}", b))
            .collect::<String>()
    };
    testing_env!(get_context("anyone.near".parse().unwrap(), NearToken::from_near(0), 150).build());
    contract.prune_syndicate(id.clone());

    // someone hatches the same id again, later, with the same enclave key
    let owner: AccountId = "alice.near".parse().unwrap();
    testing_env!(get_context(owner.clone(), NearToken::from_near(1), 300).build());
    let (enclave_pk, _) =
        make_enclave_key_and_signature("fly-coordinator.testnet", &id, 1, "", "", "");
    contract.hatch(
        id.clone(),
        Some("FLASH".to_string()),
        Some(1),
        Some(50),
        enclave_pk,
        "hash".to_string(),
        Some(30),
        None,
        None,
    );
    let p_hash = contract.get_policy_hash(id.clone());
    let f1: AccountId = "flyer1.near".parse().unwrap();
    testing_env!(get_context(f1, NearToken::from_near(10), 305).build());
    contract.deposit(id.clone(), p_hash);
    let fresh = contract.get_syndicate(id.clone()).unwrap();
    assert_ne!(
        fresh.round_nonce, old_nonce,
        "the new syndicate must have a different nonce"
    );

    // replay the OLD settlement, byte for byte
    testing_env!(get_context(owner, NearToken::from_near(0), 310).build());
    contract.settle_batch(
        id,
        old_nonce,
        "order_hash".to_string(),
        allocations,
        old_sig,
    );
}

#[test]
fn test_compact_member_index_drops_ids_of_pruned_syndicates() {
    let mut contract = FlyCoordinator::new();
    let (a, _, _) = settled_flash(&mut contract, "compact-a", 100);
    let (_b, _, _) = settled_flash(&mut contract, "compact-b", 200);
    let f1: AccountId = "flyer1.near".parse().unwrap();
    assert_eq!(contract.get_member_syndicate_count(f1.clone()), 2);
    testing_env!(get_context("anyone.near".parse().unwrap(), NearToken::from_near(0), 400).build());
    contract.prune_syndicate(a);
    // pruning cannot reach the flyer's index (the finished syndicate no longer lists them): the id lingers
    assert_eq!(contract.get_member_syndicate_count(f1.clone()), 2);
    assert_eq!(
        contract
            .list_syndicates_by_member(f1.clone(), None, None)
            .len(),
        1,
        "the view skips the missing record"
    );
    assert_eq!(contract.compact_member_index(f1.clone()), 1);
    assert_eq!(contract.get_member_syndicate_count(f1.clone()), 1);
    assert_eq!(
        contract.compact_member_index(f1),
        0,
        "compacting twice removes nothing"
    );
}

/// The case from the 2026-11-05 testnet run: four members deposit 0.05 NEAR each, 0.10 NEAR is paid out.
/// Each must bear 0.025 NEAR. With balance * payout overflowing u128, one member was charged 0.05 and the others ~0.
#[test]
fn pro_rata_deductions_four_equal_deposits_of_005_near_partial_payout_of_010() {
    let near = |x: u128| x * 10u128.pow(22); // x hundredths of a NEAR
    let balances: Vec<(AccountId, u128)> = ["a", "b", "c", "d"]
        .iter()
        .map(|n| (format!("{}.near", n).parse().unwrap(), near(5)))
        .collect();
    let deductions = fly_coordinator::compute_pro_rata_deductions(&balances, near(10), near(20));
    for (who, d) in &deductions {
        assert_eq!(
            *d,
            near(10) / 4,
            "{} must bear exactly a quarter of the 0.10 payout, got {} yocto",
            who,
            d
        );
    }
    assert_eq!(deductions.iter().map(|(_, d)| *d).sum::<u128>(), near(10));
}

#[test]
fn mul_div_floor_is_exact_across_the_u128_range() {
    use fly_coordinator::mul_div_floor;
    assert_eq!(mul_div_floor(5, 7, 3), 11);
    assert_eq!(mul_div_floor(0, 99, 7), 0);
    let near = |x: u128| x * 10u128.pow(22);
    assert_eq!(mul_div_floor(near(5), near(10), near(20)), near(10) / 4);
    // a * b = 2^200 exactly, divided by 2^100 = 2^100
    assert_eq!(
        mul_div_floor(1u128 << 100, 1u128 << 100, 1u128 << 100),
        1u128 << 100
    );
    assert_eq!(mul_div_floor(u128::MAX, u128::MAX, u128::MAX), u128::MAX);
    assert_eq!(mul_div_floor(u128::MAX, 1, u128::MAX), 1);
    assert_eq!(
        mul_div_floor(u128::MAX - 1, u128::MAX, u128::MAX),
        u128::MAX - 1
    );
    // the quotient does not fit in u128: saturates instead of wrapping
    assert_eq!(mul_div_floor(u128::MAX, u128::MAX, 1), u128::MAX);
}

// ---------------------------------------------------------------------------------------------------------------
// settle_batch_charged: the room names how much each member pays toward a payout (auctions, per-member investing)
// ---------------------------------------------------------------------------------------------------------------

fn sign_charged(
    syndicate_id: &str,
    epoch: u64,
    nonce: &str,
    allocations_hash: &str,
    charges_hash: &str,
    order_hash: &str,
) -> String {
    let signing_key = SigningKey::from_bytes(&[42u8; 32]);
    let message = format!(
        "fly-coordinator.testnet:{}:{}:{}:{}:{}:{}",
        syndicate_id, epoch, nonce, allocations_hash, charges_hash, order_hash
    );
    hex::encode(signing_key.sign(message.as_bytes()).to_bytes())
}

/// Three members each deposit 10 NEAR into a syndicate whose only allowed recipient is r.near.
fn charged_setup(id: &str) -> (FlyCoordinator, String, String, [AccountId; 3]) {
    let owner: AccountId = "alice.near".parse().unwrap();
    testing_env!(get_context(owner, NearToken::from_near(1), 100).build());
    let mut contract = FlyCoordinator::new();
    let (pk, _) = make_enclave_key_and_signature("fly-coordinator.testnet", id, 1, "", "", "");
    let syn_id = contract.hatch(
        id.to_string(),
        Some("FLASH".to_string()),
        Some(1),
        Some(50),
        pk,
        "hash".to_string(),
        Some(30),
        Some("r.near".parse().unwrap()),
        None,
    );
    let p_hash = contract.get_policy_hash(syn_id.clone());
    let members: [AccountId; 3] = [
        "a.near".parse().unwrap(),
        "b.near".parse().unwrap(),
        "c.near".parse().unwrap(),
    ];
    for (i, m) in members.iter().enumerate() {
        testing_env!(get_context(m.clone(), NearToken::from_near(10), 105 + i as u64).build());
        contract.deposit(syn_id.clone(), p_hash.clone());
    }
    let nonce = contract.get_syndicate(syn_id.clone()).unwrap().round_nonce;
    (contract, syn_id, nonce, members)
}

fn pay_r(amount_near: u128) -> Vec<Allocation> {
    vec![Allocation {
        recipient: "r.near".parse().unwrap(),
        amount: NearToken::from_near(amount_near),
    }]
}

fn charge(member: &AccountId, near: u128) -> Charge {
    Charge {
        member: member.clone(),
        amount: NearToken::from_near(near),
    }
}

fn settle_charged_as_owner(
    contract: &mut FlyCoordinator,
    syn_id: &str,
    nonce: &str,
    allocations: Vec<Allocation>,
    charges: Vec<Charge>,
    sign_over: &[Charge],
) {
    let sig = sign_charged(
        syn_id,
        1,
        nonce,
        &compute_allocations_hash(&allocations),
        &compute_charges_hash(sign_over),
        "order",
    );
    testing_env!(get_context("alice.near".parse().unwrap(), NearToken::from_near(0), 120).build());
    contract.settle_batch_charged(
        syn_id.to_string(),
        nonce.to_string(),
        "order".to_string(),
        allocations,
        charges,
        sig,
    );
}

#[test]
fn charged_settlement_charges_each_member_their_own_amount() {
    let (mut c, id, nonce, m) = charged_setup("chg-ok");
    let charges = vec![charge(&m[0], 2), charge(&m[1], 4), charge(&m[2], 6)];
    settle_charged_as_owner(&mut c, &id, &nonce, pay_r(12), charges.clone(), &charges);
    testing_env_with_promise_results(
        get_context(
            "fly-coordinator.testnet".parse().unwrap(),
            NearToken::from_near(0),
            121,
        )
        .build(),
        PromiseResult::Successful(vec![]),
    );
    assert!(c.on_settlement_payout(
        id.clone(),
        pay_r(12),
        charges,
        NearToken::from_near(12),
        compute_allocations_hash(&pay_r(12)),
        "order".to_string(),
    ));
    // each member paid exactly their own charge, not a third of 12
    assert_eq!(
        c.get_escrow(id.clone(), m[0].clone()),
        NearToken::from_near(8)
    );
    assert_eq!(
        c.get_escrow(id.clone(), m[1].clone()),
        NearToken::from_near(6)
    );
    assert_eq!(
        c.get_escrow(id.clone(), m[2].clone()),
        NearToken::from_near(4)
    );
    let syn = c.get_syndicate(id).unwrap();
    assert_eq!(syn.total_escrow, NearToken::from_near(18));
    assert_eq!(syn.status, SyndicateStatus::Active);
}

#[test]
#[should_panic(expected = "exceeds that member's escrow")]
fn charged_settlement_rejects_a_charge_above_the_members_deposit() {
    let (mut c, id, nonce, m) = charged_setup("chg-over");
    let charges = vec![charge(&m[0], 11), charge(&m[1], 1)];
    settle_charged_as_owner(&mut c, &id, &nonce, pay_r(12), charges.clone(), &charges);
}

#[test]
#[should_panic(expected = "Charges must sum to exactly the payout")]
fn charged_settlement_rejects_charges_that_do_not_sum_to_the_payout() {
    let (mut c, id, nonce, m) = charged_setup("chg-sum");
    let charges = vec![charge(&m[0], 2), charge(&m[1], 4)];
    settle_charged_as_owner(&mut c, &id, &nonce, pay_r(12), charges.clone(), &charges);
}

#[test]
#[should_panic(expected = "Duplicate member in charges")]
fn charged_settlement_rejects_a_member_charged_twice() {
    let (mut c, id, nonce, m) = charged_setup("chg-dup");
    let charges = vec![charge(&m[0], 6), charge(&m[0], 6)];
    settle_charged_as_owner(&mut c, &id, &nonce, pay_r(12), charges.clone(), &charges);
}

#[test]
#[should_panic(expected = "exceeds that member's escrow")]
fn charged_settlement_rejects_charging_someone_who_never_deposited() {
    let (mut c, id, nonce, _m) = charged_setup("chg-ghost");
    let ghost: AccountId = "ghost.near".parse().unwrap();
    let charges = vec![charge(&ghost, 12)];
    settle_charged_as_owner(&mut c, &id, &nonce, pay_r(12), charges.clone(), &charges);
}

#[test]
#[should_panic(expected = "Invalid enclave Ed25519 signature")]
fn charged_settlement_rejects_charges_other_than_the_ones_signed() {
    let (mut c, id, nonce, m) = charged_setup("chg-tamper");
    let signed = vec![charge(&m[0], 2), charge(&m[1], 4), charge(&m[2], 6)];
    let submitted = vec![charge(&m[0], 6), charge(&m[1], 4), charge(&m[2], 2)];
    settle_charged_as_owner(&mut c, &id, &nonce, pay_r(12), submitted, &signed);
}

#[test]
#[should_panic(expected = "Invalid enclave Ed25519 signature")]
fn a_plain_settlement_signature_cannot_authorise_a_charged_settlement() {
    let (mut c, id, nonce, m) = charged_setup("chg-xsig1");
    let allocations = pay_r(12);
    let (_, plain_sig) = make_enclave_key_and_signature(
        "fly-coordinator.testnet",
        &id,
        1,
        &nonce,
        &compute_allocations_hash(&allocations),
        "order",
    );
    testing_env!(get_context("alice.near".parse().unwrap(), NearToken::from_near(0), 120).build());
    c.settle_batch_charged(
        id,
        nonce,
        "order".to_string(),
        allocations,
        vec![charge(&m[0], 6), charge(&m[1], 6)],
        plain_sig,
    );
}

#[test]
#[should_panic(expected = "Invalid enclave Ed25519 signature")]
fn a_charged_settlement_signature_cannot_authorise_a_plain_settlement() {
    let (mut c, id, nonce, m) = charged_setup("chg-xsig2");
    let allocations = pay_r(12);
    let charges = vec![charge(&m[0], 12)];
    let charged_sig = sign_charged(
        &id,
        1,
        &nonce,
        &compute_allocations_hash(&allocations),
        &compute_charges_hash(&charges),
        "order",
    );
    testing_env!(get_context("alice.near".parse().unwrap(), NearToken::from_near(0), 120).build());
    c.settle_batch(id, nonce, "order".to_string(), allocations, charged_sig);
}

#[test]
fn a_failed_charged_payout_leaves_every_members_escrow_untouched() {
    let (mut c, id, nonce, m) = charged_setup("chg-fail");
    let charges = vec![charge(&m[0], 2), charge(&m[1], 4), charge(&m[2], 6)];
    settle_charged_as_owner(&mut c, &id, &nonce, pay_r(12), charges.clone(), &charges);
    testing_env_with_promise_results(
        get_context(
            "fly-coordinator.testnet".parse().unwrap(),
            NearToken::from_near(0),
            121,
        )
        .build(),
        PromiseResult::Failed,
    );
    assert!(!c.on_settlement_payout(
        id.clone(),
        pay_r(12),
        charges,
        NearToken::from_near(12),
        compute_allocations_hash(&pay_r(12)),
        "order".to_string(),
    ));
    for member in &m {
        assert_eq!(
            c.get_escrow(id.clone(), member.clone()),
            NearToken::from_near(10)
        );
    }
    assert_eq!(
        c.get_syndicate(id).unwrap().total_escrow,
        NearToken::from_near(30)
    );
}

/// Cross-language vector: the Roost (JavaScript) computes this same value in lab/experiments/72-auction-programs.js.
/// If the two ever disagree, every charged settlement signature would be rejected by the contract.
#[test]
fn charges_hash_matches_the_roosts_javascript_implementation() {
    let charges = vec![
        Charge {
            member: "b.near".parse().unwrap(),
            amount: NearToken::from_near(4),
        },
        Charge {
            member: "a.near".parse().unwrap(),
            amount: NearToken::from_near(2),
        },
    ];
    assert_eq!(
        compute_charges_hash(&charges),
        "277962d41d643c5f0b7aaf5616124070cdb5f906d57e7a5ab0f6906f9c7e8be9"
    );
}

// ---------------------------------------------------------------------------------------------------------------
// Two-room agreement: a syndicate registers two room keys, and a settlement needs BOTH to sign the same message
// ---------------------------------------------------------------------------------------------------------------

const ROOM_A: u8 = 42;
const ROOM_B: u8 = 7;

fn room_pk(seed: u8) -> String {
    hex::encode(
        SigningKey::from_bytes(&[seed; 32])
            .verifying_key()
            .to_bytes(),
    )
}

fn room_sign(seed: u8, message: &str) -> String {
    hex::encode(
        SigningKey::from_bytes(&[seed; 32])
            .sign(message.as_bytes())
            .to_bytes(),
    )
}

fn plain_msg(id: &str, nonce: &str, allocations: &[Allocation], order: &str) -> String {
    format!(
        "fly-coordinator.testnet:{}:1:{}:{}:{}",
        id,
        nonce,
        compute_allocations_hash(allocations),
        order
    )
}

fn charged_msg(
    id: &str,
    nonce: &str,
    allocations: &[Allocation],
    charges: &[Charge],
    order: &str,
) -> String {
    format!(
        "fly-coordinator.testnet:{}:1:{}:{}:{}:{}",
        id,
        nonce,
        compute_allocations_hash(allocations),
        compute_charges_hash(charges),
        order
    )
}

/// Same as charged_setup, but the syndicate registers two room keys.
fn two_room_setup(id: &str) -> (FlyCoordinator, String, String, [AccountId; 3]) {
    let owner: AccountId = "alice.near".parse().unwrap();
    testing_env!(get_context(owner, NearToken::from_near(1), 100).build());
    let mut contract = FlyCoordinator::new();
    let syn_id = contract.hatch_two_room(
        id.to_string(),
        Some("FLASH".to_string()),
        Some(1),
        Some(50),
        room_pk(ROOM_A),
        room_pk(ROOM_B),
        "hash".to_string(),
        Some(30),
        Some("r.near".parse().unwrap()),
        None,
    );
    let p_hash = contract.get_policy_hash(syn_id.clone());
    let members: [AccountId; 3] = [
        "a.near".parse().unwrap(),
        "b.near".parse().unwrap(),
        "c.near".parse().unwrap(),
    ];
    for (i, m) in members.iter().enumerate() {
        testing_env!(get_context(m.clone(), NearToken::from_near(10), 105 + i as u64).build());
        contract.deposit(syn_id.clone(), p_hash.clone());
    }
    let nonce = contract.get_syndicate(syn_id.clone()).unwrap().round_nonce;
    (contract, syn_id, nonce, members)
}

fn as_owner_at_120() {
    testing_env!(get_context("alice.near".parse().unwrap(), NearToken::from_near(0), 120).build());
}

#[test]
fn two_room_settlement_pays_when_both_rooms_sign_the_same_message() {
    let (mut c, id, nonce, _) = two_room_setup("tr-ok");
    let alloc = pay_r(12);
    let msg = plain_msg(&id, &nonce, &alloc, "order");
    as_owner_at_120();
    c.settle_batch_two_room(
        id.clone(),
        nonce,
        "order".to_string(),
        alloc,
        room_sign(ROOM_A, &msg),
        room_sign(ROOM_B, &msg),
    );
    assert!(c.get_syndicate(id).unwrap().is_settling);
}

#[test]
fn two_room_syndicate_exposes_its_second_key_and_a_one_room_one_does_not() {
    let (c, id, _, _) = two_room_setup("tr-view");
    assert_eq!(c.get_second_enclave_key(id), Some(room_pk(ROOM_B)));
    let (c1, id1, _, _) = charged_setup("one-room-view");
    assert_eq!(c1.get_second_enclave_key(id1), None);
}

#[test]
#[should_panic(expected = "second room")]
fn two_room_settlement_rejects_a_bad_second_signature() {
    let (mut c, id, nonce, _) = two_room_setup("tr-bad-b");
    let alloc = pay_r(12);
    let msg = plain_msg(&id, &nonce, &alloc, "order");
    as_owner_at_120();
    c.settle_batch_two_room(
        id,
        nonce,
        "order".to_string(),
        alloc,
        room_sign(ROOM_A, &msg),
        room_sign(ROOM_B, "something else entirely"),
    );
}

#[test]
#[should_panic(expected = "first room")]
fn two_room_settlement_rejects_a_bad_first_signature() {
    let (mut c, id, nonce, _) = two_room_setup("tr-bad-a");
    let alloc = pay_r(12);
    let msg = plain_msg(&id, &nonce, &alloc, "order");
    as_owner_at_120();
    c.settle_batch_two_room(
        id,
        nonce,
        "order".to_string(),
        alloc,
        room_sign(ROOM_A, "something else entirely"),
        room_sign(ROOM_B, &msg),
    );
}

#[test]
#[should_panic(expected = "second room")]
fn one_room_signing_twice_is_not_two_rooms() {
    let (mut c, id, nonce, _) = two_room_setup("tr-same-twice");
    let alloc = pay_r(12);
    let msg = plain_msg(&id, &nonce, &alloc, "order");
    as_owner_at_120();
    let a = room_sign(ROOM_A, &msg);
    c.settle_batch_two_room(id, nonce, "order".to_string(), alloc, a.clone(), a);
}

#[test]
#[should_panic(expected = "second room")]
fn two_rooms_that_computed_different_payouts_cannot_settle() {
    let (mut c, id, nonce, _) = two_room_setup("tr-disagree");
    let alloc = pay_r(12);
    let honest = plain_msg(&id, &nonce, &alloc, "order");
    // room B computed a different payout (13) and signed that instead
    let other = plain_msg(&id, &nonce, &pay_r(13), "order");
    as_owner_at_120();
    c.settle_batch_two_room(
        id,
        nonce,
        "order".to_string(),
        alloc,
        room_sign(ROOM_A, &honest),
        room_sign(ROOM_B, &other),
    );
}

#[test]
#[should_panic(expected = "different")]
fn a_two_room_syndicate_cannot_register_the_same_key_twice() {
    testing_env!(get_context("alice.near".parse().unwrap(), NearToken::from_near(1), 100).build());
    let mut c = FlyCoordinator::new();
    c.hatch_two_room(
        "tr-dup".to_string(),
        Some("FLASH".to_string()),
        Some(1),
        Some(50),
        room_pk(ROOM_A),
        room_pk(ROOM_A),
        "hash".to_string(),
        Some(30),
        Some("r.near".parse().unwrap()),
        None,
    );
}

#[test]
#[should_panic(expected = "two-room")]
fn a_two_room_syndicate_refuses_a_single_signature_settlement() {
    let (mut c, id, nonce, _) = two_room_setup("tr-single");
    let alloc = pay_r(12);
    let msg = plain_msg(&id, &nonce, &alloc, "order");
    as_owner_at_120();
    c.settle_batch(
        id,
        nonce,
        "order".to_string(),
        alloc,
        room_sign(ROOM_A, &msg),
    );
}

#[test]
#[should_panic(expected = "two-room")]
fn a_two_room_syndicate_refuses_a_single_signature_charged_settlement() {
    let (mut c, id, nonce, m) = two_room_setup("tr-single-chg");
    let alloc = pay_r(12);
    let charges = vec![charge(&m[0], 2), charge(&m[1], 4), charge(&m[2], 6)];
    let msg = charged_msg(&id, &nonce, &alloc, &charges, "order");
    as_owner_at_120();
    c.settle_batch_charged(
        id,
        nonce,
        "order".to_string(),
        alloc,
        charges,
        room_sign(ROOM_A, &msg),
    );
}

#[test]
#[should_panic(expected = "not a two-room")]
fn a_one_room_syndicate_refuses_a_two_room_settlement() {
    let (mut c, id, nonce, _) = charged_setup("one-room-refuses");
    let alloc = pay_r(12);
    let msg = plain_msg(&id, &nonce, &alloc, "order");
    as_owner_at_120();
    c.settle_batch_two_room(
        id,
        nonce,
        "order".to_string(),
        alloc,
        room_sign(ROOM_A, &msg),
        room_sign(ROOM_B, &msg),
    );
}

#[test]
fn two_room_charged_settlement_pays_when_both_rooms_sign_the_charges() {
    let (mut c, id, nonce, m) = two_room_setup("tr-chg-ok");
    let alloc = pay_r(12);
    let charges = vec![charge(&m[0], 2), charge(&m[1], 4), charge(&m[2], 6)];
    let msg = charged_msg(&id, &nonce, &alloc, &charges, "order");
    as_owner_at_120();
    c.settle_batch_charged_two_room(
        id.clone(),
        nonce,
        "order".to_string(),
        alloc,
        charges,
        room_sign(ROOM_A, &msg),
        room_sign(ROOM_B, &msg),
    );
    assert!(c.get_syndicate(id).unwrap().is_settling);
}

#[test]
#[should_panic(expected = "second room")]
fn two_rooms_that_disagree_on_who_pays_cannot_settle() {
    let (mut c, id, nonce, m) = two_room_setup("tr-chg-disagree");
    let alloc = pay_r(12);
    let honest = vec![charge(&m[0], 2), charge(&m[1], 4), charge(&m[2], 6)];
    // room B charges member a everything
    let greedy = vec![charge(&m[0], 10), charge(&m[1], 1), charge(&m[2], 1)];
    as_owner_at_120();
    c.settle_batch_charged_two_room(
        id.clone(),
        nonce.clone(),
        "order".to_string(),
        alloc.clone(),
        honest.clone(),
        room_sign(ROOM_A, &charged_msg(&id, &nonce, &alloc, &honest, "order")),
        room_sign(ROOM_B, &charged_msg(&id, &nonce, &alloc, &greedy, "order")),
    );
}

#[test]
fn a_pruned_two_room_syndicate_forgets_its_second_key() {
    // Hatch, abort by exit, prune, and the second key is gone; a fresh syndicate under the same id starts clean.
    let (mut c, id, _, m) = two_room_setup("tr-prune");
    testing_env!(get_context(m[0].clone(), NearToken::from_near(0), 100 + 40).build());
    for who in &m {
        testing_env!(get_context(who.clone(), NearToken::from_near(0), 100 + 40).build());
        let _ = c.hatch_out(id.clone());
        testing_env_with_promise_results(
            get_context(
                "fly-coordinator.testnet".parse().unwrap(),
                NearToken::from_near(0),
                141,
            )
            .build(),
            PromiseResult::Successful(vec![]),
        );
        let _ = c.on_hatch_out_payout(id.clone(), who.clone(), NearToken::from_near(10));
    }
    testing_env!(get_context("alice.near".parse().unwrap(), NearToken::from_near(0), 150).build());
    c.prune_syndicate(id.clone());
    assert_eq!(c.get_second_enclave_key(id), None);
}

// ---------------------------------------------------------------------------------------------------------------
// The exit rule (docs/lab/TWO_ROOM_SPEC.md): the release policy limits what the room can pay out, never what a member
// can take back of their own deposit
// ---------------------------------------------------------------------------------------------------------------

#[test]
fn exit_is_not_limited_by_the_release_policy_deadline_or_recipient_list() {
    let owner: AccountId = "alice.near".parse().unwrap();
    testing_env!(get_context(owner, NearToken::from_near(1), 100).build());
    let mut c = FlyCoordinator::new();
    let (pk, _) =
        make_enclave_key_and_signature("fly-coordinator.testnet", "exit-policy", 1, "", "", "");
    let allowed: AccountId = "treasury.near".parse().unwrap();
    let policy = ReleasePolicy {
        allowed_recipients: vec![allowed.clone()],
        max_release_bps_per_epoch: 100, // 1%
        settle_deadline_block: 150,
    };
    let id = c.hatch(
        "exit-policy".to_string(),
        Some("FLASH".to_string()),
        Some(1),
        Some(50),
        pk,
        "hash".to_string(),
        Some(30),
        Some(allowed),
        Some(policy),
    );
    let p_hash = c.get_policy_hash(id.clone());
    let m: AccountId = "member.near".parse().unwrap(); // not on the recipient list
    testing_env!(get_context(m.clone(), NearToken::from_near(10), 105).build());
    c.deposit(id.clone(), p_hash);
    // block 400: far past the settle deadline (150) and the exit timer (100 + 30)
    testing_env!(get_context(m.clone(), NearToken::from_near(0), 400).build());
    let _ = c.hatch_out(id.clone());
    assert_eq!(c.get_escrow(id.clone(), m).as_yoctonear(), 0);
    assert_eq!(
        c.get_syndicate(id).unwrap().status,
        SyndicateStatus::AbortedRefunded
    );
}

#[test]
fn after_a_charged_settlement_exit_returns_the_deposit_less_the_members_own_charge() {
    let (mut c, id, nonce, m) = charged_setup("exit-after-charge");
    let charges = vec![charge(&m[0], 2), charge(&m[1], 4), charge(&m[2], 6)];
    settle_charged_as_owner(&mut c, &id, &nonce, pay_r(12), charges.clone(), &charges);
    testing_env_with_promise_results(
        get_context(
            "fly-coordinator.testnet".parse().unwrap(),
            NearToken::from_near(0),
            121,
        )
        .build(),
        PromiseResult::Successful(vec![]),
    );
    assert!(c.on_settlement_payout(
        id.clone(),
        pay_r(12),
        charges,
        NearToken::from_near(12),
        compute_allocations_hash(&pay_r(12)),
        "order".to_string(),
    ));
    // before exiting, each member's escrow is exactly deposit less their own charge
    assert_eq!(
        c.get_escrow(id.clone(), m[0].clone()),
        NearToken::from_near(8)
    );
    assert_eq!(
        c.get_escrow(id.clone(), m[1].clone()),
        NearToken::from_near(6)
    );
    assert_eq!(
        c.get_escrow(id.clone(), m[2].clone()),
        NearToken::from_near(4)
    );
    // the exit pays out that escrow and no more, and cannot be repeated
    testing_env!(get_context(m[1].clone(), NearToken::from_near(0), 400).build());
    let before_total = c.get_syndicate(id.clone()).unwrap().total_escrow;
    let _ = c.hatch_out(id.clone());
    assert_eq!(c.get_escrow(id.clone(), m[1].clone()).as_yoctonear(), 0);
    assert_eq!(
        before_total.as_yoctonear()
            - c.get_syndicate(id.clone())
                .unwrap()
                .total_escrow
                .as_yoctonear(),
        NearToken::from_near(6).as_yoctonear()
    );
    // the other two are untouched by b's exit
    assert_eq!(
        c.get_escrow(id.clone(), m[0].clone()),
        NearToken::from_near(8)
    );
    assert_eq!(c.get_escrow(id, m[2].clone()), NearToken::from_near(4));
}

#[test]
#[should_panic(expected = "in flight")]
fn exit_is_refused_while_a_settlement_is_in_flight_so_a_late_signature_cannot_race_a_refund() {
    let (mut c, id, nonce, m) = charged_setup("exit-race");
    let charges = vec![charge(&m[0], 2), charge(&m[1], 4), charge(&m[2], 6)];
    settle_charged_as_owner(&mut c, &id, &nonce, pay_r(12), charges.clone(), &charges);
    // the callback has not run: the settlement is in flight
    assert!(c.get_syndicate(id.clone()).unwrap().is_settling);
    testing_env!(get_context(m[0].clone(), NearToken::from_near(0), 400).build());
    let _ = c.hatch_out(id);
}

// ---------------------------------------------------------------------------------------------------------------
// GAP-008: a payout whose follow-up step never runs must not block exits and settlements for ever
// ---------------------------------------------------------------------------------------------------------------

/// Settle (charged, 12 of 30 deposited) at block 120 and leave the callback unrun: the settlement is "stuck".
fn stuck_after_charged_settlement(id: &str) -> (FlyCoordinator, String, [AccountId; 3]) {
    let (mut c, id, nonce, m) = charged_setup(id);
    let charges = vec![charge(&m[0], 2), charge(&m[1], 4), charge(&m[2], 6)];
    settle_charged_as_owner(
        &mut c,
        &id,
        &nonce,
        pay_r(12),
        charges,
        &[charge(&m[0], 2), charge(&m[1], 4), charge(&m[2], 6)],
    );
    assert!(c.get_syndicate(id.clone()).unwrap().is_settling);
    (c, id, m)
}

fn run_the_callback(c: &mut FlyCoordinator, id: &str, m: &[AccountId; 3], block: u64) -> bool {
    let charges = vec![charge(&m[0], 2), charge(&m[1], 4), charge(&m[2], 6)];
    testing_env_with_promise_results(
        get_context(
            "fly-coordinator.testnet".parse().unwrap(),
            NearToken::from_near(0),
            block,
        )
        .build(),
        PromiseResult::Successful(vec![]),
    );
    c.on_settlement_payout(
        id.to_string(),
        pay_r(12),
        charges,
        NearToken::from_near(12),
        compute_allocations_hash(&pay_r(12)),
        "order".to_string(),
    )
}

#[test]
fn a_settlement_in_flight_records_when_it_started() {
    let (c, id, _) = stuck_after_charged_settlement("stuck-rec");
    let pending = c.get_pending_settlement(id).expect("a pending record");
    assert_eq!(pending.since_block, 120);
    assert_eq!(pending.total_payout, NearToken::from_near(12));
}

#[test]
fn a_finished_settlement_leaves_no_pending_record() {
    let (mut c, id, m) = stuck_after_charged_settlement("stuck-done");
    assert!(run_the_callback(&mut c, &id, &m, 121));
    assert!(c.get_pending_settlement(id).is_none());
}

#[test]
#[should_panic(expected = "not stuck yet")]
fn a_stuck_settlement_cannot_be_recovered_too_early() {
    let (mut c, id, _) = stuck_after_charged_settlement("stuck-early");
    testing_env!(get_context(
        "anyone.near".parse().unwrap(),
        NearToken::from_near(0),
        120 + 99
    )
    .build());
    c.recover_stuck_settlement(id);
}

#[test]
fn anyone_can_recover_a_stuck_settlement_and_it_settles_the_books_as_if_the_payout_landed() {
    let (mut c, id, m) = stuck_after_charged_settlement("stuck-ok");
    // a member who is not the owner, not the coordinator, does it themselves
    testing_env!(get_context(m[2].clone(), NearToken::from_near(0), 120 + 100).build());
    c.recover_stuck_settlement(id.clone());
    let syn = c.get_syndicate(id.clone()).unwrap();
    assert!(!syn.is_settling);
    assert_eq!(syn.status, SyndicateStatus::Active);
    // exactly what the callback would have done: each member paid only their own charge
    assert_eq!(
        c.get_escrow(id.clone(), m[0].clone()),
        NearToken::from_near(8)
    );
    assert_eq!(
        c.get_escrow(id.clone(), m[1].clone()),
        NearToken::from_near(6)
    );
    assert_eq!(
        c.get_escrow(id.clone(), m[2].clone()),
        NearToken::from_near(4)
    );
    assert_eq!(syn.total_escrow, NearToken::from_near(18));
    assert!(c.get_pending_settlement(id).is_none());
}

#[test]
fn after_recovery_members_can_exit_and_the_books_balance() {
    let (mut c, id, m) = stuck_after_charged_settlement("stuck-exit");
    testing_env!(get_context(m[0].clone(), NearToken::from_near(0), 120 + 100).build());
    c.recover_stuck_settlement(id.clone());
    testing_env!(get_context(m[1].clone(), NearToken::from_near(0), 400).build());
    let _ = c.hatch_out(id.clone());
    assert_eq!(c.get_escrow(id.clone(), m[1].clone()).as_yoctonear(), 0);
    let total_before = NearToken::from_near(18).as_yoctonear();
    assert_eq!(
        total_before - c.get_syndicate(id).unwrap().total_escrow.as_yoctonear(),
        NearToken::from_near(6).as_yoctonear()
    );
}

#[test]
#[should_panic(expected = "No settlement is in flight")]
fn recovery_is_refused_when_nothing_is_in_flight() {
    let (mut c, id, nonce, _) = charged_setup("stuck-none");
    let _ = nonce;
    testing_env!(get_context("anyone.near".parse().unwrap(), NearToken::from_near(0), 500).build());
    c.recover_stuck_settlement(id);
}

#[test]
#[should_panic(expected = "No settlement is in flight")]
fn recovery_is_refused_after_the_callback_already_ran() {
    let (mut c, id, m) = stuck_after_charged_settlement("stuck-late-rec");
    assert!(run_the_callback(&mut c, &id, &m, 121));
    testing_env!(get_context("anyone.near".parse().unwrap(), NearToken::from_near(0), 500).build());
    c.recover_stuck_settlement(id);
}

#[test]
fn a_late_callback_after_recovery_changes_nothing() {
    let (mut c, id, m) = stuck_after_charged_settlement("stuck-late-cb");
    testing_env!(get_context(m[0].clone(), NearToken::from_near(0), 120 + 100).build());
    c.recover_stuck_settlement(id.clone());
    let before = (
        c.get_escrow(id.clone(), m[0].clone()),
        c.get_escrow(id.clone(), m[1].clone()),
        c.get_escrow(id.clone(), m[2].clone()),
        c.get_syndicate(id.clone()).unwrap().total_escrow,
    );
    // the callback finally arrives: it must not deduct a second time
    let ok = run_the_callback(&mut c, &id, &m, 300);
    assert!(ok);
    let after = (
        c.get_escrow(id.clone(), m[0].clone()),
        c.get_escrow(id.clone(), m[1].clone()),
        c.get_escrow(id.clone(), m[2].clone()),
        c.get_syndicate(id).unwrap().total_escrow,
    );
    assert_eq!(before, after);
}

#[test]
#[should_panic(expected = "in flight")]
fn exit_stays_refused_until_the_stuck_settlement_is_recovered() {
    let (mut c, id, m) = stuck_after_charged_settlement("stuck-exit-wait");
    testing_env!(get_context(m[0].clone(), NearToken::from_near(0), 400).build());
    let _ = c.hatch_out(id);
}

#[test]
fn the_follow_up_step_is_given_gas_in_proportion_to_the_members() {
    use near_sdk::test_utils::get_created_receipts;
    use near_sdk::Gas;
    let callback_gas = || -> u64 {
        let receipts = get_created_receipts();
        let mut gas = 0u64;
        for r in receipts {
            for a in r.actions {
                if let near_sdk::mock::MockAction::FunctionCallWeight {
                    method_name,
                    prepaid_gas,
                    ..
                } = a
                {
                    if method_name == b"on_settlement_payout_for_round" {
                        gas = prepaid_gas.as_gas();
                    }
                }
            }
        }
        gas
    };
    // three members
    let (_c, _id, _) = stuck_after_charged_settlement("gas-3");
    let small = callback_gas();
    assert!(
        small >= Gas::from_tgas(25).as_gas(),
        "never less than before: {small}"
    );
    // fifty members
    let owner: AccountId = "alice.near".parse().unwrap();
    testing_env!(get_context(owner.clone(), NearToken::from_near(1), 100).build());
    let mut c = FlyCoordinator::new();
    let id = c.hatch(
        "gas-50".to_string(),
        Some("FLASH".to_string()),
        Some(1),
        Some(50),
        room_pk(ROOM_A),
        "hash".to_string(),
        Some(30),
        Some("r.near".parse().unwrap()),
        None,
    );
    let p_hash = c.get_policy_hash(id.clone());
    let mut members = Vec::new();
    for i in 0..50 {
        let f: AccountId = format!("m{i}.near").parse().unwrap();
        testing_env!(get_context(f.clone(), NearToken::from_near(1), 105 + i).build());
        c.deposit(id.clone(), p_hash.clone());
        members.push(f);
    }
    let nonce = c.get_syndicate(id.clone()).unwrap().round_nonce;
    let alloc = pay_r(10);
    let msg = plain_msg(&id, &nonce, &alloc, "order");
    testing_env!(get_context(owner, NearToken::from_near(0), 200).build());
    c.settle_batch(
        id,
        nonce,
        "order".to_string(),
        alloc,
        room_sign(ROOM_A, &msg),
    );
    let big = callback_gas();
    assert!(
        big >= Gas::from_tgas(60).as_gas(),
        "50 members need at least 60 TGas for the follow-up step, got {big}"
    );
    assert!(
        big < Gas::from_tgas(150).as_gas(),
        "but not so much that a normal 150 TGas call cannot afford it: {big}"
    );
}

// ---------------------------------------------------------------------------------------------------------------
// GAP-024: the release cap bounds the pace of release over a time window, and settlements cannot keep members out
// ---------------------------------------------------------------------------------------------------------------

/// A vault of four members with 10 NEAR each (40 in all), the given kind and cap, a 30-block exit timer (so a 60-block window).
fn windowed(id: &str, kind: &str, cap_bps: u16) -> (FlyCoordinator, String, [AccountId; 4]) {
    testing_env!(get_context("alice.near".parse().unwrap(), NearToken::from_near(1), 100).build());
    let mut c = FlyCoordinator::new();
    let policy = ReleasePolicy {
        allowed_recipients: vec!["r.near".parse().unwrap()],
        max_release_bps_per_epoch: cap_bps,
        settle_deadline_block: 1_000_000,
    };
    let sid = c.hatch(
        id.to_string(),
        Some(kind.to_string()),
        Some(1),
        Some(100),
        room_pk(ROOM_A),
        "hash".to_string(),
        Some(30),
        Some("r.near".parse().unwrap()),
        Some(policy),
    );
    let ph = c.get_policy_hash(sid.clone());
    let members: [AccountId; 4] = [
        "m1.near".parse().unwrap(),
        "m2.near".parse().unwrap(),
        "m3.near".parse().unwrap(),
        "m4.near".parse().unwrap(),
    ];
    for (i, m) in members.iter().enumerate() {
        testing_env!(get_context(m.clone(), NearToken::from_near(10), 105 + i as u64).build());
        c.deposit(sid.clone(), ph.clone());
    }
    (c, sid, members)
}

/// Settle `milli` milliNEAR to r.near, charged to `from`, at `block`; then let the payout land (or fail).
fn settle_window(
    c: &mut FlyCoordinator,
    id: &str,
    block: u64,
    milli: u128,
    from: &AccountId,
    lands: bool,
) {
    let st = c.get_syndicate(id.to_string()).unwrap();
    let amount = NearToken::from_millinear(milli);
    let alloc = vec![Allocation {
        recipient: "r.near".parse().unwrap(),
        amount,
    }];
    let charges = vec![Charge {
        member: from.clone(),
        amount,
    }];
    let msg = format!(
        "fly-coordinator.testnet:{}:{}:{}:{}:{}:order",
        id,
        st.epoch,
        st.round_nonce,
        compute_allocations_hash(&alloc),
        compute_charges_hash(&charges)
    );
    testing_env!(get_context(
        "alice.near".parse().unwrap(),
        NearToken::from_near(0),
        block
    )
    .build());
    c.settle_batch_charged(
        id.to_string(),
        st.round_nonce.clone(),
        "order".to_string(),
        alloc.clone(),
        charges.clone(),
        room_sign(ROOM_A, &msg),
    );
    testing_env_with_promise_results(
        get_context(
            "fly-coordinator.testnet".parse().unwrap(),
            NearToken::from_near(0),
            block + 1,
        )
        .build(),
        if lands {
            PromiseResult::Successful(vec![])
        } else {
            PromiseResult::Failed
        },
    );
    c.on_settlement_payout(
        id.to_string(),
        alloc.clone(),
        charges,
        amount,
        compute_allocations_hash(&alloc),
        "order".to_string(),
    );
}

#[test]
fn the_window_records_what_has_been_released_since_it_opened() {
    let (mut c, id, m) = windowed("win-view", "FLASH", 2500);
    assert!(c.get_release_window(id.clone()).is_none());
    settle_window(&mut c, &id, 120, 6_000, &m[0], true);
    let w = c.get_release_window(id).unwrap();
    assert_eq!(w.start_block, 120);
    assert_eq!(w.start_escrow, NearToken::from_near(40));
    assert_eq!(w.released, NearToken::from_near(6));
    assert_eq!(w.ends_at_block, 120 + 60);
}

#[test]
fn two_settlements_that_together_stay_within_the_cap_are_both_allowed() {
    let (mut c, id, m) = windowed("win-ok", "FLASH", 2500); // 25% of 40 = 10
    settle_window(&mut c, &id, 120, 6_000, &m[0], true);
    settle_window(&mut c, &id, 122, 4_000, &m[1], true);
    assert_eq!(
        c.get_release_window(id).unwrap().released,
        NearToken::from_near(10)
    );
}

#[test]
#[should_panic(expected = "cumulative release in this window")]
fn a_third_settlement_that_takes_the_window_over_the_cap_is_refused() {
    let (mut c, id, m) = windowed("win-over", "FLASH", 2500);
    settle_window(&mut c, &id, 120, 6_000, &m[0], true);
    settle_window(&mut c, &id, 122, 4_000, &m[1], true);
    settle_window(&mut c, &id, 124, 1, &m[2], true); // one milliNEAR over
}

#[test]
#[should_panic(expected = "cumulative release in this window")]
fn the_back_to_back_drain_measured_on_testnet_is_now_refused() {
    // E-ONGOING-01: 25% of the current escrow each time (10, then 7.5) released 57.8% of the group. Now the second is refused.
    let (mut c, id, m) = windowed("win-drain", "DARK_VAULT", 2500);
    settle_window(&mut c, &id, 120, 10_000, &m[0], true);
    settle_window(&mut c, &id, 121, 7_500, &m[1], true);
}

#[test]
#[should_panic(expected = "cumulative release in this window")]
fn the_allowance_does_not_return_inside_the_same_window() {
    let (mut c, id, m) = windowed("win-same", "FLASH", 2500);
    settle_window(&mut c, &id, 120, 10_000, &m[0], true);
    settle_window(&mut c, &id, 179, 1_000, &m[1], true); // still inside 120 + 60
}

#[test]
fn the_allowance_returns_in_a_new_window_sized_to_the_escrow_then() {
    let (mut c, id, m) = windowed("win-new", "FLASH", 2500);
    settle_window(&mut c, &id, 120, 10_000, &m[0], true); // escrow now 30
    settle_window(&mut c, &id, 180, 7_500, &m[1], true); // a new window: 25% of 30
    let w = c.get_release_window(id).unwrap();
    assert_eq!(
        (w.start_block, w.start_escrow, w.released),
        (
            180,
            NearToken::from_near(30),
            NearToken::from_millinear(7_500)
        )
    );
}

#[test]
#[should_panic(expected = "cumulative release in this window")]
fn a_new_window_is_still_capped_against_the_escrow_then() {
    let (mut c, id, m) = windowed("win-new-cap", "FLASH", 2500);
    settle_window(&mut c, &id, 120, 10_000, &m[0], true);
    settle_window(&mut c, &id, 180, 7_501, &m[1], true); // 25% of 30 is 7.5
}

#[test]
fn in_a_dark_vault_the_epoch_and_the_exit_timer_advance_with_the_window_not_with_each_settlement() {
    let (mut c, id, m) = windowed("dv-win", "DARK_VAULT", 5000);
    settle_window(&mut c, &id, 120, 5_000, &m[0], true);
    let s1 = c.get_syndicate(id.clone()).unwrap();
    assert_eq!((s1.epoch, s1.epoch_start_block), (2, 120));
    settle_window(&mut c, &id, 130, 5_000, &m[1], true); // same window
    let s2 = c.get_syndicate(id.clone()).unwrap();
    assert_eq!(
        (s2.epoch, s2.epoch_start_block),
        (2, 120),
        "a settlement inside the window must not restart the exit timer"
    );
    settle_window(&mut c, &id, 180, 5_000, &m[2], true); // a new window
    let s3 = c.get_syndicate(id).unwrap();
    assert_eq!((s3.epoch, s3.epoch_start_block), (3, 180));
}

#[test]
fn a_settlement_inside_the_window_cannot_keep_members_out() {
    let (mut c, id, m) = windowed("dv-exit", "DARK_VAULT", 5000);
    settle_window(&mut c, &id, 120, 5_000, &m[0], true);
    settle_window(&mut c, &id, 130, 5_000, &m[1], true); // under the old rule this restarted the timer to 130
    testing_env!(get_context(m[3].clone(), NearToken::from_near(0), 150).build()); // 120 + 30
    let _ = c.hatch_out(id.clone());
    assert_eq!(c.get_escrow(id, m[3].clone()).as_yoctonear(), 0);
}

#[test]
#[should_panic(expected = "LOCKED")]
fn a_new_window_in_a_dark_vault_locks_exits_again_for_a_timer() {
    let (mut c, id, m) = windowed("dv-relock", "DARK_VAULT", 5000);
    settle_window(&mut c, &id, 120, 5_000, &m[0], true);
    settle_window(&mut c, &id, 180, 5_000, &m[1], true); // a new window and a new epoch at 180
    testing_env!(get_context(m[3].clone(), NearToken::from_near(0), 190).build()); // 10 blocks in: locked
    let _ = c.hatch_out(id);
}

#[test]
fn a_flash_keeps_its_epoch_and_exit_timer_whatever_the_windows() {
    let (mut c, id, m) = windowed("flash-win", "FLASH", 5000);
    settle_window(&mut c, &id, 120, 5_000, &m[0], true);
    settle_window(&mut c, &id, 200, 5_000, &m[1], true); // a second window
    let s = c.get_syndicate(id).unwrap();
    assert_eq!((s.epoch, s.epoch_start_block), (1, 100));
}

#[test]
fn a_deposit_inside_the_window_raises_the_allowance() {
    testing_env!(get_context("alice.near".parse().unwrap(), NearToken::from_near(1), 100).build());
    let mut c = FlyCoordinator::new();
    let policy = ReleasePolicy {
        allowed_recipients: vec!["r.near".parse().unwrap()],
        max_release_bps_per_epoch: 10_000,
        settle_deadline_block: 1_000_000,
    };
    let id = c.hatch(
        "win-dep".into(),
        Some("FLASH".into()),
        Some(1),
        Some(100),
        room_pk(ROOM_A),
        "hash".into(),
        Some(30),
        Some("r.near".parse().unwrap()),
        Some(policy),
    );
    let ph = c.get_policy_hash(id.clone());
    let a: AccountId = "m1.near".parse().unwrap();
    let b: AccountId = "m2.near".parse().unwrap();
    testing_env!(get_context(a.clone(), NearToken::from_near(10), 105).build());
    c.deposit(id.clone(), ph.clone());
    settle_window(&mut c, &id, 120, 4_000, &a, true); // the window opens with 10 NEAR
    testing_env!(get_context(b.clone(), NearToken::from_near(10), 125).build());
    c.deposit(id.clone(), ph);
    settle_window(&mut c, &id, 130, 10_000, &b, true);
    settle_window(&mut c, &id, 135, 6_000, &a, true); // 4 + 10 + 6 = 20 = 10 at the start + the 10 deposited since
    assert_eq!(
        c.get_release_window(id).unwrap().released,
        NearToken::from_near(20)
    );
}

#[test]
fn a_payout_that_fails_gives_its_allowance_back() {
    let (mut c, id, m) = windowed("win-fail", "FLASH", 2500);
    settle_window(&mut c, &id, 120, 10_000, &m[0], false); // the transfer failed
    assert_eq!(
        c.get_release_window(id.clone()).unwrap().released,
        NearToken::from_near(0)
    );
    settle_window(&mut c, &id, 125, 10_000, &m[1], true); // so the full allowance is still there
    assert_eq!(
        c.get_release_window(id).unwrap().released,
        NearToken::from_near(10)
    );
}

#[test]
fn pruning_a_group_forgets_its_window() {
    let (mut c, id, m) = windowed("win-prune", "FLASH", 10_000);
    for (i, who) in m.iter().enumerate() {
        settle_window(&mut c, &id, 120 + 4 * i as u64, 10_000, who, true);
    }
    assert!(c.get_release_window(id.clone()).is_some());
    testing_env!(get_context("alice.near".parse().unwrap(), NearToken::from_near(0), 200).build());
    c.prune_syndicate(id.clone());
    assert!(c.get_release_window(id).is_none());
}

// ---------------------------------------------------------------------------------------------------------------
// GAP-025: the exit timer is part of what depositors consent to, and absurdly short timers are refused
// ---------------------------------------------------------------------------------------------------------------

fn policy_for_timer() -> ReleasePolicy {
    ReleasePolicy {
        allowed_recipients: vec!["r.near".parse().unwrap()],
        max_release_bps_per_epoch: 2500,
        settle_deadline_block: 1_000_000,
    }
}

fn hatch_with_timer(c: &mut FlyCoordinator, id: &str, timer: u64) -> String {
    testing_env!(get_context("alice.near".parse().unwrap(), NearToken::from_near(1), 100).build());
    c.hatch(
        id.to_string(),
        Some("FLASH".to_string()),
        Some(1),
        Some(100),
        room_pk(ROOM_A),
        "hash".to_string(),
        Some(timer),
        Some("r.near".parse().unwrap()),
        Some(policy_for_timer()),
    )
}

#[test]
fn a_new_groups_hash_covers_the_exit_timer() {
    let mut c = FlyCoordinator::new();
    let id = hatch_with_timer(&mut c, "timer-hash", 30);
    assert_eq!(
        c.get_policy_hash(id).unwrap(),
        policy_for_timer().compute_hash_with_timeout(30)
    );
}

#[test]
fn two_groups_that_differ_only_in_the_timer_have_different_hashes() {
    let mut c = FlyCoordinator::new();
    let a = hatch_with_timer(&mut c, "timer-a", 30);
    let b = hatch_with_timer(&mut c, "timer-b", 31);
    assert_ne!(c.get_policy_hash(a), c.get_policy_hash(b));
    assert_ne!(
        policy_for_timer().compute_hash_with_timeout(30),
        policy_for_timer().compute_hash()
    );
}

#[test]
#[should_panic(expected = "Policy hash mismatch")]
fn a_deposit_with_a_hash_that_omits_the_timer_is_refused() {
    let mut c = FlyCoordinator::new();
    let id = hatch_with_timer(&mut c, "timer-old-hash", 30);
    testing_env!(get_context("m1.near".parse().unwrap(), NearToken::from_near(1), 105).build());
    c.deposit(id, Some(policy_for_timer().compute_hash())); // the old formula: recipients, cap, deadline only
}

#[test]
#[should_panic(expected = "Policy hash mismatch")]
fn a_deposit_that_assumed_a_different_timer_is_refused() {
    let mut c = FlyCoordinator::new();
    let id = hatch_with_timer(&mut c, "timer-assumed", 30);
    testing_env!(get_context("m1.near".parse().unwrap(), NearToken::from_near(1), 105).build());
    c.deposit(id, Some(policy_for_timer().compute_hash_with_timeout(300))); // the depositor expected a 300-block timer
}

#[test]
fn a_deposit_that_names_the_real_timer_is_accepted() {
    let mut c = FlyCoordinator::new();
    let id = hatch_with_timer(&mut c, "timer-ok", 30);
    testing_env!(get_context("m1.near".parse().unwrap(), NearToken::from_near(1), 105).build());
    c.deposit(
        id.clone(),
        Some(policy_for_timer().compute_hash_with_timeout(30)),
    );
    assert_eq!(
        c.get_escrow(id, "m1.near".parse().unwrap()),
        NearToken::from_near(1)
    );
}

#[test]
#[should_panic(expected = "at least 10")]
fn a_timer_below_the_floor_is_refused() {
    let mut c = FlyCoordinator::new();
    hatch_with_timer(&mut c, "timer-9", 9);
}

#[test]
fn a_timer_at_the_floor_is_accepted() {
    let mut c = FlyCoordinator::new();
    let id = hatch_with_timer(&mut c, "timer-10", 10);
    assert_eq!(c.get_syndicate(id).unwrap().timeout_blocks, 10);
}

#[test]
fn the_terms_view_shows_what_a_depositor_consents_to_and_that_the_timer_is_covered() {
    let mut c = FlyCoordinator::new();
    let id = hatch_with_timer(&mut c, "timer-view", 30);
    let t = c.get_policy_terms(id).unwrap();
    assert_eq!(t.timeout_blocks, 30);
    assert_eq!(t.release_window_blocks, 60);
    assert_eq!(t.max_release_bps_per_epoch, 2500);
    assert_eq!(t.settle_deadline_block, 1_000_000);
    assert_eq!(
        t.allowed_recipients,
        vec!["r.near".parse::<AccountId>().unwrap()]
    );
    assert!(t.timer_in_consent_hash);
}

#[test]
fn a_group_opened_before_this_change_is_shown_with_its_timer_not_covered() {
    // Simulate one: its stored hash is the old formula, which omits the timer.
    let mut c = FlyCoordinator::new();
    let id = hatch_with_timer(&mut c, "timer-legacy", 30);
    c.syndicates.get_mut(&id).unwrap().policy_hash = policy_for_timer().compute_hash();
    let t = c.get_policy_terms(id.clone()).unwrap();
    assert!(!t.timer_in_consent_hash);
    // and it still accepts the hash it was opened with
    testing_env!(get_context("m1.near".parse().unwrap(), NearToken::from_near(1), 105).build());
    c.deposit(id.clone(), Some(policy_for_timer().compute_hash()));
    assert_eq!(
        c.get_escrow(id, "m1.near".parse().unwrap()),
        NearToken::from_near(1)
    );
}

#[test]
fn the_terms_of_an_unknown_group_are_none() {
    let c = FlyCoordinator::new();
    assert!(c.get_policy_terms("nope".to_string()).is_none());
}

#[test]
fn every_term_a_depositor_consents_to_changes_the_hash() {
    let base = policy_for_timer();
    let h = base.compute_hash_with_timeout(30);
    let mut cap = base.clone();
    cap.max_release_bps_per_epoch = 2501;
    let mut deadline = base.clone();
    deadline.settle_deadline_block += 1;
    let mut who = base.clone();
    who.allowed_recipients = vec!["other.near".parse().unwrap()];
    assert_ne!(cap.compute_hash_with_timeout(30), h, "the cap");
    assert_ne!(deadline.compute_hash_with_timeout(30), h, "the deadline");
    assert_ne!(who.compute_hash_with_timeout(30), h, "the recipients");
    assert_ne!(base.compute_hash_with_timeout(31), h, "the timer");
}

#[test]
fn the_hash_does_not_depend_on_the_order_or_repetition_of_recipients() {
    let mut a = policy_for_timer();
    a.allowed_recipients = vec![
        "b.near".parse().unwrap(),
        "a.near".parse().unwrap(),
        "b.near".parse().unwrap(),
    ];
    let mut b = policy_for_timer();
    b.allowed_recipients = vec!["a.near".parse().unwrap(), "b.near".parse().unwrap()];
    assert_eq!(
        a.compute_hash_with_timeout(30),
        b.compute_hash_with_timeout(30)
    );
}

// ---- Audit run-1 fixes: each test was written to fail before its fix ----

#[test]
#[should_panic(expected = "[Settle REJECT] Invalid order hash")]
fn order_hash_may_not_contain_the_message_separator() {
    // A charged message is `..:allocs:charges:order`; an uncharged one is `..:allocs:order`. An uncharged order hash
    // of "<charges_hash>:<order>" would let a charged signature verify as an uncharged settlement.
    let (mut c, id, nonce, _m) = charged_setup("ord-colon");
    let allocations = pay_r(3);
    let sig = sign_charged(
        &id,
        1,
        &nonce,
        &compute_allocations_hash(&allocations),
        "",
        "x:y",
    );
    testing_env!(get_context("alice.near".parse().unwrap(), NearToken::from_near(0), 120).build());
    c.settle_batch(
        id.clone(),
        nonce.clone(),
        "x:y".to_string(),
        allocations,
        sig,
    );
}

#[test]
fn a_member_drained_to_zero_who_deposits_again_is_not_listed_twice() {
    let (mut c, id, nonce, m) = charged_setup("dup-flyer");
    let before = c.get_syndicate(id.clone()).unwrap();
    assert_eq!(before.flyers.len() as u32, before.active_flyer_count);
    // m[0] pays everything they deposited
    let charges = vec![charge(&m[0], 10), charge(&m[1], 0), charge(&m[2], 0)];
    let charges: Vec<Charge> = charges
        .into_iter()
        .filter(|c| c.amount.as_yoctonear() > 0)
        .collect();
    settle_charged_as_owner(&mut c, &id, &nonce, pay_r(10), charges.clone(), &charges);
    testing_env_with_promise_results(
        get_context(
            "fly-coordinator.testnet".parse().unwrap(),
            NearToken::from_near(0),
            121,
        )
        .build(),
        PromiseResult::Successful(vec![]),
    );
    assert!(c.on_settlement_payout(
        id.clone(),
        pay_r(10),
        charges,
        NearToken::from_near(10),
        compute_allocations_hash(&pay_r(10)),
        "order".to_string(),
    ));
    assert_eq!(
        c.get_syndicate(id.clone()).unwrap().status,
        SyndicateStatus::Active
    );
    let ph = c.get_policy_hash(id.clone());
    testing_env!(get_context(m[0].clone(), NearToken::from_near(1), 130).build());
    c.deposit(id.clone(), ph);
    let after = c.get_syndicate(id.clone()).unwrap();
    let mut seen = after.flyers.clone();
    seen.sort();
    seen.dedup();
    assert_eq!(seen.len(), after.flyers.len(), "flyers must be unique");
    assert_eq!(after.active_flyer_count as usize, after.flyers.len());
}

#[test]
fn a_late_callback_from_a_recovered_settlement_cannot_finish_the_next_one() {
    // Settlement A is recovered by hand. Settlement B starts. A's own follow-up then arrives late and must not touch B.
    let (mut a, id, m) = stuck_after_charged_settlement("stale-cb");
    testing_env!(get_context(m[2].clone(), NearToken::from_near(0), 220).build());
    a.recover_stuck_settlement(id.clone());
    let nonce = a.get_syndicate(id.clone()).unwrap().round_nonce;
    let b_alloc = pay_r(3);
    let b_charges = vec![charge(&m[0], 3)];
    let sig = sign_charged(
        &id,
        1,
        &nonce,
        &compute_allocations_hash(&b_alloc),
        &compute_charges_hash(&b_charges),
        "order",
    );
    testing_env!(get_context("alice.near".parse().unwrap(), NearToken::from_near(0), 230).build());
    a.settle_batch_charged(
        id.clone(),
        nonce,
        "order".to_string(),
        b_alloc,
        b_charges,
        sig,
    );
    assert!(a.get_syndicate(id.clone()).unwrap().is_settling);
    let escrow_before = a.get_escrow(id.clone(), m[0].clone());

    // A's late callback
    let late = run_the_callback(&mut a, &id, &m, 231);
    assert!(late, "a stale callback reports nothing to do");
    assert!(
        a.get_syndicate(id.clone()).unwrap().is_settling,
        "B must still be in flight"
    );
    assert!(
        a.get_pending_settlement(id.clone()).is_some(),
        "B's record must survive"
    );
    assert_eq!(a.get_escrow(id, m[0].clone()), escrow_before);
}

#[test]
#[should_panic(expected = "exceeds max_release_bps_per_epoch cap")]
fn a_deposit_that_has_left_does_not_raise_the_release_cap() {
    // 4 members x 10 NEAR = 40 NEAR, cap 20% => 8 NEAR per window.
    let (mut c, id, m) = windowed("cap-base", "FLASH", 2_000);
    settle_window(&mut c, &id, 200, 1_000, &m[0], true); // 1 NEAR released, window opens at 200
                                                         // m[1] adds 90 NEAR (100 is the per-member limit), then takes everything back out (the exit timer has run)
    let ph = c.get_policy_hash(id.clone());
    testing_env!(get_context(m[1].clone(), NearToken::from_near(90), 210).build());
    c.deposit(id.clone(), ph);
    testing_env!(get_context(m[1].clone(), NearToken::from_near(0), 215).build());
    let _ = c.hatch_out(id.clone());
    // 7.5 more makes 8.5 released against the 30 NEAR that actually remain (cap 6): it must be refused
    settle_window(&mut c, &id, 220, 7_500, &m[2], true);
}

#[test]
#[should_panic(expected = "[Hatch REJECT] expected_code_hash is too long")]
fn hatch_refuses_an_oversized_code_hash() {
    // The flat storage deposit pays for a small record only; a caller-sized string would be paid for by the pooled balance.
    let (pk, _) =
        make_enclave_key_and_signature("fly-coordinator.testnet", "big-hash", 1, "", "", "");
    testing_env!(get_context("alice.near".parse().unwrap(), NearToken::from_near(1), 100).build());
    let mut c = FlyCoordinator::new();
    c.hatch(
        "big-hash".to_string(),
        Some("FLASH".to_string()),
        Some(1),
        Some(50),
        pk,
        "a".repeat(129),
        Some(30),
        Some("r.near".parse().unwrap()),
        None,
    );
}

// ---- GAP-028: the follow-up names the settlement it finishes (its round nonce) ----

fn follow_up_for_round(
    c: &mut FlyCoordinator,
    id: &str,
    m: &[AccountId; 3],
    block: u64,
    nonce: &str,
    amounts: [u128; 3],
) -> bool {
    let total: u128 = amounts.iter().sum();
    let charges = vec![
        charge(&m[0], amounts[0]),
        charge(&m[1], amounts[1]),
        charge(&m[2], amounts[2]),
    ];
    testing_env_with_promise_results(
        get_context(
            "fly-coordinator.testnet".parse().unwrap(),
            NearToken::from_near(0),
            block,
        )
        .build(),
        PromiseResult::Successful(vec![]),
    );
    c.on_settlement_payout_for_round(
        id.to_string(),
        pay_r(total),
        charges,
        NearToken::from_near(total),
        compute_allocations_hash(&pay_r(total)),
        "order".to_string(),
        nonce.to_string(),
    )
}

/// Two settlements with byte-identical payloads, the first finished by recovery: the situation GAP-028 could not tell apart.
fn identical_second_settlement(
    name: &str,
) -> (FlyCoordinator, String, [AccountId; 3], String, String) {
    let (mut c, id, nonce_a, m) = charged_setup(name);
    let charges = vec![charge(&m[0], 1), charge(&m[1], 2), charge(&m[2], 3)];
    settle_charged_as_owner(&mut c, &id, &nonce_a, pay_r(6), charges.clone(), &charges);
    testing_env!(get_context("anyone.near".parse().unwrap(), NearToken::from_near(0), 300).build());
    c.recover_stuck_settlement(id.clone());
    let nonce_b = c.get_syndicate(id.clone()).unwrap().round_nonce;
    assert_ne!(nonce_a, nonce_b, "the nonce must change after a settlement");
    settle_charged_as_owner(&mut c, &id, &nonce_b, pay_r(6), charges.clone(), &charges);
    assert!(c.get_syndicate(id.clone()).unwrap().is_settling);
    (c, id, m, nonce_a, nonce_b)
}

#[test]
fn a_late_follow_up_from_an_earlier_identical_settlement_changes_nothing() {
    let (mut c, id, m, nonce_a, _) = identical_second_settlement("gap28-late");
    let before = c.get_escrow(id.clone(), m[0].clone());
    assert!(follow_up_for_round(
        &mut c,
        &id,
        &m,
        310,
        &nonce_a,
        [1, 2, 3]
    ));
    let syn = c.get_syndicate(id.clone()).unwrap();
    assert!(syn.is_settling, "the second settlement is still in flight");
    assert!(
        c.get_pending_settlement(id.clone()).is_some(),
        "its record is untouched"
    );
    assert_eq!(c.get_escrow(id, m[0].clone()), before, "no balance moved");
}

#[test]
fn the_follow_up_that_names_the_settlement_in_flight_finishes_it() {
    let (mut c, id, m, _, nonce_b) = identical_second_settlement("gap28-right");
    assert!(follow_up_for_round(
        &mut c,
        &id,
        &m,
        310,
        &nonce_b,
        [1, 2, 3]
    ));
    assert!(!c.get_syndicate(id.clone()).unwrap().is_settling);
    assert!(c.get_pending_settlement(id).is_none());
}

#[test]
fn the_follow_up_is_still_the_late_one_after_the_right_one_finished() {
    let (mut c, id, m, nonce_a, nonce_b) = identical_second_settlement("gap28-after");
    assert!(follow_up_for_round(
        &mut c,
        &id,
        &m,
        310,
        &nonce_b,
        [1, 2, 3]
    ));
    let escrow = c.get_escrow(id.clone(), m[2].clone());
    assert!(follow_up_for_round(
        &mut c,
        &id,
        &m,
        311,
        &nonce_a,
        [1, 2, 3]
    ));
    assert_eq!(
        c.get_escrow(id, m[2].clone()),
        escrow,
        "a repeat changes nothing"
    );
}

#[test]
fn a_settlement_in_flight_from_the_old_code_is_still_finished_by_the_old_follow_up() {
    // An in-flight settlement at deploy time has no nonce record; its follow-up is the original method.
    let (mut c, id, m) = stuck_after_charged_settlement("gap28-legacy");
    near_sdk::env::storage_remove(format!("n:{id}").as_bytes());
    assert!(run_the_callback(&mut c, &id, &m, 121));
    assert!(!c.get_syndicate(id).unwrap().is_settling);
}

#[test]
fn a_follow_up_with_no_nonce_on_record_is_not_the_one_in_flight() {
    let (mut c, id, m) = stuck_after_charged_settlement("gap28-norecord");
    near_sdk::env::storage_remove(format!("n:{id}").as_bytes());
    assert!(follow_up_for_round(&mut c, &id, &m, 121, "any", [2, 4, 6]));
    assert!(c.get_syndicate(id).unwrap().is_settling, "nothing changed");
}

#[test]
fn recovery_clears_the_nonce_record_too() {
    let (mut c, id, _) = stuck_after_charged_settlement("gap28-recover");
    assert!(near_sdk::env::storage_read(format!("n:{id}").as_bytes()).is_some());
    testing_env!(get_context("anyone.near".parse().unwrap(), NearToken::from_near(0), 300).build());
    c.recover_stuck_settlement(id.clone());
    assert!(near_sdk::env::storage_read(format!("n:{id}").as_bytes()).is_none());
}

#[test]
fn the_follow_up_scheduled_by_a_settlement_is_the_one_that_names_its_round() {
    use near_sdk::test_utils::get_created_receipts;
    let (_c, _id, _) = stuck_after_charged_settlement("gap28-sched");
    let mut names = vec![];
    for r in get_created_receipts() {
        for a in r.actions {
            if let near_sdk::mock::MockAction::FunctionCallWeight { method_name, .. } = a {
                names.push(String::from_utf8(method_name).unwrap());
            }
        }
    }
    assert!(
        names.iter().any(|n| n == "on_settlement_payout_for_round"),
        "scheduled: {names:?}"
    );
    assert!(
        !names.iter().any(|n| n == "on_settlement_payout"),
        "the old follow-up is not scheduled any more: {names:?}"
    );
}

// ---- get_group_phase: the composite states of docs/STATE_MACHINE.md as a view ----

#[test]
fn the_phase_of_a_group_that_does_not_exist_is_nothing() {
    let (c, _, _, _) = charged_setup("phase-none");
    assert!(c.get_group_phase("nope".to_string()).is_none());
}

#[test]
fn a_group_nobody_has_funded_is_unfunded() {
    let owner: AccountId = "alice.near".parse().unwrap();
    testing_env!(get_context(owner, NearToken::from_near(1), 100).build());
    let mut c = FlyCoordinator::new();
    let (pk, _) =
        make_enclave_key_and_signature("fly-coordinator.testnet", "phase-unf", 1, "", "", "");
    let id = c.hatch(
        "phase-unf".to_string(),
        Some("FLASH".to_string()),
        Some(1),
        Some(50),
        pk,
        "hash".to_string(),
        Some(30),
        Some("r.near".parse().unwrap()),
        None,
    );
    assert_eq!(c.get_group_phase(id), Some(GroupPhase::Unfunded));
}

#[test]
fn a_funded_group_is_open_then_in_flight_then_open_again_then_settled() {
    let (mut c, id, nonce, m) = charged_setup("phase-life");
    assert_eq!(c.get_group_phase(id.clone()), Some(GroupPhase::Open));
    let charges = vec![charge(&m[0], 2), charge(&m[1], 4), charge(&m[2], 6)];
    settle_charged_as_owner(&mut c, &id, &nonce, pay_r(12), charges.clone(), &charges);
    assert_eq!(
        c.get_group_phase(id.clone()),
        Some(GroupPhase::PayoutInFlight)
    );
    let nonce_in_flight = nonce.clone();
    assert!(follow_up_for_round(
        &mut c,
        &id,
        &m,
        121,
        &nonce_in_flight,
        [2, 4, 6]
    ));
    assert_eq!(c.get_group_phase(id.clone()), Some(GroupPhase::Open));
    // pay everything that is left
    let nonce2 = c.get_syndicate(id.clone()).unwrap().round_nonce;
    let rest = vec![charge(&m[0], 8), charge(&m[1], 6), charge(&m[2], 4)];
    settle_charged_as_owner(&mut c, &id, &nonce2, pay_r(18), rest.clone(), &rest);
    assert_eq!(
        c.get_group_phase(id.clone()),
        Some(GroupPhase::PayoutInFlight)
    );
    assert!(follow_up_for_round(
        &mut c,
        &id,
        &m,
        122,
        &nonce2,
        [8, 6, 4]
    ));
    assert_eq!(c.get_group_phase(id), Some(GroupPhase::Settled));
}

#[test]
fn a_group_whose_last_member_left_is_refunded() {
    let (mut c, id, _, m) = charged_setup("phase-refund");
    for (i, who) in m.iter().enumerate() {
        testing_env!(get_context(who.clone(), NearToken::from_near(0), 400 + i as u64).build());
        let _ = c.hatch_out(id.clone());
    }
    assert_eq!(c.get_group_phase(id), Some(GroupPhase::Refunded));
}

// ---- GAP-030: a group that was hatched and never funded can be removed ----

fn hatch_unfunded(name: &str) -> (FlyCoordinator, String, AccountId) {
    let owner: AccountId = "alice.near".parse().unwrap();
    testing_env!(get_context(owner.clone(), NearToken::from_near(1), 100).build());
    let mut c = FlyCoordinator::new();
    let (pk, _) = make_enclave_key_and_signature("fly-coordinator.testnet", name, 1, "", "", "");
    let id = c.hatch(
        name.to_string(),
        Some("FLASH".to_string()),
        Some(1),
        Some(50),
        pk,
        "hash".to_string(),
        Some(30),
        None,
        None,
    );
    (c, id, owner)
}

#[test]
fn the_creator_can_remove_a_group_nobody_funded_at_once() {
    let (mut c, id, owner) = hatch_unfunded("gap30-creator");
    assert_eq!(c.get_group_phase(id.clone()), Some(GroupPhase::Unfunded));
    testing_env!(get_context(owner.clone(), NearToken::from_near(0), 101).build());
    c.prune_syndicate(id.clone());
    assert!(c.get_syndicate(id.clone()).is_none());
    assert!(c.get_group_phase(id).is_none());
    assert!(
        c.get_syndicates_by_member(owner, None, None).is_empty(),
        "the creator's index no longer lists it"
    );
}

#[test]
#[should_panic(expected = "never-funded")]
fn a_stranger_cannot_remove_an_unfunded_group_before_the_waiting_period() {
    let (mut c, id, _) = hatch_unfunded("gap30-early");
    testing_env!(get_context(
        "stranger.near".parse().unwrap(),
        NearToken::from_near(0),
        100 + 604_799
    )
    .build());
    c.prune_syndicate(id);
}

#[test]
fn anyone_can_remove_an_unfunded_group_after_the_waiting_period() {
    let (mut c, id, _) = hatch_unfunded("gap30-late");
    testing_env!(get_context(
        "stranger.near".parse().unwrap(),
        NearToken::from_near(0),
        100 + 604_800
    )
    .build());
    c.prune_syndicate(id.clone());
    assert!(c.get_syndicate(id).is_none());
}

#[test]
fn a_removed_unfunded_id_can_be_hatched_again() {
    let (mut c, id, owner) = hatch_unfunded("gap30-reuse");
    testing_env!(get_context(owner.clone(), NearToken::from_near(0), 101).build());
    c.prune_syndicate(id.clone());
    testing_env!(get_context(owner, NearToken::from_near(1), 102).build());
    let (pk, _) = make_enclave_key_and_signature("fly-coordinator.testnet", &id, 1, "", "", "");
    let again = c.hatch(
        id.clone(),
        Some("FLASH".to_string()),
        Some(1),
        Some(50),
        pk,
        "hash".to_string(),
        Some(30),
        None,
        None,
    );
    assert_eq!(again, id);
    assert_eq!(c.get_group_phase(id), Some(GroupPhase::Unfunded));
}

#[test]
#[should_panic(expected = "can be pruned")]
fn a_funded_group_is_not_removed_even_by_its_creator_after_the_waiting_period() {
    let (mut c, id, owner) = hatch_unfunded("gap30-funded");
    let p_hash = c.get_policy_hash(id.clone());
    testing_env!(get_context("bob.near".parse().unwrap(), NearToken::from_near(1), 101).build());
    c.deposit(id.clone(), p_hash);
    testing_env!(get_context(owner, NearToken::from_near(0), 100 + 604_900).build());
    c.prune_syndicate(id);
}
