# Makefile — Universal Verification & Build Automation for Fly Protocol
# NEAR HACKATHON: Build Beyond Boundaries (Nov 1–14, 2026)

.PHONY: all help verify test wasm demo check rust review clean

help:
	@echo "╔══════════════════════════════════════════════════════════════════════════════╗"
	@echo "║            FLY PROTOCOL — NEAR HACKATHON VERIFICATION SUITE                  ║"
	@echo "╚══════════════════════════════════════════════════════════════════════════════╝"
	@echo "Available Targets:"
	@echo "  make verify   - Run complete judge verification (Rust, WASM, TEE, MCP, etc.)"
	@echo "  make test     - Run 8-layer master architectural test suite (~1.1s)"
	@echo "  make rust     - Run NEAR L1 Rust smart contract unit tests (0.12s)"
	@echo "  make wasm     - Compile release WebAssembly contract (238 KB)"
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

all: verify demo
