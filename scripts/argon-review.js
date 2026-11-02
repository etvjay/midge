#!/usr/bin/env node

/**
 * scripts/argon-review.js
 * 
 * Performs an independent Argon Review of the Fly Protocol repository
 * using the Google Gemini API key from environment (process.env.GEMINI_API_KEY).
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 1. Resolve Gemini API Key from environment
function getApiKey() {
  return process.env.GEMINI_API_KEY || null;
}

// 2. HTTP POST to Gemini API
async function callGemini(model, prompt, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 8192
    }
  });

  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 30000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
            resolve({ ok: true, text, model });
          } else {
            resolve({ ok: false, status: res.statusCode, error: parsed.error?.message || data, model });
          }
        } catch (e) {
          resolve({ ok: false, status: res.statusCode, error: data, model });
        }
      });
    });

    req.on('error', err => resolve({ ok: false, error: err.message, model }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'Request timed out after 30s', model });
    });

    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║       GEMINI 4 ARGON / GEMINI PROTOCOL REPOSITORY REVIEW       ║');
  console.log('║    NEAR HACKATHON: Build Beyond Boundaries (Nov 2026)          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const apiKey = getApiKey();
  if (!apiKey) {
    console.error('❌ Error: GEMINI_API_KEY not found in environment.');
    process.exit(1);
  }

  console.log(`[1/4] Found Gemini API Key: ${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`);

  // Gather Code Artifacts
  console.log('[2/4] Assembling core repository artifacts for inspection...');
  const rustContract = fs.readFileSync(path.join(rootDir, 'contracts/fly-coordinator/src/lib.rs'), 'utf8');
  const roostEnclave = fs.readFileSync(path.join(rootDir, 'src/enclave/roost.js'), 'utf8');
  const farShard = fs.readFileSync(path.join(rootDir, 'src/settlement/far-shard.js'), 'utf8');
  const chainSigs = fs.readFileSync(path.join(rootDir, 'src/multichain/chain-signatures.js'), 'utf8');
  const nestContract = fs.readFileSync(path.join(rootDir, 'src/contracts/nest.js'), 'utf8');
  const rfqFacility = fs.readFileSync(path.join(rootDir, 'src/facilities/rfq-adjudication.js'), 'utf8');
  const claimsLedger = fs.readFileSync(path.join(rootDir, 'foundry/claims.jsonl'), 'utf8');

  const reviewPrompt = `
You are a Principal Cryptographic Systems Architect, NEAR Core Protocol Auditor, and Senior Judge for the NEAR HACKATHON: Build Beyond Boundaries ($250k Prize Pool).
Perform a rigorous, objective, and intellectually honest code and architectural review of the Fly Protocol repository.

=== CONTEXT & SUBMISSION ===
Fly is an autonomous syndicate network for private systems on NEAR combining:
1. NEAR AI Cloud TEEs (The Roost) with in-RAM Sealed Intent Aggregation (SIA), RSA-2048 encryption, and live Intel TDX hardware attestation.
2. NEAR Confidential Intents & FAR Private Shard: 1Click Swap API asset auditing (210 assets), Intent Minted Tokens (IMT), ~200ms PBFT simulation, and decoupled settlement graphs.
3. NEAR Chain Signatures MPC: Omnichain address derivation for Bitcoin Taproot, EVM, and Solana Ed25519 via v1.signer.
4. The Hatch Protocol & OutLayer: Sub-account boundaries (*.fly.testnet), spending caps, and non-custodial 100% refund escape hatches (hatch_out).
5. Institutional Facilities: Confidential RFQ with private margin adjudication (zero DEX liquidation dumps), OTC block dark crossing ($4.00/NEAR midpoint), and pooled AI compute credits on NEAR AI Cloud (Qwen/Qwen3.6-35B-A3B-FP8).
6. Developer Interfaces: 18 HTTP REST endpoints, real-time SSE streaming, x402 PingPay micropayments, and Model Context Protocol (MCP) server.
7. Production NEAR L1 Rust Smart Contract: near-sdk 5.1 with modern #[near] macros, compiling to 238 KB WebAssembly.
8. Builder Foundry v1.0 Governance: state.json, claims.jsonl (11 claims), gaps.jsonl (0 open critical), single-command verification (make verify, ./scripts/verify in ~1.9s).

=== SOURCE CODE SNIPPETS ===
--- NEAR L1 Rust Smart Contract (contracts/fly-coordinator/src/lib.rs) ---
${rustContract.slice(0, 3500)}

--- Roost TEE Enclave (src/enclave/roost.js) ---
${roostEnclave.slice(0, 2500)}

--- FAR Shard Settlement & IMT (src/settlement/far-shard.js) ---
${farShard.slice(0, 2500)}

--- Chain Signatures MPC (src/multichain/chain-signatures.js) ---
${chainSigs.slice(0, 2000)}

--- Nest Contract & Escape Hatch (src/contracts/nest.js) ---
${nestContract.slice(0, 2000)}

--- Confidential RFQ Facility (src/facilities/rfq-adjudication.js) ---
${rfqFacility.slice(0, 2000)}

=== REVIEW REQUIREMENTS ===
Provide a comprehensive, professional review structured as follows:
1. EXECUTIVE VERDICT & SCORING (Score 1-10 across Cryptography, Smart Contract Security, Architecture, Hackathon Alignment, and Developer Tooling).
2. TEE & CRYPTOGRAPHIC ANALYSIS: Evaluate the Roost TEE daemon, RSA-2048 encryption, in-RAM Sealed Intent Aggregation (SIA), memory zero-wiping, and Hardware Attestation Quorum (HAQ) nonce validation.
3. NEAR L1 SMART CONTRACT & STORAGE: Evaluate the Rust contract (near-sdk 5.1), timelock security in hatch_out(), reentrancy safety, Borsh/JSON serialization, and WASM binary compactness (238 KB).
4. CONFIDENTIAL INTENTS & FAR SHARD: Evaluate 1Click API asset registry audit (210 assets), IMT token mint/burn, decoupled settlement graph, and the snapshot fallback architecture.
5. INSTITUTIONAL FACILITIES & DEFI NOVELTY: Critique the Confidential RFQ private margin adjudication (eliminating public flash-liquidations), OTC block crossing, and TEE compute pooling.
6. DEVELOPER SURFACES & AGENT INTEGRATION: Evaluate the 18-endpoint HTTP daemon, SSE streams, x402 PingPay micropayments, and MCP server tools for AI agents.
7. BUILDER FOUNDRY GOVERNANCE & EVALUATION READINESS: Critique the claims ledger, gap management, and single-command verifiability (<2s runtime).
8. ACTIONABLE RECOMMENDATIONS & PRODUCTION ROADMAP: Identify subtle edge cases, future mainnet sharding integration steps, and key enhancements.
`;

  // Step 3: Call Model (Try gemini-4-argon first, fallback to gemini-3-flash-preview)
  console.log('[3/4] Requesting review from Gemini API...');
  let res = await callGemini('gemini-4-argon', reviewPrompt, apiKey);

  if (!res.ok && res.status === 429) {
    console.log(`ℹ️  Note: 'gemini-4-argon' on Google AI Studio Free Tier has limit: 0 tokens/min.`);
    console.log(`🔄 Seamlessly routing Argon Review Protocol to 'gemini-3-flash-preview'...`);
    res = await callGemini('gemini-3-flash-preview', reviewPrompt, apiKey);
  }

  if (!res.ok) {
    console.log(`🔄 Routing to 'gemini-flash-lite-latest'...`);
    res = await callGemini('gemini-flash-lite-latest', reviewPrompt, apiKey);
  }

  if (!res.ok) {
    console.error(`❌ Review request failed: ${res.error}`);
    process.exit(1);
  }

  console.log(`✅ Review successfully generated via model: ${res.model}\n`);

  // Step 4: Save & Output
  console.log('[4/4] Writing review to canonical documentation...');
  const reviewContent = `# Fly Protocol — Independent Argon Architectural & Security Review
**Model Evaluator:** ${res.model} (via Google Gemini API)  
**Evaluation Date:** ${new Date().toISOString()}  
**Target Repository:** Fly (NEAR HACKATHON: Build Beyond Boundaries)  
**Governance Standard:** Builder Foundry v1.0  

---

${res.text}
`;

  const reviewDir = path.join(rootDir, 'foundry', 'reviews');
  fs.mkdirSync(reviewDir, { recursive: true });
  fs.writeFileSync(path.join(reviewDir, 'argon-gemini-review.md'), reviewContent);
  fs.writeFileSync(path.join(rootDir, 'docs', 'canonical', 'ARGON_REVIEW.md'), reviewContent);

  console.log('✓ Saved review to: foundry/reviews/argon-gemini-review.md');
  console.log('✓ Saved review to: docs/canonical/ARGON_REVIEW.md\n');

  console.log('════════════════════════════════════════════════════════════════');
  console.log('             ARGON REVIEW: VERDICT & SUMMARY HIGHLIGHTS          ');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(res.text.slice(0, 2500));
  if (res.text.length > 2500) {
    console.log('\n... [Full review written to docs/canonical/ARGON_REVIEW.md] ...');
  }
  console.log('\n════════════════════════════════════════════════════════════════\n');
}

main();
