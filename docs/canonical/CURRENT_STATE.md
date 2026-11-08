# Midge — Canonical Current State

**Repository Version:** 1.0.0  
**Written:** 2026-11-08 (this file used to pin a git commit and went stale; the commit is whatever `git log -1` shows). `tests/public-docs-true.test.js` fails if a count or hash here disagrees with the repository.  
**Governance Standard:** Builder Foundry v1.0  
**Hackathon Target:** NEAR HACKATHON: Build Beyond Boundaries (Nov 1–14, 2026)  
**Overall Status:** `TESTED_AND_INTEGRATED`  

---

## 1. Executive Summary

Midge is a network of private rooms with public rules on NEAR Protocol. It enables autonomous AI agents, quant funds, and privacy collectives to pool capital, deliberate in hardware-attested enclaves, and execute cross-chain operations as a unified front without leaking member identities, proprietary trading models, prompt weights, or internal equity splits to public mempools.

All 8 architectural verification layers, the NEAR L1 Rust smart contract (129 Rust tests: unit, integration, invariant and state-machine; domain-separated Ed25519 signature verification, LookupMap escrow storage, Flash Promise settlement payouts with failure-recovery callbacks, per-member charges, two-room settlement, a release cap paced by the exit timer, and a permissionless exit), the hosted Roost on a real Phala TDX machine, and the Builder Foundry governance control plane are implemented and verified in **<4.0 seconds**.

---

## 2. Component Implementation & Verification Matrix (Real vs. Simulated)

| Component | Surface / Path | Execution Nature | Verification Command | Cryptographic Evidence / Deliverable |
|---|---|---|---|---|
| **The Roost (Attestation)** | `src/enclave/roost.js` | **LIVE DEMO** | `npm run verify:tee` | Live HTTP query to `cloud-api.near.ai/v1/attestation/report` with 32-byte nonce; Intel TDX Quote v4 parsed & nonce bound (GAP-006) |
| **The Roost (local simulation)** | `src/enclave/roost.js` | **LOCAL SIMULATION** | `npm run demo:syndicate` | Used only without a NEAR AI key or when asked for by name: exact sums, but the process can read every bid and says so at startup |
| **The Roost (model-sealed, default with a key)** | `src/enclave/model-sealed-roost.js`, `src/enclave/e2ee.js`, `src/enclave/attestation.js`, `src/enclave/member.js` | **LIVE DEMONSTRATED** | `npm run verify:roost-model` (live), `npm run verify:roost-sealed` (offline) | Bids sealed to a NEAR AI Cloud model's attested Ed25519 key; per-round Intel TDX chain, TCB and nonce binding; members verify the key themselves; three agreeing runs and a count check; signed receipts. 8 of 8 live rounds exact (`docs/canonical/roost-model-evidence.json`). The sum is done by a language model. |
| **The Roost (hosted in a dstack CVM)** | `src/roost-service/`, `deploy/roost/` | **LIVE DEMONSTRATED (attestation)** | `npm run verify:roost-hosted`, `npm run verify:hosted-bundle` | Exact aggregation, in-process keys, bounded single-use settlement signing (64 offline checks). Attested on a real Phala TDX VM on 2026-11-04 and accepted by the official `dstack-verifier` on all 12 checks, verified from a saved bundle. A full member round on a live VM is not yet demonstrated (GAP-004 verified at system level). |
| **1Click Asset Registry** | `verifications/02-confidential-intents.js` | **LIVE AUDIT** | `npm run verify:intents` | 210 assets audited live across NEAR, BTC, ETH, SOL via 1Click Swap API with audited snapshot fallback |
| **FAR Private Shard** | `src/settlement/far-shard.js` | **LOCAL SIMULATION** | `npm run verify:vault` | ~200ms PBFT consensus simulation, IMT mint/burn, decoupled payout graph (GAP-002) |
| **The Hatch & OutLayer** | `src/contracts/nest.js`, `src/policies/outlayer.js` | **TESTED (JS MODEL)** | `npm run verify:hatch` | State machine mirror and unit tests for `*.testnet` sub-accounts, 100 USDC spend cap, per-user 100% refund on TEE timeout |
| **Dark Vault & Pods** | `src/contracts/nest.js` | **SIMULATED** | `npm run verify:vault` | Multi-epoch progression (Epoch 1 → 2), Pod sub-syndicates (`quant-arb-pod-01`) |
| **Chain Signatures MPC** | `src/multichain/chain-signatures.js`, `scripts/testnet-mpc.js` | **LIVE DEMONSTRATED** | `npm run verify:mpc` | A live `sign` call to `v1.signer-prod.testnet` succeeded on testnet (re-read from an archival node on 2026-11-08), the returned ECDSA signature was recovered against the derived key, and Taproot Bitcoin, EVM and Solana addresses were derived (GAP-005, closed). Only the signing is live; no transaction was broadcast on another chain |
| **Confidential RFQs** | `src/facilities/rfq-adjudication.js` | **LOCAL SIMULATION** | `npm run verify:rfq` | $10M USDC borrow against 5,000 ETH @ 4.9% APR; private margin check without DEX dumps |
| **OTC Block Dark Pool** | `src/facilities/otc-block-trade.js` | **LOCAL SIMULATION** | `npm run verify:otc` | 10,000 wNEAR crossed at $4.00/NEAR midpoint with 0% slippage |
| **AI Compute Syndicate** | `src/facilities/compute-syndicate.js` | **LIVE ATTEST / LOCAL EXEC** | `npm run verify:otc` | Hardware-attested inference on `Qwen/Qwen3.6-35B-A3B-FP8` with zero prompt logging |
| **5-Layer Resilience (FMEA)** | `src/resilience/failure-matrix.js` | **TESTED** | `npm run verify:matrix` | Deterministic handling: Enclave crash, Agent dropout, Solver slippage, MPC timeout, Rogue agent |
| **FlyApiDaemon & SSE** | `src/api/server.js` | **INTEGRATED (Localhost)** | `npm run verify:api` | A localhost REST daemon on 127.0.0.1, real-time Server-Sent Events stream (`/v1/stream/syndicate/:id`) |
| **x402 Agent Commerce** | `src/commerce/x402.js` | **INTEGRATED** | `npm run verify:api` | HTTP 402 challenge, PingPay confidential micropayment HMAC bearer verification, token-gated alpha |
| **MCP Server** | `src/mcp/server.js`, `bin/midge-mcp.js` | **INTEGRATED (stdio)** | `npm run verify:api` | 15 tools exposed via stdio JSON-RPC 2.0 (ten for groups and five for the hosted rooms) compatible with `nearai/near-mcp` |
| **FlyClient SDK** | `src/sdk/client.js` | **TESTED** | `npm run verify:api` | Unified JavaScript/TypeScript client library |
| **NEAR L1 Smart Contract** | `contracts/fly-coordinator` | **TESTED** | `npm run verify:rust` | 129 Rust tests (unit, integration, invariant, state-machine) in `near-sdk` 5.1 with Ed25519 signature checks, LookupMap storage guards, Flash Promise payouts, storage reclamation, and refund safety |
| **Release WASM Binary** | `contracts/fly-coordinator/target` | **TESTED** | `npm run build:wasm` | Compiled WebAssembly binary (`wasm32-unknown-unknown`). Its size and hash change with the build; a byte-for-byte rebuild has not been checked against the on-chain hash `AFtZmiNS…` |
| **Foundry Control Plane** | `foundry/` | **INTEGRATED** | `npm run check:foundry` | `state.json`, the claims ledger (`claims.jsonl`), the gaps ledger (`gaps.jsonl`), the invariants (`invariants.json`), 9 phase specs; `make check` fails on a violation |

---

## 3. Known Limitations & Builder Foundry Gaps

1. **NEAR L1 Private Sharding (GAP-002):**
   - *Current State:* Evaluated as an in-process PBFT 200ms cryptographic state machine with IMT token accounting and decoupled graph verification.
   - *Roadmap:* Integration with native NEAR Nightshade Phase 2 validator RPC once private sharding ships.
2. **1Click Swap API Environment (GAP-001):**
   - *Current State:* 1Click API operates in a mainnet environment without dedicated public testnet; verified via live asset queries with audited snapshot fallback.
3. **Chain Signatures Testnet Signing (GAP-005, closed):**
   - *Current State:* Closed. A live `sign` transaction to `v1.signer-prod.testnet` is on testnet and the signature was verified against the derived key. Re-running it needs a funded testnet key. Signing only: no transaction was broadcast on Bitcoin, Ethereum or Solana.
4. **Hardware hosting of the room (GAP-004):**
   - *Current State:* The default room is the local simulation and is not in hardware. The model-sealed Roost seals bids to a NEAR AI Cloud model's attested key. The hosted Roost has been attested on real Phala TDX machines (2026-11-04, and 2026-11-08 with the escrow check on). Those VMs were ephemeral and were deleted; **no hosted Roost is running now**.
5. **Intel DCAP-QVL Verification (GAP-006, closed):**
   - *Current State:* The Intel certificate chain to the Intel root and the TCB status are checked with `dcap-qvl`, and a machine without it now fails closed (GAP-035). An optional pin of the host's measurements (MRTD, RTMR0 to RTMR3, MRSEAM) exists (GAP-043) but nothing is pinned by default, because deciding which build to trust is the owner's decision.
6. **Sybil Syndicate Capacity & Storage Staking (GAP-007):**
   - *Current State:* Fixed 50-flyer capacity cap with 0.01 NEAR minimum deposit to bound contract memory and gas costs. Storage deposit is statically allocated at hatch time.
   - *Roadmap:* Dynamic per-flyer storage deposit refundable upon hatch_out or settlement.

## Behaviour changes from the security audit (2026-11-08)
- Attestation: the Intel certificate-chain check is `required` by default. A machine without `dcap-qvl` now fails model attestation; `chain: 'if-available'` and `'skip'` remain as explicit choices.
- REST daemon: refuses to listen beyond loopback without `FLY_API_KEY`, and refuses state-changing requests with a foreign `Origin` and any request with a non-local `Host` on a loopback bind.
- MCP over HTTP: every tool outside a short public list needs the coordinator key.
- Contract (deployed to testnet 2026-11-08, code hash AFtZmiNS…; GAP-026 and GAP-030 checked live, the others unit-tested only): `:` is refused in an order hash, the code-hash string is capped at 128 bytes, and callbacks, exits and re-deposits keep their books consistent. See GAP-026 to GAP-038.

## State machine and invariants (2026-11-08, plan 09-1)
`docs/STATE_MACHINE.md` documents every public contract function and Roost round method with guard, effect and tests; `foundry/invariants.json` defines C-01 to C-12; `make check` fails if they drift (`scripts/check-invariants.js`). The survey of unnamed states is `docs/IMPLICIT_STATE_MACHINES.md`. This proves the named tests exist, not that they are strong enough.

## Escrow-bound charged rounds (2026-11-08, audit lead 9; in the hosted image and switched on in its measured compose file)
A charged round can read what each bidder holds from two or more providers at one block and leave out bidders who cannot pay (`bindEscrow`, `deploy/roost/ESCROW-READER.md`). Tested live on testnet with a local host (run `20261108T103619Z-433a`, after a fresh review whose Critical and Important findings were fixed). It makes a rejected round **much rarer, not impossible**: a member whose exit timer has run can still leave between the read and the payout (`escrowBlock.raceFree` is an estimate of when that cannot happen, not a guarantee). A rejected signed round can be given up with `abandon` and run again; the abandoned signature stays valid on chain and the record of it is in memory only. The hosted Roost image (`cde03fef…`, built by CI from `2fbec52`) has it, and `deploy/roost/docker-compose.yml` switches it on, so the attestation covers which providers the Roost asks and which contract it reads. Verified on a real Phala TDX VM (run `20261108T124630Z-b8de`, compose hash `edd3ff37…`, now pinned in `roost.expected.json` beside the November 4 build); the VM was deleted afterwards, so none is running now.
