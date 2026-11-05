# Lab run 20261105T033904Z-0c2a

- **Code:** `4514a5d2ff9174a85a37f5d486b2b4f24986ce7a` on `master` (**2 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `8a0180ff698c44b5…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 79 events, hash-chained; root `448dc98eb7715011b71c0811458509c53e735c2028cc34285bce90b3322b08c5`. Verify with `node lab/verify-run.js lab/runs/20261105T033904Z-0c2a`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-CMP-INVEST-01 Investing together on testnet: a public round, a trusted organizer and Midge, same chain and same members | testnet | **FAIL** | 9 | 39 (4 failed) |  |

## E-CMP-INVEST-01: Investing together on testnet: a public round, a trusted organizer and Midge, same chain and same members

**Hypothesis.** Four backers invest private amounts (0.01, 0.02, 0.03, 0.04 NEAR) into one recipient. Public: an observer reading only public chain data recovers every amount. Organizer: the same, and the organizer can take the pot while members cannot get it back. Midge with deposits equal to bids: the observer also recovers every amount, because deposits are public. Midge with a common deposit: the observer recovers none, no one can take the pot or pay outside the policy, and each member recovers their own remainder alone. Fails if an observer recovers any individual bid from the common-deposit round, if any theft attempt under Midge succeeds, or if a member cannot recover their remainder. Also measured: gas, wall time, and who funds a payout (the contract deducts it pro-rata by deposit).

**What this does not prove**
- One operator controls every account in every path (four backers, an organizer, a recipient, the coordinator). This shows behaviour, not independent users.
- The Roost here is a local HostedRoost with a simulated attestation provider; the hardware room is E-HOSTED-LIVE-01 and E-COMBINED-LIVE-01. Speed under Midge therefore excludes the machine start-up and attestation (about a minute on Phala).
- The "public" path is plain transfers to the recipient: there is no shared pool contract. It is the simplest honest baseline, not the strongest public design (a commit-reveal contract would leak less).
- The observer reads only public chain data (the receipts of the transactions an explorer would list for the target account, and the contract's public views). It does not model an attacker who also controls the Roost or sees network traffic.
- Amounts are tiny testnet NEAR. The gas figures are gas burnt, read from receipts, not a price.
- Not run here: other privacy systems (compared from their documentation), a multisig baseline, shared AI compute.

| Step | Result | Assertions | Time |
|---|---|---|---|
| set up: four backers, a recipient and an organizer, fresh accounts | ✓ pass | 1/1 | 16773 ms |
| P · public: each backer pays the recipient directly; an observer reads the public receipts | ✓ pass | 1/1 | 9839 ms |
| O · organizer: backers pay one account, the organizer forwards the total; the observer reads the public receipts | ✓ pass | 2/2 | 13375 ms |
| O · theft and vanish: members cannot get the pot back, the organizer can take it | ✓ pass | 3/3 | 10915 ms |
| M-naive · Midge, each backer deposits exactly their bid: the observer reads the public escrows | ✓ pass | 8/8 | 14798 ms |
| M-common · Midge, everyone deposits 0.05 and bids inside it: what the observer reads, then theft attempts, then settlement | ✗ fail | 12/13 | 17538 ms |
| M-common · the room is gone: each member exits alone with their remainder; who funded the payout | ✗ fail | 4/7 | 13535 ms |
| the comparison, read from the measurements above | ✓ pass | 2/2 | 1 ms |
| teardown: prune the syndicates, compact, delete the accounts | ✓ pass | 2/2 | 36883 ms |

### set up: four backers, a recipient and an organizer, fresh accounts

- ✓ six accounts exist

### P · public: each backer pays the recipient directly; an observer reads the public receipts

- observed **what the observer read**: `{"izxw34a.fly-1793636729.testnet":"0.01","izxw34b.fly-1793636729.testnet":"0.02","izxw34c.fly-1793636729.testnet":"0.03","izxw34d.fly-179363…`
- ✓ prediction 1: the observer recovers all four amounts from the public transfers
- evidence P: {"txs":["EiWTQzX3Rqc1N9TfWTMBDZHDHY4gpe87EsVpGxD39DB4","6TwRZQyXidYzr2m97uLe8aNLSeQEatiiE2jcQ7wPeJzY","CHbuSdcZRwzc88CFzizQC81d7LRi7kVCQcKUFq82Pr1i","GDhKueZV9dJaVtTeqmgaAFa6pKLfewr82oKugL5ffDj8"],"recovered":4,"of":4,"g…

### O · organizer: backers pay one account, the organizer forwards the total; the observer reads the public receipts

- ✓ prediction 2: the observer recovers all four amounts sent to the organizer
- ✓ the organizer forwarded exactly 0.10 to the recipient
- evidence O: {"txs":["9QMmwPcWHkEVjAvpLKagGsyun9svdBHsh1rMNLUADUox","3yygXrhjjdq7vV6zcGU3bkRRRBiZ8r5RtiYCUhCkNd1s","DXM7tspgqgdurL7SVBkq4XyayMnhJ8Cziy3iAKfrav1e","CJj6kK68yZnwknK2MWo8JfUULf3uWzXy5uKx6DFk1Nad"],"forward":"Bb6wfS3wvyGX…

### O · theft and vanish: members cannot get the pot back, the organizer can take it

- ✓ prediction 6 (organizer): a backer cannot pull money out of the organizer's account
- ✓ the organizer's balance is unchanged by the failed attempt
- ✓ prediction 5 (organizer): the organizer can send the 0.04 pot to an account of its own choosing; nothing stops it

### M-naive · Midge, each backer deposits exactly their bid: the observer reads the public escrows

- ✓ hatch
- ✓ a deposits 0.01
- ✓ b deposits 0.02
- ✓ c deposits 0.03
- ✓ d deposits 0.04
- ✓ settle_batch succeeded
- ✓ the recipient received exactly 0.10
- ✓ prediction 3: with deposits equal to bids, the observer recovers all four bids from the public escrows, sealing adds nothing
- evidence M-naive: {"syndicate":"cmp-mw2zxw34-n","settle":"GZw58XT9RfKfRUmBxMRk9pbjtEcU3MouQTDV1kAMAJK","recovered":4,"of":4,"gasTGas":16.4,"perMemberTGas":4.1,"wallMs":14771}

### M-common · Midge, everyone deposits 0.05 and bids inside it: what the observer reads, then theft attempts, then settlement

- ✓ hatch
- ✓ a deposits 0.05
- ✓ b deposits 0.05
- ✓ c deposits 0.05
- ✓ d deposits 0.05
- observed **what the observer reads: every escrow**: `{"izxw34a.fly-1793636729.testnet":"0.05","izxw34b.fly-1793636729.testnet":"0.05","izxw34c.fly-1793636729.testnet":"0.05","izxw34d.fly-179363…`
- ✓ every escrow is the same, so the escrows say nothing about who bid what
- ✓ prediction 4: the observer's best guess (the common deposit, or the total divided by four) matches none of the four bids
- ✗ the Roost totals the sealed bids to exactly 0.10 although 0.20 is deposited — expected , got {"totalInputAmount":"0.1","flyerCount":4,"excludedFlyers":[],"executionModel":"HOSTED_EXACT_BATCH","confidentiality":"simulated","timestamp":1793850022938}
- ✓ prediction 5 (Roost): asked to pay the whole 0.20 deposit against a 0.10 sealed total, the Roost refuses to sign
- evidence tx: {"label":"OUTSIDE-POLICY settle cmp-mw2zxw34-c","hash":"8QZd9He6fJoKsCd4c14oNctzo5kFE8etrnQwmegTBdgy","ok":false,"explorer":"https://testnet.nearblocks.io/txns/8QZd9He6fJoKsCd4c14oNctzo5kFE8etrnQwmegTBdgy","error":"Smart…
- ✓ prediction 5 (contract): a validly signed payout to an account outside the policy is refused
- ✓ the escrow is intact after the attempt
- ✓ settle_batch of the honest 0.10 succeeded
- ✓ the recipient received exactly 0.10
- evidence M-common: {"recovered":0,"of":4,"gasTGas":16.6,"perMemberTGas":4.1,"wallMs":17537,"settleTx":"FqyEGifREupg3VC7n1tSR7TKRwajB59fB99uior7QRFh","syndicate":"cmp-mw2zxw34-c"}

### M-common · the room is gone: each member exits alone with their remainder; who funded the payout

- ✗ a exits alone — expected , got Smart contract panicked: panicked at src/lib.rs:719:9:
[Hatch-Out REJECT] No escrow balance to refund for caller.
- evidence tx: {"label":"exit cmp-mw2zxw34-c as a","hash":"BkEeJzmPmgjV9wGUw3n7nvAnYDTdDCYbFrT1J37uakN2","ok":false,"explorer":"https://testnet.nearblocks.io/txns/BkEeJzmPmgjV9wGUw3n7nvAnYDTdDCYbFrT1J37uakN2"}
- ✓ b exits alone
- evidence tx: {"label":"exit cmp-mw2zxw34-c as b","hash":"sJmEK9aR9KtFuT1Kj2PHJWE7VHQEz4PZjEJmNpDDrtQ","ok":true,"explorer":"https://testnet.nearblocks.io/txns/sJmEK9aR9KtFuT1Kj2PHJWE7VHQEz4PZjEJmNpDDrtQ"}
- ✓ c exits alone
- evidence tx: {"label":"exit cmp-mw2zxw34-c as c","hash":"3gzipYBeUZBMFZdJrS7YUufqNRqyzsU8fwCLEujSS77u","ok":true,"explorer":"https://testnet.nearblocks.io/txns/3gzipYBeUZBMFZdJrS7YUufqNRqyzsU8fwCLEujSS77u"}
- ✓ d exits alone
- evidence tx: {"label":"exit cmp-mw2zxw34-c as d","hash":"Ct8H3n9LW8nGpH3mpbeB1Ut85PxkpT1fnDJPzHZEAgEv","ok":true,"explorer":"https://testnet.nearblocks.io/txns/Ct8H3n9LW8nGpH3mpbeB1Ut85PxkpT1fnDJPzHZEAgEv"}
- observed **what each member got back at exit (deposit 0.05 each)**: `{"a":"0","b":"0.05","c":"0.05","d":"0.05"}`
- ✗ prediction 6 (Midge): every member recovered a remainder alone, 0.10 in all — expected , got {"a":"0","b":"0.05","c":"0.05","d":"0.05"}
- observed **what each member effectively paid toward the 0.10 payout**: `{"a":"0.05 (their bid was 0.01)","b":"0 (their bid was 0.02)","c":"0 (their bid was 0.03)","d":"0 (their bid was 0.04)"}`
- ✗ prediction 9: the payout was funded equally (0.025 each) whatever each member bid, so a member who bid 0.01 paid 0.025 and one who bid 0.04 paid 0.025 — expected , got {"a":"50000000000000000000000n","b":"1701411834604692n","c":"1701411834604692n","d":"1701411834604692n"}
- ✓ the syndicate ended fully refunded with nothing left

### the comparison, read from the measurements above

- observed **results**: `{"P":{"recovered":4,"of":4,"gasTGas":1.8,"perMemberTGas":0.4,"wallMs":9046},"O":{"recovered":4,"of":4,"gasTGas":2.2,"perMemberTGas":0.6,"wal…`
- ✓ every path was measured
- ✓ prediction 7: Midge costs more gas per member than the public round (a real overhead, read from receipts)
- observed **gas ratio, common-deposit Midge to public**: `10.2`
- observed **wall time (ms), P / O / M-naive / M-common**: `[9046,12024,14771,17537]`
- evidence comparison: {"P":{"recovered":4,"of":4,"gasTGas":1.8,"perMemberTGas":0.4,"wallMs":9046},"O":{"recovered":4,"of":4,"gasTGas":2.2,"perMemberTGas":0.6,"wallMs":12024,"theft":"organizer took 100% of the second pot","vanish":"members rec…

### teardown: prune the syndicates, compact, delete the accounts

- observed **teardown**: `{"pruned":2,"notPruned":[],"deleted":6,"kept":[],"failed":[]}`
- ✓ every account was deleted and every syndicate pruned
- ✓ the contract holds the records it started with

## Problems found

| Severity | Where | Problem |
|---|---|---|
| major | E-CMP-INVEST-01 / M-common · Midge, everyone deposits 0.05 and bids inside it: what the observer reads, then theft attempts, then settlement | assertion failed: the Roost totals the sealed bids to exactly 0.10 although 0.20 is deposited — {"actual":{"totalInputAmount":"0.1","flyerCount":4,"excludedFlyers":[],"executionModel":"HOSTED_EXACT_BATCH","confidentiality":"simulated","timestamp":1793850022938}} |
| major | E-CMP-INVEST-01 / M-common · the room is gone: each member exits alone with their remainder; who funded the payout | assertion failed: a exits alone — {"actual":"Smart contract panicked: panicked at src/lib.rs:719:9:\n[Hatch-Out REJECT] No escrow balance to refund for caller."} |
| major | E-CMP-INVEST-01 / M-common · the room is gone: each member exits alone with their remainder; who funded the payout | assertion failed: prediction 6 (Midge): every member recovered a remainder alone, 0.10 in all — {"actual":{"a":"0","b":"0.05","c":"0.05","d":"0.05"}} |
| major | E-CMP-INVEST-01 / M-common · the room is gone: each member exits alone with their remainder; who funded the payout | assertion failed: prediction 9: the payout was funded equally (0.025 each) whatever each member bid, so a member who bid 0.01 paid 0.025 and one who bid 0.04 paid 0.025 — {"actual":{"a":"50000000000000000000000n","b":"1701411834604692n","c":"1701411834604692n","d":"1701411834604692n"}} |
