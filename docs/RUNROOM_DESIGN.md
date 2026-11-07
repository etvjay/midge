# `runRoom`: one way in for every room program

*Written 2026-11-07. Status: **slices 1 to 6 built and tested offline** (all seven room kinds; web API with OpenAPI, MCP over stdio and HTTP, live events, SDK, practice room; see `docs/lab/ROOMSERVICE_RESULTS.md`). Not built: a browser bundle, a hardware host and a testnet pass through these doors. Vocabulary follows `docs/GLOSSARY.md` and the codebase-design terms (module, interface, seam, adapter).*

**In plain words.** Midge has seven things a room can do (pool money, auction, best quote, cross, vote, pay run, two-sided quote). Today each one is reachable in a different way from the command line, the web API, the AI-agent tool server and the code library, and most are not reachable from all four. This design puts them all behind one small door, so a new room kind is added once and every way in gets it.

## 1. The problem, from the code

| Surface | Reaches the room programs? |
|---|---|
| Host (`HostedRoost`) and its HTTP server | Yes, all seven (`runPool`, `runAuction`, `runQuote`, `runCross`, `runBallot`, `runPayrun`, `runRfq`), each a different method with different arguments. |
| REST API (`src/api/server.js`) | Only RFQ and OTC routes. |
| MCP tools (`src/mcp/server.js`) | Ten tools; one RFQ and one OTC tool. Stdio only. |
| SDK (`src/sdk/client.js`) | RFQ and OTC. |

A caller that wants a vote has to know: open a round, submit signed inputs, call `/ballot`, copy `orderHash`, `allocations` and `charges` into `/settle`, then build the contract call (`settle_batch_charged`) by hand. That is about six steps and three places where an argument can be copied wrongly. Adding an eighth program today means touching the host, its server, its client, the API, the MCP server and the SDK.

## 2. The module

**`RoomService`**: a deep module with three verbs. Everything the adapters need is behind them.

```
describe()                          -> { settlePublicKey, attestation info, programs: [{ id, summary, params schema }] }
submit({ flyerId, cipherTextHex, publicKey?, signature?, seq? })
                                    -> { accepted, digest }            // one sealed input, signed or not
run({ program, params, round })     -> { outcome, settlement | null, orderHash }
```

`run` does what is now five steps: it checks the parameters against the program's schema, runs the program, signs only what the room computed, and returns a `settlement` that is the contract call ready to send:

```
settlement = { method: 'settle_batch_charged', args: { syndicate_id, attestation_nonce, aggregate_order_hash,
               allocations, charges, enclave_signature } }
```

`settlement` is `null` when the program decides nothing (a tied vote, a quorum not met). The caller never recomputes `orderHash`, copies charges, or chooses the contract method.

**Programs are a registry, not a switch.** A program is `{ id, summary, schema, run(host, params) -> { outcome, program } }`. The seven existing `run*` methods become the first seven entries unchanged; their clearing code (`pool-program.js`, `auction-programs.js`, `quote-programs.js`, `ballot-program.js`, `payrun-program.js`) is not touched, so their tests and mutation results stay valid.

**Errors are typed once.** `RoomError { code, message }` with a small closed set: `INVALID_PARAMS`, `UNKNOWN_PROGRAM`, `ROUND_NOT_OPEN`, `NO_INPUTS`, `ALREADY_SIGNED`, `NOT_AUTHORISED`, `INTERNAL`. Each adapter maps a code to its own form (HTTP 400/404/409/401/500, MCP tool error, SDK exception) in one table, which fixes the inconsistent-error risk the API-design checklist warns about.

## 3. Two designs compared (design it twice)

| | **A. Stateless `run` + separate `submit` (chosen)** | **B. Stateful room object** (`room = service.room(program, params)`; `room.submit()`; `room.close()`) | **C. One call with inputs inside** (`run({ program, params, inputs })`) |
|---|---|---|---|
| Interface size | 3 verbs | 3 verbs plus a handle that must be kept, expired and cleaned up | 2 verbs |
| Fits REST, MCP, SSE | Yes; every call is independent | Needs session ids and expiry on every adapter | Yes |
| Fits real use | Members seal inputs at different times, then someone runs the round | Same | **No**: inputs come from different members at different times; one caller would have to hold everyone's sealed input |
| Locality | All program logic in the registry | State leaks into adapters through the handle | Good |
| Failure handling | A failed `run` leaves the queue as it was; retry is safe | A half-closed room needs recovery rules | Good |

A wins on depth and fit. C is out because it gets the real flow wrong; B adds state to every adapter for no gain. The deletion test passes: remove `RoomService` and the five-step sequence and its argument copying reappears in four places.

## 4. Seams and adapters

- **Inner seam (the interface above).** One real adapter today (the host) plus a second, the in-memory fake used by tests and the playground, so the seam is real.
- **Outer seam (four adapters over `RoomService`):** MCP, REST, SSE and SDK. Each only translates (names, auth, error codes). None contains room logic. The room service server keeps its admin-key rule for `open round`, `run` and `settle`; the public API gets the same rule through its existing key.
- **SSE** publishes one event per step (`input_accepted`, `round_run`, `settled`, `exited`), with sealed content never in the stream. That gives the playground and the demo something to watch.
- **MCP** gains one tool, `midge_run_room`, plus `midge_describe_rooms`, instead of one tool per program. Streamable HTTP transport is added beside stdio. Write tools stay behind the existing `requireWritable` guard, and keys never pass through the tool arguments.

## 5. What does not change

The contract, the signed message formats, the host's checks (it signs only what it computed, with each program's bound), the clearing code, and every existing test. `RoomService` wraps them. `signSettlement` stays the only place a signature is made.

## 6. Data and failure rules (backend-design steps)

- **Data and lifecycle.** A round is `{ contractId, syndicateId, epoch, roundNonce }` (already in the host). Inputs live in the host's queue until a successful `run`; a failed `run` changes nothing.
- **Idempotence.** `run` with the same program and params on an unchanged queue returns the same `orderHash` (the host already orders deterministically). A second *signing* of the same aggregate stays refused (`ALREADY_SIGNED`), and the caller is told to re-send the first result.
- **Authorisation.** Anyone with a member key may `submit` a signed input; only the coordinator key may open a round or `run`. Read-only `describe` is open.
- **Observability.** One structured log line per verb with program, round id, input count and outcome code. No sealed content, no keys, no outcomes with amounts that a member sealed.
- **Rate limits.** The API adapter returns 429 with `Retry-After` (there is none today); the room service limits `submit` per member per round.

## 7. Tests (agreed seams first, as the tdd skill requires)

| Seam | Catches | Misses |
|---|---|---|
| `RoomService` interface | wrong result, refused input, unsigned or over-bound settlement, typed error per bad call | hosting, network |
| Each adapter (MCP, REST, SSE, SDK) | translation, auth, error mapping, schema, no room logic leaking | clearing correctness |
| One testnet pass per vertical | real settlement and real exit | independent users |

Rules: one test then one change per slice; expected values come from the existing worked examples and literals, not recomputed in the test; mutation-test each slice (drop the bound check, skip schema validation, return the wrong method, swallow an error code); pin the new test count in `lab/experiments/10-existing-suites.js`.

## 8. Build order (smallest first)

1. `RoomService` over the host with one program (`ballot`), `describe`/`submit`/`run`, typed errors. Tests at the interface.
2. Register the other six programs; one parity test per program that the old `run*` path and `run` give the same `orderHash` and allocations.
3. REST adapter (+ OpenAPI file, + 429), then SDK.
4. MCP adapter: two tools, streamable HTTP beside stdio.
5. SSE events.
6. In-memory fake host for the playground.

## 9. Open decisions

1. **Two-host rooms.** `settle_batch_two_room` needs a second signature. Proposal: `run` returns the first signature and `settlement.needsSecond: true`; combining stays outside this module for now.
2. **Where `settlement` is sent.** Proposal: the service only *returns* the contract call; sending it stays with the chain client, so this module never holds a NEAR key.
3. **Program parameters for the two verticals.** Grant committee = `ballot` + `payrun`; collective purchase = `pool` with per-member charges. No new program is required for the first version; a cross-chain payout is a separate settlement target, not a new program.

## 10. Corrections after review

*2026-11-07, while writing the slice-1 tests.* (a) **Four verbs, not three:** signed inputs name the open round, so `open(round)` comes first; `run` takes the same round and refuses another (`ROUND_NOT_OPEN`). (b) **Retry-safety is the service's job:** the host clears its queue when a round runs, so the service remembers the last result; an identical `run` returns it unchanged, a different one is refused with `ALREADY_SIGNED` until `open` is called again.

## 10b. Correction (slice 3 to 6 planning)

*2026-11-07.* MCP gets **four** tools that mirror the four verbs, not two: the coordinator (who opens and runs) and members (who submit) are different principals, and a secret key must never pass through a tool argument, so a member's input arrives already signed. Still no tool per program.

## 11. Not claimed

Built and tested offline: all seven room kinds through `RoomService`, the web API, OpenAPI file, MCP, live events, SDK and a practice room. Not built or tested: a browser bundle and the playground page, a hardware host, and a testnet settlement through these doors.
