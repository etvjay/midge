# Midge: Video Demo Script (Under 3 Minutes)
**Event:** NEAR HACKATHON: Build Beyond Boundaries (Nov 2026)  
**Primary Track:** Privacy & Private AI  
**Secondary Tracks:** AI Swarms, Agent Economy, Unstoppable DeFi, Security  
**Target Duration:** 2 minutes 45 seconds  
*Note: In the testnet demo, a single operator controls the throwaway test accounts to enable deterministic, reproducible execution.*

---

## Visual & Audio Walkthrough

### [0:00 – 0:30] Scene 1: The Core Thesis — Constrained Arbitration with Independent Recovery
- **Screen:** Terminal title card / Architecture diagram illustrating Midge Autonomous Syndicate Network:
  - Heterogeneous Swarms (AI agents + Human Wallets)
  - The Roost: bids sealed to a NEAR AI Cloud model's attested key (Intel TDX)
  - NEAR L1 FlyCoordinator contract (`c.fly-1793636729.testnet`)
  - NEAR Chain Signatures MPC (`v1.signer-prod.testnet`)
- **Narrator Audio:**
  > "Decentralized AI agent swarms and pooled capital face a harsh dilemma: either you surrender your keys to an autonomous off-chain bot or enclave that can crash, trap funds, or be terminated by an operator, or you rely on transparent multisigs that leak trading alpha to mempool front-runners and stall in committee deadlock.
  >
  > Welcome to **Midge**: an autonomous syndicate network on NEAR Protocol.
  >
  > Midge's core breakthrough is **constrained arbitration with independent recovery**:
  > Deposits and balances are public on NEAR L1. Deliberation stays private: each member seals a bid to a NEAR AI Cloud model's attested key, so the coordinator holds only ciphertext and members check that key themselves. The Roost is never a custodian—it can only propose settlements strictly bounded by immutable release policies. And if the coordinator crashes or goes rogue, every depositor can unilaterally reclaim their escrow directly on-chain."

---

### [0:30 – 1:15] Scene 2: Live Testnet Execution & Bounded Authority
- **Screen:** Terminal running `npm run demo` side-by-side with NearBlocks Explorer for `c.fly-1793636729.testnet`.
- **Narrator Audio:**
  > "Here is the entire system executing live on NEAR Testnet, driven entirely through AI agent Model Context Protocol (MCP) tools.
  >
  > First, an agent discovers active syndicates using `midge_list_syndicates`.
  > Next, it hatches a syndicate with an immutable `ReleasePolicy`: allowlisted payout recipients, a 10,000 basis-point per-epoch release cap, and a strict block deadline.
  >
  > Autonomous flyers deposit escrow, explicitly signing their consent to this policy hash on-chain.
  >
  > Now, watch our security defense in action:
  > Suppose the enclave is compromised and attempts to steal funds by signing a settlement to an unauthorized recipient, `thief.near`. The L1 contract verifies the policy at settlement time and **panics on-chain**, completely rejecting the transfer with zero drain. Even if the enclave is compromised, it cannot steal user capital."

---

### [1:15 – 1:55] Scene 3: Valid Settlement & Omnichain Chain Signatures
- **Screen:** Terminal showing Step 5 batch settlement transaction and `npm run verify:mpc` calling `v1.signer-prod.testnet`.
- **Narrator Audio:**
  > "When the sealed bids are aggregated, the Roost signs the canonical 6-tuple message binding the contract ID, syndicate ID, epoch, round nonce, and allocations hash.
  >
  > Settlement executes in just 5.92 TGas on NEAR L1, applying pro-rata balance deductions with exact dust conservation.
  >
  > For cross-chain execution, Midge integrates NEAR Chain Signatures. From our syndicate identity, we deterministically derive Bitcoin Taproot, EVM, and Solana addresses, and obtain one live threshold signature from `v1.signer-prod.testnet`, verified independently. We have not broadcast a transaction on another chain yet."

---

### [1:55 – 2:35] Scene 4: Stalled Enclave Escape Hatch (`hatch_out`)
- **Screen:** Terminal running Step 6 showing `midge_hatch_out` and NearBlocks explorer showing transaction `BiKpqM7jFkVZxex985V9hjJ7mcqpgWbjtXBEL2u7FbZB`.
- **Narrator Audio:**
  > "Now, what happens when things fail? Suppose the TEE crashes, network connectivity is severed, or the operator disappears forever?
  >
  > In traditional systems, user funds are locked indefinitely.
  > In Midge, safety is guaranteed by an immutable on-chain invariant.
  >
  > When the block timelock expires without a valid settlement, any individual depositor calls `hatch_out`.
  > No operator approval required. No enclave signature. No multisig quorum.
  >
  > The L1 smart contract repatriates 100% of the flyer's deposited balance in 5.10 TGas, without touching or diluting any other member's escrow. Autonomous recovery is truly independent."

---

### [2:35 – 2:45] Scene 5: Verifiability & Outro
- **Screen:** Terminal showing `./scripts/verify` passing cleanly with 44 Rust tests, DCAP Root CA attestation, and 0 foundry violations.
- **Narrator Audio:**
  > "Midge features 44 Rust smart contract unit, integration, and fuzz invariant tests, 10 agent MCP tools, a measured economic baseline simulation, and an automated Builder Foundry control plane.
  >
  > Run `./scripts/verify` to verify the entire system yourself in under 20 seconds.
  > Built for the NEAR Hackathon: Build Beyond Boundaries."
