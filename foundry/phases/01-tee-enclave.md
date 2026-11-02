# Phase 01 — TEE Hardware Attestation & The Roost Enclave

**STATUS:** PASS  
**OWNER:** Protocol Security Lead  

## Objective
Establish verifiable, confidential computing environments for multi-agent syndicates using NEAR AI Cloud hardware-isolated enclaves (AMD SEV-SNP and Intel TDX) with RSA-2048 asymmetric encryption and in-RAM Sealed Intent Aggregation (SIA).

## Why this phase exists
Closes the transparency dilemma: on-chain agents cannot collaborate on proprietary strategies or sealed-bid auctions without leaking their algorithms and order intentions to public mempools and MEV bots.

## Admitted scope
- Roost TEE daemon implementation in `src/enclave/roost.js`.
- Cryptographic utilities (RSA-2048 keypair generation, encryption, signing, zero-memory wipes) in `src/enclave/crypto.js`.
- Live Hardware Attestation Quote (HAQ) client querying `cloud-api.near.ai/v1/attestation/report`.
- Nonce-protected attestation validation logic.

## Explicitly excluded
- On-chain smart contract settlement (Phase 03 / Phase 07).
- Cross-chain MPC signature generation (Phase 04).

## Preconditions
- Node.js runtime environment.
- Connectivity to `cloud-api.near.ai`.

## Invariants
- `I-01-A`: Raw member trading algorithms and prompt weights NEVER leave enclave RAM unencrypted.
- `I-01-B`: Attestation reports must verify a fresh 32-byte caller nonce to prevent replay attacks.
- `I-01-C`: RAM holding raw member intents must be explicitly zero-wiped immediately post-aggregation.

## Deliverables
- `src/enclave/roost.js`
- `src/enclave/crypto.js`
- `verifications/01-hardware-attestation.js`

## Required verification
- `npm run verify:tee`

## Live verification
- **Required:** YES
- **Target:** `https://cloud-api.near.ai/v1/attestation/report`
- **Observable:** Intel TDX quote payload, gateway signature (`0xb98a78...`), and model signer (`0xfdbd79...`).
- **Success condition:** HTTP 200 with genuine quote matching the submitted nonce.

## Evidence required
- Output log from `verifications/01-hardware-attestation.js`.
- Gateway and model signing addresses.

## Exit gate
Phase is PASS when live hardware attestation query succeeds and verifies in <1.0s.
