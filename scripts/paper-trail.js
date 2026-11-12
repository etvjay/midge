#!/usr/bin/env node
/**
 * The pay run paper trail, end to end, on this machine, with the real room code.
 *
 *   npm run demo:paper-trail
 *
 * It runs the same HostedRoost that runs on Phala hardware, with a simulated attestation provider and a stubbed account-key check, so it
 * proves the logic and not the hardware. The hardware run of the same flow is docs/lab-runs/20261112T031407Z-8c64.
 * It prints what NEAR would show, what only the room holds, and the checks that tie them together, and exits 1 if any check fails.
 */
import crypto from 'node:crypto';
import { HostedRoost } from '../src/roost-service/hosted-roost.js';
import { generateClientKey, openFromModel, sealToModel } from '../src/enclave/e2ee.js';
import { signInputWithNearKey, inputMessage, nearKeyPair } from '../src/roost-service/signed-input.js';
import { signInvoice, invoiceHash } from '../src/roost-service/invoice.js';
import { verifyAuditorPack, auditOpenMessage } from '../src/roost-service/auditor.js';
import { verifyStatement } from '../src/roost-service/receipts.js';
import { analyseRun } from '../src/advisor/payrun-analyst.js';

const provider = { simulated: true, attest: async () => Buffer.from('local-demo-no-hardware'), info: async () => ({}) };
const ROUND = { contractId: 'c.demo.testnet', syndicateId: 'payroll-demo', epoch: 1, roundNonce: 'ab'.repeat(32) };
const employerKeys = nearKeyPair();
const keyCheck = async (id, pk) => id === 'employer.testnet' && pk === employerKeys.publicKey;

const PEOPLE = [
  ['Alice', '0.05', '0.0075', '0.0025'],
  ['Bo', '0.04', '0.006', '0.002'],
  ['Cy', '0.03', '0.0045', '0.0015'],
  ['Dee', '0.06', '0.009', '0.003'],
];
const payeeKeys = PEOPLE.map(() => generateClientKey());
const invoiceKeys = PEOPLE.map(() => crypto.generateKeyPairSync('ed25519'));
const auditorKey = generateClientKey();
const employerReadKey = generateClientKey();
const addr = (i) => `p${crypto.createHash('sha256').update(`one-time-${i}-${crypto.randomBytes(8).toString('hex')}`).digest('hex').slice(0, 12)}.testnet`;
const LINES = PEOPLE.map(([person, gross, tax, benefits], i) => ({ payee: addr(i), person, invoiceId: `INV-${person.toUpperCase()}`, period: '2026-11', gross, tax, benefits, payeeKey: payeeKeys[i].publicKeyHex }));
const bodyFor = (l, over = {}) => ({ invoiceId: l.invoiceId, period: l.period, chain: 'near', address: l.payee, asset: 'NEAR', amount: l.gross, ...over });
const PARAMS = { employer: 'employer.testnet', taxAddress: 'tax-office.testnet', benefitsAddress: 'benefits-fund.testnet', employerKeyHex: employerReadKey.publicKeyHex, auditorKeyHex: auditorKey.publicKeyHex, runId: 'run-2026-11', requireInvoices: true };

const YOCTO = 10n ** 24n;
const near = (y) => { const v = BigInt(y); const w = v / YOCTO; const f = (v % YOCTO).toString().padStart(24, '0').slice(0, 6).replace(/0+$/, ''); return f ? `${w}.${f}` : `${w}`; };
const micro = (s) => { const [w, f = ''] = String(s).split('.'); return BigInt(w) * 1_000_000n + BigInt(f.padEnd(6, '0').slice(0, 6)); };
let failures = 0;
const say = (s = '') => console.log(s);
const check = (ok, text) => { if (!ok) failures += 1; say(`  ${ok ? '✓' : '✗'} ${text}`); return ok; };
const head = (n, t) => { say(); say(`${n}. ${t}`); };

const mkRoom = () => { const r = new HostedRoost({ provider, requireSignedInputs: true, accountKeyCheck: keyCheck }); r.openRound(ROUND); return r; };
const sendInvoice = (r, inv) => r.submitInvoice({ cipherTextHex: sealToModel(JSON.stringify(inv), r.intentPublicKey) });
const sendRun = async (r, lines) => { const cipherTextHex = sealToModel(JSON.stringify({ lines }), r.intentPublicKey); return r.submitSignedIntent({ flyerId: 'employer.testnet', cipherTextHex, publicKey: employerKeys.publicKey, signature: signInputWithNearKey(employerKeys.secretKey, inputMessage({ ...ROUND, flyerId: 'employer.testnet', seq: 1, cipherTextHex })), seq: 1 }); };

say('Midge pay run: the paper trail');
say('A local room with a simulated attestation (the hardware run of this flow is docs/lab-runs/20261112T031407Z-8c64).');

head(1, 'Each payee signs an invoice, sealed to the room');
const bad = mkRoom();
LINES.forEach((l, i) => sendInvoice(bad, signInvoice(bodyFor(l, l.person === 'Dee' ? { amount: '0.065' } : {}), invoiceKeys[i].privateKey)));
await sendRun(bad, LINES);
let refusal = null; try { bad.runPayrun(PARAMS); } catch (e) { refusal = e.message; }
check(refusal !== null && /does not match/.test(refusal), 'Dee\'s invoice says 0.065 and the employer approved 0.06, so the room refuses the whole run');
if (refusal) say(`    ${refusal.slice(0, 150)}`);
check(bad.sealedIntents.length >= 1, 'the employer\'s queued run is kept, so nothing is lost');

head(2, 'The corrected run: invoices match, the room builds the run');
const room = mkRoom();
const accepted = LINES.map((l, i) => sendInvoice(room, signInvoice(bodyFor(l), invoiceKeys[i].privateKey)));
check(accepted.every((a) => a.accepted), 'four invoices accepted, each signed by its payee');
await sendRun(room, LINES);
const out = room.runPayrun(PARAMS);
check(out.outcome.invoicesMatched === 4, 'every line matched its invoice field by field');

head(3, 'What NEAR will show (public)');
say('  to                                  amount');
for (const a of out.allocations) say(`  ${a.recipient.padEnd(36)}${near(a.amount)}`);
say(`  employer charged                    ${near(out.charges[0].amount)}`);
say(`  order hash                          ${out.orderHash.slice(0, 16)}…`);
say('  The addresses are one-time. NEAR shows amounts and addresses, and it does not show who each address belongs to.');

head(4, 'What only the room holds, and the people it shows (private)');
const employerDoc = JSON.parse(openFromModel(out.statements.employer.cipherHex, employerReadKey.secretX25519));
say('  person   gross    tax      benefits net      invoice hash');
const payLines = employerDoc.lines.filter((l) => l.receipt.kind === 'pay');
for (const l of payLines) say(`  ${l.receipt.person.padEnd(9)}${l.receipt.gross.padEnd(9)}${l.receipt.tax.padEnd(9)}${l.receipt.benefits.padEnd(9)}${l.receipt.net.padEnd(9)}${(l.receipt.invoiceHash || '').slice(0, 12)}…`);

head(5, 'The sub-transaction view: the private lines add up to the public transfers');
const moved = Object.fromEntries(out.allocations.map((a) => [a.recipient, BigInt(a.amount)]));
const taxLines = payLines.reduce((x, l) => x + micro(l.receipt.tax), 0n);
const benLines = payLines.reduce((x, l) => x + micro(l.receipt.benefits), 0n);
check(taxLines * 10n ** 18n === moved[PARAMS.taxAddress], `the ${payLines.length} tax lines add up to the one tax transfer (${near(moved[PARAMS.taxAddress])})`);
check(benLines * 10n ** 18n === moved[PARAMS.benefitsAddress], `the ${payLines.length} benefits lines add up to the one benefits transfer (${near(moved[PARAMS.benefitsAddress])})`);
check(payLines.every((l) => micro(l.receipt.net) * 10n ** 18n === moved[l.receipt.payee]), 'each person\'s net equals the transfer to their one-time address');
const grossLines = payLines.reduce((x, l) => x + micro(l.receipt.gross), 0n);
check(grossLines * 10n ** 18n === BigInt(out.charges[0].amount), `the gross lines add up to what the employer is charged (${near(out.charges[0].amount)})`);
const everyTransfer = Object.values(moved).reduce((x, y) => x + y, 0n);
check(everyTransfer === BigInt(out.charges[0].amount), 'every transfer together equals the employer\'s charge, so nothing is created or lost');

head(6, 'Each payee checks their own receipt against the order hash');
const verdicts = LINES.map((l, i) => verifyStatement({ cipherHex: out.statements.payees[l.payee].cipherHex, secretX25519: payeeKeys[i].secretX25519, hostSettlePublicKey: out.settlePublicKey, onChainOrderHash: out.orderHash }));
check(verdicts.every((v) => v.ok), 'all four receipts decrypt, carry the room\'s signature, and their Merkle proof leads to the order hash');
const aliceDoc = JSON.parse(openFromModel(out.statements.payees[LINES[0].payee].cipherHex, payeeKeys[0].secretX25519));
check(aliceDoc.receipt.invoiceHash === invoiceHash(bodyFor(LINES[0])), 'Alice\'s receipt carries the hash of the invoice she signed');
aliceDoc.receipt.net = '0.05';
const forged = verifyStatement({ cipherHex: sealToModel(JSON.stringify(aliceDoc), payeeKeys[0].publicKeyHex), secretX25519: payeeKeys[0].secretX25519, hostSettlePublicKey: out.settlePublicKey, onChainOrderHash: out.orderHash });
check(forged.ok === false, 'a receipt with the net raised to 0.05 fails verification');
let wrongKey = true; try { wrongKey = verifyStatement({ cipherHex: out.statements.payees[LINES[1].payee].cipherHex, secretX25519: payeeKeys[0].secretX25519, hostSettlePublicKey: out.settlePublicKey, onChainOrderHash: out.orderHash }).ok; } catch { wrongKey = false; }
check(wrongKey === false, 'Alice\'s key cannot open Bo\'s receipt');

head(7, 'The auditor sees only the lines the employer opens');
const idxInRun = employerDoc.lines.findIndex((l) => l.receipt.person === 'Bo');
const signature = signInputWithNearKey(employerKeys.secretKey, auditOpenMessage({ runId: PARAMS.runId, indices: [idxInRun], auditorKeyHex: auditorKey.publicKeyHex }));
const opened = await room.openAuditLines({ runId: PARAMS.runId, indices: [idxInRun], auditorKeyHex: auditorKey.publicKeyHex, employer: 'employer.testnet', publicKey: employerKeys.publicKey, signature });
const pack = JSON.parse(openFromModel(opened.packCipherHex, auditorKey.secretX25519));
check(verifyAuditorPack(pack, out.orderHash).ok, 'the auditor checks the opened line against the order hash on chain');
check(pack.opened.length === 1 && pack.opened[0].leaf.person === 'Bo', 'the pack holds Bo\'s line and no other');
check(!JSON.stringify(pack).includes('Alice') && !JSON.stringify(pack).includes('Cy') && !JSON.stringify(pack).includes('Dee'), 'it names no other person');
let stranger = 'accepted'; try { await room.openAuditLines({ runId: PARAMS.runId, indices: [idxInRun], auditorKeyHex: auditorKey.publicKeyHex, employer: 'employer.testnet', publicKey: nearKeyPair().publicKey, signature: 'aa'.repeat(64) }); } catch (e) { stranger = e.message; }
check(/signature|not a key/.test(stranger), 'a request not signed by the employer\'s key is refused');
const totals = JSON.parse(openFromModel(out.statements.auditor.cipherHex, auditorKey.secretX25519));
check(!/(Alice|Bo|Cy|Dee|\.testnet)/.test(JSON.stringify(totals)), `a totals-only view for an accountant carries no name or address (gross ${totals.gross}, tax ${totals.tax}, benefits ${totals.benefits}, net ${totals.net})`);

head(8, 'What an outsider could still work out, flagged by the code');
const a = analyseRun({ lines: LINES });
const flagged = a.flags.map((f) => `${f.line}: ${f.code}`);
say(`  ${flagged.length ? flagged.join(', ') : 'no linkability flags'}`);
say('  Amounts are public, so a person with a unique and unchanged salary can be matched across months. The optional AI review (off by default) explains these flags; it never changes a run.');

say();
say(failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
