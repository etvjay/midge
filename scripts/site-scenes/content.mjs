/**
 * The words on the site's B cards: one entry per section, one tab per mechanism. `scene` names a function in scenes.mjs, `strip`
 * names figures in figures.mjs. Every caveat that used to sit in a paragraph lives in the tab's `fine` text (the fine print).
 */
import { plainAttempt } from './scenes.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const proofPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../site/data/proof.json');
const attempts = (() => { try { return JSON.parse(fs.readFileSync(proofPath, 'utf8')).security.attempts; } catch { return []; } })();
const agentTab = (i, t) => {
  const a = attempts[i] || { label: '', refusedBy: 'key' };
  return { t, b: `The agent was told to ${plainAttempt(a.label).split(' (')[0]}.`, scene: 'agent', arg: i,
    fine: `Refused by ${a.refusedBy === 'key' ? 'the key itself, which can only do one thing' : 'the contract'}. The key limits what a fooled agent can do; it does not stop the agent from being fooled.` };
};

export const SECTIONS = [
  { id: 'problem', kicker: '01 · The problem', title: 'Deciding together with money', soft: 'on the line is hard',
    lede: 'A fund splitting a pot, a DAO picking a quote, a team of AI agents buying together. Today there are three ways to do it, and each one breaks something.',
    tabs: [
      { t: 'Do it in public', b: 'Everyone sees your bids before they land, and trades against you.', scene: 'public', fine: 'In our public auction on testnet, a watcher who bid at the last moment took the lot from the bidder who valued it most.' },
      { t: 'Trust an organizer', b: 'One person holds the money. If they vanish or get hacked, it is gone.', scene: 'organizer', fine: "In our test with an organizer, an observer could read every backer's amount, and nothing stops the organizer leaving with the pot." },
      { t: 'Trust a black box', b: 'Secure hardware keeps things private, but if it can pay out anything, one bug empties the pot.', scene: 'blackbox', fine: 'Secure hardware has had real attacks. Midge assumes it can fail, and limits what a failure can pay.' } ],
    strip: ['auctionPublicRead', 'auctionSealedRead', 'organizerRead'] },
  { id: 'how', alt: true, kicker: '02 · How it works', title: 'Every group gets a room,', soft: 'rules and an exit',
    lede: 'Three parts, each checking the one before it. Nobody holds the money, nobody sees the bids, and nobody can lock anyone in.',
    tabs: [
      { t: 'The room decides in private', b: 'Each member seals their bid so only the room can open it. The room adds them up and lets out just the result.', scene: 'room', fine: 'The room runs inside secure hardware: either an AI model on NEAR AI Cloud, or our own program on Phala. Anyone can check which code it runs.' },
      { t: 'The rules are public', b: 'When the group starts, its rules go into a contract on NEAR: who can be paid, how much, and until when. Any payment that breaks them is refused.', scene: 'rules', fine: "How much can leave is paced by time: at most the agreed share per window, and a window is twice the group's exit timer. With a short timer most of a group could still leave within minutes, so groups choose their timer on purpose; the contract refuses one under 10 blocks." },
      { t: 'Anyone can leave', b: "If the room stops or disappears, each member takes back what is left of their own money, with no one's permission.", scene: 'exit', fine: "The exit opens after the group's exit timer or its deadline. While a payout is in flight, exits wait; anyone can finish a stuck payout after about two minutes." } ],
    strip: ['payouts', 'refused', 'exits'] },
  { id: 'who', kicker: '03 · Who uses it', title: 'Any group,', soft: 'on one shared network',
    lede: 'People, DAOs, companies and AI agents join the same way, with a NEAR account. These four have run on testnet next to a public version.',
    tabs: [
      { t: 'Auctions and token sales', b: 'Bidders send sealed bids. The rules fix the winner and the price; losing bids are never published.', scene: 'auction', fine: 'Sealing hides the losing bids, not everything: the winner and the price are public, and every bidder locks the same deposit.' },
      { t: 'Voting', b: 'Members cast sealed ballots. Only the result is paid out, and it decides a payment.', scene: 'vote', fine: 'Run on testnet next to an open poll and a multisig. The payout is public; who voted which way is not.' },
      { t: 'Paying people', b: 'A team is paid from one pool to one-time addresses, and each person gets a private receipt.', scene: 'payroll', fine: 'The amounts are public on NEAR. With distinct, unchanged salaries an observer can still link a person across months by amount.' },
      { t: 'Investing together', b: 'Backers agree on a round and invest from one shared pool.', scene: 'invest', fine: "Midge hides each backer's amount only when everyone deposits the same; if each pays their own amount, it is public when the round settles." } ],
    strip: ['groups', 'payrollByAddress', 'investCommonDeposit'],
    under: 'Also built: lending quotes · big trades between desks · AI agents buying together · shared AI requests' },
  { id: 'agents', alt: true, kicker: '04 · AI agents', title: 'A hijacked AI agent', soft: "still can't take the money",
    lede: "An agent can be given a key that does one thing only: take its owner's money back out. We tricked such an agent into trying everything. Every attempt was refused.",
    tabs: [agentTab(0, 'Send money to the attacker'), agentTab(1, 'Call another contract'), agentTab(2, 'Approve a payout itself'), agentTab(4, 'Make the attacker an owner')],
    strip: ['attempts', 'attemptsRefused', 'attemptsThrough'] },
  { id: 'hood', kicker: '05 · Under the hood', title: 'Private work in secure hardware.', soft: 'Final say on NEAR',
    lede: 'Three systems work together, and each one checks the one before it. A bad answer gets stopped at the next step.',
    tabs: [
      { t: 'NEAR AI Cloud', b: "An AI model helps the group decide, for example how to split the money. It only sees the total, never anyone's bid.", scene: 'layers', arg: 0, fine: 'Your browser can ask NEAR AI Cloud to prove what it runs, with a random number it picks, and check the answer.' },
      { t: 'Our program on Phala', b: 'Opens the sealed bids, adds them up exactly, and signs the result only if it fits the rules.', scene: 'layers', arg: 1, fine: 'Its code and settings are fixed and checkable; the version that ran was checked on real secure hardware.' },
      { t: 'The contract on NEAR', b: 'Pays out only within the rules, and runs the exit.', scene: 'layers', arg: 2, fine: 'Its exact version can be read straight from NEAR by your browser.' } ],
    strip: ['hardwareChecks', 'refused'] },
];
