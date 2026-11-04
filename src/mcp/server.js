import { FlyChainClient } from '../chain/client.js';
import { FlyNestContract } from '../contracts/nest.js';
import { ConfidentialRfqFacility } from '../facilities/rfq-adjudication.js';
import { OtcBlockTradeFacility } from '../facilities/otc-block-trade.js';

/**
 * Custom Array wrapper to support both array methods (e.g. .length, .map, iterators)
 * and JSON serialization with { mode, notice, syndicates: [...] }
 */
class SyndicateListResult extends Array {
  constructor(items = [], mode = 'chain', notice = null) {
    if (typeof items === 'number') {
      super(items);
      return;
    }
    const arr = Array.isArray(items) ? items : (items ? [items] : []);
    super(...arr);
    this.mode = mode;
    this.notice = notice;
    this.syndicates = arr;
  }

  toJSON() {
    return {
      mode: this.mode,
      ...(this.notice ? { notice: this.notice } : {}),
      count: this.length,
      syndicates: [...this],
    };
  }
}

/**
 * Midge Model Context Protocol (MCP) Tool Specifications:
 * Fully compatible with NEAR AI's official MCP ecosystem (nearai/near-mcp)
 * and anthropic/cursor tool-calling standards.
 */
export const FLY_MCP_TOOLS = [
  {
    name: 'midge_hatch_syndicate',
    description: 'Instantiates a new confidential Flash Syndicate or persistent Dark Vault on NEAR L1 with bounded release policy.',
    inputSchema: {
      type: 'object',
      properties: {
        syndicateId: { type: 'string', description: 'Unique identifier for the syndicate' },
        syndicateType: { type: 'string', enum: ['FLASH', 'DARK_VAULT'], default: 'FLASH' },
        quorumThreshold: { type: 'number', description: 'Minimum number of Flyers required to deliberate' },
        maxSpendNear: { type: 'number', description: 'OutLayer per-flyer spending cap in NEAR' },
        enclavePublicKey: { type: 'string', description: "The Roost's Ed25519 settlement public key, 64 hex characters. Required on chain: the contract only accepts settlements signed by this key, so a syndicate hatched without a real one can never be settled" },
        expectedCodeHash: { type: 'string', description: 'Expected MRENCLAVE measurement of the Roost enclave' },
        timeoutBlocks: { type: 'number', description: 'Timelock block window before escape hatch unlocks' },
        allowedRecipients: {
          type: 'array',
          items: { type: 'string' },
          description: 'Immutable allowlist of recipient accounts for bounded settlement (max 8)',
        },
        maxReleaseBpsPerEpoch: {
          type: 'number',
          default: 10000,
          description: 'Maximum basis points of escrow releasable per epoch (<= 10000)',
        },
        settleDeadlineBlock: {
          type: 'number',
          description: 'Absolute block height deadline after which settlement is rejected and exit unlocks',
        },
      },
      required: ['syndicateId', 'expectedCodeHash'],
    },
  },
  {
    name: 'midge_deposit',
    description: 'Deposits escrow collateral into a syndicate on NEAR L1 with cryptographic release policy hash consent.',
    inputSchema: {
      type: 'object',
      properties: {
        syndicateId: { type: 'string', description: 'Unique identifier of the target syndicate' },
        amountNear: { type: 'number', default: 0.02, description: 'Deposit amount in NEAR (minimum 0.01 NEAR)' },
        policyHash: { type: 'string', description: 'SHA-256 release policy hash to consent to (optional, auto-queried if omitted)' },
        flyerId: { type: 'string', description: 'Flyer account ID (model mode only; in chain mode uses signer)' },
      },
      required: ['syndicateId'],
    },
  },
  {
    name: 'midge_settle',
    description: 'Executes bounded batch settlement allocating syndicate escrow to allowlisted recipients under verified enclave signature.',
    inputSchema: {
      type: 'object',
      properties: {
        syndicateId: { type: 'string', description: 'Unique identifier of the target syndicate' },
        allocations: {
          type: 'array',
          description: 'Array of [recipientAccountId, amountNear] pairs (or { recipient, amount } objects) to pay out',
          items: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        orderHash: { type: 'string', description: "The Roost's aggregate order hash (the aggregate_order_hash the signature covers)" },
        nonce: { type: 'string', description: "The syndicate's current round_nonce, read from get_syndicate. It changes after every settlement that leaves escrow behind" },
        enclaveSignature: { type: 'string', description: "The Roost's Ed25519 signature over contract:syndicate:epoch:nonce:allocationsHash:orderHash, 128 hex characters" },
      },
      required: ['syndicateId', 'allocations'],
    },
  },
  {
    name: 'midge_hatch_out',
    description: 'Non-custodial sovereign escape valve unlocking 100% individual refund of escrow without coordinator approval.',
    inputSchema: {
      type: 'object',
      properties: {
        syndicateId: { type: 'string', description: 'Unique identifier of the target syndicate' },
        flyerId: { type: 'string', description: 'Flyer account ID requesting escape' },
      },
      required: ['syndicateId'],
    },
  },
  {
    name: 'midge_list_syndicates',
    description: 'Lists active and settled syndicates on the Midge Autonomous Syndicate Network (paginated).',
    inputSchema: {
      type: 'object',
      properties: {
        fromIndex: { type: 'number', default: 0, description: 'Starting offset index for pagination' },
        limit: { type: 'number', default: 10, description: 'Number of syndicates to fetch (max 50)' },
      },
    },
  },
  {
    name: 'midge_get_my_syndicates',
    description: 'Finds all syndicates where the specified account is either creator/owner or participating flyer.',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: 'NEAR account ID of member' },
        fromIndex: { type: 'number', default: 0, description: 'Starting offset index for pagination' },
        limit: { type: 'number', default: 10, description: 'Number of syndicates to fetch (max 50)' },
      },
      required: ['accountId'],
    },
  },
  {
    name: 'midge_submit_sealed_intent',
    description: 'Submits an ALREADY SEALED bid (ciphertext) to the Roost. This tool never sees or echoes the bid: seal it first against the Roost session key (SDK sealBid, or encrypt to the published public key). Plaintext amounts are refused.',
    inputSchema: {
      type: 'object',
      properties: {
        syndicateId: { type: 'string' },
        flyerId: { type: 'string' },
        cipherTextHex: { type: 'string', description: 'Bid sealed to a model-sealed or hosted Roost, hex' },
        cipherTextBase64: { type: 'string', description: 'Bid sealed to a local-simulation Roost (RSA), base64' },
      },
      required: ['syndicateId', 'flyerId'],
    },
  },
  {
    name: 'midge_verify_haq_attestation',
    description: 'Runs a fresh attestation of the Roost this server is configured with and reports VERIFIED only if every check passes. A local simulation Roost has no hardware attestation and is reported NOT_VERIFIED. A hosted Roost must be verified with scripts/verify-hosted-roost.js, which needs the dstack verifier; this tool reports NOT_VERIFIED for it rather than guess. A fresh nonce is generated per call.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'midge_create_confidential_rfq',
    description: 'Creates a private institutional borrowing facility with in-enclave sealed quote matching.',
    inputSchema: {
      type: 'object',
      properties: {
        borrowerId: { type: 'string' },
        requestedAmountUsdc: { type: 'number' },
        collateralAsset: { type: 'string', default: 'ETH' },
        collateralAmount: { type: 'number' },
        maxAprPercent: { type: 'number' },
        durationDays: { type: 'number' },
      },
      required: ['borrowerId', 'requestedAmountUsdc', 'collateralAmount', 'maxAprPercent'],
    },
  },
  {
    name: 'midge_match_otc_block',
    description: 'Crosses complementary high-volume institutional block orders at midpoint reference price.',
    inputSchema: {
      type: 'object',
      properties: {
        buyOrderId: { type: 'string' },
        sellOrderId: { type: 'string' },
        referencePrice: { type: 'number' },
      },
      required: ['buyOrderId', 'sellOrderId', 'referencePrice'],
    },
  },
];

export class FlyMcpServer {
  constructor({
    mode = null,
    chainClient = null,
    nestContract = null,
    roostEnclave = null,
    rfqFacility = null,
    otcFacility = null,
  } = {}) {
    // Mode resolution: explicit argument -> FLY_MODE env -> default 'chain'
    const envMode = process.env.FLY_MODE;
    this.mode = mode || envMode || (nestContract && !chainClient ? 'model' : 'chain');
    this.nestContract = nestContract;
    this.roostEnclave = roostEnclave;
    this.chainClient = chainClient;

    if (this.mode === 'chain' && !this.chainClient) {
      try {
        this.chainClient = new FlyChainClient();
      } catch (err) {
        // Fall back gracefully to model mode if chain client fails to initialize
        this.mode = 'model';
      }
    }

    // Model mode always has a real in-memory contract. Without one the tools used to answer with canned
    // *_MOCK successes that did nothing.
    if (this.mode === 'model' && !this.nestContract) this.nestContract = new FlyNestContract();
    this.rfq = rfqFacility || new ConfidentialRfqFacility();
    this.otc = otcFacility || new OtcBlockTradeFacility();
    this.tools = FLY_MCP_TOOLS;
  }

  /** Chain mode without write keys must refuse a write. Falling back to the model while the output says "chain" misleads the caller. */
  requireWritable(tool) {
    if (this.mode === 'chain' && !(this.chainClient && this.chainClient.isConfiguredForWrites())) {
      throw new Error(`[${tool}] chain mode needs NEAR_ACCOUNT_ID and NEAR_PRIVATE_KEY to send transactions. Set FLY_MODE=model to use the in-memory simulation instead.`);
    }
  }

  listTools() {
    return { tools: this.tools };
  }

  formatOutput(rawResult) {
    if (!rawResult || typeof rawResult !== 'object') {
      return {
        mode: this.mode,
        ...(this.mode === 'model' ? { notice: '[MODEL MODE, no chain]' } : {}),
        result: rawResult,
      };
    }

    if (Array.isArray(rawResult)) {
      const notice = this.mode === 'model' ? '[MODEL MODE, no chain]' : null;
      return new SyndicateListResult(rawResult, this.mode, notice);
    }

    return {
      mode: this.mode,
      ...(this.mode === 'model' ? { notice: '[MODEL MODE, no chain]' } : {}),
      ...rawResult,
    };
  }

  async executeTool(name, args = {}) {
    const isChain = this.mode === 'chain' && this.chainClient;

    switch (name) {
      case 'midge_hatch_syndicate': {
        this.requireWritable('midge_hatch_syndicate');
        if (isChain && this.chainClient.isConfiguredForWrites()) {
          const policy = {
            allowed_recipients: args.allowedRecipients || [this.chainClient.accountId],
            max_release_bps_per_epoch: args.maxReleaseBpsPerEpoch || 10000,
            settle_deadline_block: args.settleDeadlineBlock || 999999999,
          };
          const res = await this.chainClient.hatch({
            syndicateId: args.syndicateId,
            syndicateType: args.syndicateType || 'FLASH',
            quorumThreshold: args.quorumThreshold || 2,
            enclavePublicKey: args.enclavePublicKey,
            expectedCodeHash: args.expectedCodeHash,
            timeoutBlocks: args.timeoutBlocks || 100,
            releasePolicy: policy,
          });
          return this.formatOutput({
            ...res,
            id: res.syndicateId,
            subAccount: res.subAccount,
          });
        }
        if (this.nestContract) {
          const res = this.nestContract.hatch(args);
          return this.formatOutput({
            ...res,
            id: res.id,
            subAccount: res.subAccount,
          });
        }
        throw new Error('[midge_hatch_syndicate] no contract available');
      }

      case 'midge_deposit': {
        this.requireWritable('midge_deposit');
        if (isChain && this.chainClient.isConfiguredForWrites()) {
          const res = await this.chainClient.deposit({
            syndicateId: args.syndicateId,
            policyHash: args.policyHash,
            amountNear: args.amountNear !== undefined ? String(args.amountNear) : '0.02',
          });
          return this.formatOutput(res);
        }
        if (this.nestContract) {
          const flyer = args.flyerId || 'flyer.testnet';
          const amt = args.amountNear || 0.02;
          const res = this.nestContract.deposit(args.syndicateId, flyer, amt);
          return this.formatOutput(res);
        }
        throw new Error('[midge_deposit] no contract available');
      }

      case 'midge_settle': {
        this.requireWritable('midge_settle');
        if (isChain && this.chainClient.isConfiguredForWrites()) {
          const res = await this.chainClient.settleBatch({
            syndicateId: args.syndicateId,
            allocations: args.allocations || [],
            orderHash: args.orderHash,
            nonce: args.nonce,
            enclaveSignature: args.enclaveSignature,
          });
          return this.formatOutput(res);
        }
        if (this.nestContract) {
          if (!this.nestContract.syndicates?.has(args.syndicateId)) throw new Error(`Syndicate '${args.syndicateId}' not found`);
          return this.formatOutput({
            status: 'SETTLED_MODEL',
            syndicateId: args.syndicateId,
            allocations: args.allocations,
          });
        }
        throw new Error('[midge_settle] no contract available');
      }

      case 'midge_hatch_out': {
        this.requireWritable('midge_hatch_out');
        if (isChain && this.chainClient.isConfiguredForWrites()) {
          const res = await this.chainClient.hatchOut({
            syndicateId: args.syndicateId,
          });
          return this.formatOutput(res);
        }
        if (this.nestContract) {
          const flyer = args.flyerId || 'flyer.testnet';
          const res = this.nestContract.hatchOut(args.syndicateId, 999999, flyer);
          return this.formatOutput(res);
        }
        throw new Error('[midge_hatch_out] no contract available');
      }

      case 'midge_list_syndicates': {
        if (isChain) {
          const list = await this.chainClient.listSyndicates({
            fromIndex: args.fromIndex || 0,
            limit: args.limit || 10,
          });
          return this.formatOutput(list);
        }
        if (this.nestContract?.listSyndicates) {
          const list = this.nestContract.listSyndicates(args.fromIndex, args.limit);
          return this.formatOutput(list);
        }
        return this.formatOutput([]);
      }

      case 'midge_get_my_syndicates': {
        if (isChain) {
          const list = await this.chainClient.listSyndicatesByMember(args.accountId, {
            fromIndex: args.fromIndex || 0,
            limit: args.limit || 10,
          });
          return this.formatOutput(list);
        }
        if (this.nestContract?.getSyndicatesByMember) {
          const list = this.nestContract.getSyndicatesByMember(args.accountId, args.fromIndex, args.limit);
          return this.formatOutput(list);
        }
        return this.formatOutput([]);
      }

      case 'midge_submit_sealed_intent': {
        if (!this.roostEnclave) throw new Error('[midge_submit_sealed_intent] no Roost is configured on this server');
        if (args.amount !== undefined || (!args.cipherTextHex && !args.cipherTextBase64)) {
          throw new Error('[midge_submit_sealed_intent] pass a sealed bid (cipherTextHex or cipherTextBase64), never a plaintext amount. Seal it against the Roost session key first.');
        }
        const receipt = this.roostEnclave.submitSealedIntent({
          flyerId: args.flyerId,
          cipherTextHex: args.cipherTextHex,
          cipherTextBase64: args.cipherTextBase64,
        });
        return this.formatOutput({ syndicateId: args.syndicateId, flyerId: args.flyerId, ...receipt });
      }

      case 'midge_verify_haq_attestation': {
        const roost = this.roostEnclave;
        if (!roost) return this.formatOutput({ status: 'NOT_VERIFIED', reason: 'no Roost is configured on this server, so there is nothing to verify' });
        const d = typeof roost.describe === 'function' ? roost.describe() : {};
        if (!d.backend || d.backend === 'local') {
          return this.formatOutput({ status: 'NOT_VERIFIED', backend: 'local', reason: 'the local simulation Roost has no hardware attestation; its inputs are readable by the operator' });
        }
        if (typeof roost.attest === 'function') {
          try {
            const att = await roost.attest();
            const ok = att.checks.length > 0 && att.checks.every((c) => c.ok);
            return this.formatOutput({
              status: ok ? 'VERIFIED' : 'NOT_VERIFIED',
              backend: d.backend,
              model: roost.model,
              tcbStatus: att.tcbStatus,
              checks: att.checks.map((c) => ({ name: c.name, ok: c.ok })),
              ...(ok ? {} : { reason: 'one or more attestation checks failed' }),
            });
          } catch (err) {
            return this.formatOutput({ status: 'NOT_VERIFIED', backend: d.backend, reason: err.message });
          }
        }
        return this.formatOutput({ status: 'NOT_VERIFIED', backend: d.backend, reason: `backend '${d.backend}' is verified with scripts/verify-hosted-roost.js (needs the dstack verifier); this tool does not guess` });
      }

      case 'midge_create_confidential_rfq':
        return this.formatOutput(this.rfq.createRfq(args));

      case 'midge_match_otc_block':
        return this.formatOutput(this.otc.matchCrossingOrders(args.buyOrderId, args.sellOrderId, args.referencePrice));

      default:
        throw new Error(`Unknown Midge MCP tool: ${name}`);
    }
  }
}
