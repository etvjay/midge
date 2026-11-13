// The replay page. Everything the pay run steps show is read out of one recorded hardware run's log, the same log whose hash chain the page
// verifies first. Bundled into site/replay/replay.bundle.js by npm run build:replay.
import { checkRun, checkContractCodeHash, checkSettlementOrderHash, verifyStatement, verifyAuditorPack, payrunOrderHash, leafHash } from '../../src/browser/midge-verify.js';
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
const clean = (s) => String(s ?? '').replace(/^"+|"+$/g, '');
const check = (v, claim, detail) => el('div', { class: 'check' }, chip(v), el('span', {}, claim), detail ? el('span', { class: 'd' }, detail) : null);
const nearOf = (yocto) => { const v = BigInt(yocto); const w = v / 10n ** 24n; const f = (v % 10n ** 24n).toString().padStart(24, '0').slice(0, 6).replace(/0+$/, ''); return f ? `${w}.${f}` : `${w}`; };
const micro = (s) => { const [w, f = ''] = String(s).split('.'); return BigInt(w) * 1_000_000n + BigInt(f.padEnd(6, '0').slice(0, 6)); };
const worst = (vs) => (vs.includes('failed') ? 'failed' : vs.includes('unavailable') ? 'unavailable' : vs.includes('reported-not-verified') && !vs.includes('recomputed') ? 'reported-not-verified' : 'recomputed');

// ---- the pay run, read from its own log ----
const PAY = D.runs[D.payRunId];
const payCheck = checkRun(PAY.eventsText, PAY.summaryText);
const events = PAY.eventsText.split('\n').filter(Boolean).map((l) => JSON.parse(l));
const evidence = (kind) => events.find((e) => e.type === 'evidence' && e.kind === kind);
const T = evidence('paper-trail'); const R = evidence('review'); const ATT = evidence('attestation');
const asserted = (re) => events.some((e) => e.type === 'assert' && e.ok === true && re.test(e.claim || ''));
const employerDoc = JSON.parse(openFromModel(T.employer.cipherHex, hexToBytes(T.employer.secretHex)));
const payLines = employerDoc.lines.filter((l) => l.receipt.kind === 'pay');
const moved = Object.fromEntries(T.allocations.map((a) => [a.recipient, BigInt(a.amount)]));
const nameOf = Object.fromEntries(T.people.map((p) => [p.payee, p.name]));

const STEPS = [
  { id: 'step-1', title: 'Four people sign their invoices' },
  { id: 'step-2', title: 'A mismatch is refused' },
  { id: 'step-3', title: 'The AI review catches a mistake' },
  { id: 'step-4', title: 'Settlement on the chain' },
  { id: 'step-5', title: 'The sub-transaction view' },
  { id: 'step-6', title: 'Each person checks their receipt' },
  { id: 'step-7', title: 'The auditor sees one line' },
];
const verdictOf = {};
const setVerdict = (id, v) => { verdictOf[id] = v; renderStepNav(); };

function section(i, lead, ...body) {
  const s = STEPS[i];
  return put(el('section', { class: 'step', id: s.id, 'aria-labelledby': `${s.id}-h` }), el('span', { class: 'pill' }, `Step ${i + 1}`), el('h2', { id: `${s.id}-h` }, s.title), lead ? el('p', { class: 'lead' }, lead) : null, ...body);
}

function renderSource() {
  const row = payCheck.rows[0];
  put($('source'),
    el('div', { class: 'row2' }, el('span', {}, 'Every step below is read out of one recorded run on real hardware: ', el('b', { class: 'mono' }, D.payRunId), '.'), el('span', {}, `${payCheck.events} events`)),
    el('div', { class: 'paper checks' }, check(row.verdict, 'its log is an unbroken hash chain, so what follows is what the run recorded', `root ${short(payCheck.rootHash, 10)}`), check(payCheck.rows[1].verdict, 'its verdicts, re-derived from the raw events, agree', JSON.stringify(payCheck.verdicts)), ATT ? check('reported-not-verified', 'the machine attested the pinned room image before anyone used it', `compose hash ${short(ATT.composeHash, 8)}`) : null));
}

// ---- step 1 ----
function step1() {
  const ok = asserted(/all four lines matched their invoices/);
  setVerdict('step-1', 'reported-not-verified');
  return section(0, 'Each payee signs an invoice for the exact amount and address they ask for, and seals it to the room. The room checks every signature and compares each invoice with the employer\'s line, field by field.',
    el('div', { class: 'people' }, T.people.map((p) => el('div', { class: 'person' }, el('b', {}, p.name), el('span', { class: 'k' }, `invoice hash ${short(p.invoiceHash, 8)}`), el('span', { class: 'k' }, `pays to ${short(p.payee.split('.')[0], 6)}… (one-time)`)))),
    el('div', { class: 'paper checks' }, check(ok ? 'reported-not-verified' : 'failed', 'the room checked all four signatures and found every line matched its invoice', 'recorded in the log; Step 6 recomputes that each receipt carries its invoice\'s hash')));
}

// ---- step 2 ----
function step2() {
  setVerdict('step-2', T.refusal ? 'reported-not-verified' : 'failed');
  return section(1, 'Before that, the employer\'s first try had Dee\'s line at 0.065 while Dee\'s signed invoice asked for 0.06. The room refused the whole run, named the difference, and kept the queue.',
    el('div', { class: 'refuse' }, T.refusal),
    el('div', { class: 'paper checks' }, check('reported-not-verified', 'the room refused and kept the queue', 'the room\'s own reply, recorded in the log')));
}

// ---- step 3 ----
function step3() {
  const sent = R.sent; const wire = JSON.stringify(sent).toLowerCase();
  const leaks = (R.secrets || []).filter((x) => !(/^\d+$/.test(x) && x.length < 6) && wire.includes(String(x).toLowerCase()));
  const findOK = (f) => { const ln = sent.lines.find((l) => l.line === f.line); if (!ln) return false; const st = sent.stated;
    if (f.code === 'zero-deduction') return ln.taxRatePct === 0 && st.taxRatePct > 0;
    if (f.code === 'rate-below-schedule') return ln.taxRatePct < st.taxRatePct - 0.05;
    if (f.code === 'rate-above-schedule') return ln.taxRatePct > st.taxRatePct + 0.05;
    if (f.code === 'benefits-above-cap') return ln.benefitsRatePct > st.benefitsCapPct + 0.05;
    return null; };
  const rule = R.findings.filter((f) => findOK(f) !== null);
  const allTrue = rule.every((f) => findOK(f));
  const caught = R.findings.some((f) => f.line === R.cyLabel && ['zero-deduction', 'rate-below-schedule'].includes(f.code) && findOK(f));
  setVerdict('step-3', worst([leaks.length ? 'failed' : 'recomputed', allTrue && caught ? 'recomputed' : 'failed']));
  const cyName = Object.entries(R.labels).find(([, l]) => l === R.cyLabel)?.[0];
  return section(2, 'Cy\'s line was planted with no tax withheld. Her invoice matches her line, so the invoice check passes it. Before approving, the employer sends a redacted copy to an attested model on NEAR AI Cloud. The model never sees a name, an address or an amount, and code checks every finding against the numbers.',
    el('div', { class: 'stage' },
      el('div', { class: 'two' },
        el('div', { class: 'panel' }, el('h4', {}, 'What the model saw'), el('p', { class: 'rules' }, sent.rules),
          el('div', { class: 'tw' }, el('table', {}, el('thead', {}, el('tr', {}, ['Line', 'Gross vs median', 'Tax', 'Benefits'].map((h, i) => el('th', { class: i ? 'n' : '' }, h)))),
            el('tbody', {}, sent.lines.map((l) => el('tr', { class: l.line === R.cyLabel ? 'hit' : '' }, el('td', {}, l.line), el('td', { class: 'n' }, `${l.grossPctOfMedian}%`), el('td', { class: 'n' }, `${l.taxRatePct}%`), el('td', { class: 'n' }, `${l.benefitsRatePct}%`))))))),
        el('div', { class: 'panel' }, el('h4', {}, 'What it found'),
          R.findings.map((f) => el('div', { class: 'finding' }, el('span', { class: 'code' }, `line ${f.line} · ${f.code}`), el('span', {}, f.note), findOK(f) === null ? chip('reported-not-verified') : chip(findOK(f) ? 'recomputed' : 'failed'))),
          el('p', { class: 'say' }, R.summary), R.questions?.length ? el('p', { class: 'say' }, `Question for the accountant: ${R.questions[0]}`) : null,
          el('p', { class: 'say' }, `Line ${R.cyLabel} is ${cyName}'s. The page knows that; the model did not.`))),
      el('div', { class: 'checks' },
        check(leaks.length ? 'failed' : 'recomputed', 'none of the names, one-time addresses, invoice ids or exact amounts appear in what was sent', leaks.length ? `found: ${leaks.join(', ')}` : `${(R.secrets || []).length} values checked`),
        check(allTrue && caught ? 'recomputed' : 'failed', `the finding on line ${R.cyLabel} is true when recomputed from the numbers`, 'tax 0 percent against a stated 15 percent'),
        check('reported-not-verified', 'the reply came from the attested model and its signed receipt verified', `${R.receipt.model}, hardware status ${R.receipt.tcbStatus}, request ${short(R.receipt.requestSha256, 8)}`)),
      el('p', { class: 'say' }, `Caught on attempt ${R.attempts}. The same brief caught this mistake in 10 of 10 trial reviews, and 59 of 59 planted mistakes across 46 runs it was never tuned on, with no false claims. `, el('a', { href: D.briefUrl, target: '_blank', rel: 'noopener' }, 'Read the reviewer\'s brief'), '.'),
      el('p', { class: 'say' }, 'The employer then set Cy\'s tax to 0.0045, 15 percent of her gross, and sent the run again.')));
}

// ---- step 4 ----
let liveRow = { claim: 'the settlement on chain records the same order hash the receipts prove into', verdict: 'unavailable', detail: 'asking two providers…' };
function step4() {
  const fromRoot = payrunOrderHash(employerDoc.runId, employerDoc.receiptsRoot);
  const same = fromRoot === T.orderHash;
  const box = el('div', { class: 'checks', id: 'live-row' });
  const draw = () => box.replaceChildren(check(same ? 'recomputed' : 'failed', 'the receipts root and the run id reproduce the order hash', short(fromRoot, 12)), check(liveRow.verdict, liveRow.claim, liveRow.detail));
  draw();
  setVerdict('step-4', worst([same ? 'recomputed' : 'failed', liveRow.verdict]));
  checkSettlementOrderHash({ rpcUrls: D.contract.rpcUrls, txHash: T.settleTx, senderId: D.contract.id, expectedOrderHash: T.orderHash })
    .then((r) => { liveRow = r; }, (e) => { liveRow = { ...liveRow, verdict: 'unavailable', detail: String(e?.message ?? e) }; })
    .then(() => { draw(); setVerdict('step-4', worst([same ? 'recomputed' : 'failed', liveRow.verdict])); });
  return section(3, 'The room signed the settlement, and the contract checked the signature, the round, the recipients and the amounts before paying. The order hash it recorded is the root of every receipt below.',
    el('div', { class: 'stage' },
      el('h3', {}, el('a', { href: `${NB}/txns/${T.settleTx}`, target: '_blank', rel: 'noopener', style: 'color:var(--d-lake)' }, `Transaction ${short(T.settleTx, 8)}`), ' on ', el('span', { class: 'mono' }, D.contract.id)),
      el('p', { class: 'sub' }, `Order hash ${T.orderHash}`),
      box));
}

// ---- step 5 ----
const sub = { open: 'tax' };
function step5() {
  const sumOf = (f) => payLines.reduce((x, l) => x + micro(l.receipt[f]), 0n) * 10n ** 18n;
  const netTotal = payLines.reduce((x, l) => x + moved[l.receipt.payee], 0n);
  const cells = {
    tax: { lab: 'Tax transfer', val: moved[T.taxAddress], lines: payLines.map((l) => [l.receipt.person, l.receipt.tax]), sum: sumOf('tax'), what: 'the tax lines' },
    benefits: { lab: 'Benefits transfer', val: moved[T.benefitsAddress], lines: payLines.map((l) => [l.receipt.person, l.receipt.benefits]), sum: sumOf('benefits'), what: 'the benefits lines' },
    nets: { lab: 'Payee transfers', val: netTotal, lines: payLines.map((l) => [l.receipt.person, l.receipt.net]), sum: sumOf('net'), what: 'each person\'s net' },
    charged: { lab: 'Employer charged', val: BigInt(T.charged), lines: payLines.map((l) => [l.receipt.person, l.receipt.gross]), sum: sumOf('gross'), what: 'the gross lines' },
  };
  const all = Object.values(cells).every((c) => c.sum === c.val) && payLines.every((l) => micro(l.receipt.net) * 10n ** 18n === moved[l.receipt.payee]);
  setVerdict('step-5', all ? 'recomputed' : 'failed');
  const wrap = el('div', {});
  const draw = () => {
    const c = cells[sub.open];
    wrap.replaceChildren(
      el('div', { class: 'cells', role: 'group', 'aria-label': 'Public transfers' }, Object.entries(cells).map(([k, x]) => el('button', { type: 'button', class: 'cell', 'aria-expanded': String(k === sub.open), onclick: () => { sub.open = k; draw(); } }, el('span', { class: 'lab' }, x.lab), el('span', { class: 'val' }, nearOf(x.val)), el('span', { class: 'tag' }, k === sub.open ? 'shown below' : 'show the lines')))),
      el('div', { class: 'expand' },
        c.lines.map(([name, v], i) => el('div', { class: 'lineitem' }, el('span', { class: 'ix' }, `[${String(i + 1).padStart(2, '0')}]`), el('span', {}, name), el('span', {}, v))),
        el('div', { class: 'equals' }, el('span', {}, '='), el('span', {}, `${nearOf(c.sum)}, ${c.sum === c.val ? 'the same as the transfer on chain' : 'NOT the transfer on chain'}`), chip(c.sum === c.val ? 'recomputed' : 'failed'))));
  };
  draw();
  return section(4, 'The chain shows one transfer to the tax account, one to the benefits account, and one to each one-time address. The employer\'s statement holds every line behind them. Pick a transfer to see the lines it is made of.',
    el('div', { class: 'stage' }, el('h3', {}, 'What NEAR shows, and the private lines behind it'), el('p', { class: 'sub' }, 'The four transfers are public. The lines are decrypted here with the employer\'s throwaway key, saved in the run for this purpose.'), wrap,
      el('div', { class: 'checks' }, check(all ? 'recomputed' : 'failed', 'every total is the sum of its lines, and each person\'s net is the transfer to their one-time address', `${payLines.length} people, tax, benefits, the employer's charge`))));
}

// ---- step 6 ----
const rc = { i: 0, mode: 'own' };
function step6() {
  const host = el('div', {});
  const NAMES = { decrypts: 'opens with their own key', runId: 'belongs to this run', signature: 'carries the room\'s signature', proof: 'proves into the receipts root', orderHash: 'matches the order hash on chain' };
  const draw = () => {
    const p = T.people[rc.i]; const other = T.people[(rc.i + 1) % T.people.length];
    const args = (cipherHex, secretHex) => ({ cipherHex, secretX25519: hexToBytes(secretHex), hostSettlePublicKey: T.settlePublicKey, onChainOrderHash: T.orderHash });
    let res; let label = `${p.name}'s receipt`;
    if (rc.mode === 'own') res = verifyStatement(args(p.cipherHex, p.secretHex));
    else if (rc.mode === 'raise') { const d = JSON.parse(openFromModel(p.cipherHex, hexToBytes(p.secretHex))); d.receipt.net = (Number(d.receipt.net) + 0.01).toFixed(6).replace(/0+$/, ''); res = verifyStatement(args(sealToModel(JSON.stringify(d), p.publicKeyHex), p.secretHex)); label = `${p.name}'s receipt, with the net raised by 0.01`; }
    else { res = verifyStatement(args(other.cipherHex, p.secretHex)); label = `${other.name}'s receipt, opened with ${p.name}'s key`; }
    const sealedAway = rc.mode === 'other' && !res.receipt;
    const shown = res.receipt || JSON.parse(openFromModel(p.cipherHex, hexToBytes(p.secretHex))).receipt;
    const invoiceOK = res.ok && res.receipt.invoiceHash === p.invoiceHash;
    const ok = res.ok && invoiceOK;
    const row = (l, v, cls = '') => el('div', { class: `lead-row ${cls}` }, el('span', { class: 'l' }, l), el('span', { class: 'fill' }), el('span', {}, v));
    const slip = el('div', { class: `slip ${ok ? 'ok' : 'bad'}`, role: 'img', 'aria-label': `${label}: ${ok ? 'verified' : 'does not verify'}` },
      el('div', { class: 'hd' }, el('span', {}, 'Receipt'), el('span', {}, `No. ${short(leafHash(shown), 4)}`)),
      el('div', { class: 'stamp' }, ok ? 'VERIFIED' : 'DOES NOT VERIFY'),
      el('div', { class: 'who' }, rc.mode === 'other' ? other.name : p.name),
      sealedAway ? el('p', { style: 'margin:18px 0 8px;color:var(--ink-2)' }, `Sealed to ${other.name}. It does not open with ${p.name}'s key, so nothing of it can be read.`) : [
        row('Run', employerDoc.runId), row('Period', shown.period), row('Invoice', shown.invoiceId),
        row('Gross', shown.gross), row('Tax', shown.tax), row('Benefits', shown.benefits), row('Net', rc.mode === 'raise' ? `${shown.net} → ${(Number(shown.net) + 0.01).toFixed(6).replace(/0+$/, '')}` : shown.net, 'total')],
      el('div', { class: 'meta2' }, sealedAway ? null : el('span', {}, `Invoice hash ${short(shown.invoiceHash || '', 8)}`), el('span', {}, `Signed by the room ${short(T.settlePublicKey, 6)}`), el('span', {}, `Order hash ${short(T.orderHash, 8)}`)));
    const ticks = el('div', {},
      el('p', { class: 'say', style: `color:${ok ? 'var(--d-lake)' : 'var(--deny)'}` }, `${label}: ${ok ? 'every check passes.' : 'it does not verify.'}`),
      el('div', { class: 'checks' }, Object.entries(res.checks).map(([k, v]) => check(v ? 'recomputed' : 'failed', NAMES[k] || k)),
        res.ok ? check(invoiceOK ? 'recomputed' : 'failed', 'carries the hash of the invoice this person signed') : null),
      el('div', { class: 'actions' },
        el('button', { type: 'button', class: 'act', onclick: () => { rc.mode = 'own'; draw(); } }, `Check ${p.name}'s receipt`),
        el('button', { type: 'button', class: 'act warn', onclick: () => { rc.mode = 'raise'; draw(); } }, `Raise ${p.name}'s net`),
        el('button', { type: 'button', class: 'act warn', onclick: () => { rc.mode = 'other'; draw(); } }, `Open ${other.name}'s receipt with ${p.name}'s key`)));
    host.replaceChildren(
      el('div', { class: 'ppl', role: 'group', 'aria-label': 'Whose receipt' }, T.people.map((x, i) => el('button', { type: 'button', 'aria-pressed': String(i === rc.i), onclick: () => { rc.i = i; rc.mode = 'own'; draw(); } }, x.name))),
      el('div', { class: 'receipt' }, slip, ticks));
  };
  draw();
  const all = T.people.every((p) => { const r = verifyStatement({ cipherHex: p.cipherHex, secretX25519: hexToBytes(p.secretHex), hostSettlePublicKey: T.settlePublicKey, onChainOrderHash: T.orderHash }); return r.ok && r.receipt.invoiceHash === p.invoiceHash; });
  setVerdict('step-6', all ? 'recomputed' : 'failed');
  return section(5, 'Each payee gets a receipt sealed to their own key. It must open with that key, carry the room\'s signature, and prove into the order hash recorded on chain. Then try to cheat.',
    el('div', { class: 'stage' }, el('h3', {}, 'Pick a person'), el('p', { class: 'sub' }, 'The keys that open these receipts were made for this run, hold nothing, and are saved in the run so you can check them here.'), host));
}

// ---- step 7 ----
function step7() {
  const pack = JSON.parse(openFromModel(T.auditor.packCipherHex, hexToBytes(T.auditor.secretHex)));
  const totals = JSON.parse(openFromModel(T.auditor.totalsCipherHex, hexToBytes(T.auditor.secretHex)));
  const ver = verifyAuditorPack(pack, T.orderHash);
  const opened = pack.opened.map((o) => o.leaf.person);
  const others = T.people.map((x) => x.name).filter((n) => !opened.includes(n) && JSON.stringify(pack).includes(n));
  const noNames = !/(Alice|Bo|Cy|Dee|\.testnet)/.test(JSON.stringify(totals));
  setVerdict('step-7', worst([ver.ok ? 'recomputed' : 'failed', others.length ? 'failed' : 'recomputed', noNames ? 'recomputed' : 'failed']));
  const n = Number(pack.lines) || 0; const byIdx = Object.fromEntries(pack.opened.map((o) => [o.index, o]));
  return section(6, `The employer signed a request to open one line, ${T.auditor.openedName}'s, for an auditor. The pack holds that line and a proof. The auditor learns that the run has ${n} lines and nothing else about the others.`,
    el('div', { class: 'stage' },
      el('h3', {}, 'The auditor\'s pack'),
      el('div', { class: 'rows7' }, Array.from({ length: n }, (_, i) => {
        const o = byIdx[i];
        return o ? el('div', { class: 'r7 open' }, el('span', { class: 'ix' }, `[${String(i + 1).padStart(2, '0')}]`), el('span', {}, `${o.leaf.person}  gross ${o.leaf.gross}  tax ${o.leaf.tax}  benefits ${o.leaf.benefits}  net ${o.leaf.net}`), chip(ver.ok ? 'recomputed' : 'failed'))
          : el('div', { class: 'r7' }, el('span', { class: 'ix' }, `[${String(i + 1).padStart(2, '0')}]`), el('span', { class: 'bar', 'aria-label': 'not opened' }), el('span', { class: 'why' }, 'not opened'));
      })),
      el('div', { class: 'checks' },
        check(ver.ok ? 'recomputed' : 'failed', 'the opened line proves into the order hash on chain', ver.ok ? '' : ver.reason),
        check(others.length ? 'failed' : 'recomputed', 'the pack names no one else', others.length ? others.join(', ') : ''),
        check(noNames ? 'recomputed' : 'failed', 'an accountant\'s totals-only view carries no name or address', `gross ${totals.gross}, tax ${totals.tax}, benefits ${totals.benefits}, net ${totals.net}`),
        check(T.auditor.refused ? 'reported-not-verified' : 'failed', 'a request signed by anyone other than the employer was refused', 'the room checks the key against the chain; its reply is recorded in the log'))));
}

// ---- the rail ----
function renderStepNav() {
  const ol = $('stepnav'); if (!ol) return;
  ol.replaceChildren(...STEPS.map((s, i) => el('li', {}, el('a', { href: `#${s.id}`, 'aria-current': String(active === s.id) }, el('span', { class: 'num' }, String(i + 1).padStart(2, '0')), el('span', {}, s.title), el('span', { class: `dot v-${verdictOf[s.id] || 'unavailable'}`, title: verdictOf[s.id] || '' })))));
}
let active = STEPS[0].id;
function spy() {
  if (typeof IntersectionObserver !== 'function') return;
  const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { active = e.target.id; renderStepNav(); } }, { rootMargin: '-30% 0px -60% 0px' });
  for (const s of STEPS) { const n = $(s.id); if (n) io.observe(n); }
}

// ---- every other recorded run ----
const state = { runId: null, tampered: false, live: null };
function tamper(text) {
  const lines = text.split('\n').filter(Boolean);
  const i = lines.findIndex((l) => { try { const e = JSON.parse(l); return e.type === 'assert' && e.ok === true; } catch { return false; } });
  if (i < 0) return text;
  const e = JSON.parse(lines[i]); e.ok = false; lines[i] = JSON.stringify(e);
  return `${lines.join('\n')}\n`;
}
function describe(evs) {
  const start = evs.find((e) => e.type === 'exp.start') || {}; const end = evs.find((e) => e.type === 'exp.end') || {};
  const steps = new Map(); const order = [];
  for (const e of evs) {
    if (!e.step) continue;
    if (!steps.has(e.step)) { steps.set(e.step, { name: e.step, asserts: [], evidence: [], outcome: null }); order.push(e.step); }
    const s = steps.get(e.step);
    if (e.type === 'assert') s.asserts.push({ claim: e.claim, ok: e.ok });
    if (e.type === 'evidence' && ['tx', 'cvm', 'attestation'].includes(e.kind)) s.evidence.push(e);
    if (e.type === 'step.end') s.outcome = e.outcome;
  }
  return { hypothesis: clean(start.hypothesis), verdict: end.verdict, steps: order.map((k) => steps.get(k)) };
}
const allRuns = D.groups.flatMap((g) => g.runs);
function renderGroups() {
  $('groups').replaceChildren(...D.groups.map((g) => el('div', { class: `group${g.quiet ? ' quiet' : ''}` }, el('h3', {}, g.title), el('p', {}, g.line),
    g.runs.map((r) => el('button', { type: 'button', 'aria-pressed': String(r.id === state.runId), onclick: () => pickRun(r.id) }, r.label, el('span', {}, r.kind))))));
  $('runnav').replaceChildren(...D.groups.map((g) => el('div', {}, el('div', { class: 'g' }, g.title), g.runs.map((r) => el('button', { type: 'button', 'aria-pressed': String(r.id === state.runId), onclick: () => { pickRun(r.id); $('runs').scrollIntoView(); } }, r.label)))));
}
function pickRun(id) { state.runId = id; state.tampered = false; state.live = null; renderGroups(); renderPanel(); }
async function liveContract() {
  const b = $('live-btn'); if (b) { b.disabled = true; b.textContent = 'Asking two providers…'; }
  try { state.live = await checkContractCodeHash({ rpcUrls: D.contract.rpcUrls, contractId: D.contract.id, expectedCodeHash: D.contract.codeHash }); }
  catch (e) { state.live = { claim: `${D.contract.id} runs the code hash recorded in this repository`, verdict: 'unavailable', detail: String(e?.message ?? e) }; }
  renderPanel();
}
function renderPanel() {
  const panel = $('panel'); if (!state.runId) { panel.replaceChildren(); return; }
  const meta = allRuns.find((r) => r.id === state.runId); const run = D.runs[state.runId];
  const text = state.tampered ? tamper(run.eventsText) : run.eventsText;
  const result = checkRun(text, run.summaryText);
  const evs = text.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return {}; } });
  const d = describe(evs); const rows = [...result.rows, ...(state.live ? [state.live] : [])];
  panel.replaceChildren(
    el('h3', { class: 't' }, meta.label), el('p', { class: 'blurb' }, meta.blurb),
    el('p', { class: 'meta' }, el('span', {}, 'Run ', el('b', { class: 'mono' }, state.runId)), el('span', {}, el('b', {}, d.verdict || 'no verdict'), ' recorded'), el('span', {}, el('b', {}, String(result.events)), ' events')),
    el('div', { class: 'stage' },
      el('h3', {}, state.tampered ? 'The log, after one event was changed' : 'What your browser just checked'),
      el('p', { class: 'sub' }, state.tampered ? 'One recorded check was flipped in memory. The hash chain no longer matches, and the rows turn red on their own.' : 'The log is rebuilt event by event, hash by hash, from the raw text.'),
      el('div', { class: 'rows' }, rows.map((r) => el('div', { class: `row${r.verdict === 'failed' ? ' bad' : ''}` }, chip(r.verdict), el('span', {}, r.claim), el('span', { class: 'detail' }, r.detail)))),
      el('div', { class: 'actions' },
        el('button', { type: 'button', class: 'act warn', onclick: () => { state.tampered = !state.tampered; renderPanel(); } }, state.tampered ? 'Restore the log' : 'Change one event and check again'),
        el('button', { type: 'button', class: 'act', id: 'live-btn', onclick: liveContract }, 'Check the live contract'))),
    el('div', { class: 'stepsl' }, d.steps.map((s) => {
      const ok = s.outcome ? s.outcome === 'pass' : s.asserts.every((a) => a.ok);
      return el('details', {}, el('summary', {}, el('span', { class: ok ? 'ok' : 'no' }, ok ? 'Passed' : 'Failed'), el('span', {}, s.name.replace(/^prediction \d+( (and|to) \d+)?: /, '')), el('span', { class: 'n' }, `${s.asserts.length} checks`)),
        el('div', { class: 'body' }, s.asserts.map((a) => el('div', { class: 'a' }, el('span', { class: a.ok ? 'ok' : 'no', 'aria-label': a.ok ? 'passed' : 'failed' }, a.ok ? '✓' : '✗'), el('span', {}, a.claim))),
          s.evidence.length ? el('div', { class: 'ev' }, s.evidence.map((e) => (e.kind === 'tx' && e.hash ? el('a', { href: `${NB}/txns/${e.hash}`, target: '_blank', rel: 'noopener' }, `${e.label || 'transaction'} ${short(e.hash, 6)}`) : el('span', {}, `${e.kind}${e.id ? ` ${short(e.id, 6)}` : ''}${e.composeHash ? ` compose ${short(e.composeHash, 6)}` : ''}`)))) : null));
    })));
}

// ---- start ----
renderSource();
put($('steps'), step1(), step2(), step3(), step4(), step5(), step6(), step7());
renderStepNav(); spy();
renderGroups();
