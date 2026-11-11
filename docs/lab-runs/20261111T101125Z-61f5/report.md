# Lab run 20261111T101125Z-61f5

- **Code:** `cd55a54a43fa1bd0ac2225f9e0596234bf20c05c` on `gap050-pin` (**3 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `99a59326369ec75f…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 62 events, hash-chained; root `b828ee42b7f974fe1cda4cfa8bb9fedf47351db288ce4d791a13954d4dc48e2a`. Verify with `node lab/verify-run.js lab/runs/20261111T101125Z-61f5`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-HOSTED-PAYRUN-LIVE-01 A pay run with payee-signed invoices and an employer-authorised auditor pack on the real hardware room, settled on the production contract | hardware | **FAIL** | 10 | 26 |  |

## E-HOSTED-PAYRUN-LIVE-01: A pay run with payee-signed invoices and an employer-authorised auditor pack on the real hardware room, settled on the production contract

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. A mismatched invoice stops the run; a corrected run settles with exact amounts; receipts carry their invoice hash and verify against the on-chain order hash; the auditor sees only the line the employer opens; the stateless checks answer on the VM.

**What this does not prove**
- One operator controls every account and the VM. This is the system working on real hardware, not independent parties.
- Every payment's address and amount is public on NEAR once settled: this hides who a payee is, not how much.
- The coordinator holds the key that triggers a run. Only NEAR payments are made from the hardware room here; foreign-chain payments go through the contract and have their own experiment.
- The VM exists for the length of the session and is deleted; no hosted room is running.

| Step | Result | Assertions | Time |
|---|---|---|---|
| preflight: the Phala account is empty and the compose file is pinned with the escrow settings | ✓ pass | 5/5 | 2317 ms |
| prediction 1: deploy on a real TDX VM and verify the attestation as a member would | ✓ pass | 16/16 | 53765 ms |
| set up: an employer, three payees, tax and benefits accounts, and a group whose room key is the ATTESTED settlement key; the employer deposits 0.2 | ✗ fail | 1/1 | 12175 ms |
| prediction 2: a line that differs from its invoice stops the run, names the mismatch, and the queue is kept | – skip | 0/0 | 0 ms |
| prediction 3: after reopening the round, the corrected run settles with exact amounts on the production contract | – skip | 0/0 | 0 ms |
| prediction 4: each payee opens their own statement; it carries their invoice hash and verifies against the on-chain order hash; another payee's key cannot open it | – skip | 0/0 | 0 ms |
| prediction 5: the employer opens one line for the auditor; the auditor verifies it; nobody else can ask | – skip | 0/0 | 0 ms |
| prediction 6: the stateless checks answer on the VM | – skip | 0/0 | 0 ms |
| prediction 6: teardown of the chain side (members exit with their remainders, group pruned, accounts deleted) | ✓ pass | 1/1 | 0 ms |
| prediction 6: teardown: delete the VM and prove the account is empty | ✓ pass | 3/3 | 5222 ms |

### preflight: the Phala account is empty and the compose file is pinned with the escrow settings

- ✓ no CVM is already running on the account
- ✓ the compose file is pinned to a CI-built image digest
- ✓ the compose file carries the escrow settings and requires signed inputs
- ✓ the compose file is pinned to an image digest
- ✓ a production OS image hash is pinned
- observed **instance type and rate**: `{"type":"tdx.small","usdPerHour":0.058}`

### prediction 1: deploy on a real TDX VM and verify the attestation as a member would

- note: deploying midge-lab-11111011
- evidence cvm: {"id":"6eb0dfbe56e8274e146e83eb91567f0d4b7ee2c8","url":"https://6eb0dfbe56e8274e146e83eb91567f0d4b7ee2c8-8080.dstack-pha1-prod9.phala.network","deadmanHours":1}
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

### prediction 2: a line that differs from its invoice stops the run, names the mismatch, and the queue is kept

- skipped: an earlier critical step failed

### prediction 3: after reopening the round, the corrected run settles with exact amounts on the production contract

- skipped: an earlier critical step failed

### prediction 4: each payee opens their own statement; it carries their invoice hash and verifies against the on-chain order hash; another payee's key cannot open it

- skipped: an earlier critical step failed

### prediction 5: the employer opens one line for the auditor; the auditor verifies it; nobody else can ask

- skipped: an earlier critical step failed

### prediction 6: the stateless checks answer on the VM

- skipped: an earlier critical step failed

### prediction 6: teardown of the chain side (members exit with their remainders, group pruned, accounts deleted)

- ✓ nothing to tear down

### prediction 6: teardown: delete the VM and prove the account is empty

- observed **teardown**: `{"deleted":true,"id":"6eb0dfbe56e8274e146e83eb91567f0d4b7ee2c8","seconds":69,"estimatedUsd":0.0011}`
- ✓ the VM was deleted
- ✓ no CVM is left running on the account
- observed **estimated cost (USD)**: `0.0011`
- ✓ the session cost under $0.10

## Problems found

| Severity | Where | Problem |
|---|---|---|
| critical | E-HOSTED-PAYRUN-LIVE-01 / set up: an employer, three payees, tax and benefits accounts, and a group whose room key is the ATTESTED settlement key; the employer deposits 0.2 | step threw: Not enough balance for fly-1793636729.testnet (balance: 367957307119570196185902, cost: 407607442456250000000000) — {"stack":["NotEnoughBalanceError: Not enough balance for fly-1793636729.testnet (balance: 367957307119570196185902, cost: 407607442456250000000000)","    at parseInvalidTransactionError (file:///home/… |
