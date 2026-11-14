# Experiments that are written and rehearsed but have not had a passing run

An experiment in `lab/experiments/` must have a passing promoted run, or `./scripts/verify` fails. An experiment that can only run after a human gate (a deployed
machine, spend) waits here, so the repository never claims a run that has not happened.

- `139-playground-live.js` (E-PLAYGROUND-LIVE-01) needs the deployed playground service and the real attested room. Its steps after the wake and the attestation
  were rehearsed against a local service on real testnet. At the deploy gate: `git mv lab/pending/139-playground-live.js lab/experiments/`, run it
  (`PLAYGROUND_URL=... node lab/run.js --only E-PLAYGROUND-LIVE-01`), promote it with `node lab/promote.js`, and add its claim. Its predictions were committed
  first, in docs/lab/PROGRAMME_PLAN.md.
