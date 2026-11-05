# Midge site: direction and spine (agreed 2026-11-04)

The source text is `docs/canonical/WHAT_IS_MIDGE.md`. This file records what was decided for the site rebuild, so the build and later edits follow it.

## Direction: C, a light page with dark motion stages

- A light editorial page for reading (the current palette and type: Newsreader, Geist, Geist Mono).
- A full-bleed dark hero, then one framed dark "stage" per concept, each with one motion graphic that explains that concept. This is how Agentcard works below its hero (measured: hero 30/255 brightness, body 174-244/255).
- Motion is built like Tollgate's: vanilla canvas, requestAnimationFrame and IntersectionObserver, no animation library. A scene runs only while it is on screen.
- Every scene has a reduced-motion fallback: one still frame that tells the same story.
- No "lousy diagrams": the animations carry the explanation.

## The spine: 12 levels, in the order of the idea

| # | Level | What it says | Motion stage |
|---|---|---|---|
| 0 | Hero | A network of private rooms with public rules. *Private syndicates for private systems.* | Many rooms form across a field, each glowing while it deliberates; flyers move between them, one agent sitting in several |
| 1 | The problem | Acting together in public leaks your moves; going off-chain means handing over keys; an enclave that can sign anything is a new single point of failure | Three failures, each struck through in turn |
| 2 | The pattern (three chapters) | Every syndicate is a room, rules and an exit | Room: bids scramble into ciphertext, only the result comes out, two room kinds. Rules: payouts pass the policy wall, thief and replay bounce. Exit: the room goes dark, a timer runs, a member leaves with exactly their share |
| 3 | The syndicate | Flash (one task) or Dark Vault (lasts across rounds), with pods inside | A room that forms and dissolves beside one that persists through epochs; pods marked modelled |
| 4 | The network | One contract, many syndicates, findable and joinable | The field zooms out to the contract holding them all; labelled honestly: rooms do not interact yet |
| 5 | Private systems | Credit and repo, block trades, shared AI compute, payroll, angel rounds | One small animation per kind, each with a status badge |
| 6 | Who joins, and how | A member is any NEAR account: people, DAOs, institutions, AI agents (MCP, SDK, API, scoped keys) | An agent console receives an injected instruction, and each attempt is refused by its key (the Security demo) |
| 7 | Architecture across TEEs | Midge's private work runs inside secure hardware, on NEAR AI Cloud and in our own program on Phala, and every result is settled and enforced on NEAR L1 | The model's proposal flows to the Phala program and then to NEAR; a lying answer is stopped at each layer |
| 8 | Beyond NEAR | One syndicate identity controls addresses on Bitcoin, Ethereum and Solana | One identity branching into three chains; "one signature, nothing broadcast" |
| 9 | Proof | Check it yourself | A grid of real testnet transactions, each dot linking to NearBlocks; live verify panels |
| 10 | Live, modelled, next | Honest status per layer | A status map of every layer |
| 11 | Try it | Run it yourself, explore the live contract, a browser playground | Opens the test environment |

## Decisions from the discussion

- **Midge is broader than pooled money.** It is a network of private rooms with public rules for any private system. Money is where the pattern is easiest to prove, so it is bounded first.
- **Members are not only agents.** People, DAOs, institutions and AI agents all join the same way: a NEAR account. DAO membership is supported by the contract but has not been run, and the site says so.
- **The division of work across TEEs:** the NEAR AI Cloud model makes the judgment call (for example the split) and sees only what it is given, never an individual bid. Our program on a Phala confidential machine opens the sealed bids, adds them up exactly, and signs only within the total. NEAR L1 settles and enforces the group's rules, and runs the exit.
- **Wording:** talk in terms of the architecture running across TEEs (NEAR AI Cloud, and our self-hosted program on Phala) and settling and being enforced on NEAR L1. Plain words. Not "NEAR AI decides, Phala holds, NEAR enforces".
- **Status of the link:** both TEEs and NEAR are each proven live, and NEAR AI's answer has been settled on NEAR through a locally run Roost. No single run yet has the Roost on Phala and the model on NEAR AI. The site shows this as "pending" until that run passes; the user said not to run it yet.
- **The model-sealed Roost** (NEAR AI doing the arithmetic itself, three runs agreeing) is the lighter variant; the Phala program plus NEAR AI split is the main design.
- **Honesty rules:** every modelled part carries a badge (live, tested, model, planned, pending); the proof grid uses only real transactions; deposits and balances are public on NEAR; no "trustless", "MEV eliminated" or unqualified "hardware-secured".
- **Test environment order:** explainer first, then the live explorer (reading the contract from the browser via public RPC, which allows cross-origin requests), then the in-browser playground (labelled a simulation).
- **The site can change later:** it is static files, so sections are edited and redeployed as evidence changes.
- The AGENTS.md "UI freeze" is overridden for this work by the user's instruction.

## Revision 2026-11-05: simpler

The user asked for a simpler page that is easier to grasp, without the status badges.

- **Eight sections instead of twelve:** hero, the problem, how it works (room, rules, exit), who uses it (members, uses, one-off or ongoing, the live network), AI agents, under the hood (the architecture flow and the three pieces drawn), proof, try it. Syndicates, network, private systems and who joins were merged; "Beyond NEAR" became one line under "Next".
- **Plain words:** no TEE, attestation, nonce, policy hash or hatch_out on the page or in the stages; the technical terms stay in the docs.
- **No status badges.** Honesty is carried by one plain list in the proof section, "What works today": running on testnet, built but not yet live, next. The one-line note under "Who uses it" says the lending, trading and AI examples are simulations.
- **The hero is a rendered image** (Blender, Cycles), so it always loads; the live three.js scene fades in over it where the device can run it (not under reduced motion, software WebGL, Save-Data or under 4 GB). The console says why when the live scene is off.
