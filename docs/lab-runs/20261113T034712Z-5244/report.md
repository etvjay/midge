# Lab run 20261113T034712Z-5244

- **Code:** `ccf4ec5999aa5f91ec66690e1625ceeb502fe03e` on `browser-client` (**1 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `29f58898aa3bf050…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 107 events, hash-chained; root `5712342c72f1e0d7adb079d08f574cd3c0fb6079113170c895b2a92e4a6fe147`. Verify with `node lab/verify-run.js lab/runs/20261113T034712Z-5244`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-HOSTED-PAYRUN-LIVE-02 A pay run with an AI review that catches a planted mistake, on the real hardware room: four payees, a refused mismatch, exact transfers, receipts, an auditor pack, all saved as evidence | hardware | **PASS** | 12 | 66 |  |

## E-HOSTED-PAYRUN-LIVE-02: A pay run with an AI review that catches a planted mistake, on the real hardware room: four payees, a refused mismatch, exact transfers, receipts, an auditor pack, all saved as evidence

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. A mismatched invoice stops the run; the attested reviewer catches a planted line with no tax withheld, which the invoice check cannot see; the corrected run settles with exact amounts on the production contract; the private lines add up to the public transfers; receipts and an auditor pack verify against the order hash read from the chain; and everything a page needs to show this is saved as evidence.

**What this does not prove**
- One operator controls every account and the VM. This is the system working on real hardware, not independent parties.
- Every payment's address and amount is public on NEAR once settled: this hides who a payee is, not how much.
- The planted mistake is planted: it shows the reviewer catching a kind of mistake its brief names, not that it would catch every real one.
- The throwaway keys that open the receipts were made for this run and are saved as evidence on purpose; they hold nothing and exist only on testnet.

| Step | Result | Assertions | Time |
|---|---|---|---|
| preflight: the Phala account is empty, the compose file is pinned, and the NEAR AI key is present | ✓ pass | 5/5 | 2670 ms |
| prediction 1: deploy on a real TDX VM and verify the attestation as a member would | ✓ pass | 16/16 | 48980 ms |
| set up: an employer, four payees, tax and benefits accounts, and a group whose room key is the ATTESTED settlement key; the employer deposits 0.25 | ✓ pass | 3/3 | 34378 ms |
| prediction 2: a line that differs from its invoice stops the run, names the mismatch, and the queue is kept | ✓ pass | 2/2 | 3025 ms |
| prediction 3: the attested reviewer catches the planted mistake that the invoice check cannot see, from a request with nothing identifying in it | ✓ pass | 4/4 | 5745 ms |
| prediction 4: after the employer corrects Cy's tax and reopens the round, the run settles with exact amounts on the production contract | ✓ pass | 11/11 | 5427 ms |
| prediction 5: the private lines in the employer's statement add up to the public transfers on chain | ✓ pass | 4/4 | 215 ms |
| prediction 6: each payee's receipt verifies against the order hash read from the chain; a changed or foreign one fails | ✓ pass | 10/10 | 19 ms |
| prediction 7: the employer opens one line for the auditor; the auditor verifies it; nobody else can ask | ✓ pass | 4/4 | 660 ms |
| prediction 8: everything a page needs to show this run is saved as evidence | ✓ pass | 2/2 | 0 ms |
| prediction 9: teardown of the chain side (members exit with their remainders, group pruned, accounts deleted) | ✓ pass | 2/2 | 41963 ms |
| prediction 9: teardown: delete the VM and prove the account is empty | ✓ pass | 3/3 | 6179 ms |

### preflight: the Phala account is empty, the compose file is pinned, and the NEAR AI key is present

- ✓ no CVM is already running on the account
- ✓ the compose file is pinned to a CI-built image digest and requires signed inputs
- ✓ the pinned digest is the one built from the merge that added the programs (76dd150f)
- ✓ a production OS image hash is pinned
- ✓ a NEAR AI Cloud key is present
- observed **instance type and rate**: `{"type":"tdx.small","usdPerHour":0.058}`

### prediction 1: deploy on a real TDX VM and verify the attestation as a member would

- note: deploying midge-lab-11130347
- evidence cvm: {"id":"1ca398a0d27eb29145ba04b3e7dffad51b8fda0b","url":"https://1ca398a0d27eb29145ba04b3e7dffad51b8fda0b-8080.dstack-pha1-prod9.phala.network","deadmanHours":1}
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
- evidence attestation: {"composeHash":"29f58898aa3bf050246346985e4b7c8161c85aed4fdf19ff03a6dc4de0fc34a4","osImageHash":"ec43cb8c5e04b6bb6c53b33b16076a01d83d01f7f4b703f2f78a0d947d6247e6"}

### set up: an employer, four payees, tax and benefits accounts, and a group whose room key is the ATTESTED settlement key; the employer deposits 0.25

- ✓ the settlement key the contract will trust equals the attested one
- ✓ the group was hatched
- ✓ the employer deposited 0.25

### prediction 2: a line that differs from its invoice stops the run, names the mismatch, and the queue is kept

- observed **how the mismatch was refused**: `roost /payrun answered 400: [ROOST REJECT] invoice INV-p4 does not match the approved line: amount differs: invoice 0.06, approved 0.065; th…`
- ✓ the VM refused the run and named the invoice and the difference
- ✓ the employer's queued run was kept: asking again gives the same refusal, not "no pay run"

### prediction 3: the attested reviewer catches the planted mistake that the invoice check cannot see, from a request with nothing identifying in it

- observed **attempts**: `1`
- ✓ the reviewer's reply parsed in the fixed shape
- ✓ the planted mistake (line A, no tax withheld) is caught, with a finding the code verifies
- ✓ the request contains none of the names, one-time addresses, invoice ids or exact amounts
- ✓ the model's receipt verifies (signature, key, attestation, hashes)
- evidence review: {"attempts":1,"cyLabel":"A","labels":{"Alice":"C","Bo":"B","Cy":"A","Dee":"D"},"rules":"Tax is a flat 15 percent of gross, withheld on every line. Employee benefits are capped at 5 percent of gross. All lines are for the…

### prediction 4: after the employer corrects Cy's tax and reopens the round, the run settles with exact amounts on the production contract

- ✓ all four lines matched their invoices
- evidence tx: {"label":"settle_batch_charged pay run","hash":"C8owyMBuZi8tahf79HVJgXMbTddLK7tgqWaWSrj3W684","ok":true,"explorer":"https://testnet.nearblocks.io/txns/C8owyMBuZi8tahf79HVJgXMbTddLK7tgqWaWSrj3W684","error":null}
- ✓ the contract accepted the settlement the VM signed
- ✓ Alice's account received exactly 0.04
- ✓ Bo's account received exactly 0.032
- ✓ Cy's account received exactly 0.024
- ✓ Dee's account received exactly 0.048
- ✓ the tax account received exactly 0.027
- ✓ the benefits account received exactly 0.009
- ✓ six transfers moved and nothing else
- ✓ the employer was charged exactly the gross total: 0.07 of 0.25 left
- ✓ the order hash in the settlement transaction on chain is the one the VM computed

### prediction 5: the private lines in the employer's statement add up to the public transfers on chain

- ✓ the four tax lines add up to the one tax transfer on chain
- ✓ the four benefits lines add up to the one benefits transfer on chain
- ✓ each person's net equals the transfer to their one-time address
- ✓ the gross lines add up to what the employer was charged (0.18)

### prediction 6: each payee's receipt verifies against the order hash read from the chain; a changed or foreign one fails

- ✓ Alice's statement verifies against the order hash found on chain
- ✓ Alice's receipt carries the hash of Alice's invoice
- ✓ Bo's statement verifies against the order hash found on chain
- ✓ Bo's receipt carries the hash of Bo's invoice
- ✓ Cy's statement verifies against the order hash found on chain
- ✓ Cy's receipt carries the hash of Cy's invoice
- ✓ Dee's statement verifies against the order hash found on chain
- ✓ Dee's receipt carries the hash of Dee's invoice
- ✓ a receipt with the net raised to 0.05 fails verification
- ✓ one payee cannot open another's statement

### prediction 7: the employer opens one line for the auditor; the auditor verifies it; nobody else can ask

- ✓ the auditor verifies the pack against the order hash found on chain
- ✓ it holds exactly one line, Bo's
- ✓ it names no other person
- ✓ a request signed by anyone else is refused
- observed **how it was refused**: `roost /audit/open answered 400: [ROOST REJECT] ed25519:82n93LTRACSFrF9aBjw763BGAs6X2QBzcHE5aADyfPdS is not a key of p2fr5mqer.fly-1793636729…`

### prediction 8: everything a page needs to show this run is saved as evidence

- evidence paper-trail: {"runId":"run-mwefr5mq","orderHash":"b8559348b201c3d938b6a1336c1c3a31b91c56d6201585de0e7e648c03eaa0d7","settleTx":"C8owyMBuZi8tahf79HVJgXMbTddLK7tgqWaWSrj3W684","settlePublicKey":"6e9c8f13708725e2b3de6054dd788064146c4945…
- ✓ the evidence holds four receipts, the employer statement, the pack and the totals view
- ✓ the review evidence was recorded

### prediction 9: teardown of the chain side (members exit with their remainders, group pruned, accounts deleted)

- observed **teardown**: `{"pruned":1,"notPruned":[],"deleted":7,"kept":[],"failed":[]}`
- ✓ the group was pruned and every account deleted
- ✓ the contract holds the groups it started with

### prediction 9: teardown: delete the VM and prove the account is empty

- observed **teardown**: `{"deleted":true,"id":"1ca398a0d27eb29145ba04b3e7dffad51b8fda0b","seconds":144,"estimatedUsd":0.0023}`
- ✓ the VM was deleted
- ✓ no CVM is left running on the account
- observed **estimated cost (USD)**: `0.0023`
- ✓ the session cost under $0.10

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
