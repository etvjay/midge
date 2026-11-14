//! Runs the real midge-room-signer binary the way OutLayer does: JSON on stdin, the protected secret in PROTECTED_ROOM, JSON on stdout.
//! The signature is checked with ed25519-dalek against a message built here from the documented formula, not by calling the program's own code.
use ed25519_dalek::{Signature, SigningKey, Verifier, VerifyingKey};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::io::Write;
use std::process::{Command, Stdio};

const SEED_HEX: &str = "0101010101010101010101010101010101010101010101010101010101010101";

fn run(input: &str, secret: Option<&str>) -> Value {
    let mut cmd = Command::new(env!("CARGO_BIN_EXE_midge-room-signer"));
    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .env_remove("PROTECTED_ROOM");
    if let Some(s) = secret {
        cmd.env("PROTECTED_ROOM", s);
    }
    let mut child = cmd.spawn().expect("the binary starts");
    child
        .stdin
        .take()
        .unwrap()
        .write_all(input.as_bytes())
        .unwrap();
    let out = child.wait_with_output().expect("the binary finishes");
    assert!(
        out.status.success(),
        "the program reports refusals as JSON and exits 0"
    );
    serde_json::from_slice(&out.stdout).expect("stdout is one JSON value")
}

fn key() -> SigningKey {
    SigningKey::from_bytes(&[1u8; 32])
}

fn sign_request(allocations: Value, max_total: &str) -> String {
    json!({"op":"sign","contract":"c.test.testnet","syndicate_id":"group-1","epoch":3,"nonce":"n-1","order_hash":"abc123","allocations":allocations,"max_total_yocto":max_total}).to_string()
}

fn refused(v: &Value, fragment: &str) {
    assert_eq!(v["ok"], json!(false), "{v}");
    assert!(v["error"].as_str().unwrap().contains(fragment), "{v}");
    assert!(
        v.get("signature").is_none(),
        "a refusal carries no signature"
    );
}

#[test]
fn pubkey_is_the_public_key_of_the_protected_seed() {
    let v = run(r#"{"op":"pubkey"}"#, Some(SEED_HEX));
    assert_eq!(v["ok"], json!(true));
    assert_eq!(
        v["public_key"].as_str().unwrap(),
        hex::encode(key().verifying_key().to_bytes())
    );
}

#[test]
fn sign_signs_the_message_the_contract_verifies_with_the_allocations_sorted_by_recipient() {
    let allocs = json!([{"recipient":"zed.testnet","amount":"30"},{"recipient":"amy.testnet","amount":"70"}]);
    let v = run(&sign_request(allocs, "100"), Some(SEED_HEX));
    assert_eq!(v["ok"], json!(true), "{v}");
    let allocations_hash = hex::encode(Sha256::digest(b"amy.testnet:70,zed.testnet:30"));
    assert_eq!(
        v["allocations_hash"].as_str().unwrap(),
        allocations_hash,
        "sorted by recipient, recipient:amount joined by commas"
    );
    let message = format!("c.test.testnet:group-1:3:n-1:{allocations_hash}:abc123");
    let sig_bytes: [u8; 64] = hex::decode(v["signature"].as_str().unwrap())
        .unwrap()
        .try_into()
        .unwrap();
    let public = VerifyingKey::from_bytes(&key().verifying_key().to_bytes()).unwrap();
    assert!(
        public
            .verify(message.as_bytes(), &Signature::from_bytes(&sig_bytes))
            .is_ok(),
        "the signature verifies over the documented message"
    );
    assert!(
        public
            .verify(b"another message", &Signature::from_bytes(&sig_bytes))
            .is_err(),
        "and over nothing else"
    );
}

#[test]
fn a_total_exactly_at_the_bound_is_signed_and_one_over_is_refused() {
    let allocs =
        json!([{"recipient":"amy.testnet","amount":"60"},{"recipient":"bo.testnet","amount":"40"}]);
    assert_eq!(
        run(&sign_request(allocs.clone(), "100"), Some(SEED_HEX))["ok"],
        json!(true)
    );
    refused(
        &run(&sign_request(allocs, "99"), Some(SEED_HEX)),
        "exceed the bound",
    );
}

#[test]
fn without_the_protected_secret_it_refuses_everything() {
    refused(
        &run(r#"{"op":"pubkey"}"#, None),
        "PROTECTED_ROOM is not available",
    );
}

#[test]
fn a_secret_that_is_not_32_bytes_of_hex_is_refused() {
    refused(
        &run(r#"{"op":"pubkey"}"#, Some("zz")),
        "not 32 bytes of hex",
    );
    refused(
        &run(r#"{"op":"pubkey"}"#, Some("0101")),
        "not 32 bytes of hex",
    );
}

#[test]
fn input_that_is_not_json_and_an_unknown_op_are_refused() {
    refused(&run("not json", Some(SEED_HEX)), "not the expected JSON");
    refused(&run(r#"{"op":"delete"}"#, Some(SEED_HEX)), "pubkey or sign");
}

#[test]
fn nine_allocations_and_none_are_refused() {
    let nine: Vec<Value> = (0..9)
        .map(|i| json!({"recipient": format!("r{i}.testnet"), "amount": "1"}))
        .collect();
    refused(
        &run(&sign_request(json!(nine), "100"), Some(SEED_HEX)),
        "one to eight",
    );
    refused(
        &run(&sign_request(json!([]), "100"), Some(SEED_HEX)),
        "one to eight",
    );
}

#[test]
fn eight_allocations_are_signed() {
    let eight: Vec<Value> = (0..8)
        .map(|i| json!({"recipient": format!("r{i}.testnet"), "amount": "1"}))
        .collect();
    assert_eq!(
        run(&sign_request(json!(eight), "100"), Some(SEED_HEX))["ok"],
        json!(true)
    );
}

#[test]
fn a_repeated_recipient_a_zero_amount_and_a_malformed_amount_are_refused() {
    let repeated =
        json!([{"recipient":"a.testnet","amount":"1"},{"recipient":"a.testnet","amount":"2"}]);
    refused(
        &run(&sign_request(repeated, "100"), Some(SEED_HEX)),
        "zero, malformed or repeated",
    );
    refused(
        &run(
            &sign_request(json!([{"recipient":"a.testnet","amount":"0"}]), "100"),
            Some(SEED_HEX),
        ),
        "zero, malformed or repeated",
    );
    refused(
        &run(
            &sign_request(json!([{"recipient":"a.testnet","amount":"1.5"}]), "100"),
            Some(SEED_HEX),
        ),
        "whole number",
    );
}

#[test]
fn a_field_with_a_colon_is_refused_so_the_signed_message_cannot_be_reparsed_differently() {
    let mut req: Value = serde_json::from_str(&sign_request(
        json!([{"recipient":"a.testnet","amount":"1"}]),
        "100",
    ))
    .unwrap();
    req["nonce"] = json!("n:1");
    refused(&run(&req.to_string(), Some(SEED_HEX)), "contains ':'");
    let colon_recipient = sign_request(json!([{"recipient":"a:b","amount":"1"}]), "100");
    refused(
        &run(&colon_recipient, Some(SEED_HEX)),
        "zero, malformed or repeated",
    );
}

#[test]
fn each_required_field_is_required() {
    for field in [
        "contract",
        "syndicate_id",
        "nonce",
        "order_hash",
        "epoch",
        "allocations",
        "max_total_yocto",
    ] {
        let mut req: Value = serde_json::from_str(&sign_request(
            json!([{"recipient":"a.testnet","amount":"1"}]),
            "100",
        ))
        .unwrap();
        req.as_object_mut().unwrap().remove(field);
        let v = run(&req.to_string(), Some(SEED_HEX));
        assert_eq!(v["ok"], json!(false), "{field}: {v}");
        assert!(
            v["error"].as_str().unwrap().contains("required"),
            "{field}: {v}"
        );
    }
}

#[test]
fn totals_that_overflow_are_refused_and_not_wrapped() {
    let huge = u128::MAX.to_string();
    let allocs =
        json!([{"recipient":"a.testnet","amount":huge},{"recipient":"b.testnet","amount":"1"}]);
    refused(
        &run(&sign_request(allocs, &huge), Some(SEED_HEX)),
        "overflows",
    );
}
