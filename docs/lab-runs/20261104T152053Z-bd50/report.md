# Lab run 20261104T152053Z-bd50

- **Code:** `c4abc28650639b199c68050b466b0e024bf09c6f` on `master` (clean tree)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `8a0180ff698c44b5…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 176 events, hash-chained; root `bddfb87a8018e5b3e951e9434d63a5fc3cdec399ad4917ab5046e5436ca578e9`. Verify with `node lab/verify-run.js lab/runs/20261104T152053Z-bd50`

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
| preflight: the Phala account is empty and the pins are present | ✓ pass | 3/3 | 5379 ms |
| deploy the Roost on a real TDX VM (capped by a dead-man's switch) | ✓ pass | 4/4 | 52154 ms |
| verify the attestation exactly as a member would | ✓ pass | 14/14 | 3129 ms |
| the Roost's access control holds on the public internet | ✓ pass | 6/6 | 203 ms |
| the keys a member would seal to are the attested keys | ✓ pass | 3/3 | 1 ms |
| create fresh member accounts for this run (three flyers and a recipient) | ✓ pass | 1/1 | 10404 ms |
| preflight: accounts, balances and deployed contract | ✓ pass | 4/4 | 2482 ms |
| hatch a syndicate whose settlement key is the Roost's | ✓ pass | 2/2 | 3333 ms |
| members deposit with explicit consent to the policy hash | ✓ pass | 5/5 | 6745 ms |
| members seal bids; the Roost aggregates them exactly | ✓ pass | 2/2 | 312 ms |
| ATTACK 1: the Roost refuses to sign more than the sealed bids support | ✓ pass | 1/1 | 233 ms |
| settle on chain with the Roost's signature | ✓ pass | 4/4 | 3877 ms |
| ATTACK 2: replaying the same signed settlement is rejected | ✓ pass | 2/2 | 2091 ms |
| ATTACK 3: a valid Roost signature cannot pay a recipient outside the policy | ✓ pass | 5/5 | 9836 ms |
| ATTACK 4: a settlement signed by a different key is rejected | ✓ pass | 2/2 | 2202 ms |
| cleanup: settle syndicate #2 legitimately with the real Roost | ✓ pass | 2/2 | 3614 ms |
| ATTACK 5: a partial settlement cannot be replayed, and the next round needs a fresh signature | ✓ pass | 11/11 | 13351 ms |
| the Roost stalls: a member takes their own funds back with hatch_out | ✓ pass | 7/7 | 17901 ms |
| ledger: every transaction, and what the experiment cost | ✓ pass | 2/2 | 1106 ms |
| teardown of the chain side: prune the syndicates, compact the indexes, delete the accounts | ✓ pass | 2/2 | 28541 ms |
| teardown: delete the VM and prove the account is empty | ✓ pass | 3/3 | 7415 ms |

### preflight: the Phala account is empty and the pins are present

- ✓ no CVM is already running on the account (so nothing is billing unseen)
- ✓ the compose file is pinned to a CI-built image digest
- ✓ a production OS image hash is pinned
- observed **instance type and rate**: `{"type":"tdx.small","usdPerHour":0.058}`

### deploy the Roost on a real TDX VM (capped by a dead-man's switch)

- note: deploying midge-lab-11041520
- evidence cvm: {"id":"a62839456ab1ae55e08de4f1ec34fc1584808930","url":"https://a62839456ab1ae55e08de4f1ec34fc1584808930-8080.dstack-pha-prod5.phala.network","deadmanHours":1}
- ✓ the VM answered /healthz
- ✓ the VM was created with public logs off
- ✓ it runs a production (non-dev) OS image
- ✓ it runs the pinned production OS image hash

### verify the attestation exactly as a member would

- observed **verifier image**: `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`
- ✓ Phala's app-compose contains our compose file byte for byte
- observed **attestation**: `{"bytes":12942,"simulated":false}`
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
- evidence attestation: {"composeHash":"8a0180ff698c44b5e743acca369fbfe9f309fbf084cf87415f6962fb8e1be6c8","osImageHash":"ec43cb8c5e04b6bb6c53b33b16076a01d83d01f7f4b703f2f78a0d947d6247e6","nonce":"08df9f4c1ec5585391b648a2366d68a063c0bd21dbd1bf0a…

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

- observed **balances (NEAR)**: `{"fly-1793636729.testnet":"18.4378","h9lw3wa.fly-1793636729.testnet":"0.1482","h9lw3wb.fly-1793636729.testnet":"0.1482","h9lw3wc.fly-1793636…`
- note: Measured: a full round costs about 0.002 NEAR net, because unused prepaid gas is refunded. The balance needed is the temporary peak: a deposit (up to 0.03) plus prepaid gas (up to 0.06 at current testnet gas prices).
- ✓ every member has enough testnet NEAR for the peak of this experiment (0.09 each)
- ✓ the master account can pay for hatching (0.1 NEAR)
- observed **deployed code hash**: `Gh8NAA2e78ETMMAWvExPnYfuKtRe2wQT2FHJ2RRXcPR9`
- ✓ the deployed contract is the build expected from the wasm built from this checkout
- observed **contract account storage**: `{"balance":"5.0467","bytesUsed":335726,"headroomNear":"1.6894"}`
- ✓ the contract account has at least 0.15 NEAR of storage headroom (each syndicate record costs about 0.01)

### hatch a syndicate whose settlement key is the Roost's

- evidence tx: {"label":"hatch lab-hwmw29lw3w-1","hash":"9miZ6fe71m4ecPeXc54QqA3Tnk48uaDH3ZFTke9LEnVd","ok":true,"explorer":"https://testnet.nearblocks.io/txns/9miZ6fe71m4ecPeXc54QqA3Tnk48uaDH3ZFTke9LEnVd","gasTGas":2.519145095908,"err…
- ✓ hatch succeeded on chain
- observed **syndicate state**: `{"status":"Active","epoch":1,"flyers":0}`
- ✓ the syndicate is active

### members deposit with explicit consent to the policy hash

- evidence tx: {"label":"deposit h9lw3wa.fly-1793636729.testnet -> lab-hwmw29lw3w-1","hash":"BoswCbmTA7rfHivzMV9VCj1fFxEbH2HzTbuwdXsDqM9","ok":true,"explorer":"https://testnet.nearblocks.io/txns/BoswCbmTA7rfHivzMV9VCj1fFxEbH2HzTbuwdXsD…
- ✓ h9lw3wa.fly-1793636729.testnet deposited 0.02 NEAR
- evidence tx: {"label":"deposit h9lw3wb.fly-1793636729.testnet -> lab-hwmw29lw3w-1","hash":"7yL2jnXoJgzpkhEQ9n82yYFufUb6iRbSgc8Gy4JATiXg","ok":true,"explorer":"https://testnet.nearblocks.io/txns/7yL2jnXoJgzpkhEQ9n82yYFufUb6iRbSgc8Gy4J…
- ✓ h9lw3wb.fly-1793636729.testnet deposited 0.02 NEAR
- evidence tx: {"label":"deposit h9lw3wc.fly-1793636729.testnet -> lab-hwmw29lw3w-1","hash":"B34deqoypMiXxctV45CgmYQfo98iN67PAjKHuGnrNXgp","ok":true,"explorer":"https://testnet.nearblocks.io/txns/B34deqoypMiXxctV45CgmYQfo98iN67PAjKHuGn…
- ✓ h9lw3wc.fly-1793636729.testnet deposited 0.02 NEAR
- ✓ escrow equals the three deposits exactly
- ✓ three active flyers

### members seal bids; the Roost aggregates them exactly

- observed **aggregate**: `{"totalInputAmount":"0.06","flyerCount":3,"excludedFlyers":[],"executionModel":"HOSTED_EXACT_BATCH","confidentiality":"tee-hosted","timestam…`
- ✓ the total is exactly 0.06
- ✓ three bids counted and none excluded

### ATTACK 1: the Roost refuses to sign more than the sealed bids support

- ✓ over-allocation is refused by the Roost

### settle on chain with the Roost's signature

- evidence tx: {"label":"settle_batch lab-hwmw29lw3w-1","hash":"CxwFySUJUjjGua69B7iQ21J9c357C5oGQB8wfwKp9nwr","ok":true,"explorer":"https://testnet.nearblocks.io/txns/CxwFySUJUjjGua69B7iQ21J9c357C5oGQB8wfwKp9nwr","gasTGas":6.1533471896…
- ✓ settle_batch succeeded
- observed **recipient balance change (NEAR)**: `0.06`
- ✓ the syndicate is Settled
- ✓ the recipient received exactly the escrow
- ✓ the escrow is empty

### ATTACK 2: replaying the same signed settlement is rejected

- evidence tx: {"label":"REPLAY settle_batch lab-hwmw29lw3w-1","hash":null,"ok":false,"explorer":null,"gasTGas":0,"error":"Smart contract panicked: panicked at src/lib.rs:505:9:\nassertion `left == right` failed: [HAQ REJECT] Syndicate…
- observed **contract answer**: `Smart contract panicked: panicked at src/lib.rs:505:9:
assertion `left == right` failed: [HAQ REJECT] Syndicate is not active.
  left: Settl…`
- ✓ the replay failed
- ✓ the recipient balance did not change

### ATTACK 3: a valid Roost signature cannot pay a recipient outside the policy

- evidence tx: {"label":"hatch lab-hwmw29lw3w-2","hash":"55Yn6XNTNjPzxvqLsz2HrfViUHF15W3NhkzT38oF4vN5","ok":true,"explorer":"https://testnet.nearblocks.io/txns/55Yn6XNTNjPzxvqLsz2HrfViUHF15W3NhkzT38oF4vN5","gasTGas":2.522236987004,"err…
- ✓ hatch #2 succeeded
- evidence tx: {"label":"deposit h9lw3wa.fly-1793636729.testnet -> lab-hwmw29lw3w-2","hash":"43YwoX5V8fAmf5jxSkKdhEQoCXkK9TGV61pKeMZTj996","ok":true,"explorer":"https://testnet.nearblocks.io/txns/43YwoX5V8fAmf5jxSkKdhEQoCXkK9TGV61pKeMZ…
- ✓ h9lw3wa.fly-1793636729.testnet deposited 0.02
- evidence tx: {"label":"deposit h9lw3wb.fly-1793636729.testnet -> lab-hwmw29lw3w-2","hash":"3pMdRG2p73NotiszkwgpdAoRK6gVtfTacLzQ19ut1ho1","ok":true,"explorer":"https://testnet.nearblocks.io/txns/3pMdRG2p73NotiszkwgpdAoRK6gVtfTacLzQ19u…
- ✓ h9lw3wb.fly-1793636729.testnet deposited 0.02
- evidence tx: {"label":"settle_batch lab-hwmw29lw3w-2","hash":null,"ok":false,"explorer":null,"gasTGas":0,"error":"Smart contract panicked: panicked at src/lib.rs:557:13:\n[Settle REJECT] Recipient thief-hwmw29lw3w.testnet is not in a…
- observed **contract answer**: `Smart contract panicked: panicked at src/lib.rs:557:13:
[Settle REJECT] Recipient thief-hwmw29lw3w.testnet is not in allowed_recipients whit…`
- ✓ the contract rejected a payout to an unapproved recipient
- ✓ the syndicate is still active with the escrow intact

### ATTACK 4: a settlement signed by a different key is rejected

- evidence tx: {"label":"settle_batch lab-hwmw29lw3w-2","hash":null,"ok":false,"explorer":null,"gasTGas":0,"error":"Smart contract panicked: panicked at src/lib.rs:615:9:\n[HAQ REJECT] Invalid enclave Ed25519 signature over deliberatio…
- observed **contract answer**: `Smart contract panicked: panicked at src/lib.rs:615:9:
[HAQ REJECT] Invalid enclave Ed25519 signature over deliberation batch!`
- ✓ the contract rejected a signature from a key it was not hatched with
- ✓ nothing moved

### cleanup: settle syndicate #2 legitimately with the real Roost

- evidence tx: {"label":"settle_batch lab-hwmw29lw3w-2","hash":"Gd336y6CCcqz9vs1TmuQCLhQnE5sqsAiteAxTCd2zYx7","ok":true,"explorer":"https://testnet.nearblocks.io/txns/Gd336y6CCcqz9vs1TmuQCLhQnE5sqsAiteAxTCd2zYx7","gasTGas":5.9564237726…
- ✓ the legitimate settlement succeeded after the failed attacks
- ✓ syndicate #2 is Settled

### ATTACK 5: a partial settlement cannot be replayed, and the next round needs a fresh signature

- evidence tx: {"label":"hatch lab-hwmw29lw3w-4","hash":"J7TDnE1R7FTdjxz2k1MkhBtKT5iy7sqmekAKyQaiwxcK","ok":true,"explorer":"https://testnet.nearblocks.io/txns/J7TDnE1R7FTdjxz2k1MkhBtKT5iy7sqmekAKyQaiwxcK","gasTGas":2.525511529932,"err…
- ✓ hatch #4 succeeded
- evidence tx: {"label":"deposit h9lw3wa.fly-1793636729.testnet -> lab-hwmw29lw3w-4","hash":"A4r7q1ypEhBi3ESFUczNyi4Zbu3wjptfFT71hSn6Wo8W","ok":true,"explorer":"https://testnet.nearblocks.io/txns/A4r7q1ypEhBi3ESFUczNyi4Zbu3wjptfFT71hSn…
- ✓ f1 deposited 0.03
- evidence tx: {"label":"settle_batch lab-hwmw29lw3w-4","hash":"2fpVrTYjXZnDGQfzwKttJ4ADTEeE7zXZTuCF1FYHwmKV","ok":true,"explorer":"https://testnet.nearblocks.io/txns/2fpVrTYjXZnDGQfzwKttJ4ADTEeE7zXZTuCF1FYHwmKV","gasTGas":5.8001637015…
- ✓ the partial settlement (0.01 of 0.03) succeeded
- ✓ 0.02 is left and the syndicate is still active
- ✓ the round nonce rotated after the partial settlement
- ✓ it is still epoch 1 (a Flash syndicate does not start new epochs)
- evidence tx: {"label":"REPLAY settle_batch lab-hwmw29lw3w-4 (partial)","hash":null,"ok":false,"explorer":null,"gasTGas":0,"error":"Smart contract panicked: panicked at src/lib.rs:525:9:\nassertion `left == right` failed: [HAQ REJECT]…
- observed **contract answer**: `Smart contract panicked: panicked at src/lib.rs:525:9:
assertion `left == right` failed: [HAQ REJECT] Nonce mismatch. Replay attack blocked.…`
- ✓ the replay of the partial settlement failed
- ✓ the escrow is unchanged by the replay
- ✓ the recipient received nothing from the replay
- evidence tx: {"label":"settle_batch lab-hwmw29lw3w-4","hash":"GS43RCxLzESD3sXzbo7Sf8HnHqB4QDq1e3Lx11vdiGnU","ok":true,"explorer":"https://testnet.nearblocks.io/txns/GS43RCxLzESD3sXzbo7Sf8HnHqB4QDq1e3Lx11vdiGnU","gasTGas":5.7708930888…
- ✓ a fresh signature on the new nonce settles the rest
- ✓ syndicate #4 is Settled with no escrow left

### the Roost stalls: a member takes their own funds back with hatch_out

- evidence tx: {"label":"hatch lab-hwmw29lw3w-3","hash":"7wzVbKNLXucH5QJ81E9pgG8apFWr13AcYvvcVcS2m85K","ok":true,"explorer":"https://testnet.nearblocks.io/txns/7wzVbKNLXucH5QJ81E9pgG8apFWr13AcYvvcVcS2m85K","gasTGas":2.530384071635,"err…
- ✓ hatch #3 (timeout 2 blocks) succeeded
- evidence tx: {"label":"deposit h9lw3wb.fly-1793636729.testnet -> lab-hwmw29lw3w-3","hash":"BH4GvgffGmTKdqFQBUu4VQ4DfHzuuB8A6sKbAgWz4t5p","ok":true,"explorer":"https://testnet.nearblocks.io/txns/BH4GvgffGmTKdqFQBUu4VQ4DfHzuuB8A6sKbAgW…
- ✓ f2 deposited 0.03
- evidence tx: {"label":"hatch_out lab-hwmw29lw3w-3","hash":"8eQMAuKc8XJgSfnEbtGdu8pJsgaT3fNno61om4GLWUkN","ok":true,"explorer":"https://testnet.nearblocks.io/txns/8eQMAuKc8XJgSfnEbtGdu8pJsgaT3fNno61om4GLWUkN","gasTGas":5.125502610075,…
- ✓ hatch_out succeeded without any operator or enclave signature
- ✓ the escrow is empty and the syndicate is aborted/refunded
- observed **transfers made by the contract in this transaction**: `[{"to":"h9lw3wb.fly-1793636729.testnet","near":"0.03"}]`
- observed **transfers made by the system (gas refunds, not the contract)**: `["0.000201","0.00239"]`
- ✓ the contract made exactly one transfer
- ✓ it went to the member who called hatch_out
- ✓ and it was exactly the 0.03 NEAR they deposited (no more, no less)
- note: Balance deltas were rejected as evidence here: gas refunds from earlier transactions land after a reading is taken and made a correct refund look like a double payment. The receipts above are authoritative.

### ledger: every transaction, and what the experiment cost

- observed **transactions sent**: `20`
- observed **transactions that failed (expected: the 3 attack attempts)**: `["REPLAY settle_batch lab-hwmw29lw3w-1","settle_batch lab-hwmw29lw3w-2","settle_batch lab-hwmw29lw3w-2","REPLAY settle_batch lab-hwmw29lw3w-…`
- ✓ exactly the four attack attempts failed on chain
- observed **net NEAR spent across all accounts (gas and storage)**: `0.00173`
- ✓ the whole experiment cost less than 0.02 NEAR net (measured previously: about 0.002)

### teardown of the chain side: prune the syndicates, compact the indexes, delete the accounts

- ✓ every syndicate was pruned and every account deleted
- ✓ the contract holds exactly as many records as before the run

### teardown: delete the VM and prove the account is empty

- observed **teardown**: `{"deleted":true,"id":"a62839456ab1ae55e08de4f1ec34fc1584808930","seconds":166,"estimatedUsd":0.0027}`
- ✓ the VM was deleted
- ✓ no CVM is left running on the account
- observed **estimated cost (USD)**: `0.0027`
- ✓ the session cost under $0.05

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
