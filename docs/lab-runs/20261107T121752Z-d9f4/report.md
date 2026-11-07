# Lab run 20261107T121752Z-d9f4

- **Code:** `09e902950198441395948ae0cbb36ee0b1d7c167` on `master` (**3 uncommitted files**)
- **Runtime:** Node v24.21.0, linux 7.0.0-1011-aws; docker: Docker version 29.1.3, build 29.1.3-0ubuntu3~24.04.2; dcap-qvl: installed
- **Pins:** verifier `ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41`; compose hash `8a0180ff698c44b5…`
- **Capabilities at start:** network=yes, docker=yes, near-key=yes, nearai-key=yes, phala-key=yes, dcap-qvl=yes
- **Integrity:** 83 events, hash-chained; root `e4e186c291c849be023f66f64a1c2493b21adb2481a04e27fc3c04526d361c49`. Verify with `node lab/verify-run.js lab/runs/20261107T121752Z-d9f4`

## Verdicts

| Experiment | Tier | Verdict | Steps | Assertions | Notes |
|---|---|---|---|---|---|
| E-CMP-PAYROLL-01 Payroll on testnet: a public pay run with reused addresses against a sealed pay run with one-time addresses and signed receipts, two months | testnet | **PASS** | 8 | 41 |  |

## E-CMP-PAYROLL-01: Payroll on testnet: a public pay run with reused addresses against a sealed pay run with one-time addresses and signed receipts, two months

**Hypothesis.** Predictions are fixed in docs/lab/PROGRAMME_PLAN.md (committed before this ran; the gas band was revised before the run). Four people with gross 0.05, 0.04, 0.03, 0.02 NEAR, 15% tax and 5% benefits, paid in two months with the same salaries. (1) Public payroll: an observer links 4 of 4 payees across the months by address and reads every net, tax and benefits amount; given one leaked address (Alice's) the observer reads her pay in both months. (2) Midge with one-time addresses: the observer links 0 of 4 payees by address, but 4 of 4 by amount alone, because the salaries are distinct and unchanged, so one leaked address still exposes that person's pay in both months. (3) Each of the 4 people verifies their own receipt (decrypts, host signature, Merkle proof, order hash against the chain); a receipt with a changed amount fails; the auditor's totals equal what the chain shows; each person's net equals the transfer to their address and the four tax lines sum to the one tax transfer. (4) In each month the employer is charged exactly the gross total (0.14), each address receives exactly its net, and the tax and benefits providers exactly their totals. (5) If the host never signs, nothing is paid and the employer exits alone with the full deposit. (6) Midge uses between 3 and 20 times the gas of the public pay run. Fails if any breaks.

**What this does not prove**
- One operator controls every account and the host; the people are scripted. Every payment's address and amount is public on NEAR in both paths: this tests who can be named, not how much can be seen.
- The observer is modelled from chain data only, plus one assumed leak of one person's address. Amounts are fingerprints: with distinct, stable salaries a one-time address does not stop an observer linking the same person across months. This is the main limit of "private who".
- The host is local with a simulated attestation provider; signed inputs use real NEAR keys and the real account-key lookup. The employer's statement and the auditor's key are read by the experiment itself.
- A multisig-approved payroll is not run: it adds approvals but is as public as the direct run. A dishonest host could issue a wrong receipt; two hosts would reduce that and this run uses one.
- At most 8 recipients per settlement: 4 people plus tax plus benefits is 6.

| Step | Result | Assertions | Time |
|---|---|---|---|
| set up: an employer, four people with reused addresses, eight one-time addresses, the tax authority and the benefits provider | ✓ pass | 1/1 | 38470 ms |
| PUBLIC · the employer pays the same four addresses, tax and benefits directly, two months running | ✓ pass | 3/3 | 29170 ms |
| MIDGE · month 1: the employer seals the pay run, the host pays one-time addresses and issues receipts | ✓ pass | 13/13 | 9181 ms |
| MIDGE · month 2: the employer seals the pay run, the host pays one-time addresses and issues receipts | ✓ pass | 13/13 | 8181 ms |
| MIDGE · what an observer can and cannot link across the two months | ✓ pass | 3/3 | 1 ms |
| DEAD HOST · the host never signs: nothing is paid and the employer exits alone with the full deposit | ✓ pass | 4/4 | 15126 ms |
| the comparison, read from the measurements above | ✓ pass | 2/2 | 0 ms |
| teardown: prune the syndicates, delete the accounts | ✓ pass | 2/2 | 96479 ms |

### set up: an employer, four people with reused addresses, eight one-time addresses, the tax authority and the benefits provider

- ✓ fifteen accounts exist and the employer is funded

### PUBLIC · the employer pays the same four addresses, tax and benefits directly, two months running

- evidence tx: {"label":"public pay month 1 -> ydcrydp1.fly-1793636729.testnet","hash":"CAejWDzxna7hSz1sFQ1VDJb23mnYaErKfQ1VMWWpzGNB","ok":true,"explorer":"https://testnet.nearblocks.io/txns/CAejWDzxna7hSz1sFQ1VDJb23mnYaErKfQ1VMWWpzGNB…
- evidence tx: {"label":"public pay month 1 -> ydcrydp2.fly-1793636729.testnet","hash":"CiuXZZBbQGpi4yvi6ns7WNeweVHLJemWYDqssiCRn9jP","ok":true,"explorer":"https://testnet.nearblocks.io/txns/CiuXZZBbQGpi4yvi6ns7WNeweVHLJemWYDqssiCRn9jP…
- evidence tx: {"label":"public pay month 1 -> ydcrydp3.fly-1793636729.testnet","hash":"DwJCfJS45W5S2JB1rfQ46hq54oNAWzXtvUCnBSdDpjMn","ok":true,"explorer":"https://testnet.nearblocks.io/txns/DwJCfJS45W5S2JB1rfQ46hq54oNAWzXtvUCnBSdDpjMn…
- evidence tx: {"label":"public pay month 1 -> ydcrydp4.fly-1793636729.testnet","hash":"Ac7KJAGHRVKGTkEFP7Htwo9oq91fDzVmFhxvPcwpGes8","ok":true,"explorer":"https://testnet.nearblocks.io/txns/Ac7KJAGHRVKGTkEFP7Htwo9oq91fDzVmFhxvPcwpGes8…
- evidence tx: {"label":"public pay month 1 -> ydcrydtx.fly-1793636729.testnet","hash":"58LPSGGk3FMcKM7mXQxP6fQ4bQK2yfrReBfKqJi9kxBv","ok":true,"explorer":"https://testnet.nearblocks.io/txns/58LPSGGk3FMcKM7mXQxP6fQ4bQK2yfrReBfKqJi9kxBv…
- evidence tx: {"label":"public pay month 1 -> ydcrydbn.fly-1793636729.testnet","hash":"DfE7tq1GiR7RieQE5XQSbQADNrtTY6MrdxqTjY6C3W4n","ok":true,"explorer":"https://testnet.nearblocks.io/txns/DfE7tq1GiR7RieQE5XQSbQADNrtTY6MrdxqTjY6C3W4n…
- evidence tx: {"label":"public pay month 2 -> ydcrydp1.fly-1793636729.testnet","hash":"7KaPAvxNU4PGdpDSj9HBYCPv8fNDNuXc1kw5Y5t7gKCT","ok":true,"explorer":"https://testnet.nearblocks.io/txns/7KaPAvxNU4PGdpDSj9HBYCPv8fNDNuXc1kw5Y5t7gKCT…
- evidence tx: {"label":"public pay month 2 -> ydcrydp2.fly-1793636729.testnet","hash":"FXJN6dX6Xq3jAcPz2yDKWKRNiFSLLKSxmhqJGjKyh5CM","ok":true,"explorer":"https://testnet.nearblocks.io/txns/FXJN6dX6Xq3jAcPz2yDKWKRNiFSLLKSxmhqJGjKyh5CM…
- evidence tx: {"label":"public pay month 2 -> ydcrydp3.fly-1793636729.testnet","hash":"GwRkWeKoSoaFFNGFuVEzTPj7fg1AL841LR9n6ZT8QDxK","ok":true,"explorer":"https://testnet.nearblocks.io/txns/GwRkWeKoSoaFFNGFuVEzTPj7fg1AL841LR9n6ZT8QDxK…
- evidence tx: {"label":"public pay month 2 -> ydcrydp4.fly-1793636729.testnet","hash":"HLWBtdYCwgRg6af6eZ68hPRBi8AAvMGsUFssJ3QTApTS","ok":true,"explorer":"https://testnet.nearblocks.io/txns/HLWBtdYCwgRg6af6eZ68hPRBi8AAvMGsUFssJ3QTApTS…
- evidence tx: {"label":"public pay month 2 -> ydcrydtx.fly-1793636729.testnet","hash":"31jR5MTGTXGbBYbJoG2kEhcMrP13yL3pFnBqreQ1zUvp","ok":true,"explorer":"https://testnet.nearblocks.io/txns/31jR5MTGTXGbBYbJoG2kEhcMrP13yL3pFnBqreQ1zUvp…
- evidence tx: {"label":"public pay month 2 -> ydcrydbn.fly-1793636729.testnet","hash":"32HxSTYdM2mEdvZmZ6SiZcySmLoFVLMZJ53eBfSNs9un","ok":true,"explorer":"https://testnet.nearblocks.io/txns/32HxSTYdM2mEdvZmZ6SiZcySmLoFVLMZJ53eBfSNs9un…
- ✓ (1) an observer links 4 of 4 payees across the months by address
- ✓ (1) every net amount is readable: 0.04, 0.032, 0.024, 0.016, and the tax and benefits totals 0.021 and 0.007
- ✓ (1) given only Alice's address the observer reads her pay in both months (0.04 and 0.04)
- observed **result**: `{"linkedAcrossMonthsByAddress":4,"of":4,"amountsReadable":true,"aliceExposedMonths":2,"gasTGas":5.4}`
- evidence PUBLIC: {"linkedAcrossMonthsByAddress":4,"of":4,"amountsReadable":true,"aliceExposedMonths":2,"gasTGas":5.4}

### MIDGE · month 1: the employer seals the pay run, the host pays one-time addresses and issues receipts

- ✓ month 1: hatch
- ✓ month 1: the employer deposits 0.15
- evidence tx: {"label":"settle_batch_charged pay-mw6dcryd-m1","hash":"DX79QbhEPgSFzaj5Rt2znbQT3TA62orD4Yc4qo2Xa17N","ok":true,"explorer":"https://testnet.nearblocks.io/txns/DX79QbhEPgSFzaj5Rt2znbQT3TA62orD4Yc4qo2Xa17N","error":null}
- ✓ month 1: the settlement succeeded
- ✓ (4) month 1: exactly six transfers moved, and nothing else
- ✓ (4) month 1: each address received exactly its net: 0.04, 0.032, 0.024, 0.016
- ✓ (4) month 1: the tax authority received 0.021 and the benefits provider 0.007
- ✓ (4) month 1: the employer was charged exactly the gross total, 0.14
- ✓ month 1: the order hash on chain equals the one recomputed from the run id and the receipts root
- ✓ (3) month 1: all four people verify their own receipt (decrypts, host signature, Merkle proof, order hash against the chain)
- ✓ (3) month 1: Alice's receipt shows gross 0.05, tax 0.0075, benefits 0.0025, net 0.04, and her net equals the transfer to her one-time address
- ✓ (3) month 1: a receipt with the net changed to 0.05 fails verification
- ✓ (3) month 1: the four tax lines in the employer's statement sum to the one tax transfer on chain (0.021)
- ✓ (3) month 1: the auditor's totals equal what the chain shows (net 0.112, tax 0.021, benefits 0.007, gross 0.14) and carry no name or address

### MIDGE · month 2: the employer seals the pay run, the host pays one-time addresses and issues receipts

- ✓ month 2: hatch
- ✓ month 2: the employer deposits 0.15
- evidence tx: {"label":"settle_batch_charged pay-mw6dcryd-m2","hash":"HWoHWehgvYqTf8Sf8TXhtQWfhY3NtGN7PFsXGQahXLnG","ok":true,"explorer":"https://testnet.nearblocks.io/txns/HWoHWehgvYqTf8Sf8TXhtQWfhY3NtGN7PFsXGQahXLnG","error":null}
- ✓ month 2: the settlement succeeded
- ✓ (4) month 2: exactly six transfers moved, and nothing else
- ✓ (4) month 2: each address received exactly its net: 0.04, 0.032, 0.024, 0.016
- ✓ (4) month 2: the tax authority received 0.021 and the benefits provider 0.007
- ✓ (4) month 2: the employer was charged exactly the gross total, 0.14
- ✓ month 2: the order hash on chain equals the one recomputed from the run id and the receipts root
- ✓ (3) month 2: all four people verify their own receipt (decrypts, host signature, Merkle proof, order hash against the chain)
- ✓ (3) month 2: Alice's receipt shows gross 0.05, tax 0.0075, benefits 0.0025, net 0.04, and her net equals the transfer to her one-time address
- ✓ (3) month 2: a receipt with the net changed to 0.05 fails verification
- ✓ (3) month 2: the four tax lines in the employer's statement sum to the one tax transfer on chain (0.021)
- ✓ (3) month 2: the auditor's totals equal what the chain shows (net 0.112, tax 0.021, benefits 0.007, gross 0.14) and carry no name or address

### MIDGE · what an observer can and cannot link across the two months

- ✓ (2) by address the observer links 0 of 4 payees across the months: every address is new
- ✓ (2) BY AMOUNT the observer links 4 of 4: the salaries are distinct and unchanged, so each month-1 amount matches exactly one month-2 payee
- ✓ (2) one leaked address (Alice's month-1 address) still exposes her month-2 pay: the observer finds the one month-2 address that received the same amount
- observed **result**: `{"linkedAcrossMonthsByAddress":0,"linkedAcrossMonthsByAmount":4,"of":4,"amountsReadable":true,"gasTGas":31.6}`
- evidence MIDGE: {"linkedAcrossMonthsByAddress":0,"linkedAcrossMonthsByAmount":4,"of":4,"amountsReadable":true,"gasTGas":31.6}

### DEAD HOST · the host never signs: nothing is paid and the employer exits alone with the full deposit

- ✓ hatch
- ✓ the employer deposits
- ✓ the employer exits alone
- ✓ (5) the employer recovered the full 0.15

### the comparison, read from the measurements above

- observed **results**: `{"PUB":{"linkedAcrossMonthsByAddress":4,"of":4,"amountsReadable":true,"aliceExposedMonths":2,"gasTGas":5.4},"MIDGE":{"linkedAcrossMonthsByAd…`
- ✓ every path was measured
- observed **gas, TGas for two pay runs: public / Midge (hatch, deposit and settlement per month)**: `[5.4,31.6]`
- ✓ (6) Midge uses between 3 and 20 times the gas of the public pay run
- evidence comparison: {"PUB":{"linkedAcrossMonthsByAddress":4,"of":4,"amountsReadable":true,"aliceExposedMonths":2,"gasTGas":5.4},"MIDGE":{"linkedAcrossMonthsByAddress":0,"linkedAcrossMonthsByAmount":4,"of":4,"amountsReadable":true,"gasTGas":…

### teardown: prune the syndicates, delete the accounts

- observed **teardown**: `{"pruned":3,"notPruned":[],"deleted":15,"kept":[],"failed":[]}`
- ✓ every account was deleted and every syndicate pruned
- ✓ the contract holds the records it started with

## Problems found

None recorded. That means the checks passed, not that nothing is wrong: see each experiment's limits.
