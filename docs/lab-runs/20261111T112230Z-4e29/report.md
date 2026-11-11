# Lab run 20261111T112230Z-4e29

- **Code:** `206ccadcc24e20818cf9f7f2873928acf6852b32` on `completeness` (**5 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `73f42e651241e148…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 55 events, hash-chained; root `ead82379818910171270eace5da3479a666eb3f4c55a4fd9f2f2bfc140f0a67b`. Verify with `node lab/verify-run.js lab/runs/20261111T112230Z-4e29`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-HOSTED-ACCTCHECK-FAIL-LIVE-01 One account-check provider down on the real hardware room: every signed bid is refused as unverifiable, nothing is queued, the room stays up | hardware | **PASS** | 6 | 31 |  |

## E-HOSTED-ACCTCHECK-FAIL-LIVE-01: One account-check provider down on the real hardware room: every signed bid is refused as unverifiable, nothing is queued, the room stays up

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. With one of two account-check providers unresolvable, a correctly signed bid is refused as not checkable, retries give the same answer, the room stays up, and nothing is queued so no round can be run.

**What this does not prove**
- The failing provider is on the reserved .invalid domain, so this shows one provider that cannot be reached; one that answers "no" while the other answers "yes" is covered by unit tests only.
- It does not show recovery when the provider returns: the providers are fixed in the VM's measured compose file, so recovery needs a second VM.
- The compose file is a test fixture that differs from the real one in one line; it is attested here but is not a deployment members should trust.
- One operator controls the VM and the throwaway account (0.1 NEAR, deleted).

| Step | Result | Assertions | Time |
|---|---|---|---|
| preflight: the Phala account is empty and the fixture is the pinned image with unresolvable providers | ✓ pass | 4/4 | 1845 ms |
| deploy the fixture on a real TDX VM (capped by a dead-man's switch) | ✓ pass | 2/2 | 56236 ms |
| prediction 1: the VM attests, and the attestation covers the unreachable settings | ✓ pass | 14/14 | 3199 ms |
| prediction 2 to 4: a correctly signed bid is refused as not checkable, retries agree, the room stays up and nothing is queued | ✓ pass | 7/7 | 7352 ms |
| teardown: delete the throwaway account | ✓ pass | 1/1 | 4653 ms |
| prediction 6: teardown: delete the VM and prove the account is empty | ✓ pass | 3/3 | 14469 ms |

### preflight: the Phala account is empty and the fixture is the pinned image with unresolvable providers

- ✓ no CVM is already running on the account
- ✓ the fixture pins a CI-built image digest
- ✓ its account-check providers are two different ones, exactly one of which is on the reserved .invalid domain
- ✓ its escrow providers are the real ones
- observed **instance type and rate**: `{"type":"tdx.small","usdPerHour":0.058}`

### deploy the fixture on a real TDX VM (capped by a dead-man's switch)

- note: deploying midge-lab-11111122
- evidence cvm: {"id":"a887190715a381415329db942d8f3e8f471600b3","url":"https://a887190715a381415329db942d8f3e8f471600b3-8080.dstack-pha1-prod9.phala.network","deadmanHours":1}
- ✓ the VM answered /healthz
- ✓ it runs a production (non-dev) OS image with the pinned hash

### prediction 1: the VM attests, and the attestation covers the unreachable settings

- ✓ Phala's app-compose equals the fixture byte for byte
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
- evidence attestation: {"composeHash":"62f608175dbf63a0624a03a3aab11bf65945442c07665941598e91cc20314b3d","osImageHash":"ec43cb8c5e04b6bb6c53b33b16076a01d83d01f7f4b703f2f78a0d947d6247e6"}

### prediction 2 to 4: a correctly signed bid is refused as not checkable, retries agree, the room stays up and nothing is queued

- observed **how the signed bid was refused**: `roost /signed-intents answered 400: [ROOST REJECT] could not check that ed25519:DyEBjEwAT4MQus3Q2Uq9jEQNHVAgyA4PPtSED8cFXELt is a key of fc1…`
- ✓ prediction 2: the correctly signed bid was refused, not accepted
- ✓ and the refusal says the key could not be checked
- ✓ prediction 3: retries give the same answer
- ✓ the room is still up: /healthz and /session answer 200
- ✓ prediction 4: nothing was queued
- ✓ so a charged round is refused and not run (the reason given is the escrow read: this test group does not exist on chain, and that read comes before the empty-queue check)
- ✓ and nothing can be signed, because no round was run
- observed **the pool call**: `{"status":503,"error":"[ROOST REJECT] could not read escrow: 0 of 2 providers answered, 2 needed: https://test.rpc.fastnear.com: the group d…`

### teardown: delete the throwaway account

- ✓ the account was deleted

### prediction 6: teardown: delete the VM and prove the account is empty

- observed **teardown**: `{"deleted":true,"id":"a887190715a381415329db942d8f3e8f471600b3","seconds":84,"estimatedUsd":0.0014}`
- ✓ the VM was deleted
- ✓ no CVM is left running on the account
- observed **estimated cost (USD)**: `0.0014`
- ✓ the session cost under $0.05

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
