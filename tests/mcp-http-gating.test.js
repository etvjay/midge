// Audit run-1, lead 6: the MCP HTTP endpoint must refuse every tool that is not on the public list unless the caller holds
// the coordinator key. The chain-writing tools run as the server's NEAR account.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createMcpHttpHandler } from '../src/mcp/http.js';

const KEY = 'k'.repeat(24);

async function withServer(fn) {
  const calls = [];
  const rpc = { handleAny: async (payload, ctx) => { calls.push({ payload, ctx }); return { jsonrpc: '2.0', id: payload.id ?? null, result: { ok: true } }; } };
  const handle = createMcpHttpHandler(rpc, { adminKey: KEY });
  const server = http.createServer(async (req, res) => { if (!(await handle(req, res))) { res.writeHead(404); res.end(); } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/mcp`;
  const call = async (name, headers = {}) => {
    const res = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: {} } }) });
    return { status: res.status, json: await res.json() };
  };
  try { await fn({ call, calls }); } finally { await new Promise((r) => server.close(r)); }
}

for (const tool of ['midge_hatch_syndicate', 'midge_deposit', 'midge_settle', 'midge_hatch_out', 'midge_get_my_syndicates', 'midge_submit_sealed_intent', 'midge_create_confidential_rfq', 'midge_match_otc_block', 'midge_open_room_round', 'midge_run_room', 'midge_abandon_room_round', 'a_tool_nobody_has_heard_of']) {
  test(`${tool} is refused without the coordinator key and never reaches the dispatcher`, async () => {
    await withServer(async ({ call, calls }) => {
      const r = await call(tool);
      assert.equal(r.status, 401);
      assert.equal(r.json.error.data.code, 'NOT_AUTHORISED');
      assert.equal(calls.length, 0);
    });
  });
  test(`${tool} goes through with the coordinator key`, async () => {
    await withServer(async ({ call, calls }) => {
      const r = await call(tool, { 'x-roost-admin-key': KEY });
      assert.equal(r.status, 200);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].ctx.coordinator, true);
    });
  });
}

for (const tool of ['midge_describe_rooms', 'midge_submit_room_input', 'midge_list_syndicates', 'midge_verify_haq_attestation']) {
  test(`${tool} stays open to everyone`, async () => {
    await withServer(async ({ call }) => {
      assert.equal((await call(tool)).status, 200);
    });
  });
}
