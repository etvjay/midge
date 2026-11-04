# Lab run 20261104T112143Z-2bc2

- **Code:** `509877b6a43917faa90d64848ab07b9485e7f863` on `master` (**6 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `8a0180ff698c44b5…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 293 events, hash-chained; root `68759cf56f881c2c6364b576a3cb2e6e5bf16b8bf2b05f26c7e09ad3b88cfc20`. Verify with `node lab/verify-run.js lab/runs/20261104T112143Z-2bc2`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-CHAIN-ROUND-LOCAL A full syndicate round on NEAR testnet against a local hosted Roost | testnet | **PASS** | 13 | 40 | 3 attempts: PASS, PASS, PASS |

## E-CHAIN-ROUND-LOCAL: A full syndicate round on NEAR testnet against a local hosted Roost

**Hypothesis.** A syndicate hatched with a hosted Roost's settlement key can be funded, can aggregate sealed bids exactly, and is settled on chain only by that Roost for allocations its own aggregate supports. A replay, a payout outside the policy and a signature from another key are all rejected on chain without moving funds, and members can always take their own money back with hatch_out when the Roost stalls.

**What this does not prove**
- The Roost runs on this machine with a simulated attestation provider, so this proves the CHAIN LOGIC and the Roost's signing rules. It proves nothing about hardware: see E-HOSTED-LIVE-01 for a real TDX VM.
- All members, the coordinator and the recipient are controlled by one operator with keys derived from one master key. It shows the contract's rules, not independent users acting independently.
- Testnet only, one run on one date. The contract has not been audited by a third party.
- Rejections are shown by on-chain state staying unchanged, not by matching the contract's error text.

| Step | Result | Assertions | Time |
|---|---|---|---|
| preflight: accounts, balances and deployed contract | ✓ pass | 3/3 | 1614 ms |
| hatch a syndicate whose settlement key is the Roost's | ✓ pass | 2/2 | 1991 ms |
| members deposit with explicit consent to the policy hash | ✓ pass | 5/5 | 7297 ms |
| members seal bids; the Roost aggregates them exactly | ✓ pass | 2/2 | 29 ms |
| ATTACK 1: the Roost refuses to sign more than the sealed bids support | ✓ pass | 1/1 | 187 ms |
| settle on chain with the Roost's signature | ✓ pass | 4/4 | 4017 ms |
| ATTACK 2: replaying the same signed settlement is rejected | ✓ pass | 2/2 | 2200 ms |
| ATTACK 3: a valid Roost signature cannot pay a recipient outside the policy | ✓ pass | 5/5 | 8777 ms |
| ATTACK 4: a settlement signed by a different key is rejected | ✓ pass | 2/2 | 2205 ms |
| cleanup: settle syndicate #2 legitimately with the real Roost | ✓ pass | 2/2 | 2998 ms |
| the Roost stalls: a member takes their own funds back with hatch_out | ✓ pass | 7/7 | 19410 ms |
| return the funds: the recipient pays the members back so the experiment can be repeated | ✓ pass | 3/3 | 6242 ms |
| ledger: every transaction, and what the experiment cost | ✓ pass | 2/2 | 1033 ms |

### preflight: accounts, balances and deployed contract

- observed **balances (NEAR)**: `{"fly-1793636729.testnet":"1.1876","f1.fly-1793636729.testnet":"0.1649","f2.fly-1793636729.testnet":"0.1918","f3.fly-1793636729.testnet":"0.…`
- note: Measured: a full round costs about 0.002 NEAR net, because unused prepaid gas is refunded. The balance needed is the temporary peak: a deposit (up to 0.03) plus prepaid gas (up to 0.06 at current testnet gas prices).
- ✓ every member has enough testnet NEAR for the peak of this experiment (0.09 each)
- ✓ the master account can pay for hatching (0.1 NEAR)
- observed **deployed code hash**: `GwjB69No5TfDcuFTrff67kNmRUd7fQDW75kMxZp9Mxwi`
- ✓ the deployed contract is the audited build

### hatch a syndicate whose settlement key is the Roost's

- evidence tx: {"label":"hatch lab-mw2110fp-1","hash":"6PCUqPHti4JCPTpe9PHF8A9aK6gJH1phFpvsTMPDaEFM","ok":true,"explorer":"https://testnet.nearblocks.io/txns/6PCUqPHti4JCPTpe9PHF8A9aK6gJH1phFpvsTMPDaEFM","gasTGas":2.520938744123,"error…
- ✓ hatch succeeded on chain
- observed **syndicate state**: `{"status":"Active","epoch":1,"flyers":0}`
- ✓ the syndicate is active

### members deposit with explicit consent to the policy hash

- evidence tx: {"label":"deposit f1.fly-1793636729.testnet -> lab-mw2110fp-1","hash":"6fEz4RsmHsmCvEm166xgMJLXi6xLomDhZgtpH44i3zmk","ok":true,"explorer":"https://testnet.nearblocks.io/txns/6fEz4RsmHsmCvEm166xgMJLXi6xLomDhZgtpH44i3zmk",…
- ✓ f1.fly-1793636729.testnet deposited 0.02 NEAR
- evidence tx: {"label":"deposit f2.fly-1793636729.testnet -> lab-mw2110fp-1","hash":"FDQZHCcxreRhXiBt9nQA5HqRnXbSwRdCYFaj4Wm2uYGi","ok":true,"explorer":"https://testnet.nearblocks.io/txns/FDQZHCcxreRhXiBt9nQA5HqRnXbSwRdCYFaj4Wm2uYGi",…
- ✓ f2.fly-1793636729.testnet deposited 0.02 NEAR
- evidence tx: {"label":"deposit f3.fly-1793636729.testnet -> lab-mw2110fp-1","hash":"G3gwvdXz2VaSX2Ep1QxV5RJxLTv7dRrLeatB3k64KfCF","ok":true,"explorer":"https://testnet.nearblocks.io/txns/G3gwvdXz2VaSX2Ep1QxV5RJxLTv7dRrLeatB3k64KfCF",…
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

- evidence tx: {"label":"settle_batch lab-mw2110fp-1","hash":"BaBUozFCruFZhxsLmJPzAicWZMYWKm6PA71ZaLVEswJK","ok":true,"explorer":"https://testnet.nearblocks.io/txns/BaBUozFCruFZhxsLmJPzAicWZMYWKm6PA71ZaLVEswJK","gasTGas":6.10798974991,…
- ✓ settle_batch succeeded
- observed **recipient balance change (NEAR)**: `0.06`
- ✓ the syndicate is Settled
- ✓ the recipient received exactly the escrow
- ✓ the escrow is empty

### ATTACK 2: replaying the same signed settlement is rejected

- evidence tx: {"label":"REPLAY settle_batch lab-mw2110fp-1","hash":null,"ok":false,"explorer":null,"gasTGas":0,"error":"Smart contract panicked: panicked at src/lib.rs:505:9:\nassertion `left == right` failed: [HAQ REJECT] Syndicate i…
- observed **contract answer**: `Smart contract panicked: panicked at src/lib.rs:505:9:
assertion `left == right` failed: [HAQ REJECT] Syndicate is not active.
  left: Settl…`
- ✓ the replay failed
- ✓ the recipient balance did not change

### ATTACK 3: a valid Roost signature cannot pay a recipient outside the policy

- ✓ hatch #2 succeeded
- ✓ f1.fly-1793636729.testnet deposited 0.02
- ✓ f2.fly-1793636729.testnet deposited 0.02
- evidence tx: {"label":"settle_batch lab-mw2110fp-2","hash":null,"ok":false,"explorer":null,"gasTGas":0,"error":"Smart contract panicked: panicked at src/lib.rs:557:13:\n[Settle REJECT] Recipient thief-mw2110fp.testnet is not in allow…
- observed **contract answer**: `Smart contract panicked: panicked at src/lib.rs:557:13:
[Settle REJECT] Recipient thief-mw2110fp.testnet is not in allowed_recipients whitel…`
- ✓ the contract rejected a payout to an unapproved recipient
- ✓ the syndicate is still active with the escrow intact

### ATTACK 4: a settlement signed by a different key is rejected

- evidence tx: {"label":"settle_batch lab-mw2110fp-2","hash":null,"ok":false,"explorer":null,"gasTGas":0,"error":"Smart contract panicked: panicked at src/lib.rs:615:9:\n[HAQ REJECT] Invalid enclave Ed25519 signature over deliberation …
- observed **contract answer**: `Smart contract panicked: panicked at src/lib.rs:615:9:
[HAQ REJECT] Invalid enclave Ed25519 signature over deliberation batch!`
- ✓ the contract rejected a signature from a key it was not hatched with
- ✓ nothing moved

### cleanup: settle syndicate #2 legitimately with the real Roost

- evidence tx: {"label":"settle_batch lab-mw2110fp-2","hash":"6AWg9R4Ea5izUaFPajWe2hqzYFxiw8hxeWdfKzEmwa3n","ok":true,"explorer":"https://testnet.nearblocks.io/txns/6AWg9R4Ea5izUaFPajWe2hqzYFxiw8hxeWdfKzEmwa3n","gasTGas":5.920570486756…
- ✓ the legitimate settlement succeeded after the failed attacks
- ✓ syndicate #2 is Settled

### the Roost stalls: a member takes their own funds back with hatch_out

- ✓ hatch #3 (timeout 2 blocks) succeeded
- ✓ f2 deposited 0.03
- evidence tx: {"label":"hatch_out lab-mw2110fp-3","hash":"HaNJYewXGXDneRacjnn1DDaxgHgJtSam7fxYfPTqfuPB","ok":true,"explorer":"https://testnet.nearblocks.io/txns/HaNJYewXGXDneRacjnn1DDaxgHgJtSam7fxYfPTqfuPB","gasTGas":5.097158217875,"e…
- ✓ hatch_out succeeded without any operator or enclave signature
- ✓ the escrow is empty and the syndicate is aborted/refunded
- observed **transfers made by the contract in this transaction**: `[{"to":"f2.fly-1793636729.testnet","near":"0.03"}]`
- observed **transfers made by the system (gas refunds, not the contract)**: `["0.000201","0.057879","0.002374"]`
- ✓ the contract made exactly one transfer
- ✓ it went to the member who called hatch_out
- ✓ and it was exactly the 0.03 NEAR they deposited (no more, no less)
- note: Balance deltas were rejected as evidence here: gas refunds from earlier transactions land after a reading is taken and made a correct refund look like a double payment. The receipts above are authoritative.

### return the funds: the recipient pays the members back so the experiment can be repeated

- evidence tx: {"label":"return 0.04 NEAR to f1.fly-1793636729.testnet","hash":"8mfY8aEpd2Juz5iaCoZNPSaAkdGutchhgCZjvrJVddDm","ok":true,"explorer":"https://testnet.nearblocks.io/txns/8mfY8aEpd2Juz5iaCoZNPSaAkdGutchhgCZjvrJVddDm","error…
- ✓ returned 0.04 NEAR to f1.fly-1793636729.testnet
- evidence tx: {"label":"return 0.04 NEAR to f2.fly-1793636729.testnet","hash":"9TtQnq1SSMMUn7iyPz7b449dw9BkW8246kicX47T6da7","ok":true,"explorer":"https://testnet.nearblocks.io/txns/9TtQnq1SSMMUn7iyPz7b449dw9BkW8246kicX47T6da7","error…
- ✓ returned 0.04 NEAR to f2.fly-1793636729.testnet
- evidence tx: {"label":"return 0.02 NEAR to f3.fly-1793636729.testnet","hash":"HNw88ohcZep1f6At3kwD69BVHnptYuWizuJgbzyu2MSR","ok":true,"explorer":"https://testnet.nearblocks.io/txns/HNw88ohcZep1f6At3kwD69BVHnptYuWizuJgbzyu2MSR","error…
- ✓ returned 0.02 NEAR to f3.fly-1793636729.testnet

### ledger: every transaction, and what the experiment cost

- observed **transactions sent**: `18`
- observed **transactions that failed (expected: the 3 attack attempts)**: `["REPLAY settle_batch lab-mw2110fp-1","settle_batch lab-mw2110fp-2","settle_batch lab-mw2110fp-2"]`
- ✓ exactly the three attacks failed on chain
- observed **net NEAR spent across all accounts (gas and storage)**: `0.00211`
- ✓ the whole experiment cost less than 0.02 NEAR net (measured previously: about 0.002)

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
