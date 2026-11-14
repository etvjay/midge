// The playground page: a visitor takes part in a live pay run. The visitor's keys are made here and never leave the browser. Everything the service
// returns is checked here with the same code as the Replay page (the model's receipt, the settlement, the payslip). Bundled by npm run build:playground.
import { initialState, reduce, canReview, canStart, lineProblems, approvalToSign } from './playground-state.js';
import { nearKeyPair, generateClientKey, signInputWithNearKey, openFromModel, sealToModel } from '../../src/browser/midge-client.js';
import { verifyModelReceipt, verifyStatement, checkSettlementOrderHash, leafHash } from '../../src/browser/midge-verify.js';
import { RULES } from '../../src/playground/defaults.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

const CFG = window.PLAYGROUND_CONFIG || {};
const API = CFG.apiBase ? String(CFG.apiBase).replace(/\/$/, '') : null;
const CONTRACT_ID = typeof CFG.contractId === 'string' ? CFG.contractId : null; // the page's own copy, so the approval message is never taken from the service
const NB = 'https://testnet.nearblocks.io';
const RPCS = Array.isArray(CFG.rpcUrls) && CFG.rpcUrls.length >= 2 ? CFG.rpcUrls : ['https://test.rpc.fastnear.com', 'https://near-testnet.drpc.org']; // the list can be replaced only by a test page's config
const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return n;
};
// rc(Node, null) writes the word "null" into the page, so every replacement goes through rc(), which skips empty values.
const rc = (node, ...kids) => node.replaceChildren(...kids.flat().filter((x) => x !== null && x !== undefined && x !== false));
const put = (parent, ...kids) => {
  for (const k of kids.flat()) if (k) parent.append(k);
  return parent;
};
const chip = (v) => el('span', { class: `chip v-${v}` }, v === 'reported-not-verified' ? 'reported, not verified' : v);
const sentence = (t) => {
  const x = String(t);
  return x.charAt(0).toUpperCase() + x.slice(1) + (/[.?!]$/.test(x) ? '' : '.');
};
const check = (v, claim, detail) => el('div', { class: 'check' }, chip(v), el('span', {}, sentence(claim)), detail ? el('span', { class: 'd' }, detail) : null);
const short = (h, n = 8) => (h && h.length > n * 2 + 1 ? `${h.slice(0, n)}…${h.slice(-4)}` : h);
const nearOf = (yocto) => {
  const v = BigInt(yocto);
  const w = v / 10n ** 24n;
  const f = (v % 10n ** 24n).toString().padStart(24, '0').slice(0, 6).replace(/0+$/, '');
  return f ? `${w}.${f}` : `${w}`;
};
const worst = (vs) =>
  vs.includes('failed')
    ? 'failed'
    : vs.includes('unavailable')
      ? 'unavailable'
      : vs.includes('reported-not-verified') && !vs.includes('recomputed')
        ? 'reported-not-verified'
        : 'recomputed';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- the visitor's keys, kept in this tab's session storage so a reload does not lose a round ----
const STORE = 'midge-playground';
function saveKeys(k) {
  try {
    sessionStorage.setItem(
      STORE,
      JSON.stringify({
        nearPublic: k.near.publicKey,
        nearSecret: k.near.secretKey,
        payslipPublic: k.payslip.publicKeyHex,
        payslipSecret: bytesToHex(k.payslip.secretX25519),
        session: k.session,
        ticket: k.ticket,
      }),
    );
  } catch {
    /* storage may be blocked */
  }
}
function makeKeys() {
  const k = { near: nearKeyPair(), payslip: generateClientKey(), session: bytesToHex(crypto.getRandomValues(new Uint8Array(12))), ticket: null };
  saveKeys(k);
  return k;
}
function loadKeys() {
  try {
    const o = JSON.parse(sessionStorage.getItem(STORE) || 'null');
    if (o)
      return {
        near: { publicKey: o.nearPublic, secretKey: o.nearSecret },
        payslip: { publicKeyHex: o.payslipPublic, secretX25519: hexToBytes(o.payslipSecret) },
        session: o.session,
        ticket: o.ticket || null,
      };
  } catch {
    /* make new ones */
  }
  return makeKeys();
}
let keys = loadKeys();
let state = initialState();
const verdicts = {};
const dispatch = (a) => {
  state = reduce(state, a);
  drawAll();
};

async function api(method, path, body) {
  if (!API) return { status: 0, json: { error: 'The playground service is not running right now.' } };
  try {
    // A round is read, approved and cancelled by the session that joined it, so every request about a round carries this tab's session.
    const headers = {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(path.startsWith('/api/rounds/') ? { 'x-playground-session': keys.session } : {}),
    };
    const r = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60000) });
    return { status: r.status, json: await r.json().catch(() => ({})) };
  } catch {
    return { status: 0, json: { error: 'The playground service could not be reached. Please try again in a moment.' } };
  }
}

// ---- the steps ----
const STEPS = [
  { id: 's-1', title: 'Your keys' },
  { id: 's-2', title: 'The run' },
  { id: 's-3', title: 'The model reviews it' },
  { id: 's-4', title: 'You approve it' },
  { id: 's-5', title: 'Settlement on NEAR' },
  { id: 's-6', title: 'Your payslip' },
];
const hosts = {};
function skeleton() {
  const root = $('steps');
  STEPS.forEach((s, i) => {
    const body = el('div', { class: 'body' });
    hosts[s.id] = body;
    put(
      root,
      put(
        el('section', { class: 'step', id: s.id, 'aria-labelledby': `${s.id}-h` }),
        el('span', { class: 'pill' }, `Step ${i + 1}`),
        el('h2', { id: `${s.id}-h` }, s.title),
        body,
      ),
    );
  });
}
const setVerdict = (id, v) => {
  verdicts[id] = v;
  drawRail();
};
function drawRail() {
  rc(
    $('stepnav'),
    ...STEPS.map((s, i) =>
      el(
        'li',
        {},
        el(
          'a',
          { href: `#${s.id}` },
          el('span', { class: 'num' }, String(i + 1).padStart(2, '0')),
          el('span', {}, s.title),
          el('span', { class: `dot v-${verdicts[s.id] || 'unavailable'}`, title: verdicts[s.id] || '' }),
        ),
      ),
    ),
  );
}

// ---- the status strip ----
let health = null;
async function refreshStatus() {
  const bar = $('status');
  if (!API) {
    bar.className = 'statusbar off';
    rc(
      bar,
      el(
        'span',
        { class: 'item' },
        el('span', { class: 'dot v-unavailable' }),
        'The playground is not running right now. The recorded runs on the Replay page show the same flow.',
      ),
    );
    return;
  }
  const r = await api('GET', '/api/health');
  health = r.status === 200 ? r.json : null;
  const room = health?.room?.state;
  const roomText =
    {
      up: 'Room: ready',
      starting: 'Room: starting, which takes about 40 seconds',
      stopped: 'Room: asleep, and starting now',
      unknown: 'Room: starting now',
      error: 'Room: could not be started',
    }[room] || 'Room: checking';
  bar.className = 'statusbar';
  rc(
    bar,
    el('span', { class: 'item' }, el('span', { class: `dot ${health ? 'v-recomputed' : 'v-failed'}` }), health ? 'Service: ready' : 'Service: not reachable'),
    el(
      'span',
      { class: 'item' },
      el('span', { class: `dot ${room === 'up' ? 'v-recomputed' : room === 'error' ? 'v-failed' : 'v-reported-not-verified'}` }),
      roomText,
    ),
    health
      ? el('span', { class: 'item' }, health.active ? 'A round is running, so yours may wait a little' : 'No round is running, so yours starts at once')
      : null,
  );
}

// ---- step 1: keys ----
function drawKeys() {
  const host = hosts['s-1'];
  const secrets = el(
    'details',
    { class: 'secret' },
    el('summary', {}, 'Show my secret keys'),
    el(
      'div',
      { class: 'keys' },
      el('div', { class: 'keyrow' }, el('span', { class: 'l' }, 'NEAR secret key'), el('span', { class: 'mono' }, keys.near.secretKey)),
      el('div', { class: 'keyrow' }, el('span', { class: 'l' }, 'Payslip secret key'), el('span', { class: 'mono' }, bytesToHex(keys.payslip.secretX25519))),
    ),
  );
  rc(
    host,
    el(
      'p',
      { class: 'lead' },
      'Your browser makes two keys. The first is a NEAR key. The service creates your testnet account with it, the room checks your approval against it, and only you hold its secret. The second is a payslip key, which seals your payslip so that only you can open it. Neither secret leaves your browser.',
    ),
    el(
      'div',
      { class: 'keys' },
      el('div', { class: 'keyrow' }, el('span', { class: 'l' }, 'NEAR public key'), el('span', { class: 'mono' }, keys.near.publicKey)),
      el('div', { class: 'keyrow' }, el('span', { class: 'l' }, 'Payslip public key'), el('span', { class: 'mono' }, keys.payslip.publicKeyHex)),
    ),
    secrets,
    el(
      'div',
      { class: 'presets' },
      el('button', { type: 'button', class: 'paper-act', onclick: downloadKeys }, 'Download my keys'),
      el(
        'button',
        {
          type: 'button',
          class: 'paper-act',
          disabled: state.step !== 'run',
          onclick: () => {
            keys = makeKeys();
            dispatch({ type: 'restart' });
          },
        },
        'Make new keys',
      ),
    ),
    el(
      'p',
      { class: 'hint' },
      'The account created for you holds the pay you receive. It is yours: you can import the NEAR key into a testnet wallet. The coins have no value.',
    ),
  );
  setVerdict('s-1', 'recomputed');
}
function downloadKeys() {
  const blob = new Blob(
    [
      JSON.stringify(
        {
          note: 'Midge playground keys. NEAR testnet only.',
          nearPublicKey: keys.near.publicKey,
          nearSecretKey: keys.near.secretKey,
          payslipPublicKeyHex: keys.payslip.publicKeyHex,
          payslipSecretKeyHex: bytesToHex(keys.payslip.secretX25519),
        },
        null,
        2,
      ),
    ],
    { type: 'application/json' },
  );
  const a = el('a', { href: URL.createObjectURL(blob), download: 'midge-playground-keys.json' });
  document.body.append(a);
  a.click();
  a.remove();
}

// ---- step 2: the run ----
const rate = (part, whole) => {
  const p = Number(part),
    w = Number(whole);
  return w > 0 && Number.isFinite(p) ? `${((p / w) * 100).toFixed(1)}%` : '–';
};
let runInputs = [];
function drawRun() {
  const host = hosts['s-2'];
  runInputs = [];
  const rows = state.lines.map((l, i) => {
    const cell = (field) => {
      const input = el('input', {
        value: l[field],
        inputmode: field === 'person' ? 'text' : 'decimal',
        'aria-label': `${field} for line ${i + 1}`,
        class: field === 'person' ? 'name' : '',
        disabled: state.step !== 'run' || (field === 'person' && i !== 3),
        autocomplete: 'off',
      });
      input.addEventListener('input', () => {
        dispatch2({ type: 'edit', index: i, field, value: input.value });
      });
      runInputs.push({ i, field, input });
      return el('td', {}, input);
    };
    return el(
      'tr',
      { class: i === 3 ? 'you' : '', id: `row-${i}` },
      el('td', {}, i === 3 ? 'You' : `Line ${i + 1}`),
      cell('person'),
      cell('gross'),
      cell('tax'),
      cell('benefits'),
      el('td', { class: 'n', id: `tr-${i}` }),
      el('td', { class: 'n', id: `br-${i}` }),
      el('td', { class: 'n', id: `lb-${i}` }),
    );
  });
  rc(
    host,
    el(
      'p',
      { class: 'lead' },
      "This is the pay run the employer sends to the room. The last line is yours, and you can rename it. Edit any amount, then ask the model to review the run. The employer's rules are below, and they are what the model checks the lines against.",
    ),
    el('p', { class: 'hint' }, `Rules: ${RULES}`),
    el(
      'div',
      { class: 'tw' },
      el(
        'table',
        { class: 'rtable' },
        el(
          'thead',
          {},
          el(
            'tr',
            {},
            ['Who', 'Name', 'Gross', 'Tax', 'Benefits', 'Tax rate', 'Benefits rate', 'Model sees'].map((h) => el('th', {}, h)),
          ),
        ),
        el('tbody', {}, rows),
      ),
    ),
    el('div', { class: 'problems', id: 'problems', role: 'status' }),
    el(
      'div',
      { class: 'presets' },
      el(
        'button',
        { type: 'button', class: 'paper-act', disabled: state.step !== 'run', onclick: () => dispatch({ type: 'preset', name: 'clean' }) },
        'Use a correct run',
      ),
      el(
        'button',
        { type: 'button', class: 'paper-act warn', disabled: state.step !== 'run', onclick: () => dispatch({ type: 'preset', name: 'planted' }) },
        'Withhold no tax from Cy',
      ),
    ),
    el(
      'p',
      { class: 'hint' },
      'Amounts are in NEAR. Gross pay can be between 0.01 and 0.1 for each person, and the four lines together are deposited by the employer.',
    ),
  );
  drawRunDerived();
}
// Editing must not rebuild the table, or the input would lose focus on every key.
function dispatch2(a) {
  state = reduce(state, a);
  drawRunDerived();
  drawReview();
  drawStartControls();
}
function drawRunDerived() {
  state.lines.forEach((l, i) => {
    const t = $(`tr-${i}`);
    const b = $(`br-${i}`);
    const lb = $(`lb-${i}`);
    if (!t) return;
    t.textContent = rate(l.tax, l.gross);
    b.textContent = rate(l.benefits, l.gross);
    const label = state.review?.labels?.[i];
    rc(lb, label ? el('span', { class: 'lab' }, `line ${label}`) : '–');
    $(`row-${i}`).className = `${i === 3 ? 'you ' : ''}${state.review?.findings?.some((f) => f.line === label) ? 'flag' : ''}`;
  });
  const pr = $('problems');
  if (pr) pr.textContent = lineProblems(state.lines).join(' ');
  runInputs.forEach(({ i, field, input }) => {
    if (document.activeElement !== input && input.value !== state.lines[i][field]) input.value = state.lines[i][field];
  });
}

// ---- step 3: the review ----
let reviewing = false;
function findOK(f, sent) {
  const ln = sent.lines.find((l) => l.line === f.line);
  if (!ln) return false;
  const st = sent.stated;
  if (f.code === 'zero-deduction') return ln.taxRatePct === 0 && st.taxRatePct > 0;
  if (f.code === 'rate-below-schedule') return ln.taxRatePct < st.taxRatePct - 0.05;
  if (f.code === 'rate-above-schedule') return ln.taxRatePct > st.taxRatePct + 0.05;
  if (f.code === 'benefits-above-cap') return ln.benefitsRatePct > st.benefitsCapPct + 0.05;
  return null;
}
async function askReview() {
  if (reviewing || !canReview(state)) return;
  reviewing = true;
  drawReview();
  const r = await api('POST', '/api/review', { session: keys.session, lines: state.lines });
  reviewing = false;
  dispatch({ type: 'review-done', review: r.status === 200 ? r.json : { used: false, reason: r.json?.error || 'The review did not run.' } });
}
function reviewView(review) {
  const sent = review.sent;
  const wire = JSON.stringify(sent || {}).toLowerCase();
  const secrets = [...state.lines.map((l) => l.person), ...state.lines.flatMap((l) => [l.gross, l.tax, l.benefits])].filter(
    (x) => String(x).length >= 5 && !/^\d+$/.test(String(x)),
  );
  const leaks = secrets.filter((x) => wire.includes(String(x).toLowerCase()));
  const receipt = verifyModelReceipt(review.receipt || {});
  const rows = review.findings.map((f) => ({ f, ok: findOK(f, sent) }));
  setVerdict(
    's-3',
    worst([
      leaks.length ? 'failed' : 'recomputed',
      receipt.ok ? 'recomputed' : 'failed',
      ...rows.map((r) => (r.ok === null ? 'reported-not-verified' : r.ok ? 'recomputed' : 'failed')),
    ]),
  );
  return el(
    'div',
    { class: 'stage' },
    el(
      'div',
      { class: 'two' },
      el(
        'div',
        { class: 'panel' },
        el('h4', {}, 'What the model saw'),
        el('p', { class: 'rules' }, sent.rules),
        el(
          'div',
          { class: 'tw' },
          el(
            'table',
            {},
            el(
              'thead',
              {},
              el(
                'tr',
                {},
                ['Line', 'Gross vs median', 'Tax', 'Benefits'].map((h, i) => el('th', { class: i ? 'n' : '' }, h)),
              ),
            ),
            el(
              'tbody',
              {},
              sent.lines.map((l) =>
                el(
                  'tr',
                  { class: review.findings.some((f) => f.line === l.line) ? 'hit' : '' },
                  el('td', {}, l.line),
                  el('td', { class: 'n' }, `${l.grossPctOfMedian}%`),
                  el('td', { class: 'n' }, `${l.taxRatePct}%`),
                  el('td', { class: 'n' }, `${l.benefitsRatePct}%`),
                ),
              ),
            ),
          ),
        ),
      ),
      el(
        'div',
        { class: 'panel' },
        el('h4', {}, 'What it found'),
        rows.length
          ? rows.map(({ f, ok }) =>
              el(
                'div',
                { class: 'finding' },
                el('span', { class: 'code' }, `line ${f.line}, ${f.code}`),
                el('span', {}, f.note),
                ok === null ? chip('reported-not-verified') : chip(ok ? 'recomputed' : 'failed'),
              ),
            )
          : el('p', { class: 'say' }, 'The model found nothing to flag in this run.'),
        el('p', { class: 'say' }, review.summary),
        review.questions?.length ? el('p', { class: 'say' }, `Question for the accountant: ${review.questions[0]}`) : null,
      ),
    ),
    el(
      'div',
      { class: 'checks' },
      check(
        leaks.length ? 'failed' : 'recomputed',
        'no name or exact amount that you typed appears in what the model was sent',
        leaks.length ? `found: ${leaks.join(', ')}` : `${secrets.length} values checked`,
      ),
      ...rows.map(({ f, ok }) =>
        check(
          ok === null ? 'reported-not-verified' : ok ? 'recomputed' : 'failed',
          `the finding on line ${f.line} (${f.code}) is ${ok ? 'true' : ok === null ? 'not one that numbers alone can settle' : 'not supported by'} when recomputed from the numbers`,
        ),
      ),
      check(
        receipt.ok ? 'recomputed' : 'failed',
        "the model's signature on its reply verifies here, over the model name, the request hash and the response hash",
        `${review.receipt?.model}, request ${short(review.receipt?.requestSha256 || '', 8)}`,
      ),
      check(
        'reported-not-verified',
        "the signing key belongs to a model running on attested hardware. The page doesn't check that attestation.",
        `hardware status ${review.receipt?.tcbStatus}, recorded by the service`,
      ),
    ),
  );
}
function drawReview() {
  const host = hosts['s-3'];
  const ready = canReview(state);
  rc(
    host,
    el(
      'p',
      { class: 'lead' },
      'Before anyone approves the run, a model on NEAR AI Cloud reviews it. It is sent letters, ratios and rates, and never a name or an amount, and your browser checks each finding against the numbers. The service will only start a round for exactly the lines the model has just reviewed, so any edit means a new review.',
    ),
    el(
      'div',
      { class: 'presets' },
      el(
        'button',
        {
          type: 'button',
          class: 'paper-act primary',
          'aria-busy': reviewing ? 'true' : 'false',
          disabled: !ready || reviewing || !API || state.step !== 'run',
          onclick: askReview,
        },
        reviewing ? 'The model is reviewing…' : state.review ? 'Review this run again' : 'Ask the model to review this run',
      ),
    ),
    state.reviewError ? el('div', { class: 'banner bad', role: 'alert' }, sentence(state.reviewError)) : null,
    state.review ? reviewView(state.review) : el('p', { class: 'hint' }, ready ? 'Not reviewed yet.' : 'Fix the lines above first.'),
  );
  drawRunDerived();
}

// ---- step 4: the round and your approval ----
const PROGRESS = [
  ['waking-room', 'Starting the room, which takes up to 40 seconds if it was asleep'],
  ['creating-accounts', 'Creating your testnet account and the other accounts'],
  ['hatching', 'Creating the group on the NEAR contract'],
  ['depositing', 'The employer deposits the gross pay into the group'],
  ['sealing', 'Sealing the run and handing it to the room'],
  ['awaiting-approval', 'Waiting for your approval'],
  ['settling', 'The room signs and the contract settles'],
];
let polling = false;
let summaryCache = null;
let approveBusy = false;
let approveMsg = null;
let cheatMsg = null;
function drawStartControls() {
  const b = $('start-btn');
  if (b) b.disabled = !canStart(state) || !API;
  const hint = $('start-hint');
  if (hint)
    hint.textContent = canStart(state)
      ? 'Ready. The round takes about two minutes.'
      : state.review
        ? 'The lines changed after the review. Ask for a new review.'
        : 'The model has to review these lines first.';
}
async function startRound() {
  if (!canStart(state)) return;
  const btn = $('start-btn');
  if (btn) {
    btn.setAttribute('aria-busy', 'true');
    btn.disabled = true;
    btn.textContent = 'Starting…';
  }
  const r = await api('POST', '/api/rounds', {
    session: keys.session,
    visitorPublicKey: keys.near.publicKey,
    payeeKeyHex: keys.payslip.publicKeyHex,
    lines: state.lines,
    youIndex: 3,
  });
  if (r.status === 200) {
    keys.ticket = r.json.ticket;
    saveKeys(keys);
    summaryCache = null;
    approveMsg = null;
    cheatMsg = null;
    dispatch({ type: 'round-started', ticket: r.json.ticket });
    poll();
  } else dispatch({ type: 'round-refused', reason: r.json?.error || 'The round could not be started.' });
}
async function poll() {
  if (polling) return;
  polling = true;
  try {
    while (state.step === 'round' && state.ticket) {
      const r = await api('GET', `/api/rounds/${state.ticket}`);
      if (r.status === 404) {
        keys.ticket = null;
        saveKeys(keys);
        dispatch({
          type: 'round-state',
          state: { step: 'expired', detail: { reason: 'The round is no longer known to the service. Please start it again.' } },
        });
        break;
      }
      if (r.status === 200) {
        const before = state.round.step;
        state = reduce(state, { type: 'round-state', state: r.json });
        if (state.round.step !== before || state.step !== 'round') drawAll();
        else drawRound();
      }
      if (state.step !== 'round') {
        keys.ticket = null;
        saveKeys(keys);
        break;
      }
      await sleep(2000);
    }
  } finally {
    polling = false;
  }
}
function drawRound() {
  const host = hosts['s-4'];
  const r = state.round;
  const d = r.detail || {};
  const lead = el(
    'p',
    { class: 'lead' },
    'When you start the round, the service creates real testnet accounts and a group on the NEAR contract, and the employer deposits the gross pay. The room then seals the run and holds it until you approve it with your own key. It will not sign anything before that.',
  );
  if (state.step === 'run') {
    rc(
      host,
      lead,
      el('div', { class: 'presets' }, el('button', { type: 'button', class: 'paper-act primary', id: 'start-btn', onclick: startRound }, 'Start the round')),
      el('p', { class: 'hint', id: 'start-hint' }),
      state.error ? el('div', { class: 'banner bad', role: 'alert' }, sentence(state.error)) : null,
    );
    drawStartControls();
    return;
  }
  if (state.step === 'settled' || state.step === 'payslip') {
    rc(host, lead, el('p', { class: 'hint' }, 'Approved and settled. See the next steps.'));
    setVerdict('s-4', 'recomputed');
    return;
  }
  const steps = r.step === 'waiting' ? [] : PROGRESS;
  const idx = PROGRESS.findIndex(([k]) => k === r.step);
  const stage = el(
    'div',
    { class: 'stage' },
    r.step === 'waiting'
      ? el(
          'div',
          {},
          el('h3', {}, 'You are in line'),
          el(
            'p',
            { class: 'sub' },
            `Place ${r.position} in the line, about ${Math.max(1, Math.round((r.etaSeconds || 90) / 60))} minute${Math.round((r.etaSeconds || 90) / 60) > 1 ? 's' : ''}. The room runs one round at a time. You can leave this page open.`,
          ),
        )
      : el(
          'div',
          { class: 'progress', role: 'status' },
          steps.map(([k, text], i) =>
            el(
              'div',
              { class: `p ${i < idx ? 'done' : i === idx ? 'now' : ''}` },
              el('span', { class: 'mark' }, i < idx ? '✓' : i === idx ? '›' : ''),
              el('span', {}, text),
            ),
          ),
        ),
  );
  if (r.step === 'awaiting-approval') put(stage, approvePanel(d));
  rc(host, lead, stage, el('div', { class: 'presets' }, el('button', { type: 'button', class: 'paper-act warn', onclick: abandonRound }, 'Cancel the round')));
  setVerdict('s-4', 'unavailable');
}
function castPanel(cast) {
  return el(
    'section',
    { class: 'cast', 'aria-label': 'Who is in this run' },
    el('h3', {}, 'Who is in this run'),
    el(
      'div',
      { class: 'cast-rows' },
      cast.map((c) =>
        el(
          'div',
          { class: 'cast-row' },
          el('span', { class: 'role' }, c.role),
          el('span', { class: 'who' }, c.name),
          el('a', { class: 'acct mono', href: `${NB}/address/${c.id}`, target: '_blank', rel: 'noopener' }, c.id),
          el('span', { class: 'does' }, c.role === 'you' ? 'Your account, made with your key. You hold its only key.' : ''),
        ),
      ),
    ),
    el('p', { class: 'cap' }, 'The service created these accounts for your round. It deletes all of them afterwards except yours.'),
  );
}
function approvePanel(d) {
  let summary = null;
  try {
    if (!summaryCache || summaryCache.hash !== d.orderHash)
      summaryCache = { hash: d.orderHash, doc: JSON.parse(openFromModel(d.summaryCipherHex, keys.payslip.secretX25519)) };
    summary = summaryCache.doc;
  } catch {
    summary = null;
  }
  const sameHash = summary && summary.orderHash === d.orderHash;
  const toSign = approvalToSign({ contractId: CONTRACT_ID, detail: d });
  const signable = toSign.message !== null && toSign.agrees;
  const names = Object.fromEntries((d.cast || []).map((c) => [c.id, c.name]));
  return el(
    'div',
    {},
    castPanel(d.cast || []),
    summary
      ? el(
          'div',
          { class: 'moves' },
          el('p', { class: 'sub' }, 'The room sealed this summary to you. It is what you are about to approve.'),
          ...summary.allocations.map((a) =>
            el(
              'div',
              { class: `move${a.recipient === d.approver ? ' you' : ''}` },
              el('span', { class: 'who' }, names[a.recipient] || a.recipient),
              el('span', {}, `${nearOf(a.amount)} NEAR`),
            ),
          ),
          el('div', { class: 'move' }, el('span', { class: 'who' }, 'The employer is charged'), el('span', {}, `${nearOf(summary.charged)} NEAR`)),
        )
      : el('p', { class: 'sub' }, 'The summary could not be opened with your payslip key.'),
    el(
      'div',
      { class: 'checks' },
      check(sameHash ? 'recomputed' : 'failed', 'the summary has the same order hash that you are about to sign', short(d.orderHash, 12)),
      check(
        signable ? 'recomputed' : 'failed',
        'the message you sign is built here from the contract, the group, the round, the run and the order hash, and it is the same one the service sent',
        signable ? '' : "Nothing will be signed, because the service's message is not the one built here.",
      ),
    ),
    el('p', { class: 'sub' }, 'The message you sign, built in your browser:'),
    el('p', { class: 'mono sig' }, toSign.message || 'Nothing can be signed for this round.'),
    el(
      'div',
      { class: 'actions' },
      el(
        'button',
        {
          type: 'button',
          class: 'act',
          'aria-busy': approveBusy === 'own' ? 'true' : 'false',
          disabled: approveBusy || !signable,
          onclick: () => approve(d, false),
        },
        approveBusy === 'own' ? 'Sending…' : 'Approve with my key',
      ),
      el(
        'button',
        {
          type: 'button',
          class: 'act warn',
          'aria-busy': approveBusy === 'cheat' ? 'true' : 'false',
          disabled: approveBusy || !signable,
          onclick: () => approve(d, true),
        },
        approveBusy === 'cheat' ? 'Trying the other key…' : 'Try to approve with a different key',
      ),
    ),
    approveMsg ? el('div', { class: 'refusal' }, approveMsg) : null,
    cheatMsg ? el('div', { class: 'refusal' }, cheatMsg) : null,
  );
}
async function approve(d, cheat) {
  const toSign = approvalToSign({ contractId: CONTRACT_ID, detail: d });
  if (toSign.message === null || !toSign.agrees) {
    approveMsg = 'Nothing was signed, because the approval message the service sent is not the one this page builds.';
    drawRound();
    return;
  }
  approveBusy = cheat ? 'cheat' : 'own';
  drawRound();
  const who = cheat ? nearKeyPair() : keys.near;
  const r = await api('POST', `/api/rounds/${state.ticket}/approve`, {
    publicKey: who.publicKey,
    signature: signInputWithNearKey(who.secretKey, toSign.message),
  });
  approveBusy = false;
  if (cheat)
    cheatMsg =
      r.status === 200 ? 'The room accepted the other key. That should not happen.' : `The room refused it: ${sentence(r.json.error || 'no reason given')}`;
  else {
    approveMsg = r.status === 200 ? null : sentence(r.json.error || 'The approval was not accepted.');
    if (r.status === 200) cheatMsg = null;
  }
  drawRound();
}
async function abandonRound() {
  if (!state.ticket) return;
  await api('POST', `/api/rounds/${state.ticket}/abandon`);
  keys.ticket = null;
  saveKeys(keys);
  dispatch({ type: 'round-state', state: { step: 'failed', detail: { reason: 'You cancelled the round. Nothing was paid.' } } });
}

// ---- step 5: settlement ----
let settleChecks = null;
let balance = null;
async function drawSettle() {
  const host = hosts['s-5'];
  const r = state.result;
  if (!r) {
    rc(host, el('p', { class: 'hint' }, 'The settlement appears here once you have approved the run.'));
    return;
  }
  keys.accountId = r.visitorAccount;
  const names = Object.fromEntries((r.cast || []).map((c) => [c.id, c.name]));
  rc(
    host,
    el(
      'p',
      { class: 'lead' },
      'The room signed the settlement, and the contract checked the signature, the round, the recipients and the amounts before it paid. Your browser reads the transaction from two NEAR providers and checks the order hash in it.',
    ),
    el(
      'div',
      { class: 'stage' },
      el(
        'h3',
        {},
        el('a', { href: `${NB}/txns/${r.settleTx}`, target: '_blank', rel: 'noopener', style: 'color:var(--d-lake)' }, `Transaction ${short(r.settleTx, 8)}`),
        ' on ',
        el('span', { class: 'mono' }, r.contractId),
      ),
      el(
        'div',
        { class: 'moves' },
        ...r.allocations.map((a) =>
          el(
            'div',
            { class: `move${a.recipient === r.visitorAccount ? ' you' : ''}` },
            el('span', { class: 'who' }, `${names[a.recipient] || a.recipient}${a.recipient === r.visitorAccount ? ' (your account)' : ''}`),
            el('span', {}, `${nearOf(a.amount)} NEAR`),
          ),
        ),
      ),
      el('div', { class: 'checks', id: 'settle-checks' }, check('unavailable', 'asking two providers about the settlement', '')),
    ),
  );
  const row = await checkSettlementOrderHash({ rpcUrls: RPCS, txHash: r.settleTx, senderId: r.settlerId, expectedOrderHash: r.orderHash }).catch((e) => ({
    claim: 'the settlement on chain',
    verdict: 'unavailable',
    detail: String(e?.message ?? e),
  }));
  settleChecks = row;
  let bal = null;
  try {
    const res = await (
      await fetch(RPCS[0], {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'query',
          params: { request_type: 'view_account', finality: 'final', account_id: r.visitorAccount },
        }),
      })
    ).json();
    if (res.result?.amount) bal = nearOf(res.result.amount);
  } catch {
    /* shown as unavailable */
  }
  const box = $('settle-checks');
  if (box)
    rc(
      box,
      check(row.verdict, row.claim, row.detail),
      bal
        ? check(
            'recomputed',
            `your account ${r.visitorAccount} now holds ${bal} NEAR`,
            'read from the chain just now, including the 0.01 NEAR the account started with',
          )
        : check('unavailable', "your account's balance could not be read just now"),
    );
  setVerdict('s-5', worst([row.verdict]));
  host.append(
    el(
      'div',
      { class: 'presets' },
      el('button', { type: 'button', class: 'paper-act primary', onclick: () => dispatch({ type: 'show-payslip' }) }, 'Open my payslip'),
    ),
  );
}

// ---- step 6: the payslip ----
const cheat = { mode: 'own' };
async function drawPayslip() {
  const host = hosts['s-6'];
  const r = state.result;
  if (!r || state.step !== 'payslip') {
    rc(host, el('p', { class: 'hint' }, 'Your payslip opens here after the settlement.'));
    return;
  }
  const hostKey = (await api('GET', '/api/room')).json?.session?.settlePublicKey;
  const ch = await checkSettlementOrderHash({ rpcUrls: RPCS, txHash: r.settleTx, senderId: r.settlerId, expectedOrderHash: null });
  const onChain = ch.orderHash;
  const NAMES = {
    decrypts: 'opens with your own key',
    runId: 'belongs to this run',
    signature: "carries the room's signature",
    proof: "matches the order hash's root",
    orderHash: 'matches the order hash on chain',
  };
  const bump = (n) => (Number(n) + 0.01).toFixed(6).replace(/0+$/, '');
  const draw = () => {
    const args = (cipherHex, secret) => ({ cipherHex, secretX25519: secret, hostSettlePublicKey: hostKey, onChainOrderHash: onChain });
    let res;
    let label = 'Your payslip';
    if (!onChain || !hostKey) {
      rc(
        host,
        el(
          'p',
          { class: 'banner bad' },
          "The settlement or the room's key could not be read just now, so the payslip can't be checked. Please reload in a moment.",
        ),
      );
      return;
    }
    if (cheat.mode === 'own') res = verifyStatement(args(r.payslipCipherHex, keys.payslip.secretX25519));
    else if (cheat.mode === 'raise') {
      const doc = JSON.parse(openFromModel(r.payslipCipherHex, keys.payslip.secretX25519));
      doc.receipt.net = bump(doc.receipt.net);
      res = verifyStatement(args(sealToModel(JSON.stringify(doc), keys.payslip.publicKeyHex), keys.payslip.secretX25519));
      label = 'Your payslip with the net raised by 0.01';
    } else {
      res = verifyStatement(args(r.payslipCipherHex, generateClientKey().secretX25519));
      label = 'Your payslip opened with a different key';
    }
    const sealedAway = cheat.mode === 'other' && !res.receipt;
    const ok = res.ok;
    const shown = res.receipt || JSON.parse(openFromModel(r.payslipCipherHex, keys.payslip.secretX25519)).receipt;
    const row = (l, v, cls = '') => el('div', { class: `lead-row ${cls}` }, el('span', { class: 'l' }, l), el('span', { class: 'fill' }), el('span', {}, v));
    const slip = el(
      'div',
      { class: `slip ${ok ? 'ok' : 'bad'}`, role: 'img', 'aria-label': `${label}: ${ok ? 'verified' : 'does not verify'}` },
      el('div', { class: 'hd' }, el('span', {}, 'Payslip'), el('span', {}, `No. ${short(leafHash(shown), 4)}`)),
      el('div', { class: 'stamp' }, ok ? 'VERIFIED' : 'DOES NOT VERIFY'),
      el('div', { class: 'who' }, shown.person),
      sealedAway
        ? el('p', { class: 'away' }, 'Sealed to your payslip key. It does not open with a different key, so none of it can be read.')
        : [
            row('Run', r.runId),
            row('Period', shown.period),
            row('Gross', shown.gross),
            row('Tax', shown.tax),
            row('Benefits', shown.benefits),
            row('Net', cheat.mode === 'raise' ? `${shown.net} → ${bump(shown.net)}` : shown.net, 'total'),
          ],
      el('div', { class: 'meta2' }, el('span', {}, `Signed by the room ${short(hostKey, 6)}`), el('span', {}, `Order hash ${short(onChain, 8)}`)),
    );
    rc(
      host,
      el(
        'p',
        { class: 'lead' },
        "Your payslip is sealed to your payslip key. It has to open with that key, carry the room's signature, and match the order hash that the contract recorded. You can then try to cheat, using the buttons below the checks.",
      ),
      el(
        'div',
        { class: 'stage' },
        el(
          'div',
          { class: 'receipt' },
          slip,
          el(
            'div',
            {},
            el('p', { class: `say ${ok ? 'good' : 'badtxt'}` }, `${label}: ${ok ? 'every check passes.' : 'it does not verify.'}`),
            el(
              'div',
              { class: 'checks' },
              Object.entries(res.checks).map(([k, v]) => check(v ? 'recomputed' : 'failed', NAMES[k] || k)),
            ),
            el(
              'div',
              { class: 'actions' },
              el(
                'button',
                {
                  type: 'button',
                  class: 'act',
                  onclick: () => {
                    cheat.mode = 'own';
                    draw();
                  },
                },
                'Check my payslip',
              ),
              el(
                'button',
                {
                  type: 'button',
                  class: 'act warn',
                  onclick: () => {
                    cheat.mode = 'raise';
                    draw();
                  },
                },
                'Raise my net pay',
              ),
              el(
                'button',
                {
                  type: 'button',
                  class: 'act warn',
                  onclick: () => {
                    cheat.mode = 'other';
                    draw();
                  },
                },
                'Open it with a different key',
              ),
            ),
          ),
        ),
      ),
      el(
        'div',
        { class: 'presets' },
        el(
          'button',
          {
            type: 'button',
            class: 'paper-act',
            onclick: () => {
              keys = makeKeys();
              dispatch({ type: 'restart' });
              window.scrollTo(0, 0);
            },
          },
          'Start another run with new keys',
        ),
      ),
    );
    setVerdict('s-6', cheat.mode === 'own' ? (ok ? 'recomputed' : 'failed') : verdicts['s-6'] || 'recomputed');
  };
  draw();
}

function drawAll() {
  drawKeys();
  drawRun();
  drawReview();
  drawRound();
  drawSettle();
  drawPayslip();
}

// ---- start ----
skeleton();
drawRail();
drawAll();
refreshStatus();
if (API) {
  api('GET', '/api/warm');
  setInterval(refreshStatus, 5000);
  if (keys.ticket)
    api('GET', `/api/rounds/${keys.ticket}`).then((r) => {
      if (r.status === 200 && !['done', 'failed', 'expired'].includes(r.json.step)) {
        dispatch({ type: 'round-started', ticket: keys.ticket });
        poll();
      } else if (r.status === 200 && r.json.step === 'done') {
        dispatch({ type: 'round-started', ticket: keys.ticket });
        dispatch({ type: 'round-state', state: r.json });
        keys.ticket = null;
        saveKeys(keys);
      } else {
        keys.ticket = null;
        saveKeys(keys);
      }
    });
}
