import http from 'node:http';
import { createChain } from './chain.js';
import { createQueue } from './queue.js';
import { createReviewGate } from './review-gate.js';
import { createRound } from './round.js';
import { createPlaygroundService } from './service.js';
import { createFileLedger } from './ledger.js';
import { makeReviewer } from './reviewer.js';
import { createRoomWaker } from './room-waker.js';
import { HostedRoostClient } from '../roost-service/client.js';
import { makeAgreeingAccountKeyCheck } from '../roost-service/signed-input.js';
import { AttestedAdvisor } from '../advisor/attested-advisor.js';

const need = (env, k) => { if (!env[k]) throw new Error(`${k} is required`); return env[k]; };
const list = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean);
const phalaFetchFor = (apiKey) => async (path, { method = 'GET' } = {}) => {
  const res = await fetch(`https://cloud-api.phala.com/api/v1${path}`, { method, headers: { 'X-API-Key': apiKey, accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
  return { ok: res.ok, status: res.status, json: await res.json().catch(() => ({})) };
};

/**
 * Builds the playground from its environment. `overrides` replaces a part (the room, the advisor, the waker) so the same wiring runs in a test or against
 * a room started in the same process. Nothing starts listening here: the caller starts the server after `round.sweepStartup()`.
 */
export function buildPlayground({ env, overrides = {} }) {
  const contractId = env.NEAR_CONTRACT_ID || 'c.fly-1793636729.testnet';
  const rpcUrls = list(env.NEAR_RPC_URLS || 'https://test.rpc.fastnear.com,https://near-testnet.drpc.org');
  const chain = overrides.chain || createChain({ rpcUrl: env.NEAR_RPC_URL || rpcUrls[0], funderId: need(env, 'FUNDER_ID'), funderKey: need(env, 'FUNDER_KEY'), contractId });
  const room = overrides.room || new HostedRoostClient({ baseUrl: need(env, 'ROOM_URL'), adminKey: need(env, 'ROOM_ADMIN_KEY') });
  const advisor = overrides.advisor || new AttestedAdvisor({ apiKey: need(env, 'NEARAI_API_KEY') });
  const keyCheck = overrides.keyCheck || makeAgreeingAccountKeyCheck({ rpcUrls, contractId });
  const ledger = overrides.ledger || createFileLedger(env.PLAYGROUND_LEDGER || null);
  const queue = createQueue({ perDay: Number(env.PLAYGROUND_PER_DAY || 60), perAddressPerHour: Number(env.PLAYGROUND_PER_ADDRESS || 3), funderFloor: String(BigInt(Math.round(Number(env.PLAYGROUND_FUNDER_FLOOR_NEAR || 2) * 1000)) * 10n ** 21n) });
  const gate = createReviewGate();
  const waker = overrides.waker !== undefined ? overrides.waker : (env.PHALA_CLOUD_API_KEY && env.ROOM_CVM_ID ? createRoomWaker({ phalaFetch: phalaFetchFor(env.PHALA_CLOUD_API_KEY), cvmId: env.ROOM_CVM_ID, roomUrl: need(env, 'ROOM_URL'), isBusy: () => queue.activeTicket() !== null }) : null);
  const round = createRound({ chain, room, keyCheck, ledger, prepare: waker ? () => waker.warm() : null, log: (m) => console.error(`[playground] ${m}`) });
  const handler = createPlaygroundService({ queue, gate, round, room, review: makeReviewer({ advisor }), chain, waker, config: { origins: list(env.PLAYGROUND_ORIGIN), trustProxy: env.PLAYGROUND_TRUST_PROXY === '1', trustedProxyHops: Number(env.PLAYGROUND_PROXY_HOPS || 1), maxBodyBytes: 16 * 1024 } });
  const server = http.createServer(handler);
  const timers = [];
  return {
    server, handler, round, queue, gate, chain, room, waker, ledger,
    async start(port) {
      await round.sweepStartup();
      timers.push(setInterval(() => handler.sweep(), 15_000), setInterval(() => waker?.tick().catch(() => {}), 60_000), setInterval(() => round.sweepStale().catch(() => {}), 5 * 60_000));
      await new Promise((resolve) => server.listen(port, resolve));
      return server.address().port;
    },
    async stop() { for (const t of timers) clearInterval(t); await new Promise((resolve) => server.close(resolve)); await round.idle(); },
  };
}
