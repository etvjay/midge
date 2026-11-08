# Phase 09-1: State machine and invariants — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write the contract's and the Roost round's state machines down once, define every invariant that is cited, make a check fail when they drift from the code, and close the five holes the implicit-state survey found (H1 to H5).

**Architecture:** A small parser lists the contract's public functions. `docs/STATE_MACHINE.md` has one table row per function. `foundry/invariants.json` defines each invariant and names the tests that check it. `scripts/check-invariants.js` enforces both, and `make check` runs it. Missing transition tests are added in a new Rust test file. No contract behaviour changes.

**Tech Stack:** Node 24 (`node:test`), Rust (`cargo test`, existing `near-sdk` unit-test harness), Markdown/JSON.

**Spec:** `docs/superpowers/specs/2026-11-08-phase-09-decomposition-design.md` (sub-project 09-1). Survey that adds Tasks 7 to 11: `docs/IMPLICIT_STATE_MACHINES.md`.

## Global Constraints
- The contract source `contracts/fly-coordinator/src/lib.rs` is **not modified** by this plan; only tests, docs and checkers are added. Naming the composite states in the contract (survey item 4) needs a contract change and a redeploy, so it is deferred to its own spec.
- Tasks 7 to 11 change JavaScript only. They must come **before** the lead 9 plan, which edits the same `hosted-roost.js`.
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
6. (Tasks 7 to 11) a `run*` after a signed aggregate in the same round; matching or releasing the same facility record twice; an invoice read after its expiry time; a daemon asked for `chain` with no credentials; a status renamed on one side of the contract/JS mirror only.

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
- [ ] **Step 3: Write the document.** Sections: *Words* (plain meanings: syndicate = group, escrow, epoch, round nonce, release window, pending settlement, second key); *States* (`Active`, `Settled`, `AbortedRefunded`, plus the `is_settling` flag); *Stored records* (`p:<id>` pending settlement, `w:<id>` release window, `k2:<id>` second key, member index) with when each is written and removed; *Transitions* (the table, one row per public function, guard and effect read from the function body, `tests` filled by grepping `contracts/fly-coordinator/tests/*.rs`); *Not allowed* (a short list of transitions that must never occur, e.g. `Settled → Active`); and a second section, *The Roost round*, with the machine `no round → open → aggregate computed → signed → next round`, its four fields (`round`, `sealedIntents`, `lastSeq`, `aggregate`) and one row per `HostedRoost` public method (`openRound`, `submitSignedIntent`, `submitSealedIntent`, `exclude`, the seven `run*`, `signSettlement`) with guard, effect and test.
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

### Task 7: One signed settlement per round (hole H1)

**Files:**
- Modify: `src/roost-service/hosted-roost.js` (new private `#assertNoSignedAggregate()` called first in `runAuction`, `runPool`, `runQuote`, `runBallot`, `runRfq`, `runPayrun`, `runCross`)
- Test: `tests/hosted-roost-rounds.test.js` (extend)

- [ ] **Step 1: Write failing tests**, one per `run*` method, reusing the setup from experiments 72 to 80: run, sign, queue a new input, run again → rejects `/already has a signed settlement/` and `sealedIntents.length` is unchanged. Plus: after `openRound` the same run works; a second run while the first aggregate is **unsigned** is still allowed (unchanged behaviour); `signSettlement` twice on one aggregate still rejects.
- [ ] **Step 2: Run** `node --test tests/hosted-roost-rounds.test.js` — Expected: FAIL for all seven.
- [ ] **Step 3: Implement** `#assertNoSignedAggregate(): void` — throws `RoostAggregationError('this round already has a signed settlement; open a new round')` when `this.aggregate?.signed`. Call it before the clear in each method so the queue is kept.
- [ ] **Step 4: Run** the new tests, then experiments 72 to 80 and 85 to 94 — Expected: PASS unchanged.
- [ ] **Step 5: Add a row to the Roost-round table** in `docs/STATE_MACHINE.md` and invariant `R-01` ("one signed settlement per round") to `foundry/invariants.json` with this test as its check. Commit.

### Task 8: Facility transitions are guarded (hole H2)

**Files:**
- Modify: `src/facilities/rfq-adjudication.js` (`matchAndBindLoan`), and `otc-block-trade.js` / `settlement/far-shard.js` only if their tests fail
- Test: `tests/facilities-status.test.js`

- [ ] **Step 1: Write failing tests**, table-driven over the facilities: calling the same transition twice is refused the second time — RFQ `matchAndBindLoan` (second call rejects `/not open/`, only one loan exists), OTC match, FAR release; a loan that is `PRIVATE_LIQUIDATION` cannot be margin-checked back to active.
- [ ] **Step 2: Run** — Expected: the RFQ test FAILS (confirmed by hand on 2026-11-08); report any other failure.
- [ ] **Step 3: Implement** in `matchAndBindLoan`: `if (rfq.status !== 'OPEN_IN_ROOST') throw new Error('RFQ not open: already matched or closed')`. Fix any other facility the tests expose the same way.
- [ ] **Step 4: Run** `node --test tests/*.test.js`, `npm run verify:rfq` and `npm run verify:otc` — Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 9: An expired invoice reads as expired (hole H3)

**Files:**
- Modify: `src/commerce/x402.js` (new `invoiceStatus(invoiceId: string): 'PAYMENT_REQUIRED'|'PAID'|'EXPIRED'|'UNKNOWN'`; `settleInvoice` uses it)
- Test: `tests/x402-expiry.test.js`

- [ ] **Step 1: Write failing tests** with `t.mock.method(Date, 'now')`: at issue → `PAYMENT_REQUIRED`; 61 s later → `EXPIRED` without anyone paying; paying after expiry rejects `/expired/`; a paid invoice stays `PAID` after expiry; unknown id → `UNKNOWN`.
- [ ] **Step 2: Run** — Expected: FAIL, method missing.
- [ ] **Step 3: Implement** `invoiceStatus`; keep the stored status in step with it.
- [ ] **Step 4: Run** the test and `npm run verify:api` — Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 10: The daemon does not silently change mode (hole H4)

**Files:**
- Modify: `src/api/server.js` (constructor at lines ~22-31, `/health`)
- Test: `tests/api-mode.test.js`

- [ ] **Step 1: Write failing tests** (env `NEAR_ACCOUNT_ID`, `NEAR_PRIVATE_KEY`, `FLY_MODE` cleared): `new FlyApiDaemon({ mode: 'chain' })` with no credentials **throws** `/chain mode needs/`; `FLY_MODE=chain` the same; no mode given → falls back to `model`, `daemon.modeFallbackReason` is a non-empty string and `GET /health` reports `mode: 'model'`; `mode: 'model'` works with no warning.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.** `const asked = mode || process.env.FLY_MODE`; if `asked === 'chain'` and the client cannot be built, rethrow with the reason; if nothing was asked, keep today's fallback but record `modeFallbackReason`, print one `console.warn`, and add `mode` to `/health`.
- [ ] **Step 4: Run** the test, `npm run verify:api` and `make test` — Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 11: The JavaScript mirror cannot drift from the contract (hole H5)

**Files:**
- Test: `tests/nest-mirror.test.js`; Modify `src/contracts/nest.js` only if the test fails

- [ ] **Step 1: Write the test:** read the variants of `enum SyndicateStatus` from `lib.rs` and the status strings used in `nest.js`; assert a fixed map `{ Active: 'ACTIVE', Settled: 'SETTLED', AbortedRefunded: 'ABORTED_REFUNDED' }` covers every contract variant and `nest.js` uses no status outside it. Add a case where a variant is added to a copy of `lib.rs` → the test fails.
- [ ] **Step 2: Run** — Expected: PASS today (names agree) and FAIL on the injected variant.
- [ ] **Step 3: Note in `docs/STATE_MACHINE.md`** that `nest.js` is a simulation of the contract and name this test as the drift guard.
- [ ] **Step 4: Run** `node --test tests/*.test.js` — Expected: all pass.
- [ ] **Step 5: Commit**, then tick H1 to H5 in `docs/IMPLICIT_STATE_MACHINES.md` and add the claims to `foundry/claims.jsonl`.

## Deferred (own spec, needs a contract change and a redeploy)
Name the composite states in the contract (a `get_group_phase` view returning `Open | PayoutInFlight | Settled | Refunded | UnfundedStuck`, and a member phase `Listed | Drained | Exited`), so the next audit does not have to infer them.
