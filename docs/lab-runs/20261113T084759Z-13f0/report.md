# Lab run 20261113T084759Z-13f0

- **Code:** `5e110f7b5d516e874c9d0680bb09a39b9efdb344` on `hw-maker-checker-blocktrade` (**1 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `29f58898aa3bf050…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 61 events, hash-chained; root `36b7614a545d1a1b5130a5cc843070a21b01e5fc135e13581a8fd8c4006d60e2`. Verify with `node lab/verify-run.js lab/runs/20261113T084759Z-13f0`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-HOSTED-CROSS-LIVE-01 A block trade on the real hardware room: sealed, signed firm orders cross at a public reference price, the larger side fills pro rata, and the cash leg settles exactly on the production contract | hardware | **PASS** | 6 | 36 |  |

## E-HOSTED-CROSS-LIVE-01: A block trade on the real hardware room: sealed, signed firm orders cross at a public reference price, the larger side fills pro rata, and the cash leg settles exactly on the production contract

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. A buyer whose limit is under the reference price is left out; the smaller sell side fills in full and the buy side pro rata; the outcome shows no limit price; sellers are paid and buyers charged exactly the reference price times their filled units.

**What this does not prove**
- One operator controls every account and the VM.
- Only the middle of a block trade is modelled: no indications of interest or firm-up step, no minimum fill, no time priority, a supplied reference price, and only the cash leg settles.
- Charges and payouts are public on NEAR, so filled units can be worked out from the cash and the public reference price.

| Step | Result | Assertions | Time |
|---|---|---|---|
| preflight: the Phala account is empty and the compose file is pinned | ✓ pass | 4/4 | 2057 ms |
| prediction 1: deploy on a real TDX VM and verify the attestation as a member would | ✓ pass | 16/16 | 49410 ms |
| set up: three buyers and two sellers, a group whose room key is the ATTESTED settlement key, the buyers deposit | ✓ pass | 5/5 | 30227 ms |
| prediction 2 and 3: firm orders are sealed and signed, and the cross is right | ✓ pass | 6/6 | 6260 ms |
| prediction 5: teardown of the chain side (members exit with their remainders, group pruned, accounts deleted) | ✓ pass | 2/2 | 41766 ms |
| prediction 5: teardown: delete the VM and prove the account is empty | ✓ pass | 3/3 | 5699 ms |

### preflight: the Phala account is empty and the compose file is pinned

- ✓ no CVM is already running on the account
- ✓ the compose file is pinned to a CI-built image digest and requires signed inputs
- ✓ the pinned digest is the one CI built from the merge that added maker-checker (98531165)
- ✓ a production OS image hash is pinned
- observed **instance type and rate**: `{"type":"tdx.small","usdPerHour":0.058}`

### prediction 1: deploy on a real TDX VM and verify the attestation as a member would

- note: deploying midge-lab-11130848
- evidence cvm: {"id":"c0b3f3d7cab31177401feb3d75f2d9761c932f69","url":"https://c0b3f3d7cab31177401feb3d75f2d9761c932f69-8080.dstack-pha1-prod9.phala.network","deadmanHours":1}
- ✓ public logs are off
- ✓ it runs a production (non-dev) OS image with the pinned hash
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
- evidence attestation: {"composeHash":"20b299a37ee3a3208c60ad3529c3d03d8ef5601adec7a5ba39a8996f0708d96a","osImageHash":"ec43cb8c5e04b6bb6c53b33b16076a01d83d01f7f4b703f2f78a0d947d6247e6"}

### set up: three buyers and two sellers, a group whose room key is the ATTESTED settlement key, the buyers deposit

- ✓ the settlement key the contract will trust equals the attested one
- ✓ the group was hatched
- ✓ b1 deposits 0.08
- ✓ b2 deposits 0.08
- ✓ b3 deposits 0.08

### prediction 2 and 3: firm orders are sealed and signed, and the cross is right

- evidence outcome: {"excludedForEscrow":[],"escrowBlock":{"height":277487719,"hash":"FMS7uB8sauwHV8k8SzobFNXtahrjeVD3bFErcAV64aJi","raceFree":false},"shape":"cross","referencePrice":"0.01","maxUnits":null,"matchedUnits":5,"cash":"0.05","bu…
- ✓ 5 units matched for 0.05 at the reference price 0.01, between two buyers and two sellers
- ✓ the published outcome carries no limit price
- ✓ b1 is charged 0.03 (3 of 6 units) and b2 0.02 (2 of 4), pro rata; b3 is left out
- evidence tx: {"label":"settle_batch_charged block trade","hash":"H1Yr5cApGZJp4mHrPNm4Lhb55Lor3jcFko7iCUB9yCmY","ok":true,"explorer":"https://testnet.nearblocks.io/txns/H1Yr5cApGZJp4mHrPNm4Lhb55Lor3jcFko7iCUB9yCmY","error":null}
- ✓ the contract accepted the settlement the VM signed
- ✓ prediction 4: s1 received exactly 0.03 and s2 exactly 0.02, and nothing else moved
- ✓ b1 has 0.05 left, b2 0.06 and b3 all of its 0.08

### prediction 5: teardown of the chain side (members exit with their remainders, group pruned, accounts deleted)

- observed **teardown**: `{"pruned":1,"notPruned":[],"deleted":5,"kept":[],"failed":[]}`
- ✓ the group was pruned and every account deleted
- ✓ the contract holds the groups it started with

### prediction 5: teardown: delete the VM and prove the account is empty

- observed **teardown**: `{"deleted":true,"id":"c0b3f3d7cab31177401feb3d75f2d9761c932f69","seconds":131,"estimatedUsd":0.0021}`
- ✓ the VM was deleted
- ✓ no CVM is left running on the account
- observed **estimated cost (USD)**: `0.0021`
- ✓ the session cost under $0.15

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
