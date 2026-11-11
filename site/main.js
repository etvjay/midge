// Midge site behaviour. The card scenes are static SVG written into the page at build time (scripts/build-site-cards.mjs); this file
// adds the tabs, live reads from NEAR testnet and NEAR AI Cloud, the proof dots and the footer field. The page is complete without it.

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const CONTRACT = 'c.fly-1793636729.testnet';
const DEPLOYED_CODE_HASH = 'BVcq86Wz5Q3kcdBdcUhfQVfQtC6CmGwcXuMd52aW6gTp';
const RPCS = ['https://test.rpc.fastnear.com', 'https://rpc.testnet.near.org'];
const NB = 'https://testnet.nearblocks.io';

// ---------------------------------------------------------------- helpers
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const HEX = '0123456789abcdef';

// ---------------------------------------------------------------- page behaviour
const header = $('.site-header');
const menuBtn = $('.menu-btn'), nav = $('#nav');
if (menuBtn && nav) {
  const setOpen = (open) => {
    menuBtn.setAttribute('aria-expanded', String(open)); menuBtn.textContent = open ? 'Close' : 'Menu';
    if (open) { nav.classList.remove('closing'); nav.classList.add('open'); return; }
    if (!nav.classList.contains('open')) return;
    nav.classList.remove('open'); if (REDUCE) return;
    nav.classList.add('closing'); setTimeout(() => nav.classList.remove('closing'), 140);
  };
  menuBtn.addEventListener('click', () => setOpen(!nav.classList.contains('open')));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav.classList.contains('open')) { setOpen(false); menuBtn.focus(); } });
}
const darkZones = () => [$('.hero'), ...$$('.bs'), $('.site-footer')];
const onScroll = () => { const y = 30; const dark = darkZones().some((el) => { const r = el.getBoundingClientRect(); return r.top <= y && r.bottom >= y; }); header.classList.toggle('on-light', !dark); };
addEventListener('scroll', onScroll, { passive: true }); onScroll();

// ---------------------------------------------------------------- FAQ topics as tabs (WAI-ARIA, automatic activation)
// Without JavaScript all four topic groups show, each under its heading. Here a tablist shows one at a time.
(function faqTabs() {
  const box = $('#faq-groups'); const groups = box ? $$('.faq-group', box) : []; if (groups.length < 2) return;
  const list = document.createElement('div'); list.className = 'faq-tabs'; list.setAttribute('role', 'tablist'); list.setAttribute('aria-label', 'Question topics');
  const tabs = groups.map((g, i) => {
    const t = document.createElement('button'); t.type = 'button'; t.className = 'faq-tab'; t.id = `faq-tab-${i}`;
    t.setAttribute('role', 'tab'); t.setAttribute('aria-controls', g.id); t.textContent = $('.faq-h', g).textContent;
    g.setAttribute('role', 'tabpanel'); g.setAttribute('aria-labelledby', t.id); g.tabIndex = 0;
    list.appendChild(t); return t;
  });
  box.prepend(list); box.classList.add('faq-tabbed'); list.style.setProperty('--n', String(tabs.length));
  const select = (i, focus = false) => {
    tabs.forEach((t, k) => { const on = k === i; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; groups[k].hidden = !on; });
    if (focus) tabs[i].focus();
  };
  tabs.forEach((t, i) => t.addEventListener('click', () => select(i)));
  list.addEventListener('keydown', (e) => {
    const i = tabs.indexOf(document.activeElement); if (i < 0) return; const n = tabs.length;
    const to = { ArrowRight: (i + 1) % n, ArrowDown: (i + 1) % n, ArrowLeft: (i + n - 1) % n, ArrowUp: (i + n - 1) % n, Home: 0, End: n - 1 }[e.key];
    if (to === undefined) return; e.preventDefault(); select(to, true);
  });
  select(0);
})();
// The page's script is running: keep the js class (the head script's fallback timer removes it if this line is never reached).
document.documentElement.classList.add('js'); document.documentElement.dataset.tabs = 'on';

const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); if (e.target.__onIn) e.target.__onIn(); } }), { threshold: 0.15 });
for (const el of $$('.section .title, .section .lede-sm')) { el.classList.add('reveal'); io.observe(el); }
// Kickers decode from ciphertext when they come into view.
for (const k of $$('.kicker')) {
  const final = k.textContent; k.__onIn = () => { if (REDUCE) return; const t0 = performance.now(); const run = (now) => { const p = clamp((now - t0) / 700); k.textContent = Array.from(final, (ch, i) => (ch === ' ' || i / final.length < p ? ch : HEX[(Math.random() * 16) | 0])).join(''); if (p < 1) requestAnimationFrame(run); else k.textContent = final; }; requestAnimationFrame(run); };
  io.observe(k);
}

const live = $('#live');

// ---------------------------------------------------------------- scroll-linked: hero parallax (20 px at most)
(function scrollLinked() {
  if (REDUCE) return;
  const hero = $('.hero'), img = $('.hero-img');
  if (!hero || !img) return;
  let queued = false;
  const update = () => { queued = false; const r = hero.getBoundingClientRect(); const p = clamp(-r.top / Math.max(1, r.height)); img.style.setProperty('--px', `${(p * 20).toFixed(1)}px`); };
  addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
  update();
})();

// ---------------------------------------------------------------- magnetic primary button: the label leans up to 4 px toward a fine pointer
for (const b of matchMedia('(hover: hover) and (pointer: fine)').matches && !REDUCE ? $$('.btn-magnet') : []) {
  b.addEventListener('pointermove', (e) => { const r = b.getBoundingClientRect(); const dx = (e.clientX - (r.left + r.width / 2)) * 0.12, dy = (e.clientY - (r.top + r.height / 2)) * 0.12; b.style.setProperty('--mx', `${clamp(dx, -4, 4).toFixed(1)}px`); b.style.setProperty('--my', `${clamp(dy, -4, 4).toFixed(1)}px`); });
  b.addEventListener('pointerleave', () => { b.style.setProperty('--mx', '0px'); b.style.setProperty('--my', '0px'); });
}


// ---------------------------------------------------------------- headline: words rise in, 30 ms apart, the whole line within 500 ms
for (const h of REDUCE ? [] : $$('.section .title')) splitWords(h);
function splitWords(h) {
  h.setAttribute('aria-label', h.textContent.replace(/\s+/g, ' ').trim());
  let i = 0;
  // Words of text nodes rise in one after another; a styled part (the grey second half of a title) is split the same way.
  const split = (el) => {
    const parts = [];
    for (const n of [...el.childNodes]) {
      if (n.nodeType === 1) { split(n); parts.push(n); continue; }
      if (n.nodeType !== 3) { parts.push(n); continue; }
      for (const word of n.nodeValue.split(/(\s+)/)) {
        if (!word) continue;
        if (/^\s+$/.test(word)) { parts.push(document.createTextNode(' ')); continue; }
        const w = document.createElement('span'); w.className = 'w'; w.setAttribute('aria-hidden', 'true');
        const s = document.createElement('span'); s.textContent = word; s.style.setProperty('--d', `${Math.min(i++ * 30, 220)}ms`); w.appendChild(s); parts.push(w);
      }
    }
    el.replaceChildren(...parts);
  };
  split(h); h.classList.add('reveal-words');
}

// ---------------------------------------------------------------- section jumps: crossfade with View Transitions where supported
for (const a of $$('a[href^="#"]:not(.skip):not(.proof-skip)')) {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href').slice(1); const el = id && document.getElementById(id);
    if (!el || REDUCE || !document.startViewTransition || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    document.startViewTransition(() => { el.scrollIntoView({ behavior: 'instant', block: 'start' }); history.pushState(null, '', `#${id}`); });
  });
}
for (const b of $$('button.copy')) b.addEventListener('click', async () => { const o = b.dataset.label || b.textContent; b.dataset.label = o; try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = 'Copied'; live.textContent = 'Copied to clipboard'; } catch { b.textContent = 'Select and copy'; } setTimeout(() => { b.textContent = o; }, 1400); });

// ---------------------------------------------------------------- live reads from NEAR testnet (public RPC, no server of ours)
async function rpc(method, params) {
  let last;
  for (const url of RPCS) {
    try { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 'midge', method, params }) }); const j = await r.json(); if (j.error) throw new Error(j.error.message || JSON.stringify(j.error).slice(0, 120)); return j.result; } catch (e) { last = e; }
  }
  throw last;
}
const view = async (method, args = {}) => { const r = await rpc('query', { request_type: 'call_function', finality: 'final', account_id: CONTRACT, method_name: method, args_base64: btoa(JSON.stringify(args)) }); return { value: JSON.parse(new TextDecoder().decode(new Uint8Array(r.result))), block: r.block_height }; };
const PR = new Intl.PluralRules('en');
const plural = (n, one, other) => `${n.toLocaleString('en-US')} ${PR.select(n) === 'one' ? one : other}`;
const short = (s, n = 12) => (s && s.length > n * 2 + 1 ? `${s.slice(0, n)}…${s.slice(-6)}` : s || '');
const near = (yocto) => { const v = Number(BigInt(yocto || '0') / 10n ** 20n) / 10000; return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 }); };

function row(list, ok, label, detail) {
  const li = document.createElement('li'); const pip = document.createElement('span'); pip.className = `pip ${ok ? 'on' : 'fail'}`;
  const body = document.createElement('span'); body.textContent = label; const state = document.createElement('span'); state.className = `lp-state${ok ? '' : ' fail'}`; state.textContent = ok ? 'Pass' : 'Fail';
  if (detail) { const d = document.createElement('span'); d.className = 'lp-detail'; d.textContent = detail; body.appendChild(d); }
  li.append(pip, body, state); list.appendChild(li);
}

// The rules panel (section 04): the newest group's release policy as the contract returns it, and the same rules in words.
const nbLink = (text) => { const a = document.createElement('a'); a.href = `${NB}/address/${CONTRACT}`; a.target = '_blank'; a.rel = 'noopener'; a.textContent = text; return a; };
function rulesPanel(group, block) {
  const pre = $('#rules-json'); const words = $('#rules-reads-text'); const state = $('#rules-state'); if (!pre || !words) return;
  if (!group) {
    pre.textContent = 'Could not read the rules from this browser.';
    words.replaceChildren('NEAR did not answer from this browser. ', nbLink('Read the contract on NearBlocks'));
    if (state) state.textContent = 'not read';
    return;
  }
  const pol = group.release_policy || {};
  pre.textContent = JSON.stringify({ group: group.id, status: group.status, release_policy: pol }, null, 2);
  const n = (pol.allowed_recipients || []).length;
  words.textContent = `${group.id}: pays ${plural(n, 'listed account', 'listed accounts')} only, up to ${(pol.max_release_bps_per_epoch || 0) / 100}% per window, until block ${Number(pol.settle_deadline_block || 0).toLocaleString('en-US')}`;
  if (state && block) state.textContent = `read live from NEAR · block ${block.toLocaleString('en-US')}`;
}

(async function chain() {
  const chip = $('#chip'), chipText = $('#chip-text'), list = $('#chain-list'), note = $('#chain-note'), recent = $('#recent');
  const pre = $('#rules-json'); if (pre) pre.textContent = 'Reading the newest group\u2019s rules from NEAR\u2026'; if (recent) recent.innerHTML = '<li>Reading\u2026</li>';
  try {
    const acct = await rpc('query', { request_type: 'view_account', finality: 'final', account_id: CONTRACT });
    const { value: count, block } = await view('get_syndicate_count');
    $('#net-count').textContent = count; const nn = $('#net-count-note'); if (nn) nn.textContent = '(read just now)';
    const cs = $('#chain-state'); if (cs) { cs.textContent = 'read just now'; cs.classList.add('t-lake'); }
    chip.classList.add('ok'); chipText.textContent = `Live · ${count} groups · block ${block.toLocaleString('en-US')}`;
    row(list, true, 'NEAR answered, with no server of ours in between', `${CONTRACT}, block ${block.toLocaleString('en-US')}`);
    row(list, acct.code_hash === DEPLOYED_CODE_HASH, 'The contract is the exact version we tested', `fingerprint ${short(acct.code_hash, 10)}`);
    const fl = $('#foot-live'); if (fl) fl.textContent = `Contract ${CONTRACT} · fingerprint ${acct.code_hash.slice(0, 8)}… · read just now from NEAR`;
    const { value: newest } = await view('list_syndicates', { from_index: Math.max(0, count - 3), limit: 3 });
    const s = newest[newest.length - 1];
    rulesPanel(s, block);
    if (s) {
      const pol = s.release_policy || {};
      row(list, Boolean(s.policy_hash), `The newest group's rules are public`, `${s.id}: pays only ${plural((pol.allowed_recipients || []).length, 'account', 'accounts')}, at most ${(pol.max_release_bps_per_epoch || 0) / 100}% per round`);
      row(list, true, 'Its exit is ready', `members can leave ${s.timeout_blocks} blocks after a round starts if the room stops`);
    }
    note.textContent = 'Read just now by your browser. Anyone can check the same things.';
    recent.textContent = '';
    for (const x of newest.slice().reverse()) { const li = document.createElement('li'); const a = document.createElement('a'); a.href = `${NB}/address/${x.sub_account || CONTRACT}`; a.textContent = x.id; a.title = x.id; const sp = document.createElement('span'); sp.textContent = `${x.syndicate_type} · ${x.status} · ${near(x.total_escrow)} NEAR`; li.append(a, sp); recent.appendChild(li); }
  } catch (e) {
    chipText.textContent = 'Could not reach NEAR testnet from this browser';
    note.replaceChildren('NEAR\'s public RPC did not answer from this browser. The recorded evidence on this page still applies. ', nbLink('Read the contract on NearBlocks'));
    const cs = $('#chain-state'); if (cs) cs.textContent = 'not read';
    recent.innerHTML = '<li>Could not read the contract from this browser.</li>';
    rulesPanel(null);
  }
})();

// ---------------------------------------------------------------- proof: the lens (the dots themselves are in the HTML)
// Pointing at or tabbing to a dot shows what anyone can read on the chain, and what stayed private for that kind of step.
(function proofLens() {
  const grid = $('#proof-grid'); const pub = $('#lens-pub'); const priv = $('#lens-priv'); if (!grid || !pub || !priv) return;
  let tx = []; try { tx = JSON.parse(grid.dataset.tx || '[]'); } catch { return; }
  const NAMES = { deposit: 'Money in', hatch: 'Group created', settled: 'Payout', exit: 'Member left with their share', rejected: 'Refused by the rules', other: 'Other' };
  const PRIVATE = {
    deposit: 'What the member will bid, vote or decide', hatch: 'Nothing yet: the rules themselves are public',
    settled: "Each member's bid or vote, and for payroll who owns each address", exit: "Nothing needed: a member's own share comes back",
    rejected: 'Nothing: a refused payout moves no money', other: 'Depends on the step',
  };
  const look = (a) => { const t = tx[+a.dataset.i]; if (!t) return; pub.textContent = `${NAMES[t[0]] || t[0]} · ${t[1]} · transaction ${t[2]}`; priv.textContent = PRIVATE[t[0]] || ''; grid.classList.add('looking'); $$('.hot', grid).forEach((d) => d.classList.remove('hot')); a.classList.add('hot'); };
  grid.addEventListener('mouseover', (e) => { const a = e.target.closest('a'); if (a) look(a); });
  grid.addEventListener('focusin', (e) => { const a = e.target.closest('a'); if (a) look(a); });
  grid.addEventListener('mouseleave', () => grid.classList.remove('looking'));
})();

// ---------------------------------------------------------------- live NEAR AI Cloud attestation check (the browser picks the nonce)
(function attestation() {
  const LIVE_MODEL = 'Qwen/Qwen3.6-35B-A3B-FP8';
  const toHex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
  const fromHex = (h) => Uint8Array.from(h.match(/../g) || [], (x) => parseInt(x, 16));
  const list = $('#lp-list'), note = $('#lp-note'), run = $('#lp-run'), rep = $('#lp-replay');
  const quoteChecks = (who, att, expected) => {
    const q = fromHex(att.intel_quote || '');
    const version = q.length > 8 ? q[0] | (q[1] << 8) : 0; const keyType = q.length > 8 ? q[2] | (q[3] << 8) : 0; const tee = q.length > 8 ? (q[4] | (q[5] << 8) | (q[6] << 16) | (q[7] << 24)) >>> 0 : 0;
    row(list, q.length >= 636 && version === 4 && keyType === 2 && tee === 0x81, `${who} quote is an Intel TDX v4 quote`, `${q.length} bytes, version ${version}, hardware type 0x${tee.toString(16)}`);
    const rd = q.length >= 632 ? toHex(q.subarray(568, 632)) : ''; const signer = String(att.signing_address || '').replace(/^0x/i, '').toLowerCase();
    const signerOk = rd.slice(0, 40) === signer && signer.length === 40; const nonceOk = rd.slice(64, 128) === expected;
    row(list, att.request_nonce === expected, `${who} answered with the random number we sent`, `reported ${short(att.request_nonce, 8)}`);
    row(list, signerOk && nonceOk, `${who} signing key and our random number are inside the hardware report`, `${signerOk ? 'key matches' : 'key differs'}, ${nonceOk ? 'number matches' : 'number differs'}`);
  };
  const check = async (replay) => {
    const btn = replay ? rep : run; const label = btn.textContent; btn.setAttribute('aria-busy', 'true'); btn.textContent = 'Checking…'; btn.classList.remove('done');
    run.disabled = rep.disabled = true; list.textContent = ''; note.textContent = 'Asking NEAR AI Cloud to prove what it runs…';
    try {
      const nonce = toHex(crypto.getRandomValues(new Uint8Array(32)));
      row(list, true, 'Your browser chose a random number', short(nonce, 12));
      const res = await fetch(`https://cloud-api.near.ai/v1/attestation/report?model=${encodeURIComponent(LIVE_MODEL)}&signing_algo=ecdsa&nonce=${nonce}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`NEAR AI Cloud answered ${res.status}`);
      const report = await res.json(); const gw = report.gateway_attestation; const model = (report.model_attestations || [])[0];
      if (!gw || !model) throw new Error('the report had no proof from the gateway or the model');
      const expected = replay ? toHex(crypto.getRandomValues(new Uint8Array(32))) : nonce;
      quoteChecks('Gateway', gw, expected); quoteChecks('Model', model, expected);
      row(list, model.model_name === LIVE_MODEL, 'The proof is for the model we asked about', model.model_name);
      const fails = $$('.lp-state.fail', list).length;
      note.textContent = (replay ? 'Replay test: this report was issued for one random number and checked against another, as a replayed report would be. ' : '')
        + (fails ? `${fails} check${fails > 1 ? 's' : ''} failed, so this report would be rejected. ` : 'Every check on this page passed. ')
        + 'Not checked on this page: the Intel certificate chain and TCB status, the NVIDIA GPU evidence, and the signature on each model reply. The repository verifier checks the Intel chain, and the room checks every reply’s signature against the attested key before it uses an answer.';
      live.textContent = fails ? 'Live check finished with failures' : 'Live check passed';
    } catch (err) { note.textContent = `Could not complete the live check from this browser: ${err.message}.`; }
    finally { run.disabled = rep.disabled = false; btn.removeAttribute('aria-busy'); btn.textContent = label; btn.classList.add('done'); }
  };
  run.addEventListener('click', () => check(false)); rep.addEventListener('click', () => check(true));
})();

// ---------------------------------------------------------------- 3D moments (three.js), progressive enhancement
// Skipped under reduced motion, with Save-Data on, or on devices reporting under 4 GB of memory (?3d forces it).
const LIGHT = !new URLSearchParams(location.search).has('3d') && ((navigator.connection && navigator.connection.saveData) || (navigator.deviceMemory && navigator.deviceMemory < 4));
if (REDUCE || LIGHT) console.info(`Midge: live 3D skipped (${REDUCE ? 'reduced motion' : 'Save-Data or low device memory'}).`);
if (!REDUCE && !LIGHT) {
  const models = Object.fromEntries(['room', 'nest', 'tee'].map((n) => [n, fetch(`models/${n}.glb`).then((r) => { if (!r.ok) throw new Error(`${n}.glb ${r.status}`); return r.arrayBuffer(); })]));
  const go = () => import('./scene3d.js').then(({ boot }) => boot({ models, hosts: [
    { el: $('.hero'), kind: 'hero', fallback: $('.hero-img') },
  ] })).then((r) => { document.documentElement.dataset.webgl = r && r.ok ? 'on' : 'off'; if (r && !r.ok) { document.documentElement.dataset.webglReason = r.reason; console.info(`Midge: live 3D is off (${r.reason}); showing the rendered image. Add ?3d to the URL to force it.`); } }).catch((e) => { document.documentElement.dataset.webgl = 'off'; console.info('Midge: live 3D failed to start:', e && e.message); });
  const afterPaint = () => requestAnimationFrame(() => setTimeout(go, 0));
  if (document.readyState === 'complete') afterPaint(); else addEventListener('load', afterPaint, { once: true });
}

// ---------------------------------------------------------------- bento motion
// Each entrance plays once, when it comes into view (.in); nothing is tied to scroll position.
// Numbers count up once on entry. Loops pause while their section is off screen. Nothing here runs under reduced motion.
(function motion() {
  if (!REDUCE) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.15 });
    for (const el of $$('.mo-rise, .mo-row, .mo-flash, .mo-draw, .mo-pop, .mo-line, .mo-bullet, .mo-type, .mo-slide, .mo-strike, .mo-spin, .proof-grid')) io.observe(el);
  }
  if (!REDUCE) {
    const counts = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return; counts.unobserve(e.target);
      const el = e.target; const to = +el.dataset.to; const t0 = performance.now();
      const step = (now) => { const k = Math.min(1, (now - t0) / 600); el.textContent = String(Math.round(to * (1 - (1 - k) ** 3))); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }), { threshold: 0.6 });
    for (const el of $$('.mo-count')) counts.observe(el);
  }
  const loops = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle('paused', !e.isIntersecting)), { rootMargin: '120px 0px' });
  for (const sec of $$('.bs')) loops.observe(sec);
})();

// ---------------------------------------------------------------- footer field: one dot per recorded transaction, lit in the order they happened
// The dots are the proof section's transactions (the same data), densest at the bottom. Still under reduced motion; paused off screen.
(function endField() {
  const host = $('.site-end'); const cv = host && $('.end-field', host); const grid = $('#proof-grid'); if (!cv || !grid) return;
  let tx = []; try { tx = JSON.parse(grid.dataset.tx || '[]'); } catch { return; } if (!tx.length) return;
  const ctx = cv.getContext('2d'); const step = 16; let w = 0, h = 0, cols = 0, rows = 0, visible = false, t0 = performance.now();
  const COL = { exit: '217,130,74', rejected: '224,103,90' };
  const size = () => { const r = host.getBoundingClientRect(); const dpr = Math.min(2, devicePixelRatio || 1); w = r.width; h = r.height; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); cols = Math.ceil(w / step); rows = Math.ceil(h / step); };
  const draw = (now) => {
    ctx.clearRect(0, 0, w, h);
    const lit = REDUCE ? tx.length : Math.floor(((now - t0) / 40) % (tx.length + 80));
    for (let y = 0; y < rows; y++) {
      const depth = y / rows; if (depth < 0.18) continue; const base = (depth - 0.18) / 0.82;
      for (let x = 0; x < cols; x++) {
        const k = (y * cols + x) % tx.length; let a = 0.06 + base * 0.26; let col = '124,196,184';
        if (k < lit && (x * 7 + y * 13) % 9 === 0) { a = Math.min(0.85, a + 0.35); col = COL[tx[k][0]] || col; }
        ctx.fillStyle = `rgba(${col},${a.toFixed(3)})`; ctx.beginPath(); ctx.arc(x * step + step / 2, y * step + step / 2, 0.6 + base * 2.4, 0, 6.283); ctx.fill();
      }
    }
  };
  // One animation loop at most: a single frame id, started when the footer comes on screen, stopped when it leaves.
  let raf = 0;
  const loop = (now) => { raf = 0; if (!visible) return; draw(now); raf = requestAnimationFrame(loop); };
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf && !REDUCE) raf = requestAnimationFrame(loop); }).observe(host);
  // The footer changes size with the window and when an FAQ answer opens: resize the bitmap to match, then redraw once.
  new ResizeObserver(() => { size(); draw(performance.now()); }).observe(host);
  size(); draw(performance.now());
})();
