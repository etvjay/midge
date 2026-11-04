import crypto from 'node:crypto';
import { HostedRoost, roostReportData, toMicro, formatMicro, computeAllocationsHash } from '../src/roost-service/hosted-roost.js';
import { createRoostServer } from '../src/roost-service/server.js';
import { HostedRoostClient } from '../src/roost-service/client.js';
import { sealToModel, generateClientKey } from '../src/enclave/e2ee.js';
import { verifyHostedAttestation } from '../src/roost-service/verify-hosted.js';
import { getComposeHash, expectedComposeHashes, toDeterministicJson } from '../src/roost-service/compose-hash.js';
import fs from 'node:fs';
import http from 'node:http';

/**
 * Verification 10: the hosted Roost (deterministic code meant for a dstack CVM), with a fake attestation
 * provider. This suite proves the Roost's own behaviour: exact sums, bad bids excluded, a settlement
 * signed only when the sealed aggregate supports it and only once, and access control on the HTTP surface.
 * It proves nothing about hardware. Hardware evidence comes from a real CVM run and the dstack verifier.
 */

const MARKER = 'HOSTED-BID-MARKER-8842';
const SPKI = Buffer.from('302a300506032b6570032100', 'hex');
const YOCTO = 10n ** 24n;

class FakeProvider {
  constructor({ simulated = false } = {}) { this.simulated = simulated; this.calls = []; }
  async attest(reportData) { this.calls.push(reportData.toString('hex')); return `fake-attestation-${reportData.toString('hex')}`; }
  async info() { return { app_id: 'a'.repeat(40), instance_id: 'b'.repeat(40), compose_hash: 'c'.repeat(64), os_image_hash: 'd'.repeat(64), key_provider_info: '{}' }; }
}

const verifySig = (message, sigHex, pubHex) => crypto.verify(null, Buffer.from(message), crypto.createPublicKey({ key: Buffer.concat([SPKI, Buffer.from(pubHex, 'hex')]), format: 'der', type: 'spki' }), Buffer.from(sigHex, 'hex'));

export async function verifyHostedRoost() {
  console.log('\n======================================================');
  console.log(' [VERIFICATION 11] HOSTED ROOST (EXACT SUMS, ATTESTED KEYS, BOUNDED SIGNING)');
  console.log(' Target: deterministic Roost for a dstack CVM; fake attestation provider');
  console.log('======================================================');

  const results = [];
  const check = (name, ok, detail = '') => { results.push({ name, ok: Boolean(ok) }); console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` (${detail})` : ''}`); };
  const throws = (fn, re) => { try { fn(); return false; } catch (e) { return !re || re.test(e.message); } };
  const rejects = async (fn, re) => { try { await fn(); return false; } catch (e) { return !re || re.test(e.message); } };
  const bid = (roost, flyerId, payload) => roost.submitSealedIntent({ flyerId, cipherTextHex: sealToModel(JSON.stringify(payload), roost.intentPublicKey) });

  console.log('\n[1/8] Keys and attestation binding');
  const provider = new FakeProvider();
  let roost = new HostedRoost({ provider });
  check('settlement and intent keys are distinct 32-byte keys', roost.settlePublicKey !== roost.intentPublicKey && /^[0-9a-f]{64}$/.test(roost.settlePublicKey) && /^[0-9a-f]{64}$/.test(roost.intentPublicKey));
  check('two Roost instances never share keys', new HostedRoost({ provider }).settlePublicKey !== roost.settlePublicKey);
  const nonce = crypto.randomBytes(32).toString('hex');
  const bundle = await roost.getAttestationBundle(nonce);
  const expectedRd = roostReportData({ settlePublicKey: roost.settlePublicKey, intentPublicKey: roost.intentPublicKey, nonce });
  check('report data is sha512(domain, settle key, intent key, nonce)', bundle.reportData === expectedRd.toString('hex') && expectedRd.length === 64);
  check('the provider was asked to attest exactly that report data', provider.calls.at(-1) === bundle.reportData);
  const otherNonce = crypto.randomBytes(32).toString('hex');
  check('a different nonce gives different report data', roostReportData({ settlePublicKey: roost.settlePublicKey, intentPublicKey: roost.intentPublicKey, nonce: otherNonce }).toString('hex') !== bundle.reportData);
  check('swapping a key changes the report data', roostReportData({ settlePublicKey: crypto.randomBytes(32).toString('hex'), intentPublicKey: roost.intentPublicKey, nonce }).toString('hex') !== bundle.reportData);
  check('a malformed nonce is refused', await rejects(() => roost.getAttestationBundle('zz'), /nonce must be 32 bytes/));
  check('a real-mode Roost reports its inputs as hidden only conditionally', roost.describe().inputsHiddenFromOperator === true && /only if its attestation verifies/.test(roost.describe().hiddenBy));
  const sim = new HostedRoost({ provider: new FakeProvider({ simulated: true }) });
  check('a simulator-backed Roost never claims hidden inputs', sim.describe().inputsHiddenFromOperator === false && sim.describe().simulated === true);

  console.log('\n[2/8] Exact aggregation');
  roost = new HostedRoost({ provider });
  bid(roost, 'a', { amount: '0.1' }); bid(roost, 'b', { amount: 0.2 }); bid(roost, 'c', { amount: 0.3 });
  let out = roost.aggregateAndClear({ roundId: 'r1' });
  check('0.1 + 0.2 + 0.3 is exactly 0.6 (no floating point error)', out.aggregateOrder.totalInputAmount === '0.6' && out.aggregateOrder.flyerCount === 3);
  check('the queue is cleared after a round', roost.sealedIntents.length === 0 && throws(() => roost.aggregateAndClear(), /empty/));
  roost = new HostedRoost({ provider });
  const amounts = Array.from({ length: 50 }, (_, i) => 100 + ((i * 37) % 900));
  amounts.forEach((a, i) => bid(roost, `f${i}`, { amount: a }));
  out = roost.aggregateAndClear();
  check('50 bids sum exactly', out.aggregateOrder.totalInputAmount === String(amounts.reduce((p, c) => p + c, 0)) && out.aggregateOrder.flyerCount === 50);
  roost = new HostedRoost({ provider });
  bid(roost, 'big', { amount: '999999999999.999999' }); bid(roost, 'tiny', { amount: '0.000001' });
  check('the largest and smallest representable amounts are exact', roost.aggregateAndClear().aggregateOrder.totalInputAmount === '1000000000000');
  check('toMicro and formatMicro round-trip', formatMicro(toMicro('12.340000')) === '12.34' && toMicro(-1) === null && toMicro(1e21) === null && toMicro('1e3') === null && toMicro('0.1234567') === null && toMicro(NaN) === null);
  check('the coordinator-side state never holds a bid in the clear', (() => { const r = new HostedRoost({ provider }); bid(r, 'x', { amount: 5, note: MARKER }); return !JSON.stringify(r.sealedIntents).includes(MARKER) && !JSON.stringify(r.getSessionInfo()).includes(MARKER); })());

  console.log('\n[3/8] Bad bids are excluded, not fatal');
  roost = new HostedRoost({ provider });
  bid(roost, 'good1', { amount: 10 });
  bid(roost, 'neg', { amount: -5, note: MARKER });
  bid(roost, 'text', { amount: 'lots' });
  bid(roost, 'huge', { amount: 1e30 });
  bid(roost, 'noamount', { note: 'hello' });
  roost.submitSealedIntent({ flyerId: 'sealed-to-wrong-key', cipherTextHex: sealToModel('{"amount":999}', generateClientKey().publicKeyHex) });
  roost.submitSealedIntent({ flyerId: 'garbage', cipherTextHex: crypto.randomBytes(100).toString('hex') });
  bid(roost, 'good2', { amount: '2.5' });
  out = roost.aggregateAndClear();
  check('valid bids are summed and invalid ones excluded', out.aggregateOrder.totalInputAmount === '12.5' && out.aggregateOrder.flyerCount === 2);
  check('excluded flyers are named, their content is never exposed', ['neg', 'text', 'huge', 'noamount', 'sealed-to-wrong-key', 'garbage'].every((f) => out.aggregateOrder.excludedFlyers.includes(f)) && !JSON.stringify(out).includes(MARKER));
  roost = new HostedRoost({ provider });
  bid(roost, 'only-bad', { amount: -1 });
  check('a round with no valid bid is refused', throws(() => roost.aggregateAndClear(), /no valid bids/));
  roost = new HostedRoost({ provider, maxIntents: 2 });
  bid(roost, 'a', { amount: 1 }); bid(roost, 'b', { amount: 1 });
  check('input validation: duplicate flyer, capacity, non-hex, too short, too long',
    throws(() => bid(roost, 'a', { amount: 1 }), /already submitted|round is full/)
    && throws(() => bid(roost, 'c', { amount: 1 }), /round is full/)
    && throws(() => new HostedRoost({ provider }).submitSealedIntent({ flyerId: 'z', cipherTextHex: 'zz'.repeat(80) }), /hex/)
    && throws(() => new HostedRoost({ provider }).submitSealedIntent({ flyerId: 'z', cipherTextHex: 'ab'.repeat(10) }), /bytes/)
    && throws(() => new HostedRoost({ provider }).submitSealedIntent({ flyerId: 'z', cipherTextHex: 'ab'.repeat(5000) }), /bytes/));

  console.log('\n[4/8] Settlement signing is bounded and single-use');
  roost = new HostedRoost({ provider });
  bid(roost, 'a', { amount: 1 }); bid(roost, 'b', { amount: 2 });
  out = roost.aggregateAndClear({ roundId: 'angel-1' }); // total 3 NEAR
  const base = { contractId: 'c.test.testnet', syndicateId: 'syn-1', epoch: 0, roundNonce: 'a'.repeat(32), orderHash: out.orderHash };
  const allocations = [{ recipient: 'founder.testnet', amount: String(2n * YOCTO) }, { recipient: 'alice.testnet', amount: String(YOCTO) }];
  check('rejects allocations above what the sealed bids support', throws(() => roost.signSettlement({ ...base, allocations: [{ recipient: 'founder.testnet', amount: String(3n * YOCTO + 1n) }] }), /exceed what the sealed bids support/));
  check('rejects an orderHash from a different round', throws(() => roost.signSettlement({ ...base, orderHash: crypto.randomBytes(32).toString('hex'), allocations }), /does not match/));
  check('rejects duplicate recipients, bad amounts, empty and oversized lists',
    throws(() => roost.signSettlement({ ...base, allocations: [{ recipient: 'x.testnet', amount: '1' }, { recipient: 'x.testnet', amount: '1' }] }), /duplicate/)
    && throws(() => roost.signSettlement({ ...base, allocations: [{ recipient: 'x.testnet', amount: '01' }] }), /yoctoNEAR integer/)
    && throws(() => roost.signSettlement({ ...base, allocations: [{ recipient: 'x.testnet', amount: '-1' }] }), /yoctoNEAR integer/)
    && throws(() => roost.signSettlement({ ...base, allocations: [] }), /1 to 8/)
    && throws(() => roost.signSettlement({ ...base, allocations: Array.from({ length: 9 }, (_, i) => ({ recipient: `r${i}.testnet`, amount: '1' })) }), /1 to 8/));
  check('rejects separators that could forge the signed message', throws(() => roost.signSettlement({ ...base, syndicateId: 'a:b', allocations }), /without ':'/) && throws(() => roost.signSettlement({ ...base, allocations: [{ recipient: 'a,b', amount: '1' }] }), /plain recipient/));
  const signed = roost.signSettlement({ ...base, allocations });
  check('signs the contract message format and the signature verifies', signed.message === `c.test.testnet:syn-1:0:${'a'.repeat(32)}:${computeAllocationsHash(allocations)}:${out.orderHash}` && verifySig(signed.message, signed.signature, roost.settlePublicKey));
  check('the signature does not verify under another key or for another message', !verifySig(signed.message, signed.signature, roost.intentPublicKey) && !verifySig(signed.message + 'x', signed.signature, roost.settlePublicKey));
  check('an aggregate can be signed only once', throws(() => roost.signSettlement({ ...base, allocations }), /already been signed/));
  check('signing without any aggregate is refused', throws(() => new HostedRoost({ provider }).signSettlement({ ...base, allocations }), /no aggregate/));
  const flipped = [allocations[1], allocations[0]];
  check('the allocations hash ignores order and sorts recipients byte-wise', computeAllocationsHash(allocations) === computeAllocationsHash(flipped)
    && computeAllocationsHash([{ recipient: 'a-b.testnet', amount: '1' }, { recipient: 'a.testnet', amount: '2' }]) === crypto.createHash('sha256').update('a-b.testnet:1,a.testnet:2').digest('hex'));

  console.log('\n[5/8] HTTP surface and access control');
  roost = new HostedRoost({ provider });
  const adminKey = 'test-admin-key-with-24-or-more-chars';
  const server = createRoostServer({ roost, adminKey });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base_ = `http://127.0.0.1:${server.address().port}`;
  const member = new HostedRoostClient({ baseUrl: base_ });
  const coord = new HostedRoostClient({ baseUrl: base_, adminKey });
  try {
    const session = await member.getSession();
    check('members can read the session and the attestation without credentials', session.backend === 'hosted' && (await member.getAttestationBundle(crypto.randomBytes(32).toString('hex'))).format === 'midge-roost-attestation-v1');
    await member.submitSealedIntent({ flyerId: 'm1', cipherTextHex: sealToModel('{"amount":4}', session.intentPublicKey) });
    await member.submitSealedIntent({ flyerId: 'm2', cipherTextHex: sealToModel(`{"amount":6,"note":"${MARKER}"}`, session.intentPublicKey) });
    const raw = async (path, headers = {}) => (await fetch(`${base_}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: '{}' })).status;
    check('the server itself refuses aggregate and settle without the coordinator key', await raw('/aggregate') === 401 && await raw('/settle') === 401);
    check('a member client cannot even attempt coordinator calls', await rejects(() => member.aggregate(), /needs the coordinator key/) && await rejects(() => member.signSettlement({}), /needs the coordinator key/));
    check('a wrong coordinator key is refused', await rejects(() => new HostedRoostClient({ baseUrl: base_, adminKey: 'x'.repeat(30) }).aggregate(), /401/));
    const agg = await coord.aggregate({ roundId: 'http-1' });
    check('the coordinator gets the exact aggregate over HTTP', agg.aggregateOrder.totalInputAmount === '10' && agg.aggregateOrder.flyerCount === 2);
    const s = await coord.signSettlement({ ...base, orderHash: agg.orderHash, allocations: [{ recipient: 'founder.testnet', amount: String(10n * YOCTO) }] });
    check('the coordinator gets a verifying settlement signature over HTTP', verifySig(s.message, s.signature, session.settlePublicKey));
    check('no response contains a bid in the clear', !JSON.stringify([session, agg, s]).includes(MARKER));
    const bigBody = await fetch(`${base_}/intents`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ flyerId: 'x', cipherTextHex: 'ab'.repeat(40000) }) }).catch(() => ({ status: 413 }));
    check('oversized bodies are refused', bigBody.status === 413 || bigBody.status === 0);
    check('unknown routes and debug routes do not exist', (await fetch(`${base_}/debug`)).status === 404 && (await fetch(`${base_}/env`)).status === 404 && (await fetch(`${base_}/state`)).status === 404);
    check('a server cannot be built without a coordinator key', throws(() => createRoostServer({ roost, adminKey: '' }), /adminKey is required/));
  } finally {
    server.close();
  }

  console.log('\n[6/8] Attestation verification wrapper (mock dstack-verifier)');
  const PINNED_COMPOSE = 'c'.repeat(64);
  const PINNED_OS = ['d'.repeat(64)];
  let mode = {};
  const mock = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const { attestation } = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      const rd = attestation.replace('fake-attestation-', '');
      const ok = !mode.invalid;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        is_valid: ok, reason: ok ? null : 'Quote verification failed: ISV enclave report signature is invalid',
        details: {
          quote_verified: !mode.badQuote && ok, event_log_verified: !mode.badLog && ok, os_image_hash_verified: ok,
          tee_variant: mode.tee || 'dstack-tdx', tcb_status: mode.tcb || 'UpToDate', os_image_is_dev: mode.dev === true,
          report_data: mode.badReportData ? '00'.repeat(64) : rd,
          app_info: { compose_hash: mode.composeHash || PINNED_COMPOSE, os_image_hash: mode.osHash || PINNED_OS[0], app_id: 'a'.repeat(40) },
        },
      }));
    });
  });
  await new Promise((r) => mock.listen(0, '127.0.0.1', r));
  const verifierUrl = `http://127.0.0.1:${mock.address().port}`;
  const vroost = new HostedRoost({ provider: new FakeProvider() });
  const vnonce = crypto.randomBytes(32).toString('hex');
  const vbundle = await vroost.getAttestationBundle(vnonce);
  const run = async (m, over = {}, b = vbundle, n = vnonce) => { mode = m; return verifyHostedAttestation(b, { nonce: n, verifierUrl, composeHash: PINNED_COMPOSE, osImageHashes: PINNED_OS, ...over }); };
  const failedNames = (r) => r.checks.filter((c) => !c.ok).map((c) => c.name).join('|');
  try {
    const good = await run({});
    check('a correct attestation passes every check', good.ok === true && good.checks.length === 12, `${good.checks.length} checks`);
    check('the caller supplies the nonce: a replayed bundle for another nonce fails', /report data/.test(failedNames(await run({}, {}, vbundle, crypto.randomBytes(32).toString('hex')))));
    check('a verifier that rejects the quote fails the run', /accepts the attestation/.test(failedNames(await run({ invalid: true }))));
    check('a quote that does not verify fails', /Intel quote verifies/.test(failedNames(await run({ badQuote: true }))));
    check('an event log that does not replay fails', /event log replays/.test(failedNames(await run({ badLog: true }))));
    check('report data that is not ours fails', /quote report data equals/.test(failedNames(await run({ badReportData: true }))));
    check('a different compose hash (modified build) fails', /compose hash equals the pinned/.test(failedNames(await run({ composeHash: 'e'.repeat(64) }))));
    check('an unpinned OS image fails', /OS image hash is one we pin/.test(failedNames(await run({ osHash: 'f'.repeat(64) }))));
    check('a development OS image fails', /not a development image/.test(failedNames(await run({ dev: true }))));
    check('an out-of-date TCB fails by default and passes only when explicitly accepted', /TCB status/.test(failedNames(await run({ tcb: 'OutOfDate' }))) && (await run({ tcb: 'OutOfDate' }, { acceptedTcb: ['UpToDate', 'OutOfDate'] })).ok === true);
    check('a non-TDX platform fails', /dstack TDX/.test(failedNames(await run({ tee: 'dstack-amd-sev-snp' }))));
    const tampered = { ...vbundle, settlePublicKey: crypto.randomBytes(32).toString('hex') };
    check('swapping the settlement key in the bundle fails', /bundle report data matches/.test(failedNames(await run({}, {}, tampered))));
    check('an unreachable verifier fails closed', (await verifyHostedAttestation(vbundle, { nonce: vnonce, verifierUrl: 'http://127.0.0.1:9', composeHash: PINNED_COMPOSE, osImageHashes: PINNED_OS })).ok === false);
    check('a malformed bundle fails closed', (await verifyHostedAttestation({ format: 'x' }, { nonce: vnonce, verifierUrl, composeHash: PINNED_COMPOSE, osImageHashes: PINNED_OS })).ok === false);
  } finally {
    mock.close();
  }

  console.log('\n[7/8] Compose hash derived from our own compose file');
  const ours = 'services:\n  roost:\n    image: ghcr.io/etvjay/midge-roost@sha256:' + 'a'.repeat(64) + '\n';
  const appCompose = { runner: 'docker-compose', name: 'midge-roost', docker_compose_file: ours, public_logs: false, allowed_envs: ['ROOST_ADMIN_KEY'] };
  const canonical = toDeterministicJson(appCompose);
  const rawHash = crypto.createHash('sha256').update(canonical).digest('hex');
  check('hash ignores key order, respects array order, and maps NaN to null',
    getComposeHash({ b: 1, a: { d: 1, c: 2 } }) === getComposeHash({ a: { c: 2, d: 1 }, b: 1 })
    && getComposeHash({ a: [1, 2] }) !== getComposeHash({ a: [2, 1] }) && getComposeHash({ a: NaN }) === getComposeHash({ a: null }));
  const fromString = expectedComposeHashes({ cvmJson: { data: { app_compose: canonical } }, ourCompose: ours });
  check('derives the hash from an app-compose string and it equals sha256 of that exact string', fromString.ok && fromString.matchesOurCompose && fromString.candidates.includes(rawHash));
  const fromObject = expectedComposeHashes({ cvmJson: { compose_file: appCompose }, ourCompose: ours });
  check('derives the hash from an app-compose object as well', fromObject.ok && fromObject.candidates.includes(rawHash));
  check('detects a provider that changed our compose text', expectedComposeHashes({ cvmJson: { compose_file: appCompose }, ourCompose: ours + '# edited' }).matchesOurCompose === false);
  check('detects a different image digest in the compose', expectedComposeHashes({ cvmJson: { compose_file: { ...appCompose, docker_compose_file: ours.replace('a'.repeat(64), 'b'.repeat(64)) } }, ourCompose: ours }).matchesOurCompose === false);
  check('says so when the response holds no app-compose', expectedComposeHashes({ cvmJson: { unrelated: 1 }, ourCompose: ours }).ok === false);
  const real = JSON.parse(fs.readFileSync(new URL('./fixtures/phala-app-compose-0.6.1.json', import.meta.url), 'utf8'));
  const realDerived = expectedComposeHashes({ cvmJson: { compose_file: real.appCompose }, ourCompose: real.appCompose.docker_compose_file });
  check('KNOWN ANSWER from real hardware: the derived hash equals the hash a real Phala TDX VM attested', realDerived.ok && realDerived.matchesOurCompose && realDerived.candidates[0] === real.attestedComposeHash, real.attestedComposeHash.slice(0, 16));
  check('KNOWN ANSWER: hashing the null fields as Phala reports them would NOT reproduce it (nulls mean absent)', getComposeHash(real.appCompose) !== real.attestedComposeHash);
  {
    const roostC = new HostedRoost({ provider: new FakeProvider() });
    const nonceC = crypto.randomBytes(32).toString('hex');
    const bundleC = await roostC.getAttestationBundle(nonceC);
    const mockC = http.createServer((req, res) => { req.resume(); req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ is_valid: true, details: { quote_verified: true, event_log_verified: true, os_image_hash_verified: true, tee_variant: 'dstack-tdx', tcb_status: 'UpToDate', os_image_is_dev: false, report_data: bundleC.reportData, app_info: { compose_hash: rawHash, os_image_hash: 'd'.repeat(64) } } })); }); });
    await new Promise((r) => mockC.listen(0, '127.0.0.1', r));
    const urlC = `http://127.0.0.1:${mockC.address().port}`;
    const vOpts = { nonce: nonceC, verifierUrl: urlC, osImageHashes: ['d'.repeat(64)] };
    try {
      check('the verifier accepts when the attested hash is among the derived candidates', (await verifyHostedAttestation(bundleC, { ...vOpts, composeHash: fromString.candidates })).ok === true);
      check('the verifier rejects when the attested hash is not among them', (await verifyHostedAttestation(bundleC, { ...vOpts, composeHash: ['e'.repeat(64)] })).ok === false);
      check('the verifier rejects an empty or malformed pin list', (await verifyHostedAttestation(bundleC, { ...vOpts, composeHash: [] })).ok === false && (await verifyHostedAttestation(bundleC, { ...vOpts, composeHash: ['abc'] })).ok === false);
    } finally { mockC.close(); }
  }

  console.log('\n[8/8] The coordinator key is not exposed');
  check('serialising the Roost exposes only public keys', JSON.stringify(roost) === JSON.stringify({ backend: 'hosted', settlePublicKey: roost.settlePublicKey, intentPublicKey: roost.intentPublicKey }) && !JSON.stringify(roost).includes(adminKey));

  const failed = results.filter((r) => !r.ok);
  if (failed.length) throw new Error(`[HOSTED ROOST] ${failed.length} check(s) failed: ${failed.map((f) => f.name).join('; ')}`);
  console.log(`\n>>> [PASS] HOSTED ROOST: ${results.length} checks passed with a fake attestation provider (hardware evidence: real CVM run + dstack verifier).`);
  return { verified: true, checks: results.length, fakeProvider: true };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  verifyHostedRoost().catch((e) => { console.error(e.message); process.exit(1); });
}
