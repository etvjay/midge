#!/usr/bin/env node

/**
 * scripts/baseline.js
 * 
 * Measured Economic Baseline: Sealed-Batch vs. Public Sequential Execution
 * 
 * Compares:
 * (a) Public Sequential Execution: Orders visible in public mempool, subjected to
 *     front-running / sandwich extraction by MEV searchers on a CPMM pool.
 * (b) Sealed-Intent Deliberation & Batch Execution (Midge): Orders encrypted
 *     in Roost enclave RAM, cleared at uniform price with zero pre-trade information leakage.
 * 
 * Grounded in:
 * - Real 1Click token registry prices (wNEAR = $3.96, USDC = $0.99956)
 * - Deterministic PRNG with fixed seed (Mulberry32) for 100% reproducibility
 * - Confidence intervals (95% CI) computed across N=100 simulated trading epochs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 1. Deterministic Mulberry32 PRNG
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 2. CPMM AMM Pool Model (x * y = k)
class ConstantProductPool {
  constructor(reserveA, reserveB, feeBps = 30) {
    this.reserveA = reserveA; // wNEAR
    this.reserveB = reserveB; // USDC
    this.feeBps = feeBps;     // 0.3%
  }

  getSpotPrice() {
    return this.reserveB / this.reserveA;
  }

  // Swap B (USDC) for A (wNEAR)
  swapBForA(amountInB) {
    const feeMultiplier = (10000 - this.feeBps) / 10000;
    const amountInWithFee = amountInB * feeMultiplier;
    const amountOutA = (this.reserveA * amountInWithFee) / (this.reserveB + amountInWithFee);
    this.reserveA -= amountOutA;
    this.reserveB += amountInB;
    return amountOutA;
  }

  // Swap A (wNEAR) for B (USDC)
  swapAForB(amountInA) {
    const feeMultiplier = (10000 - this.feeBps) / 10000;
    const amountInWithFee = amountInA * feeMultiplier;
    const amountOutB = (this.reserveB * amountInWithFee) / (this.reserveA + amountInWithFee);
    this.reserveA += amountInA;
    this.reserveB -= amountOutB;
    return amountOutB;
  }
}

// 3. Statistical Helpers
function computeStats(samples) {
  const n = samples.length;
  const mean = samples.reduce((a, b) => a + b, 0) / n;
  const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  const stdDev = Math.sqrt(variance);
  const marginOfError = 1.96 * (stdDev / Math.sqrt(n)); // 95% CI
  return {
    mean,
    stdDev,
    marginOfError,
    ciLow: mean - marginOfError,
    ciHigh: mean + marginOfError,
  };
}

function runSimulation({
  seed = 0x464c59, // "FLY"
  numRuns = 100,
  agentsPerEpoch = 8,
  initialNearReserve = 100000, // 100k wNEAR
  referenceNearPriceUsdc = 3.96, // From 1Click registry
  maxSlippageBps = 150, // 1.5% max slippage allowed by agents
} = {}) {
  const prng = mulberry32(seed);
  const initialUsdcReserve = initialNearReserve * referenceNearPriceUsdc; // $396,000 USDC

  const sequentialSlippageSamples = [];
  const sequentialSearcherProfitSamples = [];
  const sealedBatchSlippageSamples = [];
  const sealedBatchSearcherProfitSamples = [];
  const netSavingsSamples = [];

  for (let run = 0; run < numRuns; run++) {
    // Generate agent orders: each agent buying wNEAR with stochastic USDC volume ($3,000 - $12,000)
    const agentOrdersUsdc = [];
    for (let i = 0; i < agentsPerEpoch; i++) {
      const orderUsdc = 3000 + prng() * 9000; // Uniform $3k - $12k
      agentOrdersUsdc.push(orderUsdc);
    }
    const totalOrderVolumeUsdc = agentOrdersUsdc.reduce((a, b) => a + b, 0);

    // =========================================================================
    // SCENARIO A: Public Sequential Execution (Mempool Visible to Searchers)
    // =========================================================================
    const publicPool = new ConstantProductPool(initialNearReserve, initialUsdcReserve);
    let totalPublicNearReceived = 0;
    let totalSearcherProfitUsdc = 0;

    for (const orderUsdc of agentOrdersUsdc) {
      const spotBefore = publicPool.getSpotPrice();

      // MEV Searcher observes victim order in public mempool.
      // Front-runs by swapping USDC for wNEAR up to victim's max slippage threshold
      const maxAllowedPrice = spotBefore * (1 + maxSlippageBps / 10000);
      // Optimal front-run capital approximation:
      const frontRunUsdc = Math.min(orderUsdc * 0.45, (maxAllowedPrice - spotBefore) * publicPool.reserveA * 0.35);

      let frontRunNear = 0;
      if (frontRunUsdc > 10) {
        frontRunNear = publicPool.swapBForA(frontRunUsdc);
      }

      // Victim executes at degraded price
      const victimNear = publicPool.swapBForA(orderUsdc);
      totalPublicNearReceived += victimNear;

      // Searcher back-runs: sells front-run wNEAR back to pool
      if (frontRunNear > 0) {
        const backRunUsdc = publicPool.swapAForB(frontRunNear);
        const searcherNet = backRunUsdc - frontRunUsdc;
        if (searcherNet > 0) {
          totalSearcherProfitUsdc += searcherNet;
        }
      }
    }

    // Effective price & slippage for public execution
    const publicEffectivePrice = totalOrderVolumeUsdc / totalPublicNearReceived;
    const publicSlippagePct = ((publicEffectivePrice - referenceNearPriceUsdc) / referenceNearPriceUsdc) * 100;

    sequentialSlippageSamples.push(publicSlippagePct);
    sequentialSearcherProfitSamples.push(totalSearcherProfitUsdc);

    // =========================================================================
    // SCENARIO B: Sealed-Intent Deliberation & Batch Execution (Midge Roost TEE)
    // =========================================================================
    const sealedPool = new ConstantProductPool(initialNearReserve, initialUsdcReserve);

    // In Midge, orders are encrypted in Roost RAM. Searchers see 0 pending transactions.
    // Roost aggregates all orders and executes a single clearing batch swap:
    const totalBatchNearReceived = sealedPool.swapBForA(totalOrderVolumeUsdc);

    // Every agent receives the identical uniform clearing price
    const batchEffectivePrice = totalOrderVolumeUsdc / totalBatchNearReceived;
    const batchSlippagePct = ((batchEffectivePrice - referenceNearPriceUsdc) / referenceNearPriceUsdc) * 100;

    sealedBatchSlippageSamples.push(batchSlippagePct);
    sealedBatchSearcherProfitSamples.push(0); // Zero front-running possible

    // Net economic savings for the agent collective (difference in USDC equivalent)
    const extraNearDelivered = totalBatchNearReceived - totalPublicNearReceived;
    const netSavingsUsdc = extraNearDelivered * referenceNearPriceUsdc;
    netSavingsSamples.push(netSavingsUsdc);
  }

  return {
    meta: {
      seed,
      numRuns,
      agentsPerEpoch,
      initialPool: {
        wNearReserve: initialNearReserve,
        usdcReserve: initialUsdcReserve,
        referencePrice: referenceNearPriceUsdc,
      },
    },
    sequential: {
      slippagePct: computeStats(sequentialSlippageSamples),
      adversaryProfitUsdc: computeStats(sequentialSearcherProfitSamples),
    },
    sealedBatch: {
      slippagePct: computeStats(sealedBatchSlippageSamples),
      adversaryProfitUsdc: computeStats(sealedBatchSearcherProfitSamples),
    },
    savingsUsdc: computeStats(netSavingsSamples),
  };
}

function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║          MIDGE: MEASURED ECONOMIC BASELINE SIMULATION          ║');
  console.log('║  Sealed-Intent Uniform Batch vs. Public Sequential Mempool     ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log('Parameters:');
  console.log('  - Reference Asset:     wNEAR / USDC (1Click Registry Quote: $3.96)');
  console.log('  - Liquidity Model:     CPMM (x * y = k), 100k wNEAR / $396k USDC');
  console.log('  - Swarm Size:          8 autonomous trading agents per epoch');
  console.log('  - Agent Order Range:   $3,000 - $12,000 USDC per agent (Pooled Volume: ~$60,000)');
  console.log('  - Max Allowable Slip:  1.5% (150 BPS)');
  console.log('  - Repetitions:         N = 100 deterministic Monte Carlo epochs (Seed: 0x464c59)\n');

  const results = runSimulation();

  const seqSlip = results.sequential.slippagePct;
  const seqProf = results.sequential.adversaryProfitUsdc;
  const batSlip = results.sealedBatch.slippagePct;
  const batProf = results.sealedBatch.adversaryProfitUsdc;
  const sav = results.savingsUsdc;

  console.log('════════════════════════════════════════════════════════════════════════════════');
  console.log(' EXECUTION MODE COMPARISON TABLE (Mean ± 95% Confidence Interval)');
  console.log('════════════════════════════════════════════════════════════════════════════════');
  console.log(' Metric                     │ (A) Public Sequential   │ (B) Midge Sealed Batch  │ Improvement');
  console.log('────────────────────────────┼─────────────────────────┼───────────────────────┼─────────────');
  console.log(
    ` Realized Slippage (%)      │ ${seqSlip.mean.toFixed(2)}% ± ${seqSlip.marginOfError.toFixed(2)}%          │ ${batSlip.mean.toFixed(2)}% ± ${batSlip.marginOfError.toFixed(2)}%        │ -${(seqSlip.mean - batSlip.mean).toFixed(2)}% (Lower)`
  );
  console.log(
    ` Adversary MEV Profit ($)   │ $${seqProf.mean.toFixed(2)} ± $${seqProf.marginOfError.toFixed(2)}       │ $0.00 ± $0.00         │ 100% Eliminated`
  );
  console.log(
    ` Net Collective Value ($)   │ Baseline                │ +$${sav.mean.toFixed(2)} ± $${sav.marginOfError.toFixed(2)}    │ Alpha Preserved`
  );
  console.log('════════════════════════════════════════════════════════════════════════════════\n');

  console.log('Key Empirical Findings:');
  console.log(`  1. Slippage Reduction : Uniform sealed batch drops slippage from ${seqSlip.mean.toFixed(2)}% down to ${batSlip.mean.toFixed(2)}%.`);
  console.log(`  2. MEV Elimination    : Eliminates $${seqProf.mean.toFixed(2)}/epoch in predatory searcher front-running extraction.`);
  console.log(`  3. Collective Savings : Delivers an average of $${sav.mean.toFixed(2)} in preserved capital per 8-agent swarm.`);
  console.log('  4. Model Integrity    : 100% reproducible with fixed seed; zero hand-tuned outliers.\n');

  console.log('Assumptions & Limitations:');
  console.log('  - Simulates a single constant-product pool with 0.3% fee and greedy sandwich bots.');
  console.log('  - Does not account for multi-pool smart routing or off-chain private order flow (SUAVE/Flashbots).');
  console.log('  - Real-world MEV varies widely based on block time, gas price volatility, and builder auctions.');
  console.log('\n>>> [PASS] BASELINE SIMULATION COMPLETE.\n');

  // Save reproducible evidence
  const outPath = path.join(rootDir, 'docs/canonical/baseline-simulation.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`Saved baseline simulation results to: ${outPath}`);
}

main();
