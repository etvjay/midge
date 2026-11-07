# Two-room agreement and the exit rule: specification

*Written 2026-11-07 before any contract change. Layman version under each section.*

## What a room is here

A **Roost** is one running copy of the hosted program (exact arithmetic, sealed inputs, signs once). In the combined architecture Phala hosts the Roost and NEAR AI Cloud is an advisor that sees only the total. **Two-room agreement means two Roosts**: the same program, under different operators or on different hardware, each with its own keys.

*Layman:* two separate vaults with two separate clerks doing the same sum. The bank pays only when both clerks stamp the same receipt.

## The change

1. `hatch` takes an optional **second** enclave public key. If given, the syndicate is *two-room*.
2. `settle_batch` and `settle_batch_charged` take an optional **second** signature. On a two-room syndicate both signatures must verify, over the **same** message, each against its own registered key. One valid signature is refused. The same key twice is refused at hatch.
3. A one-room syndicate behaves exactly as today (no change to existing syndicates or their tests).
4. Members seal each input to **both** rooms' intent keys (two ciphertexts). Each room computes independently from its own ciphertexts.

*Layman:* a two-stamp receipt is a new option when you open the vault. Existing vaults stay one-stamp.

## What it does and does not buy

- **Buys:** a wrong or dishonest result needs both rooms to fail. If they disagree they sign different messages, the contract gets no valid pair, and nothing is paid; members use the exit.
- **Costs:** both rooms read the plaintext, so a breach of either leaks the inputs (confidentiality worse). If either room is down, nothing settles (liveness worse).
- **Does not buy:** protection from two rooms that run the same bug or the same operator, and it is not a proof of the count.

*Layman:* it is harder to cheat you, and a little easier to peek at your bid.

## The exit rule (what wins when exit and policy conflict)

The research asks which rule wins when a member exits while settlement is pending or the cap, recipient list or deadline would block it. The rule, which the contract already follows and which I am now stating so a test can pin it:

1. **A member's escrow is theirs to exit with after the exit timer, whatever the policy says.** The release policy limits what the *room* can pay out; it never limits what a member can take back of their own deposit.
2. **Settlement and exit share one balance.** A payout is deducted from escrows when it is settled; an exit returns what is left. They cannot both claim the same coin.
3. **A settlement in flight blocks exit until it resolves** (`is_settling`), so a late room signature cannot race a refund.
4. **After a settlement the exit returns the member's remainder**, which under charged settlement is their deposit less their own charge.

*Layman:* the rules limit what the room can pay out. Your own deposit is always yours to take back after the wait, and a payment and a refund can never spend the same money.

## Tests (written first)

- Contract unit/integration: two valid signatures settle; one signature, the same signature twice, a signature from a key not registered, two different messages, and a one-room syndicate given two signatures are each refused.
- Exit: an exit during `is_settling` is refused; an exit after a refused two-room settlement returns the full deposit; an exit never returns more than the member's escrow.
- JS: both Roosts, fed the same inputs, produce the same message; fed different inputs, different messages.
