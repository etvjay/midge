# Lab run 20261112T173655Z-f9e9

- **Code:** `22c7f686c79f41122b73c4deae1fe2f9d356ad78` on `pin-programs-image` (**8 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `620a25cc9310e33b…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 42 events, hash-chained; root `c829c2b77d3e775fcf10be71bc2c0245b2552a1981d81429a7cf4fc35b391cf0`. Verify with `node lab/verify-run.js lab/runs/20261112T173655Z-f9e9`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-PAYRUN-ANALYST-01 AI review of a pay run, checked by code: nothing identifying is sent, flags come from the code, replies are held to a shape, findings are cross-checked, the run is untouched | offline | **PASS** | 4 | 30 |  |

## E-PAYRUN-ANALYST-01: AI review of a pay run, checked by code: nothing identifying is sent, flags come from the code, replies are held to a shape, findings are cross-checked, the run is untouched

**Hypothesis.** The message built for the model carries no name, account, invoice id or exact amount over 500 generated runs; bands and rates are exact; linkability flags come from the code; a malformed or leaking reply is rejected whole; a finding is verified only when the numbers support it; and the pay run is identical with the review on, off, failing or returning nonsense.

**What this does not prove**
- Offline, with a scripted stand-in for the model. It shows the guards and the cross-check, not how well a real model reasons (see E-PAYRUN-ANALYST-LIVE-01). Bands and rates still carry some information about a line.

| Step | Result | Assertions | Time |
|---|---|---|---|
| what is sent: nothing identifying, exact bands and rates, order-independent labels | ✓ pass | 7/7 | 72 ms |
| linkability flags come from the code, with or without a model | ✓ pass | 5/5 | 2 ms |
| the reply is held to a shape, and every finding is cross-checked | ✓ pass | 16/16 | 2 ms |
| the review cannot change the run | ✓ pass | 2/2 | 2 ms |

### what is sent: nothing identifying, exact bands and rates, order-independent labels

- ✓ over 500 generated runs the message contains none of the names, accounts, invoice ids or exact amounts, nor anything shaped like an identifier
- ✓ a gross equal to the median is band 100; 240 against a median of 100 is band 240
- ✓ rates are exact to a tenth of a percent (20.0, 0.0, 9.0 and 2.9 for 7 of 240)
- ✓ listing the lines in a different order gives the same message (labels follow the numbers, not the list)
- ✓ exact amounts inside the same bands and rates give the same message
- ✓ employer rules text that names a person is refused before anything is sent
- ✓ rules text that contains an account id is refused

### linkability flags come from the code, with or without a model

- ✓ the 240 line is the only one in its net band: unique-amount
- ✓ the line with the earlier address is address-reused
- ✓ the lines in a shared net band are not flagged unique
- ✓ a run of one is headcount-one
- ✓ with the review off the flags are still returned and no model is used

### the reply is held to a shape, and every finding is cross-checked

- ✓ a well-formed reply is used
- ✓ a true zero-deduction finding is verified
- ✓ a true benefits-above-cap finding is verified
- ✓ a false rate-above-schedule finding (that line is exactly at 20%) is not verified
- ✓ an unknown code is rejected
- ✓ an unknown line label is rejected
- ✓ a note over 160 characters is rejected
- ✓ extra fields are rejected
- ✓ a reply that mentions an account id is rejected whole
- ✓ text that is not JSON is rejected and the review reports it was not used
- ✓ a reply wrapped in a code fence still parses
- ✓ every code in the allowed list is known to the cross-check without throwing
- ✓ zero-deduction means no tax withheld: verified for a line with no tax but 3% benefits, not verified for a line with tax
- ✓ codes the numbers cannot settle (other, schedule-ambiguous) are never verified, whatever the model says
- ✓ a rate-outlier claim on a line at the median rate is not verified
- ✓ a gateway failure is reported, not thrown

### the review cannot change the run

- ✓ the pay run result is byte-identical after the review ran on, with nonsense, failing and off
- ✓ the review result carries no allocation, signature or order hash

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
