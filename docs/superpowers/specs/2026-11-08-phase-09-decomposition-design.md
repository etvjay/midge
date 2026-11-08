# Phase 09 decomposition: reproducible evidence, checked records, prebuilt environment

**Status:** DRAFT for the user's review. Planning only. Path: architectural; too large for one spec, so it is split. Companion to `foundry/phases/09-reproducibility-and-prebuilt-environment.md` (the checklist).

## Why split
The checklist has four independent subsystems with different tools and risks. Each gets its own spec, plan and test-first build. Order matters because one piece feeds the others.

## Sub-projects, in order
**09-1 State machine and invariants (spec first; feeds 09-2 and 09-4).**
Write down once: the contract's states (Active, Settled, AbortedRefunded), flags (`is_settling`), stored records (pending settlement `p:`, release window `w:`, second key `k2:`), epoch, and every transition with its guard and effect. Define every invariant ID that is cited (`I-07` is cited and not defined) with a test or check. Output: `docs/STATE_MACHINE.md` and `foundry/invariants.json`, plus a test that fails when an ID is cited and not defined.
*Done when:* every `public fn` of the contract appears in the table, and each transition has at least one test that names it.

**09-2 Record checks.**
`scripts/check-records.js`, run by `make check`: claims re-run their command (offline ones by default, the rest listed as *unverified*); evidence rows must be accepted by `lab/verify-run.js` and cite an existing commit; `VERIFIED_*` gaps name a guard that exists and passes; `closed_by_commit` exists; ADRs have a status and a check; docs numbers (test counts, run counts) come from a generated file; `deployments.json`, the site pin and the chain agree. The ADRs are rewritten first (7 are stale).
*Done when:* a deliberately broken claim, ADR and pin are each caught (the checker is mutation-tested).

**09-3 Prebuilt environment.**
`scripts/setup-env` (pins Node, Rust + wasm target, `dcap-qvl` 0.7.0, cargo tools; checks free disk first), a container built in CI and pinned by digest, offline/live markers so the offline set runs with the network off, and one clean-clone run recorded as evidence. Includes the settings the audit made strict (daemon key, `dcap-qvl`).
*Done when:* `make verify` passes on a clean clone using only the script, with the network disabled.

**09-4 Heavier contract assurance (after 09-1).**
Stateful property test with a reference model over all actions; `cargo-fuzz` on message and hash parsing; `near-workspaces` tests on the real wasm; a small Quint or TLA+ model of settle/recover/exit. Each is its own plan.
*Done when:* the reference model and the contract agree over the full action set at a stated case count, and the model checks the invariants from 09-1.

## Not in this phase
Lead 9 (its own spec); lead 11 (needs the owner to name the trusted TEE measurements); a Phala image rebuild.

## Open points for review
1. Is 09-1 (the written state machine) the right first piece, or would you rather start with 09-3 so judges get a one-command setup sooner?
2. For 09-2: should *unverified* claims fail `make check` or only be listed? (Recommended: listed, and failing only for claims marked as offline-verifiable.)
3. Quint or TLA+ for the small model (Quint is lighter to run here; disk is at 99%).
