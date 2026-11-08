# Midge: Private Rooms with Public Rules, on NEAR

## Architecture & SDLC Governance
This repository implements Midge, a network of private rooms with public rules (see `docs/GLOSSARY.md` for the words), combining:
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
*Total verification runtime: about **100 s** on this machine (deterministic, zero external keys needed). Earlier text said under 2 s; that was the time of the first, much smaller suite.*

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
  - Whitepaper: `docs/WHITEPAPER.md` (kept true by `tests/whitepaper-true.test.js`)
  - State machines and invariants: `docs/STATE_MACHINE.md` (kept true by `make check`), with `docs/IMPLICIT_STATE_MACHINES.md`
  - Research and planning documents (SRS, RTM, architecture, implementation plan, use cases, research reports, session handoffs, the Roost TEE plan, specs and plans) are **not in this repository**: they went stale against the code and are kept only on the author's machine.

---

## Verification & Test Command Reference
```bash
make verify              # Complete judge suite: Rust, WASM, 8-layer suite & Foundry (~100 s)
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

## Default Working Pipeline (every change, in this order)
Set 2026-11-08. Skip a step only when the user says so, and say which step was skipped.
1. **Shape it** — `superpowers:brainstorming`, then `mattpocock-skills:grilling` (or `domain-modeling` when terms are unclear) until the design is settled. Write the result down and get the user's approval before building: the spec and plan are working documents in `docs/superpowers/` that are **kept locally and not published** (they go stale); anything lasting goes to a tracked place: `docs/canonical/DECISIONS.md` for a decision, `foundry/gaps.jsonl` and `foundry/claims.jsonl` for gaps and claims, `docs/STATE_MACHINE.md` for states and invariants. Use `superpowers:writing-plans` for anything larger than one sitting.
2. **Build it test-first** — `superpowers:test-driven-development` / `mattpocock-skills:tdd`: a failing test, watch it fail for the right reason, then the fix. Bugs go through `mattpocock-skills:diagnosing-bugs` (a red loop first, then hypotheses) and `superpowers:systematic-debugging`.
3. **Prove it with the lab method** — `research-sequence-lab`: predictions committed before the run, an experiment that can fail, mutation checks on the test, a hash-chained log, promoted with `node lab/verify-run.js`. Anything claimed as "live" or "verified" needs a promoted run, not a one-off script.
4. **Record it** — gap ledger (`foundry/gaps.jsonl`), claims (`foundry/claims.jsonl`), ADR, evidence ledger, `docs/canonical/CURRENT_STATE.md`. A claim without a command someone can re-run is "unverified", never "verified".
5. **Check before saying done** — `superpowers:verification-before-completion`, then `mattpocock-skills:code-review` / `superpowers:requesting-code-review`. Report what ran and what did not.
6. **Gates that stay human** — push, deploy, redeploy, X post, submission, mainnet: ask first, and run `git push` as its own command. Say "fixed in the code" until it is live.

## Environment & Security Rules
- All API keys and secrets belong in `.env`. The NEAR chain client does not read `.env` on its own: pass credentials in the environment or point `MIDGE_ENV_FILE` at the file. Without write credentials, chain-mode writes are refused.
- Never commit private keys or API credentials to git.
- Testnet first (`*.fly.testnet`).
- Frontend: the default focus is the cryptographic protocol, smart contracts and agent tooling. Site changes (`site/`) are made only when the user asks for them, as in the 2026-11 site rebuild; follow `docs/DESIGN_SYSTEM.md` and `docs/GLOSSARY.md` when you do.
