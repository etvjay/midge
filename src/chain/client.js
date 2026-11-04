import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'url';
import {
  Account,
  JsonRpcProvider,
  KeyPair,
  KeyPairSigner,
  actions,
  formatNearAmount,
  parseNearAmount,
} from 'near-api-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function bs58encode(buffer) {
  const digits = [0];
  for (let i = 0; i < buffer.length; i++) {
    for (let j = 0; j < digits.length; j++) digits[j] <<= 8;
    digits[0] += buffer[i];
    let carry = 0;
    for (let j = 0; j < digits.length; j++) {
      digits[j] += carry;
      carry = (digits[j] / 58) | 0;
      digits[j] %= 58;
    }
    while (carry) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  for (let i = 0; i < buffer.length && buffer[i] === 0; i++) digits.push(0);
  return digits.reverse().map((d) => ALPHABET[d]).join('');
}

/**
 * The repository's .env is NOT read implicitly: a "keyless" run used to send real transactions with the repository's
 * key because this fallback picked it up (GAP-018). Credentials come from the environment, from constructor
 * arguments, or from a file named explicitly by MIDGE_ENV_FILE (or the envFile option).
 */
function loadEnv(envFile = process.env.MIDGE_ENV_FILE) {
  if (!envFile) return {};
  const envPath = path.resolve(envFile);
  if (!fs.existsSync(envPath)) return {};
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
    }
  }
  return env;
}

/**
 * Deterministic KeyPair derivation for sub-agent keys.
 */
export function deriveSubKeyPair(masterPrivKeyString, subId) {
  const seed = crypto.createHmac('sha256', masterPrivKeyString).update(subId).digest();
  const pkcs8Header = Buffer.from('302e020100300506032b657004220420', 'hex');
  const pkcs8Der = Buffer.concat([pkcs8Header, seed]);
  const privKeyObj = crypto.createPrivateKey({ key: pkcs8Der, format: 'der', type: 'pkcs8' });
  const pubKeyObj = crypto.createPublicKey(privKeyObj);
  const rawPub = pubKeyObj.export({ type: 'spki', format: 'der' }).subarray(-32);
  const fullPriv = Buffer.concat([seed, rawPub]);
  return {
    keyPair: KeyPair.fromString('ed25519:' + bs58encode(fullPriv)),
    rawPub,
    rawPriv: seed,
  };
}

/**
 * FlyChainClient: Official NEAR Protocol Blockchain Client
 * Drives the live deployed FlyCoordinator contract (`c.fly-1793636729.testnet`)
 * on NEAR Testnet for agent interfaces (MCP Server, SDK, API Daemon).
 */
export class FlyChainClient {
  constructor({
    networkId = null,
    nodeUrl = null,
    contractId = null,
    accountId = null,
    privateKey = null,
    envFile = null,
  } = {}) {
    const env = loadEnv(envFile || process.env.MIDGE_ENV_FILE);
    this.networkId = networkId || process.env.NEAR_NETWORK || env.NEAR_NETWORK || 'testnet';
    this.nodeUrl = nodeUrl || process.env.NEAR_RPC_URL || env.NEAR_RPC_URL || 'https://test.rpc.fastnear.com';
    this.contractId =
      contractId ||
      process.env.COORDINATOR_ID ||
      env.COORDINATOR_ID ||
      'c.fly-1793636729.testnet';
    this.accountId = accountId || process.env.NEAR_ACCOUNT_ID || env.NEAR_ACCOUNT_ID || null;
    this.privateKey = privateKey || process.env.NEAR_PRIVATE_KEY || env.NEAR_PRIVATE_KEY || null;

    this.provider = new JsonRpcProvider({ url: this.nodeUrl });
    this.account = null;
    if (this.accountId && this.privateKey) {
      const keyPair = KeyPair.fromString(this.privateKey);
      const signer = new KeyPairSigner(keyPair);
      this.account = new Account(this.accountId, this.provider, signer);
    }
  }

  isConfiguredForWrites() {
    return Boolean(this.account && this.accountId);
  }

  /**
   * Canonical SHA-256 policy hash computation matching on-chain release_policy:v1:...
   */
  computePolicyHash(policy) {
    if (!policy) return null;
    const recipientsStr = (policy.allowed_recipients || []).join(',');
    const canonical = `release_policy:v1:${recipientsStr}:${policy.max_release_bps_per_epoch}:${policy.settle_deadline_block}`;
    return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
  }

  /**
   * Allocations as the contract wants them: [{ recipient, amount }] with amount in yoctoNEAR (string).
   * Accepts [recipient, amount] pairs or { recipient, amount } objects; an amount can be NEAR (number or short
   * string) or yocto (bigint or a long string).
   */
  normalizeAllocations(allocations = []) {
    return allocations.map((a) => {
      const [recip, amt] = Array.isArray(a) ? a : [a?.recipient, a?.amount];
      let amtYocto;
      if (typeof amt === 'bigint') {
        amtYocto = amt.toString();
      } else if (typeof amt === 'number') {
        amtYocto = amt < 1e12 ? (parseNearAmount(String(amt)) || '0') : String(amt);
      } else if (typeof amt === 'string') {
        amtYocto = amt.length < 18 ? (parseNearAmount(amt) || '0') : amt;
      } else {
        amtYocto = String(amt);
      }
      return { recipient: recip, amount: amtYocto };
    });
  }

  /** The contract's allocations hash: sorted by recipient, "recipient:yocto" joined by commas, SHA-256. */
  computeAllocationsHash(allocations) {
    const sorted = this.normalizeAllocations(allocations).sort((x, y) => (x.recipient < y.recipient ? -1 : x.recipient > y.recipient ? 1 : 0));
    return crypto.createHash('sha256').update(sorted.map((x) => `${x.recipient}:${x.amount}`).join(','), 'utf8').digest('hex');
  }

  /**
   * Canonical Ed25519 signature computation for settlement batch
   */
  signSettlement({
    syndicateId,
    epoch = 1,
    nonce = 1,
    allocations = [],
    orderHash = '0'.repeat(64),
    enclavePrivateKey,
  }) {
    // 1. Allocations hash exactly as the contract computes it (sorted, comma-joined). The previous version joined with
    // ';' and did not sort, so no signature it produced could verify on chain.
    const formattedAllocations = this.normalizeAllocations(allocations);
    const allocationsHash = this.computeAllocationsHash(formattedAllocations);

    // 2. Compute canonical message 6-tuple
    const message = `${this.contractId}:${syndicateId}:${epoch}:${nonce}:${allocationsHash}:${orderHash}`;
    const msgBytes = Buffer.from(message, 'utf8');

    // 3. Sign with Ed25519 private key
    const pkcs8Header = Buffer.from('302e020100300506032b657004220420', 'hex');
    const pkcs8Der = Buffer.concat([pkcs8Header, enclavePrivateKey]);
    const privKeyObj = crypto.createPrivateKey({ key: pkcs8Der, format: 'der', type: 'pkcs8' });
    const sig = crypto.sign(null, msgBytes, privKeyObj);

    return {
      allocations: formattedAllocations,
      allocationsHash,
      message,
      signatureHex: sig.toString('hex'),
    };
  }

  // --- View Methods ---

  async callView(methodName, args = {}) {
    const res = await this.provider.callFunction({
      contractId: this.contractId,
      method: methodName,
      args,
    });
    return res;
  }

  /** The chain's latest final block height. */
  async getBlockHeight() {
    const block = await this.provider.viewBlock({ finality: 'final' });
    return Number(block.header.height);
  }

  async getSyndicate(syndicateId) {
    return this.callView('get_syndicate', { syndicate_id: syndicateId });
  }

  async getReleasePolicy(syndicateId) {
    return this.callView('get_release_policy', { syndicate_id: syndicateId });
  }

  async getPolicyHash(syndicateId) {
    return this.callView('get_policy_hash', { syndicate_id: syndicateId });
  }

  async getFlyerDeposit(syndicateId, flyerId) {
    return this.callView('get_escrow', { syndicate_id: syndicateId, account_id: flyerId });
  }

  async listSyndicates({ fromIndex = 0, limit = 10 } = {}) {
    return this.callView('list_syndicates', {
      from_index: fromIndex,
      limit,
    });
  }

  async listSyndicatesByMember(accountId, { fromIndex = 0, limit = 10 } = {}) {
    return this.callView('list_syndicates_by_member', {
      account_id: accountId,
      from_index: fromIndex,
      limit,
    });
  }

  // --- Change Methods ---

  async hatch({
    syndicateId,
    syndicateType = 'FLASH',
    quorumThreshold = 2,
    enclavePublicKey,
    expectedCodeHash = 'valid-mrenclave-code-hash',
    timeoutBlocks = 100,
    releasePolicy = null,
    attachedDepositNear = '0.01',
  }) {
    if (!this.account) {
      throw new Error('[FlyChainClient] Missing NEAR_ACCOUNT_ID / NEAR_PRIVATE_KEY for on-chain transaction');
    }
    // A syndicate hatched without the Roost's settlement key (the old default was 64 zeros) can never be settled:
    // nobody holds a private key for it. Refuse instead of creating one.
    if (!/^[0-9a-f]{64}$/i.test(enclavePublicKey || '') || /^0+$/.test(enclavePublicKey)) {
      throw new Error('[FlyChainClient] hatch needs enclavePublicKey: the Roost\'s 32-byte Ed25519 settlement public key as 64 hex characters (not all zeros). Without it the syndicate could never be settled.');
    }

    const policy = releasePolicy || {
      allowed_recipients: [this.accountId],
      max_release_bps_per_epoch: 10000,
      settle_deadline_block: 999999999,
    };

    const action = actions.functionCall(
      'hatch',
      {
        syndicate_id: syndicateId,
        syndicate_type: syndicateType,
        quorum_threshold: quorumThreshold,
        enclave_public_key: enclavePublicKey,
        expected_code_hash: expectedCodeHash,
        timeout_blocks: timeoutBlocks,
        release_policy: policy,
      },
      30_000_000_000_000n, // 30 TGas
      BigInt(parseNearAmount(attachedDepositNear))
    );

    const res = await this.account.signAndSendTransaction({
      receiverId: this.contractId,
      actions: [action],
      throwOnFailure: true,
    });

    const txHash = res.transaction_outcome?.id || res.transaction?.hash;
    const policyHash = this.computePolicyHash(policy);

    return {
      status: 'HATCHED_ON_CHAIN',
      txHash,
      syndicateId,
      contractId: this.contractId,
      subAccount: `${syndicateId}.${this.contractId}`,
      policyHash,
      explorerUrl: `https://testnet.nearblocks.io/txns/${txHash}`,
    };
  }

  async deposit({ syndicateId, policyHash = null, amountNear = '0.02' }) {
    if (!this.account) {
      throw new Error('[FlyChainClient] Missing NEAR_ACCOUNT_ID / NEAR_PRIVATE_KEY for on-chain transaction');
    }

    let pHash = policyHash;
    if (!pHash) {
      pHash = await this.getPolicyHash(syndicateId);
    }

    const action = actions.functionCall(
      'deposit',
      {
        syndicate_id: syndicateId,
        policy_hash: pHash,
      },
      30_000_000_000_000n, // 30 TGas
      BigInt(parseNearAmount(amountNear))
    );

    const res = await this.account.signAndSendTransaction({
      receiverId: this.contractId,
      actions: [action],
      throwOnFailure: true,
    });

    const txHash = res.transaction_outcome?.id || res.transaction?.hash;

    return {
      status: 'DEPOSITED_ON_CHAIN',
      txHash,
      syndicateId,
      flyerId: this.accountId,
      amountNear,
      policyHash: pHash,
      explorerUrl: `https://testnet.nearblocks.io/txns/${txHash}`,
    };
  }

  /**
   * Submit a signed settlement. `nonce` is the syndicate's current round_nonce (a string read from get_syndicate), and
   * `enclaveSignature` is the Roost's signature over contract:syndicate:epoch:nonce:allocationsHash:orderHash.
   * (The previous version sent order_hash/epoch/nonce, which the contract does not accept, so it could never settle.)
   */
  async settleBatch({ syndicateId, allocations, orderHash, nonce, enclaveSignature }) {
    if (!this.account) {
      throw new Error('[FlyChainClient] Missing NEAR_ACCOUNT_ID / NEAR_PRIVATE_KEY for on-chain transaction');
    }
    if (typeof nonce !== 'string' || nonce.length < 8) throw new Error('[FlyChainClient] settleBatch needs the syndicate\'s current round_nonce (a string from get_syndicate) as `nonce`');
    if (typeof orderHash !== 'string' || orderHash.length === 0) throw new Error('[FlyChainClient] settleBatch needs the Roost\'s aggregate orderHash');
    if (typeof enclaveSignature !== 'string' || enclaveSignature.length !== 128) throw new Error('[FlyChainClient] settleBatch needs the Roost\'s 64-byte signature as 128 hex characters');

    const formattedAllocations = this.normalizeAllocations(allocations);
    const action = actions.functionCall(
      'settle_batch',
      {
        syndicate_id: syndicateId,
        attestation_nonce: nonce,
        aggregate_order_hash: orderHash,
        allocations: formattedAllocations,
        enclave_signature: enclaveSignature,
      },
      100_000_000_000_000n, // 100 TGas, as the contract's own settlement flow uses
      0n
    );

    const res = await this.account.signAndSendTransaction({
      receiverId: this.contractId,
      actions: [action],
      throwOnFailure: true,
    });

    const txHash = res.transaction_outcome?.id || res.transaction?.hash;

    return {
      status: 'SETTLED_ON_CHAIN',
      txHash,
      syndicateId,
      allocations: formattedAllocations,
      explorerUrl: `https://testnet.nearblocks.io/txns/${txHash}`,
    };
  }

  async hatchOut({ syndicateId }) {
    if (!this.account) {
      throw new Error('[FlyChainClient] Missing NEAR_ACCOUNT_ID / NEAR_PRIVATE_KEY for on-chain transaction');
    }

    const action = actions.functionCall(
      'hatch_out',
      { syndicate_id: syndicateId },
      60_000_000_000_000n, // 60 TGas, the amount the contract's own flows attach (measured burn about 5 TGas; unused gas is refunded)
    );

    const res = await this.account.signAndSendTransaction({
      receiverId: this.contractId,
      actions: [action],
      throwOnFailure: true,
    });

    const txHash = res.transaction_outcome?.id || res.transaction?.hash;

    return {
      status: 'HATCHED_OUT_ON_CHAIN',
      txHash,
      syndicateId,
      flyerId: this.accountId,
      explorerUrl: `https://testnet.nearblocks.io/txns/${txHash}`,
    };
  }
}
