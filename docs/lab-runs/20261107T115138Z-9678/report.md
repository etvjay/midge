# Lab run 20261107T115138Z-9678

- **Code:** `872ca50350217477e447b9ed48a302cc2c6a58bc` on `master` (**4 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `8a0180ff698c44b5…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 104 events, hash-chained; root `a87816c3d7551fc3604be434c250327c6998b55c10f0fd96762167bd6b0effbf`. Verify with `node lab/verify-run.js lab/runs/20261107T115138Z-9678`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-CMP-VOTE-01 Voting on testnet: an open poll and a 3-of-5 multisig against a sealed ballot counted by the host | testnet | **PASS** | 8 | 68 |  |

## E-CMP-VOTE-01: Voting on testnet: an open poll and a 3-of-5 multisig against a sealed ballot counted by the host

**Hypothesis.** Predictions are fixed in docs/lab/PROGRAMME_PLAN.md (committed before this ran; prediction 4 was reworded before the run). Five members each put 0.02 NEAR into a 0.1 pool; two options A (ra) and B (rb); m1, m2 and m5 prefer A, m3 and m4 prefer B; quorum 50%, majority rule. (1) In the open poll an observer reads all 5 votes by account and, before the fifth vote, the public tally is 2 to 2 so the fifth voter knows they decide; in the sealed ballot an observer reads 0 of 5 and the settlement carries no tally or turnout, only the pool paid to the winner and equal charges on all five. (2) Both pay the whole 0.1 to ra. (3) An outsider's vote is refused or ignored in both; a member voting twice counts once. (4) In the sealed ballot a re-vote changes the result: with first ballots m1 B, m2 B, m3 B, m4 A, m5 A the host would pay B; after m1 and m2 re-vote A it pays A. (5) Three of five multisig signers can send the whole pool to an address outside both options and it works; under Midge a payout outside the rules is refused by the contract even with a valid host signature (a key we hold stands in for a compromised host), with the escrow intact. (6) If the host never signs, nothing is paid and all five exit alone with 0.02. (7) Gas of the sealed ballot over the open poll is between 0.5 and 3. Fails if any breaks.

**What this does not prove**
- One operator controls every account, the host and the coordinator. The voters are scripted; the preferences are assumed, not discovered.
- The weight of a vote is a deposit-funded share, not a person: the contract cannot tell one person from many accounts. Nothing here tests coercion or vote-buying beyond re-voting.
- The open poll and the multisig are our own minimal contracts (contracts/public-market, contracts/public-multisig), not anyone else's. The host is a local HostedRoost with a simulated attestation provider; signed inputs use real NEAR keys and the real account-key lookup.
- In the sealed ballot every member's whole deposit is the pool share, so after settlement nobody has an escrow left to exit with; the exit is shown separately with the host never signing.
- The count cannot be checked by anyone but the host (two hosts would reduce that trust; this run uses one). The public tally is hidden, so a dishonest host could report a wrong winner, within the options and the equal charges.

| Step | Result | Assertions | Time |
|---|---|---|---|
| set up: five members, an outsider, two recipients, a thief, and the open poll and multisig contracts deployed fresh | ✓ pass | 4/4 | 35219 ms |
| OPEN POLL · everyone deposits and votes in public; a later vote replaces an earlier one; the last voter reads the tally first | ✓ pass | 20/20 | 247352 ms |
| MIDGE · sealed ballot: equal deposits, signed ballots, the host counts and publishes only the winner | ✓ pass | 13/13 | 18860 ms |
| RE-VOTE · the latest signed ballot counts: B is ahead, two members change to A, and the result flips | ✓ pass | 3/3 | 2536 ms |
| MULTISIG · the five members are the signers; three of them approve a payment, and the money goes where they say | ✓ pass | 11/11 | 21590 ms |
| COMPROMISED HOST · the same thief payment under Midge: refused by the contract even with a valid host signature, escrow intact | ✓ pass | 13/13 | 38302 ms |
| the comparison, read from the measurements above | ✓ pass | 2/2 | 0 ms |
| teardown: delete the baseline contracts, prune the syndicates, delete the accounts | ✓ pass | 2/2 | 53186 ms |

### set up: five members, an outsider, two recipients, a thief, and the open poll and multisig contracts deployed fresh

- ✓ both baseline wasms are built
- ✓ the multisig is initialised
- ✓ the open poll contract answers
- ✓ the multisig is initialised with the five members and a threshold of 3

### OPEN POLL · everyone deposits and votes in public; a later vote replaces an earlier one; the last voter reads the tally first

- ✓ open the poll
- ✓ m1 joins with 0.02
- ✓ m2 joins with 0.02
- ✓ m3 joins with 0.02
- ✓ m4 joins with 0.02
- ✓ m5 joins with 0.02
- ✓ (3) an outsider cannot join the poll
- ✓ (3) an outsider cannot vote
- ✓ m1 votes A
- ✓ m3 votes B
- ✓ m2 votes A
- ✓ m4 votes B
- ✓ m1 votes A
- ✓ (1) before the last vote the public tally is 2 to 2: the fifth voter reads it and knows their vote decides
- ✓ (3) m1 voted twice and still counts once
- ✓ m5 votes A
- ✓ (1) an observer reads all 5 votes by account, each matching what that member voted: 5 of 5
- ✓ the voting finished with time to spare before the end
- evidence tx: {"label":"close poll","hash":"GyRyGe1149kyTqZfzbKChpdBNQsSTwFtZmg3CYdtRB6a","ok":true,"explorer":"https://testnet.nearblocks.io/txns/GyRyGe1149kyTqZfzbKChpdBNQsSTwFtZmg3CYdtRB6a","error":null}
- ✓ the poll closed
- ✓ (2) the whole 0.1 NEAR went to ra (A won 3 to 2)
- observed **result**: `{"winner":"A","votesReadable":5,"tallyBeforeLastVote":{"A":2,"B":2},"gasTGas":26.6,"wallMs":247351}`
- evidence OPEN: {"winner":"A","votesReadable":5,"tallyBeforeLastVote":{"A":2,"B":2},"gasTGas":26.6,"wallMs":247351}

### MIDGE · sealed ballot: equal deposits, signed ballots, the host counts and publishes only the winner

- ✓ hatch
- ✓ m1 deposits 0.02
- ✓ m2 deposits 0.02
- ✓ m3 deposits 0.02
- ✓ m4 deposits 0.02
- ✓ m5 deposits 0.02
- ✓ (1) the public escrows are all equal, so they reveal nothing about any vote
- observed **what the host publishes**: `{"shape":"ballot","rule":"majority","decided":true,"winner":"A","recipient":"vcf14pra.fly-1793636729.testnet","reason":null,"quorumMet":true…`
- ✓ (2) A wins and the outcome names ra, with no tally, turnout or ballot
- ✓ (3) the outsider's signed ballot was ignored and reported by account only
- evidence tx: {"label":"settle_batch_charged vote-mw6cf14p-sealed","hash":"4AF12qqXj8VzwEBBR8dtxQUj26kxz4RxrMQ4a5p25hvq","ok":true,"explorer":"https://testnet.nearblocks.io/txns/4AF12qqXj8VzwEBBR8dtxQUj26kxz4RxrMQ4a5p25hvq","error":nu…
- ✓ the settlement succeeded
- ✓ (2) the whole 0.1 NEAR went to ra
- ✓ (1) the settlement carries only the pool to ra and an equal charge on each of the five: it reveals no vote, no tally and no turnout
- ✓ (1) the five charges are identical and equal to the share, so non-voters and voters look the same: 0 of 5 votes can be read
- observed **result**: `{"winner":"A","votesReadable":0,"tallyOnChain":false,"turnoutOnChain":false,"gasTGas":23.3,"wallMs":18860}`
- evidence SEALED: {"winner":"A","votesReadable":0,"tallyOnChain":false,"turnoutOnChain":false,"gasTGas":23.3,"wallMs":18860,"settleTx":"4AF12qqXj8VzwEBBR8dtxQUj26kxz4RxrMQ4a5p25hvq"}

### RE-VOTE · the latest signed ballot counts: B is ahead, two members change to A, and the result flips

- ✓ (4) with the first ballots the host would pay B (3 to 2)
- ✓ (4) after m1 and m2 re-vote A with a higher sequence number the host pays A (4 to 1)
- ✓ a replayed older ballot (sequence 1) cannot overwrite the newer one

### MULTISIG · the five members are the signers; three of them approve a payment, and the money goes where they say

- ✓ m1 sends 0.02 to the multisig
- ✓ m2 sends 0.02 to the multisig
- ✓ m3 sends 0.02 to the multisig
- ✓ m4 sends 0.02 to the multisig
- ✓ m5 sends 0.02 to the multisig
- ✓ m1 proposes paying the whole pool to t, which is neither option
- ✓ m2 approves
- ✓ m3 approves
- ✓ (5) the approvals are public: m1, m2 and m3 by name; m4 and m5, who might object, have no say
- evidence tx: {"label":"execute m4","hash":"7jLMpYjvxMg56PYoZKNZezxM614oqAR32QQ8WVfGgkaA","ok":true,"explorer":"https://testnet.nearblocks.io/txns/7jLMpYjvxMg56PYoZKNZezxM614oqAR32QQ8WVfGgkaA","error":null}
- ✓ (5) three of the five signers sent the whole pool to the thief and it worked
- ✓ (5) t received exactly 0.1 NEAR

### COMPROMISED HOST · the same thief payment under Midge: refused by the contract even with a valid host signature, escrow intact

- ✓ hatch with a key we hold, standing in for a compromised host
- ✓ m1 deposits
- ✓ m2 deposits
- ✓ m3 deposits
- ✓ m4 deposits
- ✓ m5 deposits
- evidence tx: {"label":"thief payment, validly signed","hash":"2uEDpFATLPs4kg3vKMAXvk8VVZ3ALTC5vSA6zVWnAa3H","ok":false,"explorer":"https://testnet.nearblocks.io/txns/2uEDpFATLPs4kg3vKMAXvk8VVZ3ALTC5vSA6zVWnAa3H","error":"Smart contra…
- ✓ (5) a validly signed payout to a recipient outside the rules is refused by the contract
- ✓ (5) the escrow is intact and nothing is in flight
- ✓ (6) m1 exits alone with the full 0.02 (the host never signed anything valid)
- ✓ (6) m2 exits alone with the full 0.02 (the host never signed anything valid)
- ✓ (6) m3 exits alone with the full 0.02 (the host never signed anything valid)
- ✓ (6) m4 exits alone with the full 0.02 (the host never signed anything valid)
- ✓ (6) m5 exits alone with the full 0.02 (the host never signed anything valid)

### the comparison, read from the measurements above

- observed **results**: `{"PUB":{"winner":"A","votesReadable":5,"tallyBeforeLastVote":{"A":2,"B":2},"gasTGas":26.6,"wallMs":247351},"SEAL":{"winner":"A","votesReadab…`
- ✓ every path was measured
- observed **gas, TGas for the whole vote: open poll / sealed ballot**: `[26.6,23.3]`
- observed **wall time (ms): open poll / sealed ballot**: `[247351,18860]`
- ✓ (7) the sealed ballot burns between 0.5 and 3 times the open poll's gas
- evidence comparison: {"PUB":{"winner":"A","votesReadable":5,"tallyBeforeLastVote":{"A":2,"B":2},"gasTGas":26.6,"wallMs":247351},"SEAL":{"winner":"A","votesReadable":0,"tallyOnChain":false,"turnoutOnChain":false,"gasTGas":23.3,"wallMs":18860}…

### teardown: delete the baseline contracts, prune the syndicates, delete the accounts

- observed **open poll contract account**: `deleted, balance returned to the master`
- observed **multisig contract account**: `deleted, balance returned to the master`
- observed **teardown**: `{"pruned":2,"notPruned":[],"deleted":9,"kept":[],"failed":[]}`
- ✓ every account was deleted and every syndicate pruned
- ✓ the contract holds the records it started with

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
