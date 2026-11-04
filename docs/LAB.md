# The Midge lab

A research harness for the repository. Every check is an **experiment**: a hypothesis, recorded steps, per-step assertions, the evidence behind them and the problems found. Each run writes a hash-chained, append-only log that anyone can re-verify, and the verdict is derived from the assertions, not declared.

```bash
node lab/run.js --list                       # experiments, tier and what each needs
node lab/run.js --tier offline               # no keys, no network (~minute, includes Rust)
node lab/run.js --only E-CHAIN-ROUND-LOCAL   # one experiment (testnet, needs the NEAR key)
node lab/run.js --only X --repeat 3          # repeat in one run to expose flakiness
node lab/verify-run.js docs/lab-runs/<id>    # re-check a log's integrity and re-derive verdicts
node lab/promote.js lab/runs/<id>            # copy a verified run into docs/lab-runs/
```

Runs go to `lab/runs/` (gitignored). `lab/promote.js` copies a run you want to keep into `docs/lab-runs/`. Promote only after scanning for secrets; the recorder redacts known secret shapes but the scan is the check.

## Tiers

| Tier | Needs | Experiments | Cost |
|---|---|---|---|
| offline | nothing | `E-LAB-01` (self-test), `E-SUITE-OFFLINE` (10 suites), `E-CHECK-FOUNDRY`, `E-RUST-CONTRACT`, `E-IFACE-MODEL` (every route, SDK method and MCP tool) | free |
| testnet | NEAR key in `.env`, network | `E-CHAIN-ROUND-LOCAL` (about 0.002 NEAR per attempt), `E-IFACE-CHAIN` (MCP, SDK and API against the real contract; about 0.066 NEAR per attempt) | small |
| cloud | NEAR AI key, network, `dcap-qvl` | `E-MODEL-SEALED-LIVE-01` | a few cents of inference |
| hardware | Phala key, NEAR key, Docker, `dcap-qvl` | `E-HOSTED-LIVE-01` | about $0.002 (a VM for ~2 min) |

An experiment whose requirements are missing is skipped and recorded as skipped, not passed. There is no sandbox tier yet.

## What was run live

| Run | Result |
|---|---|
| `20261104T112446Z-fddf` offline | self-test, 10 suites, foundry audit, Rust: pass |
| `20261104T112143Z-2bc2` testnet, 3 attempts | 40 assertions each: pass |
| `20261104T115158Z-0fe5` model-sealed Roost, live NEAR AI Cloud | 29 assertions: pass; 8 of 8 rounds exact, including 4 prompt-injection attempts |
| `20261104T112702Z-6252` real Phala TDX VM | 73 assertions: pass; VM deleted, account empty |

Verify any of them: `node lab/verify-run.js docs/lab-runs/<id>`.

## Components and how far each has been tested

**Live** = ran on NEAR testnet or real hardware in a logged run. **Real, not live** = real code with tests (Rust or JS) but never run on testnet. **Model** = a JavaScript model of the design; nothing on chain enforces it.

| Component | What it does | Status |
|---|---|---|
| **Nest** (`contracts/fly-coordinator`) | On-chain coordinator: state machine, escrow, Ed25519 settlement check, release policy, `hatch_out` timelock | **Live** (Flash only) |
| **Hatch** / `hatch_out` | Create a syndicate; the member's non-custodial exit | **Live** |
| **Flash** syndicate | Single-round, ephemeral | **Live** |
| **Dark Vault** syndicate | Persistent, multi-epoch treasury | Rust test for the type; epoch rollover in the JS model; **not run live**. Whether the deployed contract itself performs the rollover is unverified |
| **Roost, hosted** (`src/roost-service`) | Our code in a Phala TDX VM: exact aggregation, bounded signing | **Live** |
| **Roost, model-sealed** (`src/enclave`) | Bids sealed to an attested NEAR AI model | **Live** (`E-MODEL-SEALED-LIVE-01`) |
| **Roost, local** | Keyless simulation; can read bids | Used by offline tests |
| **HAQ** attestation | Proof the Nest gates on | Verified live for the hosted Roost |
| **Pod** (`src/syndicate/pod.js`) | Sub-swarm with a capital cap (`SCOUT`, `EXECUTION`, `RISK`, `CREDIT`) | **Model**; no on-chain enforcement |
| **OutLayer** (`src/policies/outlayer.js`) | Spending and receiver limits for autonomous Flyers | **Model** |
| **FAR Shard / IMT** | Private shard; IMT balances 1:1 with locked collateral | **Model** |
| **1Click adapter** | NEAR Intents quotes and routing | Pricing and liquidity checked against the live API; settlement path **model** |
| **Chain Signatures** | MPC-derived BTC, ETH, SOL addresses | **Model** (offline) |
| **Facilities** | Confidential RFQ with covenants, OTC block trades, compute syndicate | **Model** (offline) |
| **x402 commerce** | Agents pay each other over HTTP 402 | **Model** (offline) |
| **Gateway**: HTTP API (32 routes incl. 2 SSE streams), MCP (10 tools) and the `FlyClient` SDK (26 methods) | Agent-facing interfaces | Every route, method and tool exercised in model mode by `E-IFACE-MODEL` (coverage derived from source). The chain-backed paths (MCP hatch, deposit, settle, hatch_out; SDK settle and hatch-out through the API) are exercised on testnet by `E-IFACE-CHAIN`. The API's own hatch, deposit and get-by-id routes are still the in-memory model (GAP-016). Open gaps GAP-013 to GAP-018 are pinned in `E-IFACE-MODEL` |

## Limits of what this shows

- One operator controls every test member, the coordinator, the recipient and the VM account. It shows the system working end to end, not independent parties.
- Testnet only. The contract has no third-party audit.
- Attestation is only as strong as Intel TDX and Phala's platform, and it does not audit the code inside the image.
- Rejections (replay, wrong recipient, wrong key) are asserted by on-chain state staying unchanged, not by matching error text.
