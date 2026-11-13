import test from 'node:test';
import assert from 'node:assert/strict';
import { createChain, MAX_ACCOUNT_ID, computePolicyHash } from '../src/playground/chain.js';
import { computePolicyHash as labHash } from '../lab/lib/near.js';

const KEY = 'ed25519:3D4YudUQRE39Lc4JHghuB5WM8kbgDDa2kvs57CyzZwnEjPUJ4kjQGLhYMVtEuCfFkCm9jHEdz6RobrW5pSF5PWBg';
const FUNDER = 'play.fly-1793636729.testnet';
const mk = (deps = {}) => createChain({ rpcUrl: 'http://x', funderId: FUNDER, funderKey: KEY, contractId: 'c.fly-1793636729.testnet', deps: { provider: { query: async () => ({}), callFunction: async () => null }, funder: { createSubAccount: async () => {} }, sleep: async () => {}, ...deps } });

test('account ids sit under the funder, and an id over 64 characters is refused', () => {
  const chain = mk();
  assert.equal(chain.accountIdFor('s7k2er'), `s7k2er.${FUNDER}`);
  assert.ok(`${'a'.repeat(MAX_ACCOUNT_ID - FUNDER.length - 1)}.${FUNDER}`.length <= MAX_ACCOUNT_ID);
  assert.throws(() => chain.accountIdFor('a'.repeat(MAX_ACCOUNT_ID)), /64/);
  assert.throws(() => chain.accountIdFor('Bad Prefix'), /prefix/i);
});

test('a service-held account key is derived from the funder key and the id, so a restart can recover it', () => {
  const a = mk().derive(`x.${FUNDER}`); const b = mk().derive(`x.${FUNDER}`); const c = mk().derive(`y.${FUNDER}`);
  assert.equal(a.publicKey, b.publicKey); assert.notEqual(a.publicKey, c.publicKey);
  assert.match(a.publicKey, /^ed25519:/);
});

test('an account is created with exactly the key it is given and nothing else', async () => {
  const calls = [];
  const chain = mk({ funder: { createSubAccount: async (a) => { calls.push(a); } } });
  const out = await chain.createAccount({ prefix: 'v1', publicKey: 'ed25519:VISITOR', fundNear: '0.01' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].accountOrPrefix, 'v1');
  assert.equal(String(calls[0].publicKey), 'ed25519:VISITOR');
  assert.equal(String(calls[0].nearToTransfer), String(10n ** 22n));
  assert.equal(out.id, `v1.${FUNDER}`); assert.equal(out.account, null, 'the service holds no signer for the visitor\'s account');
});

test('without a key it derives one, and the handle can sign', async () => {
  const chain = mk();
  const out = await chain.createAccount({ prefix: 'er1', fundNear: '0.2' });
  assert.ok(out.account, 'a service-held account has a signer'); assert.equal(out.id, `er1.${FUNDER}`);
});

test('an account that never becomes visible fails with its id', async () => {
  const chain = mk({ provider: { query: async () => { throw new Error('UNKNOWN_ACCOUNT'); } }, visibleTries: 3 });
  await assert.rejects(chain.createAccount({ prefix: 'ghost', publicKey: 'ed25519:K', fundNear: '0.01' }), /ghost\./);
});

test('send reports an on-chain failure as a value and never throws for it', async () => {
  const chain = mk();
  const failing = { accountId: 'a.testnet', callFunctionRaw: async () => ({ transaction: { hash: 'H1' }, status: { Failure: { ActionError: 'boom' } }, receipts_outcome: [] }) };
  const r = await chain.send(failing, 'hatch', {}, { label: 'x' });
  assert.equal(r.ok, false); assert.equal(r.hash, 'H1'); assert.match(r.error, /boom/);
  const good = { accountId: 'a.testnet', callFunctionRaw: async () => ({ transaction: { hash: 'H2' }, status: { SuccessValue: '' }, receipts_outcome: [] }) };
  assert.equal((await chain.send(good, 'hatch', {})).ok, true);
  const thrower = { accountId: 'a.testnet', callFunctionRaw: async () => { throw new Error('network down'); } };
  const t = await chain.send(thrower, 'hatch', {}); assert.equal(t.ok, false); assert.match(t.error, /network down/);
});

test('waitFor returns the first truthy value and times out with its label', async () => {
  const chain = mk();
  let n = 0;
  assert.equal(await chain.waitFor(async () => (++n >= 3 ? 'ready' : null), { what: 'x', timeoutMs: 1000, everyMs: 1 }), 'ready');
  await assert.rejects(chain.waitFor(async () => null, { what: 'the group', timeoutMs: 20, everyMs: 5 }), /the group/);
});

test('the policy hash is the same one the lab computes, so a deposit consents to the policy the group was hatched with', () => {
  const pol = { allowed_recipients: ['b.testnet', 'a.testnet'], max_release_bps_per_epoch: 10000, settle_deadline_block: 500000000 };
  assert.equal(computePolicyHash(pol, 12), labHash(pol, 12));
});

test('viewFinal reads the contract at final finality, because the room reads escrow at a finalised block', async () => {
  const seen = [];
  const chain = mk({ provider: { query: async (q) => { seen.push(q); return { result: Buffer.from(JSON.stringify({ total_escrow: '5' })) }; } } });
  assert.deepEqual(await chain.viewFinal('get_syndicate', { syndicate_id: 'g' }), { total_escrow: '5' });
  assert.equal(seen[0].finality, 'final'); assert.equal(seen[0].method_name, 'get_syndicate');
  assert.deepEqual(JSON.parse(Buffer.from(seen[0].args_base64, 'base64').toString()), { syndicate_id: 'g' });
});
