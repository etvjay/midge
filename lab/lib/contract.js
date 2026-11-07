import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { bs58encode } from '../../src/chain/client.js';

/** The contract build the lab's own deployment was written against. Changes with any contract change. */
// 4Zzj8DuT... deployed 2026-11-05 (settle_batch_charged); 9y8w4PU5... was the GAP-022 fix a few hours earlier. The previous deployment, Gh8NAA2e78ETMMAWvExPnYfuKtRe2wQT2FHJ2RRXcPR9, is what every
// run recorded before that date cites; it is rebuilt by checking out commit 0557027 or earlier.
export const PINNED_CODE_HASH = '4Zzj8DuTxwJnLv1c3jXfKRvQrxAYUFFfeMnAgSHJjevx';

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
