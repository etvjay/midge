# State machines: the contract and the Roost round

Written 2026-11-08 from the source (`contracts/fly-coordinator/src/lib.rs`, `src/roost-service/hosted-roost.js`). `tests/state-machine-doc.test.js` fails if a public contract function or a Roost round method has no row, so this stays complete. `scripts/check-invariants.js` fails if a Rust test, test file or lab experiment named in a `tests` column no longer exists, and `make check` runs it. Lab experiments are run by `node lab/run.js`, not by `node --test`. Survey of the unnamed states: `docs/IMPLICIT_STATE_MACHINES.md`.

## Words
- **Group** (code: *syndicate*): a pool of members' money with public rules, held by the contract.
- **Escrow**: the money one member has put in. **Total escrow**: all of it.
- **Settlement**: a payout the room signed and the contract carried out. **In flight**: the payout has been sent and its follow-up step has not yet run.
- **Epoch / round nonce**: the room's signature is for one epoch and one nonce; the nonce changes after each settlement, so a signature works once.
- **Release window**: a stretch of blocks (twice the exit timer) in which the total released may not pass the cap.
- **Second key**: a group can require two rooms to sign the same payout.
- **Pending record** (`p:<id>`): what an in-flight settlement still has to do.
- **Drained**: a member still listed whose escrow is 0.

## States
`Active` → `Settled` (a settlement used the whole group) or `AbortedRefunded` (the last member left). Both end states stay, **with one exception, a rollback**: if the transfer that caused the move fails, the follow-up step puts the group back to `Active` together with the money (`on_settlement_payout` for a failed payout, `on_hatch_out_payout` for a failed refund). A group in either end state takes no deposits. Beside the status the contract keeps:
`is_settling` (a payout is in flight), the pending record `p:<id>` (exists exactly while `is_settling`), the release window `w:<id>`, the second key `k2:<id>`, `epoch`, `round_nonce`, `active_flyer_count`, `flyers`, `total_escrow`, and one escrow balance per member.

| Composite state | Status | `is_settling` | Pending record | Reached by |
|---|---|---|---|---|
| Open | Active | no | no | `hatch`, `deposit`, a finished settlement that left money |
| Payout in flight | Active | yes | yes | `settle_batch*` |
| Settled | Settled | no | no | a settlement that paid out everything |
| Refunded | AbortedRefunded | no | no | the last member's `hatch_out` |
| Unfunded and stuck | Active | no | no | `hatch` with no deposit afterwards: no exit, not prunable (GAP-030) |

Not allowed, ever: `Settled → Active` or `AbortedRefunded → Active` by any path except the failed-transfer rollback above (`C-12`), two settlements in flight, a pending record without `is_settling` (or the reverse), a member listed twice.

## Contract transitions
Columns: **who** may call, **guard** (the refusals, quoted from the source), **effect**, **tests** (Rust test names; `NONE` means no test names this function yet).

| Function | Who | Guard | Effect | Tests |
|---|---|---|---|---|
| `new` | deployer, once | none | empty contract | `test_hatch_and_ed25519_settle_with_payout` |
| `hatch` | anyone, with ≥ 0.005 NEAR | id 3-64 chars of `a-z0-9-_`; not already hatched; room key 64 hex; quorum ≥ 1; timer ≥ 10; code hash ≤ 128 bytes; spend limit fits | new group in Open; policy hash v2 stored | `test_hatch_invalid_quorum_fails`, `test_hatch_invalid_timeout_fails`, `test_invalid_id_characters_fails`, `a_timer_below_the_floor_is_refused`, `hatch_refuses_an_oversized_code_hash` |
| `hatch_two_room` | anyone, with ≥ 0.005 NEAR | all of `hatch`, plus a second key that is valid and different | as `hatch`, plus `k2:<id>` | `a_two_room_syndicate_cannot_register_the_same_key_twice` |
| `deposit` | any account that names the current policy hash | ≥ 0.01 NEAR; group Active; hash matches; not in flight; no overflow; under the per-member limit; ≤ 50 members | escrow and total up; member listed once; release-window base up | `test_deposit_limit_exceeded_fails`, `test_deposit_to_non_active_fails`, `test_max_flyers_cap_enforced`, `a_deposit_with_a_hash_that_omits_the_timer_is_refused`, `a_member_drained_to_zero_who_deposits_again_is_not_listed_twice` |
| `settle_batch` | anyone (relays a room's signature) | group Active and not in flight; order hash has no `:`; deadline not passed; nonce matches; quorum; 1-8 distinct allowed recipients, positive amounts; sum ≤ total and ≤ the window cap; Ed25519 signature over the exact message; not a two-room group | Open → Payout in flight; transfers sent; pending record written; total reduced | `test_hatch_and_ed25519_settle_with_payout`, `test_settle_batch_rejects_altered_payout_recipient`, `test_signature_cross_contract_replay_fails`, `test_y1_settlement_to_recipient_outside_allowlist_fails`, `order_hash_may_not_contain_the_message_separator` |
| `settle_batch_charged` | anyone | all of `settle_batch`, plus charges: non-empty, distinct members, positive, each ≤ that member's escrow, summing to exactly the payout | as `settle_batch`; on the follow-up each member pays their own charge | `charged_settlement_charges_each_member_their_own_amount`, `charged_settlement_rejects_a_charge_above_the_members_deposit`, `charged_settlement_rejects_charges_that_do_not_sum_to_the_payout` |
| `settle_batch_two_room` | anyone | as `settle_batch`, with two signatures from the two different rooms over the same message; group must be two-room | as `settle_batch` | `two_room_settlement_pays_when_both_rooms_sign_the_same_message`, `two_room_settlement_rejects_a_bad_second_signature` |
| `settle_batch_charged_two_room` | anyone | as `settle_batch_charged`, with two signatures | as `settle_batch_charged` | `two_room_charged_settlement_pays_when_both_rooms_sign_the_charges` |
| `on_settlement_payout` | the contract itself (callback) | only the contract; acts only if it matches the stored pending record. **Legacy:** kept so a settlement that was in flight at the 2026-11-09 upgrade can still be finished; new settlements schedule the next row | Payout in flight → Open or Settled; each member's escrow reduced by what landed; failed part restored; nonce rotates; record removed | `test_integration_settlement_failure_callback_rollback`, `a_failed_charged_payout_leaves_every_members_escrow_untouched`, `a_late_callback_from_a_recovered_settlement_cannot_finish_the_next_one`, `a_late_callback_after_recovery_changes_nothing` |
| `on_settlement_payout_for_round` | the contract itself (callback) | only the contract; acts only if the round nonce it names is the one recorded for the settlement in flight (`n:<id>`, written with the pending record, cleared with it); otherwise it is a late follow-up of an earlier settlement and changes nothing (GAP-028) | as `on_settlement_payout` | `a_late_follow_up_from_an_earlier_identical_settlement_changes_nothing`, `the_follow_up_that_names_the_settlement_in_flight_finishes_it`, `the_follow_up_is_still_the_late_one_after_the_right_one_finished`, `a_follow_up_with_no_nonce_on_record_is_not_the_one_in_flight`, `recovery_clears_the_nonce_record_too`, `the_follow_up_scheduled_by_a_settlement_is_the_one_that_names_its_round`, `a_settlement_in_flight_from_the_old_code_is_still_finished_by_the_old_follow_up` |
| `recover_stuck_settlement` | anyone, 100 blocks after the start | a settlement is in flight; the record is readable; the block is far enough on | finishes the books as if the payout landed; clears the flag | `a_stuck_settlement_cannot_be_recovered_too_early`, `anyone_can_recover_a_stuck_settlement_and_it_settles_the_books_as_if_the_payout_landed`, `recovery_is_refused_when_nothing_is_in_flight` |
| `hatch_out` | a member, for their own escrow | not Settled; not in flight; group holds escrow; the timer or deadline has passed; caller has a balance | escrow to the caller; listed count down; window base down; last member out → Refunded | `test_premature_hatch_out_fails`, `test_hatch_out_after_timeout_refunds_only_caller`, `test_hatch_out_after_settled_fails`, `test_double_hatch_out_fails`, `a_deposit_that_has_left_does_not_raise_the_release_cap` |
| `on_hatch_out_payout` | the contract itself (callback) | only the contract | if the transfer failed: escrow, status, count and window base restored | `test_on_hatch_out_payout_failure_restores_escrow_and_status`, `test_on_hatch_out_payout_rejects_external_caller` |
| `prune_syndicate` | anyone | status Settled or Refunded; no escrow left; nothing in flight | record, window, second key removed; id can be reused | `test_prune_removes_a_settled_syndicate_and_logs_it`, `test_prune_refuses_an_active_syndicate`, `test_a_pruned_id_can_be_reused_and_the_old_signature_is_dead` |
| `compact_member_index` | anyone | none | drops pruned ids from a member's index | `test_compact_member_index_drops_ids_of_pruned_syndicates` |
| `get_escrow` | view | none | a member's balance | `st_views_describe_a_new_group` |
| `get_syndicate` | view | none | the group record | `st_views_describe_a_new_group`, `st_views_say_nothing_about_a_group_that_does_not_exist` |
| `get_syndicate_count` | view | none | number of groups | `st_views_describe_a_new_group` |
| `list_syndicates` | view | none | a page of groups | `st_views_describe_a_new_group` |
| `list_syndicates_by_member` | view | none | groups a member is in | `test_get_syndicates_by_member` |
| `get_syndicates_by_member` | view | none | alias of the above | `test_get_syndicates_by_member` |
| `get_member_syndicate_count` | view | none | how many groups a member is in | `st_views_describe_a_new_group` |
| `get_release_policy` | view | none | recipients, cap, deadline | `st_views_describe_a_new_group`, `st_views_say_nothing_about_a_group_that_does_not_exist` |
| `get_policy_hash` | view | none | the hash a depositor must name | `a_new_groups_hash_covers_the_exit_timer` |
| `get_policy_terms` | view | none | the terms and whether the timer is covered | `the_terms_view_shows_what_a_depositor_consents_to_and_that_the_timer_is_covered` |
| `get_release_window` | view | none | the open window, if any | `two_settlements_that_together_stay_within_the_cap_are_both_allowed` |
| `get_pending_settlement` | view | none | the pending record, if any | `a_settlement_in_flight_records_when_it_started` |
| `get_group_phase` | view | none | where a group is: Open, PayoutInFlight (including a final payout, until its follow-up has run), Settled, Refunded or Unfunded (hatched, never funded); nothing for an unknown id | `a_group_nobody_has_funded_is_unfunded`, `a_funded_group_is_open_then_in_flight_then_open_again_then_settled`, `a_group_whose_last_member_left_is_refunded`, `the_phase_of_a_group_that_does_not_exist_is_nothing` |
| `get_second_enclave_key` | view | none | the second key, if any | `two_room_syndicate_exposes_its_second_key_and_a_one_room_one_does_not` |

## The Roost round
The host (`HostedRoost`) holds one round at a time in four fields: `round` (what inputs must be signed for), `sealedIntents` (the queue), `lastSeq` (the newest accepted sequence per account) and `aggregate` (the last computed result and whether it has been signed).

`no round` → **open** (`openRound`; queue empty) → inputs queue → **aggregate computed** (a `run*`; queue cleared; `signed: false`) → **signed** (`signSettlement`; `signed: true`) → the next `openRound` starts over.

Not allowed: signing the same aggregate twice; running again after a signature in the same round (`R-01`, enforced by every `run*` since 2026-11-08) except after a deliberate, recorded `abandonSignedRound`; accepting an input signed for another round.

| Method | Guard | Effect | Tests |
|---|---|---|---|
| `openRound` | id fields non-empty with no `:`; epoch ≥ 0 | sets `round`; clears queue, `lastSeq`, `aggregate` | `lab/experiments/97-room-service.js` |
| `submitSignedIntent` | round open; account id valid; seq ≥ 1 and newer than before; ciphertext in size bounds; signature valid for this round; key belongs to the account; round unchanged while checking; queue not full | queues or replaces the account's input | `tests/hosted-roost-rounds.test.js` (lead 15), `lab/experiments/74-signed-inputs.js` |
| `submitSealedIntent` | host not in signed-only mode; sealed hex valid; one bid per id; queue not full | queues the input | `lab/experiments/73-pool-program.js` |
| `excludeMembers` | none | removes the named members' inputs from the queue | `lab/experiments/94-ongoing-groups.js` |
| `bindEscrow` | host has an escrow reader; a round is open (optionally a pinned `blockHash`, so two rooms read one block); the read agrees across providers, is recent, and is not older than an earlier read of this round | reads, at one final block, what each queued bidder and each extra paying account holds; stores one snapshot (used up by the next charged `run*`, refused after 30 s); reports `raceFree`, an estimate | `tests/hosted-roost-escrow.test.js`, `tests/escrow-reader.test.js` |
| `abandonSignedRound` | the round has a signed settlement | gives up the signed round so the same nonce can run and be signed again (the contract rejected the first one, so nothing changed on chain); records the order hash, message hash, allocation and charge hashes and the signature in `host.abandoned` (newest 100, in memory); the abandoned signature stays valid on chain; drops the escrow read | `tests/hosted-roost-escrow.test.js` |
| `aggregateAndClear` | no signed aggregate yet in this round (`R-01`); queue not empty; at least one readable bid | adds up every readable bid exactly; unreadable bids are named by account and dropped; clears the queue; sets `aggregate` | `tests/hosted-roost-rounds.test.js` (R-01) |
| `runAuction` | no signed aggregate yet in this round (`R-01`); readable bids; valid reserve | clears the queue; sets `aggregate` | `lab/experiments/72-auction-programs.js` |
| `runPool` | no signed aggregate yet in this round (`R-01`); readable contributions; min and cap valid | as above | `lab/experiments/73-pool-program.js` |
| `runQuote` | no signed aggregate yet in this round (`R-01`); pricing valid; shape valid | as above | `lab/experiments/77-quote-programs.js` |
| `runBallot` | no signed aggregate yet in this round (`R-01`); with an escrow reader, a snapshot from `bindEscrow` that covers the roll and every queued voter (roll members who cannot cover a share are left out and named); roll and options valid; quorum; rule | as above | `lab/experiments/78-ballot-program.js`, `tests/hosted-roost-escrow.test.js` |
| `runRfq` | no signed aggregate yet in this round (`R-01`); taker, makers, pricing valid | as above | `lab/experiments/80-rfq-program.js` |
| `runPayrun` | no signed aggregate yet in this round (`R-01`); employer, tax and benefits addresses; keys | as above | `lab/experiments/79-payrun-program.js` |
| `runCross` | no signed aggregate yet in this round (`R-01`); reference price valid; at most 8 sellers filled | clears the queue; **restores it if more than 8 sellers fill** | `tests/hosted-roost-rounds.test.js` (lead 13) |
| `signSettlement` | an aggregate exists and is unsigned; round fields match; order hash matches; charges and allocations match the outcome; each charge ≤ that bidder's bound; ≤ 8 recipients; payout ≤ what the bids support | signs once; sets `signed` | `lab/experiments/72-auction-programs.js` |
| `describe` | none | what this host is and what it can run | `lab/experiments/97-room-service.js` |
| `getSessionInfo` | none | the host's public keys and mode | `verifications/10-hosted-roost.js` |
| `getAttestationBundle` | none | the attestation of the host's keys for a caller's nonce | `verifications/10-hosted-roost.js` |
| `inputDigests` | none | a digest per queued input, never its content | `lab/experiments/75-two-room-agreement.js` |
| `toJSON` | none | the host's public description | NONE |

## The simulation mirror
`src/contracts/nest.js` is a JavaScript simulation of the contract used in `model` mode. Its statuses (`ACTIVE`, `SETTLED`, `ABORTED_REFUNDED`) correspond to the contract's `Active`, `Settled`, `AbortedRefunded`. `tests/nest-mirror.test.js` (comparison in `scripts/status-drift.js`) fails if the two sets of names drift, in either direction.
