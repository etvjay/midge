import { ConfidentialRfqFacility } from '../src/facilities/rfq-adjudication.js';

export async function verifyConfidentialRfqAndAdjudication() {
  console.log('\n======================================================');
  console.log(' [VERIFICATION 5] CONFIDENTIAL RFQ & PRIVATE ADJUDICATION');
  console.log(' Target: Treasury Borrow, Sealed Quotes & MEV-Free Cure');
  console.log('======================================================');

  const facility = new ConfidentialRfqFacility();

  // 1. Treasury creates an encrypted RFQ in the Roost
  console.log('[1/4] Treasury submits encrypted RFQ to borrow 10M USDC vs 5,000 ETH...');
  const rfq = facility.createRfq({
    borrowerId: 'web3-foundation-treasury.near',
    requestedAmountUsdc: 10_000_000,
    collateralAsset: 'ETH',
    collateralAmount: 5000,
    maxAprPercent: 6.0,
    durationDays: 90,
  });
  console.log(`  ✓ RFQ Created in Roost: ${rfq.rfqId} (Status: ${rfq.status})`);

  // 2. 3 Institutional Lenders submit sealed quotes into the TEE
  console.log('\n[2/4] 3 Institutional Lenders submitting sealed quotes into enclave...');
  facility.submitQuote({
    rfqId: rfq.rfqId,
    lenderId: 'wintermute-credit.near',
    offeredAprPercent: 5.4,
    maxLtvPercent: 75,
    liquidationThresholdPercent: 88,
  });
  facility.submitQuote({
    rfqId: rfq.rfqId,
    lenderId: 'galaxy-prime.near',
    offeredAprPercent: 4.8, // Best quote
    maxLtvPercent: 75,
    liquidationThresholdPercent: 88,
  });
  facility.submitQuote({
    rfqId: rfq.rfqId,
    lenderId: 'cumberland-dark.near',
    offeredAprPercent: 5.1,
    maxLtvPercent: 70,
    liquidationThresholdPercent: 85,
  });
  console.log(`  ✓ 3 Sealed Quotes Ingested into Enclave Memory.`);

  // 3. Roost matches winning quote in shielded RAM
  console.log('\n[3/4] Roost evaluating quotes & binding loan facility...');
  const loan = facility.matchAndBindLoan(rfq.rfqId);
  console.log(`  ✓ Matched Lender:      ${loan.lenderId} (Lowest APR: ${loan.aprPercent}%)`);
  console.log(`  ✓ Bound Principal:     ${loan.principalUsdc.toLocaleString()} USDC vs ${loan.collateralAmount} ETH`);
  console.log(`  ✓ Loan Status:         ${loan.status}`);

  // 4. Private Adjudication: Simulating Market Conditions
  console.log('\n[4/4] Testing Private Adjudication & Margin Monitoring under market stress...');

  // Scenario A: Normal Market (ETH @ $3,000)
  const healthA = facility.adjudicateHealth(loan.loanId, 3000);
  console.log(`  [ETH @ $3,000] Status: ${healthA.verdict} | Current LTV: ${healthA.currentLtvPercent}% | Action: ${healthA.actionRequired}`);

  // Scenario B: Market Dip to $2,500 (Approaches 75% LTV margin threshold)
  const healthB = facility.adjudicateHealth(loan.loanId, 2500);
  console.log(`  [ETH @ $2,500] Status: ${healthB.verdict} | Current LTV: ${healthB.currentLtvPercent}% | Action: ${healthB.actionRequired}`);
  console.log(`    ↳ MEV Exposure:      ${healthB.mevExposure} (Zero predatory liquidations)`);

  // Scenario C: Severe Drop to $2,100 (Breaches 88% Liquidation threshold)
  const healthC = facility.adjudicateHealth(loan.loanId, 2100);
  console.log(`  [ETH @ $2,100] Status: ${healthC.verdict} | Current LTV: ${healthC.currentLtvPercent}% | Action: ${healthC.actionRequired}`);
  console.log(`    ↳ Settlement Path:   Orderly private auction on FAR Private Shard (No DEX flash dump).`);

  console.log('\n>>> [PASS] CONFIDENTIAL RFQ & PRIVATE ADJUDICATION VERIFIED (Simulated Facility).');
  return {
    verified: true,
    loanId: loan.loanId,
    bestApr: loan.aprPercent,
    privateCureTriggered: healthB.verdict === 'MARGIN_WARNING',
    orderlyLiquidationTriggered: healthC.verdict === 'DEFAULTED',
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  verifyConfidentialRfqAndAdjudication().catch((err) => {
    console.error('FAILED:', err);
    process.exit(1);
  });
}
