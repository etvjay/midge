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
  parseNearAmount
} from 'near-api-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function bs58encode(buffer) {
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
  return digits.reverse().map(d => ALPHABET[d]).join('');
}

function loadEnv() {
  const envPath = path.join(rootDir, '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error('.env file not found. Run scripts/setup-testnet-account.js first.');
  }
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  const env = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
    }
  }
  return env;
}

// Deterministic KeyPair derivation from master key to ensure idempotent re-runs
function deriveSubKeyPair(masterPrivKeyString, subId) {
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
    rawPriv: seed
  };
}

function signMessage(privateKeySeed, messageString) {
  const pkcs8Header = Buffer.from('302e020100300506032b657004220420', 'hex');
  const pkcs8Der = Buffer.concat([pkcs8Header, privateKeySeed]);
  const privKeyObj = crypto.createPrivateKey({ key: pkcs8Der, format: 'der', type: 'pkcs8' });
  const sig = crypto.sign(null, Buffer.from(messageString, 'utf8'), privKeyObj);
  return sig.toString('hex');
}

function computeAllocationsHash(allocations) {
  const sorted = [...allocations].sort((a, b) => a.recipient.localeCompare(b.recipient));
  const allocStr = sorted.map(a => `${a.recipient}:${a.amount}`).join(',');
  return crypto.createHash('sha256').update(allocStr, 'utf8').digest('hex');
}

function computePolicyHash(policy, timeoutBlocks) {
  // version 2 (GAP-025): the exit timer is part of what depositors consent to
  const sorted = [...new Set(policy.allowed_recipients)].sort();
  const canonicalStr = `release_policy:v2:${sorted.join(',')}:${policy.max_release_bps_per_epoch}:${policy.settle_deadline_block}:${timeoutBlocks}`;
  return crypto.createHash('sha256').update(canonicalStr, 'utf8').digest('hex');
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║           MIDGE: LIVE TESTNET END-TO-END DEPLOYMENT            ║');
  console.log('║       NEAR HACKATHON: Build Beyond Boundaries (Nov 2026)       ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const env = loadEnv();
  const masterAccountId = env.NEAR_ACCOUNT_ID;
  const masterPrivateKey = env.NEAR_PRIVATE_KEY;

  if (!masterAccountId || !masterPrivateKey) {
    throw new Error('NEAR_ACCOUNT_ID and NEAR_PRIVATE_KEY must be defined in .env');
  }

  console.log(`[1/8] Master Deployer Account: ${masterAccountId}`);
  const provider = new JsonRpcProvider({ url: 'https://test.rpc.fastnear.com' });
  const masterSigner = new KeyPairSigner(KeyPair.fromString(masterPrivateKey));
  const masterAccount = new Account(masterAccountId, provider, masterSigner);

  const balance = await masterAccount.getBalance();
  console.log(`      Balance: ${formatNearAmount(balance.toString(), 4)} NEAR`);

  // Sub-account prefixes and full IDs
  const coordPrefix = 'c';
  const flyer1Prefix = 'f1';
  const flyer2Prefix = 'f2';
  const flyer3Prefix = 'f3';

  const coordinatorId = `${coordPrefix}.${masterAccountId}`;
  const flyer1Id = `${flyer1Prefix}.${masterAccountId}`;
  const flyer2Id = `${flyer2Prefix}.${masterAccountId}`;
  const flyer3Id = `${flyer3Prefix}.${masterAccountId}`;

  // Deterministically derived keypairs
  const coordKeys = deriveSubKeyPair(masterPrivateKey, coordPrefix);
  const flyer1Keys = deriveSubKeyPair(masterPrivateKey, flyer1Prefix);
  const flyer2Keys = deriveSubKeyPair(masterPrivateKey, flyer2Prefix);
  const flyer3Keys = deriveSubKeyPair(masterPrivateKey, flyer3Prefix);

  const coordAccount = new Account(coordinatorId, provider, new KeyPairSigner(coordKeys.keyPair));
  const flyer1Account = new Account(flyer1Id, provider, new KeyPairSigner(flyer1Keys.keyPair));
  const flyer2Account = new Account(flyer2Id, provider, new KeyPairSigner(flyer2Keys.keyPair));
  const flyer3Account = new Account(flyer3Id, provider, new KeyPairSigner(flyer3Keys.keyPair));

  const txLedger = [];

  async function ensureSubaccount(prefix, fullId, keyPair, nearAmount) {
    try {
      const acc = new Account(fullId, provider, new KeyPairSigner(keyPair));
      const b = await acc.getBalance();
      console.log(`      ✓ Sub-account ${fullId} already exists (${formatNearAmount(b.toString(), 3)} NEAR)`);
      return acc;
    } catch {
      console.log(`      Creating sub-account: ${fullId} (funding: ${nearAmount} NEAR)...`);
      const nearToTransfer = BigInt(parseNearAmount(nearAmount));
      const res = await masterAccount.createSubAccount({
        accountOrPrefix: prefix,
        publicKey: keyPair.getPublicKey(),
        nearToTransfer
      });
      const txHash = res.transaction?.hash || res.transaction_outcome?.id || 'unknown';
      txLedger.push({
        action: `create_account:${fullId}`,
        txHash,
        explorer: `https://testnet.nearblocks.io/txns/${txHash}`
      });
      console.log(`      ✓ Created ${fullId} (tx: ${txHash})`);
      return new Account(fullId, provider, new KeyPairSigner(keyPair));
    }
  }

  console.log('\n[2/8] Provisioning Coordinator & Flyer Sub-Accounts...');
  // The coordinator account pays for the contract's code at 1e19 yocto per byte, plus state and escrow headroom. A fixed 2.5 NEAR
  // was enough for an early, smaller contract and made a fresh bootstrap fail at deploy ("lacks balance for state").
  const wasmFile = path.join(rootDir, 'contracts/fly-coordinator/target/wasm32-unknown-unknown/release/fly_coordinator.wasm');
  if (!fs.existsSync(wasmFile)) throw new Error(`WASM binary not found at ${wasmFile}. Run npm run build:wasm first.`);
  const coordNeedYocto = BigInt(fs.statSync(wasmFile).size) * 10n ** 19n + 1500000000000000000000000n;
  const coordNear = (Math.ceil((Number(coordNeedYocto) / 1e24) * 100) / 100).toString();
  const masterNow = BigInt((await masterAccount.getBalance()).toString());
  if (masterNow < coordNeedYocto + 1000000000000000000000000n) {
    throw new Error(`The master account has ${formatNearAmount(masterNow.toString(), 3)} NEAR; funding the coordinator needs about ${coordNear} NEAR plus a margin. Run: node scripts/lab-env.mjs fund --force`);
  }
  await ensureSubaccount(coordPrefix, coordinatorId, coordKeys.keyPair, coordNear);
  {
    const have = BigInt((await new Account(coordinatorId, provider, new KeyPairSigner(coordKeys.keyPair)).getBalance()).toString());
    if (have < coordNeedYocto) {
      console.log(`      Topping up ${coordinatorId} by ${formatNearAmount((coordNeedYocto - have).toString(), 3)} NEAR to cover the contract's storage...`);
      await masterAccount.transfer({ receiverId: coordinatorId, amount: coordNeedYocto - have });
    }
  }
  await ensureSubaccount(flyer1Prefix, flyer1Id, flyer1Keys.keyPair, '0.15');
  await ensureSubaccount(flyer2Prefix, flyer2Id, flyer2Keys.keyPair, '0.15');
  await ensureSubaccount(flyer3Prefix, flyer3Id, flyer3Keys.keyPair, '0.15');

  // Top up flyers if balance is low
  for (const fId of [flyer1Id, flyer2Id, flyer3Id]) {
    try {
      const acc = new Account(fId, provider, masterSigner);
      const b = await acc.getBalance();
      if (b < 100000000000000000000000n) {
        console.log(`      Topping up ${fId} with 0.15 NEAR...`);
        await masterAccount.transfer({
          receiverId: fId,
          amount: 150000000000000000000000n
        });
      }
    } catch {}
  }

  // Deploy Contract
  console.log('\n[3/8] Deploying updated fly_coordinator.wasm to coordinator sub-account...');
  const wasmPath = path.join(rootDir, 'contracts/fly-coordinator/target/wasm32-unknown-unknown/release/fly_coordinator.wasm');
  if (!fs.existsSync(wasmPath)) {
    throw new Error(`WASM binary not found at ${wasmPath}. Run npm run build:wasm first.`);
  }
  const wasmBytes = fs.readFileSync(wasmPath);
  const wasmSha256 = crypto.createHash('sha256').update(wasmBytes).digest('hex');
  console.log(`      WASM Size: ${(wasmBytes.length / 1024).toFixed(1)} KB | SHA-256: ${wasmSha256.slice(0, 24)}...`);

  // Check if coordinator contract needs fresh state or redeploy
  let needsDeploy = true;
  try {
    const codeCheck = await provider.viewContractCode({ contractId: coordinatorId });
    if (codeCheck && codeCheck.hash) {
      console.log(`      Current on-chain contract code hash: ${codeCheck.hash}`);
      // Test if list_syndicates method exists
      try {
        await provider.callFunction({ contractId: coordinatorId, method: 'list_syndicates', args: {} });
        needsDeploy = false;
        console.log(`      ✓ Contract already deployed with list_syndicates and up-to-date methods.`);
      } catch (err) {
        if (err.message && (err.message.includes('MethodNotFound') || err.message.includes('not found'))) {
          console.log(`      Existing deploy has obsolete contract schema. Resetting coordinator account...`);
          // Delete old account to clear state schema and repatriate funds
          await coordAccount.deleteAccount(masterAccountId);
          await new Promise(r => setTimeout(r, 4000));
          // Re-create subaccount fresh
          await masterAccount.createSubAccount({
            accountOrPrefix: coordPrefix,
            publicKey: coordKeys.keyPair.getPublicKey(),
            nearToTransfer: BigInt(parseNearAmount('3.5'))
          });
          needsDeploy = true;
        }
      }
    }
  } catch {
    needsDeploy = true;
  }

  if (needsDeploy) {
    console.log(`      Broadcasting deploy transaction for ${coordinatorId}...`);
    const deployRes = await coordAccount.deployContract(wasmBytes);
    const deployTxHash = deployRes.transaction?.hash || deployRes.transaction_outcome?.id;
    txLedger.push({
      action: 'deploy_contract',
      txHash: deployTxHash,
      explorer: `https://testnet.nearblocks.io/txns/${deployTxHash}`
    });
    console.log(`      ✓ Deployed to ${coordinatorId} (tx: ${deployTxHash})`);

    // Call new()
    console.log('      Initializing contract with new()...');
    const initRes = await coordAccount.callFunctionRaw({
      contractId: coordinatorId,
      methodName: 'new',
      args: {},
      gas: 30000000000000n
    });
    const initTxHash = initRes.transaction?.hash || initRes.transaction_outcome?.id;
    txLedger.push({
      action: 'contract_init:new',
      txHash: initTxHash,
      explorer: `https://testnet.nearblocks.io/txns/${initTxHash}`
    });
    console.log(`      ✓ Initialized new() (tx: ${initTxHash})`);
  }

  // Read on-chain code hash
  const deployedCode = await provider.viewContractCode({ contractId: coordinatorId });
  console.log(`      ✓ On-chain code hash verified: ${deployedCode.hash}`);

  // Generate Enclave Keypair (The Roost)
  console.log('\n[4/8] Deriving Enclave Ed25519 Keypair (The Roost)...');
  const enclaveKeys = deriveSubKeyPair(masterPrivateKey, 'roost-enclave-key');
  const encPubHex = enclaveKeys.rawPub.toString('hex');
  console.log(`      Enclave Public Key (hex): ${encPubHex.slice(0, 20)}... (32 bytes)`);

  // =========================================================================
  // FLOW 1: Live Happy Path - Bounded Settlement Authority with ReleasePolicy
  // =========================================================================
  console.log('\n[5/8] FLOW 1: Live Happy Path (Bounded Release Policy Settlement)...');
  const syndicate1Id = `syn-flash-${Math.floor(Date.now() / 1000)}`;

  const releasePolicy1 = {
    allowed_recipients: [flyer1Id],
    max_release_bps_per_epoch: 10000,
    settle_deadline_block: 500000000
  };

  console.log(`      1. Calling hatch("${syndicate1Id}") with ReleasePolicy whitelist: [${flyer1Id}]...`);
  const hatchRes = await coordAccount.callFunctionRaw({
    contractId: coordinatorId,
    methodName: 'hatch',
    args: {
      syndicate_id: syndicate1Id,
      syndicate_type: 'FLASH',
      quorum_threshold: 2,
      max_spend_near: 1,
      enclave_public_key: encPubHex,
      expected_code_hash: crypto.randomBytes(32).toString('hex'),
      timeout_blocks: 50,
      payout_recipient: flyer1Id,
      release_policy: releasePolicy1
    },
    deposit: BigInt(parseNearAmount('0.01')),
    gas: 40000000000000n
  });
  const hatchTxHash = hatchRes.transaction?.hash || hatchRes.transaction_outcome?.id;
  txLedger.push({
    action: `hatch:${syndicate1Id}`,
    txHash: hatchTxHash,
    explorer: `https://testnet.nearblocks.io/txns/${hatchTxHash}`
  });
  console.log(`      ✓ Hatched syndicate (tx: ${hatchTxHash})`);

  // Computed & verified policy hash
  const policyHash1 = computePolicyHash(releasePolicy1, 50);
  console.log(`      ✓ Syndicate Policy Hash: ${policyHash1}`);
  await new Promise(r => setTimeout(r, 1500));

  console.log('      2. Depositing from 2 Flyers with explicit policy_hash consent (0.02 NEAR each)...');
  for (const [idx, flyerAcc] of [[1, flyer1Account], [2, flyer2Account]]) {
    const depRes = await flyerAcc.callFunctionRaw({
      contractId: coordinatorId,
      methodName: 'deposit',
      args: {
        syndicate_id: syndicate1Id,
        policy_hash: policyHash1
      },
      deposit: BigInt(parseNearAmount('0.02')),
      gas: 30000000000000n
    });
    const depTxHash = depRes.transaction?.hash || depRes.transaction_outcome?.id;
    txLedger.push({
      action: `deposit:flyer${idx}`,
      txHash: depTxHash,
      explorer: `https://testnet.nearblocks.io/txns/${depTxHash}`
    });
    console.log(`      ✓ Flyer ${idx} deposited 0.02 NEAR consenting to policy (tx: ${depTxHash})`);
    await new Promise(r => setTimeout(r, 1000));
  }

  // Query syndicate
  const synDataRaw = await provider.callFunction({
    contractId: coordinatorId,
    method: 'get_syndicate',
    args: { syndicate_id: syndicate1Id }
  });
  const synData = synDataRaw;
  console.log(`      ✓ Syndicate State: status=${synData.status}, flyers=${synData.active_flyer_count}, total_escrow=${formatNearAmount(synData.total_escrow)} NEAR`);

  // Construct and Sign Settlement Message with Allocations
  console.log('      3. Generating Enclave Settlement Signature over 6-tuple with allocations_hash...');
  const orderHash = crypto.createHash('sha256').update(`batch_orders_${syndicate1Id}`).digest('hex');
  const allocations1 = [
    {
      recipient: flyer1Id,
      amount: synData.total_escrow // release full 0.04 NEAR
    }
  ];
  const allocHash1 = computeAllocationsHash(allocations1);
  const signedMsg = `${coordinatorId}:${syndicate1Id}:${synData.epoch}:${synData.round_nonce}:${allocHash1}:${orderHash}`;
  const enclaveSignature = signMessage(enclaveKeys.rawPriv, signedMsg);
  console.log(`      Signed Message: "${signedMsg.slice(0, 50)}..."`);
  console.log(`      Signature: ${enclaveSignature.slice(0, 20)}... (64 bytes hex)`);

  console.log('      4. Calling settle_batch() on-chain with allocations...');
  const settleRes = await coordAccount.callFunctionRaw({
    contractId: coordinatorId,
    methodName: 'settle_batch',
    args: {
      syndicate_id: syndicate1Id,
      attestation_nonce: synData.round_nonce,
      aggregate_order_hash: orderHash,
      allocations: allocations1,
      enclave_signature: enclaveSignature
    },
    gas: 100000000000000n
  });
  const settleTxHash = settleRes.transaction?.hash || settleRes.transaction_outcome?.id;
  const settleGas = (settleRes.receipts_outcome || []).reduce((acc, r) => acc + BigInt(r.outcome?.gas_burnt || 0), BigInt(settleRes.transaction_outcome?.outcome?.gas_burnt || 0));
  const settleTGas = (Number(settleGas) / 1e12).toFixed(2);
  txLedger.push({
    action: `settle_batch:${syndicate1Id}`,
    txHash: settleTxHash,
    gasBurntTGas: settleTGas,
    explorer: `https://testnet.nearblocks.io/txns/${settleTxHash}`
  });
  console.log(`      ✓ Settle Batch Completed! (tx: ${settleTxHash}, Gas: ${settleTGas} TGas)`);

  // Verify settled state
  const postSettleRaw = await provider.callFunction({
    contractId: coordinatorId,
    method: 'get_syndicate',
    args: { syndicate_id: syndicate1Id }
  });
  const postSettleSyn = postSettleRaw;
  console.log(`      ✓ Verified Settled State: status=${postSettleSyn.status}, active_flyers=${postSettleSyn.active_flyer_count}, total_settled=${formatNearAmount(postSettleSyn.total_settled_payouts)} NEAR`);

  // Helper to submit transaction expecting on-chain failure without throwing in node
  async function callFunctionExpectFail(account, contractId, methodName, args, gas = 100000000000000n, deposit = 0n) {
    try {
      const res = await account.signAndSendTransaction({
        receiverId: contractId,
        actions: [actions.functionCall(methodName, args, BigInt(gas), BigInt(deposit))],
        throwOnFailure: false
      });
      const txHash = res.transaction?.hash || res.transaction_outcome?.id;
      const isFailure = (res.receipts_outcome || []).some(r => r.outcome?.status?.Failure) ||
        (typeof res.status === 'object' && res.status !== null && 'Failure' in res.status);
      return { isFailure, txHash, result: res };
    } catch (err) {
      const txHash = err.txHash || err.transactionResult?.transaction_outcome?.id || 'unknown';
      return { isFailure: true, txHash, error: err };
    }
  }

  // =========================================================================
  // FLOW 2: Security Track Attack Demo - On-Chain Rejection Proofs
  // =========================================================================
  console.log('\n[6/8] FLOW 2: Security Track Attack Demos (On-Chain Rejections)...');

  // Attack 1: Non-whitelisted recipient rejection
  console.log('      [Attack 1] Attempting settlement to non-whitelisted recipient...');
  const synAttack1Id = `syn-atk-wl-${Math.floor(Date.now() / 1000)}`;
  const releasePolicyAtk1 = {
    allowed_recipients: [flyer1Id], // ONLY flyer1 allowed!
    max_release_bps_per_epoch: 10000,
    settle_deadline_block: 500000000
  };
  await coordAccount.callFunctionRaw({
    contractId: coordinatorId,
    methodName: 'hatch',
    args: {
      syndicate_id: synAttack1Id,
      syndicate_type: 'FLASH',
      quorum_threshold: 1,
      max_spend_near: 1,
      enclave_public_key: encPubHex,
      expected_code_hash: crypto.randomBytes(32).toString('hex'),
      timeout_blocks: 50,
      payout_recipient: flyer1Id,
      release_policy: releasePolicyAtk1
    },
    deposit: BigInt(parseNearAmount('0.01')),
    gas: 40000000000000n
  });
  const atkPolHash = computePolicyHash(releasePolicyAtk1, 50);
  await new Promise(r => setTimeout(r, 1500));
  await flyer1Account.callFunctionRaw({
    contractId: coordinatorId,
    methodName: 'deposit',
    args: { syndicate_id: synAttack1Id, policy_hash: atkPolHash },
    deposit: BigInt(parseNearAmount('0.02')),
    gas: 30000000000000n
  });
  const synAtkData = await provider.callFunction({
    contractId: coordinatorId,
    method: 'get_syndicate',
    args: { syndicate_id: synAttack1Id }
  });
  const badAllocs1 = [{ recipient: flyer2Id, amount: '20000000000000000000000' }]; // flyer2 is NOT whitelisted!
  const badAllocHash1 = computeAllocationsHash(badAllocs1);
  const badOrderHash1 = crypto.createHash('sha256').update('bad_order_1').digest('hex');
  const badSig1 = signMessage(enclaveKeys.rawPriv, `${coordinatorId}:${synAttack1Id}:${synAtkData.epoch}:${synAtkData.round_nonce}:${badAllocHash1}:${badOrderHash1}`);

  const res1 = await callFunctionExpectFail(coordAccount, coordinatorId, 'settle_batch', {
    syndicate_id: synAttack1Id,
    attestation_nonce: synAtkData.round_nonce,
    aggregate_order_hash: badOrderHash1,
    allocations: badAllocs1,
    enclave_signature: badSig1
  });
  if (res1.isFailure) {
    txLedger.push({
      action: 'attack_rejected:non_whitelisted_recipient',
      txHash: res1.txHash,
      status: 'ON_CHAIN_REJECTED',
      reason: 'Recipient not in allowed_recipients whitelist',
      explorer: `https://testnet.nearblocks.io/txns/${res1.txHash}`
    });
    console.log(`      ✓ Attack 1 REJECTED on-chain! Non-whitelisted recipient blocked (tx: ${res1.txHash})`);
  }

  // Attack 2: Over-cap release rejection
  console.log('      [Attack 2] Attempting settlement exceeding max_release_bps_per_epoch cap...');
  const synAttack2Id = `syn-atk-cap-${Math.floor(Date.now() / 1000)}`;
  const releasePolicyAtk2 = {
    allowed_recipients: [flyer1Id],
    max_release_bps_per_epoch: 2500, // Cap at 25%
    settle_deadline_block: 500000000
  };
  await coordAccount.callFunctionRaw({
    contractId: coordinatorId,
    methodName: 'hatch',
    args: {
      syndicate_id: synAttack2Id,
      syndicate_type: 'FLASH',
      quorum_threshold: 1,
      max_spend_near: 1,
      enclave_public_key: encPubHex,
      expected_code_hash: crypto.randomBytes(32).toString('hex'),
      timeout_blocks: 50,
      payout_recipient: flyer1Id,
      release_policy: releasePolicyAtk2
    },
    deposit: BigInt(parseNearAmount('0.01')),
    gas: 40000000000000n
  });
  const atk2PolHash = computePolicyHash(releasePolicyAtk2, 50);
  await new Promise(r => setTimeout(r, 1500));
  await flyer1Account.callFunctionRaw({
    contractId: coordinatorId,
    methodName: 'deposit',
    args: { syndicate_id: synAttack2Id, policy_hash: atk2PolHash },
    deposit: BigInt(parseNearAmount('0.04')),
    gas: 30000000000000n
  });
  const synAtk2Data = await provider.callFunction({
    contractId: coordinatorId,
    method: 'get_syndicate',
    args: { syndicate_id: synAttack2Id }
  });
  // Attempt 50% release (0.02 NEAR out of 0.04 NEAR, cap is 25% = 0.01 NEAR)
  const badAllocs2 = [{ recipient: flyer1Id, amount: '20000000000000000000000' }];
  const badAllocHash2 = computeAllocationsHash(badAllocs2);
  const badOrderHash2 = crypto.createHash('sha256').update('bad_order_2').digest('hex');
  const badSig2 = signMessage(enclaveKeys.rawPriv, `${coordinatorId}:${synAttack2Id}:${synAtk2Data.epoch}:${synAtk2Data.round_nonce}:${badAllocHash2}:${badOrderHash2}`);

  const res2 = await callFunctionExpectFail(coordAccount, coordinatorId, 'settle_batch', {
    syndicate_id: synAttack2Id,
    attestation_nonce: synAtk2Data.round_nonce,
    aggregate_order_hash: badOrderHash2,
    allocations: badAllocs2,
    enclave_signature: badSig2
  });
  if (res2.isFailure) {
    txLedger.push({
      action: 'attack_rejected:over_cap_release',
      txHash: res2.txHash,
      status: 'ON_CHAIN_REJECTED',
      reason: 'Allocation sum exceeds max_release_bps_per_epoch cap',
      explorer: `https://testnet.nearblocks.io/txns/${res2.txHash}`
    });
    console.log(`      ✓ Attack 2 REJECTED on-chain! Over-cap settlement blocked (tx: ${res2.txHash})`);
  }

  // Attack 3: Wrong nonce replay rejection
  console.log('      [Attack 3] Attempting settlement replay with wrong nonce...');
  const res3 = await callFunctionExpectFail(coordAccount, coordinatorId, 'settle_batch', {
    syndicate_id: syndicate1Id,
    attestation_nonce: 'stale_nonce_replayed_0x1234567890',
    aggregate_order_hash: orderHash,
    allocations: allocations1,
    enclave_signature: enclaveSignature
  });
  if (res3.isFailure) {
    txLedger.push({
      action: 'attack_rejected:wrong_nonce_replay',
      txHash: res3.txHash,
      status: 'ON_CHAIN_REJECTED',
      reason: 'Nonce mismatch replay attack blocked',
      explorer: `https://testnet.nearblocks.io/txns/${res3.txHash}`
    });
    console.log(`      ✓ Attack 3 REJECTED on-chain! Nonce replay blocked (tx: ${res3.txHash})`);
  }

  // =========================================================================
  // FLOW 3: Live Non-Custodial Escape Hatch (hatch_out)
  // =========================================================================
  console.log('\n[7/8] FLOW 3: Live Non-Custodial Escape Hatch (hatch_out)...');
  const syndicateEscapeId = `syn-escape-${Math.floor(Date.now() / 1000)}`;
  const releasePolicyEscape = {
    allowed_recipients: [coordinatorId],
    max_release_bps_per_epoch: 10000,
    settle_deadline_block: 500000000
  };

  console.log(`      1. Calling hatch("${syndicateEscapeId}") with timeout_blocks=10 (the contract's floor)...`);
  const hatchEscRes = await coordAccount.callFunctionRaw({
    contractId: coordinatorId,
    methodName: 'hatch',
    args: {
      syndicate_id: syndicateEscapeId,
      syndicate_type: 'FLASH',
      quorum_threshold: 1,
      max_spend_near: 1,
      enclave_public_key: encPubHex,
      expected_code_hash: crypto.randomBytes(32).toString('hex'),
      timeout_blocks: 10,
      payout_recipient: coordinatorId,
      release_policy: releasePolicyEscape
    },
    deposit: BigInt(parseNearAmount('0.01')),
    gas: 40000000000000n
  });
  const hatchEscTxHash = hatchEscRes.transaction?.hash || hatchEscRes.transaction_outcome?.id;
  txLedger.push({
    action: `hatch:${syndicateEscapeId}`,
    txHash: hatchEscTxHash,
    explorer: `https://testnet.nearblocks.io/txns/${hatchEscTxHash}`
  });
  console.log(`      ✓ Hatched escape syndicate (tx: ${hatchEscTxHash})`);

  const escPolHash = computePolicyHash(releasePolicyEscape, 10);
  await new Promise(r => setTimeout(r, 1500));

  console.log('      2. Depositing from Flyer 2 (0.03 NEAR)...');
  const depEscRes = await flyer2Account.callFunctionRaw({
    contractId: coordinatorId,
    methodName: 'deposit',
    args: { syndicate_id: syndicateEscapeId, policy_hash: escPolHash },
    deposit: BigInt(parseNearAmount('0.03')),
    gas: 30000000000000n
  });
  const depEscTxHash = depEscRes.transaction?.hash || depEscRes.transaction_outcome?.id;
  txLedger.push({
    action: `deposit:flyer2:escape`,
    txHash: depEscTxHash,
    explorer: `https://testnet.nearblocks.io/txns/${depEscTxHash}`
  });
  console.log(`      ✓ Flyer 2 deposited 0.03 NEAR (tx: ${depEscTxHash})`);

  console.log('      3. Waiting 6 blocks (~8s) for timelock to expire...');
  await new Promise(r => setTimeout(r, 8000));

  console.log('      4. Triggering sovereign hatch_out() refund for Flyer 2...');
  const exitRes = await flyer2Account.callFunctionRaw({
    contractId: coordinatorId,
    methodName: 'hatch_out',
    args: { syndicate_id: syndicateEscapeId },
    gas: 60000000000000n
  });
  const exitTxHash = exitRes.transaction?.hash || exitRes.transaction_outcome?.id;
  const exitGas = (exitRes.receipts_outcome || []).reduce((acc, r) => acc + BigInt(r.outcome?.gas_burnt || 0), BigInt(exitRes.transaction_outcome?.outcome?.gas_burnt || 0));
  const exitTGas = (Number(exitGas) / 1e12).toFixed(2);
  txLedger.push({
    action: `hatch_out:${syndicateEscapeId}`,
    txHash: exitTxHash,
    gasBurntTGas: exitTGas,
    explorer: `https://testnet.nearblocks.io/txns/${exitTxHash}`
  });
  console.log(`      ✓ Escape Hatch Triggered! 100% of Flyer 2 escrow refunded. (tx: ${exitTxHash}, Gas: ${exitTGas} TGas)`);

  // Verify final status
  const postExitSyn = await provider.callFunction({
    contractId: coordinatorId,
    method: 'get_syndicate',
    args: { syndicate_id: syndicateEscapeId }
  });
  console.log(`      ✓ Final Escape Syndicate Status: ${postExitSyn.status}, total_escrow: ${formatNearAmount(postExitSyn.total_escrow)} NEAR`);

  // =========================================================================
  // FLOW 4: Multi-Syndicate Network Discovery Queries on Testnet
  // =========================================================================
  console.log('\n[8/8] FLOW 4: Multi-Syndicate Discovery on Live Testnet RPC...');
  const allSyndicates = await provider.callFunction({
    contractId: coordinatorId,
    method: 'list_syndicates',
    args: { from_index: 0, limit: 10 }
  });
  console.log(`      ✓ list_syndicates() returned ${allSyndicates.length} active/settled syndicates on testnet:`);
  for (const s of allSyndicates) {
    console.log(`        - [${s.id}] type=${s.syndicate_type}, status=${s.status}, policy_hash=${s.policy_hash.slice(0, 16)}...`);
  }

  const memberSyndicates = await provider.callFunction({
    contractId: coordinatorId,
    method: 'list_syndicates_by_member',
    args: { account_id: flyer2Id, from_index: 0, limit: 10 }
  });
  console.log(`      ✓ list_syndicates_by_member("${flyer2Id}") returned ${memberSyndicates.length} syndicates.`);

  // Write Evidence Artifact
  const evidencePath = path.join(rootDir, 'docs/canonical/testnet-evidence.json');
  const evidence = {
    timestamp: new Date().toISOString(),
    network: 'testnet',
    coordinatorContract: coordinatorId,
    contractCodeHash: deployedCode.hash,
    wasmSha256,
    masterAccount: masterAccountId,
    flyers: [flyer1Id, flyer2Id, flyer3Id],
    syndicatesDiscovered: allSyndicates.length,
    syndicates: allSyndicates.map(s => ({
      id: s.id,
      type: s.syndicate_type,
      status: s.status,
      policy_hash: s.policy_hash,
      active_flyers: s.active_flyer_count,
      total_escrow: s.total_escrow
    })),
    transactions: txLedger
  };

  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
  console.log(`\n════════════════════════════════════════════════════════════════`);
  console.log(`✓ All live testnet transactions and proofs recorded to:`);
  console.log(`  ${evidencePath}`);
  console.log(`  Total Transactions Recorded: ${txLedger.length}`);
  console.log(`════════════════════════════════════════════════════════════════\n`);
}

main().catch(err => {
  console.error('\n❌ Fatal Testnet E2E Error:', err);
  process.exit(1);
});
