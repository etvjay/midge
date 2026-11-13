# Lab run 20261113T084451Z-1582

- **Code:** `5e110f7b5d516e874c9d0680bb09a39b9efdb344` on `hw-maker-checker-blocktrade` (**1 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `29f58898aa3bf050…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 104 events, hash-chained; root `b9fcb3d75304416485ef0d17a8a010cb5c93093dbbda88cc7626eddf6dfa96cf`. Verify with `node lab/verify-run.js lab/runs/20261113T084451Z-1582`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-HOSTED-PAYRUN-LIVE-03 An employee pay run with maker-checker and an AI review on the real hardware room: no invoices, a planted mistake caught, a separate approver, exact transfers, payslips, an auditor pack, all saved as evidence | hardware | **PASS** | 12 | 64 |  |

## E-HOSTED-PAYRUN-LIVE-03: An employee pay run with maker-checker and an AI review on the real hardware room: no invoices, a planted mistake caught, a separate approver, exact transfers, payslips, an auditor pack, all saved as evidence

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. The attested reviewer catches a planted line with no tax withheld; the corrected run waits for a separate approver, refuses a stranger's approval, and then settles with exact amounts on the production contract; the private lines add up to the public transfers; receipts and an auditor pack verify against the order hash read from the chain; and everything a page needs to show this is saved as evidence.

**What this does not prove**
- One operator controls every account and the VM. This is the system working on real hardware, not independent parties.
- Every payment's address and amount is public on NEAR once settled: this hides who a payee is, not how much.
- The planted mistake is planted: it shows the reviewer catching a kind of mistake its brief names, not that it would catch every real one.
- The throwaway keys that open the receipts were made for this run and are saved as evidence on purpose; they hold nothing and exist only on testnet.

| Step | Result | Assertions | Time |
|---|---|---|---|
| preflight: the Phala account is empty, the compose file is pinned, and the NEAR AI key is present | ✓ pass | 5/5 | 2512 ms |
| prediction 1: deploy on a real TDX VM and verify the attestation as a member would | ✓ pass | 16/16 | 49185 ms |
| set up: an employer, a separate approver, four employees, tax and benefits accounts, and a group whose room key is the ATTESTED settlement key; the employer deposits 0.25 | ✓ pass | 3/3 | 36753 ms |
| prediction 2: before approval, the attested reviewer catches the planted mistake, from a request with nothing identifying in it | ✓ pass | 4/4 | 7580 ms |
| prediction 3: the corrected run waits for its approver; a stranger cannot approve it; the approver checks the summary and approves | ✓ pass | 5/5 | 1876 ms |
| prediction 4: the approved run settles with exact amounts on the production contract | ✓ pass | 10/10 | 4538 ms |
| prediction 5: the private lines in the employer's statement add up to the public transfers on chain | ✓ pass | 4/4 | 354 ms |
| prediction 6: each employee's payslip verifies against the order hash read from the chain; a changed or foreign one fails | ✓ pass | 6/6 | 17 ms |
| prediction 7: the employer opens one line for the auditor; the auditor verifies it; nobody else can ask | ✓ pass | 4/4 | 619 ms |
| prediction 8: everything a page needs to show this run is saved as evidence | ✓ pass | 2/2 | 1 ms |
| prediction 9: teardown of the chain side (members exit with their remainders, group pruned, accounts deleted) | ✓ pass | 2/2 | 47433 ms |
| prediction 9: teardown: delete the VM and prove the account is empty | ✓ pass | 3/3 | 5846 ms |

### preflight: the Phala account is empty, the compose file is pinned, and the NEAR AI key is present

- ✓ no CVM is already running on the account
- ✓ the compose file is pinned to a CI-built image digest and requires signed inputs
- ✓ the pinned digest is the one built from the merge that added the programs (76dd150f)
- ✓ a production OS image hash is pinned
- ✓ a NEAR AI Cloud key is present
- observed **instance type and rate**: `{"type":"tdx.small","usdPerHour":0.058}`

### prediction 1: deploy on a real TDX VM and verify the attestation as a member would

- note: deploying midge-lab-11130844
- evidence cvm: {"id":"dc35c1d1cbbfc7668de0aece798c847c0bc2d940","url":"https://dc35c1d1cbbfc7668de0aece798c847c0bc2d940-8080.dstack-pha1-prod9.phala.network","deadmanHours":1}
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

### set up: an employer, a separate approver, four employees, tax and benefits accounts, and a group whose room key is the ATTESTED settlement key; the employer deposits 0.25

- ✓ the settlement key the contract will trust equals the attested one
- ✓ the group was hatched
- ✓ the employer deposited 0.25

### prediction 2: before approval, the attested reviewer catches the planted mistake, from a request with nothing identifying in it

- observed **attempts**: `1`
- ✓ the reviewer's reply parsed in the fixed shape
- ✓ the planted mistake (line A, no tax withheld) is caught, with a finding the code verifies
- ✓ the request contains none of the names, one-time addresses, invoice ids or exact amounts
- ✓ the model's receipt verifies (signature, key, attestation, hashes)
- evidence review: {"attempts":1,"cyLabel":"A","labels":{"Alice":"C","Bo":"B","Cy":"A","Dee":"D"},"rules":"Tax is a flat 15 percent of gross, withheld on every line. Employee benefits are capped at 5 percent of gross. All lines are for the…

### prediction 3: the corrected run waits for its approver; a stranger cannot approve it; the approver checks the summary and approves

- ✓ the run says it needs the approver's sign-off
- ✓ the room refuses to sign before the approval
- ✓ an approval signed with a key that is not the approver's is refused
- ✓ the approver's sealed summary matches the run (order hash, four people, gross 0.18, the transfers)
- ✓ the approver's own approval is accepted

### prediction 4: the approved run settles with exact amounts on the production contract

- evidence tx: {"label":"settle_batch_charged pay run","hash":"FsGJK3yo3cUSUNBEpwsGdJ9CRVxRxpRn42EwAVb6GYpd","ok":true,"explorer":"https://testnet.nearblocks.io/txns/FsGJK3yo3cUSUNBEpwsGdJ9CRVxRxpRn42EwAVb6GYpd","error":null}
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

### prediction 6: each employee's payslip verifies against the order hash read from the chain; a changed or foreign one fails

- ✓ Alice's statement verifies against the order hash found on chain
- ✓ Bo's statement verifies against the order hash found on chain
- ✓ Cy's statement verifies against the order hash found on chain
- ✓ Dee's statement verifies against the order hash found on chain
- ✓ a receipt with the net raised to 0.05 fails verification
- ✓ one payee cannot open another's statement

### prediction 7: the employer opens one line for the auditor; the auditor verifies it; nobody else can ask

- ✓ the auditor verifies the pack against the order hash found on chain
- ✓ it holds exactly one line, Bo's
- ✓ it names no other person
- ✓ a request signed by anyone else is refused
- observed **how it was refused**: `roost /audit/open answered 400: [ROOST REJECT] ed25519:28LWxSaQRQPhmS9dwKXVyaedyWEDTZTsb6xXieCxF7xv is not a key of p3qdy61er.fly-1793636729…`

### prediction 8: everything a page needs to show this run is saved as evidence

- evidence paper-trail: {"runId":"run-mweqdy61","orderHash":"1e9f1aaa40b00bb49f0b2aa21efdbd9245214bad6e753e054e86255d558df520","settleTx":"FsGJK3yo3cUSUNBEpwsGdJ9CRVxRxpRn42EwAVb6GYpd","settlePublicKey":"2b16d16915ba46da987c43cf5f3dd0c080773516…
- ✓ the evidence holds four receipts, the employer statement, the pack and the totals view
- ✓ the review evidence was recorded

### prediction 9: teardown of the chain side (members exit with their remainders, group pruned, accounts deleted)

- observed **teardown**: `{"pruned":1,"notPruned":[],"deleted":8,"kept":[],"failed":[]}`
- ✓ the group was pruned and every account deleted
- ✓ the contract holds the groups it started with

### prediction 9: teardown: delete the VM and prove the account is empty

- observed **teardown**: `{"deleted":true,"id":"dc35c1d1cbbfc7668de0aece798c847c0bc2d940","seconds":152,"estimatedUsd":0.0024}`
- ✓ the VM was deleted
- ✓ no CVM is left running on the account
- observed **estimated cost (USD)**: `0.0024`
- ✓ the session cost under $0.10

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
