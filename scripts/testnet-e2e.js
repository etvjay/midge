import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'url';
import {
  Account,
  JsonRpcProvider,
  KeyPair,
  KeyPairSigner,
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

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║       FLY PROTOCOL: LIVE TESTNET END-TO-END DEPLOYMENT         ║');
  console.log('║       NEAR HACKATHON: Build Beyond Boundaries (Nov 2026)       ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const env = loadEnv();
  const masterAccountId = env.NEAR_ACCOUNT_ID;
  const masterPrivateKey = env.NEAR_PRIVATE_KEY;

  if (!masterAccountId || !masterPrivateKey) {
    throw new Error('NEAR_ACCOUNT_ID and NEAR_PRIVATE_KEY must be defined in .env');
  }

  console.log(`[1/7] Master Deployer Account: ${masterAccountId}`);
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

  console.log('\n[2/7] Provisioning Coordinator & Flyer Sub-Accounts...');
  await ensureSubaccount(coordPrefix, coordinatorId, coordKeys.keyPair, '3.2');
  await ensureSubaccount(flyer1Prefix, flyer1Id, flyer1Keys.keyPair, '0.15');
  await ensureSubaccount(flyer2Prefix, flyer2Id, flyer2Keys.keyPair, '0.15');
  await ensureSubaccount(flyer3Prefix, flyer3Id, flyer3Keys.keyPair, '0.15');

  // Top up flyers to guarantee gas buffer for transactions
  for (const fId of [flyer1Id, flyer2Id, flyer3Id]) {
    const acc = new Account(fId, provider, masterSigner);
    const b = await acc.getBalance();
    if (b < 150000000000000000000000n) {
      console.log(`      Topping up ${fId} with 0.3 NEAR...`);
      await masterAccount.transfer({
        receiverId: fId,
        amount: 300000000000000000000000n
      });
    }
  }

  // Deploy Contract
  console.log('\n[3/7] Deploying fly_coordinator.wasm to coordinator sub-account...');
  const wasmPath = path.join(rootDir, 'contracts/fly-coordinator/target/wasm32-unknown-unknown/release/fly_coordinator.wasm');
  if (!fs.existsSync(wasmPath)) {
    throw new Error(`WASM binary not found at ${wasmPath}. Run npm run build:wasm first.`);
  }
  const wasmBytes = fs.readFileSync(wasmPath);
  console.log(`      WASM Size: ${(wasmBytes.length / 1024).toFixed(1)} KB`);

  let codeCheck = null;
  try {
    codeCheck = await provider.viewContractCode({ contractId: coordinatorId });
  } catch {
    // contract not yet deployed
  }

  if (!codeCheck || !codeCheck.code || codeCheck.code.length === 0) {
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
    try {
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
    } catch (e) {
      if (e.message?.includes('already been initialized')) {
        console.log('      ✓ Contract was already initialized.');
      } else {
        throw e;
      }
    }
  } else {
    console.log(`      ✓ Contract already deployed at ${coordinatorId} (${codeCheck.code.length} bytes)`);
  }

  // Generate Enclave Keypair (The Roost)
  console.log('\n[4/7] Deriving Enclave Ed25519 Keypair (The Roost)...');
  const enclaveKeys = deriveSubKeyPair(masterPrivateKey, 'roost-enclave-key');
  const encPubHex = enclaveKeys.rawPub.toString('hex');
  console.log(`      Enclave Public Key (hex): ${encPubHex.slice(0, 20)}... (32 bytes)`);

  // Syndicate 1: Live Flash Settlement Lifecycle
  console.log('\n[5/7] Executing Live Syndicate 1: Flash Settlement Lifecycle...');
  const syndicate1Id = `syn-flash-${Math.floor(Date.now() / 1000)}`;

  console.log(`      1. Calling hatch("${syndicate1Id}")...`);
  const hatchRes = await coordAccount.callFunctionRaw({
    contractId: coordinatorId,
    methodName: 'hatch',
    args: {
      syndicate_id: syndicate1Id,
      syndicate_type: 'FLASH',
      quorum_threshold: 3,
      max_spend_near: 1,
      enclave_public_key: encPubHex,
      expected_code_hash: crypto.randomBytes(32).toString('hex'),
      timeout_blocks: 50,
      payout_recipient: flyer1Id
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

  console.log('      2. Depositing from 3 Flyers (0.02 NEAR each)...');
  for (const [idx, flyerAcc] of [[1, flyer1Account], [2, flyer2Account], [3, flyer3Account]]) {
    const depRes = await flyerAcc.callFunctionRaw({
      contractId: coordinatorId,
      methodName: 'deposit',
      args: { syndicate_id: syndicate1Id },
      deposit: BigInt(parseNearAmount('0.02')),
      gas: 30000000000000n
    });
    const depTxHash = depRes.transaction?.hash || depRes.transaction_outcome?.id;
    txLedger.push({
      action: `deposit:flyer${idx}`,
      txHash: depTxHash,
      explorer: `https://testnet.nearblocks.io/txns/${depTxHash}`
    });
    console.log(`      ✓ Flyer ${idx} deposited 0.02 NEAR (tx: ${depTxHash})`);
    await new Promise(r => setTimeout(r, 1000));
  }

  // Query syndicate
  const synDataRaw = await provider.callFunction({
    contractId: coordinatorId,
    method: 'get_syndicate',
    args: { syndicate_id: syndicate1Id }
  });
  const synData = typeof synDataRaw === 'string' ? JSON.parse(synDataRaw) : synDataRaw;
  console.log(`      ✓ Syndicate State: status=${synData.status}, flyers=${synData.active_flyer_count}, total_escrow=${formatNearAmount(synData.total_escrow)} NEAR`);

  // Construct and Sign Settlement Message
  console.log('      3. Generating Enclave Settlement Signature...');
  const orderHash = crypto.createHash('sha256').update(`batch_orders_${syndicate1Id}`).digest('hex');
  const signedMsg = `${coordinatorId}:${syndicate1Id}:${synData.epoch}:${synData.round_nonce}:${synData.payout_recipient}:${orderHash}`;
  const enclaveSignature = signMessage(enclaveKeys.rawPriv, signedMsg);
  console.log(`      Signed Message: "${signedMsg.slice(0, 45)}..."`);
  console.log(`      Signature: ${enclaveSignature.slice(0, 20)}... (64 bytes hex)`);

  console.log('      4. Calling settle_batch() on-chain...');
  const settleRes = await coordAccount.callFunctionRaw({
    contractId: coordinatorId,
    methodName: 'settle_batch',
    args: {
      syndicate_id: syndicate1Id,
      attestation_nonce: synData.round_nonce,
      aggregate_order_hash: orderHash,
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
  const postSettleSyn = typeof postSettleRaw === 'string' ? JSON.parse(postSettleRaw) : postSettleRaw;
  console.log(`      ✓ Verified Settled State: status=${postSettleSyn.status}, active_flyers=${postSettleSyn.active_flyer_count}, total_settled=${formatNearAmount(postSettleSyn.total_settled_payouts)} NEAR`);

  // Syndicate 2: Live Non-Custodial Escape Hatch (hatch_out)
  console.log('\n[6/7] Executing Live Syndicate 2: Escape Hatch (hatch_out) Lifecycle...');
  const syndicate2Id = `syn-escape-${Math.floor(Date.now() / 1000)}`;

  console.log(`      1. Calling hatch("${syndicate2Id}") with timeout_blocks=2...`);
  const hatch2Res = await coordAccount.callFunctionRaw({
    contractId: coordinatorId,
    methodName: 'hatch',
    args: {
      syndicate_id: syndicate2Id,
      syndicate_type: 'FLASH',
      quorum_threshold: 1,
      max_spend_near: 1,
      enclave_public_key: encPubHex,
      expected_code_hash: crypto.randomBytes(32).toString('hex'),
      timeout_blocks: 2,
      payout_recipient: coordinatorId
    },
    deposit: BigInt(parseNearAmount('0.01')),
    gas: 40000000000000n
  });
  const hatch2TxHash = hatch2Res.transaction?.hash || hatch2Res.transaction_outcome?.id;
  txLedger.push({
    action: `hatch:${syndicate2Id}`,
    txHash: hatch2TxHash,
    explorer: `https://testnet.nearblocks.io/txns/${hatch2TxHash}`
  });
  console.log(`      ✓ Hatched escape syndicate (tx: ${hatch2TxHash})`);

  console.log('      2. Depositing from Flyer 2 (0.03 NEAR)...');
  const dep2Res = await flyer2Account.callFunctionRaw({
    contractId: coordinatorId,
    methodName: 'deposit',
    args: { syndicate_id: syndicate2Id },
    deposit: BigInt(parseNearAmount('0.03')),
    gas: 30000000000000n
  });
  const dep2TxHash = dep2Res.transaction?.hash || dep2Res.transaction_outcome?.id;
  txLedger.push({
    action: `deposit:flyer2:escape`,
    txHash: dep2TxHash,
    explorer: `https://testnet.nearblocks.io/txns/${dep2TxHash}`
  });
  console.log(`      ✓ Flyer 2 deposited 0.03 NEAR (tx: ${dep2TxHash})`);

  console.log('      3. Waiting for 3 blocks to elapse (~4.5s)...');
  await new Promise(r => setTimeout(r, 4500));

  console.log('      4. Calling hatch_out() from Flyer 2...');
  const hatchOutRes = await flyer2Account.callFunctionRaw({
    contractId: coordinatorId,
    methodName: 'hatch_out',
    args: { syndicate_id: syndicate2Id },
    gas: 35000000000000n // 35 TGas (15 TGas callback + 20 TGas execution)
  });
  const hatchOutTxHash = hatchOutRes.transaction?.hash || hatchOutRes.transaction_outcome?.id;
  const hatchOutGas = (hatchOutRes.receipts_outcome || []).reduce((acc, r) => acc + BigInt(r.outcome?.gas_burnt || 0), BigInt(hatchOutRes.transaction_outcome?.outcome?.gas_burnt || 0));
  const hatchOutTGas = (Number(hatchOutGas) / 1e12).toFixed(2);
  txLedger.push({
    action: `hatch_out:${syndicate2Id}`,
    txHash: hatchOutTxHash,
    gasBurntTGas: hatchOutTGas,
    explorer: `https://testnet.nearblocks.io/txns/${hatchOutTxHash}`
  });
  console.log(`      ✓ Escape Hatch Refund Completed! (tx: ${hatchOutTxHash}, Gas: ${hatchOutTGas} TGas)`);

  const postEscapeRaw = await provider.callFunction({
    contractId: coordinatorId,
    method: 'get_syndicate',
    args: { syndicate_id: syndicate2Id }
  });
  const postEscapeSyn = typeof postEscapeRaw === 'string' ? JSON.parse(postEscapeRaw) : postEscapeRaw;
  console.log(`      ✓ Syndicate Post-Escape Status: ${postEscapeSyn.status}`);

  // Save evidence
  console.log('\n[7/7] Recording Evidence Ledger...');
  const evidenceData = {
    timestamp: new Date().toISOString(),
    network: 'testnet',
    coordinatorContract: coordinatorId,
    masterAccount: masterAccountId,
    flyers: [flyer1Id, flyer2Id, flyer3Id],
    transactions: txLedger
  };

  const evidencePath = path.join(rootDir, 'docs/canonical/testnet-evidence.json');
  fs.writeFileSync(evidencePath, JSON.stringify(evidenceData, null, 2));
  console.log(`✓ Saved ${txLedger.length} transaction records to ${evidencePath}`);

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('                 TESTNET VERIFICATION SUMMARY                   ');
  console.log('════════════════════════════════════════════════════════════════');
  for (const tx of txLedger) {
    const gasStr = tx.gasBurntTGas ? ` (${tx.gasBurntTGas} TGas)` : '';
    console.log(`- ${tx.action.padEnd(25)}: ${tx.explorer}${gasStr}`);
  }
  console.log('════════════════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('\n❌ Execution Failed:', err);
  process.exit(1);
});
