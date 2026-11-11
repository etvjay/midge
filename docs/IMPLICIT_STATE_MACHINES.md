# Implicit state machines in Midge (survey, 2026-11-08)

An **implicit state machine** is behaviour that depends on a mix of flags, nulls, counters and stored keys, with no single named state saying where the thing is. They are where bugs hide: of the 15 audit leads, at least 5 (2, 3, 5, 13, 15) were an unnamed state or an unguarded transition. This is a survey by reading and grep, plus two behaviours I ran. It is not complete, and "hole" means a transition nothing guards, not a proven exploit.

Plain words: a *state* is "where is this thing right now"; a *transition* is a move between states; a *guard* is the check that decides whether a move is allowed.

## 1. The contract (`contracts/fly-coordinator`)
| Machine | State is really | Named? | Notes |
|---|---|---|---|
| **Group** | `status` (Active, Settled, AbortedRefunded) × `is_settling` × pending record `p:<id>` × release window `w:<id>` × `epoch` × second key `k2:<id>` | 3 of ~8 combinations | `Active + is_settling + pending` is "a payout in flight"; nothing names it. `pending exists ⇔ is_settling` is an invariant no one wrote down (C-06 in plan 09-1). |
| **Member** | not listed → listed with balance → **drained** (listed, balance 0) → exited | no | The drained state is `balance == 0 && listed`. It caused audit lead 2 (listed twice) and a member who cannot exit. |
| **Unfunded group** | `Active` with zero escrow | no | `hatch_out` needs balance > 0 and `prune` needs a terminal status, so it has no exit. Audit lead 5, still open (GAP-030). |
| **Settlement** | none → scheduled (pending) → finished by callback \| recovered after 100 blocks | partly | The callback and recovery share the books; audit lead 3, fixed by matching the pending record. |
| **Release window** | none → open (base, released, ends_at) → expired → new | no | Base moves with deposits and exits (fix for lead 4). |
| **Round nonce** | rotates when a settlement finishes | no | Single use is the replay defence. |
| **Policy hash** | v1 (older 15 groups) \| v2 (with timer) | only by `get_policy_terms` | |

## 2. The hosted Roost (`hosted-roost.js`)
- **Round:** `round = null` → open (queue empty) → inputs → aggregate computed (queue cleared, `signed:false`) → signed → next `openRound` resets. Held in four fields (`round`, `sealedIntents`, `lastSeq`, `aggregate`) plus `aggregate.signed`.
- **Hole H1 (FIXED 2026-11-08, `R-01`, plan 09-1 Task 7 — was read, not exploited):** none of the seven `run*` methods checks for an existing aggregate before replacing it. Signing is once **per aggregate**, not once **per round**. After a signature, new inputs plus another run yield a fresh unsigned aggregate for the same epoch and nonce, which can be signed again. The contract accepts only one per nonce, but "the host signs once per round" is not true today.
- **Per-account sequence:** `lastSeq[account]` is its own little machine (accepted seq only rises). Audit lead 15 was a race on it.

## 3. Services and adapters
| Machine | Where | State | Note |
|---|---|---|---|
| **Retry cache** | `RoomService.#last` | none → undecided result → decided (`signed:false`) → signed | Reset on new input and on `open`. Idempotency depends on it. |
| **Model key** | `ModelSealedRoost` | no key → attested key → bids sealed to it → re-check at aggregate | The key can change between sealing and aggregating; checked, not named. |
| **Daemon mode** | `FlyApiDaemon` | `chain` \| `model` | **H4 (FIXED 2026-11-08, plan 09-1 Task 10; the trigger is a malformed `NEAR_PRIVATE_KEY`, not missing credentials):** the constructor silently switched `chain` → `model` (an in-memory simulation) if the chain client cannot be built. Responses carry `servedBy`, but it is a silent state change. |
| **Roost table** | `FlyApiDaemon.roosts` | grows to `maxRoosts`, never evicted | Audit lead 8. |
| **Event stream** | `room-events.js`, `room-http.js` | connected → replay → live → dropped (slow) | Count cap, ring of 100. |
| **Rate limit** | `rate-limit.js` | per-client bucket: tokens, `resetAt` | |
| **x402 invoice** | `commerce/x402.js` | `PAYMENT_REQUIRED` → `PAID` \| `EXPIRED` | **H3 (FIXED 2026-11-08, plan 09-1 Task 9; `invoiceStatus`):** expiry is only recorded when someone tries to pay, so an invoice reads `PAYMENT_REQUIRED` past its time. |

## 4. Facilities (simulations)
| Machine | States | Note |
|---|---|---|
| **RFQ** | `OPEN_IN_ROOST` → `MATCHED_BOUND`; loan `ACTIVE_SHIELDED` → `PRIVATE_LIQUIDATION`, plus a separate `marginCallActive` flag | **H2 (FIXED 2026-11-08, plan 09-1 Task 8; was run, confirmed):** `matchAndBindLoan` checks only `!rfq \|\| quotes.length === 0`, never the status. A second call on a `MATCHED_BOUND` RFQ bound a second loan. The margin call is a flag beside the status, not a state. |
| **OTC order** | `SEALED_IN_ROOST` → `MATCHED_SETTLED` | **Sibling of H2 (found and FIXED in Task 8):** `matchCrossingOrders` never checked order status, so the same pair could settle twice. |
| **FAR bridge** | `LOCKED_IN_PUBLIC_TREASURY` → `MINTED_SHIELDED` → `RELEASED_CLEAN` | **Sibling of H2 (found and FIXED in Task 8):** `mintImtOnFar` trusted a caller-supplied receipt object, so a forged receipt, or one deposit used twice, minted private tokens. The bridge now remembers the receipts it issued and mints each once at the issued amount. |
| **JS contract mirror** | `contracts/nest.js`: `ACTIVE` / `SETTLED` / `ABORTED_REFUNDED` | **H5 (guarded 2026-11-08, plan 09-1 Task 11; `tests/nest-mirror.test.js`):** a second copy of the contract's state machine, spelled differently. They can drift; nothing compares them. |

## 5. Process machines (not code, still states)
- **Gap ledger:** `DISCOVERED → REPRODUCED → CLASSIFIED → CLOSURE_DEFINED → IMPLEMENTED → VERIFIED_LOCAL → VERIFIED_LIVE → CLOSED`. The checker enforces the allowed words, not the order.
- **Lab run:** drafted → run → promoted → verified (`verify-run.js`). **Deployment:** code-hash history (`deployments.json`); the Phala VM (created → attested → deleted); the pinned image digest.
- **Attestation:** nonce → report → per-candidate checks → accepted \| rejected, plus TCB status.

## 6. What to do with this
1. Plan 09-1 documents machine 1 (the group), as `docs/STATE_MACHINE.md`, with its invariants.
2. Add a second table to 09-1 for the Roost round (machine 2) and fix H1 test-first: a `run*` after a signed aggregate in the same round must refuse.
3. Fix H2 (add the status guard) and test it; decide on H4 (refuse, or keep the switch but expose `mode` loudly) and H5 (generate the mirror from one table, or delete it if unused).
4. Name the member and group composite states in code (small enums or `get_*` views) so the next audit does not have to infer them.


---

# Update, 2026-11-11: machines added since the survey, and the ones it missed

Same method: reading and grep, plus two behaviours confirmed in the code. Not complete. "Hole" means a transition nothing guards or recovers.

## 7. New since 2026-11-08
| Machine | State is really | Named? | Notes |
|---|---|---|---|
| **Foreign obligation** (contract) | none → **reserved** (spent += amount, `signed:false`) → **signed** \| **released** (signer failed: record removed, spent -= amount) | `signed` flag only | **Hole F1 (GAP-047, FIXED 2026-11-11, see below):** if the callback never runs (for example the call runs out of gas) the obligation stays reserved forever: its id is burned and its amount counts against the payee's total. `since_block` is recorded but nothing reads it for foreign obligations; settlements have a 100-block recovery (`STUCK_SETTLEMENT_BLOCKS`), these have none. **Also:** a signed obligation whose transaction is never broadcast cannot be cancelled, so its budget stays spent. |
| **Foreign policy** (contract) | none → **set** (owner, before the first deposit, once) | no | Stored beside the group (`f:<id>`), not in the policy hash, so a depositor consents to it only by reading `get_foreign_policy`. |
| **Foreign running total** (contract) | per payee and chain: `{window_start, spent}`; a window that has ended counts as empty | yes (`ForeignSpent`) | Was a lifetime total; now a window like the NEAR release cap (GAP-047). |
| **Group with foreign funds** | `Active` → `Settled` \| `AbortedRefunded` | partly | **F3 (FIXED 2026-11-11):** `request_foreign_payment` needed `Active`, so a terminal group stranded its foreign money. A finished group may now still pay its listed payees within the caps and window. Money at the foreign addresses is still outside the member exit, and still unreachable if the room is gone. |
| **Pruned group** (contract) | `prune_syndicate` removes the group, its second key and its window | no | **Hole F2 (GAP-048, FIXED 2026-11-11, see below):** it did not remove the foreign policy (`f:`), obligations (`fo:`) or running totals (`fs:`). Hatching the same id again inherits the old policy (so `set_foreign_policy` refuses: already set) and the old totals. |
| **Roost signed-input mode** | boolean fixed at boot from the attested compose file | no | `requireSignedInputs` applies to **every** program: with `ROOST_REQUIRE_SIGNED_INPUTS=1` the room refuses unsigned sealed intents for pools and quotes too. The pinned compose now requires it, so the hosted pool and quote experiments that used unsigned intents (E-HOSTED-DARKVAULT-LIVE-02, E-HOSTED-ESCROW-LIVE-01) can no longer be re-run unchanged on the current compose. |
| **Phala VM session** | created → attested → used → deleted; a detached dead-man's switch deletes it at the deadline | no | If the dead-man process dies (reboot) the VM keeps billing; the only reconciliation is the next run's "no CVM already running" check. |
| **Lab experiment** | predictions written → experiment file → run → verified → promoted | no | Nothing checks that predictions were committed before the file. Two experiments tonight had them in the same commit (disclosed in the plan). |
| **1Click adapter** | dry quote only | no | A guard, not a machine: it refuses anything whose response is not a dry quote. |

## 8. Found by this scan, not in the 2026-11-08 survey
| Machine | Where | State | Note |
|---|---|---|---|
| **Escrow binding** | `HostedRoost.#escrow` | none → bound (a fresh read of named accounts at one block) → cleared on open, abandon and every run that ends undecided | The room refuses a charged round without a fresh bind; the clear points are spread over several methods. |
| **Pod** | `syndicate/pod.js` | `ACTIVE` only | One state and no transitions: a record, not a machine. |
| **Flyer dropout** | `resilience/failure-matrix.js` | active members ≥ quorum → `QUORUM_MAINTAINED_REWEIGHTED` \| `QUORUM_BROKEN_ROUND_ABORTED` | A pure function of its inputs (simulation). |
| **Chain Signatures mode** | `multichain/chain-signatures.js` | `SIMULATED_LOCAL_MOCK` \| `NEAR_MPC_LIVE` | Chosen by whether credentials work; responses carry `mode`, but it is a silent switch like H4. |
| **Daemon fallback** | `FlyApiDaemon.modeFallbackReason` | null → set when `chain` fell back to `model` | The reason is recorded and shown on `/health`. |
| **Advisor** | `advisor/attested-advisor.js` | request → attested model → receipt signature checked → advice accepted \| `AdvisorError` | Fails closed. |

## 9. Fix order, if you want it
1. **F1** first (money can be stuck): a permissionless `recover_foreign_obligation` after N blocks if still `signed:false`, test-first, then redeploy the test contract.
2. **F2:** make `prune_syndicate` remove `f:`, `fo:` and `fs:` for the id, or refuse to prune while any exist.
3. **Signed-input mode:** decide whether pools and quotes should keep an unsigned path on the hosted room or whether signed-only is the policy; either way write it down.
4. Write the F3 and lifetime-cap limits where the foreign-payment feature is described.

## 10. Fixed 2026-11-11 (what changed, and one correction to section 9)
- **F1 / GAP-047 (correction).** Section 9 proposed letting anyone release a reservation that stays unresolved after N blocks. That would be **unsound**: the contract cannot see the other chain, and an unresolved reservation may correspond to a signature that was produced and a payment that landed. Releasing its budget could let a payee be paid past the cap. The conservative behaviour (keep the reservation) was right; the defect was that the lock was permanent. The fix is a **window**, as for the NEAR release cap: `ForeignPolicy.window_blocks` (at least 100), and a payee's `max_total` is the most reserved inside one window. A stuck reservation now locks capacity for one window. A signer failure releases only from the window the reservation was made in. The obligation id stays burned, which is what makes a retry safe.
- **F2 / GAP-048.** The foreign policy is removed with the group; obligation and total slots are keyed to the group's creation block, so a re-hatched id starts clean (the old entries stay in storage, unreachable: there is no way to delete every key under a prefix). Because pruning a group that controls foreign money strands it, **only the owner** may prune a group that has a foreign policy.
- **F3.** A finished group may still request payments to its listed payees within the caps.
- **Signed-input mode.** Decision: **the hosted room is signed-only for every program.** It is the stronger setting, and it is what binds a vote or bid to a real account key. Members use `signedBidParams` (one call seals and signs). The earlier hosted pool, quote and fail-closed experiments ran on earlier compose hashes (still pinned) with unsigned input and are evidence for those builds, not repeatable on the current compose; the fail-closed one was re-run on the current compose and failed for exactly this reason (GAP-050), which also showed that bid intake rested on one RPC provider for key checks. Fixed the same day: every account-key check now needs all configured providers (two or more) to confirm, with its own provider list, and the fail-closed experiment passed on hardware with a signed bid (run 20261111T102056Z-1b53).
- **Phala VM session.** `scripts/phala-reaper.mjs` is a second line behind the detached dead-man's switch: schedule it (cron, every 30 minutes) and it deletes any `midge-*` VM older than two hours (dry run unless `--yes`). Its selection logic is unit-tested and its listing was run against the real account; its deletion has **not** been run against a real VM (the safety classifier blocked that test).
- **Lab method.** `scripts/check-predictions-first.mjs`, run by `make check`: any experiment not on `lab/predictions-exempt.json` (the 50 that existed today) must have its id in the plan in a strictly earlier commit than its file.

## 11. Found by review, 2026-11-11: a freed group id re-used its foreign addresses (GAP-049, FIXED)
A review note pointed out that the signer path was the group id alone. Pruning frees the id; anyone can hatch it again with their own room key and foreign policy; the new group then derived the **same** Solana and Ethereum addresses and could pay out whatever the old group left there. My fix for GAP-048 had reset the old group's books and rules but not its addresses, and I described that as "starts clean": that was wrong. The path is now `<id>:<creation block>` (`get_foreign_path`), so a re-hatched id gets different addresses. **Consequences, stated:** (1) groups made before the fix derived addresses from the bare id, and those addresses are no longer reachable by the contract (testnet dust); (2) after a prune nobody can sign for the pruned group's path, so **move all foreign money out before pruning**. Only the owner may prune a group that has a foreign policy, so this is an explicit act.
