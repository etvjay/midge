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
 * @param {{nonce:string, model:string, chain?:'required'|'if-available'|'skip', acceptedTcb?:string[]}} opts
 */
export function checkModelCandidate(candidate, { nonce, model, chain = 'if-available', acceptedTcb = ['UpToDate'] }) {
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
  return { ok: checks.every((c) => c.ok), checks, tcbStatus, publicKey: pub };
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
  chain = 'if-available',
  acceptedTcb = ['UpToDate'],
  fetchImpl = globalThis.fetch,
}) {
  const nonce = crypto.randomBytes(32).toString('hex');
  const url = new URL(`${baseUrl.replace(/\/$/, '')}/v1/attestation/report`);
  url.search = new URLSearchParams({
    model, provider: 'near', signing_algo: 'ed25519', include_tls_fingerprint: 'false', nonce,
  }).toString();
  const res = await fetchImpl(url, { headers: { 'x-no-aliasing': 'true', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) } });
  if (!res.ok) throw new RoostAggregationError(`attestation request answered ${res.status}`);
  const accepted = selectVerifiedModelKey(await res.json(), { nonce, model, chain, acceptedTcb });
  return { nonce, publicKey: accepted.publicKey, tcbStatus: accepted.tcbStatus, checks: accepted.checks };
}
