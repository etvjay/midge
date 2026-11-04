# Lab run 20261104T151732Z-080a

- **Code:** `c4abc28650639b199c68050b466b0e024bf09c6f` on `master` (clean tree)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `8a0180ff698c44b5…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 212 events, hash-chained; root `f2b0aa211762a9a685748d341e0661a92f1222d22f8f8b52414d256fbd82e0d1`. Verify with `node lab/verify-run.js lab/runs/20261104T151732Z-080a`

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
| create fresh member accounts for this run (three flyers and a recipient) | ✓ pass | 1/1 | 8828 ms |
| preflight: accounts, balances and deployed contract | ✓ pass | 4/4 | 1651 ms |
| hatch a syndicate whose settlement key is the Roost's | ✓ pass | 2/2 | 1960 ms |
| members deposit with explicit consent to the policy hash | ✓ pass | 5/5 | 6811 ms |
| members seal bids; the Roost aggregates them exactly | ✓ pass | 2/2 | 36 ms |
| ATTACK 1: the Roost refuses to sign more than the sealed bids support | ✓ pass | 1/1 | 189 ms |
| settle on chain with the Roost's signature | ✓ pass | 4/4 | 3859 ms |
| ATTACK 2: replaying the same signed settlement is rejected | ✓ pass | 2/2 | 2183 ms |
| ATTACK 3: a valid Roost signature cannot pay a recipient outside the policy | ✓ pass | 5/5 | 9219 ms |
| ATTACK 4: a settlement signed by a different key is rejected | ✓ pass | 2/2 | 2238 ms |
| cleanup: settle syndicate #2 legitimately with the real Roost | ✓ pass | 2/2 | 3670 ms |
| ATTACK 5: a partial settlement cannot be replayed, and the next round needs a fresh signature | ✓ pass | 11/11 | 14233 ms |
| the Roost stalls: a member takes their own funds back with hatch_out | ✓ pass | 7/7 | 18465 ms |
| ledger: every transaction, and what the experiment cost | ✓ pass | 2/2 | 1211 ms |
| teardown: prune the finished syndicates, compact the indexes, delete the accounts back into the master | ✓ pass | 5/5 | 28745 ms |

### create fresh member accounts for this run (three flyers and a recipient)

- ✓ four accounts exist and are funded
- observed **accounts**: `["l9g9uva.fly-1793636729.testnet","l9g9uvb.fly-1793636729.testnet","l9g9uvc.fly-1793636729.testnet","l9g9uvr.fly-1793636729.testnet"]`

### preflight: accounts, balances and deployed contract

- observed **balances (NEAR)**: `{"fly-1793636729.testnet":"18.5364","l9g9uva.fly-1793636729.testnet":"0.1482","l9g9uvb.fly-1793636729.testnet":"0.1482","l9g9uvc.fly-1793636…`
- note: Measured: a full round costs about 0.002 NEAR net, because unused prepaid gas is refunded. The balance needed is the temporary peak: a deposit (up to 0.03) plus prepaid gas (up to 0.06 at current testnet gas prices).
- ✓ every member has enough testnet NEAR for the peak of this experiment (0.09 each)
- ✓ the master account can pay for hatching (0.1 NEAR)
- observed **deployed code hash**: `Gh8NAA2e78ETMMAWvExPnYfuKtRe2wQT2FHJ2RRXcPR9`
- ✓ the deployed contract is the build expected from the wasm built from this checkout
- observed **contract account storage**: `{"balance":"5.0006","bytesUsed":335489,"headroomNear":"1.6457"}`
- ✓ the contract account has at least 0.15 NEAR of storage headroom (each syndicate record costs about 0.01)

### hatch a syndicate whose settlement key is the Roost's

- evidence tx: {"label":"hatch lab-mw29g9uv-1","hash":"GiR43TcuaqkdWr55HT3vzrGNk4i7xVZfiAZrwKVL8Hdm","ok":true,"explorer":"https://testnet.nearblocks.io/txns/GiR43TcuaqkdWr55HT3vzrGNk4i7xVZfiAZrwKVL8Hdm","gasTGas":2.517888429264,"error…
- ✓ hatch succeeded on chain
- observed **syndicate state**: `{"status":"Active","epoch":1,"flyers":0}`
- ✓ the syndicate is active

### members deposit with explicit consent to the policy hash

- evidence tx: {"label":"deposit l9g9uva.fly-1793636729.testnet -> lab-mw29g9uv-1","hash":"5aM9XbLka6LVty5S22JM3VrBx2ktpkUSxUgwCSs7pZLg","ok":true,"explorer":"https://testnet.nearblocks.io/txns/5aM9XbLka6LVty5S22JM3VrBx2ktpkUSxUgwCSs7p…
- ✓ l9g9uva.fly-1793636729.testnet deposited 0.02 NEAR
- evidence tx: {"label":"deposit l9g9uvb.fly-1793636729.testnet -> lab-mw29g9uv-1","hash":"q8Dkif9FTQsYMhLWwpRADUspWqoaLdwtUBpix1XiJuh","ok":true,"explorer":"https://testnet.nearblocks.io/txns/q8Dkif9FTQsYMhLWwpRADUspWqoaLdwtUBpix1XiJu…
- ✓ l9g9uvb.fly-1793636729.testnet deposited 0.02 NEAR
- evidence tx: {"label":"deposit l9g9uvc.fly-1793636729.testnet -> lab-mw29g9uv-1","hash":"FCPyswpMEwY9fZvMhVSbD4RJVxfLPd3Ev2tLEParmFQK","ok":true,"explorer":"https://testnet.nearblocks.io/txns/FCPyswpMEwY9fZvMhVSbD4RJVxfLPd3Ev2tLEParm…
- ✓ l9g9uvc.fly-1793636729.testnet deposited 0.02 NEAR
- ✓ escrow equals the three deposits exactly
- ✓ three active flyers

### members seal bids; the Roost aggregates them exactly

- observed **aggregate**: `{"totalInputAmount":"0.06","flyerCount":3,"excludedFlyers":[],"executionModel":"HOSTED_EXACT_BATCH","confidentiality":"simulated","timestamp…`
- ✓ the total is exactly 0.06
- ✓ three bids counted and none excluded

### ATTACK 1: the Roost refuses to sign more than the sealed bids support

- ✓ over-allocation is refused by the Roost

### settle on chain with the Roost's signature

- evidence tx: {"label":"settle_batch lab-mw29g9uv-1","hash":"6Dd8g5om4DBQKnGHnFQEWH9fKSJwYF7oCMACinukXfv8","ok":true,"explorer":"https://testnet.nearblocks.io/txns/6Dd8g5om4DBQKnGHnFQEWH9fKSJwYF7oCMACinukXfv8","gasTGas":6.144607984048…
- ✓ settle_batch succeeded
- observed **recipient balance change (NEAR)**: `0.06`
- ✓ the syndicate is Settled
- ✓ the recipient received exactly the escrow
- ✓ the escrow is empty

### ATTACK 2: replaying the same signed settlement is rejected

- evidence tx: {"label":"REPLAY settle_batch lab-mw29g9uv-1","hash":null,"ok":false,"explorer":null,"gasTGas":0,"error":"Smart contract panicked: panicked at src/lib.rs:505:9:\nassertion `left == right` failed: [HAQ REJECT] Syndicate i…
- observed **contract answer**: `Smart contract panicked: panicked at src/lib.rs:505:9:
assertion `left == right` failed: [HAQ REJECT] Syndicate is not active.
  left: Settl…`
- ✓ the replay failed
- ✓ the recipient balance did not change

### ATTACK 3: a valid Roost signature cannot pay a recipient outside the policy

- evidence tx: {"label":"hatch lab-mw29g9uv-2","hash":"5ErVhafqhyECmrwy8JLfKr8oFJJQFtzNXtp5QorJyo2N","ok":true,"explorer":"https://testnet.nearblocks.io/txns/5ErVhafqhyECmrwy8JLfKr8oFJJQFtzNXtp5QorJyo2N","gasTGas":2.518664368518,"error…
- ✓ hatch #2 succeeded
- evidence tx: {"label":"deposit l9g9uva.fly-1793636729.testnet -> lab-mw29g9uv-2","hash":"D84dfDgrDG8Pmw8MtGsnmBDUdxWCjPQLGJQeMa6VZLaX","ok":true,"explorer":"https://testnet.nearblocks.io/txns/D84dfDgrDG8Pmw8MtGsnmBDUdxWCjPQLGJQeMa6VZ…
- ✓ l9g9uva.fly-1793636729.testnet deposited 0.02
- evidence tx: {"label":"deposit l9g9uvb.fly-1793636729.testnet -> lab-mw29g9uv-2","hash":"9mMtZMmQPvNcXw1efGYWj4PtrLFDJzn5oJ1Ey1Y1VD29","ok":true,"explorer":"https://testnet.nearblocks.io/txns/9mMtZMmQPvNcXw1efGYWj4PtrLFDJzn5oJ1Ey1Y1V…
- ✓ l9g9uvb.fly-1793636729.testnet deposited 0.02
- evidence tx: {"label":"settle_batch lab-mw29g9uv-2","hash":null,"ok":false,"explorer":null,"gasTGas":0,"error":"Smart contract panicked: panicked at src/lib.rs:557:13:\n[Settle REJECT] Recipient thief-mw29g9uv.testnet is not in allow…
- observed **contract answer**: `Smart contract panicked: panicked at src/lib.rs:557:13:
[Settle REJECT] Recipient thief-mw29g9uv.testnet is not in allowed_recipients whitel…`
- ✓ the contract rejected a payout to an unapproved recipient
- ✓ the syndicate is still active with the escrow intact

### ATTACK 4: a settlement signed by a different key is rejected

- evidence tx: {"label":"settle_batch lab-mw29g9uv-2","hash":null,"ok":false,"explorer":null,"gasTGas":0,"error":"Smart contract panicked: panicked at src/lib.rs:615:9:\n[HAQ REJECT] Invalid enclave Ed25519 signature over deliberation …
- observed **contract answer**: `Smart contract panicked: panicked at src/lib.rs:615:9:
[HAQ REJECT] Invalid enclave Ed25519 signature over deliberation batch!`
- ✓ the contract rejected a signature from a key it was not hatched with
- ✓ nothing moved

### cleanup: settle syndicate #2 legitimately with the real Roost

- evidence tx: {"label":"settle_batch lab-mw29g9uv-2","hash":"C1jkpJeqzKqTy99xq1opUmT6hf7NjuzehdGuwB6stbDg","ok":true,"explorer":"https://testnet.nearblocks.io/txns/C1jkpJeqzKqTy99xq1opUmT6hf7NjuzehdGuwB6stbDg","gasTGas":5.945890511585…
- ✓ the legitimate settlement succeeded after the failed attacks
- ✓ syndicate #2 is Settled

### ATTACK 5: a partial settlement cannot be replayed, and the next round needs a fresh signature

- evidence tx: {"label":"hatch lab-mw29g9uv-4","hash":"FUFHMqVTSD4JNPmX9Y8dCxKJu1vH9Yq4dAthhBrxecfY","ok":true,"explorer":"https://testnet.nearblocks.io/txns/FUFHMqVTSD4JNPmX9Y8dCxKJu1vH9Yq4dAthhBrxecfY","gasTGas":2.519318539884,"error…
- ✓ hatch #4 succeeded
- evidence tx: {"label":"deposit l9g9uva.fly-1793636729.testnet -> lab-mw29g9uv-4","hash":"3AiHgNXxsnjQGtnzcHTigvXTSZmQWDTaY7KxuGmMfKaD","ok":true,"explorer":"https://testnet.nearblocks.io/txns/3AiHgNXxsnjQGtnzcHTigvXTSZmQWDTaY7KxuGmMf…
- ✓ f1 deposited 0.03
- evidence tx: {"label":"settle_batch lab-mw29g9uv-4","hash":"EVnUs1Z9JSuncgfdeZ8if9Wxys7A1nukmKDzyhYkYtkJ","ok":true,"explorer":"https://testnet.nearblocks.io/txns/EVnUs1Z9JSuncgfdeZ8if9Wxys7A1nukmKDzyhYkYtkJ","gasTGas":5.791262387394…
- ✓ the partial settlement (0.01 of 0.03) succeeded
- ✓ 0.02 is left and the syndicate is still active
- ✓ the round nonce rotated after the partial settlement
- ✓ it is still epoch 1 (a Flash syndicate does not start new epochs)
- evidence tx: {"label":"REPLAY settle_batch lab-mw29g9uv-4 (partial)","hash":null,"ok":false,"explorer":null,"gasTGas":0,"error":"Smart contract panicked: panicked at src/lib.rs:525:9:\nassertion `left == right` failed: [HAQ REJECT] N…
- observed **contract answer**: `Smart contract panicked: panicked at src/lib.rs:525:9:
assertion `left == right` failed: [HAQ REJECT] Nonce mismatch. Replay attack blocked.…`
- ✓ the replay of the partial settlement failed
- ✓ the escrow is unchanged by the replay
- ✓ the recipient received nothing from the replay
- evidence tx: {"label":"settle_batch lab-mw29g9uv-4","hash":"C5NTCzzXeazsuc999f6Ugeh4CrkYXYsi7tgNjXF3pU9P","ok":true,"explorer":"https://testnet.nearblocks.io/txns/C5NTCzzXeazsuc999f6Ugeh4CrkYXYsi7tgNjXF3pU9P","gasTGas":5.762062771634…
- ✓ a fresh signature on the new nonce settles the rest
- ✓ syndicate #4 is Settled with no escrow left

### the Roost stalls: a member takes their own funds back with hatch_out

- evidence tx: {"label":"hatch lab-mw29g9uv-3","hash":"J8svzH7QALwkyhLUwPDhFQ9agu63pgpRE6AwWAEVXrqs","ok":true,"explorer":"https://testnet.nearblocks.io/txns/J8svzH7QALwkyhLUwPDhFQ9agu63pgpRE6AwWAEVXrqs","gasTGas":2.528622158317,"error…
- ✓ hatch #3 (timeout 2 blocks) succeeded
- evidence tx: {"label":"deposit l9g9uvb.fly-1793636729.testnet -> lab-mw29g9uv-3","hash":"84ta6wSyHC79iY3aGbsn9MFTdHQjd7wAaYnbEGWztzBV","ok":true,"explorer":"https://testnet.nearblocks.io/txns/84ta6wSyHC79iY3aGbsn9MFTdHQjd7wAaYnbEGWzt…
- ✓ f2 deposited 0.03
- evidence tx: {"label":"hatch_out lab-mw29g9uv-3","hash":"H5fSMyQrJ8x5FSidLD54EdHHo6eshapf8Yda7j5A1PVg","ok":true,"explorer":"https://testnet.nearblocks.io/txns/H5fSMyQrJ8x5FSidLD54EdHHo6eshapf8Yda7j5A1PVg","gasTGas":5.124307816635,"e…
- ✓ hatch_out succeeded without any operator or enclave signature
- ✓ the escrow is empty and the syndicate is aborted/refunded
- observed **transfers made by the contract in this transaction**: `[{"to":"l9g9uvb.fly-1793636729.testnet","near":"0.03"}]`
- observed **transfers made by the system (gas refunds, not the contract)**: `["0.000201","0.002389"]`
- ✓ the contract made exactly one transfer
- ✓ it went to the member who called hatch_out
- ✓ and it was exactly the 0.03 NEAR they deposited (no more, no less)
- note: Balance deltas were rejected as evidence here: gas refunds from earlier transactions land after a reading is taken and made a correct refund look like a double payment. The receipts above are authoritative.

### ledger: every transaction, and what the experiment cost

- observed **transactions sent**: `20`
- observed **transactions that failed (expected: the 3 attack attempts)**: `["REPLAY settle_batch lab-mw29g9uv-1","settle_batch lab-mw29g9uv-2","settle_batch lab-mw29g9uv-2","REPLAY settle_batch lab-mw29g9uv-4 (parti…`
- ✓ exactly the four attack attempts failed on chain
- observed **net NEAR spent across all accounts (gas and storage)**: `0.00173`
- ✓ the whole experiment cost less than 0.02 NEAR net (measured previously: about 0.002)

### teardown: prune the finished syndicates, compact the indexes, delete the accounts back into the master

- observed **teardown**: `{"pruned":4,"notPruned":[],"compacted":4,"deleted":4,"failed":[]}`
- ✓ every syndicate the run created was pruned (all were Settled or AbortedRefunded)
- ✓ all four accounts were deleted
- ✓ none of them exists any more
- ✓ the contract holds exactly as many syndicate records as before the run (the run left no state behind)
- observed **net cost to the master account (NEAR)**: `0.0337`
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
| preflight: write access, deployed contract, balances, storage headroom | ✓ pass | 6/6 | 4382 ms |
| MCP: hatch with the Roost's key, deposit, settle with its signature | ✓ pass | 10/10 | 10885 ms |
| MCP: a partial settlement cannot be replayed, the next needs a fresh signature | ✓ pass | 7/7 | 15109 ms |
| MCP: the non-custodial exit (hatch_out) refunds exactly the deposit | ✓ pass | 5/5 | 19136 ms |
| SDK through the API in chain mode: reads, settle and hatch-out reach the chain | ✓ pass | 17/17 | 29950 ms |
| teardown: stop the daemon, prune the run's syndicates, compact the master's index, delete the recipient | ✓ pass | 4/4 | 17750 ms |

### preflight: write access, deployed contract, balances, storage headroom

- ✓ the MCP server is in chain mode and can write
- ✓ the interface account is the lab's master account
- ✓ the deployed contract is the build expected from the wasm built from this checkout
- observed **interface account balance (NEAR)**: `19.1317`
- ✓ the interface account has at least 0.25 NEAR (an attempt costs about 0.07)
- ✓ the contract account has at least 0.15 NEAR of storage headroom
- ✓ a fresh recipient account exists

### MCP: hatch with the Roost's key, deposit, settle with its signature

- evidence mcp: {"tool":"midge_hatch_syndicate","ok":false,"error":"[FlyChainClient] hatch needs enclavePublicKey: the Roost's 32-byte Ed25519 settlement public key as 64 hex characters (not all zeros). Without it the syndicate could ne…
- ✓ hatching without an enclave key is refused before any transaction (a keyless syndicate could never settle)
- evidence mcp: {"tool":"midge_hatch_syndicate","ok":true,"status":"HATCHED_ON_CHAIN","txHash":"5gcLqBKw1iw4T9asv4KQAe93k9uqRiMaxdcSxwL8nUYK","explorer":"https://testnet.nearblocks.io/txns/5gcLqBKw1iw4T9asv4KQAe93k9uqRiMaxdcSxwL8nUYK"}
- ✓ midge_hatch_syndicate reports HATCHED_ON_CHAIN with a transaction hash
- ✓ the chain shows the Roost's settlement key
- ✓ the chain shows the allowed recipient the agent asked for
- evidence mcp: {"tool":"midge_deposit","ok":true,"status":"DEPOSITED_ON_CHAIN","txHash":"8F8XNeJMkSFWPZwP9ypk6GR3r3YTexD3Cjxb5XZHToe4","explorer":"https://testnet.nearblocks.io/txns/8F8XNeJMkSFWPZwP9ypk6GR3r3YTexD3Cjxb5XZHToe4"}
- ✓ midge_deposit reports DEPOSITED_ON_CHAIN
- ✓ the escrow is exactly 0.02 NEAR
- evidence mcp: {"tool":"midge_settle","ok":true,"status":"SETTLED_ON_CHAIN","txHash":"F1oJHaYu842b36QhAMUSyLtKSaoDTFbVMrPYpu32kWYY","explorer":"https://testnet.nearblocks.io/txns/F1oJHaYu842b36QhAMUSyLtKSaoDTFbVMrPYpu32kWYY"}
- ✓ midge_settle reports SETTLED_ON_CHAIN (it could not before: wrong argument names, wrong allocation shape, wrong hash)
- ✓ the chain shows the syndicate Settled with no escrow
- ✓ the contract made exactly one transfer, to the recipient, for exactly 0.02 NEAR
- evidence mcp: {"tool":"midge_settle","ok":false,"error":"Smart contract panicked: panicked at src/lib.rs:505:9:\nassertion `left == right` failed: [HAQ REJECT] Syndicate is not active.\n  left: Settled\n right: Active"}
- ✓ replaying the settlement through the MCP is rejected

### MCP: a partial settlement cannot be replayed, the next needs a fresh signature

- evidence mcp: {"tool":"midge_hatch_syndicate","ok":true,"status":"HATCHED_ON_CHAIN","txHash":"3RBkXqvtKFj4f7SGqDiHUxp8XHLemMz7Vf3VqciVbkVY","explorer":"https://testnet.nearblocks.io/txns/3RBkXqvtKFj4f7SGqDiHUxp8XHLemMz7Vf3VqciVbkVY"}
- ✓ hatch #2
- evidence mcp: {"tool":"midge_deposit","ok":true,"status":"DEPOSITED_ON_CHAIN","txHash":"FNc7SDd6VWJPJGnGzFi4MmJEmzidP3uf8sStwCpACz79","explorer":"https://testnet.nearblocks.io/txns/FNc7SDd6VWJPJGnGzFi4MmJEmzidP3uf8sStwCpACz79"}
- ✓ deposit 0.03
- evidence mcp: {"tool":"midge_settle","ok":true,"status":"SETTLED_ON_CHAIN","txHash":"9DMiR5Z5g9ZMXpTxQnDLe6Sknbov74KzcG1Vm9VxmZJK","explorer":"https://testnet.nearblocks.io/txns/9DMiR5Z5g9ZMXpTxQnDLe6Sknbov74KzcG1Vm9VxmZJK"}
- ✓ the partial settlement (0.01 of 0.03) succeeds
- ✓ the round nonce rotated
- evidence mcp: {"tool":"midge_settle","ok":false,"error":"Smart contract panicked: panicked at src/lib.rs:525:9:\nassertion `left == right` failed: [HAQ REJECT] Nonce mismatch. Replay attack blocked.\n  left: \"f1f2450668b3f493ede4fe81…
- ✓ replaying the same partial settlement is rejected with a nonce error
- ✓ the escrow is unchanged by the replay
- evidence mcp: {"tool":"midge_settle","ok":true,"status":"SETTLED_ON_CHAIN","txHash":"2R9NC4BU5D2A3bzrSauCGmHxmNu1yZT5QDz5CxNX3jCH","explorer":"https://testnet.nearblocks.io/txns/2R9NC4BU5D2A3bzrSauCGmHxmNu1yZT5QDz5CxNX3jCH"}
- ✓ a fresh signature on the new nonce settles the rest

### MCP: the non-custodial exit (hatch_out) refunds exactly the deposit

- evidence mcp: {"tool":"midge_hatch_syndicate","ok":true,"status":"HATCHED_ON_CHAIN","txHash":"EBXXvxRgYeo2SXMa6QBB1UApiQbZ9ZjBEdn9BUwT3FC3","explorer":"https://testnet.nearblocks.io/txns/EBXXvxRgYeo2SXMa6QBB1UApiQbZ9ZjBEdn9BUwT3FC3"}
- ✓ hatch #3 with a 2-block timeout
- evidence mcp: {"tool":"midge_deposit","ok":true,"status":"DEPOSITED_ON_CHAIN","txHash":"FZcsavesRLFzBaBzZtcCGc16ZVzAnTowc92CgndyuLZh","explorer":"https://testnet.nearblocks.io/txns/FZcsavesRLFzBaBzZtcCGc16ZVzAnTowc92CgndyuLZh"}
- ✓ deposit 0.02
- evidence mcp: {"tool":"midge_hatch_out","ok":true,"status":"HATCHED_OUT_ON_CHAIN","txHash":"ELGq765cbPheXmCAHTa97ZEyt2yLwGe95Z2G8jJoErGM","explorer":"https://testnet.nearblocks.io/txns/ELGq765cbPheXmCAHTa97ZEyt2yLwGe95Z2G8jJoErGM"}
- ✓ midge_hatch_out reports HATCHED_OUT_ON_CHAIN
- ✓ the syndicate is AbortedRefunded
- ✓ the contract refunded exactly 0.02 NEAR to the depositor, once

### SDK through the API in chain mode: reads, settle and hatch-out reach the chain

- ✓ the daemon is in chain mode with write access
- ✓ listSyndicates over the API returns the chain's record count as total and the newest first
- ✓ the first newest-first page includes this run's syndicates without walking every page (it did not, ascending, once the chain held more than a page)
- observed **syndicates in the interface account's index (total)**: `4`
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
- evidence mcp: {"tool":"midge_hatch_syndicate","ok":true,"status":"HATCHED_ON_CHAIN","txHash":"EBBjYvQPVnmTVEZV16e9e7bVfRe3mLkgKw7YDJyxDKZW","explorer":"https://testnet.nearblocks.io/txns/EBBjYvQPVnmTVEZV16e9e7bVfRe3mLkgKw7YDJyxDKZW"}
- ✓ hatch #5 with a 2-block timeout
- evidence mcp: {"tool":"midge_deposit","ok":true,"status":"DEPOSITED_ON_CHAIN","txHash":"6Hurwr43eLVcQRQcVEWbtRqcQuL26r5JojNgPfuCe5H1","explorer":"https://testnet.nearblocks.io/txns/6Hurwr43eLVcQRQcVEWbtRqcQuL26r5JojNgPfuCe5H1"}
- ✓ deposit 0.02
- ✓ sdk.hatchOut -> API -> chain returns HATCHED_OUT_ON_CHAIN
- ✓ the chain shows the escrow refunded

### teardown: stop the daemon, prune the run's syndicates, compact the master's index, delete the recipient

- observed **teardown**: `{"pruned":5,"notPruned":[],"deleted":["i9ihker.fly-1793636729.testnet"],"masterIndexCompacted":true}`
- ✓ every syndicate the run created was pruned
- ✓ the recipient account was deleted and no longer exists
- ✓ the contract holds exactly as many records as before the run
- observed **interface account net change (NEAR)**: `-0.09568`
- ✓ an attempt cost the interface account less than 0.12 NEAR

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
