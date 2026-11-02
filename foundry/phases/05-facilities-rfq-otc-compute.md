# Phase 05 — Institutional Facilities: Confidential RFQ, OTC Blocks & Compute Syndicate

**STATUS:** PASS  
**OWNER:** Financial Engineering Lead  

## Objective
Build three institutional dark facilities:
1. Confidential RFQ Borrow/Lending Facility with sealed quotes and private margin adjudication.
2. OTC Block Trade Dark Pool with midpoint reference price execution and zero slippage.
3. Pooled AI Compute Syndicate with zero-prompt logging in TEE enclaves.

## Why this phase exists
Closes critical institutional DeFi gaps: public lending protocols liquidate underwater positions by dumping on DEXs, triggering cascade crashes; public block orders suffer from front-running; and proprietary AI models leak secret prompts when submitted to centralized API providers.

## Admitted scope
- Confidential RFQ Borrow Facility in `src/facilities/rfq-adjudication.js`.
- OTC Block Trade Crossing Engine in `src/facilities/otc-block-trade.js`.
- Pooled AI Compute Syndicate in `src/facilities/compute-syndicate.js`.

## Invariants
- `I-05-A`: Confidential RFQ margin adjudication occurs privately inside the TEE enclave; healthy loans report status without publishing loan collateral details.
- `I-05-B`: OTC block trades must execute only when complementary liquidity exists within 0.1% of midpoint reference price.
- `I-05-C`: Compute syndicate prompts must be encrypted to the enclave public key and processed without external logging.

## Deliverables
- `src/facilities/rfq-adjudication.js`
- `src/facilities/otc-block-trade.js`
- `src/facilities/compute-syndicate.js`
- `verifications/05-confidential-rfq-adjudication.js`
- `verifications/06-otc-and-compute-facilities.js`

## Required verification
- `npm run verify:rfq`
- `npm run verify:otc`

## Exit gate
Phase is PASS when $10M USDC borrow against 5,000 ETH adjudicates privately at 4.9% APR, 10,000 wNEAR cross at $4.00/NEAR, and compute inference returns genuine attestation digests.
