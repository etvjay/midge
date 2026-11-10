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
  };
}
