# Lab run 20261105T035414Z-7a52

- **Code:** `47a76e154c5a57effa0cf8a9eebacc2b36d41166` on `master` (**9 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `8a0180ff698c44b5…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 79 events, hash-chained; root `471f5ed6be942c272783305293e2b94828776755a22a9aa737be1b15ed0bb0bf`. Verify with `node lab/verify-run.js lab/runs/20261105T035414Z-7a52`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-CMP-INVEST-01 Investing together on testnet: a public round, a trusted organizer and Midge, same chain and same members | testnet | **PASS** | 9 | 39 |  |

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
| set up: four backers, a recipient and an organizer, fresh accounts | ✓ pass | 1/1 | 15217 ms |
| P · public: each backer pays the recipient directly; an observer reads the public receipts | ✓ pass | 1/1 | 10725 ms |
| O · organizer: backers pay one account, the organizer forwards the total; the observer reads the public receipts | ✓ pass | 2/2 | 12581 ms |
| O · theft and vanish: members cannot get the pot back, the organizer can take it | ✓ pass | 3/3 | 12055 ms |
| M-naive · Midge, each backer deposits exactly their bid: the observer reads the public escrows | ✓ pass | 8/8 | 14958 ms |
| M-common · Midge, everyone deposits 0.05 and bids inside it: what the observer reads, then theft attempts, then settlement | ✓ pass | 13/13 | 18825 ms |
| M-common · the room is gone: each member exits alone with their remainder; who funded the payout | ✓ pass | 7/7 | 15298 ms |
| the comparison, read from the measurements above | ✓ pass | 2/2 | 0 ms |
| teardown: prune the syndicates, compact, delete the accounts | ✓ pass | 2/2 | 34728 ms |

### set up: four backers, a recipient and an organizer, fresh accounts

- ✓ six accounts exist

### P · public: each backer pays the recipient directly; an observer reads the public receipts

- observed **what the observer read**: `{"i0hds7a.fly-1793636729.testnet":"0.01","i0hds7b.fly-1793636729.testnet":"0.02","i0hds7c.fly-1793636729.testnet":"0.03","i0hds7d.fly-179363…`
- ✓ prediction 1: the observer recovers all four amounts from the public transfers
- evidence P: {"txs":["7iUUR1ZzgwJp4nN5zG6u1cW5wHtkzDn2hCfgeVXDp4qu","r9M1xsgYesbZiKSDo9VFC3RAuFg9sZV2Lx6g4DkqQka","GDYkt6rYpt8AoQYv37jAe7tiZSmMViYxdonhDLzg4BNL","DfRGA1dFGSiwq3oNSnEWomuZrUVec7KTWUEmYN9VvqUN"],"recovered":4,"of":4,"ga…

### O · organizer: backers pay one account, the organizer forwards the total; the observer reads the public receipts

- ✓ prediction 2: the observer recovers all four amounts sent to the organizer
- ✓ the organizer forwarded exactly 0.10 to the recipient
- evidence O: {"txs":["6PW9baFqeM3vEYz56j4kidnVcyJpmwXX23cLRzuW8BDV","DhU47bvHFYVNLhUQ81JC7SxCQdwkSHnWJQz8wRxDGYgo","AR6PSgRAKzADjGKY8NaRoM1qyWvg1UpHez8sq8u1zJZh","5Xxo1YQyYchUeFW8D98UCTggkdjtqRGxiHJSSBsJzBod"],"forward":"BKguSb3izthq…

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
- evidence M-naive: {"syndicate":"cmp-mw30hds7-n","settle":"CK8JVGXmKrCTcRko3DUMAYwa5LsRPvQyy4FNrttfJqtc","recovered":4,"of":4,"gasTGas":16.4,"perMemberTGas":4.1,"wallMs":14911}

### M-common · Midge, everyone deposits 0.05 and bids inside it: what the observer reads, then theft attempts, then settlement

- ✓ hatch
- ✓ a deposits 0.05
- ✓ b deposits 0.05
- ✓ c deposits 0.05
- ✓ d deposits 0.05
- observed **what the observer reads: every escrow**: `{"i0hds7a.fly-1793636729.testnet":"0.05","i0hds7b.fly-1793636729.testnet":"0.05","i0hds7c.fly-1793636729.testnet":"0.05","i0hds7d.fly-179363…`
- ✓ every escrow is the same, so the escrows say nothing about who bid what
- ✓ prediction 4: the observer's best guess (the common deposit, or the total divided by four) matches none of the four bids
- ✓ the Roost totals the sealed bids to exactly 0.10 although 0.20 is deposited
- ✓ prediction 5 (Roost): asked to pay the whole 0.20 deposit against a 0.10 sealed total, the Roost refuses to sign
- evidence tx: {"label":"OUTSIDE-POLICY settle cmp-mw30hds7-c","hash":"7AC9jvHgy7FpNKJeDxZzgmXGnHojhx5m2qq1VnJxw8py","ok":false,"explorer":"https://testnet.nearblocks.io/txns/7AC9jvHgy7FpNKJeDxZzgmXGnHojhx5m2qq1VnJxw8py","error":"Smart…
- ✓ prediction 5 (contract): a validly signed payout to an account outside the policy is refused
- ✓ the escrow is intact after the attempt
- ✓ settle_batch of the honest 0.10 succeeded
- ✓ the recipient received exactly 0.10
- evidence M-common: {"recovered":0,"of":4,"gasTGas":16.7,"perMemberTGas":4.2,"wallMs":18823,"settleTx":"8d78Ksqj5yEvsKdyehZ8WzJzEkWvnrhwCpEGW5tKif6N","syndicate":"cmp-mw30hds7-c"}

### M-common · the room is gone: each member exits alone with their remainder; who funded the payout

- ✓ a exits alone
- evidence tx: {"label":"exit cmp-mw30hds7-c as a","hash":"7KJJ2EJqjxvwR1veUDjefdzHQR54h1tTn7fRnRbWxuwn","ok":true,"explorer":"https://testnet.nearblocks.io/txns/7KJJ2EJqjxvwR1veUDjefdzHQR54h1tTn7fRnRbWxuwn"}
- ✓ b exits alone
- evidence tx: {"label":"exit cmp-mw30hds7-c as b","hash":"8iwaSozpnAxnbLPQzcNGfbg3n7beMm9y3AGe6Rn2KWUQ","ok":true,"explorer":"https://testnet.nearblocks.io/txns/8iwaSozpnAxnbLPQzcNGfbg3n7beMm9y3AGe6Rn2KWUQ"}
- ✓ c exits alone
- evidence tx: {"label":"exit cmp-mw30hds7-c as c","hash":"99Uc37G9Zh5eHJeUgVjTayCvahDZUmAcVkaE1qv3XYux","ok":true,"explorer":"https://testnet.nearblocks.io/txns/99Uc37G9Zh5eHJeUgVjTayCvahDZUmAcVkaE1qv3XYux"}
- ✓ d exits alone
- evidence tx: {"label":"exit cmp-mw30hds7-c as d","hash":"6T8Ezwtofyf1K9x1YXWxkb5sM4H6PRD2mCMiTYMyTTSC","ok":true,"explorer":"https://testnet.nearblocks.io/txns/6T8Ezwtofyf1K9x1YXWxkb5sM4H6PRD2mCMiTYMyTTSC"}
- observed **what each member got back at exit (deposit 0.05 each)**: `{"a":"0.025","b":"0.025","c":"0.025","d":"0.025"}`
- ✓ prediction 6 (Midge): every member recovered a remainder alone, 0.10 in all
- observed **what each member effectively paid toward the 0.10 payout**: `{"a":"0.025 (their bid was 0.01)","b":"0.025 (their bid was 0.02)","c":"0.025 (their bid was 0.03)","d":"0.025 (their bid was 0.04)"}`
- ✓ prediction 9: the payout was funded equally (0.025 each) whatever each member bid, so a member who bid 0.01 paid 0.025 and one who bid 0.04 paid 0.025
- ✓ the syndicate ended fully refunded with nothing left

### the comparison, read from the measurements above

- observed **results**: `{"P":{"recovered":4,"of":4,"gasTGas":1.8,"perMemberTGas":0.4,"wallMs":9845},"O":{"recovered":4,"of":4,"gasTGas":2.2,"perMemberTGas":0.6,"wal…`
- ✓ every path was measured
- ✓ prediction 7: Midge costs more gas per member than the public round (a real overhead, read from receipts)
- observed **gas ratio, common-deposit Midge to public**: `10.5`
- observed **wall time (ms), P / O / M-naive / M-common**: `[9845,11581,14911,18823]`
- evidence comparison: {"P":{"recovered":4,"of":4,"gasTGas":1.8,"perMemberTGas":0.4,"wallMs":9845},"O":{"recovered":4,"of":4,"gasTGas":2.2,"perMemberTGas":0.6,"wallMs":11581,"theft":"organizer took 100% of the second pot","vanish":"members rec…

### teardown: prune the syndicates, compact, delete the accounts

- observed **teardown**: `{"pruned":2,"notPruned":[],"deleted":6,"kept":[],"failed":[]}`
- ✓ every account was deleted and every syndicate pruned
- ✓ the contract holds the records it started with

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
