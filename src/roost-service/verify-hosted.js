import { roostReportData } from './hosted-roost.js';

/**
 * Verify a hosted Roost attestation bundle. Delegates the hardware, event-log and OS image checks to the
 * official dstack-verifier (a container; see deploy/roost/README.md) and adds the checks only we can make:
 *   1. the report data in the quote equals sha512(domain, settle key, intent key, nonce), so the keys are
 *      bound to this exact quote and this fresh nonce
 *   2. the compose hash equals the pinned hash of our published build, so the code is the code we published
 *   3. the OS image hash is one we pin (a production dstack image, not a dev image with shells)
 * Nothing here trusts a field the Roost reported about itself except the keys, which step 1 binds.
 *
 * @param {object} bundle    from GET /attestation
 * @param {object} opts
 * @param {string} opts.nonce             the nonce this caller sent (never trust the bundle's own copy)
 * @param {string} opts.verifierUrl       e.g. http://127.0.0.1:18080
 * @param {string|string[]} opts.composeHash  pinned compose hash (hex), or the candidates computed from our compose file
 * @param {string[]} opts.osImageHashes   pinned production OS image hashes (hex, with or without 0x)
 * @param {string[]} [opts.acceptedTcb]   default ['UpToDate']
 */
export async function verifyHostedAttestation(bundle, { nonce, verifierUrl, composeHash, osImageHashes, acceptedTcb = ['UpToDate'], fetchImpl = globalThis.fetch }) {
  const checks = [];
  const add = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail });
  const strip = (h) => String(h || '').toLowerCase().replace(/^0x/, '');

  let expectedReportData = null;
  try {
    add('bundle has the expected format', bundle && bundle.format === 'midge-roost-attestation-v1');
    expectedReportData = roostReportData({ settlePublicKey: bundle.settlePublicKey, intentPublicKey: bundle.intentPublicKey, nonce }).toString('hex');
    add('bundle report data matches our keys and our nonce', bundle.reportData === expectedReportData);
  } catch (err) {
    add('bundle is well formed', false, err.message);
    return { ok: false, checks };
  }

  let result;
  try {
    const res = await fetchImpl(`${verifierUrl.replace(/\/$/, '')}/verify`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ attestation: bundle.attestation }),
    });
    result = await res.json();
  } catch (err) {
    add('dstack-verifier answered', false, err.message);
    return { ok: false, checks };
  }
  const d = result.details || {};
  const app = d.app_info || {};
  add('dstack-verifier accepts the attestation', result.is_valid === true, result.reason ? String(result.reason).slice(0, 700) : '');
  add('Intel quote verifies', d.quote_verified === true);
  add('event log replays to the measured RTMR3', d.event_log_verified === true);
  add('OS image hash verifies against the published image', d.os_image_hash_verified === true);
  add('platform is a dstack TDX confidential VM', d.tee_variant === 'dstack-tdx', String(d.tee_variant));
  add('TCB status is acceptable', acceptedTcb.includes(d.tcb_status), String(d.tcb_status));
  add('OS image is not a development image', d.os_image_is_dev !== true);
  add('quote report data equals sha512(our keys, our nonce)', strip(d.report_data) === expectedReportData, strip(d.report_data).slice(0, 16));
  const pins = [].concat(composeHash || []).map(strip).filter(Boolean);
  add('compose hash equals the pinned hash of our build', pins.length > 0 && pins.every((h) => h.length === 64) && pins.includes(strip(app.compose_hash)), strip(app.compose_hash).slice(0, 16));
  add('OS image hash is one we pin', (osImageHashes || []).map(strip).includes(strip(app.os_image_hash)), strip(app.os_image_hash).slice(0, 16));
  return { ok: checks.every((c) => c.ok), checks, details: { tcb: d.tcb_status, composeHash: app.compose_hash, osImageHash: app.os_image_hash, appId: app.app_id } };
}
