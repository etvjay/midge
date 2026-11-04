#!/usr/bin/env bash
# Build the hosted Roost image from a minimal staged context.
#   deploy/roost/build.sh [tag]        default tag: midge-roost:local
# Only the files the Roost needs are copied, with fixed timestamps, so the image content is a pure
# function of the sources and the pinned base image. Layer metadata is not guaranteed bit-identical
# across Docker versions: the compose file pins the pushed image by digest, and that digest is what the
# attestation measures (via the compose hash).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
TAG="${1:-midge-roost:local}"
CTX="$(mktemp -d)"
trap 'rm -rf "$CTX"' EXIT

mkdir -p "$CTX/src/enclave" "$CTX/src/roost-service"
cp deploy/roost/package.json deploy/roost/package-lock.json deploy/roost/Dockerfile "$CTX/"
cp src/enclave/e2ee.js src/enclave/errors.js "$CTX/src/enclave/"
cp src/roost-service/provider.js src/roost-service/hosted-roost.js src/roost-service/server.js "$CTX/src/roost-service/"
find "$CTX" -exec touch -h -d '2026-01-01T00:00:00Z' {} +

docker build --no-cache -t "$TAG" "$CTX"
docker image inspect "$TAG" --format 'image id: {{.Id}}  size: {{.Size}}'
