#![allow(deprecated)]

use ed25519_dalek::{Signer, SigningKey};
use fly_coordinator::{FlyCoordinator, SyndicateStatus};
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
    payout_recipient: &str,
    order_hash: &str,
) -> (String, String) {
    let signing_key = SigningKey::from_bytes(&[42u8; 32]);
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
fn test_hatch_and_ed25519_settle_with_payout() {
    let owner: AccountId = "alice.near".parse().unwrap();
    let ctx = get_context(owner.clone(), NearToken::from_near(1), 100);
    testing_env!(ctx.build());

    let mut contract = FlyCoordinator::new();
    let (enclave_pk, _) = make_enclave_key_and_signature(
        "fly-coordinator.testnet",
        "swarm-01",
        1,
        "",
        "payout-recipient.near",
        "",
    );

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

    // Generate genuine Ed25519 signature over (contract, id, epoch, nonce, payout_recipient, order_hash)
    let order_hash = "order_twap_batch_01".to_string();
    let (_, valid_sig) = make_enclave_key_and_signature(
        "fly-coordinator.testnet",
        &syn_id,
        1,
        &active_nonce,
        "payout-recipient.near",
        &order_hash,
    );

    // Settle batch with genuine signature (payout automatically dispatches to syn.payout_recipient)
    let ctx = get_context(owner, NearToken::from_near(0), 110);
    testing_env!(ctx.build());
    contract.settle_batch(syn_id.clone(), active_nonce, order_hash, valid_sig);

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
    let (enclave_pk, _) = make_enclave_key_and_signature(
        "fly-coordinator.testnet",
        "bad-sig-swarm",
        1,
        "",
        "bad-sig-swarm-treasury.near",
        "",
    );

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
    contract.settle_batch(syn_id, active_nonce, "order_hash".to_string(), fake_sig);
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
    let (enclave_pk, _) = make_enclave_key_and_signature(
        "fly-coordinator.testnet",
        "cross-swarm",
        1,
        "",
        "cross-swarm-treasury.near",
        "",
    );

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
        "cross-swarm-treasury.near",
        "order_hash",
    );

    let ctx = get_context(owner, NearToken::from_near(0), 110);
    testing_env!(ctx.build());
    contract.settle_batch(
        syn_id,
        active_nonce,
        "order_hash".to_string(),
        diff_contract_sig,
    );
}

#[test]
#[should_panic(
    expected = "[HAQ REJECT] Invalid enclave Ed25519 signature over deliberation batch!"
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
        "legit-treasury.near",
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
    );

    let syn = contract.get_syndicate(syn_id.clone()).unwrap();
    let active_nonce = syn.round_nonce.clone();

    let f1: AccountId = "flyer1.near".parse().unwrap();
    let ctx = get_context(f1, NearToken::from_near(10), 105);
    testing_env!(ctx.build());
    contract.deposit(syn_id.clone());

    // Attacker creates or signs for attacker-wallet.near instead of legit-treasury.near
    let (_, attacker_sig) = make_enclave_key_and_signature(
        "fly-coordinator.testnet",
        &syn_id,
        1,
        &active_nonce,
        "attacker-wallet.near",
        "order_hash",
    );

    // Settle batch must fail because contract's syn.payout_recipient is legit-treasury.near
    let ctx = get_context(owner, NearToken::from_near(0), 110);
    testing_env!(ctx.build());
    contract.settle_batch(syn_id, active_nonce, "order_hash".to_string(), attacker_sig);
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
        syn.payout_recipient.as_ref(),
        "order_hash",
    );

    let ctx = get_context(owner, NearToken::from_near(0), 110);
    testing_env!(ctx.build());
    contract.settle_batch(syn_id, active_nonce, "order_hash".to_string(), valid_sig);
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
    );

    let f1: AccountId = "flyer1.near".parse().unwrap();
    let ctx = get_context(f1, NearToken::from_near(10), 105);
    testing_env!(ctx.build());
    contract.deposit(syn_id.clone());

    let syn = contract.get_syndicate(syn_id.clone()).unwrap();
    let (_, sig) = make_enclave_key_and_signature(
        "fly-coordinator.testnet",
        &syn_id,
        1,
        "wrong_nonce_value",
        syn.payout_recipient.as_ref(),
        "order_hash",
    );

    let ctx = get_context(owner, NearToken::from_near(0), 110);
    testing_env!(ctx.build());
    contract.settle_batch(
        syn_id,
        "wrong_nonce_value".to_string(),
        "order_hash".to_string(),
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
        syn.payout_recipient.as_ref(),
        "order_hash",
    );

    let ctx = get_context(owner, NearToken::from_near(0), 110);
    testing_env!(ctx.build());
    contract.settle_batch(
        syn_id.clone(),
        active_nonce,
        "order_hash".to_string(),
        valid_sig,
    );

    // Attempt deposit after settled
    let ctx = get_context(f1, NearToken::from_near(5), 120);
    testing_env!(ctx.build());
    contract.deposit(syn_id);
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
        syn.payout_recipient.as_ref(),
        "batch_01",
    );

    // Settle epoch 1 at block 120
    let ctx = get_context(owner, NearToken::from_near(0), 120);
    testing_env!(ctx.build());
    contract.settle_batch(
        syn_id.clone(),
        nonce_epoch1.clone(),
        "batch_01".to_string(),
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
        syn.payout_recipient.as_ref(),
        "order_hash",
    );

    let ctx = get_context(owner, NearToken::from_near(0), 110);
    testing_env!(ctx.build());
    contract.settle_batch(
        syn_id.clone(),
        active_nonce,
        "order_hash".to_string(),
        valid_sig,
    );

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
    );

    let f1: AccountId = "flyer1.near".parse().unwrap();
    let f2: AccountId = "flyer2.near".parse().unwrap();

    // f2 deposits 5 NEAR keeping the syndicate active
    let ctx = get_context(f2.clone(), NearToken::from_near(5), 102);
    testing_env!(ctx.build());
    contract.deposit(syn_id.clone());

    // Flyer 1 deposits and exits 5 times
    for i in 0..5 {
        let dep_block = 110 + i * 20;
        let ctx = get_context(f1.clone(), NearToken::from_near(1), dep_block);
        testing_env!(ctx.build());
        contract.deposit(syn_id.clone());

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
    contract.deposit(syn_id.clone());

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
    );

    let f1: AccountId = "flyer1.near".parse().unwrap();
    let f2: AccountId = "flyer2.near".parse().unwrap();

    let ctx = get_context(f1.clone(), NearToken::from_near(10), 105);
    testing_env!(ctx.build());
    contract.deposit(syn_id.clone());

    let ctx = get_context(f2.clone(), NearToken::from_near(15), 106);
    testing_env!(ctx.build());
    contract.deposit(syn_id.clone());

    let syn = contract.get_syndicate(syn_id.clone()).unwrap();
    let active_nonce = syn.round_nonce.clone();
    let (_, valid_sig) = make_enclave_key_and_signature(
        "fly-coordinator.testnet",
        &syn_id,
        1,
        &active_nonce,
        syn.payout_recipient.as_ref(),
        "order_hash",
    );

    // Execute settle_batch
    let ctx = get_context(owner, NearToken::from_near(0), 110);
    testing_env!(ctx.build());
    contract.settle_batch(
        syn_id.clone(),
        active_nonce,
        "order_hash".to_string(),
        valid_sig,
    );

    // Simulate callback execution with successful transfer promise result
    let self_account: AccountId = "fly-coordinator.testnet".parse().unwrap();
    let ctx = get_context(self_account, NearToken::from_near(0), 111);
    testing_env_with_promise_results(ctx.build(), PromiseResult::Successful(vec![]));

    let success = contract.on_settlement_payout(syn_id.clone(), NearToken::from_near(25));
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
    );

    let f1: AccountId = "flyer1.near".parse().unwrap();
    let ctx = get_context(f1.clone(), NearToken::from_near(20), 105);
    testing_env!(ctx.build());
    contract.deposit(syn_id.clone());

    let syn = contract.get_syndicate(syn_id.clone()).unwrap();
    let active_nonce = syn.round_nonce.clone();
    let (_, valid_sig) = make_enclave_key_and_signature(
        "fly-coordinator.testnet",
        &syn_id,
        1,
        &active_nonce,
        syn.payout_recipient.as_ref(),
        "order_hash",
    );

    // Execute settle_batch
    let ctx = get_context(owner, NearToken::from_near(0), 110);
    testing_env!(ctx.build());
    contract.settle_batch(
        syn_id.clone(),
        active_nonce,
        "order_hash".to_string(),
        valid_sig,
    );

    // Simulate callback execution with failed transfer promise result
    let self_account: AccountId = "fly-coordinator.testnet".parse().unwrap();
    let ctx = get_context(self_account, NearToken::from_near(0), 111);
    testing_env_with_promise_results(ctx.build(), PromiseResult::Failed);

    let ok = contract.on_settlement_payout(syn_id.clone(), NearToken::from_near(20));
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
    );

    let f1: AccountId = "flyer1.near".parse().unwrap();
    let ctx = get_context(f1.clone(), NearToken::from_near(10), 105);
    testing_env!(ctx.build());
    contract.deposit(syn_id.clone());

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
    );

    let f1: AccountId = "flyer1.near".parse().unwrap();
    let f2: AccountId = "flyer2.near".parse().unwrap();

    // f2 keeps syndicate active
    let ctx = get_context(f2, NearToken::from_near(5), 102);
    testing_env!(ctx.build());
    contract.deposit(syn_id.clone());

    // f1 deposits 10 NEAR
    let ctx = get_context(f1.clone(), NearToken::from_near(10), 105);
    testing_env!(ctx.build());
    contract.deposit(syn_id.clone());

    // f1 hatches out at block 130
    let ctx = get_context(f1.clone(), NearToken::from_near(0), 130);
    testing_env!(ctx.build());
    let _ = contract.hatch_out(syn_id.clone());

    let syn_after_exit = contract.get_syndicate(syn_id.clone()).unwrap();
    assert_eq!(syn_after_exit.active_flyer_count, 1);

    // Before callback arrives, f1 redeposits 3 NEAR
    let ctx = get_context(f1.clone(), NearToken::from_near(3), 132);
    testing_env!(ctx.build());
    contract.deposit(syn_id.clone());

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
    contract.on_settlement_payout("syn-1".to_string(), NearToken::from_near(10));
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
        make_enclave_key_and_signature("fly-coordinator.testnet", "syn", 1, "", "payout.near", "");

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
        make_enclave_key_and_signature("fly-coordinator.testnet", "syn", 1, "", "payout.near", "");

    // Alice hatches syn-research
    contract.hatch(
        "syn-research".to_string(),
        Some("FLASH".to_string()),
        Some(2),
        Some(50),
        enclave_pk.clone(),
        "code_hash".to_string(),
        Some(30),
        None,
    );

    // Bob hatches syn-trading
    let ctx = get_context(bob.clone(), NearToken::from_near(1), 101);
    testing_env!(ctx.build());
    contract.hatch(
        "syn-trading".to_string(),
        Some("FLASH".to_string()),
        Some(2),
        Some(50),
        enclave_pk.clone(),
        "code_hash".to_string(),
        Some(30),
        None,
    );

    // Charlie deposits in syn-research and syn-trading
    let ctx = get_context(charlie.clone(), NearToken::from_near(5), 102);
    testing_env!(ctx.build());
    contract.deposit("syn-research".to_string());
    contract.deposit("syn-trading".to_string());

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
    let (enclave_pk, _) = make_enclave_key_and_signature(
        "fly-coordinator.testnet",
        "syn-event",
        1,
        "",
        "payout.near",
        "",
    );

    contract.hatch(
        "syn-event".to_string(),
        Some("FLASH".to_string()),
        Some(1),
        Some(50),
        enclave_pk,
        "code_hash".to_string(),
        Some(30),
        Some("payout.near".parse().unwrap()),
    );

    let logs = near_sdk::test_utils::get_logs();
    assert!(logs
        .iter()
        .any(|l| l.contains("EVENT_JSON") && l.contains("syndicate_hatched")));

    // Deposit emits syndicate_deposited event (API-008)
    let f1: AccountId = "f1.near".parse().unwrap();
    let ctx = get_context(f1, NearToken::from_near(5), 105);
    testing_env!(ctx.build());
    contract.deposit("syn-event".to_string());

    let logs = near_sdk::test_utils::get_logs();
    assert!(logs
        .iter()
        .any(|l| l.contains("EVENT_JSON") && l.contains("syndicate_deposited")));

    // Settle emits syndicate_settled event with payout_amount (API-006)
    let syn = contract.get_syndicate("syn-event".to_string()).unwrap();
    let order_hash = "order_alpha_test".to_string();
    let (_, sig) = make_enclave_key_and_signature(
        "fly-coordinator.testnet",
        "syn-event",
        1,
        &syn.round_nonce,
        "payout.near",
        &order_hash,
    );
    let ctx = get_context(owner.clone(), NearToken::from_near(0), 110);
    testing_env!(ctx.build());
    contract.settle_batch("syn-event".to_string(), syn.round_nonce, order_hash, sig);
    let logs = near_sdk::test_utils::get_logs();
    assert!(logs.iter().any(|l| l.contains("EVENT_JSON")
        && l.contains("syndicate_settled")
        && l.contains("payout_amount")));

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
    let (enclave_pk2, _) = make_enclave_key_and_signature(
        "fly-coordinator.testnet",
        "syn-event-exit",
        1,
        "",
        "payout.near",
        "",
    );
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
    );
    let f2: AccountId = "f2.near".parse().unwrap();
    let ctx = get_context(f2.clone(), NearToken::from_near(5), 125);
    testing_env!(ctx.build());
    contract.deposit("syn-event-exit".to_string());

    // Exit at block 150 (> timeout of 20 blocks)
    let ctx = get_context(f2, NearToken::from_near(0), 150);
    testing_env!(ctx.build());
    let _ = contract.hatch_out("syn-event-exit".to_string());
    let logs = near_sdk::test_utils::get_logs();
    assert!(logs
        .iter()
        .any(|l| l.contains("EVENT_JSON") && l.contains("syndicate_hatched_out")));
}
