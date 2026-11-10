//! The contract builds the foreign transaction it asks the MPC signer to sign, so a payee or amount it checked cannot be swapped.
//! Vectors come from the JavaScript builders that already signed live transactions on Solana devnet and Ethereum Sepolia.
#![allow(deprecated)]

use fly_coordinator::foreign::{base58_decode, evm_transfer_digest, hex_to_20, solana_transfer_message};
use near_sdk::env;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::testing_env;

fn arr32(f: impl Fn(usize) -> u8) -> [u8; 32] {
    let mut a = [0u8; 32];
    for (i, b) in a.iter_mut().enumerate() {
        *b = f(i);
    }
    a
}

#[test]
fn solana_transfer_message_matches_the_message_that_landed_on_devnet() {
    let from = arr32(|i| (i + 1) as u8);
    let to = arr32(|i| (200 - i) as u8);
    let blockhash = arr32(|i| ((i * 7) % 256) as u8);
    let m = solana_transfer_message(&from, &to, 1_000_000, &blockhash);
    let expected = "010001030102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20c8c7c6c5c4c3c2c1c0bfbebdbcbbbab9b8b7b6b5b4b3b2b1b0afaeadacabaaa9000000000000000000000000000000000000000000000000000000000000000000070e151c232a31383f464d545b626970777e858c939aa1a8afb6bdc4cbd2d901020200010c0200000040420f0000000000";
    assert_eq!(hex::encode(&m), expected);
    assert_eq!(m.len(), 150);
}

#[test]
fn a_different_payee_or_amount_changes_the_message() {
    let from = arr32(|i| i as u8);
    let to = arr32(|i| 100 + i as u8);
    let other = arr32(|i| 101 + i as u8);
    let bh = arr32(|_| 9);
    let base = solana_transfer_message(&from, &to, 5, &bh);
    assert_ne!(base, solana_transfer_message(&from, &other, 5, &bh));
    assert_ne!(base, solana_transfer_message(&from, &to, 6, &bh));
}

#[test]
fn evm_digest_matches_ethers_for_a_sepolia_transfer() {
    testing_env!(VMContextBuilder::new().build());
    let to = hex_to_20("0xB9A425FB45734FC29a9c941c2c05b34DE59FF7A4").unwrap();
    let d = evm_transfer_digest(11_155_111, 7, 1_000_000_000, 2_000_000_000, 250_000, &to, 500_000_000_000_000, |b| env::keccak256(b));
    assert_eq!(hex::encode(d), "4e79b5a45aa7fb1c5fe0ba531c3206856f8be1936f4cc13242930a05e2949789");
}

#[test]
fn evm_digest_handles_zero_integers() {
    testing_env!(VMContextBuilder::new().build());
    let to = hex_to_20("0x000000000000000000000000000000000000dEaD").unwrap();
    let d = evm_transfer_digest(1, 0, 0, 1, 21_000, &to, 0, |b| env::keccak256(b));
    assert_eq!(hex::encode(d), "73b0986b9bdb6e37cf5b8a243fd17b9c6b7241e7aaf20e581bf12a56e41e3ea4");
}

#[test]
fn addresses_are_parsed_strictly() {
    assert!(hex_to_20("0x1234").is_none());
    assert!(hex_to_20("B9A425FB45734FC29a9c941c2c05b34DE59FF7A4").is_some());
    assert!(hex_to_20("0xZZA425FB45734FC29a9c941c2c05b34DE59FF7A4").is_none());
    assert_eq!(base58_decode("11111111111111111111111111111111").unwrap(), vec![0u8; 32]);
    assert!(base58_decode("0OIl").is_none()); // characters outside the base58 alphabet
    let key = base58_decode("2J75L6udJ52N7YmrDPQLN7gzV6CqWny6CaWGccvohi4f").unwrap();
    assert_eq!(key.len(), 32);
}
