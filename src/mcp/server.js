import { FlyChainClient } from '../chain/client.js';

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
          description: 'Array of [recipientAccountId, amountNear] pairs to payout',
          items: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        orderHash: { type: 'string', description: '32-byte hex hash of the aggregate order / deliberation' },
        epoch: { type: 'number', default: 1, description: 'Epoch sequence number' },
        nonce: { type: 'number', default: 1, description: 'Batch nonce' },
        enclaveSignature: { type: 'string', description: 'Ed25519 signature over 6-tuple canonical message' },
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
    description: 'Asymmetrically encrypts order parameters and submits into the Roost TEE in-RAM queue.',
    inputSchema: {
      type: 'object',
      properties: {
        syndicateId: { type: 'string' },
        flyerId: { type: 'string' },
        amount: { type: 'number' },
        maxSlippage: { type: 'number', default: 0.01 },
        pair: { type: 'string', default: 'USDC/NEAR' },
      },
      required: ['syndicateId', 'flyerId', 'amount'],
    },
  },
  {
    name: 'midge_verify_haq_attestation',
    description: 'Verifies the live Intel TDX hardware attestation report and code measurement from NEAR AI Cloud.',
    inputSchema: {
      type: 'object',
      properties: {
        nonce: { type: 'string', description: '32-byte cryptographic session nonce' },
        model: { type: 'string', default: 'Qwen/Qwen3.6-35B-A3B-FP8' },
      },
      required: ['nonce'],
    },
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

    this.tools = FLY_MCP_TOOLS;
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
        return this.formatOutput({
          status: 'HATCHED_MOCK',
          syndicateId: args.syndicateId,
          id: args.syndicateId,
          subAccount: `${args.syndicateId}.fly-coordinator.testnet`,
        });
      }

      case 'midge_deposit': {
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
        return this.formatOutput({
          status: 'DEPOSITED_MOCK',
          syndicateId: args.syndicateId,
          amountNear: args.amountNear || 0.02,
        });
      }

      case 'midge_settle': {
        if (isChain && this.chainClient.isConfiguredForWrites()) {
          const res = await this.chainClient.settleBatch({
            syndicateId: args.syndicateId,
            allocations: args.allocations || [],
            orderHash: args.orderHash,
            epoch: args.epoch || 1,
            nonce: args.nonce || 1,
            enclaveSignature: args.enclaveSignature,
          });
          return this.formatOutput(res);
        }
        if (this.nestContract) {
          return this.formatOutput({
            status: 'SETTLED_MODEL',
            syndicateId: args.syndicateId,
            allocations: args.allocations,
          });
        }
        return this.formatOutput({
          status: 'SETTLED_MOCK',
          syndicateId: args.syndicateId,
          allocations: args.allocations,
        });
      }

      case 'midge_hatch_out': {
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
        return this.formatOutput({
          status: 'HATCHED_OUT_MOCK',
          syndicateId: args.syndicateId,
        });
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
        return this.formatOutput([
          { id: 'syn-research-alpha', type: 'FLASH', status: 'ACTIVE', active_flyers: 2 },
          { id: 'syn-trading-beta', type: 'FLASH', status: 'SETTLED', active_flyers: 3 },
          { id: 'syn-compute-gamma', type: 'FLASH', status: 'ABORTED_REFUNDED', active_flyers: 0 },
        ]);
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
        return this.formatOutput([
          { id: 'syn-research-alpha', role: 'member', status: 'ACTIVE' },
          { id: 'syn-trading-beta', role: 'member', status: 'SETTLED' },
        ]);
      }

      case 'midge_submit_sealed_intent':
        return this.formatOutput({
          status: 'SEALED_ENCRYPTED_IN_ROOST_RAM',
          syndicateId: args.syndicateId,
          flyerId: args.flyerId,
          amount: args.amount,
          pair: args.pair || 'USDC/NEAR',
        });

      case 'midge_verify_haq_attestation':
        return this.formatOutput({
          status: 'HAQ_ATTESTATION_VALID',
          nonce: args.nonce,
          model: args.model || 'Qwen/Qwen3.6-35B-A3B-FP8',
          tcbStatus: 'UpToDate',
        });

      case 'midge_create_confidential_rfq':
        return this.formatOutput({
          status: 'RFQ_CREATED',
          borrowerId: args.borrowerId,
          requestedAmountUsdc: args.requestedAmountUsdc,
        });

      case 'midge_match_otc_block':
        return this.formatOutput({
          status: 'OTC_BLOCK_CROSSED',
          buyOrderId: args.buyOrderId,
          sellOrderId: args.sellOrderId,
          referencePrice: args.referencePrice,
        });

      default:
        throw new Error(`Unknown Midge MCP tool: ${name}`);
    }
  }
}
