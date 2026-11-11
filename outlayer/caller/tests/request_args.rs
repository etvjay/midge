//! The arguments the contract sends to OutLayer's request_execution must match what the OutLayer CLI sends (read from a real transaction, 2026-11-11).
use midge_outlayer_caller::request_args;
use near_sdk::serde_json::json;

#[test]
fn the_request_matches_the_shape_the_cli_sends() {
    let a = request_args(
        "ol.fly-1793636729.testnet/midge-room-signer",
        "ol.fly-1793636729.testnet",
        "{\"op\":\"pubkey\"}",
    );
    assert_eq!(
        a,
        json!({
            "input_data": "{\"op\":\"pubkey\"}",
            "params": null,
            "payer_account_id": null,
            "resource_limits": { "max_execution_seconds": 10, "max_instructions": 1000000000u64, "max_memory_mb": 128 },
            "response_format": "Json",
            "secrets_ref": { "account_id": "ol.fly-1793636729.testnet", "profile": "default" },
            "source": { "Project": { "project_id": "ol.fly-1793636729.testnet/midge-room-signer", "version_key": null } }
        })
    );
}

#[test]
fn the_input_is_passed_through_as_a_string_not_parsed() {
    let a = request_args("o/p", "o", "  {\"x\": 1}  ");
    assert_eq!(a["input_data"], json!("  {\"x\": 1}  "));
}
