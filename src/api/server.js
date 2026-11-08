import http from 'node:http';
import { EventEmitter } from 'node:events';
import { FlyNestContract } from '../contracts/nest.js';
import { FlyChainClient } from '../chain/client.js';
import { createRoost } from '../enclave/factory.js';
import { EnclaveCrypto } from '../enclave/crypto.js';
import { SyndicatePod } from '../syndicate/pod.js';
import { FarPrivateShardBridge } from '../settlement/far-shard.js';
import { ChainSignaturesMPC } from '../multichain/chain-signatures.js';
import { X402CommerceEngine } from '../commerce/x402.js';
import { ConfidentialRfqFacility } from '../facilities/rfq-adjudication.js';
import { OtcBlockTradeFacility } from '../facilities/otc-block-trade.js';
import { ConfidentialComputeSyndicate } from '../facilities/compute-syndicate.js';
import { ResilienceEngine } from '../resilience/failure-matrix.js';

export class FlyApiDaemon {
  constructor({ port = 0, host = '127.0.0.1', allowedOrigins = null, apiKey = null, mode = null, roostBackend = null, chainClient = null, roostOptions = {}, simulateHaq = false } = {}) {
    this.port = port;
    this.host = host;
    this.allowedOrigins = allowedOrigins;
    this.apiKey = apiKey || process.env.FLY_API_KEY || null;
    this.mode = mode || process.env.FLY_MODE || 'chain';
    this.nest = new FlyNestContract();
    this.chainClient = null;
    if (this.mode === 'chain') {
      try {
        this.chainClient = chainClient || new FlyChainClient();
      } catch (e) {
        this.mode = 'model';
      }
    }
    // One Roost per syndicate, created on first use. A single shared Roost kept one bid queue for every syndicate, so
    // aggregating for syndicate B totalled and cleared syndicate A's bids (GAP-014). Backend 'auto' picks model-sealed
    // with a NEARAI_API_KEY, else a local simulation. The hosted Roost is not served by this API: it has its own service.
    this.roostBackend = roostBackend;
    this.roostOptions = roostOptions;
    // An operator's explicit, visible choice to pretend the attestation gate passed (demos). Never taken from a request.
    this.simulateHaq = simulateHaq === true;
    this.roosts = new Map();
    this.maxRoosts = 1000;
    this.farShard = new FarPrivateShardBridge();
    this.mpc = new ChainSignaturesMPC({ networkId: 'testnet' });
    this.x402 = new X402CommerceEngine();
    this.rfq = new ConfidentialRfqFacility();
    this.otc = new OtcBlockTradeFacility();
    this.compute = new ConfidentialComputeSyndicate();
    this.resilience = new ResilienceEngine();

    this.events = new EventEmitter();
    this.podsBySyndicate = new Map(); // syndicateId -> Map<podId, SyndicatePod>
    this.server = null;
  }

  start() {
    return new Promise((resolve) => {
      this.server = http.createServer(async (req, res) => {
        try {
          await this.handleRequest(req, res);
        } catch (err) {
          // A rule the caller broke is a 4xx, not a server fault: an unknown id is 404, a refused early exit 423, a
          // contract-style REJECT 400. Anything else stays 500.
          const code = err.statusCode || (/not found/i.test(err.message) ? 404 : /LOCKED/.test(err.message) ? 423 : /\bREJECT\b/.test(err.message) ? 400 : 500);
          this.sendJson(res, code, { error: err.message }, req);
        }
      });

      this.server.listen(this.port, this.host, () => {
        const addr = this.server.address();
        this.actualPort = addr.port;
        resolve({ port: this.actualPort, host: this.host });
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  /** Parse and validate fromIndex, limit (1..50) and order (asc|desc) from a query string. Throws a 400. */
  parsePage(url) {
    const fromIndex = parseInt(url.searchParams.get('fromIndex') || '0', 10);
    const limit = parseInt(url.searchParams.get('limit') || '10', 10);
    const order = url.searchParams.get('order') || 'asc';
    const bad = (m) => { const err = new Error(m); err.statusCode = 400; throw err; };
    if (!Number.isInteger(fromIndex) || fromIndex < 0) bad('fromIndex must be an integer >= 0');
    if (!Number.isInteger(limit) || limit < 1) bad('limit must be an integer >= 1');
    if (!['asc', 'desc'].includes(order)) bad("order must be 'asc' or 'desc'");
    return { fromIndex, limit: Math.min(limit, 50), order };
  }

  /** Fetch one page: ascending from fromIndex, or descending from the end. `fetch(start, count)` returns items in index order. */
  async pageWindow(total, { fromIndex, limit, order }, fetchRange) {
    if (fromIndex >= total) return [];
    if (order === 'asc') return fetchRange(fromIndex, Math.min(limit, total - fromIndex));
    const count = Math.min(limit, total - fromIndex);
    const start = Math.max(0, total - fromIndex - count);
    return [...(await fetchRange(start, count))].reverse();
  }

  pageEnvelope(total, { fromIndex, limit, order }) {
    return { total, fromIndex, limit, order, hasMore: fromIndex + limit < total };
  }

  /** True when this server writes to the chain. In chain mode without write access a write is refused, never answered from the model. */
  chainWrites() {
    if (this.mode !== 'chain') return false;
    if (!this.chainClient?.isConfiguredForWrites()) {
      const err = new Error('Chain mode needs NEAR_ACCOUNT_ID and NEAR_PRIVATE_KEY to send transactions. Start the server with FLY_MODE=model to use the in-memory simulation instead.');
      err.statusCode = 409;
      throw err;
    }
    return true;
  }

  /** The chain record in the API's shape. Amounts: totalEscrow in NEAR (a number), totalEscrowYocto exact. */
  chainRecordToApi(rec) {
    const yocto = String(rec.total_escrow);
    return {
      id: rec.id, type: rec.syndicate_type === 'DarkVault' ? 'DARK_VAULT' : 'FLASH', subAccount: rec.sub_account, status: rec.status, epoch: Number(rec.epoch),
      totalEscrow: Number(yocto) / 1e24, totalEscrowYocto: yocto, quorumThreshold: rec.quorum_threshold, activeFlyers: rec.flyers, roundNonce: rec.round_nonce,
      enclavePublicKey: rec.enclave_public_key, timeoutBlocks: Number(rec.timeout_blocks), createdAtBlock: Number(rec.created_at_block), epochStartBlock: Number(rec.epoch_start_block),
    };
  }

  /**
   * Is the attestation gate for this syndicate's Roost satisfied? Decided here, from the Roost this server holds, never
   * from the request (a caller-supplied haqVerified made the gate whatever the caller said: GAP-015).
   * Verified means: a model-sealed Roost whose attestation passed every check with the Intel certificate chain required.
   */
  async haqFor(subAccount) {
    if (this.simulateHaq) return { verified: true, basis: 'SIMULATED: this server was started with simulateHaq, an operator choice; nothing was verified' };
    const synId = String(subAccount || '').split('.')[0];
    const roost = this.roosts.get(synId);
    if (!roost) return { verified: false, basis: `no Roost exists for syndicate '${synId}', so there is nothing to verify` };
    const backend = roost.describe().backend;
    if (backend !== 'model-sealed') return { verified: false, basis: `the Roost for '${synId}' is a ${backend} Roost, which has no hardware attestation` };
    if (roost.chain !== 'required') return { verified: false, basis: "the Roost does not require the Intel certificate chain; start the server with roostOptions: { chain: 'required' }" };
    const att = await roost.ensureAttested().catch((e) => ({ checks: [], error: e.message }));
    const ok = att.checks.length > 0 && att.checks.every((c) => c.ok);
    return { verified: ok, basis: ok ? `model-sealed Roost attested with the certificate chain (TCB ${att.tcbStatus})` : `attestation failed: ${att.error || att.checks.filter((c) => !c.ok).map((c) => c.name).join('; ')}` };
  }

  /** The Roost for one syndicate. Throws a 400 for a missing or malformed id and a 503 when too many are live. */
  roostFor(syndicateId, { create = true } = {}) {
    if (typeof syndicateId !== 'string' || !/^[a-z0-9_-]{3,64}$/.test(syndicateId)) {
      const err = new Error('syndicateId is required (3-64 characters matching [a-z0-9_-]): every syndicate has its own Roost and its own bids.');
      err.statusCode = 400;
      throw err;
    }
    if (!this.roosts.has(syndicateId)) {
      if (!create) return null;
      if (this.roosts.size >= this.maxRoosts) { const err = new Error('Too many live Roosts'); err.statusCode = 503; throw err; }
      this.roosts.set(syndicateId, createRoost({ backend: this.roostBackend, ...this.roostOptions }));
    }
    return this.roosts.get(syndicateId);
  }

  getCorsOrigin(req) {
    const origin = req?.headers?.origin;
    if (!origin) return null;
    if (
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
      (Array.isArray(this.allowedOrigins) && this.allowedOrigins.includes(origin))
    ) {
      return origin;
    }
    return null;
  }

  async parseBody(req, limitBytes = 512 * 1024) {
    return new Promise((resolve, reject) => {
      let body = '';
      let bytes = 0;
      let exceeded = false;
      req.on('data', (chunk) => {
        if (exceeded) return;
        bytes += chunk.length;
        if (bytes > limitBytes) {
          exceeded = true;
          req.pause();
          const err = new Error('Payload Too Large: Maximum allowed body size is 512KB');
          err.statusCode = 413;
          return reject(err);
        }
        body += chunk;
      });
      req.on('end', () => {
        if (exceeded) return;
        if (!body) return resolve({});
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          const err = new Error('Invalid JSON payload');
          err.statusCode = 400;
          reject(err);
        }
      });
      req.on('error', reject);
    });
  }

  sendJson(res, statusCode, data, req = null) {
    const request = req || res.req;
    const origin = this.getCorsOrigin(request);
    const headers = {
      'Content-Type': 'application/json',
    };
    if (origin) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Credentials'] = 'true';
      headers['Vary'] = 'Origin';
    }
    res.writeHead(statusCode, headers);
    let payload = data;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      // `mode` says what served THIS response: 'chain' only for routes that really talked to the chain, 'model' for
      // simulations (facilities, MPC, x402, pods, model-mode syndicates), 'off-chain' for the Roost.
      const served = res.servedBy || this.mode;
      payload = {
        mode: served,
        ...(served === 'model' ? { notice: '[MODEL MODE, no chain]' } : {}),
        ...data,
      };
    }
    res.end(JSON.stringify(payload));
  }

  async handleRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;
    const method = req.method;
    if (/^\/v1\/(syndicates|emergency)\b/.test(pathname) && !/\/pods$/.test(pathname)) res.servedBy = this.mode;
    else if (pathname.startsWith('/v1/roost/')) res.servedBy = 'off-chain';
    else if (/^\/v1\/(facilities|mpc|commerce)\b/.test(pathname) || /\/pods$/.test(pathname)) res.servedBy = 'model';

    // CORS preflight
    if (method === 'OPTIONS') {
      const origin = this.getCorsOrigin(req);
      const headers = {
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-402-Proof, X-Midge-Api-Key',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      };
      if (origin) {
        headers['Access-Control-Allow-Origin'] = origin;
        headers['Access-Control-Allow-Credentials'] = 'true';
      }
      res.writeHead(204, headers);
      return res.end();
    }

    // A web page must not be able to drive this server. A cross-site POST can be a CORS-simple request that needs no preflight,
    // and a rebound hostname reaches a loopback server from the user's own browser. Refuse a state-changing request from an origin
    // that is not allowed, and (on a loopback bind) any request whose Host is not a local name. Scripts and agents send no Origin.
    const origin = req.headers.origin;
    if (origin !== undefined && method !== 'GET' && method !== 'HEAD' && !this.getCorsOrigin(req)) {
      const err = new Error('Forbidden: this origin is not allowed to make changes');
      err.statusCode = 403;
      throw err;
    }
    if (/^(127\.|localhost$|::1$|\[::1\]$)/.test(this.host)) {
      const hostName = String(req.headers.host || '').replace(/:\d+$/, '').toLowerCase();
      if (hostName && !['localhost', '127.0.0.1', '[::1]'].includes(hostName)) {
        const err = new Error('Forbidden: unexpected Host header');
        err.statusCode = 403;
        throw err;
      }
    }

    // Optional API Key authentication enforcement when FLY_API_KEY is configured
    if (this.apiKey && pathname !== '/health' && pathname !== '/v1/health' && method !== 'OPTIONS') {
      const authHeader = req.headers['authorization'];
      const apiKeyHeader = req.headers['x-midge-api-key'];
      const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      const providedKey = apiKeyHeader || bearerToken;
      if (!providedKey || providedKey !== this.apiKey) {
        const err = new Error('Unauthorized: Invalid or missing X-Midge-Api-Key');
        err.statusCode = 401;
        throw err;
      }
    }

    // Health check endpoint
    if (method === 'GET' && (pathname === '/health' || pathname === '/v1/health')) {
      return this.sendJson(res, 200, {
        status: 'OK',
        uptime: process.uptime(),
        network: 'testnet',
        coordinatorContract: 'c.fly-1793636729.testnet',
        timestamp: Date.now(),
      }, req);
    }

    // ==========================================
    // 1. Server-Sent Events (SSE) Streaming
    // ==========================================
    if (method === 'GET' && pathname.startsWith('/v1/stream/syndicate/')) {
      const synId = pathname.split('/')[4];
      const origin = this.getCorsOrigin(req);
      const sseHeaders = {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        Vary: 'Origin',
      };
      if (origin) {
        sseHeaders['Access-Control-Allow-Origin'] = origin;
        sseHeaders['Access-Control-Allow-Credentials'] = 'true';
      }
      res.writeHead(200, sseHeaders);
      res.write(`event: connected\ndata: ${JSON.stringify({ syndicateId: synId, connectedAt: Date.now() })}\n\n`);

      const listener = (eventData) => {
        if (eventData.syndicateId === synId) {
          res.write(`event: ${eventData.type}\ndata: ${JSON.stringify(eventData.payload)}\n\n`);
        }
      };
      this.events.on('syndicate_event', listener);
      req.on('close', () => this.events.off('syndicate_event', listener));
      return;
    }

    if (method === 'GET' && pathname.startsWith('/v1/stream/facilities/rfq/')) {
      const loanId = pathname.split('/')[5];
      const origin = this.getCorsOrigin(req);
      const sseHeaders = {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        Vary: 'Origin',
      };
      if (origin) {
        sseHeaders['Access-Control-Allow-Origin'] = origin;
        sseHeaders['Access-Control-Allow-Credentials'] = 'true';
      }
      res.writeHead(200, sseHeaders);
      res.write(`event: connected\ndata: ${JSON.stringify({ loanId, connectedAt: Date.now() })}\n\n`);

      const listener = (eventData) => {
        if (eventData.loanId === loanId) {
          res.write(`event: ${eventData.type}\ndata: ${JSON.stringify(eventData.payload)}\n\n`);
        }
      };
      this.events.on('rfq_event', listener);
      req.on('close', () => this.events.off('rfq_event', listener));
      return;
    }

    // ==========================================
    // 2. Syndicate Endpoints (/v1/syndicates)
    // ==========================================
    if (method === 'POST' && pathname === '/v1/syndicates/hatch') {
      const body = await this.parseBody(req);
      if (!body.id || typeof body.id !== 'string' || !/^[a-z0-9_-]{3,64}$/.test(body.id)) {
        return this.sendJson(res, 400, {
          error: 'Invalid syndicate ID: Must be 3-64 characters matching [a-z0-9_-].',
        }, req);
      }
      if (body.quorumThreshold !== undefined && (typeof body.quorumThreshold !== 'number' || body.quorumThreshold < 1)) {
        return this.sendJson(res, 400, {
          error: 'quorumThreshold must be a positive integer >= 1.',
        }, req);
      }
      if (this.chainWrites()) {
        try {
          const policy = {
            allowed_recipients: body.allowedRecipients || [this.chainClient.accountId],
            max_release_bps_per_epoch: body.maxReleaseBpsPerEpoch || 10000,
            settle_deadline_block: body.settleDeadlineBlock || 999999999,
          };
          const tx = await this.chainClient.hatch({
            syndicateId: body.id, syndicateType: body.type || 'FLASH', quorumThreshold: body.quorumThreshold || 2,
            enclavePublicKey: body.enclavePublicKey, expectedCodeHash: body.expectedCodeHash, timeoutBlocks: body.timeoutBlocks || 100, releasePolicy: policy,
          });
          let rec = null;
          for (let i = 0; i < 10 && !rec; i += 1) { rec = await this.chainClient.getSyndicate(body.id).catch(() => null); if (!rec) await new Promise((r) => setTimeout(r, 1000)); }
          this.events.emit('syndicate_event', { syndicateId: body.id, type: 'hatched', payload: { id: body.id, txHash: tx.txHash } });
          return this.sendJson(res, 201, { syndicateId: body.id, subAccount: tx.subAccount, type: body.type || 'FLASH', status: rec?.status || 'PENDING', roundNonce: rec?.round_nonce || null, policyHash: tx.policyHash, txHash: tx.txHash, explorerUrl: tx.explorerUrl }, req);
        } catch (err) {
          return this.sendJson(res, 400, { error: err.message }, req);
        }
      }
      const syn = this.nest.hatch({
        syndicateId: body.id,
        syndicateType: body.type || 'FLASH',
        quorumThreshold: body.quorumThreshold,
        maxSpendPerFlyer: body.maxSpendNear,
        expectedCodeHash: body.expectedCodeHash || 'mrenclave_code_hash_default',
        timeoutBlocks: body.timeoutBlocks,
        currentBlock: this.nest.blockNow(),
      });

      this.events.emit('syndicate_event', {
        syndicateId: syn.id,
        type: 'hatched',
        payload: { id: syn.id, subAccount: syn.subAccount, type: syn.type },
      });

      return this.sendJson(res, 201, {
        syndicateId: syn.id,
        subAccount: syn.subAccount,
        type: syn.type,
        status: syn.status,
        roundNonce: syn.roundNonce,
      });
    }

    // List all syndicates (paginated). total is the number of records, not the page length; order is asc (default,
    // oldest first) or desc (newest first). Pruning swaps the last record into the freed slot, so "newest" means highest index.
    if (method === 'GET' && (pathname === '/v1/syndicates' || pathname === '/v1/syndicates/')) {
      const page = this.parsePage(url);
      if (this.mode === 'chain' && this.chainClient) {
        try {
          const total = await this.chainClient.getSyndicateCount();
          const items = await this.pageWindow(total, page, (start, count) => this.chainClient.listSyndicates({ fromIndex: start, limit: count }));
          return this.sendJson(res, 200, { ...this.pageEnvelope(total, page), syndicates: items.map((r) => this.chainRecordToApi(r)) }, req);
        } catch (e) {
          return this.sendJson(res, 502, { error: `Could not read the chain: ${e.message}` }, req);
        }
      }
      const total = this.nest.getSyndicateCount();
      const items = await this.pageWindow(total, page, (start, count) => this.nest.listSyndicates(start, count));
      return this.sendJson(res, 200, {
        ...this.pageEnvelope(total, page),
        syndicates: items.map((syn) => ({
          id: syn.id,
          type: syn.type,
          subAccount: syn.subAccount,
          status: syn.status,
          epoch: syn.epoch,
          totalEscrow: syn.totalEscrow,
          quorumThreshold: syn.quorumThreshold,
          activeFlyers: Array.from(syn.escrow ? syn.escrow.keys() : []),
          roundNonce: syn.roundNonce,
        })),
      }, req);
    }

    // List syndicates by member account. total counts the account's index entries, which can include syndicates that
    // were pruned until the account compacts its index, so a page can hold fewer than `limit` entries.
    if (method === 'GET' && pathname.startsWith('/v1/syndicates/member/')) {
      const memberId = pathname.replace('/v1/syndicates/member/', '');
      const page = this.parsePage(url);
      if (this.mode === 'chain' && this.chainClient) {
        try {
          const total = await this.chainClient.getMemberSyndicateCount(memberId);
          const items = await this.pageWindow(total, page, (start, count) => this.chainClient.listSyndicatesByMember(memberId, { fromIndex: start, limit: count }));
          return this.sendJson(res, 200, { member: memberId, ...this.pageEnvelope(total, page), syndicates: items.map((r) => this.chainRecordToApi(r)) }, req);
        } catch (e) {
          return this.sendJson(res, 502, { error: `Could not read the chain: ${e.message}` }, req);
        }
      }
      const total = this.nest.getSyndicatesByMember(memberId, 0, 1e9).length;
      const items = await this.pageWindow(total, page, (start, count) => this.nest.getSyndicatesByMember(memberId, start, count));
      return this.sendJson(res, 200, {
        member: memberId,
        ...this.pageEnvelope(total, page),
        syndicates: items.map((syn) => ({
          id: syn.id,
          type: syn.type,
          subAccount: syn.subAccount,
          status: syn.status,
          epoch: syn.epoch,
          totalEscrow: syn.totalEscrow,
        })),
      }, req);
    }

    if (method === 'GET' && pathname.startsWith('/v1/syndicates/') && !pathname.includes('/pods') && !pathname.includes('/deposit')) {
      const synId = pathname.split('/')[3];
      if (this.mode === 'chain' && this.chainClient) {
        let rec = null;
        try { rec = await this.chainClient.getSyndicate(synId); } catch (err) { return this.sendJson(res, 502, { error: `Could not read the chain: ${err.message}` }, req); }
        if (!rec) return this.sendJson(res, 404, { error: 'Syndicate not found' }, req);
        return this.sendJson(res, 200, this.chainRecordToApi(rec), req);
      }
      const syn = this.nest.syndicates.get(synId);
      if (!syn) return this.sendJson(res, 404, { error: 'Syndicate not found' });
      return this.sendJson(res, 200, {
        id: syn.id,
        type: syn.type,
        subAccount: syn.subAccount,
        status: syn.status,
        epoch: syn.epoch,
        totalEscrow: syn.totalEscrow,
        quorumThreshold: syn.quorumThreshold,
        activeFlyers: Array.from(syn.escrow.keys()),
        roundNonce: syn.roundNonce,
      });
    }

    if (method === 'POST' && pathname.match(/^\/v1\/syndicates\/[^\/]+\/deposit$/)) {
      const synId = pathname.split('/')[3];
      const body = await this.parseBody(req);
      if (this.chainWrites()) {
        try {
          // On chain the depositor is the account this server signs with; a flyerId in the body is not honoured.
          const dep = await this.chainClient.deposit({ syndicateId: synId, amountNear: String(body.amountNear ?? '0.02'), policyHash: body.policyHash || null, expect: body.expect || null });
          this.events.emit('syndicate_event', { syndicateId: synId, type: 'deposit_received', payload: { flyerId: dep.flyerId, amountNear: dep.amountNear, txHash: dep.txHash } });
          return this.sendJson(res, 200, dep, req);
        } catch (err) {
          return this.sendJson(res, 400, { error: err.message }, req);
        }
      }
      const receipt = this.nest.deposit(synId, body.flyerId, body.amountNear);

      this.events.emit('syndicate_event', {
        syndicateId: synId,
        type: 'deposit_received',
        payload: receipt,
      });

      return this.sendJson(res, 200, receipt);
    }

    if (method === 'POST' && pathname.match(/^\/v1\/syndicates\/[^\/]+\/settle$/)) {
      const synId = pathname.split('/')[3];
      const body = await this.parseBody(req);
      if (this.chainWrites()) {
        try {
          const result = await this.chainClient.settleBatch({
            syndicateId: synId,
            allocations: body.allocations || [],
            orderHash: body.orderHash,
            nonce: body.nonce,
            enclaveSignature: body.enclaveSignature,
          });
          return this.sendJson(res, 200, result);
        } catch (err) {
          return this.sendJson(res, 400, { error: err.message }, req);
        }
      }
      if (!this.nest.syndicates.has(synId)) return this.sendJson(res, 404, { error: 'Syndicate not found' }, req);
      return this.sendJson(res, 200, {
        status: 'SETTLED_MODEL',
        syndicateId: synId,
        allocations: body.allocations,
        binding: false,
        note: 'Model mode acknowledges the request only: no signature or allocation was checked and no state changed. Use chain mode for a binding settlement.',
      });
    }

    if (method === 'POST' && pathname.match(/^\/v1\/syndicates\/[^\/]+\/hatch-out$/)) {
      const synId = pathname.split('/')[3];
      const body = await this.parseBody(req);
      if (this.chainWrites()) {
        try {
          const result = await this.chainClient.hatchOut({ syndicateId: synId });
          return this.sendJson(res, 200, result);
        } catch (err) {
          return this.sendJson(res, 400, { error: err.message }, req);
        }
      }
      const flyer = body.flyerId || 'flyer.testnet';
      try {
        return this.sendJson(res, 200, this.nest.hatchOut(synId, this.nest.blockNow(), flyer), req);
      } catch (err) {
        return this.sendJson(res, /LOCKED/.test(err.message) ? 423 : /not found/i.test(err.message) ? 404 : 400, { error: err.message }, req);
      }
    }

    // Pods inside Dark Vaults
    if (pathname.match(/^\/v1\/syndicates\/[^\/]+\/pods$/)) {
      const synId = pathname.split('/')[3];
      if (method === 'GET') {
        const pods = this.podsBySyndicate.get(synId) || new Map();
        const list = Array.from(pods.values()).map((p) => p.getPodSummary());
        return this.sendJson(res, 200, { syndicateId: synId, pods: list }, req);
      }
      if (method === 'POST') {
        const body = await this.parseBody(req);
        const pod = new SyndicatePod({
          podId: body.podId,
          podType: body.podType,
          syndicateId: synId,
          maxCapitalAllocation: body.maxCapitalAllocation,
        });
        if (!this.podsBySyndicate.has(synId)) {
          this.podsBySyndicate.set(synId, new Map());
        }
        this.podsBySyndicate.get(synId).set(body.podId, pod);
        return this.sendJson(res, 201, pod.getPodSummary());
      }
    }

    // ==========================================
    // 3. Roost TEE Endpoints (/v1/roost)
    // ==========================================
    if (method === 'GET' && pathname === '/v1/roost/session-key') {
      const roost = this.roostFor(url.searchParams.get('syndicateId'));
      if (typeof roost.ensureAttested === 'function') await roost.ensureAttested();
      return this.sendJson(res, 200, { syndicateId: url.searchParams.get('syndicateId'), ...roost.getSessionInfo(), ...roost.describe() }, req);
    }

    if (method === 'GET' && pathname === '/v1/roost/attestation') {
      const quote = await this.roostFor(url.searchParams.get('syndicateId')).getAttestationQuote();
      return this.sendJson(res, 200, quote, req);
    }

    if (method === 'POST' && pathname === '/v1/roost/intents/sealed') {
      const body = await this.parseBody(req);
      const receipt = this.roostFor(body.syndicateId).submitSealedIntent({
        flyerId: body.flyerId,
        cipherTextBase64: body.cipherTextBase64,
        cipherTextHex: body.cipherTextHex,
        cipherText: body.cipherText,
      });

      this.events.emit('syndicate_event', {
        syndicateId: body.syndicateId,
        type: 'sealed_intent_received',
        payload: { flyerId: body.flyerId, count: receipt.count },
      });

      return this.sendJson(res, 200, receipt, req);
    }

    if (method === 'POST' && pathname === '/v1/roost/aggregate') {
      const body = await this.parseBody(req);
      const roost = this.roostFor(body.syndicateId, { create: false });
      if (!roost) return this.sendJson(res, 404, { error: `No Roost for syndicate '${body.syndicateId}': nothing was sealed for it.` }, req);
      return this.sendJson(res, 200, await roost.aggregateAndClear(), req);
    }

    // ==========================================
    // 4. Dark Facilities: RFQ & Private Credit (/v1/facilities/rfq)
    // ==========================================
    if (method === 'POST' && pathname === '/v1/facilities/rfq') {
      const body = await this.parseBody(req);
      const rfq = this.rfq.createRfq(body);
      return this.sendJson(res, 201, rfq);
    }

    if (method === 'POST' && pathname.match(/^\/v1\/facilities\/rfq\/[^\/]+\/quote$/)) {
      const rfqId = pathname.split('/')[4];
      const body = await this.parseBody(req);
      const resData = this.rfq.submitQuote({ rfqId, ...body });
      return this.sendJson(res, 200, resData);
    }

    if (method === 'POST' && pathname.match(/^\/v1\/facilities\/rfq\/[^\/]+\/match$/)) {
      const rfqId = pathname.split('/')[4];
      const loan = this.rfq.matchAndBindLoan(rfqId);
      return this.sendJson(res, 200, loan);
    }

    if (method === 'GET' && pathname.match(/^\/v1\/facilities\/rfq\/loans\/[^\/]+\/health$/)) {
      const loanId = pathname.split('/')[5];
      const price = parseFloat(url.searchParams.get('collateralPrice') || '2500');
      const health = this.rfq.adjudicateHealth(loanId, price);

      this.events.emit('rfq_event', {
        loanId,
        type: health.actionRequired === 'NONE' ? 'healthy_tick' : health.actionRequired.toLowerCase(),
        payload: health,
      });

      return this.sendJson(res, 200, health);
    }

    // ==========================================
    // 5. Dark Facilities: OTC Block Trades (/v1/facilities/otc)
    // ==========================================
    if (method === 'POST' && pathname === '/v1/facilities/otc/orders') {
      const body = await this.parseBody(req);
      const order = this.otc.submitSealedOrder(body);
      return this.sendJson(res, 201, order);
    }

    if (method === 'POST' && pathname === '/v1/facilities/otc/cross') {
      const body = await this.parseBody(req);
      const trade = this.otc.matchCrossingOrders(body.buyOrderId, body.sellOrderId, body.referencePrice);
      return this.sendJson(res, 200, trade);
    }

    // ==========================================
    // 6. Dark Facilities: AI Compute Syndicate (/v1/facilities/compute)
    // ==========================================
    if (method === 'POST' && pathname === '/v1/facilities/compute/credits') {
      const body = await this.parseBody(req);
      const resData = this.compute.depositComputeCredits(body.flyerId, body.amountNear);
      return this.sendJson(res, 200, resData);
    }

    if (method === 'POST' && pathname === '/v1/facilities/compute/infer') {
      const body = await this.parseBody(req);
      const resData = await this.compute.executeConfidentialInference({
        prompt: body.prompt,
        requiredQuorum: body.requiredQuorum || 2,
      });
      return this.sendJson(res, 200, resData);
    }

    // ==========================================
    // 7. Omnichain MPC & Settlement (/v1/mpc)
    // ==========================================
    if (method === 'GET' && pathname.startsWith('/v1/mpc/identities/')) {
      const subAccount = pathname.split('/')[4];
      const derivationPath = url.searchParams.get('derivationPath') || 'syndicate-treasury';
      const identity = this.mpc.deriveOmnichainIdentity(subAccount, derivationPath);
      return this.sendJson(res, 200, identity);
    }

    if (method === 'POST' && pathname === '/v1/mpc/sign') {
      const body = await this.parseBody(req);
      // requestThresholdSignature is async: without the await a valid request answered "{}" and a rejected one
      // became an unhandled rejection that terminated the whole process.
      // Only named fields are forwarded. The body used to be passed whole, so a caller chose haqVerified AND simulate
      // (simulate:false would have asked for a live signature with this server's key).
      const haq = await this.haqFor(body.syndicateSubAccount);
      try {
        const sig = await this.mpc.requestThresholdSignature({
          syndicateSubAccount: body.syndicateSubAccount,
          targetChain: body.targetChain,
          payloadHash: body.payloadHash,
          haqVerified: haq.verified,
          simulate: true,
        });
        return this.sendJson(res, 200, { ...sig, haqBasis: haq.basis }, req);
      } catch (err) {
        if (/MPC REJECT/.test(err.message)) return this.sendJson(res, 403, { error: err.message, haqBasis: haq.basis }, req);
        throw err;
      }
    }

    // ==========================================
    // 8. Emergency Escape Hatch (/v1/emergency)
    // ==========================================
    if (method === 'POST' && pathname === '/v1/emergency/hatch-out') {
      const body = await this.parseBody(req);
      // The block height is never taken from the request: a caller could claim any height and open the timelock early.
      if (this.chainWrites()) {
        try {
          return this.sendJson(res, 200, await this.chainClient.hatchOut({ syndicateId: body.syndicateId }), req);
        } catch (err) {
          return this.sendJson(res, 400, { error: err.message }, req);
        }
      }
      let refund;
      try {
        refund = this.nest.hatchOut(body.syndicateId, this.nest.blockNow(), body.flyerId);
      } catch (err) {
        return this.sendJson(res, /LOCKED/.test(err.message) ? 423 : /not found/i.test(err.message) ? 404 : 400, { error: err.message }, req);
      }

      this.events.emit('syndicate_event', {
        syndicateId: body.syndicateId,
        type: 'hatch_out_refund',
        payload: refund,
      });

      return this.sendJson(res, 200, refund);
    }

    if (method === 'GET' && pathname.startsWith('/v1/emergency/timelock/')) {
      const synId = pathname.split('/')[4];
      if (this.mode === 'chain' && this.chainClient) {
        const rec = await this.chainClient.getSyndicate(synId).catch(() => null);
        if (!rec) return this.sendJson(res, 404, { error: 'Syndicate not found' }, req);
        const now = await this.chainClient.getBlockHeight();
        return this.sendJson(res, 200, { syndicateId: rec.id, createdAtBlock: Number(rec.created_at_block), timeoutBlocks: Number(rec.timeout_blocks), currentBlock: now, blocksRemaining: Math.max(0, Number(rec.timeout_blocks) - (now - Number(rec.epoch_start_block))) }, req);
      }
      const syn = this.nest.syndicates.get(synId);
      if (!syn) return this.sendJson(res, 404, { error: 'Syndicate not found' });
      return this.sendJson(res, 200, {
        syndicateId: syn.id,
        createdAtBlock: syn.createdAtBlock,
        timeoutBlocks: syn.timeoutBlocks,
        currentBlock: this.nest.blockNow(),
        blocksRemaining: Math.max(0, syn.timeoutBlocks - (this.nest.blockNow() - syn.epochStartBlock)),
      });
    }

    // ==========================================
    // 9. x402 Agent Micro-Commerce (/v1/commerce)
    // ==========================================
    if (method === 'POST' && pathname === '/v1/commerce/challenge') {
      const body = await this.parseBody(req);
      const inv = this.x402.createPaymentChallenge(body);
      return this.sendJson(res, 201, inv);
    }

    if (method === 'POST' && pathname === '/v1/commerce/settle') {
      const body = await this.parseBody(req);
      const receipt = this.x402.settleInvoice(body);
      return this.sendJson(res, 200, receipt);
    }

    if (method === 'GET' && pathname.startsWith('/v1/commerce/data/')) {
      const resourceId = pathname.split('/')[4];
      const authHeader = req.headers['authorization'];
      const proof = authHeader?.startsWith('X402-Proof ') ? authHeader.split(' ')[1] : null;

      // Cryptographically verify payment proof against settled invoices
      const verified = this.x402.verifyPaymentProof(proof, resourceId);

      if (!verified) {
        // Issue HTTP 402 Payment Required with X-402 headers
        const origin = this.getCorsOrigin(req);
        const respHeaders = {
          'Content-Type': 'application/json',
          Vary: 'Origin',
          'X-402-Payment-Required': 'true',
          'X-402-Price-USDC': '2.50',
          'X-402-Invoice-Resource': resourceId,
          'X-402-Settlement-Method': 'PINGPAY_CONFIDENTIAL_MICROPAYMENT',
        };
        if (origin) {
          respHeaders['Access-Control-Allow-Origin'] = origin;
          respHeaders['Access-Control-Allow-Credentials'] = 'true';
        }
        res.writeHead(402, respHeaders);
        return res.end(
          JSON.stringify({
            statusCode: 402,
            message: 'Payment Required: In-deliberation micro-fee required to access proprietary data feed.',
            priceUsdc: 2.5,
            resourceId,
          })
        );
      }

      // Payment verified: release proprietary data payload
      return this.sendJson(res, 200, {
        resourceId,
        data: 'ALPHA_SIGNALS_CROSS_CHAIN_PROPRIETARY_SIGNAL_DATA',
        releasedTo: verified.buyerFlyerId,
        paymentProof: verified.receiptId,
        verifiedAt: Date.now(),
      }, req);
    }

    // 404 Not Found
    this.sendJson(res, 404, { error: `Endpoint not found: ${method} ${pathname}` });
  }
}
