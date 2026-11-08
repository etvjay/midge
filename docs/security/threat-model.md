# Midge: Threat Model & Security Architecture

**Status:** updated 2026-11-08 (the previous version was dated 2026-11-02 and had drifted). `tests/public-docs-true.test.js` fails if an id, path or count here disagrees with the repository. It cannot prove a defence works; the evidence for each is named under it.
**Scope:** the contract `c.fly-1793636729.testnet` on NEAR testnet (live code hash `AFtZmiNSGMZjHsh12s9PT3hbyGRkAdUwtniXdVNnYJaL`, deployed 2026-11-08; earlier hashes are listed in `docs/canonical/deployments.json`) and the three forms of the Roost.

---

## 1. Security paradigm

Midge works under **constrained arbitration with independent recovery**.

It does not assume a trusted execution environment (TEE, a hardware-isolated computer) is a trustless box or an infallible custodian. The room (the Roost) is treated as a bounded arbiter:

- **The room deliberates privately.** Members seal their inputs to a key whose hardware attestation they can verify; the room adds them up or runs a fixed program.
- **Its authority is bounded on-chain.** A room signature can release funds only within a public `ReleasePolicy` the depositors accepted when they deposited: allowed recipients, a release cap per window, a deadline.
- **Members keep an independent exit.** If the room crashes, stalls, censors or is taken down, a member can take their own unspent escrow out with `hatch_out`, without anyone's permission, once the group's exit timer has run.

*Plain words:* the room can propose, the contract decides, and nobody has to rely on the room to get their own money out.

---

## 2. Assets and actors

### 2.1 Assets

1. **Escrowed capital:** NEAR held in the contract's per-member escrow (`c.fly-1793636729.testnet`).
2. **Pre-trade intent:** order sizes, limits, bids, votes and payroll details members submit to a room.
3. **The room's signing key:** the key whose signature the contract accepts for a group.
4. **Deliberation provenance:** attestation quotes (Intel TDX quote v4) and the signed settlement with its order hash.
5. **Derived omnichain keys** (Bitcoin, Ethereum, Solana) held by the NEAR Chain Signatures network, where used.

### 2.2 Actors

- **Member (depositor, human or agent).**
- **Group creator:** chooses the room key, the quorum, the exit timer and the release policy at `hatch`.
- **The room (Roost):** the local simulation, a model-sealed Roost on a NEAR AI Cloud model host, or a hosted Roost in a Phala TDX VM. Each is described in `docs/WHITEPAPER.md`.
- **Coordinator:** the party that runs the room and relays its signature.
- **The contract (`FlyCoordinator`):** the on-chain state machine (`docs/STATE_MACHINE.md`).
- **RPC providers:** servers that answer questions about the chain; the room asks two of them for escrow balances.
- **Front-running bot / mempool observer.**
- **Hardware vendor and cloud operator.**

---

## 3. Trust assumptions and boundaries

| Component | Trust assumption | Failure mode | Protocol defense |
| :--- | :--- | :--- | :--- |
| **Release policy** | A depositor reads the policy before consenting | A creator sets a bad allowlist or their own key as the room key | `policy_hash` is named on deposit and covers recipients, cap, deadline and exit timer (C-09); the contract records the room key and recipients, but cannot judge them |
| **The room's key** | The attested hardware runs untampered code | The key is stolen or the hardware is broken | The key cannot pay outside `allowed_recipients` or beyond the cap (C-02, C-03) |
| **Operator liveness** | The room delivers settlements | The operator stalls or vanishes | `hatch_out` after the exit timer (C-07) |
| **Hardware vendor** | Intel TDX isolates the room | Published attacks on TDX exist | Bounded damage: one settlement per window within the policy; not a claim that the hardware cannot be broken |
| **Which build runs** | A member checks the measurements of the host | A different genuine TDX machine answers | Optional pin of MRTD and RTMR0 to RTMR3 (GAP-043); nothing is pinned by default |
| **RPC providers** | At least two independent providers agree on the block | A provider lies or is behind | Two must agree on one block, the block is recorded in the signed order hash; the read fails closed (GAP-041) |
| **NEAR** | The chain gives finality | A reorganisation | NEAR's own finality |
| **Public state** | Deposits, amounts and member ids are public | An observer traces funding accounts | Midge claims privacy of the deliberation, not anonymity of deposits |

> **Public-chain reality.** Deposits, refunds, the final payout recipients and their amounts are ordinary NEAR transactions. Observers see account ids, amounts and timing on a block explorer. Midge protects what the members said and bid, not who funded the group or what a settlement paid.

---

## 4. Threats, defenses and verifications

### T1: A stolen or compromised room key (malicious settlement)

- **Attack:** an attacker with the room key signs a `settle_batch` that sends the escrow to an account they control.
- **Defense:** the bounded `ReleasePolicy`. The contract requires that every destination is on `allowed_recipients` (at most 8 accounts), that the total does not exceed the release cap for the window, and that the deadline has not passed.
- **On-chain evidence:** a settlement naming a recipient that was not on the allowed list (`f2.fly-1793636729.testnet`) was **rejected on-chain** by the contract (transaction `ExMmWDawYYjZ7gyg3KZe4Hpf6YZJx68Pjzrw7M4bmLAh`, "Recipient … is not in allowed_recipients"). A settlement over the cap was **rejected** (`pH4syNzprgLHb5f8sVxrS8krPufbx4kL8g5Sve3A4fW`, "Allocation sum exceeds max_release_bps_per_epoch cap"). Both ran against an earlier code hash; the same checks are in the current code and its tests, and the transactions are not re-runs against the live hash.
- **What a compromised key can still do:** pay an allowed recipient up to the cap, once per window. A window is twice the exit timer, so how much that is in real time is set by the timer the group chose (GAP-024, GAP-025). With a 24-block timer a stand-in for a compromised room released about 90% in nine windows (about four minutes). The timer must be chosen on purpose.

### T2: The operator vanishes or censors (stalled funds)

- **Attack:** the room's host goes offline, crashes or refuses to deliver signatures.
- **Defense:** the unilateral escape hatch `hatch_out`. Once `min(epoch_start_block + exit timer, settle_deadline_block)` has passed and nothing is in flight, any member can call it: no coordinator signature, no operator permission, no admin key. The contract returns that member's remaining escrow and leaves others' balances untouched (C-07, C-08). A payout stuck in flight can be finished by anyone after 100 blocks, so it cannot keep the exit shut.
- **On-chain evidence:** a member's `hatch_out` succeeded on testnet and returned their escrow (transaction `BiKpqM7jFkVZxex985V9hjJ7mcqpgWbjtXBEL2u7FbZB`; 5.32 TGas burnt across the transaction and its receipts, read from an archival node on 2026-11-08).

### T3: Pre-trade leakage and front-running (MEV)

- **Attack:** a bot sees order sizes, limits and directions and trades ahead of them.
- **Defense:** members seal inputs to the room's key. In the model-sealed and hosted forms the key is bound to a hardware attestation (an Intel TDX quote v4, with the Intel certificate chain and TCB status checked; GAP-035). The local simulation makes **no** secrecy claim: its process can read every bid.
- **Evidence and its limit:** `scripts/baseline.js` shows sealed batch execution lowering slippage from 16.67% to 15.60% and removing the bot's $519.44 profit in a simulation. The bot's zero is **by construction** (the model gives it nothing to see); it shows the size of the effect if sealing works as assumed, not that it works that way in the field.

### T4: Replay and cross-group signature confusion

- **Attack:** a captured signature is replayed on another group or another epoch, or a settlement is submitted twice.
- **Defense:** the signed message binds `contract : group : epoch : round_nonce : allocations_hash : order_hash`; the nonce changes after every settlement, so a signature works once (C-04, C-05). The order hash may not contain `:` (GAP-026), so two messages cannot be written the same way. The room itself signs at most one settlement per round (R-01).
- **On-chain evidence:** a settlement submitted again for a group that had already settled was **rejected on-chain** (transaction `FMpQxKoBP8dvqdJaB5hHWaHnWYwF9qzPVUx9RAYgxErg`, "Syndicate is not active"). That shows a replay cannot pay twice because the group was already settled. It is **not** a demonstration of the nonce check, which is covered by the contract's tests (C-05), and an earlier version of this document wrongly described the transaction as a rejection for a stale nonce.

### T5: Rounding and accounting exploits

- **Attack:** integer truncation across up to 50 members accumulates, letting a payout draw more than the escrow.
- **Defense:** exact accounting. Each member's deduction is computed as `balance × payout / total` with a floor, using a division that does not overflow (the first deployment overflowed for realistic amounts; GAP-022, fixed). The remainder (`payout − sum of deductions`) goes to the member with the **largest balance**, and a deduction is never more than that member's balance. The total equals the sum of the members' balances while nothing is in flight (C-01), and a charged settlement's charges sum exactly to the payout (C-11).
- **Evidence:** the contract's invariant and property tests (`foundry/invariants.json`).

### T6: One unfunded bidder sinks a whole charged round

- **Attack:** in a charged settlement, one named member who cannot pay makes the contract reject the whole settlement, so a single bad bid denies everyone.
- **Defense:** before running a program the room reads, from at least two independent RPC providers at one final block, what each bidder holds, and leaves out anyone who cannot cover their worst case. The block is recorded in the signed order hash. If the chain cannot be read the room refuses and keeps the bids. If the contract rejects a signed round the coordinator can abandon it, on record (GAP-042).
- **Evidence:** CLM-ESCROW-BOUND-01 (runs `20261108T103619Z-433a` and, inside a real TDX VM, `20261108T124630Z-b8de`); the fail-closed behaviour with both providers unreachable, on hardware: CLM-ROOST-FAILCLOSED-01 (run `20261108T131539Z-a3bd`).
- **Limit:** this makes a rejected settlement **much rarer, not impossible**. A member whose exit timer has already run can leave between the read and the payout. The attestation shows which providers the room asks, not that they answer honestly.

### T7: A different machine answers in place of the attested host

- **Attack:** the member is shown a valid Intel quote from a machine that is not the build they meant to trust.
- **Defense:** the quote proves the signing key and a fresh nonce are inside a genuine TDX machine. A caller can additionally pin the measurements (MRTD, RTMR0 to RTMR3, MRSEAM); a mismatch fails and names the field (GAP-043). For the hosted Roost the measured compose file also names the container image digest and the settings.
- **Limit:** nothing is pinned by default, because which build to trust is the owner's decision.

---

## 5. Residual risks and what Midge does not claim

1. **Hardware side channels and physical access.** Published attacks on Intel TDX show that an operator with specialised equipment may observe microarchitectural signals. Midge does not claim invulnerability to them. The defense is economic bounding: a broken enclave still cannot pay outside the consented policy, and only up to the cap per window.
2. **A creator who is also the operator.** The creator chooses the room key and the payout recipient. If a creator names their own wallet as the recipient and their own key as the room key, they can sign a payout to themselves. Members must inspect both before depositing. The tools surface the recipient list and room key for review; Midge cannot judge them.
3. **The exit race** (T6).
4. **Public deposits, refunds and payouts.** The funding accounts, amounts and timing are public.
5. **A group that was hatched and never funded** cannot be pruned and has no exit (GAP-030).
6. **A callback whose payload is identical to another's** can be matched to the wrong record. This was accepted and is recorded for the next contract change.
7. **Execution quality.** The room proves a specific algorithm ran; it does not make a trade profitable.
8. **Where the amounts of a payout are visible.** A settlement is a public transfer, so payroll hides who is paid, not how much.
9. **No hosted Roost is running now.** The hosted runs used ephemeral VMs that were deleted afterwards, and nothing has run on mainnet.

*Audit.* A source-only security audit of the contract and the room produced fifteen leads, tracked as GAP-026 to GAP-043 in `foundry/gaps.jsonl`, each with its evidence and its limit.
