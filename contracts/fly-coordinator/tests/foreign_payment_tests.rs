//! The contract, not a script, asks the MPC signer to sign a foreign payment, and only after the group's rules allow it.
#![allow(deprecated)]

use ed25519_dalek::{Signer, SigningKey};
use fly_coordinator::foreign::foreign_payment_message;
use fly_coordinator::{FlyCoordinator, ForeignPayee, ForeignPaymentRequest, ForeignPolicy};
use near_sdk::json_types::U128;
use near_sdk::test_utils::{testing_env_with_promise_results, VMContextBuilder};
use near_sdk::{testing_env, AccountId, NearToken, PromiseResult};

const CONTRACT: &str = "fly-coordinator.testnet";
const SOL_PAYEE: &str = "2J75L6udJ52N7YmrDPQLN7gzV6CqWny6CaWGccvohi4f";
const SOL_FROM: &str = "11111111111111111111111111111112";
const BLOCKHASH: &str = "4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi";
const EVM_PAYEE: &str = "0xB9A425FB45734FC29a9c941c2c05b34DE59FF7A4";

fn ctx(who: &str, deposit: NearToken, block: u64) -> VMContextBuilder {
    let a: AccountId = who.parse().unwrap();
    let mut b = VMContextBuilder::new();
    b.current_account_id(CONTRACT.parse().unwrap())
        .signer_account_id(a.clone())
        .predecessor_account_id(a)
        .attached_deposit(deposit)
        .block_height(block);
    b
}

fn key() -> SigningKey {
    SigningKey::from_bytes(&[42u8; 32])
}

fn policy() -> ForeignPolicy {
    ForeignPolicy {
        payees: vec![
            ForeignPayee {
                chain: "solana-devnet".into(),
                address: SOL_PAYEE.into(),
                max_amount: U128(2_000_000),
                max_total: U128(3_000_000),
            },
            ForeignPayee {
                chain: "ethereum-sepolia".into(),
                address: EVM_PAYEE.into(),
                max_amount: U128(1_000_000_000_000_000),
                max_total: U128(2_000_000_000_000_000),
            },
        ],
        max_fee_cost: U128(600_000_000_000_000),
        window_blocks: 1000,
    }
}

fn sol_req(id: &str, payee: &str, amount: u128) -> ForeignPaymentRequest {
    ForeignPaymentRequest {
        obligation_id: id.into(),
        chain: "solana-devnet".into(),
        from: SOL_FROM.into(),
        payee: payee.into(),
        amount: U128(amount),
        recent_blockhash: Some(BLOCKHASH.into()),
        evm_nonce: None,
        max_priority_fee: None,
        max_fee: None,
        gas_limit: None,
    }
}

fn evm_req(id: &str, amount: u128, gas: u64, max_fee: u128) -> ForeignPaymentRequest {
    ForeignPaymentRequest {
        obligation_id: id.into(),
        chain: "ethereum-sepolia".into(),
        from: "0x0309Dbc3e7F5C40Bb957723Cebb4BE5329BB22c0".into(),
        payee: EVM_PAYEE.into(),
        amount: U128(amount),
        recent_blockhash: None,
        evm_nonce: Some(3),
        max_priority_fee: Some(U128(1_000_000_000)),
        max_fee: Some(U128(max_fee)),
        gas_limit: Some(gas),
    }
}

/// A funded group with the policy set: returns (contract, group id, round nonce).
fn funded(set_policy: bool) -> (FlyCoordinator, String, String) {
    testing_env!(ctx("alice.near", NearToken::from_near(1), 100).build());
    let mut c = FlyCoordinator::new();
    let pk = hex::encode(key().verifying_key().to_bytes());
    let id = c.hatch(
        "payroll-1".into(),
        Some("FLASH".into()),
        Some(1),
        Some(50),
        pk,
        "code".into(),
        Some(30),
        Some("payout.near".parse().unwrap()),
        None,
    );
    if set_policy {
        c.set_foreign_policy(id.clone(), policy());
    }
    let h = c.get_policy_hash(id.clone());
    testing_env!(ctx("flyer1.near", NearToken::from_near(10), 105).build());
    c.deposit(id.clone(), h);
    let nonce = c.get_syndicate(id.clone()).unwrap().round_nonce;
    (c, id, nonce)
}

fn sign(c: &FlyCoordinator, id: &str, nonce: &str, req: &ForeignPaymentRequest) -> String {
    let syn = c.get_syndicate(id.to_string()).unwrap();
    let m = foreign_payment_message(CONTRACT, id, syn.epoch, nonce, req);
    hex::encode(key().sign(m.as_bytes()).to_bytes())
}

fn pay(c: &mut FlyCoordinator, id: &str, nonce: &str, req: ForeignPaymentRequest) {
    let sig = sign(c, id, nonce, &req);
    testing_env!(ctx("host.near", NearToken::from_yoctonear(0), 120).build());
    let _ = c.request_foreign_payment(id.to_string(), nonce.to_string(), req, sig);
}

#[test]
fn the_signed_message_is_pinned() {
    let m = foreign_payment_message(
        CONTRACT,
        "payroll-1",
        1,
        "n0",
        &sol_req("inv-1", SOL_PAYEE, 5),
    );
    assert_eq!(m, format!("{CONTRACT}:payroll-1:1:n0:foreign:inv-1:solana-devnet:{SOL_FROM}:{SOL_PAYEE}:5:{BLOCKHASH}"));
}

#[test]
fn an_in_rules_payment_reserves_budget_and_records_the_obligation() {
    let (mut c, id, nonce) = funded(true);
    pay(&mut c, &id, &nonce, sol_req("inv-1", SOL_PAYEE, 1_000_000));
    let o = c
        .get_foreign_obligation(id.clone(), "inv-1".into())
        .expect("recorded");
    assert_eq!(o.amount.0, 1_000_000);
    assert_eq!(
        c.get_foreign_spent(id, "solana-devnet".into(), SOL_PAYEE.into())
            .0,
        1_000_000
    );
}

#[test]
fn the_policy_is_set_once_by_the_owner_before_funding() {
    testing_env!(ctx("alice.near", NearToken::from_near(1), 100).build());
    let mut c = FlyCoordinator::new();
    let pk = hex::encode(key().verifying_key().to_bytes());
    let id = c.hatch(
        "grp-1".into(),
        Some("FLASH".into()),
        Some(1),
        Some(50),
        pk,
        "code".into(),
        Some(30),
        None,
        None,
    );
    testing_env!(ctx("mallory.near", NearToken::from_yoctonear(0), 101).build());
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        c.set_foreign_policy(id.clone(), policy())
    }));
    assert!(r.is_err(), "only the owner may set it");
    testing_env!(ctx("alice.near", NearToken::from_yoctonear(0), 102).build());
    c.set_foreign_policy(id.clone(), policy());
    let again = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        c.set_foreign_policy(id.clone(), policy())
    }));
    assert!(again.is_err(), "it cannot be changed once set");
    assert_eq!(c.get_foreign_policy(id).unwrap().payees.len(), 2);
}

#[test]
fn a_policy_cannot_be_set_after_a_deposit() {
    let (mut c, id, _) = funded(false);
    testing_env!(ctx("alice.near", NearToken::from_yoctonear(0), 130).build());
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        c.set_foreign_policy(id, policy())
    }));
    assert!(r.is_err());
}

#[test]
#[should_panic(expected = "[Foreign REJECT] payee")]
fn an_unlisted_payee_is_refused() {
    let (mut c, id, nonce) = funded(true);
    pay(
        &mut c,
        &id,
        &nonce,
        sol_req("inv-1", "3Bxs4ThwQbE4vyj9M5uZ2Pq9P9mXyB1vD8k6bX1w1h7S", 1),
    );
}

#[test]
#[should_panic(expected = "[Foreign REJECT] amount")]
fn an_amount_over_the_per_payment_cap_is_refused() {
    let (mut c, id, nonce) = funded(true);
    pay(&mut c, &id, &nonce, sol_req("inv-1", SOL_PAYEE, 2_000_001));
}

#[test]
#[should_panic(expected = "[Foreign REJECT] total")]
fn a_second_payment_over_the_running_total_is_refused() {
    let (mut c, id, nonce) = funded(true);
    pay(&mut c, &id, &nonce, sol_req("inv-1", SOL_PAYEE, 2_000_000));
    pay(&mut c, &id, &nonce, sol_req("inv-2", SOL_PAYEE, 1_000_001));
}

#[test]
#[should_panic(expected = "[Foreign REJECT] obligation")]
fn the_same_obligation_cannot_be_paid_twice() {
    let (mut c, id, nonce) = funded(true);
    pay(&mut c, &id, &nonce, sol_req("inv-1", SOL_PAYEE, 1));
    pay(&mut c, &id, &nonce, sol_req("inv-1", SOL_PAYEE, 1));
}

#[test]
#[should_panic(expected = "[HAQ REJECT]")]
fn a_payment_the_room_did_not_sign_is_refused() {
    let (mut c, id, nonce) = funded(true);
    let signed_for = sol_req("inv-1", SOL_PAYEE, 1);
    let sig = sign(&c, &id, &nonce, &signed_for);
    testing_env!(ctx("host.near", NearToken::from_yoctonear(0), 120).build());
    let altered = sol_req("inv-1", SOL_PAYEE, 2); // a different amount than the room signed
    let _ = c.request_foreign_payment(id, nonce, altered, sig);
}

#[test]
#[should_panic(expected = "[Foreign REJECT] payee")]
fn a_payee_listed_for_another_chain_is_refused() {
    let (mut c, id, nonce) = funded(true);
    let mut r = sol_req("inv-1", SOL_PAYEE, 1);
    r.chain = "ethereum-sepolia".into();
    pay(&mut c, &id, &nonce, r);
}

#[test]
#[should_panic(expected = "[Foreign REJECT] fee")]
fn an_ethereum_fee_above_the_cap_is_refused() {
    let (mut c, id, nonce) = funded(true);
    pay(
        &mut c,
        &id,
        &nonce,
        evm_req("inv-1", 1, 300_000, 3_000_000_000),
    ); // 9e14 > 6e14
}

#[test]
fn an_ethereum_payment_within_the_caps_is_recorded() {
    let (mut c, id, nonce) = funded(true);
    pay(
        &mut c,
        &id,
        &nonce,
        evm_req("inv-1", 500_000_000_000_000, 250_000, 2_000_000_000),
    );
    assert!(c.get_foreign_obligation(id, "inv-1".into()).is_some());
}

#[test]
#[should_panic(expected = "[Foreign REJECT] no foreign policy")]
fn a_group_without_a_foreign_policy_cannot_ask_for_a_signature() {
    let (mut c, id, nonce) = funded(false);
    pay(&mut c, &id, &nonce, sol_req("inv-1", SOL_PAYEE, 1));
}

#[test]
fn a_failed_signer_call_releases_the_reservation() {
    let (mut c, id, nonce) = funded(true);
    pay(&mut c, &id, &nonce, sol_req("inv-1", SOL_PAYEE, 1_000_000));
    testing_env_with_promise_results(
        ctx(CONTRACT, NearToken::from_yoctonear(0), 125).build(),
        PromiseResult::Failed,
    );
    let out = c.on_foreign_signed(
        id.clone(),
        "inv-1".into(),
        "solana-devnet".into(),
        SOL_PAYEE.into(),
        U128(1_000_000),
    );
    assert!(out.is_none());
    assert!(c
        .get_foreign_obligation(id.clone(), "inv-1".into())
        .is_none());
    assert_eq!(
        c.get_foreign_spent(id, "solana-devnet".into(), SOL_PAYEE.into())
            .0,
        0
    );
}

#[test]
fn a_successful_signer_call_keeps_the_reservation_and_marks_it_signed() {
    let (mut c, id, nonce) = funded(true);
    pay(&mut c, &id, &nonce, sol_req("inv-1", SOL_PAYEE, 1_000_000));
    testing_env_with_promise_results(
        ctx(CONTRACT, NearToken::from_yoctonear(0), 125).build(),
        PromiseResult::Successful(b"{\"scheme\":\"Ed25519\"}".to_vec()),
    );
    let out = c.on_foreign_signed(
        id.clone(),
        "inv-1".into(),
        "solana-devnet".into(),
        SOL_PAYEE.into(),
        U128(1_000_000),
    );
    assert!(out.is_some());
    assert!(
        c.get_foreign_obligation(id.clone(), "inv-1".into())
            .unwrap()
            .signed
    );
    assert_eq!(
        c.get_foreign_spent(id, "solana-devnet".into(), SOL_PAYEE.into())
            .0,
        1_000_000
    );
}

// ---- GAP-047: the running total is per window, so a reservation that never resolves locks capacity for one window and no longer forever ----

#[test]
fn the_running_total_is_per_window_and_returns_after_the_window() {
    let (mut c, id, nonce) = funded(true);
    pay(&mut c, &id, &nonce, sol_req("w-1", SOL_PAYEE, 2_000_000));
    // 2,000,000 reserved in this window; the total cap is 3,000,000, so another 2,000,000 does not fit.
    let sig = sign(&c, &id, &nonce, &sol_req("w-2", SOL_PAYEE, 2_000_000));
    testing_env!(ctx("host.near", NearToken::from_yoctonear(0), 130).build());
    let again = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _ = c.request_foreign_payment(
            id.clone(),
            nonce.clone(),
            sol_req("w-2", SOL_PAYEE, 2_000_000),
            sig.clone(),
        );
    }));
    assert!(
        again.is_err(),
        "inside the window the second payment is over the running total"
    );
    // After the window (1000 blocks from the first reservation at block 120) the allowance is back.
    testing_env!(ctx("host.near", NearToken::from_yoctonear(0), 1200).build());
    let _ = c.request_foreign_payment(
        id.clone(),
        nonce.clone(),
        sol_req("w-2", SOL_PAYEE, 2_000_000),
        sig,
    );
    assert_eq!(
        c.get_foreign_spent(id, "solana-devnet".into(), SOL_PAYEE.into())
            .0,
        2_000_000,
        "a fresh window holds only the new reservation"
    );
}

#[test]
fn a_release_in_an_old_window_does_not_touch_the_new_windows_total() {
    let (mut c, id, nonce) = funded(true);
    pay(&mut c, &id, &nonce, sol_req("old-1", SOL_PAYEE, 1_000_000));
    // The window passes, a new reservation opens a new window.
    let req2 = sol_req("new-1", SOL_PAYEE, 2_000_000);
    let sig2 = sign(&c, &id, &nonce, &req2);
    testing_env!(ctx("host.near", NearToken::from_yoctonear(0), 1500).build());
    let _ = c.request_foreign_payment(id.clone(), nonce.clone(), req2, sig2);
    // The signer failure for the OLD obligation arrives late.
    testing_env_with_promise_results(
        ctx(CONTRACT, NearToken::from_yoctonear(0), 1510).build(),
        PromiseResult::Failed,
    );
    let _ = c.on_foreign_signed(
        id.clone(),
        "old-1".into(),
        "solana-devnet".into(),
        SOL_PAYEE.into(),
        U128(1_000_000),
    );
    assert_eq!(
        c.get_foreign_spent(id, "solana-devnet".into(), SOL_PAYEE.into())
            .0,
        2_000_000,
        "the new window keeps its own reservation"
    );
}

#[test]
fn the_window_must_be_long_enough_to_mean_something() {
    testing_env!(ctx("alice.near", NearToken::from_near(1), 100).build());
    let mut c = FlyCoordinator::new();
    let pk = hex::encode(key().verifying_key().to_bytes());
    let id = c.hatch(
        "win-1".into(),
        Some("FLASH".into()),
        Some(1),
        Some(50),
        pk,
        "code".into(),
        Some(30),
        None,
        None,
    );
    let mut p = policy();
    p.window_blocks = 10;
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| c.set_foreign_policy(id, p)));
    assert!(r.is_err(), "a ten-block window is refused");
}

// ---- GAP-048: pruning a group clears its foreign policy, and a re-hatched id starts clean ----

#[test]
fn pruning_a_group_clears_its_foreign_policy_and_a_rehatch_starts_clean() {
    testing_env!(ctx("alice.near", NearToken::from_near(1), 100).build());
    let mut c = FlyCoordinator::new();
    let pk = hex::encode(key().verifying_key().to_bytes());
    let id = c.hatch(
        "prune-1".into(),
        Some("FLASH".into()),
        Some(1),
        Some(50),
        pk.clone(),
        "code".into(),
        Some(30),
        None,
        None,
    );
    c.set_foreign_policy(id.clone(), policy());
    let nonce = c.get_syndicate(id.clone()).unwrap().round_nonce;
    pay(&mut c, &id, &nonce, sol_req("p-1", SOL_PAYEE, 1_000_000));
    // The creator removes the never-funded group at once.
    testing_env!(ctx("alice.near", NearToken::from_yoctonear(0), 200).build());
    c.prune_syndicate(id.clone());
    assert!(
        c.get_foreign_policy(id.clone()).is_none(),
        "the policy is gone"
    );
    // The same id is hatched again later.
    testing_env!(ctx("alice.near", NearToken::from_near(1), 300).build());
    let id2 = c.hatch(
        "prune-1".into(),
        Some("FLASH".into()),
        Some(1),
        Some(50),
        pk,
        "code".into(),
        Some(30),
        None,
        None,
    );
    assert!(
        c.get_foreign_obligation(id2.clone(), "p-1".into())
            .is_none(),
        "the old obligation is not inherited"
    );
    assert_eq!(
        c.get_foreign_spent(id2.clone(), "solana-devnet".into(), SOL_PAYEE.into())
            .0,
        0,
        "the old running total is not inherited"
    );
    c.set_foreign_policy(id2, policy()); // would panic "already set" if the old policy had survived
}

#[test]
fn a_stranger_cannot_prune_a_group_that_has_a_foreign_policy() {
    testing_env!(ctx("alice.near", NearToken::from_near(1), 100).build());
    let mut c = FlyCoordinator::new();
    let pk = hex::encode(key().verifying_key().to_bytes());
    let id = c.hatch(
        "prune-2".into(),
        Some("FLASH".into()),
        Some(1),
        Some(50),
        pk,
        "code".into(),
        Some(30),
        None,
        None,
    );
    c.set_foreign_policy(id.clone(), policy());
    // Long after the seven-day mark anyone may normally remove an unfunded group; with a foreign policy only the owner may.
    testing_env!(ctx("mallory.near", NearToken::from_yoctonear(0), 100 + 700_000).build());
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| c.prune_syndicate(id)));
    assert!(
        r.is_err(),
        "removing the group would strand money at its foreign addresses"
    );
}

// ---- F3: a finished group can still pay its listed foreign payees, so money at its foreign addresses is not stranded ----

#[test]
fn a_refunded_group_can_still_pay_its_listed_foreign_payees_within_the_caps() {
    let (mut c, id, nonce) = funded(true);
    // The only member leaves after the exit timer: the group becomes AbortedRefunded.
    testing_env!(ctx("flyer1.near", NearToken::from_yoctonear(0), 400).build());
    let _ = c.hatch_out(id.clone());
    let nonce_now = c.get_syndicate(id.clone()).unwrap().round_nonce;
    assert!(
        matches!(
            c.get_group_phase(id.clone()),
            Some(fly_coordinator::GroupPhase::Refunded)
        ),
        "precondition: the group is refunded"
    );
    let req = sol_req("late-1", SOL_PAYEE, 500_000);
    let sig = sign(&c, &id, &nonce_now, &req);
    testing_env!(ctx("host.near", NearToken::from_yoctonear(0), 410).build());
    let _ = c.request_foreign_payment(id.clone(), nonce_now.clone(), req, sig);
    assert!(c
        .get_foreign_obligation(id.clone(), "late-1".into())
        .is_some());
    // The caps still apply after the group is finished.
    let big = sol_req("late-2", SOL_PAYEE, 2_000_001);
    let sig2 = sign(&c, &id, &nonce_now, &big);
    let over = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _ = c.request_foreign_payment(id, nonce_now, big, sig2);
    }));
    assert!(over.is_err());
    let _ = nonce;
}

// ---- GAP-049: the signer path names the group's creation block, so a re-used group id does not re-use the old group's foreign addresses ----

#[test]
fn the_signer_path_names_the_group_and_its_creation_block() {
    use fly_coordinator::foreign::signer_path;
    assert_eq!(signer_path("payroll-1", 100), "payroll-1:100");
    assert_ne!(
        signer_path("payroll-1", 100),
        signer_path("payroll-1", 300),
        "the same id at another block is another path"
    );
    assert_ne!(signer_path("payroll-1", 100), signer_path("payroll-2", 100));
}

#[test]
fn a_rehatched_group_id_gets_a_different_signing_path_so_different_foreign_addresses() {
    testing_env!(ctx("alice.near", NearToken::from_near(1), 100).build());
    let mut c = FlyCoordinator::new();
    let pk = hex::encode(key().verifying_key().to_bytes());
    let id = c.hatch(
        "reuse-1".into(),
        Some("FLASH".into()),
        Some(1),
        Some(50),
        pk.clone(),
        "code".into(),
        Some(30),
        None,
        None,
    );
    let before = c
        .get_foreign_path(id.clone())
        .expect("a path for a live group");
    testing_env!(ctx("alice.near", NearToken::from_yoctonear(0), 200).build());
    c.prune_syndicate(id.clone());
    assert!(
        c.get_foreign_path(id.clone()).is_none(),
        "a pruned group has no path"
    );
    // Anyone may hatch the freed id, with their own room key.
    testing_env!(ctx("mallory.near", NearToken::from_near(1), 300).build());
    let mallory_pk = hex::encode(
        SigningKey::from_bytes(&[7u8; 32])
            .verifying_key()
            .to_bytes(),
    );
    let id2 = c.hatch(
        "reuse-1".into(),
        Some("FLASH".into()),
        Some(1),
        Some(50),
        mallory_pk,
        "code".into(),
        Some(30),
        None,
        None,
    );
    let after = c.get_foreign_path(id2).expect("a path for the new group");
    assert_ne!(before, after, "the new group must not share the old group's signing path, or it would control the old group's foreign money");
}

#[test]
fn an_unknown_group_has_no_signing_path() {
    testing_env!(ctx("alice.near", NearToken::from_near(1), 100).build());
    let c = FlyCoordinator::new();
    assert!(c.get_foreign_path("nobody-1".into()).is_none());
}
