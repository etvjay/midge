# Words used for Midge

*Decided 2026-11-07. One idea, one vocabulary. The concept is **private rooms with public rules**. Public pages (site, README, pitch, submission) use the words in the left column; the code keeps its older names because the contract is deployed and its method names are part of its interface.*

## The idea in one sentence

**Midge is a network of private rooms with public rules.** A group decides together in a private room. What the group can do with its money is fixed in public, and any member can leave with their own share.

*Layman version:* a meeting behind closed doors where nobody can see what was said, but the budget limits are posted on the wall and every attendee holds a key to get their own money back.

## The words

| Say this | It means | Code and older names | Layman version |
|---|---|---|---|
| **Midge** | The network and the product | Fly (the old codename: `fly-coordinator`, `FLY_*`, `c.fly-…`) | the name of the whole thing |
| **Group** | The people, companies or AI agents acting together | syndicate (`get_syndicate`, `hatch`), swarm, pod | the club that owns the room |
| **Room** | The private place where members' sealed inputs are opened and the result is worked out | the Roost | the closed-door meeting |
| **Host** | The secure hardware and program that runs a room: our program on Phala, or an attested AI model on NEAR AI Cloud | Roost backend (`hosted`, `model-sealed`) | the building the meeting is held in |
| **Rules** | The NEAR contract: who can be paid, how much per release window, until when; it refuses anything else | the Nest, `fly-coordinator`, the release policy | the posted budget limits |
| **Member** | Anyone with a NEAR account who puts money in and takes part | flyer | an attendee |
| **Sealed input** | A bid, ballot or amount encrypted so only the room can read it, and signed by the member | sealed intent, sealed bid | a signed envelope only the room can open |
| **Round** | One cycle: sealed inputs, a result, a settlement | epoch, round nonce | one agenda item |
| **Settle** | The contract pays what the room signed, if it fits the rules | `settle_batch` | cashing the cheque |
| **Exit** | Any member takes back what they have left, alone, after a timer | `hatch_out`, escape hatch | your own key to the safe |
| **Open a room** | Create one, with its rules | `hatch` | book the room |
| **Two hosts** | One room run by two independent hosts that must both sign before any money moves | two-room agreement, second room key | two cashiers must both stamp the receipt |
| **Advisor** | The attested NEAR AI model that proposes how to split a total; it sees only the total | advisor | a consultant who sees the sum, never the bids |
| **Invoice** | A payee's own signed statement of what they ask to be paid: invoice id, period, chain, destination, asset, amount. Sealed to the room, so the chain never sees it and only the room reads it. One per id per round | `signInvoice`, `submitInvoice`, `/invoices`; with `requireInvoices` a pay run checks every line against its invoice | a bill the payee signs and hands to the accountant, who checks it against the cheque before it is written |
| **Invoice check** | Every line of a pay run must match a payee-signed invoice, field by field. One line that differs in amount or destination stops the **whole** run and the queue is kept. The separate stateless check (`/invoice-check`) takes the invoice and the approved line as plain JSON and is **not** sealed | `matchApproval`, `midge_check_invoice`, `checkInvoice` | the cheque is not signed unless every bill agrees with it |
| **Pre-flight check** (the view of one payment before it is requested) | Checks one payment against the group's rules before anyone asks for it: is the destination allowed, is it under the per-payment cap and the window total, is the fee under its cap, was this obligation already used, did the destination change since the last run, is the amount far from the last one. It returns blocking and warning findings and whether a second person should confirm. It decides nothing and moves nothing | `preflight`, `/preflight`, `payrollPreflight`, `midge_payroll_preflight` | a spell-check for a payment before it is sent |
| **Redacted advice** | An optional, off-by-default explanation of a pre-flight result by the attested NEAR AI model. It is sent finding **codes** and ratios rounded to the nearest 10% only: never a name, address, id or exact amount, and the message and the reply are both checked for those and refused if one appears. It is advice: the pre-flight result is returned untouched beside it | `explainPreflight`, `explain: true` | a second opinion that was only told "over the limit, about 90%", never who or how much |
| **Statement** | The sealed receipt each payee gets for their line: gross, deductions, net, the invoice's hash, and a proof that the line is inside the run's root, which the order hash on chain commits to. Only that payee's key opens it | `verifyStatement`, `receipts.js` | a payslip only you can open, that anyone with your key can check against the public record |
| **Auditor pack** | Chosen lines of a pay run opened for an auditor. Only the employer can authorise it: the request is signed with a key of the employer's NEAR account, checked against the chain, over the run, the exact lines and the auditor's key. The pack is sealed to the auditor, holds only those lines with their proofs, and the auditor checks it against the order hash on chain. The room does not remember earlier rounds, so "this was already paid" is the pre-flight's check, not the room's | `/audit/open`, `openAuditLines`, `verifyAuditorPack`, `midge_verify_auditor_pack` | the employer unlocks three pages of the books for the auditor, and the auditor can prove they are from the filed book |
| **Account check** | The room accepts a signed input only if **every** configured NEAR RPC provider confirms the key belongs to the member's account. If one cannot be reached, or keeps rate-limiting, the input is refused with "could not check" and nothing is queued (fail closed): the cost is that one flaky provider stops intake. Only a provider that clearly says the key does not exist makes it "not a key" | `makeAgreeingAccountKeyCheck`, `ROOST_ACCOUNT_CHECK_RPC_URLS` | the doorman phones every bank and lets nobody in if one does not pick up |
| **Signed-only room** | The pinned hardware room refuses every input that is not sealed **and** signed with the member's own account key for the current round. This is part of the attested compose file, so a member can verify it | `ROOST_REQUIRE_SIGNED_INPUTS=1`, `signedBidParams` | a room that lets in only people who sign the register |
| **Abandon a round** | The room signs once per round. If the contract refuses that signature the nonce does not change, so the coordinator gives the signature up (it stays on record, and still counts as valid on chain) and the round can run again | `abandonRound`, `abandonSignedRound` | tearing up a cheque the bank refused, and keeping the stub |
| **OutLayer program and caller** | A Rust program that runs on OutLayer's hardware and signs a Midge settlement with a protected secret nobody can read; a small NEAR contract (`outlayer/caller`) triggers it and receives the result in a callback. This is the signing step only, not a room | `outlayer/room-signer`, `outlayer/caller`, `request_execution` | a signing clerk in a locked office, called by a contract |
| **One-off / ongoing room** | A room that closes after one task, or lasts across rounds | Flash / Dark Vault | |

Names we do not use in public copy: syndicate, swarm, flyer, hatch, Roost, Nest, pod, facility, FAR shard, TEE (say "secure hardware", then name it once), "trustless", "MEV eliminated", an unqualified "hardware-secured". Third-party product names (OutLayer, Chain Signatures, 1Click) are named only where we use them.

*Decided 2026-11-10:* the landing page's "Under the hood" section may show the code names (Roost, Nest, flyers, hatch, escape hatch, `settle_batch`, two-room agreement, advisor), each once, beside its plain word, so readers of the code and contract can map one to the other. Nowhere else on public pages; `tests/site-home.test.js` checks it.

## What rooms are for

One pattern (a private room, public rules, an exit) serves several kinds of group. Status is what exists today, not what is planned.

| Family | Examples | What the room does | Status |
|---|---|---|---|
| **Buy and sell** | Auctions and token sales; lending quotes; big trades between two desks | Opens sealed bids or quotes; the rules fix the winner and price; losers get their deposit back | Auctions (first-price, second-price, uniform-price), lending quotes (first- and second-price), two-sided RFQs (makers quote a bid and an ask; the taker's side stays sealed) and block trades (pro-rata cross): each run on testnet against a public version, on a local host. The sealed-quote RFQ also ran on a real hardware room and settled on the production contract: buy side (lowest eligible ask wins and is paid its own ask), sell side with second price (highest eligible bid wins and pays the runner-up's bid), a bidder who could not pay left out by name, and a tie to the earlier submission. The second price reveals the runner-up's bid by design. Only the cash leg settles. |
| **Invest together** | A fund or angel round; backers pooling into one recipient | Totals sealed amounts; charges each backer their own | Run on testnet against a public round and an organizer. Hiding the amounts and charging each backer their own cannot both be had: the charges are public at settlement. |
| **Decide together** | Votes, approvals, committee decisions | Counts sealed, signed ballots; publishes only the winner; the winner decides where the pool goes | Run on testnet against an open poll and a 3-of-5 multisig, on a local host. Weight is money (a deposit), not people; the count cannot be checked by anyone but the host. |
| **Pay people** | Payroll, grants, contractor pay | Pays a pool to recipients. A pay run can use fresh one-time addresses so the chain cannot name the payee, and each payee gets a signed private receipt. **The amounts stay public on NEAR.** | Run on testnet against a public pay run, on a local host, and on a real hardware room with payee-signed invoices and an auditor pack (see the entries below). Say "private who, with private receipts", never "confidential amounts". With distinct, unchanged salaries an observer still links the same person across months by amount. At most 8 recipients per settlement. |
| **Agents together** | Teams of AI agents buying, trading or pooling | A limited key lets an agent do one thing only; the rules bound what a hijacked agent can do | Limited keys, SDK, API and MCP tools run on testnet; swarm demos are simulations. |
| **Share compute** | Pooled AI credits for a private request | Members pool credits; the room runs one request | Simulation only; set aside. |
| **A network of rooms** | Many groups on one contract; one member in several | Listing, finding and joining rooms | Live on testnet. Rooms do not yet interact with each other. |

*Private system* and *collaborative system* are not separate products. They are the umbrella: anything that has to coordinate privately while being held to public rules.

## Rules for writing

1. Plain words first. A technical term appears one screen down, once, with its plain meaning.
2. A claim says what ran, where, and what did not (a local host is not hardware; one operator is not independent users).
3. Deposits and balances are public on NEAR. What stays private is what members bid, vote or decide.
4. Every new term gets a layman line next to it.
5. The release cap is paced over a **window of twice the exit timer**, and is only as strict as that timer: always state it in real time ("25% per 27 seconds at a 24-block timer"), never as "at most X% per epoch", and never imply the cap alone bounds how fast funds can leave. A real group must choose its timer on purpose.
6. Payroll and anything like it is "private who, with private receipts". A payment is a public NEAR transfer, so its amount is public; never write "confidential amounts" or "shielded allocations".
7. Say what is sealed and what is not. Invoices are sealed to the room; statements are sealed to the payee; the auditor pack is sealed to the auditor. The pre-flight, invoice check and auditor verification take plain JSON, so run them on your own machine (or locally in the SDK) if the request itself must not be seen. Never call the pre-flight "confidential" without saying so.
8. The advice is advice. The model never approves, blocks, signs or sees an identity; the deterministic pre-flight is the decision.
