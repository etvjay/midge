// The replay page: one replay per use case, each read out of one recorded hardware run's log, whose hash chain the page checks first.
// The pay run also opens its paper trail (statements, payslips, the auditor pack) from evidence saved in that log.
// Bundled into site/replay/replay.bundle.js by npm run build:replay.
import { checkRun, checkSettlementOrderHash, verifyStatement, verifyAuditorPack, verifyDecision, verifyModelReceipt, payrunOrderHash, leafHash } from '../../src/browser/midge-verify.js';
import { openFromModel, sealToModel } from '../../src/browser/midge-client.js';
import { hexToBytes } from '@noble/hashes/utils.js';

const D = window.REPLAY_DATA;
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
const chip = (v) => el('span', { class: `chip v-${v}` }, v === 'reported-not-verified' ? 'reported, not verified' : v);
const short = (h, n = 8) => (h && h.length > n * 2 + 1 ? `${h.slice(0, n)}…${h.slice(-4)}` : h);
const check = (v, claim, detail) => el('div', { class: 'check' }, chip(v), el('span', {}, claim), detail ? el('span', { class: 'd' }, detail) : null);
const nearOf = (yocto) => { const v = BigInt(yocto); const w = v / 10n ** 24n; const f = (v % 10n ** 24n).toString().padStart(24, '0').slice(0, 6).replace(/0+$/, ''); return f ? `${w}.${f}` : `${w}`; };
const micro = (s) => { const [w, f = ''] = String(s).split('.'); return BigInt(w) * 1_000_000n + BigInt(f.padEnd(6, '0').slice(0, 6)); };
const worst = (vs) => (vs.includes('failed') ? 'failed' : vs.includes('unavailable') ? 'unavailable' : vs.includes('reported-not-verified') && !vs.includes('recomputed') ? 'reported-not-verified' : 'recomputed');
const parse = (text) => text.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return {}; } });
const pad = (i) => String(i).padStart(2, '0');

// ---- the frame: which replay is showing, and its steps ----
let steps = []; // { id, title, beat, off, verdict }
const setVerdict = (id, v) => { const s = steps.find((x) => x.id === id); if (s) s.verdict = v; renderRail(); };
const caseOf = (key) => D.useCases.find((u) => u.key === key);
function route() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (h.startsWith('run-') && D.runs[h.slice(4)]) return { run: h.slice(4) };
  return { case: caseOf(h) ? h : D.useCases[0].key };
}
let view = route();

const numOf = (i) => steps.slice(0, i + 1).filter((x) => !x.off).length;
function section(i, lead, ...body) {
  const s = steps[i];
  return put(el('section', { class: `step${s.off ? ' off' : ''}`, id: s.id, 'aria-labelledby': `${s.id}-h` }),
    el('span', { class: 'pill' }, s.off ? `Not modelled · ${D.beats[s.beat]}` : `Step ${numOf(i)} · ${D.beats[s.beat]}`),
    el('h2', { id: `${s.id}-h` }, s.title), lead ? el('p', { class: 'lead' }, lead) : null, ...body);
}

// What a run recorded, read from its own log: the checks in the steps whose names contain a phrase, filtered by what they say.
function recorded(evs, phrases, claims) {
  const re = claims ? new RegExp(claims, 'i') : null;
  return evs.filter((e) => e.type === 'assert' && phrases.some((p) => (e.step || '').toLowerCase().includes(p.toLowerCase())) && (!re || re.test(e.claim || '')));
}
function recordedList(asserts) {
  if (!asserts.length) return null;
  return el('div', { class: 'recorded' }, el('p', { class: 'rl' }, 'Recorded by the run'),
    asserts.map((a) => el('div', { class: 'a' }, el('span', { class: a.ok ? 'ok' : 'no', 'aria-label': a.ok ? 'passed' : 'failed' }, a.ok ? '✓' : '✗'), el('span', {}, a.claim.replace(/^prediction \d+: /, '')))));
}
// A settlement transaction, checked live: two providers must agree it succeeded (and, when we know it, on the order hash).
function liveTx(tx, expectedOrderHash, onDone) {
  let row = { claim: 'the settlement succeeded on chain', verdict: 'unavailable', detail: 'asking two providers…' };
  const box = el('div', { class: 'checks' });
  const draw = () => box.replaceChildren(check(row.verdict, row.claim, row.detail));
  draw();
  checkSettlementOrderHash({ rpcUrls: D.contract.rpcUrls, txHash: tx.hash, senderId: D.contract.id, expectedOrderHash })
    .then((r) => { row = r; }, (e) => { row = { ...row, detail: String(e?.message ?? e) }; })
    .then(() => { draw(); onDone(row.verdict); });
  return el('div', { class: 'stage tx' },
    el('h3', {}, el('a', { href: `${NB}/txns/${tx.hash}`, target: '_blank', rel: 'noopener' }, `Transaction ${short(tx.hash, 8)}`), ' on ', el('span', { class: 'mono' }, D.contract.id)),
    tx.label ? el('p', { class: 'sub' }, tx.label.replace(/^settle_batch_charged ?/, 'settled: ')) : null, box);
}

// The head of every replay: the log's own check (with a way to break it), and the attestation it records.
function logHead(runId) {
  const run = D.runs[runId]; const att = parse(run.eventsText).find((e) => e.type === 'evidence' && e.kind === 'attestation');
  const st = { tampered: false };
  const box = el('div', { class: 'loghead' });
  const draw = () => {
    const r = checkRun(st.tampered ? tamper(run.eventsText) : run.eventsText, run.summaryText);
    box.replaceChildren(
      el('div', { class: 'checks' },
        check(r.rows[0].verdict, st.tampered ? 'one recorded check was flipped, and the hash chain no longer matches' : 'this run\'s log is an unbroken hash chain, so every step below is what the run recorded', `run ${runId}, ${r.events} events`),
        att ? check('reported-not-verified', 'the machine attested the pinned room image before anyone used it', `compose hash ${short(att.composeHash, 8)}`) : null),
      el('button', { type: 'button', class: 'act warn', onclick: () => { st.tampered = !st.tampered; draw(); } }, st.tampered ? 'Restore the log' : 'Change one event'));
  };
  draw();
  return box;
}
function tamper(text) {
  const lines = text.split('\n').filter(Boolean);
  const i = lines.findIndex((l) => { try { const e = JSON.parse(l); return e.type === 'assert' && e.ok === true; } catch { return false; } });
  if (i < 0) return text;
  const e = JSON.parse(lines[i]); e.ok = false; lines[i] = JSON.stringify(e);
  return `${lines.join('\n')}\n`;
}
function beatsStrip() {
  return el('ol', { class: 'beats', 'aria-label': 'The four beats' }, D.beats.map((b, k) => {
    const mine = steps.map((s, i) => ({ s, i })).filter((x) => x.s.beat === k);
    const first = mine.find((x) => !x.s.off) || mine[0];
    return el('li', { class: first ? '' : 'none' }, first
      ? el('a', { href: `#${first.s.id}`, onclick: (ev) => { ev.preventDefault(); $(first.s.id)?.scrollIntoView(); } }, el('span', { class: 'n' }, pad(k + 1)), el('span', {}, b), el('span', { class: 'st' }, `step ${mine.filter((x) => !x.s.off).map((x) => numOf(x.i)).join(', ') || 'not modelled'}`))
      : el('span', {}, el('span', { class: 'n' }, pad(k + 1)), el('span', {}, b), el('span', { class: 'st' }, 'pay runs only, for now')));
  }));
}

// A decision the room signed for a vote that moved no money: the signature is checked here, and can be broken by changing the winner.
function decisionBlock(evs, stepId, base) {
  const d = evs.find((e) => e.type === 'evidence' && e.kind === 'decision');
  if (!d) return null;
  const st = { bad: false }; const box = el('div', { class: 'stage' });
  const first = verifyDecision({ message: d.message, signatureHex: d.signature, settlePublicKeyHex: d.settlePublicKey });
  setVerdict(stepId, worst([base, first.ok ? 'recomputed' : 'failed']));
  const draw = () => {
    const other = first.fields?.winner === 'A' ? 'B' : 'A';
    const msg = st.bad ? d.message.replace(`:${first.fields?.winner}:`, `:${other}:`) : d.message;
    const v = verifyDecision({ message: msg, signatureHex: d.signature, settlePublicKeyHex: d.settlePublicKey });
    box.replaceChildren(
      el('h3', {}, 'The signed decision'), el('p', { class: 'mono sig' }, msg),
      el('div', { class: 'checks' },
        check(v.ok ? 'recomputed' : 'failed', st.bad ? 'the winner was changed, so the room\'s signature no longer matches' : 'the room\'s signature on this decision verifies', `winner ${v.fields?.winner}, round ${short(v.fields?.roundNonce || '', 6)}`),
        check('reported-not-verified', 'the signing key is the one the hardware attested', 'recorded by the run: the settlement key equals the attested one')),
      el('div', { class: 'actions' }, el('button', { type: 'button', class: 'act warn', onclick: () => { st.bad = !st.bad; draw(); } }, st.bad ? 'Restore the winner' : 'Change the winner')));
  };
  draw();
  return box;
}

// ---- a use case other than the pay run: its stages, from the research, mapped to its run ----
function renderGeneric(u) {
  const evs = parse(D.runs[u.runId].eventsText);
  steps = u.stages.map((s, i) => ({ id: `s-${i + 1}`, title: s.title, beat: s.beat, off: !s.modelled, verdict: null }));
  return u.stages.map((s, i) => {
    if (!s.modelled) return section(i, s.line);
    const asserts = recorded(evs, s.steps || [], s.claims);
    const base = asserts.length ? (asserts.every((a) => a.ok) ? 'reported-not-verified' : 'failed') : 'unavailable';
    steps[i].verdict = base;
    let txs = [];
    if (s.tx) txs = evs.filter((e) => e.type === 'evidence' && e.kind === 'tx' && e.hash && e.ok && (s.steps || []).some((p) => (e.step || '').toLowerCase().includes(p.toLowerCase())));
    const live = {};
    const done = (h) => (v) => { live[h] = v; setVerdict(steps[i].id, worst([base, ...Object.values(live)])); };
    return section(i, s.line, recordedList(asserts), s.decision ? decisionBlock(evs, steps[i].id, base) : null, txs.map((t) => liveTx(t, null, done(t.hash))));
  });
}

// ---- the pay run ----
const PAYRUN_STEPS = [
  { title: 'The employer seals the pay run', beat: 0 },
  { title: 'The AI review catches a mistake', beat: 1 },
  { title: 'A second person approves', beat: 1 },
  { title: 'Settlement on the chain', beat: 2 },
  { title: 'The sub-transaction view', beat: 3 },
  { title: 'Each person checks their payslip', beat: 3 },
  { title: 'The auditor sees one line', beat: 3 },
];
function renderPayrun(u) {
  steps = PAYRUN_STEPS.map((s, i) => ({ id: `s-${i + 1}`, ...s, off: false, verdict: null }));
  const events = parse(D.runs[u.runId].eventsText);
  const evidence = (kind) => events.find((e) => e.type === 'evidence' && e.kind === kind);
  const T = evidence('paper-trail'); const R = evidence('review');
  const asserted = (re) => events.some((e) => e.type === 'assert' && e.ok === true && re.test(e.claim || ''));
  const employerDoc = JSON.parse(openFromModel(T.employer.cipherHex, hexToBytes(T.employer.secretHex)));
  const payLines = employerDoc.lines.filter((l) => l.receipt.kind === 'pay');
  const moved = Object.fromEntries(T.allocations.map((a) => [a.recipient, BigInt(a.amount)]));

  // 1. private inputs
  const s1 = () => {
    setVerdict('s-1', 'reported-not-verified');
    return section(0, 'The employer writes one line per person: gross pay, tax, benefits, and a fresh one-time address to pay. It seals the run to the room and signs it with the employer account\'s own key. Nobody outside the room sees who is paid what.',
      el('div', { class: 'people' }, T.people.map((p) => el('div', { class: 'person' }, el('b', {}, p.name), el('span', { class: 'k' }, `paid at ${short(p.payee.split('.')[0], 6)}…`), el('span', { class: 'k' }, 'a one-time address')))),
      recordedList(recorded(events, ['set up'], 'deposit')));
  };

  // 2. the AI review
  const s2 = () => {
    const sent = R.sent; const wire = JSON.stringify(sent).toLowerCase();
    const leaks = (R.secrets || []).filter((x) => !(/^\d+$/.test(x) && x.length < 6) && wire.includes(String(x).toLowerCase()));
    const findOK = (f) => { const ln = sent.lines.find((l) => l.line === f.line); if (!ln) return false; const st = sent.stated;
      if (f.code === 'zero-deduction') return ln.taxRatePct === 0 && st.taxRatePct > 0;
      if (f.code === 'rate-below-schedule') return ln.taxRatePct < st.taxRatePct - 0.05;
      if (f.code === 'rate-above-schedule') return ln.taxRatePct > st.taxRatePct + 0.05;
      if (f.code === 'benefits-above-cap') return ln.benefitsRatePct > st.benefitsCapPct + 0.05;
      return null; };
    const rule = R.findings.filter((f) => findOK(f) !== null);
    const caught = R.findings.some((f) => f.line === R.cyLabel && ['zero-deduction', 'rate-below-schedule'].includes(f.code) && findOK(f));
    const ok = rule.every((f) => findOK(f)) && caught;
    const recv = R.receipt.signature ? verifyModelReceipt(R.receipt) : { ok: false };
    setVerdict('s-2', worst([leaks.length ? 'failed' : 'recomputed', ok ? 'recomputed' : 'failed', recv.ok ? 'recomputed' : 'failed']));
    const cyName = Object.entries(R.labels).find(([, l]) => l === R.cyLabel)?.[0];
    return section(1, 'Cy\'s line was planted with no tax withheld. Before anyone approves, the employer sends a stripped copy of the run to an attested model on NEAR AI Cloud. The model sees rates and ratios, never a name, an address or an amount, and code checks every finding against the numbers.',
      el('div', { class: 'stage' },
        el('div', { class: 'two' },
          el('div', { class: 'panel' }, el('h4', {}, 'What the model saw'), el('p', { class: 'rules' }, sent.rules),
            el('div', { class: 'tw' }, el('table', {}, el('thead', {}, el('tr', {}, ['Line', 'Gross vs median', 'Tax', 'Benefits'].map((h, i) => el('th', { class: i ? 'n' : '' }, h)))),
              el('tbody', {}, sent.lines.map((l) => el('tr', { class: l.line === R.cyLabel ? 'hit' : '' }, el('td', {}, l.line), el('td', { class: 'n' }, `${l.grossPctOfMedian}%`), el('td', { class: 'n' }, `${l.taxRatePct}%`), el('td', { class: 'n' }, `${l.benefitsRatePct}%`))))))),
          el('div', { class: 'panel' }, el('h4', {}, 'What it found'),
            R.findings.map((f) => el('div', { class: 'finding' }, el('span', { class: 'code' }, `line ${f.line} · ${f.code}`), el('span', {}, f.note), findOK(f) === null ? null : chip(findOK(f) ? 'recomputed' : 'failed'))),
            el('p', { class: 'say' }, R.summary),
            el('p', { class: 'say' }, `Line ${R.cyLabel} is ${cyName}'s. The page knows that; the model did not.`))),
        el('div', { class: 'checks' },
          check(leaks.length ? 'failed' : 'recomputed', 'no name, one-time address, reference or exact amount appears in what was sent', leaks.length ? `found: ${leaks.join(', ')}` : `${(R.secrets || []).length} values checked`),
          check(ok ? 'recomputed' : 'failed', `the finding on line ${R.cyLabel} is true when recomputed from the numbers`, 'tax 0 percent against a stated 15 percent'),
          check(recv.ok ? 'recomputed' : 'failed', 'the model\'s signature on its reply verifies here, over the model, the request hash and the response hash', `${R.receipt.model}, request ${short(R.receipt.requestSha256, 8)}`),
          check('reported-not-verified', 'that signing key belongs to a model whose hardware was attested', `hardware status ${R.receipt.tcbStatus}, recorded by the run`)),
        el('p', { class: 'say' }, 'In tests the same brief caught 59 of 59 planted mistakes across 46 runs it was never tuned on, with no false claims. ', el('a', { href: D.briefUrl, target: '_blank', rel: 'noopener' }, 'Read the reviewer\'s brief'), '. The employer then set Cy\'s tax to 15 percent and sent the run again.')));
  };

  // 3. maker-checker
  const s3 = () => {
    const A = T.approval;
    const summary = JSON.parse(openFromModel(A.summaryCipherHex, hexToBytes(A.summarySecretHex)));
    const same = summary.orderHash === T.orderHash && JSON.stringify(summary.allocations) === JSON.stringify(T.allocations);
    const bound = A.message.endsWith(`:${T.runId}:${T.orderHash}`);
    setVerdict('s-3', worst([same ? 'recomputed' : 'failed', bound ? 'recomputed' : 'failed']));
    const row = (l, v) => el('div', { class: 'lead-row' }, el('span', { class: 'l' }, l), el('span', { class: 'fill' }), el('span', {}, v));
    return section(2, 'The run names an approver, a different account from the employer who prepared it. The room seals a summary to the approver and will not sign anything until the approver signs this exact run.',
      el('div', { class: 'stage' },
        el('div', { class: 'two' },
          el('div', { class: 'slip ok sum' }, el('div', { class: 'hd' }, el('span', {}, 'Approval summary'), el('span', {}, 'sealed to the approver')),
            row('People', summary.totals.headcount), row('Gross', summary.totals.gross), row('Transfers', summary.allocations.length), row('Employer charged', nearOf(summary.charged ?? T.charged)),
            el('div', { class: 'meta2' }, el('span', {}, `Order hash ${short(summary.orderHash, 8)}`))),
          el('div', { class: 'panel' }, el('h4', {}, 'What the approver signs'), el('p', { class: 'mono sig' }, A.message))),
        el('div', { class: 'checks' },
          check(same ? 'recomputed' : 'failed', 'the summary carries the same order hash and the same transfers that settled', 'opened here with the approver\'s throwaway key, saved in the run'),
          check(bound ? 'recomputed' : 'failed', 'the signed approval names this run and this order hash, so it cannot approve a changed run'),
          check(asserted(/refuses to sign before the approval/) ? 'reported-not-verified' : 'failed', 'the room refused to sign before the approval'),
          check(A.strangerRefused && asserted(/not the approver's is refused/) ? 'reported-not-verified' : 'failed', 'an approval signed with a stranger\'s key was refused', short(A.strangerRefused, 40)))));
  };

  // 4. settlement
  const s4 = () => {
    const same = payrunOrderHash(employerDoc.runId, employerDoc.receiptsRoot) === T.orderHash;
    setVerdict('s-4', same ? 'unavailable' : 'failed');
    return section(3, 'The room signed the settlement, and the contract checked the signature, the round, the recipients and the amounts before paying. The order hash it recorded is the root of every payslip below.',
      el('div', { class: 'checks paper' }, check(same ? 'recomputed' : 'failed', 'the payslips\' root and the run id reproduce the order hash', short(T.orderHash, 12))),
      liveTx({ hash: T.settleTx }, T.orderHash, (v) => setVerdict('s-4', worst([same ? 'recomputed' : 'failed', v]))));
  };

  // 5. the sub-transaction view
  const sub = { open: 'tax' };
  const s5 = () => {
    const sumOf = (f) => payLines.reduce((x, l) => x + micro(l.receipt[f]), 0n) * 10n ** 18n;
    const netTotal = payLines.reduce((x, l) => x + moved[l.receipt.payee], 0n);
    const cells = {
      tax: { lab: 'Tax transfer', val: moved[T.taxAddress], lines: payLines.map((l) => [l.receipt.person, l.receipt.tax]), sum: sumOf('tax') },
      benefits: { lab: 'Benefits transfer', val: moved[T.benefitsAddress], lines: payLines.map((l) => [l.receipt.person, l.receipt.benefits]), sum: sumOf('benefits') },
      nets: { lab: 'Payee transfers', val: netTotal, lines: payLines.map((l) => [l.receipt.person, l.receipt.net]), sum: sumOf('net') },
      charged: { lab: 'Employer charged', val: BigInt(T.charged), lines: payLines.map((l) => [l.receipt.person, l.receipt.gross]), sum: sumOf('gross') },
    };
    const all = Object.values(cells).every((c) => c.sum === c.val) && payLines.every((l) => micro(l.receipt.net) * 10n ** 18n === moved[l.receipt.payee]);
    setVerdict('s-5', all ? 'recomputed' : 'failed');
    const wrap = el('div', {});
    const draw = () => {
      const c = cells[sub.open];
      wrap.replaceChildren(
        el('div', { class: 'cells', role: 'group', 'aria-label': 'Public transfers' }, Object.entries(cells).map(([k, x]) => el('button', { type: 'button', class: 'cell', 'aria-expanded': String(k === sub.open), onclick: () => { sub.open = k; draw(); } }, el('span', { class: 'lab' }, x.lab), el('span', { class: 'val' }, nearOf(x.val)), el('span', { class: 'tag' }, k === sub.open ? 'shown below' : 'show the lines')))),
        el('div', { class: 'expand' },
          c.lines.map(([name, v], i) => el('div', { class: 'lineitem' }, el('span', { class: 'ix' }, `[${pad(i + 1)}]`), el('span', {}, name), el('span', {}, v))),
          el('div', { class: 'equals' }, el('span', {}, '='), el('span', {}, `${nearOf(c.sum)}, ${c.sum === c.val ? 'the same as the transfer on chain' : 'NOT the transfer on chain'}`), chip(c.sum === c.val ? 'recomputed' : 'failed'))));
    };
    draw();
    return section(4, 'The chain shows one transfer to the tax account, one to the benefits account, and one to each one-time address. The employer\'s private statement holds every line behind them. Pick a transfer to see its lines.',
      el('div', { class: 'stage' }, wrap,
        el('div', { class: 'checks' }, check(all ? 'recomputed' : 'failed', 'every transfer is the sum of its lines, and each person\'s net is the transfer to their one-time address', 'decrypted here with the employer\'s throwaway key, saved in the run'))));
  };

  // 6. payslips
  const rc = { i: 0, mode: 'own' };
  const s6 = () => {
    const host = el('div', {});
    const NAMES = { decrypts: 'opens with their own key', runId: 'belongs to this run', signature: 'carries the room\'s signature', proof: 'proves into the order hash\'s root', orderHash: 'matches the order hash on chain' };
    const bump = (n) => (Number(n) + 0.01).toFixed(6).replace(/0+$/, '');
    const draw = () => {
      const p = T.people[rc.i]; const other = T.people[(rc.i + 1) % T.people.length];
      const args = (cipherHex, secretHex) => ({ cipherHex, secretX25519: hexToBytes(secretHex), hostSettlePublicKey: T.settlePublicKey, onChainOrderHash: T.orderHash });
      let res; let label = `${p.name}'s payslip`;
      if (rc.mode === 'own') res = verifyStatement(args(p.cipherHex, p.secretHex));
      else if (rc.mode === 'raise') { const d = JSON.parse(openFromModel(p.cipherHex, hexToBytes(p.secretHex))); d.receipt.net = bump(d.receipt.net); res = verifyStatement(args(sealToModel(JSON.stringify(d), p.publicKeyHex), p.secretHex)); label = `${p.name}'s payslip, with the net raised by 0.01`; }
      else { res = verifyStatement(args(other.cipherHex, p.secretHex)); label = `${other.name}'s payslip, opened with ${p.name}'s key`; }
      const sealedAway = rc.mode === 'other' && !res.receipt;
      const shown = res.receipt || JSON.parse(openFromModel(p.cipherHex, hexToBytes(p.secretHex))).receipt;
      const ok = res.ok;
      const row = (l, v, cls = '') => el('div', { class: `lead-row ${cls}` }, el('span', { class: 'l' }, l), el('span', { class: 'fill' }), el('span', {}, v));
      const slip = el('div', { class: `slip ${ok ? 'ok' : 'bad'}`, role: 'img', 'aria-label': `${label}: ${ok ? 'verified' : 'does not verify'}` },
        el('div', { class: 'hd' }, el('span', {}, 'Payslip'), el('span', {}, `No. ${short(leafHash(shown), 4)}`)),
        el('div', { class: 'stamp' }, ok ? 'VERIFIED' : 'DOES NOT VERIFY'),
        el('div', { class: 'who' }, rc.mode === 'other' ? other.name : p.name),
        sealedAway ? el('p', { class: 'away' }, `Sealed to ${other.name}. It does not open with ${p.name}'s key, so none of it can be read.`) : [
          row('Run', employerDoc.runId), row('Period', shown.period),
          row('Gross', shown.gross), row('Tax', shown.tax), row('Benefits', shown.benefits), row('Net', rc.mode === 'raise' ? `${shown.net} → ${bump(shown.net)}` : shown.net, 'total')],
        el('div', { class: 'meta2' }, el('span', {}, `Signed by the room ${short(T.settlePublicKey, 6)}`), el('span', {}, `Order hash ${short(T.orderHash, 8)}`)));
      host.replaceChildren(
        el('div', { class: 'ppl', role: 'group', 'aria-label': 'Whose payslip' }, T.people.map((x, i) => el('button', { type: 'button', 'aria-pressed': String(i === rc.i), onclick: () => { rc.i = i; rc.mode = 'own'; draw(); } }, x.name))),
        el('div', { class: 'receipt' }, slip, el('div', {},
          el('p', { class: `say ${ok ? 'good' : 'badtxt'}` }, `${label}: ${ok ? 'every check passes.' : 'it does not verify.'}`),
          el('div', { class: 'checks' }, Object.entries(res.checks).map(([k, v]) => check(v ? 'recomputed' : 'failed', NAMES[k] || k))),
          el('div', { class: 'actions' },
            el('button', { type: 'button', class: 'act', onclick: () => { rc.mode = 'own'; draw(); } }, `Check ${p.name}'s payslip`),
            el('button', { type: 'button', class: 'act warn', onclick: () => { rc.mode = 'raise'; draw(); } }, `Raise ${p.name}'s net`),
            el('button', { type: 'button', class: 'act warn', onclick: () => { rc.mode = 'other'; draw(); } }, `Open ${other.name}'s with ${p.name}'s key`)))));
    };
    draw();
    const all = T.people.every((p) => verifyStatement({ cipherHex: p.cipherHex, secretX25519: hexToBytes(p.secretHex), hostSettlePublicKey: T.settlePublicKey, onChainOrderHash: T.orderHash }).ok);
    setVerdict('s-6', all ? 'recomputed' : 'failed');
    return section(5, 'Each person gets a payslip sealed to their own key. It must open with that key, carry the room\'s signature, and prove into the order hash on chain. Then try to cheat.',
      el('div', { class: 'stage' }, host));
  };

  // 7. the auditor
  const s7 = () => {
    const pack = JSON.parse(openFromModel(T.auditor.packCipherHex, hexToBytes(T.auditor.secretHex)));
    const ver = verifyAuditorPack(pack, T.orderHash);
    const opened = pack.opened.map((o) => o.leaf.person);
    const others = T.people.map((x) => x.name).filter((n) => !opened.includes(n) && JSON.stringify(pack).includes(n));
    setVerdict('s-7', worst([ver.ok ? 'recomputed' : 'failed', others.length ? 'failed' : 'recomputed']));
    const n = Number(pack.lines) || 0; const byIdx = Object.fromEntries(pack.opened.map((o) => [o.index, o]));
    return section(6, `The employer signed a request to open one line, ${T.auditor.openedName}'s, for an auditor. The pack holds that line and a proof. The auditor learns the run has ${n} lines and nothing else about the others.`,
      el('div', { class: 'stage' },
        el('div', { class: 'rows7' }, Array.from({ length: n }, (_, i) => {
          const o = byIdx[i];
          return o ? el('div', { class: 'r7 open' }, el('span', { class: 'ix' }, `[${pad(i + 1)}]`), el('span', {}, `${o.leaf.person}  gross ${o.leaf.gross}  tax ${o.leaf.tax}  benefits ${o.leaf.benefits}  net ${o.leaf.net}`), chip(ver.ok ? 'recomputed' : 'failed'))
            : el('div', { class: 'r7' }, el('span', { class: 'ix' }, `[${pad(i + 1)}]`), el('span', { class: 'bar', 'aria-label': 'not opened' }), el('span', { class: 'why' }, 'not opened'));
        })),
        el('div', { class: 'checks' },
          check(ver.ok ? 'recomputed' : 'failed', 'the opened line proves into the order hash on chain', ver.ok ? '' : ver.reason),
          check(others.length ? 'failed' : 'recomputed', 'the pack names no one else', others.length ? others.join(', ') : ''),
          check(T.auditor.refused ? 'reported-not-verified' : 'failed', 'a request signed by anyone other than the employer was refused'))));
  };
  return [s1(), s2(), s3(), s4(), s5(), s6(), s7()];
}

// ---- any recorded run, checked on its own ----
function describe(evs) {
  const end = evs.find((e) => e.type === 'exp.end') || {};
  const map = new Map(); const order = [];
  for (const e of evs) {
    if (!e.step) continue;
    if (!map.has(e.step)) { map.set(e.step, { name: e.step, asserts: [], txs: [], outcome: null }); order.push(e.step); }
    const s = map.get(e.step);
    if (e.type === 'assert') s.asserts.push(e);
    if (e.type === 'evidence' && e.kind === 'tx' && e.hash) s.txs.push(e);
    if (e.type === 'step.end') s.outcome = e.outcome;
  }
  return { verdict: end.verdict, steps: order.map((k) => map.get(k)) };
}
function renderRun(id) {
  steps = [];
  const d = describe(parse(D.runs[id].eventsText));
  return [el('section', { class: 'step' }, el('p', { class: 'lead' }, `Recorded verdict: ${d.verdict || 'none'}`),
    el('div', { class: 'stepsl' }, d.steps.map((s) => {
      const ok = s.outcome ? s.outcome === 'pass' : s.asserts.every((a) => a.ok);
      return el('details', {}, el('summary', {}, el('span', { class: ok ? 'ok' : 'no' }, ok ? 'Passed' : 'Failed'), el('span', {}, s.name.replace(/^prediction \d+((, \d+)* (and|to) \d+)?: /, '')), el('span', { class: 'n' }, `${s.asserts.length} checks`)),
        el('div', { class: 'body' }, recordedList(s.asserts),
          s.txs.length ? el('div', { class: 'ev' }, s.txs.map((e) => el('a', { href: `${NB}/txns/${e.hash}`, target: '_blank', rel: 'noopener' }, `${e.label || 'transaction'} ${short(e.hash, 6)}`))) : null));
    })))];
}

// ---- the rail ----
function renderRail() {
  $('cases').replaceChildren(...D.useCases.map((u) => {
    const on = view.case === u.key;
    return el('li', {}, el('a', { class: 'case', href: `#${u.key}`, 'aria-current': on ? 'true' : 'false' }, u.title),
      on ? el('ol', { class: 'stepnav' }, steps.map((s, i) => el('li', {}, el('a', { href: `#${s.id}`, class: s.off ? 'off' : '', onclick: (ev) => { ev.preventDefault(); $(s.id)?.scrollIntoView(); } },
        el('span', { class: 'num' }, s.off ? '–' : pad(numOf(i))), el('span', {}, s.title), el('span', { class: `dot ${s.off ? 'hollow' : `v-${s.verdict || 'unavailable'}`}`, title: s.off ? 'not modelled' : (s.verdict || '') }))))) : null);
  }));
  $('othernav').replaceChildren(...D.other.map((r) => el('a', { href: `#run-${r.id}`, 'aria-current': view.run === r.id ? 'true' : 'false' }, r.label)));
}

// ---- the page ----
const LIMITS = [
  'A log that checks out was not changed after it was written. It does not show the events were honestly produced, so each settlement is fetched live from the chain.',
  'Each run records the hardware\'s attestation. Checking the Intel certificate chain needs the verifier behind npm run verify:tee, which this page does not repeat, so every row about attestation stays "reported, not verified".',
  'One operator ran every account in these tests, on testnet. No independent operators have been shown.',
];
const CASE_LIMITS = {
  payrun: ['Amounts and addresses are public on NEAR. The paper trail hides who each address belongs to, but a person paid the same unusual amount every month can still be matched.', 'Cy\'s missing tax was planted. It shows the reviewer catching a kind of mistake its brief names, not every real one.', 'A different account must approve, but the operator names that account for each run. The group\'s public rules do not fix it yet, and the contract does not see the approval; the room checks it.'],
  quotes: ['The winning price and the transfers are public. The losing quotes are not published.', 'The room names the maker whose quote expired, so it is known that this maker quoted. Expiry uses the room machine\'s own clock, which the run compares with the recorder\'s: they differed by 1 second.'],
  decision: ['The room signs the decision and the chain does not record it, because the contract only records payments. Anyone can check the signature, but nothing on chain shows that the vote happened.', 'The room sees every vote. Votes are hidden from the other members and the public, not from the room.'],
  ballot: ['The payout shows which option won. The count behind it is not published.'],
  block: ['Charges and payouts are public, so anyone can work out the filled units from the cash and the public reference price.', 'The room says that one order was cancelled for its minimum fill, so it is known that such an order existed.'],
  pools: ['Each member\'s charge is public, so their scaled share can be read from the chain.'],
};
function render() {
  view = route();
  let u = null; let body;
  if (view.run) {
    const label = D.other.find((r) => r.id === view.run)?.label || view.run;
    $('title').textContent = label; $('lede').textContent = 'A recorded run, checked on its own. Open a step to see what it recorded.';
    body = renderRun(view.run);
  } else {
    u = caseOf(view.case);
    $('title').textContent = `Check a ${u.title.toLowerCase().replace(/^sealed quotes$/, 'sealed-quote round')} yourself`;
    $('lede').textContent = `${u.line} Every check runs in your browser.`;
    body = u.key === 'payrun' ? renderPayrun(u) : renderGeneric(u);
  }
  const runId = view.run || u.runId;
  $('case').replaceChildren(...[logHead(runId), u ? beatsStrip() : null, ...body,
    u?.also?.length ? el('p', { class: 'also' }, 'Also recorded: ', u.also.flatMap((a, i) => [i ? ', ' : null, el('a', { href: `#run-${a.id}` }, a.label)])) : null].filter(Boolean));
  $('limits').replaceChildren(...[...(u ? CASE_LIMITS[u.key] || [] : []), ...LIMITS].map((t) => el('li', {}, t)));
  renderRail();
  document.title = `Midge replay: ${$('title').textContent}`;
}
// On a phone the step list starts folded under Replay, so the page opens on the replay itself.
if (window.matchMedia?.('(max-width: 920px)').matches) document.querySelector('.railnav')?.removeAttribute('open');
window.addEventListener('hashchange', () => { if (!/^#s-\d+$/.test(location.hash)) { render(); window.scrollTo(0, 0); } });
render();
