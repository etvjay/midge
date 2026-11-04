# What went wrong, and the rule each failure produced

Read this when an experiment misbehaves or before writing a new one. Each row is a real failure from the project this skill came from (a NEAR testnet protocol with a confidential enclave and a smart contract).

| What happened | How the log showed it | Rule |
|---|---|---|
| Evidence events carried a transaction `hash`, which collided with the recorder's own `hash` field and corrupted the chain | The run failed its own integrity check at the events with that field | The recorder's fields are `chain_prev` and `chain_hash`; reserved names throw. A regression test built from the failure must fail on the old recorder |
| Assumed a status string `Open`; the system says `Active` | Assertion failed with `actual: "Active"` | Observe the real value first (`s.observe`) before asserting on it |
| A correct 0.03 refund looked like a 0.06 double payment | A balance delta included gas refunds from earlier transactions arriving later | Evidence from receipts, not balance deltas |
| A preflight demanded a balance that was a guess | The real peak need, measured in a run, was lower, and the failure message showed it | Derive thresholds from a measured run, and say so in a `note` |
| Mutating the runner (making it hide its own failure) was not caught by the self-test | Two mutants survived | An independent auditor re-derives verdicts from the raw events, and the exit code follows it and the chain check, so the runner cannot declare its own result |
| A teardown step was skipped after an earlier critical failure | Would have left a paid VM running (found while designing the experiment, not in a run) | `{ always: true }` steps run after an abort; test it and mutation-check it |
| The replay test settled the full escrow, so the session was closed and the replay failed for that reason | Reading the other branch of the code showed the nonce rotated only for one syndicate type; a throwaway unit test then drained the escrow 10 to 7 to 4 to 1 | Run the partial and boundary variants of every attack. Assert the reason of the rejection |
| `s.assert('keys match', a === b || true)` | Caught on review before running | No vacuous assertions. Compare to an independent value |
| Compared a number to a string; totals were equal | The failure message showed `total 2480, expected 2480` | Include `expected` and `actual` in every assertion, so a mismatch of types is visible |
| A hatch transaction failed with no recorded reason | The experiment only asserted `.ok` | Wrap every transaction in one helper that always records the evidence and the error text |
| The account ran out of storage balance after a redeploy and repeated runs | `lacks balance for state` mid-run | Preflight resources that other runs consume (headroom), not just credentials |
| A listing returned 10 items and was read as "10 total" | It was the page limit | Check pagination before quoting a count |
| A just-deleted paid resource still showed in a listing for a few seconds | Independent check disagreed with the run | The teardown check polls, and ignores items in a deleting state; verify independently afterwards |
| A narrative script reported checks only as prose | The adapter had only a banner and an exit code as evidence | Flag it as a problem; convert checks to assertions |

## Honest framing for reports

- Count assertions and failures from the log, not from memory.
- State who controlled every party in the run.
- Separate: ran live, real code with tests but never run live, and a model. A component that only exists as a simulation is not "verified".
- A passing run describes one date and one environment. A model's resistance to four attacks is four data points.

## Maintenance note

`assets/engine/` is a generalized copy of the lab engine from the project this came from. Only `core/env.js` and `core/redact.js` differ (they read optional `lab/lab.config.json` and `lab/capabilities.js` instead of hard-coded project settings). A fix to the engine in one place has to be made in the other; `diff -rq <project>/lab/core <skill>/assets/engine/core` shows the drift.
