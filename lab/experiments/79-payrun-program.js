import crypto from 'node:crypto';
import { buildPayrun } from '../../src/roost-service/payrun-program.js';
import { canonicalJson, leafHash, merkleRoot, merkleProof, verifyProof, verifyStatement, payrunOrderHash } from '../../src/roost-service/receipts.js';
import { HostedRoost } from '../../src/roost-service/hosted-roost.js';
import { generateClientKey, openFromModel, sealToModel } from '../../src/enclave/e2ee.js';
import { signInputWithNearKey, inputMessage, nearKeyPair } from '../../src/roost-service/signed-input.js';

const provider = { simulated: true, attest: async () => Buffer.from('lab-local-no-hardware'), info: async () => ({}) };
const NEAR = 10n ** 24n; const MICRO = 10n ** 18n;
const ROUND = { contractId: 'c.near', syndicateId: 'pay', epoch: 1, roundNonce: 'ab'.repeat(32) };
const employerKeys = nearKeyPair(); const otherKeys = nearKeyPair();
const keyCheck = async (id, pk) => (id === 'er.near' && pk === employerKeys.publicKey) || (id === 'other.near' && pk === otherKeys.publicKey);
const payeeKeys = Object.fromEntries(['a1', 'a2', 'a3', 'a4'].map((k) => [k, generateClientKey()]));
const auditorKey = generateClientKey(); const employerReadKey = generateClientKey();
const LINES = [['a1', 'Alice', '0.05'], ['a2', 'Bo', '0.04'], ['a3', 'Cy', '0.03'], ['a4', 'Di', '0.02']].map(([k, person, gross]) => ({ payee: `${k}.near`, person, invoiceId: `INV-${k}`, period: '2026-11', gross, tax: (Number(gross) * 0.15).toFixed(6), benefits: (Number(gross) * 0.05).toFixed(6), payeeKey: payeeKeys[k].publicKeyHex }));

export default {
  id: 'E-PAYRUN-PROGRAM-01',
  title: 'Pay-run room program: balanced lines, one-time payees, signed encrypted receipts under a Merkle root, auditor totals only',
  tier: 'offline',
  requires: [],
  hypothesis: 'The pay-run program pays each person their net (gross minus tax minus benefits) and the tax and benefits providers their totals, and charges the employer the gross total. The host builds a signed receipt per line under a Merkle root; a person decrypts only their own, the signature and proof verify, and the order hash recomputes from the root; a changed amount, a wrong proof or a wrong root fails; the auditor statement carries totals only. More than 8 recipients, an unbalanced line, or a pay run not sealed by the employer is refused. Two hosts produce the same root and order hash. The host signs only the allocations and charge it computed. Fails if any of these breaks.',
  limits: ['Offline, on local hosts with a simulated attestation provider and a stubbed account-key check. The amounts of every payment are public on NEAR once settled; receipts hide nothing on chain. A dishonest host could issue a wrong receipt; two hosts reduce that and this run uses one. Receipt privacy depends on each person keeping their key.'],
  async run(ctx) {
    await ctx.step('the receipts library: Merkle root, proofs, canonical form', async (s) => {
      const bad = [];
      for (let n = 1; n <= 12; n += 1) {
        const leaves = Array.from({ length: n }, (_, i) => leafHash({ v: 1, i, note: `line ${i}` })); const root = merkleRoot(leaves);
        for (let i = 0; i < n; i += 1) {
          const proof = merkleProof(leaves, i);
          if (!verifyProof(leaves[i], proof, root)) bad.push(`n=${n} i=${i} does not verify`);
          if (n > 1 && verifyProof(leaves[(i + 1) % n], proof, root)) bad.push(`n=${n} proof of ${i} verifies another leaf`);
          if (verifyProof(leafHash({ v: 1, i, note: 'tampered' }), proof, root)) bad.push(`n=${n} i=${i} tampered leaf verifies`);
          if (verifyProof(leaves[i], proof, merkleRoot([...leaves, leafHash({ extra: 1 })]))) bad.push(`n=${n} i=${i} verifies against a different root`);
        }
      }
      s.assert('for 1 to 12 leaves every proof verifies its own leaf and no other, a tampered leaf fails, and a different root fails', bad.length === 0, { actual: bad.slice(0, 3) });
      // known answers, computed here independently of the library: the tree's shape and the domain separation are part of the format a payee's own verifier must agree on
      const H = (parts) => crypto.createHash('sha256').update(Buffer.concat(parts)).digest('hex');
      const leaf = (o) => H([Buffer.from([0]), Buffer.from(JSON.stringify(o))]); const node = (l, r) => H([Buffer.from([1]), Buffer.from(l, 'hex'), Buffer.from(r, 'hex')]);
      s.assert('a leaf hash is sha256(0x00 || canonical JSON)', leafHash({ a: 1, b: 'x' }) === leaf({ a: 1, b: 'x' }));
      const L = [0, 1, 2, 3, 4].map((i) => leafHash({ i }));
      s.assert('three leaves make node(node(l0,l1), l2)', merkleRoot(L.slice(0, 3)) === node(node(L[0], L[1]), L[2]));
      s.assert('five leaves make node(node(node(l0,l1),node(l2,l3)), l4)', merkleRoot(L) === node(node(node(L[0], L[1]), node(L[2], L[3])), L[4]));
      s.assert('the proof for leaf 4 of 5 is a single left sibling, the root of the first four', JSON.stringify(merkleProof(L, 4)) === JSON.stringify([{ side: 'L', hash: node(node(L[0], L[1]), node(L[2], L[3])) }]));
      s.assert('the canonical form does not depend on key order', canonicalJson({ b: 1, a: { d: 2, c: 3 } }) === canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
      s.assert('a single-leaf tree has the leaf as its proof-less root', merkleProof([leafHash({ x: 1 })], 0).length === 0);
      s.assert('the order hash is a function of the run id and root only', payrunOrderHash('r1', 'aa') === payrunOrderHash('r1', 'aa') && payrunOrderHash('r1', 'aa') !== payrunOrderHash('r2', 'aa') && payrunOrderHash('r1', 'aa') !== payrunOrderHash('r1', 'ab'));
    });

    await ctx.step('the arithmetic: nets, totals, and what is refused', async (s) => {
      const r = buildPayrun({ lines: LINES, taxAddress: 'tax.near', benefitsAddress: 'ben.near' });
      s.assert('four people are paid their net (80% of gross): 0.04, 0.032, 0.024, 0.016', r.allocations.slice(0, 4).map((a) => BigInt(a.amount) / MICRO).join() === '40000,32000,24000,16000', { actual: r.allocations });
      s.assert('the tax authority gets the 15% total, 0.021, and the benefits provider the 5% total, 0.007', BigInt(r.allocations[4].amount) / MICRO === 21000n && r.allocations[4].recipient === 'tax.near' && BigInt(r.allocations[5].amount) / MICRO === 7000n && r.allocations[5].recipient === 'ben.near');
      s.assert('the allocations sum to the gross total, 0.14, which the employer is charged', r.allocations.reduce((x, a) => x + BigInt(a.amount), 0n) === 140000n * MICRO && r.grossMicro === 140000n);
      s.assert('there are six receipts, one per person and one each for tax and benefits', r.receipts.length === 6);
      s.assert('the totals are net 0.112, tax 0.021, benefits 0.007, headcount 4', r.totals.net === '0.112' && r.totals.tax === '0.021' && r.totals.benefits === '0.007' && r.totals.headcount === 4, { actual: r.totals });
      const refused = (lines, re, extra = {}) => { try { buildPayrun({ lines, taxAddress: 'tax.near', benefitsAddress: 'ben.near', ...extra }); return 'built'; } catch (e) { return re.test(e.message) ? true : e.message; } };
      s.assert('a line whose tax and benefits exceed the gross is refused', refused([{ ...LINES[0], tax: '0.04', benefits: '0.02' }], /exceed/) === true);
      s.assert('a line whose net is exactly zero is refused (gross 0.05, tax 0.04, benefits 0.01)', refused([{ ...LINES[0], tax: '0.04', benefits: '0.01' }], /net must be positive/) === true);
      s.assert('a zero gross is refused', refused([{ ...LINES[0], gross: '0' }], /gross/) === true);
      s.assert('two people on one address are refused', refused([LINES[0], { ...LINES[1], payee: LINES[0].payee }], /distinct/) === true);
      s.assert('a person paid to the tax authority\'s address is refused', refused([{ ...LINES[0], payee: 'tax.near' }], /distinct|tax/) === true);
      s.assert('seven people plus tax and benefits is nine recipients: refused (at most 8)', refused(Array.from({ length: 7 }, (_, i) => ({ ...LINES[0], payee: `p${i}.near`, invoiceId: `I${i}` })), /at most 8/) === true);
      s.assert('an amount with more than 6 decimal places is refused', refused([{ ...LINES[0], gross: '0.0500001' }], /decimal|gross/) === true);
      const zeroTax = buildPayrun({ lines: LINES.map((l) => ({ ...l, tax: '0', benefits: '0' })), taxAddress: 'tax.near', benefitsAddress: 'ben.near' });
      s.assert('with no deductions the tax and benefits transfers are omitted (4 allocations, 4 receipts)', zeroTax.allocations.length === 4 && zeroTax.receipts.length === 4);
    });

    await ctx.step('the host: statements, verification, tampering, and what it signs', async (s) => {
      const mk = (opts = {}) => { const r = new HostedRoost({ provider, requireSignedInputs: true, accountKeyCheck: keyCheck, ...opts }); r.openRound(ROUND); return r; };
      const submit = async (r, who, keys, body, seq = 1) => { const cipherTextHex = sealToModel(JSON.stringify(body), r.intentPublicKey); return r.submitSignedIntent({ flyerId: who, cipherTextHex, publicKey: keys.publicKey, signature: signInputWithNearKey(keys.secretKey, inputMessage({ ...ROUND, flyerId: who, seq, cipherTextHex })), seq }); };
      const params = { employer: 'er.near', taxAddress: 'tax.near', benefitsAddress: 'ben.near', employerKeyHex: employerReadKey.publicKeyHex, auditorKeyHex: auditorKey.publicKeyHex, runId: 'run-2026-11' };
      const refused = (fn, re) => { try { fn(); return 'ran'; } catch (e) { return re.test(e.message) ? true : e.message; } };
      s.assert('a host that does not require signed inputs refuses to run a pay run', refused(() => new HostedRoost({ provider }).runPayrun(params), /signed/) === true);
      let host = mk(); await submit(host, 'er.near', employerKeys, { lines: LINES });
      const out = host.runPayrun(params);
      s.assert('the public outcome names the run, the root, the headcount and the gross total, and no names or per-person amounts', out.outcome.runId === 'run-2026-11' && /^[0-9a-f]{64}$/.test(out.outcome.receiptsRoot) && out.outcome.lines === 4 && !JSON.stringify(out.outcome).match(/Alice|INV-|a1\.near/), { actual: out.outcome });
      s.assert('the order hash is the one recomputed from the run id and the root', out.orderHash === payrunOrderHash('run-2026-11', out.outcome.receiptsRoot));
      s.assert('the employer is charged the gross total, 0.14, once', out.charges.length === 1 && out.charges[0].member === 'er.near' && BigInt(out.charges[0].amount) === 14n * NEAR / 100n);
      s.assert('the settlement message has 7 fields', host.signSettlement({ ...ROUND, allocations: out.allocations, orderHash: out.orderHash, charges: out.charges }).message.split(':').length === 7);
      // each person verifies their own statement
      const hostKey = out.settlePublicKey; const checks = {};
      for (const k of ['a1', 'a2', 'a3', 'a4']) { const v = verifyStatement({ cipherHex: out.statements.payees[`${k}.near`].cipherHex, secretX25519: payeeKeys[k].secretX25519, hostSettlePublicKey: hostKey, onChainOrderHash: out.orderHash }); checks[k] = v.ok && v.receipt.payee === `${k}.near`; }
      s.assert('all four people verify their own receipt: decrypts, host signature, Merkle proof, and the order hash', Object.values(checks).every(Boolean), { actual: checks });
      const mine = verifyStatement({ cipherHex: out.statements.payees['a1.near'].cipherHex, secretX25519: payeeKeys.a1.secretX25519, hostSettlePublicKey: hostKey, onChainOrderHash: out.orderHash }).receipt;
      s.assert('a1\'s receipt carries their own breakdown: gross 0.05, tax 0.0075, benefits 0.0025, net 0.04', mine.gross === '0.05' && mine.tax === '0.0075' && mine.benefits === '0.0025' && mine.net === '0.04', { actual: mine });
      s.assert('a person cannot open someone else\'s statement', verifyStatement({ cipherHex: out.statements.payees['a2.near'].cipherHex, secretX25519: payeeKeys.a1.secretX25519, hostSettlePublicKey: hostKey, onChainOrderHash: out.orderHash }).ok === false);
      s.assert('a statement checked against another run\'s order hash fails', verifyStatement({ cipherHex: out.statements.payees['a1.near'].cipherHex, secretX25519: payeeKeys.a1.secretX25519, hostSettlePublicKey: hostKey, onChainOrderHash: payrunOrderHash('another-run', out.outcome.receiptsRoot) }).ok === false);
      s.assert('a statement checked against the wrong host key fails', verifyStatement({ cipherHex: out.statements.payees['a1.near'].cipherHex, secretX25519: payeeKeys.a1.secretX25519, hostSettlePublicKey: crypto.randomBytes(32).toString('hex'), onChainOrderHash: out.orderHash }).ok === false);
      // tamper: the host's own statement for a1, edited and re-encrypted by an attacker who knows a1's public key
      const doc = JSON.parse(openFromModel(out.statements.payees['a1.near'].cipherHex, payeeKeys.a1.secretX25519));
      const forged = (mut) => sealToModel(JSON.stringify(mut(JSON.parse(JSON.stringify(doc)))), payeeKeys.a1.publicKeyHex);
      const vf = (cipher) => verifyStatement({ cipherHex: cipher, secretX25519: payeeKeys.a1.secretX25519, hostSettlePublicKey: hostKey, onChainOrderHash: out.orderHash });
      s.assert('a receipt with the net changed to 0.05 fails (signature and proof)', vf(forged((d) => { d.receipt.net = '0.05'; return d; })).ok === false);
      s.assert('a receipt moved to another payee address fails', vf(forged((d) => { d.receipt.payee = 'thief.near'; return d; })).ok === false);
      s.assert('a receipt with a proof from another line fails', vf(forged((d) => { d.proof = JSON.parse(openFromModel(out.statements.payees['a2.near'].cipherHex, payeeKeys.a2.secretX25519)).proof; return d; })).ok === false);
      s.assert('a receipt with a forged root fails', vf(forged((d) => { d.receiptsRoot = 'ab'.repeat(32); return d; })).ok === false);
      // the auditor and the employer
      const aud = JSON.parse(openFromModel(out.statements.auditor.cipherHex, auditorKey.secretX25519));
      s.assert('the auditor sees totals and the root only: no name, address, invoice or individual amount', Object.keys(aud).sort().join() === ['benefits', 'gross', 'headcount', 'net', 'receiptsRoot', 'runId', 'tax'].sort().join() && !JSON.stringify(aud).match(/Alice|a1\.near|INV-|0\.032/), { actual: aud });
      s.assert('the auditor\'s totals are net 0.112, tax 0.021, benefits 0.007, gross 0.14', aud.net === '0.112' && aud.tax === '0.021' && aud.benefits === '0.007' && aud.gross === '0.14');
      const emp = JSON.parse(openFromModel(out.statements.employer.cipherHex, employerReadKey.secretX25519));
      s.assert('the employer sees every line, with names', emp.lines.length === 6 && emp.lines.some((l) => l.receipt.person === 'Alice'));
      // refusals
      host = mk(); await submit(host, 'er.near', employerKeys, { lines: LINES });
      const moved = host.runPayrun(params); const thief = moved.allocations.map((a, i) => (i === 0 ? { ...a, recipient: 'thief.near' } : a));
      s.assert('paying the first person\'s net to another address is refused', refused(() => host.signSettlement({ ...ROUND, allocations: thief, orderHash: moved.orderHash, charges: moved.charges }), /allocations do not match/) === true);
      host = mk(); await submit(host, 'er.near', employerKeys, { lines: LINES }); const o2 = host.runPayrun(params); const heavy = [{ ...o2.charges[0], amount: String(BigInt(o2.charges[0].amount) * 2n) }];
      s.assert('charging the employer twice the gross is refused', refused(() => host.signSettlement({ ...ROUND, allocations: o2.allocations, orderHash: o2.orderHash, charges: heavy }), /charges do not match/) === true);
      host = mk(); await submit(host, 'other.near', otherKeys, { lines: LINES });
      s.assert('a pay run sealed by someone other than the employer is refused', refused(() => host.runPayrun(params), /employer/) === true);
      host = mk(); await submit(host, 'er.near', employerKeys, { lines: [{ ...LINES[0], tax: '0.05', benefits: '0.05' }] });
      s.assert('an unbalanced line is refused', refused(() => host.runPayrun(params), /exceed/) === true);
      // two hosts
      const A = mk({ deterministicOrder: true }); const B = mk({ deterministicOrder: true });
      await submit(A, 'er.near', employerKeys, { lines: LINES }); await submit(B, 'er.near', employerKeys, { lines: [...LINES].reverse() });
      const oa = A.runPayrun(params); const ob = B.runPayrun(params);
      s.assert('the same pay run listed in a different order gives the same root (lines are put in a canonical order by payee address)', (() => { const x = buildPayrun({ lines: LINES, taxAddress: 'tax.near', benefitsAddress: 'ben.near', runId: 'r' }); const y = buildPayrun({ lines: [...LINES].reverse(), taxAddress: 'tax.near', benefitsAddress: 'ben.near', runId: 'r' }); return JSON.stringify(x.receipts) === JSON.stringify(y.receipts) && JSON.stringify(x.allocations) === JSON.stringify(y.allocations); })());
      s.assert('two hosts given the lines in opposite orders produce the same root, order hash and allocations (as sets)', oa.orderHash === ob.orderHash && oa.outcome.receiptsRoot === ob.outcome.receiptsRoot && JSON.stringify([...oa.allocations].sort((x, y) => (x.recipient < y.recipient ? -1 : 1))) === JSON.stringify([...ob.allocations].sort((x, y) => (x.recipient < y.recipient ? -1 : 1))));
    });
  },
};
