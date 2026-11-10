# Quoted sources for the site's host comparison

*Copied on 2026-11-10 from the pages below (fetched with Parallel search and extract). The site's "Three ways to run code in secure hardware" table in Under the hood rests on these sentences; `tests/site-home.test.js` checks that each table cell's quote is in this file or in the repository file it names. Third-party pages change: re-read them before relying on a cell.*

| Source | What it supports | Sentence, verbatim |
|---|---|---|
| https://app.outlayer.ai/docs/pricing | OutLayer: limits per call | **Max Execution Time:** 180 seconds per execution (default: 60 seconds) |
| https://docs.near.org/primitives/off-chain-compute/outlayer | OutLayer: what can call it | A NEAR contract calls OutLayer using NEAR's `yield`/`resume` flow — or any client can call the HTTPS API directly. |
| https://app.outlayer.ai/docs/tee-attestation | OutLayer: a hardware report per run | Every time a TEE worker executes WASM code on OutLayer, it generates a fresh **attestation** |
| https://app.outlayer.ai/docs/tee-attestation | OutLayer: checked on NEAR once per worker | The TDX environment is verified **once** , at worker registration (measurements checked on-chain). |
| https://app.outlayer.ai/docs/tee-attestation | OutLayer: each result signed by the worker key | Results are then signed by the worker key |
| https://app.outlayer.ai/docs/trust-verification | OutLayer: its workers run on dstack (some on Phala Cloud) | the worker runs in an Intel TDX confidential VM via dstack |
| https://docs.phala.com/phala-cloud/cvm/create-with-docker-compose | Phala Cloud: a whole machine we deploy | Deploy any Docker container as a CVM on supported TEEs |
| https://docs.phala.com/dstack/overview | Phala Cloud: one report for the machine and its image | Docker image hash, startup arguments, and environment variables |
