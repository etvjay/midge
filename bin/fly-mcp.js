#!/usr/bin/env node
import readline from 'node:readline';
import { FlyMcpServer } from '../src/mcp/server.js';
import { FlyNestContract } from '../src/contracts/nest.js';
import { RoostEnclave } from '../src/enclave/roost.js';

/**
 * Fly Model Context Protocol (MCP) Server:
 * Provides stdio JSON-RPC transport for LLM coding agents (Claude Code, Cursor, Codex).
 */
const nest = new FlyNestContract();
const roost = new RoostEnclave();
const mcp = new FlyMcpServer({ nestContract: nest, roostEnclave: roost });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

function sendResponse(id, result, error = null) {
  const resp = { jsonrpc: '2.0', id };
  if (error) {
    resp.error = error;
  } else {
    resp.result = result;
  }
  process.stdout.write(JSON.stringify(resp) + '\n');
}

rl.on('line', async (line) => {
  if (!line.trim()) return;
  try {
    const req = JSON.parse(line);
    const { id, method, params } = req;

    switch (method) {
      case 'initialize':
        return sendResponse(id, {
          protocolVersion: '2024-11-05',
          serverInfo: {
            name: 'fly-syndicate-mcp',
            version: '0.1.0',
          },
          capabilities: {
            tools: {},
            resources: {},
          },
        });

      case 'tools/list':
        return sendResponse(id, mcp.listTools());

      case 'tools/call': {
        const { name, arguments: args } = params || {};
        try {
          const toolResult = await mcp.executeTool(name, args || {});
          return sendResponse(id, {
            content: [{ type: 'text', text: JSON.stringify(toolResult, null, 2) }],
          });
        } catch (toolErr) {
          return sendResponse(id, null, { code: -32000, message: toolErr.message });
        }
      }

      default:
        return sendResponse(id, null, { code: -32601, message: `Method not found: ${method}` });
    }
  } catch (err) {
    process.stderr.write(`[fly-mcp] Error: ${err.message}\n`);
  }
});
