# Two-sided RFQ on testnet: results

*Experiment `E-CMP-RFQ-01`, run `20261107T124146Z-ca19`, PASS, 73 assertions, log re-derived intact. Predictions were written in `PROGRAMME_PLAN.md` before the run. The offline program tests are `E-RFQ-PROGRAM-01` (15 deliberate breaks, all caught). The baseline is our own `contracts/public-market`, deployed fresh and deleted afterwards.*

## What was run

One taker and four makers with two-way quotes (NEAR per unit): m1 bid 0.00195 ask 0.00205; m2 0.0019 / 0.0020; m3 0.00197 / 0.0021; m4 0.00185 / 0.00215. 10 units. A buy RFQ (limit 0.0022) and a sell RFQ (limit 0.0018) on each path.

| | Open RFQ | Midge sealed RFQ |
|---|---|---|
| What the taker states | side, size and limit **on chain** | sealed to the host; makers never see it |
| Taker's side, size, limit an observer reads before settlement | **3 of 3**, both RFQs | **0 of 3** |
| Makers' quotes an observer reads | 4 of 4 (one-sided, after reading the request) | **0 of 4** (two-way, sealed) |
| Buy winner | m2 at 0.002 | m2 at 0.002 |
| Sell winner | m3 at 0.00197 | m3 at 0.00197 |
| Money (buy) | m2 received exactly 0.02; the taker was refunded the 0.002 difference | m2 received exactly 0.02; the taker's escrow fell by exactly 0.02 |
| Money (sell) | the taker received exactly 0.0197 | the taker received exactly 0.0197; m3's escrow fell by exactly 0.0197 |
| What the chain shows afterwards | everything | who paid whom and the notional: no side field, no units, no limit, no price per unit |
| Gas, both RFQs | 29.1 TGas | 28.8 TGas (0.99 times) |
| Wall time (buy / sell) | 93 s / 88 s | 4.4 s / 4.6 s |
| If the host never signs | n/a | nothing settles; all five exit with the full 0.03 |

## What this shows

- **The taker's side is the secret that matters, and sealing keeps it.** In the open RFQ every maker reads the side, size and limit before quoting; in the sealed RFQ makers quote two ways without knowing which way the taker trades, and nobody learns the side before settlement.
- **The side leaks at settlement.** Who pays whom reveals buy or sell, and the notional is public. What stays hidden is the number of units and the price per unit: the notional (0.02 and 0.0197) is divisible by 14 and 9 of the unit counts from 1 to 100, so it does not identify them. The order hash carries the taker's secret salt for this reason; without it an observer could recover both by trying every pair, and the host refuses a request without one.
- **The right maker won in both directions**, with exact money.
- **Two rounds in one room worked:** the second RFQ ran on the room's rotated nonce after the first settled part of the escrow, and everyone exited with exactly the remaining escrow.

## What this does not show, and a caveat on the timing

- **The timing flatters Midge.** The sealed room's deposits and hatch happened once, before the two RFQs, and are not in the 4.4 and 4.6 seconds. An open RFQ runs for its window (150 blocks here) because makers must have time to see and answer a public request. The gas totals include the hatch and all five deposits for the sealed path and are about equal (0.99 times); that is the fairer cost comparison.
- **Makers skewing their quotes is not modelled.** The reason to hide the side is that a maker who knows you are buying will skew its price. In this run the makers quote their true prices on both paths, so no price difference appears. What the run shows is only that the side is public in one path and not in the other.
- **Only the cash leg settles.** Nothing delivers the asset.
- **Independence and hardware.** One operator ran every account and the host; the makers are scripted. The host was local with a simulated attestation provider; signed inputs used real NEAR keys and the real lookup.
- **Second-price** was tested offline, not live. A late sniper was shown for lending quotes, not repeated here.
- **A dishonest host** could pick the wrong winner within the policy; two hosts would reduce that. This run used one.
