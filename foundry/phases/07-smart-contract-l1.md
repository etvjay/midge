# Phase 07 — Production NEAR L1 Smart Contract in Rust

**STATUS:** PASS  
**OWNER:** Smart Contract Lead  

## Objective
Author, test, and compile the production NEAR L1 coordinator smart contract in Rust using `near-sdk` 5.1 and modern `#[near]` serialization macros.

## Why this phase exists
Provides the on-chain canonical state anchor for syndicate lifecycles, deposit escrow, HAQ consensus proof verification, and non-custodial escape hatches on the NEAR blockchain.

## Admitted scope
- Contract code in `contracts/fly-coordinator/src/lib.rs`.
- Cargo configuration with `near-sdk = "5.1.0"` in `contracts/fly-coordinator/Cargo.toml`.
- Rust unit tests verifying state transitions, HAQ settlements, and timelock panics.
- Production WebAssembly compilation targeting `wasm32-unknown-unknown`.

## Invariants
- `I-07-A`: `hatch_out()` execution before timelock expiration must panic and reject fund unlocking.
- `I-07-B`: ~~Only registered member accounts may deposit into syndicate escrow.~~ **Superseded** (2026-11-08) by `C-09` in `foundry/invariants.json`: the contract has no member registry; any account may deposit if it names the current policy hash. See `docs/STATE_MACHINE.md`.
- `I-07-C`: Contract must compile cleanly to WebAssembly without exceeding NEAR contract size limits (238 KB achieved vs 4 MB limit).

## Deliverables
- `contracts/fly-coordinator/src/lib.rs`
- `contracts/fly-coordinator/Cargo.toml`
- `contracts/fly-coordinator/target/wasm32-unknown-unknown/release/fly_coordinator.wasm`

## Required verification
- `npm run verify:rust` (Unit tests)
- `npm run build:wasm` (Release binary compilation)

## Exit gate
Phase is PASS when Rust unit tests pass in <0.2s and release WASM compiles successfully.
