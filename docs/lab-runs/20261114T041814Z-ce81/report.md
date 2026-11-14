# Lab run 20261114T041814Z-ce81

- **Code:** `139611f92809ea3712d73ff9be97089987a73b7a` on `playground` (**17 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `6bf6e4ecc506c941…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 59 events, hash-chained; root `980447e73bd4ed8dc4240c2568d45f289713466d971aba60b861ff4a14ef958c`. Verify with `node lab/verify-run.js lab/runs/20261114T041814Z-ce81`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-PLAYGROUND-LOCAL-01 The playground end to end on real testnet with the real NEAR AI Cloud model, a scripted visitor using the browser code, and a room run in this process with a simulated attestation | testnet | **PASS** | 9 | 32 |  |

## E-PLAYGROUND-LOCAL-01: The playground end to end on real testnet with the real NEAR AI Cloud model, a scripted visitor using the browser code, and a room run in this process with a simulated attestation

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. The live model catches a planted line with no tax withheld and its signed receipt verifies in the browser code; the gate refuses a round after one edit and allows it after a new review; the room accepts the approval signed by the visitor's own key and refuses a stranger's; the contract settles with exact amounts and the visitor's own account holds its net pay; the payslip verifies against the order hash read from the chain and fails when the net is raised; and every service-held account and the group are gone afterwards.

**What this does not prove**
- The room runs in this process with a simulated attestation provider, so this is not a hardware claim. E-PLAYGROUND-LIVE-01 runs the same flow against the deployed service and the real attested room.
- The main account of the lab funds the run, as in every lab experiment. In production a dedicated funder account does.
- The scripted visitor uses the same browser modules as the page, but it is not a browser. The page is checked separately.
- The planted mistake is planted: it shows the reviewer catching a kind of mistake its instructions name, not every real one.

| Step | Result | Assertions | Time |
|---|---|---|---|
| preflight: the NEAR AI key is present and the main account can pay for a round | ✓ pass | 2/2 | 263 ms |
| set up: a room in this process, and the playground service pointed at it | ✓ pass | 1/1 | 242 ms |
| prediction 1: the live model catches the planted line, and its signed receipt verifies with the browser code | ✓ pass | 4/4 | 7105 ms |
| prediction 2: one edit closes the gate, a new review of the corrected lines opens it | ✓ pass | 3/3 | 3927 ms |
| prediction 3: the round reaches the approval step, the room refuses a stranger's approval and accepts the visitor's own | ✓ pass | 6/6 | 26454 ms |
| prediction 4: the contract settles with exact amounts and the visitor's own account holds its net pay | ✓ pass | 4/4 | 4657 ms |
| prediction 5: the payslip verifies against the order hash read from the chain, and fails when the net is raised or opened with the wrong key | ✓ pass | 5/5 | 1369 ms |
| prediction 6: every service-held account and the group are gone, the ledger is empty, and the contract holds the groups it started with | ✓ pass | 4/4 | 16814 ms |
| teardown: stop the service and the room, and the visitor deletes their own account | ✓ pass | 3/3 | 2627 ms |

### preflight: the NEAR AI key is present and the main account can pay for a round

- ✓ a NEAR AI Cloud key is present
- observed **main account balance (NEAR)**: `9.605`
- ✓ the main account holds at least 3 NEAR

### set up: a room in this process, and the playground service pointed at it

- ✓ the service proxies the room's public keys

### prediction 1: the live model catches the planted line, and its signed receipt verifies with the browser code

- evidence review: {"used":true,"findings":[{"line":"A","code":"zero-deduction","severity":"warn","note":"Tax is 0 percent, but rules say tax is withheld on every line.","check":"verified"}],"labels":["C","B","A","D"],"receipt":{"model":"Q…
- ✓ the review ran
- ✓ it found a verified finding on Cy's line (no tax withheld)
- ✓ what was sent to the model holds no name, no exact amount
- ✓ the model's signed receipt verifies with the browser code

### prediction 2: one edit closes the gate, a new review of the corrected lines opens it

- ✓ a round for lines that were edited after the review is refused with 403
- ✓ the corrected lines are reviewed
- ✓ and then a round is accepted

### prediction 3: the round reaches the approval step, the room refuses a stranger's approval and accepts the visitor's own

- evidence approval: {"approver":"peb6fa91bv.fly-1793636729.testnet","orderHash":"068407b8239ae5d570e093ac1c25e399c354a47ae66b4f2d580b47a7e8276308","cast":[{"role":"you","name":"Dee","id":"peb6fa91bv.fly-1793636729.testnet"},{"role":"er","na…
- ✓ the approval message names the contract, the group and the order hash
- ✓ the summary sealed to the visitor opens with the visitor's payslip key and matches the order hash
- ✓ the message built from the contract id and the round's fields is the one the service sent
- ✓ another session with the ticket cannot read the round
- ✓ an approval signed with a key that is not the approver's is refused by the room
- ✓ the visitor's own approval is accepted

### prediction 4: the contract settles with exact amounts and the visitor's own account holds its net pay

- evidence tx: {"label":"playground settlement","hash":"4QZQsJd9jp9DjfP6o3r68tdu7z3btRQRbFtbZ2XHfgoA","ok":true,"explorer":"https://testnet.nearblocks.io/txns/4QZQsJd9jp9DjfP6o3r68tdu7z3btRQRbFtbZ2XHfgoA"}
- evidence result: {"visitorAccount":"peb6fa91bv.fly-1793636729.testnet","orderHash":"068407b8239ae5d570e093ac1c25e399c354a47ae66b4f2d580b47a7e8276308","cast":[{"role":"you","name":"Dee","id":"peb6fa91bv.fly-1793636729.testnet"},{"role":"e…
- ✓ the visitor received exactly Dee's net, 0.048 NEAR
- ✓ the tax account received 0.0270 and the benefits account 0.0090 in one transfer each
- ✓ there are six transfers in all: the tax, the benefits and four employees
- ✓ the visitor's own account holds its 0.01 starting balance plus 0.048

### prediction 5: the payslip verifies against the order hash read from the chain, and fails when the net is raised or opened with the wrong key

- ✓ the order hash read from the settlement transaction is the one the room returned
- ✓ the browser's live check of the settlement agrees across two providers
- ✓ the visitor's payslip verifies and carries net 0.048
- ✓ a payslip with the net raised to 0.058 fails
- ✓ a payslip opened with another key fails

### prediction 6: every service-held account and the group are gone, the ledger is empty, and the contract holds the groups it started with

- ✓ the employer, the three other employees, the tax and the benefits accounts are deleted
- ✓ the visitor's account is still there
- ✓ the ledger is empty
- ✓ the contract holds the groups it started with

### teardown: stop the service and the room, and the visitor deletes their own account

- ✓ nothing is left in the ledger after the final sweep
- ✓ the contract holds the groups it started with
- ✓ the visitor's account was deleted with its key, returning the balance to the main account

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
