# Payroll on testnet: results

*Experiment `E-CMP-PAYROLL-01`, run `20261107T121752Z-d9f4`, PASS, 41 assertions, log re-derived intact. Predictions were written in `PROGRAMME_PLAN.md` before the run; the gas band was revised before it ran (the investing comparison had measured Midge at about ten times a direct payment). Every number is read from that log. The room program is `payrun-program.js` with `receipts.js`.*

## The claim, stated first

**Private who, with private receipts. Not confidential amounts.** A settlement is a public NEAR transfer, so the address and the amount of every payment are public in both paths below. What Midge adds is (a) one-time payout addresses that only the room can map to a person, and (b) signed, encrypted receipts and an auditor view. The experiment also shows where "private who" is weak.

## What was run

An employer paid four people in two consecutive months with identical salaries (gross 0.05, 0.04, 0.03, 0.02 NEAR; 15% withheld as tax and 5% as benefits, paid to a tax authority and a benefits provider as one transfer each).

| | Public pay run | Midge sealed pay run |
|---|---|---|
| Payee addresses | the same four every month | new one-time addresses each month |
| Payees an observer links across months **by address** | **4 of 4** | **0 of 4** |
| Payees an observer links across months **by amount** | 4 of 4 | **4 of 4** |
| Every net, tax and benefits amount readable | yes | **yes** |
| One leaked address (Alice's) exposes her pay | in both months | in **both** months, by matching the amount |
| Receipts | none | each person verifies their own: decrypts, host signature, Merkle proof, and the order hash recomputed from the root equals the one on chain |
| Auditor's view | the whole chain | totals only (net 0.112, tax 0.021, benefits 0.007, gross 0.14); no name or address |
| Gas, two pay runs | 5.4 TGas | 31.6 TGas (5.9 times) |
| If the host never signs | n/a | nothing is paid; the employer exits alone with the full 0.15 |

## What this shows

- **One-time addresses stop address reuse, and nothing more.** The observer cannot match this month's payee to last month's by address. But the salaries are distinct and unchanged, so each month-1 amount matches exactly one month-2 payee: **4 of 4 linked by amount**. A single leaked address therefore still exposes that person's pay in both months. Private who is weaker across pay runs than within one, and stable distinct salaries are what break it. I predicted this before the run.
- **The receipts work.** Each of the four people verified their own receipt in both months against the order hash recorded on chain; a receipt with the net changed to 0.05 failed; a person's net equalled the transfer to their address; the four tax lines in the employer's statement summed to the one tax transfer on chain (0.021); the auditor's totals equalled what the chain shows.
- **The money was exact.** Each month the employer was charged exactly 0.14, each address received exactly its net, and the tax authority and benefits provider exactly their totals; six transfers moved and nothing else.

## What this does not show

- **Amounts are public.** Nothing here hides how much anyone is paid. Say "private who, with private receipts".
- **Independence and hardware.** One operator ran every account and the host; the host was local with a simulated attestation provider. Signed inputs used real NEAR keys and the real lookup.
- **A wrong receipt.** A dishonest host could issue a receipt that is internally valid but wrong; the person's check cannot detect that. Two hosts reduce this; this run used one.
- **The observer is modelled** from chain data plus one assumed leak, not an adversary who also sees off-chain pay information.
- **At most 8 recipients per settlement**; a larger payroll is several settlements. Four people plus two providers is six.
- **A multisig-approved payroll** was not run: it adds approvals but is as public as the direct run.
- **Deductions are simplified** (flat percentages); real payroll rules are not modelled.
