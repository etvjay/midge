# Fly Protocol: 3-Minute Video Demo Script
**Event:** NEAR HACKATHON: Build Beyond Boundaries (Nov 2026)  
**Tracks:** Privacy (Primary), Swarms, Agents, Security, DeFi  
**Target Duration:** 2 minutes 45 seconds  

---

## Visual & Audio Walkthrough

### [0:00 – 0:30] Scene 1: The Thesis — TEE as Arbiter, Not Custodian
- **Screen:** Terminal title card / Architecture diagram showing Fly Syndicate Network, TEE Roost, NEAR L1 Coordinator, and NEAR MPC.
- **Narrator Audio:**
  > "Decentralized AI swarms and collective capital face a fundamental paradox: either you give your private keys and custody to an off-chain bot or enclave that can crash and trap your funds, or you use public multisigs that reveal your trades and stall in committee.
  >
  > Welcome to **Fly**: an autonomous syndicate network for private systems on NEAR.
  > Fly's core breakthrough: **The TEE is an arbiter, never a custodian**. AI agents and human wallets pool capital into bounded sub-accounts, deliberate inside hardware-isolated enclaves, settle omnichain orders via NEAR Chain Signatures, and retain a 100% non-custodial, permissionless escape hatch."

---

### [0:30 – 1:15] Scene 2: Live Testnet Execution & Hardware Attestation
- **Screen:** Split view: Terminal running `./scripts/verify` and NEARBlocks Explorer on testnet contract `c.fly-1793636729.testnet`.
- **Narrator Audio:**
  > "Everything you are seeing is live on NEAR Testnet and verifiable with a single command.
  >
  > First, hardware attestation: Fly connects directly to NEAR AI Cloud's Intel TDX enclaves. Notice verification step 1: we parse the raw Intel TDX Quote version 4 and run DCAP-QVL verification all the way to Intel's SGX Root CA. TCB status is UpToDate with zero security advisories. If a single byte of the enclave quote is tampered with, it fails closed immediately.
  >
  > Second, live contract settlement: Three independent flyers deposit escrow into syndicate `syn-flash-1793637420`. The enclave verifies consensus and signs the batch settlement. The L1 Rust contract verifies the Ed25519 signature, domain-separated by contract ID, epoch, and nonce. Settlement completes in just 5.81 TGas on NEAR L1."

---

### [1:15 – 1:55] Scene 3: Sealed Intent Aggregation & Omnichain MPC
- **Screen:** Terminal running `npm run verify:mpc`, showing live `v1.signer-prod.testnet` transaction and derived BTC/ETH/SOL addresses.
- **Narrator Audio:**
  > "How do flyers coordinate confidentially?
  >
  > Flyers submit asymmetric RSA-encrypted intents directly to the Roost enclave. Orders are decrypted exclusively inside enclave RAM. The Roost aggregates the trade into a single batch, signs the proof, and instantly zeroes individual inputs from memory—preventing MEV, front-running, and surveillance.
  >
  > Then, we execute cross-chain using NEAR Chain Signatures. Here is our live transaction calling `v1.signer-prod.testnet`. From a single syndicate identity, we deterministically derive an EVM address, a Bitcoin Taproot address, and a Solana address, recovering the threshold signature byte-for-byte."

---

### [1:55 – 2:35] Scene 4: Failure Mode & Non-Custodial Escape Hatch (`hatch_out`)
- **Screen:** Terminal showing `syn-escape-1793637435` and NEARBlocks explorer showing the `hatch_out` transaction `DR3VmCytXwPM1pk7pvN9GLQnStRWdvEH9eBAZTc7vFgk`.
- **Narrator Audio:**
  > "Now, what happens when things go wrong? Suppose the AI enclave crashes, the network partitions, or the coordinator goes rogue?
  >
  > In every other system, user funds are locked. In Fly, user safety is guaranteed by invariant.
  > Here, we simulate a stalled enclave on syndicate `syn-escape-1793637435`. The 2-block timelock expires. Flyer 2 calls `hatch_out`.
  >
  > Notice on NEARBlocks: the contract immediately repatriates Flyer 2's exact escrow balance directly to their wallet. No coordinator permission required, no multi-sig vote, and no risk of draining other members' escrows. Once all escrows are repatriated, the syndicate cleanly transitions to `AbortedRefunded`."

---

### [2:35 – 2:45] Scene 5: Verifiability & Outro
- **Screen:** Terminal showing `./scripts/verify` passing with all 36 Rust tests and 9 architectural verification layers in <25 seconds. GitHub repository link.
- **Narrator Audio:**
  > "Fly includes a complete Model Context Protocol (MCP) server for Claude Code and Codex, 36 Rust unit, integration, and fuzz invariant tests, and an automated Builder Foundry control plane with zero governance drift.
  >
  > Run `./scripts/verify` to verify the entire system in under 25 seconds with zero external keys.
  > Built for the NEAR Hackathon: Build Beyond Boundaries."
