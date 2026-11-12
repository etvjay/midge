# Words used for Midge

Decided on 2026-11-07. Midge uses one vocabulary on every public page. The site, the README, the pitch and the submission use the words in the first column of the table below, and the code keeps its older names, because the contract is deployed and its method names are part of its interface.

## The idea in one sentence

Midge is a network of private rooms with public rules. A group decides together in a private room, what the group can do with its money is fixed in public, and any member can leave with their own share.

## The words

| Say this | It means | Code and older names |
|---|---|---|
| Midge | The network and the product | Fly, the old codename (`fly-coordinator`, `FLY_*`, `c.fly-…`) |
| Group | The people, companies or AI agents that act together | syndicate (`get_syndicate`, `hatch`), swarm, pod |
| Room | The private place where members' sealed inputs are opened and the result is worked out | the Roost |
| Host | The secure hardware and program that runs a room, which is either our program on Phala or an attested AI model on NEAR AI Cloud | Roost backend (`hosted`, `model-sealed`) |
| Rules | The NEAR contract, which fixes who can be paid, how much can be released in each window and until when, and refuses anything else | the Nest, `fly-coordinator`, the release policy |
| Member | Anyone with a NEAR account who puts money in and takes part | flyer |
| Sealed input | A bid, ballot or amount that is encrypted so only the room can read it, and signed by the member | sealed intent, sealed bid |
| Round | One cycle of sealed inputs, a result and a settlement | epoch, round nonce |
| Settle | The contract pays what the room signed, if it fits the rules | `settle_batch` |
| Exit | Any member takes back what they have left, alone, after a timer | `hatch_out`, escape hatch |
| Open a room | Create a room with its rules | `hatch` |
| Two hosts | One room run by two independent hosts, where both must sign before any money moves | two-room agreement, second room key |
| Advisor | The attested NEAR AI model that proposes how to split a total and sees only the total | advisor |
| Invoice | A payee's own signed statement of what they ask to be paid, with an invoice id, period, chain, destination, asset and amount. It is sealed to the room, so the chain never sees it and only the room reads it, and a round accepts one invoice per id | `signInvoice`, `submitInvoice`, `/invoices`; with `requireInvoices` a pay run checks every line against its invoice |
| Invoice check | Every line of a pay run must match a payee-signed invoice field by field, and one line that differs in amount or destination stops the whole run and keeps the queue. A separate stateless check (`/invoice-check`) takes the invoice and the approved line as plain JSON and is not sealed | `matchApproval`, `midge_check_invoice`, `checkInvoice` |
| Pre-flight check | A check of one payment against the group's rules before anyone asks for it, which looks at whether the destination is allowed, whether the amount is under the per-payment cap and the window total, whether the fee is under its cap, whether the obligation was already used, whether the destination changed since the last run, and whether the amount is far from the last one. It returns blocking and warning findings and says whether a second person should confirm, and it decides nothing and moves nothing | `preflight`, `/preflight`, `payrollPreflight`, `midge_payroll_preflight` |
| Redacted advice | An optional explanation of a pre-flight result by the attested NEAR AI model, which is off by default. The model is sent finding codes and ratios rounded to the nearest 10% and never a name, address, id or exact amount, and both the message and the reply are checked for those and refused if one appears. The pre-flight result is returned untouched beside the advice | `explainPreflight`, `explain: true` |
| Statement | The sealed receipt that each payee gets for their line, with the gross, the deductions, the net, the invoice's hash, and a proof that the line is inside the run's root, which the order hash on chain commits to. Only that payee's key opens it | `verifyStatement`, `receipts.js` |
| Auditor pack | Chosen lines of a pay run, opened for an auditor. Only the employer can authorise it, with a request signed by a key of the employer's NEAR account and checked against the chain, over the run, the exact lines and the auditor's key. The pack is sealed to the auditor and holds only those lines with their proofs, and the auditor checks it against the order hash on chain. The room does not remember earlier rounds, so checking that something was already paid is the pre-flight's job and not the room's | `/audit/open`, `openAuditLines`, `verifyAuditorPack`, `midge_verify_auditor_pack` |
| Account check | The room accepts a signed input only if every configured NEAR RPC provider confirms that the key belongs to the member's account. If a provider cannot be reached or keeps rate-limiting, the input is refused with "could not check" and nothing is queued, so one unreliable provider stops intake. Only a provider that clearly says the key does not exist makes the result "not a key" | `makeAgreeingAccountKeyCheck`, `ROOST_ACCOUNT_CHECK_RPC_URLS` |
| Signed-only room | A pinned hardware room that refuses every input that is not sealed and also signed with the member's own account key for the current round. The setting is part of the attested compose file, so a member can verify it | `ROOST_REQUIRE_SIGNED_INPUTS=1`, `signedBidParams` |
| Abandon a round | The room signs once per round. If the contract refuses that signature, the nonce does not change, so the coordinator gives the signature up and the round can run again. The signature stays on record and still counts as valid on chain | `abandonRound`, `abandonSignedRound` |
| OutLayer program and caller | A Rust program that runs on OutLayer's hardware and signs a Midge settlement with a protected secret that nobody can read, and a small NEAR contract (`outlayer/caller`) that triggers it and receives the result in a callback. It is the signing step only and not a room | `outlayer/room-signer`, `outlayer/caller`, `request_execution` |
| One-off or ongoing room | A room that closes after one task, or one that lasts across rounds | Flash, Dark Vault |

Names we do not use in public copy are syndicate, swarm, flyer, hatch, Roost, Nest, pod, facility, FAR shard, TEE (say "secure hardware" and name it once), "trustless", "MEV eliminated", and an unqualified "hardware-secured". Third-party product names (OutLayer, Chain Signatures, 1Click) are named only where we use them.

Decided on 2026-11-10: the landing page's "Under the hood" section may show the code names (Roost, Nest, flyers, hatch, escape hatch, `settle_batch`, two-room agreement, advisor), each once and beside its plain word, so that readers of the code and the contract can map one to the other. They appear nowhere else on public pages, and `tests/site-home.test.js` checks it.

## What rooms are for

One pattern, which is a private room with public rules and an exit, serves several kinds of group. The status column says what exists today and not what is planned.

| Family | Examples | What the room does | Status |
|---|---|---|---|
| Buy and sell | Auctions and token sales, lending quotes, and big trades between two desks | Opens sealed bids or quotes, and the rules fix the winner and the price, and losers get their deposit back | Auctions (first-price, second-price and uniform-price), lending quotes (first-price and second-price), two-sided requests for quote (makers quote a bid and an ask, and the taker's side stays sealed) and block trades (a pro-rata cross) each ran on testnet against a public version, on a local host. Pools, a lending quote and the sealed-quote request for quote also ran on a real hardware room and settled on the production contract. On the buy side the lowest eligible ask wins and is paid its own ask. On the sell side with second price the highest eligible bid wins and pays the runner-up's bid, a bidder who could not pay is left out by name, and a tie goes to the earlier submission. The second price reveals the runner-up's bid by design. Only the cash leg settles |
| Invest together | A fund or an angel round, with backers pooling into one recipient | Totals the sealed amounts and charges each backer their own | Ran on testnet against a public round and an organizer. Hiding the amounts and charging each backer their own cannot both be had, because the charges are public at settlement |
| Decide together | Votes, approvals and committee decisions | Counts sealed, signed ballots, publishes only the winner, and the winner decides where the pool goes | Ran on testnet against an open poll and a 3-of-5 multisig, on a local host, and a signed ballot ran on a real hardware room and settled on the production contract. Weight is money (a deposit) and not people, and nobody but the host can check the count |
| Pay people | Payroll, grants and contractor pay | Pays a pool to recipients. A pay run can use fresh one-time addresses so the chain cannot name the payee, and each payee gets a signed private receipt. The amounts stay public on NEAR | Ran on testnet against a public pay run, on a local host, and on a real hardware room with payee-signed invoices and an auditor pack (see the entries above). Say "private who, with private receipts" and never "confidential amounts". With distinct, unchanged salaries an observer can still link the same person across months by amount. A settlement pays at most 8 recipients |
| Agents together | Teams of AI agents that buy, trade or pool | A limited key lets an agent do one thing only, and the rules bound what a hijacked agent can do | Limited keys, the SDK, the API and the MCP tools run on testnet, and the swarm demos are simulations |
| Share compute | Pooled AI credits for a private request | Members pool credits and the room runs one request | A simulation only, and set aside |
| A network of rooms | Many groups on one contract, and one member in several | Listing, finding and joining rooms | Live on testnet. Rooms do not yet interact with each other |

Private system and collaborative system are not separate products. They are the umbrella term for anything that has to coordinate privately while it is held to public rules.

## Rules for writing

1. Use plain words first. A technical term appears one screen down, once, with its plain meaning.
2. A claim says what ran, where it ran, and what did not run. A local host is not hardware, and one operator is not independent users.
3. Deposits and balances are public on NEAR, and what stays private is what members bid, vote or decide.
4. Define every new term in plain words where it first appears.
5. The release cap is paced over a window of twice the exit timer and is only as strict as that timer. State it in real time ("25% per 27 seconds at a 24-block timer"), never as "at most X% per epoch", and never imply that the cap alone bounds how fast funds can leave. A real group must choose its timer on purpose.
6. Payroll and anything like it is "private who, with private receipts". A payment is a public NEAR transfer, so its amount is public, and the words "confidential amounts" and "shielded allocations" are never used.
7. Say what is sealed and what is not. Invoices are sealed to the room, statements are sealed to the payee, and the auditor pack is sealed to the auditor. The pre-flight, the invoice check and the auditor verification take plain JSON, so run them on your own machine (or locally in the SDK) if the request itself must not be seen, and never call the pre-flight confidential without saying so.
8. The advice is advice. The model never approves, blocks or signs anything and never sees an identity, and the deterministic pre-flight is the decision.
9. Do not name other projects in order to compare Midge with them or to criticise them. Name a third-party product only where Midge uses it.
