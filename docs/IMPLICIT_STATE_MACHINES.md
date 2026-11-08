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
| **Daemon mode** | `FlyApiDaemon` | `chain` \| `model` | **H4:** the constructor silently switches `chain` → `model` (an in-memory simulation) if the chain client cannot be built. Responses carry `servedBy`, but it is a silent state change. |
| **Roost table** | `FlyApiDaemon.roosts` | grows to `maxRoosts`, never evicted | Audit lead 8. |
| **Event stream** | `room-events.js`, `room-http.js` | connected → replay → live → dropped (slow) | Count cap, ring of 100. |
| **Rate limit** | `rate-limit.js` | per-client bucket: tokens, `resetAt` | |
| **x402 invoice** | `commerce/x402.js` | `PAYMENT_REQUIRED` → `PAID` \| `EXPIRED` | **H3 (low):** expiry is only recorded when someone tries to pay, so an invoice reads `PAYMENT_REQUIRED` past its time. |

## 4. Facilities (simulations)
| Machine | States | Note |
|---|---|---|
| **RFQ** | `OPEN_IN_ROOST` → `MATCHED_BOUND`; loan `ACTIVE_SHIELDED` → `PRIVATE_LIQUIDATION`, plus a separate `marginCallActive` flag | **H2 (run, confirmed):** `matchAndBindLoan` checks only `!rfq \|\| quotes.length === 0`, never the status. A second call on a `MATCHED_BOUND` RFQ bound a second loan. The margin call is a flag beside the status, not a state. |
| **OTC order** | `SEALED_IN_ROOST` → `MATCHED_SETTLED` | |
| **FAR bridge** | `LOCKED_IN_PUBLIC_TREASURY` → `MINTED_SHIELDED` → `RELEASED_CLEAN` | |
| **JS contract mirror** | `contracts/nest.js`: `ACTIVE` / `SETTLED` / `ABORTED_REFUNDED` | **H5:** a second copy of the contract's state machine, spelled differently. They can drift; nothing compares them. |

## 5. Process machines (not code, still states)
- **Gap ledger:** `DISCOVERED → REPRODUCED → CLASSIFIED → CLOSURE_DEFINED → IMPLEMENTED → VERIFIED_LOCAL → VERIFIED_LIVE → CLOSED`. The checker enforces the allowed words, not the order.
- **Lab run:** drafted → run → promoted → verified (`verify-run.js`). **Deployment:** code-hash history (`deployments.json`); the Phala VM (created → attested → deleted); the pinned image digest.
- **Attestation:** nonce → report → per-candidate checks → accepted \| rejected, plus TCB status.

## 6. What to do with this
1. Plan 09-1 documents machine 1 (the group), as `docs/STATE_MACHINE.md`, with its invariants.
2. Add a second table to 09-1 for the Roost round (machine 2) and fix H1 test-first: a `run*` after a signed aggregate in the same round must refuse.
3. Fix H2 (add the status guard) and test it; decide on H4 (refuse, or keep the switch but expose `mode` loudly) and H5 (generate the mirror from one table, or delete it if unused).
4. Name the member and group composite states in code (small enums or `get_*` views) so the next audit does not have to infer them.
