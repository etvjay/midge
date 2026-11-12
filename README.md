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
npm run verify:onchain                    # reads the live contract and compares its code hash with the one recorded in deployments.json
node lab/verify-run.js docs/lab-runs/20261112T173152Z-e25d   # re-checks one recorded hardware run offline
```

The full check exited 0 on a fresh clone of `master` on 2026-11-12. Two checks skip without keys, which are the live NEAR AI inference check and anything that rents hardware. The recorded runs of those are in `docs/lab-runs/`, each with a hash-chained log you can check offline.

## The contracts on testnet

| Account | What it is | Code hash |
|---|---|---|
| [`c.fly-1793636729.testnet`](https://testnet.nearblocks.io/address/c.fly-1793636729.testnet) | The contract every claim here is about. It holds the escrow, the rules, the signed one-use settlements and the exit. | `BVcq86Wz5Q3kcdBdcUhfQVfQtC6CmGwcXuMd52aW6gTp`, live since 2026-11-11 06:38 UTC |
| `m.fly-1793636729.testnet` | A copy the lab uses for experiments that need a build with a test-only setting. It is not the contract being judged. | Its own build |

`npm run verify:onchain` reads the live code hash from the chain. The contract has run 12 code hashes in all, and [`docs/canonical/deployments.json`](docs/canonical/deployments.json) lists each one with the reason for the change. The contract source is in `contracts/fly-coordinator`, and the build reproduces the deployed bytes (CLM-BUILD-MATCHES-DEPLOYED-01).

## Tests and recorded runs

- The contract has 174 Rust tests (unit, integration, invariant and state machine), and the JavaScript side has 473 tests, which include checks that this README and the other public documents agree with the code.
- The lab has 66 experiments with a recorded run, and 65 have at least one passing run. The one exception failed on hardware, is kept as a failure and is explained in GAP-046.
- Each experiment states its predictions before it runs, and its log is hash-chained so a change to any event shows. The runs are in `docs/lab-runs/`, and [`docs/LAB.md`](docs/LAB.md) explains the method.
- Failed runs are kept. For example, the AI review of a pay run failed twice before it passed, and all three runs are in `docs/lab-runs/`.

## One full loop

The run `docs/lab-runs/20261112T031407Z-8c64` is a complete pay run on real hardware, and the detailed report is next to it in `report.md`. First, a Phala TDX machine started the room, and the checker verified its hardware attestation and the pinned code before any member trusted it. Second, an employer and three payees sent sealed, signed lines and invoices, and the room refused the run because one invoice said 0.03 and the approved line said 0.035. Third, after the line was corrected the room signed a settlement, and the contract accepted it in transaction [`J7xyrFuf…`](https://testnet.nearblocks.io/txns/J7xyrFufPi9Lv2FWQn56cxWwqzfHyzC53gJYU7wNkQGV). Fourth, the chain showed exact amounts, 0.043 to one payee, 0.012 to the tax account and 0.006 to the benefits account, and the employer was charged the gross total. Fifth, each payee opened their own signed receipt and checked it against the order hash on the chain, and another payee's key could not open it. Sixth, the employer opened one line for an auditor, who verified it against the chain and saw no other person. Seventh, the accounts, the group and the machine were deleted, at a cost of about $0.002. Amounts and recipients stay public on NEAR, so what the loop hides is who each address belongs to.

## What is real today

Each row names a recorded run or a ledger entry. Every claim has an entry in [`foundry/claims.jsonl`](foundry/claims.jsonl), and every known problem is in [`foundry/gaps.jsonl`](foundry/gaps.jsonl).

| Thing | Status | Evidence |
|---|---|---|
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

- Reach and trust.
  - Nothing runs on mainnet.
  - One operator ran every room and account in the tests, so no independent operators have been shown.
  - The deployer key of the testnet contract is still held, so its holder could change the contract (GAP-044).
- Privacy.
  - Deposits, balances and payments are public, so a pay run hides who is paid and shows how much.
  - Anyone can read who may be paid, the limits and the deadline. Hiding them is planned and not built ([`docs/ROADMAP.md`](docs/ROADMAP.md)).
- Scale. A settlement pays at most 8 recipients (GAP-053).
- Simulations stay labelled as simulations, and they are the FAR shard, Dark Vault pods, the compute syndicate and the agent swarm demos.

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
