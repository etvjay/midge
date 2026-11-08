#!/usr/bin/env node
/**
 * Prints what a model host reports about itself (the TDX measurements in its attestation), read several times, and a
 * MIDGE_MODEL_MEASUREMENTS setting you can paste if you decide to trust that build. Read-only: it pins nothing, needs no API key,
 * and spends nothing.   node scripts/measure-model.js [--model <name>] [--runs <n>] [--base-url <url>]
 */
import { readModelMeasurements, formatPinSuggestion } from '../src/enclave/attestation.js';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };
const known = new Set(['--model', '--runs', '--base-url']);
for (const a of args) if (a.startsWith('--') && !known.has(a)) { console.error(`unknown option ${a}`); process.exit(2); }

const model = opt('model', 'Qwen/Qwen3.6-35B-A3B-FP8');
const runs = Number(opt('runs', '3'));
if (!Number.isInteger(runs) || runs < 1 || runs > 10) { console.error('--runs must be 1 to 10'); process.exit(2); }
try {
  const result = await readModelMeasurements({ model, runs, baseUrl: opt('base-url', 'https://cloud-api.near.ai') });
  console.log(formatPinSuggestion(result));
  process.exit(result.stable ? 0 : 1);
} catch (e) {
  console.error(`could not read the host: ${e.message}`);
  process.exit(1);
}
