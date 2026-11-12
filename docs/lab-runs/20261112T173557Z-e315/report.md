# Lab run 20261112T173557Z-e315

- **Code:** `22c7f686c79f41122b73c4deae1fe2f9d356ad78` on `pin-programs-image` (**8 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `620a25cc9310e33b…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 53 events, hash-chained; root `bdde1e8146496390ed007df8eba0001f998126606d761e5c097ad45f7c4ad36b`. Verify with `node lab/verify-run.js lab/runs/20261112T173557Z-e315`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-PAYRUN-ANALYST-LIVE-01 The pay run review against the real attested NEAR AI Cloud model: planted problems are found and cross-checked, nothing identifying is sent | live-external | **FAIL** | 2 | 39 (1 failed) |  |

## E-PAYRUN-ANALYST-LIVE-01: The pay run review against the real attested NEAR AI Cloud model: planted problems are found and cross-checked, nothing identifying is sent

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. The attested gateway answers and its record verifies; the reply parses in the fixed shape on the first try or after one retry; the missing deduction and the benefits cap are reported on the right lines and verify; every verified finding is true; nothing identifying is in the request.

**What this does not prove**
- One model (Qwen/Qwen3.6-35B-A3B-FP8), one synthetic run of six lines, run from this machine and not inside the hosted Roost VM.
- The model has no authority on tax law and is asked to reason from the employer's text only. Whether its notes are useful to an accountant is not measured.
- The model still learns bands, rates, the employer's rule text and that a pay run is being reviewed.

| Step | Result | Assertions | Time |
|---|---|---|---|
| prediction 1, 2 and 5: ask the attested model, with at most one retry, from the redacted message | ✓ pass | 34/34 | 25515 ms |
| prediction 3 and 4: planted problems are found on the right lines, and every verified finding is true | ✗ fail | 4/5 | 1 ms |

### prediction 1, 2 and 5: ask the attested model, with at most one retry, from the redacted message

- ✓ the review was used (the reply parsed in the fixed shape)
- observed **attempts**: `1`
- evidence sent: {"task":"review-payrun","rules":"Tax is a flat 20 percent of gross, withheld on every line. Employee benefits are capped at 5 percent of gross. All lines are for the November 2026 period. A line with no tax withheld need…
- ✓ the request does not contain "Wilhel…"
- ✓ the request does not contain "pr1x9k…"
- ✓ the request does not contain "INV-20…"
- ✓ the request does not contain "2026-11"
- ✓ the request does not contain "Wilhelmina"
- ✓ the request does not contain "Aldridge"
- ✓ the request does not contain "Tiberi…"
- ✓ the request does not contain "pr2x9k…"
- ✓ the request does not contain "INV-20…"
- ✓ the request does not contain "Tiberius"
- ✓ the request does not contain "Okafor"
- ✓ the request does not contain "Seraph…"
- ✓ the request does not contain "pr3x9k…"
- ✓ the request does not contain "INV-20…"
- ✓ the request does not contain "Seraphina"
- ✓ the request does not contain "Lindqvist"
- ✓ the request does not contain "Casimi…"
- ✓ the request does not contain "pr4x9k…"
- ✓ the request does not contain "INV-20…"
- ✓ the request does not contain "Casimir"
- ✓ the request does not contain "Brightwater"
- ✓ the request does not contain "Ottoli…"
- ✓ the request does not contain "pr5x9k…"
- ✓ the request does not contain "INV-20…"
- ✓ the request does not contain "Ottoline"
- ✓ the request does not contain "Vandermeer"
- ✓ the request does not contain "Barnab…"
- ✓ the request does not contain "pr6x9k…"
- ✓ the request does not contain "INV-20…"
- ✓ the request does not contain "Barnaby"
- ✓ the request does not contain "Castellanos"
- ✓ nothing in the request is shaped like an address or account id
- ✓ the receipt verifies (model signature, key, attestation, request and response hashes)
- observed **receipt**: `{"model":"Qwen/Qwen3.6-35B-A3B-FP8","requestSha256":"a6526164a00f5228cd9e643e7c637c3d5e4cc3db1fcd95ccc9959378a2c1a96e","responseSha256":"f1e…`

### prediction 3 and 4: planted problems are found on the right lines, and every verified finding is true

- evidence findings: {"0":{"line":"A","code":"zero-deduction","severity":"warn","note":"Tax rate is 0% instead of required 20%. Rule requires a written exemption for any line with no tax withheld.","check":"verified"},"1":{"line":"E","code":…
- ✓ the missing tax deduction is reported on its own line and verifies
- ✓ the benefits over the cap are reported on their own line and verify
- ✓ the code flags the unique amount without the model
- observed **the model also mentioned the unique amount**: `false`
- ✗ every finding marked verified is true when recomputed here from the numbers — expected , got 
- observed **findings the code could not verify**: `[]`
- ✓ the summary and questions are present and short

## Problems found

| Severity | Where | Problem |
|---|---|---|
| major | E-PAYRUN-ANALYST-LIVE-01 / prediction 3 and 4: planted problems are found on the right lines, and every verified finding is true | assertion failed: every finding marked verified is true when recomputed here from the numbers — {} |
