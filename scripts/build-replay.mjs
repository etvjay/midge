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

const PAY_RUN = '20261113T084451Z-1582';
// One replay per use case. Each stage is a state of the real-world process (from the research saved with the lab notes), tagged with the beat it
// belongs to. `steps` picks the run's steps that show it, by a phrase in the step name. A stage with `modelled: false` is a real state Midge does not model.
const BEATS = ['Private inputs', 'The room decides', 'The contract settles', 'The paper trail'];
const USE_CASES = [
  { key: 'payrun', title: 'Pay run', line: 'NEAR shows the payments. The room keeps who they were for, and one hash ties the two together.', runId: PAY_RUN, also: [{ id: '20261113T041922Z-5bc2', label: 'an earlier pay run without an approver' }] },
  { key: 'quotes', title: 'Sealed quotes', line: 'A seller asks makers for a price. The bids stay sealed, and a public rule picks the winner.', runId: '20261112T032438Z-98db', also: [{ id: '20261112T032202Z-a3a8', label: 'the buy side' }],
    stages: [
      { title: 'Request', beat: 0, modelled: true, line: 'A seller asks four makers for a bid. Each bid is sealed and signed, and the makers deposit what they could pay. One maker deposits nothing.', steps: ['set up'], claims: 'deposit|holds nothing' },
      { title: 'Dealer selection', beat: 0, modelled: false, line: 'On real venues the asker picks which dealers to invite. Here the group\'s makers are fixed for the round.' },
      { title: 'Quote expiry and last look', beat: 1, modelled: false, line: 'Real quotes expire in seconds, and some dealers may still refuse after acceptance. Here quotes are firm for the round, with no last look.' },
      { title: 'Selection', beat: 1, modelled: true, line: 'The room leaves out the maker who could not pay, by name. The highest eligible bid wins and pays the runner-up\'s bid, a second-price rule chosen for this round. On real bond venues the winner usually just learns the runner-up price. No losing bid is published.', steps: ['round A'], claims: 'excluded|eligible|won|runner-up|returned the price' },
      { title: 'Ties', beat: 1, modelled: true, line: 'In a first-price round with two equal bids, the earlier submission wins.', steps: ['round B'], claims: 'tie' },
      { title: 'Settlement', beat: 2, modelled: true, line: 'The contract charges the winner and pays the seller exactly, once per round. Only the cash leg moves; the asset itself is not delivered.', steps: ['round A', 'round B'], claims: 'contract accepted|received|charged|order hash', tx: true } ] },
  { key: 'ballot', title: 'Ballot', line: 'Votes stay sealed. The room publishes the winning option, and the contract pays it.', runId: '20261112T032730Z-3b68', also: [{ id: '20261112T173152Z-e25d', label: 'a weighted vote that must reach 60 percent' }],
    stages: [
      { title: 'Rules and roll', beat: 0, modelled: true, line: 'Three members and the rule are set before voting opens, and each member deposits.', steps: ['set up'], claims: 'deposit' },
      { title: 'Voting', beat: 0, modelled: true, line: 'Members seal and sign their votes. A vote signed with a key that is not the member\'s is refused, and so is an unsigned one.', steps: ['wrong-key'], claims: 'refused|votes were accepted' },
      { title: 'Tally and result', beat: 1, modelled: true, line: 'The room counts the votes and publishes the winning option.', steps: ['wrong-key'], claims: 'wins' },
      { title: 'Challenge period', beat: 1, modelled: false, line: 'Many votes leave time to challenge the result before it takes effect. Here the result settles at once.' },
      { title: 'Execution', beat: 2, modelled: true, line: 'The contract pays the winning option\'s recipient and charges every member one share.', steps: ['wrong-key'], claims: 'contract accepted|received|charged', tx: true } ] },
  { key: 'block', title: 'Block trade', line: 'Large orders meet without showing their size or limit to the market.', runId: '20261113T084759Z-13f0',
    stages: [
      { title: 'Indication of interest and firm-up', beat: 0, modelled: false, line: 'Real venues first match conditional interest and ask both sides to firm up. Here every order is firm from the start.' },
      { title: 'Firm orders', beat: 0, modelled: true, line: 'Three buyers and two sellers seal and sign an order: a side, a size and a limit price. The buyers deposit.', steps: ['set up'], claims: 'deposit' },
      { title: 'Cross at the reference price', beat: 1, modelled: true, line: 'Buyers at or above the public reference price meet sellers at or below it. The smaller side fills in full, the larger pro rata. No limit price is published.', steps: ['firm orders'], claims: 'matched|limit price|pro rata' },
      { title: 'Minimum fill and time priority', beat: 1, modelled: false, line: 'Venues differ: some allocate by time, some require a minimum fill. Here allocation is pro rata with no minimum, and the reference price is supplied, not checked.' },
      { title: 'Settlement', beat: 2, modelled: true, line: 'Buyers are charged and sellers paid the reference price times their filled units. Only the cash leg settles; the asset is not delivered.', steps: ['firm orders'], claims: 'contract accepted|received|left', tx: true } ] },
  { key: 'pools', title: 'Pool', line: 'Members ask for a share of a pool in private. When they ask for more than it holds, everyone is scaled by the same share.', runId: '20261112T173152Z-e25d', also: [{ id: '20261112T031652Z-b62e', label: 'a running pool over three rounds, with a member who joins late' }],
    stages: [
      { title: 'Commitments', beat: 0, modelled: true, line: 'Three members deposit, then seal and sign how much of the pool they want.', steps: ['set up'], claims: 'deposit' },
      { title: 'Allocation', beat: 1, modelled: true, line: 'Together they ask for more than the pool holds, so the room scales every commitment by the same share. Nobody is left out, and no single commitment is published.', steps: ['pro-rata pool'], claims: 'outcome|each of the three' },
      { title: 'Payment to the recipient', beat: 2, modelled: true, line: 'The contract charges each member their scaled amount and pays the recipient the total.', steps: ['pro-rata pool'], claims: 'contract accepted|received|charged', tx: true } ] },
];
const OTHER = [
  { id: '20261112T031407Z-8c64', label: 'Earlier pay run with invoices' },
  { id: '20261113T041922Z-5bc2', label: 'Pay run with the first AI review' },
  { id: '20261112T032202Z-a3a8', label: 'Sealed quotes, buy side' },
  { id: '20261112T032438Z-98db', label: 'Sealed quotes, sell side' },
  { id: '20261112T032730Z-3b68', label: 'Ballot' },
  { id: '20261113T084759Z-13f0', label: 'Block trade' },
  { id: '20261112T173152Z-e25d', label: 'Weighted ballot and pro-rata pool' },
  { id: '20261112T031652Z-b62e', label: 'A pool over three rounds' },
  { id: '20261113T041735Z-1296', label: 'Reviewer repeatability' },
  { id: '20261113T040421Z-97c8', label: 'Reviewer accuracy, held-out runs' },
  { id: '20261113T040717Z-2978', label: 'Reviewer accuracy, hard cases' },
  { id: '20261112T173516Z-5565', label: 'A run that failed, kept' },
];

const deployments = JSON.parse(read('docs/canonical/deployments.json'));
const runs = {};
const ids = new Set([...USE_CASES.flatMap((u) => [u.runId, ...(u.also || []).map((a) => a.id)]), ...OTHER.map((o) => o.id)]);
for (const id of ids) runs[id] = { eventsText: read(`docs/lab-runs/${id}/events.jsonl`), summaryText: read(`docs/lab-runs/${id}/summary.json`) };
const data = {
  builtAt: new Date().toISOString(),
  contract: { id: deployments.contract, codeHash: deployments.deployments.at(-1).codeHash, rpcUrls: ['https://test.rpc.fastnear.com', 'https://near-testnet.drpc.org'] },
  payRunId: PAY_RUN,
  briefUrl: 'https://github.com/etvjay/midge/blob/master/src/advisor/payrun-analyst.js',
  beats: BEATS,
  useCases: USE_CASES,
  other: OTHER,
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
