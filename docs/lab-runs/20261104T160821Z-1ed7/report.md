# Lab run 20261104T160821Z-1ed7

- **Code:** `cd2d972f183e4f3f25473fc51bba6e9e72ba57ce` on `master` (**6 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `8a0180ff698c44b5…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 114 events, hash-chained; root `a2e6c18984f455c719a7e7ed39d63a079851114031208c7170aa1a630ef470d8`. Verify with `node lab/verify-run.js lab/runs/20261104T160821Z-1ed7`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-ADVISOR-LIVE-01 The Roost, NEAR AI and the contract together: the attested model proposes the split, the Roost bounds it, the contract enforces it | cloud | **PASS** | 7 | 31 | 2 attempts: PASS, PASS |

## E-ADVISOR-LIVE-01: The Roost, NEAR AI and the contract together: the attested model proposes the split, the Roost bounds it, the contract enforces it

**Hypothesis.** Members seal bids to a Roost that totals them exactly. The attested NEAR AI model (certificate chain verified, E2EE, signed receipt) is asked only how to split that total among the policy's recipients, and sees nothing else. What it proposes is validated, signed by the Roost only within the total, and paid by the contract only to the policy's recipients. The stored advice record verifies independently and its allocations match the allocations hash the contract logged. The failures that must NOT happen: a proposal pays more than the sealed bids total, or someone outside the policy; or an unreachable or misbehaving model stops the round.

**What this does not prove**
- The model is told the total and the recipients' weights. The total is revealed to NEAR AI Cloud (the attested model, not the operator), never an individual bid. If even the total must stay hidden, do not use an advisor.
- The Roost is a local HostedRoost with a simulated attestation provider: the Roost's hardware is E-HOSTED-LIVE-01. This tests how the pieces connect, not the TEE.
- The task has an exact answer (3:2:1 of 0.06), so the model's output can be checked. For a judgement call there is no exact answer; the bounds (total, recipients) still hold and the rest is the model's opinion, attested but not proven correct.
- Whether the model gets this task right is an observation (it is a probabilistic aggregator); the experiment asserts what happens either way.
- One operator controls every account. Testnet only.

| Step | Result | Assertions | Time |
|---|---|---|---|
| set up: two flyers, three recipients, a Roost, and a syndicate whose policy lists exactly those recipients | ✓ pass | 4/4 | 20097 ms |
| the Roost totals the sealed bids exactly; that total is all the model is told | ✓ pass | 1/1 | 17 ms |
| the attested model proposes a 3:2:1 split among the recipients (live, certificate chain required) | ✓ pass | 3/3 | 13412 ms |
| the Roost signs within the total and the contract pays the recipients exactly | ✓ pass | 13/13 | 3748 ms |
| a compromised or lying advisor cannot exceed the bounds (syndicate #2 holds 0.04) | ✓ pass | 6/6 | 5997 ms |
| an unreachable model delays nothing: the round settles on the exact rule | ✓ pass | 2/2 | 3254 ms |
| teardown: prune the syndicates, compact, delete the accounts | ✓ pass | 2/2 | 29129 ms |

### set up: two flyers, three recipients, a Roost, and a syndicate whose policy lists exactly those recipients

- ✓ the deployed contract is the build expected from the wasm built from this checkout
- ✓ hatch syndicate #1
- ✓ vb9mhka.fly-1793636729.testnet deposits 0.03
- ✓ vb9mhkb.fly-1793636729.testnet deposits 0.03

### the Roost totals the sealed bids exactly; that total is all the model is told

- ✓ the Roost's total is exactly 0.06

### the attested model proposes a 3:2:1 split among the recipients (live, certificate chain required)

- observed **model**: `{"model":"Qwen/Qwen3.6-35B-A3B-FP8","tcbStatus":"UpToDate","signer":"89fb781a9530473a"}`
- observed **what the model answered**: `

{"allocations":[{"recipient":"vb9mhkr.fly-1793636729.testnet","amount":"0.030000"},{"recipient":"vb9mhks.fly-1793636729.testnet","amount":…`
- ✓ the model's attestation checks all passed
- ✓ the receipt verifies: hashes, the model's signature, the signer being the attested key
- observed **the proposal is valid**: `yes`
- observed **the proposal equals the rule 3:2:1**: `yes`
- observed **what will be settled**: `{"source":"model","reason":null}`
- ✓ whatever the model said, what is settled is a valid split of exactly the rule

### the Roost signs within the total and the contract pays the recipients exactly

- evidence tx: {"label":"settle_batch adv-mw2b9mhk-1","hash":"G7DWFvhpQ4yfg3ooGa6eanJE1Jc6zhfjawg1ZWvsUAq3","ok":true,"explorer":"https://testnet.nearblocks.io/txns/G7DWFvhpQ4yfg3ooGa6eanJE1Jc6zhfjawg1ZWvsUAq3","error":null}
- ✓ settle_batch succeeded
- ✓ the contract paid exactly 0.03, 0.02 and 0.01 NEAR to the three recipients and nobody else
- ✓ the contract logged an allocations hash for the settlement
- ✓ it equals the hash the Roost signed
- ✓ advice record: the stored response body hashes to the recorded response hash
- ✓ advice record: the signed text binds this model, this request hash and this response hash
- ✓ advice record: the signature is a provider_tee signature
- ✓ advice record: the signer is the attested model key
- ✓ advice record: the model's signature verifies
- ✓ advice record: decrypting the stored response with the recorded key gives the recorded plaintext
- ✓ advice record: the allocations in the attested response hash to the allocations hash on chain
- ✓ advice record: a fresh attestation of the model returns the same key
- evidence advice-record: {"record":{"version":1,"model":"Qwen/Qwen3.6-35B-A3B-FP8","modelPublicKey":"89fb781a9530473a6d3bddd6bb0a0536c8d155058798edae88b19153bd8f4350","tcbStatus":"UpToDate","attestationNonce":"be3fbe369f14b4e29759ba5a95bdca15689…
- ✓ editing the stored advice afterwards is detected

### a compromised or lying advisor cannot exceed the bounds (syndicate #2 holds 0.04)

- ✓ hatch syndicate #2
- ✓ flyer a deposits 0.04
- ✓ a split of 0.06 from a 0.04 total: the Roost refuses to sign (validator bypassed on purpose)
- ✓ a split to an account outside the policy: the Roost does not know the policy and signs
- evidence tx: {"label":"LYING-ADVICE settle_batch adv-mw2b9mhk-2","hash":null,"ok":false,"explorer":null,"error":"Smart contract panicked: panicked at src/lib.rs:557:13:\n[Settle REJECT] Recipient thief9mhk.fly-1793636729.testnet is n…
- ✓ the contract rejects it: the recipient is not in the release policy
- ✓ the syndicate is still active with its 0.04 intact

### an unreachable model delays nothing: the round settles on the exact rule

- ✓ asking an unreachable gateway fails
- ✓ the round settled on the exact rule (0.02 and 0.02) without the model

### teardown: prune the syndicates, compact, delete the accounts

- observed **teardown**: `{"pruned":2,"notPruned":[],"deleted":5,"kept":[],"failed":[]}`
- ✓ every account was deleted and every syndicate pruned
- ✓ the contract holds the records it started with

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
