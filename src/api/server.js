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
  constructor({ port = 0, host = '127.0.0.1', allowedOrigins = null, apiKey = null, mode = null, roostBackend = null } = {}) {
    this.port = port;
    this.host = host;
    this.allowedOrigins = allowedOrigins;
    this.apiKey = apiKey || process.env.FLY_API_KEY || null;
    this.mode = mode || process.env.FLY_MODE || 'chain';
    this.nest = new FlyNestContract();
    this.chainClient = null;
    if (this.mode === 'chain') {
      try {
        this.chainClient = new FlyChainClient();
      } catch (e) {
        this.mode = 'model';
      }
    }
    this.roost = createRoost({ backend: roostBackend }); // auto: model-sealed with a NEARAI_API_KEY, else a local simulation
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
          const code = err.statusCode || 500;
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
      payload = {
        mode: this.mode,
        ...(this.mode === 'model' ? { notice: '[MODEL MODE, no chain]' } : {}),
        ...data,
      };
    }
    res.end(JSON.stringify(payload));
  }

  async handleRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;
    const method = req.method;

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
      const syn = this.nest.hatch({
        syndicateId: body.id,
        syndicateType: body.type || 'FLASH',
        quorumThreshold: body.quorumThreshold,
        maxSpendPerFlyer: body.maxSpendNear,
        expectedCodeHash: body.expectedCodeHash || 'mrenclave_code_hash_default',
        timeoutBlocks: body.timeoutBlocks,
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

    // List all syndicates (paginated)
    if (method === 'GET' && (pathname === '/v1/syndicates' || pathname === '/v1/syndicates/')) {
      const fromIndex = parseInt(url.searchParams.get('fromIndex') || '0', 10);
      const limit = parseInt(url.searchParams.get('limit') || '10', 10);
      if (this.mode === 'chain' && this.chainClient) {
        try {
          const list = await this.chainClient.listSyndicates({ fromIndex, limit });
          return this.sendJson(res, 200, {
            total: list.length,
            syndicates: list,
          }, req);
        } catch (e) {
          // fallback to model if rpc unavailable
        }
      }
      const list = this.nest.listSyndicates(fromIndex, limit);
      return this.sendJson(res, 200, {
        total: this.nest.getSyndicateCount(),
        syndicates: list.map((syn) => ({
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

    // List syndicates by member account
    if (method === 'GET' && pathname.startsWith('/v1/syndicates/member/')) {
      const memberId = pathname.replace('/v1/syndicates/member/', '');
      const fromIndex = parseInt(url.searchParams.get('fromIndex') || '0', 10);
      const limit = parseInt(url.searchParams.get('limit') || '10', 10);
      if (this.mode === 'chain' && this.chainClient) {
        try {
          const list = await this.chainClient.listSyndicatesByMember(memberId, { fromIndex, limit });
          return this.sendJson(res, 200, {
            member: memberId,
            syndicates: list,
          }, req);
        } catch (e) {
          // fallback to model if rpc unavailable
        }
      }
      const list = this.nest.getSyndicatesByMember(memberId, fromIndex, limit);
      return this.sendJson(res, 200, {
        member: memberId,
        syndicates: list.map((syn) => ({
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
      if (this.mode === 'chain' && this.chainClient?.isConfiguredForWrites()) {
        try {
          const result = await this.chainClient.settleBatch({
            syndicateId: synId,
            allocations: body.allocations || [],
            orderHash: body.orderHash,
            epoch: body.epoch,
            nonce: body.nonce,
            enclaveSignature: body.enclaveSignature,
          });
          return this.sendJson(res, 200, result);
        } catch (err) {
          return this.sendJson(res, 400, { error: err.message }, req);
        }
      }
      return this.sendJson(res, 200, {
        status: 'SETTLED_MODEL',
        syndicateId: synId,
        allocations: body.allocations,
      });
    }

    if (method === 'POST' && pathname.match(/^\/v1\/syndicates\/[^\/]+\/hatch-out$/)) {
      const synId = pathname.split('/')[3];
      const body = await this.parseBody(req);
      if (this.mode === 'chain' && this.chainClient?.isConfiguredForWrites()) {
        try {
          const result = await this.chainClient.hatchOut({ syndicateId: synId });
          return this.sendJson(res, 200, result);
        } catch (err) {
          return this.sendJson(res, 400, { error: err.message }, req);
        }
      }
      const flyer = body.flyerId || 'flyer.testnet';
      const result = this.nest.hatchOut(synId, 999999, flyer);
      return this.sendJson(res, 200, result);
    }

    // Pods inside Dark Vaults
    if (pathname.match(/^\/v1\/syndicates\/[^\/]+\/pods$/)) {
      const synId = pathname.split('/')[3];
      if (method === 'GET') {
        const pods = this.podsBySyndicate.get(synId) || new Map();
        const list = Array.from(pods.values()).map((p) => p.getPodSummary());
        return this.sendJson(res, 200, list);
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
      if (typeof this.roost.ensureAttested === 'function') await this.roost.ensureAttested();
      return this.sendJson(res, 200, { ...this.roost.getSessionInfo(), ...this.roost.describe() });
    }

    if (method === 'GET' && pathname === '/v1/roost/attestation') {
      const quote = await this.roost.getAttestationQuote();
      return this.sendJson(res, 200, quote);
    }

    if (method === 'POST' && pathname === '/v1/roost/intents/sealed') {
      const body = await this.parseBody(req);
      const receipt = this.roost.submitSealedIntent({
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

      return this.sendJson(res, 200, receipt);
    }

    if (method === 'POST' && pathname === '/v1/roost/aggregate') {
      const result = await this.roost.aggregateAndClear();
      return this.sendJson(res, 200, result);
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
      const sig = this.mpc.requestThresholdSignature(body);
      return this.sendJson(res, 200, sig);
    }

    // ==========================================
    // 8. Emergency Escape Hatch (/v1/emergency)
    // ==========================================
    if (method === 'POST' && pathname === '/v1/emergency/hatch-out') {
      const body = await this.parseBody(req);
      const currentBlock = body.currentBlock || 2000;
      const refund = this.nest.hatchOut(body.syndicateId, currentBlock, body.flyerId);

      this.events.emit('syndicate_event', {
        syndicateId: body.syndicateId,
        type: 'hatch_out_refund',
        payload: refund,
      });

      return this.sendJson(res, 200, refund);
    }

    if (method === 'GET' && pathname.startsWith('/v1/emergency/timelock/')) {
      const synId = pathname.split('/')[4];
      const syn = this.nest.syndicates.get(synId);
      if (!syn) return this.sendJson(res, 404, { error: 'Syndicate not found' });
      return this.sendJson(res, 200, {
        syndicateId: syn.id,
        createdAtBlock: syn.createdAtBlock,
        timeoutBlocks: syn.timeoutBlocks,
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
