# Lab run 20261105T031634Z-e166

- **Code:** `05570272866099d29f0895bee3c0de420db250e8` on `master` (**3 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `8a0180ff698c44b5…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 103 events, hash-chained; root `515e39d6b2ba09e42874df6bd6a1cb793d516086e47eba2a62cfa6ed4fc48363`. Verify with `node lab/verify-run.js lab/runs/20261105T031634Z-e166`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-COMBINED-LIVE-01 NEAR AI proposes, our Roost on a real Phala TDX VM bounds and signs, the NEAR contract settles: one round | hardware | **PASS** | 11 | 60 |  |

## E-COMBINED-LIVE-01: NEAR AI proposes, our Roost on a real Phala TDX VM bounds and signs, the NEAR contract settles: one round

**Hypothesis.** Members verify the Roost's attestation on a real Intel TDX VM and seal their bids to it. The VM totals them exactly. Only that total goes to the attested NEAR AI model (certificate chain verified, end-to-end encrypted, signed receipt), which proposes how to split it among the policy's recipients. The VM signs a settlement only within the total, and the contract pays only the policy's recipients. The advice record verifies independently against the allocations hash the contract logged. On the same VM and contract: a proposal above the total is refused by the VM, and a signed payout to someone outside the policy is refused by the contract.

**What this does not prove**
- One operator controls every account, the coordinator and the VM account. This shows the parts working together on real hardware, not independent parties.
- The total (not any individual bid) is revealed to NEAR AI Cloud's attested model. If even the total must stay private, do not use an advisor.
- The VM attestation proves the VM runs the pinned compose and image; it does not audit the code inside the image, and it is only as strong as Intel TDX and Phala's platform. The model attestation is only as strong as NEAR AI Cloud's TEE stack.
- The split task has an exact answer (3:2:1 of 0.06), so the model can be checked. Whether the model answers correctly is an observation; what is settled is asserted either way.
- The VM exists for a few minutes. Testnet only; the contract has not been audited by a third party.

| Step | Result | Assertions | Time |
|---|---|---|---|
| preflight: no VM is running, the pins are present, the contract is the expected build | ✓ pass | 4/4 | 2110 ms |
| deploy the Roost on a real TDX VM (capped by a dead-man's switch) | ✓ pass | 3/3 | 46698 ms |
| verify the VM's attestation exactly as a member would | ✓ pass | 14/14 | 3277 ms |
| the VM's access control holds, and its keys are the attested keys | ✓ pass | 5/5 | 102 ms |
| set up: two flyers, three recipients, and a syndicate bound to the VM's attested key and compose hash | ✓ pass | 5/5 | 18985 ms |
| members seal bids to the VM; the VM totals them exactly, and that total is all the model is told | ✓ pass | 1/1 | 276 ms |
| the attested NEAR AI model proposes a 3:2:1 split of the VM's total (live, certificate chain required) | ✓ pass | 2/2 | 3341 ms |
| the VM signs within the total and the contract pays the recipients exactly | ✓ pass | 12/12 | 4090 ms |
| a bad answer is stopped at each layer: the VM will not sign above the total, the contract will not pay outside the policy | ✓ pass | 9/9 | 9982 ms |
| teardown of the chain side: prune the syndicates, compact the indexes, delete the accounts | ✓ pass | 2/2 | 29631 ms |
| teardown: delete the VM and prove the Phala account is empty | ✓ pass | 3/3 | 5908 ms |

### preflight: no VM is running, the pins are present, the contract is the expected build

- ✓ no CVM is already running on the Phala account
- ✓ the compose file is pinned to a CI-built image digest
- ✓ a production OS image hash is pinned
- ✓ a NEAR AI key is configured
- observed **instance type and rate**: `{"type":"tdx.small","usdPerHour":0.058}`

### deploy the Roost on a real TDX VM (capped by a dead-man's switch)

- note: deploying midge-lab-11050316
- evidence cvm: {"id":"bab52f1243e46f218d0d9f56328d6e1fbd6e8ff7","url":"https://bab52f1243e46f218d0d9f56328d6e1fbd6e8ff7-8080.dstack-pha-prod5.phala.network","deadmanHours":1}
- ✓ the VM was created with public logs off
- ✓ it runs a production (non-dev) OS image
- ✓ it runs the pinned production OS image hash

### verify the VM's attestation exactly as a member would

- ✓ Phala's app-compose contains our compose file byte for byte
- ✓ bundle has the expected format
- ✓ bundle report data matches our keys and our nonce
- ✓ dstack-verifier accepts the attestation
- ✓ Intel quote verifies
- ✓ event log replays to the measured RTMR3
- ✓ OS image hash verifies against the published image
- ✓ platform is a dstack TDX confidential VM
- ✓ TCB status is acceptable
- ✓ OS image is not a development image
- ✓ quote report data equals sha512(our keys, our nonce)
- ✓ compose hash equals the pinned hash of our build
- ✓ OS image hash is one we pin
- ✓ the VM does not claim to be a simulator
- evidence attestation: {"composeHash":"8a0180ff698c44b5e743acca369fbfe9f309fbf084cf87415f6962fb8e1be6c8","osImageHash":"ec43cb8c5e04b6bb6c53b33b16076a01d83d01f7f4b703f2f78a0d947d6247e6","nonce":"2fa05e12209a765d270a96c918d5e80c0fe39fdf528aa066…

### the VM's access control holds, and its keys are the attested keys

- ✓ /aggregate without the coordinator key is refused (401)
- ✓ /settle without the coordinator key is refused (401)
- ✓ the intent key members seal to equals the attested intent key
- ✓ the settlement key the contract will trust equals the attested settlement key
- ✓ the session says it is not simulated

### set up: two flyers, three recipients, and a syndicate bound to the VM's attested key and compose hash

- ✓ hatch syndicate #1
- ✓ its settlement key is the VM's attested key
- ✓ its expected code hash is the VM's attested compose hash
- ✓ kz62x5a.fly-1793636729.testnet deposits 0.03
- ✓ kz62x5b.fly-1793636729.testnet deposits 0.03

### members seal bids to the VM; the VM totals them exactly, and that total is all the model is told

- observed **aggregate from the VM**: `{"totalInputAmount":"0.06","flyerCount":2,"excludedFlyers":[],"executionModel":"HOSTED_EXACT_BATCH","confidentiality":"tee-hosted","timestam…`
- ✓ the VM's total is exactly 0.06 from 2 bids

### the attested NEAR AI model proposes a 3:2:1 split of the VM's total (live, certificate chain required)

- observed **model**: `{"model":"Qwen/Qwen3.6-35B-A3B-FP8","tcbStatus":"UpToDate","signer":"89fb781a9530473a"}`
- observed **what the model answered**: `

{"allocations":[{"recipient":"kz62x5r.fly-1793636729.testnet","amount":"0.030000"},{"recipient":"kz62x5s.fly-1793636729.testnet","amount":…`
- ✓ the model's attestation checks all passed
- observed **the proposal is valid**: `yes`
- observed **the proposal equals the rule 3:2:1**: `yes`
- observed **what will be settled**: `{"source":"model","reason":null}`
- ✓ what is settled is a valid split of exactly the rule

### the VM signs within the total and the contract pays the recipients exactly

- ✓ the VM signed the settlement
- evidence tx: {"label":"settle_batch cmb-mw2z62x5-1","hash":"4roKauYHdJ1jAYBHNARLUUwkMQJA5mZ8zL56p2nTbDWw","ok":true,"explorer":"https://testnet.nearblocks.io/txns/4roKauYHdJ1jAYBHNARLUUwkMQJA5mZ8zL56p2nTbDWw","error":null}
- ✓ settle_batch succeeded
- ✓ the contract paid exactly 0.03, 0.02 and 0.01 NEAR to the three recipients and nobody else
- ✓ the contract logged the allocations hash the VM signed
- ✓ advice record: the stored response body hashes to the recorded response hash
- ✓ advice record: the signed text binds this model, this request hash and this response hash
- ✓ advice record: the signature is a provider_tee signature
- ✓ advice record: the signer is the attested model key
- ✓ advice record: the model's signature verifies
- ✓ advice record: decrypting the stored response with the recorded key gives the recorded plaintext
- ✓ advice record: the allocations in the attested response hash to the allocations hash on chain
- ✓ advice record: a fresh attestation of the model returns the same key
- evidence advice-record: {"record":{"version":1,"model":"Qwen/Qwen3.6-35B-A3B-FP8","modelPublicKey":"89fb781a9530473a6d3bddd6bb0a0536c8d155058798edae88b19153bd8f4350","tcbStatus":"UpToDate","attestationNonce":"99aef7fcd1f00911b304af7e5d1b8d0b0cb…

### a bad answer is stopped at each layer: the VM will not sign above the total, the contract will not pay outside the policy

- ✓ hatch syndicate #2
- ✓ flyer a deposits 0.04
- ✓ a proposal of 0.06 against a 0.04 total: the VM refuses to sign
- ✓ a payout to an account outside the policy: the VM does not know the policy and signs
- evidence tx: {"label":"OUTSIDE-POLICY settle_batch cmb-mw2z62x5-2","hash":"GAYD3eLmdHFzotxeBpRWeB7Nfy2SgHme4y7CvhykRcNx","ok":false,"explorer":"https://testnet.nearblocks.io/txns/GAYD3eLmdHFzotxeBpRWeB7Nfy2SgHme4y7CvhykRcNx","error":…
- ✓ the contract rejects it: the recipient is not in the release policy
- ✓ the syndicate is still active with its 0.04 intact
- ✓ the VM will not sign a second settlement for the same sealed round
- ✓ a fresh sealed round is signed within its total
- evidence tx: {"label":"settle_batch cmb-mw2z62x5-2","hash":"Ar9aAFNQwCeYeKscqWKSaFMCSnbsVMbA4K8h2RkCKkiZ","ok":true,"explorer":"https://testnet.nearblocks.io/txns/Ar9aAFNQwCeYeKscqWKSaFMCSnbsVMbA4K8h2RkCKkiZ","error":null}
- ✓ the same syndicate then settles within its policy

### teardown of the chain side: prune the syndicates, compact the indexes, delete the accounts

- observed **teardown**: `{"pruned":2,"notPruned":[],"deleted":5,"kept":[],"failed":[]}`
- ✓ every syndicate was pruned and every account deleted
- ✓ the contract holds exactly as many records as before the run

### teardown: delete the VM and prove the Phala account is empty

- observed **teardown**: `{"deleted":true,"id":"bab52f1243e46f218d0d9f56328d6e1fbd6e8ff7","seconds":119,"estimatedUsd":0.0019}`
- ✓ the VM was deleted
- ✓ no CVM is left running on the account
- observed **estimated cost (USD)**: `0.0019`
- ✓ the VM cost under $0.05

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
