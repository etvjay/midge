# Hosted Roost: build, deploy, verify

The Roost is deterministic code that runs inside a dstack confidential VM (Phala Cloud). Members seal
bids to its intent key; only the attested VM can read them. The design notes behind it are kept on the author's machine, not in this repository; the checks a member can run are in `src/roost-service/verify-hosted.js` and `ESCROW-READER.md`.

## Build
    deploy/roost/build.sh midge-roost:local     # minimal staged context, pinned Node base image

Push the image to a public registry and put its digest in `docker-compose.yml`.

## Verify (members do this before sealing a bid)
    docker run --rm -p 127.0.0.1:18080:8080 ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41
    node scripts/verify-hosted-roost.js --url https://<roost> --verifier http://127.0.0.1:18080

It checks the Intel quote, the event log, the OS image, that the quote's report data equals
sha512(domain, settle key, intent key, your fresh nonce), the pinned compose hash and the pinned OS image
hashes in `roost.expected.json`. Pin `composeHash` after the first deploy.

## Deploy on a small budget
- Smallest instance, production image (`dstack-0.6.x`, not `dstack-dev-*`). Never use a dev image: it has SSH.
- Public logs OFF. The Roost never logs request bodies.
- Set `ROOST_ADMIN_KEY` (24+ characters) as an encrypted environment variable.
- Billing is per second. **Delete the CVM when the session ends.** A card on the account keeps a CVM
  running past a zero balance and charges the card; without a card it stops. The Roost keeps no state
  (its keys are born inside the VM on each start), so deleting loses nothing.
- Run only for evidence capture, the demo and a stated judging window. About 25 hours fit in a $5 credit.

## Local development without hardware
The dstack simulator and the verifier both run as containers. The simulator patches report data into a
recorded attestation, so the verifier must REJECT it; that rejection is a test, not a bug. Only a real
CVM produces a quote that verifies.

## Re-verify the recorded run (no VM, no credits)
The attestation of the real Phala TDX VM captured on 2026-11-04 is saved in
`docs/canonical/roost-hosted-bundle-2026-11-04.json`. Start the pinned verifier, then:

    docker run -d --name midge-dstack-verifier --read-only --cap-drop ALL -p 127.0.0.1:18080:8080 --tmpfs /tmp:size=600m ghcr.io/dstack-tee/dstack-verifier@sha256:22aeb6808e38a56115f843d4d66f4852407e72f6080d5f8781fd82d9f819db41
    npm run verify:hosted-bundle

It needs network access for Intel's collateral. It shows what that VM attested at capture time; it cannot show that a VM is running now.


## Signed inputs only (decision 2026-11-11)
The pinned compose file sets `ROOST_REQUIRE_SIGNED_INPUTS=1`, and the setting applies to **every** program the room runs: pool, quote, auction, ballot, RFQ and pay run. A bid or vote must be signed with a key of the member's own NEAR account, and the room checks that key against the chain. An unsigned sealed intent is refused with "only accepts signed inputs".

**For testers and tools:** seal-and-sign in one call with `signedBidParams` from `src/roost-service/signed-input.js`, then send the result to `POST /signed-intents` (`HostedRoostClient.submitSignedIntent`). Anything that sends to `/intents` unsigned is refused by this compose. The earlier hosted pool and quote experiments (E-HOSTED-ESCROW-LIVE-01 and E-HOSTED-DARKVAULT-LIVE-02) ran on earlier compose hashes, which stay pinned in `roost.expected.json`, with unsigned input.

## Forgotten VMs
Every session arms a detached dead-man's switch, which dies if the machine reboots. Schedule `node scripts/phala-reaper.mjs --yes` (for example every 30 minutes) as a second line: it deletes any `midge-*` VM older than two hours.
