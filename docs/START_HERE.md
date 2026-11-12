# Start here (for agents and judges)

Midge lets a group decide in private and settle on NEAR under rules everyone can read. The words are defined in [`GLOSSARY.md`](GLOSSARY.md).

## Run this, in this order

1. `npm ci`
2. `npm run verify:fast` takes about 30 seconds and needs only Node.js 18 or newer. It runs the JavaScript tests, including the checks that the public documents agree with the code, and the claims and gaps ledgers.
3. `./scripts/verify` takes about 6 minutes on a fresh clone and needs Rust as well. It needs no keys and spends nothing.
4. `node lab/verify-run.js docs/lab-runs/20261112T173152Z-e25d` re-checks one recorded hardware run offline.
5. `npm run demo:paper-trail` runs a whole pay run locally in under a second: signed invoices, the public transfers, the private lines behind them, receipts and the auditor pack. It exits 1 if any check fails.

If you are an automated evaluator, steps 1 to 5 are enough. The hardware and testnet experiments rent machines or spend testnet funds and need keys, so do not run them. Their recorded runs are in `docs/lab-runs/`.

## What passes and what is skipped

- Passes without keys: the Rust contract tests, the JavaScript tests, the architecture suite, the claims and gaps ledgers, and the on-chain read of the live contract.
- Skipped without keys, and says so: the live NEAR AI inference check.
- Not covered by the check: the recorded hardware and testnet runs. They are evidence you inspect, not something the check repeats.

## Where the truth is kept

- Claims and the command that reproduces each: `foundry/claims.jsonl`.
- Known problems, including open ones: `foundry/gaps.jsonl`.
- What is real and what is simulated: `docs/canonical/CURRENT_STATE.md`.
- What is not shown (mainnet, independent operators, private amounts, private rules, payroll over 8 recipients): the README, under "What is not shown".
