# midge-room-signer (OutLayer proof of concept)

The settlement-signing step of a Midge room, as an OutLayer program. It holds no key of its own: the Ed25519 seed is the protected OutLayer secret `PROTECTED_ROOM`, generated inside OutLayer's TEE, which nobody can read but this code running there. For `sign` it recomputes the allocations hash itself (sorted by recipient, `recipient:amount` joined by commas, SHA-256 in hex, exactly as the contract does), builds the message the contract verifies, checks the allocations against the bound it was given, and signs only then. Results are about 320 bytes (OutLayer's limit is 900).

**What it is not:** a room. Sealed inputs, aggregation and the escrow read are not here, and the program trusts its caller for the bound and the order hash.

## Build, deploy, run (testnet)
```bash
rustup target add wasm32-wasip2 && cargo install outlayer-cli --locked   # once
./build.sh                                                                # target/wasm32-wasip2/release/midge-room-signer.wasm
outlayer login testnet                                                    # use a throwaway account, not one that holds funds
outlayer upload target/wasm32-wasip2/release/midge-room-signer.wasm      # prints a FastFS URL
outlayer deploy midge-room-signer <FastFS URL>
outlayer secrets set --generate PROTECTED_ROOM:hex32 --project <you>/midge-room-signer
outlayer run <you>/midge-room-signer '{"op":"pubkey"}' --secrets-profile default --secrets-account <you>
```
Then hatch a group with that public key as its room key and run `node lab/run.js --only E-OUTLAYER-SETTLE-01` (it expects the project under `ol.<NEAR_ACCOUNT_ID>`).

## Evidence
`E-OUTLAYER-SETTLE-01`, promoted run `20261111T093643Z-7985`: the key is stable across runs; a settlement signed inside OutLayer was accepted by the production contract and paid exactly; the program refused allocations above its bound; the same signature with different allocations was refused by the contract; a replay was refused. Two earlier runs of the same experiment failed at an OutLayer call (an intermittent failure of the on-chain call path whose cause is not known) and are kept in `docs/lab-runs`; the experiment retries such calls up to three times and records the attempt count.
