/**
 * The card scenes. Each scene is a small model (who goes in, what the middle does, what comes out) laid out twice: `wide`
 * (600 wide, flowing left to right) for desktops and `narrow` (360 wide, stacked top to bottom) for phones, so phone type
 * never shrinks below 12 units. Each scene shows one mechanism; the moving parts use the classes in kit.ANIM_CLASSES.
 */
import { C, TYPE, BANNED, chip, line, mover, label, curve, frame, textWidth } from './kit.mjs';

const wrap = (text, max) => { const out = []; let cur = ''; for (const w of String(text).split(' ')) { if ((cur + ' ' + w).trim().length > max) { out.push(cur.trim()); cur = w; } else cur += ' ' + w; } if (cur.trim()) out.push(cur.trim()); return out; };

/** The middle of a scene: a room, a glass panel with lines or a timer, or a stack of panels. Returns its svg and box. */
function hubBox(hub, cx, y, t) {
  if (hub.kind === 'stack') {
    const items = hub.items.map((it) => chip(0, 0, it.t, it.s, { type: t, stroke: it.focus ? C.lake : C.edge, color: it.focus ? C.d1 : C.d2 }));
    const w = Math.max(...items.map((i) => i.w)); let yy = y; let svg = ''; const boxes = [];
    hub.items.forEach((it, i) => { const c = chip(cx - w / 2, yy, it.t, it.s, { type: t, minW: w, stroke: it.focus ? C.lake : C.edge, color: it.focus ? C.d1 : C.d2 }); svg += c.svg; boxes.push(c); yy += c.h + 22; });
    for (let i = 0; i < boxes.length - 1; i++) svg += line(`M${cx} ${boxes[i].y + boxes[i].h} L${cx} ${boxes[i + 1].y}`);
    const last = boxes[boxes.length - 1]; const prev = boxes[boxes.length - 2];
    svg += mover(`M${cx} ${prev.y + prev.h} L${cx} ${last.y}`, C.lake, 0, 'a-tr2');
    return { svg, x: cx - w / 2, y, w, h: yy - 22 - y, anchorIn: boxes[Math.min(1, boxes.length - 1)] };
  }
  const title = hub.t; const lines = hub.lines || [];
  const need = Math.max(textWidth(title, t.title, false), ...lines.map((l) => textWidth(l, t.sub + 1, true))) + 28;
  const w = Math.max(hub.minW || 140, Math.ceil(need)); const lineH = t.sub + 8;
  const h = 26 + t.title + lines.length * lineH + (hub.timer ? 34 : 0);
  const x = Math.round(cx - w / 2);
  const isRoom = hub.kind === 'room';
  let svg = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${isRoom ? 14 : 10}" fill="${isRoom ? C.room : C.glass}" stroke="${hub.stroke || (isRoom ? C.lake : C.edge)}"/>`;
  svg += `<text x="${isRoom ? cx : x + 14}" y="${y + 14 + t.title}" class="s" font-size="${t.title}" fill="${isRoom ? C.lake : C.d1}" text-anchor="${isRoom ? 'middle' : 'start'}">${title}</text>`;
  lines.forEach((l, i) => { svg += label(isRoom ? cx : x + 14, y + 18 + t.title + (i + 1) * lineH - 4, l, { size: t.sub + 1, color: isRoom ? C.d2 : C.d1, anchor: isRoom ? 'middle' : 'start' }); });
  if (hub.timer) {
    const ty = y + h - 26; const tw = w - 28;
    svg += `<rect x="${x + 14}" y="${ty}" width="${tw}" height="6" rx="3" fill="rgba(233,236,232,0.14)"/><rect class="a-fill" x="${x + 14}" y="${ty}" width="${tw}" height="6" rx="3" fill="${C.lake}"/>`;
    svg += label(x + w - 14, ty + 20, 'exit timer', { size: t.sub, color: C.d3, anchor: 'end' });
  }
  // Something that leaves keeps a dashed outline where it was, so the end state still shows what happened.
  const ghost = hub.cls === 'a-leave' ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="none" stroke="${C.deny}" stroke-dasharray="4 5"/>` : '';
  if (hub.cls) svg = `${ghost}<g class="${hub.cls}">${svg}</g>`;
  return { svg, x, y, w, h };
}

function layout(m, view) {
  const wide = view === 'wide'; const t = TYPE[view]; const W = wide ? 600 : 360;
  let body = ''; let bottom = 0;
  const make = (c, x, y, o = {}) => chip(x, y, c.t, c.s, { type: t, lock: c.lock, stroke: c.stroke, color: c.color, subColor: c.subColor, strike: c.strike, ...o });
  const ins = (m.inputs || []).map((c) => make(c, 0, 0));
  const outs = (m.outputs || []).map((c) => make(c, 0, 0));

  if (wide) {
    const gap = 10; const tall = (list) => list.reduce((a, c) => a + c.h, 0) + gap * Math.max(0, list.length - 1);
    const hubCx = m.hub.kind === 'stack' ? 400 : (ins.length ? 315 : 300);
    const hubProbe = hubBox(m.hub, hubCx, 0, t);
    const topC = m.top ? make(m.top, hubCx, 24, { align: 'center', cls: m.top.cls }) : null;
    const H = Math.max(300, tall(ins) + 48, tall(outs) + 48, (topC ? topC.h + 60 : 0) + hubProbe.h + 72);
    const mid = topC ? Math.max(topC.y + topC.h + 46 + hubProbe.h / 2, H / 2) : H / 2;
    const hub = hubBox(m.hub, hubCx, Math.round(mid - hubProbe.h / 2), t);
    if (topC) { body += topC.svg; body += line(`M${hubCx} ${topC.y + topC.h} L${hubCx} ${hub.y}`, { dash: true }); }
    let y = Math.round(mid - tall(ins) / 2);
    const placedIn = ins.map((c, i) => { const p = make(m.inputs[i], 24, y); y += p.h + gap; return p; });
    y = Math.round(mid - tall(outs) / 2);
    const placedOut = outs.map((c, i) => { const p = make(m.outputs[i], W - 24, y, { align: 'end', cls: m.outputs[i].cls }); y += p.h + gap; return p; });
    const target = hub.anchorIn || hub;
    placedIn.forEach((p, i) => { const d = curve([p.x + p.w, p.y + p.h / 2], [target.x, target.y + target.h / 2]); body += line(d) + (m.inFlow === false ? '' : mover(d, m.inFlow?.color || C.d1, i * 0.1, m.inFlow?.cls || 'a-tr')); });
    placedOut.forEach((p, i) => { const o = m.outputs[i]; const d = curve([hub.x + hub.w, hub.y + hub.h / 2], [p.x, p.y + p.h / 2]); body += line(d) + (o.flow ? mover(d, o.flow, i * 0.15, 'a-tr2') : ''); if (o.after) body += label(p.x + p.w - 12, p.y + t.title + 9, o.after, { size: t.sub, color: C.glow, anchor: 'end', cls: 'a-later' }); });
    body += hub.svg + placedIn.map((p) => p.svg).join('') + placedOut.map((p) => p.svg).join('');
    if (m.hubAfter) body += label(hubCx, hub.y + hub.h + 20, m.hubAfter.text, { size: t.note, color: m.hubAfter.color || C.d2, anchor: 'middle', cls: m.hubAfter.cls });
    bottom = H;
    if (m.note) { const ls = wrap(m.note.text, 72); ls.forEach((l, i) => { body += label(W / 2, H + 4 + i * 16, l, { size: t.note, color: C.d3, anchor: 'middle', cls: m.note.cls }); }); bottom = H + 4 + ls.length * 16; }
    return frame(body, m.aria, view, bottom + 8);
  }

  // phone: stacked top to bottom
  let y = 16; const cx = W / 2; let placedIn = [];
  if (m.top) { const tc = make(m.top, cx, y, { align: 'center', cls: m.top.cls }); body += tc.svg; y += tc.h + 40; body += line(`M${cx} ${tc.y + tc.h} L${cx} ${y}`, { dash: true }); }
  if (ins.length) {
    const colW = Math.max(...ins.map((c) => c.w)); const two = ins.length > 1 && colW <= (W - 40) / 2;
    if (two) {
      ins.forEach((c, i) => { const col = i % 2; const p = make(m.inputs[i], col ? W - 16 : 16, y + Math.floor(i / 2) * (c.h + 10), { minW: colW, align: col ? 'end' : 'start' }); placedIn.push(p); });
      y += Math.ceil(ins.length / 2) * (ins[0].h + 10) + 30;
    } else {
      ins.forEach((c, i) => { const p = make(m.inputs[i], cx, y, { minW: colW, align: 'center' }); placedIn.push(p); y += p.h + 10; });
      y += 30;
    }
  }
  const hub = hubBox(m.hub, cx, y, t);
  let afterGap = 0;
  if (m.hubAfter) { body += label(cx, hub.y + hub.h + 24, m.hubAfter.text, { size: t.note, color: m.hubAfter.color || C.d2, anchor: 'middle', cls: m.hubAfter.cls }); afterGap = 30; }
  const target = hub.anchorIn || hub;
  placedIn.forEach((p, i) => { const d = curve([p.x + p.w / 2, p.y + p.h], [target.x + target.w / 2, target.y], true); body += line(d) + (m.inFlow === false ? '' : mover(d, m.inFlow?.color || C.d1, i * 0.1, m.inFlow?.cls || 'a-tr')); });
  y = hub.y + hub.h + 36 + afterGap;
  const outW = outs.length ? Math.max(...outs.map((c) => c.w)) : 0;
  outs.forEach((c, i) => {
    const o = m.outputs[i]; const p = make(o, cx, y, { minW: outW, align: 'center', cls: o.cls });
    const d = curve([cx, hub.y + hub.h], [cx, p.y], true); body += line(d) + (o.flow ? mover(d, o.flow, i * 0.15, 'a-tr2') : '');
    if (o.after) body += label(p.x + p.w - 12, p.y + t.title + 9, o.after, { size: t.sub, color: C.glow, anchor: 'end', cls: 'a-later' });
    body += p.svg; y += p.h + 12;
  });
  body = hub.svg + body + placedIn.map((p) => p.svg).join('');
  bottom = outs.length ? y - 12 : hub.y + hub.h + afterGap;
  if (m.note) { const ls = wrap(m.note.text, 40); ls.forEach((l, i) => { body += label(cx, bottom + 30 + i * 18, l, { size: t.note, color: C.d3, anchor: 'middle', cls: m.note.cls }); }); bottom += 30 + (ls.length - 1) * 18 + 6; }
  return frame(body, m.aria, view, bottom + 16);
}

const both = (m) => ({ wide: layout(m, 'wide'), narrow: layout(m, 'narrow') });
const members = (n, sub, word = 'Member') => Array.from({ length: n }, (_, i) => ({ t: `${word} ${i + 1}`, s: sub, lock: sub === 'sealed bid' || sub === 'sealed' || sub === 'sealed ballot' }));

/** Our own description of an attempt, in plain words (the recorded labels use method names). */
export const plainAttempt = (s) => String(s).replace(/\bsettle_batch\b/g, 'the payout method').replace(/\bhatch_out\b/g, 'exit').replace(/\bthe coordinator\b/g, 'the Midge contract');
const hasBanned = (s) => BANNED.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(s));

/** The agent console: one recorded attempt and how it was refused. The chain's error is quoted verbatim, or left out if it uses a banned word. */
function agentScene(raw) {
  const attempt = { ...raw, label: plainAttempt(raw.label), error: hasBanned(raw.error) ? '' : raw.error };
  const make = (view) => {
    const wide = view === 'wide'; const W = wide ? 600 : 360; const t = TYPE[view]; const max = wide ? 62 : 34; const lh = wide ? 18 : 20;
    const tries = wrap('> ' + attempt.label, max); const errs = attempt.error ? wrap(`the chain said: ${attempt.error}`, max) : [];
    const verdict = `refused by ${attempt.refusedBy === 'key' ? "the key's own limits" : 'the contract'}`;
    let y = 24 + 28; let body = label(40, 44, wide ? "agent · a key that can only take its owner's money back" : 'agent · a limited key', { size: t.note, color: C.d3 });
    tries.forEach((l) => { y += lh; body += label(40, y, l, { size: t.note, color: C.glow }); });
    y += lh + 10; let after = label(40, y, verdict, { size: t.title, color: C.deny });
    errs.forEach((l) => { y += lh; after += label(40, y, l, { size: t.note, color: C.d3 }); });
    body += `<g class="a-late">${after}</g>`;
    const h = y + 24;
    return frame(`<rect x="20" y="20" width="${W - 40}" height="${h - 20}" rx="12" fill="rgba(15,20,22,0.85)" stroke="${C.edge}"/>` + body, `An AI agent tries to ${attempt.label.split(' (')[0]}; the attempt is ${verdict}`, view, h + 20);
  };
  return { wide: make('wide'), narrow: make('narrow') };
}

const LAYERS = [['NEAR AI Cloud', 'helps decide'], ['Our program on Phala', 'adds up the bids, signs'], ['The contract on NEAR', 'pays only within the rules']];

export function makeScenes(attempts = []) {
  return {
    public: () => both({ aria: 'Bids are public; a watcher reads them and bids just above',
      inputs: [{ t: 'Member A bids 1,250', s: 'visible to everyone' }, { t: 'Member B bids 900', s: 'visible to everyone' }, { t: 'Member C bids 1,100', s: 'visible to everyone' }],
      inFlow: { color: C.deny }, hub: { kind: 'glass', t: 'A watcher', lines: ['reads every bid'], stroke: 'rgba(224,103,90,0.5)' },
      outputs: [{ t: 'Bids 1,260 first', s: 'and wins the lot', stroke: C.deny, color: C.deny, cls: 'a-late' }],
      note: { text: 'Everyone sees the bids before they land', cls: 'a-later' } }),
    organizer: () => both({ aria: 'Backers send money to an organizer, who leaves with it',
      inputs: [{ t: 'Backer 1', s: 'sends 0.01' }, { t: 'Backer 2', s: 'sends 0.02' }, { t: 'Backer 3', s: 'sends 0.03' }],
      inFlow: { color: C.glow }, hub: { kind: 'glass', t: 'The organizer', lines: ['holds 0.06'], cls: 'a-leave' },
      hubAfter: { text: 'they leave; the money goes too', color: C.deny, cls: 'a-later' },
      note: { text: 'One person holds everything' } }),
    blackbox: () => both({ aria: 'Secure hardware that can pay anything pays a thief after one bug',
      inputs: [{ t: 'The pot', s: '0.10 from 4 members' }], inFlow: { color: C.glow },
      hub: { kind: 'glass', t: 'Secure hardware', lines: ['signs any payout'] },
      outputs: [{ t: 'A member', s: 'expected' }, { t: 'A thief', s: 'paid everything', stroke: C.deny, color: C.deny, subColor: C.deny, cls: 'a-late', flow: C.deny }],
      note: { text: 'If it can pay anything, one bug empties the pot', cls: 'a-later' } }),
    room: () => both({ aria: 'Sealed bids go into the room; only the total comes out',
      inputs: members(4, 'sealed bid'), hub: { kind: 'room', t: 'The room', lines: ['opens the bids', 'in secure hardware'] },
      outputs: [{ t: 'Total 4.90', s: 'only this comes out', stroke: C.lake, cls: 'a-late' }],
      note: { text: 'Example amounts' } }),
    rules: () => both({ aria: 'A payout inside the rules is paid; a payout to a thief is refused',
      inputs: [{ t: 'The room', s: 'proposes a payout' }],
      hub: { kind: 'glass', t: 'The rules, on NEAR', lines: ['pay only: alice, bob', 'at most 20% per window', 'until the deadline'] },
      outputs: [{ t: 'alice 0.40', s: 'paid', stroke: C.lake, flow: C.lake }, { t: 'a thief', s: 'refused', stroke: C.deny, color: C.deny, subColor: C.deny, strike: true, flow: C.deny }],
      note: { text: 'Even if the room approves it, a payout outside the rules is refused', cls: 'a-later' } }),
    exit: () => both({ aria: "The room stops, the exit timer runs out, and each member takes their own share back",
      top: { t: 'The room', s: 'decides in private', cls: 'a-dim' }, hubAfter: { text: 'room stopped', color: C.deny, cls: 'a-late' },
      hub: { kind: 'glass', t: 'Held by the contract', timer: true, minW: 200 },
      outputs: [{ t: 'Member 1', flow: C.glow, after: '+0.02' }, { t: 'Member 2', flow: C.glow, after: '+0.02' }, { t: 'Member 3', flow: C.glow, after: '+0.02' }].map((o) => ({ ...o, s: 'takes their share' })),
      note: { text: 'No one has to agree. Nobody else\'s share is touched', cls: 'a-later' } }),
    auction: () => both({ aria: 'Sealed bids; the room picks the winner and the losing bids stay private',
      inputs: ['a', 'b', 'c', 's'].map((n) => ({ t: `Bidder ${n}`, s: 'sealed bid', lock: true })), hub: { kind: 'room', t: 'The room', lines: ['second price'] },
      outputs: [{ t: 'Winner: a', s: 'pays the second price', stroke: C.lake, cls: 'a-late' }, { t: 'Losing bids', s: 'never published', cls: 'a-late' }] }),
    vote: () => both({ aria: 'Sealed ballots; the room counts; only the winning payout is public',
      inputs: members(5, 'sealed ballot'), hub: { kind: 'room', t: 'The room', lines: ['counts the ballots'] },
      outputs: [{ t: 'Option A wins', s: 'its payout is paid', stroke: C.lake, cls: 'a-late' }],
      note: { text: "On the chain: the payout. Not on it: anyone's vote", cls: 'a-later' } }),
    payroll: () => both({ aria: 'One pay run pays one-time addresses; who owns each stays private',
      inputs: [{ t: 'The pay run', s: 'one pool' }], hub: { kind: 'room', t: 'The room', lines: ['knows who is who'] },
      outputs: ['7f3a…', 'c21e…', '9b04…'].map((a) => ({ t: `address ${a}`, s: 'paid 0.03, one time', flow: C.glow })),
      note: { text: 'Strangers see amounts, not who each address belongs to', cls: 'a-later' } }),
    invest: () => both({ aria: "Four equal deposits; the room pays the founder; each backer's amount stays private",
      inputs: members(4, 'deposits 0.05', 'Backer'), hub: { kind: 'room', t: 'The room', lines: ['sealed amounts'] },
      outputs: [{ t: 'The founder', s: 'receives 0.10', stroke: C.lake, cls: 'a-late' }],
      note: { text: 'Equal deposits hide who put in how much', cls: 'a-later' } }),
    agent: (i = 0) => agentScene(attempts[i] || { label: 'send NEAR to the attacker', refusedBy: 'key', error: 'Access key requires full access' }),
    layers: (focus = 0) => both({ aria: 'Members, then NEAR AI Cloud and our program on Phala, then the contract on NEAR',
      inputs: members(4, 'sealed bid'), hub: { kind: 'stack', items: LAYERS.map(([t, s], i) => ({ t, s, focus: i === focus })) } }),
  };
}

/** Scenes with the recorded agent attempts from site/data/proof.json. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const proofPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../site/data/proof.json');
const attempts = (() => { try { return JSON.parse(fs.readFileSync(proofPath, 'utf8')).security.attempts; } catch { return []; } })();
export const SCENES = makeScenes(attempts);
