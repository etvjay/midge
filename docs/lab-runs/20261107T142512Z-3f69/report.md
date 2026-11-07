# Lab run 20261107T142512Z-3f69

- **Code:** `41e02aa400c304e8d2b9adfe368d0dd86add8791` on `master` (**3 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `8a0180ff698c44b5…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 89 events, hash-chained; root `493d1b4799425059eab69b2338a864d88bbd5915a107ac90ae7fb88f92197376`. Verify with `node lab/verify-run.js lab/runs/20261107T142512Z-3f69`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-IFACE-CHAIN The MCP server, the SDK and the API drive the real contract on NEAR testnet, end to end | testnet | **PASS** | 6 | 52 |  |

## E-IFACE-CHAIN: The MCP server, the SDK and the API drive the real contract on NEAR testnet, end to end

**Hypothesis.** An agent using only the MCP tools (or the SDK through the API) can hatch a syndicate with a real Roost key, deposit, settle with the Roost's signature, and exit with hatch_out, and the chain shows exactly what the interface reported. Replaying a partial settlement through the interface is rejected. The failure that must NOT happen: an interface that reports a transaction it did not make, or cannot make the transaction its own documentation describes.

**What this does not prove**
- The Roost is a local HostedRoost with a simulated attestation provider: this tests the interfaces and the chain, not hardware.
- The interface account is the repository's master testnet account; one operator is every party. Recipients and the depositor are accounts the operator controls.
- Hatch, deposit and settle go through the chain client; the API's hatch and deposit routes still use the in-memory model (GAP-016) and are not driven here. Only the API's chain-backed routes are.
- Testnet only, one date. The contract has not been audited by a third party.

| Step | Result | Assertions | Time |
|---|---|---|---|
| preflight: write access, deployed contract, balances, storage headroom | ✓ pass | 6/6 | 4372 ms |
| MCP: hatch with the Roost's key, deposit, settle with its signature | ✓ pass | 13/13 | 11896 ms |
| MCP: a partial settlement cannot be replayed, the next needs a fresh signature | ✓ pass | 7/7 | 14923 ms |
| MCP: the non-custodial exit (hatch_out) refunds exactly the deposit | ✓ pass | 5/5 | 20804 ms |
| SDK through the API in chain mode: reads, settle and hatch-out reach the chain | ✓ pass | 17/17 | 31668 ms |
| teardown: stop the daemon, prune the run's syndicates, compact the master's index, delete the recipient | ✓ pass | 4/4 | 20403 ms |

### preflight: write access, deployed contract, balances, storage headroom

- ✓ the MCP server is in chain mode and can write
- ✓ the interface account is the lab's master account
- ✓ the deployed contract is the build expected from the wasm built from this checkout
- observed **interface account balance (NEAR)**: `15.9091`
- ✓ the interface account has at least 0.25 NEAR (an attempt costs about 0.07)
- ✓ the contract account has at least 0.15 NEAR of storage headroom
- ✓ a fresh recipient account exists

### MCP: hatch with the Roost's key, deposit, settle with its signature

- evidence mcp: {"tool":"midge_hatch_syndicate","ok":false,"error":"[FlyChainClient] hatch needs enclavePublicKey: the Roost's 32-byte Ed25519 settlement public key as 64 hex characters (not all zeros). Without it the syndicate could ne…
- ✓ hatching without an enclave key is refused before any transaction (a keyless syndicate could never settle)
- evidence mcp: {"tool":"midge_hatch_syndicate","ok":true,"status":"HATCHED_ON_CHAIN","txHash":"FGgkDDqMWAGNPh3XnzNEbbfuz7LTcp9fJanZmfA4An6g","explorer":"https://testnet.nearblocks.io/txns/FGgkDDqMWAGNPh3XnzNEbbfuz7LTcp9fJanZmfA4An6g"}
- ✓ midge_hatch_syndicate reports HATCHED_ON_CHAIN with a transaction hash
- ✓ the chain shows the Roost's settlement key
- ✓ the chain shows the allowed recipient the agent asked for
- evidence mcp: {"tool":"midge_deposit","ok":false,"error":"[FlyChainClient] a deposit consents to a group's terms, so state them: pass policyHash (computed from the terms you expect) or expect { allowedRecipients, maxReleaseBps, settle…
- ✓ a deposit that states no terms is refused, and the tool does not copy the hash from the contract
- evidence mcp: {"tool":"midge_deposit","ok":false,"error":"[FlyChainClient] refusing to deposit, the group's terms differ from what you expected: exit timer: you expected 300 blocks, the group has 50"}
- ✓ a deposit that expected a 300-block timer into a 50-block group is refused
- ✓ neither refused deposit changed the escrow
- evidence mcp: {"tool":"midge_deposit","ok":true,"status":"DEPOSITED_ON_CHAIN","txHash":"4rBtmN3LYRF2eLmzB86JS5RsTFRv7rhasWxGU6rjfWJm","explorer":"https://testnet.nearblocks.io/txns/4rBtmN3LYRF2eLmzB86JS5RsTFRv7rhasWxGU6rjfWJm"}
- ✓ midge_deposit reports DEPOSITED_ON_CHAIN
- ✓ the escrow is exactly 0.02 NEAR
- evidence mcp: {"tool":"midge_settle","ok":true,"status":"SETTLED_ON_CHAIN","txHash":"GqaPtAy6HDss7HjoKTiCRt9RjHn55nXqw2JiyWvJquaa","explorer":"https://testnet.nearblocks.io/txns/GqaPtAy6HDss7HjoKTiCRt9RjHn55nXqw2JiyWvJquaa"}
- ✓ midge_settle reports SETTLED_ON_CHAIN (it could not before: wrong argument names, wrong allocation shape, wrong hash)
- ✓ the chain shows the syndicate Settled with no escrow
- ✓ the contract made exactly one transfer, to the recipient, for exactly 0.02 NEAR
- evidence mcp: {"tool":"midge_settle","ok":false,"error":"Smart contract panicked: panicked at src/lib.rs:846:9:\nassertion `left == right` failed: [HAQ REJECT] Syndicate is not active.\n  left: Settled\n right: Active"}
- ✓ replaying the settlement through the MCP is rejected

### MCP: a partial settlement cannot be replayed, the next needs a fresh signature

- evidence mcp: {"tool":"midge_hatch_syndicate","ok":true,"status":"HATCHED_ON_CHAIN","txHash":"F5ynUt81taBPhamQEa2B82C4VzdMJozpDHrnJmq2QKzq","explorer":"https://testnet.nearblocks.io/txns/F5ynUt81taBPhamQEa2B82C4VzdMJozpDHrnJmq2QKzq"}
- ✓ hatch #2
- evidence mcp: {"tool":"midge_deposit","ok":true,"status":"DEPOSITED_ON_CHAIN","txHash":"7rP7uCZTGH1M4bfbnt3h8xcnbx5er8nrevmXqw2tFHLb","explorer":"https://testnet.nearblocks.io/txns/7rP7uCZTGH1M4bfbnt3h8xcnbx5er8nrevmXqw2tFHLb"}
- ✓ deposit 0.03
- evidence mcp: {"tool":"midge_settle","ok":true,"status":"SETTLED_ON_CHAIN","txHash":"E49MYnRSW1obYsgfbMsKf1GzL6N1sjwNT5MvGG3xbVYU","explorer":"https://testnet.nearblocks.io/txns/E49MYnRSW1obYsgfbMsKf1GzL6N1sjwNT5MvGG3xbVYU"}
- ✓ the partial settlement (0.01 of 0.03) succeeds
- ✓ the round nonce rotated
- evidence mcp: {"tool":"midge_settle","ok":false,"error":"Smart contract panicked: panicked at src/lib.rs:866:9:\nassertion `left == right` failed: [HAQ REJECT] Nonce mismatch. Replay attack blocked.\n  left: \"68e1c00381364ff0c6aee469…
- ✓ replaying the same partial settlement is rejected with a nonce error
- ✓ the escrow is unchanged by the replay
- evidence mcp: {"tool":"midge_settle","ok":true,"status":"SETTLED_ON_CHAIN","txHash":"AwwjoEFgJduGrqGsvaZvZKtNGRRQBq4hXbwZA2kqfsdc","explorer":"https://testnet.nearblocks.io/txns/AwwjoEFgJduGrqGsvaZvZKtNGRRQBq4hXbwZA2kqfsdc"}
- ✓ a fresh signature on the new nonce settles the rest

### MCP: the non-custodial exit (hatch_out) refunds exactly the deposit

- evidence mcp: {"tool":"midge_hatch_syndicate","ok":true,"status":"HATCHED_ON_CHAIN","txHash":"CcAgr3ELYA2SSCdAPJKLu9frQEVBkkKH95KHqxrjrrHK","explorer":"https://testnet.nearblocks.io/txns/CcAgr3ELYA2SSCdAPJKLu9frQEVBkkKH95KHqxrjrrHK"}
- ✓ hatch #3 with a 10-block timeout (the contract floor)
- evidence mcp: {"tool":"midge_deposit","ok":true,"status":"DEPOSITED_ON_CHAIN","txHash":"2rz7w3CrU6Cr3mmsfAMP8gFiqbwHJGCVYUwFaEFMgJUT","explorer":"https://testnet.nearblocks.io/txns/2rz7w3CrU6Cr3mmsfAMP8gFiqbwHJGCVYUwFaEFMgJUT"}
- ✓ deposit 0.02
- evidence mcp: {"tool":"midge_hatch_out","ok":true,"status":"HATCHED_OUT_ON_CHAIN","txHash":"EdsVSFmMteUJyz4JbwPeQj4pXy74EZ4XSbiQ9fHEcHoD","explorer":"https://testnet.nearblocks.io/txns/EdsVSFmMteUJyz4JbwPeQj4pXy74EZ4XSbiQ9fHEcHoD"}
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
- evidence mcp: {"tool":"midge_hatch_syndicate","ok":true,"status":"HATCHED_ON_CHAIN","txHash":"GcXpVGe7W8ivMAbbqVVW1dxthHp2ZibKn7k4zCu772gJ","explorer":"https://testnet.nearblocks.io/txns/GcXpVGe7W8ivMAbbqVVW1dxthHp2ZibKn7k4zCu772gJ"}
- ✓ hatch #5 with a 10-block timeout (the contract floor)
- evidence mcp: {"tool":"midge_deposit","ok":true,"status":"DEPOSITED_ON_CHAIN","txHash":"F27NVfEwRexgcwQP9LNajMDc2FaCD7htCrk4rRHsPH7U","explorer":"https://testnet.nearblocks.io/txns/F27NVfEwRexgcwQP9LNajMDc2FaCD7htCrk4rRHsPH7U"}
- ✓ deposit 0.02
- ✓ sdk.hatchOut -> API -> chain returns HATCHED_OUT_ON_CHAIN
- ✓ the chain shows the escrow refunded

### teardown: stop the daemon, prune the run's syndicates, compact the master's index, delete the recipient

- observed **teardown**: `{"pruned":5,"notPruned":[],"deleted":["ihwiq5r.fly-1793636729.testnet"],"masterIndexCompacted":true}`
- ✓ every syndicate the run created was pruned
- ✓ the recipient account was deleted and no longer exists
- ✓ the contract holds exactly as many records as before the run
- observed **interface account net change (NEAR)**: `-0.06562`
- ✓ an attempt cost the interface account less than 0.12 NEAR

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
