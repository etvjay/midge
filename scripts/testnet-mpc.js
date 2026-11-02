import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'url';
import {
  Account,
  JsonRpcProvider,
  KeyPair,
  KeyPairSigner
} from 'near-api-js';
import { ethers } from 'ethers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Base58 decoding/encoding
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function bs58decode(str) {
  let bytes = [0];
  for (let i = 0; i < str.length; i++) {
    const c = BASE58_ALPHABET.indexOf(str[i]);
    if (c < 0) throw new Error('Invalid b58 character');
    for (let j = 0; j < bytes.length; j++) bytes[j] *= 58;
    bytes[0] += c;
    let carry = 0;
    for (let j = 0; j < bytes.length; j++) {
      bytes[j] += carry;
      carry = bytes[j] >> 8;
      bytes[j] &= 0xff;
    }
    while (carry) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let i = 0; i < str.length && str[i] === '1'; i++) bytes.push(0);
  return Buffer.from(bytes.reverse());
}

function bs58encode(buffer) {
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

// Bech32m encoder for Bitcoin Taproot (BIP-341 / BIP-350)
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
  const data = [1, ...convertBits(witnessProgram32, 8, 5, true)];
  const checksum = bech32Polymod([...bech32HrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0]) ^ BECH32M_CONST;
  const chkPart = [];
  for (let p = 0; p < 6; ++p) chkPart.push((checksum >> (5 * (5 - p))) & 31);
  return hrp + '1' + [...data, ...chkPart].map((d) => BECH32_CHARSET[d]).join('');
}

function loadEnv() {
  const envPath = path.join(rootDir, '.env');
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
  }
  return env;
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║    FLY PROTOCOL: LIVE NEAR CHAIN SIGNATURES MPC VERIFIER       ║');
  console.log('║       Target: v1.signer-prod.testnet (Omnichain Threshold)      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const env = loadEnv();
  const accountId = env.NEAR_ACCOUNT_ID;
  const privateKey = env.NEAR_PRIVATE_KEY;

  if (!accountId || !privateKey) {
    throw new Error('Missing NEAR_ACCOUNT_ID or NEAR_PRIVATE_KEY in .env file.');
  }

  const rpcUrl = process.env.NEAR_RPC_URL || 'https://test.rpc.fastnear.com';
  const provider = new JsonRpcProvider({ url: rpcUrl });
  const keyPair = KeyPair.fromString(privateKey);
  const signer = new KeyPairSigner(keyPair);
  const account = new Account(accountId, provider, signer);

  const mpcContractId = 'v1.signer-prod.testnet';
  const derivationPath = 'fly/dark-vault/epoch-1';

  console.log(`[1/5] Connecting to NEAR Testnet...`);
  console.log(`      Caller Account: ${accountId}`);
  console.log(`      MPC Contract:   ${mpcContractId}`);
  console.log(`      RPC Endpoint:   ${rpcUrl}`);

  console.log(`\n[2/5] Querying Root Public Key & Deriving Syndicate Identity...`);
  const rootKeyRes = await provider.callFunction({
    contractId: mpcContractId,
    method: 'public_key',
    args: {}
  });
  console.log(`      Root Public Key:    ${rootKeyRes}`);

  const derivedKeyRes = await provider.callFunction({
    contractId: mpcContractId,
    method: 'derived_public_key',
    args: {
      path: derivationPath,
      predecessor: accountId
    }
  });
  console.log(`      Derivation Path:    "${derivationPath}"`);
  console.log(`      Derived Public Key: ${derivedKeyRes}`);

  // Parse uncompressed key from secp256k1 base58
  const b58Part = derivedKeyRes.replace(/^secp256k1:/, '');
  const uncompressed64 = bs58decode(b58Part);
  if (uncompressed64.length !== 64) {
    throw new Error(`Unexpected derived key length: ${uncompressed64.length} (expected 64 bytes)`);
  }
  const uncompressed65Hex = '0x04' + uncompressed64.toString('hex');
  const xCoord32 = uncompressed64.subarray(0, 32);

  // 1. EVM Address: Keccak256(uncompressed_64).slice(-20)
  const evmAddress = ethers.computeAddress(uncompressed65Hex);

  // 2. Bitcoin Taproot Address (BIP-341/350 with 32-byte X coordinate)
  const btcTaprootAddress = encodeTaprootAddress('tb', xCoord32);

  // 3. Solana Cross-Chain Representation (Base58 of X coord)
  const solanaAddress = bs58encode(xCoord32);

  console.log('\n[3/5] Omnichain Derived Syndicate Addresses:');
  console.log(`      EVM (Ethereum/Arbitrum): ${evmAddress}`);
  console.log(`      Bitcoin (Taproot test):  ${btcTaprootAddress}`);
  console.log(`      Solana (Cross-chain ID): ${solanaAddress}`);

  console.log('\n[4/5] Requesting Live Secp256k1 Threshold Signature from MPC Quorum...');
  // 32-byte payload digest to sign (e.g. cross-chain intent settlement hash)
  const payloadDigest = crypto.createHash('sha256').update(`fly-dark-vault-intent-${Date.now()}`).digest('hex');
  console.log(`      Payload Digest: 0x${payloadDigest}`);
  console.log(`      Calling ${mpcContractId}::sign with 1 yoctoNEAR deposit & 250 TGas...`);

  const signTx = await account.callFunctionRaw({
    contractId: mpcContractId,
    methodName: 'sign',
    args: {
      request: {
        payload_v2: { Ecdsa: payloadDigest },
        path: derivationPath,
        domain_id: 0
      }
    },
    deposit: 1n,
    gas: 250000000000000n // 250 TGas
  });

  const txHash = signTx.transaction_outcome?.id || signTx.transaction?.hash;
  const explorerUrl = `https://testnet.nearblocks.io/txns/${txHash}`;
  console.log(`      ✓ Transaction Executed!`);
  console.log(`      Tx Hash:  ${txHash}`);
  console.log(`      Explorer: ${explorerUrl}`);

  // Extract signature from execution outcome
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
    throw new Error('Failed to find SuccessValue in transaction receipts outcome');
  }

  const parsedSig = JSON.parse(Buffer.from(rawSuccessValue, 'base64').toString('utf8'));
  const bigR = parsedSig.big_r?.affine_point;
  const sScalar = parsedSig.s?.scalar;
  const recoveryId = parsedSig.recovery_id ?? 0;

  if (!bigR || !sScalar) {
    throw new Error(`Incomplete signature received from MPC: ${JSON.stringify(parsedSig)}`);
  }

  const rHex = '0x' + bigR.slice(2); // Strip 02/03 prefix
  const sHex = '0x' + sScalar;
  const v = 27 + recoveryId;

  console.log(`\n[5/5] Cryptographic ECDSA Verification against Derived Public Key:`);
  console.log(`      Scheme:      ${parsedSig.scheme}`);
  console.log(`      r:           ${rHex}`);
  console.log(`      s:           ${sHex}`);
  console.log(`      Recovery ID: ${recoveryId} (v = ${v})`);

  const ethersSig = ethers.Signature.from({ r: rHex, s: sHex, v });
  const recoveredPubKey = ethers.SigningKey.recoverPublicKey('0x' + payloadDigest, ethersSig);
  const recoveredAddress = ethers.recoverAddress('0x' + payloadDigest, ethersSig);

  console.log(`      Expected Public Key:  ${uncompressed65Hex}`);
  console.log(`      Recovered Public Key: ${recoveredPubKey}`);
  console.log(`      Expected EVM Address: ${evmAddress}`);
  console.log(`      Recovered Address:    ${recoveredAddress}`);

  const keysMatch = recoveredPubKey.toLowerCase() === uncompressed65Hex.toLowerCase();
  const addressMatch = recoveredAddress.toLowerCase() === evmAddress.toLowerCase();

  if (!keysMatch || !addressMatch) {
    throw new Error('❌ CRYPTOGRAPHIC VERIFICATION FAILED: Recovered key does not match MPC derived key!');
  }

  console.log(`\n>>> [PASS] LIVE NEAR CHAIN SIGNATURES VERIFIED: Signature matches derived omnichain key!`);

  // Write evidence
  const evidence = {
    timestamp: new Date().toISOString(),
    network: 'testnet',
    mpcContract: mpcContractId,
    callerAccount: accountId,
    derivationPath,
    rootPublicKey: rootKeyRes,
    derivedPublicKey: derivedKeyRes,
    uncompressedPublicKey: uncompressed65Hex,
    omnichainAddresses: {
      evm: evmAddress,
      bitcoinTaproot: btcTaprootAddress,
      solana: solanaAddress
    },
    transaction: {
      txHash,
      explorer: explorerUrl,
      gasBurntTGas: (Number(signTx.transaction_outcome?.outcome?.gas_burnt || 0) / 1e12).toFixed(2)
    },
    signature: {
      scheme: parsedSig.scheme,
      payloadDigest: '0x' + payloadDigest,
      r: rHex,
      s: sHex,
      v,
      recoveryId,
      verifiedAgainstDerivedKey: true
    }
  };

  const evidencePath = path.join(rootDir, 'docs', 'canonical', 'mpc-evidence.json');
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
  console.log(`\nEvidence recorded to ${path.relative(rootDir, evidencePath)}`);
}

main().catch(err => {
  console.error('\n❌ Error in testnet-mpc.js:', err);
  process.exit(1);
});
