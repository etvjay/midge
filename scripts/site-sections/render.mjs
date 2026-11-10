/**
 * The landing page's sections after the hero, rendered to static HTML (plan 2026-11-10-site-bento-direction). Pure: content
 * (HOME), checked figures and the recorded proof in, HTML out. Everything a visitor needs is in the markup; main.js only adds
 * the live reads, the FAQ tabs, the lens and the motion triggers. Motion classes (mo-*) are listed in docs/DESIGN_SYSTEM.md §6.
 */
import { HOME } from './content.mjs';
import { esc, plainTx, BANNED } from '../site-scenes/kit.mjs';

const NB = 'https://testnet.nearblocks.io';
const CODE_NAMES = /\b(Roost|Nest|flyers?|hatch|settle_batch|hatch_out)\b/;
const tone = (t) => (t ? ` t-${t}` : '');
const ext = (href) => (href.startsWith('#') ? '' : ' target="_blank" rel="noopener"');

/** Fill {figureKey} tokens with their recorded values, then escape. */
const filler = (F) => (s) => esc(String(s).replace(/\{([a-zA-Z]+)\}/g, (_, k) => { if (!F[k]) throw new Error(`unknown figure {${k}}`); return F[k].value; }));

const head = (id, s, f) => `
    <div class="bs-head">
      <div>
        <p class="kicker">${f(s.kicker)}</p>
        <h2 id="${id}-title" class="title">${f(s.title)}${s.soft ? ` <span class="soft">${f(s.soft)}</span>` : ''}</h2>
      </div>${s.lede ? `\n      <p class="bs-lede">${f(s.lede)}</p>` : ''}
    </div>`;

/** A number that counts up on entry; the final value is the static text. */
const countUp = (v) => { const m = String(v).match(/^(\d+)(.*)$/); return m ? `<span class="mo-count" data-to="${m[1]}">${m[1]}</span>${esc(m[2])}` : esc(v); };

// ------------------------------------------------------------------ 01 the problem
function problem(F, f) {
  const p = HOME.problem;
  const rows = p.public.book.map((b, i) => `<div class="book-row ${b.watcher ? 'is-watcher mo-flash' : 'mo-row'}" style="--i: ${i}"><span>${esc(b.who)}</span><span class="num">${esc(b.bid)}</span><span class="dim">${esc(b.when)}</span></div>`).join('');
  const figs = p.public.figs.map((x) => `<div class="tile"><p class="fig${tone(x.tone)}">${countUp(F[x.fig].value)}</p><p class="cap">${f(x.label)}</p></div>`).join('');
  const backers = F.organizerBackers.quote.match(/0\.0\d/g).map((v, i) => {
    const y = 4 + i * 32; const cy = y + 12; const d = `M96 ${cy} C 150 ${cy}, 150 66, 196 66`;
    return `<rect x="0" y="${y}" width="96" height="24" rx="6" class="dg-box"/><text x="10" y="${y + 16}" class="dg-mono">Backer ${i + 1} ${v}</text><path d="${d}" class="dg-line-glow"/><circle r="3.5" class="dg-dot-glow mo-tr" style="offset-path: path('${d}'); animation-delay: ${i * 0.18}s"/>`;
  }).join('');
  const total = F.organizerBackers.quote.match(/\((\d\.\d\d) in all\)/)[1];
  // Phone variants: stacked, 300 units wide, so 12-unit labels stay at 11 px or more on a 390 px screen.
  const nBackers = F.organizerBackers.quote.match(/0\.0\d/g).map((v, i) => {
    const x = (i % 2) * 156; const y = Math.floor(i / 2) * 36; const d = `M${x + 72} ${y + 28} C ${x + 72} 96, 150 80, 150 104`;
    return `<rect x="${x}" y="${y}" width="144" height="28" rx="6" class="dg-box"/><text x="${x + 10}" y="${y + 19}" class="dg-mono">Backer ${i + 1} ${v}</text><path d="${d}" class="dg-line-glow"/><circle r="3.5" class="dg-dot-glow mo-tr" style="offset-path: path('${d}'); animation-delay: ${i * 0.18}s"/>`;
  }).join('');
  const orgNarrow = `<svg class="dg dg-narrow" viewBox="0 0 300 236" role="img" aria-label="${f(p.organizer.aria)}">${nBackers}
          <rect x="80" y="104" width="140" height="44" rx="10" class="dg-box dg-box-glow"/><text x="94" y="122" class="dg-sans">The organizer</text><text x="94" y="139" class="dg-mono dim">holds ${total}</text>
          <path d="M150 148 L150 196" class="dg-line-deny dashed"/><circle r="4" class="dg-dot-deny mo-tr2" style="offset-path: path('M150 148 L150 196')"/>
          <rect x="100" y="196" width="100" height="32" rx="8" class="dg-box-deny"/><text x="116" y="217" class="dg-mono t-deny">its pick</text></svg>`;
  const boxNarrow = `<svg class="dg dg-narrow" viewBox="0 0 300 236" role="img" aria-label="A pot goes into secure hardware that signs any payout; one goes to a member, one to a thief">
          <rect x="100" y="0" width="100" height="30" rx="8" class="dg-box"/><text x="118" y="20" class="dg-mono">the pot</text>
          <path d="M150 30 V 64" class="dg-line"/><circle r="4" class="dg-dot mo-tr" style="offset-path: path('M150 30 L150 64')"/>
          <rect x="70" y="64" width="160" height="72" rx="12" class="dg-chip"/>
          <text x="86" y="96" class="dg-sans">Secure hardware</text><text x="86" y="116" class="dg-mono dim">signs any payout</text>
          <path d="M120 136 C 120 168, 70 168, 70 196" class="dg-line"/><path d="M180 136 C 180 168, 230 168, 230 196" class="dg-line-deny"/>
          <circle r="4" class="dg-dot mo-tr2" style="offset-path: path('M120 136 C 120 168, 70 168, 70 196')"/><circle r="4" class="dg-dot-deny mo-tr2" style="offset-path: path('M180 136 C 180 168, 230 168, 230 196'); animation-delay: 0.3s"/>
          <rect x="10" y="196" width="120" height="32" rx="8" class="dg-box"/><text x="24" y="217" class="dg-mono">a member</text>
          <rect x="170" y="196" width="120" height="32" rx="8" class="dg-box-deny"/><text x="186" y="217" class="dg-mono t-deny">a thief</text></svg>`;
  const pins = Array.from({ length: 5 }, (_, i) => `<rect class="mo-blink dg-pin" x="${186 + i * 22}" y="26" width="6" height="2"/><rect class="mo-blink dg-pin" x="${186 + i * 22}" y="104" width="6" height="2"/>`).join('');
  const cmpHead = ['', ...p.compare.cols].map((c, i) => `<span class="th${i === 3 ? ' t-lake' : ''}">${esc(c)}</span>`).join('');
  const cmpRows = p.compare.rows.map((r, i) => `<span class="td k mo-rise" style="--i: ${i}">${f(r.k)}</span>${r.cells.map((c) => `<span class="td mo-rise${tone(c.tone)}" style="--i: ${i}">${f(c.t)}</span>`).join('')}`).join('');
  return `
<section class="section bs" id="problem" aria-labelledby="problem-title">
  <div class="wrap">${head('problem', p, f)}
    <div class="bento">
      <article class="bc s3 r2">
        <div class="bc-row"><p class="bc-label">${f(p.public.label)}</p><p class="bc-label">example amounts</p></div>
        <div class="panel-ink">
          <div class="panel-head"><span>public bid book</span><span><i class="dot t-deny"></i>visible to everyone</span></div>
          <div class="book">${rows}</div>
          <p class="panel-foot t-deny">${f(p.public.bookNote)}</p>
        </div>
        <h3 class="bc-title">${f(p.public.title)}</h3>
        <div class="tiles-2">${figs}</div>
      </article>
      <article class="bc s3">
        <p class="bc-label">${f(p.organizer.label)}</p>
        <svg class="dg dg-wide" viewBox="0 0 460 132" role="img" aria-label="${f(p.organizer.aria)}">${backers}
          <rect x="196" y="46" width="112" height="40" rx="10" class="dg-box dg-box-glow"/><text x="210" y="63" class="dg-sans">The organizer</text><text x="210" y="78" class="dg-mono dim">holds ${total}</text>
          <path d="M308 66 L384 66" class="dg-line-deny dashed"/><circle r="4" class="dg-dot-deny mo-tr2" style="offset-path: path('M308 66 L384 66')"/>
          <rect x="384" y="50" width="76" height="32" rx="8" class="dg-box-deny"/><text x="394" y="70" class="dg-mono t-deny">its pick</text>
        </svg>
        ${orgNarrow}
        <h3 class="bc-title">${f(p.organizer.title)}</h3>
        <p class="chips">${p.organizer.chips.map((c) => `<span class="chip"><b class="t-deny">${esc(F[c.fig].value)}</b> ${f(c.text)}</span>`).join('')}</p>
      </article>
      <article class="bc s3">
        <p class="bc-label">${f(p.blackbox.label)}</p>
        <svg class="dg dg-wide" viewBox="0 0 460 132" role="img" aria-label="A pot goes into secure hardware that signs any payout; one goes to a member, one to a thief">
          <rect x="0" y="50" width="92" height="32" rx="8" class="dg-box"/><text x="12" y="70" class="dg-mono">the pot</text>
          <path d="M92 66 H 168" class="dg-line"/><circle r="4" class="dg-dot mo-tr" style="offset-path: path('M92 66 L168 66')"/>
          <rect x="168" y="30" width="124" height="72" rx="12" class="dg-chip"/>${pins}
          <text x="182" y="62" class="dg-sans">Secure hardware</text><text x="182" y="80" class="dg-mono dim">signs any payout</text>
          <path d="M292 52 C 330 52, 330 26, 368 26" class="dg-line"/><path d="M292 80 C 330 80, 330 106, 368 106" class="dg-line-deny"/>
          <circle r="4" class="dg-dot mo-tr2" style="offset-path: path('M292 52 C 330 52, 330 26, 368 26')"/><circle r="4" class="dg-dot-deny mo-tr2" style="offset-path: path('M292 80 C 330 80, 330 106, 368 106'); animation-delay: 0.3s"/>
          <rect x="368" y="12" width="92" height="28" rx="8" class="dg-box"/><text x="378" y="30" class="dg-mono">a member</text>
          <rect x="368" y="92" width="92" height="28" rx="8" class="dg-box-deny"/><text x="378" y="110" class="dg-mono t-deny">a thief</text>
        </svg>
        ${boxNarrow}
        <h3 class="bc-title">${f(p.blackbox.title)}</h3>
        <p class="bc-text">${f(p.blackbox.body)}</p>
      </article>
      <article class="bc bc-ink s4 flush">
        <div class="panel-head"><span>${f(p.compare.caption)}</span><span>${esc(p.compare.source)}</span></div>
        <div class="tbl-wrap"><div class="tbl tbl-4" role="table" aria-label="${f(p.compare.caption)}">${cmpHead}${cmpRows}</div></div>
      </article>
      <article class="bc bc-raised s2">
        <p class="bc-label">${f(p.keeps.label)}</p>
        <ul class="keeps">${p.keeps.items.map((k) => `<li><i class="dot t-${k.tone}"></i>${f(k.t)}</li>`).join('')}</ul>
        <a class="btn btn-light btn-sm bc-cta" href="${p.keeps.cta.href}">${f(p.keeps.cta.t)}</a>
      </article>
    </div>
  </div>
</section>`;
}

// ------------------------------------------------------------------ 02 how it works (the engine)
function engine(f) {
  const e = HOME.engine;
  return `
<section class="section bs" id="how" aria-labelledby="how-title">
  <div class="wrap">${head('how', e, f)}
    <div class="bento">
      <article class="bc s3 r2">
        <p class="bc-label">${f(e.room.label)}</p>
        <svg class="dg dg-center" viewBox="0 0 280 280" width="280" height="280" aria-hidden="true">
          <circle class="mo-draw dg-line" pathLength="1" cx="140" cy="140" r="112"/><circle cx="140" cy="140" r="72" class="dg-line-faint dashed"/>
          <circle cx="140" cy="28" r="10" class="dg-node"/><circle cx="252" cy="140" r="10" class="dg-node"/><circle cx="140" cy="252" r="10" class="dg-node"/><circle cx="28" cy="140" r="10" class="dg-node"/>
          <circle r="4" class="dg-dot-lake mo-tr" style="offset-path: path('M140 38 L140 114')"/><circle r="4" class="dg-dot-lake mo-tr" style="offset-path: path('M242 140 L166 140'); animation-delay: 0.25s"/>
          <circle r="4" class="dg-dot-lake mo-tr" style="offset-path: path('M140 242 L140 166'); animation-delay: 0.5s"/><circle r="4" class="dg-dot-lake mo-tr" style="offset-path: path('M38 140 L114 140'); animation-delay: 0.75s"/>
          <g class="mo-pulse"><g class="mo-pop"><rect x="114" y="114" width="52" height="52" rx="12" class="dg-tile"/><rect x="131" y="137" width="18" height="14" rx="2" class="dg-tile-ink"/><path d="M134 137v-5a6 6 0 0 1 12 0v5" class="dg-tile-stroke"/></g></g>
        </svg>
        <h3 class="bc-title bc-title-lg">${f(e.room.title)}</h3>
        <p class="bc-text">${f(e.room.body)}</p>
      </article>
      <article class="bc s3">
        <p class="bc-label">${f(e.rules.label)}</p>
        <svg class="dg" viewBox="0 0 420 56" aria-hidden="true">
          <line class="mo-draw dg-line" pathLength="1" x1="24" y1="28" x2="396" y2="28"/>
          <circle r="4" class="dg-dot-lake mo-tr" style="offset-path: path('M42 28 L192 28')"/><circle r="4" class="dg-dot-lake mo-tr2" style="offset-path: path('M228 28 L378 28')"/>
          <circle cx="24" cy="28" r="16" class="dg-node"/><path d="M17 35c1-5 13-5 14 0M24 27a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" class="dg-stroke"/>
          <circle cx="210" cy="28" r="16" class="dg-node dg-node-lake"/><path class="mo-tick dg-tick" pathLength="1" d="M203 28l5 5 9-9"/>
          <circle cx="396" cy="28" r="16" class="dg-node"/><path d="M388 36h16M389 33v-8M396 33v-8M403 33v-8M387 24l9-6 9 6" class="dg-stroke"/>
        </svg>
        <p class="bc-text bc-end">${f(e.rules.body)}</p>
      </article>
      <article class="bc s2">
        <p class="bc-label">${f(e.payout.label)}</p>
        <svg class="dg dg-small" viewBox="0 0 140 90" width="140" height="90" aria-hidden="true">
          <path class="mo-draw dg-line" pathLength="1" d="M14 14h80a22 22 0 0 1 0 44H46a16 16 0 0 0 0 32h80"/>
          <circle r="3.5" class="dg-dot-lake mo-tr" style="offset-path: path('M14 14h80a22 22 0 0 1 0 44H46a16 16 0 0 0 0 32h80')"/>
          <circle cx="14" cy="14" r="7" class="dg-node"/><circle cx="14" cy="14" r="2.5" class="dg-fill-lake"/>
        </svg>
        <p class="bc-text bc-end">${f(e.payout.body)}</p>
      </article>
      <article class="bc bc-raised s1">
        <p class="bc-label">${f(e.exit.label)}</p>
        <svg class="dg dg-small" viewBox="0 0 72 72" width="72" height="72" aria-hidden="true">
          <circle cx="32" cy="36" r="26" class="dg-line"/><path d="M32 36h36" class="dg-stroke"/><circle cx="66" cy="36" r="4" class="dg-fill-glow"/><circle cx="32" cy="36" r="3" class="dg-fill"/>
          <circle r="3" class="dg-fill-glow mo-tr2" style="offset-path: path('M32 36 L66 36')"/>
        </svg>
        <p class="bc-text bc-end">${f(e.exit.body)}</p>
      </article>
    </div>
  </div>
</section>`;
}

// ------------------------------------------------------------------ 03 who uses it (frosted tiles over the light band)
function uses(f) {
  const u = HOME.uses;
  return `
<section class="section bs" id="who" aria-labelledby="who-title">
  <div class="wrap">
    <div class="band-panel">
      <div class="band mo-drift" aria-hidden="true"></div><div class="band-lines" aria-hidden="true"></div>
      <div class="band-inner">
        <p class="kicker center">${f(u.kicker)}</p>
        <h2 id="who-title" class="title center">${f(u.title)}</h2>
        <div class="bento">
          ${u.tiles.map((t, i) => `<div class="frost s${t.span} mo-rise" style="--i: ${i}"><svg width="22" height="22" viewBox="0 0 24 24" class="dg-icon" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="${t.icon}"/></svg><p class="frost-t">${f(t.t)}</p><p class="frost-s">${f(t.s)}</p></div>`).join('\n          ')}
        </div>
      </div>
    </div>
  </div>
</section>`;
}

// ------------------------------------------------------------------ 04 the rules, read live
function rules(f) {
  const r = HOME.rules;
  return `
<section class="section bs bs-tight" id="rules" aria-labelledby="rules-title">
  <div class="wrap">
    <div class="bento">
      <article class="bc bc-ink s4 flush">
        <div class="panel-head"><span>${f(r.panelHead)}</span><span id="rules-state"><i class="dot t-lake"></i>read live from NEAR</span></div>
        <pre class="code mo-type" id="rules-json" aria-live="polite">${f(r.waiting)}</pre>
        <noscript><p class="panel-foot">${f(r.noScript)}</p></noscript>
        <p class="panel-foot" id="rules-reads"><span class="t-lake mono">Reads as</span> <span id="rules-reads-text">the rules appear here when NEAR answers</span></p>
      </article>
      <article class="bc s2">
        <p class="bc-label">${f(r.kicker)}</p>
        <h2 id="rules-title" class="bc-title bc-title-lg">${f(r.title)}</h2>
        <p class="bc-text">${f(r.body)}</p>
        <a class="btn btn-ghost-dark btn-sm bc-cta" href="${r.cta.href}"${ext(r.cta.href)}>${f(r.cta.t)}</a>
      </article>
    </div>
  </div>
</section>`;
}

// ------------------------------------------------------------------ 05 uses, as a numbered list
function list(f) {
  const l = HOME.list;
  return `
<section class="section bs" id="uses" aria-labelledby="uses-title">
  <div class="wrap">
    <div class="bento">
      <article class="bc s2">
        <p class="bc-label">${f(l.kicker)}</p>
        <h2 id="uses-title" class="title title-card">${f(l.title)}</h2>
        <a class="btn btn-light btn-sm bc-cta" href="${l.cta.href}">${f(l.cta.t)}</a>
      </article>
      <article class="bc s4">
        <p class="bc-text">${f(l.intro)}</p>
        <ol class="steps"><span class="steps-line mo-line" aria-hidden="true"></span>${l.items.map((t, i) => `<li><i class="mo-bullet" style="--i: ${i}" aria-hidden="true"></i><span class="mono dim">${String(i + 1).padStart(2, '0')}</span><span>${f(t)}</span></li>`).join('')}</ol>
      </article>
    </div>
  </div>
</section>`;
}

// ------------------------------------------------------------------ 06 AI agents
function agents(F, f, proof) {
  const a = HOME.agents; const recorded = proof.security?.attempts || [];
  const cards = a.attempts.map((x, i) => {
    const rec = recorded[x.i] || {}; const by = rec.refusedBy === 'contract' ? 'Refused by the contract' : 'Refused by the key';
    const err = String(rec.error || '');
    const clean = err && !CODE_NAMES.test(err) && !BANNED.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(err));
    return `<article class="bc s3 mo-rise" style="--i: ${i}"><p class="bc-label">Attempt ${x.i + 1} of ${esc(F.attempts.value)}</p><h3 class="bc-title">${f(x.t)}</h3><p class="bc-text">${f(x.b)}</p><p class="bc-end refused"><i class="dot t-deny"></i>${by}${clean ? `<span class="mono dim"> · the chain said: ${esc(err)}</span>` : ''}</p></article>`;
  }).join('\n      ');
  return `
<section class="section bs" id="agents" aria-labelledby="agents-title">
  <div class="wrap">${head('agents', a, f)}
    <div class="bento">
      ${cards}
      ${a.figs.map((k, i) => `<div class="bc bc-raised s2 stat-card"><p class="fig${i === 2 ? ' t-lake' : ''}">${countUp(F[k].value)}</p><p class="cap">${esc(F[k].label)}</p></div>`).join('\n      ')}
    </div>
    <p class="fine">${f(a.fine)}</p>
  </div>
</section>`;
}

// ------------------------------------------------------------------ 07 under the hood
function parts(f) {
  const p = HOME.parts; const span = { lg: 's3 r2', md: 's3', sm: 's2' };
  const hostHead = ['', ...p.hosts.cols].map((c) => `<span class="th">${esc(c)}</span>`).join('');
  const hostRows = p.hosts.rows.map((r, i) => `<span class="td k mono mo-rise" style="--i: ${i}">${f(r.k)}</span>${r.cells.map((c) => `<span class="td mo-rise${tone(c.tone)}" style="--i: ${i}">${f(c.t)}</span>`).join('')}`).join('');
  return `
<section class="section bs" id="parts" aria-labelledby="parts-title">
  <div class="wrap">${head('parts', p, f)}
    <div class="bento">
      ${p.cards.map((c, i) => `<article class="bc ${span[c.size]}${c.size === 'sm' ? ' bc-raised' : ''} mo-rise" style="--i: ${i}"><div class="bc-row"><h3 class="bc-title${c.size === 'lg' ? ' bc-title-lg' : ''}">${f(c.t)}</h3><span class="code-chip">code: ${f(c.code)}</span></div><p class="bc-text">${f(c.d)}</p><p class="bc-end mono dim">${f(c.s)}</p></article>`).join('\n      ')}
      <article class="bc bc-ink s6 flush">
        <div class="hosts-head"><h3 class="bc-title bc-title-lg">${f(p.hosts.title)}</h3><p class="bc-text">${f(p.hosts.lede)}</p></div>
        <div class="tbl-wrap"><div class="tbl tbl-4 tbl-wide" role="table" aria-label="${f(p.hosts.title)}">${hostHead}${hostRows}</div></div>
        <p class="panel-foot mono">${f(p.hosts.source)}</p>
      </article>
    </div>
  </div>
</section>`;
}

// ------------------------------------------------------------------ 08 proof
function proofSection(F, f, proofParts) {
  const p = HOME.proof; const r = p.refusal;
  return `
<section class="section bs section-dark" id="proof" aria-labelledby="proof-title">
  <div class="wrap">
    <div class="bento">
      <div class="bc bc-ink s6 statement">
        <svg class="pixels" aria-hidden="true"><defs><pattern id="px" width="96" height="96" patternUnits="userSpaceOnUse">${pixelTile()}</pattern></defs><rect class="mo-flickA" width="100%" height="100%" fill="url(#px)"/><rect class="mo-flickB" width="100%" height="100%" fill="url(#px)" transform="translate(48 22)"/></svg>
        <p class="kicker center">${f(p.kicker)}</p>
        <h2 id="proof-title" class="display center">${f(p.statementA)}<br><span class="soft">${f(p.statementB)}</span></h2>
      </div>
      <article class="bc s4 dots-card">
        <div class="bc-row"><h3 class="bc-title">${f(p.dotsTitle)}</h3><p class="bc-label">${proofParts.count}</p></div>
        ${proofParts.legend}
        ${proofParts.skip}
        ${proofParts.grid}
        ${proofParts.note}
      </article>
      <div class="s2 lens" aria-live="polite">
        <div class="bc bc-raised"><p class="bc-label">${f(p.lensPub)}</p><p id="lens-pub">${f(p.lensHint)}</p></div>
        <div class="bc bc-lake"><p class="bc-label t-lake">${f(p.lensPriv)}</p><p id="lens-priv">Bids, votes, and who each one-time address belongs to</p></div>
      </div>
      <article class="bc s3 live-card" aria-labelledby="chain-title">
        <div class="bc-row"><h3 id="chain-title" class="bc-title">Read the contract yourself</h3><span class="bc-label t-lake">read just now</span></div>
        <p class="bc-text">Straight from NEAR, with no server of ours in between.</p>
        <ul class="lp-list" id="chain-list"></ul>
        <p class="panel-note" id="chain-note"></p>
      </article>
      <article class="bc s3 live-card" aria-labelledby="lp-title">
        <h3 id="lp-title" class="bc-title">Check the AI's secure hardware</h3>
        <p class="bc-text">Your browser asks NEAR AI Cloud to prove what it is running, using a random number it picks, and checks the answer.</p>
        <div class="panel-actions"><button class="btn btn-sm btn-light" id="lp-run" type="button">Run the check</button><button class="btn btn-sm btn-ghost-dark" id="lp-replay" type="button">Try a fake replay</button></div>
        <ul class="lp-list" id="lp-list"></ul>
        <p class="panel-note" id="lp-note"></p>
      </article>
      <article class="bc s2">
        <p class="bc-label">${f(r.label)}</p>
        <h3 class="bc-title">${f(r.title)}</h3>
        <p class="bc-text">${f(r.body)}</p>
      </article>
      <article class="bc bc-ink s4 flush">
        <div class="panel-head"><span>${f(r.head)}</span><span>${f(r.run)}</span></div>
        <div class="tbl-wrap"><div class="tbl tbl-3" role="table" aria-label="${f(r.title)}">
          <span class="th">Check</span><span class="th">The payout asked</span><span class="th">The rules allow</span>
          <span class="td k">Recipient</span><span class="td t-deny"><span class="strike">${f(r.recipient)}<i class="mo-strike" aria-hidden="true"></i></span></span><span class="td dim">listed accounts only</span>
          <span class="td k">Money moved</span><span class="td t-deny">0 NEAR</span><span class="td dim">nothing outside the rules</span>
        </div></div>
        <p class="refusal-bar mo-slide"><span class="t-deny">${f(r.reason)}</span><a href="${NB}/txns/${r.hash}" target="_blank" rel="noopener">${esc(`${r.hash.slice(0, 8)}…${r.hash.slice(-7)}`)} on NearBlocks</a></p>
      </article>
      <div class="bc bc-ink bc-panel s6 runs" id="status">
        <div class="bc-row"><h3 class="bc-title bc-title-lg">${f(p.runsTitle)}</h3><p class="bc-label">${f(p.runsNote)}</p></div>
        <div class="bento">
          ${p.partners.map((x) => `<div class="bc ${x.wide ? 's6' : 's2'} partner"><div class="bc-row"><p class="partner-name">${f(x.name)}</p><span class="status t-${x.tone}"><i class="dot${x.status === 'Live' ? ' mo-breathe' : ''}"></i>${f(x.status)}</span></div><p class="mono dim">${f(x.role)}${x.fig === 'contractLive' ? ` · <b id="net-count">${esc(F.groups.value)}</b> groups` : ''}</p><p class="bc-text bc-end">${f(x.d)}</p></div>`).join('\n          ')}
        </div>
      </div>
    </div>
    <p class="live" id="live" aria-live="polite"></p>
  </div>
</section>`;
}

/** A fixed scatter of pixels for the proof statement's field (deterministic). */
function pixelTile() {
  let s = 7; let out = '';
  for (let i = 0; i < 56; i++) {
    s = (s * 9301 + 49297) % 233280; const a = s / 233280; s = (s * 9301 + 49297) % 233280; const b = s / 233280;
    out += `<rect x="${Math.floor(a * 16) * 6}" y="${Math.floor(b * 9) * 11}" width="5" height="9" rx="1" fill-opacity="${(0.06 + ((i * 37) % 10) / 26).toFixed(2)}"/>`;
  }
  return out;
}

// ------------------------------------------------------------------ 09 what it cannot do
function trust(f) {
  const t = HOME.trust; const [a, b, c] = t.cards;
  return `
<section class="section bs" id="limits" aria-labelledby="limits-title">
  <div class="wrap">${head('limits', t, f)}
    <div class="bento">
      <article class="bc s3 r2">
        <svg class="dg dg-center" viewBox="0 0 220 220" width="220" height="220" aria-hidden="true">
          <circle class="mo-draw dg-line" pathLength="1" cx="110" cy="110" r="96"/><circle cx="110" cy="110" r="58" class="dg-line-faint"/>
          <circle cx="14" cy="110" r="12" class="dg-node"/><text x="14" y="115" text-anchor="middle" class="dg-mono">$</text>
          <circle cx="206" cy="110" r="12" class="dg-node"/><path d="M200 110l4 4 8-8" class="dg-tick-static"/>
          <path class="mo-spin dg-fill-lake" d="M110 92l4 14 14 4-14 4-4 14-4-14-14-4 14-4z"/>
        </svg>
        <h3 class="bc-title bc-title-lg">${f(a.t)}</h3><p class="bc-text">${f(a.d)}</p><p class="bc-end mono dim">${f(a.e)}</p>
      </article>
      <article class="bc s3 side">
        <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true"><circle cx="48" cy="48" r="40" class="dg-line"/><path d="M30 48h36" class="dg-line-deny"/><circle cx="48" cy="48" r="5" class="dg-fill-deny"/></svg>
        <div><h3 class="bc-title">${f(b.t)}</h3><p class="bc-text">${f(b.d)}</p><p class="mono dim">${f(b.e)}</p></div>
      </article>
      <article class="bc bc-raised s3 side">
        <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true"><circle cx="42" cy="48" r="32" class="dg-line"/><path d="M42 48h46" class="dg-stroke"/><circle cx="88" cy="48" r="5" class="dg-fill-glow"/><circle cx="42" cy="48" r="4" class="dg-fill"/></svg>
        <div><h3 class="bc-title">${f(c.t)}</h3><p class="bc-text">${f(c.d)}</p><p class="mono dim">${f(c.e)}</p></div>
      </article>
    </div>
  </div>
</section>`;
}

// ------------------------------------------------------------------ 10 try it
function tryIt(f) {
  const t = HOME.tryIt;
  const card = (c, i) => `<article class="bc ${i === 2 ? 'bc-raised ' : ''}s2 mo-rise" style="--i: ${i}"><h3 class="bc-title">${f(c.t)}</h3><p class="bc-text">${f(c.d)}</p>${c.cmd ? `<div class="cmd"><code>${esc(c.cmd)}</code><button class="copy" type="button" data-copy="${esc(c.cmd)}">Copy</button></div>` : ''}${c.link ? `<p class="bc-end"><a href="${c.link.href}"${ext(c.link.href)}>${f(c.link.t)}</a></p>` : ''}${c.live ? '<ul class="recent" id="recent"><li>Reading…</li></ul>' : ''}</article>`;
  return `
<section class="section bs" id="try" aria-labelledby="try-title">
  <div class="wrap">${head('try', t, f)}
    <div class="bento">
      ${t.cards.map(card).join('\n      ')}
    </div>
  </div>
</section>`;
}

/** Sections 01 to 10 after the hero. proofParts: the static dots, legend, skip link and note from build-site-cards. */
export function renderHome(proof, F, proofParts) {
  const f = filler(F);
  return [problem(F, f), engine(f), uses(f), rules(f), list(f), agents(F, f, proof), parts(f), proofSection(F, f, proofParts), trust(f), tryIt(f)].join('\n');
}

/** The FAQ: four headed groups of native details (all visible without JavaScript; main.js turns them into tabs). */
export function renderFaq(F) {
  const f = filler(F);
  return HOME.faq.map((g, gi) => `
        <section class="faq-group" id="faq-g${gi}" aria-labelledby="faq-g${gi}-h">
          <h3 class="faq-h" id="faq-g${gi}-h">${f(g.name)}</h3>
          <div class="faq-card">${g.items.map(([q, a], i) => `
            <details${gi === 0 && i === 0 ? ' open' : ''}><summary>${f(q)}</summary><p>${f(a)}</p></details>`).join('')}
          </div>
        </section>`).join('');
}

export { plainTx };
