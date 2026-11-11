#![allow(deprecated)]
use midge_outlayer_caller::Caller;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{testing_env, AccountId, NearToken};

fn ctx(who: &str, deposit: u128) -> VMContextBuilder {
    let a: AccountId = who.parse().unwrap();
    let mut b = VMContextBuilder::new();
    b.current_account_id("ol.test.testnet".parse().unwrap())
        .signer_account_id(a.clone())
        .predecessor_account_id(a)
        .attached_deposit(NearToken::from_yoctonear(deposit));
    b
}

#[test]
fn only_the_owner_may_trigger_a_run() {
    testing_env!(ctx("ol.test.testnet", 0).build());
    let mut c = Caller::new(
        "ol.test.testnet/midge-room-signer".to_string(),
        "ol.test.testnet".parse().unwrap(),
    );
    testing_env!(ctx("mallory.testnet", 5_000_000_000_000_000_000_000).build());
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _ = c.request("{\"op\":\"pubkey\"}".to_string());
    }));
    assert!(r.is_err(), "a stranger is refused");
}

#[test]
fn the_owner_must_attach_enough_for_a_run() {
    testing_env!(ctx("ol.test.testnet", 0).build());
    let mut c = Caller::new(
        "ol.test.testnet/midge-room-signer".to_string(),
        "ol.test.testnet".parse().unwrap(),
    );
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _ = c.request("{}".to_string());
    }));
    assert!(r.is_err(), "no deposit is refused before anything is sent");
    testing_env!(ctx("ol.test.testnet", 5_000_000_000_000_000_000_000).build());
    let _ = c.request("{\"op\":\"pubkey\"}".to_string()); // accepted: builds the promise
}

#[test]
fn the_callback_stores_what_it_receives_and_a_failure_is_recorded_not_lost() {
    testing_env!(ctx("ol.test.testnet", 0).build());
    let mut c = Caller::new(
        "ol.test.testnet/midge-room-signer".to_string(),
        "ol.test.testnet".parse().unwrap(),
    );
    assert!(c.get_last().is_none());
    let out = c.store_result(Ok(
        near_sdk::serde_json::json!({"ok": true, "public_key": "ab"}),
    ));
    assert_eq!(c.get_last(), out);
    assert!(c.get_last().unwrap().contains("public_key"));
    c.store_result(Err(near_sdk::PromiseError::Failed));
    assert!(
        c.get_last().unwrap().contains("failed"),
        "a failed OutLayer call is recorded as such"
    );
}
