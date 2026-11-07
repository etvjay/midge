# Comparison results: auctions

*Experiment `E-CMP-AUCTION-01` on NEAR testnet, 2026-11-07. Runs kept as evidence: `docs/lab-runs/20261107T063253Z-15f4` (FAIL: a prediction I made did not hold) and `docs/lab-runs/20261107T064700Z-6ae9` (PASS, after I revised the experiment to claim only what is true). Four earlier runs failed on bugs in my own scripting (stale reads, a reserve price set above every bid, bidding too slow for the auction window, a sniper timed too late) and are not kept. Every number below is read from the two kept logs.*

## What was run

Five bidders value one lot at 0.060 (a), 0.045 (b), 0.030 (c), 0.020 (d) and 0.055 NEAR (s, a sniper who can read the chain). Seller r. Four auctions:

| Auction | What it is |
|---|---|
| **Public open auction** | Our own minimal English-auction contract, deployed fresh for the run (the common on-chain pattern, not anyone else's contract). Honest bidders raise by 10% up to their value; the sniper watches and bids near the end. |
| **Midge sealed first-price** | Everyone deposits 0.07; bids are sealed to the Roost (a local one); a, b, c, d, s bid 80% of value, the textbook shade for five bidders. |
| **Midge sealed second-price (Vickrey)** | Same, with true-value bids. |
| **Midge uniform-price** | 100 units, sealed (price, quantity) bids, one clearing price for everyone filled. Midge only: there is no public uniform-price baseline. |

Settlement uses the new `settle_batch_charged`: the room names what each member pays and the contract caps it at that member's deposit. Losers and the winner's remainder are refunded exactly, on exit.

## Results

| | Public open | Midge first-price | Midge second-price | Midge uniform (100 units) |
|---|---|---|---|---|
| Who won | **s**, the sniper (values it 0.055) | a (0.060) | a (0.060) | a 40, s 25, b 35 of 50; c, d nothing |
| Price paid | 0.0505 | 0.048 (a's own bid) | 0.055 (the second bid) | 0.0007 per unit, 0.07 in all |
| Went to the highest-value bidder? | **No** | Yes | Yes | n/a |
| Valuations an observer can attribute to a named bidder within 5% | **3 of 5** (from their public bids) | **0 of 5** | **0 of 5** | **0 of 5** |
| What the chain still publishes | every bid, in order (20 bids) | the winner and the price | the winner and the second-highest bid, unattributed | the winner list, charges and clearing price |
| Gas for the whole auction (all bidders, settlement, exits) | 52.3 TGas | 47.2 TGas | 47.3 TGas | 48.1 TGas |
| Wall time | 423 s (an open auction runs for its window) | 98 s | 111 s | 100 s |

Also measured, on a separate syndicate with a signing key we hold (a stand-in for a compromised room):
- A charge above the member's deposit, charges that do not sum to the payout, and an ordinary settlement signature on the charged entry point were each refused by the contract; the escrow stayed intact.
- **The risk that remains, measured:** a room that stays within the rules can still charge one member their entire deposit. Per-member charges cap the harm at that member's deposit. They do not remove it.

## What this shows, and what it does not

- **Sniping is real in a public auction and sealing removes it.** The public state gave the sniper a winning bid, and when its bid landed before the end the lot went to a bidder who values it less (0.055 against 0.060). Under Midge nobody can see a bid to top, and the highest-value bidder won both sealed auctions. **But the sniper landed only once in three tries:** bid latency here is about 7 to 25 blocks and varies, and a late bid is refused by the contract. Sniping is available, not guaranteed. (The run I kept as a FAIL, `…15f4`, is the one where it missed and I had predicted it would not.)
- **Sealing hides losing bids, not everything.** An observer attributed no valuation to a named bidder in any Midge auction. The settlement still publishes the winner, the winning price and, under Vickrey, the second-highest bid (0.055, which here is exactly the sniper's value, though the chain does not say whose).
- **Midge is not more expensive here.** My prediction that it would cost more gas than the public auction was wrong: a public open auction needs many bids (20 here) and burnt 52.3 TGas against 47.2 for a sealed first-price round, a ratio of 0.9. (In the investing comparison Midge was about ten times a direct payment, because the baseline there was one transfer per backer. The right baseline depends on the job.)
- **What Midge costs instead:** capital and waiting. Everyone deposits 0.07 to run an auction that settled at 0.05, and losers get their money back only after the exit timer. Deposits must be equal to hide the bids; if each deposits their own bid the deposit leaks it (see the investing comparison).
- **Revenue:** the seller received 0.0505 (public, after the sniper), 0.048 (first-price) and 0.055 (second-price). That is one scripted instance with assumed strategies, not a revenue ranking; the textbook result is that these formats earn about the same in equilibrium and I have not tested that.

**Not shown:** independent bidders (one operator ran every account; the honest bidders are scripted; only the sniper adapts); a hardware room (the auction code is not in the Phala image yet); a public uniform-price baseline; Uniswap's continuous clearing auction, or a Dutch auction (compared, if at all, from documentation); and bid authentication (GAP-023: nothing proves a sealed bid comes from the account it names).
