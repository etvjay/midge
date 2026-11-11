//! A Midge room's settlement-signing step, as an OutLayer program (proof of concept).
//!
//! Input (stdin, JSON):
//!   {"op":"pubkey"}
//!   {"op":"sign","contract":"…","syndicate_id":"…","epoch":1,"nonce":"…","order_hash":"…",
//!    "allocations":[{"recipient":"a.testnet","amount":"<yocto>"}],"max_total_yocto":"<yocto>"}
//! Output (stdout, JSON, well under OutLayer's 900-byte result limit).
//!
//! The Ed25519 seed is the protected OutLayer secret PROTECTED_ROOM (64 hex characters), which nobody can read but this code in the TEE. For "sign" the
//! program does not take a hash from the caller: it computes the allocations hash itself, exactly as the Midge contract does (sorted by recipient,
//! "recipient:amount" joined by commas, SHA-256 in hex), builds the message the contract verifies, and signs only if the allocations are within the
//! bounds it was given. It refuses anything else.
use ed25519_dalek::{Signer, SigningKey};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::io::Read;

#[derive(Deserialize)]
struct Alloc {
    recipient: String,
    amount: String,
}

#[derive(Deserialize)]
struct Input {
    op: String,
    contract: Option<String>,
    syndicate_id: Option<String>,
    epoch: Option<u64>,
    nonce: Option<String>,
    order_hash: Option<String>,
    allocations: Option<Vec<Alloc>>,
    max_total_yocto: Option<String>,
}

fn fail(msg: &str) -> ! {
    println!("{}", serde_json::json!({ "ok": false, "error": msg }));
    std::process::exit(0);
}

fn plain(s: &str) -> bool {
    !s.is_empty() && s.len() <= 128 && !s.contains(':')
}

fn main() {
    let mut raw = String::new();
    std::io::stdin().read_to_string(&mut raw).ok();
    let input: Input = serde_json::from_str(raw.trim()).unwrap_or_else(|_| fail("input is not the expected JSON"));

    let seed_hex = std::env::var("PROTECTED_ROOM").unwrap_or_else(|_| fail("the protected secret PROTECTED_ROOM is not available to this run"));
    let seed: [u8; 32] = hex::decode(seed_hex.trim())
        .ok()
        .and_then(|b| b.try_into().ok())
        .unwrap_or_else(|| fail("PROTECTED_ROOM is not 32 bytes of hex"));
    let key = SigningKey::from_bytes(&seed);
    let public_key = hex::encode(key.verifying_key().to_bytes());

    match input.op.as_str() {
        "pubkey" => println!("{}", serde_json::json!({ "ok": true, "public_key": public_key })),
        "sign" => {
            let contract = input.contract.unwrap_or_else(|| fail("contract is required"));
            let id = input.syndicate_id.unwrap_or_else(|| fail("syndicate_id is required"));
            let nonce = input.nonce.unwrap_or_else(|| fail("nonce is required"));
            let order_hash = input.order_hash.unwrap_or_else(|| fail("order_hash is required"));
            let epoch = input.epoch.unwrap_or_else(|| fail("epoch is required"));
            let allocs = input.allocations.unwrap_or_else(|| fail("allocations are required"));
            let max_total: u128 = input.max_total_yocto.as_deref().and_then(|v| v.parse().ok()).unwrap_or_else(|| fail("max_total_yocto is required"));
            for f in [&contract, &id, &nonce, &order_hash] {
                if !plain(f) {
                    fail("a field is empty, too long or contains ':'");
                }
            }
            if allocs.is_empty() || allocs.len() > 8 {
                fail("one to eight allocations");
            }
            let mut rows: Vec<(String, u128)> = Vec::new();
            let mut total: u128 = 0;
            for a in &allocs {
                let amount: u128 = a.amount.parse().unwrap_or_else(|_| fail("an amount is not a whole number of yocto"));
                if amount == 0 || !plain(&a.recipient) || rows.iter().any(|(r, _)| r == &a.recipient) {
                    fail("an allocation is zero, malformed or repeated");
                }
                total = total.checked_add(amount).unwrap_or_else(|| fail("total overflows"));
                rows.push((a.recipient.clone(), amount));
            }
            if total > max_total {
                fail("the allocations exceed the bound this run was given");
            }
            rows.sort_by(|a, b| a.0.cmp(&b.0));
            let alloc_str = rows.iter().map(|(r, a)| format!("{}:{}", r, a)).collect::<Vec<_>>().join(",");
            let allocations_hash = hex::encode(Sha256::digest(alloc_str.as_bytes()));
            let message = format!("{}:{}:{}:{}:{}:{}", contract, id, epoch, nonce, allocations_hash, order_hash);
            let signature = hex::encode(key.sign(message.as_bytes()).to_bytes());
            println!("{}", serde_json::json!({ "ok": true, "public_key": public_key, "allocations_hash": allocations_hash, "signature": signature }));
        }
        _ => fail("op must be pubkey or sign"),
    }
}
