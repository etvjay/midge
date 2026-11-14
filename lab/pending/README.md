# Experiments that are written but have not had a passing run

An experiment in `lab/experiments/` must have a passing promoted run, or `./scripts/verify` fails. An experiment that can only run after a human gate (a deployed
machine, spend) waits here, so the repository never claims a run that has not happened. Nothing is waiting here now: E-PLAYGROUND-LIVE-01, the last one, passed on
2026-11-14 and moved to `lab/experiments/`.
