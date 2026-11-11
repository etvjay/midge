# Lab run 20261111T162605Z-def8

- **Code:** `337ad4824dd7ac656cb901587b80e78e26b093b5` on `completeness` (**5 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `73f42e651241e148…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 42 events, hash-chained; root `9a737a478cb6e945b373a6b570cc224e1399ffd135f6ddb598288fbd943e1db8`. Verify with `node lab/verify-run.js lab/runs/20261111T162605Z-def8`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-FOREIGN-SIGNER-FAIL-LIVE-01 A signer call that fails mid-request, live: the reservation and the obligation are released, the same obligation id works again with the real signer | testnet | **PASS** | 7 | 20 |  |

## E-FOREIGN-SIGNER-FAIL-LIVE-01: A signer call that fails mid-request, live: the reservation and the obligation are released, the same obligation id works again with the real signer

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. Runs on the TEST copy of the contract deployed with the test-signer-override feature build. Pointing the signer at an account that does not exist makes the cross-contract call fail; the callback releases the reservation; the same obligation id is accepted again with the real signer and its signature verifies.

**What this does not prove**
- Runs on the TEST copy of the contract deployed with a feature build (test-signer-override) that production does not contain; it shows the contract's behaviour when a cross-contract call fails, not the real MPC network failing.
- The Solana path only; the Ethereum path shares the same callback. A failure arriving after the window has rolled is covered by unit tests.
- One operator controls the room key, the contract and the payee.

| Step | Result | Assertions | Time |
|---|---|---|---|
| set up: the test copy runs the test-signer-override build (the default build is put back at the end) | ✓ pass | 4/4 | 9643 ms |
| set up: a group with a foreign policy (one Solana payee, 2,000,000 per payment and in total, window 100 blocks), its address funded | ✓ pass | 1/1 | 3867 ms |
| prediction 1: only the contract's own account may point the signer elsewhere | ✓ pass | 4/4 | 4688 ms |
| prediction 2: a failing signer releases the reservation and the obligation | ✓ pass | 4/4 | 4537 ms |
| prediction 3: with the real signer the same obligation id is accepted again, and its signature verifies | ✓ pass | 4/4 | 7923 ms |
| teardown: the default build is put back on the test copy | ✓ pass | 2/2 | 6647 ms |
| teardown: the owner removes the unfunded group | ✓ pass | 1/1 | 1141 ms |

### set up: the test copy runs the test-signer-override build (the default build is put back at the end)

- ✓ the feature build exists (build it with: npm run build:wasm:testsigner)
- ✓ the feature build is not the production build
- evidence deploy: {"account":"m.fly-1793636729.testnet","featureBuild":"Fsa5uNhmY4Pdopq53GAooeiMnVQ9N6yXYZPnUtPxUZLS","defaultBuild":"3dGAu1yG9gaZbMTXWX3eYjN8mVM2LUyQR8Czu9W1vg1C"}
- ✓ a leftover override from an earlier failed run was repaired
- ✓ the test copy has get_test_signer and it now points at no other signer

### set up: a group with a foreign policy (one Solana payee, 2,000,000 per payment and in total, window 100 blocks), its address funded

- ✓ the group exists with its foreign policy

### prediction 1: only the contract's own account may point the signer elsewhere

- evidence tx: {"label":"set_test_signer from the main account","hash":"B1zLuS3XM9Fgi4kWQ1pgc3H2gZerjDPHjMW43mByyBuC","ok":false,"error":"Smart contract panicked: panicked at src/lib.rs:2349:9:\nassertion `left == right` failed: [Test …
- ✓ a call from our main account is refused
- ✓ the refused call changed nothing
- ✓ a call from the contract's own account is accepted
- ✓ the signer now points at an account that does not exist

### prediction 2: a failing signer releases the reservation and the obligation

- ✓ before: nothing is reserved and the obligation does not exist
- evidence near: {"nearTx":"3HPND5u3LTbYPCqKN5ikUSJc36AEDfpDiyyECmUEMzhj","ok":false,"error":"[{\"Failure\":{\"ActionError\":{\"index\":0,\"kind\":{\"AccountDoesNotExist\":{\"account_id\":\"nosigner-mwcbze8r.fly-1793636729.testnet\"}}}}}…
- ✓ the request's final result carries no signature (the signer call failed)
- ✓ after the callback: the obligation is gone
- ✓ after the callback: the reserved total is back to 0

### prediction 3: with the real signer the same obligation id is accepted again, and its signature verifies

- ✓ the signer was pointed back at the real one
- evidence near: {"nearTx":"dZMGFL7QzV7XdNnhL7D7BqRuPcnwdSXFZsHgP2ztVNC","ok":true}
- ✓ the same obligation id for the same 2,000,000 was accepted (it would be refused if the failed reservation had leaked or the id had been burned)
- ✓ its signature verifies against the address derived from the group's signer path
- ✓ the obligation is recorded and signed, and 2,000,000 is reserved

### teardown: the default build is put back on the test copy

- ✓ the test copy runs the default build again
- ✓ and the test method is gone

### teardown: the owner removes the unfunded group

- ✓ the group was pruned

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
