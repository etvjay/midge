# Lab run 20261104T151213Z-46e2

- **Code:** `3c68c94d1c9c45274b40f5730c97c739415e7e55` on `master` (**1 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `8a0180ff698c44b5…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=no, phala-key=no, dcap-qvl=yes
- **Integrity:** 212 events, hash-chained; root `c15a4e3b2991515f340f33e308861719f2287b1a4960ecdad6b4253581078582`. Verify with `node lab/verify-run.js lab/runs/20261104T151213Z-46e2`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-CHAIN-ROUND-LOCAL A full syndicate round on NEAR testnet against a local hosted Roost | testnet | **PASS** | 15 | 55 |  |
| E-IFACE-CHAIN The MCP server, the SDK and the API drive the real contract on NEAR testnet, end to end | testnet | **PASS** | 6 | 49 |  |

## E-CHAIN-ROUND-LOCAL: A full syndicate round on NEAR testnet against a local hosted Roost

**Hypothesis.** A syndicate hatched with a hosted Roost's settlement key can be funded, can aggregate sealed bids exactly, and is settled on chain only by that Roost for allocations its own aggregate supports. A replay, a payout outside the policy and a signature from another key are all rejected on chain without moving funds, and members can always take their own money back with hatch_out when the Roost stalls.

**What this does not prove**
- The Roost runs on this machine with a simulated attestation provider, so this proves the CHAIN LOGIC and the Roost's signing rules. It proves nothing about hardware: see E-HOSTED-LIVE-01 for a real TDX VM.
- All members, the coordinator and the recipient are controlled by one operator with keys derived from one master key. It shows the contract's rules, not independent users acting independently.
- Testnet only, one run on one date. The contract has not been audited by a third party.
- Rejections are shown by on-chain state staying unchanged, not by matching the contract's error text.

| Step | Result | Assertions | Time |
|---|---|---|---|
| create fresh member accounts for this run (three flyers and a recipient) | ✓ pass | 1/1 | 9725 ms |
| preflight: accounts, balances and deployed contract | ✓ pass | 4/4 | 2120 ms |
| hatch a syndicate whose settlement key is the Roost's | ✓ pass | 2/2 | 2022 ms |
| members deposit with explicit consent to the policy hash | ✓ pass | 5/5 | 7465 ms |
| members seal bids; the Roost aggregates them exactly | ✓ pass | 2/2 | 29 ms |
| ATTACK 1: the Roost refuses to sign more than the sealed bids support | ✓ pass | 1/1 | 189 ms |
| settle on chain with the Roost's signature | ✓ pass | 4/4 | 4124 ms |
| ATTACK 2: replaying the same signed settlement is rejected | ✓ pass | 2/2 | 2145 ms |
| ATTACK 3: a valid Roost signature cannot pay a recipient outside the policy | ✓ pass | 5/5 | 9518 ms |
| ATTACK 4: a settlement signed by a different key is rejected | ✓ pass | 2/2 | 2057 ms |
| cleanup: settle syndicate #2 legitimately with the real Roost | ✓ pass | 2/2 | 3709 ms |
| ATTACK 5: a partial settlement cannot be replayed, and the next round needs a fresh signature | ✓ pass | 11/11 | 12741 ms |
| the Roost stalls: a member takes their own funds back with hatch_out | ✓ pass | 7/7 | 21121 ms |
| ledger: every transaction, and what the experiment cost | ✓ pass | 2/2 | 1091 ms |
| teardown: prune the finished syndicates, compact the indexes, delete the accounts back into the master | ✓ pass | 5/5 | 27294 ms |

### create fresh member accounts for this run (three flyers and a recipient)

- ✓ four accounts exist and are funded
- observed **accounts**: `["l99fmoa.fly-1793804724.testnet","l99fmob.fly-1793804724.testnet","l99fmoc.fly-1793804724.testnet","l99fmor.fly-1793804724.testnet"]`

### preflight: accounts, balances and deployed contract

- observed **balances (NEAR)**: `{"fly-1793804724.testnet":"4.1013","l99fmoa.fly-1793804724.testnet":"0.1482","l99fmob.fly-1793804724.testnet":"0.1482","l99fmoc.fly-17938047…`
- note: Measured: a full round costs about 0.002 NEAR net, because unused prepaid gas is refunded. The balance needed is the temporary peak: a deposit (up to 0.03) plus prepaid gas (up to 0.06 at current testnet gas prices).
- ✓ every member has enough testnet NEAR for the peak of this experiment (0.09 each)
- ✓ the master account can pay for hatching (0.1 NEAR)
- observed **deployed code hash**: `Gh8NAA2e78ETMMAWvExPnYfuKtRe2wQT2FHJ2RRXcPR9`
- ✓ the deployed contract is the build expected from the wasm built from this checkout
- observed **contract account storage**: `{"balance":"4.7909","bytesUsed":327203,"headroomNear":"1.5189"}`
- ✓ the contract account has at least 0.15 NEAR of storage headroom (each syndicate record costs about 0.01)

### hatch a syndicate whose settlement key is the Roost's

- evidence tx: {"label":"hatch lab-mw299fmo-1","hash":"6hSxFkHQdpCrwx45vMwPgS2eHiPiEw16xTGUH4GZ1s8A","ok":true,"explorer":"https://testnet.nearblocks.io/txns/6hSxFkHQdpCrwx45vMwPgS2eHiPiEw16xTGUH4GZ1s8A","gasTGas":2.507430591227,"error…
- ✓ hatch succeeded on chain
- observed **syndicate state**: `{"status":"Active","epoch":1,"flyers":0}`
- ✓ the syndicate is active

### members deposit with explicit consent to the policy hash

- evidence tx: {"label":"deposit l99fmoa.fly-1793804724.testnet -> lab-mw299fmo-1","hash":"C1h14NHXwjZuCJh6cE3hPn924smBJ4Ed5YpUKGM5D97Z","ok":true,"explorer":"https://testnet.nearblocks.io/txns/C1h14NHXwjZuCJh6cE3hPn924smBJ4Ed5YpUKGM5D…
- ✓ l99fmoa.fly-1793804724.testnet deposited 0.02 NEAR
- evidence tx: {"label":"deposit l99fmob.fly-1793804724.testnet -> lab-mw299fmo-1","hash":"5YoRirWJwHugyYT6A464bEx9BRDJe4mE3B7Aj6CKJ2GB","ok":true,"explorer":"https://testnet.nearblocks.io/txns/5YoRirWJwHugyYT6A464bEx9BRDJe4mE3B7Aj6CKJ…
- ✓ l99fmob.fly-1793804724.testnet deposited 0.02 NEAR
- evidence tx: {"label":"deposit l99fmoc.fly-1793804724.testnet -> lab-mw299fmo-1","hash":"8fgPxAS6Gcea4Wp9Hc2aCLPfPvoRU1izvLu4PgRBuk6j","ok":true,"explorer":"https://testnet.nearblocks.io/txns/8fgPxAS6Gcea4Wp9Hc2aCLPfPvoRU1izvLu4PgRBu…
- ✓ l99fmoc.fly-1793804724.testnet deposited 0.02 NEAR
- ✓ escrow equals the three deposits exactly
- ✓ three active flyers

### members seal bids; the Roost aggregates them exactly

- observed **aggregate**: `{"totalInputAmount":"0.06","flyerCount":3,"excludedFlyers":[],"executionModel":"HOSTED_EXACT_BATCH","confidentiality":"simulated","timestamp…`
- ✓ the total is exactly 0.06
- ✓ three bids counted and none excluded

### ATTACK 1: the Roost refuses to sign more than the sealed bids support

- ✓ over-allocation is refused by the Roost

### settle on chain with the Roost's signature

- evidence tx: {"label":"settle_batch lab-mw299fmo-1","hash":"3SyfLWtV6GSg3szbHpHQ2S1EcDQ8tNyoV6BEMgt71FB9","ok":true,"explorer":"https://testnet.nearblocks.io/txns/3SyfLWtV6GSg3szbHpHQ2S1EcDQ8tNyoV6BEMgt71FB9","gasTGas":6.171947415148…
- ✓ settle_batch succeeded
- observed **recipient balance change (NEAR)**: `0.06`
- ✓ the syndicate is Settled
- ✓ the recipient received exactly the escrow
- ✓ the escrow is empty

### ATTACK 2: replaying the same signed settlement is rejected

- evidence tx: {"label":"REPLAY settle_batch lab-mw299fmo-1","hash":null,"ok":false,"explorer":null,"gasTGas":0,"error":"Smart contract panicked: panicked at src/lib.rs:505:9:\nassertion `left == right` failed: [HAQ REJECT] Syndicate i…
- observed **contract answer**: `Smart contract panicked: panicked at src/lib.rs:505:9:
assertion `left == right` failed: [HAQ REJECT] Syndicate is not active.
  left: Settl…`
- ✓ the replay failed
- ✓ the recipient balance did not change

### ATTACK 3: a valid Roost signature cannot pay a recipient outside the policy

- evidence tx: {"label":"hatch lab-mw299fmo-2","hash":"3PShB3exsnAjwD2o5GaqekyxDcrw4EqgQh9ZHM3J2jNS","ok":true,"explorer":"https://testnet.nearblocks.io/txns/3PShB3exsnAjwD2o5GaqekyxDcrw4EqgQh9ZHM3J2jNS","gasTGas":2.510547414425,"error…
- ✓ hatch #2 succeeded
- evidence tx: {"label":"deposit l99fmoa.fly-1793804724.testnet -> lab-mw299fmo-2","hash":"EXL2ksSNAk7gg1FnucX4247ZkTyh8wRZq67B5eVamCWQ","ok":true,"explorer":"https://testnet.nearblocks.io/txns/EXL2ksSNAk7gg1FnucX4247ZkTyh8wRZq67B5eVam…
- ✓ l99fmoa.fly-1793804724.testnet deposited 0.02
- evidence tx: {"label":"deposit l99fmob.fly-1793804724.testnet -> lab-mw299fmo-2","hash":"CftjgFLtASzHpqujN7FfoBCcGmYkkSmc6cCNcGnmB5EB","ok":true,"explorer":"https://testnet.nearblocks.io/txns/CftjgFLtASzHpqujN7FfoBCcGmYkkSmc6cCNcGnmB…
- ✓ l99fmob.fly-1793804724.testnet deposited 0.02
- evidence tx: {"label":"settle_batch lab-mw299fmo-2","hash":null,"ok":false,"explorer":null,"gasTGas":0,"error":"Smart contract panicked: panicked at src/lib.rs:557:13:\n[Settle REJECT] Recipient thief-mw299fmo.testnet is not in allow…
- observed **contract answer**: `Smart contract panicked: panicked at src/lib.rs:557:13:
[Settle REJECT] Recipient thief-mw299fmo.testnet is not in allowed_recipients whitel…`
- ✓ the contract rejected a payout to an unapproved recipient
- ✓ the syndicate is still active with the escrow intact

### ATTACK 4: a settlement signed by a different key is rejected

- evidence tx: {"label":"settle_batch lab-mw299fmo-2","hash":null,"ok":false,"explorer":null,"gasTGas":0,"error":"Smart contract panicked: panicked at src/lib.rs:615:9:\n[HAQ REJECT] Invalid enclave Ed25519 signature over deliberation …
- observed **contract answer**: `Smart contract panicked: panicked at src/lib.rs:615:9:
[HAQ REJECT] Invalid enclave Ed25519 signature over deliberation batch!`
- ✓ the contract rejected a signature from a key it was not hatched with
- ✓ nothing moved

### cleanup: settle syndicate #2 legitimately with the real Roost

- evidence tx: {"label":"settle_batch lab-mw299fmo-2","hash":"91GokDKuMh5HbAH4CNwDurpXugtxf22tXCeh2cvQHaBX","ok":true,"explorer":"https://testnet.nearblocks.io/txns/91GokDKuMh5HbAH4CNwDurpXugtxf22tXCeh2cvQHaBX","gasTGas":5.973213487565…
- ✓ the legitimate settlement succeeded after the failed attacks
- ✓ syndicate #2 is Settled

### ATTACK 5: a partial settlement cannot be replayed, and the next round needs a fresh signature

- evidence tx: {"label":"hatch lab-mw299fmo-4","hash":"DTNDY1dPXwF65kgJdn626TBngmsxHNpxsevFCbNr4UxD","ok":true,"explorer":"https://testnet.nearblocks.io/txns/DTNDY1dPXwF65kgJdn626TBngmsxHNpxsevFCbNr4UxD","gasTGas":2.513566329659,"error…
- ✓ hatch #4 succeeded
- evidence tx: {"label":"deposit l99fmoa.fly-1793804724.testnet -> lab-mw299fmo-4","hash":"9HRt8AMmvXhEWHvL5fKEphKCkYBFnbHucZGSX9XbBrRh","ok":true,"explorer":"https://testnet.nearblocks.io/txns/9HRt8AMmvXhEWHvL5fKEphKCkYBFnbHucZGSX9XbB…
- ✓ f1 deposited 0.03
- evidence tx: {"label":"settle_batch lab-mw299fmo-4","hash":"4s8SzPPb4QURxUzqqZcUa6Sy1EgiEDePqEV8J4wuWC5J","ok":true,"explorer":"https://testnet.nearblocks.io/txns/4s8SzPPb4QURxUzqqZcUa6Sy1EgiEDePqEV8J4wuWC5J","gasTGas":5.814074728734…
- ✓ the partial settlement (0.01 of 0.03) succeeded
- ✓ 0.02 is left and the syndicate is still active
- ✓ the round nonce rotated after the partial settlement
- ✓ it is still epoch 1 (a Flash syndicate does not start new epochs)
- evidence tx: {"label":"REPLAY settle_batch lab-mw299fmo-4 (partial)","hash":null,"ok":false,"explorer":null,"gasTGas":0,"error":"Smart contract panicked: panicked at src/lib.rs:525:9:\nassertion `left == right` failed: [HAQ REJECT] N…
- observed **contract answer**: `Smart contract panicked: panicked at src/lib.rs:525:9:
assertion `left == right` failed: [HAQ REJECT] Nonce mismatch. Replay attack blocked.…`
- ✓ the replay of the partial settlement failed
- ✓ the escrow is unchanged by the replay
- ✓ the recipient received nothing from the replay
- evidence tx: {"label":"settle_batch lab-mw299fmo-4","hash":"Ej2UHhuw1QHZQAU5CWC5rwNVTn1PhnGjNritxaDkuvdx","ok":true,"explorer":"https://testnet.nearblocks.io/txns/Ej2UHhuw1QHZQAU5CWC5rwNVTn1PhnGjNritxaDkuvdx","gasTGas":5.784854544074…
- ✓ a fresh signature on the new nonce settles the rest
- ✓ syndicate #4 is Settled with no escrow left

### the Roost stalls: a member takes their own funds back with hatch_out

- evidence tx: {"label":"hatch lab-mw299fmo-3","hash":"6VQuUHSUptVnbjr2cEihY1rXjD7XLPxdBHmDM2e3Hj5j","ok":true,"explorer":"https://testnet.nearblocks.io/txns/6VQuUHSUptVnbjr2cEihY1rXjD7XLPxdBHmDM2e3Hj5j","gasTGas":2.518193939496,"error…
- ✓ hatch #3 (timeout 2 blocks) succeeded
- evidence tx: {"label":"deposit l99fmob.fly-1793804724.testnet -> lab-mw299fmo-3","hash":"HBaxjxcDbckY5TbrD87QTofiRnx3NyAdiZspcvkXtJ5T","ok":true,"explorer":"https://testnet.nearblocks.io/txns/HBaxjxcDbckY5TbrD87QTofiRnx3NyAdiZspcvkXt…
- ✓ f2 deposited 0.03
- evidence tx: {"label":"hatch_out lab-mw299fmo-3","hash":"8aDufHefmCC3xgVkzuiJpFgCQrt3mJMzHDRUbtdKhuR4","ok":true,"explorer":"https://testnet.nearblocks.io/txns/8aDufHefmCC3xgVkzuiJpFgCQrt3mJMzHDRUbtdKhuR4","gasTGas":5.147107816635,"e…
- ✓ hatch_out succeeded without any operator or enclave signature
- ✓ the escrow is empty and the syndicate is aborted/refunded
- observed **transfers made by the contract in this transaction**: `[{"to":"l99fmob.fly-1793804724.testnet","near":"0.03"}]`
- observed **transfers made by the system (gas refunds, not the contract)**: `["0.000201","0.002403"]`
- ✓ the contract made exactly one transfer
- ✓ it went to the member who called hatch_out
- ✓ and it was exactly the 0.03 NEAR they deposited (no more, no less)
- note: Balance deltas were rejected as evidence here: gas refunds from earlier transactions land after a reading is taken and made a correct refund look like a double payment. The receipts above are authoritative.

### ledger: every transaction, and what the experiment cost

- observed **transactions sent**: `20`
- observed **transactions that failed (expected: the 3 attack attempts)**: `["REPLAY settle_batch lab-mw299fmo-1","settle_batch lab-mw299fmo-2","settle_batch lab-mw299fmo-2","REPLAY settle_batch lab-mw299fmo-4 (parti…`
- ✓ exactly the four attack attempts failed on chain
- observed **net NEAR spent across all accounts (gas and storage)**: `0.00174`
- ✓ the whole experiment cost less than 0.02 NEAR net (measured previously: about 0.002)

### teardown: prune the finished syndicates, compact the indexes, delete the accounts back into the master

- observed **teardown**: `{"pruned":4,"notPruned":[],"compacted":4,"deleted":4,"failed":[]}`
- ✓ every syndicate the run created was pruned (all were Settled or AbortedRefunded)
- ✓ all four accounts were deleted
- ✓ none of them exists any more
- ✓ the contract holds exactly as many syndicate records as before the run (the run left no state behind)
- observed **net cost to the master account (NEAR)**: `0.03372`
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
| preflight: write access, deployed contract, balances, storage headroom | ✓ pass | 6/6 | 3927 ms |
| MCP: hatch with the Roost's key, deposit, settle with its signature | ✓ pass | 10/10 | 11277 ms |
| MCP: a partial settlement cannot be replayed, the next needs a fresh signature | ✓ pass | 7/7 | 14350 ms |
| MCP: the non-custodial exit (hatch_out) refunds exactly the deposit | ✓ pass | 5/5 | 19652 ms |
| SDK through the API in chain mode: reads, settle and hatch-out reach the chain | ✓ pass | 17/17 | 30382 ms |
| teardown: stop the daemon, prune the run's syndicates, compact the master's index, delete the recipient | ✓ pass | 4/4 | 18852 ms |

### preflight: write access, deployed contract, balances, storage headroom

- ✓ the MCP server is in chain mode and can write
- ✓ the interface account is the lab's master account
- ✓ the deployed contract is the build expected from the wasm built from this checkout
- observed **interface account balance (NEAR)**: `4.6965`
- ✓ the interface account has at least 0.25 NEAR (an attempt costs about 0.07)
- ✓ the contract account has at least 0.15 NEAR of storage headroom
- ✓ a fresh recipient account exists

### MCP: hatch with the Roost's key, deposit, settle with its signature

- evidence mcp: {"tool":"midge_hatch_syndicate","ok":false,"error":"[FlyChainClient] hatch needs enclavePublicKey: the Roost's 32-byte Ed25519 settlement public key as 64 hex characters (not all zeros). Without it the syndicate could ne…
- ✓ hatching without an enclave key is refused before any transaction (a keyless syndicate could never settle)
- evidence mcp: {"tool":"midge_hatch_syndicate","ok":true,"status":"HATCHED_ON_CHAIN","txHash":"EfgWAzK4yLTXKpFpqRLh5grZUobPwcY4hz5u8ipE93uJ","explorer":"https://testnet.nearblocks.io/txns/EfgWAzK4yLTXKpFpqRLh5grZUobPwcY4hz5u8ipE93uJ"}
- ✓ midge_hatch_syndicate reports HATCHED_ON_CHAIN with a transaction hash
- ✓ the chain shows the Roost's settlement key
- ✓ the chain shows the allowed recipient the agent asked for
- evidence mcp: {"tool":"midge_deposit","ok":true,"status":"DEPOSITED_ON_CHAIN","txHash":"AM89zRoco51jRe5dyeJ6rVupjDameCt98u9K8fps9uRG","explorer":"https://testnet.nearblocks.io/txns/AM89zRoco51jRe5dyeJ6rVupjDameCt98u9K8fps9uRG"}
- ✓ midge_deposit reports DEPOSITED_ON_CHAIN
- ✓ the escrow is exactly 0.02 NEAR
- evidence mcp: {"tool":"midge_settle","ok":true,"status":"SETTLED_ON_CHAIN","txHash":"HrABmVMG9486BXv7R49X14oUsbauZSuUFcwjeeFNN4Ah","explorer":"https://testnet.nearblocks.io/txns/HrABmVMG9486BXv7R49X14oUsbauZSuUFcwjeeFNN4Ah"}
- ✓ midge_settle reports SETTLED_ON_CHAIN (it could not before: wrong argument names, wrong allocation shape, wrong hash)
- ✓ the chain shows the syndicate Settled with no escrow
- ✓ the contract made exactly one transfer, to the recipient, for exactly 0.02 NEAR
- evidence mcp: {"tool":"midge_settle","ok":false,"error":"Smart contract panicked: panicked at src/lib.rs:505:9:\nassertion `left == right` failed: [HAQ REJECT] Syndicate is not active.\n  left: Settled\n right: Active"}
- ✓ replaying the settlement through the MCP is rejected

### MCP: a partial settlement cannot be replayed, the next needs a fresh signature

- evidence mcp: {"tool":"midge_hatch_syndicate","ok":true,"status":"HATCHED_ON_CHAIN","txHash":"3Jr7W3TiwVSLb2emXFTN1Zi7Kuyik7Eqw9YSKVmMAzwn","explorer":"https://testnet.nearblocks.io/txns/3Jr7W3TiwVSLb2emXFTN1Zi7Kuyik7Eqw9YSKVmMAzwn"}
- ✓ hatch #2
- evidence mcp: {"tool":"midge_deposit","ok":true,"status":"DEPOSITED_ON_CHAIN","txHash":"B6Lsxj32MCEAW1Tj4RAgpk1EX6shHfjz5Ndd63bobWrF","explorer":"https://testnet.nearblocks.io/txns/B6Lsxj32MCEAW1Tj4RAgpk1EX6shHfjz5Ndd63bobWrF"}
- ✓ deposit 0.03
- evidence mcp: {"tool":"midge_settle","ok":true,"status":"SETTLED_ON_CHAIN","txHash":"BNduuZvFKfXhxH4jGsBbpWGUDzqJeVuBzRS1RLjnKv7U","explorer":"https://testnet.nearblocks.io/txns/BNduuZvFKfXhxH4jGsBbpWGUDzqJeVuBzRS1RLjnKv7U"}
- ✓ the partial settlement (0.01 of 0.03) succeeds
- ✓ the round nonce rotated
- evidence mcp: {"tool":"midge_settle","ok":false,"error":"Smart contract panicked: panicked at src/lib.rs:525:9:\nassertion `left == right` failed: [HAQ REJECT] Nonce mismatch. Replay attack blocked.\n  left: \"e170abbe16b5ec423f745eaa…
- ✓ replaying the same partial settlement is rejected with a nonce error
- ✓ the escrow is unchanged by the replay
- evidence mcp: {"tool":"midge_settle","ok":true,"status":"SETTLED_ON_CHAIN","txHash":"268gfGjbwzmXbKGfJaRSB4WB8YRuUrSaXvJqjZJc2Ert","explorer":"https://testnet.nearblocks.io/txns/268gfGjbwzmXbKGfJaRSB4WB8YRuUrSaXvJqjZJc2Ert"}
- ✓ a fresh signature on the new nonce settles the rest

### MCP: the non-custodial exit (hatch_out) refunds exactly the deposit

- evidence mcp: {"tool":"midge_hatch_syndicate","ok":true,"status":"HATCHED_ON_CHAIN","txHash":"8wVLb1AKMPTgCXEoLhFTW4gHqjwgqkX72KK5M9Smob1Z","explorer":"https://testnet.nearblocks.io/txns/8wVLb1AKMPTgCXEoLhFTW4gHqjwgqkX72KK5M9Smob1Z"}
- ✓ hatch #3 with a 2-block timeout
- evidence mcp: {"tool":"midge_deposit","ok":true,"status":"DEPOSITED_ON_CHAIN","txHash":"A3QDmNDSbfZYBBwj3Wzc8Va38sPRS6m7J1EXg5EVpmcd","explorer":"https://testnet.nearblocks.io/txns/A3QDmNDSbfZYBBwj3Wzc8Va38sPRS6m7J1EXg5EVpmcd"}
- ✓ deposit 0.02
- evidence mcp: {"tool":"midge_hatch_out","ok":true,"status":"HATCHED_OUT_ON_CHAIN","txHash":"3gKd6gZZt1wu7v3NA7XLdBi7s53iusgcV8EJs2iSPYWq","explorer":"https://testnet.nearblocks.io/txns/3gKd6gZZt1wu7v3NA7XLdBi7s53iusgcV8EJs2iSPYWq"}
- ✓ midge_hatch_out reports HATCHED_OUT_ON_CHAIN
- ✓ the syndicate is AbortedRefunded
- ✓ the contract refunded exactly 0.02 NEAR to the depositor, once

### SDK through the API in chain mode: reads, settle and hatch-out reach the chain

- ✓ the daemon is in chain mode with write access
- ✓ listSyndicates over the API returns the chain's record count as total and the newest first
- ✓ the first newest-first page includes this run's syndicates without walking every page (it did not, ascending, once the chain held more than a page)
- observed **syndicates in the interface account's index (total)**: `3`
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
- evidence mcp: {"tool":"midge_hatch_syndicate","ok":true,"status":"HATCHED_ON_CHAIN","txHash":"EfbZ9JTHTGwSFiAQ6hg5N8AWrMwZezwD9baM3t8M4GA","explorer":"https://testnet.nearblocks.io/txns/EfbZ9JTHTGwSFiAQ6hg5N8AWrMwZezwD9baM3t8M4GA"}
- ✓ hatch #5 with a 2-block timeout
- evidence mcp: {"tool":"midge_deposit","ok":true,"status":"DEPOSITED_ON_CHAIN","txHash":"Ddk7KpEYPwMVRA2jSwFsNma61hSWeNcZevk5AUGWg1ry","explorer":"https://testnet.nearblocks.io/txns/Ddk7KpEYPwMVRA2jSwFsNma61hSWeNcZevk5AUGWg1ry"}
- ✓ deposit 0.02
- ✓ sdk.hatchOut -> API -> chain returns HATCHED_OUT_ON_CHAIN
- ✓ the chain shows the escrow refunded

### teardown: stop the daemon, prune the run's syndicates, compact the master's index, delete the recipient

- observed **teardown**: `{"pruned":5,"notPruned":[],"deleted":["i9boxar.fly-1793804724.testnet"],"masterIndexCompacted":true}`
- ✓ every syndicate the run created was pruned
- ✓ the recipient account was deleted and no longer exists
- ✓ the contract holds exactly as many records as before the run
- observed **interface account net change (NEAR)**: `-0.06497`
- ✓ an attempt cost the interface account less than 0.12 NEAR

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
