/**
 * The numbers on the card strips. Each comes from site/data/proof.json (the recorded testnet transactions) or from a recorded
 * result, with the source file and the exact text that states it, so tests/site-cards.test.js can check the quote is really there.
 */
import fs from 'node:fs';
import path from 'node:path';

export function figures(proof, root) {
  const attempts = proof.security?.attempts || [];
  const refused = attempts.filter((a) => a.refusedBy).length;
  const snapshot = JSON.parse(fs.readFileSync(path.join(root, 'docs/lab/unfunded-prune-pre-deploy-snapshot.json'), 'utf8'));
  return {
    payouts: { value: String(proof.counts.settled), label: 'payouts within the rules', source: 'site/data/proof.json' },
    // Every failed transaction counts here: attacks (replays, a thief payment) and deliberate tests of a rule (payouts outside the policy,
    // over the cap, early exits, two rooms disagreeing). So the label says what they share: the contract refused them.
    refused: { value: String(proof.counts.rejected), label: 'refused by the rules', source: 'site/data/proof.json' },
    exits: { value: String(proof.counts.exit), label: 'members left with their share', source: 'site/data/proof.json' },
    attempts: { value: String(attempts.length), label: 'agent attempts recorded on testnet', source: 'site/data/proof.json' },
    attemptsRefused: { value: String(refused), label: 'refused', source: 'site/data/proof.json' },
    attemptsThrough: { value: String(attempts.length - refused), label: 'got through', source: 'site/data/proof.json' },
    groups: { value: String(snapshot.count), label: 'groups on the network', source: 'docs/lab/unfunded-prune-pre-deploy-snapshot.json', live: true },
    auctionPublicRead: { value: '3 of 5', label: 'bids an observer read in a public auction', source: 'docs/lab/COMPARISON_AUCTIONS.md', quote: '**3 of 5** (from their public bids)' },
    auctionSealedRead: { value: '0 of 5', label: 'with Midge sealed bids', source: 'docs/lab/COMPARISON_AUCTIONS.md', quote: '**0 of 5**' },
    organizerRead: { value: '4 of 4', label: 'amounts read through an organizer', source: 'docs/lab/COMPARISON_RESULTS.md', quote: '2 | Organizer: an observer recovers every bid sent to it | **Held** (4 of 4)' },
    payrollByAddress: { value: '0 of 4', label: 'payees linked across months by address', source: 'docs/lab/PAYROLL_RESULTS.md', quote: 'Payees an observer links across months **by address** | **4 of 4** | **0 of 4**' },
    investCommonDeposit: { value: '0 of 4', label: "backers' amounts recovered with equal deposits", source: 'docs/lab/COMPARISON_RESULTS.md', quote: '**Held** (0 of 4; every escrow is 0.05' },
    hardwareChecks: { value: '12 of 12', label: 'secure-hardware checks passed', source: 'docs/canonical/CURRENT_STATE.md', quote: 'on all 12 checks' },
    // ---- the bento sections (plan 2026-11-10-site-bento-direction): comparison runs and honest statuses, each tied to its sentence
    transactions: { value: String(proof.transactions.length), label: 'transactions recorded on testnet', source: 'site/data/proof.json' },
    organizerVanish: { value: '0%', label: 'members recover if the organizer disappears', source: 'docs/lab/COMPARISON_RESULTS.md', quote: 'members recover **0%**' },
    organizerBackers: { value: '0.01 to 0.04', label: 'four backers, 0.10 in all', source: 'docs/lab/COMPARISON_RESULTS.md', quote: 'Four backers invest 0.01, 0.02, 0.03 and 0.04 NEAR (0.10 in all)' },
    organizerTheft: { value: 'nothing stopped it', label: 'the organizer moved the pot where it chose', source: 'docs/lab/COMPARISON_RESULTS.md', quote: 'The organizer moved a 0.04 pot to an account of its choosing and nothing stopped it' },
    outsideRules: { value: 'none', label: 'payouts outside the rules', source: 'docs/lab/COMPARISON_RESULTS.md', quote: 'no operator can take the pot or pay outside the fixed policy' },
    modelHost: { value: 'Live', label: 'bids sealed to a NEAR AI Cloud model', source: 'docs/canonical/CURRENT_STATE.md', quote: 'LIVE DEMONSTRATED** | `npm run verify:roost-model`' },
    phalaHosted: { value: 'Attested, not running now', label: 'our room program on Phala', source: 'docs/canonical/CURRENT_STATE.md', quote: 'no hosted Roost is running now' },
    chainSignatures: { value: 'Rules checked, on testnet', label: 'contract-requested payments on Solana and Ethereum', source: 'docs/canonical/CURRENT_STATE.md', quote: "the Midge contract checked the group's foreign-payment rules and asked the signer for both payments" },
    intentsAssets: { value: '210', label: 'assets read live through 1Click', source: 'docs/canonical/CURRENT_STATE.md', quote: '210 assets audited live across NEAR, BTC, ETH, SOL' },
    outlayerModel: { value: 'Signing step only', label: 'a settlement signed inside OutLayer, accepted by the contract', source: 'docs/canonical/CURRENT_STATE.md', quote: 'a settlement signed by an OutLayer program was accepted by the production contract' },
    agentTools: { value: 'Live', label: 'SDK, API and MCP tools on testnet', source: 'docs/canonical/WHAT_IS_MIDGE.md', quote: 'Every route, SDK method and MCP tool exercised' },
    simulations: { value: 'Models only', label: 'lending, block trades, shared AI', source: 'docs/canonical/WHAT_IS_MIDGE.md', quote: 'Credit, block trades and compute are simulations in JavaScript' },
    stuckPayout: { value: '100 blocks', label: 'after which anyone can finish a stuck payout', source: 'docs/WHITEPAPER.md', quote: 'anyone can finish its books after 100 blocks' },
    twoHostsHardware: { value: 'not on hardware yet', label: 'two hosts signing one room', source: 'docs/WHITEPAPER.md', quote: 'a two-room settlement on hardware were not tested' },
    contractLive: { value: 'Live', label: 'the contract on NEAR testnet', source: 'docs/canonical/deployments.json', quote: 'c.fly-1793636729.testnet' },
  };
}
