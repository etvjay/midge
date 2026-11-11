# Lab run 20261111T094151Z-c01e

- **Code:** `362ef2e6b4a3c421a91dc30d5eddb01c4c2aec03` on `payrun-hardware` (**1 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `99a59326369ec75f…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 43 events, hash-chained; root `fdefd42bb5ff4c6162da291d16ba08f5f8fa6b33c2287649b779cf81d60e4621`. Verify with `node lab/verify-run.js lab/runs/20261111T094151Z-c01e`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-HOSTED-FAILCLOSED-LIVE-01 The hosted Roost fails closed on real TDX hardware: with both escrow providers unreachable it refuses a charged round (503), keeps the bid and signs nothing | hardware | **FAIL** | 5 | 22 |  |

## E-HOSTED-FAILCLOSED-LIVE-01: The hosted Roost fails closed on real TDX hardware: with both escrow providers unreachable it refuses a charged round (503), keeps the bid and signs nothing

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. Inside a real confidential VM whose two providers can never resolve, a charged round is refused with 503 in bounded time, the sealed bid is still there afterwards, nothing can be signed, and retrying gives the same answer.

**What this does not prove**
- The providers are on the reserved .invalid domain, so this shows a total outage, not a partial one (partial failure is covered offline).
- It does not show recovery: the providers are fixed in the VM's measured compose file, so recovery needs a second VM.
- The compose file is a test fixture that differs from the real one only in the two provider URLs; it is attested here but is not a deployment members should trust.
- One operator controls the VM; no testnet funds or contract are involved.

| Step | Result | Assertions | Time |
|---|---|---|---|
| preflight: the Phala account is empty and the fixture is the pinned image with unresolvable providers | ✓ pass | 3/3 | 3181 ms |
| deploy the fixture on a real TDX VM (capped by a dead-man's switch) | ✓ pass | 2/2 | 47262 ms |
| prediction 1: the VM attests, and the attestation covers the unreachable settings | ✓ pass | 14/14 | 3686 ms |
| prediction 2 to 4: a charged round is refused with 503 in bounded time, the bid survives, nothing can be signed, and a retry gives the same answer | ✗ fail | 0/0 | 123 ms |
| prediction 5: teardown: delete the VM and prove the account is empty | ✓ pass | 3/3 | 11306 ms |

### preflight: the Phala account is empty and the fixture is the pinned image with unresolvable providers

- ✓ no CVM is already running on the account
- ✓ the fixture pins a CI-built image digest
- ✓ its providers are on the reserved .invalid domain
- observed **instance type and rate**: `{"type":"tdx.small","usdPerHour":0.058}`

### deploy the fixture on a real TDX VM (capped by a dead-man's switch)

- note: deploying midge-lab-11110941
- evidence cvm: {"id":"c99253317c59af7e4474efb269341f580dcb06e7","url":"https://c99253317c59af7e4474efb269341f580dcb06e7-8080.dstack-pha1-prod5.phala.network","deadmanHours":1}
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
- evidence attestation: {"composeHash":"2298092434721e79fe6d0ede83ea543f39143a2ae546ce3899bede8143e1a7e9","osImageHash":"ec43cb8c5e04b6bb6c53b33b16076a01d83d01f7f4b703f2f78a0d947d6247e6"}

### prediction 5: teardown: delete the VM and prove the account is empty

- observed **teardown**: `{"deleted":true,"id":"c99253317c59af7e4474efb269341f580dcb06e7","seconds":59,"estimatedUsd":0.0009}`
- ✓ the VM was deleted
- ✓ no CVM is left running on the account
- observed **estimated cost (USD)**: `0.0009`
- ✓ the session cost under $0.05

## Problems found

| Severity | Where | Problem |
|---|---|---|
| critical | E-HOSTED-FAILCLOSED-LIVE-01 / prediction 2 to 4: a charged round is refused with 503 in bounded time, the bid survives, nothing can be signed, and a retry gives the same answer | step threw: roost /intents answered 400: [ROOST REJECT] this Roost only accepts signed inputs: use submitSignedIntent — {"stack":["Error: roost /intents answered 400: [ROOST REJECT] this Roost only accepts signed inputs: use submitSignedIntent","    at #call (file:///home/ubuntu/near/src/roost-service/client.js:19:24)"… |
