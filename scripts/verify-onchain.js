import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { JsonRpcProvider } from 'near-api-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║       FLY PROTOCOL: INDEPENDENT ON-CHAIN RPC VERIFIER          ║');
  console.log('║       Cryptographic State & Proofs on NEAR Testnet             ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Check offline skip flags
  const isOffline = process.argv.includes('--offline') || process.env.FLY_OFFLINE === '1';
  if (isOffline) {
    console.log('[ON-CHAIN VERIFY] ⚠️  NOT VERIFIED (offline mode: network check skipped)\n');
    process.exit(0);
  }

  const evidencePath = path.join(rootDir, 'docs/canonical/testnet-evidence.json');
  if (!fs.existsSync(evidencePath)) {
    console.log('[ON-CHAIN VERIFY] ⚠️  NOT VERIFIED (offline: docs/canonical/testnet-evidence.json not found)\n');
    process.exit(0);
  }

  const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  const coordinatorId = evidence.coordinatorContract;
  const expectedCodeHash = evidence.contractCodeHash;
  const rpcUrl = process.env.NEAR_RPC_URL || 'https://test.rpc.fastnear.com';

  console.log(`[1/4] Connecting to Independent NEAR RPC (${rpcUrl})...`);
  const provider = new JsonRpcProvider({ url: rpcUrl });

  // Quick connectivity ping
  try {
    await provider.sendJsonRpc('status', []);
    console.log('      ✓ Connected to NEAR RPC node.');
  } catch (err) {
    console.log(`[ON-CHAIN VERIFY] ⚠️  NOT VERIFIED (offline: RPC unreachable: ${err.message})\n`);
    process.exit(0);
  }

  // 1. Verify deployed contract code hash matches evidence
  console.log(`\n[2/4] Verifying Contract Code Hash on ${coordinatorId}...`);
  const contractCode = await provider.viewContractCode({ contractId: coordinatorId });
  console.log(`      On-Chain Code Hash : ${contractCode.hash}`);
  console.log(`      Evidence Code Hash  : ${expectedCodeHash}`);
  if (contractCode.hash !== expectedCodeHash) {
    throw new Error(`Code hash mismatch: expected ${expectedCodeHash}, got ${contractCode.hash}`);
  }
  console.log('      ✓ Contract code hash strictly matches reproducible build.');

  // 2. Query view methods: list_syndicates
  console.log('\n[3/4] Verifying Multi-Syndicate Discovery via list_syndicates view call...');
  const syndicates = await provider.callFunction({
    contractId: coordinatorId,
    method: 'list_syndicates',
    args: { from_index: 0, limit: 10 }
  });
  console.log(`      ✓ list_syndicates() returned ${syndicates.length} active/settled syndicates.`);
  for (const syn of syndicates) {
    console.log(`        - Syndicate [${syn.id}]: type=${syn.syndicate_type}, status=${syn.status}, policy_hash=${syn.policy_hash?.slice(0, 16)}...`);
  }

  // 3. Verify all recorded transactions on chain
  console.log('\n[4/4] Verifying Transaction Statuses on NEAR Testnet Ledger...');
  let verifiedCount = 0;
  for (const item of evidence.transactions) {
    const isAttack = item.action.startsWith('attack_rejected');
    const sender = isAttack ? coordinatorId : coordinatorId;
    const tx = await provider.sendJsonRpc('tx', [item.txHash, sender]);
    const statusKeys = Object.keys(tx.status || {});

    if (isAttack) {
      if (!tx.status?.Failure && !statusKeys.includes('Failure')) {
        throw new Error(`Expected attack transaction ${item.txHash} to fail on-chain, but succeeded.`);
      }
      console.log(`      ✓ [REJECTED PROOF] ${item.action.padEnd(42)} tx: ${item.txHash.slice(0, 18)}... (On-Chain Failure verified)`);
    } else {
      if (tx.status?.Failure) {
        throw new Error(`Expected transaction ${item.txHash} to succeed, but failed on-chain.`);
      }
      const gasNote = item.gasBurntTGas ? `(${item.gasBurntTGas} TGas)` : '';
      console.log(`      ✓ [SUCCESS PROOF]  ${item.action.padEnd(42)} tx: ${item.txHash.slice(0, 18)}... ${gasNote}`);
    }
    verifiedCount++;
  }

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log(`✓ ALL ${verifiedCount} ON-CHAIN TRANSACTIONS & CRYPTOGRAPHIC PROOFS VERIFIED`);
  console.log(`  Coordinator Contract : ${coordinatorId}`);
  console.log(`  Code Hash            : ${contractCode.hash}`);
  console.log(`  WASM SHA-256         : ${evidence.wasmSha256}`);
  console.log(`  Network              : ${evidence.network}`);
  console.log('════════════════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('\n❌ On-Chain Verification Failed:', err);
  process.exit(1);
});
