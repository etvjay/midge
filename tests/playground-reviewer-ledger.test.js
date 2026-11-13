import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createFileLedger } from '../src/playground/ledger.js';
import { makeReviewer } from '../src/playground/reviewer.js';
import { defaultLines } from '../src/playground/defaults.js';

test('the ledger survives a restart, and a removed row stays removed', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-')), 'l.json');
  const a = createFileLedger(file); a.add({ kind: 'account', id: 'x.t' }); a.add({ kind: 'group', id: 'g1', employer: 'x.t' }); a.remove('x.t');
  const b = createFileLedger(file);
  assert.deepEqual(b.all().map((r) => r.id), ['g1']);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});

test('with no file the ledger is kept in memory', () => {
  const l = createFileLedger(); l.add({ kind: 'account', id: 'a' }); assert.equal(l.all().length, 1);
});

const reply = (findings) => ({ plaintext: JSON.stringify({ findings, summary: 'One line has no tax withheld.', questions: [] }), record: { model: 'm', requestSha256: 'a'.repeat(64), responseSha256: 'b'.repeat(64), tcbStatus: 'UpToDate', modelPublicKey: 'c'.repeat(64), signature: { text: 't', signature: 's', signing_address: 'x', kind: 'provider_tee' } } });

test('the reviewer returns the model\'s finding with the code\'s verdict and the labels the page needs', async () => {
  const lines = defaultLines(); lines[2].tax = '0';
  const sentToModel = [];
  const advisor = { ask: async ({ user }) => { sentToModel.push(user); return reply([{ line: 'A', code: 'zero-deduction', severity: 'warn', note: 'Line A has no tax withheld.' }]); } };
  const out = await makeReviewer({ advisor })(lines);
  assert.equal(out.used, true); assert.equal(out.findings[0].check, 'verified'); assert.deepEqual(out.labels, ['C', 'B', 'A', 'D'], 'labels follow gross pay from lowest to highest, in the order of the lines');
  for (const secret of ['Alice', 'Bo', 'Cy', 'Dee', '0.05', '0.0075', 'review-only']) assert.ok(!sentToModel[0].includes(secret), `the model was not sent ${secret}`);
});

test('a finding the numbers do not support is marked not verified', async () => {
  const advisor = { ask: async () => reply([{ line: 'B', code: 'zero-deduction', severity: 'warn', note: 'Line B has no tax withheld.' }]) };
  const out = await makeReviewer({ advisor })(defaultLines());
  assert.equal(out.used, true); assert.notEqual(out.findings[0].check, 'verified');
});

test('a dropped connection is retried once, and a rejected reply is not retried', async () => {
  let n = 0; const flaky = { ask: async () => { n += 1; if (n === 1) throw new Error('socket hang up'); return reply([]); } };
  assert.equal((await makeReviewer({ advisor: flaky })(defaultLines())).used, true); assert.equal(n, 2);
  let m = 0; const bad = { ask: async () => { m += 1; return { plaintext: 'not json', record: {} }; } };
  const out = await makeReviewer({ advisor: bad })(defaultLines());
  assert.equal(out.used, false); assert.equal(m, 1);
});
