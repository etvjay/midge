# Roadmap

Everything on this page is planned, and none of it is built. The steps are ordered by how much each one reduces what an outside observer can learn, set against what it costs to build.

## What an outside observer can learn today

An observer reading NEAR can see who may be paid, because the contract stores the list of allowed recipient accounts in clear. The observer can also see the limit on how much may leave in each period, the deadline, every deposit with its account and amount, and every payment with its recipient and amount. What the observer cannot see is what members bid, vote or decide, because those inputs are sealed to the room. The room itself can read them, and the hardware proves which code is running, so the privacy of the inputs depends on that hardware and on whoever operates it. Payroll therefore offers private payees (through one-time addresses) and private receipts, and its amounts are public.

## Step 1. Commit to the rules and reveal only what is used

The goal of the first step is that outsiders no longer see the list of accounts that may be paid, and see only the accounts that were paid.

Here is how it would work, in order.

1. The creator of a group builds a Merkle tree of the allowed recipients. A Merkle tree is a hash tree that lets someone prove a value is in a list without showing the list. Each leaf combines the account name with a secret random salt, so an outsider cannot test guesses against the tree.
2. The contract stores the root of the tree together with the caps and the deadline. The consent hash that depositors pass at deposit covers the root.
3. The creator gives the full list and the salt to each depositor outside the chain, and each depositor recomputes the root before depositing.
4. When the room proposes a settlement, it attaches a proof for each paid recipient, and the contract checks the proof against the root before paying. The other checks stay as they are, including the room's signature, the caps and the exit.

Outsiders would learn the root, the caps, the deadline, and who was paid and how much. They would not learn who else was allowed.

The cost is a change to the production contract, which needs a redeploy that only the owner can approve, new tests, and a re-run of the hardware evidence. Depositors must receive the list from the creator, and a depositor who is not given it cannot check what they are consenting to. Payments, amounts and caps stay public. The author estimates one to two days of work, and that figure is an estimate and not a measurement.

## Step 2. Prove that a payment fits hidden rules with a zero-knowledge proof

The goal of the second step is to hide the rules entirely, including the caps and the deadline, while the contract still refuses any payment outside them.

The room would produce a zero-knowledge proof, which is a short proof that a statement is true without revealing why, that a settlement fits the rules committed to when the group was created. The contract would verify the proof before paying. The NEAR SDK already exposes the curve operations that such a verifier uses (`alt_bn128_g1_multiexp`, `alt_bn128_g1_sum` and `alt_bn128_pairing_check`, checked in `near-sdk` 5.30.1), and a verifier for a particular proof system has not been written or tested for Midge.

A payment is still a public NEAR transfer, so its recipient and amount stay public unless the funds move through a shielded pool, and NEAR does not provide one natively.

The cost is a circuit for the rules, a proof system and, depending on the system, a trusted setup, an on-chain verifier, and an independent audit. The author estimates weeks of work, so the step does not fit before the hackathon deadline.

## Step 3. Pay out through NEAR Confidential Intents

The goal of the third step is to hide the amounts and counterparties of the payout.

NEAR documents Confidential Intents as swaps and transfers that run on a separate execution environment with restricted visibility, operated by independent permissioned validators. Developers reach it through the 1Click API by enabling a confidentiality option. Balances are split into a transparent main balance and an encrypted confidential balance, and the result is confidentiality and not anonymity, because the deposit and withdrawal edges stay public, which is the research run's reading of NEAR's documentation.

In Midge the contract would still enforce the rules and the exit on NEAR, and only the final payout leg would go through the confidential rail, so the recipients and amounts of that leg would not appear on the public chain. The shard is reported to run NEAR's own Intents contract, so Midge's rules cannot be enforced inside it, and it can only serve as a payout rail.

The 1Click API needs an authenticated partner token for the confidential option, and the project does not have one. The official quickstart says the Intents service has no testnet, so a real test needs mainnet funds. The validators are permissioned, so the privacy of that leg rests on trusting them. So far the project only reads asset lists and dry quotes through the 1Click API (`src/intents/oneclick.js`), and it has never opened a real swap.

The facts in this step come from NEAR's published documentation as summarized by a research run on 2026-11-11, and they should be checked against the pages before anyone relies on them. The pages are the [announcement of general availability](https://www.near.org/blog/announcing-general-availability-of-confidential-intents), [how Confidential Intents works](https://www.near.org/blog/how-confidential-intents-works), the [1Click authentication guide](https://docs.near-intents.org/integration/distribution-channels/1click-api/authentication) and the [1Click quickstart](https://docs.near-intents.org/integration/distribution-channels/1click-api/quickstart/introduction.md).

## How the steps fit together

Steps 1 and 3 combine well. With step 1 the contract enforces rules whose recipient list is hidden, and with step 3 the payout leg is hidden, so an outsider would learn neither who was allowed nor what was paid on that leg. Step 2 would replace step 1 later, if the caps and the deadline must be hidden as well. The recommended order is step 1, then step 3, then step 2.

## Other open items

- Mainnet. Everything that runs on a chain runs on a testnet.
- Independent operators. One operator ran every room and every account in the tests.
- Deleting the contract's deployer key (GAP-044). The key is how the contract is upgraded, so deleting it ends all upgrades, and step 1 would have to be deployed before the key is deleted.
- Two hosts on two machines. The two-host settlement is tested on testnet with two local hosts.
