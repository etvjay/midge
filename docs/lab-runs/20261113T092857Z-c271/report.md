# Lab run 20261113T092857Z-c271

- **Code:** `0c2fa434053982cf1af5eaa748af43cbcff1e2d4` on `room-gaps` (**6 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `20b299a37ee3a320…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 40 events, hash-chained; root `6e827a264fe757805785b351239fa2bd50a2983dfb95b1e44a4188913bd7dc2e`. Verify with `node lab/verify-run.js lab/runs/20261113T092857Z-c271`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-ROOM-GAPS-01 Quote expiry, uninvited makers, a minimum fill, a decision-only vote and a browser-checkable AI receipt | offline | **PASS** | 4 | 26 |  |

## E-ROOM-GAPS-01: Quote expiry, uninvited makers, a minimum fill, a decision-only vote and a browser-checkable AI receipt

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. An expired quote is left out and named; an uninvited maker is ignored; a cross order filled under its minimum is cancelled and the cross recomputed; a vote with no pool signs a decision that a browser verifies and that can never be settled; a saved model receipt verifies in the browser only when its signed text, signer and signature all hold.

**What this does not prove**
- Offline, on a local room with a simulated attestation provider, a stubbed account-key check and a fixed clock. The model receipt is a locally signed stand-in with the same shape as a NEAR AI Cloud receipt.

| Step | Result | Assertions | Time |
|---|---|---|---|
| prediction 1 and 2: an expired quote and an uninvited maker are both left out, and the best valid invited quote wins | ✓ pass | 6/6 | 57 ms |
| prediction 3: an order filled under its minimum is cancelled, and the cross is computed again without it | ✓ pass | 5/5 | 24 ms |
| prediction 4: a vote with no pool signs a decision a browser verifies, and can never be settled | ✓ pass | 10/10 | 42 ms |
| prediction 5: a model receipt verifies in the browser only when its text, signer and signature all hold | ✓ pass | 5/5 | 12 ms |

### prediction 1 and 2: an expired quote and an uninvited maker are both left out, and the best valid invited quote wins

- evidence outcome: {"shape":"rfq","pricing":"first","taker":"tk.near","won":true,"winner":"m2.near","quotesReceived":2,"quotesEligible":2,"outsiders":["m4.near"],"expired":["m1.near"],"unreadable":[],"executionModel":"HOSTED_SEALED_RFQ","c…
- ✓ m1, whose quote expired, is named as expired
- ✓ m4, who was not invited, is an outsider and does not win
- ✓ m2 wins at 0.04, and the taker is charged 0.08
- ✓ m3, with no expiry, still counted as a valid quote
- ✓ the same quote cleared before its expiry wins
- ✓ a validUntil that is not a whole number makes the quote unreadable

### prediction 3: an order filled under its minimum is cancelled, and the cross is computed again without it

- ✓ b2 is cancelled below its minimum
- ✓ b1 now fills all 5 units
- ✓ the loop runs until no fill is below its minimum (two passes here)
- ✓ the room publishes one cancelled order and names no one
- ✓ b1 is charged 0.05 and b2 nothing

### prediction 4: a vote with no pool signs a decision a browser verifies, and can never be settled

- evidence decision: {"message":"midge-decision-v1:c.near:g:3:abababababababababababababababababababababababababababababababab:v1:majority:yes:-:79e2a683a784a4fb8a43f2666832625b0493b5da0f7fd296ea3138bd790dd70d","signature":"2b75b2bc81eb0f09d…
- ✓ nothing to pay: no allocations, no charges, no order hash
- ✓ the decision names the winner and moves no money
- ✓ the browser verifies the signed decision and reads it back
- ✓ the message is the one decisionMessage builds
- ✓ a changed winner fails the check
- ✓ another key fails the check
- ✓ settling the round is refused
- ✓ the round cannot be opened again to decide twice
- ✓ the decision message does not start with a contract id, so it is never a settlement message
- ✓ a vote that misses quorum still signs a decision that says none, and why

### prediction 5: a model receipt verifies in the browser only when its text, signer and signature all hold

- ✓ a true receipt verifies
- ✓ a changed response hash fails
- ✓ a signer that is not the model key fails
- ✓ a receipt signed by another key that names itself as signer fails, because the signer is not the model key
- ✓ a receipt with no signature fails, and says so

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
