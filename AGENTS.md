# Midge: Autonomous Syndicate Network for Private Systems on NEAR

## Architecture & SDLC Governance
This repository implements Midge, an autonomous syndicate protocol combining:
1. **NEAR AI Cloud TEEs:** Hardware-isolated enclaves (AMD SEV-SNP/Intel TDX) for confidential multi-agent deliberation.
2. **Confidential Intents & FAR Shard:** Shielded cross-chain intent settlement via 1Click Swap API with IMT tokens.
3. **NEAR Chain Signatures:** Omnichain threshold MPC execution across Bitcoin, Ethereum, and Solana.
4. **OutLayer & The Hatch Protocol:** Bounded agent sub-accounts and automated non-custodial escape hatches (`hatch_out`).
5. **Builder Foundry Control Plane:** Machine-readable governance in `foundry/` ensuring zero drift between claims and evidence.

---

## ⚡ Canonical Judge & Evaluator Entrypoint
For both human judges and automated AI agents (Claude Code, Cursor, Codex), the entire repository can be verified with a single command:
```bash
./scripts/verify
# or:
make verify
# or:
npm run verify
```
*Total verification runtime: **<2.0s** (Deterministic, zero external keys needed).*

---

## Canonical Documentation & Control Plane
- **Foundry Control Plane:**
  - State: `foundry/state.json`
  - Claims Ledger: `foundry/claims.jsonl`
  - Gap Ledger: `foundry/gaps.jsonl`
  - Assumptions: `foundry/assumptions.md`
  - Contradictions: `foundry/contradictions.md`
  - Phase Specs: `foundry/phases/*.md`
- **Canonical Evidence & Architecture:**
  - Current State: `docs/canonical/CURRENT_STATE.md`
  - Evidence Ledger: `docs/canonical/EVIDENCE_LEDGER.md`
  - Architecture Decisions (ADRs): `docs/canonical/DECISIONS.md`
  - Submission Pack: `docs/hackathon-submission.md`
  - IEEE 29148 SRS: `docs/srs.md`
  - Requirements Traceability (RTM): `docs/rtm.md`
  - Software Architecture: `docs/architecture.md`
  - Use Cases: `docs/use-cases.md`

---

## Verification & Test Command Reference
```bash
make verify              # Complete judge suite: Rust, WASM, 8-layer suite & Foundry (~1.9s)
make test                # 8-layer master architectural test suite (~1.1s)
make rust                # Production NEAR L1 Rust unit tests (0.12s)
make wasm                # Compile release WebAssembly binary (238 KB)
make demo                # Full 10-Flyer Dark Swarm simulation
make check               # Builder Foundry control plane consistency check

# Standalone granular verifications:
npm run verify:tee       # Live TEE Hardware Attestation (HAQ)
npm run verify:intents   # 1Click Confidential Intents Liquidity & Pricing
npm run verify:hatch     # Hatch Factory, OutLayer Limits & Escape Hatch FMEA
npm run verify:vault     # Dark Vault Multi-Epoch, Pods, FAR Shard & Omnichain MPC
npm run verify:rfq       # Confidential RFQ, Sealed Quotes & Private Adjudication
npm run verify:otc       # OTC Block Trades & Confidential AI Compute Syndicate
npm run verify:matrix    # 5-Layer Resilience Failure Matrix (FMEA)
npm run verify:api       # HTTP Gateway Daemon, SSE Streams, x402 & MCP Server
```

---

## Environment & Security Rules
- All API keys and secrets belong in `.env`. The NEAR chain client does not read `.env` on its own: pass credentials in the environment or point `MIDGE_ENV_FILE` at the file. Without write credentials, chain-mode writes are refused.
- Never commit private keys or API credentials to git.
- Testnet first (`*.fly.testnet`).
- Strict UI Freeze: No frontend modifications; focus entirely on cryptographic protocol, smart contracts, and agent tooling.
