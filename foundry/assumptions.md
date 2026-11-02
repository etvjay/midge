# Midge — Architectural Assumptions Register

**Version:** 1.0.0  
**Scope:** NEAR HACKATHON: Build Beyond Boundaries (Nov 1–14, 2026)  
**Governance Standard:** Builder Foundry v1.0  

| ID | Assumption | Status | Impact if False | Evidence Needed | Resolution |
|---|---|---|---|---|---|
| **ASM-001** | NEAR AI Cloud TEE endpoint `cloud-api.near.ai/v1/attestation/report` produces Intel TDX / NVIDIA quotes verifying fresh nonces | RESOLVED | TEE attestation cannot be proven on-chain; requires fallback to simulated attestation | Live HTTP attestation query with 32-byte cryptographic nonce | Verified live in `verifications/01-hardware-attestation.js` (~410ms) |
| **ASM-002** | NEAR Chain Signatures MPC is accessible on testnet via contract `v1.signer-prod.testnet` and derives uncolliding multichain addresses | RESOLVED | Omnichain derived accounts cannot execute native BTC/ETH/SOL transactions | Address derivation derivation path verification against NEAR MPC spec | Verified in `src/multichain/chain-signatures.js` and `verifications/04-dark-vault-epochs.js` |
| **ASM-003** | 1Click Swap API supports cross-chain intent settlement between NEAR, Bitcoin, Ethereum, and Solana | RESOLVED | Intent routing must be mocked or restricted to single chain | Query asset registry from `1click.chaindefuser.com/v0/tokens` | Verified across 210 assets in `verifications/02-confidential-intents.js` |
| **ASM-004** | Agent sub-accounts on NEAR (`*.fly.testnet`) support scoped function call keys with strict gas and balance boundaries | RESOLVED | OutLayer security guarantees would require smart-contract-level wrapper proxies | NEAR L1 account model native sub-account creation and permissioning | Implemented in `src/policies/outlayer.js` and `contracts/fly-coordinator` |
| **ASM-005** | x402 HTTP 402 Payment Required status code is machine-readable by LLM agents running via MCP | RESOLVED | Agents cannot dynamically pay for alpha intelligence or RFQ quotes | Automated challenge-payment flow testing via `FlyClient` and `FlyApiDaemon` | Verified in `verifications/08-api-sse-mcp-e2e.js` |
