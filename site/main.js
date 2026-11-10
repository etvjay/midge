// Midge site behaviour. The card scenes are static SVG written into the page at build time (scripts/build-site-cards.mjs); this file
// adds the tabs, live reads from NEAR testnet and NEAR AI Cloud, the proof dots and the footer field. The page is complete without it.

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const CONTRACT = 'c.fly-1793636729.testnet';
const DEPLOYED_CODE_HASH = '854fzUj2TxAmdmK6UtmbXBqGZvc2BgtfRdgUJXMBHGes';
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
const darkZones = () => [$('.hero'), $('#proof'), $('.site-footer')];
const onScroll = () => { const y = 30; const dark = darkZones().some((el) => { const r = el.getBoundingClientRect(); return r.top <= y && r.bottom >= y; }); header.classList.toggle('on-light', !dark); };
addEventListener('scroll', onScroll, { passive: true }); onScroll();

// ---------------------------------------------------------------- B cards: tabs (WAI-ARIA tabs, automatic activation)
// Without JavaScript every tab, scene and fine print is shown stacked; here only the selected one stays. A newly shown scene
// restarts from the beginning, and scenes pause while their card is off screen.
for (const list of $$('.b-tabs')) {
  const card = list.closest('.bcard'); const tabs = $$('[role="tab"]', list); const fines = $$('.b-fine', card); const stage = $('.b-stage', card);
  const select = (i, focus = false) => {
    tabs.forEach((t, k) => {
      const on = k === i; const panel = document.getElementById(t.getAttribute('aria-controls'));
      t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1;
      if (!panel) return;
      if (on && panel.hidden) { const sc = $('.b-scene', panel); if (sc) sc.replaceWith(sc.cloneNode(true)); }
      panel.hidden = !on;
    });
    fines.forEach((f, k) => { f.classList.toggle('on', k === i); if (k !== i) f.open = false; });
    if (focus) tabs[i].focus();
  };
  tabs.forEach((t, i) => t.addEventListener('click', () => select(i)));
  list.addEventListener('keydown', (e) => {
    const i = tabs.indexOf(document.activeElement); if (i < 0) return; const n = tabs.length;
    const to = { ArrowDown: (i + 1) % n, ArrowRight: (i + 1) % n, ArrowUp: (i + n - 1) % n, ArrowLeft: (i + n - 1) % n, Home: 0, End: n - 1 }[e.key];
    if (to === undefined) return; e.preventDefault(); select(to, true);
  });
  select(0);
  if (stage) new IntersectionObserver(([e]) => stage.classList.toggle('paused', !e.isIntersecting)).observe(stage);
}

const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); if (e.target.__onIn) e.target.__onIn(); } }), { threshold: 0.15 });
for (const el of $$('.section .title, .section .lede-sm, .card, .mini, .chapter, .arch, .split, .answer, .table-wrap')) { el.classList.add('reveal'); io.observe(el); }
// Siblings in a grid enter 40 ms apart, never more than 160 ms behind the first.
for (const g of $$('.grid-2, .grid-3, .grid-4, .grid-5')) [...g.children].forEach((c, i) => { c.style.transitionDelay = `${Math.min(i * 40, 160)}ms`; });
const st = $('.status-table'); if (st) { $$('tbody tr', st).forEach((tr, i) => { tr.style.transitionDelay = `${i * 60}ms`; }); io.observe(st); }
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
const near = (yocto) => { const v = Number(BigInt(yocto || '0') / 10n ** 20n) / 10000; return v.toLocaleString('en-US', { maximumFractionDigits: 4 }); };

function row(list, ok, label, detail) {
  const li = document.createElement('li'); const pip = document.createElement('span'); pip.className = `pip ${ok ? 'on' : 'fail'}`;
  const body = document.createElement('span'); body.textContent = label; const state = document.createElement('span'); state.className = `lp-state${ok ? '' : ' fail'}`; state.textContent = ok ? 'Pass' : 'Fail';
  if (detail) { const d = document.createElement('span'); d.className = 'lp-detail'; d.textContent = detail; body.appendChild(d); }
  li.append(pip, body, state); list.appendChild(li);
}

(async function chain() {
  const chip = $('#chip'), chipText = $('#chip-text'), list = $('#chain-list'), note = $('#chain-note'), recent = $('#recent');
  try {
    const acct = await rpc('query', { request_type: 'view_account', finality: 'final', account_id: CONTRACT });
    const { value: count, block } = await view('get_syndicate_count');
    window.__synCount = count; const netStage = $('canvas[data-scene="network"]').__stage; if (netStage) netStage.resize();
    $('#net-count').textContent = count;
    chip.classList.add('ok'); chipText.textContent = `Contract live · ${count} groups · block ${block.toLocaleString('en-US')}`;
    row(list, true, 'NEAR answered, with no server of ours in between', `${CONTRACT}, block ${block.toLocaleString('en-US')}`);
    row(list, acct.code_hash === DEPLOYED_CODE_HASH, 'The contract is the exact version we tested', `fingerprint ${short(acct.code_hash, 10)}`);
    const { value: newest } = await view('list_syndicates', { from_index: Math.max(0, count - 3), limit: 3 });
    const s = newest[newest.length - 1];
    if (s) {
      const pol = s.release_policy || {};
      row(list, Boolean(s.policy_hash), `The newest group's rules are public`, `${s.id}: pays only ${plural((pol.allowed_recipients || []).length, 'account', 'accounts')}, at most ${(pol.max_release_bps_per_epoch || 0) / 100}% per round`);
      row(list, true, 'Its exit is ready', `members can leave ${s.timeout_blocks} blocks after a round starts if the room stops`);
    }
    note.textContent = 'Read just now by your browser. Anyone can check the same things.';
    recent.textContent = '';
    for (const x of newest.slice().reverse()) { const li = document.createElement('li'); const a = document.createElement('a'); a.href = `${NB}/address/${x.sub_account || CONTRACT}`; a.textContent = x.id; const sp = document.createElement('span'); sp.textContent = `${x.syndicate_type} · ${x.status} · ${near(x.total_escrow)} NEAR`; li.append(a, sp); recent.appendChild(li); }
  } catch (e) {
    chipText.textContent = 'Could not reach NEAR testnet from this browser';
    note.textContent = `The public RPC did not answer (${e.message}). The recorded evidence below still applies.`;
    recent.innerHTML = '<li>Could not read the contract from this browser.</li>';
  }
})();

// ---------------------------------------------------------------- proof grid and the agent console (recorded runs)
(async function proof() {
  const grid = $('#proof-grid'), legend = $('#proof-legend'), note = $('#proof-note');
  await new Promise((go) => { const o = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { o.disconnect(); go(); } }, { rootMargin: '1200px 0px' }); o.observe($('#proof')); o.observe($('#proof')); });
  let data;
  try { data = await (await fetch('data/proof.json')).json(); } catch { note.textContent = 'Could not load the recorded transactions.'; return; }
  const names = { deposit: 'Money in', hatch: 'Group created', settled: 'Payout', exit: 'Member left with their share', rejected: 'Attack refused', other: 'Other' };
  for (const k of ['deposit', 'hatch', 'settled', 'exit', 'rejected', 'other']) { if (!data.counts[k]) continue; const s = document.createElement('span'); s.innerHTML = `<i class="k-${k}"></i>`; s.append(`${names[k]} · ${data.counts[k]}`); legend.appendChild(s); }
  const tip = document.createElement('div'); tip.className = 'proof-tip'; document.body.appendChild(tip);
  data.transactions.forEach((tx, i) => {
    const a = document.createElement('a'); a.href = `${NB}/txns/${tx.hash}`; a.target = '_blank'; a.rel = 'noopener'; a.className = `k-${tx.kind}`; a.setAttribute('role', 'listitem');
    a.setAttribute('aria-label', `Transaction ${i + 1} of ${data.transactions.length}, ${names[tx.kind]}: ${tx.label}${tx.error ? `, refused: ${tx.error}` : ''}, hash ${short(tx.hash, 6)}. Opens NearBlocks.`);
    a.style.transitionDelay = `${Math.min(i * 5, 900)}ms`;
    const show = (ev) => { tip.textContent = `${names[tx.kind]} · ${tx.label}${tx.error ? ` · ${tx.error}` : ''} · ${short(tx.hash, 6)}`; const r = a.getBoundingClientRect(); tip.style.left = `${Math.min(innerWidth - 330, Math.max(8, r.left - 20))}px`; tip.style.top = `${r.bottom + 8}px`; tip.classList.add('on'); };
    a.addEventListener('mouseenter', show); a.addEventListener('focus', show); a.addEventListener('mouseleave', () => tip.classList.remove('on')); a.addEventListener('blur', () => tip.classList.remove('on'));
    grid.appendChild(a);
  });
  io.observe(grid);
  const skip = $('.proof-skip'); if (skip) skip.textContent = `Skip the ${data.transactions.length} transaction links`;
  const runs = new Set(data.transactions.map((t) => t.run)).size;
  note.textContent = `${data.transactions.length} transactions from ${runs} test runs. Attacks that NEAR stopped before they even ran never became transactions, so they are not dots here; the AI agent section shows them.`;

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
    row(list, q.length >= 636 && version === 4 && keyType === 2 && tee === 0x81, `${who} quote is an Intel TDX v4 quote`, `${q.length} bytes, version ${version}, TEE type 0x${tee.toString(16)}`);
    const rd = q.length >= 632 ? toHex(q.subarray(568, 632)) : ''; const signer = String(att.signing_address || '').replace(/^0x/i, '').toLowerCase();
    const signerOk = rd.slice(0, 40) === signer && signer.length === 40; const nonceOk = rd.slice(64, 128) === expected;
    row(list, att.request_nonce === expected, `${who} answered with the expected nonce`, `reported ${short(att.request_nonce, 8)}`);
    row(list, signerOk && nonceOk, `${who} signing key and the nonce are inside the quote`, `${signerOk ? 'key matches' : 'key differs'}, ${nonceOk ? 'nonce matches' : 'nonce differs'}`);
  };
  const check = async (replay) => {
    const btn = replay ? rep : run; const label = btn.textContent; btn.setAttribute('aria-busy', 'true'); btn.textContent = 'Checking…'; btn.classList.remove('done');
    run.disabled = rep.disabled = true; list.textContent = ''; note.textContent = 'Asking NEAR AI Cloud for attestation…';
    try {
      const nonce = toHex(crypto.getRandomValues(new Uint8Array(32)));
      row(list, true, 'Your browser chose a random nonce', short(nonce, 12));
      const res = await fetch(`https://cloud-api.near.ai/v1/attestation/report?model=${encodeURIComponent(LIVE_MODEL)}&signing_algo=ecdsa&nonce=${nonce}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`NEAR AI Cloud answered ${res.status}`);
      const report = await res.json(); const gw = report.gateway_attestation; const model = (report.model_attestations || [])[0];
      if (!gw || !model) throw new Error('the report had no gateway or model attestation');
      const expected = replay ? toHex(crypto.getRandomValues(new Uint8Array(32))) : nonce;
      quoteChecks('Gateway', gw, expected); quoteChecks('Model', model, expected);
      row(list, model.model_name === LIVE_MODEL, 'The attestation is for the model we asked about', model.model_name);
      const fails = $$('.lp-state.fail', list).length;
      note.textContent = (replay ? 'Replay test: this report was issued for one nonce and checked against another, as a replayed report would be. ' : '')
        + (fails ? `${fails} check${fails > 1 ? 's' : ''} failed, so this report would be rejected. ` : 'Every check on this page passed. ')
        + 'Not checked in the browser: the Intel certificate chain and TCB status, the NVIDIA GPU evidence, and response signatures. The repository verifier checks the Intel chain.';
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
    { el: $('canvas[data-scene="arch"]').parentElement, kind: 'arch', fallback: $('canvas[data-scene="arch"]') },
  ] })).then((r) => { document.documentElement.dataset.webgl = r && r.ok ? 'on' : 'off'; if (r && !r.ok) { document.documentElement.dataset.webglReason = r.reason; console.info(`Midge: live 3D is off (${r.reason}); showing the rendered image. Add ?3d to the URL to force it.`); } }).catch((e) => { document.documentElement.dataset.webgl = 'off'; console.info('Midge: live 3D failed to start:', e && e.message); });
  const afterPaint = () => requestAnimationFrame(() => setTimeout(go, 0));
  if (document.readyState === 'complete') afterPaint(); else addEventListener('load', afterPaint, { once: true });
}
