# Phase 03 — The Hatch Protocol & OutLayer Governance

**STATUS:** PASS  
**OWNER:** Protocol Architect  

## Objective
Build the Nest coordinator factory, bounded agent sub-account generation (`*.fly.testnet`), OutLayer spending limit policies, and the non-custodial automated escape hatch (`hatch_out`).

## Why this phase exists
Guarantees agent isolation and non-custodial safety: if an enclave crashes or malicious agents refuse to deliberate, funds can never be permanently trapped or stolen.

## Admitted scope
- Nest coordinator state machine in `src/contracts/nest.js`.
- OutLayer policy manager enforcing balance caps and method whitelisting in `src/policies/outlayer.js`.
- Bounded sub-account derivation (`<syndicate-id>.fly.testnet`).
- Timelock-triggered 100% refund execution (`hatch_out()`).

## Explicitly excluded
- Rust L1 contract compilation (tested in Phase 07).
- HTTP API endpoints (implemented in Phase 06).

## Invariants
- `I-03-A`: OutLayer policies must reject any single-transaction spend exceeding the configured allowance.
- `I-03-B`: `hatch_out()` must strictly reject premature execution prior to timelock expiration.
- `I-03-C`: Upon timelock expiration without a valid HAQ batch proof, 100% of deposited escrow MUST return to original depositors.

## Deliverables
- `src/contracts/nest.js`
- `src/policies/outlayer.js`
- `verifications/03-hatch-escape-hatch.js`

## Required verification
- `npm run verify:hatch`

## Exit gate
Phase is PASS when both happy-path HAQ settlement and failure-path `hatch_out` 100% refund succeed with zero escrow leakage.
