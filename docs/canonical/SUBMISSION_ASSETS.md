# Fly Protocol: Hackathon Submission Assets & Pack
**NEAR HACKATHON: Build Beyond Boundaries (Nov 1–14, 2026)**

---

## 1. Social Post (X / Twitter)
*Note: NEAR Hackathon rules require stating it was built at NEAR HACKATHON with video or screenshots attached.*

### Draft Text:
```text
Excited to unveil Fly: the Autonomous Syndicate Network for Private Systems on @NEARProtocol! 🚀

Built at the NEAR HACKATHON: Build Beyond Boundaries (@NEARHorizon).

AI agent swarms and collective capital face a dilemma: trust an off-chain bot with your keys, or leak your private alpha to public mempools.

Fly solves this by turning TEEs into arbiters, NOT custodians:
🔒 Intel TDX Enclaves on NEAR AI Cloud (DCAP-QVL verified to Intel Root CA)
⚡ Sealed Intent Aggregation (SIA) in enclave RAM with zero-memory wipe
🌐 Omnichain Threshold Execution across BTC, ETH & SOL via NEAR Chain Signatures
🛡️ Non-Custodial Escape Hatch (`hatch_out`): Any user exits unilaterally after timelock

Live on NEAR Testnet (c.fly-1793636729.testnet) with 33 Rust tests, property fuzzing & automated MCP tools!

Watch the 2-minute demo 👇
#NEAR #NEARProtocol #AI #Privacy #Crypto #BuildBeyondBoundaries
```

---

## 2. Project Description / Idea Text (Character Count: 1,480 / 2,000 max)

```text
Fly is an autonomous syndicate protocol combining hardware-enforced confidential computing, shielded cross-chain intent settlement, and omnichain threshold cryptography on NEAR Protocol.

Decentralized swarms and capital pooling face a fundamental trilemma between custody, privacy, and liveness: giving private keys to autonomous off-chain agents creates catastrophic custody risk if the node fails; using public multi-sigs leaks private trading strategies and order parameters to MEV front-runners; and traditional smart contract escrows freeze capital permanently if external oracles become unresponsive.

Fly solves this with a core architectural paradigm: the TEE is an arbiter, never a custodian. 

Participants (heterogeneous swarms of AI agents and human wallets) pool capital into bounded sub-accounts on NEAR L1 governed by OutLayer spend policies. Members submit asymmetric encrypted intents directly to a Roost enclave running on NEAR AI Cloud (Intel TDX / NVIDIA CVM). The enclave decrypts orders exclusively in RAM, performs Sealed Intent Aggregation (SIA), signs an Ed25519 consensus proof, and immediately zeroes individual member parameters from memory.

On NEAR L1, the fly-coordinator contract verifies the cryptographic proof with strict domain separation, executing settlement in just 5.81 TGas. Omnichain transactions settle natively across Bitcoin Taproot, Ethereum, and Solana via NEAR Chain Signatures MPC. If an enclave ever stalls or fails, Fly's Hatch Protocol activates a non-custodial escape hatch (hatch_out), allowing any individual depositor to repatriate their exact escrow balance after a block timelock without requiring coordinator approval or draining other members.
```

---

## 3. Track Alignments & Specific Rationale

| Track | Role | Specific Fit & Architectural Implementation |
| :--- | :--- | :--- |
| **Privacy** | **Primary** | Hardware-isolated Intel TDX enclaves on NEAR AI Cloud verify DCAP-QVL to Intel Root CA; Sealed Intent Aggregation decrypts in enclave RAM and wipes inputs upon batching. Zero on-chain alpha leakage. |
| **Swarms** | Secondary | Dark Swarm coordination: heterogeneous collectives of autonomous AI agents and human wallets form ephemeral syndicates, pool liquidity, and coordinate decisions across multi-agent pods. |
| **Agents** | Secondary | Native Model Context Protocol (MCP) server integration (`FlyMcpServer`) allowing Claude Code, Codex, and OpenAI-compatible agents to hatch syndicates, deposit escrow, and stream real-time SSE events. |
| **Security** | Secondary | Non-custodial Hatch Protocol FMEA: automated escape hatch (`hatch_out`) prevents hostage capital; property-based fuzzing (33 tests over 10,000+ transitions) proves escrow balance invariants. |
| **DeFi** | Secondary | Native 1Click Swap API integration across 210 assets, Confidential RFQs with automated LTV/APR health adjudication, and omnichain settlement to BTC/ETH/SOL via NEAR Chain Signatures. |

---

## 4. Pre-Submission Human Verification Checklist (Human-Gated)

Before submitting via `POST https://nearhackathon.com/api/applications`:
- [ ] Ensure `.env` and all private key files remain strictly gitignored.
- [ ] Run secret scanner: `git log -p | grep -E "ed25519:|secp256k1:|PRIVATE_KEY"` confirms zero committed credentials.
- [ ] Confirm project metadata:
  - **Project Name:** Fly Protocol
  - **Tracks:** `privacy` (primary), `swarms`, `agents`, `security`, `defi`
  - **Lead Name & Email:** [Confirmed by User]
  - **Team Size:** `1` (or user specified)
  - **Mainnet Payout Account:** [User mainnet .near account]
  - **Repository URL:** [Public GitHub URL after human unlocks visibility]
  - **Demo Post URL:** [Public X post link after human posts video]
- [ ] Single submission request payload reviewed and authorized.
