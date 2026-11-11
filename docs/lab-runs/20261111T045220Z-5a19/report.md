# Lab run 20261111T045220Z-5a19

- **Code:** `3ca1af61386fd76230a88ee22371415b2c102240` on `gap-closure` (**2 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `edd3ff37e9a64d22…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 45 events, hash-chained; root `16bd68bcf15b61dd10a1be64b21447a1dc2daa65d27b33e7340203ce126d326a`. Verify with `node lab/verify-run.js lab/runs/20261111T045220Z-5a19`

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
| prediction 1: the keys are the contract's, and the group is funded | ✓ pass | 6/6 | 1713 ms |
| prediction 2: an in-rules Solana payment is requested by the contract, signed, lands, and the payee gains exactly the amount | ✓ pass | 4/4 | 8787 ms |
| prediction 3: an in-rules Ethereum payment is requested by the contract, recovers to the contract-derived address, lands | ✓ pass | 4/4 | 20957 ms |
| prediction 4: the contract's books moved by exactly what was paid, and both obligations are marked signed | ✓ pass | 4/4 | 809 ms |
| prediction 5: four out-of-rules requests are each refused with their own reason, and the totals do not move | ✓ pass | 5/5 | 9207 ms |

### prediction 1: the keys are the contract's, and the group is funded

- ✓ the group exists on the test contract (run npm run verify:contract-payroll once if not)
- ✓ the contract holds the group's foreign policy
- ✓ the Solana address derived for the contract differs from the one for our own account with the same path
- ✓ the Ethereum address derived for the contract differs from the one for our own account with the same path
- ✓ the Solana group address holds enough for a payment
- ✓ the Ethereum group address holds enough for a payment

### prediction 2: an in-rules Solana payment is requested by the contract, signed, lands, and the payee gains exactly the amount

- evidence near: {"nearTx":"wjNwDQTWLJQdaLBAtqZr2HViUELCkKQ4cAr6ndNzbvG","ok":true}
- ✓ the contract accepted the room-signed request and returned a signature
- ✓ the signature verifies against the contract-derived Solana key over the message rebuilt here independently
- evidence solana: {"signature":"5NXv1Q8XjP8AoaUkoSaW5LqhdFPfAVz5yHrUwtuHDwRX7tjYvW1TsWmsKkCh48wXkfX5ahAcvz8awx8bYmLP7MGT","status":"finalized","err":null}
- ✓ the transaction landed on Solana devnet without error
- ✓ the payee gained exactly the amount

### prediction 3: an in-rules Ethereum payment is requested by the contract, recovers to the contract-derived address, lands

- evidence near: {"nearTx":"ATeLL7QWuEVkPdME58NdAsLXE8ru9eX4PiGZe1BuYaZR","ok":true}
- ✓ the contract accepted the room-signed request and returned a signature
- ✓ the signature recovers to the contract-derived Ethereum address over the digest ethers computes independently
- evidence sepolia: {"hash":"0x5cc161f703c9ded1a293dec3644ae2348a459e7351941156e2736731010fd590","block":12109498,"status":1}
- ✓ the transaction landed on Sepolia with status 1
- ✓ the payee gained exactly the amount

### prediction 4: the contract's books moved by exactly what was paid, and both obligations are marked signed

- ✓ the Solana payee's running total rose by exactly the amount
- ✓ the Ethereum payee's running total rose by exactly the amount
- ✓ obligation exp-sol-mwbn784o is recorded as signed
- ✓ obligation exp-eth-mwbn784o is recorded as signed

### prediction 5: four out-of-rules requests are each refused with their own reason, and the totals do not move

- evidence refusal: {"label":"an unlisted payee","nearTx":null,"error":"Smart contract panicked: [Foreign REJECT] payee is not allowed on this chain"}
- ✓ refused: an unlisted payee
- evidence refusal: {"label":"an amount over the per-payment cap","nearTx":null,"error":"Smart contract panicked: panicked at src/lib.rs:1793:9:\n[Foreign REJECT] amount is over the per-payment cap"}
- ✓ refused: an amount over the per-payment cap
- evidence refusal: {"label":"a reused obligation id","nearTx":null,"error":"Smart contract panicked: panicked at src/lib.rs:1782:9:\n[Foreign REJECT] obligation exp-sol-mwbn784o was already requested"}
- ✓ refused: a reused obligation id
- evidence refusal: {"label":"a request the room did not sign (amount changed after signing)","nearTx":null,"error":"Smart contract panicked: panicked at src/lib.rs:1779:9:\n[HAQ REJECT] Invalid enclave Ed25519 signature over foreign paymen…
- ✓ refused: a request the room did not sign (amount changed after signing)
- ✓ the recorded totals did not move

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
