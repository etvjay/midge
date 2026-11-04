#!/usr/bin/env node
/**
 * Compute the compose hash a deployed Phala CVM must show in its attestation, from the provider's
 * app-compose and OUR compose file, without trusting a hash the provider reports.
 *   node scripts/compose-hash.js --cvm-json <file> --compose deploy/roost/docker-compose.yml
 * Prints JSON. Exit 1 if no app-compose was found or the provider changed our compose text.
 */
import fs from 'node:fs';
import { expectedComposeHashes } from '../src/roost-service/compose-hash.js';

const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d; };
const cvmFile = arg('cvm-json');
const composeFile = arg('compose', 'deploy/roost/docker-compose.yml');
if (!cvmFile) { console.error('usage: compose-hash.js --cvm-json <file> [--compose <file>]'); process.exit(2); }

let cvmJson;
try { const t = fs.readFileSync(cvmFile, 'utf8'); cvmJson = JSON.parse(t.slice(t.indexOf('{'))); } catch (e) { console.error(`cannot read ${cvmFile}: ${e.message}`); process.exit(2); }
const result = expectedComposeHashes({ cvmJson, ourCompose: fs.readFileSync(composeFile, 'utf8') });
console.log(JSON.stringify(result));
process.exit(result.ok && result.matchesOurCompose ? 0 : 1);
