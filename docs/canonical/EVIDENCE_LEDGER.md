# Fly Protocol — Canonical Evidence Ledger

**Version:** 1.1.0  
**Governance Standard:** Builder Foundry v1.0 & Repository Starter Virtuous Cycle  
**Hackathon:** NEAR HACKATHON: Build Beyond Boundaries (Nov 1–14, 2026)  
**Git Head:** `5f5ca17eeafb21734ee01345403ee24c73c34ea6`  

---

## 1. Live On-Chain Testnet Evidence (Real L1 Transactions)

Fly coordinator smart contract is deployed to NEAR Testnet and verified end-to-end with real transactions, measured gas, Ed25519 enclave signatures, and non-custodial refunds.

### Contract Deployment & Identity
* **Coordinator Contract Account:** `c.fly-1793636729.testnet`
* **Deployer Master Account:** `fly-1793636729.testnet`
* **Participant Flyers:** `f1.fly-1793636729.testnet`, `f2.fly-1793636729.testnet`, `f3.fly-1793636729.testnet`
* **Contract Binary:** `contracts/fly-coordinator/target/wasm32-unknown-unknown/release/fly_coordinator.wasm` (277 KB)
* **Wasm Initialization Tx:** [`r5tKmPuFqHWXaFsrqSMdqizxJF7q73Z5qG9vWL94MkM`](https://testnet.nearblocks.io/txns/r5tKmPuFqHWXaFsrqSMdqizxJF7q73Z5qG9vWL94MkM)

### Syndicate 1: Live Flash Settlement with Ed25519 Enclave Signature
| Step | Action | Account | Tx Hash | Gas Burnt | Explorer Link |
|:---|:---|:---|:---|:---|:---|
| 1 | `hatch("syn-flash-1793637420")` | `c.fly-1793636729.testnet` | `AEZ7Ar5...` | 2.45 TGas | [View on NearBlocks](https://testnet.nearblocks.io/txns/AEZ7Ar5LXQekRUp5RdpYYRAPrGAKGqXA4iVriXPPrhL5) |
| 2 | `deposit(0.02 NEAR)` | `f1.fly-1793636729.testnet` | `97sBa13...` | 2.18 TGas | [View on NearBlocks](https://testnet.nearblocks.io/txns/97sBa13ErjwjL3hJQWWQjHhyNJqJGT4uHZ4JwqLBiqpa) |
| 3 | `deposit(0.02 NEAR)` | `f2.fly-1793636729.testnet` | `VshLnMC...` | 2.18 TGas | [View on NearBlocks](https://testnet.nearblocks.io/txns/VshLnMCWvyhXApZyeV35kTLxH5FC3iXAF5XF6Qk42ek) |
| 4 | `deposit(0.02 NEAR)` | `f3.fly-1793636729.testnet` | `J9iVhzc...` | 2.18 TGas | [View on NearBlocks](https://testnet.nearblocks.io/txns/J9iVhzc7QUvoFBHfsJ7KSat7LbfMtwXaicTntXyF5PdQ) |
| 5 | `settle_batch` (Verified Ed25519) | `c.fly-1793636729.testnet` | `12vpDrn...` | **5.81 TGas** | [View on NearBlocks](https://testnet.nearblocks.io/txns/12vpDrnpZudg8egtdMXvt27sDfQjk9sZTg3SzJREadUh) |

### Syndicate 2: Live Non-Custodial Escape Hatch (`hatch_out` after Timelock)
| Step | Action | Account | Tx Hash | Gas Burnt | Explorer Link |
|:---|:---|:---|:---|:---|:---|
| 1 | `hatch("syn-escape-1793637435", timeout=2)` | `c.fly-1793636729.testnet` | `HWZEtG8...` | 2.45 TGas | [View on NearBlocks](https://testnet.nearblocks.io/txns/HWZEtG8neAgvseohv63ba4B2FcXW36vvPPmMZyLAyQJu) |
| 2 | `deposit(0.03 NEAR)` | `f2.fly-1793636729.testnet` | `DU9ULPq...` | 2.18 TGas | [View on NearBlocks](https://testnet.nearblocks.io/txns/DU9ULPqj3rDcht5wQ53nrobq5EdLdJCENhq8tn2nyQNk) |
| 3 | Timelock Elapses (3 blocks) | — | — | — | Timelock verification passed |
| 4 | `hatch_out("syn-escape-1793637435")` | `f2.fly-1793636729.testnet` | `DR3VmCy...` | **4.92 TGas** | [View on NearBlocks](https://testnet.nearblocks.io/txns/DR3VmCytXwPM1pk7pvN9GLQnStRWdvEH9eBAZTc7vFgk) |

---

## 2. Live NEAR Chain Signatures MPC Evidence

Fly queries live threshold MPC nodes on NEAR Testnet (`v1.signer-prod.testnet`), derives omnichain accounts for Bitcoin, Ethereum, and Solana, and cryptographically verifies returned ECDSA signatures.

* **Target MPC Contract:** `v1.signer-prod.testnet`
* **Root Public Key:** `secp256k1:4NfTiv3UsGahebgTaHyD9vF8KYKMBnfd6kh94mK6xv8fGBiJB8TBtFMP5WWXz6B89Ac1fbpzPwAvoyQebemHFwx3`
* **Derivation Path:** `fly/dark-vault/epoch-1`
* **Predecessor Account:** `fly-1793636729.testnet`
* **Derived Public Key:** `secp256k1:5Fg74nHqwNjw3PYPwJDPtv8LkCdaj4MbgYCU1mZxtAFWxQh2WEdUyyLX8oHc3c2mT4o1cZs5moVqC8BoZcwidQaS`
* **Derived Uncompressed Key:** `0x04d4b8f484af535c049ac77d8eac357255ad1cf16dc8bc6700dd0c43523589b48e5fd1e8b544785b6ea3e5ea62a0ac80eb717faa4095fe8b402962bcbbfd71db7f`
* **Derived Omnichain Accounts:**
  - **EVM (Ethereum/Arbitrum):** `0x0309Dbc3e7F5C40Bb957723Cebb4BE5329BB22c0`
  - **Bitcoin Taproot (BIP-341/350):** `tb1p6ju0fp902dwqfxk80k82cdtj2kk3eutdez7xwqxap3p4ydvfkj8qyldyzl`
  - **Solana (Cross-chain ID):** `FKP1RDHJnkxGNx8umRSNzp1k15UM9P2W6dFZDFEGATz5`
* **Live Threshold Signing Transaction:**
  - **Tx Hash:** [`6ekiiKnp7QGMWYZWzE5cC8DZWwBmw8mS8MPm9JAvYsnk`](https://testnet.nearblocks.io/txns/6ekiiKnp7QGMWYZWzE5cC8DZWwBmw8mS8MPm9JAvYsnk)
  - **r:** `0x335973991352411832d6ad7f09ef5596f4c669ff9e5fb7ba7d477b2043985fb7`
  - **s:** `0x5a4dbb47517e6cc0f29882d0c599da0700f3e72c919971f35b8b390ae125b019`
  - **Recovery ID:** `1` (`v = 28`)
  - **Cryptographic Verification:** `ethers.SigningKey.recoverPublicKey(digest, sig) === derivedPublicKey` **[PASS]**

---

## 3. Live TEE Hardware Attestation & DCAP-QVL Evidence

* **Target Enclave:** NEAR AI Cloud (`cloud-api.near.ai`)
* **Attestation Standard:** Intel TDX Quote v4 + NVIDIA GPU Payload + DCAP-QVL Intel Root CA Chain Verification
* **Cryptographic Nonce Binding:** 32-byte session nonce echoed in `REPORTDATA` bytes 32..64
* **Signing Key Binding:** Enclave signing address bound in `REPORTDATA` bytes 0..20
* **DCAP Verification Output (`dcap-qvl verify`):**
  - **PCK Certificate:** Verified to Intel SGX/TDX Intermediate CA and Intel SGX Root CA
  - **TD Report Signature:** ECDSA-P256 signature verified over TD Report body
  - **TCB Status:** `UpToDate` (Platform: `UpToDate`, QE: `UpToDate`)
  - **Advisory IDs:** `[]` (Clean, zero advisories)
  - **Tamper Resilience:** 1-byte mutated quote rejected with `ISV enclave report signature is invalid` **[PASS]**

---

## 4. Complete Protocol Claims Ledger

| Claim ID | Protocol Claim | Verified State | Verification Command | Evidence Location |
|---|---|---|---|---|
| **CLM-HAQ-01** | Live TEE Hardware Attestation quote from NEAR AI Cloud (Intel TDX & NVIDIA GPU) verified to Intel SGX Root CA via DCAP-QVL with fresh nonce validation | `LIVE_DEMONSTRATED` | `npm run verify:tee` | `verifications/01-hardware-attestation.js` |
| **CLM-INTENTS-01** | Cross-chain confidential intent schema audits 210 assets via 1Click Swap API with FAR Shard routing | `LIVE_DEMONSTRATED` | `npm run verify:intents` | `verifications/02-confidential-intents.js` |
| **CLM-HATCH-01** | Nest coordinator binds sub-accounts to OutLayer spending caps and executes 100% refund on TEE timelock expiration on NEAR testnet | `LIVE_DEMONSTRATED` | `npm run verify:testnet` | `docs/canonical/testnet-evidence.json`, `scripts/testnet-e2e.js` |
| **CLM-VAULT-01** | Dark Vault manages multi-epoch rollover, Pod sub-swarms, derives omnichain addresses (BTC, ETH, SOL), and executes live threshold signatures on NEAR testnet | `LIVE_DEMONSTRATED` | `npm run verify:mpc` | `docs/canonical/mpc-evidence.json`, `scripts/testnet-mpc.js` |
| **CLM-RFQ-01** | Confidential RFQ borrow facility executes sealed quote matching and private margin adjudication without public liquidation dumps | `SIMULATED` | `npm run verify:rfq` | `verifications/05-confidential-rfq-adjudication.js` |
| **CLM-OTC-01** | Institutional dark pool crosses complementary block trades at midpoint reference prices with zero slippage, and pools AI compute budgets | `SIMULATED` | `npm run verify:otc` | `verifications/06-otc-and-compute-facilities.js` |
| **CLM-FMEA-01** | 5-layer resilience failure matrix handles Enclave crashes, Agent dropouts, Solver slippages, MPC timeouts, and Rogue agents | `TESTED` | `npm run verify:matrix` | `verifications/07-resilience-failure-matrix.js` |
| **CLM-API-01** | Fly API daemon exposes 18 REST endpoints, real-time SSE event streaming, and x402 PingPay micropayment challenge middleware | `INTEGRATED` | `npm run verify:api` | `verifications/08-api-sse-mcp-e2e.js` |
| **CLM-MCP-01** | Model Context Protocol (MCP) server exposes 6 syndicate tools compatible with `nearai/near-mcp` | `INTEGRATED` | `npm run verify:api` | `src/mcp/server.js`, `bin/fly-mcp.js` |
| **CLM-RUST-01** | NEAR L1 smart contract in Rust (near-sdk 5.1) compiles to release WebAssembly (319 KB), passes 36 tests (28 unit, 6 integration, 2 proptest fuzzing), passes Clippy & Rustfmt, and is deployed on NEAR testnet | `LIVE_DEMONSTRATED` | `npm run verify:rust && npm run verify:testnet` | `contracts/fly-coordinator/src/lib.rs`, `contracts/fly-coordinator/tests/` |
| **CLM-SWARM-01** | 10-Flyer Dark Swarm simulation performs RSA-2048 encryption, in-RAM aggregation, zero-memory wipes, and decoupled pro-rata payouts | `SIMULATED` | `npm run demo:syndicate` | `src/simulation/runner.js` |

---

## 5. Single-Command Reproducibility

Any evaluator or autonomous verification agent can reproduce the entire canonical suite via:
```bash
# Complete Judge Verification
./scripts/verify

# Or via Makefile
make verify

# Or via npm
npm run verify

# Standalone Granular Runs:
npm run verify:testnet   # Re-run live testnet deployment & settlement
npm run verify:mpc       # Re-run live Chain Signatures MPC threshold call
npm run verify:tee       # Re-run live TEE Intel TDX DCAP-QVL verification
```
