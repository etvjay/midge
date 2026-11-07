# Midge: Video Demo Script (Under 3 Minutes)
**Event:** NEAR HACKATHON: Build Beyond Boundaries (Nov 2026)  
**Primary Track:** Privacy & Private AI  
**Secondary Tracks:** AI Swarms, Agent Economy, Unstoppable DeFi, Security  
**Target Duration:** 2 minutes 45 seconds  
*Note: In the testnet demo, a single operator controls the throwaway test accounts to enable deterministic, reproducible execution.*

---

## Visual & Audio Walkthrough

### [0:00 – 0:30] Scene 1: The Core Thesis — Constrained Arbitration with Independent Recovery
- **Screen:** Terminal title card / Architecture diagram illustrating Midge, private rooms with public rules:
  - Heterogeneous Swarms (AI agents + Human Wallets)
  - The Roost: bids sealed to a NEAR AI Cloud model's attested key (Intel TDX)
  - NEAR L1 FlyCoordinator contract (`c.fly-1793636729.testnet`)
  - NEAR Chain Signatures MPC (`v1.signer-prod.testnet`)
- **Narrator Audio:**
  > "Decentralized AI agent swarms and pooled capital face a harsh dilemma: either you surrender your keys to an autonomous off-chain bot or enclave that can crash, trap funds, or be terminated by an operator, or you rely on transparent multisigs that leak trading alpha to mempool front-runners and stall in committee deadlock.
  >
  > Welcome to **Midge**: a network of private rooms with public rules on NEAR Protocol.
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

### Optional Scene 2b (about 25 s): A compromised agent cannot take the money
- **Do:** `node lab/run.js --only E-SECURITY-FCKEY-01`
- **See:** an agent that holds only a function-call access key (coordinator contract, `hatch_out` only, 0.2 NEAR of gas) is handed a prompt-injection ticket telling it to send NEAR to an attacker, add a key and call `settle_batch`. Eight attempts are each refused by the protocol before they run ("Access key requires full access", "Access key does not allow method settle_batch", "Deposit is not allowed with function call"); the attacker and the owner keep their balances. The control line shows the same transfer going through with a full-access key. Then the agent's one legitimate act: after the timelock it takes the owner's funds back, and the receipt shows exactly that amount paid to the owner.
- **Say:** "This bounds a compromised agent by what its key can do. It is not a claim that the model resists injection."

---

### Optional Scene 2c (about 30 s): The attested model decides the split, the contract bounds it
- **Do:** `node lab/run.js --only E-ADVISOR-LIVE-01`
- **See:** the Roost totals two sealed bids exactly (0.06 NEAR) and tells the attested NEAR AI model only that total and three recipient ids. The model answers 0.03 / 0.02 / 0.01. The Roost signs within the total, the contract pays exactly those amounts, and the allocations hash the contract logged matches the model's signed, decrypted answer. Then the same machinery with a lying advisor: a split above the total is refused by the Roost, a payment to someone outside the policy is refused by the contract, and an unreachable model simply settles on the exact rule.
- **Say:** "The model advises. It can make a bad split. It cannot make a bigger payout or pay someone outside the policy."
- **Do (all three together):** `node lab/run.js --only E-COMBINED-LIVE-01`
- **See:** a real Phala TDX VM is deployed and its attestation verified; members seal bids to it; it totals 0.06 NEAR; the attested NEAR AI model is told only that total and proposes 0.03 / 0.02 / 0.01; the VM signs within the total; the contract pays exactly that. Then a 0.06 proposal against a 0.04 total is refused by the VM, a signed payout to an account outside the policy is refused by the contract, and the VM is deleted. Recorded: run `20261105T031634Z-e166`, settlement `4roKauYHdJ1jAYBHNARLUUwkMQJA5mZ8zL56p2nTbDWw`; `node scripts/verify-advice.mjs docs/lab-runs/20261105T031634Z-e166` re-checks that the payout is the model's attested answer.

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
- **Screen:** Terminal showing `./scripts/verify` passing cleanly with 53 Rust tests, DCAP Root CA attestation, and 0 foundry violations.
- **Narrator Audio:**
  > "Midge features 53 Rust smart contract unit, integration, and fuzz invariant tests, 10 agent MCP tools, a measured economic baseline simulation, and an automated Builder Foundry control plane.
  >
  > Run `./scripts/verify` to verify the entire system yourself in under 20 seconds.
  > Built for the NEAR Hackathon: Build Beyond Boundaries."
