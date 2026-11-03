// Midge site motion. Everything here is progressive: without JS, or with reduced motion,
// the page shows its final state.
(() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v) => Math.max(0, Math.min(1, v));
  document.documentElement.classList.add('js');

  // ---------- Swarm plate (the brand's one bright moment) ----------
  const DOTS = [[233.4,388.8,1.81,.28],[378,238.3,2.02,.64],[359.7,194.4,1.99,.56],[309.5,261.1,2.24,.95],[302.5,343.3,1.38,.52],[265.4,252.3,2.19,.95],[256.1,241.8,2.02,.82],[383.3,290.6,1.37,.64],[348.4,181.6,1.31,.55],[214.9,214.7,2.08,.54],[332.9,311.3,1.91,.93],[255.7,377,2.26,.29],[250.8,334.3,2.09,.69],[296.5,346,1.54,.57],[347.8,258.8,1.96,.75],[217.8,234.6,1.73,.67],[143.5,158.2,1.27,.28],[225.3,250.6,2.1,.85],[313.6,280.4,1.8,.95],[232.6,246.7,2.22,.76],[305.1,291.9,1.79,.92],[184.8,305,2.04,.52],[279.1,214.9,1.46,.74],[360,286.9,2.07,.93],[215.1,183.1,2.18,.6],[401.8,352.3,2.15,.41],[437.8,292.6,1.58,.62],[343.6,228.7,1.81,.69],[335.1,236.2,2.05,.75],[254.5,261.8,2.03,.81],[250.4,309.7,1.22,.75],[174.6,296.1,1.44,.44],[274.8,338.3,1.54,.53],[388.8,297.2,1.7,.62],[206.3,274.7,1.73,.68],[311.9,273.4,1.48,.95],[416.4,269.5,1.68,.61],[135.1,144.5,1.57,.28],[416.9,152.1,2.14,.28],[277.6,285.1,1.95,.95],[343.5,270.5,1.99,.93],[182.1,344.4,1.71,.29],[333.2,266.3,1.28,.86],[252.2,249.8,2.07,.84],[227.7,342.5,2.16,.46],[257.6,265,2.19,.81],[259,347.8,1.95,.67],[331.8,304.1,2.25,.91],[212,282.2,1.9,.72],[370.2,199.4,1.24,.39],[310.5,264.6,1.48,.95],[247,297.3,2.19,.8],[210.8,314.9,1.87,.55],[327.5,215.3,1.33,.77],[312.1,287.1,1.1,.87],[137.3,132.7,2.34,.28],[309.8,243.8,1.78,.91],[289.3,274.4,1.61,.95],[294.2,287.9,1.16,.95],[426.1,296,2.34,.44],[298,265.9,2.02,.95],[296.2,267.2,1.58,.95],[254.3,245,2.29,.81],[330,228.5,2.23,.81],[297.9,251.2,2.25,.95],[190.5,282.7,2.19,.7],[467.6,325.1,1.24,.28],[216.5,245.4,1.08,.82],[293.7,279.8,1.47,.95],[321.8,215.1,1.22,.85],[302,284.4,1.31,.95],[371.7,445.2,1.8,.28],[211.6,222.2,1.9,.64],[437.9,326.4,1.07,.52],[268.5,275.3,1.12,.76],[328.3,295.3,1.89,.88],[363.4,312.2,1.09,.66],[408.8,336.7,2.29,.55],[414.9,295.8,1.91,.69],[297.5,202.1,1.11,.72],[315.1,327.8,2.12,.73],[338.8,284.6,2.08,.83],[174.8,380.9,1.19,.28],[295.1,270.7,2.1,.95],[264.2,400.6,2.11,.31],[345.8,339.4,1.8,.72],[336.4,290.7,2.14,.87],[133.2,321.4,1.51,.33],[342,274.7,1.06,.87],[199.2,294.2,1.35,.57],[172.1,228.3,1.99,.51],[474.3,332.8,1.86,.38],[272.5,263.1,1.04,.86],[278.5,255.8,2.28,.95],[110.1,170.9,1.59,.28],[199.6,272,1.28,.69],[384,172.6,1.49,.28],[372.8,307.5,1.95,.75],[421.9,298,1.37,.5],[451.1,254.1,2.03,.5]];
  const swarm = $('#swarm');
  if (swarm) {
    const NS = 'http://www.w3.org/2000/svg';
    const frag = document.createDocumentFragment();
    for (const [x, y, r, o] of DOTS) {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', r); c.setAttribute('fill-opacity', o);
      frag.appendChild(c);
    }
    swarm.appendChild(frag);
  }

  // ---------- Headlines split into characters (Thayon-style reveal) ----------
  const splits = $$('[data-split]').map((el) => {
    const text = el.textContent.trim().replace(/\s+/g, ' ');
    el.setAttribute('aria-label', text);
    el.textContent = '';
    for (const word of text.split(' ')) {
      const w = document.createElement('span');
      w.className = 'w';
      w.setAttribute('aria-hidden', 'true');
      for (const ch of word) {
        const c = document.createElement('span');
        c.className = 'c';
        c.textContent = ch;
        w.appendChild(c);
      }
      el.appendChild(w);
      el.appendChild(document.createTextNode(' '));
    }
    return { el, chars: $$('.c', el), last: -1, intro: el.hasAttribute('data-intro') };
  });
  const paintChars = (s, p) => {
    if (Math.abs(p - s.last) < 0.004) return;
    s.last = p;
    const n = s.chars.length;
    s.chars.forEach((c, i) => {
      const k = clamp((p - (0.7 * i) / Math.max(1, n)) / 0.3);
      if (k >= 1) { c.style.opacity = ''; c.style.transform = ''; c.style.filter = ''; return; }
      c.style.opacity = k.toFixed(3);
      c.style.transform = `translateY(${((1 - k) * 10).toFixed(2)}px)`;
      c.style.filter = `blur(${((1 - k) * 10).toFixed(2)}px)`;
    });
  };

  // ---------- Decode (HIFI-style) for data values ----------
  const GLYPHS = ['▒', '▀', '░'];
  const decoders = $$('[data-decode]').map((el) => ({ el, text: el.textContent, start: 0, done: false }));

  // ---------- Header: rolling section label, theme per section ----------
  const header = $('.site-header');
  const labelList = $('.labels');
  const labelItems = $$('.labels li');
  const sections = $$('main section[data-label]');
  let active = -1;
  const setActive = (i) => {
    if (i === active) return;
    active = i;
    labelItems.forEach((li, k) => li.classList.toggle('on', k === i));
    labelList.style.transform = `translateY(${-i * 22}px)`;
    header.classList.toggle('is-dusk', sections[i] && sections[i].dataset.theme === 'dusk');
  };

  // ---------- Facilities: horizontal track pinned on wide screens ----------
  const fac = $('#facilities');
  const track = $('#track');
  const cards = $$('.fcard');
  let pinned = false;
  let trackOver = 0;
  const layoutFacilities = () => {
    const want = !reduce && window.innerWidth > 900;
    fac.classList.toggle('is-pinned', want);
    pinned = want;
    if (pinned) {
      trackOver = Math.max(0, track.scrollWidth - window.innerWidth + 32);
      fac.style.height = `${window.innerHeight + trackOver}px`;
    } else {
      fac.style.height = '';
      track.style.transform = '';
    }
  };
  const drawIn = (root, r) => {
    for (const p of $$('.draw', root)) p.style.strokeDashoffset = (100 * (1 - r)).toFixed(1);
    for (const f of $$('.fade', root)) f.style.opacity = r.toFixed(3);
  };

  // ---------- Reveals ----------
  const reveals = $$('.reveal');
  const band = $('#band');
  const bandL = $('.band-l');
  const bandR = $('.band-r');
  const guar = $('#guarantees');
  const exitPath = $('#exit-path');
  const exitDot = $('#exit-dot');
  const exitL1 = $('#exit-l1');
  const exitL2 = $('#exit-l2');
  const exitStatus = $('#exit-status');
  const arch = $('.arch-figure');
  const wordmark = $('#wordmark text');
  const q = (a, b, c, t) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * c;
  const setExit = (p) => {
    if (!exitPath) return;
    exitPath.setAttribute('stroke-dashoffset', (156 * (1 - p)).toFixed(1));
    exitDot.setAttribute('cx', q(472.3, 536, 596, p).toFixed(1));
    exitDot.setAttribute('cy', q(220.3, 190, 132, p).toFixed(1));
    exitDot.setAttribute('fill', p > 0.02 ? '#d9824a' : '#e9ece8');
    const done = p > 0.95;
    exitL1.setAttribute('opacity', done ? 1 : 0);
    exitL2.setAttribute('opacity', done ? 1 : 0);
    exitStatus.textContent = done ? 'a member has left, alone' : 'after the timeout, alone';
    exitStatus.classList.toggle('left', done);
  };

  const onScroll = () => {
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    // active section
    const probe = 64 + vh * 0.35;
    let a = 0;
    sections.forEach((s, i) => { if (s.getBoundingClientRect().top <= probe) a = i; });
    setActive(a);
    if (reduce) return;
    // headline waves
    for (const s of splits) {
      if (s.intro) continue;
      const top = s.el.getBoundingClientRect().top;
      paintChars(s, clamp((vh * 0.92 - top) / (vh * 0.4)));
    }
    // fade-ups
    for (const el of reveals) if (!el.classList.contains('in') && el.getBoundingClientRect().top < vh * 0.88) el.classList.add('in');
    // decoders
    for (const d of decoders) if (!d.start && d.el.getBoundingClientRect().top < vh * 0.9) d.start = performance.now();
    // facilities track
    if (pinned) {
      const r = fac.getBoundingClientRect();
      const p = clamp((64 - r.top) / Math.max(1, trackOver));
      const x = -p * trackOver;
      track.style.transform = `translateX(${x.toFixed(1)}px)`;
    }
    for (const c of cards) {
      const r = c.getBoundingClientRect();
      const k = pinned ? clamp((vw * 0.95 - r.left) / (vw * 0.45)) : clamp((vh * 0.95 - r.top) / (vh * 0.5));
      drawIn(c, k);
    }
    // architecture diagram
    if (arch) drawIn(arch, clamp((vh * 0.9 - arch.getBoundingClientRect().top) / (vh * 0.6)));
    // opposite-side statement
    if (band) {
      const k = clamp((vh * 0.95 - band.getBoundingClientRect().top) / (vh * 0.5));
      bandL.style.transform = `translateX(${(-96 * (1 - k)).toFixed(1)}px)`;
      bandR.style.transform = `translateX(${(96 * (1 - k)).toFixed(1)}px)`;
      bandL.style.opacity = bandR.style.opacity = k.toFixed(3);
    }
    // a member leaves the swarm
    if (guar) {
      const r = guar.getBoundingClientRect();
      setExit(clamp((vh - (r.top + r.height * 0.45)) / (r.height * 0.45)));
    }
    // footer wordmark outline
    if (wordmark) {
      const k = clamp((vh - wordmark.getBoundingClientRect().top) / (vh * 0.6));
      wordmark.style.strokeDashoffset = (2600 * (1 - k)).toFixed(0);
    }
  };

  // ---------- The mark: breathes, disperses with scroll speed, rejoins ----------
  const BASE = [[22, 31], [30, 25], [28, 37], [18, 41], [35, 32], [24, 20], [13, 31]];
  const CENTER = [24.29, 31];
  const dots = BASE.map((_, i) => document.getElementById(`d${i}`));
  const exitMark = document.getElementById('d7');
  let vel = 0; let spread = 0; let lastY = window.scrollY; let lastT = performance.now();
  const intro = splits.find((s) => s.intro);
  const introItems = $$('.intro-item');
  const t0 = performance.now();

  const frame = (ts) => {
    // breathing and dispersal
    vel *= 0.9;
    spread += (Math.min(1, vel / 2.2) - spread) * 0.12;
    const breath = 0.06 * Math.sin((ts / 4800) * Math.PI * 2);
    const k = breath + spread * 0.9;
    for (let i = 0; i < 7; i++) {
      const [bx, by] = BASE[i];
      const a = i * 0.9 + 0.3 + ts / 900;
      const j = spread * 5;
      dots[i].setAttribute('cx', (bx + (bx - CENTER[0]) * k + Math.cos(a) * j).toFixed(2));
      dots[i].setAttribute('cy', (by + (by - CENTER[1]) * k + Math.sin(a) * j).toFixed(2));
    }
    exitMark.setAttribute('r', (3 * (1 + breath * 0.6)).toFixed(2));
    // hero intro on load
    const since = ts - t0;
    if (intro && since < 2400) paintChars(intro, clamp(since / 1400));
    // decoding values
    for (const d of decoders) {
      if (!d.start || d.done) continue;
      const e = ts - d.start;
      const out = Array.from(d.text).map((ch, i) => (e > 150 + i * 24 || ch === ' ' ? ch : GLYPHS[(i + Math.floor(ts / 70)) % 3])).join('');
      d.el.textContent = out;
      if (out === d.text) d.done = true;
    }
    requestAnimationFrame(frame);
  };

  window.addEventListener('scroll', () => {
    const t = performance.now();
    vel = Math.max(vel, Math.abs(window.scrollY - lastY) / Math.max(1, t - lastT));
    lastY = window.scrollY; lastT = t;
    requestAnimationFrame(onScroll);
  }, { passive: true });
  window.addEventListener('resize', () => { layoutFacilities(); onScroll(); });

  layoutFacilities();
  if (reduce) {
    reveals.forEach((el) => el.classList.add('in'));
    introItems.forEach((el) => el.classList.add('in'));
    setExit(1);
  } else {
    introItems.forEach((el, i) => setTimeout(() => el.classList.add('in'), 700 + i * 90));
    requestAnimationFrame(frame);
  }
  onScroll();

  // ---------- Live check: fetch NEAR AI Cloud attestation in this browser ----------
  const LIVE_MODEL = 'Qwen/Qwen3.6-35B-A3B-FP8';
  const toHex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
  const fromHex = (h) => Uint8Array.from(h.match(/../g) || [], (x) => parseInt(x, 16));
  const short = (s, n = 12) => (s && s.length > n * 2 + 1 ? `${s.slice(0, n)}…${s.slice(-6)}` : s || '');
  const lpList = $('#lp-list');
  const lpNote = $('#lp-note');
  const lpRun = $('#lp-run');
  const lpReplay = $('#lp-replay');
  const addRow = (ok, label, detail) => {
    const li = document.createElement('li');
    const pip = document.createElement('span');
    pip.className = `pip ${ok ? 'on' : 'fail'}`;
    const body = document.createElement('span');
    body.textContent = label;
    const state = document.createElement('span');
    state.className = `lp-state${ok ? '' : ' fail'}`;
    state.textContent = ok ? 'Pass' : 'Fail';
    li.append(pip, body, state);
    if (detail) { const d = document.createElement('span'); d.className = 'lp-detail'; d.textContent = detail; body.appendChild(d); }
    lpList.appendChild(li);
  };
  const quoteChecks = (who, att, expectedNonce) => {
    const q = fromHex(att.intel_quote || '');
    const version = q.length > 8 ? q[0] | (q[1] << 8) : 0;
    const keyType = q.length > 8 ? q[2] | (q[3] << 8) : 0;
    const tee = q.length > 8 ? (q[4] | (q[5] << 8) | (q[6] << 16) | (q[7] << 24)) >>> 0 : 0;
    addRow(q.length >= 636 && version === 4 && keyType === 2 && tee === 0x81, `${who} quote is an Intel TDX v4 quote`, `${q.length} bytes, version ${version}, TEE type 0x${tee.toString(16)}`);
    const rd = q.length >= 632 ? toHex(q.subarray(568, 632)) : '';
    const signer = String(att.signing_address || '').replace(/^0x/i, '').toLowerCase();
    const signerOk = rd.slice(0, 40) === signer && signer.length === 40;
    const nonceOk = rd.slice(64, 128) === expectedNonce;
    addRow(att.request_nonce === expectedNonce, `${who} answered with the expected nonce`, `reported ${short(att.request_nonce, 8)}`);
    addRow(signerOk && nonceOk, `${who} signing key and the nonce are inside the quote`, `${signerOk ? 'key matches' : 'key differs'}, ${nonceOk ? 'nonce matches' : 'nonce differs'}`);
  };
  const liveCheck = async (replay) => {
    lpRun.disabled = lpReplay.disabled = true;
    lpList.textContent = '';
    lpNote.textContent = 'Asking NEAR AI Cloud for attestation…';
    try {
      const nonce = toHex(crypto.getRandomValues(new Uint8Array(32)));
      addRow(true, 'Browser chose a random nonce', short(nonce, 12));
      const res = await fetch(`https://cloud-api.near.ai/v1/attestation/report?model=${encodeURIComponent(LIVE_MODEL)}&signing_algo=ecdsa&nonce=${nonce}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`NEAR AI Cloud answered ${res.status}`);
      const report = await res.json();
      const gw = report.gateway_attestation;
      const model = (report.model_attestations || [])[0];
      if (!gw || !model) throw new Error('The report had no gateway or model attestation');
      // Replay test: judge the same report against a nonce it was not issued for.
      const expected = replay ? toHex(crypto.getRandomValues(new Uint8Array(32))) : nonce;
      quoteChecks('Gateway', gw, expected);
      quoteChecks('Model', model, expected);
      addRow(model.model_name === LIVE_MODEL, 'Attestation is for the model we asked about', model.model_name);
      const tcb = gw.info && gw.info.tcb_info;
      const fails = $$('.lp-state.fail', lpList).length;
      lpNote.textContent = (replay ? 'Wrong-nonce test: this report was issued for one nonce and checked against another, as a replayed report would be. ' : '')
        + (fails ? `${fails} check${fails > 1 ? 's' : ''} failed, so this report would be rejected. ` : 'Every check on this page passed. ')
        + `Gateway runs ${(gw.info && gw.info.app_name) || 'a confidential VM'}, compose hash ${short(tcb && tcb.compose_hash, 10)}. `
        + 'Not checked on this page: the Intel certificate chain and TCB status, the NVIDIA GPU evidence, and response signatures. The repository verifier checks the Intel chain and signatures, and the recorded results below come from it.';
      live.textContent = fails ? 'Live check finished with failures' : 'Live check passed';
    } catch (err) {
      lpNote.textContent = `Could not complete the live check from this browser: ${err.message}. The recorded results below still apply.`;
    } finally {
      lpRun.disabled = lpReplay.disabled = false;
    }
  };
  lpRun.addEventListener('click', () => liveCheck(false));
  lpReplay.addEventListener('click', () => liveCheck(true));

  // ---------- Verification: replay and copy ----------
  const live = $('#live');
  const rows = $$('.checks tbody tr');
  const replay = $('#replay');
  let timers = [];
  replay.addEventListener('click', () => {
    timers.forEach(clearTimeout); timers = [];
    replay.textContent = 'Checking';
    rows.forEach((tr) => { $('.pip', tr).classList.remove('on'); $('td[data-done]', tr).textContent = 'Waiting'; });
    rows.forEach((tr, i) => {
      timers.push(setTimeout(() => {
        if (rows[i + 1]) $('td[data-done]', rows[i + 1]).textContent = 'Checking';
        $('.pip', tr).classList.add('on');
        const cell = $('td[data-done]', tr);
        cell.textContent = cell.dataset.done;
        if (i === rows.length - 1) { replay.textContent = 'Run again'; live.textContent = 'All five checks passed'; }
      }, 420 * (i + 1)));
    });
  });
  for (const b of $$('button.copy')) {
    b.addEventListener('click', async () => {
      const original = b.dataset.label || b.textContent;
      b.dataset.label = original;
      try { await navigator.clipboard.writeText(b.dataset.copy); } catch (e) { /* clipboard may be blocked */ }
      b.textContent = 'Copied';
      live.textContent = 'Copied to clipboard';
      setTimeout(() => { b.textContent = original; }, 1200);
    });
  }
})();
