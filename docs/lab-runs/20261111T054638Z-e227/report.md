# Lab run 20261111T054638Z-e227

- **Code:** `30e3aa38fe964c1fa147ea21ba06d39911c434a8` on `signed-inputs-image` (**10 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `223b105261c3b481…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 31 events, hash-chained; root `f1e9c89b2765052f79762eab3b8968e1aac3ffa88a2527b37c040d2e294b9eef`. Verify with `node lab/verify-run.js lab/runs/20261111T054638Z-e227`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-PREFLIGHT-ADVICE-LIVE-01 The redacted pre-flight advisory against the real attested NEAR AI Cloud model: only codes and rounded ratios are sent, the receipt verifies, the decision does not change | live-external | **PASS** | 2 | 21 |  |

## E-PREFLIGHT-ADVICE-LIVE-01: The redacted pre-flight advisory against the real attested NEAR AI Cloud model: only codes and rounded ratios are sent, the receipt verifies, the decision does not change

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. The model receives none of a scenario's identifying strings; two payments in the same bucket are indistinguishable; the attestation and the signed receipt verify; the decision is unchanged; with the advisory off the model is not called.

**What this does not prove**
- One model (Qwen/Qwen3.6-35B-A3B-FP8) and one scenario. Whether the explanation is useful to an operator is not measured; it is expected to mostly restate the codes.
- The model still learns the finding codes, the chain family, rounded ratios and that a payment is being checked.
- Runs from this machine, not inside the hosted Roost VM.

| Step | Result | Assertions | Time |
|---|---|---|---|
| prediction 2 and 5: the message is coarse by design, and with the advisory off the model is not called | ✓ pass | 3/3 | 1 ms |
| prediction 1, 3 and 4: ask the real attested model from the redacted message | ✓ pass | 18/18 | 5444 ms |

### prediction 2 and 5: the message is coarse by design, and with the advisory off the model is not called

- ✓ two payments in the same ten-percent bucket give an identical message
- ✓ with the advisory not enabled no request is made
- ✓ enabled with no advisor configured makes no request either

### prediction 1, 3 and 4: ask the real attested model from the redacted message

- ✓ the advisory was used
- evidence sent: {"task":"explain-preflight","chainKind":"solana","findings":[{"code":"destination-changed","severity":"warn"},{"code":"amount-unusual","severity":"warn"}],"ratiosPct":{"amountOfPaymentCap":100,"windowUseAfterPayment":90,…
- ✓ the message does not contain "inv-20…"
- ✓ the message does not contain "2J75L6…"
- ✓ the message does not contain "1900000"
- ✓ the message does not contain "Ada Lovelace"
- ✓ the message does not contain "Ada"
- ✓ the message does not contain "Lovelace"
- ✓ the message does not contain "3Bxs4T…"
- ✓ the message does not contain "500000"
- ✓ the message does not contain "2000000"
- ✓ the message does not contain "5000000"
- ✓ the message does not contain "2500000"
- ✓ nothing in the message is shaped like an address or account id
- ✓ the message is under 600 characters
- ✓ the attestation chain verified with TCB UpToDate
- ✓ the model's signed receipt verifies (hashes, signature, signer equals the attested key)
- ✓ the reply is plain text of reasonable length
- observed **the model's reply**: `The pre-flight check flagged two warnings: the destination was changed and the amount is unusually high. The payment is at 100% of the cap, …`
- ✓ the decision beside the advice is the deterministic one, unchanged

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
