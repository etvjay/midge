#!/usr/bin/env node
/**
 * Writes the landing page's sections 01 to 10 (between `<!-- cards:begin -->` and `<!-- cards:end -->`) and the FAQ and footer
 * (between `<!-- footer:begin -->` and `<!-- footer:end -->`) into site/index.html, from scripts/site-sections/ (content and
 * render), the real figures and the recorded proof. The page is complete without JavaScript; main.js adds live reads, the FAQ
 * tabs, the lens and motion triggers. Pure and idempotent. Run: node scripts/build-site-cards.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { figures } from './site-scenes/figures.mjs';
import { esc, plainTx } from './site-scenes/kit.mjs';
import { renderHome, renderFaq } from './site-sections/render.mjs';

const BEGIN = '<!-- cards:begin -->';
const END = '<!-- cards:end -->';
const RENAMED = { idea: 'how', network: 'who', members: 'agents', architecture: 'parts', hood: 'parts' };

const KIND_NAMES = { deposit: 'Money in', hatch: 'Group created', settled: 'Payout', exit: 'Member left with their share', rejected: 'Refused by the rules', other: 'Other' };
const shortHash = (h) => `${h.slice(0, 10)}…${h.slice(-6)}`;

/** The proof section's static parts: one dot link per recorded transaction (data for the lens on the grid), the legend and the note. */
export function proofParts(proof) {
  const txs = proof.transactions; const runs = new Set(txs.map((t) => t.run)).size;
  const legend = Object.keys(KIND_NAMES).filter((k) => proof.counts[k]).map((k) => `<span><i class="k-${k}"></i>${KIND_NAMES[k]} · ${proof.counts[k]}</span>`).join('');
  const dots = txs.map((t, i) => `<span role="listitem"><a href="https://testnet.nearblocks.io/txns/${t.hash}" target="_blank" rel="noopener" class="k-${t.kind} mo-dot" style="--i: ${i}" data-i="${i}" aria-label="${esc(`Transaction ${i + 1} of ${txs.length}, ${KIND_NAMES[t.kind]}: ${plainTx(t.label)}${t.error ? ', refused' : ''}, ${shortHash(t.hash)}. Opens NearBlocks.`)}"></a></span>`).join('');
  const data = esc(JSON.stringify(txs.map((t) => [t.kind, plainTx(t.label), shortHash(t.hash)])));
  return {
    count: `${txs.length} transactions · ${runs} test runs · NEAR testnet`,
    legend: `<div class="proof-legend" id="proof-legend">${legend}</div>`,
    skip: `<a class="proof-skip" href="#proof-after">Skip the ${txs.length} transaction links</a>`,
    grid: `<div class="proof-grid" id="proof-grid" role="list" aria-label="Recorded testnet transactions" data-tx="${data}">${dots}</div>`,
    note: `<p class="fine-dark" id="proof-note">Attacks that NEAR stopped before they even ran never became transactions, so they are not dots here; the AI agents section shows them.</p><span id="proof-after"></span>`,
  };
}

const GH = 'https://github.com/etvjay/midge/blob/master/';
const COLS = [
  ['Explore', [['How it works', '#how'], ['Who uses it', '#who'], ['Proof', '#proof'], ['Try it', '#try']]],
  ['Check it yourself', [['The contract on NearBlocks', 'https://testnet.nearblocks.io/address/c.fly-1793636729.testnet'], ['The code on GitHub', 'https://github.com/etvjay/midge'], ['Whitepaper', `${GH}docs/WHITEPAPER.md`], ['Threat model', `${GH}docs/security/threat-model.md`], ['What Midge is', `${GH}docs/canonical/WHAT_IS_MIDGE.md`]]],
  ['Build with it', [['MCP tools for agents', `${GH}src/mcp/server.js`], ['JavaScript SDK', `${GH}src/sdk/client.js`], ['Rooms API', `${GH}docs/openapi/rooms.json`], ['State machine', `${GH}docs/STATE_MACHINE.md`]]],
];

/** The FAQ and footer card over a field of the recorded transactions. The live line is replaced by main.js when NEAR answers. */
function footerBlock(root, F) {
  const deployments = JSON.parse(fs.readFileSync(path.join(root, 'docs/canonical/deployments.json'), 'utf8')).deployments;
  const hash = deployments[deployments.length - 1].codeHash;
  const ext = (href) => (href.startsWith('#') ? '' : ' target="_blank" rel="noopener"');
  return `<footer class="site-footer site-end" id="faq" aria-labelledby="faq-title">
  <canvas class="end-field" aria-hidden="true"></canvas>
  <div class="wrap end-inner">
    <div class="faq">
      <h2 id="faq-title" class="faq-title">Questions, answered</h2>
      <div class="faq-groups" id="faq-groups">${renderFaq(F)}
      </div>
    </div>
    <div class="foot">
      <div class="foot-brand">
        <p class="foot-mark">Midge</p>
        <p>Private rooms with public rules, on NEAR. Groups decide together in private; the money follows rules everyone can read.</p>
        <p class="foot-live" id="foot-live">Contract <b>c.fly-1793636729.testnet</b> · fingerprint <b>${hash.slice(0, 8)}…</b> (recorded)</p>
      </div>${COLS.map(([h, links]) => `
      <nav class="foot-col" aria-label="${esc(h)}"><p class="foot-h">${esc(h)}</p><ul>${links.map(([t, href]) => `<li><a href="${href}"${ext(href)}>${esc(t)}</a></li>`).join('')}</ul></nav>`).join('')}
    </div>
    <p class="legal"><span>Midge · a NEAR hackathon prototype · testnet only · no token</span><span>Not affiliated with Fly.trade or Fly.io</span></p>
  </div>
</footer>`;
}

/** Pure: the page with the cards (re)written between the markers and the nav pointing at the new section ids. */
export function buildCards(html, proof, root) {
  const F = figures(proof, root);
  let out = html;
  if (!out.includes(BEGIN)) throw new Error('site/index.html has no cards markers');
  // One-time migration from the card-system page: sections 06 (proof) and 07 (try it) were outside the markers; fold them in.
  const oldProof = out.indexOf('<!-- 06 PROOF -->');
  if (oldProof > out.indexOf(END)) out = `${out.slice(0, out.indexOf(END))}${out.slice(out.indexOf('</main>'))}`.replace('</main>', `${END}\n\n</main>`);
  const a = out.indexOf(BEGIN) + BEGIN.length; const b = out.indexOf(END);
  out = `${out.slice(0, a)}\n${renderHome(proof, F, proofParts(proof))}\n${out.slice(b)}`;
  const FB = '<!-- footer:begin -->'; const FE = '<!-- footer:end -->';
  if (!out.includes(FB)) throw new Error('site/index.html has no footer markers');
  out = `${out.slice(0, out.indexOf(FB) + FB.length)}\n${footerBlock(root, F)}\n${out.slice(out.indexOf(FE))}`;
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
