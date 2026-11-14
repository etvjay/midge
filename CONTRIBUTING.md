# Contributing

Start with [`docs/START_HERE.md`](docs/START_HERE.md). It needs no keys and spends nothing:

```bash
npm ci
./scripts/verify        # everything, about 100 s warm and 6 minutes on a fresh clone
npm run verify:fast     # the JavaScript tests and the Foundry ledgers, about 30 s
```

## Commands for each part

| Part | Where | Build and check |
|---|---|---|
| Root (the SDK, the services, the tests) | `/` | `npm ci`, `npm run verify:fast`, `make test` |
| The room (Roost) | `src/roost-service`, `deploy/roost` | `npm run verify:roost-hosted`; its image is built by CI from `deploy/roost/build.sh` |
| The playground service | `src/playground` | `npm run smoke:playground`, `npm run build:playground` |
| The site | `site/` | `npm run build:site`, `npm run build:replay`; published by hand with `cd site && vercel deploy --prod` |
| The coordinator contract | `contracts/fly-coordinator` | `make rust` (cargo test), `npm run build:wasm` |
| The OutLayer caller | `outlayer/caller` | `cargo test`, then `RUSTFLAGS="-C link-arg=-s" cargo build --target wasm32-unknown-unknown --release` |
| The room signer | `outlayer/room-signer` | `cargo test`, `./build.sh` |

## Change classes

Every pull request says which class it is. The class decides what has to be shown before it merges.

- **A: no effect on any image or WASM.** Docs, tests, CI, config, scripts that are not staged into an image, and the site.
- **B: changes staged JavaScript, or the root `package.json` or `package-lock.json`.** Merging publishes a new image to `ghcr.io`. A running machine does not change until it is redeployed with the new digest, and a changed room image is a new identity that needs a new recorded hardware run and a new pin.
- **C: changes Rust source, `Cargo.toml` or `Cargo.lock` of a contract or program.** The release WASM hash can change. Compare it with the hash before the change, and with `docs/canonical/deployments.json` for a deployed contract.

Do not edit a compose file, an image digest, `roost.expected.json` or `docs/canonical/deployments.json` without a redeploy plan. Those files are measured or pinned.

## Rules for changes

- Test first: a failing test, watched to fail for the right reason, then the fix. Bugs get a red loop before a hypothesis.
- A claim is "verified" only with a command someone can re-run. Record claims in `foundry/claims.jsonl`, gaps in `foundry/gaps.jsonl`, decisions in `docs/canonical/DECISIONS.md`.
- Anything called "live" needs a promoted lab run (`node lab/verify-run.js <dir>`), not a one-off script.
- The hardware and testnet tiers (`node lab/run.js --tier hardware`, `--tier testnet`) rent machines or spend testnet funds. Run them only when you mean to.
- Keep keys and tokens out of git. They belong in `.env` (see `.env.example`).
- New JavaScript files are kebab-case. A test is `tests/<area>.test.js`. Staged files are not renamed, because the image build lists name them.

## Before you open a pull request

- [ ] `npm run verify:fast` passes, and `./scripts/verify` passes for anything that touches a contract, the room or the evidence
- [ ] The change class is stated
- [ ] No compose, digest, expected-pin or `deployments.json` edit without a redeploy plan
- [ ] No key, token or private address in the diff
