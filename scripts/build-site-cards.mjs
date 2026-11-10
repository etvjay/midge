#!/usr/bin/env node
/**
 * Writes the site's B cards (sections 01 to 05) into site/index.html between `<!-- cards:begin -->` and `<!-- cards:end -->`,
 * from scripts/site-scenes/content.mjs, the scenes and the real figures. The result is complete without JavaScript: every tab's
 * sentence, scene and fine print are in the HTML; site/main.js only hides the ones not selected. Run: node scripts/build-site-cards.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SECTIONS } from './site-scenes/content.mjs';
import { SCENES } from './site-scenes/scenes.mjs';
import { figures } from './site-scenes/figures.mjs';
import { esc, plainTx } from './site-scenes/kit.mjs';

const BEGIN = '<!-- cards:begin -->';
const END = '<!-- cards:end -->';
const RENAMED = { idea: 'how', network: 'who', members: 'agents', architecture: 'hood' };

function card(s, F) {
  const n = s.tabs.length;
  const tabs = s.tabs.map((t, i) => `
          <button class="b-tab" type="button" role="tab" id="tab-${s.id}-${i}" aria-controls="panel-${s.id}-${i}" aria-selected="${i === 0}"><span class="n">0${i + 1}</span><span class="t">${esc(t.t)}</span><span class="b">${esc(t.b)}</span></button>`).join('');
  const fine = s.tabs.map((t, i) => `
        <details class="b-fine" data-tab="${i}"><summary>The fine print<span class="b-fine-for">: ${esc(t.t)}</span></summary><p>${esc(t.fine)}</p></details>`).join('');
  const panels = s.tabs.map((t, i) => { const sc = SCENES[t.scene](t.arg); return `
        <div class="b-panel" role="tabpanel" id="panel-${s.id}-${i}" aria-labelledby="tab-${s.id}-${i}" tabindex="0">
          <div class="b-cap"><span>${esc(t.t)}</span><span>scene 0${i + 1} of ${n}</span></div>
          <div class="b-scene">${sc.wide}${sc.narrow}</div>
        </div>`; }).join('');
  const strip = s.strip.map((k) => `<div><b data-figure="${k}"${k === 'groups' ? ' id="net-count"' : ''}>${esc(F[k].value)}</b><span>${esc(F[k].label)}</span></div>`).join('');
  return `
<section class="section${s.alt ? ' section-alt' : ''} b-section" id="${s.id}" aria-labelledby="${s.id}-title">
  <div class="wrap">
    <div class="sec-head">
      <div><p class="kicker">${esc(s.kicker)}</p><h2 id="${s.id}-title" class="title">${esc(s.title)} <span class="soft">${esc(s.soft)}</span></h2></div>
      <p class="sec-lede">${esc(s.lede)}</p>
    </div>
    <div class="bcard">
      <div class="b-left">
        <div class="b-tabs" role="tablist" aria-label="${esc(`${s.title} ${s.soft}`)}">${tabs}
        </div>${fine}
      </div>
      <div class="b-stage">
        <div class="b-plate" aria-hidden="true"></div>${panels}
        <div class="b-strip">${strip}</div>
      </div>
    </div>${s.under ? `
    <p class="b-under">${esc(s.under)}</p>` : ''}
  </div>
</section>
`;
}

const KIND_NAMES = { deposit: 'Money in', hatch: 'Group created', settled: 'Payout', exit: 'Member left with their share', rejected: 'Refused by the rules', other: 'Other' };
const shortHash = (h) => `${h.slice(0, 10)}…${h.slice(-6)}`;

/** The proof section's dots (one per recorded transaction, linking to NearBlocks), legend, lens and note: all static. */
function proofBlock(proof) {
  const txs = proof.transactions; const runs = new Set(txs.map((t) => t.run)).size;
  const legend = Object.keys(KIND_NAMES).filter((k) => proof.counts[k]).map((k) => `<span><i class="k-${k}"></i>${KIND_NAMES[k]} · ${proof.counts[k]}</span>`).join('');
  const dots = txs.map((t, i) => `<a role="listitem" href="https://testnet.nearblocks.io/txns/${t.hash}" target="_blank" rel="noopener" class="k-${t.kind}" data-i="${i}" aria-label="${esc(`Transaction ${i + 1} of ${txs.length}, ${KIND_NAMES[t.kind]}: ${plainTx(t.label)}${t.error ? ', refused' : ''}, ${shortHash(t.hash)}. Opens NearBlocks.`)}"></a>`).join('');
  const data = esc(JSON.stringify(txs.map((t) => [t.kind, plainTx(t.label), shortHash(t.hash)])));
  return `
    <p class="lede-dark">From our test runs on NEAR testnet. Point at a dot to see what anyone can read on the chain, and what stayed private. Open it on NearBlocks to check it yourself.</p>
    <div class="proof-legend" id="proof-legend">${legend}</div>
    <a class="proof-skip" href="#proof-after">Skip the ${txs.length} transaction links</a>
    <div class="proof-field">
      <div class="proof-grid in" id="proof-grid" role="list" aria-label="Recorded testnet transactions" data-tx="${data}">${dots}</div>
      <div class="lens" aria-live="polite">
        <div><p class="lens-h">What anyone can see</p><p id="lens-pub">Point at a dot, or move through them with Tab</p></div>
        <div class="lens-priv"><p class="lens-h">What stayed private</p><p id="lens-priv">Bids, votes, and who each one-time address belongs to</p></div>
      </div>
    </div>
    <p class="fine-dark" id="proof-note">${txs.length} transactions from ${runs} test runs. Attacks that NEAR stopped before they even ran never became transactions, so they are not dots here; the AI agent section shows them.</p><span id="proof-after"></span>
`;
}

/** Pure: the page with the cards (re)written between the markers and the nav pointing at the new section ids. */
export function buildCards(html, proof, root) {
  const F = figures(proof, root);
  let out = html;
  if (!out.includes(BEGIN)) {
    const start = out.indexOf('<!-- 01 THE PROBLEM -->');
    const end = out.indexOf('<!-- 06 PROOF -->');
    if (start < 0 || end < 0 || end < start) throw new Error('could not find sections 01 to 05 to replace');
    out = `${out.slice(0, start)}${BEGIN}\n${END}\n\n${out.slice(end)}`;
  }
  const a = out.indexOf(BEGIN) + BEGIN.length; const b = out.indexOf(END);
  out = `${out.slice(0, a)}\n${SECTIONS.map((s) => card(s, F)).join('')}${out.slice(b)}`;
  const PB = '<!-- proof:begin -->'; const PE = '<!-- proof:end -->';
  if (!out.includes(PB)) {
    const a0 = out.indexOf('<p class="lede-dark">From our test runs');
    const a1 = out.indexOf('<span id="proof-after"></span>', a0) + '<span id="proof-after"></span>'.length;
    if (a0 < 0 || a1 < a0) throw new Error('could not find the proof grid to replace');
    out = `${out.slice(0, a0)}${PB}\n${PE}${out.slice(a1)}`;
  }
  out = `${out.slice(0, out.indexOf(PB) + PB.length)}${proofBlock(proof)}    ${out.slice(out.indexOf(PE))}`;
  for (const [from, to] of Object.entries(RENAMED)) out = out.split(`href="#${from}"`).join(`href="#${to}"`);
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const file = path.join(root, 'site/index.html');
  const proof = JSON.parse(fs.readFileSync(path.join(root, 'site/data/proof.json'), 'utf8'));
  const before = fs.readFileSync(file, 'utf8');
  const after = buildCards(before, proof, root);
  fs.writeFileSync(file, after);
  console.log(after === before ? 'cards unchanged' : 'cards written into site/index.html');
}
