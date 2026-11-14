# How a change reaches a live system

This is the path that exists today. It is a staged path with human gates, not automatic progressive delivery: nothing here shifts traffic gradually, and
nothing goes live without someone choosing to.

1. **Local check.** `./scripts/verify` (or `npm run verify:fast` for the JavaScript and the ledgers). It needs no keys and spends nothing.
2. **Pull request and CI.** The job "Complete Canonical Verification Suite" runs the full check on every pull request. Merging to `master` is a human step.
3. **Recorded runs.** Anything claimed as live comes from a lab run: predictions committed first, an experiment that can fail, a hash-chained log, and
   `node lab/verify-run.js <dir>` to check it offline. Promoted runs are in `docs/lab-runs/`.
4. **Testnet.** `node lab/run.js --tier testnet` spends testnet funds on `*.fly.testnet` accounts.
5. **Hardware.** `node lab/run.js --tier hardware` rents Phala TDX machines. The room image is built by CI from `deploy/roost/build.sh` and pinned by digest in
   `deploy/roost/docker-compose.yml`.
6. **The playground.** A second service, `deploy/playground`, runs beside the room. Its image is built by CI on a merge that touches its staged files.
   Publishing an image does not change a running machine: a machine changes only when someone redeploys it with the new digest.
7. **The site.** Static, published by hand: `cd site && vercel deploy --prod`. The previous deployment stays available for `vercel rollback`.
8. **Mainnet.** A human gate. Nothing in this repository deploys to mainnet.

## What is measured, and what that means for a change

The room's identity is the hash of its compose file, which names the image by digest. `roost.expected.json` keeps every compose hash that a real machine
attested, newest first, so an older recorded run stays checkable. Changing a compose file or an image digest is therefore a change of identity: it needs a
redeploy, a new recorded hardware run and a new pin, never a silent edit. `docs/canonical/deployments.json` records the code hash of each deployed contract
in the same way. CONTRIBUTING.md defines the change classes (A, B, C) that follow from this.
