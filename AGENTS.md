# Fly: Autonomous Syndicate Network for Private Systems on NEAR

## Architecture & SDLC Governance
This repository implements Fly, an autonomous syndicate protocol combining:
1. **NEAR AI Cloud TEEs:** Hardware-isolated enclaves (AMD SEV-SNP/Intel TDX) for confidential multi-agent deliberation.
2. **Confidential Intents & FAR Shard:** Shielded cross-chain intent settlement via 1Click Swap API with IMT tokens.
3. **NEAR Chain Signatures:** Omnichain threshold MPC execution across Bitcoin, Ethereum, and Solana.
4. **OutLayer & The Hatch Protocol:** Bounded agent sub-accounts and automated non-custodial escape hatches (`hatch_out`).

## Canonical Documentation
- SRS: `docs/srs.md`
- Use Cases: `docs/use-cases.md`
- Traceability: `docs/rtm.md`
- Software Architecture: `docs/architecture.md`
- Implementation Plan: `docs/implementation-plan.md`
- Concept Specification: `fly-syndicate-network-concept.md`

## Verification & Test Commands
Run deterministic verification suite:
```bash
npm test                 # Run all 3 master verifications (1.22s)
npm run verify:tee       # Live TEE Hardware Attestation (HAQ)
npm run verify:intents   # 1Click Confidential Intents Liquidity & Pricing
npm run verify:hatch     # Hatch Factory, OutLayer Limits & Escape Hatch FMEA
```

## Environment & Secrets Rules
- All API keys and secrets belong in `.env`.
- Never commit private keys or API credentials to git.
- Testnet first (`*.fly.testnet`).
