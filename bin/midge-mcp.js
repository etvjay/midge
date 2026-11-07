#!/usr/bin/env node
import readline from 'node:readline';
import { FlyMcpServer } from '../src/mcp/server.js';
import { FlyNestContract } from '../src/contracts/nest.js';
import { createRoost } from '../src/enclave/factory.js';
import { createRpc } from '../src/mcp/rpc.js';
import { RoomsClient, remoteRooms } from '../src/sdk/rooms.js';

/**
 * Midge Model Context Protocol (MCP) Server:
 * Provides stdio JSON-RPC transport for LLM coding agents (Claude Code, Cursor, Codex). The same dispatcher serves the HTTP endpoint
 * (src/mcp/http.js). Set MIDGE_ROOMS_URL (and MIDGE_ROOMS_KEY, the coordinator key) to add the room tools, backed by a rooms API.
 */
const nest = new FlyNestContract();
const roost = createRoost();
const rooms = process.env.MIDGE_ROOMS_URL
  ? remoteRooms(new RoomsClient({ baseUrl: process.env.MIDGE_ROOMS_URL, adminKey: process.env.MIDGE_ROOMS_KEY || null }))
  : null;
const mcp = new FlyMcpServer({
  mode: process.env.FLY_MODE || 'chain',
  nestContract: nest,
  roostEnclave: roost,
  rooms,
});
const rpc = createRpc(mcp);
// Whoever launched this process holds whatever key it was given, so over stdio the caller is the coordinator.
const ctx = { coordinator: true };

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });

rl.on('line', async (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch (err) {
    process.stderr.write(`[midge-mcp] Error: ${err.message}\n`);
    return;
  }
  try {
    const out = await rpc.handleAny(msg, ctx);
    if (out !== null) process.stdout.write(JSON.stringify(out) + '\n');
  } catch (err) {
    process.stderr.write(`[midge-mcp] Error: ${err.message}\n`);
  }
});
