// Plan 09-1, Task 5: tests for what docs/STATE_MACHINE.md said had no test, and thicker checks for the invariants it names.
// Each test name starts st_ (a transition or view) or inv_cNN_ (an invariant in foundry/invariants.json).
#![allow(deprecated)]

use ed25519_dalek::{Signer, SigningKey};
use fly_coordinator::{
    compute_allocations_hash, compute_charges_hash, Allocation, Charge, FlyCoordinator,
    SyndicateStatus,
};
use near_sdk::test_utils::testing_env_with_promise_results;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::testing_env;
use near_sdk::{AccountId, NearToken, PromiseResult};

fn ctx(who: &str, deposit: NearToken, block: u64) -> VMContextBuilder {
    let who: AccountId = who.parse().unwrap();
    let mut b = VMContextBuilder::new();
    b.current_account_id("fly-coordinator.testnet".parse().unwrap())
        .signer_account_id(who.clone())
        .predecessor_account_id(who)
        .attached_deposit(deposit)
        .block_height(block);
    b
}

fn room_pk() -> String {
    hex::encode(
        SigningKey::from_bytes(&[42u8; 32])
            .verifying_key()
            .to_bytes(),
    )
}

fn sign_charged(id: &str, epoch: u64, nonce: &str, ah: &str, ch: &str, order: &str) -> String {
    let m = format!(
        "fly-coordinator.testnet:{}:{}:{}:{}:{}:{}",
        id, epoch, nonce, ah, ch, order
    );
    hex::encode(
        SigningKey::from_bytes(&[42u8; 32])
            .sign(m.as_bytes())
            .to_bytes(),
    )
}

const MEMBERS: [&str; 3] = ["a.near", "b.near", "c.near"];

/// A group of three members with 10 NEAR each, in the Open state.
fn open_group(id: &str) -> (FlyCoordinator, String) {
    testing_env!(ctx("alice.near", NearToken::from_near(1), 100).build());
    let mut c = FlyCoordinator::new();
    let sid = c.hatch(
        id.to_string(),
        Some("FLASH".to_string()),
        Some(1),
        Some(50),
        room_pk(),
        "hash".to_string(),
        Some(30),
        Some("r.near".parse().unwrap()),
        None,
    );
    let ph = c.get_policy_hash(sid.clone());
    for (i, m) in MEMBERS.iter().enumerate() {
        testing_env!(ctx(m, NearToken::from_near(10), 105 + i as u64).build());
        c.deposit(sid.clone(), ph.clone());
    }
    (c, sid)
}

/// C-01: with nothing in flight, the members' escrows add up to the group's total.
fn assert_books_balance(c: &FlyCoordinator, id: &str) {
    let st = c.get_syndicate(id.to_string()).unwrap();
    assert!(
        !st.is_settling,
        "books are only compared when nothing is in flight"
    );
    let sum: u128 = MEMBERS
        .iter()
        .map(|m| {
            c.get_escrow(id.to_string(), m.parse().unwrap())
                .as_yoctonear()
        })
        .sum();
    assert_eq!(
        sum,
        st.total_escrow.as_yoctonear(),
        "members' escrows must add up to the total"
    );
}

fn pay(near: u128) -> Vec<Allocation> {
    vec![Allocation {
        recipient: "r.near".parse().unwrap(),
        amount: NearToken::from_near(near),
    }]
}
fn charge(m: &str, near: u128) -> Charge {
    Charge {
        member: m.parse().unwrap(),
        amount: NearToken::from_near(near),
    }
}

/// Settle `payout` NEAR, charged to the given members, and run the follow-up step as if the transfer landed.
fn settle_and_land(
    c: &mut FlyCoordinator,
    id: &str,
    charges: Vec<Charge>,
    payout: u128,
    block: u64,
) {
    let st = c.get_syndicate(id.to_string()).unwrap();
    let sig = sign_charged(
        id,
        st.epoch,
        &st.round_nonce,
        &compute_allocations_hash(&pay(payout)),
        &compute_charges_hash(&charges),
        "order",
    );
    testing_env!(ctx("alice.near", NearToken::from_near(0), block).build());
    c.settle_batch_charged(
        id.to_string(),
        st.round_nonce.clone(),
        "order".to_string(),
        pay(payout),
        charges.clone(),
        sig,
    );
    testing_env_with_promise_results(
        ctx(
            "fly-coordinator.testnet",
            NearToken::from_near(0),
            block + 1,
        )
        .build(),
        PromiseResult::Successful(vec![]),
    );
    assert!(c.on_settlement_payout(
        id.to_string(),
        pay(payout),
        charges,
        NearToken::from_near(payout),
        compute_allocations_hash(&pay(payout)),
        "order".to_string()
    ));
}

#[test]
fn st_views_describe_a_new_group() {
    let (c, id) = open_group("st-views");
    assert_eq!(c.get_syndicate_count(), 1);
    assert!(c.list_syndicates(None, None).iter().any(|s| s.id == id));
    assert_eq!(c.get_syndicate(id.clone()).unwrap().id, id);
    assert_eq!(
        c.get_escrow(id.clone(), "a.near".parse().unwrap()),
        NearToken::from_near(10)
    );
    assert_eq!(
        c.get_escrow(id.clone(), "nobody.near".parse().unwrap()),
        NearToken::from_near(0)
    );
    assert_eq!(c.get_member_syndicate_count("a.near".parse().unwrap()), 1);
    assert_eq!(
        c.get_member_syndicate_count("nobody.near".parse().unwrap()),
        0
    );
    let pol = c.get_release_policy(id).expect("a policy");
    assert_eq!(
        pol.allowed_recipients,
        vec!["r.near".parse::<AccountId>().unwrap()]
    );
}

#[test]
fn st_views_say_nothing_about_a_group_that_does_not_exist() {
    let (c, _) = open_group("st-views-none");
    assert!(c.get_syndicate("not-there".to_string()).is_none());
    assert!(c.get_release_policy("not-there".to_string()).is_none());
}

#[test]
fn inv_c01_the_books_balance_after_every_transition() {
    let (mut c, id) = open_group("inv-c01");
    assert_books_balance(&c, &id); // after hatch and deposits
    settle_and_land(
        &mut c,
        &id,
        vec![
            charge("a.near", 2),
            charge("b.near", 4),
            charge("c.near", 6),
        ],
        12,
        120,
    );
    assert_books_balance(&c, &id); // after a charged settlement landed
    testing_env!(ctx("b.near", NearToken::from_near(0), 400).build());
    let _ = c.hatch_out(id.clone());
    assert_books_balance(&c, &id); // after an exit
    testing_env!(ctx("a.near", NearToken::from_near(1), 410).build());
    let ph = c.get_policy_hash(id.clone());
    c.deposit(id.clone(), ph);
    assert_books_balance(&c, &id); // after a deposit
}

#[test]
fn inv_c05_the_nonce_changes_when_a_settlement_finishes() {
    let (mut c, id) = open_group("inv-c05");
    let before = c.get_syndicate(id.clone()).unwrap().round_nonce;
    settle_and_land(&mut c, &id, vec![charge("a.near", 1)], 1, 120);
    let after = c.get_syndicate(id).unwrap().round_nonce;
    assert_ne!(
        before, after,
        "the nonce must rotate so the old signature is dead"
    );
}

#[test]
#[should_panic(expected = "inactive syndicate")]
fn inv_c12_a_settled_group_takes_no_more_deposits() {
    let (mut c, id) = open_group("inv-c12-settled");
    // pay everything out: 30 NEAR charged 10 each
    settle_and_land(
        &mut c,
        &id,
        vec![
            charge("a.near", 10),
            charge("b.near", 10),
            charge("c.near", 10),
        ],
        30,
        120,
    );
    assert_eq!(
        c.get_syndicate(id.clone()).unwrap().status,
        SyndicateStatus::Settled
    );
    let ph = c.get_policy_hash(id.clone());
    testing_env!(ctx("a.near", NearToken::from_near(1), 130).build());
    c.deposit(id, ph);
}

#[test]
fn inv_c12_a_refunded_group_stays_refunded() {
    let (mut c, id) = open_group("inv-c12-refunded");
    for (i, m) in MEMBERS.iter().enumerate() {
        testing_env!(ctx(m, NearToken::from_near(0), 400 + i as u64).build());
        let _ = c.hatch_out(id.clone());
    }
    assert_eq!(
        c.get_syndicate(id.clone()).unwrap().status,
        SyndicateStatus::AbortedRefunded
    );
    let ph = c.get_policy_hash(id.clone());
    testing_env!(ctx("a.near", NearToken::from_near(1), 500).build());
    let refused =
        std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| c.deposit(id.clone(), ph)));
    assert!(refused.is_err(), "a refunded group must not take deposits");
    assert_eq!(
        c.get_syndicate(id).unwrap().status,
        SyndicateStatus::AbortedRefunded
    );
}
