// @ts-check
/**
 * MCP tools for rooms: five tools that mirror the five RoomService verbs. There is no tool per room kind and no tool takes a secret
 * key: a member's input arrives already sealed and signed, and the coordinator's key stays in the transport (the HTTP header, or the
 * process that launched the stdio server).
 */
const ROUND = {
  type: 'object',
  description: 'The round: the contract, the syndicate, the epoch and the round nonce read from the contract.',
  properties: { contractId: { type: 'string' }, syndicateId: { type: 'string' }, epoch: { type: 'integer' }, roundNonce: { type: 'string' } },
  required: ['contractId', 'syndicateId', 'epoch', 'roundNonce'],
};

export const ROOM_TOOLS = [
  {
    name: 'midge_describe_rooms',
    description: 'Lists the kinds of room this server can run (vote, pool, auction, quote, cross, rfq, payrun), the parameters each takes, whether each needs signed inputs, and the room\'s public keys. Read-only.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'midge_open_room_round',
    description: 'Opens a round on the room (coordinator only). Members\' inputs are signed for this round, so open it before anyone submits.',
    inputSchema: { type: 'object', properties: { round: ROUND }, required: ['round'] },
  },
  {
    name: 'midge_submit_room_input',
    description: 'Submits one member\'s input to the open round. The input must already be sealed to the room\'s key and signed by the member\'s NEAR key for this round: this tool never receives a secret key. Needs no coordinator key.',
    inputSchema: {
      type: 'object',
      properties: { input: { type: 'object', description: 'A sealed, signed input.', properties: { flyerId: { type: 'string' }, cipherTextHex: { type: 'string' }, publicKey: { type: 'string' }, signature: { type: 'string' }, seq: { type: 'integer', minimum: 1 } }, required: ['flyerId', 'cipherTextHex'] } },
      required: ['input'],
    },
  },
  {
    name: 'midge_run_room',
    description: 'Runs a room and returns the outcome and the finished contract call (method and arguments, including the room\'s signature), or no contract call when the room decided nothing (coordinator only). The room signs only what it computed.',
    inputSchema: {
      type: 'object',
      properties: {
        program: { type: 'string', description: 'A room kind from midge_describe_rooms.' },
        params: { type: 'object', description: 'The parameters that kind takes, as listed by midge_describe_rooms.' },
        round: ROUND,
        includeConfidential: { type: 'boolean', description: 'Also return plain detail meant only for the parties to a trade (an RFQ\'s units and price). Default false.' },
        escrowBlockHash: { type: 'string', description: 'With an escrow reader: read escrow at this block hash instead of the latest final block, so the two rooms of a two-room settlement read the same block.' },
      },
      required: ['program', 'round'],
    },
  },
  {
    name: 'midge_abandon_room_round',
    description: 'Gives up a signed round the contract rejected, so it can run again (coordinator only). Nothing changes on chain when a settlement is rejected, so the round\'s nonce is the same; this clears the host\'s mark and records what was abandoned. The abandoned signature stays valid on chain: if it reaches the chain first it can still land. Members re-submit with a higher seq.',
    inputSchema: { type: 'object', properties: { round: ROUND }, required: ['round'] },
  },
];

export const ROOM_TOOL_NAMES = new Set(ROOM_TOOLS.map((t) => t.name));
export const COORDINATOR_ONLY = new Set(['midge_open_room_round', 'midge_run_room', 'midge_abandon_room_round']);

/**
 * Tools anyone may call over HTTP: they read, or they hand in a member's own signed input. Every other tool, including any added
 * later, needs the coordinator key, because the chain-writing tools act as the server's NEAR account.
 */
export const PUBLIC_OVER_HTTP = new Set(['midge_describe_rooms', 'midge_submit_room_input', 'midge_list_syndicates', 'midge_verify_haq_attestation']);
