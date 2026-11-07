# Voting on testnet: results

*Experiment `E-CMP-VOTE-01`, run `20261107T115138Z-9678`, PASS, 68 assertions, log re-derived intact. Predictions were written in `PROGRAMME_PLAN.md` before the run (prediction 4 was reworded before it ran, because the first wording would not have changed the winner). An earlier run, `…75bc`, failed on my own funding check in the multisig step and is not kept. Baselines are our own contracts (`contracts/public-market`, `contracts/public-multisig`), deployed fresh and deleted afterwards.*

## What was run

Five members each put 0.02 NEAR into a 0.1 NEAR pool. Two options: A (pays `ra`) and B (pays `rb`). m1, m2 and m5 prefer A; m3 and m4 prefer B. Quorum 50%, majority rule. Three paths.

| | Open poll | Midge sealed ballot | 3-of-5 multisig |
|---|---|---|---|
| Votes an observer reads from the chain | **5 of 5**, by account | **0 of 5** | n/a: trustees approve, members do not vote |
| What the settlement shows | the votes themselves | the pool to `ra` and an **equal** charge on all five: no tally, no turnout, no vote | approvals by name |
| The last voter | read a public **2 to 2** tally first and knew their vote decided | could not know | n/a |
| Winner | A (3 to 2); the whole 0.1 NEAR to `ra` | A; the whole 0.1 NEAR to `ra` | whoever three signers approve |
| An outsider | could not join or vote | their validly signed ballot was ignored and reported by account only | n/a |
| A member voting twice | counted once | counted once (the later signed ballot replaces the earlier one) | n/a |
| Gas, whole vote | 26.6 TGas | 23.3 (0.88 times) | not compared |
| Wall time | 247 s (a poll runs for its window) | 19 s | n/a |

- **Re-voting changes the result.** First ballots m1 B, m2 B, m3 B, m4 A, m5 A would pay B (3 to 2). After m1 and m2 re-voted A with a higher sequence number the host pays A (4 to 1). A replayed older ballot (sequence 1) was refused.
- **The multisig is a different trust.** Three of the five signers proposed and approved paying the whole 0.1 NEAR to an address that is neither option (`t`), and it worked; the other two signers had no say. This is documented behaviour of a multisig, not a bug.
- **Under Midge the same payment is refused.** A key we hold, standing in for a compromised host, signed a validly formatted settlement paying `t`. The contract refused it (`Recipient … is not in allowed_recipients whitelist`) and left every escrow intact. With nothing valid signed, all five members exited alone with their full 0.02.
- **The pool share is the whole deposit,** so after a settled ballot nobody has an escrow left to exit with; the exit was shown separately.

## What this shows

Sealing hides the individual votes and the tally, and removes a pivotal voter's information. The rules fix where the pool can go, which a multisig does not. Re-voting works and is replay-safe. Cost is similar to an open poll in gas (0.88 times here) and far faster, because an open poll runs for its window.

## What this does not show

- **Independence.** One operator ran every account, the host and the coordinator. The voters are scripted and their preferences assumed.
- **Hardware.** The host is local with a simulated attestation provider. Signed inputs used real NEAR keys and the real account-key lookup.
- **People.** A vote's weight is a deposit-funded share, not a person: the contract cannot tell one person from many accounts.
- **Checking the count.** The tally is hidden by design, so nobody but the host can check that the winner is right. A dishonest host could report the wrong winner within the options and the equal charges. Two hosts reduce this; this run used one.
- **Coercion and vote-buying** beyond re-voting. An open poll's public tally also makes bribing a pivotal voter easier; this run does not test bribery.
- The agreed option is paid, but nothing here proves that members wanted it: the preferences are scripted.
