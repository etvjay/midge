/**
 * Ballot counting: pure. One ballot per roll member (a later ballot from the same member replaces an earlier one), a quorum,
 * and a majority, plurality or supermajority rule, counted by head or, when `weights` is given, by weight (a whole number per roll member, default 1). The result carries the winner and the reason a ballot was not decided, never a tally.
 *
 * A ballot is { flyerId, choice, order }; choice is an option id or 'abstain'. Ballots from outside the roll are ignored and
 * reported by account; ballots for an unknown option are spoiled and do not count toward the quorum; abstaining counts toward
 * the quorum but not toward the majority.
 */
export function clearBallot({ options, roll, ballots, quorumBps, rule = 'majority', weights = null, thresholdBps = null }) {
  if (rule !== 'majority' && rule !== 'plurality' && rule !== 'supermajority') throw new Error("rule must be 'majority', 'plurality' or 'supermajority'");
  if (!Number.isSafeInteger(quorumBps) || quorumBps < 0 || quorumBps > 10000) throw new Error('quorumBps must be 0 to 10000');
  if (rule === 'supermajority') {
    if (!Number.isSafeInteger(thresholdBps) || thresholdBps < 5001 || thresholdBps > 10000) throw new Error('a supermajority needs a threshold of 5001 to 10000 basis points');
  } else if (thresholdBps !== null && thresholdBps !== undefined) throw new Error('a threshold only applies to the supermajority rule');
  const rollSet = new Set(roll);
  if (weights !== null && weights !== undefined) {
    if (typeof weights !== 'object' || Array.isArray(weights)) throw new Error('weights must map roll members to whole numbers');
    for (const [id, w] of Object.entries(weights)) {
      if (!rollSet.has(id)) throw new Error(`a weight was given for ${id}, who is not on the roll`);
      if (!Number.isSafeInteger(w) || w < 1 || w > 1_000_000) throw new Error('each weight must be a whole number from 1 to 1,000,000');
    }
  }
  const weightOf = (id) => (weights && weights[id] !== undefined ? weights[id] : 1);
  const valid = new Set([...options, 'abstain']);
  const outsiders = []; let duplicates = 0; let spoiled = 0;
  const latest = new Map();
  ballots.forEach((b, i) => {
    if (!rollSet.has(b.flyerId)) { if (!outsiders.includes(b.flyerId)) outsiders.push(b.flyerId); return; }
    const prev = latest.get(b.flyerId);
    if (prev) { duplicates += 1; if (b.order < prev.order) return; }
    latest.set(b.flyerId, { ...b, index: i });
  });
  const counted = [];
  for (const b of latest.values()) { if (valid.has(b.choice)) counted.push(b); else spoiled += 1; }
  const base = { spoiled, outsiders, duplicates };
  // Quorum and every share below are measured in weight; with no weights every member weighs 1, which is the earlier head count.
  const castWeight = counted.reduce((a, b) => a + weightOf(b.flyerId), 0);
  const rollWeight = roll.reduce((a, id) => a + weightOf(id), 0);
  const quorumMet = castWeight * 10000 >= quorumBps * rollWeight;
  if (!quorumMet) return { ...base, decided: false, winner: null, reason: 'no-quorum', quorumMet };
  const counts = Object.fromEntries(options.map((o) => [o, 0]));
  for (const b of counted) if (b.choice !== 'abstain') counts[b.choice] += weightOf(b.flyerId);
  const nonAbstain = counted.filter((b) => b.choice !== 'abstain').reduce((a, b) => a + weightOf(b.flyerId), 0);
  const top = Math.max(0, ...Object.values(counts)); const leaders = options.filter((o) => counts[o] === top);
  if (nonAbstain === 0) return { ...base, decided: false, winner: null, reason: 'no-majority', quorumMet };
  if (leaders.length !== 1) return { ...base, decided: false, winner: null, reason: 'tie', quorumMet };
  if (rule === 'majority' && !(top * 2 > nonAbstain)) return { ...base, decided: false, winner: null, reason: 'no-majority', quorumMet };
  if (rule === 'supermajority' && top * 10000 < thresholdBps * nonAbstain) return { ...base, decided: false, winner: null, reason: 'no-majority', quorumMet };
  return { ...base, decided: true, winner: leaders[0], reason: null, quorumMet };
}
