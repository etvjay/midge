# Phase 06 — Developer Interfaces: HTTP API, SSE Streaming, x402 Commerce & MCP Server

**STATUS:** PASS  
**OWNER:** Developer Experience Lead  

## Objective
Deliver developer surfaces for autonomous AI agents and quant operators:
1. `FlyApiDaemon`: 18 REST endpoints with Bearer auth and health metrics.
2. Server-Sent Events (SSE) streaming for real-time syndicate deliberation and loan health.
3. x402 Agent Micro-Commerce engine with HTTP 402 challenge/response payments via PingPay.
4. Model Context Protocol (MCP) server exposing 6 tools for LLM agent integration (`nearai/near-mcp` compatible).
5. `FlyClient` unified SDK for JavaScript and TypeScript developers.

## Why this phase exists
Enables external LLM agents, automated scripts, and quant trading desks to seamlessly hatch, fund, deliberate, and settle syndicates without manual contract interaction.

## Admitted scope
- `FlyApiDaemon` in `src/api/server.js`.
- SSE route handler in `src/api/server.js`.
- x402 middleware and invoice manager in `src/commerce/x402.js`.
- MCP server in `src/mcp/server.js` and standalone executable in `bin/fly-mcp.js`.
- Unified client library in `src/sdk/client.js`.

## Invariants
- `I-06-A`: Protected alpha endpoints MUST return HTTP 402 with structured invoice details if unauthenticated.
- `I-06-B`: Providing a valid cryptographic receipt unlocks the requested resource with HTTP 200.
- `I-06-C`: SSE streams must broadcast syndicate state changes with valid JSON payloads and clean disconnect handling.

## Deliverables
- `src/api/server.js`
- `src/commerce/x402.js`
- `src/sdk/client.js`
- `src/mcp/server.js`
- `bin/fly-mcp.js`
- `verifications/08-api-sse-mcp-e2e.js`

## Required verification
- `npm run verify:api`

## Exit gate
Phase is PASS when daemon boots, streams SSE updates, issues and redeems x402 micropayments, and executes MCP tools successfully in <0.5s.
