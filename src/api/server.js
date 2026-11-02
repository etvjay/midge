import http from 'node:http';
import { EventEmitter } from 'node:events';
import { FlyNestContract } from '../contracts/nest.js';
import { RoostEnclave } from '../enclave/roost.js';
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
  constructor({ port = 0 } = {}) {
    this.port = port;
    this.nest = new FlyNestContract();
    this.roost = new RoostEnclave();
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
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });

      this.server.listen(this.port, () => {
        const addr = this.server.address();
        this.actualPort = addr.port;
        resolve({ port: this.actualPort });
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

  async parseBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        if (!body) return resolve({});
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error('Invalid JSON'));
        }
      });
      req.on('error', reject);
    });
  }

  sendJson(res, statusCode, data) {
    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify(data));
  }

  async handleRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;
    const method = req.method;

    // CORS preflight
    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-402-Proof',
      });
      return res.end();
    }

    // ==========================================
    // 1. Server-Sent Events (SSE) Streaming
    // ==========================================
    if (method === 'GET' && pathname.startsWith('/v1/stream/syndicate/')) {
      const synId = pathname.split('/')[4];
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
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
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
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
      return this.sendJson(res, 200, {
        sessionNonce: this.roost.sessionNonce,
        publicKeyPem: this.roost.publicKeyPem,
        enclaveModel: this.roost.model,
      });
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
      });

      this.events.emit('syndicate_event', {
        syndicateId: body.syndicateId,
        type: 'sealed_intent_received',
        payload: { flyerId: body.flyerId, count: receipt.count },
      });

      return this.sendJson(res, 200, receipt);
    }

    if (method === 'POST' && pathname === '/v1/roost/aggregate') {
      const result = this.roost.aggregateAndClear();
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

      // Check if settled receipt exists for this proof
      const verified = this.x402.settledReceipts.find((r) => r.receiptId === proof);

      if (!verified) {
        // Issue HTTP 402 Payment Required with X-402 headers
        res.writeHead(402, {
          'Content-Type': 'application/json',
          'X-402-Payment-Required': 'true',
          'X-402-Price-USDC': '2.50',
          'X-402-Invoice-Resource': resourceId,
          'X-402-Settlement-Method': 'PINGPAY_CONFIDENTIAL_MICROPAYMENT',
        });
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
      });
    }

    // 404 Not Found
    this.sendJson(res, 404, { error: `Endpoint not found: ${method} ${pathname}` });
  }
}
