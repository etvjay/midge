# Lab run 20261107T093948Z-2795

- **Code:** `65c3229d2af7743841ae8a43c7b6fbc176959d51` on `master` (**5 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `8a0180ff698c44b5…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 11 events, hash-chained; root `4f60d17e454675717e8f07c1c2c4aeb92d82cf6a37c98ab34f15fa0047778da6`. Verify with `node lab/verify-run.js lab/runs/20261107T093948Z-2795`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-SIGNED-INPUT-CHAIN-01 Signed inputs against the real chain: an impersonator is refused, the account's own key is accepted (closes GAP-023) | testnet | **PASS** | 1 | 5 |  |

## E-SIGNED-INPUT-CHAIN-01: Signed inputs against the real chain: an impersonator is refused, the account's own key is accepted (closes GAP-023)

**Hypothesis.** With the account-key check asking the real NEAR testnet, a sealed input signed by the account's own access key is accepted; the same input signed by a random key that names that account is refused; a real key of another account naming the first is refused; and an input naming an account that does not exist is refused. No funds are used. Fails if any impersonation is accepted or the account's own key is refused.

**What this does not prove**
- Uses two real testnet accounts we control (the coordinator and the root account). It shows the check against the chain, not a round with deposits; the live two-room run (E-TWO-ROOM-LIVE-01) used signed inputs in four real rounds.

| Step | Result | Assertions | Time |
|---|---|---|---|
| the real chain decides who may bid in whose name | ✓ pass | 5/5 | 866 ms |

### the real chain decides who may bid in whose name

- ✓ the account's own key is accepted
- ✓ a random key naming that account is refused
- ✓ a real key of one account naming another account is refused
- ✓ an input naming an account that does not exist is refused
- ✓ with the chain unreachable even the account's own key is refused (fail closed)

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
