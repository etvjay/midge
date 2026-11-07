import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, formatNearAmount, parseNearAmount } from 'near-api-js';

/**
 * Testnet helpers for experiments. Key derivation and the contract call shapes mirror scripts/testnet-e2e.js
 * so lab runs use the same accounts. Every transaction goes through `send`, which records it in a ledger with
 * an explorer link and reports success or failure explicitly (several experiments expect failures).
 */
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function bs58encode(buf) {
  const digits = [0];
  for (const byte of buf) {
    let carry = byte;
    for (let j = 0; j < digits.length; j += 1) { carry += digits[j] << 8; digits[j] = carry % 58; carry = (carry / 58) | 0; }
    while (carry) { digits.push(carry % 58); carry = (carry / 58) | 0; }
  }
  for (let i = 0; i < buf.length && buf[i] === 0; i += 1) digits.push(0);
  return digits.reverse().map((d) => ALPHABET[d]).join('');
}

export function loadEnvFile(rootDir) {
  const env = {};
  try {
    for (const line of fs.readFileSync(path.join(rootDir, '.env'), 'utf8').split('\n')) {
      const t = line.trim();
      if (t && !t.startsWith('#') && t.includes('=')) { const i = t.indexOf('='); env[t.slice(0, i)] = t.slice(i + 1).trim().replace(/^["']|["']$/g, ''); }
    }
  } catch { /* none */ }
  return env;
}

export function deriveSubKeyPair(masterPrivKeyString, subId) {
  const seed = crypto.createHmac('sha256', masterPrivKeyString).update(subId).digest();
  const header = Buffer.from('302e020100300506032b657004220420', 'hex');
  const priv = crypto.createPrivateKey({ key: Buffer.concat([header, seed]), format: 'der', type: 'pkcs8' });
  const rawPub = crypto.createPublicKey(priv).export({ type: 'spki', format: 'der' }).subarray(-32);
  return { keyPair: KeyPair.fromString('ed25519:' + bs58encode(Buffer.concat([seed, rawPub]))), rawPub, seed };
}

/**
 * The hash depositors consent to (version 2, GAP-025): recipients, cap, deadline AND the exit timer. The timer is required on
 * purpose: it sets the release pacing and the wait to exit, so a caller must state which timer it is consenting to.
 */
export const computePolicyHash = (policy, timeoutBlocks) => {
  if (!Number.isSafeInteger(timeoutBlocks) || timeoutBlocks < 1) throw new Error('computePolicyHash needs the group\'s exit timer in blocks (it is part of what depositors consent to)');
  const sorted = [...new Set(policy.allowed_recipients)].sort();
  return crypto.createHash('sha256').update(`release_policy:v2:${sorted.join(',')}:${policy.max_release_bps_per_epoch}:${policy.settle_deadline_block}:${timeoutBlocks}`, 'utf8').digest('hex');
};

export const near = (n) => BigInt(parseNearAmount(String(n)));
export const fmt = (yocto, d = 4) => { const v = BigInt(yocto); return v < 0n ? `-${formatNearAmount(String(-v), d)}` : formatNearAmount(String(v), d); };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const explorer = (hash) => `https://testnet.nearblocks.io/txns/${hash}`;

export async function connect(rootDir, { rpc = process.env.LAB_NEAR_RPC || 'https://test.rpc.fastnear.com' } = {}) {
  const env = loadEnvFile(rootDir);
  const masterId = env.NEAR_ACCOUNT_ID; const masterKey = env.NEAR_PRIVATE_KEY;
  if (!masterId || !masterKey) throw new Error('NEAR_ACCOUNT_ID and NEAR_PRIVATE_KEY are required in .env');
  const provider = new JsonRpcProvider({ url: rpc });
  const mk = (id, kp) => new Account(id, provider, new KeyPairSigner(kp));
  const master = mk(masterId, KeyPair.fromString(masterKey));
  const coordinatorId = `c.${masterId}`;
  const sub = (prefix) => { const k = deriveSubKeyPair(masterKey, prefix); const id = `${prefix}.${masterId}`; return { id, key: k, account: mk(id, k.keyPair) }; };
  const ledger = [];

  async function balance(account) { return BigInt((await account.getBalance()).toString()); }
  /** The public RPC rate-limits bursts (HTTP 429). Retry with a growing pause; any other error is thrown at once. */
  async function retry(fn, tries = 8) {
    for (let i = 0; ; i += 1) {
      try { return await fn(); } catch (e) { if (i >= tries - 1 || !/429|rate limit/i.test(String(e?.message ?? e))) throw e; await sleep(1200 * (i + 1)); }
    }
  }
  async function view(method, args = {}, contractId = coordinatorId) { return retry(() => provider.callFunction({ contractId, method, args })); }
  const blockHeight = async (finality = 'optimistic') => retry(async () => Number((await provider.viewBlock({ finality })).header.height));

  /** Send a function call. Never throws for an on-chain failure: returns { ok, hash, error, gasTGas }. */
  async function send(account, methodName, args, { deposit = 0n, gas = 60000000000000n, contractId = coordinatorId, label } = {}) {
    let res; let thrown = null;
    try { res = await account.callFunctionRaw({ contractId, methodName, args, deposit, gas }); } catch (e) { thrown = e; }
    const outcome = res || thrown?.outcome || thrown?.result || null;
    // near-api-js puts the hash of a transaction that failed on chain on the error (transactionResult for a contract panic,
    // txHash for an action error). Without it a rejected attack
    // was recorded with no hash and so no explorer link (42 rejections in the promoted runs have none).
    const hash = res?.transaction?.hash || res?.transaction_outcome?.id || thrown?.transactionResult?.transaction?.hash || thrown?.transactionResult?.transaction_outcome?.id || thrown?.txHash || thrown?.transaction?.hash || thrown?.context?.transactionHash || null;
    const failure = res?.status?.Failure || res?.receipts_outcome?.map((r) => r.outcome?.status?.Failure).find(Boolean) || null;
    const ok = !thrown && !failure;
    const error = ok ? null : String(thrown?.message || JSON.stringify(failure) || 'failed').slice(0, 400);
    const gasBurnt = (res?.receipts_outcome || []).reduce((a, r) => a + BigInt(r.outcome?.gas_burnt || 0), BigInt(res?.transaction_outcome?.outcome?.gas_burnt || 0));
    const entry = { label: label || `${account.accountId}.${methodName}`, method: methodName, from: account.accountId, ok, hash, explorer: hash ? explorer(hash) : null, error, gasTGas: Number(gasBurnt) / 1e12 };
    ledger.push(entry);
    return entry;
  }

  async function waitFor(fn, { timeoutMs = 45000, everyMs = 1500, what = 'condition' } = {}) {
    const t0 = Date.now(); let last;
    while (Date.now() - t0 < timeoutMs) { try { last = await fn(); if (last) return last; } catch { /* retry */ } await sleep(everyMs); }
    throw new Error(`timed out waiting for ${what}`);
  }

  /**
   * What a transaction actually moved, read from its receipts. Balance deltas are confounded by gas refunds that
   * land a block or two later (worth real money at testnet gas prices); receipts are not.
   */
  async function transfersOf(hash, signerId, archival = 'https://archival-rpc.testnet.fastnear.com') {
    return retry(() => transfersOnce(hash, signerId, archival));
  }
  async function transfersOnce(hash, signerId, archival) {
    const body = { jsonrpc: '2.0', id: 1, method: 'EXPERIMENTAL_tx_status', params: [hash, signerId] };
    const res = await (await fetch(archival, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(40000) })).json();
    if (res.error || !res.result) throw new Error(`could not read receipts of ${hash}: ${JSON.stringify(res.error || {}).slice(0, 160)}`);
    const out = [];
    for (const r of res.result.receipts || []) for (const a of r.receipt?.Action?.actions || []) if (a.Transfer) out.push({ to: r.receiver_id, amount: a.Transfer.deposit, predecessor: r.predecessor_id, fromContract: r.predecessor_id === coordinatorId });
    return out;
  }

  return { provider, env, retry, blockHeight, transfersOf, master, masterId, coordinatorId, sub, ledger, balance, view, send, waitFor, near, fmt, explorer, computePolicyHash,
    codeHash: async () => (await provider.viewContractCode({ contractId: coordinatorId })).hash };
}
