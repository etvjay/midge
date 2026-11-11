# Lab run 20261111T222226Z-03a5

- **Code:** `df3e9aa662a0a58610dbac919a209f17c4dd3fe5` on `pin-gap052` (**98 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `73f42e651241e148…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 176 events, hash-chained; root `2fb97405f0cde31c082024a1a0864ca575bf593ab49f1b24cac19d1c461278ec`. Verify with `node lab/verify-run.js lab/runs/20261111T222226Z-03a5`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-HOSTED-LIVE-01 The hosted Roost on a real Phala TDX VM runs a full syndicate round on NEAR testnet | hardware | **PASS** | 21 | 85 |  |

## E-HOSTED-LIVE-01: The hosted Roost on a real Phala TDX VM runs a full syndicate round on NEAR testnet

**Hypothesis.** A member who verifies the Roost's attestation on a real Intel TDX VM (official verifier, keys bound to a fresh nonce, compose hash derived from our own file) can seal bids to it; the VM aggregates them exactly and signs a settlement that the NEAR contract accepts only for what the sealed bids support. The VM's attested compose hash becomes the syndicate's on-chain expected code hash. Every attack that failed against a local Roost fails the same way, and the VM is deleted at the end.

**What this does not prove**
- One operator controls all members, the coordinator, the recipient and the VM account. This shows the system working end to end on real hardware, not independent parties.
- The attestation proves the VM runs the pinned compose and image; it does not audit the code inside the image, and it is only as strong as Intel TDX and Phala's platform.
- The VM exists for a few minutes. Nothing here shows a VM kept up for days or a failure of the VM mid-round.
- The coordinator key is generated for this session and held by this process; the model is a coordinator with a key, not a decentralised one.
- Testnet only; the contract has not been audited by a third party.

| Step | Result | Assertions | Time |
|---|---|---|---|
| preflight: the Phala account is empty and the pins are present | ✓ pass | 3/3 | 2886 ms |
| deploy the Roost on a real TDX VM (capped by a dead-man's switch) | ✓ pass | 4/4 | 48647 ms |
| verify the attestation exactly as a member would | ✓ pass | 14/14 | 2609 ms |
| the Roost's access control holds on the public internet | ✓ pass | 6/6 | 209 ms |
| the keys a member would seal to are the attested keys | ✓ pass | 3/3 | 1 ms |
| create fresh member accounts for this run (three flyers and a recipient) | ✓ pass | 1/1 | 17247 ms |
| preflight: accounts, balances and deployed contract | ✓ pass | 4/4 | 1690 ms |
| hatch a syndicate whose settlement key is the Roost's | ✓ pass | 2/2 | 1846 ms |
| members deposit with explicit consent to the policy hash | ✓ pass | 5/5 | 7085 ms |
| members seal bids; the Roost aggregates them exactly | ✓ pass | 2/2 | 1243 ms |
| ATTACK 1: the Roost refuses to sign more than the sealed bids support | ✓ pass | 1/1 | 241 ms |
| settle on chain with the Roost's signature | ✓ pass | 4/4 | 3552 ms |
| ATTACK 2: replaying the same signed settlement is rejected | ✓ pass | 2/2 | 2403 ms |
| ATTACK 3: a valid Roost signature cannot pay a recipient outside the policy | ✓ pass | 5/5 | 10755 ms |
| ATTACK 4: a settlement signed by a different key is rejected | ✓ pass | 2/2 | 2060 ms |
| cleanup: settle syndicate #2 legitimately with the real Roost | ✓ pass | 2/2 | 4428 ms |
| ATTACK 5: a partial settlement cannot be replayed, and the next round needs a fresh signature | ✓ pass | 11/11 | 15547 ms |
| the Roost stalls: a member takes their own funds back with hatch_out | ✓ pass | 7/7 | 19266 ms |
| ledger: every transaction, and what the experiment cost | ✓ pass | 2/2 | 1040 ms |
| teardown of the chain side: prune the syndicates, compact the indexes, delete the accounts | ✓ pass | 2/2 | 30212 ms |
| teardown: delete the VM and prove the account is empty | ✓ pass | 3/3 | 5510 ms |

### preflight: the Phala account is empty and the pins are present

- ✓ no CVM is already running on the account (so nothing is billing unseen)
- ✓ the compose file is pinned to a CI-built image digest
- ✓ a production OS image hash is pinned
- observed **instance type and rate**: `{"type":"tdx.small","usdPerHour":0.058}`

### deploy the Roost on a real TDX VM (capped by a dead-man's switch)

- note: deploying midge-lab-11112222
- evidence cvm: {"id":"a9cced31cbde341b5b2ce77fb2f94ce151fefdde","url":"https://a9cced31cbde341b5b2ce77fb2f94ce151fefdde-8080.dstack-pha1-prod5.phala.network","deadmanHours":1}
- ✓ the VM answered /healthz
- ✓ the VM was created with public logs off
- ✓ it runs a production (non-dev) OS image
- ✓ it runs the pinned production OS image hash

### verify the attestation exactly as a member would

- observed **verifier image**: `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`
- ✓ Phala's app-compose contains our compose file byte for byte
- observed **attestation**: `{"bytes":12958,"simulated":false}`
- ✓ bundle has the expected format
- ✓ bundle report data matches our keys and our nonce
- ✓ dstack-verifier accepts the attestation
- ✓ Intel quote verifies
- ✓ event log replays to the measured RTMR3
- ✓ OS image hash verifies against the published image
- ✓ platform is a dstack TDX confidential VM
- ✓ TCB status is acceptable
- ✓ OS image is not a development image
- ✓ quote report data equals sha512(our keys, our nonce)
- ✓ compose hash equals the pinned hash of our build
- ✓ OS image hash is one we pin
- ✓ the VM does not claim to be a simulator
- evidence attestation: {"composeHash":"5124af593da2edda0c9184a088c1f69351c66d3ae311ee275d0acb231705eab2","osImageHash":"ec43cb8c5e04b6bb6c53b33b16076a01d83d01f7f4b703f2f78a0d947d6247e6","nonce":"8dbc884c23f138f3cee170274c5a4037f5a6a99fca9d50ef…

### the Roost's access control holds on the public internet

- ✓ /aggregate without the coordinator key is refused (401)
- ✓ /settle without the coordinator key is refused (401)
- ✓ /debug does not exist
- ✓ /env does not exist
- ✓ /state does not exist
- ✓ /logs does not exist

### the keys a member would seal to are the attested keys

- ✓ the intent key a member would seal to equals the attested intent key
- ✓ the settlement key the contract will trust equals the attested settlement key
- ✓ the session says it is not simulated

### create fresh member accounts for this run (three flyers and a recipient)

- ✓ four accounts exist and are funded

### preflight: accounts, balances and deployed contract

- observed **balances (NEAR)**: `{"fly-1793636729.testnet":"10.0613","hoqtvoa.fly-1793636729.testnet":"0.1482","hoqtvob.fly-1793636729.testnet":"0.1482","hoqtvoc.fly-1793636…`
- note: Measured: a full round costs about 0.002 NEAR net, because unused prepaid gas is refunded. The balance needed is the temporary peak: a deposit (up to 0.03) plus prepaid gas (up to 0.06 at current testnet gas prices).
- ✓ every member has enough testnet NEAR for the peak of this experiment (0.09 each)
- ✓ the master account can pay for hatching (0.1 NEAR)
- observed **deployed code hash**: `BVcq86Wz5Q3kcdBdcUhfQVfQtC6CmGwcXuMd52aW6gTp`
- ✓ the deployed contract is the build expected from the wasm built from this checkout
- observed **contract account storage**: `{"balance":"6.1721","bytesUsed":574128,"headroomNear":"0.4308"}`
- ✓ the contract account has at least 0.15 NEAR of storage headroom (each syndicate record costs about 0.01)

### hatch a syndicate whose settlement key is the Roost's

- evidence tx: {"label":"hatch lab-hwmwcoqtvo-1","hash":"HRmooabEecdEzpuPAK6n2G9qAQD8ihv2TCjHtC4Mhr8o","ok":true,"explorer":"https://testnet.nearblocks.io/txns/HRmooabEecdEzpuPAK6n2G9qAQD8ihv2TCjHtC4Mhr8o","gasTGas":2.829692235935,"err…
- ✓ hatch succeeded on chain
- observed **syndicate state**: `{"status":"Active","epoch":1,"flyers":0}`
- ✓ the syndicate is active

### members deposit with explicit consent to the policy hash

- evidence tx: {"label":"deposit hoqtvoa.fly-1793636729.testnet -> lab-hwmwcoqtvo-1","hash":"J1kPFybFaX4SiAW8mdg51Q2beF2qeGMSksdWrvEd4zfb","ok":true,"explorer":"https://testnet.nearblocks.io/txns/J1kPFybFaX4SiAW8mdg51Q2beF2qeGMSksdWrvE…
- ✓ hoqtvoa.fly-1793636729.testnet deposited 0.02 NEAR
- evidence tx: {"label":"deposit hoqtvob.fly-1793636729.testnet -> lab-hwmwcoqtvo-1","hash":"AkTb43p9xRfhVkpBRio6KSAzPEVG5fRywex879YxcbKp","ok":true,"explorer":"https://testnet.nearblocks.io/txns/AkTb43p9xRfhVkpBRio6KSAzPEVG5fRywex879Y…
- ✓ hoqtvob.fly-1793636729.testnet deposited 0.02 NEAR
- evidence tx: {"label":"deposit hoqtvoc.fly-1793636729.testnet -> lab-hwmwcoqtvo-1","hash":"6F5mh7BoQnxwtjXLjQYodUf92ka4FZBDLsdM8ReqGLcG","ok":true,"explorer":"https://testnet.nearblocks.io/txns/6F5mh7BoQnxwtjXLjQYodUf92ka4FZBDLsdM8Re…
- ✓ hoqtvoc.fly-1793636729.testnet deposited 0.02 NEAR
- ✓ escrow equals the three deposits exactly
- ✓ three active flyers

### members seal bids; the Roost aggregates them exactly

- observed **aggregate**: `{"totalInputAmount":"0.06","flyerCount":3,"excludedFlyers":[],"executionModel":"HOSTED_EXACT_BATCH","confidentiality":"tee-hosted","timestam…`
- ✓ the total is exactly 0.06
- ✓ three bids counted and none excluded

### ATTACK 1: the Roost refuses to sign more than the sealed bids support

- ✓ over-allocation is refused by the Roost

### settle on chain with the Roost's signature

- evidence tx: {"label":"settle_batch lab-hwmwcoqtvo-1","hash":"FYhQVSiiw8T9eGMBW1vkC78XrieNdN6N8rnauki9ZVQo","ok":true,"explorer":"https://testnet.nearblocks.io/txns/FYhQVSiiw8T9eGMBW1vkC78XrieNdN6N8rnauki9ZVQo","gasTGas":7.4736325290…
- ✓ settle_batch succeeded
- observed **recipient balance change (NEAR)**: `0.06`
- ✓ the syndicate is Settled
- ✓ the recipient received exactly the escrow
- ✓ the escrow is empty

### ATTACK 2: replaying the same signed settlement is rejected

- evidence tx: {"label":"REPLAY settle_batch lab-hwmwcoqtvo-1","hash":"BX4FuYmEPU6cLqznFkMhnanjBxkfcZPL77izHTDzKvhy","ok":false,"explorer":"https://testnet.nearblocks.io/txns/BX4FuYmEPU6cLqznFkMhnanjBxkfcZPL77izHTDzKvhy","gasTGas":0,"e…
- observed **contract answer**: `Smart contract panicked: panicked at src/lib.rs:964:9:
assertion `left == right` failed: [HAQ REJECT] Syndicate is not active.
  left: Settl…`
- ✓ the replay failed
- ✓ the recipient balance did not change

### ATTACK 3: a valid Roost signature cannot pay a recipient outside the policy

- evidence tx: {"label":"hatch lab-hwmwcoqtvo-2","hash":"AMXtFxZXXcHQFJaFxF7EKqtvSThmB8JDERjoq9QJJzGZ","ok":true,"explorer":"https://testnet.nearblocks.io/txns/AMXtFxZXXcHQFJaFxF7EKqtvSThmB8JDERjoq9QJJzGZ","gasTGas":2.837527601619,"err…
- ✓ hatch #2 succeeded
- evidence tx: {"label":"deposit hoqtvoa.fly-1793636729.testnet -> lab-hwmwcoqtvo-2","hash":"BcEuV6GwQVJeETqauAjeh54M5owmSHJfdKjHbCAxQffv","ok":true,"explorer":"https://testnet.nearblocks.io/txns/BcEuV6GwQVJeETqauAjeh54M5owmSHJfdKjHbCA…
- ✓ hoqtvoa.fly-1793636729.testnet deposited 0.02
- evidence tx: {"label":"deposit hoqtvob.fly-1793636729.testnet -> lab-hwmwcoqtvo-2","hash":"E24wX5Y5KNdqg7jyXnKYDgWWauRusLeSJ24FxCsWLYNc","ok":true,"explorer":"https://testnet.nearblocks.io/txns/E24wX5Y5KNdqg7jyXnKYDgWWauRusLeSJ24FxCs…
- ✓ hoqtvob.fly-1793636729.testnet deposited 0.02
- evidence tx: {"label":"settle_batch lab-hwmwcoqtvo-2","hash":"9wnwnoUn2jsTWG7TJmz1i3ZKmf5pF27wZSMrzdQdM1cg","ok":false,"explorer":"https://testnet.nearblocks.io/txns/9wnwnoUn2jsTWG7TJmz1i3ZKmf5pF27wZSMrzdQdM1cg","gasTGas":0,"error":"…
- observed **contract answer**: `Smart contract panicked: panicked at src/lib.rs:1023:13:
[Settle REJECT] Recipient thief-hwmwcoqtvo.testnet is not in allowed_recipients whi…`
- ✓ the contract rejected a payout to an unapproved recipient
- ✓ the syndicate is still active with the escrow intact

### ATTACK 4: a settlement signed by a different key is rejected

- evidence tx: {"label":"settle_batch lab-hwmwcoqtvo-2","hash":"DJiujfczh1tmDmhnTrj5yzha5cWv1h9bM5QQ9K9WfjyF","ok":false,"explorer":"https://testnet.nearblocks.io/txns/DJiujfczh1tmDmhnTrj5yzha5cWv1h9bM5QQ9K9WfjyF","gasTGas":0,"error":"…
- observed **contract answer**: `Smart contract panicked: panicked at src/lib.rs:1156:17:
[HAQ REJECT] Invalid enclave Ed25519 signature over deliberation batch!`
- ✓ the contract rejected a signature from a key it was not hatched with
- ✓ nothing moved

### cleanup: settle syndicate #2 legitimately with the real Roost

- evidence tx: {"label":"settle_batch lab-hwmwcoqtvo-2","hash":"DehcbyGXiczjGbJHcQyXTfn5JibaVNwLwEYED9qiJem7","ok":true,"explorer":"https://testnet.nearblocks.io/txns/DehcbyGXiczjGbJHcQyXTfn5JibaVNwLwEYED9qiJem7","gasTGas":7.2697514579…
- ✓ the legitimate settlement succeeded after the failed attacks
- ✓ syndicate #2 is Settled

### ATTACK 5: a partial settlement cannot be replayed, and the next round needs a fresh signature

- evidence tx: {"label":"hatch lab-hwmwcoqtvo-4","hash":"GPRcvi43KM2hdrE7nChbKBvZiyFbAq6yxnjzjmSJTmcp","ok":true,"explorer":"https://testnet.nearblocks.io/txns/GPRcvi43KM2hdrE7nChbKBvZiyFbAq6yxnjzjmSJTmcp","gasTGas":2.842900315471,"err…
- ✓ hatch #4 succeeded
- evidence tx: {"label":"deposit hoqtvoa.fly-1793636729.testnet -> lab-hwmwcoqtvo-4","hash":"4P9VMYfQWxo3WzfkLSMdDcKzoEHP8cm6SR9s9ptE7AQ2","ok":true,"explorer":"https://testnet.nearblocks.io/txns/4P9VMYfQWxo3WzfkLSMdDcKzoEHP8cm6SR9s9pt…
- ✓ f1 deposited 0.03
- evidence tx: {"label":"settle_batch lab-hwmwcoqtvo-4","hash":"G2cz87C2AMDkqKdPADXmBGmSvuWbqJiGkhxQeFy99Xos","ok":true,"explorer":"https://testnet.nearblocks.io/txns/G2cz87C2AMDkqKdPADXmBGmSvuWbqJiGkhxQeFy99Xos","gasTGas":7.1319426560…
- ✓ the partial settlement (0.01 of 0.03) succeeded
- ✓ 0.02 is left and the syndicate is still active
- ✓ the round nonce rotated after the partial settlement
- ✓ it is still epoch 1 (a Flash syndicate does not start new epochs)
- evidence tx: {"label":"REPLAY settle_batch lab-hwmwcoqtvo-4 (partial)","hash":"EmvTctN25Zd2qba4bWChvpiNnPuQ8yJbNiEpxYuca7ew","ok":false,"explorer":"https://testnet.nearblocks.io/txns/EmvTctN25Zd2qba4bWChvpiNnPuQ8yJbNiEpxYuca7ew","gas…
- observed **contract answer**: `Smart contract panicked: panicked at src/lib.rs:991:9:
assertion `left == right` failed: [HAQ REJECT] Nonce mismatch. Replay attack blocked.…`
- ✓ the replay of the partial settlement failed
- ✓ the escrow is unchanged by the replay
- ✓ the recipient received nothing from the replay
- evidence tx: {"label":"settle_batch lab-hwmwcoqtvo-4","hash":"2kEKtP29HSRn3t4eDJG7ECJd47YxZUsTvimEcWoUV21p","ok":true,"explorer":"https://testnet.nearblocks.io/txns/2kEKtP29HSRn3t4eDJG7ECJd47YxZUsTvimEcWoUV21p","gasTGas":7.1053593151…
- ✓ a fresh signature on the new nonce settles the rest
- ✓ syndicate #4 is Settled with no escrow left

### the Roost stalls: a member takes their own funds back with hatch_out

- evidence tx: {"label":"hatch lab-hwmwcoqtvo-3","hash":"2avApHoTk9wssdGyfFQP8ExCC9KDnXge99BdbZtYA8K8","ok":true,"explorer":"https://testnet.nearblocks.io/txns/2avApHoTk9wssdGyfFQP8ExCC9KDnXge99BdbZtYA8K8","gasTGas":2.845932145379,"err…
- ✓ hatch #3 (timeout 10 blocks, the floor) succeeded
- evidence tx: {"label":"deposit hoqtvob.fly-1793636729.testnet -> lab-hwmwcoqtvo-3","hash":"9mxJVXwjBnFwfagDVX25Na9NVQudRRxmn6w2rnuNXhnb","ok":true,"explorer":"https://testnet.nearblocks.io/txns/9mxJVXwjBnFwfagDVX25Na9NVQudRRxmn6w2rnu…
- ✓ f2 deposited 0.03
- evidence tx: {"label":"hatch_out lab-hwmwcoqtvo-3","hash":"3Y45ZA6oSXbF4eFSwvbvtWKEHzBo4k8cHSvcp5VBrq6y","ok":true,"explorer":"https://testnet.nearblocks.io/txns/3Y45ZA6oSXbF4eFSwvbvtWKEHzBo4k8cHSvcp5VBrq6y","gasTGas":5.632299428521,…
- ✓ hatch_out succeeded without any operator or enclave signature
- ✓ the escrow is empty and the syndicate is aborted/refunded
- observed **transfers made by the contract in this transaction**: `[{"to":"hoqtvob.fly-1793636729.testnet","near":"0.03"}]`
- observed **transfers made by the system (gas refunds, not the contract)**: `["0.000201","0.002648"]`
- ✓ the contract made exactly one transfer
- ✓ it went to the member who called hatch_out
- ✓ and it was exactly the 0.03 NEAR they deposited (no more, no less)
- note: Balance deltas were rejected as evidence here: gas refunds from earlier transactions land after a reading is taken and made a correct refund look like a double payment. The receipts above are authoritative.

### ledger: every transaction, and what the experiment cost

- observed **transactions sent**: `20`
- observed **transactions that failed (expected: the 3 attack attempts)**: `["REPLAY settle_batch lab-hwmwcoqtvo-1","settle_batch lab-hwmwcoqtvo-2","settle_batch lab-hwmwcoqtvo-2","REPLAY settle_batch lab-hwmwcoqtvo-…`
- ✓ exactly the four attack attempts failed on chain
- observed **net NEAR spent across all accounts (gas and storage)**: `0.00248`
- ✓ the whole experiment cost less than 0.02 NEAR net (measured previously: about 0.002)

### teardown of the chain side: prune the syndicates, compact the indexes, delete the accounts

- ✓ every syndicate was pruned and every account deleted
- ✓ the contract holds exactly as many records as before the run

### teardown: delete the VM and prove the account is empty

- observed **teardown**: `{"deleted":true,"id":"a9cced31cbde341b5b2ce77fb2f94ce151fefdde","seconds":173,"estimatedUsd":0.0028}`
- ✓ the VM was deleted
- ✓ no CVM is left running on the account
- observed **estimated cost (USD)**: `0.0028`
- ✓ the session cost under $0.05

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
