# Midge: Hackathon Submission Assets & Pack
**NEAR HACKATHON (Nov 1-14, 2026)**

> Rewritten 2026-11-04 so that every claim matches what exists today. The earlier draft overclaimed (an
> attested "hardware enclave" for the Roost, "MEV eliminated", "omnichain transactions settle natively").
> **Re-check each line against `docs/canonical/CURRENT_STATE.md` and the README status table before
> submitting.**

---

## 1. Social Post (X)
*Rules: say it was built at NEAR HACKATHON, tag @NEARProtocol and #NEARHackathon, attach the demo video. The human posts it.*

### Draft text
```text
Midge: a private syndicate network for private systems, built at NEAR HACKATHON on @NEARProtocol.

Members seal their bids to NEAR AI Cloud's attested TEE, so the coordinator never sees them. The contract only pays recipients, caps and deadlines everyone agreed to, and any member can exit alone.

Live on testnet. Verify it yourself: npm run verify
#NEARHackathon
```

---

## 2. Project Description / Idea Text (1925 / 2,000 characters)

```text
Midge is a private syndicate network for private systems on NEAR: institutions, funds, DAOs and agent swarms form syndicates and deal with each other without exposing their bids or strategies.

Pooling money forces a choice: trust an off-chain coordinator with custody, or deliberate in public where bids and sizes leak. Midge separates the two. The Nest, a Rust contract on NEAR testnet (c.fly-1793636729.testnet), holds the money and an immutable policy: up to 8 allowed recipients, a cap per epoch, a deadline. A settlement pays out only with a signature bound to the contract, syndicate, epoch, nonce, allocations and order, and only inside that policy; payouts to unapproved recipients are rejected on chain (3 attack transactions recorded). If the coordinator stalls, any member calls hatch_out after the timeout and takes back their own balance alone.

Deliberation is private. Each member seals a bid to a NEAR AI Cloud model's attested key. Every round verifies the Intel TDX quote chain, TCB status and a fresh-nonce binding of the key, and members check that key themselves instead of trusting the coordinator. The coordinator holds only ciphertext. A model adds the bids, and the result is accepted only if three runs agree (8 of 8 live rounds exact, including prompt-injection attempts). Deposits and balances remain public on NEAR L1.

A hosted Roost with exact arithmetic also runs on a Phala confidential VM: its attestation passes the official dstack verifier on real Intel TDX hardware (saved evidence, one command to re-verify). A full member round on it is still to be shown.

Also built: 10 MCP tools for agents, an SDK and HTTP API, a live attestation panel at midge.vercel.app, 47 Rust tests, one verified Chain Signatures signature, and a one-command verifier (npm run verify) that CI runs.

Limits: testnet only; RFQ, OTC and payroll facilities are simulations; nothing broadcast on other chains yet.
```

---

## 3. Track Alignments (what is built, what is not)

| Track | Role | Built | Not built or caveat |
| :--- | :--- | :--- | :--- |
| **Privacy & Private AI** | Primary | Bids sealed to a NEAR AI Cloud model's attested key; per-round Intel TDX chain, TCB and nonce-binding verification; member-side key verification; signed response receipts; live attestation panel; 8 of 8 live rounds exact | The sum is done by a language model; the hosted Roost (exact sums, own TEE) is attested on real hardware but a full member round on it is not yet shown |
| **AI Swarms** | Secondary | Syndicates with on-chain discovery (`list_syndicates`, `list_syndicates_by_member`), a 10-flyer sealed-bid round settled through the Nest simulation | The 20 buyers / 5 sellers scripted demo is not built |
| **AI Security & Defense** | Secondary | Immutable `ReleasePolicy` (recipients, caps, deadline); on-chain rejection of malicious settlements; unilateral `hatch_out`; 47 Rust tests including property tests | No function-call access key scoped to the contract and no prompt-injected-agent attack demo yet |

Tracks not claimed: Unstoppable DeFi (the 1Click integration is read-only and the economic table is a simulation), Agent Economy.

---

## 4. Pre-Submission Human Verification Checklist (Human-Gated)

Before submitting via the form at https://nearhackathon.com/#apply or `POST https://nearhackathon.com/api/applications`:
- [ ] `.env` and key files remain gitignored; run a history scan (done 2026-11-04: no matches for the real key values or common secret patterns).
- [ ] Re-read `https://nearhackathon.com/HACKATHON.md` (dates and rules may change).
- [ ] Repository is public (done 2026-11-04) and a LICENSE file exists (done).
- [ ] Demo post is public, says built at NEAR HACKATHON, tags @NEARProtocol and #NEARHackathon, and has a video attached (screenshots alone are not enough if judges cannot open the demo).
- [ ] Confirm project metadata:
  - **Project name:** Midge
  - **Tracks:** `privacy` (primary), `swarms`, `security`
  - **Team lead name and email:** [User]
  - **Team size:** [User]
  - **Mainnet payout account (named .near account the team creates):** [User]
  - **Repository URL:** https://github.com/etvjay/midge
  - **Demo post URL:** [after the human posts]
  - **What you built (20 to 2000 characters):** the idea text above
- [ ] Print the final JSON payload and wait for an explicit yes before sending. A repository can be submitted only once.
