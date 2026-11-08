# Escrow reader (optional)

When the Roost is started with these two environment variables, every charged run first reads, from the contract, what each bidder
(and each account that will be charged) holds, and leaves out bidders who cannot cover their worst-case charge. Without them
nothing changes.

| Variable | Example | Meaning |
|---|---|---|
| `ROOST_RPC_URLS` | `https://a.rpc,https://b.rpc` | two or more independent NEAR RPC providers; they must all agree |
| `ROOST_CONTRACT_ID` | `c.fly-1793636729.testnet` | the coordinator contract |

- The read is at one final block; the block is recorded in the signed order hash (not in payrun's, whose published formula auditors recompute).
- If a provider is down, slow, behind or disagrees, the run answers **503** and the queue is kept; repeat the call.
- This makes a rejected settlement **much rarer, not impossible**: a member whose exit timer has run can still leave between the read
  and the settlement. The outcome's `escrowBlock.raceFree` says when that cannot happen. If the contract does reject a signed
  settlement, `POST /abandon` (admin key) gives the signed round up so it can run again; members re-submit with a higher seq.
- These variables are **not** in `docker-compose.yml` on purpose: that file's hash is part of the attestation, so changing it is a
  deliberate step together with the image rebuild.
