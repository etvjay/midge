# Phase 08 — Master Verification Suite, Builder Foundry & Submission Readiness

**STATUS:** PASS  
**OWNER:** Engineering Program Lead  

## Objective
Establish a single-command, deterministic verification harness (`./scripts/verify` / `make verify` / `npm test`), validate all 11 protocol claims against the Builder Foundry v1.0 standard, and deliver a comprehensive hackathon submission pack.

## Why this phase exists
Guarantees that both automated AI evaluators (Claude Code, Cursor, Codex) and human hackathon judges can verify every protocol claim and cryptographic proof in under 2 seconds without external setup friction.

## Admitted scope
- Master verification runner `verify-all.js` aggregating all 8 verification scripts.
- Single-command judge script `scripts/verify` and `Makefile`.
- Builder Foundry consistency auditor `scripts/check-foundry.js`.
- Canonical evidence ledger in `docs/canonical/EVIDENCE_LEDGER.md`.
- Current state specification in `docs/canonical/CURRENT_STATE.md`.
- Hackathon submission pack in `docs/hackathon-submission.md`.

## Invariants
- `I-08-A`: Master verification suite must execute all 8 checks deterministically in <2.0 seconds.
- `I-08-B`: No critical open gaps may exist in `foundry/gaps.jsonl`.
- `I-08-C`: Every claim in `foundry/claims.jsonl` must cite verifiable code and reproducible commands.

## Deliverables
- `scripts/verify`
- `scripts/check-foundry.js`
- `Makefile`
- `docs/canonical/EVIDENCE_LEDGER.md`
- `docs/canonical/CURRENT_STATE.md`
- `docs/canonical/DECISIONS.md`

## Required verification
- `./scripts/verify`
- `make all`

## Exit gate
Phase is PASS when all 8 verification checks pass, Rust contract unit tests pass, WASM builds, and `check-foundry` reports 0 violations.

## Follow-up
`I-08-C` is stated but not yet enforced by a check, and the judge path assumes a machine that already has its tools. Both are scheduled in `09-reproducibility-and-prebuilt-environment.md`.
