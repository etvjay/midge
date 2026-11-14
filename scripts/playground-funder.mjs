#!/usr/bin/env node
/**
 * Creates the playground's funding account, `play.<main account>`, with its own new key, and moves testnet NEAR into it from the main account.
 * This is a human gate: it spends testnet NEAR, so it runs only when you say so.
 *
 *   node scripts/playground-funder.mjs --dry-run            shows what it would do, and changes nothing
 *   node scripts/playground-funder.mjs --fund 6             creates the account and funds it with 6 NEAR
 *
 * The new key is written to ~/.midge-phala/playground.env (mode 600, outside the repository) as FUNDER_ID and FUNDER_KEY, and nowhere else. The deployer
 * key (GAP-044) is only used here to sign the creation, and it never goes to the playground service.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { KeyPair } from 'near-api-js';
import { connect, near, fmt } from '../lab/lib/near.js';

const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? null : (process.argv[i + 1]?.startsWith('--') || process.argv[i + 1] === undefined ? true : process.argv[i + 1]); };
const dry = arg('dry-run') === true;
const fund = Number(arg('fund') || 6);
if (!dry && !arg('fund')) { console.error('say how much to fund with: --fund 6, or use --dry-run'); process.exit(2); }
if (!(fund >= 1 && fund <= 8)) { console.error('--fund must be between 1 and 8 NEAR'); process.exit(2); }

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const chain = await connect(root);
const id = `play.${chain.masterId}`;
const have = await chain.balance(chain.master);
const exists = await chain.provider.query({ request_type: 'view_account', finality: 'final', account_id: id }).then(() => true, () => false);
console.log(`main account ${chain.masterId} holds ${fmt(have, 3)} NEAR`);
console.log(`funder account ${id} ${exists ? 'ALREADY EXISTS' : 'does not exist yet'}`);
console.log(`would move ${fund} NEAR, leaving ${fmt(have - near(fund), 3)} NEAR on the main account`);
if (dry) { console.log('dry run: nothing was changed'); process.exit(0); }
if (exists) { console.error('the funder account already exists. Fund it by hand, or delete it first.'); process.exit(1); }
if (have < near(fund + 1)) { console.error(`the main account needs at least ${fund + 1} NEAR to do this safely`); process.exit(1); }

const key = KeyPair.fromRandom('ed25519');
await chain.master.createSubAccount({ accountOrPrefix: 'play', publicKey: key.getPublicKey(), nearToTransfer: near(fund) });
const dir = path.join(os.homedir(), '.midge-phala'); fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
const file = path.join(dir, 'playground.env');
const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter((l) => l && !/^FUNDER_(ID|KEY)=/.test(l)) : [];
fs.writeFileSync(file, [...existing, `FUNDER_ID=${id}`, `FUNDER_KEY=${key.toString()}`, ''].join('\n'), { mode: 0o600 });
console.log(`created ${id} with ${fund} NEAR. Its key is in ${file} (mode 600). Nothing was printed or written anywhere else.`);
