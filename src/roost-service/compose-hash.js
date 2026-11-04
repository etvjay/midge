import crypto from 'node:crypto';

/**
 * dstack compose hash: sha256 of the app-compose JSON with keys sorted recursively and compact output
 * (a port of get-compose-hash.ts in Dstack-TEE/dstack, Apache-2.0). This is the value the attestation
 * measures into RTMR3, so computing it ourselves from the app-compose that Phala generated for our
 * compose file lets us check the VM against our own file instead of trusting a hash Phala reports.
 */

function sortObject(value) {
  if (value === undefined || value === null) return value;
  if (Array.isArray(value)) return value.map(sortObject);
  if (typeof value === 'object' && value.constructor === Object) {
    return Object.keys(value).sort().reduce((acc, key) => { acc[key] = sortObject(value[key]); return acc; }, {});
  }
  return value;
}

function preprocess(appCompose) {
  const obj = { ...appCompose };
  if (obj.runner === 'bash' && 'docker_compose_file' in obj) delete obj.docker_compose_file;
  else if ((obj.runner === 'docker-compose' || obj.runner === 'nerdctl-compose') && 'bash_script' in obj) delete obj.bash_script;
  if ('pre_launch_script' in obj && !obj.pre_launch_script) delete obj.pre_launch_script;
  return obj;
}

export function toDeterministicJson(appCompose) {
  return JSON.stringify(sortObject(appCompose), (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? null : v));
}

export function getComposeHash(appCompose, { normalize = false } = {}) {
  const obj = normalize ? preprocess(appCompose) : appCompose;
  return crypto.createHash('sha256').update(toDeterministicJson(obj), 'utf8').digest('hex');
}

/** Find the app-compose (an object, or a JSON string of one) inside any API response. */
export function findAppCompose(json) {
  const seen = new Set();
  const visit = (node) => {
    if (node && typeof node === 'object') {
      if (seen.has(node)) return null;
      seen.add(node);
      if (typeof node.docker_compose_file === 'string' && typeof node.runner === 'string') return { object: node, raw: null };
      for (const v of Object.values(node)) { const r = visit(v); if (r) return r; }
    } else if (typeof node === 'string' && node.includes('"docker_compose_file"')) {
      try { const o = JSON.parse(node); if (o && typeof o.docker_compose_file === 'string') return { object: o, raw: node }; } catch { /* not json */ }
    }
    return null;
  };
  return visit(json);
}

/**
 * Work out what the compose hash must be for a CVM deployed from `ourCompose`, without trusting any hash
 * the provider reports. The guest hashes the exact app-compose string it was given, and clients reproduce
 * that string as sorted compact JSON, so both candidates are returned.
 * `matchesOurCompose` is false if the provider changed our compose text in any way.
 */
export function expectedComposeHashes({ cvmJson, ourCompose }) {
  const found = findAppCompose(cvmJson);
  if (!found) return { ok: false, reason: 'no app-compose with a docker_compose_file found in the provider response' };
  const matchesOurCompose = found.object.docker_compose_file === ourCompose;
  const candidates = new Set([getComposeHash(found.object), getComposeHash(found.object, { normalize: true })]);
  if (found.raw) candidates.add(crypto.createHash('sha256').update(found.raw, 'utf8').digest('hex'));
  return { ok: true, matchesOurCompose, candidates: [...candidates], composeKeys: Object.keys(found.object).sort() };
}
