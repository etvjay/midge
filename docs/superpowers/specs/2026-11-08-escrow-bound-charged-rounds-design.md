# Escrow-bound charged rounds (audit lead 9)

**Status:** DRAFT for the user's review. Nothing is built. Path: architectural (it changes how every charged program decides who may bid).
**Date:** 2026-11-08. **Owner decision recorded:** the list of allowed bidders comes from the contract, read at a pinned block; an explicit `roll` may narrow it.

## 1. Intent
One bad bid must not cost a whole round. The contract refuses a charged settlement if any single charge is above that account's escrow (`lib.rs`, charge validation in `settle_inner`). Today pool, auction, quote, cross and RFQ turn every readable sealed bid into a charge, and the Roost keeps no list of who deposited. So one bidder with no escrow, or too little, makes the contract reject the settlement; the queue was already cleared, so everyone resubmits. Funds are never at risk. The loss is the round.

Plain words: *escrow* is the money a member has put into the group on the contract. A *charge* is how much a member pays in a round. The contract only lets you charge what you hold.

**Success looks like**
1. A bidder who cannot cover their worst-case charge is left out of the round and named (never their content). Everyone else settles.
2. Who counted is not the coordinator's say-so. It comes from the contract's own records, at a block anyone can look up afterwards.
3. If the chain cannot be read, or two readers disagree, the round does not run and the queue is kept.
4. The contract is unchanged. No redeploy for this.

## 2. Design
**New module** `src/roost-service/escrow-reader.js`: `createEscrowReader({ rpcUrls, contractId, fetchImpl, minAgree })` returns `async read(syndicateId, accounts) -> { blockHeight, blockHash, escrows }`.
- Asks the first RPC for the latest *final* block, then asks every RPC for `get_escrow` of each account **at that block** (`query` / `call_function` with `block_id`).
- All answers must agree (`minAgree` defaults to all of them; at least two URLs recommended). Any error, timeout or disagreement throws `RoostAggregationError('could not read escrow ...')`.
- Mirrors the existing `makeAccountKeyCheck` (an injected `fetchImpl`, no hidden globals), so tests need no network.

**HostedRoost** takes an optional `escrowReader`. Each charged program (`runPool`, `runAuction`, `runQuote`, `runCross`, `runRfq`, `runBallot`, `runPayrun`) does, before it clears:
1. Collect the bidders' account ids from the readable intents.
2. Read their escrows once (one call per round, not per bid).
3. Leave out any bidder whose **worst-case charge** (the `bound` the program already computes: what the member's own bid allows) is greater than their escrow. List them in `excluded`/`unreadable`-style output by account id only.
4. Clear with the remaining bids.
5. Put the block height and hash into the signed `orderHash`, so the choice is checkable later.

Programs become `async` (they read the chain). `room-service.js` line 164 calls `prog.run(h, normal)` **without** `await` today, so that call and its try/catch must change to `await` (this is part of the work, not a given), and every caller of the `run*` methods in `hosted-roost.js`, the Roost server and the labs is checked. The adapters keep their one `{error, code}` shape and reuse the existing `UNAVAILABLE` code (HTTP 503) for the fail-closed case; no new code.

**Optional `roll`:** for named groups, a program's existing `roll` narrows the set further (intersection). Ballot and payrun keep theirs.

**Fail closed, queue kept:** a reader failure restores the queue exactly as fix 13 does for the 8-seller error.

**Why exclude and not cap:** a charged settlement's payout must equal the sum of its charges. Capping a charge after the program clears would break that equality and change who wins. Excluding before the clear keeps every program's own rules intact.

## 3. What this does not give you
- It trusts the RPC providers to answer honestly. The TEE protects the Roost's code, not the node it asks. Two independent providers that must agree, and a recorded block, narrow this; they do not remove it. A light-client proof would, and is out of scope.
- A coordinator can still choose to start a round late or exclude someone by name via `/exclude`; that stays visible in the output.
- The contract's check remains the hard bound if any of this is wrong.

## 4. Testing and proof (pipeline steps 2 and 3)
- **Unit (`node:test`, stub `fetchImpl`):** no escrow, too little escrow, exactly enough, one RPC down, two RPCs disagree, wrong block, reader slow (timeout), bidder list empty after filtering, queue kept on failure, order hash changes when the block changes.
- **Mutation check:** break each rule (drop the filter, ignore disagreement, forget to restore the queue, leave the block out of the hash) and confirm a test goes red.
- **Lab experiment** `E-ESCROWBOUND-01` under the research-lab method: predictions committed first. Live on testnet with funded throwaway accounts: one bidder with no escrow is excluded and the round settles; the same round without the reader reverts, as the baseline.
- **Gap ledger:** a new GAP entry; status only `VERIFIED_LIVE` after the promoted run.

## 5. Out of scope
Contract changes; light-client proofs; changing a program's economics; the Phala image rebuild (done once, after this).

## 6. Open points for review
1. Default `minAgree`: all configured URLs (recommended) or a majority.
2. Whether the pinned-block rule should reject a block older than N seconds.
3. Whether `runBallot`/`runPayrun` should use the reader by default or only when one is configured (recommended: only when configured, so the offline demos keep working).
