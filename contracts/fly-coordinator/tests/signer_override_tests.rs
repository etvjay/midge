//! Only compiled with `--features test-signer-override`: a build for the TEST copy of the contract that lets the contract's own account point the
//! signer at another account, so a signer failure can be shown live. Production builds do not contain this.
#![cfg(feature = "test-signer-override")]
#![allow(deprecated)]

use fly_coordinator::FlyCoordinator;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{testing_env, AccountId};

fn ctx(predecessor: &str) -> VMContextBuilder {
    let a: AccountId = predecessor.parse().unwrap();
    let mut b = VMContextBuilder::new();
    b.current_account_id("fly-coordinator.testnet".parse().unwrap())
        .signer_account_id(a.clone())
        .predecessor_account_id(a)
        .block_height(100);
    b
}

#[test]
fn only_the_contract_itself_may_set_the_test_signer() {
    testing_env!(ctx("fly-coordinator.testnet").build());
    let mut c = FlyCoordinator::new();
    c.set_test_signer("nobody.testnet".parse().unwrap());
    assert_eq!(c.get_test_signer().as_deref(), Some("nobody.testnet"));
    testing_env!(ctx("mallory.testnet").build());
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        c.set_test_signer("evil.testnet".parse().unwrap())
    }));
    assert!(r.is_err(), "anyone else is refused");
    assert_eq!(
        c.get_test_signer().as_deref(),
        Some("nobody.testnet"),
        "and nothing changed"
    );
}

#[test]
fn with_no_override_the_signer_is_the_real_one() {
    testing_env!(ctx("fly-coordinator.testnet").build());
    let c = FlyCoordinator::new();
    assert!(c.get_test_signer().is_none());
}
