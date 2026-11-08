#!/usr/bin/env bash
# Build the hosted Roost image from a minimal staged context.
#   deploy/roost/build.sh [tag]                 build locally, default tag midge-roost:local
#   deploy/roost/build.sh --stage <dir>         only stage the build context into <dir> (used by CI)
# Only the files the Roost needs are copied, with fixed timestamps, so the image content is a pure
# function of the sources and the pinned base image. Layer metadata is not guaranteed bit-identical
# across Docker versions: the compose file pins the pushed image by digest, and that digest is what the
# attestation measures (via the compose hash).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

stage() {
  local ctx="$1"
  mkdir -p "$ctx/src/enclave" "$ctx/src/roost-service"
  cp deploy/roost/package.json deploy/roost/package-lock.json deploy/roost/Dockerfile "$ctx/"
  cp src/enclave/e2ee.js src/enclave/errors.js "$ctx/src/enclave/"
  cp src/roost-service/provider.js src/roost-service/hosted-roost.js src/roost-service/server.js "$ctx/src/roost-service/"
# Programs and helpers that hosted-roost.js imports. tests/roost-image-stage.test.js fails if one is missing.
cp src/roost-service/auction-programs.js src/roost-service/ballot-program.js src/roost-service/payrun-program.js \
   src/roost-service/pool-program.js src/roost-service/quote-programs.js src/roost-service/receipts.js \
   src/roost-service/signed-input.js src/roost-service/escrow-reader.js "$ctx/src/roost-service/"
  find "$ctx" -exec touch -h -d '2026-01-01T00:00:00Z' {} +
}

if [ "${1:-}" = "--stage" ]; then
  stage "${2:?usage: build.sh --stage <dir>}"
  exit 0
fi

TAG="${1:-midge-roost:local}"
CTX="$(mktemp -d)"
trap 'rm -rf "$CTX"' EXIT
stage "$CTX"
docker build --no-cache -t "$TAG" "$CTX"
docker image inspect "$TAG" --format 'image id: {{.Id}}  size: {{.Size}}'
