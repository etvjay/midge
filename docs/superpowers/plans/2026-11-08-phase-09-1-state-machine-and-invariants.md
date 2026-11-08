# Phase 09-1: State machine and invariants — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write the contract's state machine down once, define every invariant that is cited, and make a check fail when the two drift from the code.

**Architecture:** A small parser lists the contract's public functions. `docs/STATE_MACHINE.md` has one table row per function. `foundry/invariants.json` defines each invariant and names the tests that check it. `scripts/check-invariants.js` enforces both, and `make check` runs it. Missing transition tests are added in a new Rust test file. No contract behaviour changes.

**Tech Stack:** Node 24 (`node:test`), Rust (`cargo test`, existing `near-sdk` unit-test harness), Markdown/JSON.

**Spec:** `docs/superpowers/specs/2026-11-08-phase-09-decomposition-design.md` (sub-project 09-1).

## Global Constraints
- The contract source `contracts/fly-coordinator/src/lib.rs` is **not modified** by this plan; only tests, docs and checkers are added.
- Offline only; no network, no keys. Host disk is at 99%: reuse the existing `target/`, never `cargo clean`.
- Invariant ids: new contract invariants are `C-01` … `C-12`; old `I-NN-X` ids stay valid where defined. A bare `I-NN` means "the family of phase NN" (see Task 3).
- Test-first: each task writes its failing test, watches it fail for the right reason, then implements.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Never commit `.claude/settings.json` or `docs/canonical/inference-evidence.json`. `git push` only on the user's say-so.
- Plain-language line beside every new term in the docs (rule from `docs/GLOSSARY.md`).

## Review Focus
1. A public function is added to the contract later with no row in the table → `check-invariants` fails and names it.
2. An invariant cites a Rust test that was renamed or deleted → fails and names the invariant and test.
3. A `pub fn` that appears only inside a comment or a string is not counted as a contract function.
4. A bare `I-07` in the gap ledger (18 citations) → reported as a warning with the specific `C-xx` ids to use; history is not rewritten.
5. A superseded invariant (`I-07-B`) cited as if it still held → fails.

---

### Task 1: List the contract's public functions

**Files:**
- Create: `scripts/contract-api.js`
- Test: `tests/contract-api.test.js`

**Interfaces:**
- Produces: `contractPublicFns(libRsText: string): string[]` — the names of `pub fn` inside `impl FlyCoordinator` blocks, sorted, de-duplicated, comments and strings ignored.

- [ ] **Step 1: Write the failing test.** `tests/contract-api.test.js`: (a) on the real `lib.rs`, the result contains `hatch`, `deposit`, `settle_batch_charged`, `on_settlement_payout`, `recover_stuck_settlement`, `prune_syndicate` and does not contain `compute_hash` or `is_deadline_passed` (those belong to `ReleasePolicy`); (b) on a string with `// pub fn ghost()` and `"pub fn phantom"` inside `impl FlyCoordinator`, neither appears.
- [ ] **Step 2: Run** `node --test tests/contract-api.test.js` — Expected: FAIL, module not found.
- [ ] **Step 3: Implement `contractPublicFns`** in `scripts/contract-api.js`. Strip `//` and `/* */` comments and string literals first, then find each `impl FlyCoordinator {` block by brace matching and collect `pub fn <name>`.
- [ ] **Step 4: Run the test** — Expected: PASS.
- [ ] **Step 5: Commit** `scripts/contract-api.js tests/contract-api.test.js`.

### Task 2: Write the state machine

**Files:**
- Create: `docs/STATE_MACHINE.md`
- Test: `tests/state-machine-doc.test.js`

**Interfaces:**
- Consumes: `contractPublicFns` (Task 1).
- Produces: a table whose first column is a backticked function name, with columns `who | guard | effect | tests`. `tests` is a comma list of Rust test fn names, or `NONE`.

- [ ] **Step 1: Write the failing test.** `tests/state-machine-doc.test.js` reads `docs/STATE_MACHINE.md` and asserts every name from `contractPublicFns` has a table row, and that no row names a function that does not exist.
- [ ] **Step 2: Run it** — Expected: FAIL, file missing.
- [ ] **Step 3: Write the document.** Sections: *Words* (plain meanings: syndicate = group, escrow, epoch, round nonce, release window, pending settlement, second key); *States* (`Active`, `Settled`, `AbortedRefunded`, plus the `is_settling` flag); *Stored records* (`p:<id>` pending settlement, `w:<id>` release window, `k2:<id>` second key, member index) with when each is written and removed; *Transitions* (the table, one row per public function, guard and effect read from the function body, `tests` filled by grepping `contracts/fly-coordinator/tests/*.rs`); *Not allowed* (a short list of transitions that must never occur, e.g. `Settled → Active`).
- [ ] **Step 4: Run the test** — Expected: PASS.
- [ ] **Step 5: Commit** the doc and test.

### Task 3: Define the invariants and the checker

**Files:**
- Create: `foundry/invariants.json`, `scripts/check-invariants.js`
- Test: `tests/check-invariants.test.js`

**Interfaces:**
- Produces: `checkInvariants({ root: string }): { errors: string[], warnings: string[] }`; also runnable as `node scripts/check-invariants.js` (exit 1 on any error).
- `invariants.json` shape: `{ invariants: [{ id, statement, plain, kind: 'safety'|'liveness', status: 'holds'|'superseded', supersededBy?: string, checks: [{ type: 'rust'|'node', ref: string }] }], families: { "I-07": ["I-07-A","I-07-B","I-07-C"], … } }`.

- [ ] **Step 1: Write failing tests** with a temp-directory fixture: (a) an id cited in a `.md` under `docs/` and undefined → error naming the id and file; (b) a `rust` check whose `fn <ref>` is not in `contracts/*/tests/*.rs` → error; (c) a non-superseded invariant with no checks → error; (d) `supersededBy` pointing at an undefined id → error; (e) a bare `I-07` citation resolves through `families` and gives a warning, not an error; (f) a superseded invariant cited in a `checks`/claim context → error.
- [ ] **Step 2: Run** — Expected: FAIL, module missing.
- [ ] **Step 3: Implement `checkInvariants`.** Scan `docs/**/*.md`, `foundry/**/*.{md,json,jsonl}`, `tests/**` for `\b[CI]-\d{2}(-[A-Z])?\b`; ignore `foundry/invariants.json` itself. Rust refs are matched with `/fn\s+<ref>\b/`; node refs are `path::test name` and must exist.
- [ ] **Step 4: Run tests** — Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 4: Fill in the invariants

**Files:**
- Modify: `foundry/invariants.json`, `foundry/phases/07-smart-contract-l1.md`

- [ ] **Step 1: Run `node scripts/check-invariants.js`** against the draft list below with empty `checks` — Expected: errors for each invariant with no checks.
- [ ] **Step 2: Add `C-01`…`C-12`**, each with `statement`, a plain sentence, and `checks` found by grepping the existing tests (the checker proves every ref exists):
  - C-01 *Books balance:* when no settlement is in flight, the sum of member escrows equals `total_escrow`.
  - C-02 *Release is paced:* cumulative release in a window never exceeds cap × (window base).
  - C-03 *Only allowed recipients are paid.*
  - C-04 *A settlement needs a valid signature over the exact message* (contract, group, epoch, nonce, hashes).
  - C-05 *A round nonce is single-use.*
  - C-06 *At most one settlement in flight; a pending record exists exactly while one is.*
  - C-07 *A member can always exit with their own balance once the timer or deadline has passed and nothing is in flight.*
  - C-08 *An exit lowers the group total and the release-cap base together.*
  - C-09 *The policy hash covers recipients, cap, deadline and timer.*
  - C-10 *A member is listed once; `active_flyer_count` equals the listed members.*
  - C-11 *Each charge is at most that member's escrow, and charges sum to the payout.*
  - C-12 *Status only moves forward:* `Active → Settled | AbortedRefunded`; terminal states stay.
  Add `families` for `I-01`…`I-08`. Add `I-07-B` as `superseded`, `supersededBy: "C-09"`, with a note that deposits are open to any account that consents to the policy hash.
- [ ] **Step 3: In `foundry/phases/07-smart-contract-l1.md`**, mark `I-07-B` superseded and point to `C-09` and `docs/STATE_MACHINE.md`.
- [ ] **Step 4: Run `node scripts/check-invariants.js`** — Expected: remaining errors are only invariants whose test does not exist yet; list them in the commit message.
- [ ] **Step 5: Commit.**

### Task 5: Add the missing transition and invariant tests

**Files:**
- Create: `contracts/fly-coordinator/tests/state_machine_tests.rs`
- Modify: `docs/STATE_MACHINE.md`, `foundry/invariants.json` (fill `tests`/`checks` for what now exists)

**Interfaces:**
- Produces: helper `assert_books_balance(c: &FlyCoordinator, id: &str, members: &[AccountId])` — asserts `total_escrow == sum(get_escrow)` when `!is_settling` (C-01); used by every test below.

- [ ] **Step 1: For every table row with `tests = NONE` and every invariant still without a check, write one failing-or-passing test** named `st_<function>_<behaviour>` / `inv_c<NN>_<behaviour>`. Known first candidates: `settle_batch_two_room`, `settle_batch_charged_two_room`, `prune_syndicate`, `compact_member_index`, C-12 forward-only status, C-05 nonce rotation.
- [ ] **Step 2: Run** `cd contracts/fly-coordinator && cargo test --test state_machine_tests` — Expected: tests that expose a real defect FAIL (stop and report it; do not edit `lib.rs` in this plan), the rest PASS.
- [ ] **Step 3: Update the doc table and `invariants.json`** with the new test names.
- [ ] **Step 4: Run** `cargo test` (all) and `node scripts/check-invariants.js` — Expected: all pass, 0 errors.
- [ ] **Step 5: Commit.**

### Task 6: Wire it into the checks and test the checker itself

**Files:**
- Modify: `scripts/check-foundry.js` (call `checkInvariants`, add its errors/warnings), `Makefile` only if `check` does not already run check-foundry
- Test: `tests/check-invariants-mutation.test.js`

- [ ] **Step 1: Write the mutation test.** Copy the repo's `docs/`, `foundry/`, and the contract source and tests into a temp dir three times and break one thing each time: delete one row from `STATE_MACHINE.md`; rename a Rust test that an invariant cites; cite `C-99` in a doc. Assert `checkInvariants` reports an error each time and none on the untouched copy.
- [ ] **Step 2: Run it** — Expected: FAIL until wired.
- [ ] **Step 3: Call `checkInvariants({root})` from `scripts/check-foundry.js`**; print its warnings (the bare `I-07` citations) without failing.
- [ ] **Step 4: Run** `make check` and `node --test tests/*.test.js` — Expected: 0 violations; all tests pass.
- [ ] **Step 5: Record and commit.** Add a claim to `foundry/claims.jsonl` (command: `node scripts/check-invariants.js`), a GAP-style note in `docs/canonical/CURRENT_STATE.md`, and tick the 09-1 items in `foundry/phases/09-reproducibility-and-prebuilt-environment.md`.
