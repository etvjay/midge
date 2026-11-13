#!/usr/bin/env node
/**
 * Build the replay page's data and script:   npm run build:replay
 *   site/replay/replay.data.js    the recorded runs (their raw events.jsonl and summary.json) and the contract's recorded code hash. The pay run's
 *                                 receipts, statements, auditor pack and review are read by the page out of that run's own log.
 *   site/replay/replay.bundle.js  the page script with the browser client and verifier bundled in
 * With --preview <file> it also writes one self-contained HTML file (for viewing without a server).
 */
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const PAY_RUN = '20261113T041922Z-5bc2';
const GROUPS = [
  { title: 'Pay runs', line: 'Who was paid stays private, and the amounts are public.', runs: [
    { id: PAY_RUN, label: 'Pay run with an AI review', blurb: 'The run shown above: four payees, a refused mismatch, an AI review that catches a planted mistake, receipts and an auditor pack.', kind: 'Real hardware' },
    { id: '20261112T031407Z-8c64', label: 'Earlier pay run', blurb: 'Three payees, signed invoices, a refused mismatch, receipts and an auditor pack.', kind: 'Real hardware' }] },
  { title: 'Sealed quotes', line: 'Bids stay sealed, and the rules pick the winner.', runs: [
    { id: '20261112T032202Z-a3a8', label: 'Buy side', blurb: 'The lowest eligible ask wins and is paid its own ask.', kind: 'Real hardware' },
    { id: '20261112T032438Z-98db', label: 'Sell side', blurb: 'An unfunded high bidder is left out by name, and the second price is charged.', kind: 'Real hardware' }] },
  { title: 'Ballots', line: 'Votes stay sealed, and only the winner is published.', runs: [
    { id: '20261112T032730Z-3b68', label: 'Signed ballot', blurb: 'A vote signed with the wrong key is refused, and three real votes settle.', kind: 'Real hardware' },
    { id: '20261112T173152Z-e25d', label: 'Weighted ballot and pro-rata pool', blurb: 'A vote below its bar decides nothing, the same votes on the bar settle, and an oversubscribed pool is scaled.', kind: 'Real hardware' }] },
  { title: 'Pools', line: 'Amounts stay sealed, and each member pays their own.', runs: [
    { id: '20261112T031652Z-b62e', label: 'Pools and a lending quote', blurb: 'Pools of sealed amounts, a late depositor, then a lending quote.', kind: 'Real hardware' }] },
  { title: 'Other recorded runs', line: 'Tests of the AI reviewer, and a failure kept on purpose.', quiet: true, runs: [
    { id: '20261113T041735Z-1296', label: 'Reviewer repeatability', blurb: 'Twenty reviews on the attested model: the planted mistake caught 10 of 10, the corrected run passed 10 of 10.', kind: 'Attested model' },
    { id: '20261113T040421Z-97c8', label: 'Reviewer accuracy, held-out runs', blurb: 'Thirty runs the reviewer was never tuned on: 47 of 47 planted mistakes caught, no false claims.', kind: 'Attested model' },
    { id: '20261113T040717Z-2978', label: 'Reviewer accuracy, hard cases', blurb: 'Sixteen hand-designed hard cases: 12 of 12 caught, no false claims.', kind: 'Attested model' },
    { id: '20261112T173516Z-5565', label: 'A run that failed', blurb: 'An early review test that failed and is kept: the model was right and the code check was too strict.', kind: 'Kept failure' }] },
];

const deployments = JSON.parse(read('docs/canonical/deployments.json'));
const runs = {};
for (const g of GROUPS) for (const r of g.runs) runs[r.id] = { eventsText: read(`docs/lab-runs/${r.id}/events.jsonl`), summaryText: read(`docs/lab-runs/${r.id}/summary.json`) };
const data = {
  builtAt: new Date().toISOString(),
  contract: { id: deployments.contract, codeHash: deployments.deployments.at(-1).codeHash, rpcUrls: ['https://test.rpc.fastnear.com', 'https://near-testnet.drpc.org'] },
  payRunId: PAY_RUN,
  briefUrl: 'https://github.com/etvjay/midge/blob/master/src/advisor/payrun-analyst.js',
  groups: GROUPS,
  runs,
};
fs.mkdirSync(path.join(root, 'site/replay'), { recursive: true });
fs.writeFileSync(path.join(root, 'site/replay/replay.data.js'), `window.REPLAY_DATA = ${JSON.stringify(data)};\n`);
const bundle = await build({ entryPoints: [path.join(root, 'site/src/replay-page.js')], bundle: true, minify: true, write: false, platform: 'browser', format: 'iife', target: 'es2020', legalComments: 'none', logLevel: 'silent' });
fs.writeFileSync(path.join(root, 'site/replay/replay.bundle.js'), bundle.outputFiles[0].text);
const kb = (n) => (n / 1024).toFixed(1);
console.log(`site/replay/replay.data.js ${kb(fs.statSync(path.join(root, 'site/replay/replay.data.js')).size)} KB, replay.bundle.js ${kb(bundle.outputFiles[0].text.length)} KB`);

const i = process.argv.indexOf('--preview');
if (i > 0) {
  let html = read('site/replay/index.html');
  html = html.replace('<link rel="stylesheet" href="replay.css">', `<style>${read('site/replay/replay.css')}</style>`)
    .replace('<script src="replay.data.js"></script>', `<script>${fs.readFileSync(path.join(root, 'site/replay/replay.data.js'), 'utf8').replace(/<\/script/gi, '<\\/script')}</script>`)
    .replace('<script src="replay.bundle.js"></script>', `<script>${bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script>`);
  fs.writeFileSync(process.argv[i + 1], html);
  console.log(`preview written: ${process.argv[i + 1]} (${kb(html.length)} KB)`);
}
