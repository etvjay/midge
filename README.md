# Midge: private rooms with public rules, on NEAR

Midge lets a group make a decision in private and pay out money under rules that everyone can read. Members deposit into a program on the NEAR blockchain (a smart contract). The rules fix who can be paid, how much can leave in a given period, and by what date. Members send their bids, votes or amounts sealed to a room that runs in secure hardware. The room works out the result and signs it, and the contract pays only what fits the rules. If the room disappears, any member can take back their own share alone, after a timer.

Deposits, balances and payments are public on NEAR, and so are the rules and the list of accounts that may be paid. What stays private is what members bid, vote or decide. Everything that runs on a chain runs on a testnet.

The words used here are defined in [`docs/GLOSSARY.md`](docs/GLOSSARY.md). In the code a group is a syndicate, the room is the Roost, the rules and the contract are the Nest, and the exit is `hatch_out`.

## Check it yourself

You need Node.js 18 or newer. The full check also needs Rust.

```bash
npm ci
npm run verify:fast                       # about 30 seconds, Node.js only: the JavaScript tests and the claims ledgers
./scripts/verify                          # the whole check, about 6 minutes on a fresh clone, no keys
node lab/verify-run.js docs/lab-runs/20261112T173152Z-e25d   # re-checks one recorded hardware run offline
```

The full check exited 0 on a fresh clone of `master` on 2026-11-12. Two checks skip without keys: the live NEAR AI inference check, and anything that rents hardware. The recorded runs of those are in `docs/lab-runs/`, each with a hash-chained log you can check offline.

## What is real today

Each row names a recorded run or a test you can inspect. Every claim has an entry in [`foundry/claims.jsonl`](foundry/claims.jsonl), and every known problem is in [`foundry/gaps.jsonl`](foundry/gaps.jsonl).

| Thing | Status | Evidence |
|---|---|---|
| The contract with escrow, rules, signed one-use settlements and the exit | On testnet; live code hash `BVcq86Wz…` | [`docs/DEPLOYMENTS.md`](docs/DEPLOYMENTS.md) |
| The room on real Phala TDX hardware | Ran and settled on the contract | `docs/lab-runs/20261112T173152Z-e25d` |
| Pay run with signed invoices, private receipts and an auditor pack | Ran on hardware | `docs/lab-runs/20261112T031407Z-8c64` |
| Sealed quotes (RFQ), buy and sell side | Ran on hardware | `docs/lab-runs/20261112T032202Z-a3a8`, `docs/lab-runs/20261112T032438Z-98db` |
| Signed ballot, with weights and a supermajority rule | Ran on hardware | `docs/lab-runs/20261112T032730Z-3b68`, `docs/lab-runs/20261112T173152Z-e25d` |
| Pools, first-come and pro-rata | Ran on hardware | `docs/lab-runs/20261112T031652Z-b62e`, `docs/lab-runs/20261112T173152Z-e25d` |
| A contract that asks an OutLayer program to sign a settlement | Settled a group on testnet | CLM-OUTLAYER-CONTRACT-01 |
| Chain Signatures: a contract asks NEAR's signer for a payment on another chain | LIVE on testnet (Solana devnet and Ethereum Sepolia) | CLM-CONTRACT-FOREIGN-01 |
| An optional AI review of a pay run, checked by code | Ran against the attested NEAR AI Cloud model | `docs/lab-runs/20261112T173632Z-569c` |

A replay of an earlier settlement was recorded and refused because the group was already settled, not for a nonce mismatch.

## What is not shown

- Anything on mainnet.
- Independent operators. One operator ran every room and account in the tests.
- Private amounts. Deposits, balances and payments are public, so a pay run hides who is paid and shows how much.
- Private rules. Anyone can read who may be paid, the limits and the deadline. Hiding them is planned and not built ([`docs/ROADMAP.md`](docs/ROADMAP.md)).
- Payroll at scale. A settlement pays at most 8 recipients (GAP-053).
- The deployer key of the testnet contract is still held, so its holder could change the contract (GAP-044).
- Simulations stay labelled as simulations: the FAR shard, Dark Vault pods, the compute syndicate and the agent swarm demos.

## Where to read more

| If you want | Read |
|---|---|
| The words, in plain language | [`docs/GLOSSARY.md`](docs/GLOSSARY.md) |
| A short guide for agents and judges | [`docs/START_HERE.md`](docs/START_HERE.md) |
| What exists today, real or simulated | [`docs/canonical/CURRENT_STATE.md`](docs/canonical/CURRENT_STATE.md) |
| The evidence behind each claim | [`docs/canonical/EVIDENCE_LEDGER.md`](docs/canonical/EVIDENCE_LEDGER.md) |
| The design and the trust model | [`docs/WHITEPAPER.md`](docs/WHITEPAPER.md) |
| The demo script | [`docs/canonical/DEMO_SCRIPT.md`](docs/canonical/DEMO_SCRIPT.md) |
| The submission text | [`docs/hackathon-submission.md`](docs/hackathon-submission.md) |
| What is planned and not built | [`docs/ROADMAP.md`](docs/ROADMAP.md) |
| How the lab runs and records experiments | [`docs/LAB.md`](docs/LAB.md) |
| Contract states and invariants | [`docs/STATE_MACHINE.md`](docs/STATE_MACHINE.md) |
| The full README with the problem figures, the measured baseline, the real versus simulated matrix and the file index | [`docs/README_FULL.md`](docs/README_FULL.md) |

## A note on names and history

Midge was previously called Fly. Internal identifiers keep the old codename on purpose (the `fly-coordinator` crate, the `FLY_*` environment variables and the deployed testnet account `c.fly-1793636729.testnet`), so the on-chain evidence and the reproducible build still match. "HAQ" appears in older code and in the contract's error messages, such as `[HAQ REJECT]`. It labels the settlement checks, which are the room's signature, the current round and the hardware attestation.

On 2026-11-12 the history of `master` was rewritten once to remove a directory committed by mistake. The tree is identical before and after, and [`docs/canonical/COMMIT-MAP-2026-11-12.md`](docs/canonical/COMMIT-MAP-2026-11-12.md) maps the old commit ids to the new ones.

Built with AI assistance (Claude Code). The list of libraries and the AI use is in [`docs/README_FULL.md`](docs/README_FULL.md).
