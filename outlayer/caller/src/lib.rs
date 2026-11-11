//! A NEAR contract that triggers an OutLayer program and receives its result in a callback (proof of concept).
//!
//! OutLayer runs Rust/WASM programs in Intel TDX hardware. A NEAR contract calls `request_execution` on `outlayer.testnet` and the result comes back through NEAR's
//! yield/resume: this contract's callback receives the program's JSON output. Here the program is `midge-room-signer` (see ../room-signer), whose output is an Ed25519
//! signature over a Midge settlement; the contract stores it so anyone can read it and present it to the Midge contract.
//!
//! Only the owner can trigger a run, and a run needs an attached deposit that pays OutLayer (anything unused is refunded to this contract). The contract holds no key of
//! its own and signs nothing; the signing key is a protected OutLayer secret that only the program, running in OutLayer's TEE, can read.
use near_sdk::serde_json::{json, Value};
use near_sdk::{env, near, AccountId, Gas, PanicOnDefault, Promise, PromiseError};

const OUTLAYER: &str = "outlayer.testnet";
/// What a run costs OutLayer (about 0.002 NEAR for a short run as of 2026-11-11), with room to spare; the unused part is refunded.
const MIN_DEPOSIT_YOCTO: u128 = 3_000_000_000_000_000_000_000;

/// The arguments for OutLayer's `request_execution`: the same shape the OutLayer CLI sends (read from a real transaction on 2026-11-11).
pub fn request_args(project_id: &str, secrets_account: &str, input_data: &str) -> Value {
    json!({
        "input_data": input_data,
        "params": null,
        "payer_account_id": null,
        "resource_limits": { "max_execution_seconds": 10, "max_instructions": 1_000_000_000u64, "max_memory_mb": 128 },
        "response_format": "Json",
        "secrets_ref": { "account_id": secrets_account, "profile": "default" },
        "source": { "Project": { "project_id": project_id, "version_key": null } }
    })
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Caller {
    owner: AccountId,
    project_id: String,
    last: Option<String>,
    runs: u64,
    results: u64,
}

#[near]
impl Caller {
    #[init]
    pub fn new(project_id: String, owner: AccountId) -> Self {
        Self {
            owner,
            project_id,
            last: None,
            runs: 0,
        }
    }

    /// Ask the OutLayer program to run with this input (a JSON string) and keep what comes back. Owner only; attach at least 0.003 NEAR.
    #[payable]
    pub fn request(&mut self, input_json: String) -> Promise {
        assert_eq!(
            env::predecessor_account_id(),
            self.owner,
            "only the owner may trigger a run"
        );
        assert!(
            env::attached_deposit().as_yoctonear() >= MIN_DEPOSIT_YOCTO,
            "attach at least 0.003 NEAR to pay for the run"
        );
        let secrets_account = self
            .project_id
            .split('/')
            .next()
            .unwrap_or_default()
            .to_string();
        let args = request_args(&self.project_id, &secrets_account, &input_json);
        self.runs += 1;
        Promise::new(OUTLAYER.parse().unwrap())
            .function_call(
                "request_execution".to_string(),
                args.to_string().into_bytes(),
                env::attached_deposit(),
                Gas::from_tgas(250),
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(20))
                    .on_result(),
            )
    }

    /// The callback: store the program's JSON output, or a note that the call failed. Returns what it stored.
    #[private]
    pub fn on_result(
        &mut self,
        #[callback_result] result: Result<Value, PromiseError>,
    ) -> Option<String> {
        self.store_result(result)
    }

    pub fn get_last(&self) -> Option<String> {
        self.last.clone()
    }

    pub fn get_runs(&self) -> u64 {
        self.runs
    }

    pub fn get_owner(&self) -> AccountId {
        self.owner.clone()
    }

    pub fn get_project(&self) -> String {
        self.project_id.clone()
    }
}

// Not an entry point (it takes a type that cannot be passed over JSON): the callback calls it, and the tests call it directly.
impl Caller {
    pub fn store_result(&mut self, result: Result<Value, PromiseError>) -> Option<String> {
        self.last = Some(match result {
            Ok(v) => v.to_string(),
            Err(_) => json!({ "ok": false, "error": "the OutLayer call failed" }).to_string(),
        });
        self.last.clone()
    }
}
