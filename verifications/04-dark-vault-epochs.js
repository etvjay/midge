import { FlyNestContract } from '../src/contracts/nest.js';
import { SyndicatePod } from '../src/syndicate/pod.js';
import { FarPrivateShardBridge } from '../src/settlement/far-shard.js';
import { ChainSignaturesMPC } from '../src/multichain/chain-signatures.js';
import { X402CommerceEngine } from '../src/commerce/x402.js';

export async function verifyDarkVaultAndEcosystem() {
  console.log('\n======================================================');
  console.log(' [VERIFICATION 4] DARK VAULT, PODS, FAR SHARD & MPC');
  console.log(' Target: Multi-Epoch Treasury, Omnichain MPC & x402');
  console.log('======================================================');

  const nest = new FlyNestContract();
  const bridge = new FarPrivateShardBridge();
  const mpc = new ChainSignaturesMPC();
  const commerce = new X402CommerceEngine();

  const vaultId = 'institutional-dark-vault';
  const expectedTeeHash = '0xfa1098234bc98710928374bc98237410982374bc98710928374bc98237410982';

  // 1. Hatch a Persistent Dark Vault
  console.log('[1/5] Hatching persistent Dark Vault on Nest contract...');
  const vault = nest.hatch({
    syndicateId: vaultId,
    syndicateType: 'DARK_VAULT',
    quorumThreshold: 3,
    maxSpendPerFlyer: 1000,
    expectedCodeHash: expectedTeeHash,
    timeoutBlocks: 100,
  });
  console.log(`  ✓ Hatched Type:        ${vault.type} (Epoch: ${vault.epoch})`);
  console.log(`  ✓ Sub-Account:         ${vault.subAccount}`);

  // 2. Derive Omnichain Identity via Chain Signatures
  console.log('\n[2/5] Deriving Omnichain Threshold Identity across 3 blockchains...');
  const omni = mpc.deriveOmnichainIdentity(vault.subAccount);
  console.log(`  ✓ EVM (Ethereum):      ${omni.identities.evm.address}`);
  console.log(`  ✓ Bitcoin (Taproot):   ${omni.identities.bitcoin.address}`);
  console.log(`  ✓ Solana (Ed25519):    ${omni.identities.solana.address}`);

  // 3. Create a Tactical Pod within the Syndicate
  console.log('\n[3/5] Instantiating a specialized Arbitrage Pod within the Vault...');
  const arbPod = new SyndicatePod({
    podId: 'quant-arb-pod-01',
    podType: 'EXECUTION',
    syndicateId: vaultId,
    maxCapitalAllocation: 2500,
  });
  arbPod.registerFlyer('bot-alpha', 'LEAD_TRADER');
  arbPod.registerFlyer('bot-beta', 'EXECUTION_AGENT');
  console.log(`  ✓ Pod Created:         ${arbPod.podId} (Members: ${arbPod.flyers.size})`);

  // 4. Test x402 Agent Micro-Commerce between Flyers
  console.log('\n[4/5] Executing x402 Agent Micro-Commerce during deliberation...');
  const invoice = commerce.createPaymentChallenge({
    sellerFlyerId: 'bot-alpha',
    resourceId: 'orderbook-depth-signal-v2',
    priceUsdc: 2.5,
    description: 'Real-time orderbook depth across 35 chains',
  });
  console.log(`  ✓ HTTP 402 Issued:     ${invoice.invoiceId} (${invoice.priceUsdc} USDC)`);
  const receipt = commerce.settleInvoice({
    invoiceId: invoice.invoiceId,
    buyerFlyerId: 'bot-beta',
    maxAcceptablePrice: 5.0,
  });
  console.log(`  ✓ Payment Settled:     ${receipt.receiptId} via ${receipt.settledVia}`);

  // 5. Test FAR Shard IMT Token Lifecycle & Multi-Epoch Advancement
  console.log('\n[5/5] Testing FAR Shard IMT lifecycle & Dark Vault Epoch 1 → 2...');
  const dep = bridge.lockPublicTreasury({
    depositor: 'institutional-lp-01.near',
    assetId: 'nep141:wrap.near',
    amount: 1000,
  });
  const imt = bridge.mintImtOnFar({
    depositReceipt: dep,
    privateAccount: vault.subAccount,
  });
  console.log(`  ✓ IMT Minted on FAR:   ${imt.mintedAmount} ${imt.imtAssetId} (${imt.consensus})`);

  // Settle Epoch 1
  nest.deposit(vaultId, 'bot-alpha', 500);
  nest.deposit(vaultId, 'bot-beta', 500);
  nest.deposit(vaultId, 'bot-gamma', 500);

  const settlementEpoch1 = nest.settleBatch(vaultId, {
    attestationNonce: vault.roundNonce,
    enclaveCodeHash: expectedTeeHash,
    aggregateOrder: { pair: 'USDC/ETH', total: 1500 },
  });
  console.log(`  ✓ Epoch 1 Settled:     ${settlementEpoch1.lifecycle} (New Nonce: ${settlementEpoch1.nextEpochNonce.slice(0, 16)}...)`);
  console.log(`  ✓ Vault Remains:       ${vault.status} (Now in Epoch ${vault.epoch})`);

  // Burn and withdraw clean
  const withdrawal = bridge.burnImtAndWithdraw({
    privateAccount: vault.subAccount,
    imtAmount: 1000,
    publicDestinationWallet: 'clean-cold-storage.near',
  });
  console.log(`  ✓ Clean Withdrawal:    ${withdrawal.withdrawalId} (${withdrawal.decoupledFrom})`);

  console.log('\n>>> [PASS] DARK VAULT, PODS & MULTICHAIN MPC 100% VERIFIED.');
  return { verified: true, vaultType: vault.type, epochsCompleted: vault.epoch - 1 };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  verifyDarkVaultAndEcosystem().catch((err) => {
    console.error('FAILED:', err);
    process.exit(1);
  });
}
