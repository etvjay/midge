# Lab run 20261111T094402Z-fb66

- **Code:** `d1bff8ca400d1a251811772a2f8551feae08eacc` on `payrun-hardware` (**2 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `99a59326369ec75f…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 32 events, hash-chained; root `c8ce1e4b1f8a3feb85983cebc06fcbbb4d80b561092845aca6f61d23ad3a0979`. Verify with `node lab/verify-run.js lab/runs/20261111T094402Z-fb66`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-FOREIGN-WINDOW-LIVE-01 The per-window foreign running total, live: inside the window the cap holds, after the window the allowance is back, and an obligation id stays burned | testnet | **PASS** | 5 | 16 |  |

## E-FOREIGN-WINDOW-LIVE-01: The per-window foreign running total, live: inside the window the cap holds, after the window the allowance is back, and an obligation id stays burned

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. A 100-block window: 1,500,000 lamports pass, a further 1,000,000 is refused, after the window the same request passes and lands, and the first obligation id is still refused.

**What this does not prove**
- Runs on the test copy of the contract (same code as production, a separate account), with the shortest window the contract allows.
- A signer call failing mid-request is not forced here; it is covered by unit tests only.
- Solana devnet only; one operator controls the room key, the contract and the payee.

| Step | Result | Assertions | Time |
|---|---|---|---|
| set up: a group with a foreign policy (one Solana payee, 2,000,000 per payment and in total, window 100 blocks), its address funded | ✓ pass | 2/2 | 13448 ms |
| prediction 1: inside the window 1,500,000 passes and lands, and a further 1,000,000 is refused for passing the running cap | ✓ pass | 6/6 | 12292 ms |
| prediction 2: after 100 blocks from the first reservation the allowance is back | ✓ pass | 1/1 | 51293 ms |
| prediction 3 and 4: the same request now passes and lands; the first obligation id is still burned | ✓ pass | 6/6 | 10882 ms |
| teardown: the owner removes the unfunded group | ✓ pass | 1/1 | 1518 ms |

### set up: a group with a foreign policy (one Solana payee, 2,000,000 per payment and in total, window 100 blocks), its address funded

- ✓ the group exists with its foreign policy
- ✓ the group's Solana address holds enough

### prediction 1: inside the window 1,500,000 passes and lands, and a further 1,000,000 is refused for passing the running cap

- ✓ the first payment was accepted by the contract
- ✓ first payment: the signature verifies against the address derived from the group's signer path
- evidence solana: {"label":"first payment","signature":"oxnNvby9L57TFkRNeCPe7gCikhzncFrPMgECwsMzEktr3riJypjiD2nrrC57A2GUTFmjSmMKbnF8gaqbSLBWyg4","status":"finalized","err":null,"nearTx":"6uRsZzpsvwaeRtsd2u2dRN2NPrGWS7reg2w7qmnLKgXa"}
- ✓ first payment: the transaction landed on Solana devnet
- ✓ first payment: the payee gained exactly the amount
- ✓ the further 1,000,000 was refused for passing the running cap in this window
- ✓ get_foreign_spent still reads 1,500,000

### prediction 2: after 100 blocks from the first reservation the allowance is back

- ✓ get_foreign_spent reads 0 once the window has ended

### prediction 3 and 4: the same request now passes and lands; the first obligation id is still burned

- ✓ the 1,000,000 request that was refused is accepted now
- ✓ second payment: the signature verifies against the address derived from the group's signer path
- evidence solana: {"label":"second payment","signature":"5ntQ8oWL8jNUrbRMgR7kxtkbdijtjcenPYDr6199zXWyh21xKmwCnj9uFYj4XLfjHr4yveEFr3MhcXDmS8fm9c5r","status":"finalized","err":null,"nearTx":"684GVroaStp7nHtxefAupNUe2skFGdXcQ5Bj2WoGWmrK"}
- ✓ second payment: the transaction landed on Solana devnet
- ✓ second payment: the payee gained exactly the amount
- ✓ get_foreign_spent reads 1,000,000, not 2,500,000: the new window holds only the new reservation
- ✓ re-sending the first obligation id is still refused

### teardown: the owner removes the unfunded group

- ✓ the group was pruned

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
