# NEAR HACKATHON: Build Beyond Boundaries — Official Submission Pack
### Event Window: November 1–14, 2026 | $250k Prize Pool

---

## 1. Official Submission Metadata

* **Project Name:** Midge — Private Rooms with Public Rules, on NEAR
* **Primary Track:** Privacy & Private AI
* **Secondary Tracks:** AI Swarms, Agent Economy, Unstoppable DeFi
* **Target Network:** NEAR L1 Testnet (contract `c.fly-1793636729.testnet`; nothing has run on mainnet)
* **Repository:** Public GitHub Repository
* **Built Within Window:** November 1–14, 2026

---

## 2. Official Form Description (Formatted for 20–2,000 Char Limit)

```text
Midge is a network of private rooms with public rules on NEAR. A group (AI agents, a syndicate, a treasury) deposits into a public contract escrow whose rules every depositor accepts: who can be paid, how much can leave per window, a deadline. The thinking happens in a private room that members seal their bids to. The room can only propose a payout inside those rules, and if it stops, any member leaves alone with their own money.

What is built and checked:
1. A NEAR L1 contract in Rust (near-sdk 5.1), live on testnet: one-use signed settlements, per-member charges, a release cap and a permissionless exit (hatch_out). 129 Rust tests, a state-machine document kept true by a check, and a source-only security audit whose fixes are deployed.
2. NEAR AI Cloud TEEs: bids are sealed to a NEAR AI Cloud model's attested Intel TDX key, so the coordinator holds only ciphertext. A hosted room runs in a Phala dstack TDX VM and its attestation passes the official dstack-verifier. On real hardware it left out an unfunded bidder, settled on testnet, and refused to run when it could not read the chain. Without a key the room is a local simulation that can read bids, and says so.
3. Chain Signatures: one threshold signature from v1.signer-prod.testnet was produced and verified, and Bitcoin, Ethereum and Solana addresses are derived. Nothing was broadcast on another chain.
4. Confidential Intents: the 1Click asset registry is read live. The FAR private shard is an in-memory simulation; no claim of private on-chain settlement is made.

Also: an MCP server with 15 tools, an SDK, x402 agent payments, sealed auctions, pools, ballots, requests for quote and payroll (private who, private receipts; the amounts are public). Every claim has a command anyone can re-run (make verify, no keys), and its limits are written beside it.
```
*(Character count: 1,832 / 2,000, checked by `tests/public-docs-true.test.js`)*

---

## 3. Toolchain & Rust-to-WASM Compilation Reference

### Rust Environment
- **Rust Toolchain:** `cargo 1.98.0` / `rustc 1.98.0`
- **WASM Target:** `wasm32-unknown-unknown`
- **Smart Contract Framework:** `near-sdk = "5.1.0"` with `unit-testing`

### Exact Build & Verification Commands
```bash
# 1. Run Complete Canonical Verification Suite (about 100 s, no keys)
./scripts/verify

# 2. Run NEAR L1 Smart Contract Rust Unit & Invariant Tests
npm run verify:rust

# 3. Build WebAssembly Binary for NEAR L1
npm run build:wasm
# Output: contracts/fly-coordinator/target/wasm32-unknown-unknown/release/fly_coordinator.wasm

# 4. Run Full 10-Flyer Dark Swarm Simulation with End-to-End Encryption
npm run demo:syndicate
```

---

## 4. Submission Video / X Demo Post Script

**Draft X Post Copy:**
> Built for @NEARProtocol Hackathon: Build Beyond Boundaries (Nov 2026).
>
> **Midge**: private rooms with public rules, on NEAR.
>
> The money stays in a public contract escrow. A private room (Intel TDX, attested) can only propose payouts inside rules every depositor accepted, and any member can leave alone with their own money.
>
> Every claim has a command you can re-run, and its limits beside it: make verify, no keys.
> [Repo / Demo Video] #NEARHackathon #NEAR #AI #Privacy

---

## 5. Agent Skills & MCP Compatibility

Midge integrates with NEAR's official agent infrastructure:
- **`nearai/near-mcp` Compatibility:** [`src/mcp/server.js`](../src/mcp/server.js) and `src/mcp/rooms-tools.js` expose 15 tools, among them `midge_hatch_syndicate`, `midge_submit_sealed_intent`, `midge_verify_haq_attestation`, `midge_create_confidential_rfq`, `midge_match_otc_block`, `midge_hatch_out` and the hosted-room tools (`midge_run_room`, `midge_abandon_room_round`).
- **Official Agent Skills:** not tested here. The compatibility with `near/agent-skills` is an intention, not a result.
