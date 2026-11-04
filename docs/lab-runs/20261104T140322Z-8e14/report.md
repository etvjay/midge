# Lab run 20261104T140322Z-8e14

- **Code:** `606c0d98641c7907913b1c5ba6f2df1a70df12a7` on `master` (clean tree)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `8a0180ff698c44b5…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 158 events, hash-chained; root `6a0d99e8e4e472217b1274644c6a73ac7a7327ebefc70b79a8a550796e697d12`. Verify with `node lab/verify-run.js lab/runs/20261104T140322Z-8e14`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-IFACE-CHAIN The MCP server, the SDK and the API drive the real contract on NEAR testnet, end to end | testnet | **PASS** | 6 | 45 | 2 attempts: PASS, PASS |

## E-IFACE-CHAIN: The MCP server, the SDK and the API drive the real contract on NEAR testnet, end to end

**Hypothesis.** An agent using only the MCP tools (or the SDK through the API) can hatch a syndicate with a real Roost key, deposit, settle with the Roost's signature, and exit with hatch_out, and the chain shows exactly what the interface reported. Replaying a partial settlement through the interface is rejected. The failure that must NOT happen: an interface that reports a transaction it did not make, or cannot make the transaction its own documentation describes.

**What this does not prove**
- The Roost is a local HostedRoost with a simulated attestation provider: this tests the interfaces and the chain, not hardware.
- The interface account is the repository's master testnet account; one operator is every party. Recipients and the depositor are accounts the operator controls.
- Hatch, deposit and settle go through the chain client; the API's hatch and deposit routes still use the in-memory model (GAP-016) and are not driven here. Only the API's chain-backed routes are.
- Testnet only, one date. The contract has not been audited by a third party.

| Step | Result | Assertions | Time |
|---|---|---|---|
| preflight: write access, deployed contract, balances, storage headroom | ✓ pass | 5/5 | 1736 ms |
| MCP: hatch with the Roost's key, deposit, settle with its signature | ✓ pass | 10/10 | 12717 ms |
| MCP: a partial settlement cannot be replayed, the next needs a fresh signature | ✓ pass | 7/7 | 15637 ms |
| MCP: the non-custodial exit (hatch_out) refunds exactly the deposit | ✓ pass | 5/5 | 18716 ms |
| SDK through the API in chain mode: reads, settle and hatch-out reach the chain | ✓ pass | 16/16 | 28343 ms |
| stop the daemon and return the recipient's funds to the interface account | ✓ pass | 2/2 | 2410 ms |

### preflight: write access, deployed contract, balances, storage headroom

- ✓ the MCP server is in chain mode and can write
- ✓ the interface account is the lab's master account
- ✓ the deployed contract is the build this lab was written against
- observed **interface account balance (NEAR)**: `10.1756`
- ✓ the interface account has at least 0.25 NEAR (an attempt costs about 0.07)
- ✓ the contract account has at least 0.15 NEAR of storage headroom

### MCP: hatch with the Roost's key, deposit, settle with its signature

- evidence mcp: {"tool":"midge_hatch_syndicate","ok":false,"error":"[FlyChainClient] hatch needs enclavePublicKey: the Roost's 32-byte Ed25519 settlement public key as 64 hex characters (not all zeros). Without it the syndicate could ne…
- ✓ hatching without an enclave key is refused before any transaction (a keyless syndicate could never settle)
- evidence mcp: {"tool":"midge_hatch_syndicate","ok":true,"status":"HATCHED_ON_CHAIN","txHash":"GsSWmWcxgWh98iUYGFaVi4am6xLGxivuNmpT2aJWXA19","explorer":"https://testnet.nearblocks.io/txns/GsSWmWcxgWh98iUYGFaVi4am6xLGxivuNmpT2aJWXA19"}
- ✓ midge_hatch_syndicate reports HATCHED_ON_CHAIN with a transaction hash
- ✓ the chain shows the Roost's settlement key
- ✓ the chain shows the allowed recipient the agent asked for
- evidence mcp: {"tool":"midge_deposit","ok":true,"status":"DEPOSITED_ON_CHAIN","txHash":"8bZeUbLF3DJXkU6Y9eWizmsh5EiH1kqBBzMXiu9911Nf","explorer":"https://testnet.nearblocks.io/txns/8bZeUbLF3DJXkU6Y9eWizmsh5EiH1kqBBzMXiu9911Nf"}
- ✓ midge_deposit reports DEPOSITED_ON_CHAIN
- ✓ the escrow is exactly 0.02 NEAR
- evidence mcp: {"tool":"midge_settle","ok":true,"status":"SETTLED_ON_CHAIN","txHash":"9pBGaQnqAGzvQ5PNy1bpRm9rMAq6CMGjERYdrAfmh3E","explorer":"https://testnet.nearblocks.io/txns/9pBGaQnqAGzvQ5PNy1bpRm9rMAq6CMGjERYdrAfmh3E"}
- ✓ midge_settle reports SETTLED_ON_CHAIN (it could not before: wrong argument names, wrong allocation shape, wrong hash)
- ✓ the chain shows the syndicate Settled with no escrow
- ✓ the contract made exactly one transfer, to the recipient, for exactly 0.02 NEAR
- evidence mcp: {"tool":"midge_settle","ok":false,"error":"Smart contract panicked: panicked at src/lib.rs:505:9:\nassertion `left == right` failed: [HAQ REJECT] Syndicate is not active.\n  left: Settled\n right: Active"}
- ✓ replaying the settlement through the MCP is rejected

### MCP: a partial settlement cannot be replayed, the next needs a fresh signature

- evidence mcp: {"tool":"midge_hatch_syndicate","ok":true,"status":"HATCHED_ON_CHAIN","txHash":"AwcghCYjyqNPLCLLLu5RQUrBQbFYB4j4qcwMeLtTykS4","explorer":"https://testnet.nearblocks.io/txns/AwcghCYjyqNPLCLLLu5RQUrBQbFYB4j4qcwMeLtTykS4"}
- ✓ hatch #2
- evidence mcp: {"tool":"midge_deposit","ok":true,"status":"DEPOSITED_ON_CHAIN","txHash":"5sjahc2XPiGAzPVzNzJ8f6SRVQjixorGv4FqVVdRgdgR","explorer":"https://testnet.nearblocks.io/txns/5sjahc2XPiGAzPVzNzJ8f6SRVQjixorGv4FqVVdRgdgR"}
- ✓ deposit 0.03
- evidence mcp: {"tool":"midge_settle","ok":true,"status":"SETTLED_ON_CHAIN","txHash":"6DiaykgvE8jgPriGaaEzjJwMvi2Cg1F8AGpJNqX8pjrH","explorer":"https://testnet.nearblocks.io/txns/6DiaykgvE8jgPriGaaEzjJwMvi2Cg1F8AGpJNqX8pjrH"}
- ✓ the partial settlement (0.01 of 0.03) succeeds
- ✓ the round nonce rotated
- evidence mcp: {"tool":"midge_settle","ok":false,"error":"Smart contract panicked: panicked at src/lib.rs:525:9:\nassertion `left == right` failed: [HAQ REJECT] Nonce mismatch. Replay attack blocked.\n  left: \"ddaf0c8f0ad835d060747db5…
- ✓ replaying the same partial settlement is rejected with a nonce error
- ✓ the escrow is unchanged by the replay
- evidence mcp: {"tool":"midge_settle","ok":true,"status":"SETTLED_ON_CHAIN","txHash":"3EM2Q9sNHHnSyo5aGDGsMekZt4B9VU2FjuoQ8HFmkeDm","explorer":"https://testnet.nearblocks.io/txns/3EM2Q9sNHHnSyo5aGDGsMekZt4B9VU2FjuoQ8HFmkeDm"}
- ✓ a fresh signature on the new nonce settles the rest

### MCP: the non-custodial exit (hatch_out) refunds exactly the deposit

- evidence mcp: {"tool":"midge_hatch_syndicate","ok":true,"status":"HATCHED_ON_CHAIN","txHash":"2w4MCqmcWgKxMrSn41RpUvMd43obg27daJGzXsQKrrrm","explorer":"https://testnet.nearblocks.io/txns/2w4MCqmcWgKxMrSn41RpUvMd43obg27daJGzXsQKrrrm"}
- ✓ hatch #3 with a 2-block timeout
- evidence mcp: {"tool":"midge_deposit","ok":true,"status":"DEPOSITED_ON_CHAIN","txHash":"DLvMUiccRUfHXoeQWviniLg6jHiz5cqt3eoVSN959zCY","explorer":"https://testnet.nearblocks.io/txns/DLvMUiccRUfHXoeQWviniLg6jHiz5cqt3eoVSN959zCY"}
- ✓ deposit 0.02
- evidence mcp: {"tool":"midge_hatch_out","ok":true,"status":"HATCHED_OUT_ON_CHAIN","txHash":"5UVVt2GLPdvb4er6knXzZ4NSvUvCh1i8AzUUuUKgbxu6","explorer":"https://testnet.nearblocks.io/txns/5UVVt2GLPdvb4er6knXzZ4NSvUvCh1i8AzUUuUKgbxu6"}
- ✓ midge_hatch_out reports HATCHED_OUT_ON_CHAIN
- ✓ the syndicate is AbortedRefunded
- ✓ the contract refunded exactly 0.02 NEAR to the depositor, once

### SDK through the API in chain mode: reads, settle and hatch-out reach the chain

- ✓ the daemon is in chain mode with write access
- ✓ listSyndicates over the API returns the chain's newest syndicates
- ✓ getSyndicatesByMember reads the chain and includes the syndicates this run created for the account
- ✓ sdk.hatchSyndicate -> API -> chain hatches on chain, with a transaction hash and the round nonce (GAP-016: it used to create an in-memory model syndicate)
- ✓ the chain really has it, with the Roost's key
- ✓ sdk.deposit -> API -> chain deposits on chain
- ✓ sdk.getSyndicate reads the chain: the id, the exact escrow, the nonce and the flyer (it used to 404 for anything on chain)
- ✓ an id that is not on chain is a 404
- ✓ the timelock view reads the chain: 50 blocks, some elapsed, a real current block
- ✓ sdk.settleBatch -> API -> chain returns SETTLED_ON_CHAIN
- ✓ the chain shows it Settled
- ✓ a settle without nonce, hash or signature is refused with an explanation, and sends nothing
- evidence mcp: {"tool":"midge_hatch_syndicate","ok":true,"status":"HATCHED_ON_CHAIN","txHash":"ChTT8XFgngdtdyqi5nwhKUHrfUFbnMYnzHrniR11F1d8","explorer":"https://testnet.nearblocks.io/txns/ChTT8XFgngdtdyqi5nwhKUHrfUFbnMYnzHrniR11F1d8"}
- ✓ hatch #5 with a 2-block timeout
- evidence mcp: {"tool":"midge_deposit","ok":true,"status":"DEPOSITED_ON_CHAIN","txHash":"8NWrNaVoNAjAjx4SeHc7mhDNToSRfdFnyKfLn4PmYN4F","explorer":"https://testnet.nearblocks.io/txns/8NWrNaVoNAjAjx4SeHc7mhDNToSRfdFnyKfLn4PmYN4F"}
- ✓ deposit 0.02
- ✓ sdk.hatchOut -> API -> chain returns HATCHED_OUT_ON_CHAIN
- ✓ the chain shows the escrow refunded

### stop the daemon and return the recipient's funds to the interface account

- observed **recipient gained (NEAR)**: `0.07`
- evidence tx: {"label":"return 0.06 NEAR to fly-1793636729.testnet","hash":"6nXtGJgjhhZZkJ9Ab5McgaQwwskzfXgyx2QySVVgBTvM","ok":true,"explorer":"https://testnet.nearblocks.io/txns/6nXtGJgjhhZZkJ9Ab5McgaQwwskzfXgyx2QySVVgBTvM","error":n…
- ✓ the funds were returned so the experiment can be repeated
- observed **interface account net change (NEAR)**: `-0.06594`
- ✓ an attempt cost the interface account less than 0.12 NEAR

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
