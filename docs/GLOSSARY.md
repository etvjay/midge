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
| **Rules** | The NEAR contract: who can be paid, how much, until when; it refuses anything else | the Nest, `fly-coordinator`, the release policy | the posted budget limits |
| **Member** | Anyone with a NEAR account who puts money in and takes part | flyer | an attendee |
| **Sealed input** | A bid, ballot or amount encrypted so only the room can read it, and signed by the member | sealed intent, sealed bid | a signed envelope only the room can open |
| **Round** | One cycle: sealed inputs, a result, a settlement | epoch, round nonce | one agenda item |
| **Settle** | The contract pays what the room signed, if it fits the rules | `settle_batch` | cashing the cheque |
| **Exit** | Any member takes back what they have left, alone, after a timer | `hatch_out`, escape hatch | your own key to the safe |
| **Open a room** | Create one, with its rules | `hatch` | book the room |
| **Two hosts** | One room run by two independent hosts that must both sign before any money moves | two-room agreement, second room key | two cashiers must both stamp the receipt |
| **Advisor** | The attested NEAR AI model that proposes how to split a total; it sees only the total | advisor | a consultant who sees the sum, never the bids |
| **One-off / ongoing room** | A room that closes after one task, or lasts across rounds | Flash / Dark Vault | |

Names we do not use in public copy: syndicate, swarm, flyer, hatch, Roost, Nest, pod, facility, FAR shard, TEE (say "secure hardware", then name it once), "trustless", "MEV eliminated", an unqualified "hardware-secured". Third-party product names (OutLayer, Chain Signatures, 1Click) are named only where we use them.

## What rooms are for

One pattern (a private room, public rules, an exit) serves several kinds of group. Status is what exists today, not what is planned.

| Family | Examples | What the room does | Status |
|---|---|---|---|
| **Buy and sell** | Auctions and token sales; lending quotes; big trades between two desks | Opens sealed bids or quotes; the rules fix the winner and price; losers get their deposit back | Auctions (first-price, second-price, uniform-price): run on testnet against a public auction, on a local host. Lending quotes and big trades: simulations only. |
| **Invest together** | A fund or angel round; backers pooling into one recipient | Totals sealed amounts; charges each backer their own | Run on testnet against a public round and an organizer. Hiding the amounts and charging each backer their own cannot both be had: the charges are public at settlement. |
| **Decide together** | Votes, approvals, committee decisions | Counts sealed ballots; publishes only the winner; the winner decides a payment | Designed with research, not built. Weight is money (a deposit), not people. |
| **Pay people** | Payroll, grants, contractor pay | Splits a pool among named recipients without showing each person's amount to the others | Planned. The settlement shows each recipient's payment, so per-person privacy needs a design not yet built. |
| **Agents together** | Teams of AI agents buying, trading or pooling | A limited key lets an agent do one thing only; the rules bound what a hijacked agent can do | Limited keys, SDK, API and MCP tools run on testnet; swarm demos are simulations. |
| **Share compute** | Pooled AI credits for a private request | Members pool credits; the room runs one request | Simulation only; set aside. |
| **A network of rooms** | Many groups on one contract; one member in several | Listing, finding and joining rooms | Live on testnet. Rooms do not yet interact with each other. |

*Private system* and *collaborative system* are not separate products. They are the umbrella: anything that has to coordinate privately while being held to public rules.

## Rules for writing

1. Plain words first. A technical term appears one screen down, once, with its plain meaning.
2. A claim says what ran, where, and what did not (a local host is not hardware; one operator is not independent users).
3. Deposits and balances are public on NEAR. What stays private is what members bid, vote or decide.
4. Every new term gets a layman line next to it.
