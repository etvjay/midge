/**
 * Checks a visitor can run in their own browser, with no Node built-ins and no trust in this site:
 *   - a recorded lab run: its hash chain, its sequence, its closing commitment, and its verdicts re-derived from the raw events;
 *   - a pay run receipt or auditor pack against the order hash a chain recorded;
 *   - the live contract's code hash against the hash recorded in this repository, asked of two or more RPC providers.
 *
 * Every check ends in one of four verdicts, because calling a check that did not run a pass or a failure would be wrong either way:
 *   recomputed (it ran and agrees), failed (it ran and disagrees), unavailable (it could not run), reported-not-verified (a record asserts
 *   something this page did not check). The same logic is in lab/verify-run.js and src/roost-service/receipts.js for Node;
 *   tests/browser-verify.test.js compares them on every recorded run.
 */
import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { openFromModel, canonicalJson } from './midge-client.js';

export const VERDICTS = ['recomputed', 'failed', 'unavailable', 'reported-not-verified'];
const sha = (u8) => bytesToHex(sha256(u8));
const GENESIS = '0'.repeat(64);

// ---- recorded lab runs ----
/** Same as lab/core/recorder.js: sorted keys, bigint as "<n>n" (a parsed log has none). */
export function canonical(value) {
  const sort = (v) => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') return Object.keys(v).sort().reduce((a, k) => { a[k] = sort(v[k]); return a; }, {});
    return v;
  };
  return JSON.stringify(sort(value));
}

export function chainProblems(lines) {
  const problems = []; let prev = GENESIS; let last = null;
  lines.forEach((line, i) => {
    let ev; try { ev = JSON.parse(line); } catch { problems.push(`line ${i}: not valid JSON`); return; }
    const { chain_hash: hash, ...body } = ev;
    if (ev.seq !== i) problems.push(`line ${i}: sequence number is ${ev.seq}`);
    if (ev.chain_prev !== prev) problems.push(`line ${i}: prev hash does not match the previous event (an event was changed, removed or reordered)`);
    if (sha(utf8ToBytes(prev + canonical(body))) !== hash) problems.push(`line ${i}: hash does not match the event content`);
    prev = hash; last = ev;
  });
  if (!last || last.type !== 'run.end') problems.push('the log does not end with run.end (truncated or still running)');
  else {
    let beforeLast = GENESIS; try { beforeLast = JSON.parse(lines[lines.length - 2] || '{}').chain_hash || GENESIS; } catch { /* reported above */ }
    if (last.rootHashOfPrevious !== beforeLast) problems.push('run.end does not commit to the previous event hash');
  }
  return { problems, rootHash: prev };
}

/** The verdict rules of lab/core/audit.js, applied to the raw events. */
export function deriveVerdicts(events) {
  const attempts = new Map();
  const get = (e) => { const k = `${e.exp}#${e.attempt || 1}`; if (!attempts.has(k)) attempts.set(k, { exp: e.exp, steps: new Map(), outside: false, capSkip: false, recordedVerdict: null }); return attempts.get(k); };
  for (const e of events) {
    if (!e.exp) continue;
    const a = get(e);
    if (e.type === 'exp.end') { a.recordedVerdict = e.verdict; if (/missing capability/.test(e.reason || '')) a.capSkip = true; continue; }
    if (!e.step) { if (e.type === 'problem' && e.severity === 'critical') a.outside = true; continue; }
    if (!a.steps.has(e.step)) a.steps.set(e.step, { asserts: 0, failed: 0, threw: false, skipped: false, recordedOutcome: null });
    const st = a.steps.get(e.step);
    if (e.type === 'assert') { st.asserts += 1; if (!e.ok) st.failed += 1; }
    if (e.type === 'problem' && /^step threw/.test(e.message || '')) st.threw = true;
    if (e.type === 'skip') st.skipped = true;
    if (e.type === 'step.end') st.recordedOutcome = e.outcome;
  }
  const mismatches = []; const perExp = new Map();
  for (const a of attempts.values()) {
    let failed = 0; let skipped = 0; const steps = [...a.steps.entries()];
    for (const [name, st] of steps) {
      const outcome = st.skipped ? 'skip' : ((st.threw || st.failed > 0 || st.asserts === 0) ? 'fail' : 'pass');
      if (st.recordedOutcome && st.recordedOutcome !== outcome) mismatches.push(`${a.exp} step "${name}": runner recorded ${st.recordedOutcome}, audit derived ${outcome}`);
      if (outcome === 'fail') failed += 1;
      if (outcome === 'skip') skipped += 1;
    }
    const outsideFail = a.outside && !steps.some(([, s]) => s.threw);
    const verdict = a.capSkip ? 'SKIP' : (failed > 0 || outsideFail ? 'FAIL' : (steps.length === 0 ? 'SKIP' : (skipped > 0 ? 'PARTIAL' : 'PASS')));
    if (a.recordedVerdict && a.recordedVerdict !== verdict) mismatches.push(`${a.exp}: runner declared ${a.recordedVerdict}, audit derived ${verdict}`);
    if (!perExp.has(a.exp)) perExp.set(a.exp, []);
    perExp.get(a.exp).push(verdict);
  }
  const verdicts = {};
  for (const [exp, list] of perExp) verdicts[exp] = list.every((v) => v === list[0]) ? list[0] : 'FLAKY';
  return { verdicts, mismatches };
}

/**
 * Check a recorded run from the text of its events.jsonl and (optionally) its summary.json.
 * Returns { ok, rows, events, rootHash, verdicts }; each row is { claim, verdict, detail }.
 */
export function checkRun(eventsText, summaryText = null) {
  const rows = [];
  const lines = String(eventsText).split('\n').filter(Boolean);
  const { problems, rootHash } = chainProblems(lines);
  rows.push({ claim: 'the log is an unbroken hash chain, in sequence, ending in a commitment', verdict: problems.length ? 'failed' : 'recomputed', detail: problems.length ? problems.slice(0, 3).join('; ') : `${lines.length} events, root ${rootHash}` });
  let events = []; try { events = lines.map((l) => JSON.parse(l)); } catch { /* the chain row already failed */ }
  const audit = deriveVerdicts(events);
  const end = events.find((e) => e.type === 'run.end');
  const disagree = [...audit.mismatches];
  if (end) for (const [exp, v] of Object.entries(end.verdicts || {})) if (audit.verdicts[exp] && audit.verdicts[exp] !== v.verdict) disagree.push(`${exp}: run summary says ${v.verdict}, audit derived ${audit.verdicts[exp]}`);
  rows.push({ claim: 'every verdict is re-derived from the raw events and agrees with the one the runner declared', verdict: events.length === 0 ? 'unavailable' : (disagree.length ? 'failed' : 'recomputed'), detail: disagree.length ? disagree.slice(0, 3).join('; ') : JSON.stringify(audit.verdicts) });
  if (summaryText === null) rows.push({ claim: 'summary.json names the same root hash', verdict: 'unavailable', detail: 'no summary was given' });
  else { let s = null; try { s = JSON.parse(summaryText); } catch { /* below */ } rows.push({ claim: 'summary.json names the same root hash', verdict: s && s.rootHash === rootHash ? 'recomputed' : 'failed', detail: s ? (s.rootHash === rootHash ? 'equal' : `summary says ${s.rootHash}`) : 'summary.json is not valid JSON' }); }
  rows.push({ claim: 'transaction hashes and attestations in the events are real', verdict: 'reported-not-verified', detail: 'the log proves it was not changed after it was written; it does not prove the events were honestly produced. Check the transaction hashes on an explorer.' });
  return { ok: rows.every((r) => r.verdict === 'recomputed' || r.verdict === 'reported-not-verified' || r.verdict === 'unavailable') && !rows.some((r) => r.verdict === 'failed'), rows, events: lines.length, rootHash, verdicts: audit.verdicts };
}

// ---- pay run receipts and the auditor pack ----
export const leafHash = (obj) => sha(Uint8Array.from([0, ...utf8ToBytes(canonicalJson(obj))]));
const nodeHash = (l, r) => sha(Uint8Array.from([1, ...hexToBytes(l), ...hexToBytes(r)]));
const splitAt = (n) => { let k = 1; while (k * 2 < n) k *= 2; return k; };
export function merkleRoot(leaves) {
  if (leaves.length === 0) throw new Error('a Merkle tree needs at least one leaf');
  if (leaves.length === 1) return leaves[0];
  const k = splitAt(leaves.length);
  return nodeHash(merkleRoot(leaves.slice(0, k)), merkleRoot(leaves.slice(k)));
}
export function verifyProof(leaf, proof, root) {
  if (!Array.isArray(proof) || !/^[0-9a-f]{64}$/.test(String(root))) return false;
  let h = leaf;
  for (const step of proof) {
    if (!step || !/^[0-9a-f]{64}$/.test(String(step.hash)) || (step.side !== 'L' && step.side !== 'R')) return false;
    h = step.side === 'R' ? nodeHash(h, step.hash) : nodeHash(step.hash, h);
  }
  return h === root;
}
export const payrunOrderHash = (runId, receiptsRoot) => sha(utf8ToBytes(`midge-payrun-v1:${runId}:${receiptsRoot}`));
const RECEIPT_DOMAIN = 'midge-receipt-v1:';
export function verifyReceiptSignature(hostPublicKeyHex, leaf, signatureHex) {
  try {
    if (!/^[0-9a-f]{64}$/i.test(String(hostPublicKeyHex)) || !/^[0-9a-f]{128}$/i.test(String(signatureHex))) return false;
    return ed25519.verify(hexToBytes(signatureHex), utf8ToBytes(RECEIPT_DOMAIN + leaf), hexToBytes(hostPublicKeyHex));
  } catch { return false; }
}
/** What a payee runs on their own statement; the same four checks as src/roost-service/receipts.js. */
export function verifyStatement({ cipherHex, secretX25519, hostSettlePublicKey, onChainOrderHash }) {
  let doc;
  try { doc = JSON.parse(openFromModel(cipherHex, secretX25519)); } catch { return { ok: false, receipt: null, checks: { decrypts: false } }; }
  try {
    const leaf = leafHash(doc.receipt);
    const checks = { decrypts: true, runId: doc.receipt?.runId === doc.runId, signature: verifyReceiptSignature(hostSettlePublicKey, leaf, doc.signature), proof: verifyProof(leaf, doc.proof, doc.receiptsRoot), orderHash: payrunOrderHash(doc.runId, doc.receiptsRoot) === onChainOrderHash };
    return { ok: Object.values(checks).every(Boolean), receipt: doc.receipt, checks };
  } catch { return { ok: false, receipt: null, checks: { decrypts: true, wellFormed: false } }; }
}
/** What an auditor runs on a pack: the root must reproduce the on-chain order hash, and every opened line must prove into the root. */
export function verifyAuditorPack(pack, onChainOrderHash) {
  if (payrunOrderHash(pack.runId, pack.root) !== onChainOrderHash) return { ok: false, reason: 'the root does not match the order hash on chain' };
  for (const o of pack.opened) if (!verifyProof(leafHash(o.leaf), o.proof, pack.root)) return { ok: false, reason: `opened line ${o.index} does not verify against the root` };
  return { ok: true };
}

// ---- the live contract ----
/**
 * Ask two or more RPC providers for the contract account's code hash and compare it with the recorded one. All providers must answer and agree.
 * Returns one row. `fetchImpl` is injected so the check can be tested without a network.
 */
export async function checkContractCodeHash({ rpcUrls, contractId, expectedCodeHash, fetchImpl = globalThis.fetch }) {
  const claim = `${contractId} runs the code hash recorded in this repository`;
  const urls = [...new Set((rpcUrls || []).map((u) => String(u).trim().replace(/\/+$/, '')).filter(Boolean))];
  if (urls.length < 2) return { claim, verdict: 'unavailable', detail: 'two or more different RPC providers are needed so that they can agree' };
  const answers = await Promise.all(urls.map(async (url) => {
    try {
      const res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'query', params: { request_type: 'view_account', finality: 'final', account_id: contractId } }) });
      if (res.ok === false) return { url, error: `HTTP ${res.status}` };
      const body = await res.json();
      if (body?.error || !body?.result?.code_hash) return { url, error: String(body?.error?.message || 'no code hash in the reply').slice(0, 80) };
      return { url, hash: body.result.code_hash, block: body.result.block_height };
    } catch (e) { return { url, error: String(e?.message ?? e).slice(0, 80) }; }
  }));
  const failed = answers.filter((a) => a.error);
  if (failed.length) return { claim, verdict: 'unavailable', detail: `${answers.length - failed.length} of ${answers.length} providers answered: ${failed.map((f) => `${new URL(f.url).host} ${f.error}`).join('; ')}` };
  const hashes = new Set(answers.map((a) => a.hash));
  if (hashes.size > 1) return { claim, verdict: 'failed', detail: `the providers disagree: ${[...hashes].join(', ')}` };
  const [hash] = hashes;
  return hash === expectedCodeHash ? { claim, verdict: 'recomputed', detail: `${hash} at block ${Math.max(...answers.map((a) => a.block || 0))}, from ${answers.length} providers` } : { claim, verdict: 'failed', detail: `the chain says ${hash}; this repository records ${expectedCodeHash}` };
}
