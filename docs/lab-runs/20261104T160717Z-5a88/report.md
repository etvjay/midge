# Lab run 20261104T160717Z-5a88

- **Code:** `cd2d972f183e4f3f25473fc51bba6e9e72ba57ce` on `master` (**2 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `8a0180ff698c44b5…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 66 events, hash-chained; root `566149f5b385f9a13cab9c2ab919156bb61eebce7f37012bf29b76335fa1528d`. Verify with `node lab/verify-run.js lab/runs/20261104T160717Z-5a88`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-ADVISOR-MODEL The attested advisor: honest answers verify, wrong answers are caught, and tampering with the record is detected | offline | **PASS** | 5 | 51 |  |

## E-ADVISOR-MODEL: The attested advisor: honest answers verify, wrong answers are caught, and tampering with the record is detected

**Hypothesis.** An advisor that asks an attested model to split an amount among recipients returns a proposal that is validated strictly and a record that anyone can check: the model's signature over the exact request and response, the decrypted allocations, and their hash against the chain. The failures that must NOT happen: a proposal that pays more than the total or someone not listed is accepted; an answer that was not sealed, was tampered with or was not signed by the attested key is accepted; or a record that was edited afterwards still verifies.

**What this does not prove**
- The "model" is a mock gateway that implements the NEAR AI Cloud protocol (E2EE v2, signed receipts) and replies with whatever each test scripts. It tests the advisor's checks, not the quality of any real model. The live model is E-ADVISOR-LIVE-01.
- The attestation is the mock's (certificate-chain verification is skipped here); the live experiment requires it.
- A proposal that is valid and off the rule is accepted or rejected by policy (requireRule), not by the contract: the contract has no notion of "the rule".

| Step | Result | Assertions | Time |
|---|---|---|---|
| exact arithmetic helpers | ✓ pass | 4/4 | 1 ms |
| an honest answer: validated, matches the rule, and its record verifies end to end | ✓ pass | 12/12 | 82 ms |
| wrong answers are caught by the validator, and the fallback is the exact rule | ✓ pass | 20/20 | 194 ms |
| transport and attestation failures fail closed | ✓ pass | 7/7 | 71 ms |
| tampering with the stored record is detected | ✓ pass | 8/8 | 46 ms |

### exact arithmetic helpers

- ✓ parseMicro reads at most six decimals and refuses seven, negatives and junk
- ✓ formatMicro and microToYocto round-trip
- ✓ the rule 3:2:1 of 0.06 is 0.03, 0.02, 0.01 exactly
- ✓ a total that does not divide is floored and never exceeds the total

### an honest answer: validated, matches the rule, and its record verifies end to end

- ✓ the proposal is valid and equals the rule
- ✓ the allocations are in the contract's shape: recipient and a yocto string
- ✓ the stored response body hashes to the recorded response hash
- ✓ the signed text binds this model, this request hash and this response hash
- ✓ the signature is a provider_tee signature
- ✓ the signer is the attested model key
- ✓ the model's signature verifies
- ✓ decrypting the stored response with the recorded key gives the recorded plaintext
- ✓ the allocations in the attested response hash to the allocations hash on chain
- ✓ a fresh attestation of the model returns the same key
- ✓ the gateway saw only ciphertext: neither the total nor a recipient id appears in the request
- ✓ chooseAllocations uses the model's answer and says so
- observed **the stored record (without the response body)**: `{"model":"Qwen/Qwen3.6-35B-A3B-FP8","tcbStatus":"not-checked","requestSha256":"e5ef719137c5aa8b","responseSha256":"81e9aad90a5cf840","signer…`

### wrong answers are caught by the validator, and the fallback is the exact rule

- ✓ REJECTED: pays more than the total (0.12 of 0.06)
- ✓   and the fallback is the exact rule: 0.03, 0.02, 0.01
- ✓ REJECTED: pays a recipient that is not listed
- ✓   and the fallback is the exact rule: 0.03, 0.02, 0.01
- ✓ REJECTED: lists a recipient twice
- ✓   and the fallback is the exact rule: 0.03, 0.02, 0.01
- ✓ REJECTED: a zero amount
- ✓   and the fallback is the exact rule: 0.03, 0.02, 0.01
- ✓ REJECTED: a negative amount
- ✓   and the fallback is the exact rule: 0.03, 0.02, 0.01
- ✓ REJECTED: seven decimals
- ✓   and the fallback is the exact rule: 0.03, 0.02, 0.01
- ✓ REJECTED: prose around the JSON
- ✓   and the fallback is the exact rule: 0.03, 0.02, 0.01
- ✓ REJECTED: an extra field
- ✓   and the fallback is the exact rule: 0.03, 0.02, 0.01
- ✓ REJECTED: an empty array
- ✓   and the fallback is the exact rule: 0.03, 0.02, 0.01
- ✓ a valid but off-rule split passes validation (it is bounded) and is flagged as not the rule
- ✓ with requireRule (the default) it falls back to the rule

### transport and attestation failures fail closed

- ✓ a reply that is not sealed (plaintext) is refused
- ✓ a reply that was tampered with in transit is refused
- ✓ a reply whose signature is wrong is refused
- ✓ a reply signed by a key other than the attested one is refused
- ✓ an attestation whose quote does not contain the model key is refused
- ✓ an attestation whose quote does not contain our nonce is refused
- ✓ without a key the advisor refuses to start

### tampering with the stored record is detected

- ✓ the untouched record verifies
- ✓ editing the plaintext after the fact fails (it no longer matches what the stored response decrypts to)
- ✓ altering the stored response body fails (the hash no longer matches)
- ✓ replacing the decryption key fails
- ✓ claiming a different model key fails (the signature does not verify under it)
- ✓ claiming a different request fails (the signed text names the original)
- ✓ comparing with a different on-chain allocations hash fails (the settled allocations are not the attested ones)
- ✓ the offline receipt check alone also passes for the untouched record

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
