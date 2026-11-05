import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { bs58encode } from '../../src/chain/client.js';

/** The contract build the lab's own deployment was written against. Changes with any contract change. */
// 9y8w4PU5... deployed 2026-11-05 (GAP-022 fix). The previous deployment, Gh8NAA2e78ETMMAWvExPnYfuKtRe2wQT2FHJ2RRXcPR9, is what every
// run recorded before that date cites; it is rebuilt by checking out commit 0557027 or earlier.
export const PINNED_CODE_HASH = '9y8w4PU57V5GNd463J8DGa33xeZx8329MQdTFsbTHWJm';

/**
 * Which code hash should the deployed contract have? In order: LAB_EXPECTED_CODE_HASH; the wasm built from this checkout
 * (so anyone who builds and deploys their own copy compares against their own build); the pinned hash of the lab's
 * deployment. Returns the hash and where it came from, so a failure message can say what was compared.
 */
export function expectedCodeHash(rootDir) {
  if (process.env.LAB_EXPECTED_CODE_HASH) return { hash: process.env.LAB_EXPECTED_CODE_HASH, source: 'LAB_EXPECTED_CODE_HASH' };
  const wasm = path.join(rootDir, 'contracts/fly-coordinator/target/wasm32-unknown-unknown/release/fly_coordinator.wasm');
  if (fs.existsSync(wasm)) return { hash: bs58encode(crypto.createHash('sha256').update(fs.readFileSync(wasm)).digest()), source: 'the wasm built from this checkout' };
  return { hash: PINNED_CODE_HASH, source: "the lab's pinned hash" };
}
