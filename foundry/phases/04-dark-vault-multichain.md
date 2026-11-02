# Phase 04 — Dark Vault & Omnichain Chain Signatures MPC

**STATUS:** PASS  
**OWNER:** Multichain Systems Lead  

## Objective
Implement multi-epoch persistent treasury governance (Dark Vaults), specialized sub-syndicates (Pods), FAR Shard Intent Minted Token (IMT) accounting, and NEAR Chain Signatures MPC threshold address derivation across Bitcoin, Ethereum, and Solana.

## Why this phase exists
Enables persistent privacy-preserving capital pools that operate across multiple blockchain ecosystems simultaneously without holding cross-chain private keys or trusting centralized bridges.

## Admitted scope
- Dark Vault multi-epoch lifecycle state machine in `src/contracts/nest.js`.
- Pod sub-swarm instantiation and quota allocation.
- Chain Signatures MPC key derivation in `src/multichain/chain-signatures.js` targeting `v1.signer-prod.testnet`.
- FAR Private Shard token mint/burn logic in `src/settlement/far-shard.js`.

## Explicitly excluded
- External testnet faucet funding or real BTC testnet miner fees.

## Invariants
- `I-04-A`: Derived omnichain addresses across BTC, ETH, and SOL must deterministically correspond to the syndicate's NEAR L1 account.
- `I-04-B`: Dark Vault epochs must roll over atomically upon dividend distribution and strategy re-evaluation.
- `I-04-C`: IMT tokens minted on FAR shard must balance 1:1 with collateral locked in the L1 Nest treasury.

## Deliverables
- `src/multichain/chain-signatures.js`
- `src/settlement/far-shard.js`
- `verifications/04-dark-vault-epochs.js`

## Required verification
- `npm run verify:vault`

## Exit gate
Phase is PASS when omnichain derivation succeeds for EVM, Taproot BTC, and Solana, and Dark Vault progresses from Epoch 1 to 2 cleanly.
