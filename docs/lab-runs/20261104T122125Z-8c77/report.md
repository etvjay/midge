# Lab run 20261104T122125Z-8c77

- **Code:** `779e49d226f086bdd1558d6735e6934a27aad10d` on `master` (**13 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `8a0180ff698c44b5…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 371 events, hash-chained; root `503056d1dd57977cc61059dc47f4cf3614369b63600095beffcbea7c19a5d8f4`. Verify with `node lab/verify-run.js lab/runs/20261104T122125Z-8c77`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-CHAIN-ROUND-LOCAL A full syndicate round on NEAR testnet against a local hosted Roost | testnet | **PASS** | 14 | 52 | 3 attempts: PASS, PASS, PASS |

## E-CHAIN-ROUND-LOCAL: A full syndicate round on NEAR testnet against a local hosted Roost

**Hypothesis.** A syndicate hatched with a hosted Roost's settlement key can be funded, can aggregate sealed bids exactly, and is settled on chain only by that Roost for allocations its own aggregate supports. A replay, a payout outside the policy and a signature from another key are all rejected on chain without moving funds, and members can always take their own money back with hatch_out when the Roost stalls.

**What this does not prove**
- The Roost runs on this machine with a simulated attestation provider, so this proves the CHAIN LOGIC and the Roost's signing rules. It proves nothing about hardware: see E-HOSTED-LIVE-01 for a real TDX VM.
- All members, the coordinator and the recipient are controlled by one operator with keys derived from one master key. It shows the contract's rules, not independent users acting independently.
- Testnet only, one run on one date. The contract has not been audited by a third party.
- Rejections are shown by on-chain state staying unchanged, not by matching the contract's error text.

| Step | Result | Assertions | Time |
|---|---|---|---|
| preflight: accounts, balances and deployed contract | ✓ pass | 4/4 | 2233 ms |
| hatch a syndicate whose settlement key is the Roost's | ✓ pass | 2/2 | 1521 ms |
| members deposit with explicit consent to the policy hash | ✓ pass | 5/5 | 7269 ms |
| members seal bids; the Roost aggregates them exactly | ✓ pass | 2/2 | 28 ms |
| ATTACK 1: the Roost refuses to sign more than the sealed bids support | ✓ pass | 1/1 | 212 ms |
| settle on chain with the Roost's signature | ✓ pass | 4/4 | 3669 ms |
| ATTACK 2: replaying the same signed settlement is rejected | ✓ pass | 2/2 | 2142 ms |
| ATTACK 3: a valid Roost signature cannot pay a recipient outside the policy | ✓ pass | 5/5 | 11053 ms |
| ATTACK 4: a settlement signed by a different key is rejected | ✓ pass | 2/2 | 2558 ms |
| cleanup: settle syndicate #2 legitimately with the real Roost | ✓ pass | 2/2 | 3019 ms |
| ATTACK 5: a partial settlement cannot be replayed, and the next round needs a fresh signature | ✓ pass | 11/11 | 11932 ms |
| the Roost stalls: a member takes their own funds back with hatch_out | ✓ pass | 7/7 | 18218 ms |
| return the funds: the recipient pays the members back so the experiment can be repeated | ✓ pass | 3/3 | 6435 ms |
| ledger: every transaction, and what the experiment cost | ✓ pass | 2/2 | 1054 ms |

### preflight: accounts, balances and deployed contract

- observed **balances (NEAR)**: `{"fly-1793636729.testnet":"0.6875","f1.fly-1793636729.testnet":"0.1867","f2.fly-1793636729.testnet":"0.1965","f3.fly-1793636729.testnet":"0.…`
- note: Measured: a full round costs about 0.002 NEAR net, because unused prepaid gas is refunded. The balance needed is the temporary peak: a deposit (up to 0.03) plus prepaid gas (up to 0.06 at current testnet gas prices).
- ✓ every member has enough testnet NEAR for the peak of this experiment (0.09 each)
- ✓ the master account can pay for hatching (0.1 NEAR)
- observed **deployed code hash**: `5maXUkmSgoUQ52RtDSSzZ1gzyhEgJdBuFESgXCiTbqoG`
- ✓ the deployed contract is the audited build
- observed **contract account storage**: `{"balance":"4.1252","bytesUsed":361285,"headroomNear":"0.5124"}`
- ✓ the contract account has at least 0.15 NEAR of storage headroom (each syndicate record costs about 0.01)

### hatch a syndicate whose settlement key is the Roost's

- evidence tx: {"label":"hatch lab-mw235sm3-1","hash":"28nyU3kdSPpySRiK5fEJsJQYKXbKYKj2ihdi1xHcL3rR","ok":true,"explorer":"https://testnet.nearblocks.io/txns/28nyU3kdSPpySRiK5fEJsJQYKXbKYKj2ihdi1xHcL3rR","gasTGas":2.656388963404,"error…
- ✓ hatch succeeded on chain
- observed **syndicate state**: `{"status":"Active","epoch":1,"flyers":0}`
- ✓ the syndicate is active

### members deposit with explicit consent to the policy hash

- evidence tx: {"label":"deposit f1.fly-1793636729.testnet -> lab-mw235sm3-1","hash":"GU794BbmLcqDYi5xhQCdJmZ8qcebVyoFFawdCdLTwaA2","ok":true,"explorer":"https://testnet.nearblocks.io/txns/GU794BbmLcqDYi5xhQCdJmZ8qcebVyoFFawdCdLTwaA2",…
- ✓ f1.fly-1793636729.testnet deposited 0.02 NEAR
- evidence tx: {"label":"deposit f2.fly-1793636729.testnet -> lab-mw235sm3-1","hash":"FFG7iNG24dGLEb6mrH5ZY6DQ2UcNQMqBczEy5QjUrE2e","ok":true,"explorer":"https://testnet.nearblocks.io/txns/FFG7iNG24dGLEb6mrH5ZY6DQ2UcNQMqBczEy5QjUrE2e",…
- ✓ f2.fly-1793636729.testnet deposited 0.02 NEAR
- evidence tx: {"label":"deposit f3.fly-1793636729.testnet -> lab-mw235sm3-1","hash":"5qndjSUdSqJ6TEEU2KoPT1tML8FXxRebZpzg6mLUfobe","ok":true,"explorer":"https://testnet.nearblocks.io/txns/5qndjSUdSqJ6TEEU2KoPT1tML8FXxRebZpzg6mLUfobe",…
- ✓ f3.fly-1793636729.testnet deposited 0.02 NEAR
- ✓ escrow equals the three deposits exactly
- ✓ three active flyers

### members seal bids; the Roost aggregates them exactly

- observed **aggregate**: `{"totalInputAmount":"0.06","flyerCount":3,"excludedFlyers":[],"executionModel":"HOSTED_EXACT_BATCH","confidentiality":"simulated","timestamp…`
- ✓ the total is exactly 0.06
- ✓ three bids counted and none excluded

### ATTACK 1: the Roost refuses to sign more than the sealed bids support

- ✓ over-allocation is refused by the Roost

### settle on chain with the Roost's signature

- evidence tx: {"label":"settle_batch lab-mw235sm3-1","hash":"H4vBxdqgMQGHN61iJMqUDyqySMT7gn8vzkizU8D2abQT","ok":true,"explorer":"https://testnet.nearblocks.io/txns/H4vBxdqgMQGHN61iJMqUDyqySMT7gn8vzkizU8D2abQT","gasTGas":6.1262982598,"…
- ✓ settle_batch succeeded
- observed **recipient balance change (NEAR)**: `0.06`
- ✓ the syndicate is Settled
- ✓ the recipient received exactly the escrow
- ✓ the escrow is empty

### ATTACK 2: replaying the same signed settlement is rejected

- evidence tx: {"label":"REPLAY settle_batch lab-mw235sm3-1","hash":null,"ok":false,"explorer":null,"gasTGas":0,"error":"Smart contract panicked: panicked at src/lib.rs:505:9:\nassertion `left == right` failed: [HAQ REJECT] Syndicate i…
- observed **contract answer**: `Smart contract panicked: panicked at src/lib.rs:505:9:
assertion `left == right` failed: [HAQ REJECT] Syndicate is not active.
  left: Settl…`
- ✓ the replay failed
- ✓ the recipient balance did not change

### ATTACK 3: a valid Roost signature cannot pay a recipient outside the policy

- evidence tx: {"label":"hatch lab-mw235sm3-2","hash":"3nekDouLtvs9eRCeHCpF9MHtjxZ7xJiTiiqfBqx9PFrF","ok":true,"explorer":"https://testnet.nearblocks.io/txns/3nekDouLtvs9eRCeHCpF9MHtjxZ7xJiTiiqfBqx9PFrF","gasTGas":2.661452570422,"error…
- ✓ hatch #2 succeeded
- evidence tx: {"label":"deposit f1.fly-1793636729.testnet -> lab-mw235sm3-2","hash":"EFNMfq4X81JRAiHHMSJbMEcYxoT1UpHZH6Z4eVVigT69","ok":true,"explorer":"https://testnet.nearblocks.io/txns/EFNMfq4X81JRAiHHMSJbMEcYxoT1UpHZH6Z4eVVigT69",…
- ✓ f1.fly-1793636729.testnet deposited 0.02
- evidence tx: {"label":"deposit f2.fly-1793636729.testnet -> lab-mw235sm3-2","hash":"nJJ8enDG6yhScVXcCtJ5QkcompftRmdDgo3VPBjZLGM","ok":true,"explorer":"https://testnet.nearblocks.io/txns/nJJ8enDG6yhScVXcCtJ5QkcompftRmdDgo3VPBjZLGM","g…
- ✓ f2.fly-1793636729.testnet deposited 0.02
- evidence tx: {"label":"settle_batch lab-mw235sm3-2","hash":null,"ok":false,"explorer":null,"gasTGas":0,"error":"Smart contract panicked: panicked at src/lib.rs:557:13:\n[Settle REJECT] Recipient thief-mw235sm3.testnet is not in allow…
- observed **contract answer**: `Smart contract panicked: panicked at src/lib.rs:557:13:
[Settle REJECT] Recipient thief-mw235sm3.testnet is not in allowed_recipients whitel…`
- ✓ the contract rejected a payout to an unapproved recipient
- ✓ the syndicate is still active with the escrow intact

### ATTACK 4: a settlement signed by a different key is rejected

- evidence tx: {"label":"settle_batch lab-mw235sm3-2","hash":null,"ok":false,"explorer":null,"gasTGas":0,"error":"Smart contract panicked: panicked at src/lib.rs:615:9:\n[HAQ REJECT] Invalid enclave Ed25519 signature over deliberation …
- observed **contract answer**: `Smart contract panicked: panicked at src/lib.rs:615:9:
[HAQ REJECT] Invalid enclave Ed25519 signature over deliberation batch!`
- ✓ the contract rejected a signature from a key it was not hatched with
- ✓ nothing moved

### cleanup: settle syndicate #2 legitimately with the real Roost

- evidence tx: {"label":"settle_batch lab-mw235sm3-2","hash":"7v8wm8jaJzTwyjEkRhGQ4G53WwQSnTfKHbUtWGRbahiK","ok":true,"explorer":"https://testnet.nearblocks.io/txns/7v8wm8jaJzTwyjEkRhGQ4G53WwQSnTfKHbUtWGRbahiK","gasTGas":5.934384817126…
- ✓ the legitimate settlement succeeded after the failed attacks
- ✓ syndicate #2 is Settled

### ATTACK 5: a partial settlement cannot be replayed, and the next round needs a fresh signature

- evidence tx: {"label":"hatch lab-mw235sm3-4","hash":"K56fXy7ngZPVttRwjbBnk94Bfc8YsVhqRLvHfy6Ntnq","ok":true,"explorer":"https://testnet.nearblocks.io/txns/K56fXy7ngZPVttRwjbBnk94Bfc8YsVhqRLvHfy6Ntnq","gasTGas":2.659949332432,"error":…
- ✓ hatch #4 succeeded
- evidence tx: {"label":"deposit f1.fly-1793636729.testnet -> lab-mw235sm3-4","hash":"9WhujUwQnVF5V5ybbpRS7jSENrhAcBbpXTZoe34uv93o","ok":true,"explorer":"https://testnet.nearblocks.io/txns/9WhujUwQnVF5V5ybbpRS7jSENrhAcBbpXTZoe34uv93o",…
- ✓ f1 deposited 0.03
- evidence tx: {"label":"settle_batch lab-mw235sm3-4","hash":"8ez1HyHUcYk9LHs8dGcB5rLDqyp3f16gEekW5rCZ4uLX","ok":true,"explorer":"https://testnet.nearblocks.io/txns/8ez1HyHUcYk9LHs8dGcB5rLDqyp3f16gEekW5rCZ4uLX","gasTGas":5.772367595653…
- ✓ the partial settlement (0.01 of 0.03) succeeded
- ✓ 0.02 is left and the syndicate is still active
- ✓ the round nonce rotated after the partial settlement
- ✓ it is still epoch 1 (a Flash syndicate does not start new epochs)
- evidence tx: {"label":"REPLAY settle_batch lab-mw235sm3-4 (partial)","hash":null,"ok":false,"explorer":null,"gasTGas":0,"error":"Smart contract panicked: panicked at src/lib.rs:525:9:\nassertion `left == right` failed: [HAQ REJECT] N…
- observed **contract answer**: `Smart contract panicked: panicked at src/lib.rs:525:9:
assertion `left == right` failed: [HAQ REJECT] Nonce mismatch. Replay attack blocked.…`
- ✓ the replay of the partial settlement failed
- ✓ the escrow is unchanged by the replay
- ✓ the recipient received nothing from the replay
- evidence tx: {"label":"settle_batch lab-mw235sm3-4","hash":"ENEVTfptyKmdWZiY3VNJwzhAof5RAQwfNZPzRmFuyim1","ok":true,"explorer":"https://testnet.nearblocks.io/txns/ENEVTfptyKmdWZiY3VNJwzhAof5RAQwfNZPzRmFuyim1","gasTGas":5.743556048052…
- ✓ a fresh signature on the new nonce settles the rest
- ✓ syndicate #4 is Settled with no escrow left

### the Roost stalls: a member takes their own funds back with hatch_out

- evidence tx: {"label":"hatch lab-mw235sm3-3","hash":"6zNbhGXmGN7mc3TPmSyAWvSB7xvhRqaPUzcxwZCP3DY6","ok":true,"explorer":"https://testnet.nearblocks.io/txns/6zNbhGXmGN7mc3TPmSyAWvSB7xvhRqaPUzcxwZCP3DY6","gasTGas":2.664949650737,"error…
- ✓ hatch #3 (timeout 2 blocks) succeeded
- evidence tx: {"label":"deposit f2.fly-1793636729.testnet -> lab-mw235sm3-3","hash":"CuWZXUEXh1pFgiB3vPcguBxouXREqcwuf3NXkXfgAN3f","ok":true,"explorer":"https://testnet.nearblocks.io/txns/CuWZXUEXh1pFgiB3vPcguBxouXREqcwuf3NXkXfgAN3f",…
- ✓ f2 deposited 0.03
- evidence tx: {"label":"hatch_out lab-mw235sm3-3","hash":"D59JTQKEt7puQ4PzGK82mzgxXgKFER1QbaQgLzbS4RbU","ok":true,"explorer":"https://testnet.nearblocks.io/txns/D59JTQKEt7puQ4PzGK82mzgxXgKFER1QbaQgLzbS4RbU","gasTGas":5.101803182885,"e…
- ✓ hatch_out succeeded without any operator or enclave signature
- ✓ the escrow is empty and the syndicate is aborted/refunded
- observed **transfers made by the contract in this transaction**: `[{"to":"f2.fly-1793636729.testnet","near":"0.03"}]`
- observed **transfers made by the system (gas refunds, not the contract)**: `["0.000201","0.057875","0.002378"]`
- ✓ the contract made exactly one transfer
- ✓ it went to the member who called hatch_out
- ✓ and it was exactly the 0.03 NEAR they deposited (no more, no less)
- note: Balance deltas were rejected as evidence here: gas refunds from earlier transactions land after a reading is taken and made a correct refund look like a double payment. The receipts above are authoritative.

### return the funds: the recipient pays the members back so the experiment can be repeated

- evidence tx: {"label":"return 0.07 NEAR to f1.fly-1793636729.testnet","hash":"2ovwrBfrb3Dn2ibDoGC8APvBKgMEaMqBBob4y9VSg9Z2","ok":true,"explorer":"https://testnet.nearblocks.io/txns/2ovwrBfrb3Dn2ibDoGC8APvBKgMEaMqBBob4y9VSg9Z2","error…
- ✓ returned 0.07 NEAR to f1.fly-1793636729.testnet
- evidence tx: {"label":"return 0.04 NEAR to f2.fly-1793636729.testnet","hash":"D1G2pfAjBeTBiHZJiic64BRveo1rw1uDiJRVHRZWWmf1","ok":true,"explorer":"https://testnet.nearblocks.io/txns/D1G2pfAjBeTBiHZJiic64BRveo1rw1uDiJRVHRZWWmf1","error…
- ✓ returned 0.04 NEAR to f2.fly-1793636729.testnet
- evidence tx: {"label":"return 0.02 NEAR to f3.fly-1793636729.testnet","hash":"2LQgBewbDtsireajdVHzor4cyuPqvmVtwaGEBt1FUaA8","ok":true,"explorer":"https://testnet.nearblocks.io/txns/2LQgBewbDtsireajdVHzor4cyuPqvmVtwaGEBt1FUaA8","error…
- ✓ returned 0.02 NEAR to f3.fly-1793636729.testnet

### ledger: every transaction, and what the experiment cost

- observed **transactions sent**: `23`
- observed **transactions that failed (expected: the 3 attack attempts)**: `["REPLAY settle_batch lab-mw235sm3-1","settle_batch lab-mw235sm3-2","settle_batch lab-mw235sm3-2","REPLAY settle_batch lab-mw235sm3-4 (parti…`
- ✓ exactly the four attack attempts failed on chain
- observed **net NEAR spent across all accounts (gas and storage)**: `0.00243`
- ✓ the whole experiment cost less than 0.02 NEAR net (measured previously: about 0.002)

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
