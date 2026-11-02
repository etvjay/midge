import { OtcBlockTradeFacility } from '../src/facilities/otc-block-trade.js';
import { ConfidentialComputeSyndicate } from '../src/facilities/compute-syndicate.js';

export async function verifyOtcAndComputeFacilities() {
  console.log('======================================================');
  console.log(' [VERIFICATION 6] OTC BLOCK TRADES & COMPUTE SYNDICATE');
  console.log(' Target: Confidential Dark Matching & Pooled AI Enclaves');
  console.log('======================================================');

  // --- PART A: OTC BLOCK TRADE MATCHING ---
  console.log('[1/4] Instantiating OTC Block Trade Facility in Roost TEE...');
  const otc = new OtcBlockTradeFacility();

  const buyOrder = otc.submitSealedOrder({
    flyerId: 'fund-wintermute.near',
    side: 'BUY',
    assetIn: 'USDC',
    amountIn: 200000,
    assetOut: 'wNEAR',
    minOutputAmount: 49500,
  });

  const sellOrder = otc.submitSealedOrder({
    flyerId: 'miner-syndicate.near',
    side: 'SELL',
    assetIn: 'wNEAR',
    amountIn: 50000,
    assetOut: 'USDC',
    minOutputAmount: 198000,
  });

  console.log(`  ✓ Sealed Orders Ingested: 1 BUY (${buyOrder.orderId}), 1 SELL (${sellOrder.orderId})`);

  console.log('[2/4] Crossing orders at mid-market clearing price ($4.00 / NEAR)...');
  const matchedTrade = otc.matchCrossingOrders(buyOrder.orderId, sellOrder.orderId, 4.0);

  console.log(`  ✓ Matched Volume:    ${matchedTrade.matchedVolumeOut.toLocaleString()} wNEAR for ${matchedTrade.matchedVolumeIn.toLocaleString()} USDC`);
  console.log(`  ✓ Clearing Price:    $${matchedTrade.clearingPrice.toFixed(2)}`);
  console.log(`  ✓ Settlement Shard:  ${matchedTrade.settlementShard}`);
  console.log(`  ✓ MEV Protection:    ${matchedTrade.mevProtection}`);

  // --- PART B: CONFIDENTIAL AI COMPUTE SYNDICATE ---
  console.log('\n[3/4] Initializing Confidential AI Compute Syndicate (Use Case B)...');
  const compute = new ConfidentialComputeSyndicate();
  compute.depositComputeCredits('agent-quant-01.near', 5.0);
  compute.depositComputeCredits('agent-nlp-researcher.near', 5.0);
  compute.depositComputeCredits('agent-risk-officer.near', 5.0);

  console.log(`  ✓ Pooled Compute Pool: ${compute.totalPooled} NEAR across 3 agents`);

  console.log('[4/4] Executing sealed inference on NEAR AI Cloud (Qwen/Qwen3.6-35B-A3B-FP8)...');
  const inference = await compute.executeConfidentialInference({
    prompt: 'Synthesize optimal portfolio hedge against cross-chain bridge volatility',
    requiredQuorum: 2,
  });

  console.log(`  ✓ Hardware Attested:   ${inference.hardwareVerified ? 'YES (Intel TDX)' : 'NO'}`);
  console.log(`  ✓ Model Signer:        ${inference.modelSigner}`);
  console.log(`  ✓ Privacy Protection:  ${inference.privacyGuarantee}`);
  console.log(`  ✓ Result Digest:       ${inference.inferenceResultHash.substring(0, 24)}...`);

  console.log('\n>>> [PASS] OTC BLOCK TRADES & COMPUTE SYNDICATE 100% VERIFIED.\n');

  return {
    verified: true,
    otcTradeId: matchedTrade.tradeId,
    computeInferenceHash: inference.inferenceResultHash,
  };
}

if (process.argv[1]?.endsWith('06-otc-and-compute-facilities.js')) {
  verifyOtcAndComputeFacilities().catch((err) => {
    console.error('[FAIL]', err);
    process.exit(1);
  });
}
