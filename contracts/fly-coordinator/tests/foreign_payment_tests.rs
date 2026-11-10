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
    b.current_account_id(CONTRACT.parse().unwrap()).signer_account_id(a.clone()).predecessor_account_id(a).attached_deposit(deposit).block_height(block);
    b
}

fn key() -> SigningKey { SigningKey::from_bytes(&[42u8; 32]) }

fn policy() -> ForeignPolicy {
    ForeignPolicy {
        payees: vec![
            ForeignPayee { chain: "solana-devnet".into(), address: SOL_PAYEE.into(), max_amount: U128(2_000_000), max_total: U128(3_000_000) },
            ForeignPayee { chain: "ethereum-sepolia".into(), address: EVM_PAYEE.into(), max_amount: U128(1_000_000_000_000_000), max_total: U128(2_000_000_000_000_000) },
        ],
        max_fee_cost: U128(600_000_000_000_000),
    }
}

fn sol_req(id: &str, payee: &str, amount: u128) -> ForeignPaymentRequest {
    ForeignPaymentRequest { obligation_id: id.into(), chain: "solana-devnet".into(), from: SOL_FROM.into(), payee: payee.into(), amount: U128(amount), recent_blockhash: Some(BLOCKHASH.into()), evm_nonce: None, max_priority_fee: None, max_fee: None, gas_limit: None }
}

fn evm_req(id: &str, amount: u128, gas: u64, max_fee: u128) -> ForeignPaymentRequest {
    ForeignPaymentRequest { obligation_id: id.into(), chain: "ethereum-sepolia".into(), from: "0x0309Dbc3e7F5C40Bb957723Cebb4BE5329BB22c0".into(), payee: EVM_PAYEE.into(), amount: U128(amount), recent_blockhash: None, evm_nonce: Some(3), max_priority_fee: Some(U128(1_000_000_000)), max_fee: Some(U128(max_fee)), gas_limit: Some(gas) }
}

/// A funded group with the policy set: returns (contract, group id, round nonce).
fn funded(set_policy: bool) -> (FlyCoordinator, String, String) {
    testing_env!(ctx("alice.near", NearToken::from_near(1), 100).build());
    let mut c = FlyCoordinator::new();
    let pk = hex::encode(key().verifying_key().to_bytes());
    let id = c.hatch("payroll-1".into(), Some("FLASH".into()), Some(1), Some(50), pk, "code".into(), Some(30), Some("payout.near".parse().unwrap()), None);
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
    let m = foreign_payment_message(CONTRACT, "payroll-1", 1, "n0", &sol_req("inv-1", SOL_PAYEE, 5));
    assert_eq!(m, format!("{CONTRACT}:payroll-1:1:n0:foreign:inv-1:solana-devnet:{SOL_FROM}:{SOL_PAYEE}:5:{BLOCKHASH}"));
}

#[test]
fn an_in_rules_payment_reserves_budget_and_records_the_obligation() {
    let (mut c, id, nonce) = funded(true);
    pay(&mut c, &id, &nonce, sol_req("inv-1", SOL_PAYEE, 1_000_000));
    let o = c.get_foreign_obligation(id.clone(), "inv-1".into()).expect("recorded");
    assert_eq!(o.amount.0, 1_000_000);
    assert_eq!(c.get_foreign_spent(id, "solana-devnet".into(), SOL_PAYEE.into()).0, 1_000_000);
}

#[test]
fn the_policy_is_set_once_by_the_owner_before_funding() {
    testing_env!(ctx("alice.near", NearToken::from_near(1), 100).build());
    let mut c = FlyCoordinator::new();
    let pk = hex::encode(key().verifying_key().to_bytes());
    let id = c.hatch("grp-1".into(), Some("FLASH".into()), Some(1), Some(50), pk, "code".into(), Some(30), None, None);
    testing_env!(ctx("mallory.near", NearToken::from_yoctonear(0), 101).build());
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| c.set_foreign_policy(id.clone(), policy())));
    assert!(r.is_err(), "only the owner may set it");
    testing_env!(ctx("alice.near", NearToken::from_yoctonear(0), 102).build());
    c.set_foreign_policy(id.clone(), policy());
    let again = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| c.set_foreign_policy(id.clone(), policy())));
    assert!(again.is_err(), "it cannot be changed once set");
    assert_eq!(c.get_foreign_policy(id).unwrap().payees.len(), 2);
}

#[test]
fn a_policy_cannot_be_set_after_a_deposit() {
    let (mut c, id, _) = funded(false);
    testing_env!(ctx("alice.near", NearToken::from_yoctonear(0), 130).build());
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| c.set_foreign_policy(id, policy())));
    assert!(r.is_err());
}

#[test]
#[should_panic(expected = "[Foreign REJECT] payee")]
fn an_unlisted_payee_is_refused() {
    let (mut c, id, nonce) = funded(true);
    pay(&mut c, &id, &nonce, sol_req("inv-1", "3Bxs4ThwQbE4vyj9M5uZ2Pq9P9mXyB1vD8k6bX1w1h7S", 1));
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
    pay(&mut c, &id, &nonce, evm_req("inv-1", 1, 300_000, 3_000_000_000)); // 9e14 > 6e14
}

#[test]
fn an_ethereum_payment_within_the_caps_is_recorded() {
    let (mut c, id, nonce) = funded(true);
    pay(&mut c, &id, &nonce, evm_req("inv-1", 500_000_000_000_000, 250_000, 2_000_000_000));
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
    testing_env_with_promise_results(ctx(CONTRACT, NearToken::from_yoctonear(0), 125).build(), PromiseResult::Failed);
    let out = c.on_foreign_signed(id.clone(), "inv-1".into(), "solana-devnet".into(), SOL_PAYEE.into(), U128(1_000_000));
    assert!(out.is_none());
    assert!(c.get_foreign_obligation(id.clone(), "inv-1".into()).is_none());
    assert_eq!(c.get_foreign_spent(id, "solana-devnet".into(), SOL_PAYEE.into()).0, 0);
}

#[test]
fn a_successful_signer_call_keeps_the_reservation_and_marks_it_signed() {
    let (mut c, id, nonce) = funded(true);
    pay(&mut c, &id, &nonce, sol_req("inv-1", SOL_PAYEE, 1_000_000));
    testing_env_with_promise_results(ctx(CONTRACT, NearToken::from_yoctonear(0), 125).build(), PromiseResult::Successful(b"{\"scheme\":\"Ed25519\"}".to_vec()));
    let out = c.on_foreign_signed(id.clone(), "inv-1".into(), "solana-devnet".into(), SOL_PAYEE.into(), U128(1_000_000));
    assert!(out.is_some());
    assert!(c.get_foreign_obligation(id.clone(), "inv-1".into()).unwrap().signed);
    assert_eq!(c.get_foreign_spent(id, "solana-devnet".into(), SOL_PAYEE.into()).0, 1_000_000);
}
