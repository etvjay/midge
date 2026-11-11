# Lab run 20261111T052928Z-c176

- **Code:** `303694cfec24e9a589a9dafbd904709f73b28c3d` on `signed-inputs-image` (**7 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `223b105261c3b481…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 45 events, hash-chained; root `cffcbf53414bfb4119d9b6e1dfce410c49600955217cbfd7f06bfb1730d17a0c`. Verify with `node lab/verify-run.js lab/runs/20261111T052928Z-c176`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-CONTRACT-FOREIGN-LIVE-01 The Midge contract, not a script, asks the NEAR MPC signer for foreign payments after checking the group's rules: Solana devnet and Ethereum Sepolia payments land, out-of-rules requests are refused | testnet | **PASS** | 5 | 23 |  |

## E-CONTRACT-FOREIGN-LIVE-01: The Midge contract, not a script, asks the NEAR MPC signer for foreign payments after checking the group's rules: Solana devnet and Ethereum Sepolia payments land, out-of-rules requests are refused

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. Needs the test contract m.<account> deployed (node scripts/deploy-rules-contract.mjs) and the group payroll-live-1 created and funded once (npm run verify:contract-payroll).

**What this does not prove**
- One operator controls the room key (a test key, not a hosted Roost), the contract and the payees.
- The contract is a test deployment (m.<account>); production c.<account> is not upgraded.
- Money at the group's foreign addresses is outside the NEAR escrow, so a member's exit does not reach it.
- Solana devnet and Ethereum Sepolia only; nothing is sent on Bitcoin. The signer failing mid-request is covered by a unit test, not here.

| Step | Result | Assertions | Time |
|---|---|---|---|
| prediction 1: the keys are the contract's, and the group is funded | ✓ pass | 6/6 | 1750 ms |
| prediction 2: an in-rules Solana payment is requested by the contract, signed, lands, and the payee gains exactly the amount | ✓ pass | 4/4 | 8929 ms |
| prediction 3: an in-rules Ethereum payment is requested by the contract, recovers to the contract-derived address, lands | ✓ pass | 4/4 | 33838 ms |
| prediction 4: the contract's books moved by exactly what was paid, and both obligations are marked signed | ✓ pass | 4/4 | 811 ms |
| prediction 5: four out-of-rules requests are each refused with their own reason, and the totals do not move | ✓ pass | 5/5 | 9787 ms |

### prediction 1: the keys are the contract's, and the group is funded

- ✓ the group exists on the test contract (run npm run verify:contract-payroll once if not)
- ✓ the contract holds the group's foreign policy
- ✓ the Solana address derived for the contract differs from the one for our own account with the same path
- ✓ the Ethereum address derived for the contract differs from the one for our own account with the same path
- ✓ the Solana group address holds enough for a payment
- ✓ the Ethereum group address holds enough for a payment

### prediction 2: an in-rules Solana payment is requested by the contract, signed, lands, and the payee gains exactly the amount

- evidence near: {"nearTx":"3H84hwwTrp3JnGG3NQGwcAaeMVBECfUkr4V9W9QiBtQ6","ok":true}
- ✓ the contract accepted the room-signed request and returned a signature
- ✓ the signature verifies against the contract-derived Solana key over the message rebuilt here independently
- evidence solana: {"signature":"51GJgy4F5eDzAogtwj5Y4w8woSUwfJUL2j92QRtiUAnDpxYYVMg2aC1GHFeTaDMmM1ZwgbEhXepbru3GzvKFDZSX","status":"finalized","err":null}
- ✓ the transaction landed on Solana devnet without error
- ✓ the payee gained exactly the amount

### prediction 3: an in-rules Ethereum payment is requested by the contract, recovers to the contract-derived address, lands

- evidence near: {"nearTx":"9V8t8udG5qoqSNYgbBMJbLDSZyDwKykrs3fwDn8mjYNx","ok":true}
- ✓ the contract accepted the room-signed request and returned a signature
- ✓ the signature recovers to the contract-derived Ethereum address over the digest ethers computes independently
- evidence sepolia: {"hash":"0x5e5af02fa9f3a261d0b5e9dde457a8768c9dd16b0b2222c5a2f02690bd312763","block":12109679,"status":1}
- ✓ the transaction landed on Sepolia with status 1
- ✓ the payee gained exactly the amount

### prediction 4: the contract's books moved by exactly what was paid, and both obligations are marked signed

- ✓ the Solana payee's running total rose by exactly the amount
- ✓ the Ethereum payee's running total rose by exactly the amount
- ✓ obligation exp-sol-mwboizf6 is recorded as signed
- ✓ obligation exp-eth-mwboizf6 is recorded as signed

### prediction 5: four out-of-rules requests are each refused with their own reason, and the totals do not move

- evidence refusal: {"label":"an unlisted payee","nearTx":null,"error":"Smart contract panicked: [Foreign REJECT] payee is not allowed on this chain"}
- ✓ refused: an unlisted payee
- evidence refusal: {"label":"an amount over the per-payment cap","nearTx":null,"error":"Smart contract panicked: panicked at src/lib.rs:1944:9:\n[Foreign REJECT] amount is over the per-payment cap"}
- ✓ refused: an amount over the per-payment cap
- evidence refusal: {"label":"a reused obligation id","nearTx":null,"error":"Smart contract panicked: panicked at src/lib.rs:1926:9:\n[Foreign REJECT] obligation exp-sol-mwboizf6 was already requested"}
- ✓ refused: a reused obligation id
- evidence refusal: {"label":"a request the room did not sign (amount changed after signing)","nearTx":null,"error":"Smart contract panicked: panicked at src/lib.rs:1920:9:\n[HAQ REJECT] Invalid enclave Ed25519 signature over foreign paymen…
- ✓ refused: a request the room did not sign (amount changed after signing)
- ✓ the recorded totals did not move

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
