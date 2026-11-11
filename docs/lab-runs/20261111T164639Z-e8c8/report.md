# Lab run 20261111T164639Z-e8c8

- **Code:** `6a8d8965ec79c16cb1474c36feccc6e7d288072a` on `completeness` (**7 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `73f42e651241e148…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 256 events, hash-chained; root `1746dc7796d393b3a69bb7c5eb8d3b9ff8da33d8530cd02088765f6af088e6e4`. Verify with `node lab/verify-run.js lab/runs/20261111T164639Z-e8c8`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-FOREIGN-SIGNER-FAIL-LIVE-01 A signer call that fails mid-request, live: the reservation and the obligation are released, the same obligation id works again with the real signer | testnet | **PASS** | 7 | 19 |  |
| E-CHAIN-ROUND-LOCAL A full syndicate round on NEAR testnet against a local hosted Roost | testnet | **PASS** | 15 | 55 |  |
| E-IFACE-CHAIN The MCP server, the SDK and the API drive the real contract on NEAR testnet, end to end | testnet | **PASS** | 6 | 52 |  |

## E-FOREIGN-SIGNER-FAIL-LIVE-01: A signer call that fails mid-request, live: the reservation and the obligation are released, the same obligation id works again with the real signer

**Hypothesis.** Predictions are in docs/lab/PROGRAMME_PLAN.md, committed before this file existed. Runs on the TEST copy of the contract deployed with the test-signer-override feature build. Pointing the signer at an account that does not exist makes the cross-contract call fail; the callback releases the reservation; the same obligation id is accepted again with the real signer and its signature verifies.

**What this does not prove**
- Runs on the TEST copy of the contract deployed with a feature build (test-signer-override) that production does not contain; it shows the contract's behaviour when a cross-contract call fails, not the real MPC network failing.
- The Solana path only; the Ethereum path shares the same callback. A failure arriving after the window has rolled is covered by unit tests.
- One operator controls the room key, the contract and the payee.

| Step | Result | Assertions | Time |
|---|---|---|---|
| set up: the test copy runs the test-signer-override build (the default build is put back at the end) | ✓ pass | 3/3 | 7697 ms |
| set up: a group with a foreign policy (one Solana payee, 2,000,000 per payment and in total, window 100 blocks), its address funded | ✓ pass | 1/1 | 3688 ms |
| prediction 1: only the contract's own account may point the signer elsewhere | ✓ pass | 4/4 | 5146 ms |
| prediction 2: a failing signer releases the reservation and the obligation | ✓ pass | 4/4 | 4162 ms |
| prediction 3: with the real signer the same obligation id is accepted again, and its signature verifies | ✓ pass | 4/4 | 9504 ms |
| teardown: the default build is put back on the test copy | ✓ pass | 2/2 | 9326 ms |
| teardown: the owner removes the unfunded group | ✓ pass | 1/1 | 1806 ms |

### set up: the test copy runs the test-signer-override build (the default build is put back at the end)

- ✓ the feature build exists (build it with: npm run build:wasm:testsigner)
- ✓ the feature build is not the production build
- evidence deploy: {"account":"m.fly-1793636729.testnet","featureBuild":"DAPfRNQVg4AmDYVd3D6yWfAGyCGjPtdTXP7uHGk5fMzZ","defaultBuild":"BVcq86Wz5Q3kcdBdcUhfQVfQtC6CmGwcXuMd52aW6gTp"}
- ✓ the test copy has get_test_signer and it now points at no other signer

### set up: a group with a foreign policy (one Solana payee, 2,000,000 per payment and in total, window 100 blocks), its address funded

- ✓ the group exists with its foreign policy

### prediction 1: only the contract's own account may point the signer elsewhere

- evidence tx: {"label":"set_test_signer from the main account","hash":"AyNFb22AKfGYCUarq4fMrw8xujPMckJX2EWXmSKgt3FV","ok":false,"error":"Smart contract panicked: panicked at src/lib.rs:2356:9:\nassertion `left == right` failed: [Test …
- ✓ a call from our main account is refused
- ✓ the refused call changed nothing
- ✓ a call from the contract's own account is accepted
- ✓ the signer now points at an account that does not exist

### prediction 2: a failing signer releases the reservation and the obligation

- ✓ before: nothing is reserved and the obligation does not exist
- evidence near: {"nearTx":"5aCiWESbPBjabdpTQVrrdLKHnmCBsDYTaanekHSMxLDY","ok":false,"error":"[{\"Failure\":{\"ActionError\":{\"index\":0,\"kind\":{\"AccountDoesNotExist\":{\"account_id\":\"nosigner-mwccpu8f.fly-1793636729.testnet\"}}}}}…
- ✓ the request's final result carries no signature (the signer call failed)
- ✓ after the callback: the obligation is gone
- ✓ after the callback: the reserved total is back to 0

### prediction 3: with the real signer the same obligation id is accepted again, and its signature verifies

- ✓ the signer was pointed back at the real one
- evidence near: {"nearTx":"HmFN8e6RCahFM1KKmYbSUnz2Dh81uKeskjn3sQenrtnS","ok":true}
- ✓ the same obligation id for the same 2,000,000 was accepted (it would be refused if the failed reservation had leaked or the id had been burned)
- ✓ its signature verifies against the address derived from the group's signer path
- ✓ the obligation is recorded and signed, and 2,000,000 is reserved

### teardown: the default build is put back on the test copy

- ✓ the test copy runs the default build again
- ✓ and the test method is gone

### teardown: the owner removes the unfunded group

- ✓ the group was pruned

## E-CHAIN-ROUND-LOCAL: A full syndicate round on NEAR testnet against a local hosted Roost

**Hypothesis.** A syndicate hatched with a hosted Roost's settlement key can be funded, can aggregate sealed bids exactly, and is settled on chain only by that Roost for allocations its own aggregate supports. A replay, a payout outside the policy and a signature from another key are all rejected on chain without moving funds, and members can always take their own money back with hatch_out when the Roost stalls.

**What this does not prove**
- The Roost runs on this machine with a simulated attestation provider, so this proves the CHAIN LOGIC and the Roost's signing rules. It proves nothing about hardware: see E-HOSTED-LIVE-01 for a real TDX VM.
- All members, the coordinator and the recipient are controlled by one operator with keys derived from one master key. It shows the contract's rules, not independent users acting independently.
- Testnet only, one run on one date. The contract has not been audited by a third party.
- Rejections are shown by on-chain state staying unchanged, not by matching the contract's error text.

| Step | Result | Assertions | Time |
|---|---|---|---|
| create fresh member accounts for this run (three flyers and a recipient) | ✓ pass | 1/1 | 9331 ms |
| preflight: accounts, balances and deployed contract | ✓ pass | 4/4 | 1755 ms |
| hatch a syndicate whose settlement key is the Roost's | ✓ pass | 2/2 | 2371 ms |
| members deposit with explicit consent to the policy hash | ✓ pass | 5/5 | 6807 ms |
| members seal bids; the Roost aggregates them exactly | ✓ pass | 2/2 | 216 ms |
| ATTACK 1: the Roost refuses to sign more than the sealed bids support | ✓ pass | 1/1 | 200 ms |
| settle on chain with the Roost's signature | ✓ pass | 4/4 | 3885 ms |
| ATTACK 2: replaying the same signed settlement is rejected | ✓ pass | 2/2 | 2183 ms |
| ATTACK 3: a valid Roost signature cannot pay a recipient outside the policy | ✓ pass | 5/5 | 9104 ms |
| ATTACK 4: a settlement signed by a different key is rejected | ✓ pass | 2/2 | 2475 ms |
| cleanup: settle syndicate #2 legitimately with the real Roost | ✓ pass | 2/2 | 3578 ms |
| ATTACK 5: a partial settlement cannot be replayed, and the next round needs a fresh signature | ✓ pass | 11/11 | 13890 ms |
| the Roost stalls: a member takes their own funds back with hatch_out | ✓ pass | 7/7 | 18015 ms |
| ledger: every transaction, and what the experiment cost | ✓ pass | 2/2 | 1046 ms |
| teardown: prune the finished syndicates, compact the indexes, delete the accounts back into the master | ✓ pass | 5/5 | 30450 ms |

### create fresh member accounts for this run (three flyers and a recipient)

- ✓ four accounts exist and are funded
- observed **accounts**: `["lcqq4ra.fly-1793636729.testnet","lcqq4rb.fly-1793636729.testnet","lcqq4rc.fly-1793636729.testnet","lcqq4rr.fly-1793636729.testnet"]`

### preflight: accounts, balances and deployed contract

- observed **balances (NEAR)**: `{"fly-1793636729.testnet":"10.6569","lcqq4ra.fly-1793636729.testnet":"0.1482","lcqq4rb.fly-1793636729.testnet":"0.1482","lcqq4rc.fly-1793636…`
- note: Measured: a full round costs about 0.002 NEAR net, because unused prepaid gas is refunded. The balance needed is the temporary peak: a deposit (up to 0.03) plus prepaid gas (up to 0.06 at current testnet gas prices).
- ✓ every member has enough testnet NEAR for the peak of this experiment (0.09 each)
- ✓ the master account can pay for hatching (0.1 NEAR)
- observed **deployed code hash**: `BVcq86Wz5Q3kcdBdcUhfQVfQtC6CmGwcXuMd52aW6gTp`
- ✓ the deployed contract is the build expected from the wasm built from this checkout
- observed **contract account storage**: `{"balance":"6.1369","bytesUsed":571955,"headroomNear":"0.4173"}`
- ✓ the contract account has at least 0.15 NEAR of storage headroom (each syndicate record costs about 0.01)

### hatch a syndicate whose settlement key is the Roost's

- evidence tx: {"label":"hatch lab-mwccqq4r-1","hash":"B7hP2SRWNq1VXq5D5nV9pFVaFtJfN5cKjqGH3Q3osfuL","ok":true,"explorer":"https://testnet.nearblocks.io/txns/B7hP2SRWNq1VXq5D5nV9pFVaFtJfN5cKjqGH3Q3osfuL","gasTGas":2.825980199941,"error…
- ✓ hatch succeeded on chain
- observed **syndicate state**: `{"status":"Active","epoch":1,"flyers":0}`
- ✓ the syndicate is active

### members deposit with explicit consent to the policy hash

- evidence tx: {"label":"deposit lcqq4ra.fly-1793636729.testnet -> lab-mwccqq4r-1","hash":"Gn8HQBJ5j1A1sK62wmHFVnWFwf27ywHyfUrp7H6FcEBN","ok":true,"explorer":"https://testnet.nearblocks.io/txns/Gn8HQBJ5j1A1sK62wmHFVnWFwf27ywHyfUrp7H6Fc…
- ✓ lcqq4ra.fly-1793636729.testnet deposited 0.02 NEAR
- evidence tx: {"label":"deposit lcqq4rb.fly-1793636729.testnet -> lab-mwccqq4r-1","hash":"ALit7v5WVHBRJ5B6aqbf3HQT7hg7UfWTCYT2dfNn9Er8","ok":true,"explorer":"https://testnet.nearblocks.io/txns/ALit7v5WVHBRJ5B6aqbf3HQT7hg7UfWTCYT2dfNn9…
- ✓ lcqq4rb.fly-1793636729.testnet deposited 0.02 NEAR
- evidence tx: {"label":"deposit lcqq4rc.fly-1793636729.testnet -> lab-mwccqq4r-1","hash":"6UEH1ibnhzM6yy9NuQwZ7qXCzDmAqAXvArgCRSnUq4iL","ok":true,"explorer":"https://testnet.nearblocks.io/txns/6UEH1ibnhzM6yy9NuQwZ7qXCzDmAqAXvArgCRSnUq…
- ✓ lcqq4rc.fly-1793636729.testnet deposited 0.02 NEAR
- ✓ escrow equals the three deposits exactly
- ✓ three active flyers

### members seal bids; the Roost aggregates them exactly

- observed **aggregate**: `{"totalInputAmount":"0.06","flyerCount":3,"excludedFlyers":[],"executionModel":"HOSTED_EXACT_BATCH","confidentiality":"simulated","timestamp…`
- ✓ the total is exactly 0.06
- ✓ three bids counted and none excluded

### ATTACK 1: the Roost refuses to sign more than the sealed bids support

- ✓ over-allocation is refused by the Roost

### settle on chain with the Roost's signature

- evidence tx: {"label":"settle_batch lab-mwccqq4r-1","hash":"ArWEe1QpkMzaNXwZ5eFJJ1U7HMPUTCEEVLz2n3Ym2BTP","ok":true,"explorer":"https://testnet.nearblocks.io/txns/ArWEe1QpkMzaNXwZ5eFJJ1U7HMPUTCEEVLz2n3Ym2BTP","gasTGas":7.473139204878…
- ✓ settle_batch succeeded
- observed **recipient balance change (NEAR)**: `0.06`
- ✓ the syndicate is Settled
- ✓ the recipient received exactly the escrow
- ✓ the escrow is empty

### ATTACK 2: replaying the same signed settlement is rejected

- evidence tx: {"label":"REPLAY settle_batch lab-mwccqq4r-1","hash":"G5i7dwo11DkGi3NGJYDTMMA4KSSBrYwwQbw24fPbZv3M","ok":false,"explorer":"https://testnet.nearblocks.io/txns/G5i7dwo11DkGi3NGJYDTMMA4KSSBrYwwQbw24fPbZv3M","gasTGas":0,"err…
- observed **contract answer**: `Smart contract panicked: panicked at src/lib.rs:964:9:
assertion `left == right` failed: [HAQ REJECT] Syndicate is not active.
  left: Settl…`
- ✓ the replay failed
- ✓ the recipient balance did not change

### ATTACK 3: a valid Roost signature cannot pay a recipient outside the policy

- evidence tx: {"label":"hatch lab-mwccqq4r-2","hash":"EDQPbfiLdxbMhgrEohS8m45sLcYd2RrwgzdHEkhwy7Zs","ok":true,"explorer":"https://testnet.nearblocks.io/txns/EDQPbfiLdxbMhgrEohS8m45sLcYd2RrwgzdHEkhwy7Zs","gasTGas":2.838156961951,"error…
- ✓ hatch #2 succeeded
- evidence tx: {"label":"deposit lcqq4ra.fly-1793636729.testnet -> lab-mwccqq4r-2","hash":"3mL6ob1NWG9NnydsYXfKRrbUkujdjsoKAVvGYjmU13G2","ok":true,"explorer":"https://testnet.nearblocks.io/txns/3mL6ob1NWG9NnydsYXfKRrbUkujdjsoKAVvGYjmU1…
- ✓ lcqq4ra.fly-1793636729.testnet deposited 0.02
- evidence tx: {"label":"deposit lcqq4rb.fly-1793636729.testnet -> lab-mwccqq4r-2","hash":"137tUsnoaMwgHKt8y8yBeGEgUZs1L2ngBiQeLEqghBdh","ok":true,"explorer":"https://testnet.nearblocks.io/txns/137tUsnoaMwgHKt8y8yBeGEgUZs1L2ngBiQeLEqgh…
- ✓ lcqq4rb.fly-1793636729.testnet deposited 0.02
- evidence tx: {"label":"settle_batch lab-mwccqq4r-2","hash":"2fQinaDakUaDsaoaSnxWxx2LkpM1AcuT4RoKktFs6TLr","ok":false,"explorer":"https://testnet.nearblocks.io/txns/2fQinaDakUaDsaoaSnxWxx2LkpM1AcuT4RoKktFs6TLr","gasTGas":0,"error":"Sm…
- observed **contract answer**: `Smart contract panicked: panicked at src/lib.rs:1023:13:
[Settle REJECT] Recipient thief-mwccqq4r.testnet is not in allowed_recipients white…`
- ✓ the contract rejected a payout to an unapproved recipient
- ✓ the syndicate is still active with the escrow intact

### ATTACK 4: a settlement signed by a different key is rejected

- evidence tx: {"label":"settle_batch lab-mwccqq4r-2","hash":"85daDxA3p4j224kskvkenfgA5LRznijnghBPhq97DWVE","ok":false,"explorer":"https://testnet.nearblocks.io/txns/85daDxA3p4j224kskvkenfgA5LRznijnghBPhq97DWVE","gasTGas":0,"error":"Sm…
- observed **contract answer**: `Smart contract panicked: panicked at src/lib.rs:1156:17:
[HAQ REJECT] Invalid enclave Ed25519 signature over deliberation batch!`
- ✓ the contract rejected a signature from a key it was not hatched with
- ✓ nothing moved

### cleanup: settle syndicate #2 legitimately with the real Roost

- evidence tx: {"label":"settle_batch lab-mwccqq4r-2","hash":"4CNQLKEESW8nSKUmuz8HgfpCPv3nayQnojta6xWXcMWy","ok":true,"explorer":"https://testnet.nearblocks.io/txns/4CNQLKEESW8nSKUmuz8HgfpCPv3nayQnojta6xWXcMWy","gasTGas":7.276739579191…
- ✓ the legitimate settlement succeeded after the failed attacks
- ✓ syndicate #2 is Settled

### ATTACK 5: a partial settlement cannot be replayed, and the next round needs a fresh signature

- evidence tx: {"label":"hatch lab-mwccqq4r-4","hash":"FVGiYhPTByBT9a3bHsmPgsXn8C6LfMHkbSrjuT1uRq1s","ok":true,"explorer":"https://testnet.nearblocks.io/txns/FVGiYhPTByBT9a3bHsmPgsXn8C6LfMHkbSrjuT1uRq1s","gasTGas":2.841152840017,"error…
- ✓ hatch #4 succeeded
- evidence tx: {"label":"deposit lcqq4ra.fly-1793636729.testnet -> lab-mwccqq4r-4","hash":"5EnF961Mnk6y1vs9ZpejvhDx2t6nsbD811qGs6jWXw6y","ok":true,"explorer":"https://testnet.nearblocks.io/txns/5EnF961Mnk6y1vs9ZpejvhDx2t6nsbD811qGs6jWX…
- ✓ f1 deposited 0.03
- evidence tx: {"label":"settle_batch lab-mwccqq4r-4","hash":"E8sJNMH8n72zW3dBMGZjUBVWuGknAJTvcu9wpWj2KTca","ok":true,"explorer":"https://testnet.nearblocks.io/txns/E8sJNMH8n72zW3dBMGZjUBVWuGknAJTvcu9wpWj2KTca","gasTGas":7.131468229616…
- ✓ the partial settlement (0.01 of 0.03) succeeded
- ✓ 0.02 is left and the syndicate is still active
- ✓ the round nonce rotated after the partial settlement
- ✓ it is still epoch 1 (a Flash syndicate does not start new epochs)
- evidence tx: {"label":"REPLAY settle_batch lab-mwccqq4r-4 (partial)","hash":"FGptAqCRbNMhi1vNRrU9yDUwkoekSarrBjQaNnkijRnf","ok":false,"explorer":"https://testnet.nearblocks.io/txns/FGptAqCRbNMhi1vNRrU9yDUwkoekSarrBjQaNnkijRnf","gasTG…
- observed **contract answer**: `Smart contract panicked: panicked at src/lib.rs:991:9:
assertion `left == right` failed: [HAQ REJECT] Nonce mismatch. Replay attack blocked.…`
- ✓ the replay of the partial settlement failed
- ✓ the escrow is unchanged by the replay
- ✓ the recipient received nothing from the replay
- evidence tx: {"label":"settle_batch lab-mwccqq4r-4","hash":"4zTRkWCVwDeTt3HEPE2aWdhuRb86R3gipujuwHtbsz2M","ok":true,"explorer":"https://testnet.nearblocks.io/txns/4zTRkWCVwDeTt3HEPE2aWdhuRb86R3gipujuwHtbsz2M","gasTGas":7.105120436929…
- ✓ a fresh signature on the new nonce settles the rest
- ✓ syndicate #4 is Settled with no escrow left

### the Roost stalls: a member takes their own funds back with hatch_out

- evidence tx: {"label":"hatch lab-mwccqq4r-3","hash":"6QkK3zynEKaBLE1Z1E1hnFrb1P5xowmfQXGbKPynqFsY","ok":true,"explorer":"https://testnet.nearblocks.io/txns/6QkK3zynEKaBLE1Z1E1hnFrb1P5xowmfQXGbKPynqFsY","gasTGas":2.844026950195,"error…
- ✓ hatch #3 (timeout 10 blocks, the floor) succeeded
- evidence tx: {"label":"deposit lcqq4rb.fly-1793636729.testnet -> lab-mwccqq4r-3","hash":"8epBRVkw9f6m4dg6fuCS31S6A554wYkrYEoLzV6bG5A","ok":true,"explorer":"https://testnet.nearblocks.io/txns/8epBRVkw9f6m4dg6fuCS31S6A554wYkrYEoLzV6bG5…
- ✓ f2 deposited 0.03
- evidence tx: {"label":"hatch_out lab-mwccqq4r-3","hash":"CJhU13cLjR6PUX6KqbX75W6jSjYRNVz3kpSMLvbATHbv","ok":true,"explorer":"https://testnet.nearblocks.io/txns/CJhU13cLjR6PUX6KqbX75W6jSjYRNVz3kpSMLvbATHbv","gasTGas":5.633243547577,"e…
- ✓ hatch_out succeeded without any operator or enclave signature
- ✓ the escrow is empty and the syndicate is aborted/refunded
- observed **transfers made by the contract in this transaction**: `[{"to":"lcqq4rb.fly-1793636729.testnet","near":"0.03"}]`
- observed **transfers made by the system (gas refunds, not the contract)**: `["0.000201","0.002649"]`
- ✓ the contract made exactly one transfer
- ✓ it went to the member who called hatch_out
- ✓ and it was exactly the 0.03 NEAR they deposited (no more, no less)
- note: Balance deltas were rejected as evidence here: gas refunds from earlier transactions land after a reading is taken and made a correct refund look like a double payment. The receipts above are authoritative.

### ledger: every transaction, and what the experiment cost

- observed **transactions sent**: `20`
- observed **transactions that failed (expected: the 3 attack attempts)**: `["REPLAY settle_batch lab-mwccqq4r-1","settle_batch lab-mwccqq4r-2","settle_batch lab-mwccqq4r-2","REPLAY settle_batch lab-mwccqq4r-4 (parti…`
- ✓ exactly the four attack attempts failed on chain
- observed **net NEAR spent across all accounts (gas and storage)**: `0.00248`
- ✓ the whole experiment cost less than 0.02 NEAR net (measured previously: about 0.002)

### teardown: prune the finished syndicates, compact the indexes, delete the accounts back into the master

- observed **teardown**: `{"pruned":4,"notPruned":[],"compacted":4,"deleted":4,"failed":[]}`
- ✓ every syndicate the run created was pruned (all were Settled or AbortedRefunded)
- ✓ all four accounts were deleted
- ✓ none of them exists any more
- ✓ the contract holds exactly as many syndicate records as before the run (the run left no state behind)
- observed **net cost to the master account (NEAR)**: `0.03424`
- ✓ the whole run cost the master account less than 0.05 NEAR net

## E-IFACE-CHAIN: The MCP server, the SDK and the API drive the real contract on NEAR testnet, end to end

**Hypothesis.** An agent using only the MCP tools (or the SDK through the API) can hatch a syndicate with a real Roost key, deposit, settle with the Roost's signature, and exit with hatch_out, and the chain shows exactly what the interface reported. Replaying a partial settlement through the interface is rejected. The failure that must NOT happen: an interface that reports a transaction it did not make, or cannot make the transaction its own documentation describes.

**What this does not prove**
- The Roost is a local HostedRoost with a simulated attestation provider: this tests the interfaces and the chain, not hardware.
- The interface account is the repository's master testnet account; one operator is every party. Recipients and the depositor are accounts the operator controls.
- Hatch, deposit and settle go through the chain client; the API's hatch and deposit routes still use the in-memory model (GAP-016) and are not driven here. Only the API's chain-backed routes are.
- Testnet only, one date. The contract has not been audited by a third party.

| Step | Result | Assertions | Time |
|---|---|---|---|
| preflight: write access, deployed contract, balances, storage headroom | ✓ pass | 6/6 | 4618 ms |
| MCP: hatch with the Roost's key, deposit, settle with its signature | ✓ pass | 13/13 | 11772 ms |
| MCP: a partial settlement cannot be replayed, the next needs a fresh signature | ✓ pass | 7/7 | 14675 ms |
| MCP: the non-custodial exit (hatch_out) refunds exactly the deposit | ✓ pass | 5/5 | 20930 ms |
| SDK through the API in chain mode: reads, settle and hatch-out reach the chain | ✓ pass | 17/17 | 32735 ms |
| teardown: stop the daemon, prune the run's syndicates, compact the master's index, delete the recipient | ✓ pass | 4/4 | 21582 ms |

### preflight: write access, deployed contract, balances, storage headroom

- ✓ the MCP server is in chain mode and can write
- ✓ the interface account is the lab's master account
- ✓ the deployed contract is the build expected from the wasm built from this checkout
- observed **interface account balance (NEAR)**: `11.2511`
- ✓ the interface account has at least 0.25 NEAR (an attempt costs about 0.07)
- ✓ the contract account has at least 0.15 NEAR of storage headroom
- ✓ a fresh recipient account exists

### MCP: hatch with the Roost's key, deposit, settle with its signature

- evidence mcp: {"tool":"midge_hatch_syndicate","ok":false,"error":"[FlyChainClient] hatch needs enclavePublicKey: the Roost's 32-byte Ed25519 settlement public key as 64 hex characters (not all zeros). Without it the syndicate could ne…
- ✓ hatching without an enclave key is refused before any transaction (a keyless syndicate could never settle)
- evidence mcp: {"tool":"midge_hatch_syndicate","ok":true,"status":"HATCHED_ON_CHAIN","txHash":"7s7f3HNGpBSmV5p2PY9ADTtMD7EzyJes71XEoGAmbzqU","explorer":"https://testnet.nearblocks.io/txns/7s7f3HNGpBSmV5p2PY9ADTtMD7EzyJes71XEoGAmbzqU"}
- ✓ midge_hatch_syndicate reports HATCHED_ON_CHAIN with a transaction hash
- ✓ the chain shows the Roost's settlement key
- ✓ the chain shows the allowed recipient the agent asked for
- evidence mcp: {"tool":"midge_deposit","ok":false,"error":"[FlyChainClient] a deposit consents to a group's terms, so state them: pass policyHash (computed from the terms you expect) or expect { allowedRecipients, maxReleaseBps, settle…
- ✓ a deposit that states no terms is refused, and the tool does not copy the hash from the contract
- evidence mcp: {"tool":"midge_deposit","ok":false,"error":"[FlyChainClient] refusing to deposit, the group's terms differ from what you expected: exit timer: you expected 300 blocks, the group has 50"}
- ✓ a deposit that expected a 300-block timer into a 50-block group is refused
- ✓ neither refused deposit changed the escrow
- evidence mcp: {"tool":"midge_deposit","ok":true,"status":"DEPOSITED_ON_CHAIN","txHash":"DexHceaCGXk8ksxL7zq45A5hF7DqPD12wzMhqpzr1RgG","explorer":"https://testnet.nearblocks.io/txns/DexHceaCGXk8ksxL7zq45A5hF7DqPD12wzMhqpzr1RgG"}
- ✓ midge_deposit reports DEPOSITED_ON_CHAIN
- ✓ the escrow is exactly 0.02 NEAR
- evidence mcp: {"tool":"midge_settle","ok":true,"status":"SETTLED_ON_CHAIN","txHash":"ELXrMECjrDuBkWKiCfw8wKF9GdsXL3Fut3qsoP3KzBDa","explorer":"https://testnet.nearblocks.io/txns/ELXrMECjrDuBkWKiCfw8wKF9GdsXL3Fut3qsoP3KzBDa"}
- ✓ midge_settle reports SETTLED_ON_CHAIN (it could not before: wrong argument names, wrong allocation shape, wrong hash)
- ✓ the chain shows the syndicate Settled with no escrow
- ✓ the contract made exactly one transfer, to the recipient, for exactly 0.02 NEAR
- evidence mcp: {"tool":"midge_settle","ok":false,"error":"Smart contract panicked: panicked at src/lib.rs:964:9:\nassertion `left == right` failed: [HAQ REJECT] Syndicate is not active.\n  left: Settled\n right: Active"}
- ✓ replaying the settlement through the MCP is rejected

### MCP: a partial settlement cannot be replayed, the next needs a fresh signature

- evidence mcp: {"tool":"midge_hatch_syndicate","ok":true,"status":"HATCHED_ON_CHAIN","txHash":"Aj1BEk84vxvHogaireuVjfoAzukaWpyCDER74J7pjphR","explorer":"https://testnet.nearblocks.io/txns/Aj1BEk84vxvHogaireuVjfoAzukaWpyCDER74J7pjphR"}
- ✓ hatch #2
- evidence mcp: {"tool":"midge_deposit","ok":true,"status":"DEPOSITED_ON_CHAIN","txHash":"wcYvXpiY6JS1JMPaBfNeT5kodvmqREQAzpuTEVstdLi","explorer":"https://testnet.nearblocks.io/txns/wcYvXpiY6JS1JMPaBfNeT5kodvmqREQAzpuTEVstdLi"}
- ✓ deposit 0.03
- evidence mcp: {"tool":"midge_settle","ok":true,"status":"SETTLED_ON_CHAIN","txHash":"9UzYdrUoi9RArps5FprpCsRqGGY2pMytqMCQFmDnBJ9W","explorer":"https://testnet.nearblocks.io/txns/9UzYdrUoi9RArps5FprpCsRqGGY2pMytqMCQFmDnBJ9W"}
- ✓ the partial settlement (0.01 of 0.03) succeeds
- ✓ the round nonce rotated
- evidence mcp: {"tool":"midge_settle","ok":false,"error":"Smart contract panicked: panicked at src/lib.rs:991:9:\nassertion `left == right` failed: [HAQ REJECT] Nonce mismatch. Replay attack blocked.\n  left: \"3acdec67e85fa2a0319f314f…
- ✓ replaying the same partial settlement is rejected with a nonce error
- ✓ the escrow is unchanged by the replay
- evidence mcp: {"tool":"midge_settle","ok":true,"status":"SETTLED_ON_CHAIN","txHash":"4BSarPkzWdJdXLH3AG8HbaiEV1ZXUeuH5ZFszXyZigoD","explorer":"https://testnet.nearblocks.io/txns/4BSarPkzWdJdXLH3AG8HbaiEV1ZXUeuH5ZFszXyZigoD"}
- ✓ a fresh signature on the new nonce settles the rest

### MCP: the non-custodial exit (hatch_out) refunds exactly the deposit

- evidence mcp: {"tool":"midge_hatch_syndicate","ok":true,"status":"HATCHED_ON_CHAIN","txHash":"GxZ5rfMoAZ3q5LdF6KdgPRXLxUPg1CWCTaZswXrH8HEd","explorer":"https://testnet.nearblocks.io/txns/GxZ5rfMoAZ3q5LdF6KdgPRXLxUPg1CWCTaZswXrH8HEd"}
- ✓ hatch #3 with a 10-block timeout (the contract floor)
- evidence mcp: {"tool":"midge_deposit","ok":true,"status":"DEPOSITED_ON_CHAIN","txHash":"DrU7dTp2tLkuK8tdXsumzDDAGbvK3S6buM73kCJMChBp","explorer":"https://testnet.nearblocks.io/txns/DrU7dTp2tLkuK8tdXsumzDDAGbvK3S6buM73kCJMChBp"}
- ✓ deposit 0.02
- evidence mcp: {"tool":"midge_hatch_out","ok":true,"status":"HATCHED_OUT_ON_CHAIN","txHash":"658gnxNH7b9NpQG7VM7CMG9ajwzCncALvgs3dRnTgBT5","explorer":"https://testnet.nearblocks.io/txns/658gnxNH7b9NpQG7VM7CMG9ajwzCncALvgs3dRnTgBT5"}
- ✓ midge_hatch_out reports HATCHED_OUT_ON_CHAIN
- ✓ the syndicate is AbortedRefunded
- ✓ the contract refunded exactly 0.02 NEAR to the depositor, once

### SDK through the API in chain mode: reads, settle and hatch-out reach the chain

- ✓ the daemon is in chain mode with write access
- ✓ listSyndicates over the API returns the chain's record count as total and the newest first
- ✓ the first newest-first page includes this run's syndicates without walking every page (it did not, ascending, once the chain held more than a page)
- observed **syndicates in the interface account's index (total)**: `5`
- ✓ getSyndicatesByMember reads the chain, newest first, with the index size as total, and includes the syndicates this run created
- ✓ sdk.hatchSyndicate -> API -> chain hatches on chain, with a transaction hash and the round nonce (GAP-016: it used to create an in-memory model syndicate)
- ✓ the chain really has it, with the Roost's key
- ✓ sdk.deposit -> API -> chain deposits on chain
- ✓ sdk.getSyndicate reads the chain: the id, the exact escrow, the nonce and the flyer (it used to 404 for anything on chain)
- ✓ an id that is not on chain is a 404
- ✓ the timelock view reads the chain: 50 blocks, some elapsed, a real current block
- ✓ sdk.settleBatch -> API -> chain returns SETTLED_ON_CHAIN
- ✓ the chain shows it Settled
- ✓ a settle without nonce, hash or signature is refused with an explanation, and sends nothing
- evidence mcp: {"tool":"midge_hatch_syndicate","ok":true,"status":"HATCHED_ON_CHAIN","txHash":"AFUVm1tSau5rwqtrnPvWZgdtvdY2G4UrhfdnB7JihQCC","explorer":"https://testnet.nearblocks.io/txns/AFUVm1tSau5rwqtrnPvWZgdtvdY2G4UrhfdnB7JihQCC"}
- ✓ hatch #5 with a 10-block timeout (the contract floor)
- evidence mcp: {"tool":"midge_deposit","ok":true,"status":"DEPOSITED_ON_CHAIN","txHash":"FMDwY8xhY1k5exApRQ3HJtU5mxpmnqqvG8pPnTD6TgR4","explorer":"https://testnet.nearblocks.io/txns/FMDwY8xhY1k5exApRQ3HJtU5mxpmnqqvG8pPnTD6TgR4"}
- ✓ deposit 0.02
- ✓ sdk.hatchOut -> API -> chain returns HATCHED_OUT_ON_CHAIN
- ✓ the chain shows the escrow refunded

### teardown: stop the daemon, prune the run's syndicates, compact the master's index, delete the recipient

- observed **teardown**: `{"pruned":5,"notPruned":[],"deleted":["icsze5r.fly-1793636729.testnet"],"masterIndexCompacted":true}`
- ✓ every syndicate the run created was pruned
- ✓ the recipient account was deleted and no longer exists
- ✓ the contract holds exactly as many records as before the run
- observed **interface account net change (NEAR)**: `-0.09691`
- ✓ an attempt cost the interface account less than 0.12 NEAR

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
