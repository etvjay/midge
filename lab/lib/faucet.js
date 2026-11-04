import crypto from 'node:crypto';
import { Account, KeyPair, KeyPairSigner, JsonRpcProvider } from 'near-api-js';
import { bs58encode } from '../../src/chain/client.js';
import { fmt } from './near.js';

/**
 * Get testnet NEAR the way scripts/setup-testnet-account.js does: ask NEAR's testnet helper to create a new,
 * pre-funded account for a fresh keypair. To move that money onto an account you already use, the throwaway account
 * is then deleted with the target as beneficiary, which sweeps its whole balance. The throwaway key lives only in this
 * function: it is never printed, logged or written to disk.
 *
 * Testnet only. The helper may rate-limit or be retired; the error is returned, not hidden.
 */
export async function fundFromHelper({ beneficiaryId, rpc = process.env.LAB_NEAR_RPC || 'https://test.rpc.fastnear.com', helper = 'https://helper.testnet.near.org/account', log = () => {} }) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const rawPub = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
  const rawPriv = privateKey.export({ type: 'pkcs8', format: 'der' }).subarray(-32);
  const pubStr = `ed25519:${bs58encode(rawPub)}`;
  const keyPair = KeyPair.fromString(`ed25519:${bs58encode(Buffer.concat([rawPriv, rawPub]))}`);
  const accountId = `lab-faucet-${Math.floor(Date.now() / 1000)}.testnet`;
  const out = { ok: false, accountId };

  const res = await fetch(helper, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ newAccountId: accountId, newAccountPublicKey: pubStr }), signal: AbortSignal.timeout(60000) }).catch((e) => ({ ok: false, status: 0, text: async () => e.message }));
  if (!res.ok) { out.error = `helper answered ${res.status}: ${(await res.text()).slice(0, 300)}`; return out; }
  const created = await res.json().catch(() => ({}));
  out.createTx = created.transaction?.hash || created.transaction_outcome?.id || null;
  log(`helper created ${accountId}`);

  const provider = new JsonRpcProvider({ url: rpc });
  const account = new Account(accountId, provider, new KeyPairSigner(keyPair));
  let balance = null;
  for (let i = 0; i < 20 && balance === null; i += 1) {
    try { balance = BigInt((await provider.query({ request_type: 'view_account', finality: 'final', account_id: accountId })).amount); } catch { await new Promise((r) => setTimeout(r, 2000)); }
  }
  if (balance === null) { out.error = 'the new account never became visible'; return out; }
  out.funded = balance;
  log(`new account holds ${fmt(balance)} NEAR; sweeping to ${beneficiaryId}`);

  try {
    const r = await account.deleteAccount(beneficiaryId);
    out.sweepTx = r.transaction?.hash || r.transaction_outcome?.id || null;
    out.ok = true;
  } catch (e) { out.error = `could not sweep ${accountId} to ${beneficiaryId}: ${e.message.slice(0, 300)} (the funds stay in ${accountId}; its key was not saved, so they are unrecoverable)`; }
  return out;
}
