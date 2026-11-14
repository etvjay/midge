#!/usr/bin/env bash
# Runs the real room-signer program the way OutLayer does (JSON on stdin, the seed in PROTECTED_ROOM) with a fixed TEST seed, and checks the two answers.
# The seed below is a public test value, never a real key. Needs cargo; builds the crate in debug mode. Exit code 1 on any failure.
set -euo pipefail
cd "$(dirname "$0")/../outlayer/room-signer"
export PROTECTED_ROOM=0101010101010101010101010101010101010101010101010101010101010101

pubkey=$(echo '{"op":"pubkey"}' | cargo run --quiet)
echo "pubkey:  $pubkey"
node -e 'const r = JSON.parse(process.argv[1]); if (!r.ok || !/^[0-9a-f]{64}$/.test(r.public_key)) { console.error("pubkey answer is not ok"); process.exit(1); }' "$pubkey"

signed=$(echo '{"op":"sign","contract":"c.test.testnet","syndicate_id":"group-1","epoch":3,"nonce":"n-1","order_hash":"abc123","allocations":[{"recipient":"zed.testnet","amount":"30"},{"recipient":"amy.testnet","amount":"70"}],"max_total_yocto":"100"}' | cargo run --quiet)
echo "sign:    $signed"
node -e 'const r = JSON.parse(process.argv[1]); if (!r.ok || !/^[0-9a-f]{128}$/.test(r.signature)) { console.error("sign answer is not ok"); process.exit(1); }' "$signed"

refused=$(echo '{"op":"sign","contract":"c.test.testnet","syndicate_id":"group-1","epoch":3,"nonce":"n-1","order_hash":"abc123","allocations":[{"recipient":"amy.testnet","amount":"101"}],"max_total_yocto":"100"}' | cargo run --quiet)
echo "refused: $refused"
node -e 'const r = JSON.parse(process.argv[1]); if (r.ok !== false || r.signature) { console.error("a total over the bound was not refused"); process.exit(1); }' "$refused"
echo "room-signer QA: ok"
