# Lab run 20261114T051812Z-0955

- **Code:** `2e7d97b4b5451337f0107af1987513d76d4371eb` on `live-run2` (**2 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `6bf6e4ecc506c941…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 77 events, hash-chained; root `5cf5d343b4138d34111545de59b41b51b65beccd8563cf6d3c18dd7952afd4ba`. Verify with `node lab/verify-run.js lab/runs/20261114T051812Z-0955`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-PLAYGROUND-LIVE-01 The deployed playground end to end: the service wakes the stopped hardware room, the room's attestation verifies, and a scripted visitor using the browser code reviews, approves, is paid on testnet and checks the payslip | hardware | **PASS** | 10 | 47 |  |

## E-PLAYGROUND-LIVE-01: The deployed playground end to end: the service wakes the stopped hardware room, the room's attestation verifies, and a scripted visitor using the browser code reviews, approves, is paid on testnet and checks the payslip

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. The same flow as E-PLAYGROUND-LOCAL-01 holds against the deployed service and the real attested room, after the room has been stopped and woken by the service, with the room's attestation verifying as in the other hardware runs.

**What this does not prove**
- One operator runs the service, the room and every account. This is the system working on real hardware, not independent parties.
- The scripted visitor uses the page's modules but is not a browser. The page is checked separately, by scripts/playground-smoke.mjs and by hand against the deployed site.
- The funder-low refusal is covered offline (E-PLAYGROUND-SERVICE-01) and was not forced here, because that would mean spending the funder down on purpose.
- The planted mistake is planted: it shows the reviewer catching a kind of mistake its instructions name, not every real one.

| Step | Result | Assertions | Time |
|---|---|---|---|
| preflight: the deployed service is named and answers, and the room it wakes is a machine we can stop and start | ✓ pass | 3/3 | 351 ms |
| prediction 1: with the room stopped, opening the page wakes it and it becomes healthy within about 150 seconds | ✓ pass | 3/3 | 48615 ms |
| prediction 2: the woken room's attestation verifies as in the other hardware runs, and its settlement key is the one the service hands out | ✓ pass | 15/15 | 5180 ms |
| prediction 1: the live model catches the planted line, and its signed receipt verifies with the browser code | ✓ pass | 4/4 | 8033 ms |
| prediction 2: one edit closes the gate, a new review of the corrected lines opens it | ✓ pass | 3/3 | 4812 ms |
| prediction 3: the round reaches the approval step, the room refuses a stranger's approval and accepts the visitor's own | ✓ pass | 6/6 | 79709 ms |
| prediction 4: the contract settles with exact amounts and the visitor's own account holds its net pay | ✓ pass | 4/4 | 7247 ms |
| prediction 5: the payslip verifies against the order hash read from the chain, and fails when the net is raised or opened with the wrong key | ✓ pass | 5/5 | 713 ms |
| prediction 6: every service-held account and the group are gone, the ledger is empty, and the contract holds the groups it started with | ✓ pass | 3/3 | 36480 ms |
| teardown: the verifier stops, and the visitor deletes their own account | ✓ pass | 1/1 | 2332 ms |

### preflight: the deployed service is named and answers, and the room it wakes is a machine we can stop and start

- ✓ the service address (PLAYGROUND_URL) and the room's machine id (ROOM_CVM_ID) and address (ROOM_URL) are set
- ✓ the service answers its health check
- ✓ the main account holds at least 0.5 NEAR, which this experiment needs to delete the visitor's account

### prediction 1: with the room stopped, opening the page wakes it and it becomes healthy within about 150 seconds

- ✓ the room machine was stopped
- ✓ the warm call answers at once, without waiting for the room
- observed **seconds from the warm call to a healthy room**: `40`
- ✓ the room is healthy again within 150 seconds of being asked

### prediction 2: the woken room's attestation verifies as in the other hardware runs, and its settlement key is the one the service hands out

- ✓ Phala's app-compose contains our room compose file byte for byte
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
- ✓ the room does not claim to be a simulator
- ✓ the settlement key the service hands out is the attested one
- evidence attestation: {"composeHash":"6bf6e4ecc506c9417fbd4b83736066a4aea79a8786b0a295f222dbe02fb483b6","osImageHash":"ec43cb8c5e04b6bb6c53b33b16076a01d83d01f7f4b703f2f78a0d947d6247e6"}

### prediction 1: the live model catches the planted line, and its signed receipt verifies with the browser code

- evidence review: {"used":true,"findings":[{"line":"A","code":"zero-deduction","severity":"warn","note":"Tax is 0 percent, but rules state tax is withheld on every line.","check":"verified"},{"line":"A","code":"rate-outlier","severity":"i…
- ✓ the review ran
- ✓ it found a verified finding on Cy's line (no tax withheld)
- ✓ what was sent to the model holds no name, no exact amount
- ✓ the model's signed receipt verifies with the browser code

### prediction 2: one edit closes the gate, a new review of the corrected lines opens it

- ✓ a round for lines that were edited after the review is refused with 403
- ✓ the corrected lines are reviewed
- ✓ and then a round is accepted

### prediction 3: the round reaches the approval step, the room refuses a stranger's approval and accepts the visitor's own

- evidence approval: {"approver":"p3dd39fd8v.play.fly-1793636729.testnet","orderHash":"d5590c03b6480d986909f022f6fb1c7b32bdfae32a02bb5c85df785420158414","cast":[{"role":"you","name":"Dee","id":"p3dd39fd8v.play.fly-1793636729.testnet"},{"role…
- ✓ the approval message names the contract, the group and the order hash
- ✓ the summary sealed to the visitor opens with the visitor's payslip key and matches the order hash
- ✓ the message built from the contract id and the round's fields is the one the service sent
- ✓ another session with the ticket cannot read the round
- ✓ an approval signed with a key that is not the approver's is refused by the room
- ✓ the visitor's own approval is accepted

### prediction 4: the contract settles with exact amounts and the visitor's own account holds its net pay

- evidence tx: {"label":"playground settlement","hash":"A9fmWEoCWqTKR1jXcMdHawqNbn5reKpsKvB8LypNW1L6","ok":true,"explorer":"https://testnet.nearblocks.io/txns/A9fmWEoCWqTKR1jXcMdHawqNbn5reKpsKvB8LypNW1L6"}
- evidence result: {"visitorAccount":"p3dd39fd8v.play.fly-1793636729.testnet","orderHash":"d5590c03b6480d986909f022f6fb1c7b32bdfae32a02bb5c85df785420158414","cast":[{"role":"you","name":"Dee","id":"p3dd39fd8v.play.fly-1793636729.testnet"},…
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
- ✓ the contract holds the groups it started with

### teardown: the verifier stops, and the visitor deletes their own account

- ✓ the visitor's account was deleted with its key, returning the balance to the main account

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
