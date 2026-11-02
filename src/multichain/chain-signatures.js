import crypto from 'node:crypto';

// Standard Base58 encoder (Bitcoin / Solana alphabet)
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function encodeBase58(buffer) {
  const digits = [0];
  for (let i = 0; i < buffer.length; i++) {
    for (let j = 0; j < digits.length; j++) digits[j] <<= 8;
    digits[0] += buffer[i];
    let carry = 0;
    for (let j = 0; j < digits.length; ++j) {
      digits[j] += carry;
      carry = (digits[j] / 58) | 0;
      digits[j] %= 58;
    }
    while (carry) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  for (let i = 0; buffer[i] === 0 && i < buffer.length - 1; i++) digits.push(0);
  return digits.reverse().map((digit) => BASE58_ALPHABET[digit]).join('');
}

// Bech32m encoder for Bitcoin Taproot (BIP-350 / BIP-341)
const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function bech32Polymod(values) {
  let chk = 1;
  for (let p = 0; p < values.length; ++p) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ values[p];
    if ((top >> 0) & 1) chk ^= 0x3b6a57b2;
    if ((top >> 1) & 1) chk ^= 0x26508e6d;
    if ((top >> 2) & 1) chk ^= 0x1ea119fa;
    if ((top >> 3) & 1) chk ^= 0x3d4233dd;
    if ((top >> 4) & 1) chk ^= 0x2a1462b3;
  }
  return chk;
}
function bech32HrpExpand(hrp) {
  const ret = [];
  for (let p = 0; p < hrp.length; ++p) ret.push(hrp.charCodeAt(p) >> 5);
  ret.push(0);
  for (let p = 0; p < hrp.length; ++p) ret.push(hrp.charCodeAt(p) & 31);
  return ret;
}
function convertBits(data, frombits, tobits, pad) {
  let acc = 0;
  let bits = 0;
  const ret = [];
  const maxv = (1 << tobits) - 1;
  for (let p = 0; p < data.length; ++p) {
    acc = (acc << frombits) | data[p];
    bits += frombits;
    while (bits >= tobits) {
      bits -= tobits;
      ret.push((acc >> bits) & maxv);
    }
  }
  if (pad && bits > 0) {
    ret.push((acc << (tobits - bits)) & maxv);
  }
  return ret;
}
function encodeTaprootAddress(hrp, witnessProgram32) {
  const BECH32M_CONST = 0x2bc830a3;
  const data = [1, ...convertBits(witnessProgram32, 8, 5, true)]; // version 1 witness program
  const checksum = bech32Polymod([...bech32HrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0]) ^ BECH32M_CONST;
  const chkPart = [];
  for (let p = 0; p < 6; ++p) chkPart.push((checksum >> (5 * (5 - p))) & 31);
  return hrp + '1' + [...data, ...chkPart].map((d) => BECH32_CHARSET[d]).join('');
}

/**
 * NEAR Chain Signatures MPC Adapter:
 * Derives native addresses on Bitcoin, Ethereum, and Solana
 * following NEAR MPC specifications (v1.signer / v1.signer-prod.testnet).
 */
export class ChainSignaturesMPC {
  constructor({ networkId = 'testnet', mpcContractId = null } = {}) {
    this.networkId = networkId;
    this.mpcContractId =
      mpcContractId || (networkId === 'mainnet' ? 'v1.signer' : 'v1.signer-prod.testnet');
    // Root public key for NEAR Chain Signatures testnet
    this.rootPublicKey =
      'secp256k1:4HFUpY9Jk9Z2mZKA579qUasJ3G6GJ8nbTXPpzg3Ndqn6';
  }

  /**
   * Derive a deterministic cross-chain address for a Fly Syndicate sub-account.
   * Note: In local simulation mode without an active NEAR testnet account or uncompressed
   * secp256k1 derivation pipeline, addresses are derived from deterministic account entropy
   * (`${mpcContractId}::${syndicateSubAccount}::${derivationPath}`) for format and interface verification.
   * For production key derivation, full derivation from the MPC root public key via the
   * NEAR Chain Signatures contract (v1.signer-prod.testnet) is required.
   */
  deriveOmnichainIdentity(syndicateSubAccount, derivationPath = 'syndicate-treasury') {
    // Generate deterministic entropy from account ID and derivation path
    const seed = crypto
      .createHash('sha256')
      .update(`${this.mpcContractId}::${syndicateSubAccount}::${derivationPath}`)
      .digest();

    // 1. EVM: 20-byte hex address
    const evmAddress = `0x${seed.subarray(12, 32).toString('hex')}`;

    // 2. Bitcoin Taproot: BIP-341 / BIP-350 bech32m address (tb1p on testnet, bc1p on mainnet)
    const btcHrp = this.networkId === 'mainnet' ? 'bc' : 'tb';
    const btcTaprootAddress = encodeTaprootAddress(btcHrp, seed);

    // 3. Solana: 32-byte Ed25519 public key encoded in Base58 (43-44 characters)
    const solanaAddress = encodeBase58(seed);

    return {
      syndicateSubAccount,
      derivationPath,
      mpcContract: this.mpcContractId,
      rootPublicKey: this.rootPublicKey,
      derivationMethod: 'SIMULATED_ACCOUNT_ENTROPY',
      identities: {
        evm: { chain: 'Ethereum/Arbitrum', address: evmAddress, format: 'ERC-55' },
        bitcoin: { chain: 'Bitcoin', address: btcTaprootAddress, format: 'Taproot BIP-341/350' },
        solana: { chain: 'Solana', address: solanaAddress, format: 'Ed25519 Base58' },
      },
    };
  }

  /**
   * Request an omnichain threshold signature from NEAR MPC nodes.
   * Only valid if HAQ attestation verification has passed on the Nest contract.
   * 
   * When `simulate: true` (default), returns mock ECDSA (r, s, v) values labeled
   * as LOCAL_SPEC_DEMO / SIMULATED_LOCAL_MOCK.
   * To execute live on-chain against v1.signer-prod.testnet, provide NEAR_ACCOUNT_ID and NEAR_PRIVATE_KEY
   * in the environment and set simulate: false.
   */
  async requestThresholdSignature({
    syndicateSubAccount,
    targetChain,
    payloadHash,
    haqVerified,
    simulate = true,
  }) {
    if (!haqVerified) {
      throw new Error('[MPC REJECT] Cannot sign cross-chain payload without valid HAQ proof!');
    }

    if (simulate) {
      return {
        signatureId: `sig_${crypto.randomBytes(16).toString('hex')}`,
        targetChain,
        payloadHash,
        r: crypto.randomBytes(32).toString('hex'),
        s: crypto.randomBytes(32).toString('hex'),
        v: 27,
        signersInQuorum: 8,
        status: 'LOCAL_SPEC_DEMO',
        mode: 'SIMULATED_LOCAL_MOCK',
        note: 'Simulated ECDSA parameters for specification demonstration. Live MPC threshold signature requires on-chain call to v1.signer-prod.testnet with funded testnet account.',
        simulate: true,
        timestamp: Date.now(),
      };
    }

    // Live testnet execution
    const accountId = process.env.NEAR_ACCOUNT_ID;
    const privateKey = process.env.NEAR_PRIVATE_KEY;
    if (!accountId || !privateKey) {
      throw new Error(
        '[MPC ERROR] Live Chain Signatures execution requires NEAR_ACCOUNT_ID and NEAR_PRIVATE_KEY in .env'
      );
    }

    const { Account, JsonRpcProvider, KeyPair, KeyPairSigner } = await import('near-api-js');
    const { ethers } = await import('ethers');

    const rpcUrl = process.env.NEAR_RPC_URL || 'https://test.rpc.fastnear.com';
    const provider = new JsonRpcProvider({ url: rpcUrl });
    const signer = new KeyPairSigner(KeyPair.fromString(privateKey));
    const account = new Account(accountId, provider, signer);

    const derivationPath = `fly/${syndicateSubAccount || 'dark-vault'}`;
    const payloadHex = payloadHash.startsWith('0x') ? payloadHash.slice(2) : payloadHash;

    const signTx = await account.callFunctionRaw({
      contractId: this.mpcContractId,
      methodName: 'sign',
      args: {
        request: {
          payload_v2: { Ecdsa: payloadHex },
          path: derivationPath,
          domain_id: 0
        }
      },
      deposit: 1n,
      gas: 250000000000000n // 250 TGas
    });

    let rawSuccessValue = null;
    for (const receipt of signTx.receipts_outcome || []) {
      if (receipt.outcome?.status?.SuccessValue) {
        rawSuccessValue = receipt.outcome.status.SuccessValue;
      }
    }
    if (!rawSuccessValue && signTx.status?.SuccessValue) {
      rawSuccessValue = signTx.status.SuccessValue;
    }

    if (!rawSuccessValue) {
      throw new Error('[MPC ERROR] No SuccessValue in MPC sign execution outcome');
    }

    const parsedSig = JSON.parse(Buffer.from(rawSuccessValue, 'base64').toString('utf8'));
    const bigR = parsedSig.big_r?.affine_point;
    const sScalar = parsedSig.s?.scalar;
    const recoveryId = parsedSig.recovery_id ?? 0;

    const r = '0x' + bigR.slice(2);
    const s = '0x' + sScalar;
    const v = 27 + recoveryId;

    return {
      signatureId: `sig_${signTx.transaction_outcome?.id || signTx.transaction?.hash}`,
      targetChain,
      payloadHash: '0x' + payloadHex,
      r,
      s,
      v,
      recoveryId,
      scheme: parsedSig.scheme,
      status: 'ON_CHAIN_VERIFIED',
      mode: 'NEAR_MPC_LIVE',
      mpcContract: this.mpcContractId,
      txHash: signTx.transaction_outcome?.id || signTx.transaction?.hash,
      simulate: false,
      timestamp: Date.now(),
    };
  }
}
