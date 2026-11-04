# Lab run 20261104T141947Z-2fa1

- **Code:** `355928f912e752528a8ee16b38282ec487a90897` on `master` (**7 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `8a0180ff698c44b5…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 239 events, hash-chained; root `fd64c5e5083a59e86e753041c5200ed731de3f2c8b7582a845122bc6fd076d5b`. Verify with `node lab/verify-run.js lab/runs/20261104T141947Z-2fa1`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-IFACE-CHAIN The MCP server, the SDK and the API drive the real contract on NEAR testnet, end to end | testnet | **PASS** | 6 | 45 | 3 attempts: PASS, PASS, PASS |

## E-IFACE-CHAIN: The MCP server, the SDK and the API drive the real contract on NEAR testnet, end to end

**Hypothesis.** An agent using only the MCP tools (or the SDK through the API) can hatch a syndicate with a real Roost key, deposit, settle with the Roost's signature, and exit with hatch_out, and the chain shows exactly what the interface reported. Replaying a partial settlement through the interface is rejected. The failure that must NOT happen: an interface that reports a transaction it did not make, or cannot make the transaction its own documentation describes.

**What this does not prove**
- The Roost is a local HostedRoost with a simulated attestation provider: this tests the interfaces and the chain, not hardware.
- The interface account is the repository's master testnet account; one operator is every party. Recipients and the depositor are accounts the operator controls.
- Hatch, deposit and settle go through the chain client; the API's hatch and deposit routes still use the in-memory model (GAP-016) and are not driven here. Only the API's chain-backed routes are.
- Testnet only, one date. The contract has not been audited by a third party.

| Step | Result | Assertions | Time |
|---|---|---|---|
| preflight: write access, deployed contract, balances, storage headroom | ✓ pass | 5/5 | 1591 ms |
| MCP: hatch with the Roost's key, deposit, settle with its signature | ✓ pass | 10/10 | 11652 ms |
| MCP: a partial settlement cannot be replayed, the next needs a fresh signature | ✓ pass | 7/7 | 14697 ms |
| MCP: the non-custodial exit (hatch_out) refunds exactly the deposit | ✓ pass | 5/5 | 18848 ms |
| SDK through the API in chain mode: reads, settle and hatch-out reach the chain | ✓ pass | 16/16 | 32858 ms |
| stop the daemon and return the recipient's funds to the interface account | ✓ pass | 2/2 | 2833 ms |

### preflight: write access, deployed contract, balances, storage headroom

- ✓ the MCP server is in chain mode and can write
- ✓ the interface account is the lab's master account
- ✓ the deployed contract is the build this lab was written against
- observed **interface account balance (NEAR)**: `9.9118`
- ✓ the interface account has at least 0.25 NEAR (an attempt costs about 0.07)
- ✓ the contract account has at least 0.15 NEAR of storage headroom

### MCP: hatch with the Roost's key, deposit, settle with its signature

- evidence mcp: {"tool":"midge_hatch_syndicate","ok":false,"error":"[FlyChainClient] hatch needs enclavePublicKey: the Roost's 32-byte Ed25519 settlement public key as 64 hex characters (not all zeros). Without it the syndicate could ne…
- ✓ hatching without an enclave key is refused before any transaction (a keyless syndicate could never settle)
- evidence mcp: {"tool":"midge_hatch_syndicate","ok":true,"status":"HATCHED_ON_CHAIN","txHash":"2CPqSw46ugi8wBSHMXn7yvnFaCMo7DJ9FnR34Hc2GZ9q","explorer":"https://testnet.nearblocks.io/txns/2CPqSw46ugi8wBSHMXn7yvnFaCMo7DJ9FnR34Hc2GZ9q"}
- ✓ midge_hatch_syndicate reports HATCHED_ON_CHAIN with a transaction hash
- ✓ the chain shows the Roost's settlement key
- ✓ the chain shows the allowed recipient the agent asked for
- evidence mcp: {"tool":"midge_deposit","ok":true,"status":"DEPOSITED_ON_CHAIN","txHash":"ChTvpuvgiFv2psQKaFYCoNGmjF3foVY9PWHUEiyAS2Y2","explorer":"https://testnet.nearblocks.io/txns/ChTvpuvgiFv2psQKaFYCoNGmjF3foVY9PWHUEiyAS2Y2"}
- ✓ midge_deposit reports DEPOSITED_ON_CHAIN
- ✓ the escrow is exactly 0.02 NEAR
- evidence mcp: {"tool":"midge_settle","ok":true,"status":"SETTLED_ON_CHAIN","txHash":"GmQbtgRVwhVFHE3ewoKtYvhFJUvHKP3MBrAnnDCRpUYX","explorer":"https://testnet.nearblocks.io/txns/GmQbtgRVwhVFHE3ewoKtYvhFJUvHKP3MBrAnnDCRpUYX"}
- ✓ midge_settle reports SETTLED_ON_CHAIN (it could not before: wrong argument names, wrong allocation shape, wrong hash)
- ✓ the chain shows the syndicate Settled with no escrow
- ✓ the contract made exactly one transfer, to the recipient, for exactly 0.02 NEAR
- evidence mcp: {"tool":"midge_settle","ok":false,"error":"Smart contract panicked: panicked at src/lib.rs:505:9:\nassertion `left == right` failed: [HAQ REJECT] Syndicate is not active.\n  left: Settled\n right: Active"}
- ✓ replaying the settlement through the MCP is rejected

### MCP: a partial settlement cannot be replayed, the next needs a fresh signature

- evidence mcp: {"tool":"midge_hatch_syndicate","ok":true,"status":"HATCHED_ON_CHAIN","txHash":"gUpLkBuEVMHRReTGbqT9yGLQzgeEXk9DjXviYZifGeZ","explorer":"https://testnet.nearblocks.io/txns/gUpLkBuEVMHRReTGbqT9yGLQzgeEXk9DjXviYZifGeZ"}
- ✓ hatch #2
- evidence mcp: {"tool":"midge_deposit","ok":true,"status":"DEPOSITED_ON_CHAIN","txHash":"2QwuqfAqkmzBFGk3mBTiFZu1cGDWW75uXDrvXY4sPTPQ","explorer":"https://testnet.nearblocks.io/txns/2QwuqfAqkmzBFGk3mBTiFZu1cGDWW75uXDrvXY4sPTPQ"}
- ✓ deposit 0.03
- evidence mcp: {"tool":"midge_settle","ok":true,"status":"SETTLED_ON_CHAIN","txHash":"4aZBZVgUWSQ1XtEUBL6d6Axu3e9bu8hEmACHjJzjBpou","explorer":"https://testnet.nearblocks.io/txns/4aZBZVgUWSQ1XtEUBL6d6Axu3e9bu8hEmACHjJzjBpou"}
- ✓ the partial settlement (0.01 of 0.03) succeeds
- ✓ the round nonce rotated
- evidence mcp: {"tool":"midge_settle","ok":false,"error":"Smart contract panicked: panicked at src/lib.rs:525:9:\nassertion `left == right` failed: [HAQ REJECT] Nonce mismatch. Replay attack blocked.\n  left: \"d53754f7bc8bbf5fe16fed2c…
- ✓ replaying the same partial settlement is rejected with a nonce error
- ✓ the escrow is unchanged by the replay
- evidence mcp: {"tool":"midge_settle","ok":true,"status":"SETTLED_ON_CHAIN","txHash":"Cqi8vSTiwfaKdUun81YWGrX97Kr244ugFAfcCKMXm2Lk","explorer":"https://testnet.nearblocks.io/txns/Cqi8vSTiwfaKdUun81YWGrX97Kr244ugFAfcCKMXm2Lk"}
- ✓ a fresh signature on the new nonce settles the rest

### MCP: the non-custodial exit (hatch_out) refunds exactly the deposit

- evidence mcp: {"tool":"midge_hatch_syndicate","ok":true,"status":"HATCHED_ON_CHAIN","txHash":"Bq8qLiiEFEwEQnMVVDKWQz3B9mJnrV1TNAfgrfnzPDpA","explorer":"https://testnet.nearblocks.io/txns/Bq8qLiiEFEwEQnMVVDKWQz3B9mJnrV1TNAfgrfnzPDpA"}
- ✓ hatch #3 with a 2-block timeout
- evidence mcp: {"tool":"midge_deposit","ok":true,"status":"DEPOSITED_ON_CHAIN","txHash":"FBGwhNuAGQZKEWzfjcnkrHzzWsTqrT81YrwwPVBTEiW1","explorer":"https://testnet.nearblocks.io/txns/FBGwhNuAGQZKEWzfjcnkrHzzWsTqrT81YrwwPVBTEiW1"}
- ✓ deposit 0.02
- evidence mcp: {"tool":"midge_hatch_out","ok":true,"status":"HATCHED_OUT_ON_CHAIN","txHash":"f5fPAfKJU53cFwrTw7RprZFP55BmjDNFBY91EcSLrFX","explorer":"https://testnet.nearblocks.io/txns/f5fPAfKJU53cFwrTw7RprZFP55BmjDNFBY91EcSLrFX"}
- ✓ midge_hatch_out reports HATCHED_OUT_ON_CHAIN
- ✓ the syndicate is AbortedRefunded
- ✓ the contract refunded exactly 0.02 NEAR to the depositor, once

### SDK through the API in chain mode: reads, settle and hatch-out reach the chain

- ✓ the daemon is in chain mode with write access
- ✓ listSyndicates over the API returns the chain's newest syndicates
- observed **syndicates the interface account is a member of (all pages)**: `59`
- ✓ getSyndicatesByMember reads the chain and, across pages, includes the syndicates this run created for the account
- ✓ sdk.hatchSyndicate -> API -> chain hatches on chain, with a transaction hash and the round nonce (GAP-016: it used to create an in-memory model syndicate)
- ✓ the chain really has it, with the Roost's key
- ✓ sdk.deposit -> API -> chain deposits on chain
- ✓ sdk.getSyndicate reads the chain: the id, the exact escrow, the nonce and the flyer (it used to 404 for anything on chain)
- ✓ an id that is not on chain is a 404
- ✓ the timelock view reads the chain: 50 blocks, some elapsed, a real current block
- ✓ sdk.settleBatch -> API -> chain returns SETTLED_ON_CHAIN
- ✓ the chain shows it Settled
- ✓ a settle without nonce, hash or signature is refused with an explanation, and sends nothing
- evidence mcp: {"tool":"midge_hatch_syndicate","ok":true,"status":"HATCHED_ON_CHAIN","txHash":"FjmQkwB9xMHp5qsbidzVDp6pe7Z4nKMSWPwe4N1uxJtK","explorer":"https://testnet.nearblocks.io/txns/FjmQkwB9xMHp5qsbidzVDp6pe7Z4nKMSWPwe4N1uxJtK"}
- ✓ hatch #5 with a 2-block timeout
- evidence mcp: {"tool":"midge_deposit","ok":true,"status":"DEPOSITED_ON_CHAIN","txHash":"2y8Qe43YaLxbkub5PCdsQuib84BBU8xvki728zdbHn5M","explorer":"https://testnet.nearblocks.io/txns/2y8Qe43YaLxbkub5PCdsQuib84BBU8xvki728zdbHn5M"}
- ✓ deposit 0.02
- ✓ sdk.hatchOut -> API -> chain returns HATCHED_OUT_ON_CHAIN
- ✓ the chain shows the escrow refunded

### stop the daemon and return the recipient's funds to the interface account

- observed **recipient gained (NEAR)**: `0.07`
- evidence tx: {"label":"return 0.06 NEAR to fly-1793636729.testnet","hash":"E3V6m3rrpdjme11Byib1uV2Mx9MQVsKAoBCsPmfXpgfm","ok":true,"explorer":"https://testnet.nearblocks.io/txns/E3V6m3rrpdjme11Byib1uV2Mx9MQVsKAoBCsPmfXpgfm","error":n…
- ✓ the funds were returned so the experiment can be repeated
- observed **interface account net change (NEAR)**: `-0.06598`
- ✓ an attempt cost the interface account less than 0.12 NEAR

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
