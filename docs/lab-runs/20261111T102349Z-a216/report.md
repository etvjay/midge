# Lab run 20261111T102349Z-a216

- **Code:** `cd55a54a43fa1bd0ac2225f9e0596234bf20c05c` on `gap050-pin` (**5 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `99a59326369ec75f…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 89 events, hash-chained; root `ab8762a93081ad2acaa0a0e4669b450c2b9c104b866e19cd2253eac12a17573e`. Verify with `node lab/verify-run.js lab/runs/20261111T102349Z-a216`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-HOSTED-PAYRUN-LIVE-01 A pay run with payee-signed invoices and an employer-authorised auditor pack on the real hardware room, settled on the production contract | hardware | **PASS** | 10 | 55 |  |

## E-HOSTED-PAYRUN-LIVE-01: A pay run with payee-signed invoices and an employer-authorised auditor pack on the real hardware room, settled on the production contract

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. A mismatched invoice stops the run; a corrected run settles with exact amounts; receipts carry their invoice hash and verify against the on-chain order hash; the auditor sees only the line the employer opens; the stateless checks answer on the VM.

**What this does not prove**
- One operator controls every account and the VM. This is the system working on real hardware, not independent parties.
- Every payment's address and amount is public on NEAR once settled: this hides who a payee is, not how much.
- The coordinator holds the key that triggers a run. Only NEAR payments are made from the hardware room here; foreign-chain payments go through the contract and have their own experiment.
- The VM exists for the length of the session and is deleted; no hosted room is running.

| Step | Result | Assertions | Time |
|---|---|---|---|
| preflight: the Phala account is empty and the compose file is pinned with the escrow settings | ✓ pass | 5/5 | 2192 ms |
| prediction 1: deploy on a real TDX VM and verify the attestation as a member would | ✓ pass | 16/16 | 49268 ms |
| set up: an employer, three payees, tax and benefits accounts, and a group whose room key is the ATTESTED settlement key; the employer deposits 0.2 | ✓ pass | 3/3 | 19303 ms |
| prediction 2: a line that differs from its invoice stops the run, names the mismatch, and the queue is kept | ✓ pass | 2/2 | 23949 ms |
| prediction 3: after reopening the round, the corrected run settles with exact amounts on the production contract | ✓ pass | 10/10 | 17757 ms |
| prediction 4: each payee opens their own statement; it carries their invoice hash and verifies against the on-chain order hash; another payee's key cannot open it | ✓ pass | 7/7 | 10 ms |
| prediction 5: the employer opens one line for the auditor; the auditor verifies it; nobody else can ask | ✓ pass | 4/4 | 6617 ms |
| prediction 6: the stateless checks answer on the VM | ✓ pass | 3/3 | 132 ms |
| prediction 6: teardown of the chain side (members exit with their remainders, group pruned, accounts deleted) | ✓ pass | 2/2 | 35677 ms |
| prediction 6: teardown: delete the VM and prove the account is empty | ✓ pass | 3/3 | 5574 ms |

### preflight: the Phala account is empty and the compose file is pinned with the escrow settings

- ✓ no CVM is already running on the account
- ✓ the compose file is pinned to a CI-built image digest
- ✓ the compose file carries the escrow settings and requires signed inputs
- ✓ the compose file is pinned to an image digest
- ✓ a production OS image hash is pinned
- observed **instance type and rate**: `{"type":"tdx.small","usdPerHour":0.058}`

### prediction 1: deploy on a real TDX VM and verify the attestation as a member would

- note: deploying midge-lab-11111023
- evidence cvm: {"id":"539132c042a3b1937bd5418fe8299fd964160534","url":"https://539132c042a3b1937bd5418fe8299fd964160534-8080.dstack-pha1-prod5.phala.network","deadmanHours":1}
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
- evidence attestation: {"composeHash":"73f42e651241e1480858b1b87ea5e5c3e7763611e175615d86632f763a603e2c","osImageHash":"ec43cb8c5e04b6bb6c53b33b16076a01d83d01f7f4b703f2f78a0d947d6247e6"}

### set up: an employer, three payees, tax and benefits accounts, and a group whose room key is the ATTESTED settlement key; the employer deposits 0.2

- ✓ the settlement key the contract will trust equals the attested one
- ✓ the group was hatched
- ✓ the employer deposited 0.2

### prediction 2: a line that differs from its invoice stops the run, names the mismatch, and the queue is kept

- observed **how the mismatch was refused**: `roost /payrun answered 400: [ROOST REJECT] invoice INV-p3 does not match the approved line: amount differs: invoice 0.03, approved 0.035; th…`
- ✓ the VM refused the run and named the invoice and the difference
- ✓ the employer's queued run was kept: asking again gives the same refusal, not "no pay run"

### prediction 3: after reopening the round, the corrected run settles with exact amounts on the production contract

- ✓ all three lines matched their invoices
- evidence tx: {"label":"settle_batch_charged pay run","hash":"6zY3nNrnrjMNRfGnGrtBkYSFjJg5BYCW5MU6ThabiGf9","ok":true,"explorer":"https://testnet.nearblocks.io/txns/6zY3nNrnrjMNRfGnGrtBkYSFjJg5BYCW5MU6ThabiGf9","error":null}
- ✓ the contract accepted the settlement the VM signed
- ✓ Alice's account received exactly 0.043
- ✓ Bo's account received exactly 0.034
- ✓ Cy's account received exactly 0.025
- ✓ the tax account received exactly 0.012
- ✓ the benefits account received exactly 0.006
- ✓ five transfers moved and nothing else
- ✓ the employer was charged exactly the gross total: 0.08 of 0.2 left
- ✓ the order hash in the settlement transaction on chain is the one the VM computed

### prediction 4: each payee opens their own statement; it carries their invoice hash and verifies against the on-chain order hash; another payee's key cannot open it

- ✓ Alice's statement verifies against the order hash found on chain
- ✓ Alice's receipt carries the hash of Alice's invoice
- ✓ Bo's statement verifies against the order hash found on chain
- ✓ Bo's receipt carries the hash of Bo's invoice
- ✓ Cy's statement verifies against the order hash found on chain
- ✓ Cy's receipt carries the hash of Cy's invoice
- ✓ one payee cannot open another's statement

### prediction 5: the employer opens one line for the auditor; the auditor verifies it; nobody else can ask

- ✓ the auditor verifies the pack against the order hash found on chain
- ✓ it holds exactly one line, Bo's
- ✓ it names no other person
- ✓ a request signed by anyone else is refused
- observed **how it was refused**: `roost /audit/open answered 400: [ROOST REJECT] ed25519:2jzmVRKkXZg7vMb4mxVqTGBRg3r1BmnTrHzH2XT2HEMR is not a key of prz1imaer.fly-1793636729…`

### prediction 6: the stateless checks answer on the VM

- ✓ pre-flight blocks a payment over the per-payment cap
- ✓ the invoice check passes for a matching approval
- ✓ and fails for a changed destination

### prediction 6: teardown of the chain side (members exit with their remainders, group pruned, accounts deleted)

- observed **teardown**: `{"pruned":1,"notPruned":[],"deleted":6,"kept":[],"failed":[]}`
- ✓ the group was pruned and every account deleted
- ✓ the contract holds the groups it started with

### prediction 6: teardown: delete the VM and prove the account is empty

- observed **teardown**: `{"deleted":true,"id":"539132c042a3b1937bd5418fe8299fd964160534","seconds":156,"estimatedUsd":0.0025}`
- ✓ the VM was deleted
- ✓ no CVM is left running on the account
- observed **estimated cost (USD)**: `0.0025`
- ✓ the session cost under $0.10

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
