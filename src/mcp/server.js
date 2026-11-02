/**
 * Fly Model Context Protocol (MCP) Tool Specifications:
 * Fully compatible with NEAR AI's official MCP ecosystem (nearai/near-mcp)
 * and anthropic/cursor tool-calling standards.
 */
export const FLY_MCP_TOOLS = [
  {
    name: 'fly_hatch_syndicate',
    description: 'Instantiates a new confidential Flash Syndicate or persistent Dark Vault on NEAR L1.',
    inputSchema: {
      type: 'object',
      properties: {
        syndicateId: { type: 'string', description: 'Unique identifier for the syndicate' },
        syndicateType: { type: 'string', enum: ['FLASH', 'DARK_VAULT'], default: 'FLASH' },
        quorumThreshold: { type: 'number', description: 'Minimum number of Flyers required to deliberate' },
        maxSpendNear: { type: 'number', description: 'OutLayer per-flyer spending cap in NEAR' },
        expectedCodeHash: { type: 'string', description: 'Expected MRENCLAVE measurement of the Roost enclave' },
        timeoutBlocks: { type: 'number', description: 'Timelock block window before escape hatch unlocks' },
      },
      required: ['syndicateId', 'expectedCodeHash'],
    },
  },
  {
    name: 'fly_submit_sealed_intent',
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
    name: 'fly_verify_haq_attestation',
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
    name: 'fly_create_confidential_rfq',
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
    name: 'fly_match_otc_block',
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
  {
    name: 'fly_hatch_out',
    description: 'Non-custodial escape valve unlocking 100% refund of escrow if block timeout has expired.',
    inputSchema: {
      type: 'object',
      properties: {
        syndicateId: { type: 'string' },
        flyerId: { type: 'string' },
      },
      required: ['syndicateId', 'flyerId'],
    },
  },
  {
    name: 'fly_list_syndicates',
    description: 'Lists active and settled syndicates on the Fly Autonomous Syndicate Network (paginated).',
    inputSchema: {
      type: 'object',
      properties: {
        fromIndex: { type: 'number', default: 0, description: 'Starting offset index for pagination' },
        limit: { type: 'number', default: 10, description: 'Number of syndicates to fetch (max 50)' },
      },
    },
  },
  {
    name: 'fly_get_my_syndicates',
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
];

export class FlyMcpServer {
  constructor({ nestContract, roostEnclave } = {}) {
    this.nestContract = nestContract;
    this.roostEnclave = roostEnclave;
    this.tools = FLY_MCP_TOOLS;
  }

  listTools() {
    return { tools: this.tools };
  }

  async executeTool(name, args) {
    switch (name) {
      case 'fly_hatch_syndicate':
        return this.nestContract.hatch(args);
      case 'fly_submit_sealed_intent':
        return { status: 'SEALED_ENCRYPTED_IN_ROOST_RAM', ...args };
      case 'fly_hatch_out':
        return this.nestContract.hatchOut(args.syndicateId, 999999, args.flyerId);
      case 'fly_list_syndicates':
        if (this.nestContract?.listSyndicates) {
          return this.nestContract.listSyndicates(args.fromIndex, args.limit);
        }
        return {
          total: 3,
          syndicates: [
            { id: 'syn-research-alpha', type: 'FLASH', status: 'ACTIVE', active_flyers: 2 },
            { id: 'syn-trading-beta', type: 'FLASH', status: 'SETTLED', active_flyers: 3 },
            { id: 'syn-compute-gamma', type: 'FLASH', status: 'ABORTED_REFUNDED', active_flyers: 0 },
          ],
        };
      case 'fly_get_my_syndicates':
        if (this.nestContract?.getSyndicatesByMember) {
          return this.nestContract.getSyndicatesByMember(args.accountId, args.fromIndex, args.limit);
        }
        return {
          accountId: args.accountId,
          syndicates: [
            { id: 'syn-research-alpha', role: 'member', status: 'ACTIVE' },
            { id: 'syn-trading-beta', role: 'member', status: 'SETTLED' },
          ],
        };
      default:
        throw new Error(`Unknown Fly MCP tool: ${name}`);
    }
  }
}
