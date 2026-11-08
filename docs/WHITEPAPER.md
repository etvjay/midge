# Midge: Private Rooms with Public Rules, on NEAR

### Whitepaper: constrained arbitration with independent recovery

Written 2026-11-08, replacing the 2026-11-04 draft. Every claim below cites a claim id (`foundry/claims.jsonl`), a gap (`foundry/gaps.jsonl`), a promoted lab run (`docs/lab-runs/`) or a file. `tests/whitepaper-true.test.js` fails if a cited id, run or path does not exist, if the live contract hash named here is not the last one recorded in `docs/canonical/deployments.json`, or if a statement the repository has contradicted comes back. That test cannot prove a sentence true. It stops the document drifting silently.

**Contract:** `c.fly-1793636729.testnet` (NEAR testnet). **Live code hash:** `AFtZmiNSGMZjHsh12s9PT3hbyGRkAdUwtniXdVNnYJaL`, deployed 2026-11-08. Earlier code hashes, each with the defect it carried, are in `docs/canonical/deployments.json`; evidence recorded under an earlier hash cites that hash. This is a hackathon entry on testnet. Nothing here has run on mainnet.

---

## Abstract

A group that wants to act together with money on a public chain has two bad options. On a transparent ledger everyone sees its intentions, sizes and splits. Off-chain privacy tools usually need someone to hold the keys, and if that someone crashes, goes rogue or is switched off, the money is stuck.

Midge separates the two powers. **The money stays on NEAR**, in a public contract escrow whose rules every depositor agrees to when they deposit. **The deliberation happens in a "room"**: a program (the Roost) that members seal their inputs to, that adds them up or runs a rule, and that signs one proposed settlement. The room is an arbiter and never a custodian. It holds no withdrawal key. The contract carries out a settlement only if it obeys the public rules (allowed recipients, a release cap, a deadline, a one-use nonce). And if the room stops, any member can take their own escrow back from the chain without anyone's permission.

Plain words: the rules are public, the thinking is private, the money cannot be redirected, and nobody can be locked in.

---

## 1. The problem, and what existing designs get wrong

When a group pools money on a transparent chain, three things leak: what it plans to do before it does it, who in the group holds what, and how it splits payments. Competitors and bots can read all three. Moving the thinking off-chain removes the leak, but creates a new risk, because whoever runs the off-chain part decides where the money goes.

Three failure shapes recur (the surrounding market is compared in `docs/canonical/COMPARISON.md`, which says its sources are the author's reading of public material):

- **A custodian bot.** Someone holds the keys. If the host disappears, so do the funds.
- **An unconstrained enclave.** A secure enclave signs any payout the contract accepts. If the enclave code or hardware is broken, the attacker signs a payout of everything.
- **Recovery that needs the operator.** An exit path that depends on the same operator being alive is not an exit.

Midge's answer is **constrained arbitration with independent recovery**: the room can only propose payouts the public rules already allow, and members can leave without it.

(Earlier drafts quoted third-party loss figures for front-running and for institutional repo volumes. They were never re-checked in this repository, so they have been removed rather than repeated.)

---

## 2. How it works

```
 members (humans, agents)                                  NEAR testnet
        │  seal inputs to the room's attested key            ┌───────────────────────────┐
        ▼                                                    │  c.fly-1793636729.testnet │
   ┌──────────┐    one signed settlement per round          │  • escrow per member       │
   │  ROOM    │ ──────────────────────────────────────────▶ │  • public release policy   │
   │ (Roost)  │    Ed25519 over the exact message           │  • verifies the signature  │
   └──────────┘                                             │  • hatch_out: members exit │
        ▲                                                    └───────────────────────────┘
        └── reads (never writes) each member's escrow from two RPC providers at one block
```

### 2.1 The contract (`contracts/fly-coordinator/src/lib.rs`)

A **group** (code name: syndicate) is a pool of members' money with a public rule set. A creator `hatch`es it with a room key, a quorum, an exit timer and a **release policy**: the allowed recipients (at most 8), the largest share that may leave per release window, and a deadline. Depositors name the policy hash when they deposit, so the rules they agree to cannot change under them. From policy version 2 the hash also covers the exit timer (GAP-025).

The properties, and where they are enforced and tested (full tables, with guards and tests per function, are in `docs/STATE_MACHINE.md`; `make check` fails if that document drifts from the source):

- **Escrow conservation.** The total equals the sum of member balances; deductions are exact down to one yoctoNEAR.
- **Bounded authority.** A settlement may pay only 1 to 8 distinct allowed recipients, within the release cap and the deadline, with a valid signature over the exact message `contract : group : epoch : round_nonce : allocations_hash : order_hash`. The nonce rotates after each settlement, so a signature works once.
- **Per-member charges.** A charged settlement lists what each member pays; each charge must not exceed that member's escrow and the charges must sum to the payout.
- **Two-room groups.** A group can require two different rooms to sign the same message.
- **Sovereign exit (`hatch_out`).** After the group's exit timer (at least 10 blocks) or its deadline has passed, any member can take their own remaining escrow, with no room signature and no one else's permission. Others' balances are untouched.
- **Recovery.** If a payout is stuck in flight, anyone can finish its books after 100 blocks; a failed transfer rolls back with the money.

The release cap is paced by a window of twice the exit timer. It bounds the damage a compromised room can do per window, not in total: with a 24-block timer, a stand-in for a compromised room could still release about 90% in nine windows (about four minutes), and one-hour timers stretch the same release to about 18 hours (GAP-024, fixed; GAP-025, the timer is now part of what depositors consent to). The timer has to be chosen on purpose.

**Verification.** 129 Rust tests (unit, integration, invariant, state-machine) pass under `E-RUST-CONTRACT`; the deployed code hash is checked against the record by `scripts/verify-onchain.js`; security-audit fixes to the contract (GAP-026 to GAP-030) were deployed on 2026-11-08, with GAP-026 and GAP-030 re-checked live and the rest unit-tested only. The recorded first settlement on the earlier code burned 5.81 TGas and a `hatch_out` 4.92 TGas (`docs/canonical/EVIDENCE_LEDGER.md`); later changes were not re-measured.

### 2.2 The room (the Roost), in three forms

The same rules, run three ways, honestly labelled:

1. **Local simulation** (`src/enclave/roost.js`). Exact sums, but the process can read every bid and says so. For tests and keyless demos. It makes no secrecy claim.
2. **Model-sealed Roost** (CLM-ROOST-MODEL-01). Each member seals a bid (X25519 key agreement, XChaCha20-Poly1305) to the signing key of a NEAR AI Cloud model whose hardware attestation they verify themselves: an Intel TDX v4 quote whose report data holds the model key and the member's fresh nonce, with the Intel certificate chain and TCB status checked (required by default since GAP-035). A caller can additionally pin the host's measurements (MRTD, RTMR0 to RTMR3, MRSEAM) so that only a build the owner trusts is accepted (GAP-043). Nothing is pinned by default, because deciding which build to trust is the owner's call.
3. **Hosted Roost** (CLM-ROOST-HOSTED-02, CLM-ROOST-HOSTED-03, `deploy/roost/`). The same deterministic code in a container image pinned by digest, run inside a Phala dstack TDX confidential VM. The VM's measured compose file is attested, so a member who verifies the attestation also verifies which image runs and which settings it was given. It was attested on a real TDX machine and accepted by the official `dstack-verifier`, and it was run with the escrow check switched on in the measured file (run `20261108T124630Z-b8de`).

The VMs used in these runs were ephemeral and deleted afterwards. No hosted Roost is running now.

### 2.3 Rounds that cannot sink on one bad bid (escrow-bound rounds)

A charged settlement fails entirely if one named member cannot pay. So the room reads, from at least two independent RPC providers at one final block, what each bidder holds (`src/roost-service/escrow-reader.js`), leaves out anyone who cannot cover their worst case, and records the block in the signed order hash so anyone can look it up (CLM-ESCROW-BOUND-01, run `20261108T103619Z-433a`). If the chain cannot be read, the room refuses with 503 and keeps the bids; on a real TDX VM with both providers unreachable it refused in 55 ms, kept the bid and signed nothing (CLM-ROOST-FAILCLOSED-01, run `20261108T131539Z-a3bd`). A signed round the contract rejected can be abandoned, deliberately and on record (GAP-042).

The wording is deliberate: this makes a rejected settlement **much rarer, not impossible**. A member whose exit timer has already run can still leave between the read and the payout; the room reports `raceFree` and the live runs reported false. The attestation shows which providers the room asks, not that they answer honestly. The design is in `deploy/roost/ESCROW-READER.md`.

### 2.4 One room, many programs

The room runs small fixed programs, each with its own rules and tests: sealed auctions (first and second price, uniform), pools, quotes, ballots, payroll runs, requests for quote and block crosses (state machine and tests in `docs/STATE_MACHINE.md`; experiments `E-AUCTION-PROGRAMS-01`, `E-POOL-PROGRAM-01`, `E-QUOTE-PROGRAMS-01`, `E-BALLOT-PROGRAM-01`, `E-PAYRUN-PROGRAM-01`). The programs are tested offline. Their runs against the real contract, with what each does and does not hide, are written up when each ran: `docs/lab/PAYROLL_RESULTS.md`, `docs/lab/RFQ_RESULTS.md`, `docs/lab/QUOTE_CROSS_RESULTS.md`, `docs/lab/COMPARISON_AUCTIONS.md`, `docs/lab/COMPARISON_RESULTS.md`, `docs/lab/ONGOING_RESULTS.md`, `docs/lab/ROOMSERVICE_RESULTS.md`. Those runs used a local host, not a TEE.

---

## 3. What it is for

Because the contract is general and the programs are small, the same pieces serve different groups. Each line says what the room hides and what stays public.

- **Payroll: private who, with private receipts.** Each person gives a one-time payout address for the run; only the room knows who owns which. Each payee gets a signed receipt, and the receipts' root is in the settlement's signed order hash. **The amounts are public**, and stable distinct salaries let an observer link the same person across runs by amount (`docs/lab/PAYROLL_RESULTS.md`). One settlement pays at most 8 recipients.
- **Sealed bids and block trades.** Bids are not visible before the round closes; the clearing price and winners are. A sealed auction against an open one is compared on testnet in `docs/lab/COMPARISON_AUCTIONS.md`, with its limits (one scripted instance with assumed strategies, not a revenue result).
- **Group decisions.** Secret-ballot voting with a quorum and a rule; the tally is public, the individual votes are not.
- **Investing together.** Midge hides each backer's amount only if everyone deposits the same; when deposits equal bids the privacy gain over a public round is zero (`docs/lab/COMPARISON_RESULTS.md`).
- **Syndicates and ongoing groups** that deposit, decide and settle across epochs (`E-ONGOING-01`).
- **Agent budgets** with bounded sub-accounts and the HTTP 402 payment flow (CLM-HATCH-01, CLM-API-01). Tested; the sub-account model is a JavaScript mirror.

---

## 4. A simulation, with its limits

`scripts/baseline.js` compares eight agents buying through a public constant-product pool against a sealed batch, over 100 runs with a fixed seed, and the table below reproduces exactly with `npm run baseline`:

| Metric | Public sequential | Sealed batch |
|---|---|---|
| Realized slippage | 16.67% ± 0.37% | 15.60% ± 0.37% |
| Predatory bot's profit | $519.44 ± $16.00 | $0.00 ± $0.00 |
| Value preserved per swarm | baseline | +$481.09 ± $10.06 |

The zero is true **by construction**: the model gives the sealed batch no visible orders for the bot to attack. It shows the size of the effect if the assumption holds, not that the assumption holds in the field. The simulation has one pool, a greedy bot and no private order flow.

---

## 5. What is real, and what is simulated

| Component | State | Evidence |
|---|---|---|
| Contract on NEAR testnet | Deployed, live hash above | `scripts/verify-onchain.js`, `E-RUST-CONTRACT` |
| Model-sealed Roost | Live demonstrated | CLM-ROOST-MODEL-01 |
| Hosted Roost on Phala TDX | Attested on real hardware; ephemeral | CLM-ROOST-HOSTED-02, CLM-ROOST-HOSTED-03, CLM-ROOST-FAILCLOSED-01 |
| Escrow-bound rounds | Live on testnet, local host and TDX VM | CLM-ESCROW-BOUND-01 |
| Hardware attestation of the NEAR AI host | Live query, Intel chain checked | CLM-HAQ-01 |
| 1Click asset audit | Live read (210 assets) | CLM-INTENTS-01 |
| FAR private shard, Dark Vault pods, OutLayer | Simulated | CLM-VAULT-01, CLM-HATCH-01 |
| Chain Signatures (Bitcoin, Ethereum, Solana) | The evidence ledger records a live testnet threshold call; `docs/canonical/CURRENT_STATE.md` lists it as simulated. Not re-run for this paper, so treat it as unverified | `docs/canonical/EVIDENCE_LEDGER.md` |
| Lending RFQ and block-trade facilities | Programs tested; no institutional counterparty | CLM-RFQ-01, CLM-OTC-01 |
| Agent tooling (MCP, SDK, HTTP) | Integrated; 15 MCP tools | CLM-MCP-01 (older count), `src/mcp/server.js` |

Reproduce what runs without keys: `make verify` (about 100 s, deterministic). Live checks need a NEAR key, a Phala key or a model key and are opt-in.

---

## 6. Trust model and what this does not claim

**What you must trust.** The creator's choice of room key and payout recipient at `hatch` (a member must inspect them before depositing; the contract records them, it cannot judge them). The hardware vendor for the attested forms. The RPC providers, for escrow-bound rounds, narrowed (not removed) by requiring two to agree on one block.

**Defences, each with an on-chain demonstration.** A compromised room key signing a payout to a stranger is refused on-chain; a payout over the cap is refused; a replayed signature is refused. The three transactions, and the reasoning behind each defence, are recorded in `docs/security/threat-model.md`. They ran against an earlier code hash; the checks they exercise remain in the current code and its tests, but the transactions themselves are not re-runs on the live hash.

**Security audit.** A source-only audit produced fifteen leads, tracked as GAP-026 to GAP-043 and closed or recorded with their limits. The residual risks are listed, not hidden: the exit race above; identical-payload callback ordering; groups that were hatched and never funded cannot be pruned (GAP-030); public deposits and refunds reveal who funded a group and when.

## 7. What this does not claim

- It does not claim secrecy from the hardware vendor, from hardware attacks on TDX, or from a room that is the local simulation.
- It does not claim the amounts of a payout are private. They are public.
- It does not claim a settlement can never be rejected, only that one unfunded bidder can no longer sink a round.
- It does not claim a hosted Roost is running now, or that anything has run on mainnet.
- It does not claim institutional adoption. The lending and block-trade programs run against test accounts.
- It does not claim the simulation's saving holds outside the model.
- The documents this one replaces (SRS, RTM, architecture, use cases, research) are not published; they had drifted from the code.

---

## Reproduce

```bash
make verify          # Rust, WASM, the architectural suite and the Foundry check, about 100 s, no keys
make check           # the control plane: claims, gaps, invariants, state-machine doc
node --test tests/whitepaper-true.test.js   # that this document still cites only what exists
npm run baseline     # the simulation in section 4
node lab/verify-run.js docs/lab-runs/20261108T131539Z-a3bd   # a promoted run's hash-chained log
```
