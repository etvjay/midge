import crypto from 'node:crypto';
import { startMockGateway, MODEL as MOCK_MODEL } from '../../verifications/09-model-sealed-roost.js';
import { AttestedAdvisor, AdvisorError, verifyAdviceRecord, checkReceipt, chooseAllocations, validateProposal, parseMicro, formatMicro, microToYocto, proportionalSplit } from '../../src/advisor/attested-advisor.js';
import { computeAllocationsHash } from '../../src/roost-service/hosted-roost.js';
import { fetchVerifiedModelKey } from '../../src/enclave/attestation.js';

const RECIPIENTS = [{ id: 'a.testnet', weight: 3 }, { id: 'b.testnet', weight: 2 }, { id: 'c.testnet', weight: 1 }];
const rows = (r) => JSON.stringify({ allocations: r.map(([recipient, amount]) => ({ recipient, amount })) });
const RULE = rows([['a.testnet', '0.030000'], ['b.testnet', '0.020000'], ['c.testnet', '0.010000']]);

export default {
  id: 'E-ADVISOR-MODEL',
  title: 'The attested advisor: honest answers verify, wrong answers are caught, and tampering with the record is detected',
  tier: 'offline',
  requires: [],
  hypothesis: 'An advisor that asks an attested model to split an amount among recipients returns a proposal that is validated strictly and a record that anyone can check: the model\'s signature over the exact request and response, the decrypted allocations, and their hash against the chain. The failures that must NOT happen: a proposal that pays more than the total or someone not listed is accepted; an answer that was not sealed, was tampered with or was not signed by the attested key is accepted; or a record that was edited afterwards still verifies.',
  limits: [
    'The "model" is a mock gateway that implements the NEAR AI Cloud protocol (E2EE v2, signed receipts) and replies with whatever each test scripts. It tests the advisor\'s checks, not the quality of any real model. The live model is E-ADVISOR-LIVE-01.',
    'The attestation is the mock\'s (certificate-chain verification is skipped here); the live experiment requires it.',
    'A proposal that is valid and off the rule is accepted or rejected by policy (requireRule), not by the contract: the contract has no notion of "the rule".',
  ],
  async run(ctx) {
    const gw = await startMockGateway();
    const advisor = (opts = {}) => new AttestedAdvisor({ apiKey: 'test-key', baseUrl: gw.url, model: MOCK_MODEL, chain: 'skip', ...opts });
    const ask = (reply, mode = {}) => { gw.state.mode = { scriptedReply: () => reply, ...mode }; return advisor().proposeAllocation({ totalNear: '0.06', recipients: RECIPIENTS }); };
    const onChainHash = (allocs) => computeAllocationsHash(allocs);
    try {
      await ctx.step('exact arithmetic helpers', async (s) => {
        s.assert('parseMicro reads at most six decimals and refuses seven, negatives and junk', parseMicro('0.06') === 60000n && [() => parseMicro('0.0000001'), () => parseMicro('-1'), () => parseMicro('1e3'), () => parseMicro(0.06)].every((f) => { try { f(); return false; } catch { return true; } }));
        s.assert('formatMicro and microToYocto round-trip', formatMicro(60000n) === '0.060000' && microToYocto(60000n) === '60000000000000000000000');
        const split = proportionalSplit(60000n, RECIPIENTS);
        s.assert('the rule 3:2:1 of 0.06 is 0.03, 0.02, 0.01 exactly', split.map((x) => x.micro).join() === '30000,20000,10000');
        s.assert('a total that does not divide is floored and never exceeds the total', proportionalSplit(10n, [{ id: 'x', weight: 1 }, { id: 'y', weight: 1 }, { id: 'z', weight: 1 }]).reduce((a, r) => a + r.micro, 0n) === 9n);
      });

      await ctx.step('an honest answer: validated, matches the rule, and its record verifies end to end', async (s) => {
        const p = await ask(RULE);
        s.assert('the proposal is valid and equals the rule', p.validation.ok && p.sameAsRule, { actual: p.validation.problems });
        const allocs = p.validation.allocations;
        s.assert('the allocations are in the contract\'s shape: recipient and a yocto string', allocs.length === 3 && allocs.every((a) => /^\d+$/.test(a.amount)) && allocs[0].amount === '30000000000000000000000');
        const rep = await verifyAdviceRecord(p.record, { onChainAllocationsHash: onChainHash(allocs), freshAttestation: () => fetchVerifiedModelKey({ baseUrl: gw.url, model: MOCK_MODEL, chain: 'skip' }) });
        for (const c of rep.checks) s.assert(c.name, c.ok, { actual: c.detail });
        const wire = gw.state.wireBodies.at(-1);
        s.assert('the gateway saw only ciphertext: neither the total nor a recipient id appears in the request', !wire.includes('0.06') && !RECIPIENTS.some((r) => wire.includes(r.id)));
        const chosen = chooseAllocations(p);
        s.assert('chooseAllocations uses the model\'s answer and says so', chosen.source === 'model' && chosen.allocations.length === 3);
        s.observe('the stored record (without the response body)', { model: p.record.model, tcbStatus: p.record.tcbStatus, requestSha256: p.record.requestSha256.slice(0, 16), responseSha256: p.record.responseSha256.slice(0, 16), signer: p.record.signature.signing_address.slice(0, 16) });
      });

      await ctx.step('wrong answers are caught by the validator, and the fallback is the exact rule', async (s) => {
        const cases = [
          ['pays more than the total (0.12 of 0.06)', rows([['a.testnet', '0.05'], ['b.testnet', '0.04'], ['c.testnet', '0.03']]), /more than the total/],
          ['pays a recipient that is not listed', rows([['a.testnet', '0.03'], ['b.testnet', '0.02'], ['thief.testnet', '0.01']]), /not one of the listed/],
          ['lists a recipient twice', rows([['a.testnet', '0.03'], ['a.testnet', '0.02'], ['c.testnet', '0.01']]), /twice/],
          ['a zero amount', rows([['a.testnet', '0.03'], ['b.testnet', '0'], ['c.testnet', '0.03']]), /not positive/],
          ['a negative amount', rows([['a.testnet', '-0.03'], ['b.testnet', '0.02'], ['c.testnet', '0.01']]), /decimal NEAR amount/],
          ['seven decimals', rows([['a.testnet', '0.0300001'], ['b.testnet', '0.02'], ['c.testnet', '0.01']]), /at most 6 decimals/],
          ['prose around the JSON', `Sure! ${RULE} Hope that helps.`, /not a JSON object/],
          ['an extra field', JSON.stringify({ allocations: JSON.parse(RULE).allocations, reason: 'because' }), /fields other than allocations/],
          ['an empty array', JSON.stringify({ allocations: [] }), /empty/],
        ];
        for (const [name, reply, why] of cases) {
          const p = await ask(reply);
          s.assert(`REJECTED: ${name}`, !p.validation.ok && why.test(p.validation.problems.join(' ')), { actual: p.validation.problems });
          const c = chooseAllocations(p);
          s.assert('  and the fallback is the exact rule: 0.03, 0.02, 0.01', c.source === 'fallback' && c.allocations.map((a) => a.amount).join() === '30000000000000000000000,20000000000000000000000,10000000000000000000000', { actual: c });
        }
        const off = await ask(rows([['a.testnet', '0.040000'], ['b.testnet', '0.010000'], ['c.testnet', '0.010000']]));
        s.assert('a valid but off-rule split passes validation (it is bounded) and is flagged as not the rule', off.validation.ok && !off.sameAsRule);
        s.assert('with requireRule (the default) it falls back to the rule', chooseAllocations(off).source === 'fallback' && chooseAllocations(off, { requireRule: false }).source === 'model');
      });

      await ctx.step('transport and attestation failures fail closed', async (s) => {
        const fails = async (mode, pattern) => { gw.state.mode = { scriptedReply: () => RULE, ...mode }; try { await advisor().proposeAllocation({ totalNear: '0.06', recipients: RECIPIENTS }); return false; } catch (e) { return pattern.test(e.message); } };
        s.assert('a reply that is not sealed (plaintext) is refused', await fails({ plaintextReply: true }, /could not be decrypted/));
        s.assert('a reply that was tampered with in transit is refused', await fails({ tamperReply: true }, /could not be decrypted/));
        s.assert('a reply whose signature is wrong is refused', await fails({ badSignature: true }, /did not verify/));
        s.assert('a reply signed by a key other than the attested one is refused', await fails({ wrongSigner: true }, /did not verify/));
        s.assert('an attestation whose quote does not contain the model key is refused', await fails({ keyNotInQuote: true }, /.+/));
        s.assert('an attestation whose quote does not contain our nonce is refused', await fails({ nonceNotInQuote: true }, /.+/));
        s.assert('without a key the advisor refuses to start', (() => { try { new AttestedAdvisor({ apiKey: '' }); return false; } catch (e) { return e instanceof AdvisorError; } })());
      });

      await ctx.step('tampering with the stored record is detected', async (s) => {
        gw.state.mode = { scriptedReply: () => RULE };
        const p = await advisor().proposeAllocation({ totalNear: '0.06', recipients: RECIPIENTS });
        const hash = onChainHash(p.validation.allocations);
        const verify = (rec, h = hash) => verifyAdviceRecord(rec, { onChainAllocationsHash: h });
        const clone = () => JSON.parse(JSON.stringify(p.record));
        s.assert('the untouched record verifies', (await verify(p.record)).ok);
        const edited = clone(); edited.plaintext = RULE.replace('0.030000', '0.040000');
        s.assert('editing the plaintext after the fact fails (it no longer matches what the stored response decrypts to)', !(await verify(edited)).ok);
        const body = clone(); body.responseText = body.responseText.replace(/.$/, (c) => (c === '}' ? ' ' : '}'));
        s.assert('altering the stored response body fails (the hash no longer matches)', !(await verify(body)).ok);
        const key = clone(); key.clientSecretHex = crypto.randomBytes(32).toString('hex');
        s.assert('replacing the decryption key fails', !(await verify(key)).ok);
        const signer = clone(); signer.modelPublicKey = crypto.randomBytes(32).toString('hex');
        s.assert('claiming a different model key fails (the signature does not verify under it)', !(await verify(signer)).ok);
        const req = clone(); req.requestSha256 = crypto.randomBytes(32).toString('hex');
        s.assert('claiming a different request fails (the signed text names the original)', !(await verify(req)).ok);
        s.assert('comparing with a different on-chain allocations hash fails (the settled allocations are not the attested ones)', !(await verify(p.record, onChainHash([{ recipient: 'a.testnet', amount: '1' }]))).ok);
        s.assert('the offline receipt check alone also passes for the untouched record', checkReceipt(p.record).ok);
      });
    } finally { await new Promise((r) => gw.server.close(r)); }
  },
};
