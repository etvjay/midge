#!/usr/bin/env node
/**
 * Runs the whole playground on this machine for development: the service, and a room in the same process with a SIMULATED attestation, against real NEAR
 * testnet and the real NEAR AI Cloud model. The lab's main account funds it (as in every lab experiment), so this is for development only. The deployed
 * playground uses a dedicated funder account and the attested room.
 *
 *   node scripts/playground-local.mjs [--port 8090] [--origin http://127.0.0.1:8000]
 */
import path from 'node:path';
import { connect, loadEnvFile } from '../lab/lib/near.js';
import { roostFromEnv, createRoostServer } from '../src/roost-service/server.js';
import { buildPlayground } from '../src/playground/app.js';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const chain = await connect(root); const env = loadEnvFile(root);
const RPCS = 'https://test.rpc.fastnear.com,https://near-testnet.drpc.org';
const ADMIN = `local-${Math.random().toString(36).slice(2)}`;
const provider = { simulated: true, attest: async () => Buffer.from('local-no-hardware'), info: async () => ({}) };
const roost = roostFromEnv({ ROOST_RPC_URLS: RPCS, ROOST_CONTRACT_ID: chain.coordinatorId, ROOST_REQUIRE_SIGNED_INPUTS: '1', ROOST_ACCOUNT_CHECK_RPC_URLS: RPCS }, provider);
const room = createRoostServer({ roost, adminKey: ADMIN });
await new Promise((r) => room.listen(0, '127.0.0.1', r));
const app = buildPlayground({ env: { FUNDER_ID: chain.masterId, FUNDER_KEY: chain.env.NEAR_PRIVATE_KEY, ROOM_URL: `http://127.0.0.1:${room.address().port}`, ROOM_ADMIN_KEY: ADMIN, NEARAI_API_KEY: env.NEARAI_API_KEY, NEAR_CONTRACT_ID: chain.coordinatorId, PLAYGROUND_ORIGIN: arg('origin', 'http://127.0.0.1:8000'), PLAYGROUND_PER_ADDRESS: '50', PLAYGROUND_LEDGER: path.join(root, '.lab', 'playground-ledger.json') }, overrides: { waker: null } });
const port = await app.start(Number(arg('port', 8090)));
console.error(`playground service on http://127.0.0.1:${port} (simulated room on ${room.address().port}). Press Ctrl-C to stop.`);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { await app.stop(); room.close(); process.exit(0); });
