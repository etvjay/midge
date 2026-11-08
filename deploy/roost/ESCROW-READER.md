# Escrow reader (optional)

When the Roost is started with these two environment variables, every charged run first reads, from the contract, what each bidder
(and each account that will be charged, such as a ballot's whole roll) holds, and leaves out bidders who cannot cover their
worst-case charge. Without them nothing changes.

| Variable | Example | Meaning |
|---|---|---|
| `ROOST_RPC_URLS` | `https://a.rpc,https://b.rpc` | **two or more different** NEAR RPC providers; they must agree. One provider, or the same one twice, is refused at start. |
| `ROOST_CONTRACT_ID` | `c.fly-1793636729.testnet` | the coordinator contract (required when URLs are set) |

## What it does
- It reads at one final block. Every provider is asked for that block **by its hash** and must report the same height and time, and every
  reply must come from that block. The block is recorded in the signed order hash (not in payrun's, whose published formula auditors
  recompute; payrun reports it in the outcome).
- Worst case per bidder is the most the program could charge them: pool, their amount; auction, price x the whole lot (first- and
  second-price) or price x the units they can be filled (uniform); quote (lend), the amount; cross, units x the public reference price;
  RFQ (sell), units x their bid. Programs with one payer (quote buy, RFQ buy, payrun) refuse, keeping the queue, if that payer cannot
  cover its own limit.
- If a provider is down, slow, behind, or disagrees, the run answers **503** and the queue is kept; repeat the call. A read older than 30 s is
  refused.

## What it does not do
- It makes a rejected settlement **much rarer, not impossible**. A member whose exit timer has run can still leave between the read and the
  payout, and the contract then rejects the round (no funds are at risk). `escrowBlock.raceFree` is an **estimate**: true only when
  the first block at which anyone could leave is later than the read's block plus its age (at one block a second), the 30 s a read may be used for, and
  30 blocks for the payout. It is not a guarantee.
- It trusts the providers to answer honestly. Two that must agree, and a recorded block, narrow that; they do not remove it.

## When the contract rejects a signed settlement
Nothing changes on chain, so the round's nonce is the same. `POST /v1/rooms/abandon` (or `POST /abandon` on the Roost server; admin key) gives
the signed round up so it can run again, and members re-submit with a higher `seq`.
- The reply and the in-memory record (newest 100, **lost on restart**) name what was given up: order hash, message hash, allocation and
  charge hashes, and the signature. The public event stream carries only the order hash and message hash.
- The abandoned signature **stays valid on chain**. If conditions change (say, the unfunded member deposits) and it reaches the chain first,
  it can still land. The contract lets only one settlement land per round nonce, so the coordinator holds two valid settlements for one
  nonce and the chain decides which lands first.

## Two-room settlements
Two rooms must sign the same message. Each reads the chain on its own, so give both the **same block**: pass `escrowBlockHash` (a block hash)
to `run` (or in the body of a Roost server route) and both read that block. Without it two rooms normally read different blocks and sign
different order hashes, and the contract rejects the pair.

## Not in `docker-compose.yml`
These variables are deliberately not in `docker-compose.yml`: that file's hash is part of the attestation, so changing it is a
deliberate step together with the image rebuild.
