# Escrow-bound charged rounds (audit lead 9) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A charged round leaves out bidders who cannot cover their worst-case charge, using escrow read from the contract at a pinned block, so one bad bid cannot make the contract reject the settlement.

**Architecture:** A new `escrow-reader` asks two or more RPC providers for each bidder's escrow at one final block and fails closed on any error or disagreement. `HostedRoost` gets `bindEscrow()` (async, reads the chain once and stores a snapshot) and a private `#affordable()` that each existing **synchronous** `run*` method uses to drop unaffordable bidders before it clears; the block goes into the signed order hash.

**Tech Stack:** Node 24 (`node:test`), JSON-RPC over `fetch`, existing lab harness (`lab/`).

**Spec:** `docs/superpowers/specs/2026-11-08-escrow-bound-charged-rounds-design.md`

## Deviation from the approved spec (needs the user's yes)
The spec said the programs become `async`. About 30 promoted lab experiments call `run*` synchronously (roughly 100 call sites), so that would break committed, hash-chained runs. This plan keeps every `run*` synchronous and adds an explicit `await host.bindEscrow()` step beforehand; `RoomService.run` does it for the API. Same guarantees, far smaller blast radius. When an `escrowReader` is configured and no valid snapshot exists, `run*` **throws** (fail closed). Without a reader, nothing changes.

## Global Constraints
- The contract and its tests are not modified. No redeploy for this plan. The Phala image is rebuilt once, after this plan, not inside it.
- Default `minAgree` = all configured URLs; a block older than `maxAgeMs` = 60000 is rejected; `timeoutMs` = 8000.
- Excluded bidders are reported by account id only, never by content.
- Errors reuse `RoostAggregationError`; the room adapters map the reader failure to the existing `UNAVAILABLE` (HTTP 503) code.
- Test-first; every new rule gets a mutation check (break it, see a test fail). Commit trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. `git push` only on the user's say-so.
- Never read `.env`. The live step uses testnet only.

## Review Focus
1. A bidder id that is not a valid NEAR account id (contains `:`, `,`, spaces) is never sent to the RPC and is excluded.
2. The queue holds 50 bidders → one bounded batch of reads, not 50 sequential round trips; a slow node hits the timeout, not a hang.
3. A second `bindEscrow()` returns an **older** block than the first → refused (rollback).
4. A new input arrives after `bindEscrow()` → the next `run*` throws "bind again" and the queue is untouched.
5. A bidder with escrow exactly equal to their worst case is kept; one yocto less is excluded.

---

### Task 1: The escrow reader

**Files:**
- Create: `src/roost-service/escrow-reader.js`
- Test: `tests/escrow-reader.test.js`

**Interfaces:**
- Produces: `createEscrowReader({ rpcUrls: string[], contractId: string, fetchImpl?: typeof fetch, minAgree?: number, timeoutMs?: number, maxAgeMs?: number }): { read(syndicateId: string, accounts: string[]): Promise<{ blockHeight: number, blockHash: string, escrows: Record<string, string> }> }` — `escrows` values are yoctoNEAR decimal strings.

- [ ] **Step 1: Write failing tests** with a stub `fetchImpl` (JSON-RPC by method): all agree → returns the map; one URL errors → rejects `/could not read escrow/`; two disagree on one account → rejects; reader asks every URL for the **same** `block_id`; block older than `maxAgeMs` → rejects; a call exceeding `timeoutMs` → rejects; an invalid account id never appears in any request; empty `accounts` → returns `{}` without calling `get_escrow`.
- [ ] **Step 2: Run** `node --test tests/escrow-reader.test.js` — Expected: FAIL, module missing.
- [ ] **Step 3: Implement.** First URL: `block` with `finality: 'final'` → height, hash, timestamp (ns). Every URL: `query` / `call_function` / `get_escrow` / `block_id: <hash>` per account, concurrency capped at 10. Parse the byte array result as a JSON string. Reject unless `minAgree` URLs return identical maps. Wrap all failures in `RoostAggregationError('could not read escrow ...')`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 2: `bindEscrow` and the affordability filter (ballot first)

**Files:**
- Modify: `src/roost-service/hosted-roost.js` (constructor option, `openRound`, new methods, `runBallot` at ~398-422)
- Test: `tests/hosted-roost-escrow.test.js`

**Interfaces:**
- Consumes: `createEscrowReader` (Task 1).
- Produces: constructor option `escrowReader`; `async bindEscrow(): Promise<{ blockHeight: number, blockHash: string, bidders: number }>`; private `#affordable<T extends {flyerId:string}>(bids: T[], maxChargeYocto: (b:T)=>bigint): { kept: T[], excluded: string[] }`; the signed `orderHash` input gains `:escrow:${blockHeight}:${blockHash}` when a snapshot was used.

- [ ] **Step 1: Write failing tests** with a stub reader: ballot where one voter has no escrow → that voter listed in `outcome.excluded`, others tallied, and `signSettlement` succeeds with charges only for the kept voters; escrow exactly equal to the share is kept, one yocto less is excluded; `run*` with a reader configured and no snapshot throws `/bind/`; an input arriving after `bindEscrow` makes the next `run*` throw and leaves `sealedIntents.length` unchanged; `openRound` clears the snapshot; the order hash differs when the block differs; a second bind returning a lower height rejects; no reader configured → behaviour identical to today (existing tests pass).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.** `bindEscrow` reads for `flyerId`s currently queued and stores `{ roundKey, blockHeight, blockHash, escrows, queued: Set }`. `#affordable` drops bids whose maximum exceeds `escrows[flyerId]` and returns their ids. Apply it in `runBallot` with maximum = `shareMicro × YOCTO_PER_MICRO` (formula at current line ~420).
- [ ] **Step 4: Run** — Expected: PASS, and `node lab/experiments/78-ballot-program.js` still exits 0.
- [ ] **Step 5: Commit.**

### Task 3: The other six programs

**Files:**
- Modify: `src/roost-service/hosted-roost.js` (`runPool`, `runAuction`, `runQuote`, `runCross`, `runRfq`, `runPayrun`)
- Test: `tests/hosted-roost-escrow.test.js` (extend)

**Interfaces:**
- Consumes: `#affordable` (Task 2). Per-program maximum, as already used for `bound` today: pool `contribution`; auction `bid`; quote and RFQ `units × limit` (taker and maker sides as in `bound`); cross buyers `ordered × limit` (sellers are paid, not charged); payrun `grossMicro` of the employer.

- [ ] **Step 1: Write one failing test per program**: a bidder with too little escrow is excluded and named, the round clears for the rest, and `signSettlement` accepts the result. Payrun: an employer without enough escrow → run refuses with a clear error and the queue is kept (there is no one to leave out).
- [ ] **Step 2: Run** — Expected: FAIL for all six.
- [ ] **Step 3: Insert `#affordable` before the clear** in each method, using the formula above; include excluded ids in the program's public outcome object under `excluded`.
- [ ] **Step 4: Run** `node --test tests/*.test.js` and every experiment 72–80, 85–94 — Expected: all pass unchanged.
- [ ] **Step 5: Commit.**

### Task 4: RoomService, server wiring and error mapping

**Files:**
- Modify: `src/roost-service/room-service.js` (the `run` path at ~164), `src/roost-service/room-http.js` only if the mapping needs it, `src/roost-service/server.js`
- Test: `tests/room-service-escrow.test.js`

- [ ] **Step 1: Write failing tests:** with a stub reader and a host that has one, `service.run(...)` awaits `bindEscrow` and a reader failure becomes a `RoomError` with code `UNAVAILABLE` and HTTP 503 via `STATUS_OF`; the queue is intact afterwards; with no reader the service behaves as before.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.** In `run`, call `await h.bindEscrow()` when `h.escrowReader` exists, translating `RoostAggregationError` from the reader to `UNAVAILABLE`. In `server.js`, build a reader from `ROOST_RPC_URLS` (comma list) and `ROOST_CONTRACT_ID` when both are set; document both variables in `deploy/roost/docker-compose.yml` comments.
- [ ] **Step 4: Run** `node --test tests/*.test.js` and experiments 97–102 — Expected: PASS.
- [ ] **Step 5: Commit.**

### Task 5: Mutation checks

**Files:**
- Create: `scripts/mutate-escrow.mjs` (throwaway, not committed if it only automates)

- [ ] **Step 1: Break each rule once and confirm a test goes red:** drop the filter; ignore a disagreement; accept an older block; forget to restore the queue on a reader failure; leave the block out of the order hash; accept an invalid account id. Use `diff` against a pristine copy to prove each mutation landed.
- [ ] **Step 2: For each surviving mutant, add the missing test** and re-run. Equivalent mutants are listed with a reason.
- [ ] **Step 3: Commit the added tests.**

### Task 6: Lab experiment and records

**Files:**
- Create: `lab/experiments/103-escrow-bound.js` (id `E-ESCROWBOUND-01`)
- Modify: `docs/lab/PROGRAMME_PLAN.md` (predictions **committed before the run**), `foundry/gaps.jsonl`, `docs/canonical/CURRENT_STATE.md`

- [ ] **Step 1: Commit predictions first** in `docs/lab/PROGRAMME_PLAN.md`: with the reader a bidder with no escrow is excluded and the round settles on testnet; without it the same round reverts with the contract's over-escrow message; two disagreeing readers refuse to run; the signed order hash records the block.
- [ ] **Step 2: Write the experiment** with an offline tier (stub RPC) and a testnet tier using `lab/lib/members.js` (one funded member, one with none, torn down at the end as in `96-timer-consent.js`).
- [ ] **Step 3: Run it three times**, then promote per `docs/LAB.md` and verify with `node lab/verify-run.js`.
- [ ] **Step 4: Record:** add GAP-039 (status `VERIFIED_LIVE` only after the promoted run), a claim in `foundry/claims.jsonl` with its command, and a line in `CURRENT_STATE.md`.
- [ ] **Step 5: Run** `make check`, `make test`, `node --test tests/*.test.js` and commit.
