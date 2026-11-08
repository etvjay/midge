/**
 * The OpenAPI 3.0 document for the rooms web API, built from two things that cannot drift from the code: the router's own route
 * table and the service's own description of its programs. Nothing here is hand-written per program.
 */
export const ERROR_CODES = ['INVALID_PARAMS', 'UNKNOWN_PROGRAM', 'ROUND_NOT_OPEN', 'NO_INPUTS', 'ALREADY_SIGNED', 'NOT_AUTHORISED', 'INTERNAL', 'NOT_FOUND', 'METHOD_NOT_ALLOWED', 'RATE_LIMITED', 'UNAVAILABLE'];

const TYPE = { string: { type: 'string' }, integer: { type: 'integer' }, object: { type: 'object' }, array: { type: 'array', items: {} }, boolean: { type: 'boolean' } };
function paramSchema(def) {
  const types = Array.isArray(def.type) ? def.type : [def.type];
  const base = types.length === 1 ? { ...(TYPE[types[0]] ?? {}) } : { oneOf: types.map((t) => ({ ...(TYPE[t] ?? {}) })) };
  if (def.description) base.description = def.description;
  if (def.enum) base.enum = def.enum;
  if ('default' in def) base.default = def.default;
  if (def.default === null) base.nullable = true;
  return base;
}
function programSchema(p) {
  const properties = Object.fromEntries(Object.entries(p.params).map(([k, d]) => [k, paramSchema(d)]));
  const required = Object.entries(p.params).filter(([, d]) => d.required).map(([k]) => k);
  return { type: 'object', description: p.summary, properties, ...(required.length ? { required } : {}), additionalProperties: false, ...(p.needsSignedInputs ? { 'x-needs-signed-inputs': true } : {}) };
}

const ERR = (name, description) => ({ description, content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } });
const ref = (name) => ({ $ref: `#/components/responses/${name}` });
const SECURITY = [{ coordinatorKey: [] }, { bearerAuth: [] }];

export function buildOpenApi(description, routes) {
  const programs = description.programs;
  const bodies = {
    describeRooms: null,
    openapi: null,
    openRound: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Round' } } } },
    submitInput: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/SignedInput' } } } },
    runRoom: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/RunRequest' } } } },
    abandonRound: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AbandonRequest' } } } },
  };
  const ok = {
    describeRooms: { description: 'What this room can do, and its public keys.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Description' } } } },
    openapi: { description: 'This document.', content: { 'application/json': { schema: { type: 'object' } } } },
    openRound: { description: 'The round is open.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Round' } } } },
    submitInput: { description: 'The input was accepted.', content: { 'application/json': { schema: { $ref: '#/components/schemas/InputAccepted' } } } },
    runRoom: { description: 'The outcome, and the finished contract call when the room decided something.', content: { 'application/json': { schema: { $ref: '#/components/schemas/RunResult' } } } },
    abandonRound: { description: 'The signed round was given up; it can run again.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Abandoned' } } } },
    events: { description: 'A server-sent event stream. Each event has an id, an event name and JSON data. Nothing sealed is ever sent: no member id, ciphertext, choice or trade term.', content: { 'text/event-stream': { schema: { type: 'string' } } } },
  };
  const errorsFor = (r) => ({
    ...(bodies[r.op] ? { 400: ref('BadRequest'), 413: ref('TooLarge') } : {}),
    ...(r.auth === 'coordinator' ? { 401: ref('Unauthorised') } : {}),
    ...(r.op === 'submitInput' ? { 403: ref('Forbidden') } : {}),
    ...(r.op === 'runRoom' ? { 404: ref('NotFound'), 409: ref('Conflict'), 503: ref('Unavailable') } : {}),
    ...(r.op === 'abandonRound' ? { 409: ref('Conflict') } : {}),
    ...(r.op === 'events' ? { 503: ref('Unavailable') } : {}),
    429: ref('RateLimited'), 500: ref('Internal'),
  });
  const paths = {};
  for (const r of routes) {
    paths[r.path] ??= {};
    paths[r.path][r.method.toLowerCase()] = {
      summary: r.summary, operationId: r.op,
      ...(r.auth === 'coordinator' ? { security: SECURITY } : {}),
      ...(r.op === 'events' ? { parameters: [{ name: 'Last-Event-ID', in: 'header', required: false, description: 'Resume after this event id; events still held in the last-100 ring are replayed.', schema: { type: 'string' } }, { name: 'lastEventId', in: 'query', required: false, description: 'The same, for clients that cannot set the header.', schema: { type: 'integer' } }], 'x-sse-events': { round_opened: { $ref: '#/components/schemas/EventRoundOpened' }, input_accepted: { $ref: '#/components/schemas/EventInputAccepted' }, round_run: { $ref: '#/components/schemas/EventRoundRun' } } } : {}),
      ...(bodies[r.op] ? { requestBody: bodies[r.op] } : {}),
      responses: { 200: ok[r.op], ...errorsFor(r) },
    };
  }
  const schemas = {
    Error: { type: 'object', required: ['error', 'code'], properties: { error: { type: 'string' }, code: { type: 'string', enum: [...ERROR_CODES] } } },
    Round: { type: 'object', required: ['contractId', 'syndicateId', 'epoch', 'roundNonce'], properties: { contractId: { type: 'string' }, syndicateId: { type: 'string' }, epoch: { type: 'integer' }, roundNonce: { type: 'string' } } },
    SignedInput: { type: 'object', required: ['flyerId', 'cipherTextHex'], description: 'A member\'s input, sealed to the room\'s key and signed with the member\'s NEAR key for the open round. The secret key never reaches this API.', properties: { flyerId: { type: 'string' }, cipherTextHex: { type: 'string' }, publicKey: { type: 'string' }, signature: { type: 'string' }, seq: { type: 'integer', minimum: 1 } } },
    InputAccepted: { type: 'object', properties: { accepted: { type: 'boolean' }, count: { type: 'integer' }, replaced: { type: 'boolean' } } },
    Description: { type: 'object', properties: { settlePublicKey: { type: 'string' }, intentPublicKey: { type: 'string' }, simulated: { type: 'boolean' }, requiresSignedInputs: { type: 'boolean' }, programs: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, summary: { type: 'string' }, needsSignedInputs: { type: 'boolean' }, params: { type: 'object' } } } } } },
    AbandonRequest: { type: 'object', required: ['round'], properties: { round: { $ref: '#/components/schemas/Round' } } },
    Abandoned: { type: 'object', required: ['abandoned', 'orderHash', 'roundNonce', 'messageSha256', 'allocationsHash', 'signature'], description: 'What was given up. The signature stays valid on chain: if conditions change it could still land if it reaches the chain first; the contract lets only one settlement land per round nonce.', properties: { abandoned: { type: 'boolean' }, orderHash: { type: 'string' }, roundNonce: { type: 'string' }, messageSha256: { type: 'string' }, allocationsHash: { type: 'string' }, chargesHash: { type: ['string', 'null'] }, signature: { type: 'string' } } },
    RunRequest: { type: 'object', required: ['program', 'round'], properties: { escrowBlockHash: { type: 'string', description: 'Read escrow at this block hash instead of the latest final block, so the two rooms of a two-room settlement read the same block (only with an escrow reader).' }, program: { type: 'string', enum: programs.map((p) => p.id) }, params: { oneOf: programs.map((p) => ({ $ref: `#/components/schemas/Params_${p.id}` })) }, round: { $ref: '#/components/schemas/Round' }, includeConfidential: { type: 'boolean', default: false, description: 'Ask for plain detail meant only for the parties to a trade (for example an RFQ\'s units and price). Needs the coordinator key.' } } },
    RunResult: { type: 'object', properties: { outcome: { type: 'object' }, orderHash: { type: 'string', nullable: true }, settlement: { type: 'object', nullable: true, description: 'The contract call, ready to send: a method and its arguments, including the room\'s signature. Null when the room decided nothing.', properties: { method: { type: 'string', enum: ['settle_batch', 'settle_batch_charged'] }, args: { type: 'object' } } }, statements: { type: 'object', description: 'Pay run only: receipts, each sealed to its reader.' }, confidential: { type: 'object' } } },
    EventRoundOpened: { type: 'object', description: 'A round was opened.', properties: { contractId: { type: 'string' }, syndicateId: { type: 'string' }, epoch: { type: 'integer' }, roundNonce: { type: 'string' } } },
    EventInputAccepted: { type: 'object', description: 'An input was accepted. Only a running count: never who sent it.', properties: { count: { type: 'integer' } } },
    EventRoundRun: { type: 'object', description: 'A room was run. Whether it decided something, never what.', properties: { program: { type: 'string' }, decided: { type: 'boolean' }, orderHash: { type: 'string', nullable: true } } },
    ...Object.fromEntries(programs.map((p) => [`Params_${p.id}`, programSchema(p)])),
  };
  return {
    openapi: '3.0.3',
    info: { title: 'Midge rooms API', version: '1.0.0', description: 'One door for every kind of room. Open a round, let members submit sealed inputs, run the room, and receive the finished contract call. The room signs only what it computed.' },
    paths,
    components: {
      securitySchemes: {
        coordinatorKey: { type: 'apiKey', in: 'header', name: 'X-Roost-Admin-Key', description: 'The coordinator\'s key. Opening a round and running a room need it.' },
        bearerAuth: { type: 'http', scheme: 'bearer', description: 'The same coordinator key as a Bearer token.' },
      },
      responses: {
        BadRequest: ERR('BadRequest', 'Invalid parameters or body (INVALID_PARAMS).'),
        TooLarge: ERR('TooLarge', 'The body is over the size limit.'),
        Unauthorised: ERR('Unauthorised', 'The coordinator key is missing or wrong (NOT_AUTHORISED).'),
        Forbidden: ERR('Forbidden', 'The input is not validly signed for this round (NOT_AUTHORISED).'),
        NotFound: ERR('NotFound', 'Unknown program (UNKNOWN_PROGRAM), or unknown route (NOT_FOUND).'),
        Conflict: ERR('Conflict', 'ROUND_NOT_OPEN, NO_INPUTS or ALREADY_SIGNED.'),
        RateLimited: ERR('RateLimited', 'Too many requests (RATE_LIMITED); see Retry-After.'),
        Unavailable: ERR('Unavailable', 'UNAVAILABLE: too many open event streams (see Retry-After), or the chain could not be read for the escrow check; the queue is kept and the call can be repeated.'),
        Internal: ERR('Internal', 'Unexpected failure (INTERNAL); the body never carries internal detail.'),
      },
      schemas,
    },
  };
}
