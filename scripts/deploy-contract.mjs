#!/usr/bin/env node
/**
 * Deploy the built fly-coordinator wasm to the testnet coordinator account (c.<NEAR_ACCOUNT_ID>), then check the chain.
 * Prints no keys. Usage: node scripts/deploy-contract.mjs   (build first: npm run build:wasm)
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { connect } from '../lab/lib/near.js';
import { base58Encode } from '../src/roost-service/signed-input.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wasmPath = path.join(root, 'contracts/fly-coordinator/target/wasm32-unknown-unknown/release/fly_coordinator.wasm');
const wasm = fs.readFileSync(wasmPath);
const localHash = base58Encode(crypto.createHash('sha256').update(wasm).digest());
const chain = await connect(root);
const codeHashOnChain = async () => (await chain.provider.query({ request_type: 'view_code', finality: 'final', account_id: chain.coordinatorId })).hash;

const before = { hash: await codeHashOnChain(), syndicates: Number(await chain.view('get_syndicate_count', {})) };
console.log(`local build   ${localHash}  (${wasm.length} bytes)`);
console.log(`on chain now  ${before.hash}  (${before.syndicates} syndicates)`);
if (before.hash === localHash) { console.log('already deployed; nothing to do'); process.exit(0); }

const coord = chain.sub('c').account;
const res = await coord.deployContract(wasm);
const tx = res.transaction?.hash || res.transaction_outcome?.id;
console.log(`deploy tx     ${tx}`);
await chain.waitFor(async () => (await codeHashOnChain()) === localHash, { what: 'new code on chain', timeoutMs: 90000 });
const after = { hash: await codeHashOnChain(), syndicates: Number(await chain.view('get_syndicate_count', {})) };
console.log(`on chain now  ${after.hash}  (${after.syndicates} syndicates)`);
if (after.hash !== localHash) { console.error('MISMATCH after deploy'); process.exit(2); }
if (after.syndicates !== before.syndicates) { console.error(`STATE CHANGED: ${before.syndicates} -> ${after.syndicates} syndicates`); process.exit(3); }
// the new entry points must exist and the old ones still answer
console.log('get_second_enclave_key(unknown) ->', JSON.stringify(await chain.view('get_second_enclave_key', { syndicate_id: 'does-not-exist' })));
console.log('OK: code replaced, state intact');
console.log(JSON.stringify({ codeHash: after.hash, deployTx: tx }));
