#!/usr/bin/env node
/**
 * Build the replay page's data and script:   npm run build:replay
 *   site/replay/replay.data.js    the recorded runs (their raw events.jsonl and summary.json), the contract's recorded code hash, and a pay run
 *                                 paper trail made by the real room code on this machine (a simulated attestation, disposable demo keys)
 *   site/replay/replay.bundle.js  the page script with the browser client and verifier bundled in
 * With --preview <file> it also writes one self-contained HTML file (for viewing without a server).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { build } from 'esbuild';
import { HostedRoost } from '../src/roost-service/hosted-roost.js';
import { generateClientKey, openFromModel, sealToModel } from '../src/enclave/e2ee.js';
import { signInputWithNearKey, inputMessage, nearKeyPair } from '../src/roost-service/signed-input.js';
import { signInvoice } from '../src/roost-service/invoice.js';
import { auditOpenMessage } from '../src/roost-service/auditor.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const hex = (u8) => Buffer.from(u8).toString('hex');

const FEATURED = [
  { id: '20261112T031407Z-8c64', label: 'Pay run', blurb: 'Signed invoices, a refused mismatch, exact transfers, private receipts and an auditor pack.', kind: 'Real hardware' },
  { id: '20261112T032202Z-a3a8', label: 'Sealed quote, buy side', blurb: 'The lowest eligible ask wins and is paid its own ask.', kind: 'Real hardware' },
  { id: '20261112T032438Z-98db', label: 'Sealed quote, sell side', blurb: 'An unfunded high bidder is left out by name, and the second price is charged.', kind: 'Real hardware' },
  { id: '20261112T032730Z-3b68', label: 'Signed ballot', blurb: 'A vote signed with the wrong key is refused, and three real votes settle.', kind: 'Real hardware' },
  { id: '20261112T031652Z-b62e', label: 'Pools and a lending quote', blurb: 'Pools of sealed amounts, a late depositor, then a lending quote.', kind: 'Real hardware' },
  { id: '20261112T173152Z-e25d', label: 'Weighted ballot and pro-rata pool', blurb: 'A vote below its bar decides nothing, the same votes on the bar settle, and an oversubscribed pool is scaled.', kind: 'Real hardware' },
  { id: '20261112T173632Z-569c', label: 'AI review of a pay run', blurb: 'An attested NEAR AI Cloud model reviews a redacted run, and code checks every finding.', kind: 'Attested model' },
  { id: '20261112T173516Z-5565', label: 'A run that failed', blurb: 'The same review, first try. It failed and is kept: the model was right and the code\'s check was too strict.', kind: 'Kept failure' },
];

function paperTrail() {
  const provider = { simulated: true, attest: async () => Buffer.from('replay-demo-no-hardware'), info: async () => ({}) };
  const ROUND = { contractId: 'c.demo.testnet', syndicateId: 'payroll-demo', epoch: 1, roundNonce: 'ab'.repeat(32) };
  const employerKeys = nearKeyPair();
  const PEOPLE = [['Alice', '0.05', '0.0075', '0.0025'], ['Bo', '0.04', '0.006', '0.002'], ['Cy', '0.03', '0.0045', '0.0015'], ['Dee', '0.06', '0.009', '0.003']];
  const payeeKeys = PEOPLE.map(() => generateClientKey());
  const invoiceKeys = PEOPLE.map(() => crypto.generateKeyPairSync('ed25519'));
  const auditorKey = generateClientKey(); const employerReadKey = generateClientKey();
  const addr = (i) => `p${crypto.createHash('sha256').update(`one-time-${i}-${crypto.randomBytes(8).toString('hex')}`).digest('hex').slice(0, 12)}.testnet`;
  const LINES = PEOPLE.map(([person, gross, tax, benefits], i) => ({ payee: addr(i), person, invoiceId: `INV-${person.toUpperCase()}`, period: '2026-11', gross, tax, benefits, payeeKey: payeeKeys[i].publicKeyHex }));
  const bodyFor = (l, over = {}) => ({ invoiceId: l.invoiceId, period: l.period, chain: 'near', address: l.payee, asset: 'NEAR', amount: l.gross, ...over });
  const PARAMS = { employer: 'employer.testnet', taxAddress: 'tax-office.testnet', benefitsAddress: 'benefits-fund.testnet', employerKeyHex: employerReadKey.publicKeyHex, auditorKeyHex: auditorKey.publicKeyHex, runId: 'run-2026-11', requireInvoices: true };
  const mk = () => { const r = new HostedRoost({ provider, requireSignedInputs: true, accountKeyCheck: async (id, pk) => id === 'employer.testnet' && pk === employerKeys.publicKey }); r.openRound(ROUND); return r; };
  const sendRun = async (r) => { const cipherTextHex = sealToModel(JSON.stringify({ lines: LINES }), r.intentPublicKey); return r.submitSignedIntent({ flyerId: 'employer.testnet', cipherTextHex, publicKey: employerKeys.publicKey, signature: signInputWithNearKey(employerKeys.secretKey, inputMessage({ ...ROUND, flyerId: 'employer.testnet', seq: 1, cipherTextHex })), seq: 1 }); };
  return (async () => {
    const bad = mk();
    LINES.forEach((l, i) => bad.submitInvoice({ cipherTextHex: sealToModel(JSON.stringify(signInvoice(bodyFor(l, l.person === 'Dee' ? { amount: '0.065' } : {}), invoiceKeys[i].privateKey)), bad.intentPublicKey) }));
    await sendRun(bad); let refusal = ''; try { bad.runPayrun(PARAMS); } catch (e) { refusal = e.message; }
    const room = mk();
    LINES.forEach((l, i) => room.submitInvoice({ cipherTextHex: sealToModel(JSON.stringify(signInvoice(bodyFor(l), invoiceKeys[i].privateKey)), room.intentPublicKey) }));
    await sendRun(room); const out = room.runPayrun(PARAMS);
    const employerDoc = JSON.parse(openFromModel(out.statements.employer.cipherHex, employerReadKey.secretX25519));
    const boIdx = employerDoc.lines.findIndex((l) => l.receipt.person === 'Bo');
    const signature = signInputWithNearKey(employerKeys.secretKey, auditOpenMessage({ runId: PARAMS.runId, indices: [boIdx], auditorKeyHex: auditorKey.publicKeyHex }));
    const opened = await room.openAuditLines({ runId: PARAMS.runId, indices: [boIdx], auditorKeyHex: auditorKey.publicKeyHex, employer: 'employer.testnet', publicKey: employerKeys.publicKey, signature });
    return {
      note: 'Made by the real room code on the machine that built this page, with a simulated attestation and disposable demo keys. The hardware run of the same flow is the pay run above.',
      runId: PARAMS.runId, orderHash: out.orderHash, settlePublicKey: out.settlePublicKey, taxAddress: PARAMS.taxAddress, benefitsAddress: PARAMS.benefitsAddress,
      refusal, allocations: out.allocations, charged: out.charges[0].amount,
      people: LINES.map((l, i) => ({ name: l.person, payee: l.payee, cipherHex: out.statements.payees[l.payee].cipherHex, publicKeyHex: payeeKeys[i].publicKeyHex, secretHex: hex(payeeKeys[i].secretX25519) })),
      employer: { cipherHex: out.statements.employer.cipherHex, secretHex: hex(employerReadKey.secretX25519) },
      auditor: { packCipherHex: opened.packCipherHex, totalsCipherHex: out.statements.auditor.cipherHex, secretHex: hex(auditorKey.secretX25519), openedName: 'Bo' },
    };
  })();
}

const deployments = JSON.parse(read('docs/canonical/deployments.json'));
const runs = FEATURED.map((f) => {
  const dir = `docs/lab-runs/${f.id}`;
  return { ...f, eventsText: read(`${dir}/events.jsonl`), summaryText: read(`${dir}/summary.json`) };
});
const data = {
  builtAt: new Date().toISOString(),
  contract: { id: deployments.contract, codeHash: deployments.deployments.at(-1).codeHash, rpcUrls: ['https://test.rpc.fastnear.com', 'https://near-testnet.drpc.org'] },
  runs,
  paperTrail: await paperTrail(),
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
