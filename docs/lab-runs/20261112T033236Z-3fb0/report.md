# Lab run 20261112T033236Z-3fb0

- **Code:** `ab13215baf9e0fa03b2d13d922ed6a5ab1fa56ae` on `repin-new-commit-image` (**5 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `5124af593da2edda…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 176 events, hash-chained; root `1e80f6530d606044647fdc664909f9c8d3e0e869fd82f54b3751e6a699788ed1`. Verify with `node lab/verify-run.js lab/runs/20261112T033236Z-3fb0`

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
| preflight: the Phala account is empty and the pins are present | ✓ pass | 3/3 | 1728 ms |
| deploy the Roost on a real TDX VM (capped by a dead-man's switch) | ✓ pass | 4/4 | 55849 ms |
| verify the attestation exactly as a member would | ✓ pass | 14/14 | 3296 ms |
| the Roost's access control holds on the public internet | ✓ pass | 6/6 | 216 ms |
| the keys a member would seal to are the attested keys | ✓ pass | 3/3 | 1 ms |
| create fresh member accounts for this run (three flyers and a recipient) | ✓ pass | 1/1 | 17516 ms |
| preflight: accounts, balances and deployed contract | ✓ pass | 4/4 | 2569 ms |
| hatch a syndicate whose settlement key is the Roost's | ✓ pass | 2/2 | 1693 ms |
| members deposit with explicit consent to the policy hash | ✓ pass | 5/5 | 6400 ms |
| members seal bids; the Roost aggregates them exactly | ✓ pass | 2/2 | 1276 ms |
| ATTACK 1: the Roost refuses to sign more than the sealed bids support | ✓ pass | 1/1 | 217 ms |
| settle on chain with the Roost's signature | ✓ pass | 4/4 | 4171 ms |
| ATTACK 2: replaying the same signed settlement is rejected | ✓ pass | 2/2 | 2398 ms |
| ATTACK 3: a valid Roost signature cannot pay a recipient outside the policy | ✓ pass | 5/5 | 9716 ms |
| ATTACK 4: a settlement signed by a different key is rejected | ✓ pass | 2/2 | 2265 ms |
| cleanup: settle syndicate #2 legitimately with the real Roost | ✓ pass | 2/2 | 3999 ms |
| ATTACK 5: a partial settlement cannot be replayed, and the next round needs a fresh signature | ✓ pass | 11/11 | 13445 ms |
| the Roost stalls: a member takes their own funds back with hatch_out | ✓ pass | 7/7 | 19685 ms |
| ledger: every transaction, and what the experiment cost | ✓ pass | 2/2 | 1010 ms |
| teardown of the chain side: prune the syndicates, compact the indexes, delete the accounts | ✓ pass | 2/2 | 30055 ms |
| teardown: delete the VM and prove the account is empty | ✓ pass | 3/3 | 6493 ms |

### preflight: the Phala account is empty and the pins are present

- ✓ no CVM is already running on the account (so nothing is billing unseen)
- ✓ the compose file is pinned to a CI-built image digest
- ✓ a production OS image hash is pinned
- observed **instance type and rate**: `{"type":"tdx.small","usdPerHour":0.058}`

### deploy the Roost on a real TDX VM (capped by a dead-man's switch)

- note: deploying midge-lab-11120332
- evidence cvm: {"id":"1ff9f2b6b9384d3dc46d9f05ae1956e54f53aefd","url":"https://1ff9f2b6b9384d3dc46d9f05ae1956e54f53aefd-8080.dstack-pha1-prod9.phala.network","deadmanHours":1}
- ✓ the VM answered /healthz
- ✓ the VM was created with public logs off
- ✓ it runs a production (non-dev) OS image
- ✓ it runs the pinned production OS image hash

### verify the attestation exactly as a member would

- observed **verifier image**: `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`
- ✓ Phala's app-compose contains our compose file byte for byte
- observed **attestation**: `{"bytes":12906,"simulated":false}`
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
- evidence attestation: {"composeHash":"620a25cc9310e33bbc2c62c23e66f6e6e223163d4b218354e39456d72058a8d2","osImageHash":"ec43cb8c5e04b6bb6c53b33b16076a01d83d01f7f4b703f2f78a0d947d6247e6","nonce":"77fa269c731075b47b30a4c4508e16e7ab2051c660aa296d…

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

- observed **balances (NEAR)**: `{"fly-1793636729.testnet":"9.7459","hztuota.fly-1793636729.testnet":"0.1482","hztuotb.fly-1793636729.testnet":"0.1482","hztuotc.fly-17936367…`
- note: Measured: a full round costs about 0.002 NEAR net, because unused prepaid gas is refunded. The balance needed is the temporary peak: a deposit (up to 0.03) plus prepaid gas (up to 0.06 at current testnet gas prices).
- ✓ every member has enough testnet NEAR for the peak of this experiment (0.09 each)
- ✓ the master account can pay for hatching (0.1 NEAR)
- observed **deployed code hash**: `BVcq86Wz5Q3kcdBdcUhfQVfQtC6CmGwcXuMd52aW6gTp`
- ✓ the deployed contract is the build expected from the wasm built from this checkout
- observed **contract account storage**: `{"balance":"6.159","bytesUsed":575578,"headroomNear":"0.4032"}`
- ✓ the contract account has at least 0.15 NEAR of storage headroom (each syndicate record costs about 0.01)

### hatch a syndicate whose settlement key is the Roost's

- evidence tx: {"label":"hatch lab-hwmwcztuot-1","hash":"GkjK2nwiJTmUXVQgHyBTCuXWduhtFBwkpnZru5VqkT9j","ok":true,"explorer":"https://testnet.nearblocks.io/txns/GkjK2nwiJTmUXVQgHyBTCuXWduhtFBwkpnZru5VqkT9j","gasTGas":2.829738310271,"err…
- ✓ hatch succeeded on chain
- observed **syndicate state**: `{"status":"Active","epoch":1,"flyers":0}`
- ✓ the syndicate is active

### members deposit with explicit consent to the policy hash

- evidence tx: {"label":"deposit hztuota.fly-1793636729.testnet -> lab-hwmwcztuot-1","hash":"GJxFm3F1cnvEVibVkharMZKGmovhCpPAHgDMVy7iXrVE","ok":true,"explorer":"https://testnet.nearblocks.io/txns/GJxFm3F1cnvEVibVkharMZKGmovhCpPAHgDMVy7…
- ✓ hztuota.fly-1793636729.testnet deposited 0.02 NEAR
- evidence tx: {"label":"deposit hztuotb.fly-1793636729.testnet -> lab-hwmwcztuot-1","hash":"7jKMuUVYuNCNttoPr4CkUrW4mHW1ABXaK5X8iv9zTDpB","ok":true,"explorer":"https://testnet.nearblocks.io/txns/7jKMuUVYuNCNttoPr4CkUrW4mHW1ABXaK5X8iv9…
- ✓ hztuotb.fly-1793636729.testnet deposited 0.02 NEAR
- evidence tx: {"label":"deposit hztuotc.fly-1793636729.testnet -> lab-hwmwcztuot-1","hash":"FLPZuC4wBxjF9RYQjVhYUwD72LJ24acB5iM7N48tMd4Y","ok":true,"explorer":"https://testnet.nearblocks.io/txns/FLPZuC4wBxjF9RYQjVhYUwD72LJ24acB5iM7N48…
- ✓ hztuotc.fly-1793636729.testnet deposited 0.02 NEAR
- ✓ escrow equals the three deposits exactly
- ✓ three active flyers

### members seal bids; the Roost aggregates them exactly

- observed **aggregate**: `{"totalInputAmount":"0.06","flyerCount":3,"excludedFlyers":[],"executionModel":"HOSTED_EXACT_BATCH","confidentiality":"tee-hosted","timestam…`
- ✓ the total is exactly 0.06
- ✓ three bids counted and none excluded

### ATTACK 1: the Roost refuses to sign more than the sealed bids support

- ✓ over-allocation is refused by the Roost

### settle on chain with the Roost's signature

- evidence tx: {"label":"settle_batch lab-hwmwcztuot-1","hash":"BdBoT8HUrFicZptJ5EDjMBVhtnD4ZSdC3SDJexUWGgxd","ok":true,"explorer":"https://testnet.nearblocks.io/txns/BdBoT8HUrFicZptJ5EDjMBVhtnD4ZSdC3SDJexUWGgxd","gasTGas":7.4804659470…
- ✓ settle_batch succeeded
- observed **recipient balance change (NEAR)**: `0.06`
- ✓ the syndicate is Settled
- ✓ the recipient received exactly the escrow
- ✓ the escrow is empty

### ATTACK 2: replaying the same signed settlement is rejected

- evidence tx: {"label":"REPLAY settle_batch lab-hwmwcztuot-1","hash":"85gCfXWGn9jRYsVso8SZcSFpXtfhsa9DygN4MTMMjLrC","ok":false,"explorer":"https://testnet.nearblocks.io/txns/85gCfXWGn9jRYsVso8SZcSFpXtfhsa9DygN4MTMMjLrC","gasTGas":0,"e…
- observed **contract answer**: `Smart contract panicked: panicked at src/lib.rs:964:9:
assertion `left == right` failed: [HAQ REJECT] Syndicate is not active.
  left: Settl…`
- ✓ the replay failed
- ✓ the recipient balance did not change

### ATTACK 3: a valid Roost signature cannot pay a recipient outside the policy

- evidence tx: {"label":"hatch lab-hwmwcztuot-2","hash":"7bjdESuUdv9wTN3C37jGyEPxxRHhDXkfM1r2iYU8QTCs","ok":true,"explorer":"https://testnet.nearblocks.io/txns/7bjdESuUdv9wTN3C37jGyEPxxRHhDXkfM1r2iYU8QTCs","gasTGas":2.839610140179,"err…
- ✓ hatch #2 succeeded
- evidence tx: {"label":"deposit hztuota.fly-1793636729.testnet -> lab-hwmwcztuot-2","hash":"5yVCtV14GtD3y1VdB7hXXM57USHPiDYdj3sWUAZmovdL","ok":true,"explorer":"https://testnet.nearblocks.io/txns/5yVCtV14GtD3y1VdB7hXXM57USHPiDYdj3sWUAZ…
- ✓ hztuota.fly-1793636729.testnet deposited 0.02
- evidence tx: {"label":"deposit hztuotb.fly-1793636729.testnet -> lab-hwmwcztuot-2","hash":"4QATTHfaCGUvjPyMfR77yDEYFn9qhU7K7ADUcd37peyi","ok":true,"explorer":"https://testnet.nearblocks.io/txns/4QATTHfaCGUvjPyMfR77yDEYFn9qhU7K7ADUcd3…
- ✓ hztuotb.fly-1793636729.testnet deposited 0.02
- evidence tx: {"label":"settle_batch lab-hwmwcztuot-2","hash":"CepecyPhzVCTQmkEjWbXpc6j6EFSBuPQ1KHk3rtyEupt","ok":false,"explorer":"https://testnet.nearblocks.io/txns/CepecyPhzVCTQmkEjWbXpc6j6EFSBuPQ1KHk3rtyEupt","gasTGas":0,"error":"…
- observed **contract answer**: `Smart contract panicked: panicked at src/lib.rs:1023:13:
[Settle REJECT] Recipient thief-hwmwcztuot.testnet is not in allowed_recipients whi…`
- ✓ the contract rejected a payout to an unapproved recipient
- ✓ the syndicate is still active with the escrow intact

### ATTACK 4: a settlement signed by a different key is rejected

- evidence tx: {"label":"settle_batch lab-hwmwcztuot-2","hash":"4Kxas9mpqJVtoT5U44Up9WZALkSsurfMLXbZ4pCGUGJy","ok":false,"explorer":"https://testnet.nearblocks.io/txns/4Kxas9mpqJVtoT5U44Up9WZALkSsurfMLXbZ4pCGUGJy","gasTGas":0,"error":"…
- observed **contract answer**: `Smart contract panicked: panicked at src/lib.rs:1156:17:
[HAQ REJECT] Invalid enclave Ed25519 signature over deliberation batch!`
- ✓ the contract rejected a signature from a key it was not hatched with
- ✓ nothing moved

### cleanup: settle syndicate #2 legitimately with the real Roost

- evidence tx: {"label":"settle_batch lab-hwmwcztuot-2","hash":"Eg2hqVgoDjhZjQGzib7KY8dqFv9Sye4j6CD7jfb6KS8R","ok":true,"explorer":"https://testnet.nearblocks.io/txns/Eg2hqVgoDjhZjQGzib7KY8dqFv9Sye4j6CD7jfb6KS8R","gasTGas":7.2788632303…
- ✓ the legitimate settlement succeeded after the failed attacks
- ✓ syndicate #2 is Settled

### ATTACK 5: a partial settlement cannot be replayed, and the next round needs a fresh signature

- evidence tx: {"label":"hatch lab-hwmwcztuot-4","hash":"3USBndGmJviQw5Lbc2mhtCxHL7Zha17RoDADTYM9ahZD","ok":true,"explorer":"https://testnet.nearblocks.io/txns/3USBndGmJviQw5Lbc2mhtCxHL7Zha17RoDADTYM9ahZD","gasTGas":2.840788157695,"err…
- ✓ hatch #4 succeeded
- evidence tx: {"label":"deposit hztuota.fly-1793636729.testnet -> lab-hwmwcztuot-4","hash":"DNRCJvq19YeBnZXVh6zUzrVyRrwQXP8Jx2ENnESeT6ij","ok":true,"explorer":"https://testnet.nearblocks.io/txns/DNRCJvq19YeBnZXVh6zUzrVyRrwQXP8Jx2ENnES…
- ✓ f1 deposited 0.03
- evidence tx: {"label":"settle_batch lab-hwmwcztuot-4","hash":"G62NY6rkhCh2vBD39VB8Fj6vixZjftHvWoTHP1vbfpDa","ok":true,"explorer":"https://testnet.nearblocks.io/txns/G62NY6rkhCh2vBD39VB8Fj6vixZjftHvWoTHP1vbfpDa","gasTGas":7.1319492381…
- ✓ the partial settlement (0.01 of 0.03) succeeded
- ✓ 0.02 is left and the syndicate is still active
- ✓ the round nonce rotated after the partial settlement
- ✓ it is still epoch 1 (a Flash syndicate does not start new epochs)
- evidence tx: {"label":"REPLAY settle_batch lab-hwmwcztuot-4 (partial)","hash":"bhFL95Zo6C5fanBnw6EiXWG7zubqKXoF1TwTjB3vixB","ok":false,"explorer":"https://testnet.nearblocks.io/txns/bhFL95Zo6C5fanBnw6EiXWG7zubqKXoF1TwTjB3vixB","gasTG…
- observed **contract answer**: `Smart contract panicked: panicked at src/lib.rs:991:9:
assertion `left == right` failed: [HAQ REJECT] Nonce mismatch. Replay attack blocked.…`
- ✓ the replay of the partial settlement failed
- ✓ the escrow is unchanged by the replay
- ✓ the recipient received nothing from the replay
- evidence tx: {"label":"settle_batch lab-hwmwcztuot-4","hash":"E2jFhXGFBNjLqvREa9R1Ld1VW7TZAigjQiFtDuWDgbup","ok":true,"explorer":"https://testnet.nearblocks.io/txns/E2jFhXGFBNjLqvREa9R1Ld1VW7TZAigjQiFtDuWDgbup","gasTGas":7.1053626062…
- ✓ a fresh signature on the new nonce settles the rest
- ✓ syndicate #4 is Settled with no escrow left

### the Roost stalls: a member takes their own funds back with hatch_out

- evidence tx: {"label":"hatch lab-hwmwcztuot-3","hash":"2zQjqxUyoN5kwoSrw9UnFBg7ZXk2jgPFjnxH6mys2dQx","ok":true,"explorer":"https://testnet.nearblocks.io/txns/2zQjqxUyoN5kwoSrw9UnFBg7ZXk2jgPFjnxH6mys2dQx","gasTGas":2.846039103659,"err…
- ✓ hatch #3 (timeout 10 blocks, the floor) succeeded
- evidence tx: {"label":"deposit hztuotb.fly-1793636729.testnet -> lab-hwmwcztuot-3","hash":"9ExSnLV5fZ8Z4xYE1ZwWoYbrsWCxMJCUGgzLDFBMkAe4","ok":true,"explorer":"https://testnet.nearblocks.io/txns/9ExSnLV5fZ8Z4xYE1ZwWoYbrsWCxMJCUGgzLDFB…
- ✓ f2 deposited 0.03
- evidence tx: {"label":"hatch_out lab-hwmwcztuot-3","hash":"BCcko2KYW6KkXg4UrNPRgGHyT8UyeJUoeVy4o6KR7Avz","ok":true,"explorer":"https://testnet.nearblocks.io/txns/BCcko2KYW6KkXg4UrNPRgGHyT8UyeJUoeVy4o6KR7Avz","gasTGas":5.632299428521,…
- ✓ hatch_out succeeded without any operator or enclave signature
- ✓ the escrow is empty and the syndicate is aborted/refunded
- observed **transfers made by the contract in this transaction**: `[{"to":"hztuotb.fly-1793636729.testnet","near":"0.03"}]`
- observed **transfers made by the system (gas refunds, not the contract)**: `["0.000201","0.002648"]`
- ✓ the contract made exactly one transfer
- ✓ it went to the member who called hatch_out
- ✓ and it was exactly the 0.03 NEAR they deposited (no more, no less)
- note: Balance deltas were rejected as evidence here: gas refunds from earlier transactions land after a reading is taken and made a correct refund look like a double payment. The receipts above are authoritative.

### ledger: every transaction, and what the experiment cost

- observed **transactions sent**: `20`
- observed **transactions that failed (expected: the 3 attack attempts)**: `["REPLAY settle_batch lab-hwmwcztuot-1","settle_batch lab-hwmwcztuot-2","settle_batch lab-hwmwcztuot-2","REPLAY settle_batch lab-hwmwcztuot-…`
- ✓ exactly the four attack attempts failed on chain
- observed **net NEAR spent across all accounts (gas and storage)**: `0.00248`
- ✓ the whole experiment cost less than 0.02 NEAR net (measured previously: about 0.002)

### teardown of the chain side: prune the syndicates, compact the indexes, delete the accounts

- ✓ every syndicate was pruned and every account deleted
- ✓ the contract holds exactly as many records as before the run

### teardown: delete the VM and prove the account is empty

- observed **teardown**: `{"deleted":true,"id":"1ff9f2b6b9384d3dc46d9f05ae1956e54f53aefd","seconds":180,"estimatedUsd":0.0029}`
- ✓ the VM was deleted
- ✓ no CVM is left running on the account
- observed **estimated cost (USD)**: `0.0029`
- ✓ the session cost under $0.05

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
