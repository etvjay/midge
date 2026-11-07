#!/usr/bin/env node
// Writes docs/openapi/rooms.json from the router's route table and the room programs. Run: npm run build:openapi
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RoomService } from '../src/roost-service/room-service.js';
import { HostedRoost } from '../src/roost-service/hosted-roost.js';
import { buildOpenApi } from '../src/roost-service/room-openapi.js';
import { ROUTES } from '../src/roost-service/room-http.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const provider = { simulated: true, attest: async () => Buffer.alloc(0), info: async () => ({}) };
const svc = new RoomService({ host: new HostedRoost({ provider }) });
const out = path.join(root, 'docs/openapi/rooms.json');
fs.writeFileSync(out, JSON.stringify(buildOpenApi(svc.describe(), ROUTES), null, 2) + '\n');
console.log(`wrote ${path.relative(root, out)}`);
