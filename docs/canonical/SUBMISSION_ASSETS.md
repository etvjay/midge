# Midge: Hackathon Submission Assets & Pack
**NEAR HACKATHON: Build Beyond Boundaries (Nov 1–14, 2026)**

---

## 1. Social Post (X / Twitter)
*Note: NEAR Hackathon rules require stating it was built at NEAR HACKATHON with video or screenshots attached.*

### Draft Text:
```text
Excited to unveil Midge: the Autonomous Syndicate Network for Private Systems on @NEARProtocol! 🚀

Built at the NEAR HACKATHON: Build Beyond Boundaries (@NEARHorizon).

AI agent collectives and capital pools face a dilemma: trust an off-chain bot with your keys, or leak your private trading alpha to public mempools.

Midge solves this with Constrained Arbitration & Independent Recovery:
🔒 Intel TDX Hardware Attestation via NEAR AI Cloud (DCAP-QVL verified to Intel Root CA)
⚡ Sealed Intent Aggregation (SIA) in memory with zero-memory wipes (MEV eliminated)
🛡️ Bounded Settlement Authority: Enclaves can only settle to allowlisted recipients under strict caps
🚪 Sovereign Escape Hatch (`hatch_out`): Any user reclaims 100% of escrow after timelock without operator assistance
🌐 Omnichain Threshold Execution across BTC, ETH & SOL via NEAR Chain Signatures MPC

Live on NEAR Testnet (c.fly-1793636729.testnet) with 44 Rust tests, property fuzzing & 10 agent MCP tools!

Watch the 2.5-minute demo 👇
#NEAR #NEARProtocol #AI #Privacy #Crypto #BuildBeyondBoundaries
```

---

## 2. Project Description / Idea Text (Character Count: 1,948 / 2,000 max)

```text
Midge is an autonomous syndicate protocol combining hardware-attested confidential computing, cross-chain intent settlement, and omnichain threshold cryptography on NEAR Protocol.

Decentralized swarms and capital pooling face a fundamental trilemma between custody, privacy, and liveness: giving private keys to autonomous off-chain agents creates catastrophic custody risk if the node fails; public multi-sigs leak order strategies and trading weights to MEV front-runners; and traditional smart contract escrows freeze capital permanently if external oracles become unresponsive.

Midge resolves this with a core architectural paradigm: constrained arbitration with independent recovery.

Participants (heterogeneous swarms of AI agents and human wallets) pool capital into bounded sub-accounts on NEAR L1. Deposits and balances are public on-chain, while individual order parameters, strategy weights, and trade bounds are encrypted to an Intel TDX hardware enclave (verified to Intel's Root CA via DCAP-QVL). Deliberation and Sealed Intent Aggregation (SIA) execute in memory before individual inputs are zero-wiped.

Crucially, the enclave holds zero custody. It can only propose settlements strictly bounded by an immutable ReleasePolicy (allowlisted recipients, per-epoch release caps, and block deadlines) to which depositors explicitly consented. Even if an enclave key is compromised, settlements to unauthorized recipients are rejected on-chain.

On NEAR L1, the fly-coordinator contract executes batch settlements in 5.92 TGas. Omnichain transactions settle natively across Bitcoin Taproot, Ethereum, and Solana via NEAR Chain Signatures MPC (v1.signer-prod.testnet). If an enclave or operator stalls, Midge's Hatch Protocol activates a non-custodial escape hatch (hatch_out), allowing any individual depositor to unilaterally repatriate 100% of their escrow balance after a block timelock without operator assistance.
```

---

## 3. Track Alignments & Specific Built Features

| Track | Role | Specific Fit & Built Architecture |
| :--- | :--- | :--- |
| **Privacy** | **Primary** | Hardware-isolated Intel TDX remote attestation from NEAR AI Cloud verified via `dcap-qvl` to Intel SGX Root CA with zero advisories; Sealed Intent Aggregation in RAM with zero-memory wipes. Public on-chain deposits paired with confidential strategy deliberation. |
| **Swarms** | Secondary | Multi-syndicate network topology: collectives of autonomous AI agents and human wallets instantiate syndicates, pool liquidity, and coordinate decisions across specialized multi-agent pods with on-chain discovery (`list_syndicates`, `list_syndicates_by_member`). |
| **Agents** | Secondary | Native Model Context Protocol (MCP) server integration (`FlyMcpServer`, 10 tools) with dual `chain` and `model` modes, allowing Claude Code, Codex, and LLMs to hatch, deposit, settle, and escape directly over stdio JSON-RPC. |
| **Security** | Secondary | Constrained settlement authority with immutable `ReleasePolicy` allowlists and caps; on-chain rejection proofs of malicious settlements; unilateral `hatch_out` escape hatch; 44 Rust tests (34 unit, 6 integration, 4 proptest fuzzing invariants over 10,000+ transitions). |
| **DeFi** | Secondary | 1Click Swap API integration auditing 210 assets, measured economic baseline simulation proving MEV elimination and 1.07% lower slippage, and omnichain settlement to BTC/ETH/SOL via live NEAR Chain Signatures MPC (`v1.signer-prod.testnet`). |

---

## 4. Pre-Submission Human Verification Checklist (Human-Gated)

Before submitting via `POST https://nearhackathon.com/api/applications`:
- [ ] Ensure `.env` and all private key files remain strictly gitignored.
- [ ] Run secret scanner: `git log -p | grep -E "ed25519:|secp256k1:|PRIVATE_KEY"` confirms zero committed credentials.
- [ ] Confirm project metadata:
  - **Project Name:** Midge
  - **Tracks:** `privacy` (primary), `swarms`, `agents`, `security`, `defi`
  - **Lead Name & Email:** [Confirmed by User]
  - **Team Size:** `1` (or user specified)
  - **Mainnet Payout Account:** [User mainnet .near account]
  - **Repository URL:** [Public GitHub URL after human unlocks visibility]
  - **Demo Post URL:** [Public X post link after human posts video]
- [ ] Review final payload printed in console and give explicit "yes" before dispatching.
