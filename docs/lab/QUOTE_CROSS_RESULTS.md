# Lending quotes and block trades: results on testnet

*Experiments `E-CMP-QUOTE-01` (run `20261107T105526Z-7aa0`, PASS, 93 assertions) and `E-CMP-CROSS-01` (run `20261107T110708Z-d81d`, PASS, 60 assertions; the first run, `20261107T110304Z-2d88`, FAIL on a pre-registered gas band, is kept). Predictions were written in `RFQ_PLAN.md` before either ran. Every number below is read from those logs. The room programs are `quote-programs.js`; the baselines are our own `contracts/public-market`, deployed fresh for each run and deleted afterwards.*

## Lending quotes

Five lenders with private costs of funds (basis points a year): a 450, b 400, c 500, d 600, s 420 (s can watch the chain). A 0.05 NEAR loan, maximum 700 bps.

| | Open reverse quotes | Midge sealed first-price | Midge sealed second-price |
|---|---|---|---|
| Who won | **s** (cost 420) | b (cost 400) | b (cost 400) |
| Rate the borrower got | 449 bps | 450 bps | **420 bps** |
| Did the lowest-cost lender win? | **No** | Yes | Yes |
| Lenders' quotes an observer can read | 4 of 4 honest lenders (12 quotes) | 0 of 5 | 0 of 5 |
| Costs attributable within 10% from public data | 3 of 4 | 0 of 5 | 0 of 5 |
| Is the agreed rate on chain? | yes | **no** | **no** |
| Gas, whole round | 36.6 TGas | 43.5 | 43.6 |
| Wall time | 265 s | 36 s | 36 s |
| Borrower received | 0.05 | 0.05 | 0.05 |

- **The sniper landed on its first try**, 3 blocks before the end. The honest lenders had settled on b at 450; s undercut to 449. In the auction comparison the sniper landed once in three tries; here once in one. Sniping is available, not guaranteed.
- **What sealing changed, and what it did not.** It changed who wins: the lowest-cost lender won both sealed rounds, and in the open round a lender with a higher cost took the loan. It did **not** give the borrower a better rate than the sniped open round in the first-price case (450 against 449; the sniper's undercut happened to help the borrower by 1 bp). The borrower's best rate came from second-price, 420, because lenders could quote their true cost safely.
- **Sealing hides the quotes, and also the rate.** The agreed rate is not on chain for Midge at all: the settlement carries only who pays and who is paid. The borrower and the winning lender know it from the host's signed outcome, which nothing on this chain enforces.
- Midge cost 1.2 times the open round's gas here, inside the band predicted (0.5 to 1.5), and was about seven times faster, because an open round runs for its window.
- If the host never signs: nothing settles and all five lenders exit with the full 0.05.

## Block trade

Reference price 0.0005 NEAR a unit; per-order cap 100 units. Buyers b1 (100 units, limit 0.00055) and b2 (50, 0.000525). Sellers s1 (80, 0.000475), s2 (90, 0.0005) and f, a late seller with an extreme limit (40 units, 0.00001).

| | Open order book | Midge sealed cross |
|---|---|---|
| Side, size and limit an observer reads before the cross | **5 of 5 desks, exactly** | 0 of 5 (all escrows equal) |
| What the watcher could see before it crossed | sell units 170 against buy units 150 | nothing |
| What the settlement reveals | everything (it is the book) | each matched desk's side and filled units (5 of 5); **no limit (0 of 5); none of the unfilled units** |
| Units matched | 150 at the reference | 150 at the reference |
| Seller fills | s1 57, s2 64, f 29 | s1 57, s2 64, f 29 |
| Sellers received | 0.075 NEAR | 0.075 NEAR |
| Gas, whole trade | 16.0 TGas | 50.8 (3.18 times) |
| Wall time | 92 s | 37 s |
| Capital locked | 0.081 NEAR (buyers only) | 0.30 NEAR (every desk deposits 0.06) |
| If the host never signs | n/a | nothing settles; all five exit with the full 0.06 |

- **f got no queue position, in both.** An extreme limit (0.00001) bought nothing but qualification: f's fill was 29, the same as the pro-rata share it would get with a limit equal to the reference. Under the first rule I wrote (most aggressive limit first) f would have filled 40 and displaced s2 to 30. That rule was changed before any run (see below).
- **Sealing does not hide what settles.** The matched desks' sides and filled sizes are public after settlement; what stays hidden is each limit and the unfilled remainder. In the open book everything is public the whole time, and a watcher knew the sell side was 20 units long before anyone settled.
- **Midge costs more here:** 3.18 times the gas and 3.7 times the capital, because every desk deposits and exits. My prediction of a gas ratio under 3 failed (run `…2d88`, kept as evidence); the claim is now only that sealed costs more.

## The rule was changed before any run

The cross first filled the most aggressive limit first. Everyone trades at the reference price, so an extreme limit costs nothing and jumps the queue, sealed or not. The rule is now pro-rata: the limit decides only who qualifies; the short side fills in full; the long side fills in proportion to size (largest remainder), with a public per-order cap. The tests for it fail on the old rule and pass on the new one. The original text and the correction are both in `RFQ_PLAN.md`.

## What this does not show

- **Independence.** One operator ran every account, the host and the coordinator. All lenders and desks are scripted; only the sniper adapts.
- **Hardware.** The host is local with a simulated attestation provider; the hardware host does not contain this code yet.
- **Only the cash leg settles.** A loan is funded but the rate, repayment, collateral and default are not enforced. A block trade pays sellers and charges buyers, but nothing delivers the asset: a seller can be paid without delivering.
- **The reference price** is supplied, not verified by an oracle.
- **Over-ordering.** Pro-rata invites it because a trader pays only for what is filled. The per-order cap limits it; this run does not test it.
- **Signed inputs** were not used in these runs; orders and quotes were not authenticated to an account.
- **The mutation check** of the live block-trade experiment, with the old rule restored, failed at its first (program-level) check, so the later live assertions were not separately shown to catch it.
- **A recipient list of at most 8**, so a round has at most 8 borrowers, dealers or sellers.
