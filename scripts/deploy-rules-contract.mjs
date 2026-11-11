#!/usr/bin/env node
/**
 * Deploy the current fly-coordinator build to a FRESH testnet sub-account (m.<NEAR_ACCOUNT_ID>), leaving the production contract
 * (c.<NEAR_ACCOUNT_ID>) and its recorded evidence untouched. The new contract is the one that asks the NEAR MPC signer for foreign
 * payments (GAP-045). Prints no keys. Usage: node scripts/deploy-rules-contract.mjs   (build first: npm run build:wasm)
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { connect, near, fmt } from '../lab/lib/near.js';
import { base58Encode } from '../src/roost-service/signed-input.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wasm = fs.readFileSync(path.join(root, 'contracts/fly-coordinator/target/wasm32-unknown-unknown/release/fly_coordinator.wasm'));
const localHash = base58Encode(crypto.createHash('sha256').update(wasm).digest());
const chain = await connect(root);
const m = chain.sub('m');
console.log(`new contract account ${m.id}; local build ${localHash} (${wasm.length} bytes)`);
let exists = true;
try { await chain.provider.query({ request_type: 'view_account', finality: 'final', account_id: m.id }); } catch { exists = false; }
if (!exists) {
  console.log(`master balance ${fmt(await chain.balance(chain.master))} NEAR; creating ${m.id} with 8 NEAR`);
  const r = await chain.master.createAccount({ newAccountId: m.id, publicKey: m.key.keyPair.getPublicKey(), nearToTransfer: near(8) });
  console.log(`create tx ${r.transaction?.hash || r.transaction_outcome?.id}`);
}
const dep = await m.account.deployContract(wasm);
console.log(`deploy tx ${dep.transaction?.hash || dep.transaction_outcome?.id}`);
await chain.waitFor(async () => (await chain.provider.query({ request_type: 'view_code', finality: 'final', account_id: m.id })).hash === localHash, { what: 'code on chain', timeoutMs: 90000 });
try { await m.account.callFunction({ contractId: m.id, methodName: 'new', args: {} }); console.log('initialised'); } catch (e) { if (!/already|initialized/i.test(String(e.message))) throw e; console.log('already initialised'); }
console.log('syndicate count', await chain.view('get_syndicate_count', {}, m.id));
console.log(JSON.stringify({ contract: m.id, codeHash: localHash }));
