# Fly: Handoff 3, close the integrity and portability gaps, add real inference and a network demo

Written 2026-11-02 after re-review of commits 696a138 and 91d2852. **Deadline: 2026-11-14 23:59 UTC.** Judges include Claude Code and Codex: they will run `./scripts/verify`, read the README, and read the submission text. Re-read https://nearhackathon.com/HACKATHON.md before submitting.

## What the re-review verified (do not redo)
- Testnet deployment is real: `c.fly-1793636729.testnet`. All 8 transactions in `docs/canonical/testnet-evidence.json` succeeded on the RPC, signed by four distinct accounts. Flash syndicate is `Settled` (0.06 NEAR paid to recipient), escape syndicate is `AbortedRefunded`.
- `docs/canonical/mpc-evidence.json`: the secp256k1 (r, s) verifies against the derived uncompressed key (checked independently).
- 33 Rust tests, clippy/fmt clean, DCAP verification of the live quote passes, no secrets in git history.

## What is wrong (this handoff fixes it)
1. `docs/canonical/SUBMISSION_ASSETS.md` overclaims relative to the README (Roost "running on NEAR AI Cloud", "zero on-chain alpha leakage", fuzzing "proves", simulated facilities presented as working).
2. `docs/architecture.md`, `docs/use-cases.md`, `docs/hackathon-submission.md` are stale (nonexistent Next.js "War Room" UI, `fly-coordinator.testnet`, "production", "238 KB", "zero MEV", `createdAtBlock` timelock).
3. `./scripts/verify` is not portable: hardcoded `/home/ubuntu/.cargo/bin/dcap-qvl`, no `dcap-qvl` install in CI (CI likely red), verification 03 depends on a live testnet RPC.
4. No real NEAR AI Cloud inference call anywhere in the pipeline. The Roost is a local Node process (GAP-004).
5. "Network" is the headline but there is no registry or multi-syndicate demo.

## Ground rules
- `AGENTS.md` applies. No frontend. Testnet only.
- `./scripts/verify` stays green after every task. Commit in small steps.
- Say only what the code does. Anything simulated says "simulated". Each claim points to a command or transaction hash.
- Human-gated, never without an explicit yes: push, make repo public, post on X, submit, mainnet anything, spending beyond testnet faucet funds.
- Secrets only in `.env` (gitignored). Never print keys. Do not paste keys into docs or chat.
- Deposits and depositor accounts are public on-chain. Confidentiality covers deliberation inputs inside the aggregator, not deposits.

## Needs from the human (ask once, up front)
1. A NEAR AI Cloud API key (cloud.near.ai), placed in `.env` as `NEARAI_API_KEY`. Needed for X1 only. Attestation endpoints need no key; completions do.
2. Approval to push a branch to GitHub so CI can run (X3).
3. Mainnet payout account, name, email, team size, who records the demo and posts on X (for the final submission only).

## Tasks

### X1. Real inference call with verified response signature  [Implementation, Integrity]
Goal: the Roost's deliberation step makes one real NEAR AI Cloud completion and verifies it end to end. If this cannot be finished, remove every "runs on NEAR AI Cloud" claim (see X2) and say the aggregator is local.

Official docs (read before coding, endpoints and field names change):
- https://docs.near.ai/cloud/verification/cloud-api/response-signatures
- https://docs.near.ai/cloud/verification/reference/response-signature-verification
- https://docs.near.ai/cloud/verification/chat
- https://docs.near.ai/cloud/verification/cloud-api/gateway-attestation and `.../model-attestations`
- Inference SDK: https://docs.near.ai/cloud/inference-sdk (prefer the official client if it does the verification for you; otherwise implement below)

Steps:
1. Preflight: fetch gateway attestation (and model attestation with `provider=near` for the chosen model) with a fresh 32-byte hex nonce and an explicit `signing_algo`. Reuse the existing DCAP checks. Keep the verified signer (`signing_algo`, `signing_address`).
2. Send `POST https://cloud-api.near.ai/v1/chat/completions` with `Authorization: Bearer $NEARAI_API_KEY` and `Accept-Encoding: identity`. Build the request body as one exact string and retain the exact bytes sent and the exact response bytes received. Do not re-serialize JSON, trim whitespace, or reconstruct streams. Prefer non-streaming.
3. Take `id` from the response. `GET https://cloud-api.near.ai/v1/signature/{id}?model={model}&signing_algo={same algo}`. A 2xx body containing `error_code` and `message` means "unavailable", not a signature; fail closed.
4. Compute `request_hash = sha256(exact request bytes)` and `response_hash = sha256(exact response bytes)`. Require `signature.text` to equal exactly `<MODEL_ID>:<request_hash>:<response_hash>` for `signature_kind: provider_tee` (check the doc for gateway kind).
5. Verify the signature: for `ecdsa`, recover the EIP-191 signer from `text` and `signature` and require it equals the verified preflight `signing_address`; for `ed25519`, verify the UTF-8 bytes of `text` against the public key. Reject other algorithms. Use the same `signing_algo` for the attestation and the signature calls (defaults differ).
6. Wire it into the Roost: the deliberation prompt carries only the aggregate (no per-flyer amounts), and the verified result hash goes into the `aggregate_order_hash` that the Roost signs and `settle_batch` verifies. Document exactly what is inside the enclave: NEAR AI Cloud runs the model in a TEE; the Roost aggregator process itself is still local unless you deploy it (GAP-004 stays open and says so).
7. Add `npm run verify:inference` and include it in `./scripts/verify` only if it can run offline via a recorded fixture, labelled "recorded fixture" in the output. Live mode runs when `NEARAI_API_KEY` is present.
8. Save one live run as `docs/canonical/inference-evidence.json` (model, completion id, request_hash, response_hash, signing_address, signature, verified: true). No key in the file.
Acceptance: live run verifies; a response with one flipped byte fails; a missing signature fails closed; evidence file committed; README row updated from "simulated" to "live external" only for what is actually live.

### X2. Make the submission text and stale docs true  [Integrity]
1. Rewrite `docs/canonical/SUBMISSION_ASSETS.md` (X post, `idea` text, track table) to match the README. Required corrections: the Roost aggregator is a local process (unless X1 deploys it); DCAP verification covers NEAR AI Cloud's gateway quote; RFQ, OTC, FAR shard and pods are simulated and labelled so; deposits are public; fuzzing "supports" not "proves"; the e2e demo is one operator controlling all test accounts and the signing key. Keep within 20-2000 characters for the `idea` text and recount.
2. Reconcile `docs/architecture.md`, `docs/use-cases.md`, `docs/hackathon-submission.md` with the code, or delete what you cannot keep true:
   - remove the "Fly War Room" UI container and any frontend claim,
   - replace `fly-coordinator.testnet` with `c.fly-1793636729.testnet`,
   - timelock is measured from `epoch_start_block`, hatch_out is per user and blocked after settlement, settlement signature binds the 6-tuple, payouts go to the immutable `payout_recipient`,
   - remove "production", "238 KB" (use the real size from the build), "zero MEV", "without third-party bridges" unless demonstrated,
   - remove the old command list ("7 layers"); point to `./scripts/verify`.
3. Keep one source of truth for counts (tests, gaps, wasm size). Generate them from the build or drop the numbers from prose.
4. Add a "Network" section to the README that states exactly what exists today (one deployed coordinator, many syndicates by id, services around it) and what X5 adds.
Acceptance: `grep -rniE "War Room|Next\.js|238 ?KB|zero MEV|production NEAR|fly-coordinator\.testnet|createdAtBlock" README.md docs` returns nothing, and every number in the text matches the repo.

### X3. Portable verification and green CI  [QA, Code quality]
1. Remove the hardcoded `/home/ubuntu/.cargo/bin/dcap-qvl`. Use `DCAP_QVL_BIN` or `PATH`. Print a clear install hint if missing.
2. In `.github/workflows/ci.yml` add a step to install the pinned `dcap-qvl-cli` version that the repo uses (`cargo install dcap-qvl-cli --version <pinned>`), with cargo caching.
3. Make network-dependent checks configurable and degradable: `NEAR_RPC_URL` (default a working public testnet RPC; verify it responds), `FLY_OFFLINE=1` to use recorded fixtures for 1Click, NEAR AI attestation, testnet RPC. In offline mode the verdict banner must say "OFFLINE FIXTURES" and which checks were not live. Never print PASS for a check that used a fixture without saying so.
4. Record fixtures once from live runs under `verifications/fixtures/` (no keys).
5. Update README prerequisites: Node 18+, Rust toolchain, wasm32 target, `dcap-qvl`; network optional with `FLY_OFFLINE=1`.
6. With the human's approval, push a branch and confirm CI is green; fix until it is. Add the badge only after it is green.
Acceptance: fresh clone on a clean machine runs `FLY_OFFLINE=1 make verify` green; online `make verify` green; CI green.

### X4. Real vs simulated table, final pass  [Integrity]
After X1-X3, update the README matrix and `foundry/claims.jsonl`, `foundry/gaps.jsonl`, `docs/canonical/CURRENT_STATE.md`: statuses must match reality (live external, deployed on testnet, local process, simulated). Sync `state.json` heads and keep `check-foundry` green. Run a secrets scan over history before anything is made public.

### X5. Network demo  [Originality, Fit; do last, cut first if time is short]
Goal: show "network of syndicates", not a single room.
1. Contract: add read methods `list_syndicates(from_index, limit)` and `get_syndicates_by_member(account_id, from_index, limit)` (bounded page size), and emit NEP-297-style events on hatch, deposit, settle, hatch_out. Add tests, including pagination bounds and gas. Keep it additive; do not change settlement semantics. Redeploy to a new testnet account/contract and record hashes.
2. Demo script `scripts/network-demo.js`: 3 syndicates in one contract (for example a research syndicate, a trading syndicate, a compute syndicate). One agent is a member of two. Agents discover syndicates through `list_syndicates`. One syndicate buys a signal from another through the x402 layer (label the payment as simulated unless it moves testnet value). One syndicate times out and members exit with `hatch_out`.
3. SDK/MCP: add `fly_list_syndicates` and `fly_get_my_syndicates` tools and tests.
4. README and demo script describe only what this demo shows. Do not claim cross-syndicate privacy or reputation that does not exist.
Acceptance: one command reproduces the demo against testnet; explorer links for the new hashes are in the README.

## Order and schedule
X1 and X2 first, in parallel (X1 needs the API key). Then X3, then X4. X5 after that if at least 4 days remain before the freeze. Freeze code on Nov 12. Nov 13-14 for the demo video, X post and submission.

## Final submission checklist (human-gated)
- Repo public, README opens with the one-paragraph thesis ("the TEE is an arbiter, never a custodian") and "do X, see Y" steps.
- Demo post live on X, says it was built at NEAR HACKATHON, video or screenshots attached.
- Re-read the live `HACKATHON.md`. Print the full JSON payload, wait for an explicit yes, generate `requestId` once, then POST to https://nearhackathon.com/api/applications. One attempt, not editable. Do not commit the payload.
- Tracks: `privacy` (primary), `swarms`, `agents`, `security`, `defi`, each with a line that matches what is actually built.
