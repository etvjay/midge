# Phase 09 — Reproducible Evidence, Checked Records and a Prebuilt Test Environment

**STATUS:** PLANNED (not started; added on request, to be scheduled after the audit fixes are deployed)
**OWNER:** Engineering Program Lead

## Objective
Make every claim, evidence entry, decision and verification result something a stranger can re-run and get the same answer, and make the environment that does so one command away. Today the Foundry check proves the ledgers parse and the files they cite exist. It does not prove a claim's evidence still reproduces, or that a decision record matches the code.

## Why this phase exists
Phase 08 states invariant `I-08-C` ("every claim must cite verifiable code and reproducible commands") but nothing enforces it. A claim can go stale without any check failing, and the judge path assumes a machine that already has Rust, Node, wasm tooling and `dcap-qvl`.

## Checklist

### A. Tests for the records themselves
- [ ] **Claims (`foundry/claims.jsonl`)**: a test that, for each claim, runs its stated command (offline ones by default) and compares the result with the recorded one. A claim with no runnable command is listed as "unverified", not silently passed.
- [ ] **Evidence ledger (`docs/canonical/EVIDENCE_LEDGER.md`)**: every row points to a promoted lab run that `node lab/verify-run.js` accepts, and its commit exists. Reject a row whose run is missing, tampered with or from a different commit than the claim says.
- [ ] **Gaps (`foundry/gaps.jsonl`)**: a gap marked `VERIFIED_*` names a regression guard that exists and passes; a closed gap's `closed_by_commit` exists in git.
- [ ] **ADRs (`docs/canonical/DECISIONS.md`)**: one record per decision with a status (accepted, superseded, stale), the code it governs, and a test or check that fails if the code departs from it. The 7 current ADRs are stale and must be rewritten or superseded first.
- [x] **Invariants** (done in 09-1, 2026-11-08): define every invariant ID that is cited (`I-07` is cited and undefined), give each a stated test, and fail the check on an ID that is cited but not defined.
- [x] **State machine** (done in 09-1; contract table in `docs/STATE_MACHINE.md`, transition tests in `state_machine_tests.rs`): write the contract's states and transitions down once (Active, Settled, AbortedRefunded, settling, pending settlement, release window, second key, epoch) and test the contract against that table.
- [ ] **Docs numbers**: figures in README, `CURRENT_STATE.md` and the submission pack (test counts, run counts, timings) come from a generated file, not typed by hand. Today `AGENTS.md` still says about 100 s in one place and `~1.1 s` in another.
- [ ] **Deployment record**: `docs/canonical/deployments.json`, `docs/DEPLOYMENTS.md` and the site pin agree with each other, and with the chain when online.

### B. Stronger tests for the contract (from the audit)
- [ ] Stateful property test with a reference model: all actions (hatch, deposit, settle, charged settle, callback success and failure, recover, exit, prune), settlement state, charges, release window, pending record, two-room, timer. Today it covers 3 actions over 30 cases.
- [ ] `cargo-fuzz` targets for settlement message parsing and the hash functions.
- [ ] `near-workspaces` sandbox tests on the real wasm (the integration tests today use a mocked runtime).
- [ ] A small TLA+ or Quint model of the settlement and exit protocol, checked against the invariants above.
- [ ] Audit leads still open: 9 (charged programs vs. membership), 11 (measurement pin), 12 (advice record carries its attestation), 13, 14, 15.

### C. Prebuilt, easy-to-test environment
- [ ] One script (`scripts/setup-env`) that installs or checks every tool, pinned by version: Node, Rust and the wasm target, `dcap-qvl`, and the cargo test tools. It reports what is missing and does not fail halfway through.
- [ ] A container image (or devcontainer) with all of the above, built in CI, so `docker run` gives the judge path with no installs. Pin it by digest.
- [ ] Offline by default: a marker separates tests that need the network (NEAR RPC, NEAR AI Cloud, Phala) from those that do not, and the offline set runs with the network off. Live checks are opt-in and say so.
- [ ] Install and check `dcap-qvl` (pin 0.7.0, as in `ci.yml`). Since audit lead 10 the Intel chain check defaults to `required`, so a machine without it fails attestation on purpose instead of passing unchecked. The script should say so in plain words, not leave it to look like a new bug.
- [ ] Check the settings that now refuse to run: the REST daemon will not start on a non-loopback address without `FLY_API_KEY` (audit lead 8), and refuses browser requests with a foreign Origin or Host (lead 7). The script prints which of these a given setup will hit.
- [ ] Disk and time guards: the setup script checks free disk (the host is at 99%) before it builds, and prints expected run time.
- [ ] A second machine, clean clone: run the setup script and `make verify` from scratch, and record the result as evidence.

### D. Wire it in
- [ ] `make verify` runs sections A and C's offline checks, and says which checks were skipped and why.
- [ ] CI runs the same command, so the judge path and CI cannot drift.
- [ ] Add the new checks to `foundry/state.json`, move `current_phase` to 09 when this starts, and add the claims it makes to `claims.jsonl`.

## Invariants
- `I-09-A`: A claim, evidence row or decision whose check cannot run is reported as unverified. It is never reported as passing.
- `I-09-B`: The offline verification set passes on a clean clone with the network disabled.
- `I-09-C`: Every number quoted in documentation is generated, or checked against a generated source.

## Required verification
- `make verify` on a clean clone using only `scripts/setup-env`.
- A deliberate break of one claim, one ADR and one deployment pin is each caught by the new checks (mutation test of the checker itself).

## Exit gate
Phase is PASS when sections A to D are checked off, the break tests above are caught, and a clean-clone run is recorded in the evidence ledger.
