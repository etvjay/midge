import crypto from 'node:crypto';
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, parseNearAmount } from 'near-api-js';

/**
 * The playground service's view of NEAR testnet. It is the lab's chain helper (lab/lib/near.js) cut down to what the service needs and written
 * for a long-running process: keys come from the environment, accounts live under one funder account, and nothing here reads a file.
 *
 *  - Every account is `<prefix>.<funder>`. A visitor's account is created with the visitor's public key and nothing else, so the service holds no
 *    key for it. Accounts the service uses itself (the employer, the bot employees, the tax and benefits accounts) get a key derived from the
 *    funder key and the account id, so a restarted service can still reach them and clean them up.
 *  - `send` never throws for an on-chain failure. It returns { ok, hash, error }.
 */
export const MAX_ACCOUNT_ID = 64;
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58(buf) {
  const digits = [0];
  for (const byte of buf) { let carry = byte; for (let j = 0; j < digits.length; j += 1) { carry += digits[j] << 8; digits[j] = carry % 58; carry = (carry / 58) | 0; } while (carry) { digits.push(carry % 58); carry = (carry / 58) | 0; } }
  for (let i = 0; i < buf.length && buf[i] === 0; i += 1) digits.push(0);
  return digits.reverse().map((d) => ALPHABET[d]).join('');
}
/** The hash depositors consent to. Same rule as the contract's (and lab/lib/near.js): recipients, cap, deadline and the exit timer. */
export const computePolicyHash = (policy, timeoutBlocks) => {
  const sorted = [...new Set(policy.allowed_recipients)].sort();
  return crypto.createHash('sha256').update(`release_policy:v2:${sorted.join(',')}:${policy.max_release_bps_per_epoch}:${policy.settle_deadline_block}:${timeoutBlocks}`, 'utf8').digest('hex');
};
const toYocto = (near) => BigInt(parseNearAmount(String(near)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createChain({ rpcUrl = 'https://test.rpc.fastnear.com', funderId, funderKey, contractId, deps = {} }) {
  if (!funderId || !funderKey || !contractId) throw new Error('createChain needs funderId, funderKey and contractId');
  const pause = deps.sleep || sleep;
  const retry = async (fn, tries = 8) => { for (let i = 0; ; i += 1) { try { return await fn(); } catch (e) { if (i >= tries - 1 || !/429|rate limit/i.test(String(e?.message ?? e))) throw e; await pause(1200 * (i + 1)); } } };
  class RetryingProvider extends JsonRpcProvider { sendJsonRpc(...a) { return retry(() => super.sendJsonRpc(...a)); } }
  const provider = deps.provider || new RetryingProvider({ url: rpcUrl });
  const funder = deps.funder || new Account(funderId, provider, new KeyPairSigner(KeyPair.fromString(funderKey)));

  function derive(accountId) {
    const seed = crypto.createHmac('sha256', funderKey).update(accountId).digest();
    const header = Buffer.from('302e020100300506032b657004220420', 'hex');
    const priv = crypto.createPrivateKey({ key: Buffer.concat([header, seed]), format: 'der', type: 'pkcs8' });
    const rawPub = crypto.createPublicKey(priv).export({ type: 'spki', format: 'der' }).subarray(-32);
    const keyPair = KeyPair.fromString(`ed25519:${base58(Buffer.concat([seed, rawPub]))}`);
    return { keyPair, publicKey: keyPair.getPublicKey().toString() };
  }
  const accountIdFor = (prefix) => {
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(String(prefix))) throw new Error(`the prefix '${prefix}' is not a valid account name part`);
    const id = `${prefix}.${funderId}`;
    if (id.length > MAX_ACCOUNT_ID) throw new Error(`the account id ${id} is longer than ${MAX_ACCOUNT_ID} characters`);
    return id;
  };
  const handleFor = (id) => { const k = derive(id); return { id, account: deps.makeAccount ? deps.makeAccount(id, k.keyPair) : new Account(id, provider, new KeyPairSigner(k.keyPair)), keyPair: k.keyPair }; };
  const visible = async (id) => { try { await provider.query({ request_type: 'view_account', finality: 'optimistic', account_id: id }); return true; } catch { return false; } };

  /** Creates `<prefix>.<funder>` with `fundNear`. With `publicKey` the account gets that key only and the handle has no signer. */
  async function createAccount({ prefix, publicKey = null, fundNear }) {
    const id = accountIdFor(prefix);
    const key = publicKey ?? derive(id).publicKey;
    await funder.createSubAccount({ accountOrPrefix: prefix, publicKey: key, nearToTransfer: toYocto(fundNear) });
    let seen = false;
    for (let i = 0; i < (deps.visibleTries ?? 20) && !seen; i += 1) { seen = await visible(id); if (!seen) await pause(1500); }
    if (!seen) throw new Error(`account ${id} did not become visible after it was created`);
    return { id, account: publicKey ? null : handleFor(id).account };
  }

  async function view(method, args = {}, contract = contractId) { return retry(() => provider.callFunction({ contractId: contract, method, args })); }

  /** A contract view at FINAL finality. The room reads escrow at a finalised block, so a deposit counts for the room only once it is final here too. */
  async function viewFinal(method, args = {}, contract = contractId) {
    const r = await retry(() => provider.query({ request_type: 'call_function', finality: 'final', account_id: contract, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString('base64') }));
    return JSON.parse(Buffer.from(r.result).toString('utf8'));
  }

  async function send(account, methodName, args, { deposit = 0n, gas = 60000000000000n, contract = contractId, label } = {}) {
    let res = null; let thrown = null;
    try { res = await account.callFunctionRaw({ contractId: contract, methodName, args, deposit, gas }); } catch (e) { thrown = e; }
    const hash = res?.transaction?.hash || res?.transaction_outcome?.id || thrown?.transactionResult?.transaction?.hash || thrown?.txHash || null;
    const failure = res?.status?.Failure || res?.receipts_outcome?.map((r) => r.outcome?.status?.Failure).find(Boolean) || null;
    const ok = !thrown && !failure;
    return { label: label || `${account.accountId}.${methodName}`, ok, hash, error: ok ? null : String(thrown?.message || JSON.stringify(failure) || 'failed').slice(0, 400) };
  }

  async function waitFor(fn, { timeoutMs = 45000, everyMs = 1500, what = 'condition' } = {}) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) { try { const v = await fn(); if (v) return v; } catch { /* try again */ } await pause(everyMs); }
    throw new Error(`timed out waiting for ${what}`);
  }

  /** What a transaction moved, from its receipts (balance changes are confused by gas refunds that arrive later). */
  async function transfersOf(hash, signerId, archival = 'https://archival-rpc.testnet.fastnear.com') {
    return retry(async () => {
      const res = await (await fetch(archival, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'EXPERIMENTAL_tx_status', params: [hash, signerId] }), signal: AbortSignal.timeout(40000) })).json();
      if (res.error || !res.result) throw new Error(`could not read receipts of ${hash}`);
      const out = [];
      for (const r of res.result.receipts || []) for (const a of r.receipt?.Action?.actions || []) if (a.Transfer) out.push({ to: r.receiver_id, amount: a.Transfer.deposit, predecessor: r.predecessor_id, fromContract: r.predecessor_id === contractId });
      return out;
    });
  }

  async function balance(id) { const a = await retry(() => provider.query({ request_type: 'view_account', finality: 'optimistic', account_id: id })); return BigInt(a.amount); }
  async function exists(id) { return visible(id); }
  /** Deletes a service-held account and sends what is left to the funder. Returns true if it is gone. */
  async function deleteAccount(handle) { try { await handle.account.deleteAccount(funderId); return true; } catch { return !(await visible(handle.id)); } }

  return { provider, funder, funderId, contractId, derive, accountIdFor, handleFor, createAccount, view, viewFinal, send, waitFor, transfersOf, balance, exists, deleteAccount, toYocto };
}
