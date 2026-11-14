# Running each app by hand

These are the commands that exercise each part for real, with what they need and how long they take. None needs a key or spends anything.

| App | Command | Needs | Takes |
|---|---|---|---|
| The room (Roost) | `npm run qa:roost` | Node 24. Starts the real room server on a free port with a fake attestation provider and checks 64 things, including that debug routes do not exist | under 1 s |
| The playground service | `npm run smoke:playground` | Node 24 and a Chromium (`CHROMIUM=/snap/bin/chromium`). Drives the real page in a headless browser against the real service, with stand-ins for the chain and the model | about 10 seconds |
| The site | `CHROMIUM=/snap/bin/chromium npm run qa:site` | Node 24 and a Chromium. Loads the home page at several widths and motion settings and checks text size, tap targets, first paint and that nothing is hidden when a script fails | about 5 minutes |
| The room signer | `npm run qa:room-signer` | Rust (`cargo`). Runs the program with a fixed test seed: a public key, a signature and a refusal over the bound | under 1 minute after the first build |

`CHROMIUM` is the path to a Chromium or Chrome binary. On Ubuntu with snap it is `/snap/bin/chromium`.

## Apps with nothing to run by hand

The coordinator contract (`contracts/fly-coordinator`) and the OutLayer caller (`outlayer/caller`) have no interactive surface: a contract runs only on a chain and a caller only inside OutLayer. They are checked by their test suites (`npm run test:fly-coordinator`, `npm run test:caller`) and, for what can only be shown live, by the recorded runs in `docs/lab-runs/`.

## Unit tests per app

`npm run test:roost`, `test:playground`, `test:site`, `test:caller`, `test:room-signer` and `test:fly-coordinator` each run offline and exit 0. `npm run verify:fast` runs everything in JavaScript, and `./scripts/verify` runs everything.
