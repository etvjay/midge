# Lab run 20261111T222555Z-1881

- **Code:** `df3e9aa662a0a58610dbac919a209f17c4dd3fe5` on `pin-gap052` (**98 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `73f42e651241e148…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 56 events, hash-chained; root `2bc193c50b2a524b0a1d08048aec16c4de1911c14c04e6eb2cd91a06b466a150`. Verify with `node lab/verify-run.js lab/runs/20261111T222555Z-1881`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-HOSTED-FAILCLOSED-LIVE-01 The hosted Roost fails closed on real TDX hardware: with both escrow providers unreachable it refuses a charged round (503), keeps the bid and signs nothing | hardware | **PASS** | 6 | 33 |  |

## E-HOSTED-FAILCLOSED-LIVE-01: The hosted Roost fails closed on real TDX hardware: with both escrow providers unreachable it refuses a charged round (503), keeps the bid and signs nothing

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. Inside a real confidential VM whose two providers can never resolve, a charged round is refused with 503 in bounded time, the sealed bid is still there afterwards, nothing can be signed, and retrying gives the same answer.

**What this does not prove**
- The first promoted run of this experiment (older build) sent an unsigned bid. On the signed-only compose that fails (run 20261111T094151Z-c01e, GAP-050); this version sends a signed bid from a throwaway account.
- The providers are on the reserved .invalid domain, so this shows a total outage, not a partial one (partial failure is covered offline).
- It does not show recovery: the providers are fixed in the VM's measured compose file, so recovery needs a second VM.
- The compose file is a test fixture that differs from the real one only in the two escrow provider URLs; it is attested here but is not a deployment members should trust.
- The account-check providers failing is covered by unit tests, not here. One operator controls the VM and the throwaway account (0.1 NEAR, deleted).

| Step | Result | Assertions | Time |
|---|---|---|---|
| preflight: the Phala account is empty and the fixture is the pinned image with unresolvable providers | ✓ pass | 4/4 | 1799 ms |
| deploy the fixture on a real TDX VM (capped by a dead-man's switch) | ✓ pass | 2/2 | 45995 ms |
| prediction 1: the VM attests, and the attestation covers the unreachable settings | ✓ pass | 14/14 | 2479 ms |
| prediction 2 to 4: a charged round is refused with 503 in bounded time, the bid survives, nothing can be signed, and a retry gives the same answer | ✓ pass | 9/9 | 864 ms |
| teardown: delete the throwaway account | ✓ pass | 1/1 | 4666 ms |
| prediction 5: teardown: delete the VM and prove the account is empty | ✓ pass | 3/3 | 4846 ms |

### preflight: the Phala account is empty and the fixture is the pinned image with unresolvable providers

- ✓ no CVM is already running on the account
- ✓ the fixture pins a CI-built image digest
- ✓ its escrow providers are on the reserved .invalid domain
- ✓ prediction 8: its account-check providers are two different, reachable ones
- observed **instance type and rate**: `{"type":"tdx.small","usdPerHour":0.058}`

### deploy the fixture on a real TDX VM (capped by a dead-man's switch)

- note: deploying midge-lab-11112225
- evidence cvm: {"id":"f4419094bbada6e916121160d8f19d95285dee6d","url":"https://f4419094bbada6e916121160d8f19d95285dee6d-8080.dstack-pha1-prod5.phala.network","deadmanHours":1}
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
- evidence attestation: {"composeHash":"3e57012814fd66600614525775a4438a0833c603f43d071ab9c451a828e4abc4","osImageHash":"ec43cb8c5e04b6bb6c53b33b16076a01d83d01f7f4b703f2f78a0d947d6247e6"}

### prediction 2 to 4: a charged round is refused with 503 in bounded time, the bid survives, nothing can be signed, and a retry gives the same answer

- ✓ prediction 7: a bid signed with a key that is not the account's is refused by the key check
- ✓ prediction 6: the signed bid is accepted although both escrow providers are unreachable, because key checks use their own providers
- ✓ the digest of the bid is a real hash, so comparing it later means something
- observed **first refusal**: `{"status":503,"ms":38,"error":"[ROOST REJECT] could not read escrow: fetch failed"}`
- ✓ the charged round is refused with 503
- ✓ the reason is that escrow could not be read
- ✓ in bounded time (under 45 s)
- ✓ a retry gives the same answer
- ✓ the sealed bid is still there, unchanged
- ✓ nothing can be signed, because no round was run

### teardown: delete the throwaway account

- ✓ the account was deleted

### prediction 5: teardown: delete the VM and prove the account is empty

- observed **teardown**: `{"deleted":true,"id":"f4419094bbada6e916121160d8f19d95285dee6d","seconds":61,"estimatedUsd":0.001}`
- ✓ the VM was deleted
- ✓ no CVM is left running on the account
- observed **estimated cost (USD)**: `0.001`
- ✓ the session cost under $0.05

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
