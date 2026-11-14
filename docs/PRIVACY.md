# What each part receives, keeps, logs and calls

This is a data map taken from the code as of 2026-11-14. It describes what Midge's own code does. It does not describe what the companies that host or serve it log on their own side (the web host, the machine host, the model provider and the chain endpoints); read those providers' terms for that. Draft: the owner reviews it before it is treated as a policy.

Everything here runs on NEAR **testnet**, where coins have no value. Amounts and addresses on a chain are public.

## The room (Roost), `src/roost-service`

| | |
|---|---|
| **Receives** | Sealed inputs (encrypted to the room's key, so the service cannot read them), signed requests, and the coordinator's admin key in a header on admin routes |
| **Keeps** | Everything it holds about a round is in memory. It writes no file: its compose file mounts only the platform's `dstack.sock`. A restart empties it |
| **Logs** | One line at start (port, whether the attestation is simulated, the first character of its settlement public key). Request bodies, headers and addresses are not logged |
| **Calls out** | The chain providers named in `deploy/roost/docker-compose.yml`: one pinned in plain text and one private endpoint passed as an encrypted variable. Each call names an account or the contract, to check a deposit or a member's key |
| **Can see** | What a round's sealed inputs contain, inside the hardware enclave only. The hardware attestation is how a member checks which code that is |

## The playground service, `src/playground`

| | |
|---|---|
| **Receives** | A visitor's public keys, the pay lines the visitor edits (names, gross, tax and benefit rates), a random session secret the browser made, the visitor's approval signature, and the visitor's address as seen by the platform's gateway |
| **Keeps** | In memory: the queue, tickets, the review budget per session, and each round's state while it runs. On disk: a ledger file (`/data/ledger.json`, mode 600) with the id of each account and group it created and has not yet cleaned up, the employer's id and a timestamp. A row is removed when the cleanup finishes. It never receives a visitor's private key, and it does not write a visitor's pay lines to disk |
| **Uses the address for** | The per-hour and per-day limits only, held in memory. It is not used to find a visitor's ticket, which needs the session secret |
| **Logs** | Step names, retry notices with the first 140 characters of an error, and cleanup problems. Pay lines and keys are not logged |
| **Calls out** | The room (proxied), NEAR AI Cloud for the review, the Phala Cloud API to start and stop the room, and NEAR testnet RPC endpoints to create and delete accounts and to settle |
| **Holds secrets** | The funder key, the room's admin key, the NEAR AI key and the Phala key, as encrypted environment variables of its machine. The machine is not attested |

## The model review, `src/advisor`

The model is sent, per line, a letter label, the gross as a band relative to the run's median (to the nearest 10%), the tax and benefit rates to a tenth of a percent, and three yes-or-no flags the code computed, plus the employer's stated rules as plain text. It is never sent a name, an account, an address or an exact amount, and the browser recomputes from the visitor's own numbers whether that is what was sent. NEAR AI Cloud returns a signed receipt, which the page checks.

## The site, `site/`

| | |
|---|---|
| **Hosting** | Static files on Vercel |
| **Loads from other origins** | Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`) on all three pages, so a visitor's address is sent to Google when a page loads. Links to NearBlocks and GitHub are plain links, followed only when clicked |
| **Cookies and trackers** | None set or loaded by the site's own code: no analytics script, no cookie |
| **Browser storage** | The playground page keeps the visitor's NEAR key pair and payslip key pair in the tab's `sessionStorage`, so a reload does not lose a round. It is cleared when the tab closes and is never sent to the service, which receives only the public keys. The page offers a download of the keys |
| **Calls from the visitor's browser** | The playground service (the address in `site/playground/config.js`) and NEAR testnet RPC endpoints, to check the settlement from two providers |

## Not in this map

The recorded runs in `docs/lab-runs/` and the Replay page contain only testnet data from runs made for the project, including the demo keys of the recorded cast, which are published on purpose so visitors can open the recorded payslips.
