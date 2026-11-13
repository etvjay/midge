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

const PAY_RUN = '20261113T125015Z-8922';
// One replay per use case. Each stage is a state of the real-world process (from the research saved with the lab notes), tagged with the beat it
// belongs to. `steps` picks the run's steps that show it, by a phrase in the step name, and `claims` picks the checks in them by a pattern. A stage
// with `modelled: false` is a real state Midge does not model. A test fails if a stage marked modelled shows nothing its run recorded.
const BEATS = ['Private inputs', 'The room decides', 'The contract settles', 'The paper trail'];
// `cast` lists who is in the run. `role` is the short name the experiment gave the account, and the page finds the full NEAR account id in the run's own log.
// What each one does comes from the experiment's source, so the page says that it is the test's input and not something the room revealed.
const USE_CASES = [
  { key: 'payrun', title: 'Pay run', line: 'An employer pays four employees. NEAR shows the payments, the room keeps who each payment was for, and one hash ties the two together.', runId: PAY_RUN, also: [{ id: '20261113T084451Z-1582', label: 'the same pay run, recorded earlier' }, { id: '20261113T041922Z-5bc2', label: 'a pay run without an approver' }] },
  { key: 'quotes', title: 'Sealed quotes', line: 'A buyer asks three invited makers for a price. Each maker seals a quote, and a public rule picks the winner.', runId: '20261113T123634Z-e25a',
    also: [{ id: '20261112T032438Z-98db', label: 'a second price round with a tie, and a bidder with no funds left out' }, { id: '20261112T032202Z-a3a8', label: 'the first sealed quote run' }],
    cast: [
      { role: 'tk', name: 'Buyer (the taker)', does: 'Seals a request to buy 2 units for at most 0.05 NEAR each, and deposits 0.2 NEAR.' },
      { role: 'm1', name: 'Maker 1, invited', does: 'Seals a bid of 0.02 and an ask of 0.03, good for 15 seconds.' },
      { role: 'm2', name: 'Maker 2, invited', does: 'Seals a bid of 0.02 and an ask of 0.04, good for 10 minutes.' },
      { role: 'm3', name: 'Maker 3, invited', does: 'Seals a bid of 0.02 and an ask of 0.045, with no deadline.' },
      { role: 'm4', name: 'Maker 4, not invited', does: 'Seals a bid of 0.01 and an ask of 0.02, good for 10 minutes.' } ],
    stages: [
      { title: 'Request', beat: 0, modelled: true, line: 'Buyer tk seals and signs a request to buy 2 units for at most 0.05 NEAR each, and deposits 0.2 NEAR into the group. Makers m1, m2 and m3 are invited to quote, and each seals and signs a bid and an ask. Account m4 wasn\'t invited and quotes anyway.', steps: ['set up'], claims: 'deposited' },
      { title: 'Dealer selection', beat: 0, modelled: true, line: 'The request names m1, m2 and m3 as the makers who may quote. The room read m4\'s quote, which had the lowest ask of all at 0.02, and set it aside because m4 isn\'t on the list. The room\'s reply lists m4 as an outsider.', steps: ['prediction 1 to 3'], claims: 'outsider' },
      { title: 'Quote expiry', beat: 1, modelled: true, line: 'Of the invited makers, m1 asked the least at 0.03, but its quote was only good for 15 seconds. The room cleared the round about 40 seconds after the quotes were sent, so it left m1\'s quote out and listed m1 as expired. Maker m2\'s quote was good for 10 minutes, and m3\'s had no deadline.', steps: ['prediction 1 to 3'], claims: 'expired|clocks agree' },
      { title: 'Selection', beat: 1, modelled: true, line: 'Two valid quotes were left, m2\'s ask of 0.04 and m3\'s ask of 0.045. Maker m2 asked less, so m2 won, and tk buys 2 units at 0.04 each. The room\'s reply doesn\'t contain m1\'s, m3\'s or m4\'s ask, or any bid.', steps: ['prediction 1 to 3'], claims: 'won|terms|nothing the room returned' },
      { title: 'Last look', beat: 1, modelled: false, line: 'On some real trading venues a dealer can still decline after the client accepts a quote. Midge leaves this out on purpose, because it would let a maker walk away from a quote the room had already picked.' },
      { title: 'Settlement', beat: 2, modelled: true, line: 'The room signed the result, and the contract charged tk exactly 0.08 NEAR and paid m2 exactly 0.08 NEAR. Only the payment is settled, and the units themselves aren\'t delivered.', steps: ['prediction 1 to 3'], claims: 'contract accepted|received exactly|was charged|order hash', tx: true } ] },
  { key: 'decision', title: 'Vote', line: 'Three members vote in private, and the room signs the decision. No money moves.', runId: '20261113T124816Z-9185',
    cast: [
      { role: 'ma', name: 'Member A', does: 'Votes for option A. Earlier, someone tried to cast a vote for this account using a key that isn\'t its own.' },
      { role: 'mb', name: 'Member B', does: 'Votes for option A.' },
      { role: 'mc', name: 'Member C', does: 'Votes for option B.' } ],
    stages: [
      { title: 'Rules and roll', beat: 0, modelled: true, line: 'The roll is ma, mb and mc. The room\'s signing key is the one the hardware attested, and nobody deposits because no money is involved.', steps: ['set up'], claims: 'settlement key|hatched' },
      { title: 'Voting', beat: 0, modelled: true, line: 'Before the vote, someone tried to cast a vote for ma with a key that isn\'t ma\'s, and the room refused it. Then ma and mb voted for option A and mc voted for option B, each sealed and signed with the member\'s own NEAR key.', steps: ['prediction 1 to 4'], claims: 'not the member' },
      { title: 'Tally and decision', beat: 1, modelled: true, decision: true, line: 'The room counts the votes and signs a decision that names A as the winner. The decision doesn\'t say how many votes each option got. Your browser checks the signature below.', steps: ['prediction 1 to 4'], claims: 'decision for A|browser verifier|changed winner' },
      { title: 'Challenge period', beat: 1, modelled: false, line: 'Many real votes leave time to challenge the result before it takes effect. Here the decision is final when the room signs it.' },
      { title: 'Nothing settles', beat: 2, modelled: true, line: 'The room refuses a request to settle this round, and it refuses to reopen the round. The group\'s funds, epoch and round number are the same on chain after the vote as before it. The contract only records payments, so it doesn\'t record the decision.', steps: ['prediction 1 to 4'], claims: 'settle that round|opened again|nothing moved' } ] },
  { key: 'ballot', title: 'Grant vote', line: 'Three members each put in 0.01 NEAR and vote on which of two accounts receives the 0.03 NEAR pool.', runId: '20261112T032730Z-3b68', also: [{ id: '20261112T173152Z-e25d', label: 'a weighted vote that must reach 60 percent' }],
    cast: [
      { role: 'ma', name: 'Member A', does: 'Deposits 0.05 NEAR and votes for option A.' },
      { role: 'mb', name: 'Member B', does: 'Deposits 0.05 NEAR and votes for option A.' },
      { role: 'mc', name: 'Member C', does: 'Deposits 0.05 NEAR and votes for option B.' },
      { role: 'ra', name: 'Recipient of option A', does: 'Receives the pool if option A wins.' },
      { role: 'rb', name: 'Recipient of option B', does: 'Receives the pool if option B wins.' } ],
    stages: [
      { title: 'Rules and roll', beat: 0, modelled: true, line: 'The roll is ma, mb and mc. Each deposits 0.05 NEAR into the group and will be charged a share of 0.01 NEAR. Option A pays account ra, and option B pays account rb.', steps: ['set up'], claims: 'deposit' },
      { title: 'Voting', beat: 0, modelled: true, line: 'The room refuses an unsigned vote, because this room only accepts signed inputs. It also refuses a vote for mc that is signed with a key that isn\'t mc\'s. Then ma and mb vote for A and mc votes for B, each signed with the member\'s own key, and the room accepts all three.', steps: ['wrong-key'], claims: 'refused|votes were accepted' },
      { title: 'Tally and result', beat: 1, modelled: true, line: 'The room counts the votes and publishes that option A won.', steps: ['wrong-key'], claims: 'wins' },
      { title: 'Challenge period', beat: 1, modelled: false, line: 'Many real votes leave time to challenge the result before it takes effect. Here the result settles at once.' },
      { title: 'Execution', beat: 2, modelled: true, line: 'The contract charges ma, mb and mc 0.01 NEAR each and pays ra the 0.03 NEAR pool.', steps: ['wrong-key'], claims: 'contract accepted|received|charged', tx: true } ] },
  { key: 'block', title: 'Block trade', line: 'Three buyers and two sellers place sealed orders, and the room crosses them at a public reference price of 0.01 NEAR per unit.', runId: '20261113T124032Z-1296', also: [{ id: '20261113T084759Z-13f0', label: 'the first block trade run, without a minimum fill' }],
    cast: [
      { role: 'b1', name: 'Buyer 1', does: 'Orders 6 units with a limit of 0.012, and deposits 0.08 NEAR.' },
      { role: 'b2', name: 'Buyer 2', does: 'Orders 4 units with a limit of 0.011 and a minimum fill of 3, and deposits 0.08 NEAR.' },
      { role: 'b3', name: 'Buyer 3', does: 'Orders 5 units with a limit of 0.009, and deposits 0.08 NEAR.' },
      { role: 's1', name: 'Seller 1', does: 'Offers 3 units with a limit of 0.009.' },
      { role: 's2', name: 'Seller 2', does: 'Offers 2 units with a limit of 0.01.' } ],
    stages: [
      { title: 'Indication of interest and firm-up', beat: 0, modelled: false, line: 'On real venues, traders first signal conditional interest, and both sides confirm before an order becomes firm. Here every order is firm from the start.' },
      { title: 'Firm orders', beat: 0, modelled: true, line: 'Buyers b1, b2 and b3 and sellers s1 and s2 each seal and sign an order with a side, a size and a limit price. The three buyers deposit 0.08 NEAR each.', steps: ['set up'], claims: 'deposit' },
      { title: 'Cross at the reference price', beat: 1, modelled: true, line: 'The reference price is 0.01. Buyer b3\'s limit of 0.009 is below it, so b3 is left out. The sellers offer 5 units in total, which is fewer than the 10 units b1 and b2 want, so the sellers fill in full and b1 and b2 share the 5 units in proportion to their orders. The room doesn\'t publish any limit price.', steps: ['prediction 1 to 3'], claims: 'matched|limit price' },
      { title: 'Minimum fill', beat: 1, modelled: true, line: 'In proportion, b2 would get 2 units, which is under its minimum of 3. The room cancels b2\'s order and runs the cross again, and b1 then fills all 5 units. The room reports that one order was cancelled, and it doesn\'t say whose.', steps: ['prediction 1 to 3'], claims: 'cancelled|names no one|is charged' },
      { title: 'Time priority', beat: 1, modelled: false, line: 'Some venues fill the earliest order first. Here the larger side is filled in proportion to order size, and the coordinator supplies the reference price, which the room doesn\'t check.' },
      { title: 'Settlement', beat: 2, modelled: true, line: 'The contract charges b1 0.05 NEAR, pays s1 0.03 NEAR and pays s2 0.02 NEAR. Accounts b2 and b3 aren\'t charged. Only the payment is settled, and the units themselves aren\'t delivered.', steps: ['prediction 1 to 3'], claims: 'contract accepted|received exactly|left', tx: true } ] },
  { key: 'pools', title: 'Pledge pool', line: 'Members pledge money to one recipient, up to a cap. When the pledges add up to more than the cap, the room scales every pledge down by the same share.', runId: '20261112T173152Z-e25d', also: [{ id: '20261112T031652Z-b62e', label: 'a running pool over three rounds, with a member who joins late' }],
    cast: [
      { role: 'ma', name: 'Member A', does: 'Deposits 0.05 NEAR and pledges 0.04.' },
      { role: 'mb', name: 'Member B', does: 'Deposits 0.05 NEAR and pledges 0.04.' },
      { role: 'mc', name: 'Member C', does: 'Deposits 0.05 NEAR and pledges 0.04.' },
      { role: 'rp', name: 'Recipient', does: 'Receives the pledges, up to a cap of 0.09 NEAR.' } ],
    stages: [
      { title: 'Pledges', beat: 0, modelled: true, line: 'Members ma, mb and mc each deposit 0.05 NEAR, and then each seals and signs a pledge of 0.04 NEAR for recipient rp, whose cap is 0.09 NEAR.', steps: ['set up'], claims: 'deposit' },
      { title: 'Scaling', beat: 1, modelled: true, line: 'The pledges add up to 0.12 NEAR, which is over the cap of 0.09 NEAR, so the room scales each pledge down to 0.03 NEAR. Nobody is left out, and the room doesn\'t publish any single pledge.', steps: ['pro-rata pool'], claims: 'outcome|each of the three' },
      { title: 'Payment to the recipient', beat: 2, modelled: true, line: 'The contract charges ma, mb and mc 0.03 NEAR each and pays rp the 0.09 NEAR total.', steps: ['pro-rata pool'], claims: 'contract accepted|received|charged', tx: true } ] },
];
const OTHER = [
  { id: '20261112T031407Z-8c64', label: 'Earlier pay run with invoices' },
  { id: '20261113T041922Z-5bc2', label: 'Pay run with the first AI review' },
  { id: '20261113T084451Z-1582', label: 'Pay run with maker-checker, first run' },
  { id: '20261112T032202Z-a3a8', label: 'Sealed quotes, buy side' },
  { id: '20261112T032438Z-98db', label: 'Sealed quotes, sell side' },
  { id: '20261112T032730Z-3b68', label: 'Ballot' },
  { id: '20261113T084759Z-13f0', label: 'Block trade, no minimum fill' },
  { id: '20261113T124816Z-9185', label: 'Vote with no payout' },
  { id: '20261113T123634Z-e25a', label: 'Sealed quotes with an expiry' },
  { id: '20261113T124032Z-1296', label: 'Block trade with a minimum fill' },
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
