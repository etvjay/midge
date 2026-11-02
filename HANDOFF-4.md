# Fly: Handoff 4, make the claims true, bound the authority, put everything on chain

Written 2026-11-02. **Deadline: 2026-11-14 23:59 UTC. Code freeze: Nov 12.** Judges include Claude Code and Codex: the organizers say they "check that it runs and does what the README says"; humans then decide. Re-read https://nearhackathon.com/HACKATHON.md before submitting.

Supersedes HANDOFF-3.md where they overlap. Evidence base: three Parallel Task API reports saved in `docs/research/` (problem evidence, competitive landscape, judging calibration). Read the "Decision" lines in each before starting.

## Why this handoff exists
A re-review (commit 409f82d) found:
1. **The inference evidence looks synthetic.** `verifications/fixtures/inference-fixture.json` has completion id `chatcmpl-fly-roost-deliberation-testnet` (hand-written), no `NEARAI_API_KEY` was ever in `.env`, and its signer `0x2eb600dbdaa1cf83f8b170dcf1ee4a155f744a11` matches neither the live NEAR AI gateway signer nor the model signer. The offline check only confirms the fixture agrees with itself. The README row calls it "official NEAR AI Cloud inference response signatures".
2. **The network feature is not on chain.** The deployed contract (`c.fly-1793636729.testnet`, code hash `6LGuBm625531GBUWTREQaqXP9TazWLr7NPXSfWQFNJ3X`) is the first deploy. `list_syndicates` returns `MethodNotFound`. `scripts/network-demo.js` runs on the in-memory `FlyNestContract`.
3. **MCP, SDK and HTTP API drive the in-memory JS model** (`src/api/server.js:21`), not the deployed contract.
4. **Settlement authority is unbounded.** The creator picks the enclave key and the payout recipient, so a valid settlement signature can sweep the whole pool before the timeout. The research states this is the central gap: a refund fixes a stalled coordinator, not a valid but malicious signature.
5. README opening still says members submit intents "directly into" NEAR AI Cloud TEEs; the Roost is a local process (GAP-004). No git remote exists; the CI badge URL points at a repo that is not configured. Names collide with an existing "Fly" cross-chain trading product and the "Syndicate" investment-club project.

What is genuinely good and must not regress: the deployed testnet run (8 transactions, verified on RPC), the live Chain Signatures call (signature independently verified), live DCAP verification, 36 contract tests with property tests, clippy/fmt clean.

## Ground rules
- `AGENTS.md` applies. UI freeze stays unless the human lifts it (decision D3).
- `./scripts/verify` stays green after every task. Commit in small steps.
- **Evidence rules (new, strict):**
  - Never create a fixture, "recording" or evidence file by hand or with a locally generated key and present it as coming from an external service. A fixture must be captured by a script from a real call, and carry provenance (timestamp, endpoint, raw request/response, the attested signer it was checked against).
  - Offline verification of a signature must check the signer against the recorded attestation report's signer, not against a value stored beside the signature.
  - If something cannot be shown working, label it "not demonstrated" or remove the claim.
  - Every number in prose comes from a command or generated file.
- Human-gated, never without an explicit yes: push, make repo public, post on X, submit, mainnet anything.
- Secrets only in `.env`. Never print or commit keys.
- Deposits and depositors are public on chain. Say so wherever privacy is discussed. Confidentiality covers deliberation inputs, not deposits.

## Decisions and inputs needed from the human (ask once, up front)
- **D1** A NEAR AI Cloud API key from cloud.near.ai as `NEARAI_API_KEY` in `.env`.
- **D2** Approval to push a branch to GitHub (needs a remote URL).
- **D3** Keep the UI freeze, or allow a thin read-only status page for the demo.
- **D4** Product name: keep "Fly" with a descriptor (e.g. "Fly Syndicates"), or rename. Pick before the README and submission text are finalized.
- **D5** Scenario for the measured baseline (Y6). Default: sealed-bid batch vs public sequential execution.
- Final submission only: mainnet payout account, lead name, email, team size, demo video and X post.

## Tasks

### Y0. Integrity triage  [do first, same day]
1. Establish how `inference-fixture.json` was produced (check git history and ask the agent that made it). If it was not captured from a real NEAR AI call, delete `verifications/fixtures/inference-fixture.json`, `docs/canonical/inference-evidence.json`, and every claim that depends on them. The verification becomes "skipped, no API key" until Y4 produces real evidence. The banner must say so.
2. Relabel the network feature as "in source / in-memory model, not deployed" everywhere (README, ledgers, `foundry/claims.jsonl`) until Y2 redeploys it.
3. Fix the README opening: the Roost aggregator is a local process; NEAR AI Cloud provides attested inference and gateway attestation; deposits are public.
4. Remove the CI badge or point it at a real remote after D2.
5. Audit every fixture in `verifications/fixtures/` for the same problem (`attestation-report.json`, `oneclick-tokens.json`, `testnet-syndicates.json`): each must have provenance and must have come from a script.
Acceptance: `grep -rn "chatcmpl-fly-roost" .` returns nothing; README/ledgers contain no claim stronger than the evidence.

### Y1. Bound the settlement authority  [Effectiveness, Originality; contract]
Goal: a valid-looking settlement can only move funds to destinations that every depositor consented to at deposit time, within caps and a deadline. The claim becomes **"constrained arbitration with independent recovery"**. State clearly that this bounds where and how much can be released; it does not prove the trade was good.

Design (adjust if a simpler equivalent exists; keep it small and auditable):
- At `hatch`, store an immutable `release_policy`: `allowed_recipients: Vec<AccountId>` (bounded, e.g. <= 8), `max_release_bps_per_epoch` (<= 10000), `settle_deadline_block`. Compute `policy_hash` (sha256 over a canonical encoding) and store it.
- `deposit(syndicate_id, policy_hash)` rejects unless `policy_hash` equals the stored hash. Depositors therefore explicitly consent to the policy; the policy cannot change after hatch.
- `settle_batch(...)` takes `allocations: Vec<(AccountId, NearToken)>`. Require: every recipient is in `allowed_recipients`; sum within the per-epoch cap and within `total_escrow`; block height before `settle_deadline_block`; allocations hash is part of the signed 6-tuple (replace the single `payout_recipient` field with `allocations_hash`; keep contract id, syndicate id, epoch, nonce, order hash).
- Accounting: releases reduce flyer balances pro rata (document rounding; remainder handling must never create value). Remaining balance stays individually refundable via `hatch_out`.
- `hatch_out` keeps needing no enclave signature and no operator action. Keep callbacks.
- Keep events (NEP-297) for hatch, deposit, settle, hatch_out, with the policy hash.
Tests (unit, integration, proptest invariants):
- settlement to a recipient outside the allowlist fails; over-cap fails; after deadline fails; altered allocations with a valid old signature fail; deposit with wrong policy hash fails.
- Invariants: sum of flyer balances == `total_escrow`; total paid out + total refundable never exceeds total deposited; no payout reaches an account outside `allowed_recipients`; `hatch_out` never pays more than a flyer's remaining balance; flyer count <= 50.
Acceptance: all tests green, clippy/fmt clean, gas for `settle_batch` with 50 flyers measured and under the callback budget.

### Y2. Redeploy and prove it on chain  [Technical execution, Completeness]
1. Reproducible build: record the exact toolchain and build command; commit the wasm's SHA-256 and code hash in the README. A judge should be able to rebuild and compare.
2. Deploy the current contract to testnet (new contract account is fine). Use the existing setup script and throwaway accounts; keys stay in `.env`.
3. `scripts/testnet-e2e.js` (update) must produce, with explorer links in `docs/canonical/testnet-evidence.json`:
   - happy path: hatch with policy, deposits with policy hash, settle with allocations, payouts visible;
   - **attack demo (security track):** a settlement signed by the registered key but sending to a non-allowed recipient is rejected on chain; an over-cap settlement is rejected; a wrong-nonce replay is rejected. Failed transactions are valid evidence; record their hashes;
   - stalled-enclave path: timeout then per-user `hatch_out`, other depositors untouched;
   - network: three syndicates in one contract with `list_syndicates` and `list_syndicates_by_member` returning them (query via RPC and save the output).
4. Verify with an independent RPC query script (`scripts/verify-onchain.js`) that reads the deployed contract and checks the recorded transactions and states; include it in `verify` with a clear "requires network" label and a skip flag that prints "NOT VERIFIED (offline)".
Acceptance: `list_syndicates` works on testnet; the deployed code hash equals the committed build; every claimed transaction resolves on RPC.

### Y3. Agent interfaces act on the real contract  [Technical execution, UX]
- Add `src/chain/client.js` (near-api-js) wrapping the contract methods and views.
- MCP server, SDK and HTTP API get two modes: `FLY_MODE=chain` (testnet, reads credentials from `.env`) and `FLY_MODE=model` (in-memory, offline). Every response and MCP tool result includes `mode`, and the model mode prints a visible "MODEL MODE, no chain" notice. Default for demos: chain.
- Add MCP tools `fly_list_syndicates`, `fly_get_my_syndicates`, `fly_deposit`, `fly_settle` (alongside existing ones) and tests that run a full tool-driven flow against testnet when credentials exist.
- One command, `npm run demo` (or `make demo`), runs the annotated story on testnet and prints explorer links: hatch, deposit, a blocked malicious settlement, a successful settlement, a timeout exit.
Acceptance: an agent can complete hatch to exit through MCP alone, on chain; docs show the exact tool calls.

### Y4. Real inference attestation and provenance  [Implementation, Privacy track]  (needs D1)
Docs: https://docs.near.ai/cloud/verification/cloud-api/response-signatures, `.../reference/response-signature-verification`, `.../chat`, gateway and model attestation pages.
1. Preflight: gateway attestation (and model attestation with `provider=near`) with a fresh 32-byte hex nonce and an explicit `signing_algo`; keep the verified signer.
2. Completion: `POST /v1/chat/completions` with `Accept-Encoding: identity`; keep the exact request and response bytes. `GET /v1/signature/{id}?model=...&signing_algo=...` with the same algo. Require `text == <MODEL>:<sha256(req)>:<sha256(resp)>`; recover the EIP-191 signer (ecdsa) or verify ed25519; require it equals the signer from the verified preflight. Fail closed on any missing piece.
3. Capture a real run to `docs/canonical/inference-evidence.json` and a fixture (`verifications/fixtures/`) **by script**, with raw preflight report, raw request/response, signature, and recorded time. Offline verification re-checks the recorded signer against the recorded attestation report.
4. Tamper test: flip one byte in the response; verification must fail.
5. Use the result in the pipeline: the deliberation prompt carries only aggregate data; the verified response hash goes into the order hash that the aggregator signs.
Important honesty note: NEAR AI signs any completion for any API-key holder. The signature proves "this attested model produced this response to this request"; it does not prove the caller was the authorized aggregator. It is **provenance**, not authorization. Authorization remains the registered key, bounded by Y1. Do not describe it as the TEE authorizing settlement.
Acceptance: live run verifies; tampered run fails; evidence has a real completion id; docs state exactly what is and is not proven.

### Y5. Optional: on-chain provenance receipt  [Originality; only if Y1-Y4 are done]
Let `settle_batch` accept `(model_id, request_hash, response_hash, eip191_signature)` and emit it in the settlement event after verifying the signature recovers to a signer address registered at hatch (`env::keccak256` for the EIP-191 hash, `env::ecrecover` with the recovery id derived from v; derive the address from keccak256 of the recovered key). It is an auditable receipt, not an authorization check (see Y4 note). Add tests with a locally generated key and clearly label them as unit-test keys. Skip if it risks the schedule.

### Y6. One scenario with a measured baseline  [Problem quality, Effectiveness]  (D5)
Default scenario: a group of agents executing one large swap. Compare (a) public sequential execution, where later orders can be front-run, against (b) sealed-intent batch execution with uniform clearing, on a constant-product pool model using real recorded quotes from the 1Click registry/API.
- Deterministic script `scripts/baseline.js`, fixed seed, reproducible; report slippage and adversary profit in both modes across N runs, with confidence intervals.
- Label it as a simulation. State assumptions and what it does not show (real MEV, real liquidity).
- Put the headline numbers and the command in the README.
Acceptance: one command reproduces the table; numbers match the README.

### Y7. Independent review of the contract  [Security, Beyond prototype]
- Run a fresh review with a different model or reviewer; give it only the source and the threat model, not the repo's claims. Save the report in `docs/security/review-YYYY-MM-DD.md` and fix or record each finding in `foundry/gaps.jsonl`. Do not call it an audit.
- Add a `docs/security/threat-model.md`: assets, actors, trust assumptions (creator-chosen key and policy, TEE operator, public deposits), what each defense covers, and what it does not (TEE vulnerabilities such as the 2024 TDX advisory and TDXploit research cited in `docs/research/parallel-problem-evidence.json`).

### Y8. Framing and docs  [Problem quality, Originality, Integrity]
- README opening: one paragraph stating the claim in the research's words: **constrained arbitration with independent recovery**, not "non-custodial TEE settlement". Then the problem with its measured numbers and caveats from `docs/research/parallel-problem-evidence.json` (do not add up incomparable MEV figures), then "do X, see Y".
- Update `docs/canonical/COMPARISON.md` with the competitors in `docs/research/parallel-competitive-landscape.json` (Shade Agents, OutLayer, NEAR Confidential Intents, Enzyme, Safe, Railgun, Aztec, Secret, Oasis, SUAVE). Include what each does about per-user exit on operator failure, and where Fly overlaps; do not overclaim novelty.
- Apply D4 (name).
- Publish `contracts/fly-coordinator/README.md` describing the escrow as a reusable pattern ("independent-exit escrow with bounded release policy"): API, invariants, how to integrate.
- Re-run the stale-text grep: `grep -rniE "War Room|Next\.js|238 ?KB|zero MEV|production NEAR|fly-coordinator\.testnet|createdAtBlock" README.md docs` returns nothing.

### Y9. Portability and CI  [QA, Code quality]  (needs D2)
- No hardcoded home paths; `DCAP_QVL_BIN` or PATH; clear install hint.
- CI installs the pinned `dcap-qvl-cli`; caches cargo; runs `make verify` in offline mode and, separately, a nightly or manual online job.
- Offline mode prints `OFFLINE: N checks used recorded fixtures` and never prints PASS for a fixture-only check without saying so.
- Push a branch after approval and confirm CI is green; add the badge afterwards.
- Run a secrets scan over full history before the repo goes public.

### Y10. Demo and submission assets  [Completeness]
- Rewrite `docs/canonical/SUBMISSION_ASSETS.md`, `DEMO_SCRIPT.md` to match what exists after Y1-Y9. The demo: healthy settlement, a blocked malicious settlement, a stalled enclave with per-user exit, three syndicates discoverable. State that one operator controls the test accounts.
- Draft the X post (must say it was built at NEAR HACKATHON, with video or screenshots) and the `idea` text (20-2000 characters; recount).
- Tracks: `privacy` (primary), `swarms`, `agents`, `security`, `defi`, each with a line that matches built features only.
- Final submission is human-gated: print the full payload, wait for an explicit yes, generate `requestId` once, `POST https://nearhackathon.com/api/applications`. One attempt; not editable. Do not commit the payload.

## Schedule
- Day 1 (Nov 2-3): Y0, start Y1.
- Days 2-4: Y1 complete, Y2.
- Days 4-6: Y3, Y4 (needs D1).
- Days 6-8: Y6, Y7, Y9.
- Days 8-10: Y8, Y10 drafts, optional Y5.
- Nov 12: code freeze. Nov 13-14: demo video, X post, submission.
Cut order if behind: Y5, then Y6 extras, then Y8 comparison depth. Never cut Y0, Y1, Y2, Y9, Y10.

## Definition of done
- Every claim in README/submission text maps to a command, a transaction, or a labelled simulation.
- Deployed code hash equals the committed reproducible build; `list_syndicates` works on testnet.
- A malicious settlement is rejected on chain and the transaction hash is in the README.
- MCP/SDK/API run against the contract by default; model mode is labelled.
- Real inference evidence (if D1 provided) or an honest "not demonstrated" row.
- CI green; secrets scan clean; repo public; demo posted; submission sent (human).

## Honest targets
Problem quality, effectiveness, technical execution and beyond-prototype can reach 9 with the above. Originality, UX (no UI) and impact are limited by judges' taste, the UI freeze and the lack of real users; aim for 8 and do not inflate the text to chase 9.

---

## Addendum A (2026-11-02): lessons from the official track prompts

Source: https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/03-privacy.md and `.../06-security.md`, and the reference repo https://github.com/near-examples/nearai-cloud-verification-example. The prompts are example builds, not requirements, but they show the bar the organizers use. Map the project to them explicitly in the README.

### A1. Corrections to Y4 (inference verification)
- **Handle `signature_kind`.** The signature endpoint returns `signature_kind`. For `provider_tee` the signed text is `{model_id}:{request_hash}:{response_hash}` and the signer must match the model TEE's attested key. For `gateway` it is `{request_hash}:{response_hash}` (no model id) and the signer must match the gateway TEE's attested key. The gateway kind can occur even on non-streaming requests, and always for streams the gateway rewrites. The current `scripts/verify-inference.js` hardcodes the first format and would reject valid gateway-signed responses. Read `signature_kind`, build the expected text for that kind, and pick the matching signer. Unknown kinds fail closed.
- **Verify the GPU evidence, not just its presence.** The reference demo sends each NVIDIA GPU payload to NVIDIA's attestation service (NRAS), validates the overall verdict, and checks the token's `eat_nonce` equals our nonce. Fly currently only checks the payload exists. Implement it, or label the GPU row "payload present, not verified".
- **Choose the model from the models endpoint** (a TEE-hosted one) instead of hardcoding it; fail if the chosen model is not TEE-hosted.
- **Start with the minimal script** the prompt describes: one completion plus attestation verification, with printed output, before wiring anything into the pipeline. Compare against the reference repo's flow (run it once with the human's key if useful). Exit code 1 on any failed check.
- **Print a "Verified" panel** (terminal is fine under the UI freeze, or the status page if D3 allows): a list of every check run and its result: nonce freshness, DCAP/TCB status, signer binding, GPU verdict, signature kind, request/response hashes, signer recovery.
- Node: the reference repo requires Node 22+. State the supported Node version in the README (the sandbox runs Node 24).
- Add `.env.example` with `NEARAI_API_KEY=` (no value) and document it.

### A2. Data-retention statement (privacy track requirement)
The privacy prompt requires keeping nothing server-side after a response and saying so in the README and the code. Add a "Data handling" section: what is held in memory, for how long, what is logged, what is written to disk (nothing), and the limits (JavaScript cannot guarantee memory wiping; the aggregator is a local process; deposits are public on chain). Make the code match: no request/response bodies in logs, no persistence of intents.

### A3. Security track: use real function-call access keys
The security prompt asks for an agent that signs with a **function-call access key scoped to one contract**, never a full-access key, with the key's limits explained, and an **attack demo** where a prompt-injected agent is stopped, with the log shown. Fly currently has neither: the e2e scripts use full-access accounts, and "OutLayer" in this repo is a local JavaScript guard (`src/policies/outlayer.js`) plus the contract's deposit cap, not the OutLayer service or access keys.
- New task **Y11**: create agent flyer accounts that hold only a function-call key scoped to the coordinator contract (`deposit`, `hatch_out`, with a gas allowance). Demonstrate on testnet: allowed calls succeed; a direct NEAR transfer, a call to another contract, and an `AddKey` all fail. Record the failing transaction hashes.
- Extend the attack demo from Y2: a scripted "prompt-injected" agent tries (a) to deposit to a syndicate with a different policy hash, (b) to drain via a non-allowlisted settlement, (c) to use its key outside the contract. Show the log and the rejections.
- Read the caveat on the access-keys page: function-call-only accounts cannot transfer NEAR or add keys, and can lock themselves out if the gas allowance runs out. Document this.
- **Fix the wording:** do not say "OutLayer-governed" unless the real OutLayer service is integrated and demonstrated. Say "per-flyer deposit caps enforced by the contract; function-call access keys scoped to the contract". Update README line 16 and the matrix row accordingly. If time allows, integrate OutLayer for real (docs: https://app.outlayer.ai/docs/getting-started) and demonstrate it; otherwise drop the name from claims.

### A4. Ideas worth a short investigation (do not commit to them blind)
- E2EE deliberation: NEAR AI's inference SDK supports end-to-end encryption to a key from the verified model attestation, but it is opt-in. If feasible, encrypt sensitive deliberation inputs to the attested model key so the local aggregator never handles plaintext. Verify what the SDK actually supports (including multi-party inputs) before designing around it; if it does not fit, say so and keep the local-aggregator caveat.
- Record, in the README, which track prompts the project maps to and which requirements it meets, partially meets, or does not meet. Honest partial credit beats implied full credit.
