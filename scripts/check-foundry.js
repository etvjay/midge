#!/usr/bin/env node

/**
 * scripts/check-foundry.js
 * 
 * Builder Foundry Control Plane Auditor
 * Verifies that foundry/state.json, foundry/claims.jsonl, foundry/gaps.jsonl,
 * and foundry/phases/* strictly conform to Builder Foundry v1.0 invariants.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const ALLOWED_STATES = new Set([
  'PROPOSED',
  'IMPLEMENTED',
  'TESTED',
  'SIMULATED',
  'INTEGRATED',
  'E2E_VERIFIED',
  'LIVE_DEMONSTRATED',
  'LIVE',
  'MONITORED',
  'PARTIAL',
  'BLOCKED_EXTERNAL',
  'BLOCKED_INTERNAL',
  'DEFERRED',
  'REJECTED',
  'FUTURE'
]);

const ALLOWED_GAP_STATUSES = new Set([
  'DISCOVERED',
  'REPRODUCED',
  'CLASSIFIED',
  'CLOSURE_DEFINED',
  'IMPLEMENTED',
  'VERIFIED_LOCAL',
  'VERIFIED_SYSTEM',
  'VERIFIED_LIVE',
  'GUARDED',
  'CLOSED',
  'BLOCKED_EXTERNAL',
  'BLOCKED_INTERNAL',
  'DEFERRED',
  'REJECTED_NOT_A_GAP',
  'DUPLICATE'
]);

function runCheck() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║       BUILDER FOUNDRY CONTROL PLANE INTEGRITY AUDIT            ║');
  console.log('║       Governance Invariant Verification (v1.0 Standard)        ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const errors = [];
  const warnings = [];

  // 1. Audit foundry/state.json
  const statePath = path.join(rootDir, 'foundry', 'state.json');
  if (!fs.existsSync(statePath)) {
    errors.push('CRITICAL: foundry/state.json does not exist.');
    return finish(errors, warnings);
  }

  let state;
  try {
    state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch (err) {
    errors.push(`CRITICAL: foundry/state.json is invalid JSON: ${err.message}`);
    return finish(errors, warnings);
  }

  if (!state.project || !state.head || !state.last_verified_head) {
    errors.push('foundry/state.json is missing required fields (project, head, last_verified_head).');
  } else {
    try {
      execSync(`git merge-base --is-ancestor ${state.head} HEAD`, { cwd: rootDir, stdio: 'ignore' });
    } catch {
      errors.push(`foundry/state.json head commit '${state.head}' does not exist in git repository.`);
    }
    try {
      execSync(`git merge-base --is-ancestor ${state.last_verified_head} HEAD`, { cwd: rootDir, stdio: 'ignore' });
    } catch {
      errors.push(`foundry/state.json last_verified_head commit '${state.last_verified_head}' does not exist in git repository.`);
    }
  }

  if (!ALLOWED_STATES.has(state.status)) {
    errors.push(`Illegal project status in state.json: ${state.status}`);
  }

  console.log(`✓ Checked state.json: Project '${state.project}', Status '${state.status}'`);

  // 2. Audit foundry/claims.jsonl
  const claimsPath = path.join(rootDir, 'foundry', 'claims.jsonl');
  let claimsCount = 0;
  if (!fs.existsSync(claimsPath)) {
    errors.push('foundry/claims.jsonl does not exist.');
  } else {
    const claimsContent = fs.readFileSync(claimsPath, 'utf8').trim().split('\n');
    for (const [idx, line] of claimsContent.entries()) {
      if (!line.trim()) continue;
      claimsCount++;
      try {
        const claim = JSON.parse(line);
        if (!claim.id || !claim.claim || !claim.state || !claim.command) {
          errors.push(`Claim at line ${idx + 1} missing required fields (id, claim, state, command).`);
        }
        if (!ALLOWED_STATES.has(claim.state)) {
          errors.push(`Claim ${claim.id} has illegal state: ${claim.state}`);
        }
        if (claim.last_verified_head) {
          try {
            execSync(`git merge-base --is-ancestor ${claim.last_verified_head} HEAD`, { cwd: rootDir, stdio: 'ignore' });
          } catch {
            errors.push(`Claim ${claim.id} last_verified_head commit '${claim.last_verified_head}' does not exist in git.`);
          }
        }
        if (!claim.evidence || !Array.isArray(claim.evidence) || claim.evidence.length === 0) {
          errors.push(`Claim ${claim.id} has no evidence files declared.`);
        } else {
          for (const ev of claim.evidence) {
            const evPath = path.join(rootDir, ev);
            if (!fs.existsSync(evPath)) {
              errors.push(`Claim ${claim.id} references missing evidence path: ${ev}`);
            }
          }
        }
      } catch (err) {
        errors.push(`Claim at line ${idx + 1} is invalid JSON: ${err.message}`);
      }
    }
    console.log(`✓ Checked claims.jsonl: ${claimsCount} claims audited and validated against evidence.`);
  }

  // 3. Audit foundry/gaps.jsonl
  const gapsPath = path.join(rootDir, 'foundry', 'gaps.jsonl');
  let gapsCount = 0;
  let criticalOpen = 0;
  if (!fs.existsSync(gapsPath)) {
    errors.push('foundry/gaps.jsonl does not exist.');
  } else {
    const gapsContent = fs.readFileSync(gapsPath, 'utf8').trim().split('\n');
    for (const [idx, line] of gapsContent.entries()) {
      if (!line.trim()) continue;
      gapsCount++;
      try {
        const gap = JSON.parse(line);
        if (!gap.id || !gap.title || !gap.status || !gap.severity) {
          errors.push(`Gap at line ${idx + 1} missing required fields (id, title, status, severity).`);
        }
        if (!ALLOWED_GAP_STATUSES.has(gap.status)) {
          errors.push(`Gap ${gap.id} has illegal status: ${gap.status}`);
        }
        if (gap.status === 'CLOSED') {
          if (!gap.closed_by_commit) {
            errors.push(`Gap ${gap.id} is marked CLOSED but lacks 'closed_by_commit'.`);
          } else {
            try {
              execSync(`git merge-base --is-ancestor ${gap.closed_by_commit} HEAD`, { cwd: rootDir, stdio: 'ignore' });
            } catch {
              errors.push(`Gap ${gap.id} closed_by_commit '${gap.closed_by_commit}' does not exist in git.`);
            }
          }
          if (!gap.evidence || gap.evidence.length === 0) {
            errors.push(`Gap ${gap.id} is marked CLOSED but lacks evidence.`);
          }
        }
        if (gap.severity === 'CRITICAL' && gap.status !== 'CLOSED' && gap.status !== 'REJECTED_NOT_A_GAP') {
          criticalOpen++;
        }
      } catch (err) {
        errors.push(`Gap at line ${idx + 1} is invalid JSON: ${err.message}`);
      }
    }
    console.log(`✓ Checked gaps.jsonl: ${gapsCount} gaps recorded (${criticalOpen} critical open).`);
    if (criticalOpen > 0) {
      errors.push(`Foundry invariant breach: ${criticalOpen} CRITICAL gaps remain open in project.`);
    }
  }

  // 4. Audit foundry/phases/*
  const phasesDir = path.join(rootDir, 'foundry', 'phases');
  if (fs.existsSync(phasesDir)) {
    const files = fs.readdirSync(phasesDir).filter(f => f.endsWith('.md'));
    console.log(`✓ Checked phases directory: ${files.length} phase specifications found.`);
    for (const f of files) {
      const content = fs.readFileSync(path.join(phasesDir, f), 'utf8');
      if (!content.includes('STATUS:')) {
        warnings.push(`Phase file ${f} does not declare STATUS: header.`);
      }
      if (!content.includes('Exit gate')) {
        warnings.push(`Phase file ${f} does not declare an Exit gate.`);
      }
    }
  } else {
    warnings.push('foundry/phases directory is missing.');
  }

  finish(errors, warnings);
}

function finish(errors, warnings) {
  console.log('\n────────────────────────────────────────────────────────────────');
  if (warnings.length > 0) {
    console.log(`⚠️  ${warnings.length} Foundry Warnings:`);
    for (const w of warnings) console.log(`   - ${w}`);
  }

  if (errors.length > 0) {
    console.error(`❌ ${errors.length} Foundry Control Plane Errors Found:`);
    for (const e of errors) console.error(`   - ${e}`);
    console.log('────────────────────────────────────────────────────────────────\n');
    process.exit(1);
  }

  console.log('✅ ALL FOUNDRY CONTROL PLANE INVARIANTS SATISFIED (0 VIOLATIONS)');
  console.log('────────────────────────────────────────────────────────────────\n');
}

runCheck();
