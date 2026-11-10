/**
 * The drawing kit for the site's card scenes. Everything returns SVG text, so the scenes are written into the page at build
 * time and need no JavaScript. Colours are the design system's dark-stage tokens (docs/DESIGN_SYSTEM.md §3).
 */
export const C = {
  d1: '#e9ece8', d2: '#a6aeab', d3: '#858d8a', lake: '#7cc4b8', glow: '#d9824a', deny: '#e0675a', dusk: '#0f1416',
  glass: 'rgba(233,236,232,0.08)', edge: 'rgba(233,236,232,0.22)', faint: 'rgba(233,236,232,0.16)', room: 'rgba(124,196,184,0.08)', panelSolid: '#192023',
};

/** Classes that animate; site/styles.css gives every one of them a reduced-motion end state. */
export const ANIM_CLASSES = ['a-tr', 'a-tr2', 'a-late', 'a-later', 'a-dim', 'a-leave', 'a-fill', 'a-draw'];

/** Words that do not appear on the page (design system §2: plain words first). */
export const BANNED = ['TEE', 'attestation', 'nonce', 'policy hash', 'hatch_out', 'enclave'];

/** Type sizes per drawing: the phone drawing is shown near its own width, so its type stays at 12 units or more. */
export const TYPE = { wide: { title: 13, sub: 11, note: 12 }, narrow: { title: 14, sub: 12, note: 12 } };

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** A safe estimate of rendered width: Geist at about 0.56 em per character, Geist Mono at about 0.62 em. */
export const textWidth = (s, size, mono) => String(s).length * size * (mono ? 0.62 : 0.56);

/**
 * A glass panel with a title and an optional mono subtitle. It sizes itself to its text.
 * @returns {{svg: string, x: number, y: number, w: number, h: number}}
 */
export function chip(x, y, title, sub = '', o = {}) {
  const t = o.type || TYPE.wide;
  const lockW = o.lock ? 30 : 0;
  const need = Math.ceil(Math.max(textWidth(title, t.title, false), sub ? textWidth(sub, t.sub, true) : 0)) + 28 + lockW;
  const w = Math.max(o.minW || 0, need);
  const h = sub ? t.title + t.sub + 28 : t.title + 25;
  const x0 = Math.round(o.align === 'end' ? x - w : o.align === 'center' ? x - w / 2 : x);
  const cls = o.cls ? ` class="${o.cls}"` : '';
  const lock = o.lock ? `<rect x="${x0 + 12}" y="${y + (h - 22) / 2}" width="22" height="22" rx="6" fill="${C.d1}"/><path d="M${x0 + 18} ${y + h / 2 - 1} v-3 a5 5 0 0 1 10 0 v3" fill="none" stroke="${C.dusk}" stroke-width="1.6"/><rect x="${x0 + 16}" y="${y + h / 2 - 1}" width="14" height="9" rx="2" fill="${C.dusk}"/>` : '';
  const tx = x0 + 14 + lockW;
  const strike = o.strike ? `<path d="M${x0 + 8} ${y + h / 2} L${x0 + w - 8} ${y + h / 2}" stroke="${C.deny}" stroke-width="1.5" class="a-draw"/>` : '';
  // On phones panels are stacked, so connectors pass behind them: an opaque fill keeps those lines hidden.
  const fill = o.fill || (t === TYPE.narrow ? C.panelSolid : C.glass);
  const svg = `<g data-chip="${x0},${y},${w},${h},${need}"${cls}><rect x="${x0}" y="${y}" width="${w}" height="${h}" rx="10" fill="${fill}" stroke="${o.stroke || C.edge}"/>${lock}`
    + `<text x="${tx}" y="${y + (sub ? t.title + 9 : t.title + 7)}" class="s" font-size="${t.title}" fill="${o.color || C.d1}">${esc(title)}</text>`
    + (sub ? `<text x="${tx}" y="${y + t.title + t.sub + 15}" class="m" font-size="${t.sub}" fill="${o.subColor || C.d2}">${esc(sub)}</text>` : '')
    + `${strike}</g>`;
  return { svg, x: x0, y, w, h };
}

export const line = (d, o = {}) => `<path d="${d}" fill="none" stroke="${o.color || C.faint}" stroke-width="${o.w || 1.2}"${o.dash ? ' stroke-dasharray="3 5"' : ''}/>`;

/** A dot that travels along a path (CSS offset-path); `a-tr` runs in the first half of the loop, `a-tr2` in the second. */
export const mover = (d, color = C.glow, delay = 0, cls = 'a-tr') => `<circle r="4.5" fill="${color}" class="${cls}" style="offset-path: path('${d}'); animation-delay: ${delay}s"/>`;

export function label(x, y, text, o = {}) {
  const cls = ['m', o.cls].filter(Boolean).join(' ');
  return `<text x="${x}" y="${y}" class="${cls}" font-size="${o.size || 12}" fill="${o.color || C.d2}" text-anchor="${o.anchor || 'start'}">${esc(text)}</text>`;
}

/** A curve from a to b that leaves a horizontally (wide drawings) or vertically (phone drawings). */
export function curve([ax, ay], [bx, by], vertical = false) {
  if (vertical) { const my = (ay + by) / 2; return `M${ax} ${ay} C ${ax} ${my}, ${bx} ${my}, ${bx} ${by}`; }
  const mx = (ax + bx) / 2; return `M${ax} ${ay} C ${mx} ${ay}, ${mx} ${by}, ${bx} ${by}`;
}

export function frame(body, aria, view, height) {
  const w = view === 'wide' ? 600 : 360;
  return `<svg viewBox="0 0 ${w} ${Math.ceil(height)}" role="img" aria-label="${esc(aria)}" class="scene-${view}">${body}</svg>`;
}
