#!/usr/bin/env node

/**
 * scripts/argon-review.js
 * 
 * Performs an independent Argon Review of the Midge repository
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

  return new Promise((resolve) => {
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 90000
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
      resolve({ ok: false, error: 'Request timed out after 90s', model });
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
Perform a rigorous, objective, and intellectually honest code and architectural review of the Midge repository, specifically evaluating against Handoff 4 and the Parallel Research Reports (problem evidence, competitive landscape, judging calibration).

=== CORE ARCHITECTURAL PARADIGM ===
"Constrained arbitration with independent recovery" — The TEE is an arbiter, never a custodian.
Key properties:
1. Public deposits on NEAR L1 paired with confidential deliberation in memory inside the aggregator before Sealed Intent Aggregation (SIA) zeroing.
2. Hardware Attestation: Live Intel TDX Quote v4 from NEAR AI Cloud verified via dcap-qvl to Intel Root CA.
3. Omnichain execution via NEAR Chain Signatures MPC (v1.signer-prod.testnet).
4. Non-custodial escape hatch (hatch_out): Unilateral per-user recovery after block timelock without coordinator approval and without draining other flyers.
5. Task Y1 Focus: Bounding settlement authority with an immutable release policy (allowed_recipients <= 8, max_release_bps_per_epoch <= 10000, settle_deadline_block, policy_hash consent at deposit time, allocations hash verification).
6. Honest status: TEE Roost aggregator runs locally (GAP-004); network discovery methods (list_syndicates, list_syndicates_by_member) implemented in contract and demonstrated in memory model pending redeploy; live TEE inference attestation skipped pending NEARAI_API_KEY.

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

--- Claims Ledger (foundry/claims.jsonl) ---
${claimsLedger}

=== REVIEW REQUIREMENTS ===
Provide a comprehensive, professional review structured as follows:
1. EXECUTIVE VERDICT & SCORING:
   - Provide an honest score (1-10) across: Problem Quality, Effectiveness, Technical Execution, Beyond Prototype, Originality, UX, and Hackathon Alignment.
   - Summarize the core value proposition: "constrained arbitration with independent recovery" vs traditional multisigs and existing TEE platforms (Shade, OutLayer).
2. SETTLEMENT AUTHORITY BOUNDING (TASK Y1 ANALYSIS):
   - Analyze the current vulnerability where a registered enclave key could sign a malicious settlement sweeping funds to an arbitrary recipient.
   - Evaluate the proposed Y1 release policy: allowed_recipients allowlist, max_release_bps_per_epoch, settle_deadline_block, policy_hash consent at deposit, and allocations hash verification.
   - Give specific Rust implementation guidance and edge-case invariants (e.g. pro-rata reduction, rounding remainders, gas for 50 flyers).
3. TEE & CRYPTOGRAPHIC HONESTY:
   - Evaluate the Intel TDX Quote v4 verification via dcap-qvl to Intel Root CA.
   - Critique the Roost local execution model (GAP-004) and the honest handling of NEAR AI Cloud inference signatures (provenance vs authorization).
4. NEAR L1 SMART CONTRACT & STORAGE ARCHITECTURE:
   - Evaluate near-sdk 5.1 usage, IterableMap vs LookupMap escrows, secondary member indexing (member_syndicates), NEP-297 events, and WASM binary compactness (319 KB).
5. COMPETITIVE DIFFERENTIATION & THREAT MODEL:
   - Contrast Midge against NEAR Multisig / Sputnik DAO, Phala Shade Agents, OutLayer, and standard escrow.
   - Identify threat model boundaries: what is defended vs what is out of scope (e.g., TEE hardware bugs, collusion between creator and sole recipient).
6. ACTIONABLE BLUEPRINT FOR HANDOFF 4 (Y1–Y10):
   - Prioritized roadmap to reach a 9+ on verifiable dimensions before the Nov 12 code freeze.
`;

  // Step 3: Call Model (Try gemini-3.5-flash first, fallback to gemini-3.5-flash-lite and gemini-3.1-flash-lite)
  console.log('[3/4] Requesting review from Gemini API...');
  let res = await callGemini('gemini-3.5-flash', reviewPrompt, apiKey);

  if (!res.ok) {
    console.log(`ℹ️  Note: gemini-3.5-flash returned: ${res.error}. Routing to gemini-3.5-flash-lite...`);
    res = await callGemini('gemini-3.5-flash-lite', reviewPrompt, apiKey);
  }

  if (!res.ok) {
    console.log(`ℹ️  Note: gemini-3.5-flash-lite returned: ${res.error}. Routing to gemini-3.1-flash-lite...`);
    res = await callGemini('gemini-3.1-flash-lite', reviewPrompt, apiKey);
  }

  if (!res.ok) {
    console.error(`❌ Review request failed: ${res.error}`);
    process.exit(1);
  }

  console.log(`✅ Review successfully generated via model: ${res.model}\n`);

  // Step 4: Save & Output
  console.log('[4/4] Writing review to canonical documentation...');
  const reviewContent = `# Midge — Independent Argon Architectural & Security Review
**Model Evaluator:** ${res.model} (via Google Gemini API)  
**Evaluation Date:** ${new Date().toISOString()}  
**Target Repository:** Midge (NEAR HACKATHON: Build Beyond Boundaries)  
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
