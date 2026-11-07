import { RoomError } from '../roost-service/room-service.js';

/**
 * One JSON-RPC dispatcher for the MCP server, shared by the stdio binary and the HTTP endpoint so they cannot drift.
 * Methods: initialize, ping, tools/list, tools/call. Notifications (no id) get no response.
 */
export function createRpc(mcp, { serverInfo = { name: 'fly-syndicate-mcp', version: '0.1.0' }, protocolVersion = '2024-11-05' } = {}) {
  const reply = (id, result, error = null) => (error ? { jsonrpc: '2.0', id, error } : { jsonrpc: '2.0', id, result });

  async function handleOne(msg, ctx) {
    if (!msg || typeof msg !== 'object' || Array.isArray(msg) || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
      return reply(msg && typeof msg === 'object' && 'id' in msg ? msg.id : null, null, { code: -32600, message: 'Invalid Request' });
    }
    const { id, method, params } = msg;
    const isNotification = !('id' in msg);
    let out;
    switch (method) {
      case 'initialize':
        out = reply(id, { protocolVersion, serverInfo, capabilities: { tools: {} } }); break;
      case 'notifications/initialized':
      case 'notifications/cancelled':
        return null;
      case 'ping':
        out = reply(id, {}); break;
      case 'tools/list':
        out = reply(id, mcp.listTools()); break;
      case 'tools/call': {
        const { name, arguments: args } = params || {};
        try {
          const toolResult = await mcp.executeTool(name, args || {}, ctx);
          out = reply(id, { content: [{ type: 'text', text: JSON.stringify(toolResult, null, 2) }] });
        } catch (e) {
          const notAuth = e instanceof RoomError && e.code === 'NOT_AUTHORISED' && /coordinator key/.test(e.message);
          out = reply(id, null, { code: notAuth ? -32001 : -32000, message: e.message, ...(e instanceof RoomError ? { data: { code: e.code } } : {}) });
        }
        break;
      }
      default:
        out = reply(id, null, { code: -32601, message: `Method not found: ${method}` });
    }
    return isNotification ? null : out;
  }

  return {
    /** @returns the response object, or null when the message was a notification */
    handle: (msg, ctx = {}) => handleOne(msg, ctx),
    /** Handles a single message or a batch; returns the response, an array of responses, or null. */
    async handleAny(payload, ctx = {}) {
      if (!Array.isArray(payload)) return handleOne(payload, ctx);
      if (payload.length === 0) return reply(null, null, { code: -32600, message: 'Invalid Request' });
      const outs = (await Promise.all(payload.map((m) => handleOne(m, ctx)))).filter((x) => x !== null);
      return outs.length ? outs : null;
    },
  };
}
