# Lab run 20261104T134019Z-e0c7

- **Code:** `6935b3ec12940f7c565c04d36d167e53067245d4` on `master` (clean tree)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `8a0180ff698c44b5…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 158 events, hash-chained; root `74b03ab5de5820890f3ebf48df2aa7500d9af0376c05e94a75639be64d421919`. Verify with `node lab/verify-run.js lab/runs/20261104T134019Z-e0c7`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-IFACE-CHAIN The MCP server, the SDK and the API drive the real contract on NEAR testnet, end to end | testnet | **PASS** | 6 | 42 | 2 attempts: PASS, PASS |

## E-IFACE-CHAIN: The MCP server, the SDK and the API drive the real contract on NEAR testnet, end to end

**Hypothesis.** An agent using only the MCP tools (or the SDK through the API) can hatch a syndicate with a real Roost key, deposit, settle with the Roost's signature, and exit with hatch_out, and the chain shows exactly what the interface reported. Replaying a partial settlement through the interface is rejected. The failure that must NOT happen: an interface that reports a transaction it did not make, or cannot make the transaction its own documentation describes.

**What this does not prove**
- The Roost is a local HostedRoost with a simulated attestation provider: this tests the interfaces and the chain, not hardware.
- The interface account is the repository's master testnet account; one operator is every party. Recipients and the depositor are accounts the operator controls.
- Hatch, deposit and settle go through the chain client; the API's hatch and deposit routes still use the in-memory model (GAP-016) and are not driven here. Only the API's chain-backed routes are.
- Testnet only, one date. The contract has not been audited by a third party.

| Step | Result | Assertions | Time |
|---|---|---|---|
| preflight: write access, deployed contract, balances, storage headroom | ✓ pass | 5/5 | 955 ms |
| MCP: hatch with the Roost's key, deposit, settle with its signature | ✓ pass | 10/10 | 11867 ms |
| MCP: a partial settlement cannot be replayed, the next needs a fresh signature | ✓ pass | 7/7 | 14622 ms |
| MCP: the non-custodial exit (hatch_out) refunds exactly the deposit | ✓ pass | 5/5 | 18168 ms |
| SDK through the API in chain mode: reads, settle and hatch-out reach the chain | ✓ pass | 13/13 | 28404 ms |
| stop the daemon and return the recipient's funds to the interface account | ✓ pass | 2/2 | 2538 ms |

### preflight: write access, deployed contract, balances, storage headroom

- ✓ the MCP server is in chain mode and can write
- ✓ the interface account is the lab's master account
- ✓ the deployed contract is the build this lab was written against
- observed **interface account balance (NEAR)**: `0.4395`
- ✓ the interface account has at least 0.25 NEAR (an attempt costs about 0.07)
- ✓ the contract account has at least 0.15 NEAR of storage headroom

### MCP: hatch with the Roost's key, deposit, settle with its signature

- evidence mcp: {"tool":"midge_hatch_syndicate","ok":false,"error":"[FlyChainClient] hatch needs enclavePublicKey: the Roost's 32-byte Ed25519 settlement public key as 64 hex characters (not all zeros). Without it the syndicate could ne…
- ✓ hatching without an enclave key is refused before any transaction (a keyless syndicate could never settle)
- evidence mcp: {"tool":"midge_hatch_syndicate","ok":true,"status":"HATCHED_ON_CHAIN","txHash":"BpiUEjx4GrWdkyeYC5aNMgL9sQLU23qcP6EUWb8umnTh","explorer":"https://testnet.nearblocks.io/txns/BpiUEjx4GrWdkyeYC5aNMgL9sQLU23qcP6EUWb8umnTh"}
- ✓ midge_hatch_syndicate reports HATCHED_ON_CHAIN with a transaction hash
- ✓ the chain shows the Roost's settlement key
- ✓ the chain shows the allowed recipient the agent asked for
- evidence mcp: {"tool":"midge_deposit","ok":true,"status":"DEPOSITED_ON_CHAIN","txHash":"D6KiyLekxqPEDbfnmMyGtZaP6WatLLdv4RNWNqsSjyNp","explorer":"https://testnet.nearblocks.io/txns/D6KiyLekxqPEDbfnmMyGtZaP6WatLLdv4RNWNqsSjyNp"}
- ✓ midge_deposit reports DEPOSITED_ON_CHAIN
- ✓ the escrow is exactly 0.02 NEAR
- evidence mcp: {"tool":"midge_settle","ok":true,"status":"SETTLED_ON_CHAIN","txHash":"H4yyw5caEP1AvVaXCmMJaBxgacauVAh5akvWEwj1FyoY","explorer":"https://testnet.nearblocks.io/txns/H4yyw5caEP1AvVaXCmMJaBxgacauVAh5akvWEwj1FyoY"}
- ✓ midge_settle reports SETTLED_ON_CHAIN (it could not before: wrong argument names, wrong allocation shape, wrong hash)
- ✓ the chain shows the syndicate Settled with no escrow
- ✓ the contract made exactly one transfer, to the recipient, for exactly 0.02 NEAR
- evidence mcp: {"tool":"midge_settle","ok":false,"error":"Smart contract panicked: panicked at src/lib.rs:505:9:\nassertion `left == right` failed: [HAQ REJECT] Syndicate is not active.\n  left: Settled\n right: Active"}
- ✓ replaying the settlement through the MCP is rejected

### MCP: a partial settlement cannot be replayed, the next needs a fresh signature

- evidence mcp: {"tool":"midge_hatch_syndicate","ok":true,"status":"HATCHED_ON_CHAIN","txHash":"HP9JkrsUxRP4yuCoM5DWpZ524XZcbj5nP2TG47LcjeLg","explorer":"https://testnet.nearblocks.io/txns/HP9JkrsUxRP4yuCoM5DWpZ524XZcbj5nP2TG47LcjeLg"}
- ✓ hatch #2
- evidence mcp: {"tool":"midge_deposit","ok":true,"status":"DEPOSITED_ON_CHAIN","txHash":"BCtCRpb6dsCsNEoWdYjgjhoGYsg5JSWEohc4N4ieGXL5","explorer":"https://testnet.nearblocks.io/txns/BCtCRpb6dsCsNEoWdYjgjhoGYsg5JSWEohc4N4ieGXL5"}
- ✓ deposit 0.03
- evidence mcp: {"tool":"midge_settle","ok":true,"status":"SETTLED_ON_CHAIN","txHash":"GfzYQhBrMTp4KEjZJaVxu9WnmAf7SSTbxi8wc7XfU7FB","explorer":"https://testnet.nearblocks.io/txns/GfzYQhBrMTp4KEjZJaVxu9WnmAf7SSTbxi8wc7XfU7FB"}
- ✓ the partial settlement (0.01 of 0.03) succeeds
- ✓ the round nonce rotated
- evidence mcp: {"tool":"midge_settle","ok":false,"error":"Smart contract panicked: panicked at src/lib.rs:525:9:\nassertion `left == right` failed: [HAQ REJECT] Nonce mismatch. Replay attack blocked.\n  left: \"194d8b1a6f01f17b8d05cf94…
- ✓ replaying the same partial settlement is rejected with a nonce error
- ✓ the escrow is unchanged by the replay
- evidence mcp: {"tool":"midge_settle","ok":true,"status":"SETTLED_ON_CHAIN","txHash":"GA1ZPafZW3qHKsmxuBDEs5WX1KkW5CABFfm3veQ3KUxX","explorer":"https://testnet.nearblocks.io/txns/GA1ZPafZW3qHKsmxuBDEs5WX1KkW5CABFfm3veQ3KUxX"}
- ✓ a fresh signature on the new nonce settles the rest

### MCP: the non-custodial exit (hatch_out) refunds exactly the deposit

- evidence mcp: {"tool":"midge_hatch_syndicate","ok":true,"status":"HATCHED_ON_CHAIN","txHash":"FHLwVUsYQYt8rsDCvKF7WB3HQYaE98wYzhiE658867j","explorer":"https://testnet.nearblocks.io/txns/FHLwVUsYQYt8rsDCvKF7WB3HQYaE98wYzhiE658867j"}
- ✓ hatch #3 with a 2-block timeout
- evidence mcp: {"tool":"midge_deposit","ok":true,"status":"DEPOSITED_ON_CHAIN","txHash":"GFTNoT1Js7kG4XJtTwvUWL4mSL28NR7dCkTjBr11LHNA","explorer":"https://testnet.nearblocks.io/txns/GFTNoT1Js7kG4XJtTwvUWL4mSL28NR7dCkTjBr11LHNA"}
- ✓ deposit 0.02
- evidence mcp: {"tool":"midge_hatch_out","ok":true,"status":"HATCHED_OUT_ON_CHAIN","txHash":"Ak9BVFbyE6o2JyUM6PoffNm5vGm9XDZC8CkauAyJPDXG","explorer":"https://testnet.nearblocks.io/txns/Ak9BVFbyE6o2JyUM6PoffNm5vGm9XDZC8CkauAyJPDXG"}
- ✓ midge_hatch_out reports HATCHED_OUT_ON_CHAIN
- ✓ the syndicate is AbortedRefunded
- ✓ the contract refunded exactly 0.02 NEAR to the depositor, once

### SDK through the API in chain mode: reads, settle and hatch-out reach the chain

- ✓ the daemon is in chain mode with write access
- ✓ listSyndicates over the API returns the chain's newest syndicates
- ✓ getSyndicatesByMember reads the chain and includes the syndicates this run created for the account
- ✓ GAP-016 (pinned): get-by-id on a syndicate that exists on chain is a 404, because that route reads the in-memory model
- evidence mcp: {"tool":"midge_hatch_syndicate","ok":true,"status":"HATCHED_ON_CHAIN","txHash":"75GBneKf7GCuWG857KZv4FixhPgxTucYqgHmkHCagfc1","explorer":"https://testnet.nearblocks.io/txns/75GBneKf7GCuWG857KZv4FixhPgxTucYqgHmkHCagfc1"}
- ✓ hatch #4 (through the MCP; the API's hatch route is the model)
- evidence mcp: {"tool":"midge_deposit","ok":true,"status":"DEPOSITED_ON_CHAIN","txHash":"4jwHrho7F2T6j9tBRaQtjy7bwZ8zwGzaJ2SSKqbst9FH","explorer":"https://testnet.nearblocks.io/txns/4jwHrho7F2T6j9tBRaQtjy7bwZ8zwGzaJ2SSKqbst9FH"}
- ✓ deposit 0.02
- ✓ sdk.settleBatch -> API -> chain returns SETTLED_ON_CHAIN
- ✓ the chain shows it Settled
- ✓ a settle without nonce, hash or signature is refused with an explanation, and sends nothing
- evidence mcp: {"tool":"midge_hatch_syndicate","ok":true,"status":"HATCHED_ON_CHAIN","txHash":"9da9uomUQ8BySK3iD4UQ4i62hoVPE9Zjn1xQNr2wY5r2","explorer":"https://testnet.nearblocks.io/txns/9da9uomUQ8BySK3iD4UQ4i62hoVPE9Zjn1xQNr2wY5r2"}
- ✓ hatch #5 with a 2-block timeout
- evidence mcp: {"tool":"midge_deposit","ok":true,"status":"DEPOSITED_ON_CHAIN","txHash":"BLEw2MaW3jiWuLYrs9j8gzGR8JzFtS1KMCQ1VngiXN6j","explorer":"https://testnet.nearblocks.io/txns/BLEw2MaW3jiWuLYrs9j8gzGR8JzFtS1KMCQ1VngiXN6j"}
- ✓ deposit 0.02
- ✓ sdk.hatchOut -> API -> chain returns HATCHED_OUT_ON_CHAIN
- ✓ the chain shows the escrow refunded

### stop the daemon and return the recipient's funds to the interface account

- observed **recipient gained (NEAR)**: `0.07`
- evidence tx: {"label":"return 0.06 NEAR to fly-1793636729.testnet","hash":"7jpANKKxAZDZAp3pVGGDYWTfHnDGRF6Ef769wUCC41xL","ok":true,"explorer":"https://testnet.nearblocks.io/txns/7jpANKKxAZDZAp3pVGGDYWTfHnDGRF6Ef769wUCC41xL","error":n…
- ✓ the funds were returned so the experiment can be repeated
- observed **interface account net change (NEAR)**: `-0.06589`
- ✓ an attempt cost the interface account less than 0.12 NEAR

## Problems found

| Severity | Where | Problem |
|---|---|---|
| major | E-IFACE-CHAIN / SDK through the API in chain mode: reads, settle and hatch-out reach the chain | GAP-016: in chain mode GET /v1/syndicates/:id, hatch and deposit use the in-memory model, so an agent that lists syndicates from the chain cannot fetch any of them by id through the same API |
| major | E-IFACE-CHAIN / SDK through the API in chain mode: reads, settle and hatch-out reach the chain | GAP-016: in chain mode GET /v1/syndicates/:id, hatch and deposit use the in-memory model, so an agent that lists syndicates from the chain cannot fetch any of them by id through the same API |
