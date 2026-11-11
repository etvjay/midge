# Lab run 20261111T043528Z-3f73

- **Code:** `2887a222fa159d23e51433e274516aaf0220e680` on `gap-closure` (**2 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `edd3ff37e9a64d22…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 71 events, hash-chained; root `f5e58a721c883b46f0a00b848d3dc4fb0e0bd80e33c37787ce35d0ec204ee49c`. Verify with `node lab/verify-run.js lab/runs/20261111T043528Z-3f73`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-HOSTED-DARKVAULT-LIVE-01 A Dark Vault run by the hosted Roost on a real Phala TDX VM: three rounds, a late deposit, settled on testnet with the VM's escrow check on | hardware | **FAIL** | 8 | 39 |  |

## E-HOSTED-DARKVAULT-LIVE-01: A Dark Vault run by the hosted Roost on a real Phala TDX VM: three rounds, a late deposit, settled on testnet with the VM's escrow check on

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. The pinned hosted image attests; the VM runs a pool, a ballot (counting a late depositor) and a lending quote for one Dark Vault group, and the contract settles each; the books close exactly; teardown leaves nothing.

**What this does not prove**
- One operator controls every account and the VM. This is the system working on real hardware, not independent parties.
- The attestation proves which image and compose the VM runs; it does not prove the escrow providers are honest or audit the code inside the image.
- Three rounds and five members: not a long-lived or large group. The VM exists for the length of the session and the coordinator key is generated for it.
- Only the cash leg settles. Deposits and payouts are public on NEAR.
- Testnet only; the contract has not been audited by a third party.

| Step | Result | Assertions | Time |
|---|---|---|---|
| preflight: the Phala account is empty and the compose file is pinned with the escrow settings | ✓ pass | 4/4 | 4759 ms |
| prediction 1: deploy on a real TDX VM and verify the attestation as a member would | ✓ pass | 16/16 | 49425 ms |
| set up: five members, four recipients, and a Dark Vault whose room key is the ATTESTED settlement key; four founders deposit | ✓ pass | 7/7 | 35081 ms |
| prediction 2: round 1, a pool run by the VM, 0.05 to rp | ✓ pass | 4/4 | 15451 ms |
| prediction 3: a fifth member deposits, then round 2, a ballot, counts them | ✗ fail | 1/1 | 39899 ms |
| prediction 4 and 5: round 3, a lending quote, then the books close | ✗ fail | 2/2 | 59431 ms |
| prediction 6: teardown of the chain side (members exit with their remainders, group pruned, accounts deleted) | ✓ pass | 2/2 | 95696 ms |
| prediction 6: teardown: delete the VM and prove the account is empty | ✓ pass | 3/3 | 6151 ms |

### preflight: the Phala account is empty and the compose file is pinned with the escrow settings

- ✓ no CVM is already running on the account
- ✓ the compose file is pinned to a CI-built image digest
- ✓ the compose file carries the escrow settings
- ✓ a production OS image hash is pinned
- observed **instance type and rate**: `{"type":"tdx.small","usdPerHour":0.058}`

### prediction 1: deploy on a real TDX VM and verify the attestation as a member would

- note: deploying midge-lab-11110435
- evidence cvm: {"id":"de661e1cb6d3e54ae22aaec8c84f14b50dbd1322","url":"https://de661e1cb6d3e54ae22aaec8c84f14b50dbd1322-8080.dstack-pha1-prod5.phala.network","deadmanHours":1}
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
- evidence attestation: {"composeHash":"909c6baa34becdfda8a42225b3e849535945f4626086a8f3866af7ab354f2b49","osImageHash":"ec43cb8c5e04b6bb6c53b33b16076a01d83d01f7f4b703f2f78a0d947d6247e6"}

### set up: five members, four recipients, and a Dark Vault whose room key is the ATTESTED settlement key; four founders deposit

- ✓ the settlement key the contract will trust equals the attested one
- ✓ nine accounts exist
- ✓ the group was hatched
- ✓ u1 deposits 0.1
- ✓ u2 deposits 0.1
- ✓ u3 deposits 0.1
- ✓ u4 deposits 0.1

### prediction 2: round 1, a pool run by the VM, 0.05 to rp

- observed **block the VM read**: `{"height":277166799,"hash":"7Ye224SXuwGhWJSWwmkerWsYxhETxZerJ5NoSUqp8Lh1","raceFree":false}`
- evidence tx: {"label":"settle_batch_charged round 1","hash":"E9EvQG98N68njUrPErZX4gBTfmrN3SYETCjr92v6Crcr","ok":true,"explorer":"https://testnet.nearblocks.io/txns/E9EvQG98N68njUrPErZX4gBTfmrN3SYETCjr92v6Crcr","error":null}
- ✓ round 1: the contract accepted the settlement the VM signed
- ✓ round 1: the epoch rose by exactly 1 and the round nonce changed
- ✓ round 1: rp received exactly 0.05 and nothing else moved
- ✓ round 1: the members' escrows sum to the group total

### prediction 3: a fifth member deposits, then round 2, a ballot, counts them

- ✓ u5 deposits 0.1 into the running group

### prediction 4 and 5: round 3, a lending quote, then the books close

- ✓ u3 wins at 400 bps
- evidence tx: {"label":"settle_batch_charged round 3","hash":"DFGDcTsH9DsWB6jSsYA2KM25ZDyWiFtBw1bHrSJQBuko","ok":true,"explorer":"https://testnet.nearblocks.io/txns/DFGDcTsH9DsWB6jSsYA2KM25ZDyWiFtBw1bHrSJQBuko","error":null}
- ✓ round 3: the contract accepted the settlement the VM signed

### prediction 6: teardown of the chain side (members exit with their remainders, group pruned, accounts deleted)

- observed **teardown**: `{"pruned":1,"notPruned":[],"deleted":9,"kept":[],"failed":[]}`
- ✓ the group was pruned and every account deleted
- ✓ the contract holds the groups it started with

### prediction 6: teardown: delete the VM and prove the account is empty

- observed **teardown**: `{"deleted":true,"id":"de661e1cb6d3e54ae22aaec8c84f14b50dbd1322","seconds":299,"estimatedUsd":0.0048}`
- ✓ the VM was deleted
- ✓ no CVM is left running on the account
- observed **estimated cost (USD)**: `0.0048`
- ✓ the session cost under $0.10

## Problems found

| Severity | Where | Problem |
|---|---|---|
| critical | E-HOSTED-DARKVAULT-LIVE-01 / prediction 3: a fifth member deposits, then round 2, a ballot, counts them | step threw: roost /ballot answered 400: [ROOST REJECT] a ballot is only counted on a host that requires signed inputs — {"stack":["Error: roost /ballot answered 400: [ROOST REJECT] a ballot is only counted on a host that requires signed inputs","    at #call (file:///home/ubuntu/near/src/roost-service/client.js:19:24)"… |
| critical | E-HOSTED-DARKVAULT-LIVE-01 / prediction 4 and 5: round 3, a lending quote, then the books close | step threw: timed out waiting for settlement resolved — {"stack":["Error: timed out waiting for settlement resolved","    at Object.waitFor (file:///home/ubuntu/near/lab/lib/near.js:99:11)","    at async settle (file:///home/ubuntu/near/lab/experiments/108… |
