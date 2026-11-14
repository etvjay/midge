#!/usr/bin/env bash
# Build the playground service image from a minimal staged context.
#   deploy/playground/build.sh [tag]            build locally, default tag midge-playground:local
#   deploy/playground/build.sh --stage <dir>    only stage the build context into <dir> (used by CI)
# Only the source directories the service imports are copied, with fixed timestamps. tests/playground-image-stage.test.js fails if an import is missing.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

stage() {
  local ctx="$1"
  mkdir -p "$ctx/src"
  cp package.json package-lock.json deploy/playground/Dockerfile "$ctx/"
  cp -r src/playground src/roost-service src/advisor src/enclave src/multichain "$ctx/src/"
  find "$ctx" -exec touch -h -d '2026-01-01T00:00:00Z' {} +
}

if [ "${1:-}" = "--stage" ]; then
  stage "${2:?usage: build.sh --stage <dir>}"
  exit 0
fi

TAG="${1:-midge-playground:local}"
CTX="$(mktemp -d)"
trap 'rm -rf "$CTX"' EXIT
stage "$CTX"
docker build -t "$TAG" "$CTX"
docker image inspect "$TAG" --format 'image id: {{.Id}}  size: {{.Size}}'
