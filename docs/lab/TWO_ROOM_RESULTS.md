# Two-room agreement: results on testnet

*Experiment `E-TWO-ROOM-LIVE-01`, run `20261107T092049Z-2727`, PASS on the first run (48 of 48 assertions; log re-derived intact). Predictions were written in `E-TWO-ROOM-LIVE-01`'s hypothesis and `TWO_ROOM_SPEC.md` before the run. Contract: `Cb2iAamX…` (deployed 2026-11-07 09:25 UTC, tx `GxUNHwwM…`, 15 syndicates intact across the deploy).*

## What was run

Four two-room syndicates on the live contract, three or four members each depositing a common 0.05 NEAR:

| Scenario | Rooms | What happened |
|---|---|---|
| **Attacks** | Room A is a real Roost; room B is a plain signing key we hold, standing in for a compromised room | Room A alone through the ordinary entry point: **refused** (it is a two-room syndicate). Room B signing a different, greedy charge set: **refused**. Room A's signature supplied twice: **refused**. Every escrow was unchanged and nothing was in flight. The honest pair then settled, and the recipient received exactly 0.06. |
| **Honest** | Two real Roosts with different keys | Same signed inputs, sealed separately to each room: **byte-identical messages**; settlement succeeded; the recipient received exactly 0.06; each member got back exactly their deposit less their own amount (0.04, 0.03, 0.02 of 0.05). |
| **Equivocation** | Two real Roosts | Member d told room A a bid of 0.04 and room B 0.09. The salted digests differed for exactly d; the rooms signed different messages; the contract **refused**; nothing moved. After both rooms excluded d they signed the identical message and settled. d was not charged and got back the full 0.05. |
| **Room gone** | Room A alone | Room A could not settle without room B (refused). After the exit timer every member exited alone and recovered the full 0.05. |

A two-room settlement burnt about **7.0 TGas** (6.96 and 6.98 in the two runs). I did not measure a single-room charged settlement under the same conditions, so I make no ratio claim.

## What this shows

- A settlement on a two-room syndicate needs both signatures over one message. A single signature, one room twice, and two rooms that computed different charges each move no money.
- The agreement is real, not luck: two independent Roosts reach the same message because their order hash and tie-breaking depend only on the round and the inputs.
- A member who lies to one room cannot make the rooms agree, and cannot be quietly charged. The coordinator finds them from digests that reveal no amount.
- If one room is gone, nothing settles but no one loses money: the exit is unchanged.

## What this does not show

- **Independence.** One operator ran every account, the coordinator and both Roosts. Two rooms under one operator can still collude or share a bug.
- **Hardware.** Both Roosts were local with a simulated attestation provider. Nothing here shows host-blind processing.
- **The greedy room is a stand-in.** A real Roost refuses to sign anything it did not compute, so the lying room in the attacks was a key we hold.
- **Confidentiality is worse, not better.** Both rooms read every input, and the coordinator sees the salted digests.
- **Liveness is worse.** If either room is down, nothing settles.
- Tie-breaking removes time priority, and a member could grind account names to bias a tie.
- No third-party audit.
