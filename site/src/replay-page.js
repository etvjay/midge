// The replay page: re-checks recorded runs, and a pay run's paper trail, in the visitor's browser. Bundled into site/replay/replay.bundle.js (npm run build:replay).
import { checkRun, checkContractCodeHash, verifyStatement, verifyAuditorPack } from '../../src/browser/midge-verify.js';
import { openFromModel, sealToModel } from '../../src/browser/midge-client.js';
import { hexToBytes } from '@noble/hashes/utils.js';

const DATA = window.REPLAY_DATA;
const NB = 'https://testnet.nearblocks.io';
const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (v === null || v === undefined || v === false) continue; if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v); }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return n;
};
// Node.append(null) writes the word "null" into a real page, so every append goes through put(), which skips empty values.
const put = (parent, ...kids) => { for (const k of kids.flat()) if (k) parent.append(k); return parent; };
const chip = (verdict) => el('span', { class: `chip v-${verdict}` }, verdict === 'reported-not-verified' ? 'reported, not verified' : verdict);
const short = (h, n = 10) => (h && h.length > n * 2 + 1 ? `${h.slice(0, n)}…${h.slice(-4)}` : h);
const clean = (s) => String(s ?? '').replace(/^"+|"+$/g, '');

// ---- one recorded run ----
const state = { runId: DATA.runs[0].id, tampered: false, live: null };

function tamper(text) {
  const lines = text.split('\n').filter(Boolean);
  const i = lines.findIndex((l) => { try { const e = JSON.parse(l); return e.type === 'assert' && e.ok === true; } catch { return false; } });
  if (i < 0) return text;
  const e = JSON.parse(lines[i]); e.ok = false; lines[i] = JSON.stringify(e);
  return `${lines.join('\n')}\n`;
}

function describe(events) {
  const start = events.find((e) => e.type === 'exp.start') || {};
  const end = events.find((e) => e.type === 'exp.end') || {};
  const steps = new Map(); const order = [];
  for (const e of events) {
    if (!e.step) continue;
    if (!steps.has(e.step)) { steps.set(e.step, { name: e.step, asserts: [], observes: [], evidence: [], outcome: null }); order.push(e.step); }
    const s = steps.get(e.step);
    if (e.type === 'assert') s.asserts.push({ claim: e.claim, ok: e.ok });
    if (e.type === 'observe') s.observes.push({ label: e.label, value: e.value });
    if (e.type === 'evidence') s.evidence.push(e);
    if (e.type === 'step.end') s.outcome = e.outcome;
  }
  const evidence = events.filter((e) => e.type === 'evidence');
  return { title: clean(start.title), hypothesis: clean(start.hypothesis), tier: start.tier, verdict: end.verdict, steps: order.map((k) => steps.get(k)), txs: evidence.filter((e) => e.kind === 'tx' && e.hash), cvm: evidence.find((e) => e.kind === 'cvm'), att: evidence.find((e) => e.kind === 'attestation') };
}

function renderPicker() {
  const box = $('runs'); box.replaceChildren();
  for (const r of DATA.runs) box.append(el('button', { type: 'button', 'aria-pressed': String(r.id === state.runId), onclick: () => { state.runId = r.id; state.tampered = false; state.live = null; renderPicker(); renderRun(); } }, el('span', { class: 't' }, r.label), el('span', { class: 'k' }, r.kind)));
}

function renderRun() {
  const run = DATA.runs.find((r) => r.id === state.runId);
  const text = state.tampered ? tamper(run.eventsText) : run.eventsText;
  const result = checkRun(text, run.summaryText);
  const events = text.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return {}; } });
  const d = describe(events);
  const rows = [...result.rows];
  if (state.live) rows.push(state.live);
  const root = $('run'); root.replaceChildren();
  put(root, 
    el('h2', {}, run.label),
    el('p', { class: 'blurb' }, run.blurb),
    el('p', { class: 'meta' }, el('span', {}, 'Run ', el('b', { class: 'mono' }, run.id)), el('span', {}, el('b', {}, d.verdict || 'no verdict'), ' recorded'), el('span', {}, el('b', {}, String(result.events)), ' events'), el('span', {}, 'Root ', el('b', { class: 'mono' }, short(result.rootHash, 8)))),
    d.hypothesis ? el('details', { class: 'hyp' }, el('summary', {}, 'What this run set out to show'), el('p', {}, d.hypothesis)) : null,
  );
  const stage = el('div', { class: 'stage' },
    el('h3', {}, state.tampered ? 'The log, after one event was changed' : 'What your browser just checked'),
    el('p', { class: 'sub' }, state.tampered ? 'One recorded assertion was flipped in memory. The hash chain no longer matches, and the check turns red on its own.' : 'The log is rebuilt event by event, hash by hash, from the raw text. Nothing below was supplied by a server.'),
    el('div', { class: 'rows' }, rows.map((r) => el('div', { class: `row${r.verdict === 'failed' ? ' bad' : ''}` }, chip(r.verdict), el('span', { class: 'claim' }, r.claim), el('span', { class: 'detail' }, r.detail)))),
    el('div', { class: 'actions' },
      el('button', { type: 'button', class: 'act warn', onclick: () => { state.tampered = !state.tampered; renderRun(); } }, state.tampered ? 'Restore the log' : 'Change one event and check again'),
      el('button', { type: 'button', class: 'act', id: 'live-btn', onclick: liveCheck }, 'Check the live contract')),
  );
  put(root, stage);
  put(root, el('div', { class: 'steps' }, el('h3', {}, 'What happened, step by step'), d.steps.map((s) => {
    const failed = s.asserts.filter((a) => !a.ok).length; const ok = s.outcome ? s.outcome === 'pass' : failed === 0;
    return el('details', { class: 'step' },
      el('summary', {}, el('span', { class: ok ? 'ok' : 'no' }, ok ? 'Passed' : 'Failed'), el('span', {}, s.name.replace(/^prediction \d+( and \d+)?: /, '')), el('span', { class: 'n' }, `${s.asserts.length} checks`)),
      el('div', { class: 'body' },
        s.asserts.map((a) => el('div', { class: 'a' }, el('span', { class: a.ok ? 'ok' : 'no', 'aria-label': a.ok ? 'passed' : 'failed' }, a.ok ? '✓' : '✗'), el('span', {}, a.claim))),
        s.observes.length ? el('div', { class: 'ev' }, s.observes.map((o) => el('span', {}, `${o.label}: ${typeof o.value === 'object' ? JSON.stringify(o.value).slice(0, 140) : o.value}`))) : null,
        s.evidence.length ? el('div', { class: 'ev' }, s.evidence.map((e) => (e.kind === 'tx' && e.hash ? el('a', { href: `${NB}/txns/${e.hash}`, target: '_blank', rel: 'noopener' }, `${e.label || 'transaction'} ${short(e.hash, 8)}`) : el('span', {}, `${e.kind}${e.id ? ` ${short(e.id, 8)}` : ''}${e.composeHash ? ` compose ${short(e.composeHash, 8)}` : ''}`)))) : null));
  })));
  if (d.txs.length) put(root, el('div', {}, el('h3', { style: 'font:400 20px/1.2 var(--serif);margin:22px 0 8px' }, 'On the chain'), el('ul', { class: 'chain-list' }, d.txs.map((t) => el('li', {}, el('a', { href: `${NB}/txns/${t.hash}`, target: '_blank', rel: 'noopener' }, t.label || 'transaction'), ' ', el('span', { class: 'mono' }, short(t.hash, 10)), ' ', chip('reported-not-verified'))))));
}

async function liveCheck() {
  const btn = $('live-btn'); btn.disabled = true; btn.textContent = 'Asking two providers…';
  try { state.live = await checkContractCodeHash({ rpcUrls: DATA.contract.rpcUrls, contractId: DATA.contract.id, expectedCodeHash: DATA.contract.codeHash }); }
  catch (e) { state.live = { claim: `${DATA.contract.id} runs the code hash recorded in this repository`, verdict: 'unavailable', detail: String(e.message || e) }; }
  renderRun();
}

// ---- the pay run paper trail ----
const T = DATA.paperTrail;
const micro = (s) => { const [w, f = ''] = String(s).split('.'); return BigInt(w) * 1_000_000n + BigInt(f.padEnd(6, '0').slice(0, 6)); };
const nearOf = (yocto) => { const v = BigInt(yocto); const w = v / 10n ** 24n; const f = (v % 10n ** 24n).toString().padStart(24, '0').slice(0, 6).replace(/0+$/, ''); return f ? `${w}.${f}` : `${w}`; };
const tr = { view: 'near', person: 0, result: null, forged: false };

function roomDoc() { return JSON.parse(openFromModel(T.employer.cipherHex, hexToBytes(T.employer.secretHex))); }

function renderTrail() {
  const root = $('trail'); root.replaceChildren();
  const doc = roomDoc();
  const payLines = doc.lines.filter((l) => l.receipt.kind === 'pay');
  const byAddr = Object.fromEntries(payLines.map((l) => [l.receipt.payee, l.receipt]));
  const moved = Object.fromEntries(T.allocations.map((a) => [a.recipient, BigInt(a.amount)]));
  const sum = (f) => payLines.reduce((x, l) => x + micro(l.receipt[f]), 0n) * 10n ** 18n;

  const nearTable = el('div', { class: 'tw' }, el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'To'), el('th', { class: 'n' }, 'Amount (NEAR)'))), el('tbody', {},
    T.allocations.map((a) => el('tr', {}, el('td', { class: 'mono' }, a.recipient), el('td', { class: 'n' }, nearOf(a.amount)))),
    el('tr', {}, el('td', {}, 'The employer was charged'), el('td', { class: 'n' }, nearOf(T.charged))),
    el('tr', {}, el('td', {}, 'Order hash recorded with the payment'), el('td', { class: 'n mono' }, short(T.orderHash, 12))))));
  const roomTable = el('div', { class: 'tw' }, el('table', {}, el('thead', {}, el('tr', {}, ['Person', 'One-time address', 'Gross', 'Tax', 'Benefits', 'Net'].map((h, i) => el('th', { class: i > 1 ? 'n' : '' }, h)))), el('tbody', {},
    payLines.map((l) => el('tr', {}, el('td', {}, l.receipt.person), el('td', { class: 'mono' }, l.receipt.payee), ['gross', 'tax', 'benefits', 'net'].map((f) => el('td', { class: 'n' }, l.receipt[f])))))));

  const checks = [
    [`the ${payLines.length} tax lines add up to the one tax transfer`, sum('tax') === moved[T.taxAddress], nearOf(moved[T.taxAddress])],
    [`the ${payLines.length} benefits lines add up to the one benefits transfer`, sum('benefits') === moved[T.benefitsAddress], nearOf(moved[T.benefitsAddress])],
    ['each person\'s net equals the transfer to their one-time address', payLines.every((l) => micro(l.receipt.net) * 10n ** 18n === moved[l.receipt.payee]), `${payLines.length} of ${payLines.length}`],
    ['the gross lines add up to what the employer was charged', sum('gross') === BigInt(T.charged), nearOf(T.charged)],
    ['every transfer together equals the employer\'s charge', Object.values(moved).reduce((x, y) => x + y, 0n) === BigInt(T.charged), 'nothing created or lost'],
  ];

  put(root, 
    el('h2', { id: 'trail-h' }, 'The paper trail of a pay run'),
    el('p', { class: 'lead' }, 'A pay run leaves two records. NEAR holds the public one and the room holds the private one, and a single hash recorded with the payment ties them together. Everything below is checked in your browser. ', T.note),
  );
  const stage = el('div', { class: 'stage' });
  put(stage, 
    el('h3', {}, 'Two views of the same payment'),
    el('p', { class: 'sub' }, 'Switch between what any observer of the chain sees and what the room holds. The addresses are one-time, so the chain does not say who each one belongs to.'),
    el('div', { class: 'seg', role: 'group', 'aria-label': 'View' }, el('button', { type: 'button', 'aria-pressed': String(tr.view === 'near'), onclick: () => { tr.view = 'near'; renderTrail(); } }, 'What NEAR shows'), el('button', { type: 'button', 'aria-pressed': String(tr.view === 'room'), onclick: () => { tr.view = 'room'; renderTrail(); } }, 'What the room holds')),
    tr.view === 'near' ? nearTable : roomTable,
    el('h3', { style: 'margin-top:22px' }, 'The sub-transaction view: the private lines add up to the public transfers'),
    el('div', { class: 'sums' }, checks.map(([claim, ok, detail]) => el('div', { class: 'sum' }, chip(ok ? 'recomputed' : 'failed'), el('span', {}, `${claim} (${detail})`)))),
  );
  put(root, stage);

  // receipts
  const p = T.people[tr.person]; const args = (cipherHex, secretHex) => ({ cipherHex, secretX25519: hexToBytes(secretHex), hostSettlePublicKey: T.settlePublicKey, onChainOrderHash: T.orderHash });
  const names = { decrypts: 'opens with their key', runId: 'belongs to this run', signature: 'carries the room\'s signature', proof: 'proves into the receipts root', orderHash: 'reproduces the recorded order hash' };
  const rcpt = el('div', { class: 'stage' },
    el('h3', {}, 'Each person checks their own receipt'),
    el('p', { class: 'sub' }, 'A receipt is sealed to its owner. Pick a person and check it against the order hash from the payment, then try to cheat.'),
    el('div', { class: 'ppl', role: 'group', 'aria-label': 'Person' }, T.people.map((x, i) => el('button', { type: 'button', 'aria-pressed': String(i === tr.person), onclick: () => { tr.person = i; tr.result = null; renderTrail(); } }, x.name))),
    el('div', { class: 'actions' },
      el('button', { type: 'button', class: 'act', onclick: () => { tr.result = { title: `${p.name}'s receipt`, r: verifyStatement(args(p.cipherHex, p.secretHex)) }; renderTrail(); } }, `Check ${p.name}'s receipt`),
      el('button', { type: 'button', class: 'act warn', onclick: () => {
        const d = JSON.parse(openFromModel(p.cipherHex, hexToBytes(p.secretHex))); d.receipt.net = String(Number(d.receipt.net) + 0.01);
        tr.result = { title: `${p.name}'s receipt with the net raised by 0.01`, r: verifyStatement(args(sealToModel(JSON.stringify(d), p.publicKeyHex), p.secretHex)) }; renderTrail(); } }, `Raise ${p.name}'s net and check again`),
      el('button', { type: 'button', class: 'act warn', onclick: () => { const other = T.people[(tr.person + 1) % T.people.length]; tr.result = { title: `${other.name}'s receipt opened with ${p.name}'s key`, r: verifyStatement(args(other.cipherHex, p.secretHex)) }; renderTrail(); } }, `Open the next person's receipt with ${p.name}'s key`)),
  );
  if (tr.result) {
    const good = tr.result.r.ok;
    put(rcpt, el('p', { class: `say ${good ? 'good' : 'bad'}` }, `${tr.result.title}: ${good ? 'every check passes.' : 'it does not verify.'}`),
      el('div', { class: 'checks' }, Object.entries(tr.result.r.checks).map(([k, v]) => el('div', { class: 'check' }, chip(v ? 'recomputed' : 'failed'), el('span', {}, names[k] || k)))),
      good && tr.result.r.receipt ? el('p', { class: 'say' }, `Gross ${tr.result.r.receipt.gross}, tax ${tr.result.r.receipt.tax}, benefits ${tr.result.r.receipt.benefits}, net ${tr.result.r.receipt.net}. It carries the hash of the invoice ${tr.result.r.receipt.person} signed.`) : null);
  }
  put(root, rcpt);

  // auditor
  const pack = JSON.parse(openFromModel(T.auditor.packCipherHex, hexToBytes(T.auditor.secretHex)));
  const totals = JSON.parse(openFromModel(T.auditor.totalsCipherHex, hexToBytes(T.auditor.secretHex)));
  const ver = verifyAuditorPack(pack, T.orderHash);
  const opened = pack.opened.map((o) => o.leaf.person);
  const others = T.people.map((x) => x.name).filter((n) => !opened.includes(n) && JSON.stringify(pack).includes(n));
  put(root, el('div', { class: 'stage' },
    el('h3', {}, 'The auditor sees only what the employer opens'),
    el('p', { class: 'sub' }, `The employer signed a request to open one line, ${T.auditor.openedName}'s. The auditor checks it against the order hash from the payment.`),
    el('div', { class: 'sums' },
      el('div', { class: 'sum' }, chip(ver.ok ? 'recomputed' : 'failed'), el('span', {}, `the opened line proves into the recorded order hash${ver.ok ? '' : `: ${ver.reason}`}`)),
      el('div', { class: 'sum' }, chip(opened.length === 1 && others.length === 0 ? 'recomputed' : 'failed'), el('span', {}, `the pack holds ${opened.join(', ')} and names no one else`)),
      el('div', { class: 'sum' }, chip(!/(Alice|Bo|Cy|Dee|\.testnet)/.test(JSON.stringify(totals)) ? 'recomputed' : 'failed'), el('span', {}, `an accountant's totals-only view carries no name or address: gross ${totals.gross}, tax ${totals.tax}, benefits ${totals.benefits}, net ${totals.net}`))),
    el('p', { class: 'say' }, 'A request that was not signed by the employer\'s account key is refused by the room. That check needs the chain, so it is shown in the recorded hardware run above and in ', el('code', {}, 'npm run demo:paper-trail'), '.'),
    T.refusal ? el('div', { class: 'refuse' }, el('b', {}, 'A mismatch is refused: '), T.refusal) : null,
  ));
}

renderPicker(); renderRun(); renderTrail();
