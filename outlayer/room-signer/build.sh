#!/usr/bin/env bash
# Build the OutLayer program: Rust to a WASI preview 2 component. Needs: rustup target add wasm32-wasip2
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
cargo build --target wasm32-wasip2 --release
ls -l target/wasm32-wasip2/release/midge-room-signer.wasm
