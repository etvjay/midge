# Phase 02 — Confidential Intents & Liquidity Routing

**STATUS:** PASS  
**OWNER:** Cross-Chain Liquidity Lead  

## Objective
Implement zero-MEV confidential intent schemas using NEAR's 1Click Swap API specification, linking syndicates to 210 cross-chain assets across NEAR, Bitcoin, Ethereum, and Solana with settlement graph decoupling.

## Why this phase exists
Prevents front-running, sandwich attacks, and graph analysis of pooled syndicate capital during external liquidity acquisition.

## Admitted scope
- 1Click Swap API client auditing 210 cross-chain tokens.
- Audited snapshot fallback preventing CI/test flakiness during upstream maintenance.
- Intent Minted Token (IMT) bridge schema between public NEAR L1 and FAR Private Shard.
- Non-custodial refund address binding for escape hatch triggers.

## Explicitly excluded
- Multi-party computation (MPC) threshold signing (handled in Phase 04).
- Smart contract execution logic (handled in Phase 07).

## Preconditions
- Phase 01 complete (TEE enclave ready for batch settlement).

## Invariants
- `I-02-A`: Deposits into syndicate escrow must be decoupled from final payout distribution addresses.
- `I-02-B`: Maximum slippage tolerance must be enforced at the intent layer (default 1.0%).
- `I-02-C`: Every intent must declare an explicit refund recipient tied to the syndicate escape hatch.

## Deliverables
- `src/settlement/far-shard.js`
- `verifications/02-confidential-intents.js`

## Required verification
- `npm run verify:intents`

## Live verification
- **Required:** YES (with automated snapshot fallback)
- **Target:** `https://1click.chaindefuser.com/v0/tokens`
- **Observable:** Asset registry count >= 210 tokens across NEAR, BTC, ETH, SOL.
- **Success condition:** 210 tokens audited, valid cross-chain intent schema generated.

## Exit gate
Phase is PASS when intent schemas match 1Click specification and verified token registry loads in <0.5s.
