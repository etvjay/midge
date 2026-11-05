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

## Run it yourself, from nothing

Everything below is testnet and free. Each step says what it costs and what you should see.

```bash
git clone https://github.com/etvjay/midge && cd midge && npm install
node scripts/lab-env.mjs check --tier offline        # ready. (needs Node 18+; Rust only for the contract tests)
node lab/run.js --tier offline                       # about a minute: self-test, 10 suites, foundry audit, Rust, every interface
```

That is the whole offline tier: no keys, no network, no money. To go on to the real contract on NEAR testnet:

```bash
node scripts/setup-testnet-account.js                # creates fly-<n>.testnet with 10 NEAR from NEAR's testnet helper, writes .env (mode 0600)
npm run build:wasm                                   # needs Rust and the wasm32-unknown-unknown target
node scripts/lab-env.mjs bootstrap                   # deploys the contract to c.<your account> and runs the end-to-end flow (about 1 minute)
node scripts/lab-env.mjs check --tier testnet        # master balance, contract hash, storage headroom
node lab/run.js --tier testnet                       # E-CHAIN-ROUND-LOCAL (~0.03 NEAR) and E-IFACE-CHAIN (~0.07 NEAR)
```

- **What bootstrap costs.** It moves about 5 NEAR out of your master account into the contract and three flyer accounts; about 3.3 NEAR of that is the contract's storage staking (the code is stored on chain at 1e19 yocto per byte). It is not spent: deleting those accounts returns it. After that the three testnet experiments together cost about 0.13 NEAR.
- **Followed end to end.** This guide was run from a clean clone with a brand-new account on 2026-11-04: the build produced the identical code hash (`Gh8NAA2e…` at the time, so the build is reproducible; the contract has since been rebuilt and redeployed as `9y8w4PU5…` with the GAP-022 fix), bootstrap deployed it, and both testnet experiments passed (run `20261104T151213Z-46e2`). That run found two bugs the lab's own account had hidden: the e2e script under-funded the coordinator for the contract's size, and the chain client sent a new account's writes to the author's contract. Both are fixed.
- **Your own contract, your own hash.** The experiments compare the deployed contract with, in order: `LAB_EXPECTED_CODE_HASH`, the wasm built from your checkout, then the hash pinned for the lab's own deployment. A copy you built and deployed yourself therefore passes against your build.
- **Fresh accounts per run.** Each testnet experiment creates its own member accounts, prunes the syndicates it made, compacts their indexes and deletes the accounts back into the master, then asserts the contract holds as many records as before. If a run is killed, `node scripts/lab-env.mjs cleanup` removes what it left.
- **Running low.** `node scripts/lab-env.mjs fund` asks the testnet helper for a fresh 10 NEAR account and sweeps it into yours (only if you are below 2 NEAR; the helper can rate-limit). `status` shows balance, syndicate counts and the contract's storage headroom; `prune [--rescue] [--dry-run]` removes finished syndicates and keeps the ones `docs/canonical/testnet-evidence.json` cites.
- **Other tiers.** `cloud` needs `NEARAI_API_KEY`, network and `dcap-qvl` (a few cents). `hardware` also needs `PHALA_CLOUD_API_KEY` and Docker (about $0.002 for a two-minute VM; the run deletes it and checks the account is empty). `check --tier <name>` says what is missing and how to get it.
- **What is not here.** There is no local-emulator ("sandbox") tier: every chain experiment needs the real testnet and its helper, so a run depends on testnet being up. Wherever "model mode" appears, it is the in-memory simulation, labelled as such.

## Tiers

| Tier | Needs | Experiments | Cost |
|---|---|---|---|
| offline | nothing | `E-LAB-01` (self-test), `E-SUITE-OFFLINE` (10 suites), `E-CHECK-FOUNDRY`, `E-RUST-CONTRACT`, `E-IFACE-MODEL` (every route, SDK method and MCP tool) | free |
| testnet | NEAR key in `.env`, network | `E-CHAIN-ROUND-LOCAL` (about 0.034 NEAR net per attempt), `E-IFACE-CHAIN` (MCP, SDK and API against the real contract; about 0.066), `E-SECURITY-FCKEY-01` (a compromised agent bounded by a function-call key; about 0.025). Measured as the net change in the master account. | small |
| cloud | NEAR AI key, network, `dcap-qvl` | `E-MODEL-SEALED-LIVE-01` (a few cents of inference); `E-ADVISOR-LIVE-01` (the advisor with the real contract; also needs a NEAR key, about 0.05 NEAR) | cents |
| hardware | Phala key, NEAR key, Docker, `dcap-qvl` (and a NEAR AI key for the combined run) | `E-HOSTED-LIVE-01`; `E-COMBINED-LIVE-01` (the Roost on a real TDX VM, the NEAR AI model proposing the split, the contract settling, in one round) | about $0.002 each (a VM for ~2-3 min) plus a few cents of inference |

An experiment whose requirements are missing is skipped and recorded as skipped, not passed. There is no sandbox tier.

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
| **Advisor** (`src/advisor`) | An attested NEAR AI model proposes how to split a total among the policy's recipients; the Roost bounds it, the contract enforces it; the model's signed answer is stored as a record anyone can verify against the allocations hash the contract logs | **Live** (`E-ADVISOR-LIVE-01`, with `E-ADVISOR-MODEL` offline). The model sees only the total and the recipient ids, never a bid |
| **Roost, local** | Keyless simulation; can read bids | Used by offline tests |
| **HAQ** attestation | Proof the Nest gates on | Verified live for the hosted Roost |
| **Pod** (`src/syndicate/pod.js`) | Sub-swarm with a capital cap (`SCOUT`, `EXECUTION`, `RISK`, `CREDIT`) | **Model**; no on-chain enforcement |
| **OutLayer** (`src/policies/outlayer.js`) | Spending and receiver limits for autonomous Flyers | **Model** |
| **FAR Shard / IMT** | Private shard; IMT balances 1:1 with locked collateral | **Model** |
| **1Click adapter** | NEAR Intents quotes and routing | Pricing and liquidity checked against the live API; settlement path **model** |
| **Chain Signatures** | MPC-derived BTC, ETH, SOL addresses | **Model** (offline) |
| **Facilities** | Confidential RFQ with covenants, OTC block trades, compute syndicate | **Model** (offline) |
| **x402 commerce** | Agents pay each other over HTTP 402 | **Model** (offline) |
| **Gateway**: HTTP API (32 routes incl. 2 SSE streams), MCP (10 tools) and the `FlyClient` SDK (32 methods) | Agent-facing interfaces | Every route, method and tool exercised in model mode by `E-IFACE-MODEL` (coverage derived from source). The chain-backed paths (MCP hatch, deposit, settle, hatch_out; SDK hatch, deposit, get, settle and hatch-out through the API in chain mode) are exercised on testnet by `E-IFACE-CHAIN`. Gaps GAP-011 to GAP-019 found by these experiments are all closed; every HTTP route is now reachable from an SDK method, including the two SSE streams (async iterators), and the interface report records no open problems |

## Limits of what this shows

- One operator controls every test member, the coordinator, the recipient and the VM account. It shows the system working end to end, not independent parties.
- Testnet only. The contract has no third-party audit.
- Attestation is only as strong as Intel TDX and Phala's platform, and it does not audit the code inside the image.
- Rejections (replay, wrong recipient, wrong key) are asserted by on-chain state staying unchanged, not by matching error text.
