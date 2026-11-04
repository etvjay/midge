import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Append-only, hash-chained event log for one run.
 * Every event carries `prev` (the previous event's hash) and `hash` = sha256(prev + canonical(event)).
 * Changing, removing or reordering any event breaks every later hash, which `verifyRunDir` detects.
 * The chain proves integrity of the log after the fact; it does not prove the events were honestly produced,
 * which is why events carry evidence (transaction hashes, attestation digests, file digests) to check against.
 */

export function canonical(value) {
  const sort = (v) => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') return Object.keys(v).sort().reduce((a, k) => { a[k] = sort(v[k]); return a; }, {});
    return v;
  };
  return JSON.stringify(sort(value), (_k, v) => (typeof v === 'bigint' ? `${v}n` : v));
}

export const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
export const GENESIS = '0'.repeat(64);
/** Envelope fields. Experiment data may use any other name, including `hash` (a transaction hash, for example). */
export const RESERVED = new Set(['seq', 'ts', 'type', 'chain_prev', 'chain_hash']);

export class Recorder {
  constructor({ dir, redact = (x) => x, now = () => new Date() }) {
    this.dir = dir;
    this.redact = redact;
    this.now = now;
    this.seq = 0;
    this.prev = GENESIS;
    this.counts = {};
    fs.mkdirSync(path.join(dir, 'blobs'), { recursive: true });
    this.file = path.join(dir, 'events.jsonl');
    fs.writeFileSync(this.file, '');
  }

  event(type, fields = {}) {
    for (const k of Object.keys(fields)) if (RESERVED.has(k)) throw new Error(`event field "${k}" is reserved by the recorder (it would corrupt the hash chain); rename it`);
    const body = this.redact({ seq: this.seq, ts: this.now().toISOString(), type, ...fields, chain_prev: this.prev });
    const hash = sha256(this.prev + canonical(body));
    fs.appendFileSync(this.file, JSON.stringify({ ...body, chain_hash: hash }) + '\n');
    this.prev = hash;
    this.seq += 1;
    this.counts[type] = (this.counts[type] || 0) + 1;
    return hash;
  }

  /** Store a large value content-addressed under blobs/ and return its reference. */
  blob(value, label = 'blob') {
    const data = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === 'string' ? value : JSON.stringify(value));
    const digest = sha256(data);
    const text = this.redact(data.toString('utf8'));
    fs.writeFileSync(path.join(this.dir, 'blobs', digest), text);
    return { label, sha256: digest, bytes: data.length, blob: `blobs/${digest}` };
  }

  get rootHash() { return this.prev; }
}

/** Re-read a run directory and check the chain, the sequence and the closing summary. */
export function verifyRunDir(dir) {
  const problems = [];
  const lines = fs.readFileSync(path.join(dir, 'events.jsonl'), 'utf8').split('\n').filter(Boolean);
  let prev = GENESIS;
  let last = null;
  const counts = {};
  lines.forEach((line, i) => {
    let ev;
    try { ev = JSON.parse(line); } catch { problems.push(`line ${i}: not valid JSON`); return; }
    const { chain_hash: hash, ...body } = ev;
    if (ev.seq !== i) problems.push(`line ${i}: sequence number is ${ev.seq}`);
    if (ev.chain_prev !== prev) problems.push(`line ${i}: prev hash does not match the previous event (an event was changed, removed or reordered)`);
    if (sha256(prev + canonical(body)) !== hash) problems.push(`line ${i}: hash does not match the event content`);
    prev = hash;
    last = ev;
    counts[ev.type] = (counts[ev.type] || 0) + 1;
  });
  if (!last || last.type !== 'run.end') problems.push('the log does not end with run.end (truncated or still running)');
  else if (last.rootHashOfPrevious !== (JSON.parse(lines[lines.length - 2] || '{}').chain_hash || GENESIS)) problems.push('run.end does not commit to the previous event hash');
  const blobDir = path.join(dir, 'blobs');
  for (const line of lines) {
    const ev = JSON.parse(line);
    for (const ref of collectBlobRefs(ev)) {
      const p = path.join(dir, ref.blob);
      if (!fs.existsSync(p)) { problems.push(`missing blob ${ref.blob}`); continue; }
    }
  }
  return { ok: problems.length === 0, problems, events: lines.length, rootHash: prev, counts };
}

function collectBlobRefs(node, out = []) {
  if (Array.isArray(node)) node.forEach((n) => collectBlobRefs(n, out));
  else if (node && typeof node === 'object') {
    if (typeof node.blob === 'string' && node.sha256) out.push(node);
    Object.values(node).forEach((n) => collectBlobRefs(n, out));
  }
  return out;
}
