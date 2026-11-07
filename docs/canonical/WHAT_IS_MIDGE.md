# What Midge is, and how far the architecture carries it

*Written 2026-11-04 as the source text for the site and the submission. It says what the idea is, then checks it against what is built. Where the two differ, it says so. Hero wording is a draft awaiting a decision (see the end).*

## The idea

A **syndicate** is a group of people, companies or AI agents acting together under shared rules, with a private room to decide in. **Midge is the network where such syndicates are created, found and joined.**

- One contract hosts many independent syndicates, each with its own rules.
- They can be listed, a member can find all of theirs, and one agent can sit in several at once.
- A "private system" is anything that has to coordinate privately but be held to public rules: a fund, a DAO, a lending desk, a swarm of agents.

Underneath is one pattern, repeated in every syndicate:

1. a **private room** to deliberate in;
2. **rules fixed in public** that bound what the room can do, enforced even against a valid signature;
3. **a way out** that any member can use alone.

The docs call this *constrained arbitration with independent recovery*. Money is where the pattern is easiest to prove, so it is bounded first. It is not the whole idea: the whitepaper says Midge "is not a single trading bot or lending tool" but a network.

*(Superseded 2026-11-07: the insect and bird names are now internal code names only; see the glossary.)* The code's names: **flyers** (members) form a swarm; a syndicate is **hatched**; the **Nest** (the contract) holds the money; the **Roost** (the private room) deliberates; **hatch_out** is the exit.

## The layers

| Layer | In plain words | Status on 2026-11-04 |
|---|---|---|
| **Syndicate** | The unit: members, a private room, fixed rules, an exit. **Flash** (one task, then done) or **Dark Vault** (lasts across rounds). | Flash live on testnet. Dark Vault is covered by a Rust test and a model, never run live. |
| **Network** | Many syndicates in one contract; discovery; an agent in several at once | Live on testnet |
| **Facilities** | Kinds of syndicate built on top: private credit and repo, block trades, payroll, angel rounds, shared AI compute | Credit, block trades and compute are simulations in JavaScript. Payroll and angel rounds are planned. |
| **Agents** | The network is operated by software: MCP tools, an SDK, an HTTP API with streams, scoped agent keys, pay-per-request between agents | Interfaces and scoped keys live; pay-per-request is a simulation |
| **Beyond NEAR** | A syndicate can control addresses on Bitcoin, Ethereum and Solana | One verified signature; nothing broadcast |

## How faithfully the architecture captures it

| Part of the idea | What exists | Fidelity |
|---|---|---|
| Rules fixed in public, enforced against a valid signature | The Nest's immutable release policy, signature binding, replay protection; attacks rejected on chain | **Strong.** Live, with attack evidence. |
| An exit anyone can use alone | `hatch_out` with a timelock; exact refunds checked from receipts | **Strong.** Live. |
| A private room that cannot hold the money | Sealed bids; the Roost totals and signs only within bounds; two attested backends; an advisor proposes a split | **Strong for one job** (totalling bids, proposing a split). |
| Many syndicates, a network | One contract, list and member views, an agent in several syndicates | **Partial.** Discovery and bookkeeping; syndicates do not interact. |
| Operated by agents | Every route, SDK method and MCP tool exercised; scoped keys bound a compromised agent | **Strong.** |
| Different kinds of private system | RFQ, OTC and compute as separate JavaScript classes | **Weak.** Simulations. |
| Reach beyond NEAR | Derived addresses; one verified signature | **Weak.** |

## Where the architecture falls short of the idea

1. **The room does one thing.** It sums bids and, with the advisor, proposes a split. It cannot run a negotiation, a vote or a margin check.
2. **A rule is only recipients, a per-settlement cap and a deadline.** (The cap was long described as per epoch; E-ONGOING-01 showed it bounds each settlement, not the pace.) That is far from "any private system".
3. **Facilities are not part of the architecture.** The contract knows two syndicate types. "Private credit" and "block trade" exist only as models, so the network does not yet host different kinds of system.
4. **Pods are a model and the Dark Vault lifecycle has not run live.** A pod's capital cap is a number nothing enforces.
5. **The network is thin.** Nothing lets one syndicate invite another, carry reputation or compose with others.

So the architecture proves the **pattern** for pooled money and for agents operating it. The **generality** is described in the docs more than it exists in the code. The site can say: here is the pattern, proven live for pooled money and agent operation, and here is the road to other kinds of system. It must not present facilities as running products.

## The seam that would carry the bigger idea (not built)

A first-class **facility or room program**: the contract knows what kind of syndicate it is, the policy expresses more than recipients and caps, and the room runs a defined procedure. This is real design work and needs a decision before the contract is touched.

## Hero draft (decision pending)

- **Headline:** A network of private rooms with public rules.
- **Subhead:** On Midge, any group forms a syndicate: a fund, a DAO, a swarm of AI agents. Members decide together in private, and what the group can do with the money is fixed in public. Every member can walk out with their own share.
- **Tagline:** Private syndicates for private systems.
- **Small print:** Live on NEAR testnet. A prototype with no token.

Wording rules: no product jargon above the fold (Roost, Nest, hatch, TEE, attestation appear one screen down, each explained when first used); "members" before "flyers"; never "trustless", "MEV eliminated" or an unqualified "hardware-secured"; deposits and balances are public on NEAR and the page says so; "leave" carries its condition ("if the organizer disappears", because the exit opens after a timeout).

## Naming: settled

Decided 2026-11-07: the concept is **private rooms with public rules**, and one vocabulary is used on every public page. See `docs/GLOSSARY.md` for the words, their code names and the layman versions. In short: a **group** (code: syndicate) has a **room** (code: Roost) run by a **host**, **rules** (code: Nest, the contract) and an **exit** (code: `hatch_out`). The tagline "Private syndicates for private systems" and the names "Autonomous Syndicate Network" and "Private Syndicate Network" are retired from public copy; the code keeps its names because the contract is deployed.
