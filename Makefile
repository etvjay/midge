# Makefile — Universal Verification & Build Automation for Midge
# NEAR HACKATHON: Build Beyond Boundaries (Nov 1–14, 2026)

.PHONY: all help verify test wasm demo check rust review clean

help:
	@echo "╔══════════════════════════════════════════════════════════════════════════════╗"
	@echo "║                  MIDGE — NEAR HACKATHON VERIFICATION SUITE                   ║"
	@echo "╚══════════════════════════════════════════════════════════════════════════════╝"
	@echo "Available Targets:"
	@echo "  make verify   - Run complete judge verification (Rust, WASM, TEE, MCP, etc.)"
	@echo "  make test     - Run 8-layer master architectural test suite (~1.1s)"
	@echo "  make rust     - Run NEAR L1 Rust smart contract unit tests (0.12s)"
	@echo "  make wasm     - Compile release WebAssembly contract"
	@echo "  make demo     - Execute 10-Flyer Dark Swarm multi-agent simulation"
	@echo "  make review   - Run independent Argon Gemini architectural code review"
	@echo "  make check    - Audit Builder Foundry control plane governance"
	@echo "  make all      - Run full verification + demo simulation"

verify:
	@./scripts/verify

test:
	@npm test

rust:
	@npm run verify:rust

wasm:
	@npm run build:wasm

demo:
	@npm run demo

review:
	@node scripts/argon-review.js

check:
	@node scripts/check-foundry.js
	@node scripts/check-predictions-first.mjs

all: verify demo
