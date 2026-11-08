import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { RoostAggregationError } from './errors.js';

/**
 * Checks on a NEAR AI Cloud model attestation candidate (Ed25519 flavour).
 * REPORTDATA in the Intel TDX quote is [model signing public key, 32 B][request nonce, 32 B].
 * Candidates are never trusted until every check passes.
 */

/** Byte ranges of each 48-byte measurement in a TDX v4 quote. */
const MEASUREMENT_OFFSETS = { mrseam: [64, 112], mrtd: [184, 232], rtmr0: [376, 424], rtmr1: [424, 472], rtmr2: [472, 520], rtmr3: [520, 568] };
export const MEASUREMENT_FIELDS = Object.keys(MEASUREMENT_OFFSETS);

/** Normalise a pin like { mrtd: ['ab..'], rtmr3: ['..', '..'] }; throws on anything malformed so a typo cannot silently turn the pin off. */
function normalisePin(pin) {
  const bad = (why) => { throw new Error(`expectedMeasurements ${why}`); };
  if (pin === null || typeof pin !== 'object' || Array.isArray(pin)) bad('must be an object of field -> list of 96-hex-digit values');
  const out = {};
  for (const [field, values] of Object.entries(pin)) {
    if (!MEASUREMENT_FIELDS.includes(field)) bad(`has an unknown field "${field}" (known: ${MEASUREMENT_FIELDS.join(', ')})`);
    if (!Array.isArray(values) || values.length === 0) bad(`field ${field} must be a non-empty list`);
    out[field] = values.map((v) => { if (typeof v !== 'string' || !/^[0-9a-f]{96}$/i.test(v)) bad(`field ${field} has a value that is not 96 hex digits`); return v.toLowerCase(); });
  }
  return out;
}

/**
 * The owner's pin from the environment: MIDGE_MODEL_MEASUREMENTS, a JSON object of field -> list of accepted 96-hex-digit values,
 * for example {"mrtd":["…"],"rtmr0":["…","…"]}. Unset or empty means nothing is pinned. A setting that cannot be read is an error:
 * silently ignoring a typo would turn the pin off without telling anyone.
 */
export function measurementPinFromEnv(env = process.env) {
  const raw = env.MIDGE_MODEL_MEASUREMENTS;
  if (raw === undefined || String(raw).trim() === '') return null;
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error('MIDGE_MODEL_MEASUREMENTS is not valid JSON'); }
  try { return normalisePin(parsed); } catch (e) { throw new Error(`MIDGE_MODEL_MEASUREMENTS: ${e.message}`); }
}

export function parseTdxQuote(quoteHex) {
  const q = Buffer.from(String(quoteHex || ''), 'hex');
  if (q.length < 636) return { length: q.length, valid: false };
  return {
    length: q.length,
    valid: true,
    version: q.readUInt16LE(0),
    attKeyType: q.readUInt16LE(2),
    teeType: q.readUInt32LE(4),
    reportData: q.subarray(568, 632).toString('hex'),
    // What the machine measured about itself at boot: the TDX module (MRSEAM), the initial guest (MRTD) and four runtime registers.
    measurements: Object.fromEntries(Object.entries(MEASUREMENT_OFFSETS).map(([k, [a, b]]) => [k, q.subarray(a, b).toString('hex')])),
  };
}

function resolveDcapBin() {
  if (process.env.DCAP_QVL_BIN && fs.existsSync(process.env.DCAP_QVL_BIN)) return process.env.DCAP_QVL_BIN;
  const home = path.join(os.homedir(), '.cargo', 'bin', 'dcap-qvl');
  return fs.existsSync(home) ? home : 'dcap-qvl';
}

/** Verify the quote's certificate chain to Intel's root with dcap-qvl. */
export function verifyQuoteChain(quoteHex) {
  const tmp = path.join(os.tmpdir(), `roost_quote_${process.pid}_${Math.random().toString(36).slice(2)}.hex`);
  try {
    fs.writeFileSync(tmp, quoteHex);
    const out = execFileSync(resolveDcapBin(), ['verify', '--hex', tmp], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    const line = out.split('\n').find((l) => l.trim().startsWith('{'));
    if (!line) return { available: true, valid: false, error: 'dcap-qvl printed no result' };
    const result = JSON.parse(line);
    return { available: true, valid: true, tcbStatus: result.status, advisoryIds: result.advisory_ids || [] };
  } catch (err) {
    if (err.code === 'ENOENT') return { available: false, valid: false, error: 'dcap-qvl is not installed' };
    return { available: true, valid: false, error: String(err.stderr || err.message).trim().slice(0, 200) };
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* already gone */ }
  }
}

/**
 * @param {object} candidate   one entry of report.model_attestations
 * @param {{expectedMeasurements?: Record<string,string[]> (pin MRTD/RTMR0-3/MRSEAM: field -> accepted 96-hex values; without it the quote proves only that SOME genuine TDX machine holds the key), nonce:string, model:string, chain?:'required'|'if-available'|'skip' (default 'required': a missing dcap-qvl fails closed), acceptedTcb?:string[]}} opts
 */
export function checkModelCandidate(candidate, { nonce, model, chain = 'required', acceptedTcb = ['UpToDate'], expectedMeasurements = null }) {
  const pin = expectedMeasurements === null || expectedMeasurements === undefined ? null : normalisePin(expectedMeasurements);
  const checks = [];
  const add = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail });
  const pub = String(candidate.signing_public_key || '').toLowerCase();
  const quote = parseTdxQuote(candidate.intel_quote);
  const wantNonce = nonce.toLowerCase();

  add('signing algorithm is ed25519', candidate.signing_algo === 'ed25519', candidate.signing_algo);
  add('attestation is for the requested model', candidate.model_name === model, candidate.model_name);
  add('candidate echoes our nonce', String(candidate.request_nonce || '').toLowerCase() === wantNonce);
  add('quote is Intel TDX v4', quote.valid && quote.version === 4 && quote.attKeyType === 2 && quote.teeType === 0x81,
    quote.valid ? `v${quote.version}, type 0x${quote.teeType.toString(16)}` : 'quote too short');
  add('signing key is a 32-byte public key', /^[0-9a-f]{64}$/.test(pub));
  add('signing key is inside the quote', quote.valid && quote.reportData.slice(0, 64) === pub);
  add('nonce is inside the quote', quote.valid && quote.reportData.slice(64, 128) === wantNonce);

  if (pin) {
    for (const [field, allowed] of Object.entries(pin)) {
      const got = quote.valid ? quote.measurements[field] : '';
      add(`measurement ${field} is one the owner pinned`, allowed.includes(got), got ? `${field} ${got.slice(0, 16)}… is not in the pinned list` : `${field} unreadable: quote too short`);
    }
  }

  let tcbStatus = 'not-checked';
  if (chain !== 'skip') {
    const result = verifyQuoteChain(candidate.intel_quote);
    if (result.available) {
      add('Intel certificate chain verifies', result.valid, result.error || '');
      if (result.valid) {
        tcbStatus = result.tcbStatus;
        add('TCB status is acceptable', acceptedTcb.includes(result.tcbStatus), result.tcbStatus);
      }
    } else if (chain === 'required') {
      add('Intel certificate chain verifies', false, result.error);
    } else {
      tcbStatus = 'not-checked (dcap-qvl unavailable)';
    }
  }
  return { ok: checks.every((c) => c.ok), checks, tcbStatus, publicKey: pub, measurements: quote.valid ? quote.measurements : null, measurementsPinned: Boolean(pin) };
}

/** Pick the first candidate that passes every check, or throw with the reasons. */
export function selectVerifiedModelKey(report, opts) {
  const candidates = report && report.model_attestations;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new RoostAggregationError('attestation report has no model_attestations');
  }
  const outcomes = candidates.map((c) => checkModelCandidate(c, opts));
  const accepted = outcomes.find((o) => o.ok);
  if (!accepted) {
    const failed = outcomes.flatMap((o) => o.checks.filter((c) => !c.ok).map((c) => c.name));
    throw new RoostAggregationError(`no model attestation candidate passed: ${[...new Set(failed)].join('; ')}`);
  }
  return accepted;
}

/**
 * Fetch a model attestation with a fresh nonce and return the first candidate that passes every check.
 * No API key is needed: members can run this themselves, so they never have to take a coordinator's word
 * for which key to seal to.
 */
export async function fetchVerifiedModelKey({
  baseUrl = 'https://cloud-api.near.ai',
  model,
  apiKey = null,
  chain = 'required',
  acceptedTcb = ['UpToDate'],
  expectedMeasurements, // undefined: use MIDGE_MODEL_MEASUREMENTS if set; null: pin nothing; an object: pin exactly that
  fetchImpl = globalThis.fetch,
}) {
  const nonce = crypto.randomBytes(32).toString('hex');
  const url = new URL(`${baseUrl.replace(/\/$/, '')}/v1/attestation/report`);
  url.search = new URLSearchParams({
    model, provider: 'near', signing_algo: 'ed25519', include_tls_fingerprint: 'false', nonce,
  }).toString();
  const res = await fetchImpl(url, { headers: { 'x-no-aliasing': 'true', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) } });
  if (!res.ok) throw new RoostAggregationError(`attestation request answered ${res.status}`);
  const accepted = selectVerifiedModelKey(await res.json(), { nonce, model, chain, acceptedTcb, expectedMeasurements: expectedMeasurements === undefined ? measurementPinFromEnv() : expectedMeasurements });
  return { nonce, publicKey: accepted.publicKey, tcbStatus: accepted.tcbStatus, checks: accepted.checks, measurements: accepted.measurements, measurementsPinned: accepted.measurementsPinned };
}

const PIN_FIELDS = ['mrtd', 'rtmr0', 'rtmr1', 'rtmr2', 'rtmr3'];

/**
 * Read what a model host reports about itself, several times with a fresh nonce each time, and say whether the measurements held still.
 * Read-only: it pins nothing. The quote's own checks (key, nonce, certificate chain) still run on every read.
 */
export async function readModelMeasurements({ baseUrl, model, apiKey = null, runs = 2, chain = 'if-available', fetchImpl = globalThis.fetch } = {}) {
  const reads = [];
  for (let i = 0; i < runs; i += 1) {
    const r = await fetchVerifiedModelKey({ baseUrl, model, apiKey, chain, fetchImpl, expectedMeasurements: null });
    reads.push(r);
  }
  const first = reads[0].measurements;
  const differing = Object.keys(first).filter((f) => reads.some((r) => r.measurements[f] !== first[f]));
  return { model, runs, measurements: first, stable: differing.length === 0, differing, tcbStatus: reads[0].tcbStatus };
}

/** Plain text for the owner: the values read and, only if they held still, a setting to paste. */
export function formatPinSuggestion(result) {
  const lines = [`Model ${result.model}: read ${result.runs} times, each with a fresh nonce.`];
  for (const [f, v] of Object.entries(result.measurements)) lines.push(`  ${f.padEnd(6)} ${v}`);
  if (!result.stable) {
    lines.push('', `These measurements were NOT stable between reads (${result.differing.join(', ')} changed), so no setting is suggested.`);
    return lines.join('\n');
  }
  const pin = Object.fromEntries(PIN_FIELDS.map((f) => [f, [result.measurements[f]]]));
  lines.push('', 'To require this build, set:', `MIDGE_MODEL_MEASUREMENTS='${JSON.stringify(pin)}'`, '',
    'These values are only what was observed when the host was read. They have not been checked against anything NEAR AI publishes, so pinning them trusts that this is the build you mean to trust.',
    'If NEAR AI ships a new build, a pinned caller will refuse it until you add the new values to the lists (a list per field can hold the old and the new).');
  return lines.join('\n');
}
